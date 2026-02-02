const hre = require("hardhat");

/**
 * Deploys SimpleCondition + Recoverable
 *
 * Environment variables:
 * - COOLDOWN_PERIOD: Cooldown period in seconds (default: 86400 = 1 day)
 * - GUARDIAN_ADDRESS: Guardian address for recovery (default: deployer)
 *
 * Usage:
 *   npx hardhat run scripts/deploy-simple.js --network <network>
 */
async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying Simple Recovery System...");
  console.log("Deployer:", deployer.address);

  // Get deployment parameters from environment or use defaults
  const cooldownPeriod = process.env.COOLDOWN_PERIOD || 86400; // 1 day
  const guardianAddress = process.env.GUARDIAN_ADDRESS || deployer.address;

  console.log("\n=== Deployment Parameters ===");
  console.log("- Cooldown Period:", cooldownPeriod, "seconds");
  console.log("- Guardian Address:", guardianAddress);

  // Step 1: Deploy SimpleCondition with zero address for recoverable (will link later)
  console.log("\n=== Step 1: Deploying SimpleCondition ===");
  const SimpleCondition = await hre.ethers.getContractFactory("SimpleCondition");
  const simpleCondition = await SimpleCondition.deploy(guardianAddress, hre.ethers.ZeroAddress);
  await simpleCondition.waitForDeployment();
  const simpleConditionAddress = await simpleCondition.getAddress();
  console.log("SimpleCondition deployed at:", simpleConditionAddress);

  // Step 2: Deploy Recoverable with the condition address
  console.log("\n=== Step 2: Deploying Recoverable ===");
  const Recoverable = await hre.ethers.getContractFactory("Recoverable");
  const recoverable = await Recoverable.deploy(simpleConditionAddress, cooldownPeriod);
  await recoverable.waitForDeployment();
  const recoverableAddress = await recoverable.getAddress();
  console.log("Recoverable deployed at:", recoverableAddress);

  // Step 3: Link SimpleCondition to Recoverable
  console.log("\n=== Step 3: Linking SimpleCondition to Recoverable ===");
  const tx = await simpleCondition.setRecoverableContract(recoverableAddress);
  await tx.wait();
  console.log("SimpleCondition linked to Recoverable");

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("DEPLOYMENT COMPLETE");
  console.log("=".repeat(50));
  console.log("\nContract Addresses:");
  console.log("  SimpleCondition:", simpleConditionAddress);
  console.log("  Recoverable:", recoverableAddress);

  console.log("\nRecovery Flow:");
  console.log("  1. Guardian triggers: simpleCondition.triggerRecovery(newOwner)");
  console.log("  2. New owner finalizes: recoverable.finaliseRecovery()");

  return { simpleCondition, recoverable };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
