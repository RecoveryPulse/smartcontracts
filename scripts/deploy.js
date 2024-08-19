const hre = require("hardhat");
const LockModule = require("../ignition/modules/Lock");

async function main() {
  const { lock } = await hre.ignition.deploy(LockModule);
  const lockAddress = await lock.getAddress();
  console.log("Deployed Forwarder Address: ", lockAddress);
}

main().catch(console.error);
