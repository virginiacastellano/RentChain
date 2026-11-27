const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("RentChainFactory", function () {
  async function deployFixture() {
    const [owner, landlord, tenant, arbiter, other] = await ethers.getSigners();

    const token = await (await ethers.getContractFactory("MockUSDT")).deploy();
    const factory = await (await ethers.getContractFactory("RentChainFactory")).deploy();
    const depositAmount = ethers.parseUnits("1000", 18);
    await token.mint(tenant.address, depositAmount);

    const now = await time.latest();

    const tx = await factory
      .connect(landlord)
      .createAgreement(
        await token.getAddress(),
        tenant.address,
        arbiter.address,
        depositAmount,
        "ipfs://rentchain-contract-v1",
        now + 86400,
        now + 365 * 86400
      );
    await tx.wait();

    const record = await factory.getAgreement(0);
    const agreement = await ethers.getContractAt("RentContract", record.agreement);
    const escrow = await ethers.getContractAt("RentEscrow", record.escrow);

    return { token, factory, agreement, escrow, owner, landlord, tenant, arbiter, other, depositAmount };
  }

  it("crea el acuerdo y el escrow vinculados, con quien llama como landlord", async function () {
    const { agreement, escrow, landlord, tenant, arbiter } = await loadFixture(deployFixture);

    expect(await agreement.landlord()).to.equal(landlord.address);
    expect(await agreement.tenant()).to.equal(tenant.address);
    expect(await agreement.arbiter()).to.equal(arbiter.address);
    expect(await agreement.escrowAddress()).to.equal(await escrow.getAddress());
    expect(await escrow.agreement()).to.equal(await agreement.getAddress());
    expect(await escrow.landlord()).to.equal(landlord.address);
  });

  it("indexa el acuerdo para landlord, tenant y arbiter", async function () {
    const { factory, agreement, landlord, tenant, arbiter, other } = await loadFixture(deployFixture);

    for (const who of [landlord, tenant, arbiter]) {
      const list = await factory.getAgreementsOf(who.address);
      expect(list.length).to.equal(1);
      expect(list[0].agreement).to.equal(await agreement.getAddress());
    }
    expect((await factory.getAgreementsOf(other.address)).length).to.equal(0);
    expect(await factory.totalAgreements()).to.equal(1n);
  });

  it("permite recorrer el flujo completo de punta a punta", async function () {
    const { token, agreement, escrow, landlord, tenant, arbiter, depositAmount } =
      await loadFixture(deployFixture);

    await agreement.connect(tenant).acceptAsTenant();
    await agreement.connect(arbiter).acceptAsArbiter();
    await agreement.connect(landlord).activateAgreement();

    await token.connect(tenant).approve(await escrow.getAddress(), depositAmount);
    await escrow.connect(tenant).deposit();
    await escrow.connect(landlord).returnToTenant();

    expect(await token.balanceOf(tenant.address)).to.equal(depositAmount);
  });

  it("nadie puede re-vincular el escrow creado por la factory", async function () {
    const { escrow, landlord, other } = await loadFixture(deployFixture);

    await expect(escrow.connect(landlord).linkAgreement(other.address)).to.be.revertedWith(
      "Only deployer can link"
    );
  });
});
