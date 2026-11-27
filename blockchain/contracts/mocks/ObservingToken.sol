// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface IEscrowView {
    function isReleased() external view returns (bool);
    function returnToTenant() external;
}

/*
 * Token de prueba para verificar el orden checks-effects-interactions
 * y la proteccion contra reentrancia del escrow.
 *
 * Cuando el escrow transfiere fondos hacia afuera:
 * - registra si el escrow ya habia marcado los fondos como liberados
 * - intenta volver a entrar al escrow y registra si la llamada fallo
 */
contract ObservingToken is ERC20 {
    address public watchedEscrow;
    bool public sawReleasedBeforeTransfer;
    bool public reentryAttempted;
    bool public reentryBlocked;

    constructor() ERC20("Observing Token", "OBS") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function watch(address escrow) external {
        watchedEscrow = escrow;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);

        if (watchedEscrow != address(0) && from == watchedEscrow) {
            sawReleasedBeforeTransfer = IEscrowView(watchedEscrow).isReleased();
            reentryAttempted = true;
            try IEscrowView(watchedEscrow).returnToTenant() {
                reentryBlocked = false;
            } catch {
                reentryBlocked = true;
            }
        }
    }
}
