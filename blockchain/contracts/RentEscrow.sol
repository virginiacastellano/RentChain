// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/*
 * Lo minimo que el escrow necesita leer del acuerdo (RentContract).
 */
interface IRentContract {
    function landlord() external view returns (address);
    function tenant() external view returns (address);
    function arbiter() external view returns (address);
    function escrowAddress() external view returns (address);
    function endDate() external view returns (uint256);
    function status() external view returns (uint8);
}

/*
 * RentEscrow v3 - Deposito de garantia
 *
 * Funciona como la garantia de un alquiler tradicional:
 * - el tenant deposita la garantia cuando el acuerdo esta activo
 * - al terminar el alquiler, la garantia vuelve al tenant
 * - si hubo danos o deudas, landlord o tenant abren una disputa
 *   dentro de un plazo y el arbiter decide como se reparte
 * - si el arbiter no responde a tiempo, la garantia vuelve al tenant,
 *   asi los fondos nunca quedan bloqueados para siempre
 */
contract RentEscrow {
    using SafeERC20 for IERC20;

    enum EscrowState {
        AwaitingDeposit,
        Deposited,
        Disputed,
        Closed
    }

    // Valor de AgreementStatus.Active en RentContract.
    uint8 private constant AGREEMENT_ACTIVE = 1;

    // Plazo despues del fin del alquiler para abrir una disputa.
    uint256 public constant CLAIM_WINDOW = 7 days;

    // Plazo que tiene el arbiter para resolver una disputa.
    uint256 public constant ARBITER_TIMEOUT = 30 days;

    IERC20 public immutable depositToken;
    address public immutable landlord;
    address public immutable tenant;
    address public immutable arbiter;
    uint256 public immutable depositAmount;

    // Acuerdo al que pertenece este escrow. Se vincula una sola vez.
    IRentContract public agreement;

    EscrowState public state;
    uint256 public disputeOpenedAt;

    event AgreementLinked(address indexed agreement);
    event Deposited(address indexed tenant, uint256 amount);
    event DepositReturned(address indexed tenant, uint256 amount);
    event DisputeOpened(address indexed openedBy);
    event DisputeResolved(address indexed arbiter, uint256 toLandlord, uint256 toTenant);
    event ArbiterTimedOut(uint256 returnedToTenant);

    modifier onlyTenant() {
        require(msg.sender == tenant, "Only tenant can call this");
        _;
    }

    modifier onlyLandlord() {
        require(msg.sender == landlord, "Only landlord can call this");
        _;
    }

    modifier onlyArbiter() {
        require(msg.sender == arbiter, "Only arbiter can call this");
        _;
    }

    modifier onlyParticipant() {
        require(
            msg.sender == landlord || msg.sender == tenant,
            "Only participant can call this"
        );
        _;
    }

    modifier inState(EscrowState expected) {
        require(state == expected, "Invalid escrow state");
        _;
    }

    constructor(
        address _depositToken,
        address _landlord,
        address _tenant,
        address _arbiter,
        uint256 _depositAmount
    ) {
        require(_depositToken != address(0), "Invalid token address");
        require(_landlord != address(0), "Invalid landlord address");
        require(_tenant != address(0), "Invalid tenant address");
        require(_arbiter != address(0), "Invalid arbiter address");
        require(_depositAmount > 0, "Deposit amount must be greater than zero");
        require(_landlord != _tenant, "Landlord and tenant must differ");
        require(_arbiter != _landlord, "Arbiter must differ from landlord");
        require(_arbiter != _tenant, "Arbiter must differ from tenant");

        depositToken = IERC20(_depositToken);
        landlord = _landlord;
        tenant = _tenant;
        arbiter = _arbiter;
        depositAmount = _depositAmount;
        state = EscrowState.AwaitingDeposit;
    }

    /*
     * El landlord vincula el escrow con su acuerdo, una sola vez.
     * Se verifica que ambos contratos hablen de las mismas personas
     * y que el acuerdo apunte a este escrow.
     */
    function linkAgreement(address _agreement) external onlyLandlord {
        require(address(agreement) == address(0), "Agreement already linked");
        require(_agreement != address(0), "Invalid agreement address");

        IRentContract candidate = IRentContract(_agreement);
        require(candidate.escrowAddress() == address(this), "Agreement points to another escrow");
        require(candidate.landlord() == landlord, "Landlord mismatch");
        require(candidate.tenant() == tenant, "Tenant mismatch");
        require(candidate.arbiter() == arbiter, "Arbiter mismatch");

        agreement = candidate;

        emit AgreementLinked(_agreement);
    }

    /*
     * El tenant deposita la garantia. Solo con el acuerdo activo
     * y antes de que termine el alquiler.
     */
    function deposit() external onlyTenant inState(EscrowState.AwaitingDeposit) {
        require(address(agreement) != address(0), "Agreement not linked");
        require(agreement.status() == AGREEMENT_ACTIVE, "Agreement is not active");
        require(block.timestamp < agreement.endDate(), "Rental already ended");

        state = EscrowState.Deposited;

        // Verificamos que llegue el monto exacto (tokens con comision romperian la contabilidad).
        uint256 balanceBefore = depositToken.balanceOf(address(this));
        depositToken.safeTransferFrom(msg.sender, address(this), depositAmount);
        require(
            depositToken.balanceOf(address(this)) - balanceBefore == depositAmount,
            "Unexpected amount received"
        );

        emit Deposited(msg.sender, depositAmount);
    }

    /*
     * Landlord o tenant abren una disputa: durante el alquiler
     * o hasta CLAIM_WINDOW despues de que termine.
     */
    function openDispute() external onlyParticipant inState(EscrowState.Deposited) {
        require(block.timestamp <= claimDeadline(), "Claim window is over");

        state = EscrowState.Disputed;
        disputeOpenedAt = block.timestamp;

        emit DisputeOpened(msg.sender);
    }

    /*
     * Devolucion normal de la garantia al tenant.
     * - El landlord puede devolverla en cualquier momento (renuncia a reclamar).
     * - Cualquiera puede ejecutarla cuando vencio el plazo de reclamo sin disputa.
     */
    function returnDeposit() external inState(EscrowState.Deposited) {
        require(
            msg.sender == landlord || block.timestamp > claimDeadline(),
            "Claim window still open"
        );

        state = EscrowState.Closed;
        depositToken.safeTransfer(tenant, depositAmount);

        emit DepositReturned(tenant, depositAmount);
    }

    /*
     * El arbiter decide como se reparte la garantia.
     * Ej: 300 para el landlord por danos y 700 de vuelta al tenant.
     */
    function resolveDispute(uint256 amountToLandlord)
        public
        onlyArbiter
        inState(EscrowState.Disputed)
    {
        require(amountToLandlord <= depositAmount, "Amount exceeds deposit");

        uint256 amountToTenant = depositAmount - amountToLandlord;
        state = EscrowState.Closed;

        if (amountToLandlord > 0) {
            depositToken.safeTransfer(landlord, amountToLandlord);
        }
        if (amountToTenant > 0) {
            depositToken.safeTransfer(tenant, amountToTenant);
        }

        emit DisputeResolved(msg.sender, amountToLandlord, amountToTenant);
    }

    // Atajos para los dos casos extremos.
    function resolveToLandlord() external {
        resolveDispute(depositAmount);
    }

    function resolveToTenant() external {
        resolveDispute(0);
    }

    /*
     * Si el arbiter no resuelve en ARBITER_TIMEOUT, cualquiera puede
     * devolver la garantia al tenant. Los fondos nunca quedan trabados.
     */
    function claimAfterArbiterTimeout() external inState(EscrowState.Disputed) {
        require(
            block.timestamp > disputeOpenedAt + ARBITER_TIMEOUT,
            "Arbiter still has time"
        );

        state = EscrowState.Closed;
        depositToken.safeTransfer(tenant, depositAmount);

        emit ArbiterTimedOut(depositAmount);
    }

    // Ultimo momento para abrir una disputa.
    function claimDeadline() public view returns (uint256) {
        require(address(agreement) != address(0), "Agreement not linked");
        return agreement.endDate() + CLAIM_WINDOW;
    }

    // Balance actual del contrato para debugging y tests.
    function contractBalance() external view returns (uint256) {
        return depositToken.balanceOf(address(this));
    }
}
