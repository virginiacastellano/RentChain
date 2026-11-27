/*
 * Despliega MockUSDT + RentChainFactory y deja la configuracion lista
 * para el frontend en frontend/public/deployment.json.
 *
 * Uso local:
 *   npx hardhat node                                   (terminal 1)
 *   npx hardhat run scripts/deploy.js --network localhost   (terminal 2)
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;

// Cuentas de Hardhat que el frontend usa en modo demo.
const DEMO_ROLES = ["landlord", "tenant", "arbiter"];

async function main() {
  const [deployer, ...others] = await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();

  console.log(`Red: ${hre.network.name} (chainId ${chainId})`);
  console.log(`Deployer: ${deployer.address}`);

  const token = await (await ethers.getContractFactory("MockUSDT")).deploy();
  await token.waitForDeployment();
  console.log(`MockUSDT:          ${await token.getAddress()}`);

  const factory = await (await ethers.getContractFactory("RentChainFactory")).deploy();
  await factory.waitForDeployment();
  console.log(`RentChainFactory:  ${await factory.getAddress()}`);

  // En la red local, cargamos saldo de prueba en las cuentas demo.
  const demoAccounts = {};
  if (hre.network.name === "localhost" || hre.network.name === "hardhat") {
    const amount = ethers.parseUnits("10000", await token.decimals());
    DEMO_ROLES.forEach((role, i) => {
      demoAccounts[role] = others[i].address;
    });
    for (const address of Object.values(demoAccounts)) {
      await (await token.mint(address, amount)).wait();
    }
    console.log("Cuentas demo con 10.000 mUSDT:", demoAccounts);
  }

  const abi = (name) => hre.artifacts.readArtifactSync(name).abi;

  const deployment = {
    network: hre.network.name,
    chainId: Number(chainId),
    rpcUrl: hre.network.name === "localhost" ? "http://127.0.0.1:8545" : null,
    contracts: {
      MockUSDT: await token.getAddress(),
      RentChainFactory: await factory.getAddress(),
    },
    demoAccounts,
    abis: {
      MockUSDT: abi("MockUSDT"),
      RentChainFactory: abi("RentChainFactory"),
      RentContract: abi("RentContract"),
      RentEscrow: abi("RentEscrow"),
    },
  };

  const outDir = path.join(__dirname, "..", "..", "frontend", "public");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "deployment.json");
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2));
  console.log(`Configuracion del frontend escrita en ${path.relative(process.cwd(), outFile)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
