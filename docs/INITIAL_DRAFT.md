# Inital Draft

Recoverable contracts with a cooldown period offer a mechanism for managing ownership transfer and recovery processes within smartcontracts.

## Overview

![Overview](https://github.com/RecoveryPulse/smartcontracts/blob/c2a375e02ab4253890cfb1564be7fd3218dad51d/docs/Overview.png)

## Key Components

1. **Recovery Condition Contract:**
    - At the heart of this design lies the concept of a recovery condition contract. This contract defines the criteria or conditions that must be met before ownership transfer is allowed. By encapsulating recovery logic within a separate contract, the system gains flexibility and extensibility.
    - The recovery condition contract provides an interface that allows developers to implement custom recovery conditions tailored to the specific requirements of their application. This interface defines a method for assessing whether a proposed ownership transfer is permissible based on predefined criteria.

2. **Two-Step Ownership Recovery:**
    - The ownership recovery process is structured as a two-step mechanism to ensure security and mitigate the risk of unauthorized transfers. 
    - Initially, the trusted address initiates the transfer by specifying the address of the intended new owner. This action triggers the commencement of the transfer process, marking the new owner as pending.
    - The finalization of the transfer requires the new owner to accept after the recovery condition is met.

3. **Cooldown Period:**
    - A crucial feature of this contract design is the incorporation of a cooldown period following any modification to the recovery condition contract. This cooldown period serves to regulate the frequency of changes and promote system stability.
    - After the recovery condition contract is updated, a predefined cooldown period must elapse before another change can be made. This cooldown mechanism helps prevent rapid alterations.


## Pseudo Code

### Recoverable Contract Modifier

```javascript
interface RecoveryCondition {
    function isRecoverable(address mainContract) external view returns (bool);
}

type RecoveryContract {
    recoveryStatus: "<current status>" // can be any of these active / successful / cancelled / inactive
    recoveryConditionContract: "<contract address>" // contract address of the recovery condition contract
    cooldownPeriod: "<N Days>" // time for which recovery will be blocked after the last status change

    // modifier function
    function startRecovery(newOwner: "new address") { // function that triggers/activated the contract recovery
        currentStatus = "active";
        return currentStatus;
    }

    // modifier function
    function cancelRecovery(): { // function that overrides the contract recovery
        if (currentStatus !== "active") {
            return currentStatus
        }
        return "cancelled"
    } 

    // modifier function
    function finaliseRecovery(): { // function that finilises the contract recovery after the recovery condition is met
        ...
        if (currentStatus !== "active") {
            return currentStatus
        }
        const _recoveryCondition = RecoveryCondition(recoveryConditionContract);
        const recoverable = _recoveryCondition.isRecoverable(selfAddress);
        if (recoverable) {
            return "successful";
        } else {
            return currentStatus;
        }
        ...
    }
}
```

### Recovery Condition Template

```javascript
type RecoveryConditionTemplate {
    function isRecoverable(contractAddress: "<contract address>") {
        ...
        if (conditions satisfied) {
            return true;
        } else {
            return false;
        }
        ...
    }
}
```

**Example Recovery Condition Contract:**

```javascript
type RecoveryPulse {
    // wip
}
```
