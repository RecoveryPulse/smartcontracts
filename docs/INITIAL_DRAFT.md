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
type RecoveryContract {
    recoveryStatus: "<current status>" // can be any of these active / successful / declined / inactive
    recoveryConditionContractAddress: "<contract address>" // contract address of the recovery condition contract
    cooldownPeriod: "<N Days>" // time for which recovery will be blocked after the last status change

    // modifier function
    function startRecovery(newOwner: "new address"): "<recovery status>" // function that triggers the contract recovery

    // modifier function
    function cancelRecovery(): "<recovery status>" // function that overrides the contract recovery

    // modifier function
    function finaliseRecovery(): return "<recovery status>" { // function that finilises the contract recovery after the recovery condition is met
        ...
        const recoverable = isRecoverable(selfAddress)
        if (recoverable) {
            return "success case";
        } else {
            return "success case";
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
            return "success case";
        } else {
            return "error case";
        }
        ...
    }
}
```

