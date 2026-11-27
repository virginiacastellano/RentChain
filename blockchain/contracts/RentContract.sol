// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*
 * RentContract
 *
 * Este contrato representa el acuerdo legal/comercial del alquiler.
 *
 * A diferencia de RentEscrow:
 * - aca no se mueve dinero
 * - aca se guardan participantes, documento, fechas y estado del acuerdo
 *
 * Vision del producto:
 * - el landlord inicia el acuerdo
 * - define tenant y arbiter
 * - referencia el documento firmado (hash IPFS)
 * - referencia el escrow que guardara el deposito
 */
contract RentContract {
    enum AgreementStatus {
        Draft,
        Active,
        Cancelled
    }

    // El landlord inicia el contrato al desplegarlo.
    address public immutable landlord;

    // Los otros actores quedan definidos explicitamente desde el inicio.
    address public immutable tenant;
    address public immutable arbiter;

    // Referencia al contrato que guarda el dinero.
    address public immutable escrowAddress;

    // Hash/CID del documento subido a IPFS.
    string public ipfsDocumentHash;

    // Fechas principales del acuerdo.
    uint256 public immutable startDate;
    uint256 public immutable endDate;
    uint256 public immutable createdAt;

    // Estado del proceso de aceptacion.
    bool public tenantAccepted;
    bool public arbiterAccepted;

    AgreementStatus public status;

    event TenantAccepted(address indexed tenant);
    event ArbiterAccepted(address indexed arbiter);
    event AgreementActivated(address indexed landlord);
    event AgreementCancelled(address indexed landlord);
    event DocumentHashUpdated(string newHash);

    modifier onlyLandlord() {
        require(msg.sender == landlord, "Only landlord can call this");
        _;
    }

    modifier onlyTenant() {
        require(msg.sender == tenant, "Only tenant can call this");
        _;
    }

    modifier onlyArbiter() {
        require(msg.sender == arbiter, "Only arbiter can call this");
        _;
    }

    modifier onlyWhileDraft() {
        require(status == AgreementStatus.Draft, "Agreement is not in draft state");
        _;
    }

    constructor(
        address _tenant,
        address _arbiter,
        address _escrowAddress,
        string memory _ipfsDocumentHash,
        uint256 _startDate,
        uint256 _endDate
    ) {
        require(_tenant != address(0), "Invalid tenant address");
        require(_arbiter != address(0), "Invalid arbiter address");
        require(_escrowAddress != address(0), "Invalid escrow address");
        require(bytes(_ipfsDocumentHash).length > 0, "Document hash is required");
        require(_startDate > 0, "Start date is required");
        require(_endDate > _startDate, "End date must be greater than start date");
        require(msg.sender != _tenant, "Landlord and tenant must differ");
        require(msg.sender != _arbiter, "Landlord and arbiter must differ");
        require(_tenant != _arbiter, "Tenant and arbiter must differ");

        landlord = msg.sender;
        tenant = _tenant;
        arbiter = _arbiter;
        escrowAddress = _escrowAddress;
        ipfsDocumentHash = _ipfsDocumentHash;
        startDate = _startDate;
        endDate = _endDate;
        createdAt = block.timestamp;
        status = AgreementStatus.Draft;
    }

    /*
     * El tenant confirma que acepta participar del acuerdo.
     * Esto modela la invitacion/aceptacion que luego la app puede mostrar.
     */
    function acceptAsTenant() external onlyTenant onlyWhileDraft {
        require(!tenantAccepted, "Tenant already accepted");

        tenantAccepted = true;

        emit TenantAccepted(msg.sender);
    }

    /*
     * El arbiter confirma que acepta actuar como tercero confiable.
     */
    function acceptAsArbiter() external onlyArbiter onlyWhileDraft {
        require(!arbiterAccepted, "Arbiter already accepted");

        arbiterAccepted = true;

        emit ArbiterAccepted(msg.sender);
    }

    /*
     * El landlord activa formalmente el acuerdo cuando tenant y arbiter ya aceptaron.
     */
    function activateAgreement() external onlyLandlord onlyWhileDraft {
        require(tenantAccepted, "Tenant has not accepted yet");
        require(arbiterAccepted, "Arbiter has not accepted yet");

        status = AgreementStatus.Active;

        emit AgreementActivated(msg.sender);
    }

    /*
     * Mientras el acuerdo sigue en borrador, el landlord puede cancelarlo.
     */
    function cancelAgreement() external onlyLandlord onlyWhileDraft {
        status = AgreementStatus.Cancelled;

        emit AgreementCancelled(msg.sender);
    }

    /*
     * Permite actualizar el hash del documento mientras el acuerdo no este activo.
     * Es util si el landlord corrige el PDF antes de la aceptacion final.
     */
    function updateDocumentHash(string memory _newIpfsDocumentHash)
        external
        onlyLandlord
        onlyWhileDraft
    {
        require(bytes(_newIpfsDocumentHash).length > 0, "Document hash is required");

        ipfsDocumentHash = _newIpfsDocumentHash;

        emit DocumentHashUpdated(_newIpfsDocumentHash);
    }
}
