// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.0;

interface VRFConsumerBase {
    function rawFulfillRandomWords(uint256 requestId, uint256[] memory randomWords) external;
}

contract MockVRFCoordinator {
    uint256 private requestCounter = 0;
    
    function requestRandomWords(bytes memory) external returns (uint256) {
        requestCounter++;
        return requestCounter;
    }
    
    function fulfillRandomWords(uint256 requestId, uint256[] memory randomWords) external {
        // Call the consumer's callback
        VRFConsumerBase(msg.sender).rawFulfillRandomWords(requestId, randomWords);
    }
}