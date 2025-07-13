const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");

describe("Recoverable", function () {
  // We define a fixture to reuse the same setup in every test.
  async function deployRecoverableFixture() {
    const [owner, newOwner, guardian, otherAccount] = await ethers.getSigners();
    
    // Deploy the recovery condition contract
    const SimpleRecoveryCondition = await ethers.getContractFactory("SimpleRecoveryCondition");
    const recoveryCondition = await SimpleRecoveryCondition.deploy(guardian.address);
    
    // Deploy the Recoverable contract
    const cooldownPeriod = 86400; // 1 day in seconds
    const Recoverable = await ethers.getContractFactory("Recoverable");
    const recoverable = await Recoverable.deploy(recoveryCondition.target, cooldownPeriod);

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
        const { recoverable, newOwner, owner } = await loadFixture(deployRecoverableFixture);

        await expect(recoverable.connect(owner).startRecovery(newOwner.address))
          .to.emit(recoverable, "RecoveryStarted")
          .withArgs(newOwner.address);

        expect(await recoverable.recoveryStatus()).to.equal(1); // RecoveryStatus.Active
        expect(await recoverable.pendingOwner()).to.equal(newOwner.address);
      });

      it("Should start recovery when status is Cancelled", async function () {
        const { recoverable, newOwner, owner } = await loadFixture(deployRecoverableFixture);

        // Start and cancel a recovery first
        await recoverable.connect(owner).startRecovery(newOwner.address);
        await recoverable.connect(owner).cancelRecovery();

        // Start a new recovery
        const anotherNewOwner = ethers.Wallet.createRandom();
        await expect(recoverable.connect(owner).startRecovery(anotherNewOwner.address))
          .to.emit(recoverable, "RecoveryStarted")
          .withArgs(anotherNewOwner.address);

        expect(await recoverable.recoveryStatus()).to.equal(1); // RecoveryStatus.Active
        expect(await recoverable.pendingOwner()).to.equal(anotherNewOwner.address);
      });

      it("Should revert when recovery is already Active", async function () {
        const { recoverable, newOwner, owner } = await loadFixture(deployRecoverableFixture);

        await recoverable.connect(owner).startRecovery(newOwner.address);
        
        await expect(recoverable.connect(owner).startRecovery(newOwner.address))
          .to.be.revertedWith("Recovery already active");
      });

      it("Should revert when called by non-owner", async function () {
        const { recoverable, newOwner, otherAccount } = await loadFixture(deployRecoverableFixture);

        await expect(recoverable.connect(otherAccount).startRecovery(newOwner.address))
          .to.be.revertedWithCustomError(recoverable, "OwnableUnauthorizedAccount");
      });
    });

    describe("cancelRecovery", function () {
      it("Should cancel active recovery", async function () {
        const { recoverable, newOwner, owner } = await loadFixture(deployRecoverableFixture);

        await recoverable.connect(owner).startRecovery(newOwner.address);
        
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
        const { recoverable, newOwner, owner, otherAccount } = await loadFixture(deployRecoverableFixture);

        await recoverable.connect(owner).startRecovery(newOwner.address);
        
        await expect(recoverable.connect(otherAccount).cancelRecovery())
          .to.be.revertedWithCustomError(recoverable, "OwnableUnauthorizedAccount");
      });
    });

    describe("finaliseRecovery", function () {
      it("Should finalise recovery when conditions are met", async function () {
        const { recoverable, recoveryCondition, newOwner, owner, guardian } = await loadFixture(deployRecoverableFixture);

        // Trigger recovery first
        await recoveryCondition.connect(guardian).triggerRecovery(recoverable.target);
        
        await recoverable.connect(owner).startRecovery(newOwner.address);
        
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
        const { recoverable, recoveryCondition, newOwner, owner, otherAccount, guardian } = await loadFixture(deployRecoverableFixture);

        // Trigger recovery first
        await recoveryCondition.connect(guardian).triggerRecovery(recoverable.target);
        
        await recoverable.connect(owner).startRecovery(newOwner.address);
        
        await expect(recoverable.connect(otherAccount).finaliseRecovery())
          .to.be.revertedWith("Only pending owner can finalise");
      });

      it("Should revert when recovery condition is not met", async function () {
        const { recoverable, newOwner, owner, cooldownPeriod } = await loadFixture(deployRecoverableFixture);

        // Wait for cooldown to pass
        await time.increase(cooldownPeriod + 1);

        // Deploy a new recovery condition that always returns false
        const MockRecoveryCondition = await ethers.getContractFactory("MockRecoveryCondition");
        const mockCondition = await MockRecoveryCondition.deploy(false);
        
        // Update the recovery condition
        await recoverable.connect(owner).updateRecoveryCondition(mockCondition.target);
        
        await recoverable.connect(owner).startRecovery(newOwner.address);
        
        await expect(recoverable.connect(newOwner).finaliseRecovery())
          .to.be.revertedWith("Recovery condition not met");
      });

      it("Should revert when recovery has not been triggered", async function () {
        const { recoverable, newOwner, owner } = await loadFixture(deployRecoverableFixture);

        // Start recovery without triggering
        await recoverable.connect(owner).startRecovery(newOwner.address);
        
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
    describe("SimpleRecoveryCondition triggerRecovery", function () {
      it("Should allow guardian to trigger recovery", async function () {
        const { recoveryCondition, guardian, recoverable } = await loadFixture(deployRecoverableFixture);

        await expect(recoveryCondition.connect(guardian).triggerRecovery(recoverable.target))
          .to.emit(recoveryCondition, "RecoveryTriggered")
          .withArgs(guardian.address, recoverable.target);

        expect(await recoveryCondition.recoveryTriggered()).to.be.true;
        expect(await recoveryCondition.isRecoverable(recoverable.target)).to.be.true;
      });

      it("Should revert when non-guardian tries to trigger recovery", async function () {
        const { recoveryCondition, otherAccount, recoverable } = await loadFixture(deployRecoverableFixture);

        await expect(recoveryCondition.connect(otherAccount).triggerRecovery(recoverable.target))
          .to.be.revertedWith("Only trusted guardian can trigger recovery");

        expect(await recoveryCondition.recoveryTriggered()).to.be.false;
        expect(await recoveryCondition.isRecoverable(recoverable.target)).to.be.false;
      });

      it("Should allow multiple trigger calls by guardian", async function () {
        const { recoveryCondition, guardian, recoverable } = await loadFixture(deployRecoverableFixture);

        // First trigger
        await recoveryCondition.connect(guardian).triggerRecovery(recoverable.target);
        expect(await recoveryCondition.recoveryTriggered()).to.be.true;

        // Second trigger (should still work)
        await recoveryCondition.connect(guardian).triggerRecovery(recoverable.target);
        expect(await recoveryCondition.recoveryTriggered()).to.be.true;
      });

      it("Should work with different contract addresses", async function () {
        const { recoveryCondition, guardian } = await loadFixture(deployRecoverableFixture);

        const differentAddress = ethers.Wallet.createRandom().address;

        await expect(recoveryCondition.connect(guardian).triggerRecovery(differentAddress))
          .to.emit(recoveryCondition, "RecoveryTriggered")
          .withArgs(guardian.address, differentAddress);

        expect(await recoveryCondition.recoveryTriggered()).to.be.true;
        expect(await recoveryCondition.isRecoverable(differentAddress)).to.be.true;
      });
    });

    describe("MockRecoveryCondition triggerRecovery", function () {
      it("Should allow anyone to trigger recovery", async function () {
        const MockRecoveryCondition = await ethers.getContractFactory("MockRecoveryCondition");
        const mockCondition = await MockRecoveryCondition.deploy(false);
        const [owner, otherAccount] = await ethers.getSigners();

        // Initially should return false
        expect(await mockCondition.isRecoverable(owner.address)).to.be.false;

        // Anyone can trigger recovery
        await mockCondition.connect(otherAccount).triggerRecovery(owner.address);

        // Should still return false since triggerRecovery doesn't change shouldReturn
        expect(await mockCondition.isRecoverable(owner.address)).to.be.false;
      });

      it("Should work with setShouldReturn function", async function () {
        const MockRecoveryCondition = await ethers.getContractFactory("MockRecoveryCondition");
        const mockCondition = await MockRecoveryCondition.deploy(false);
        const [owner] = await ethers.getSigners();

        // Initially should return false
        expect(await mockCondition.isRecoverable(owner.address)).to.be.false;

        // Set shouldReturn to true
        await mockCondition.setShouldReturn(true);
        expect(await mockCondition.isRecoverable(owner.address)).to.be.true;

        // Trigger recovery (doesn't affect shouldReturn)
        await mockCondition.triggerRecovery(owner.address);
        expect(await mockCondition.isRecoverable(owner.address)).to.be.true;
      });
    });

    describe("Integration with Recoverable contract", function () {
      it("Should complete full recovery flow with trigger", async function () {
        const { recoverable, recoveryCondition, newOwner, owner, guardian } = await loadFixture(deployRecoverableFixture);

        // 1. Guardian triggers recovery
        await recoveryCondition.connect(guardian).triggerRecovery(recoverable.target);

        // 2. Owner starts recovery
        await recoverable.connect(owner).startRecovery(newOwner.address);

        // 3. New owner finalises recovery
        await expect(recoverable.connect(newOwner).finaliseRecovery())
          .to.emit(recoverable, "RecoveryFinalised")
          .withArgs(newOwner.address);

        expect(await recoverable.owner()).to.equal(newOwner.address);
      });

      it("Should fail recovery flow without trigger", async function () {
        const { recoverable, newOwner, owner } = await loadFixture(deployRecoverableFixture);

        // Start recovery without triggering
        await recoverable.connect(owner).startRecovery(newOwner.address);

        // Should fail to finalise
        await expect(recoverable.connect(newOwner).finaliseRecovery())
          .to.be.revertedWith("Recovery condition not met");
      });

      it("Should work with updated recovery condition", async function () {
        const { recoverable, newOwner, owner, guardian, cooldownPeriod } = await loadFixture(deployRecoverableFixture);

        // Wait for cooldown to pass
        await time.increase(cooldownPeriod + 1);

        // Deploy new mock condition
        const MockRecoveryCondition = await ethers.getContractFactory("MockRecoveryCondition");
        const mockCondition = await MockRecoveryCondition.deploy(true);

        // Update recovery condition
        await recoverable.connect(owner).updateRecoveryCondition(mockCondition.target);

        // Start recovery
        await recoverable.connect(owner).startRecovery(newOwner.address);

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
      const { recoverable, recoveryCondition, newOwner, owner, guardian } = await loadFixture(deployRecoverableFixture);

      const initialChange = await recoverable.lastRecoveryChange();
      
      // Trigger recovery first
      await recoveryCondition.connect(guardian).triggerRecovery(recoverable.target);
      
      await recoverable.connect(owner).startRecovery(newOwner.address);
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
      const { recoverable, recoveryCondition, owner, guardian } = await loadFixture(deployRecoverableFixture);

      // Trigger recovery first
      await recoveryCondition.connect(guardian).triggerRecovery(recoverable.target);

      await expect(recoverable.connect(owner).startRecovery(ethers.ZeroAddress))
        .to.emit(recoverable, "RecoveryStarted")
        .withArgs(ethers.ZeroAddress);

      expect(await recoverable.pendingOwner()).to.equal(ethers.ZeroAddress);
    });

    it("Should handle recovery with same owner address", async function () {
      const { recoverable, recoveryCondition, owner, guardian } = await loadFixture(deployRecoverableFixture);

      // Trigger recovery first
      await recoveryCondition.connect(guardian).triggerRecovery(recoverable.target);

      await expect(recoverable.connect(owner).startRecovery(owner.address))
        .to.emit(recoverable, "RecoveryStarted")
        .withArgs(owner.address);

      expect(await recoverable.pendingOwner()).to.equal(owner.address);
    });

    it("Should handle multiple recovery cycles", async function () {
      const { recoverable, recoveryCondition, newOwner, owner, guardian, cooldownPeriod } = await loadFixture(deployRecoverableFixture);

      // First recovery cycle
      await recoveryCondition.connect(guardian).triggerRecovery(recoverable.target);
      await recoverable.connect(owner).startRecovery(newOwner.address);
      await recoverable.connect(newOwner).finaliseRecovery();

      // Wait for cooldown to pass before starting second recovery
      await time.increase(cooldownPeriod + 1);

      // Second recovery cycle
      await recoveryCondition.connect(guardian).triggerRecovery(recoverable.target);
      await recoverable.connect(newOwner).startRecovery(owner.address);
      await recoverable.connect(owner).finaliseRecovery();

      expect(await recoverable.owner()).to.equal(owner.address);
      expect(await recoverable.recoveryStatus()).to.equal(0); // RecoveryStatus.Inactive
    });
  });

  describe("Events", function () {
    it("Should emit RecoveryStarted event with correct parameters", async function () {
      const { recoverable, newOwner, owner } = await loadFixture(deployRecoverableFixture);

      await expect(recoverable.connect(owner).startRecovery(newOwner.address))
        .to.emit(recoverable, "RecoveryStarted")
        .withArgs(newOwner.address);
    });

    it("Should emit RecoveryCancelled event", async function () {
      const { recoverable, newOwner, owner } = await loadFixture(deployRecoverableFixture);

      await recoverable.connect(owner).startRecovery(newOwner.address);
      
      await expect(recoverable.connect(owner).cancelRecovery())
        .to.emit(recoverable, "RecoveryCancelled");
    });

    it("Should emit RecoveryFinalised event with correct parameters", async function () {
      const { recoverable, recoveryCondition, newOwner, owner, guardian } = await loadFixture(deployRecoverableFixture);

      // Trigger recovery first
      await recoveryCondition.connect(guardian).triggerRecovery(recoverable.target);
      
      await recoverable.connect(owner).startRecovery(newOwner.address);
      
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

    it("Should emit RecoveryTriggered event from SimpleRecoveryCondition", async function () {
      const { recoveryCondition, guardian, recoverable } = await loadFixture(deployRecoverableFixture);

      await expect(recoveryCondition.connect(guardian).triggerRecovery(recoverable.target))
        .to.emit(recoveryCondition, "RecoveryTriggered")
        .withArgs(guardian.address, recoverable.target);
    });
  });
});

// Mock contract for testing recovery conditions
describe("MockRecoveryCondition", function () {
  let mockCondition;
  let result;

  beforeEach(async function () {
    const MockRecoveryCondition = await ethers.getContractFactory("MockRecoveryCondition");
    mockCondition = await MockRecoveryCondition.deploy(true);
    result = true;
  });

  it("Should return the configured result", async function () {
    const [owner] = await ethers.getSigners();
    expect(await mockCondition.isRecoverable(owner.address)).to.equal(result);
  });

  it("Should allow triggerRecovery call", async function () {
    const [owner] = await ethers.getSigners();
    
    // triggerRecovery should not throw an error
    await expect(mockCondition.triggerRecovery(owner.address)).to.not.be.reverted;
  });

  it("Should allow setShouldReturn to change behavior", async function () {
    const [owner] = await ethers.getSigners();
    
    // Initially should return true
    expect(await mockCondition.isRecoverable(owner.address)).to.be.true;
    
    // Change to false
    await mockCondition.setShouldReturn(false);
    expect(await mockCondition.isRecoverable(owner.address)).to.be.false;
    
    // Change back to true
    await mockCondition.setShouldReturn(true);
    expect(await mockCondition.isRecoverable(owner.address)).to.be.true;
  });
}); 