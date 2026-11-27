const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const DAY = 24 * 60 * 60;
const CLAIM_WINDOW = 7 * DAY;
const DISPUTE_TIMEOUT = 30 * DAY;

/*
 * Pruebas de seguridad transversales: doble ejecucion, transiciones
 * prohibidas, permisos por rol, validaciones de entrada y reentrancia.
 */
describe("Seguridad", function () {
  async function baseFixture() {
    const [owner, landlord, tenant, arbiter, other] = await ethers.getSigners();
    const token = await (await ethers.getContractFactory("MockUSDT")).deploy();
    const factory = await (await ethers.getContractFactory("RentChainFactory")).deploy();
    const amount = ethers.parseUnits("1000", 18);
    await token.mint(tenant.address, amount * 5n);
    const now = await time.latest();
    return { owner, landlord, tenant, arbiter, other, token, factory, amount, now };
  }

  async function create(f, tokenAddress) {
    await f.factory
      .connect(f.landlord)
      .createAgreement(
        tokenAddress ?? (await f.token.getAddress()),
        f.tenant.address,
        f.arbiter.address,
        f.amount,
        "sha256:abc",
        f.now + DAY,
        f.now + 365 * DAY
      );
    const rec = await f.factory.getAgreement((await f.factory.totalAgreements()) - 1n);
    return {
      agreement: await ethers.getContractAt("RentContract", rec.agreement),
      escrow: await ethers.getContractAt("RentEscrow", rec.escrow),
      endDate: f.now + 365 * DAY,
    };
  }

  async function activate(f, a) {
    await a.agreement.connect(f.tenant).acceptAsTenant();
    await a.agreement.connect(f.arbiter).acceptAsArbiter();
    await a.agreement.connect(f.landlord).activateAgreement();
  }

  async function fund(f, a, token = f.token) {
    await activate(f, a);
    await token.connect(f.tenant).approve(await a.escrow.getAddress(), f.amount);
    await a.escrow.connect(f.tenant).deposit();
  }

  async function fundedFixture() {
    const f = await baseFixture();
    const a = await create(f);
    await fund(f, a);
    return { ...f, ...a };
  }

  describe("validaciones al crear el acuerdo", function () {
    it("rechaza wallets vacias, repetidas, fechas invertidas y monto cero", async function () {
      const f = await loadFixture(baseFixture);
      const t = await f.token.getAddress();
      const start = f.now + DAY;
      const end = f.now + 365 * DAY;
      const call = (tenant, arbiter, amount, s, e) =>
        f.factory.connect(f.landlord).createAgreement(t, tenant, arbiter, amount, "sha256:x", s, e);

      await expect(call(ethers.ZeroAddress, f.arbiter.address, f.amount, start, end)).to.be.revertedWith("Invalid tenant address");
      await expect(call(f.tenant.address, ethers.ZeroAddress, f.amount, start, end)).to.be.revertedWith("Invalid arbiter address");
      await expect(call(f.landlord.address, f.arbiter.address, f.amount, start, end)).to.be.revertedWith("Landlord and tenant must differ");
      await expect(call(f.tenant.address, f.landlord.address, f.amount, start, end)).to.be.revertedWith("Arbiter must differ from landlord");
      await expect(call(f.tenant.address, f.tenant.address, f.amount, start, end)).to.be.revertedWith("Arbiter must differ from tenant");
      await expect(call(f.tenant.address, f.arbiter.address, 0n, start, end)).to.be.revertedWith("Deposit amount must be greater than zero");
      await expect(call(f.tenant.address, f.arbiter.address, f.amount, end, start)).to.be.revertedWith("End date must be greater than start date");
      await expect(
        f.factory.connect(f.landlord).createAgreement(t, f.tenant.address, f.arbiter.address, f.amount, "", start, end)
      ).to.be.revertedWith("Document hash is required");
    });
  });

  describe("maquina de estados del acuerdo", function () {
    it("no permite activar dos veces ni cancelar un acuerdo activo", async function () {
      const f = await loadFixture(baseFixture);
      const a = await create(f);
      await activate(f, a);

      await expect(a.agreement.connect(f.landlord).activateAgreement()).to.be.revertedWith("Agreement is not in draft state");
      await expect(a.agreement.connect(f.landlord).cancelAgreement()).to.be.revertedWith("Agreement is not in draft state");
    });

    it("no permite aceptar dos veces", async function () {
      const f = await loadFixture(baseFixture);
      const a = await create(f);
      await a.agreement.connect(f.tenant).acceptAsTenant();
      await a.agreement.connect(f.arbiter).acceptAsArbiter();

      await expect(a.agreement.connect(f.tenant).acceptAsTenant()).to.be.revertedWith("Tenant already accepted");
      await expect(a.agreement.connect(f.arbiter).acceptAsArbiter()).to.be.revertedWith("Arbiter already accepted");
    });

    it("cada parte solo puede ejecutar su propia accion", async function () {
      const f = await loadFixture(baseFixture);
      const a = await create(f);

      await expect(a.agreement.connect(f.landlord).acceptAsTenant()).to.be.revertedWith("Only tenant can call this");
      await expect(a.agreement.connect(f.tenant).acceptAsArbiter()).to.be.revertedWith("Only arbiter can call this");
      await expect(a.agreement.connect(f.tenant).cancelAgreement()).to.be.revertedWith("Only landlord can call this");
      await expect(a.agreement.connect(f.other).updateDocumentHash("sha256:y")).to.be.revertedWith("Only landlord can call this");
    });
  });

  describe("doble ejecucion sobre los fondos", function () {
    it("despues de devolver la garantia no se puede mover de nuevo", async function () {
      const f = await loadFixture(fundedFixture);
      await f.escrow.connect(f.landlord).returnToTenant();

      await expect(f.escrow.connect(f.landlord).returnToTenant()).to.be.revertedWith("Escrow already released");
      await expect(f.escrow.connect(f.tenant).approveReleaseToLandlord()).to.be.revertedWith("Escrow already released");
      await expect(f.escrow.connect(f.landlord).releaseToLandlord()).to.be.revertedWith("Escrow already released");
      await expect(f.escrow.connect(f.tenant).openDispute()).to.be.revertedWith("Escrow already released");
      await time.increaseTo(f.endDate + CLAIM_WINDOW);
      await expect(f.escrow.connect(f.tenant).claimAfterEnd()).to.be.revertedWith("Escrow already released");
    });

    it("no se puede autorizar el cobro dos veces ni cobrar dos veces", async function () {
      const f = await loadFixture(fundedFixture);
      await f.escrow.connect(f.tenant).approveReleaseToLandlord();
      await expect(f.escrow.connect(f.tenant).approveReleaseToLandlord()).to.be.revertedWith("Release already approved");

      await f.escrow.connect(f.landlord).releaseToLandlord();
      await expect(f.escrow.connect(f.landlord).releaseToLandlord()).to.be.revertedWith("Escrow already released");
    });

    it("no se puede abrir una segunda disputa", async function () {
      const f = await loadFixture(fundedFixture);
      await f.escrow.connect(f.tenant).openDispute();

      await expect(f.escrow.connect(f.landlord).openDispute()).to.be.revertedWith("Escrow is under dispute");
    });

    it("despues del timeout del arbitro, el arbitro ya no puede resolver", async function () {
      const f = await loadFixture(fundedFixture);
      await f.escrow.connect(f.tenant).openDispute();
      await time.increase(DISPUTE_TIMEOUT);
      await f.escrow.connect(f.tenant).claimAfterDisputeTimeout();

      await expect(f.escrow.connect(f.arbiter).resolveSplit(1n)).to.be.revertedWith("No active dispute");
      await expect(f.escrow.connect(f.tenant).claimAfterDisputeTimeout()).to.be.revertedWith("No active dispute");
    });

    it("el escrow queda en cero y las partes reciben exactamente el deposito", async function () {
      const f = await loadFixture(fundedFixture);
      const before = await f.token.balanceOf(f.tenant.address);
      await f.escrow.connect(f.tenant).openDispute();
      await f.escrow.connect(f.arbiter).resolveSplit(ethers.parseUnits("250", 18));

      expect(await f.escrow.contractBalance()).to.equal(0n);
      expect((await f.token.balanceOf(f.tenant.address)) - before).to.equal(ethers.parseUnits("750", 18));
      expect(await f.token.balanceOf(f.landlord.address)).to.equal(ethers.parseUnits("250", 18));
    });
  });

  describe("reentrancia", function () {
    it("marca los fondos como liberados antes de transferir y bloquea la reentrada", async function () {
      const f = await loadFixture(baseFixture);
      const obs = await (await ethers.getContractFactory("ObservingToken")).deploy();
      await obs.mint(f.tenant.address, f.amount);
      const a = await create(f, await obs.getAddress());
      await fund(f, a, obs);
      await obs.watch(await a.escrow.getAddress());

      await a.escrow.connect(f.landlord).returnToTenant();

      expect(await obs.reentryAttempted()).to.equal(true);
      expect(await obs.sawReleasedBeforeTransfer()).to.equal(true);
      expect(await obs.reentryBlocked()).to.equal(true);
      expect(await obs.balanceOf(f.tenant.address)).to.equal(f.amount);
    });
  });

  describe("fallos de transaccion", function () {
    it("el deposito falla sin allowance y no cambia el estado", async function () {
      const f = await loadFixture(baseFixture);
      const a = await create(f);
      await activate(f, a);

      await expect(a.escrow.connect(f.tenant).deposit()).to.be.reverted;
      expect(await a.escrow.isDeposited()).to.equal(false);
    });

    it("el deposito falla sin saldo suficiente y no cambia el estado", async function () {
      const f = await loadFixture(baseFixture);
      const a = await create(f);
      await activate(f, a);
      const poor = f.other;
      await f.token.connect(f.tenant).transfer(poor.address, 1n);
      // el tenant transfiere todo su saldo para quedar sin fondos
      await f.token.connect(f.tenant).transfer(poor.address, await f.token.balanceOf(f.tenant.address));
      await f.token.connect(f.tenant).approve(await a.escrow.getAddress(), f.amount);

      await expect(a.escrow.connect(f.tenant).deposit()).to.be.reverted;
      expect(await a.escrow.isDeposited()).to.equal(false);
    });
  });
});
