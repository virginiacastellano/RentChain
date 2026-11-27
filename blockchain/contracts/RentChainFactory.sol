// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./RentContract.sol";
import "./RentEscrow.sol";

/*
 * RentChainFactory
 *
 * Crea en una sola transaccion el par RentEscrow + RentContract,
 * los vincula entre si y deja un indice por participante para que
 * la app pueda listar "mis acuerdos" sin depender del backend.
 *
 * Quien llama a createAgreement queda como landlord.
 */
contract RentChainFactory {
    struct AgreementRecord {
        address agreement;
        address escrow;
        address landlord;
        address tenant;
        address arbiter;
        uint256 createdAt;
    }

    AgreementRecord[] private _records;

    // participante => indices en _records
    mapping(address => uint256[]) private _recordsByParticipant;

    event AgreementCreated(
        uint256 indexed id,
        address indexed agreement,
        address indexed escrow,
        address landlord,
        address tenant,
        address arbiter
    );

    function createAgreement(
        address depositToken,
        address tenant,
        address arbiter,
        uint256 depositAmount,
        string calldata ipfsDocumentHash,
        uint256 startDate,
        uint256 endDate
    ) external returns (address agreementAddress, address escrowAddress) {
        RentEscrow escrow = new RentEscrow(
            depositToken,
            msg.sender,
            tenant,
            arbiter,
            depositAmount
        );

        RentContract agreement = new RentContract(
            msg.sender,
            tenant,
            arbiter,
            address(escrow),
            ipfsDocumentHash,
            startDate,
            endDate
        );

        escrow.linkAgreement(address(agreement));

        _register(address(agreement), address(escrow), tenant, arbiter);

        return (address(agreement), address(escrow));
    }

    // Separado de createAgreement para no exceder el limite de variables en stack.
    function _register(address agreement, address escrow, address tenant, address arbiter) private {
        uint256 id = _records.length;
        _records.push(
            AgreementRecord({
                agreement: agreement,
                escrow: escrow,
                landlord: msg.sender,
                tenant: tenant,
                arbiter: arbiter,
                createdAt: block.timestamp
            })
        );

        _recordsByParticipant[msg.sender].push(id);
        _recordsByParticipant[tenant].push(id);
        _recordsByParticipant[arbiter].push(id);

        emit AgreementCreated(id, agreement, escrow, msg.sender, tenant, arbiter);
    }

    function totalAgreements() external view returns (uint256) {
        return _records.length;
    }

    function getAgreement(uint256 id) external view returns (AgreementRecord memory) {
        require(id < _records.length, "Agreement does not exist");
        return _records[id];
    }

    function getAgreementsOf(address participant) external view returns (AgreementRecord[] memory) {
        uint256[] storage ids = _recordsByParticipant[participant];
        AgreementRecord[] memory result = new AgreementRecord[](ids.length);

        for (uint256 i = 0; i < ids.length; i++) {
            result[i] = _records[ids[i]];
        }

        return result;
    }
}
