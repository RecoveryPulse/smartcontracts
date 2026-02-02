const hre = require("hardhat");

/**
 * Deploys RecoverableLock with RecoveryPulseCondition
 *
 * Environment variables:
 * - COOLDOWN_PERIOD: Cooldown period in seconds (default: 86400 = 1 day)
 * - GUARDIAN_ADDRESS: Guardian address for recovery (default: deployer)
 * - MAINTAINER_ADDRESS: Maintainer address for pulse updates (default: deployer)
 * - RECOVERY_TIMEOUT: Time before recovery can be triggered (default: 604800 = 7 days)
 * - LOCK_DURATION: Lock duration in seconds (default: 2592000 = 30 days)
 *
 * Usage:
 *   npx hardhat run scripts/deploy-lock-pulse.js --network <network>
 */
async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying RecoverableLock with RecoveryPulseCondition...");
  console.log("Deployer:", deployer.address);

  // Get deployment parameters from environment or use defaults
  const cooldownPeriod = process.env.COOLDOWN_PERIOD || 86400; // 1 day
  const guardianAddress = process.env.GUARDIAN_ADDRESS || deployer.address;
  const maintainerAddress = process.env.MAINTAINER_ADDRESS || deployer.address;
  const recoveryTimeout = process.env.RECOVERY_TIMEOUT || 604800; // 7 days
  const lockDuration = process.env.LOCK_DURATION || 2592000; // 30 days

  // Calculate unlock time
  const currentBlock = await hre.ethers.provider.getBlock("latest");
  const unlockTime = currentBlock.timestamp + parseInt(lockDuration);

  console.log("\n=== Deployment Parameters ===");
  console.log("- Cooldown Period:", cooldownPeriod, "seconds");
  console.log("- Guardian Address:", guardianAddress);
  console.log("- Maintainer Address:", maintainerAddress);
  console.log("- Recovery Timeout:", recoveryTimeout, "seconds");
  console.log("- Lock Duration:", lockDuration, "seconds");
  console.log("- Unlock Time:", new Date(unlockTime * 1000).toISOString());

  // Step 1: Deploy RecoveryPulseCondition with zero address for recoverable
  console.log("\n=== Step 1: Deploying RecoveryPulseCondition ===");
  const RecoveryPulseCondition = await hre.ethers.getContractFactory("RecoveryPulseCondition");
  const recoveryPulseCondition = await RecoveryPulseCondition.deploy(
    guardianAddress,
    maintainerAddress,
    hre.ethers.ZeroAddress, // Will link later
    recoveryTimeout
  );
  await recoveryPulseCondition.waitForDeployment();
  const recoveryPulseConditionAddress = await recoveryPulseCondition.getAddress();
  console.log("RecoveryPulseCondition deployed at:", recoveryPulseConditionAddress);

  // Step 2: Deploy RecoverableLock
  console.log("\n=== Step 2: Deploying RecoverableLock ===");
  const RecoverableLock = await hre.ethers.getContractFactory("RecoverableLock");
  const recoverableLock = await RecoverableLock.deploy(
    recoveryPulseConditionAddress,
    cooldownPeriod,
    unlockTime
  );
  await recoverableLock.waitForDeployment();
  const recoverableLockAddress = await recoverableLock.getAddress();
  console.log("RecoverableLock deployed at:", recoverableLockAddress);

  // Step 3: Link RecoveryPulseCondition to RecoverableLock
  console.log("\n=== Step 3: Linking RecoveryPulseCondition to RecoverableLock ===");
  const tx = await recoveryPulseCondition.setRecoverableContract(recoverableLockAddress);
  await tx.wait();
  console.log("RecoveryPulseCondition linked to RecoverableLock");

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("DEPLOYMENT COMPLETE");
  console.log("=".repeat(50));
  console.log("\nContract Addresses:");
  console.log("  RecoveryPulseCondition:", recoveryPulseConditionAddress);
  console.log("  RecoverableLock:", recoverableLockAddress);

  console.log("\nLock Functions:");
  console.log("  - deposit(): Deposit ETH into the lock");
  console.log("  - withdraw(): Withdraw all funds (after unlock)");
  console.log("  - withdrawAmount(uint256): Withdraw specific amount (after unlock)");
  console.log("  - extendUnlockTime(uint256): Extend the lock period");

  console.log("\nMaintainer Functions:");
  console.log("  - updatePulse(uint256): Send heartbeat to prevent recovery");
  console.log("  - updateRecoveryTimeout(uint256): Change timeout period");
  console.log("  - updateGuardian(address): Change guardian");
  console.log("  - updateMaintainer(address): Change maintainer");

  console.log("\nRecovery Flow:");
  console.log("  1. Maintainer stops sending heartbeats (updatePulse)");
  console.log("  2. After timeout, guardian triggers: recoveryPulseCondition.triggerRecovery(newOwner)");
  console.log("  3. New owner finalizes: recoverableLock.finaliseRecovery()");
  console.log("  4. New owner can withdraw after unlock time");

  return { recoveryPulseCondition, recoverableLock };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
