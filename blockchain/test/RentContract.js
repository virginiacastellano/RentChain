const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RentContract", function () {
  async function deployFixture() {
    // owner despliega MockUSDT y RentEscrow
    // landlord inicia el acuerdo comercial
    // tenant es el inquilino invitado
    // arbiter es el escribano/tercero confiable
    // other es una cuenta externa sin permisos
    const [owner, landlord, tenant, arbiter, other] = await ethers.getSigners();

    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    const token = await MockUSDT.connect(owner).deploy();

    const depositAmount = ethers.parseUnits("1000", 18);

    const RentEscrow = await ethers.getContractFactory("RentEscrow");
    const escrow = await RentEscrow.connect(owner).deploy(
      await token.getAddress(),
      landlord.address,
      tenant.address,
      arbiter.address,
      depositAmount
    );

    const RentContract = await ethers.getContractFactory("RentContract");

    const startDate = 1_800_000_000;
    const endDate = 1_803_153_600;
    const ipfsDocumentHash = "ipfs://rentchain-contract-v1";

    const rentContract = await RentContract.connect(landlord).deploy(
      tenant.address,
      arbiter.address,
      await escrow.getAddress(),
      ipfsDocumentHash,
      startDate,
      endDate
    );

    return {
      token,
      escrow,
      rentContract,
      owner,
      landlord,
      tenant,
      arbiter,
      other,
      startDate,
      endDate,
      ipfsDocumentHash,
    };
  }

  it("debe guardar correctamente los parametros iniciales del acuerdo", async function () {
    const {
      rentContract,
      landlord,
      tenant,
      arbiter,
      escrow,
      startDate,
      endDate,
      ipfsDocumentHash,
    } = await deployFixture();

    expect(await rentContract.landlord()).to.equal(landlord.address);
    expect(await rentContract.tenant()).to.equal(tenant.address);
    expect(await rentContract.arbiter()).to.equal(arbiter.address);
    expect(await rentContract.escrowAddress()).to.equal(await escrow.getAddress());
    expect(await rentContract.startDate()).to.equal(startDate);
    expect(await rentContract.endDate()).to.equal(endDate);
    expect(await rentContract.ipfsDocumentHash()).to.equal(ipfsDocumentHash);
    expect(await rentContract.status()).to.equal(0n);
  });

  it("debe permitir que el tenant acepte el acuerdo", async function () {
    const { rentContract, tenant } = await deployFixture();

    await rentContract.connect(tenant).acceptAsTenant();

    expect(await rentContract.tenantAccepted()).to.equal(true);
  });

  it("debe permitir que el arbiter acepte el acuerdo", async function () {
    const { rentContract, arbiter } = await deployFixture();

    await rentContract.connect(arbiter).acceptAsArbiter();

    expect(await rentContract.arbiterAccepted()).to.equal(true);
  });

  it("no debe permitir activar el acuerdo si tenant y arbiter no aceptaron", async function () {
    const { rentContract, landlord } = await deployFixture();

    await expect(rentContract.connect(landlord).activateAgreement()).to.be.revertedWith(
      "Tenant has not accepted yet"
    );
  });

  it("debe permitir activar el acuerdo cuando tenant y arbiter aceptaron", async function () {
    const { rentContract, landlord, tenant, arbiter } = await deployFixture();

    await rentContract.connect(tenant).acceptAsTenant();
    await rentContract.connect(arbiter).acceptAsArbiter();
    await rentContract.connect(landlord).activateAgreement();

    expect(await rentContract.status()).to.equal(1n);
  });

  it("solo el landlord puede activar el acuerdo", async function () {
    const { rentContract, tenant, arbiter, other } = await deployFixture();

    await rentContract.connect(tenant).acceptAsTenant();
    await rentContract.connect(arbiter).acceptAsArbiter();

    await expect(rentContract.connect(other).activateAgreement()).to.be.revertedWith(
      "Only landlord can call this"
    );
  });

  it("debe permitir actualizar el hash del documento mientras el acuerdo sigue en draft", async function () {
    const { rentContract, landlord } = await deployFixture();

    const newHash = "ipfs://rentchain-contract-v2";

    await rentContract.connect(landlord).updateDocumentHash(newHash);

    expect(await rentContract.ipfsDocumentHash()).to.equal(newHash);
  });

  it("no debe permitir actualizar el documento cuando el acuerdo ya esta activo", async function () {
    const { rentContract, landlord, tenant, arbiter } = await deployFixture();

    await rentContract.connect(tenant).acceptAsTenant();
    await rentContract.connect(arbiter).acceptAsArbiter();
    await rentContract.connect(landlord).activateAgreement();

    await expect(
      rentContract.connect(landlord).updateDocumentHash("ipfs://updated-after-active")
    ).to.be.revertedWith("Agreement is not in draft state");
  });

  it("debe permitir cancelar el acuerdo mientras sigue en draft", async function () {
    const { rentContract, landlord } = await deployFixture();

    await rentContract.connect(landlord).cancelAgreement();

    expect(await rentContract.status()).to.equal(2n);
  });

  it("no debe permitir aceptar el acuerdo despues de cancelado", async function () {
    const { rentContract, landlord, tenant } = await deployFixture();

    await rentContract.connect(landlord).cancelAgreement();

    await expect(rentContract.connect(tenant).acceptAsTenant()).to.be.revertedWith(
      "Agreement is not in draft state"
    );
  });
});
