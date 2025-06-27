// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.0;

// Define the structs that match VRFV2PlusClient
library VRFV2PlusClient {
    struct RandomWordsRequest {
        bytes32 keyHash;
        uint256 subId;
        uint16 requestConfirmations;
        uint32 callbackGasLimit;
        uint32 numWords;
        bytes extraArgs;
    }
    
    struct ExtraArgsV1 {
        bool nativePayment;
    }
    
    function _argsToBytes(ExtraArgsV1 memory extraArgs) internal pure returns (bytes memory) {
        return abi.encode(extraArgs);
    }
}

interface VRFConsumerBase {
    function rawFulfillRandomWords(uint256 requestId, uint256[] memory randomWords) external;
}

contract MockVRFCoordinator {
    uint256 private requestCounter = 0;
    mapping(uint256 => address) private requestIdToConsumer;
    
    // This matches the signature expected by VRFConsumerBaseV2Plus
    function requestRandomWords(
        VRFV2PlusClient.RandomWordsRequest calldata req
    ) external returns (uint256) {
        requestCounter++;
        requestIdToConsumer[requestCounter] = msg.sender;
        return requestCounter;
    }
    
    // Helper function to simulate VRF fulfillment
    function fulfillRandomWords(uint256 requestId, uint256[] memory randomWords) internal {
        address consumer = requestIdToConsumer[requestId];
        require(consumer != address(0), "Invalid request ID");
        
        // Call the consumer's callback
        VRFConsumerBase(consumer).rawFulfillRandomWords(requestId, randomWords);
    }
    
    // Convenience function to auto-fulfill with a random number
    function fulfillRandomWordsWithRandom(uint256 requestId) external {
        uint256[] memory randomWords = new uint256[](1);
        randomWords[0] = uint256(keccak256(abi.encodePacked(block.timestamp, block.difficulty, requestId)));
        fulfillRandomWords(requestId, randomWords);
    }
}