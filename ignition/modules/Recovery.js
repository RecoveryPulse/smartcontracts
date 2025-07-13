const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

const DEFAULT_COOLDOWN_PERIOD = 86400; // 1 day in seconds

module.exports = buildModule("RecoveryModule", (m) => {
  const cooldownPeriod = m.getParameter("cooldownPeriod", DEFAULT_COOLDOWN_PERIOD);
  const guardianAddress = m.getParameter("guardianAddress", "0x0000000000000000000000000000000000000000");

  // Deploy the SimpleRecoveryCondition contract
  const simpleRecoveryCondition = m.contract("SimpleRecoveryCondition", [guardianAddress]);

  // Deploy the Recoverable contract with the recovery condition
  const recoverable = m.contract("Recoverable", [simpleRecoveryCondition, cooldownPeriod]);

  return { 
    simpleRecoveryCondition, 
    recoverable 
  };
}); 