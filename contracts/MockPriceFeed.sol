// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.0;

contract MockPriceFeed {
    uint8 public decimals;
    int256 public price;
    uint256 public updatedAt;
    
    constructor(uint8 _decimals, int256 _price) {
        decimals = _decimals;
        price = _price;
        updatedAt = block.timestamp;
    }
    
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt_,
        uint80 answeredInRound
    ) {
        return (1, price, block.timestamp, updatedAt, 1);
    }
}