require("@nomicfoundation/hardhat-toolbox");

/*
 * Configuracion de Hardhat.
 * - Red local de Hardhat para desarrollo y tests.
 * - Sepolia (testnet) solo si estan definidas las variables de entorno.
 *   Nunca subir la clave privada al repo: va en el entorno o en un .env ignorado.
 */
const { SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY, ETHERSCAN_API_KEY } = process.env;

const networks = {};
if (SEPOLIA_RPC_URL && DEPLOYER_PRIVATE_KEY) {
  networks.sepolia = {
    url: SEPOLIA_RPC_URL,
    accounts: [DEPLOYER_PRIVATE_KEY],
  };
}

module.exports = {
  solidity: "0.8.20",
  networks,
  etherscan: {
    apiKey: ETHERSCAN_API_KEY || "",
  },
};
