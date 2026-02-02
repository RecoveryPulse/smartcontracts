const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

describe("RecoverableLock", function () {
    const COOLDOWN_PERIOD = 86400; // 1 day
    const LOCK_DURATION = 7 * 24 * 60 * 60; // 7 days

    async function deployLockFixture() {
        const [owner, guardian, newOwner, depositor] = await ethers.getSigners();

        // Deploy SimpleCondition with zero address for recoverable (will set later)
        const SimpleCondition = await ethers.getContractFactory("SimpleCondition");
        const recoveryCondition = await SimpleCondition.deploy(guardian.address, ethers.ZeroAddress);

        // Calculate unlock time
        const currentTime = await time.latest();
        const unlockTime = currentTime + LOCK_DURATION;

        // Deploy RecoverableLock
        const RecoverableLock = await ethers.getContractFactory("RecoverableLock");
        const lock = await RecoverableLock.deploy(
            recoveryCondition.target,
            COOLDOWN_PERIOD,
            unlockTime
        );

        // Set the recoverable contract on the condition
        await recoveryCondition.connect(guardian).setRecoverableContract(lock.target);

        return { lock, recoveryCondition, owner, guardian, newOwner, depositor, unlockTime };
    }

    describe("Deployment", function () {
        it("should set correct unlock time", async function () {
            const { lock, unlockTime } = await loadFixture(deployLockFixture);
            expect(await lock.unlockTime()).to.equal(unlockTime);
        });

        it("should set correct owner", async function () {
            const { lock, owner } = await loadFixture(deployLockFixture);
            expect(await lock.owner()).to.equal(owner.address);
        });

        it("should be locked initially", async function () {
            const { lock } = await loadFixture(deployLockFixture);
            expect(await lock.isLocked()).to.be.true;
        });
    });

    describe("Deposits", function () {
        it("should accept deposits", async function () {
            const { lock, depositor } = await loadFixture(deployLockFixture);
            const depositAmount = ethers.parseEther("1.0");

            await expect(lock.connect(depositor).deposit({ value: depositAmount }))
                .to.emit(lock, "Deposited")
                .withArgs(depositor.address, depositAmount);

            expect(await lock.getBalance()).to.equal(depositAmount);
            expect(await lock.totalDeposited()).to.equal(depositAmount);
        });

        it("should accept deposits via receive", async function () {
            const { lock, depositor } = await loadFixture(deployLockFixture);
            const depositAmount = ethers.parseEther("0.5");

            await expect(depositor.sendTransaction({
                to: lock.target,
                value: depositAmount
            })).to.emit(lock, "Deposited");

            expect(await lock.getBalance()).to.equal(depositAmount);
        });

        it("should reject zero deposits", async function () {
            const { lock, depositor } = await loadFixture(deployLockFixture);
            await expect(lock.connect(depositor).deposit({ value: 0 }))
                .to.be.revertedWith("Must deposit something");
        });
    });

    describe("Withdrawals", function () {
        it("should reject withdrawal before unlock time", async function () {
            const { lock, owner, depositor } = await loadFixture(deployLockFixture);

            // Deposit some funds
            await lock.connect(depositor).deposit({ value: ethers.parseEther("1.0") });

            await expect(lock.connect(owner).withdraw())
                .to.be.revertedWith("Funds are still locked");
        });

        it("should allow withdrawal after unlock time", async function () {
            const { lock, owner, depositor, unlockTime } = await loadFixture(deployLockFixture);
            const depositAmount = ethers.parseEther("1.0");

            // Deposit
            await lock.connect(depositor).deposit({ value: depositAmount });

            // Fast forward past unlock time
            await time.increaseTo(unlockTime + 1);

            // Withdraw
            const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);
            const tx = await lock.connect(owner).withdraw();
            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed * receipt.gasPrice;
            const ownerBalanceAfter = await ethers.provider.getBalance(owner.address);

            expect(ownerBalanceAfter).to.equal(ownerBalanceBefore + depositAmount - gasUsed);
            expect(await lock.getBalance()).to.equal(0);
        });

        it("should allow partial withdrawal", async function () {
            const { lock, owner, depositor, unlockTime } = await loadFixture(deployLockFixture);
            const depositAmount = ethers.parseEther("2.0");
            const withdrawAmount = ethers.parseEther("1.0");

            await lock.connect(depositor).deposit({ value: depositAmount });
            await time.increaseTo(unlockTime + 1);

            await lock.connect(owner).withdrawAmount(withdrawAmount);

            expect(await lock.getBalance()).to.equal(depositAmount - withdrawAmount);
        });

        it("should reject withdrawal from non-owner", async function () {
            const { lock, depositor, unlockTime } = await loadFixture(deployLockFixture);

            await lock.connect(depositor).deposit({ value: ethers.parseEther("1.0") });
            await time.increaseTo(unlockTime + 1);

            await expect(lock.connect(depositor).withdraw())
                .to.be.revertedWithCustomError(lock, "OwnableUnauthorizedAccount");
        });
    });

    describe("Unlock Time Extension", function () {
        it("should allow owner to extend unlock time", async function () {
            const { lock, owner, unlockTime } = await loadFixture(deployLockFixture);
            const newUnlockTime = unlockTime + LOCK_DURATION;

            await expect(lock.connect(owner).extendUnlockTime(newUnlockTime))
                .to.emit(lock, "UnlockTimeExtended")
                .withArgs(newUnlockTime);

            expect(await lock.unlockTime()).to.equal(newUnlockTime);
        });

        it("should reject earlier unlock time", async function () {
            const { lock, owner, unlockTime } = await loadFixture(deployLockFixture);

            await expect(lock.connect(owner).extendUnlockTime(unlockTime - 1000))
                .to.be.revertedWith("New unlock time must be later");
        });
    });

    describe("Recovery Integration", function () {
        it("should allow full recovery flow", async function () {
            const { lock, recoveryCondition, owner, guardian, newOwner, depositor, unlockTime } =
                await loadFixture(deployLockFixture);

            // Deposit some funds
            await lock.connect(depositor).deposit({ value: ethers.parseEther("5.0") });

            // Wait for cooldown
            await time.increase(COOLDOWN_PERIOD + 1);

            // Guardian triggers recovery
            await recoveryCondition.connect(guardian).triggerRecovery(newOwner.address);

            // Verify recovery is active
            expect(await lock.recoveryStatus()).to.equal(1); // Active
            expect(await lock.pendingOwner()).to.equal(newOwner.address);

            // New owner finalizes recovery
            await lock.connect(newOwner).finaliseRecovery();

            // Verify ownership transferred
            expect(await lock.owner()).to.equal(newOwner.address);
            expect(await lock.recoveryStatus()).to.equal(0); // Inactive

            // New owner can now withdraw after unlock
            await time.increaseTo(unlockTime + 1);
            await lock.connect(newOwner).withdraw();

            expect(await lock.getBalance()).to.equal(0);
        });

        it("should preserve lock functionality after recovery", async function () {
            const { lock, recoveryCondition, guardian, newOwner, depositor } =
                await loadFixture(deployLockFixture);

            // Wait for cooldown and trigger recovery
            await time.increase(COOLDOWN_PERIOD + 1);
            await recoveryCondition.connect(guardian).triggerRecovery(newOwner.address);
            await lock.connect(newOwner).finaliseRecovery();

            // New owner can still receive deposits
            const depositAmount = ethers.parseEther("1.0");
            await lock.connect(depositor).deposit({ value: depositAmount });
            expect(await lock.getBalance()).to.equal(depositAmount);

            // Lock time still applies
            expect(await lock.isLocked()).to.be.true;
        });

        it("should allow owner to cancel recovery", async function () {
            const { lock, recoveryCondition, owner, guardian, newOwner } =
                await loadFixture(deployLockFixture);

            // Wait for cooldown and trigger recovery
            await time.increase(COOLDOWN_PERIOD + 1);
            await recoveryCondition.connect(guardian).triggerRecovery(newOwner.address);

            // Owner cancels
            await lock.connect(owner).cancelRecovery();

            expect(await lock.recoveryStatus()).to.equal(3); // Cancelled
            expect(await lock.owner()).to.equal(owner.address);
        });
    });

    describe("Time Utilities", function () {
        it("should return correct time until unlock", async function () {
            const { lock, unlockTime } = await loadFixture(deployLockFixture);
            const currentTime = await time.latest();

            const timeRemaining = await lock.timeUntilUnlock();
            expect(timeRemaining).to.be.closeTo(unlockTime - currentTime, 5);
        });

        it("should return zero after unlock", async function () {
            const { lock, unlockTime } = await loadFixture(deployLockFixture);

            await time.increaseTo(unlockTime + 100);
            expect(await lock.timeUntilUnlock()).to.equal(0);
            expect(await lock.isLocked()).to.be.false;
        });
    });
});
