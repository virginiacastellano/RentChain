require("@nomicfoundation/hardhat-toolbox");

/*
 * Configuracion de Hardhat.
 *
 * - El optimizer es necesario: RentChainFactory incluye el bytecode de
 *   RentContract y RentEscrow y sin optimizar supera el limite de 24 KB.
 * - "localhost" es el nodo de `npx hardhat node` (lo usa el frontend).
 * - "sepolia" (testnet) solo se habilita si estan definidas las variables
 *   de entorno. Nunca subir la clave privada al repo: va en el entorno
 *   o en un .env ignorado (ver .env.example).
 */
const { SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY, ETHERSCAN_API_KEY } = process.env;

const networks = {
  localhost: {
    url: "http://127.0.0.1:8545",
  },
};

if (SEPOLIA_RPC_URL && DEPLOYER_PRIVATE_KEY) {
  networks.sepolia = {
    url: SEPOLIA_RPC_URL,
    accounts: [DEPLOYER_PRIVATE_KEY],
  };
}

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks,
  etherscan: {
    apiKey: ETHERSCAN_API_KEY || "",
  },
};
