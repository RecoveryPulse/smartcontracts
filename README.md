# Recovery Pulse Smart Contracts

A secure and flexible smart contract recovery system that allows for ownership transfer through configurable recovery conditions.

## Overview

Recovery Pulse provides a flexible recovery mechanism for smart contracts. It enables secure ownership transfer when specific pre-set conditions are met. The system consists of a main `Recoverable` contract that can be inherited by other contracts, along with modular recovery condition contracts that define when recovery is allowed.

## Architecture

### Core Contracts

#### `Recoverable.sol`
The main recovery contract that provides:
- **Recovery Status Management**: Tracks recovery states (Inactive, Active, Successful, Cancelled)
- **Cooldown Protection**: Prevents rapid recovery condition changes (mitigating usual attack vectors)
- **Ownership Transfer**: Secure transfer of contract ownership
- **Event Emission**: Comprehensive event logging for transparency

#### `IRecoveryCondition.sol`
Interface for recovery condition contracts:
```solidity
interface IRecoveryCondition {
    function isRecoverable(address contractAddress) external view returns (bool);
    function triggerRecovery(address contractAddress) external;
}
```

### Recovery Condition Modules

#### `SimpleRecoveryCondition.sol`
A basic recovery condition implementation:
- **Guardian-based**: Only a trusted guardian can trigger recovery
- **Simple State**: Boolean flag determines if recovery is allowed
- **Event Logging**: Emits events when recovery is triggered

#### `RecoveryPulseCondition.sol`
A time-based recovery condition with counter mechanism:
- **Maintainer Updates**: Designated maintainer can update counter and reset timeout
- **Time-based Recovery**: Guardian can trigger recovery if timeout exceeded since last update
- **Configurable Timeout**: Adjustable recovery timeout period
- **Role Management**: Maintainer can update guardian and maintainer addresses
- **Comprehensive Events**: Detailed event logging for all operations

#### `MockRecoveryCondition.sol`
Testing utility for development:
- **Configurable**: Can be set to always return true or false
- **Test-friendly**: Easy to control in test scenarios

## Features

### Security
- **Cooldown Periods**: Prevents rapid configuration changes
- **Owner-only Operations**: Critical functions restricted to contract owner
- **Condition Verification**: Recovery only proceeds when conditions are met
- **Status Tracking**: Clear recovery state management

### Flexibility
- **Modular Conditions**: Pluggable recovery condition contracts
- **Configurable Cooldowns**: Adjustable time delays
- **Extensible Interface**: Easy to implement custom recovery conditions

### Transparency
- **Event Logging**: All important actions emit events
- **Status Visibility**: Public state variables for monitoring
- **Clear Error Messages**: Descriptive revert reasons

## Recovery Flow

1. **Setup**: Deploy with recovery condition and cooldown period
2. **Trigger**: Guardian triggers recovery in condition contract
3. **Initiate**: Owner starts recovery with new owner address
4. **Verify**: System checks recovery conditions are met
5. **Finalize**: Pending owner completes the transfer
6. **Complete**: Ownership transferred, status reset

## Usage

### Deployment

#### Simple Recovery System
```bash
# Set environment variables (optional)
export COOLDOWN_PERIOD=86400  # 1 day in seconds
export GUARDIAN_ADDRESS=0x...

# Deploy contracts
npx hardhat run scripts/deploy.js --network <network>
```

#### Recovery Pulse Based System
```bash
# Set environment variables (optional)
export COOLDOWN_PERIOD=86400  # 1 day in seconds
export GUARDIAN_ADDRESS=0x...
export MAINTAINER_ADDRESS=0x...
export RECOVERY_TIMEOUT=604800  # 7 days in seconds

# Deploy contracts
npx hardhat run scripts/deploy-recovery-pulse.js --network <network>
```

### Integration

To make your contract recoverable, inherit from `Recoverable`:

```solidity
contract MyContract is Recoverable {
    constructor(
        address _recoveryCondition,
        uint256 _cooldownPeriod
    ) Recoverable(_recoveryCondition, _cooldownPeriod) {
        // Your contract initialization
    }
    
    // Your contract logic
}
```

### Recovery Process

#### Simple Recovery (SimpleRecoveryCondition)
1. **Guardian triggers recovery**:
   ```solidity
   recoveryCondition.triggerRecovery(contractAddress);
   ```

2. **Owner starts recovery**:
   ```solidity
   recoverable.startRecovery(newOwnerAddress);
   ```

3. **Pending owner finalizes**:
   ```solidity
   recoverable.finaliseRecovery();
   ```

#### Recovery Pulse (RecoveryPulseCondition)
1. **Maintainer updates counter** (prevents recovery):
   ```solidity
   recoveryPulseCondition.updateCounter(newCounterValue);
   ```

2. **Guardian triggers recovery** (if timeout exceeded):
   ```solidity
   recoveryPulseCondition.triggerRecovery(contractAddress);
   ```

3. **Owner starts recovery**:
   ```solidity
   recoverable.startRecovery(newOwnerAddress);
   ```

4. **Pending owner finalizes**:
   ```solidity
   recoverable.finaliseRecovery();
   ```

## Development

### Prerequisites
- Node.js 16+
- Hardhat
- OpenZeppelin Contracts

### Installation
```bash
npm install
```

### Testing
```bash
# Run all tests
npx hardhat test

# Run specific test files
npx hardhat test test/Recoverable.js
npx hardhat test test/RecoveryPulseCondition.js
```

### Compilation
```bash
npx hardhat compile
```

### Deployment
```bash
npx hardhat run scripts/deploy.js --network <network>
```

## Contract Addresses

After deployment, you'll get:
- **SimpleRecoveryCondition**: Recovery condition contract
- **Recoverable**: Main recovery contract

## Security Considerations

- **Guardian Selection**: Choose a trusted guardian address
- **Cooldown Periods**: Set appropriate delays for your use case
- **Condition Logic**: Implement secure recovery conditions
- **Testing**: Thoroughly test recovery scenarios
- **Monitoring**: Monitor recovery events and status changes

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## Support

For questions or support, please open an issue in the repository.
