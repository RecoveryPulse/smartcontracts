# Recovery Pulse Integration Guide

A comprehensive guide for integrating the Recovery Pulse system into your smart contracts.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Integration Options](#integration-options)
- [Step-by-Step Integration](#step-by-step-integration)
- [Recovery Conditions](#recovery-conditions)
- [Deployment](#deployment)
- [Testing Your Integration](#testing-your-integration)
- [Security Considerations](#security-considerations)
- [FAQ](#faq)
- [Code References](#code-references)

---

## Overview

Recovery Pulse is a modular smart contract recovery system that enables secure ownership transfer when specific conditions are met. It's designed for scenarios where:

- **Dead Man's Switch**: Automatically transfer ownership if the owner becomes inactive
- **Guardian Recovery**: Allow a trusted guardian to initiate recovery
- **Multi-sig Fallback**: Provide backup access to locked funds

### Key Features

- ✅ **Modular Design**: Plug-in different recovery conditions
- ✅ **Cooldown Protection**: Prevents rapid configuration changes
- ✅ **2-Step Recovery**: Guardian triggers, new owner finalizes
- ✅ **Cancellable**: Owner can cancel active recovery if still accessible

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Your Contract                               │
│                (inherits from Recoverable)                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ startRecovery() / resetRecovery()
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Recovery Condition                             │
│         (SimpleCondition or RecoveryPulseCondition)             │
│                                                                  │
│  • Decides WHEN recovery is allowed                              │
│  • Guardian triggers recovery                                    │
│  • Calls startRecovery() on your contract                        │
└─────────────────────────────────────────────────────────────────┘
```

### Recovery Flow

```
1. Guardian calls triggerRecovery(newOwner) on Condition
       │
       ▼
2. Condition calls startRecovery(newOwner) on Recoverable
       │
       ▼
3. Recovery status → Active, pendingOwner set
       │
       ├──→ Owner calls cancelRecovery() [Optional - if owner regains access]
       │
       ▼
4. New owner calls finaliseRecovery()
       │
       ▼
5. Ownership transfers, condition resets, status → Inactive
```

---

## Quick Start

### 1. Install Dependencies

```bash
npm install @openzeppelin/contracts
```

### 2. Inherit from Recoverable

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./Recoverable.sol";

contract MyContract is Recoverable {
    constructor(
        address _recoveryCondition,
        uint256 _cooldownPeriod
    ) Recoverable(_recoveryCondition, _cooldownPeriod) {
        // Your initialization
    }

    // Your contract logic
}
```

### 3. Deploy

```bash
npx hardhat run scripts/deploy-simple.js --network <network>
```

---

## Integration Options

### Option A: SimpleCondition (Guardian-Triggered)

Best for: Contracts where a trusted guardian should be able to initiate recovery at any time.

```solidity
// Guardian can trigger recovery whenever needed
simpleCondition.triggerRecovery(newOwnerAddress);
```

**Use Cases:**
- Multi-sig wallet backup
- DAO treasury recovery
- Team-controlled contracts

### Option B: RecoveryPulseCondition (Heartbeat-Based)

Best for: Dead man's switch scenarios where recovery should only be possible after inactivity.

```solidity
// Maintainer sends regular heartbeats
recoveryPulseCondition.updatePulse(anyValue);

// After timeout without heartbeat, guardian can trigger
recoveryPulseCondition.triggerRecovery(newOwnerAddress);
```

**Use Cases:**
- Personal wallets with inheritance planning
- Long-term savings contracts
- Automated failsafe systems

### Option C: Custom Condition

Create your own condition by implementing `IRecoveryCondition`:

```solidity
interface IRecoveryCondition {
    function isRecoverable() external view returns (bool);
    function canTriggerRecovery() external view returns (bool);
    function triggerRecovery(address newOwner) external;
    function resetRecovery() external;
}
```

---

## Step-by-Step Integration

### Step 1: Create Your Contract

```solidity
// contracts/MyVault.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./Recoverable.sol";

contract MyVault is Recoverable {
    mapping(address => uint256) public balances;

    constructor(
        address _recoveryCondition,
        uint256 _cooldownPeriod
    ) Recoverable(_recoveryCondition, _cooldownPeriod) {}

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw(uint256 amount) external onlyOwner {
        require(address(this).balance >= amount, "Insufficient balance");
        payable(owner()).transfer(amount);
    }
}
```

### Step 2: Write Deployment Script

```javascript
// scripts/deploy-my-vault.js
const hre = require("hardhat");

async function main() {
    const [deployer] = await hre.ethers.getSigners();

    const guardianAddress = process.env.GUARDIAN_ADDRESS || deployer.address;
    const cooldownPeriod = 86400; // 1 day

    // Deploy condition
    const SimpleCondition = await hre.ethers.getContractFactory("SimpleCondition");
    const condition = await SimpleCondition.deploy(guardianAddress, hre.ethers.ZeroAddress);
    await condition.waitForDeployment();

    // Deploy vault
    const MyVault = await hre.ethers.getContractFactory("MyVault");
    const vault = await MyVault.deploy(await condition.getAddress(), cooldownPeriod);
    await vault.waitForDeployment();

    // Link condition to vault
    await condition.setRecoverableContract(await vault.getAddress());

    console.log("Condition:", await condition.getAddress());
    console.log("Vault:", await vault.getAddress());
}

main().catch(console.error);
```

### Step 3: Write Tests

```javascript
// test/MyVault.js
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

describe("MyVault", function () {
    async function deployFixture() {
        const [owner, guardian, newOwner] = await ethers.getSigners();
        const cooldown = 86400;

        const SimpleCondition = await ethers.getContractFactory("SimpleCondition");
        const condition = await SimpleCondition.deploy(guardian.address, ethers.ZeroAddress);

        const MyVault = await ethers.getContractFactory("MyVault");
        const vault = await MyVault.deploy(condition.target, cooldown);

        await condition.connect(guardian).setRecoverableContract(vault.target);

        return { vault, condition, owner, guardian, newOwner, cooldown };
    }

    it("should complete recovery flow", async function () {
        const { vault, condition, guardian, newOwner, cooldown } = await loadFixture(deployFixture);

        // Wait for cooldown
        await time.increase(cooldown + 1);

        // Guardian triggers recovery
        await condition.connect(guardian).triggerRecovery(newOwner.address);

        // New owner finalizes
        await vault.connect(newOwner).finaliseRecovery();

        expect(await vault.owner()).to.equal(newOwner.address);
    });
});
```

### Step 4: Deploy

```bash
# Local testing
npx hardhat run scripts/deploy-my-vault.js

# Testnet
GUARDIAN_ADDRESS=0x... npx hardhat run scripts/deploy-my-vault.js --network sepolia

# Mainnet
GUARDIAN_ADDRESS=0x... npx hardhat run scripts/deploy-my-vault.js --network mainnet
```

---

## Recovery Conditions

### SimpleCondition

| Function | Access | Description |
|----------|--------|-------------|
| `triggerRecovery(newOwner)` | Guardian | Starts recovery process |
| `resetRecovery()` | Recoverable Contract | Resets state after finalization |
| `setRecoverableContract(addr)` | Guardian | Links to recoverable contract |
| `isRecoverable()` | View | Returns true if recovery triggered |
| `canTriggerRecovery()` | View | Returns true if can trigger |

### RecoveryPulseCondition

| Function | Access | Description |
|----------|--------|-------------|
| `updatePulse(value)` | Maintainer | Sends heartbeat, resets timeout |
| `triggerRecovery(newOwner)` | Guardian | Starts recovery (if timeout exceeded) |
| `updateRecoveryTimeout(seconds)` | Maintainer | Changes timeout period |
| `updateGuardian(addr)` | Maintainer | Changes guardian |
| `updateMaintainer(addr)` | Maintainer | Changes maintainer |
| `setRecoverableContract(addr)` | Maintainer | Links to recoverable contract |
| `isTimeoutExceeded()` | View | True if timeout passed |
| `getTimeUntilRecovery()` | View | Seconds until recovery possible |

---

## Deployment

### Available Scripts

| Script | Use Case |
|--------|----------|
| `deploy.js` | Default: SimpleCondition + Recoverable |
| `deploy-simple.js` | SimpleCondition + Recoverable |
| `deploy-recovery-pulse.js` | RecoveryPulseCondition + Recoverable |
| `deploy-lock-simple.js` | SimpleCondition + RecoverableLock |
| `deploy-lock-pulse.js` | RecoveryPulseCondition + RecoverableLock |

### Environment Variables

```bash
# Common
COOLDOWN_PERIOD=86400          # 1 day (seconds)
GUARDIAN_ADDRESS=0x...         # Guardian address

# Pulse-specific
MAINTAINER_ADDRESS=0x...       # Maintainer address
RECOVERY_TIMEOUT=604800        # 7 days (seconds)

# Lock-specific
LOCK_DURATION=2592000          # 30 days (seconds)
```

### Deployment Order

Due to circular dependency, deployment follows this order:

```
1. Deploy Condition (with zero address for recoverable)
2. Deploy Recoverable (with condition address)
3. Link Condition to Recoverable (setRecoverableContract)
```

---

## Testing Your Integration

### Run Existing Tests

```bash
# All tests
npx hardhat test

# Specific test file
npx hardhat test test/Recoverable.js
npx hardhat test test/RecoveryPulseCondition.js
npx hardhat test test/RecoverableLock.js
```

### Test Scenarios to Cover

1. **Happy Path**: Full recovery flow (trigger → finalize)
2. **Cancellation**: Owner cancels active recovery
3. **Access Control**: Non-guardian cannot trigger, non-owner cannot cancel
4. **Cooldown**: Actions respect cooldown period
5. **Edge Cases**: Zero address, same owner, multiple cycles

### Time Manipulation in Tests

```javascript
const { time } = require("@nomicfoundation/hardhat-network-helpers");

// Increase time by cooldown period
await time.increase(cooldownPeriod + 1);

// Set specific timestamp
await time.increaseTo(specificTimestamp);
```

---

## Security Considerations

### Guardian Selection

- ✅ Use a multi-sig wallet as guardian for high-value contracts
- ✅ Consider using a hardware wallet
- ❌ Never use a hot wallet for production

### Cooldown Period

- **Short (1 day)**: Higher flexibility, lower security
- **Medium (7 days)**: Balanced approach
- **Long (30 days)**: Higher security, lower flexibility

### Recovery Timeout (Pulse)

- Should be long enough for legitimate inactivity periods
- Consider vacations, illness, etc.
- Recommended minimum: 30 days for personal use

### Best Practices

1. **Test thoroughly** on testnets before mainnet
2. **Document** guardian and maintainer addresses
3. **Store** recovery information securely offline
4. **Monitor** recovery events using event listeners
5. **Never** set cooldown to 0 in production

---

## FAQ

### General Questions

**Q: Can I use this with any ERC20/ERC721 contract?**
A: Yes, inherit from `Recoverable` in your token contract. The ownership transfer will give the new owner control over all owner-restricted functions.

**Q: What happens to funds during recovery?**
A: Funds remain in the contract. Only ownership transfers. The new owner gains access to owner-only functions.

**Q: Can recovery be triggered multiple times?**
A: Not simultaneously. After finalization or reset, recovery can be triggered again.

**Q: What if the guardian loses access?**
A: The owner can update the recovery condition to use a new guardian (respecting cooldown).

### SimpleCondition

**Q: Can the guardian steal funds?**
A: No. The guardian can only initiate recovery. The pending owner must finalize, and the original owner can cancel.

**Q: Why does triggerRecovery not need approval?**
A: The system is designed so guardians are trusted parties. The 2-step process (trigger + finalize) provides a safety window.

### RecoveryPulseCondition

**Q: How often should I send heartbeats?**
A: Depends on your timeout. If timeout is 30 days, sending weekly heartbeats provides comfortable margin.

**Q: What's the pulse value used for?**
A: It's informational. You can use it to track activity count, timestamp, or any meaningful value.

**Q: Can the maintainer prevent recovery indefinitely?**
A: Yes, by continuously sending heartbeats. This is by design - an active maintainer shouldn't trigger recovery.

### Troubleshooting

**Q: "Cooldown not passed" error**
A: Wait for the cooldown period to elapse since the last recovery action.

**Q: "Only recovery condition can call" error**
A: Ensure the condition contract's `recoverableContract` is set to your contract address.

**Q: "Recovery not active" error**
A: Recovery must be triggered before finalization can occur.

**Q: Tests fail with "Recoverable contract not set"**
A: Call `setRecoverableContract()` on the condition after deployment.

---

## Code References

### Core Contracts

| File | Description |
|------|-------------|
| [Recoverable.sol](../contracts/Recoverable.sol) | Main recovery contract to inherit |
| [IRecoverable.sol](../contracts/interfaces/IRecoverable.sol) | Recoverable interface |
| [IRecoveryCondition.sol](../contracts/interfaces/IRecoveryCondition.sol) | Condition interface |

### Recovery Conditions

| File | Description |
|------|-------------|
| [SimpleCondition.sol](../contracts/modules/SimpleCondition.sol) | Guardian-triggered recovery |
| [RecoveryPulseCondition.sol](../contracts/modules/RecoveryPulseCondition.sol) | Heartbeat-based recovery |
| [MockRecoveryCondition.sol](../contracts/test/MockRecoveryCondition.sol) | Testing utility |

### Examples

| File | Description |
|------|-------------|
| [RecoverableLock.sol](../contracts/examples/RecoverableLock.sol) | Time-locked vault example |

### Tests

| File | Description |
|------|-------------|
| [Recoverable.js](../test/Recoverable.js) | Core contract tests |
| [RecoveryPulseCondition.js](../test/RecoveryPulseCondition.js) | Pulse condition tests |
| [RecoverableLock.js](../test/RecoverableLock.js) | Lock example tests |

### Deploy Scripts

| File | Description |
|------|-------------|
| [deploy.js](../scripts/deploy.js) | Default deployment |
| [deploy-simple.js](../scripts/deploy-simple.js) | Simple recovery deployment |
| [deploy-recovery-pulse.js](../scripts/deploy-recovery-pulse.js) | Pulse recovery deployment |
| [deploy-lock-simple.js](../scripts/deploy-lock-simple.js) | Lock + simple condition |
| [deploy-lock-pulse.js](../scripts/deploy-lock-pulse.js) | Lock + pulse condition |

---

## Support

- **Issues**: Open an issue in the repository
- **Examples**: See [RecoverableLock.sol](../contracts/examples/RecoverableLock.sol)
- **Tests**: Reference test files for usage patterns

---

## License

MIT License - See [LICENSE](../LICENSE) for details.
