const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");

describe("Recoverable", function () {
  // We define a fixture to reuse the same setup in every test.
  async function deployRecoverableFixture() {
    const [owner, newOwner, guardian, otherAccount] = await ethers.getSigners();

    // Deploy the recovery condition contract with zero address for recoverable (will set later)
    const SimpleCondition = await ethers.getContractFactory("SimpleCondition");
    const recoveryCondition = await SimpleCondition.deploy(guardian.address, ethers.ZeroAddress);

    // Deploy the Recoverable contract
    const cooldownPeriod = 86400; // 1 day in seconds
    const Recoverable = await ethers.getContractFactory("Recoverable");
    const recoverable = await Recoverable.deploy(recoveryCondition.target, cooldownPeriod);

    // Set the recoverable contract address in the condition contract
    await recoveryCondition.connect(guardian).setRecoverableContract(recoverable.target);

    return {
      recoverable,
      recoveryCondition,
      cooldownPeriod,
      owner,
      newOwner,
      guardian,
      otherAccount
    };
  }

  describe("Deployment", function () {
    it("Should set the correct initial state", async function () {
      const { recoverable, recoveryCondition, cooldownPeriod, owner } = await loadFixture(deployRecoverableFixture);

      expect(await recoverable.owner()).to.equal(owner.address);
      expect(await recoverable.recoveryConditionContract()).to.equal(recoveryCondition.target);
      expect(await recoverable.cooldownPeriod()).to.equal(cooldownPeriod);
      expect(await recoverable.recoveryStatus()).to.equal(0); // RecoveryStatus.Inactive
      expect(await recoverable.pendingOwner()).to.equal(ethers.ZeroAddress);
    });

    it("Should set the correct lastRecoveryChange timestamp", async function () {
      const { recoverable } = await loadFixture(deployRecoverableFixture);
      
      const currentTime = await time.latest();
      const lastRecoveryChange = await recoverable.lastRecoveryChange();
      
      // Should be within 1 second of deployment time
      expect(lastRecoveryChange).to.be.closeTo(currentTime, 1);
    });
  });

  describe("Recovery Management", function () {
    describe("startRecovery", function () {
      it("Should start recovery when status is Inactive", async function () {
        const { recoverable, recoveryCondition, newOwner, guardian, cooldownPeriod } = await loadFixture(deployRecoverableFixture);

        // Wait for cooldown to pass
        await time.increase(cooldownPeriod + 1);

        // Guardian triggers recovery via condition contract
        await expect(recoveryCondition.connect(guardian).triggerRecovery(recoverable.target, newOwner.address))
          .to.emit(recoverable, "RecoveryStarted")
          .withArgs(newOwner.address);

        expect(await recoverable.recoveryStatus()).to.equal(1); // RecoveryStatus.Active
        expect(await recoverable.pendingOwner()).to.equal(newOwner.address);
      });

      it("Should start recovery when status is Cancelled", async function () {
        const { recoverable, recoveryCondition, newOwner, owner, guardian, cooldownPeriod } = await loadFixture(deployRecoverableFixture);

        // Wait for cooldown to pass
        await time.increase(cooldownPeriod + 1);

        // Start and cancel a recovery first
        await recoveryCondition.connect(guardian).triggerRecovery(recoverable.target, newOwner.address);
        await recoverable.connect(owner).cancelRecovery();

        // Reset the condition contract and wait for cooldown again
        await recoverable.connect(owner).resetRecovery();
        await time.increase(cooldownPeriod + 1);

        // Start a new recovery
        const anotherNewOwner = ethers.Wallet.createRandom();
        await expect(recoveryCondition.connect(guardian).triggerRecovery(recoverable.target, anotherNewOwner.address))
          .to.emit(recoverable, "RecoveryStarted")
          .withArgs(anotherNewOwner.address);

        expect(await recoverable.recoveryStatus()).to.equal(1); // RecoveryStatus.Active
        expect(await recoverable.pendingOwner()).to.equal(anotherNewOwner.address);
      });

      it("Should revert when recovery is already Active", async function () {
        const { recoverable, recoveryCondition, newOwner, guardian, cooldownPeriod } = await loadFixture(deployRecoverableFixture);

        // Wait for cooldown to pass
        await time.increase(cooldownPeriod + 1);

        await recoveryCondition.connect(guardian).triggerRecovery(recoverable.target, newOwner.address);

        await expect(recoveryCondition.connect(guardian).triggerRecovery(recoverable.target, newOwner.address))
          .to.be.revertedWith("Recovery already triggered");
      });

      it("Should revert when called by non-recovery-condition", async function () {
        const { recoverable, newOwner, otherAccount } = await loadFixture(deployRecoverableFixture);

        await expect(recoverable.connect(otherAccount).startRecovery(newOwner.address))
          .to.be.revertedWith("Only recovery condition can call this function");
      });
    });

    describe("cancelRecovery", function () {
      it("Should cancel active recovery", async function () {
        const { recoverable, recoveryCondition, newOwner, owner, guardian, cooldownPeriod } = await loadFixture(deployRecoverableFixture);

        // Wait for cooldown to pass
        await time.increase(cooldownPeriod + 1);

        await recoveryCondition.connect(guardian).triggerRecovery(recoverable.target, newOwner.address);

        await expect(recoverable.connect(owner).cancelRecovery())
          .to.emit(recoverable, "RecoveryCancelled");

        expect(await recoverable.recoveryStatus()).to.equal(3); // RecoveryStatus.Cancelled
      });

      it("Should revert when no recovery is active", async function () {
        const { recoverable, owner } = await loadFixture(deployRecoverableFixture);

        await expect(recoverable.connect(owner).cancelRecovery())
          .to.be.revertedWith("No active recovery");
      });

      it("Should revert when called by non-owner", async function () {
        const { recoverable, recoveryCondition, newOwner, owner, guardian, otherAccount, cooldownPeriod } = await loadFixture(deployRecoverableFixture);

        // Wait for cooldown to pass
        await time.increase(cooldownPeriod + 1);

        await recoveryCondition.connect(guardian).triggerRecovery(recoverable.target, newOwner.address);

        await expect(recoverable.connect(otherAccount).cancelRecovery())
          .to.be.revertedWithCustomError(recoverable, "OwnableUnauthorizedAccount");
      });
    });

    describe("finaliseRecovery", function () {
      it("Should finalise recovery when conditions are met", async function () {
        const { recoverable, recoveryCondition, newOwner, guardian, cooldownPeriod } = await loadFixture(deployRecoverableFixture);

        // Wait for cooldown to pass
        await time.increase(cooldownPeriod + 1);

        // Guardian triggers recovery (which also starts it)
        await recoveryCondition.connect(guardian).triggerRecovery(recoverable.target, newOwner.address);

        await expect(recoverable.connect(newOwner).finaliseRecovery())
          .to.emit(recoverable, "RecoveryFinalised")
          .withArgs(newOwner.address);

        expect(await recoverable.owner()).to.equal(newOwner.address);
        expect(await recoverable.recoveryStatus()).to.equal(0); // RecoveryStatus.Inactive
        expect(await recoverable.pendingOwner()).to.equal(ethers.ZeroAddress);
      });

      it("Should revert when recovery is not active", async function () {
        const { recoverable, newOwner } = await loadFixture(deployRecoverableFixture);

        await expect(recoverable.connect(newOwner).finaliseRecovery())
          .to.be.revertedWith("Recovery not active");
      });

      it("Should revert when called by non-pending owner", async function () {
        const { recoverable, recoveryCondition, newOwner, otherAccount, guardian, cooldownPeriod } = await loadFixture(deployRecoverableFixture);

        // Wait for cooldown to pass
        await time.increase(cooldownPeriod + 1);

        // Guardian triggers recovery
        await recoveryCondition.connect(guardian).triggerRecovery(recoverable.target, newOwner.address);

        await expect(recoverable.connect(otherAccount).finaliseRecovery())
          .to.be.revertedWith("Only pending owner can finalise");
      });

      it("Should revert when recovery condition is not met", async function () {
        const { recoverable, newOwner, owner, guardian, cooldownPeriod } = await loadFixture(deployRecoverableFixture);

        // Wait for cooldown to pass
        await time.increase(cooldownPeriod + 1);

        // Deploy a new mock condition that returns false for isRecoverable
        const MockRecoveryCondition = await ethers.getContractFactory("MockRecoveryCondition");
        const mockCondition = await MockRecoveryCondition.deploy(false);

        // Update the recovery condition
        await recoverable.connect(owner).updateRecoveryCondition(mockCondition.target);

        // Wait for cooldown again after updating condition
        await time.increase(cooldownPeriod + 1);

        // Use mock to trigger recovery (mock allows anyone to call)
        await mockCondition.triggerRecovery(recoverable.target, newOwner.address);

        await expect(recoverable.connect(newOwner).finaliseRecovery())
          .to.be.revertedWith("Recovery condition not met");
      });

      it("Should revert when isRecoverable returns false", async function () {
        const { recoverable, newOwner, owner, cooldownPeriod } = await loadFixture(deployRecoverableFixture);

        // Wait for cooldown to pass
        await time.increase(cooldownPeriod + 1);

        // Deploy mock condition that can start recovery but returns false for isRecoverable
        const MockRecoveryCondition = await ethers.getContractFactory("MockRecoveryCondition");
        const mockCondition = await MockRecoveryCondition.deploy(false);

        // Update the recovery condition to mock
        await recoverable.connect(owner).updateRecoveryCondition(mockCondition.target);

        // Wait for cooldown again
        await time.increase(cooldownPeriod + 1);

        // Mock triggers recovery (starts it)
        await mockCondition.triggerRecovery(recoverable.target, newOwner.address);

        // Should fail because mock's isRecoverable() returns false
        await expect(recoverable.connect(newOwner).finaliseRecovery())
          .to.be.revertedWith("Recovery condition not met");
      });
    });
  });

  describe("Recovery Condition Management", function () {
    describe("updateRecoveryCondition", function () {
      it("Should update recovery condition successfully", async function () {
        const { recoverable, owner, otherAccount, cooldownPeriod } = await loadFixture(deployRecoverableFixture);

        // Wait for cooldown to pass
        await time.increase(cooldownPeriod + 1);

        const MockRecoveryCondition = await ethers.getContractFactory("MockRecoveryCondition");
        const newCondition = await MockRecoveryCondition.deploy(true);

        await expect(recoverable.connect(owner).updateRecoveryCondition(newCondition.target))
          .to.emit(recoverable, "RecoveryConditionUpdated")
          .withArgs(newCondition.target, await recoverable.cooldownPeriod());

        expect(await recoverable.recoveryConditionContract()).to.equal(newCondition.target);
      });

      it("Should revert when called by non-owner", async function () {
        const { recoverable, otherAccount } = await loadFixture(deployRecoverableFixture);

        const MockRecoveryCondition = await ethers.getContractFactory("MockRecoveryCondition");
        const newCondition = await MockRecoveryCondition.deploy(true);

        await expect(recoverable.connect(otherAccount).updateRecoveryCondition(newCondition.target))
          .to.be.revertedWithCustomError(recoverable, "OwnableUnauthorizedAccount");
      });

      it("Should revert when cooldown has not passed", async function () {
        const { recoverable, owner } = await loadFixture(deployRecoverableFixture);

        const MockRecoveryCondition = await ethers.getContractFactory("MockRecoveryCondition");
        const newCondition = await MockRecoveryCondition.deploy(true);

        // Try to update immediately after deployment
        await expect(recoverable.connect(owner).updateRecoveryCondition(newCondition.target))
          .to.be.revertedWith("Cooldown not passed");
      });

      it("Should allow update after cooldown period", async function () {
        const { recoverable, owner, cooldownPeriod } = await loadFixture(deployRecoverableFixture);

        const MockRecoveryCondition = await ethers.getContractFactory("MockRecoveryCondition");
        const newCondition = await MockRecoveryCondition.deploy(true);

        // Wait for cooldown to pass
        await time.increase(cooldownPeriod + 1);

        await expect(recoverable.connect(owner).updateRecoveryCondition(newCondition.target))
          .to.emit(recoverable, "RecoveryConditionUpdated")
          .withArgs(newCondition.target, cooldownPeriod);

        expect(await recoverable.recoveryConditionContract()).to.equal(newCondition.target);
      });
    });
  });

  describe("Trigger Recovery Functionality", function () {
    describe("SimpleCondition triggerRecovery", function () {
      it("Should allow guardian to trigger recovery", async function () {
        const { recoveryCondition, guardian, recoverable, newOwner, cooldownPeriod } = await loadFixture(deployRecoverableFixture);

        // Wait for cooldown to pass
        await time.increase(cooldownPeriod + 1);

        await expect(recoveryCondition.connect(guardian).triggerRecovery(recoverable.target, newOwner.address))
          .to.emit(recoveryCondition, "RecoveryTriggered")
          .withArgs(recoverable.target, newOwner.address, guardian.address);

        expect(await recoveryCondition.recoveryTriggered()).to.be.true;
        expect(await recoveryCondition.isRecoverable()).to.be.true;
      });

      it("Should revert when non-guardian tries to trigger recovery", async function () {
        const { recoveryCondition, otherAccount, recoverable, newOwner, cooldownPeriod } = await loadFixture(deployRecoverableFixture);

        // Wait for cooldown to pass
        await time.increase(cooldownPeriod + 1);

        await expect(recoveryCondition.connect(otherAccount).triggerRecovery(recoverable.target, newOwner.address))
          .to.be.revertedWith("Only trusted guardian can call this function");

        expect(await recoveryCondition.recoveryTriggered()).to.be.false;
        expect(await recoveryCondition.isRecoverable()).to.be.false;
      });

      it("Should revert when recovery already triggered", async function () {
        const { recoveryCondition, guardian, recoverable, newOwner, cooldownPeriod } = await loadFixture(deployRecoverableFixture);

        // Wait for cooldown to pass
        await time.increase(cooldownPeriod + 1);

        // First trigger
        await recoveryCondition.connect(guardian).triggerRecovery(recoverable.target, newOwner.address);
        expect(await recoveryCondition.recoveryTriggered()).to.be.true;

        // Second trigger should revert
        await expect(recoveryCondition.connect(guardian).triggerRecovery(recoverable.target, newOwner.address))
          .to.be.revertedWith("Recovery already triggered");
      });

      it("Should allow recovery after reset", async function () {
        const { recoveryCondition, recoverable, guardian, newOwner, owner, cooldownPeriod } = await loadFixture(deployRecoverableFixture);

        // Wait for cooldown to pass
        await time.increase(cooldownPeriod + 1);

        // First trigger
        await recoveryCondition.connect(guardian).triggerRecovery(recoverable.target, newOwner.address);
        expect(await recoveryCondition.recoveryTriggered()).to.be.true;

        // Reset via owner (which calls condition's resetRecovery)
        await recoverable.connect(owner).resetRecovery();
        expect(await recoveryCondition.recoveryTriggered()).to.be.false;

        // Wait for cooldown again
        await time.increase(cooldownPeriod + 1);

        // Should be able to trigger again
        await expect(recoveryCondition.connect(guardian).triggerRecovery(recoverable.target, newOwner.address))
          .to.emit(recoveryCondition, "RecoveryTriggered");
      });
    });

    describe("MockRecoveryCondition triggerRecovery", function () {
      it("Should allow anyone to trigger recovery on a recoverable contract", async function () {
        const [owner, newOwner, otherAccount] = await ethers.getSigners();

        // Deploy mock condition that returns false for isRecoverable
        const MockRecoveryCondition = await ethers.getContractFactory("MockRecoveryCondition");
        const mockCondition = await MockRecoveryCondition.deploy(false);

        // Deploy a recoverable contract with the mock as its condition
        const cooldownPeriod = 86400;
        const Recoverable = await ethers.getContractFactory("Recoverable");
        const recoverable = await Recoverable.deploy(mockCondition.target, cooldownPeriod);

        // Wait for cooldown
        await time.increase(cooldownPeriod + 1);

        // Initially should return false
        expect(await mockCondition.isRecoverable()).to.be.false;

        // Anyone can trigger recovery via mock (no guardian restriction)
        await mockCondition.connect(otherAccount).triggerRecovery(recoverable.target, newOwner.address);

        // Recovery should be started on recoverable
        expect(await recoverable.recoveryStatus()).to.equal(1); // Active
        expect(await recoverable.pendingOwner()).to.equal(newOwner.address);
      });

      it("Should work with setShouldReturn function", async function () {
        const [owner, newOwner] = await ethers.getSigners();

        // Deploy mock condition
        const MockRecoveryCondition = await ethers.getContractFactory("MockRecoveryCondition");
        const mockCondition = await MockRecoveryCondition.deploy(false);

        // Deploy a recoverable contract with the mock as its condition
        const cooldownPeriod = 86400;
        const Recoverable = await ethers.getContractFactory("Recoverable");
        const recoverable = await Recoverable.deploy(mockCondition.target, cooldownPeriod);

        // Wait for cooldown
        await time.increase(cooldownPeriod + 1);

        // Initially should return false
        expect(await mockCondition.isRecoverable()).to.be.false;

        // Set shouldReturn to true
        await mockCondition.setShouldReturn(true);
        expect(await mockCondition.isRecoverable()).to.be.true;

        // Trigger recovery
        await mockCondition.triggerRecovery(recoverable.target, newOwner.address);

        // isRecoverable should still return true (controlled by setShouldReturn, not by trigger)
        expect(await mockCondition.isRecoverable()).to.be.true;
      });
    });

    describe("Integration with Recoverable contract", function () {
      it("Should complete full recovery flow (2-step)", async function () {
        const { recoverable, recoveryCondition, newOwner, guardian, cooldownPeriod } = await loadFixture(deployRecoverableFixture);

        // Wait for cooldown to pass
        await time.increase(cooldownPeriod + 1);

        // 1. Guardian triggers recovery (which also starts it via condition contract)
        await recoveryCondition.connect(guardian).triggerRecovery(recoverable.target, newOwner.address);

        // 2. New owner finalises recovery
        await expect(recoverable.connect(newOwner).finaliseRecovery())
          .to.emit(recoverable, "RecoveryFinalised")
          .withArgs(newOwner.address);

        expect(await recoverable.owner()).to.equal(newOwner.address);
        // Verify condition was reset
        expect(await recoveryCondition.recoveryTriggered()).to.be.false;
      });

      it("Should fail recovery when non-condition tries to start", async function () {
        const { recoverable, newOwner, owner } = await loadFixture(deployRecoverableFixture);

        // Owner tries to start recovery directly (should fail with new flow)
        await expect(recoverable.connect(owner).startRecovery(newOwner.address))
          .to.be.revertedWith("Only recovery condition can call this function");
      });

      it("Should work with updated recovery condition (mock)", async function () {
        const { recoverable, newOwner, owner, cooldownPeriod } = await loadFixture(deployRecoverableFixture);

        // Wait for cooldown to pass
        await time.increase(cooldownPeriod + 1);

        // Deploy new mock condition that returns true and actually calls startRecovery
        const MockRecoveryCondition = await ethers.getContractFactory("MockRecoveryCondition");
        const mockCondition = await MockRecoveryCondition.deploy(true);

        // Update recovery condition
        await recoverable.connect(owner).updateRecoveryCondition(mockCondition.target);

        // Wait for cooldown again
        await time.increase(cooldownPeriod + 1);

        // Mock trigger (which doesn't actually call startRecovery, so we need to call it directly)
        // Since mock is now the recovery condition, it can call startRecovery
        await mockCondition.triggerRecovery(recoverable.target, newOwner.address);

        // Finalise recovery (should work since mock condition returns true)
        await expect(recoverable.connect(newOwner).finaliseRecovery())
          .to.emit(recoverable, "RecoveryFinalised")
          .withArgs(newOwner.address);

        expect(await recoverable.owner()).to.equal(newOwner.address);
      });
    });
  });

  describe("Cooldown Management", function () {
    it("Should update lastRecoveryChange after successful recovery", async function () {
      const { recoverable, recoveryCondition, newOwner, guardian, cooldownPeriod } = await loadFixture(deployRecoverableFixture);

      const initialChange = await recoverable.lastRecoveryChange();

      // Wait for cooldown to pass
      await time.increase(cooldownPeriod + 1);

      // Guardian triggers recovery (which also starts it)
      await recoveryCondition.connect(guardian).triggerRecovery(recoverable.target, newOwner.address);
      await recoverable.connect(newOwner).finaliseRecovery();

      const finalChange = await recoverable.lastRecoveryChange();
      expect(finalChange).to.be.gt(initialChange);
    });

    it("Should update lastRecoveryChange after condition update", async function () {
      const { recoverable, owner, cooldownPeriod } = await loadFixture(deployRecoverableFixture);

      const initialChange = await recoverable.lastRecoveryChange();

      // Wait for cooldown to pass
      await time.increase(cooldownPeriod + 1);

      const MockRecoveryCondition = await ethers.getContractFactory("MockRecoveryCondition");
      const newCondition = await MockRecoveryCondition.deploy(true);

      await recoverable.connect(owner).updateRecoveryCondition(newCondition.target);

      const finalChange = await recoverable.lastRecoveryChange();
      expect(finalChange).to.be.gt(initialChange);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle zero address as new owner", async function () {
      const { recoverable, recoveryCondition, guardian, cooldownPeriod } = await loadFixture(deployRecoverableFixture);

      // Wait for cooldown to pass
      await time.increase(cooldownPeriod + 1);

      // Guardian triggers recovery with zero address
      await expect(recoveryCondition.connect(guardian).triggerRecovery(recoverable.target, ethers.ZeroAddress))
        .to.emit(recoverable, "RecoveryStarted")
        .withArgs(ethers.ZeroAddress);

      expect(await recoverable.pendingOwner()).to.equal(ethers.ZeroAddress);
    });

    it("Should handle recovery with same owner address", async function () {
      const { recoverable, recoveryCondition, owner, guardian, cooldownPeriod } = await loadFixture(deployRecoverableFixture);

      // Wait for cooldown to pass
      await time.increase(cooldownPeriod + 1);

      // Guardian triggers recovery with current owner as new owner
      await expect(recoveryCondition.connect(guardian).triggerRecovery(recoverable.target, owner.address))
        .to.emit(recoverable, "RecoveryStarted")
        .withArgs(owner.address);

      expect(await recoverable.pendingOwner()).to.equal(owner.address);
    });

    it("Should handle multiple recovery cycles", async function () {
      const { recoverable, recoveryCondition, newOwner, owner, guardian, cooldownPeriod } = await loadFixture(deployRecoverableFixture);

      // Wait for cooldown to pass
      await time.increase(cooldownPeriod + 1);

      // First recovery cycle
      await recoveryCondition.connect(guardian).triggerRecovery(recoverable.target, newOwner.address);
      await recoverable.connect(newOwner).finaliseRecovery();

      // Wait for cooldown to pass before starting second recovery
      await time.increase(cooldownPeriod + 1);

      // Second recovery cycle (newOwner is now owner, transferring back to original owner)
      await recoveryCondition.connect(guardian).triggerRecovery(recoverable.target, owner.address);
      await recoverable.connect(owner).finaliseRecovery();

      expect(await recoverable.owner()).to.equal(owner.address);
      expect(await recoverable.recoveryStatus()).to.equal(0); // RecoveryStatus.Inactive
    });
  });

  describe("Events", function () {
    it("Should emit RecoveryStarted event with correct parameters", async function () {
      const { recoverable, recoveryCondition, newOwner, guardian, cooldownPeriod } = await loadFixture(deployRecoverableFixture);

      // Wait for cooldown to pass
      await time.increase(cooldownPeriod + 1);

      await expect(recoveryCondition.connect(guardian).triggerRecovery(recoverable.target, newOwner.address))
        .to.emit(recoverable, "RecoveryStarted")
        .withArgs(newOwner.address);
    });

    it("Should emit RecoveryCancelled event", async function () {
      const { recoverable, recoveryCondition, newOwner, owner, guardian, cooldownPeriod } = await loadFixture(deployRecoverableFixture);

      // Wait for cooldown to pass
      await time.increase(cooldownPeriod + 1);

      await recoveryCondition.connect(guardian).triggerRecovery(recoverable.target, newOwner.address);

      await expect(recoverable.connect(owner).cancelRecovery())
        .to.emit(recoverable, "RecoveryCancelled");
    });

    it("Should emit RecoveryFinalised event with correct parameters", async function () {
      const { recoverable, recoveryCondition, newOwner, guardian, cooldownPeriod } = await loadFixture(deployRecoverableFixture);

      // Wait for cooldown to pass
      await time.increase(cooldownPeriod + 1);

      // Guardian triggers recovery (which starts it)
      await recoveryCondition.connect(guardian).triggerRecovery(recoverable.target, newOwner.address);

      await expect(recoverable.connect(newOwner).finaliseRecovery())
        .to.emit(recoverable, "RecoveryFinalised")
        .withArgs(newOwner.address);
    });

    it("Should emit RecoveryConditionUpdated event with correct parameters", async function () {
      const { recoverable, owner, cooldownPeriod } = await loadFixture(deployRecoverableFixture);

      // Wait for cooldown to pass
      await time.increase(cooldownPeriod + 1);

      const MockRecoveryCondition = await ethers.getContractFactory("MockRecoveryCondition");
      const newCondition = await MockRecoveryCondition.deploy(true);

      await expect(recoverable.connect(owner).updateRecoveryCondition(newCondition.target))
        .to.emit(recoverable, "RecoveryConditionUpdated")
        .withArgs(newCondition.target, cooldownPeriod);
    });

    it("Should emit RecoveryTriggered event from SimpleCondition", async function () {
      const { recoveryCondition, guardian, recoverable, newOwner, cooldownPeriod } = await loadFixture(deployRecoverableFixture);

      // Wait for cooldown to pass
      await time.increase(cooldownPeriod + 1);

      await expect(recoveryCondition.connect(guardian).triggerRecovery(recoverable.target, newOwner.address))
        .to.emit(recoveryCondition, "RecoveryTriggered")
        .withArgs(recoverable.target, newOwner.address, guardian.address);
    });
  });
});

