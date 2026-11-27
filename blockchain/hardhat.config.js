require("@nomicfoundation/hardhat-toolbox");

/*
 * Configuracion para desarrollo local.
 *
 * - El optimizer es necesario: RentChainFactory incluye el bytecode de
 *   RentContract y RentEscrow y sin optimizar supera el limite de 24 KB.
 * - "localhost" es el nodo de `npx hardhat node` (lo usa el frontend).
 * - "sepolia" solo se habilita si estan definidas las variables de entorno,
 *   asi el repo nunca necesita claves para compilar o testear.
 */
const networks = {
  localhost: {
    url: "http://127.0.0.1:8545",
  },
};

if (process.env.SEPOLIA_RPC_URL && process.env.DEPLOYER_PRIVATE_KEY) {
  networks.sepolia = {
    url: process.env.SEPOLIA_RPC_URL,
    accounts: [process.env.DEPLOYER_PRIVATE_KEY],
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
};
