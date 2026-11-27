// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/*
 * RentEscrow v2
 *
 * Esta version agrega una disputa basica:
 * - landlord o tenant pueden abrir disputa
 * - mientras hay disputa, el flujo normal se congela
 * - un arbitro simple decide a quien se liberan los fondos
 */
contract RentEscrow {
    using SafeERC20 for IERC20;

    // Token ERC20 usado para el deposito.
    IERC20 public immutable depositToken;

    // Participantes del acuerdo.
    address public immutable landlord;
    address public immutable tenant;

    // Arbitro simple para esta primera version.
    address public immutable arbiter;

    // Monto del deposito.
    uint256 public immutable depositAmount;

    // Estados principales del contrato.
    bool public isDeposited;
    bool public isReleased;
    bool public isDisputed;

    event Deposited(address indexed tenant, uint256 amount);
    event Released(address indexed landlord, uint256 amount);
    event DisputeOpened(address indexed openedBy);
    event ResolvedToLandlord(address indexed arbiter, uint256 amount);
    event ResolvedToTenant(address indexed arbiter, uint256 amount);

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
    }

    /*
     * El inquilino deposita exactamente el monto acordado.
     */
    function deposit() external onlyTenant {
        require(!isDeposited, "Deposit already made");
        require(!isReleased, "Escrow already released");

        isDeposited = true;

        depositToken.safeTransferFrom(msg.sender, address(this), depositAmount);

        emit Deposited(msg.sender, depositAmount);
    }

    /*
     * Flujo normal: el propietario libera el deposito.
     *
     * Si hay disputa, esta funcion ya no puede usarse.
     */
    function releaseToLandlord() external onlyLandlord {
        require(isDeposited, "Deposit not made yet");
        require(!isReleased, "Escrow already released");
        require(!isDisputed, "Escrow is under dispute");

        isReleased = true;

        depositToken.safeTransfer(landlord, depositAmount);

        emit Released(landlord, depositAmount);
    }

    /*
     * Landlord o tenant pueden abrir disputa solo si ya existe deposito
     * y el escrow aun no fue resuelto.
     */
    function openDispute() external onlyParticipant {
        require(isDeposited, "Deposit not made yet");
        require(!isReleased, "Escrow already released");
        require(!isDisputed, "Dispute already opened");

        isDisputed = true;

        emit DisputeOpened(msg.sender);
    }

    /*
     * El arbitro decide a favor del propietario.
     */
    function resolveToLandlord() external onlyArbiter {
        require(isDeposited, "Deposit not made yet");
        require(isDisputed, "No active dispute");
        require(!isReleased, "Escrow already released");

        isReleased = true;
        isDisputed = false;

        depositToken.safeTransfer(landlord, depositAmount);

        emit ResolvedToLandlord(msg.sender, depositAmount);
    }

    /*
     * El arbitro decide a favor del inquilino.
     */
    function resolveToTenant() external onlyArbiter {
        require(isDeposited, "Deposit not made yet");
        require(isDisputed, "No active dispute");
        require(!isReleased, "Escrow already released");

        isReleased = true;
        isDisputed = false;

        depositToken.safeTransfer(tenant, depositAmount);

        emit ResolvedToTenant(msg.sender, depositAmount);
    }

    /*
     * Balance actual del contrato para debugging y tests.
     */
    function contractBalance() external view returns (uint256) {
        return depositToken.balanceOf(address(this));
    }
}
