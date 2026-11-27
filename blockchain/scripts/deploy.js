const { ethers, network } = require("hardhat");

/*
 * Despliega un escenario completo de RentChain:
 * 1. MockUSDT (token del deposito, solo para pruebas)
 * 2. RentEscrow (la garantia)
 * 3. RentContract (el acuerdo), apuntando al escrow
 * 4. Vincula el escrow con el acuerdo
 *
 * En la red local usa cuentas de prueba para tenant y arbiter.
 * En Sepolia hay que definir TENANT_ADDRESS y ARBITER_ADDRESS.
 *
 * Uso:
 *   npx hardhat run scripts/deploy.js
 *   npx hardhat run scripts/deploy.js --network sepolia
 */
async function main() {
  const signers = await ethers.getSigners();
  const landlord = signers[0];

  const tenantAddress = process.env.TENANT_ADDRESS || signers[1]?.address;
  const arbiterAddress = process.env.ARBITER_ADDRESS || signers[2]?.address;
  if (!tenantAddress || !arbiterAddress) {
    throw new Error("Defini TENANT_ADDRESS y ARBITER_ADDRESS para esta red");
  }

  const depositAmount = ethers.parseUnits(process.env.DEPOSIT_AMOUNT || "1000", 18);
  const now = Math.floor(Date.now() / 1000);
  const startDate = now + 24 * 60 * 60;
  const endDate = startDate + 365 * 24 * 60 * 60;

  console.log(`Red: ${network.name}`);
  console.log(`Landlord: ${landlord.address}`);

  const token = await ethers.deployContract("MockUSDT");
  await token.waitForDeployment();
  console.log(`MockUSDT:     ${await token.getAddress()}`);

  const escrow = await ethers.deployContract("RentEscrow", [
    await token.getAddress(),
    landlord.address,
    tenantAddress,
    arbiterAddress,
    depositAmount,
  ]);
  await escrow.waitForDeployment();
  console.log(`RentEscrow:   ${await escrow.getAddress()}`);

  const agreement = await ethers.deployContract("RentContract", [
    tenantAddress,
    arbiterAddress,
    await escrow.getAddress(),
    process.env.IPFS_DOCUMENT_HASH || "ipfs://rentchain-demo-contract",
    startDate,
    endDate,
  ]);
  await agreement.waitForDeployment();
  console.log(`RentContract: ${await agreement.getAddress()}`);

  const tx = await escrow.linkAgreement(await agreement.getAddress());
  await tx.wait();
  console.log("Escrow vinculado al acuerdo.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
