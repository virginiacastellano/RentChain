const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("RentEscrow (deposito de garantia)", function () {
  const DAY = 24 * 60 * 60;
  const CLAIM_WINDOW = 7 * DAY;
  const ARBITER_TIMEOUT = 30 * DAY;

  /*
   * Escenario base:
   * - owner despliega el token mock
   * - landlord crea escrow y acuerdo, tenant y arbiter aceptan
   * - el acuerdo queda activo y vinculado al escrow
   * - el alquiler dura 365 dias desde hoy
   */
  async function deployFixture() {
    const [owner, landlord, tenant, arbiter, other] = await ethers.getSigners();

    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    const token = await MockUSDT.connect(owner).deploy();

    const depositAmount = ethers.parseUnits("1000", 18);
    await token.mint(tenant.address, depositAmount);

    const RentEscrow = await ethers.getContractFactory("RentEscrow");
    const escrow = await RentEscrow.connect(landlord).deploy(
      await token.getAddress(),
      landlord.address,
      tenant.address,
      arbiter.address,
      depositAmount
    );

    const now = await time.latest();
    const startDate = now + DAY;
    const endDate = startDate + 365 * DAY;

    const RentContract = await ethers.getContractFactory("RentContract");
    const agreement = await RentContract.connect(landlord).deploy(
      tenant.address,
      arbiter.address,
      await escrow.getAddress(),
      "ipfs://rentchain-contract-v1",
      startDate,
      endDate
    );

    return { token, escrow, agreement, owner, landlord, tenant, arbiter, other, depositAmount, endDate };
  }

  async function activeFixture() {
    const ctx = await deployFixture();
    const { escrow, agreement, landlord, tenant, arbiter } = ctx;

    await agreement.connect(tenant).acceptAsTenant();
    await agreement.connect(arbiter).acceptAsArbiter();
    await agreement.connect(landlord).activateAgreement();
    await escrow.connect(landlord).linkAgreement(await agreement.getAddress());

    return ctx;
  }

  async function depositedFixture() {
    const ctx = await activeFixture();
    const { token, escrow, tenant, depositAmount } = ctx;

    await token.connect(tenant).approve(await escrow.getAddress(), depositAmount);
    await escrow.connect(tenant).deposit();

    return ctx;
  }

  async function disputedFixture() {
    const ctx = await depositedFixture();
    await ctx.escrow.connect(ctx.landlord).openDispute();
    return ctx;
  }

  // ---------------------------------------------------------------
  // Configuracion y vinculo con el acuerdo
  // ---------------------------------------------------------------

  describe("Configuracion", function () {
    it("guarda correctamente los parametros iniciales", async function () {
      const { token, escrow, landlord, tenant, arbiter, depositAmount } = await loadFixture(deployFixture);

      expect(await escrow.depositToken()).to.equal(await token.getAddress());
      expect(await escrow.landlord()).to.equal(landlord.address);
      expect(await escrow.tenant()).to.equal(tenant.address);
      expect(await escrow.arbiter()).to.equal(arbiter.address);
      expect(await escrow.depositAmount()).to.equal(depositAmount);
      expect(await escrow.state()).to.equal(0); // AwaitingDeposit
    });

    it("solo el landlord puede vincular el acuerdo", async function () {
      const { escrow, agreement, other } = await loadFixture(deployFixture);

      await expect(
        escrow.connect(other).linkAgreement(await agreement.getAddress())
      ).to.be.revertedWith("Only landlord can call this");
    });

    it("no permite vincular el acuerdo dos veces", async function () {
      const { escrow, agreement, landlord } = await loadFixture(activeFixture);

      await expect(
        escrow.connect(landlord).linkAgreement(await agreement.getAddress())
      ).to.be.revertedWith("Agreement already linked");
    });

    it("rechaza un acuerdo que apunta a otro escrow", async function () {
      const { escrow, landlord, tenant, arbiter, endDate } = await loadFixture(deployFixture);

      const RentContract = await ethers.getContractFactory("RentContract");
      const otherAgreement = await RentContract.connect(landlord).deploy(
        tenant.address,
        arbiter.address,
        tenant.address, // escrow equivocado
        "ipfs://otro",
        endDate - 10 * DAY,
        endDate
      );

      await expect(
        escrow.connect(landlord).linkAgreement(await otherAgreement.getAddress())
      ).to.be.revertedWith("Agreement points to another escrow");
    });
  });

  // ---------------------------------------------------------------
  // Deposito
  // ---------------------------------------------------------------

  describe("Deposito", function () {
    it("no permite depositar si el acuerdo no esta vinculado", async function () {
      const { escrow, tenant } = await loadFixture(deployFixture);

      await expect(escrow.connect(tenant).deposit()).to.be.revertedWith("Agreement not linked");
    });

    it("no permite depositar si el acuerdo no esta activo", async function () {
      const { token, escrow, agreement, landlord, tenant, depositAmount } = await loadFixture(deployFixture);

      await escrow.connect(landlord).linkAgreement(await agreement.getAddress());
      await token.connect(tenant).approve(await escrow.getAddress(), depositAmount);

      await expect(escrow.connect(tenant).deposit()).to.be.revertedWith("Agreement is not active");
    });

    it("solo el tenant puede depositar", async function () {
      const { escrow, other } = await loadFixture(activeFixture);

      await expect(escrow.connect(other).deposit()).to.be.revertedWith("Only tenant can call this");
    });

    it("mueve la garantia al contrato", async function () {
      const { token, escrow, depositAmount } = await loadFixture(depositedFixture);

      expect(await escrow.state()).to.equal(1); // Deposited
      expect(await token.balanceOf(await escrow.getAddress())).to.equal(depositAmount);
    });

    it("no permite depositar dos veces", async function () {
      const { escrow, tenant } = await loadFixture(depositedFixture);

      await expect(escrow.connect(tenant).deposit()).to.be.revertedWith("Invalid escrow state");
    });

    it("no permite depositar despues de que termino el alquiler", async function () {
      const { token, escrow, tenant, depositAmount, endDate } = await loadFixture(activeFixture);

      await time.increaseTo(endDate);
      await token.connect(tenant).approve(await escrow.getAddress(), depositAmount);

      await expect(escrow.connect(tenant).deposit()).to.be.revertedWith("Rental already ended");
    });
  });

  // ---------------------------------------------------------------
  // Devolucion normal de la garantia
  // ---------------------------------------------------------------

  describe("Devolucion de la garantia", function () {
    it("nadie puede devolverla al tenant antes de que venza el plazo de reclamo, salvo el landlord", async function () {
      const { escrow, tenant, other, endDate } = await loadFixture(depositedFixture);

      await time.increaseTo(endDate + CLAIM_WINDOW - 60);

      await expect(escrow.connect(tenant).returnDeposit()).to.be.revertedWith("Claim window still open");
      await expect(escrow.connect(other).returnDeposit()).to.be.revertedWith("Claim window still open");
    });

    it("el landlord puede devolverla antes, renunciando a reclamar", async function () {
      const { token, escrow, landlord, tenant, depositAmount } = await loadFixture(depositedFixture);

      await expect(escrow.connect(landlord).returnDeposit())
        .to.emit(escrow, "DepositReturned")
        .withArgs(tenant.address, depositAmount);

      expect(await token.balanceOf(tenant.address)).to.equal(depositAmount);
      expect(await escrow.state()).to.equal(3); // Closed
    });

    it("vencido el plazo sin disputa, vuelve al tenant aunque el landlord no haga nada", async function () {
      const { token, escrow, tenant, depositAmount, endDate } = await loadFixture(depositedFixture);

      await time.increaseTo(endDate + CLAIM_WINDOW + 1);
      await escrow.connect(tenant).returnDeposit();

      expect(await token.balanceOf(tenant.address)).to.equal(depositAmount);
      expect(await token.balanceOf(await escrow.getAddress())).to.equal(0n);
    });

    it("el landlord ya no puede llevarse la garantia por su cuenta", async function () {
      const { escrow } = await loadFixture(depositedFixture);

      expect(escrow.releaseToLandlord).to.equal(undefined);
    });
  });

  // ---------------------------------------------------------------
  // Disputas
  // ---------------------------------------------------------------

  describe("Disputas", function () {
    it("landlord o tenant pueden abrir una disputa", async function () {
      const { escrow, tenant } = await loadFixture(depositedFixture);

      await expect(escrow.connect(tenant).openDispute())
        .to.emit(escrow, "DisputeOpened")
        .withArgs(tenant.address);
      expect(await escrow.state()).to.equal(2); // Disputed
    });

    it("una cuenta externa no puede abrir disputa", async function () {
      const { escrow, other } = await loadFixture(depositedFixture);

      await expect(escrow.connect(other).openDispute()).to.be.revertedWith("Only participant can call this");
    });

    it("no se puede abrir disputa sin deposito", async function () {
      const { escrow, landlord } = await loadFixture(activeFixture);

      await expect(escrow.connect(landlord).openDispute()).to.be.revertedWith("Invalid escrow state");
    });

    it("no se puede abrir disputa despues del plazo de reclamo", async function () {
      const { escrow, landlord, endDate } = await loadFixture(depositedFixture);

      await time.increaseTo(endDate + CLAIM_WINDOW + 1);

      await expect(escrow.connect(landlord).openDispute()).to.be.revertedWith("Claim window is over");
    });

    it("con disputa abierta no se puede devolver la garantia por la via normal", async function () {
      const { escrow, landlord } = await loadFixture(disputedFixture);

      await expect(escrow.connect(landlord).returnDeposit()).to.be.revertedWith("Invalid escrow state");
    });

    it("el arbiter puede repartir la garantia (ej. 300 por danos, 700 al tenant)", async function () {
      const { token, escrow, landlord, tenant, arbiter } = await loadFixture(disputedFixture);

      const toLandlord = ethers.parseUnits("300", 18);
      const toTenant = ethers.parseUnits("700", 18);

      await expect(escrow.connect(arbiter).resolveDispute(toLandlord))
        .to.emit(escrow, "DisputeResolved")
        .withArgs(arbiter.address, toLandlord, toTenant);

      expect(await token.balanceOf(landlord.address)).to.equal(toLandlord);
      expect(await token.balanceOf(tenant.address)).to.equal(toTenant);
      expect(await escrow.state()).to.equal(3); // Closed
    });

    it("el arbiter puede resolver todo a favor del landlord", async function () {
      const { token, escrow, landlord, arbiter, depositAmount } = await loadFixture(disputedFixture);

      await escrow.connect(arbiter).resolveToLandlord();

      expect(await token.balanceOf(landlord.address)).to.equal(depositAmount);
    });

    it("el arbiter puede resolver todo a favor del tenant", async function () {
      const { token, escrow, tenant, arbiter, depositAmount } = await loadFixture(disputedFixture);

      await escrow.connect(arbiter).resolveToTenant();

      expect(await token.balanceOf(tenant.address)).to.equal(depositAmount);
    });

    it("el arbiter no puede asignar mas que la garantia", async function () {
      const { escrow, arbiter, depositAmount } = await loadFixture(disputedFixture);

      await expect(escrow.connect(arbiter).resolveDispute(depositAmount + 1n)).to.be.revertedWith(
        "Amount exceeds deposit"
      );
    });

    it("solo el arbiter puede resolver", async function () {
      const { escrow, landlord, other } = await loadFixture(disputedFixture);

      await expect(escrow.connect(landlord).resolveToLandlord()).to.be.revertedWith("Only arbiter can call this");
      await expect(escrow.connect(other).resolveDispute(0)).to.be.revertedWith("Only arbiter can call this");
    });
  });

  // ---------------------------------------------------------------
  // Arbiter que no responde
  // ---------------------------------------------------------------

  describe("Arbiter que no responde", function () {
    it("antes del plazo, nadie puede reclamar", async function () {
      const { escrow, tenant } = await loadFixture(disputedFixture);

      await time.increase(ARBITER_TIMEOUT - 60);

      await expect(escrow.connect(tenant).claimAfterArbiterTimeout()).to.be.revertedWith("Arbiter still has time");
    });

    it("vencido el plazo, la garantia vuelve al tenant", async function () {
      const { token, escrow, tenant, other, depositAmount } = await loadFixture(disputedFixture);

      await time.increase(ARBITER_TIMEOUT + 1);
      await escrow.connect(other).claimAfterArbiterTimeout();

      expect(await token.balanceOf(tenant.address)).to.equal(depositAmount);
      expect(await escrow.state()).to.equal(3); // Closed
    });

    it("una vez cerrado, el arbiter ya no puede resolver", async function () {
      const { escrow, arbiter } = await loadFixture(disputedFixture);

      await time.increase(ARBITER_TIMEOUT + 1);
      await escrow.claimAfterArbiterTimeout();

      await expect(escrow.connect(arbiter).resolveToLandlord()).to.be.revertedWith("Invalid escrow state");
    });
  });
});
