// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MockUniswapRouter
 * @dev Mock implementation of Uniswap V2 Router for testing purposes
 */
contract MockUniswapRouter {
    address public immutable WETH;
    
    // Mock exchange rate: 1 token = 0.001 ETH (adjustable for testing)
    uint256 public mockExchangeRate = 1000000000000000; // 0.001 ETH in wei
    
    event SwapExecuted(
        uint256 amountIn,
        uint256 amountOut,
        address[] path,
        address to
    );
    
    constructor(address _weth) {
        WETH = _weth;
    }
    
    /**
     * @dev Set mock exchange rate for testing
     * @param _rate New exchange rate in wei (how much ETH per token)
     */
    function setMockExchangeRate(uint256 _rate) external {
        mockExchangeRate = _rate;
    }
    
    /**
     * @dev Mock implementation of getAmountsOut
     * @param amountIn Amount of input tokens
     * @param path Array of token addresses (token -> WETH)
     * @return amounts Array of output amounts
     */
    function getAmountsOut(uint256 amountIn, address[] memory path)
        external
        view
        returns (uint256[] memory amounts)
    {
        require(path.length >= 2, "Invalid path");
        require(path[path.length - 1] == WETH, "Path must end with WETH");
        
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        
        // For simplicity, assume direct conversion for mock
        // In reality, this would calculate through multiple pairs
        amounts[path.length - 1] = (amountIn * mockExchangeRate) / (10**18);
        
        return amounts;
    }
    
    /**
     * @dev Mock implementation of swapExactTokensForETH
     * @param amountIn Amount of input tokens
     * @param amountOutMin Minimum amount of ETH to receive
     * @param path Array of token addresses
     * @param to Address to send ETH to
     * @param deadline Transaction deadline
     * @return amounts Array of amounts swapped
     */
    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        require(deadline >= block.timestamp, "Transaction expired");
        require(path.length >= 2, "Invalid path");
        require(path[path.length - 1] == WETH, "Path must end with WETH");
        require(amountIn > 0, "Amount in must be greater than 0");
        
        // Transfer tokens from sender to this contract
        IERC20 tokenIn = IERC20(path[0]);
        require(
            tokenIn.transferFrom(msg.sender, address(this), amountIn),
            "Token transfer failed"
        );
        
        // Calculate ETH amount to send
        uint256 ethAmount = (amountIn * mockExchangeRate) / (10**18);
        require(ethAmount >= amountOutMin, "Insufficient output amount");
        require(address(this).balance >= ethAmount, "Insufficient ETH in router");
        
        // Send ETH to recipient
        (bool success, ) = payable(to).call{value: ethAmount}("");
        require(success, "ETH transfer failed");
        
        // Return amounts array
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = ethAmount;
        
        emit SwapExecuted(amountIn, ethAmount, path, to);
        
        return amounts;
    }
    
    /**
     * @dev Function to add ETH to the router for testing
     */
    receive() external payable {}
    
    /**
     * @dev Function to fund the router with ETH for testing
     */
    function fundRouter() external payable {}
    
    /**
     * @dev Emergency function to withdraw ETH (for testing only)
     */
    function withdrawETH(uint256 amount) external {
        require(address(this).balance >= amount, "Insufficient balance");
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "ETH withdrawal failed");
    }
    
    /**
     * @dev Get router ETH balance
     */
    function getETHBalance() external view returns (uint256) {
        return address(this).balance;
    }
}