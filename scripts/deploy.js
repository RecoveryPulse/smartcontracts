const hre = require("hardhat");
const RecoveryModule = require("../ignition/modules/Recovery");

async function main() {
  console.log("Deploying Recovery Contracts...");

  // Get deployment parameters from environment or use defaults
  const cooldownPeriod = process.env.COOLDOWN_PERIOD || 86400; // 1 day in seconds
  const guardianAddress = process.env.GUARDIAN_ADDRESS || "0x0000000000000000000000000000000000000000";

  console.log("Deployment Parameters:");
  console.log("- Cooldown Period:", cooldownPeriod, "seconds");
  console.log("- Guardian Address:", guardianAddress);

  // Deploy Recovery contracts
  console.log("\n=== Deploying Recovery Contracts ===");
  const { simpleRecoveryCondition, recoverable } = await hre.ignition.deploy(RecoveryModule, {
    cooldownPeriod: cooldownPeriod,
    guardianAddress: guardianAddress
  });

  const recoveryConditionAddress = await simpleRecoveryCondition.getAddress();
  const recoverableAddress = await recoverable.getAddress();

  console.log("\n=== Deployment Results ===");
  console.log("SimpleRecoveryCondition Address:", recoveryConditionAddress);
  console.log("Recoverable Address:", recoverableAddress);

  console.log("\n=== Contract Verification ===");
  console.log("Recovery system deployed successfully!");
  console.log("Guardian can trigger recovery using SimpleRecoveryCondition at:", recoveryConditionAddress);
  console.log("Main recovery contract is Recoverable at:", recoverableAddress);
  
  console.log("\n=== Next Steps ===");
  console.log("1. Set the guardian address in the SimpleRecoveryCondition contract");
  console.log("2. Guardian can call triggerRecovery() on SimpleRecoveryCondition");
  console.log("3. Owner can start recovery process on Recoverable contract");
  console.log("4. Pending owner can finalize recovery when conditions are met");
}

main().catch(console.error); 