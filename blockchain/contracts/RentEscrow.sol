// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/*
 * Vista minima de RentContract que necesita el escrow.
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
 * RentEscrow v3
 *
 * Guarda el deposito en garantia del alquiler (token ERC20).
 *
 * Reglas:
 * - el escrow se vincula una sola vez a su RentContract
 * - el tenant solo puede depositar si el acuerdo esta Active
 * - flujo normal: el landlord devuelve el deposito al tenant
 * - si el tenant lo autoriza, el landlord puede cobrar el deposito
 * - si el landlord no actua, el tenant recupera el deposito despues de
 *   endDate + CLAIM_WINDOW
 * - en disputa, el arbiter decide (todo a una parte o reparto)
 * - si el arbiter no resuelve en DISPUTE_TIMEOUT, el tenant recupera el deposito
 *
 * Todas las funciones que mueven dinero actualizan el estado antes de transferir
 * (checks-effects-interactions), usan SafeERC20 y ademas son nonReentrant
 * como defensa en profundidad.
 */
contract RentEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Estado del acuerdo en RentContract que habilita el deposito.
    uint8 private constant AGREEMENT_ACTIVE = 1;

    // Plazo que tiene el landlord, despues del fin del alquiler, para devolver
    // el deposito o abrir una disputa.
    uint256 public constant CLAIM_WINDOW = 7 days;

    // Plazo maximo que tiene el arbiter para resolver una disputa.
    uint256 public constant DISPUTE_TIMEOUT = 30 days;

    // Token ERC20 usado para el deposito.
    IERC20 public immutable depositToken;

    // Participantes del acuerdo.
    address public immutable landlord;
    address public immutable tenant;
    address public immutable arbiter;

    // Monto del deposito.
    uint256 public immutable depositAmount;

    // Cuenta que desplegó el escrow y puede vincularlo al acuerdo (una vez).
    address public immutable deployer;

    // Acuerdo legal asociado.
    IRentContract public agreement;

    // Estados principales del contrato.
    bool public isDeposited;
    bool public isReleased;
    bool public isDisputed;
    bool public tenantApprovedRelease;
    uint256 public disputeOpenedAt;

    event AgreementLinked(address indexed agreement);
    event Deposited(address indexed tenant, uint256 amount);
    event ReturnedToTenant(address indexed by, uint256 amount);
    event ReleaseApprovedByTenant(address indexed tenant);
    event Released(address indexed landlord, uint256 amount);
    event DisputeOpened(address indexed openedBy);
    event ResolvedToLandlord(address indexed arbiter, uint256 amount);
    event ResolvedToTenant(address indexed arbiter, uint256 amount);
    event ResolvedSplit(address indexed arbiter, uint256 toLandlord, uint256 toTenant);
    event DisputeTimedOut(address indexed tenant, uint256 amount);

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

    // Hay deposito, no hay disputa y los fondos siguen en el contrato.
    modifier whenFundedWithoutDispute() {
        require(isDeposited, "Deposit not made yet");
        require(!isReleased, "Escrow already released");
        require(!isDisputed, "Escrow is under dispute");
        _;
    }

    // Hay una disputa abierta y los fondos siguen en el contrato.
    modifier whenDisputed() {
        require(isDisputed, "No active dispute");
        require(!isReleased, "Escrow already released");
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
        deployer = msg.sender;
    }

    /*
     * Vincula el escrow con su RentContract. Solo una vez y solo si el acuerdo
     * apunta a este escrow y tiene exactamente los mismos participantes.
     */
    function linkAgreement(address _agreement) external {
        require(msg.sender == deployer, "Only deployer can link");
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
     * El inquilino deposita exactamente el monto acordado.
     * Solo es posible con el acuerdo vinculado y activo.
     */
    function deposit() external onlyTenant nonReentrant {
        require(address(agreement) != address(0), "Agreement not linked");
        require(agreement.status() == AGREEMENT_ACTIVE, "Agreement is not active");
        require(!isDeposited, "Deposit already made");

        isDeposited = true;

        // Se verifica que llegue el monto exacto: un token con comision
        // dejaria al escrow con menos fondos de los que promete devolver.
        uint256 balanceBefore = depositToken.balanceOf(address(this));
        depositToken.safeTransferFrom(msg.sender, address(this), depositAmount);
        require(
            depositToken.balanceOf(address(this)) - balanceBefore == depositAmount,
            "Fee-on-transfer tokens not supported"
        );

        emit Deposited(msg.sender, depositAmount);
    }

    /*
     * Flujo normal: el landlord devuelve el deposito al inquilino.
     */
    function returnToTenant() external onlyLandlord whenFundedWithoutDispute nonReentrant {
        isReleased = true;

        depositToken.safeTransfer(tenant, depositAmount);

        emit ReturnedToTenant(msg.sender, depositAmount);
    }

    /*
     * El inquilino autoriza que el landlord cobre el deposito
     * (por ejemplo, para cubrir un mes adeudado o un arreglo acordado).
     */
    function approveReleaseToLandlord() external onlyTenant whenFundedWithoutDispute {
        require(!tenantApprovedRelease, "Release already approved");

        tenantApprovedRelease = true;

        emit ReleaseApprovedByTenant(msg.sender);
    }

    /*
     * El landlord cobra el deposito, solo con autorizacion del inquilino.
     * Sin autorizacion, el camino es abrir una disputa.
     */
    function releaseToLandlord() external onlyLandlord whenFundedWithoutDispute nonReentrant {
        require(tenantApprovedRelease, "Tenant has not approved the release");

        isReleased = true;

        depositToken.safeTransfer(landlord, depositAmount);

        emit Released(landlord, depositAmount);
    }

    /*
     * Si el landlord no devolvio el deposito ni abrio disputa dentro de
     * CLAIM_WINDOW despues del fin del alquiler, el inquilino lo recupera.
     */
    function claimAfterEnd() external onlyTenant whenFundedWithoutDispute nonReentrant {
        require(block.timestamp >= claimableAt(), "Claim window still open");

        isReleased = true;

        depositToken.safeTransfer(tenant, depositAmount);

        emit ReturnedToTenant(msg.sender, depositAmount);
    }

    /*
     * Landlord o tenant pueden abrir disputa mientras haya fondos.
     * El landlord solo puede hacerlo antes de que venza su ventana de reclamo.
     */
    function openDispute() external onlyParticipant whenFundedWithoutDispute {
        if (msg.sender == landlord) {
            require(block.timestamp < claimableAt(), "Claim window closed");
        }

        isDisputed = true;
        disputeOpenedAt = block.timestamp;

        emit DisputeOpened(msg.sender);
    }

    /*
     * El arbitro decide a favor del propietario.
     */
    function resolveToLandlord() external onlyArbiter whenDisputed nonReentrant {
        _close();

        depositToken.safeTransfer(landlord, depositAmount);

        emit ResolvedToLandlord(msg.sender, depositAmount);
    }

    /*
     * El arbitro decide a favor del inquilino.
     */
    function resolveToTenant() external onlyArbiter whenDisputed nonReentrant {
        _close();

        depositToken.safeTransfer(tenant, depositAmount);

        emit ResolvedToTenant(msg.sender, depositAmount);
    }

    /*
     * El arbitro reparte el deposito (por ejemplo, daños parciales).
     */
    function resolveSplit(uint256 toLandlord) external onlyArbiter whenDisputed nonReentrant {
        require(toLandlord <= depositAmount, "Amount exceeds deposit");

        uint256 toTenant = depositAmount - toLandlord;
        _close();

        if (toLandlord > 0) depositToken.safeTransfer(landlord, toLandlord);
        if (toTenant > 0) depositToken.safeTransfer(tenant, toTenant);

        emit ResolvedSplit(msg.sender, toLandlord, toTenant);
    }

    /*
     * Si el arbitro no resolvio en DISPUTE_TIMEOUT, el inquilino recupera
     * el deposito: los fondos nunca quedan bloqueados para siempre.
     */
    function claimAfterDisputeTimeout() external onlyTenant whenDisputed nonReentrant {
        require(
            block.timestamp >= disputeOpenedAt + DISPUTE_TIMEOUT,
            "Dispute timeout not reached"
        );

        _close();

        depositToken.safeTransfer(tenant, depositAmount);

        emit DisputeTimedOut(msg.sender, depositAmount);
    }

    /*
     * Momento a partir del cual el inquilino puede reclamar sin disputa.
     */
    function claimableAt() public view returns (uint256) {
        require(address(agreement) != address(0), "Agreement not linked");
        return agreement.endDate() + CLAIM_WINDOW;
    }

    /*
     * Balance actual del contrato para debugging y tests.
     */
    function contractBalance() external view returns (uint256) {
        return depositToken.balanceOf(address(this));
    }

    function _close() private {
        isReleased = true;
        isDisputed = false;
    }
}
