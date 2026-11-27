// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Reutilizamos la implementacion ERC20 de OpenZeppelin.
// Esto nos da un token estandar y seguro para testing.
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/*
 * MockUSDT
 *
 * Token de prueba similar a USDT para desarrollo local.
 * Nos va a servir mas adelante para probar depositos en el escrow.
 */
contract MockUSDT is ERC20 {
    /*
     * Al desplegar el contrato:
     * - definimos nombre y simbolo
     * - minteamos un supply inicial al deployer
     */
    constructor() ERC20("Mock USDT", "mUSDT") {
        _mint(msg.sender, 1_000_000 * 10 ** decimals());
    }

    /*
     * Funcion util para tests:
     * permite crear saldo extra en cualquier wallet de prueba.
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