// Mock contract for testing recovery conditions
describe("MockRecoveryCondition", function () {
  let mockCondition;
  let recoverable;
  let result;
  const cooldownPeriod = 86400;

  beforeEach(async function () {
    const MockRecoveryCondition = await ethers.getContractFactory("MockRecoveryCondition");
    mockCondition = await MockRecoveryCondition.deploy(true);

    // Deploy a recoverable contract for testing triggerRecovery
    const Recoverable = await ethers.getContractFactory("Recoverable");
    recoverable = await Recoverable.deploy(mockCondition.target, cooldownPeriod);

    result = true;
  });

  it("Should return the configured result", async function () {
    expect(await mockCondition.isRecoverable()).to.equal(result);
  });

  it("Should allow triggerRecovery call with valid recoverable contract", async function () {
    const [owner, newOwner] = await ethers.getSigners();

    // Wait for cooldown
    await time.increase(cooldownPeriod + 1);

    // triggerRecovery should not throw an error when calling a valid contract
    await expect(mockCondition.triggerRecovery(recoverable.target, newOwner.address)).to.not.be.reverted;
  });

  it("Should allow setShouldReturn to change behavior", async function () {
    // Initially should return true
    expect(await mockCondition.isRecoverable()).to.be.true;

    // Change to false
    await mockCondition.setShouldReturn(false);
    expect(await mockCondition.isRecoverable()).to.be.false;

    // Change back to true
    await mockCondition.setShouldReturn(true);
    expect(await mockCondition.isRecoverable()).to.be.true;
  });
}); 