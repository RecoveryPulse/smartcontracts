const hre = require("hardhat");

async function main() {
  console.log("Deploying Recovery Pulse Condition...");

  // Get deployment parameters from environment or use defaults
  const cooldownPeriod = process.env.COOLDOWN_PERIOD || 86400; // 1 day in seconds
  const guardianAddress = process.env.GUARDIAN_ADDRESS || "0x0000000000000000000000000000000000000000";
  const maintainerAddress = process.env.MAINTAINER_ADDRESS || "0x0000000000000000000000000000000000000000";
  const recoveryTimeout = process.env.RECOVERY_TIMEOUT || 604800; // 7 days in seconds

  console.log("Deployment Parameters:");
  console.log("- Cooldown Period:", cooldownPeriod, "seconds");
  console.log("- Guardian Address:", guardianAddress);
  console.log("- Maintainer Address:", maintainerAddress);
  console.log("- Recovery Timeout:", recoveryTimeout, "seconds");

  // Deploy RecoveryPulseCondition contract
  console.log("\n=== Deploying RecoveryPulseCondition ===");
  const RecoveryPulseCondition = await hre.ethers.getContractFactory("RecoveryPulseCondition");
  const recoveryPulseCondition = await RecoveryPulseCondition.deploy(
    guardianAddress,
    maintainerAddress,
    recoveryTimeout
  );

  await recoveryPulseCondition.waitForDeployment();
  const recoveryPulseConditionAddress = await recoveryPulseCondition.getAddress();

  // Deploy Recoverable contract with the recovery pulse condition
  console.log("\n=== Deploying Recoverable with RecoveryPulseCondition ===");
  const Recoverable = await hre.ethers.getContractFactory("Recoverable");
  const recoverable = await Recoverable.deploy(recoveryPulseConditionAddress, cooldownPeriod);

  await recoverable.waitForDeployment();
  const recoverableAddress = await recoverable.getAddress();

  console.log("\n=== Deployment Results ===");
  console.log("RecoveryPulseCondition Address:", recoveryPulseConditionAddress);
  console.log("Recoverable Address:", recoverableAddress);

  console.log("\n=== Contract Verification ===");
  console.log("Recovery Pulse system deployed successfully!");
  console.log("Maintainer can update counter using RecoveryPulseCondition at:", recoveryPulseConditionAddress);
  console.log("Guardian can trigger recovery after timeout using RecoveryPulseCondition at:", recoveryPulseConditionAddress);
  console.log("Main recovery contract is Recoverable at:", recoverableAddress);
  
  console.log("\n=== Usage Instructions ===");
  console.log("1. Maintainer should regularly update the counter to prevent recovery");
  console.log("2. If maintainer fails to update counter within timeout period, guardian can trigger recovery");
  console.log("3. Guardian calls triggerRecovery() on RecoveryPulseCondition when timeout is exceeded");
  console.log("4. Owner can start recovery process on Recoverable contract");
  console.log("5. Pending owner can finalize recovery when conditions are met");
  
  console.log("\n=== Key Functions ===");
  console.log("Maintainer functions:");
  console.log("- updateCounter(uint256 newCounter): Updates counter and resets timeout");
  console.log("- updateRecoveryTimeout(uint256 newTimeout): Changes timeout period");
  console.log("- updateGuardian(address newGuardian): Changes guardian address");
  console.log("- updateMaintainer(address newMaintainer): Changes maintainer address");
  console.log("- resetRecovery(): Resets recovery state");
  
  console.log("\nGuardian functions:");
  console.log("- triggerRecovery(address contractAddress): Triggers recovery if timeout exceeded");
  
  console.log("\nView functions:");
  console.log("- isRecoverable(address): Returns true if recovery is triggered");
  console.log("- isTimeoutExceeded(): Returns true if timeout has passed");
  console.log("- getTimeSinceLastUpdate(): Returns seconds since last counter update");
  console.log("- getTimeUntilRecovery(): Returns seconds until recovery can be triggered");
}

main().catch(console.error); 