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
    
    const RecoveryPulseCondition = await ethers.getContractFactory("RecoveryPulseCondition");
    const recoveryPulseCondition = await RecoveryPulseCondition.deploy(
      guardian.address,
      maintainer.address,
      recoveryTimeout
    );

    return { 
      recoveryPulseCondition, 
      recoveryTimeout, 
      owner, 
      guardian, 
      maintainer, 
      otherAccount 
    };
  }

  describe("Deployment", function () {
    it("Should set the correct initial state", async function () {
      const { recoveryPulseCondition, recoveryTimeout, guardian, maintainer } = await loadFixture(deployRecoveryPulseConditionFixture);

      expect(await recoveryPulseCondition.trustedGuardian()).to.equal(guardian.address);
      expect(await recoveryPulseCondition.maintainer()).to.equal(maintainer.address);
      expect(await recoveryPulseCondition.recoveryTimeout()).to.equal(recoveryTimeout);
      expect(await recoveryPulseCondition.counter()).to.equal(0);
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

  describe("Counter Management", function () {
    describe("updateCounter", function () {
      it("Should update counter and lastUpdateTime when called by maintainer", async function () {
        const { recoveryPulseCondition, maintainer } = await loadFixture(deployRecoveryPulseConditionFixture);

        const newCounter = 42;
        const beforeTime = await time.latest();

        await expect(recoveryPulseCondition.connect(maintainer).updateCounter(newCounter))
          .to.emit(recoveryPulseCondition, "CounterUpdated")
          .withArgs(maintainer.address, newCounter, await time.latest());

        expect(await recoveryPulseCondition.counter()).to.equal(newCounter);
        
        const lastUpdateTime = await recoveryPulseCondition.lastUpdateTime();
        expect(lastUpdateTime).to.be.gte(beforeTime);
      });

      it("Should revert when called by non-maintainer", async function () {
        const { recoveryPulseCondition, otherAccount } = await loadFixture(deployRecoveryPulseConditionFixture);

        await expect(recoveryPulseCondition.connect(otherAccount).updateCounter(42))
          .to.be.revertedWith("Only maintainer can call this function");
      });

      it("Should revert when called by guardian", async function () {
        const { recoveryPulseCondition, guardian } = await loadFixture(deployRecoveryPulseConditionFixture);

        await expect(recoveryPulseCondition.connect(guardian).updateCounter(42))
          .to.be.revertedWith("Only maintainer can call this function");
      });
    });
  });

  describe("Recovery Management", function () {
    describe("triggerRecovery", function () {
      it("Should trigger recovery when timeout is exceeded", async function () {
        const { recoveryPulseCondition, guardian, recoveryTimeout } = await loadFixture(deployRecoveryPulseConditionFixture);

        // Wait for timeout to pass
        await time.increase(recoveryTimeout + 1);

        await expect(recoveryPulseCondition.connect(guardian).triggerRecovery(ethers.ZeroAddress))
          .to.emit(recoveryPulseCondition, "RecoveryTriggered")
          .withArgs(guardian.address, ethers.ZeroAddress, recoveryTimeout + 1);

        expect(await recoveryPulseCondition.recoveryTriggered()).to.equal(true);
      });

      it("Should revert when timeout is not exceeded", async function () {
        const { recoveryPulseCondition, guardian, recoveryTimeout } = await loadFixture(deployRecoveryPulseConditionFixture);

        // Wait for less than timeout
        await time.increase(recoveryTimeout - 1);

        await expect(recoveryPulseCondition.connect(guardian).triggerRecovery(ethers.ZeroAddress))
          .to.be.revertedWith("Recovery timeout not exceeded");
      });

      it("Should revert when recovery is already triggered", async function () {
        const { recoveryPulseCondition, guardian, recoveryTimeout } = await loadFixture(deployRecoveryPulseConditionFixture);

        // Wait for timeout and trigger recovery
        await time.increase(recoveryTimeout + 1);
        await recoveryPulseCondition.connect(guardian).triggerRecovery(ethers.ZeroAddress);

        // Try to trigger again
        await expect(recoveryPulseCondition.connect(guardian).triggerRecovery(ethers.ZeroAddress))
          .to.be.revertedWith("Recovery already triggered");
      });

      it("Should revert when called by non-guardian", async function () {
        const { recoveryPulseCondition, otherAccount, recoveryTimeout } = await loadFixture(deployRecoveryPulseConditionFixture);

        // Wait for timeout to pass
        await time.increase(recoveryTimeout + 1);

        await expect(recoveryPulseCondition.connect(otherAccount).triggerRecovery(ethers.ZeroAddress))
          .to.be.revertedWith("Only trusted guardian can call this function");
      });

      it("Should reset timeout when counter is updated", async function () {
        const { recoveryPulseCondition, guardian, maintainer, recoveryTimeout } = await loadFixture(deployRecoveryPulseConditionFixture);

        // Wait for most of timeout
        await time.increase(recoveryTimeout - 100);

        // Update counter (resets timeout)
        await recoveryPulseCondition.connect(maintainer).updateCounter(1);

        // Try to trigger recovery (should fail)
        await expect(recoveryPulseCondition.connect(guardian).triggerRecovery(ethers.ZeroAddress))
          .to.be.revertedWith("Recovery timeout not exceeded");

        // Wait for timeout again
        await time.increase(recoveryTimeout + 1);

        // Now should succeed
        await expect(recoveryPulseCondition.connect(guardian).triggerRecovery(ethers.ZeroAddress))
          .to.emit(recoveryPulseCondition, "RecoveryTriggered");
      });
    });

    describe("resetRecovery", function () {
      it("Should reset recovery state when called by maintainer", async function () {
        const { recoveryPulseCondition, guardian, maintainer, recoveryTimeout } = await loadFixture(deployRecoveryPulseConditionFixture);

        // Trigger recovery
        await time.increase(recoveryTimeout + 1);
        await recoveryPulseCondition.connect(guardian).triggerRecovery(ethers.ZeroAddress);
        expect(await recoveryPulseCondition.recoveryTriggered()).to.equal(true);

        // Reset recovery
        await recoveryPulseCondition.connect(maintainer).resetRecovery();
        expect(await recoveryPulseCondition.recoveryTriggered()).to.equal(false);
      });

      it("Should revert when called by non-maintainer", async function () {
        const { recoveryPulseCondition, otherAccount } = await loadFixture(deployRecoveryPulseConditionFixture);

        await expect(recoveryPulseCondition.connect(otherAccount).resetRecovery())
          .to.be.revertedWith("Only maintainer can call this function");
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

      it("Should revert when called by non-maintainer", async function () {
        const { recoveryPulseCondition, otherAccount } = await loadFixture(deployRecoveryPulseConditionFixture);

        await expect(recoveryPulseCondition.connect(otherAccount).updateGuardian(otherAccount.address))
          .to.be.revertedWith("Only maintainer can call this function");
      });

      it("Should revert when trying to set guardian to zero address", async function () {
        const { recoveryPulseCondition, maintainer } = await loadFixture(deployRecoveryPulseConditionFixture);

        await expect(recoveryPulseCondition.connect(maintainer).updateGuardian(ethers.ZeroAddress))
          .to.be.revertedWith("Guardian cannot be zero address");
      });
    });

    describe("updateMaintainer", function () {
      it("Should update maintainer when called by current maintainer", async function () {
        const { recoveryPulseCondition, maintainer, otherAccount } = await loadFixture(deployRecoveryPulseConditionFixture);

        await recoveryPulseCondition.connect(maintainer).updateMaintainer(otherAccount.address);
        expect(await recoveryPulseCondition.maintainer()).to.equal(otherAccount.address);
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
    describe("isRecoverable", function () {
      it("Should return false when recovery is not triggered", async function () {
        const { recoveryPulseCondition } = await loadFixture(deployRecoveryPulseConditionFixture);

        expect(await recoveryPulseCondition.isRecoverable(ethers.ZeroAddress)).to.equal(false);
      });

      it("Should return true when recovery is triggered", async function () {
        const { recoveryPulseCondition, guardian, recoveryTimeout } = await loadFixture(deployRecoveryPulseConditionFixture);

        // Trigger recovery
        await time.increase(recoveryTimeout + 1);
        await recoveryPulseCondition.connect(guardian).triggerRecovery(ethers.ZeroAddress);

        expect(await recoveryPulseCondition.isRecoverable(ethers.ZeroAddress)).to.equal(true);
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