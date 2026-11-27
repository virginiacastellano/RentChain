/*
 * Recorre el flujo completo de RentChain en la red en memoria de Hardhat
 * y muestra cada paso por consola. No necesita nodo ni wallet.
 *
 * Uso:
 *   npm run demo
 */
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const DAY = 24 * 60 * 60;
const STATUS = ["Draft", "Active", "Cancelled"];

async function expectRevert(promise, label) {
  try {
    await promise;
    console.log(`   !! ${label}: NO revirtio (inesperado)`);
  } catch (error) {
    const reason = error.shortMessage || error.message;
    console.log(`   ok ${label} -> revert (${reason.replace(/^.*reverted with reason string /, "")})`);
  }
}

async function main() {
  const [, landlord, tenant, arbiter, outsider] = await ethers.getSigners();

  const token = await (await ethers.getContractFactory("MockUSDT")).deploy();
  const factory = await (await ethers.getContractFactory("RentChainFactory")).deploy();
  const decimals = await token.decimals();
  const fmt = (v) => `${ethers.formatUnits(v, decimals)} mUSDT`;
  const amount = ethers.parseUnits("1000", decimals);
  await token.mint(tenant.address, amount * 2n);

  console.log("\n== Escenario 1: alquiler sin conflicto ==");
  const now = await time.latest();
  await factory
    .connect(landlord)
    .createAgreement(await token.getAddress(), tenant.address, arbiter.address, amount, "ipfs://contrato-demo-1", now + DAY, now + 365 * DAY);
  let rec = await factory.getAgreement(0);
  let agreement = await ethers.getContractAt("RentContract", rec.agreement);
  let escrow = await ethers.getContractAt("RentEscrow", rec.escrow);
  console.log(`1. Landlord crea el acuerdo via factory (estado ${STATUS[await agreement.status()]})`);

  await expectRevert(escrow.connect(tenant).deposit(), "2. Tenant intenta depositar antes de la activacion");

  await agreement.connect(tenant).acceptAsTenant();
  await agreement.connect(arbiter).acceptAsArbiter();
  await agreement.connect(landlord).activateAgreement();
  console.log(`3. Tenant y arbiter aceptan, landlord activa (estado ${STATUS[await agreement.status()]})`);

  await token.connect(tenant).approve(rec.escrow, amount);
  await escrow.connect(tenant).deposit();
  console.log(`4. Tenant deposita la garantia. Escrow: ${fmt(await escrow.contractBalance())}`);

  await expectRevert(escrow.connect(landlord).releaseToLandlord(), "5. Landlord intenta cobrarse la garantia sin autorizacion");

  await escrow.connect(landlord).returnToTenant();
  console.log(`6. Fin del alquiler: landlord devuelve la garantia. Escrow: ${fmt(await escrow.contractBalance())}`);

  console.log("\n== Escenario 2: disputa resuelta con reparto ==");
  await factory
    .connect(landlord)
    .createAgreement(await token.getAddress(), tenant.address, arbiter.address, amount, "ipfs://contrato-demo-2", now + DAY, now + 365 * DAY);
  rec = await factory.getAgreement(1);
  agreement = await ethers.getContractAt("RentContract", rec.agreement);
  escrow = await ethers.getContractAt("RentEscrow", rec.escrow);
  await agreement.connect(tenant).acceptAsTenant();
  await agreement.connect(arbiter).acceptAsArbiter();
  await agreement.connect(landlord).activateAgreement();
  await token.connect(tenant).approve(rec.escrow, amount);
  await escrow.connect(tenant).deposit();
  console.log("1. Acuerdo activo y garantia depositada");

  await escrow.connect(landlord).openDispute();
  console.log("2. Landlord abre disputa por daños");
  await expectRevert(escrow.connect(outsider).resolveToLandlord(), "3. Un tercero intenta resolver");

  const landlordBefore = await token.balanceOf(landlord.address);
  const tenantBefore = await token.balanceOf(tenant.address);
  await escrow.connect(arbiter).resolveSplit(ethers.parseUnits("300", decimals));
  console.log(
    `4. Arbiter reparte: landlord +${fmt((await token.balanceOf(landlord.address)) - landlordBefore)}, ` +
      `tenant +${fmt((await token.balanceOf(tenant.address)) - tenantBefore)}`
  );

  console.log("\n== Escenario 3: acuerdo cancelado ==");
  await factory
    .connect(landlord)
    .createAgreement(await token.getAddress(), tenant.address, arbiter.address, amount, "ipfs://contrato-demo-3", now + DAY, now + 365 * DAY);
  rec = await factory.getAgreement(2);
  agreement = await ethers.getContractAt("RentContract", rec.agreement);
  escrow = await ethers.getContractAt("RentEscrow", rec.escrow);
  await agreement.connect(landlord).cancelAgreement();
  console.log(`1. Landlord cancela el borrador (estado ${STATUS[await agreement.status()]})`);
  await expectRevert(escrow.connect(tenant).deposit(), "2. Tenant intenta depositar en un acuerdo cancelado");

  console.log("\nDemo completa.\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
