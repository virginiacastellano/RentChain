const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MockUSDT", function () {
  async function deployMockUSDT() {
    // Hardhat crea cuentas de prueba automaticamente.
    const [owner, user1, user2] = await ethers.getSigners();

    // Preparamos la factory del contrato.
    const MockUSDT = await ethers.getContractFactory("MockUSDT");

    // Desplegamos el contrato.
    const token = await MockUSDT.deploy();

    return { token, owner, user1, user2 };
  }

  it("debe asignar el supply inicial al deployer", async function () {
    const { token, owner } = await deployMockUSDT();

    const ownerBalance = await token.balanceOf(owner.address);
    const totalSupply = await token.totalSupply();

    expect(ownerBalance).to.equal(totalSupply);
  });

  it("debe permitir mintar tokens a otra cuenta", async function () {
    const { token, user1 } = await deployMockUSDT();

    const amount = ethers.parseUnits("1000", 18);

    await token.mint(user1.address, amount);

    const userBalance = await token.balanceOf(user1.address);

    expect(userBalance).to.equal(amount);
  });

  it("debe permitir transferir tokens entre cuentas", async function () {
    const { token, user1 } = await deployMockUSDT();

    const amount = ethers.parseUnits("250", 18);

    await token.transfer(user1.address, amount);

    const userBalance = await token.balanceOf(user1.address);

    expect(userBalance).to.equal(amount);
  });
});
