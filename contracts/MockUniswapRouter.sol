// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.0;

contract MockUniswapRouter {
    uint256 private ethOutput;

    function WETH() external pure returns (address) {
        return 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2; // Mainnet WETH
    }

    function setETHOutput(uint256 _ethOutput) external {
        ethOutput = _ethOutput;
    }

    function getAmountsOut(
        uint256,
        address[] memory path
    ) external view returns (uint256[] memory) {
        uint256[] memory amounts = new uint256[](path.length);
        amounts[0] = 1000; // Input amount
        amounts[1] = ethOutput; // Output amount
        return amounts;
    }

    function swapExactTokensForETH(
        uint256,
        uint256,
        address[] memory,
        address to,
        uint256
    ) external returns (uint256[] memory) {
        // Send ETH to recipient
        payable(to).transfer(ethOutput);

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1000;
        amounts[1] = ethOutput;
        return amounts;
    }

    receive() external payable {}
}
