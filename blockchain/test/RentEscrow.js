const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const DAY = 24 * 60 * 60;
const CLAIM_WINDOW = 7 * DAY;
const DISPUTE_TIMEOUT = 30 * DAY;

describe("RentEscrow", function () {
  /*
   * Fixture base: escrow + acuerdo vinculados, todavia en Draft.
   *
   * owner despliega el token y el escrow
   * landlord es el propietario
   * tenant es el inquilino
   * arbiter resuelve disputas
   * other es una cuenta externa cualquiera
   */
  async function linkedFixture() {
    const [owner, landlord, tenant, arbiter, other] = await ethers.getSigners();

    const token = await (await ethers.getContractFactory("MockUSDT")).deploy();
    const depositAmount = ethers.parseUnits("1000", 18);
    await token.mint(tenant.address, depositAmount);

    const escrow = await (await ethers.getContractFactory("RentEscrow")).deploy(
      await token.getAddress(),
      landlord.address,
      tenant.address,
      arbiter.address,
      depositAmount
    );

    const now = await time.latest();
    const startDate = now + DAY;
    const endDate = now + 365 * DAY;

    const agreement = await (await ethers.getContractFactory("RentContract")).deploy(
      landlord.address,
      tenant.address,
      arbiter.address,
      await escrow.getAddress(),
      "ipfs://rentchain-contract-v1",
      startDate,
      endDate
    );

    await escrow.linkAgreement(await agreement.getAddress());
    await token.connect(tenant).approve(await escrow.getAddress(), depositAmount);

    return { token, escrow, agreement, owner, landlord, tenant, arbiter, other, depositAmount, endDate };
  }

  // Acuerdo activo (tenant y arbiter aceptaron).
  async function activeFixture() {
    const f = await linkedFixture();
    await f.agreement.connect(f.tenant).acceptAsTenant();
    await f.agreement.connect(f.arbiter).acceptAsArbiter();
    await f.agreement.connect(f.landlord).activateAgreement();
    return f;
  }

  // Acuerdo activo con el deposito hecho.
  async function fundedFixture() {
    const f = await activeFixture();
    await f.escrow.connect(f.tenant).deposit();
    return f;
  }

  // Deposito hecho y disputa abierta por el tenant.
  async function disputedFixture() {
    const f = await fundedFixture();
    await f.escrow.connect(f.tenant).openDispute();
    return f;
  }

  describe("configuracion y vinculo", function () {
    it("debe guardar correctamente los parametros iniciales", async function () {
      const { token, escrow, agreement, landlord, tenant, arbiter, depositAmount } =
        await loadFixture(linkedFixture);

      expect(await escrow.depositToken()).to.equal(await token.getAddress());
      expect(await escrow.landlord()).to.equal(landlord.address);
      expect(await escrow.tenant()).to.equal(tenant.address);
      expect(await escrow.arbiter()).to.equal(arbiter.address);
      expect(await escrow.depositAmount()).to.equal(depositAmount);
      expect(await escrow.agreement()).to.equal(await agreement.getAddress());
    });

    it("no debe permitir vincular dos veces", async function () {
      const { escrow, agreement } = await loadFixture(linkedFixture);

      await expect(escrow.linkAgreement(await agreement.getAddress())).to.be.revertedWith(
        "Agreement already linked"
      );
    });

    it("solo el deployer puede vincular el acuerdo", async function () {
      const [, landlord, tenant, arbiter, other] = await ethers.getSigners();
      const token = await (await ethers.getContractFactory("MockUSDT")).deploy();
      const escrow = await (await ethers.getContractFactory("RentEscrow")).deploy(
        await token.getAddress(), landlord.address, tenant.address, arbiter.address, 1n
      );

      await expect(escrow.connect(other).linkAgreement(other.address)).to.be.revertedWith(
        "Only deployer can link"
      );
    });

    it("rechaza un acuerdo que apunta a otro escrow", async function () {
      const { token, landlord, tenant, arbiter, agreement } = await loadFixture(linkedFixture);
      const otherEscrow = await (await ethers.getContractFactory("RentEscrow")).deploy(
        await token.getAddress(), landlord.address, tenant.address, arbiter.address, 1n
      );

      await expect(otherEscrow.linkAgreement(await agreement.getAddress())).to.be.revertedWith(
        "Agreement points to another escrow"
      );
    });
  });

  describe("deposito", function () {
    it("no permite depositar si el acuerdo sigue en Draft", async function () {
      const { escrow, tenant } = await loadFixture(linkedFixture);

      await expect(escrow.connect(tenant).deposit()).to.be.revertedWith("Agreement is not active");
    });

    it("no permite depositar si el acuerdo fue cancelado", async function () {
      const { escrow, agreement, landlord, tenant } = await loadFixture(linkedFixture);
      await agreement.connect(landlord).cancelAgreement();

      await expect(escrow.connect(tenant).deposit()).to.be.revertedWith("Agreement is not active");
    });

    it("solo el inquilino puede depositar", async function () {
      const { escrow, other } = await loadFixture(activeFixture);

      await expect(escrow.connect(other).deposit()).to.be.revertedWith("Only tenant can call this");
    });

    it("mueve los tokens al contrato cuando el acuerdo esta activo", async function () {
      const { escrow, token, tenant, depositAmount } = await loadFixture(activeFixture);

      await expect(escrow.connect(tenant).deposit())
        .to.emit(escrow, "Deposited")
        .withArgs(tenant.address, depositAmount);

      expect(await escrow.isDeposited()).to.equal(true);
      expect(await token.balanceOf(await escrow.getAddress())).to.equal(depositAmount);
    });

    it("rechaza tokens con comision por transferencia", async function () {
      const [, landlord, tenant, arbiter] = await ethers.getSigners();
      const feeToken = await (await ethers.getContractFactory("FeeOnTransferToken")).deploy();
      const amount = ethers.parseUnits("1000", 18);
      await feeToken.mint(tenant.address, amount);

      const factory = await (await ethers.getContractFactory("RentChainFactory")).deploy();
      const now = await time.latest();
      await factory
        .connect(landlord)
        .createAgreement(await feeToken.getAddress(), tenant.address, arbiter.address, amount, "ipfs://x", now + DAY, now + 365 * DAY);
      const rec = await factory.getAgreement(0);
      const agreement = await ethers.getContractAt("RentContract", rec.agreement);
      const escrow = await ethers.getContractAt("RentEscrow", rec.escrow);
      await agreement.connect(tenant).acceptAsTenant();
      await agreement.connect(arbiter).acceptAsArbiter();
      await agreement.connect(landlord).activateAgreement();
      await feeToken.connect(tenant).approve(rec.escrow, amount);

      await expect(escrow.connect(tenant).deposit()).to.be.revertedWith(
        "Fee-on-transfer tokens not supported"
      );
    });

    it("no permite depositar dos veces", async function () {
      const { escrow, tenant } = await loadFixture(fundedFixture);

      await expect(escrow.connect(tenant).deposit()).to.be.revertedWith("Deposit already made");
    });
  });

  describe("cierre sin disputa", function () {
    it("el landlord puede devolver el deposito al inquilino", async function () {
      const { escrow, token, landlord, tenant, depositAmount } = await loadFixture(fundedFixture);

      await escrow.connect(landlord).returnToTenant();

      expect(await escrow.isReleased()).to.equal(true);
      expect(await token.balanceOf(tenant.address)).to.equal(depositAmount);
    });

    it("el landlord NO puede cobrar el deposito sin autorizacion del inquilino", async function () {
      const { escrow, landlord } = await loadFixture(fundedFixture);

      await expect(escrow.connect(landlord).releaseToLandlord()).to.be.revertedWith(
        "Tenant has not approved the release"
      );
    });

    it("el landlord puede cobrar si el inquilino lo autoriza", async function () {
      const { escrow, token, landlord, tenant, depositAmount } = await loadFixture(fundedFixture);

      await escrow.connect(tenant).approveReleaseToLandlord();
      await escrow.connect(landlord).releaseToLandlord();

      expect(await token.balanceOf(landlord.address)).to.equal(depositAmount);
    });

    it("no permite liberar si todavia no hubo deposito", async function () {
      const { escrow, landlord } = await loadFixture(activeFixture);

      await expect(escrow.connect(landlord).returnToTenant()).to.be.revertedWith(
        "Deposit not made yet"
      );
    });

    it("una cuenta externa no puede mover el deposito", async function () {
      const { escrow, other } = await loadFixture(fundedFixture);

      await expect(escrow.connect(other).returnToTenant()).to.be.revertedWith(
        "Only landlord can call this"
      );
      await expect(escrow.connect(other).releaseToLandlord()).to.be.revertedWith(
        "Only landlord can call this"
      );
    });

    it("el inquilino no puede reclamar antes de fin de contrato + ventana", async function () {
      const { escrow, tenant, endDate } = await loadFixture(fundedFixture);

      await time.increaseTo(endDate + CLAIM_WINDOW - 10);

      await expect(escrow.connect(tenant).claimAfterEnd()).to.be.revertedWith(
        "Claim window still open"
      );
    });

    it("el inquilino recupera el deposito si el landlord no actua a tiempo", async function () {
      const { escrow, token, tenant, depositAmount, endDate } = await loadFixture(fundedFixture);

      await time.increaseTo(endDate + CLAIM_WINDOW);
      await escrow.connect(tenant).claimAfterEnd();

      expect(await token.balanceOf(tenant.address)).to.equal(depositAmount);
    });
  });

  describe("disputas", function () {
    it("landlord o tenant pueden abrir una disputa", async function () {
      const { escrow, landlord } = await loadFixture(fundedFixture);

      await expect(escrow.connect(landlord).openDispute())
        .to.emit(escrow, "DisputeOpened")
        .withArgs(landlord.address);
      expect(await escrow.isDisputed()).to.equal(true);
    });

    it("no se puede abrir disputa sin deposito", async function () {
      const { escrow, tenant } = await loadFixture(activeFixture);

      await expect(escrow.connect(tenant).openDispute()).to.be.revertedWith("Deposit not made yet");
    });

    it("el landlord no puede abrir disputa despues de su ventana de reclamo", async function () {
      const { escrow, landlord, endDate } = await loadFixture(fundedFixture);

      await time.increaseTo(endDate + CLAIM_WINDOW);

      await expect(escrow.connect(landlord).openDispute()).to.be.revertedWith("Claim window closed");
    });

    it("durante la disputa se congela el flujo normal", async function () {
      const { escrow, landlord, tenant } = await loadFixture(disputedFixture);

      await expect(escrow.connect(landlord).returnToTenant()).to.be.revertedWith(
        "Escrow is under dispute"
      );
      await expect(escrow.connect(tenant).claimAfterEnd()).to.be.revertedWith(
        "Escrow is under dispute"
      );
    });

    it("el arbitro puede resolver a favor del propietario", async function () {
      const { escrow, token, arbiter, landlord, depositAmount } = await loadFixture(disputedFixture);

      await escrow.connect(arbiter).resolveToLandlord();

      expect(await token.balanceOf(landlord.address)).to.equal(depositAmount);
      expect(await escrow.isReleased()).to.equal(true);
      expect(await escrow.isDisputed()).to.equal(false);
    });

    it("el arbitro puede resolver a favor del inquilino", async function () {
      const { escrow, token, arbiter, tenant, depositAmount } = await loadFixture(disputedFixture);

      await escrow.connect(arbiter).resolveToTenant();

      expect(await token.balanceOf(tenant.address)).to.equal(depositAmount);
    });

    it("el arbitro puede repartir el deposito", async function () {
      const { escrow, token, arbiter, landlord, tenant } = await loadFixture(disputedFixture);
      const toLandlord = ethers.parseUnits("300", 18);

      await expect(escrow.connect(arbiter).resolveSplit(toLandlord))
        .to.emit(escrow, "ResolvedSplit")
        .withArgs(arbiter.address, toLandlord, ethers.parseUnits("700", 18));

      expect(await token.balanceOf(landlord.address)).to.equal(toLandlord);
      expect(await token.balanceOf(tenant.address)).to.equal(ethers.parseUnits("700", 18));
    });

    it("el reparto no puede superar el deposito", async function () {
      const { escrow, arbiter, depositAmount } = await loadFixture(disputedFixture);

      await expect(escrow.connect(arbiter).resolveSplit(depositAmount + 1n)).to.be.revertedWith(
        "Amount exceeds deposit"
      );
    });

    it("una cuenta externa no puede resolver la disputa", async function () {
      const { escrow, other } = await loadFixture(disputedFixture);

      await expect(escrow.connect(other).resolveToLandlord()).to.be.revertedWith(
        "Only arbiter can call this"
      );
    });

    it("no se puede resolver dos veces", async function () {
      const { escrow, arbiter } = await loadFixture(disputedFixture);

      await escrow.connect(arbiter).resolveToTenant();

      await expect(escrow.connect(arbiter).resolveToLandlord()).to.be.revertedWith(
        "No active dispute"
      );
    });

    it("si el arbitro no resuelve a tiempo, el inquilino recupera el deposito", async function () {
      const { escrow, token, tenant, depositAmount } = await loadFixture(disputedFixture);

      await expect(escrow.connect(tenant).claimAfterDisputeTimeout()).to.be.revertedWith(
        "Dispute timeout not reached"
      );

      await time.increase(DISPUTE_TIMEOUT);
      await escrow.connect(tenant).claimAfterDisputeTimeout();

      expect(await token.balanceOf(tenant.address)).to.equal(depositAmount);
    });
  });
});
