const hre = require("hardhat");

/**
 * Deploys RecoverableLock with SimpleCondition
 *
 * Environment variables:
 * - COOLDOWN_PERIOD: Cooldown period in seconds (default: 86400 = 1 day)
 * - GUARDIAN_ADDRESS: Guardian address for recovery (default: deployer)
 * - LOCK_DURATION: Lock duration in seconds (default: 604800 = 7 days)
 *
 * Usage:
 *   npx hardhat run scripts/deploy-lock-simple.js --network <network>
 */
async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying RecoverableLock with SimpleCondition...");
  console.log("Deployer:", deployer.address);

  // Get deployment parameters from environment or use defaults
  const cooldownPeriod = process.env.COOLDOWN_PERIOD || 86400; // 1 day
  const guardianAddress = process.env.GUARDIAN_ADDRESS || deployer.address;
  const lockDuration = process.env.LOCK_DURATION || 604800; // 7 days

  // Calculate unlock time
  const currentBlock = await hre.ethers.provider.getBlock("latest");
  const unlockTime = currentBlock.timestamp + parseInt(lockDuration);

  console.log("\n=== Deployment Parameters ===");
  console.log("- Cooldown Period:", cooldownPeriod, "seconds");
  console.log("- Guardian Address:", guardianAddress);
  console.log("- Lock Duration:", lockDuration, "seconds");
  console.log("- Unlock Time:", new Date(unlockTime * 1000).toISOString());

  // Step 1: Deploy SimpleCondition with zero address for recoverable
  console.log("\n=== Step 1: Deploying SimpleCondition ===");
  const SimpleCondition = await hre.ethers.getContractFactory("SimpleCondition");
  const simpleCondition = await SimpleCondition.deploy(guardianAddress, hre.ethers.ZeroAddress);
  await simpleCondition.waitForDeployment();
  const simpleConditionAddress = await simpleCondition.getAddress();
  console.log("SimpleCondition deployed at:", simpleConditionAddress);

  // Step 2: Deploy RecoverableLock
  console.log("\n=== Step 2: Deploying RecoverableLock ===");
  const RecoverableLock = await hre.ethers.getContractFactory("RecoverableLock");
  const recoverableLock = await RecoverableLock.deploy(
    simpleConditionAddress,
    cooldownPeriod,
    unlockTime
  );
  await recoverableLock.waitForDeployment();
  const recoverableLockAddress = await recoverableLock.getAddress();
  console.log("RecoverableLock deployed at:", recoverableLockAddress);

  // Step 3: Link SimpleCondition to RecoverableLock
  console.log("\n=== Step 3: Linking SimpleCondition to RecoverableLock ===");
  const tx = await simpleCondition.setRecoverableContract(recoverableLockAddress);
  await tx.wait();
  console.log("SimpleCondition linked to RecoverableLock");

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("DEPLOYMENT COMPLETE");
  console.log("=".repeat(50));
  console.log("\nContract Addresses:");
  console.log("  SimpleCondition:", simpleConditionAddress);
  console.log("  RecoverableLock:", recoverableLockAddress);

  console.log("\nLock Functions:");
  console.log("  - deposit(): Deposit ETH into the lock");
  console.log("  - withdraw(): Withdraw all funds (after unlock)");
  console.log("  - withdrawAmount(uint256): Withdraw specific amount (after unlock)");
  console.log("  - extendUnlockTime(uint256): Extend the lock period");

  console.log("\nRecovery Flow:");
  console.log("  1. Guardian triggers: simpleCondition.triggerRecovery(newOwner)");
  console.log("  2. New owner finalizes: recoverableLock.finaliseRecovery()");
  console.log("  3. New owner can withdraw after unlock time");

  return { simpleCondition, recoverableLock };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
