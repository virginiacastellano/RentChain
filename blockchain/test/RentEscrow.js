const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RentEscrow", function () {
  async function deployFixture() {
    // owner deploya el token mock
    // landlord es el propietario
    // tenant es el inquilino
    // arbiter resuelve disputas
    // other es una cuenta externa cualquiera
    const [owner, landlord, tenant, arbiter, other] = await ethers.getSigners();

    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    const token = await MockUSDT.deploy();

    const depositAmount = ethers.parseUnits("1000", 18);

    // Damos tokens al inquilino para poder depositar.
    await token.mint(tenant.address, depositAmount);

    const RentEscrow = await ethers.getContractFactory("RentEscrow");
    const escrow = await RentEscrow.deploy(
      await token.getAddress(),
      landlord.address,
      tenant.address,
      arbiter.address,
      depositAmount
    );

    return {
      token,
      escrow,
      owner,
      landlord,
      tenant,
      arbiter,
      other,
      depositAmount,
    };
  }

  it("debe guardar correctamente los parametros iniciales", async function () {
    const { token, escrow, landlord, tenant, arbiter, depositAmount } = await deployFixture();

    expect(await escrow.depositToken()).to.equal(await token.getAddress());
    expect(await escrow.landlord()).to.equal(landlord.address);
    expect(await escrow.tenant()).to.equal(tenant.address);
    expect(await escrow.arbiter()).to.equal(arbiter.address);
    expect(await escrow.depositAmount()).to.equal(depositAmount);
  });

  it("debe permitir que solo el inquilino haga el deposito", async function () {
    const { escrow, other } = await deployFixture();

    await expect(escrow.connect(other).deposit()).to.be.revertedWith(
      "Only tenant can call this"
    );
  });

  it("debe mover los tokens al contrato cuando el inquilino deposita", async function () {
    const { token, escrow, tenant, depositAmount } = await deployFixture();

    await token.connect(tenant).approve(await escrow.getAddress(), depositAmount);
    await escrow.connect(tenant).deposit();

    expect(await escrow.isDeposited()).to.equal(true);
    expect(await token.balanceOf(await escrow.getAddress())).to.equal(depositAmount);
    expect(await escrow.contractBalance()).to.equal(depositAmount);
  });

  it("no debe permitir depositar dos veces", async function () {
    const { token, escrow, tenant, depositAmount } = await deployFixture();

    await token.connect(tenant).approve(await escrow.getAddress(), depositAmount);
    await escrow.connect(tenant).deposit();

    await expect(escrow.connect(tenant).deposit()).to.be.revertedWith(
      "Deposit already made"
    );
  });

  it("debe permitir que el propietario libere el deposito si no hay disputa", async function () {
    const { token, escrow, landlord, tenant, depositAmount } = await deployFixture();

    await token.connect(tenant).approve(await escrow.getAddress(), depositAmount);
    await escrow.connect(tenant).deposit();

    await escrow.connect(landlord).releaseToLandlord();

    expect(await escrow.isReleased()).to.equal(true);
    expect(await token.balanceOf(landlord.address)).to.equal(depositAmount);
    expect(await token.balanceOf(await escrow.getAddress())).to.equal(0n);
  });

  it("no debe permitir liberar si todavia no hubo deposito", async function () {
    const { escrow, landlord } = await deployFixture();

    await expect(escrow.connect(landlord).releaseToLandlord()).to.be.revertedWith(
      "Deposit not made yet"
    );
  });

  it("no debe permitir que una cuenta externa libere el deposito", async function () {
    const { token, escrow, tenant, other, depositAmount } = await deployFixture();

    await token.connect(tenant).approve(await escrow.getAddress(), depositAmount);
    await escrow.connect(tenant).deposit();

    await expect(escrow.connect(other).releaseToLandlord()).to.be.revertedWith(
      "Only landlord can call this"
    );
  });

  it("debe permitir abrir una disputa a landlord o tenant", async function () {
    const { token, escrow, tenant, landlord, depositAmount } = await deployFixture();

    await token.connect(tenant).approve(await escrow.getAddress(), depositAmount);
    await escrow.connect(tenant).deposit();

    await escrow.connect(landlord).openDispute();

    expect(await escrow.isDisputed()).to.equal(true);
  });

  it("no debe permitir abrir disputa sin deposito", async function () {
    const { escrow, tenant } = await deployFixture();

    await expect(escrow.connect(tenant).openDispute()).to.be.revertedWith(
      "Deposit not made yet"
    );
  });

  it("no debe permitir liberar normalmente si hay disputa", async function () {
    const { token, escrow, tenant, landlord, depositAmount } = await deployFixture();

    await token.connect(tenant).approve(await escrow.getAddress(), depositAmount);
    await escrow.connect(tenant).deposit();
    await escrow.connect(tenant).openDispute();

    await expect(escrow.connect(landlord).releaseToLandlord()).to.be.revertedWith(
      "Escrow is under dispute"
    );
  });

  it("debe permitir que el arbitro resuelva a favor del propietario", async function () {
    const { token, escrow, tenant, landlord, arbiter, depositAmount } = await deployFixture();

    await token.connect(tenant).approve(await escrow.getAddress(), depositAmount);
    await escrow.connect(tenant).deposit();
    await escrow.connect(tenant).openDispute();

    await escrow.connect(arbiter).resolveToLandlord();

    expect(await escrow.isReleased()).to.equal(true);
    expect(await escrow.isDisputed()).to.equal(false);
    expect(await token.balanceOf(landlord.address)).to.equal(depositAmount);
  });

  it("debe permitir que el arbitro resuelva a favor del inquilino", async function () {
    const { token, escrow, tenant, arbiter, depositAmount } = await deployFixture();

    await token.connect(tenant).approve(await escrow.getAddress(), depositAmount);
    await escrow.connect(tenant).deposit();
    await escrow.connect(tenant).openDispute();

    await escrow.connect(arbiter).resolveToTenant();

    expect(await escrow.isReleased()).to.equal(true);
    expect(await escrow.isDisputed()).to.equal(false);
    expect(await token.balanceOf(tenant.address)).to.equal(depositAmount);
  });

  it("no debe permitir que una cuenta externa resuelva la disputa", async function () {
    const { token, escrow, tenant, other, depositAmount } = await deployFixture();

    await token.connect(tenant).approve(await escrow.getAddress(), depositAmount);
    await escrow.connect(tenant).deposit();
    await escrow.connect(tenant).openDispute();

    await expect(escrow.connect(other).resolveToLandlord()).to.be.revertedWith(
      "Only arbiter can call this"
    );
  });
});
