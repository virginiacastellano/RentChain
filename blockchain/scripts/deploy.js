/*
 * Despliega MockUSDT + RentChainFactory.
 *
 * Red local (la usa el frontend):
 *   npx hardhat node                    (terminal 1)
 *   npm run deploy:local                (terminal 2)
 *   -> carga 10.000 mUSDT en las cuentas demo y escribe
 *      frontend/public/deployment.json
 *
 * Sepolia:
 *   definir SEPOLIA_RPC_URL y DEPLOYER_PRIVATE_KEY (ver .env.example)
 *   npm run deploy:sepolia
 *   -> si ademas estan TENANT_ADDRESS y ARBITER_ADDRESS, crea un acuerdo
 *      de ejemplo con el deployer como landlord
 *   -> escribe blockchain/deployments/sepolia.json
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;

// Cuentas de Hardhat que el frontend usa en modo demo.
const DEMO_ROLES = ["landlord", "tenant", "arbiter"];
const DAY = 24 * 60 * 60;

const isLocal = () => ["localhost", "hardhat"].includes(hre.network.name);

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

  const decimals = await token.decimals();

  // En la red local, cargamos saldo de prueba en las cuentas demo.
  const demoAccounts = {};
  if (isLocal()) {
    const amount = ethers.parseUnits("10000", decimals);
    DEMO_ROLES.forEach((role, i) => {
      demoAccounts[role] = others[i].address;
    });
    for (const address of Object.values(demoAccounts)) {
      await (await token.mint(address, amount)).wait();
    }
    console.log("Cuentas demo con 10.000 mUSDT:", demoAccounts);
  }

  // En testnet, acuerdo de ejemplo opcional.
  let sampleAgreement = null;
  const { TENANT_ADDRESS, ARBITER_ADDRESS, DEPOSIT_AMOUNT, IPFS_DOCUMENT_HASH } = process.env;
  if (!isLocal() && TENANT_ADDRESS && ARBITER_ADDRESS) {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const deposit = ethers.parseUnits(DEPOSIT_AMOUNT || "1000", decimals);
    const tx = await factory.createAgreement(
      await token.getAddress(),
      TENANT_ADDRESS,
      ARBITER_ADDRESS,
      deposit,
      IPFS_DOCUMENT_HASH || "sha256:documento-de-ejemplo",
      now + DAY,
      now + 365 * DAY
    );
    await tx.wait();
    const record = await factory.getAgreement((await factory.totalAgreements()) - 1n);
    sampleAgreement = { agreement: record.agreement, escrow: record.escrow };
    await (await token.mint(TENANT_ADDRESS, deposit)).wait();
    console.log("Acuerdo de ejemplo:", sampleAgreement);
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
    sampleAgreement,
    abis: {
      MockUSDT: abi("MockUSDT"),
      RentChainFactory: abi("RentChainFactory"),
      RentContract: abi("RentContract"),
      RentEscrow: abi("RentEscrow"),
    },
  };

  const outFile = isLocal()
    ? path.join(__dirname, "..", "..", "frontend", "public", "deployment.json")
    : path.join(__dirname, "..", "deployments", `${hre.network.name}.json`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2));
  console.log(`Configuracion escrita en ${path.relative(process.cwd(), outFile)}`);

  if (!isLocal()) {
    console.log("\nPara verificar en Etherscan:");
    console.log(`  npx hardhat verify --network ${hre.network.name} ${await token.getAddress()}`);
    console.log(`  npx hardhat verify --network ${hre.network.name} ${await factory.getAddress()}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
