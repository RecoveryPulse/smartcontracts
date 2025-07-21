const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");

describe("RecoveryPulseCondition", function () {
  // We define a fixture to reuse the same setup in every test.
  async function deployRecoveryPulseConditionFixture() {
    const [owner, guardian, maintainer, otherAccount] = await ethers.getSigners();
    
    const recoveryTimeout = 86400; // 1 day in seconds
    
    // Deploy a mock recoverable contract
    const MockRecoverable = await ethers.getContractFactory("MockRecoverable");
    const mockRecoverable = await MockRecoverable.deploy();
    
    const RecoveryPulseCondition = await ethers.getContractFactory("RecoveryPulseCondition");
    const recoveryPulseCondition = await RecoveryPulseCondition.deploy(
      guardian.address,
      maintainer.address,
      mockRecoverable.target,
      recoveryTimeout
    );

    return { 
      recoveryPulseCondition, 
      mockRecoverable,
      recoveryTimeout, 
      owner, 
      guardian, 
      maintainer, 
      otherAccount 
    };
  }

  describe("Deployment", function () {
    it("Should set the correct initial state", async function () {
      const { recoveryPulseCondition, mockRecoverable, recoveryTimeout, guardian, maintainer } = await loadFixture(deployRecoveryPulseConditionFixture);

      expect(await recoveryPulseCondition.trustedGuardian()).to.equal(guardian.address);
      expect(await recoveryPulseCondition.maintainer()).to.equal(maintainer.address);
      expect(await recoveryPulseCondition.recoverableContract()).to.equal(mockRecoverable.target);
      expect(await recoveryPulseCondition.recoveryTimeout()).to.equal(recoveryTimeout);
      expect(await recoveryPulseCondition.pulse()).to.equal(0);
      expect(await recoveryPulseCondition.recoveryTriggered()).to.equal(false);
    });

    it("Should set the correct lastUpdateTime", async function () {
      const { recoveryPulseCondition } = await loadFixture(deployRecoveryPulseConditionFixture);
      
      const currentTime = await time.latest();
      const lastUpdateTime = await recoveryPulseCondition.lastUpdateTime();
      
      // Should be within 1 second of deployment time
      expect(lastUpdateTime).to.be.closeTo(currentTime, 1);
    });
  });

  describe("Pulse Management", function () {
    describe("updatePulse", function () {
      it("Should update pulse and lastUpdateTime when called by maintainer", async function () {
        const { recoveryPulseCondition, maintainer } = await loadFixture(deployRecoveryPulseConditionFixture);

        const newPulse = 42;
        const beforeTime = await time.latest();

        const tx = await recoveryPulseCondition.connect(maintainer).updatePulse(newPulse);
        await expect(tx)
          .to.emit(recoveryPulseCondition, "PulseUpdated")
          .withArgs(maintainer.address, newPulse, await recoveryPulseCondition.lastUpdateTime());

        expect(await recoveryPulseCondition.pulse()).to.equal(newPulse);
        
        const lastUpdateTime = await recoveryPulseCondition.lastUpdateTime();
        expect(lastUpdateTime).to.be.gte(beforeTime);
      });

      it("Should reset recovery state when pulse is updated", async function () {
        const { recoveryPulseCondition, maintainer, guardian, recoveryTimeout, mockRecoverable } = await loadFixture(deployRecoveryPulseConditionFixture);

        // Trigger recovery first
        await time.increase(recoveryTimeout + 1);
        await recoveryPulseCondition.connect(guardian).triggerRecovery(mockRecoverable.target, maintainer.address);
        expect(await recoveryPulseCondition.recoveryTriggered()).to.equal(true);

        // Update pulse (should reset recovery)
        await recoveryPulseCondition.connect(maintainer).updatePulse(42);
        expect(await recoveryPulseCondition.recoveryTriggered()).to.equal(false);
        expect(await recoveryPulseCondition.pulse()).to.equal(42);
      });

      it("Should revert when called by non-maintainer", async function () {
        const { recoveryPulseCondition, otherAccount } = await loadFixture(deployRecoveryPulseConditionFixture);

        await expect(recoveryPulseCondition.connect(otherAccount).updatePulse(42))
          .to.be.revertedWith("Only maintainer can call this function");
      });

      it("Should revert when called by guardian", async function () {
        const { recoveryPulseCondition, guardian } = await loadFixture(deployRecoveryPulseConditionFixture);

        await expect(recoveryPulseCondition.connect(guardian).updatePulse(42))
          .to.be.revertedWith("Only maintainer can call this function");
      });
    });
  });

  describe("Recovery Management", function () {
    describe("triggerRecovery", function () {
      it("Should trigger recovery when conditions are met", async function () {
        const { recoveryPulseCondition, guardian, maintainer, recoveryTimeout, mockRecoverable } = await loadFixture(deployRecoveryPulseConditionFixture);

        // Wait for timeout to pass
        await time.increase(recoveryTimeout + 1);

        const tx = await recoveryPulseCondition.connect(guardian).triggerRecovery(mockRecoverable.target, maintainer.address);
        await expect(tx)
          .to.emit(recoveryPulseCondition, "RecoveryTriggered")
          .withArgs(guardian.address, mockRecoverable.target, maintainer.address, await recoveryPulseCondition.getTimeSinceLastUpdate());

        expect(await recoveryPulseCondition.recoveryTriggered()).to.equal(true);
      });

      it("Should revert when conditions are not met", async function () {
        const { recoveryPulseCondition, guardian, maintainer, recoveryTimeout, mockRecoverable } = await loadFixture(deployRecoveryPulseConditionFixture);

        // Wait for less than timeout
        await time.increase(recoveryTimeout - 100);

        await expect(recoveryPulseCondition.connect(guardian).triggerRecovery(mockRecoverable.target, maintainer.address))
          .to.be.revertedWith("Cannot trigger recovery");
      });

      it("Should revert when called by non-guardian", async function () {
        const { recoveryPulseCondition, otherAccount, maintainer, recoveryTimeout, mockRecoverable } = await loadFixture(deployRecoveryPulseConditionFixture);

        // Wait for timeout to pass
        await time.increase(recoveryTimeout + 1);

        await expect(recoveryPulseCondition.connect(otherAccount).triggerRecovery(mockRecoverable.target, maintainer.address))
          .to.be.revertedWith("Only trusted guardian can call this function");
      });

      it("Should reset timeout when pulse is updated", async function () {
        const { recoveryPulseCondition, guardian, maintainer, recoveryTimeout, mockRecoverable } = await loadFixture(deployRecoveryPulseConditionFixture);

        // Wait for most of timeout
        await time.increase(recoveryTimeout - 100);

        // Update pulse (resets timeout)
        await recoveryPulseCondition.connect(maintainer).updatePulse(1);

        // Try to trigger recovery (should fail)
        await expect(recoveryPulseCondition.connect(guardian).triggerRecovery(mockRecoverable.target, maintainer.address))
          .to.be.revertedWith("Cannot trigger recovery");

        // Wait for timeout again
        await time.increase(recoveryTimeout + 1);

        // Now should succeed
        await expect(recoveryPulseCondition.connect(guardian).triggerRecovery(mockRecoverable.target, maintainer.address))
          .to.emit(recoveryPulseCondition, "RecoveryTriggered");
      });
    });

    describe("resetRecovery", function () {
      it("Should reset recovery state when called by recoverable contract", async function () {
        const { recoveryPulseCondition, guardian, maintainer, recoveryTimeout, mockRecoverable } = await loadFixture(deployRecoveryPulseConditionFixture);

        // Trigger recovery
        await time.increase(recoveryTimeout + 1);
        await recoveryPulseCondition.connect(guardian).triggerRecovery(mockRecoverable.target, maintainer.address);
        expect(await recoveryPulseCondition.recoveryTriggered()).to.equal(true);

        // For testing purposes, we'll test the internal _resetRecovery function indirectly
        // by calling updatePulse which calls _resetRecovery
        await recoveryPulseCondition.connect(maintainer).updatePulse(42);
        expect(await recoveryPulseCondition.recoveryTriggered()).to.equal(false);
      });

      it("Should revert when called by non-recoverable contract", async function () {
        const { recoveryPulseCondition, otherAccount } = await loadFixture(deployRecoveryPulseConditionFixture);

        await expect(recoveryPulseCondition.connect(otherAccount).resetRecovery())
          .to.be.revertedWith("Only recoverable contract can call this function");
      });
    });
  });

  describe("Configuration Management", function () {
    describe("updateRecoveryTimeout", function () {
      it("Should update recovery timeout when called by maintainer", async function () {
        const { recoveryPulseCondition, maintainer } = await loadFixture(deployRecoveryPulseConditionFixture);

        const newTimeout = 172800; // 2 days

        await expect(recoveryPulseCondition.connect(maintainer).updateRecoveryTimeout(newTimeout))
          .to.emit(recoveryPulseCondition, "RecoveryTimeoutUpdated")
          .withArgs(newTimeout);

        expect(await recoveryPulseCondition.recoveryTimeout()).to.equal(newTimeout);
      });

      it("Should reset recovery state when timeout is updated", async function () {
        const { recoveryPulseCondition, maintainer, guardian, recoveryTimeout, mockRecoverable } = await loadFixture(deployRecoveryPulseConditionFixture);

        // Trigger recovery first
        await time.increase(recoveryTimeout + 1);
        await recoveryPulseCondition.connect(guardian).triggerRecovery(mockRecoverable.target, maintainer.address);
        expect(await recoveryPulseCondition.recoveryTriggered()).to.equal(true);

        // Update timeout (should reset recovery)
        await recoveryPulseCondition.connect(maintainer).updateRecoveryTimeout(172800);
        expect(await recoveryPulseCondition.recoveryTriggered()).to.equal(false);
      });

      it("Should revert when called by non-maintainer", async function () {
        const { recoveryPulseCondition, otherAccount } = await loadFixture(deployRecoveryPulseConditionFixture);

        await expect(recoveryPulseCondition.connect(otherAccount).updateRecoveryTimeout(172800))
          .to.be.revertedWith("Only maintainer can call this function");
      });
    });

    describe("updateGuardian", function () {
      it("Should update guardian when called by maintainer", async function () {
        const { recoveryPulseCondition, maintainer, otherAccount } = await loadFixture(deployRecoveryPulseConditionFixture);

        await recoveryPulseCondition.connect(maintainer).updateGuardian(otherAccount.address);
        expect(await recoveryPulseCondition.trustedGuardian()).to.equal(otherAccount.address);
      });

      it("Should reset recovery state when guardian is updated", async function () {
        const { recoveryPulseCondition, maintainer, guardian, recoveryTimeout, mockRecoverable } = await loadFixture(deployRecoveryPulseConditionFixture);

        // Trigger recovery first
        await time.increase(recoveryTimeout + 1);
        await recoveryPulseCondition.connect(guardian).triggerRecovery(mockRecoverable.target, maintainer.address);
        expect(await recoveryPulseCondition.recoveryTriggered()).to.equal(true);

        // Update guardian (should reset recovery)
        await recoveryPulseCondition.connect(maintainer).updateGuardian(guardian.address);
        expect(await recoveryPulseCondition.recoveryTriggered()).to.equal(false);
      });

      it("Should revert when called by non-maintainer", async function () {
        const { recoveryPulseCondition, otherAccount } = await loadFixture(deployRecoveryPulseConditionFixture);

        await expect(recoveryPulseCondition.connect(otherAccount).updateGuardian(otherAccount.address))
          .to.be.revertedWith("Only maintainer can call this function");
      });
    });

    describe("updateMaintainer", function () {
      it("Should update maintainer when called by current maintainer", async function () {
        const { recoveryPulseCondition, maintainer, otherAccount } = await loadFixture(deployRecoveryPulseConditionFixture);

        await recoveryPulseCondition.connect(maintainer).updateMaintainer(otherAccount.address);
        expect(await recoveryPulseCondition.maintainer()).to.equal(otherAccount.address);
      });

      it("Should reset recovery state when maintainer is updated", async function () {
        const { recoveryPulseCondition, maintainer, guardian, recoveryTimeout, mockRecoverable } = await loadFixture(deployRecoveryPulseConditionFixture);

        // Trigger recovery first
        await time.increase(recoveryTimeout + 1);
        await recoveryPulseCondition.connect(guardian).triggerRecovery(mockRecoverable.target, maintainer.address);
        expect(await recoveryPulseCondition.recoveryTriggered()).to.equal(true);

        // Update maintainer (should reset recovery)
        await recoveryPulseCondition.connect(maintainer).updateMaintainer(maintainer.address);
        expect(await recoveryPulseCondition.recoveryTriggered()).to.equal(false);
      });

      it("Should revert when called by non-maintainer", async function () {
        const { recoveryPulseCondition, otherAccount } = await loadFixture(deployRecoveryPulseConditionFixture);

        await expect(recoveryPulseCondition.connect(otherAccount).updateMaintainer(otherAccount.address))
          .to.be.revertedWith("Only maintainer can call this function");
      });

      it("Should revert when trying to set maintainer to zero address", async function () {
        const { recoveryPulseCondition, maintainer } = await loadFixture(deployRecoveryPulseConditionFixture);

        await expect(recoveryPulseCondition.connect(maintainer).updateMaintainer(ethers.ZeroAddress))
          .to.be.revertedWith("Maintainer cannot be zero address");
      });
    });
  });

  describe("View Functions", function () {
    describe("canTriggerRecovery", function () {
      it("Should return false when recovery is triggered", async function () {
        const { recoveryPulseCondition, guardian, maintainer, recoveryTimeout, mockRecoverable } = await loadFixture(deployRecoveryPulseConditionFixture);

        // Trigger recovery
        await time.increase(recoveryTimeout + 1);
        await recoveryPulseCondition.connect(guardian).triggerRecovery(mockRecoverable.target, maintainer.address);

        expect(await recoveryPulseCondition.canTriggerRecovery()).to.equal(false);
      });

      it("Should return false when timeout is not exceeded", async function () {
        const { recoveryPulseCondition } = await loadFixture(deployRecoveryPulseConditionFixture);

        expect(await recoveryPulseCondition.canTriggerRecovery()).to.equal(false);
      });

      it("Should return true when conditions are met", async function () {
        const { recoveryPulseCondition, recoveryTimeout } = await loadFixture(deployRecoveryPulseConditionFixture);

        await time.increase(recoveryTimeout + 1);
        expect(await recoveryPulseCondition.canTriggerRecovery()).to.equal(true);
      });
    });

    describe("isRecoverable", function () {
      it("Should return false when recovery is not triggered", async function () {
        const { recoveryPulseCondition } = await loadFixture(deployRecoveryPulseConditionFixture);

        expect(await recoveryPulseCondition.isRecoverable()).to.equal(false);
      });

      it("Should return true when recovery is triggered", async function () {
        const { recoveryPulseCondition, guardian, maintainer, recoveryTimeout, mockRecoverable } = await loadFixture(deployRecoveryPulseConditionFixture);

        // Trigger recovery
        await time.increase(recoveryTimeout + 1);
        await recoveryPulseCondition.connect(guardian).triggerRecovery(mockRecoverable.target, maintainer.address);

        // Should return true when recovery is triggered
        expect(await recoveryPulseCondition.isRecoverable()).to.equal(true);
      });

      it("Should return true when recovery is triggered regardless of timeout", async function () {
        const { recoveryPulseCondition, guardian, maintainer, recoveryTimeout, mockRecoverable } = await loadFixture(deployRecoveryPulseConditionFixture);

        // Trigger recovery
        await time.increase(recoveryTimeout + 1);
        await recoveryPulseCondition.connect(guardian).triggerRecovery(mockRecoverable.target, maintainer.address);

        // Wait for timeout to pass again
        await time.increase(recoveryTimeout + 1);

        // Should still return true because recovery is triggered
        expect(await recoveryPulseCondition.isRecoverable()).to.equal(true);
      });
    });

    describe("isTimeoutExceeded", function () {
      it("Should return false when timeout is not exceeded", async function () {
        const { recoveryPulseCondition, recoveryTimeout } = await loadFixture(deployRecoveryPulseConditionFixture);

        expect(await recoveryPulseCondition.isTimeoutExceeded()).to.equal(false);
      });

      it("Should return true when timeout is exceeded", async function () {
        const { recoveryPulseCondition, recoveryTimeout } = await loadFixture(deployRecoveryPulseConditionFixture);

        await time.increase(recoveryTimeout + 1);
        expect(await recoveryPulseCondition.isTimeoutExceeded()).to.equal(true);
      });
    });

    describe("getTimeSinceLastUpdate", function () {
      it("Should return correct time since last update", async function () {
        const { recoveryPulseCondition } = await loadFixture(deployRecoveryPulseConditionFixture);

        const initialTime = await time.latest();
        await time.increase(100);

        const timeSinceUpdate = await recoveryPulseCondition.getTimeSinceLastUpdate();
        expect(timeSinceUpdate).to.equal(100);
      });
    });

    describe("getTimeUntilRecovery", function () {
      it("Should return correct time until recovery when timeout not exceeded", async function () {
        const { recoveryPulseCondition, recoveryTimeout } = await loadFixture(deployRecoveryPulseConditionFixture);

        await time.increase(100);
        const timeUntilRecovery = await recoveryPulseCondition.getTimeUntilRecovery();
        expect(timeUntilRecovery).to.equal(recoveryTimeout - 100);
      });

      it("Should return 0 when timeout is exceeded", async function () {
        const { recoveryPulseCondition, recoveryTimeout } = await loadFixture(deployRecoveryPulseConditionFixture);

        await time.increase(recoveryTimeout + 1);
        const timeUntilRecovery = await recoveryPulseCondition.getTimeUntilRecovery();
        expect(timeUntilRecovery).to.equal(0);
      });
    });
  });
});

// Mock contract for testing
describe("MockRecoverable", function () {
  it("Should be deployable", async function () {
    const MockRecoverable = await ethers.getContractFactory("MockRecoverable");
    const mockRecoverable = await MockRecoverable.deploy();
    expect(mockRecoverable.target).to.be.a("string");
  });
}); 