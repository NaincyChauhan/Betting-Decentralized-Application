// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

/**
 * Import required OpenZeppelin contracts for security and standards
 * Import Chainlink contracts for price feeds and VRF (Verifiable Random Function)
 * Import Uniswap V2 router for token swapping functionality
 */

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

/**
 * @title IERC20Metadata
 * @dev Interface to get token metadata (specifically decimals)
 */
interface IERC20Metadata {
    function decimals() external view returns (uint8);
}

/**
 * @title Betapp
 * @dev A decentralized betting platform that allows users to create and join bets using ERC20 tokens
 * @notice This contract implements a betting system where:
 *         - Users create bets with ERC20 tokens
 *         - Other users can join by staking the same amount
 *         - Winners are selected randomly using Chainlink VRF
 *         - Tokens are swapped to ETH via Uniswap before distribution
 */
contract Betapp is ReentrancyGuard, VRFConsumerBaseV2Plus {
    using SafeERC20 for IERC20;

    /**
     * @dev Struct representing a betting pool
     * @param creator Address of the user who created the bet
     * @param token ERC20 token address used for betting
     * @param amount Amount of tokens required to join the bet
     * @param endtime Timestamp when the bet expires
     * @param closed Whether the bet has been closed and tokens swapped to ETH
     * @param winner Address of the randomly selected winner (set after VRF callback)
     * @param participants Array of addresses that joined the bet
     * @param totalEtherValue Total ETH value after swapping all tokens
     */

    struct Bet {
        address creator;
        address token;
        uint256 amount;
        uint256 endtime;
        bool closed;
        address winner;
        address[] participants;
        uint256 totalEtherValue;
    }

    // VRF Configuration
    uint256 private immutable i_subscriptionId;
    bytes32 private immutable i_keyHash;
    uint32 private immutable i_callbackGasLimit;
    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint32 private constant NUM_WORDS = 1;

    // Contract configuration
    uint256 public fee = 1;
    uint256 public betIdCount;
    uint256 public slippageTolerance = 300;

    // Uniswap V2 router for token swapping
    IUniswapV2Router02 public immutable uniswapRouter;

    // State mappings
    mapping(uint256 => Bet) public bets;
    mapping(address => bool) public supportedTokens;
    mapping(address => address) public tokenPriceFeeds;
    mapping(uint256 => uint256) public vrfRequestToBetId;

    // Events for tracking contract activity
    event BetCreated(
        uint256 indexed betId,
        address indexed creator,
        address token,
        uint256 amount,
        uint256 endtime
    );

    event BetJoined(uint256 indexed betId, address indexed participant);

    event BetClosed(uint256 indexed betId, uint256 totalEtherValue);

    event TokensSwappedToETH(
        uint256 indexed betId,
        uint256 tokenAmount,
        uint256 ethReceived
    );

    event WinnerRequested(uint256 indexed betId, uint256 indexed requestId);

    event WinnerSelected(
        uint256 indexed betId,
        address indexed winner,
        uint256 winningAmount,
        uint256 feeAmount
    );

    /**
     * @dev Constructor to initialize the contract with VRF and Uniswap configurations
     * @param vrfCoordinatorV2Plus Address of the Chainlink VRF Coordinator
     * @param subscriptionId Chainlink VRF subscription ID
     * @param keyHash Gas lane key hash for VRF requests
     * @param callbackGasLimit Gas limit for VRF callback function
     * @param _uniswapRouter Address of the Uniswap V2 Router
     */
    constructor(
        address vrfCoordinatorV2Plus,
        uint256 subscriptionId,
        bytes32 keyHash,
        uint32 callbackGasLimit,
        address _uniswapRouter
    ) VRFConsumerBaseV2Plus(vrfCoordinatorV2Plus) {
        i_subscriptionId = subscriptionId;
        i_keyHash = keyHash;
        i_callbackGasLimit = callbackGasLimit;
        uniswapRouter = IUniswapV2Router02(_uniswapRouter);
    }

    /**
     * @dev Adds a new token to the list of supported tokens for betting
     * @param token Address of the ERC20 token to support
     * @param priceFeed Address of the Chainlink price feed for the token
     * @notice Only the contract owner can call this function
     */
    function addSupportedToken(
        address token,
        address priceFeed
    ) external onlyOwner {
        require(token != address(0), "Invalid token address");
        require(priceFeed != address(0), "Invalid price feed address");
        require(!supportedTokens[token], "Token already supported");

        supportedTokens[token] = true;
        tokenPriceFeeds[token] = priceFeed;
    }

    /**
     * @dev Removes a token from the list of supported tokens
     * @param token Address of the ERC20 token to remove
     * @notice Only the contract owner can call this function
     */
    function removeSupportedToken(address token) external onlyOwner {
        require(supportedTokens[token], "Token already unsupported");
        supportedTokens[token] = false;
    }

    /**
     * @dev Creates a new betting pool
     * @param _token Address of the ERC20 token to use for betting
     * @param _amount Amount of tokens required to join the bet
     * @param _duration Duration of the bet in seconds from current time
     */
    function createBet(
        address _token,
        uint256 _amount,
        uint256 _duration
    ) external {
        require(_amount > 0, "Bet amount must be greater than zero");
        require(_duration > 0, "Duration must be greater than zero");
        require(supportedTokens[_token], "Token not supported");

        betIdCount++;
        uint256 betId = betIdCount;
        Bet storage bet = bets[betId];
        bet.creator = msg.sender;
        bet.token = _token;
        bet.amount = _amount;
        bet.endtime = block.timestamp + _duration;
        bet.closed = false;
        emit BetCreated(betId, msg.sender, _token, _amount, bet.endtime);
    }

    /**
     * @dev Allows a user to join an existing bet by staking the required tokens
     * @param _betId ID of the bet to join
     * @notice Users must approve the contract to spend their tokens before calling this function
     */
    function joinBet(uint256 _betId) external nonReentrant {
        Bet storage bet = bets[_betId];

        require(bet.creator != address(0), "Bet does not exist");
        require(!bet.closed, "Bet is closed");
        require(block.timestamp < bet.endtime, "Bet duration has expired");

        for (uint256 i = 0; i < bet.participants.length; i++) {
            require(
                bet.participants[i] != msg.sender,
                "You have already joined this bet"
            );
        }

        IERC20 token = IERC20(bet.token);
        uint256 userBalance = token.balanceOf(msg.sender);
        uint256 allowance = token.allowance(msg.sender, address(this));

        require(userBalance >= bet.amount, "Insufficient token balance");
        require(allowance >= bet.amount, "Insufficient token allowance");

        token.safeTransferFrom(msg.sender, address(this), bet.amount);
        bet.participants.push(msg.sender);
        emit BetJoined(_betId, msg.sender);
    }

    /**
     * @dev Ends a bet by swapping all staked tokens to ETH via Uniswap
     * @param _betId ID of the bet to end
     * @notice Can only be called by the bet creator or a participant after the bet duration expires
     */
    function endBet(uint256 _betId) external nonReentrant {
        Bet storage bet = bets[_betId];

        bool isParticipant = false;
        for (uint256 i = 0; i < bet.participants.length; i++) {
            if (bet.participants[i] == msg.sender) {
                isParticipant = true;
                break;
            }
        }

        require(
            msg.sender == bet.creator || isParticipant,
            "Only Bet creator or participant can close this bet"
        );
        require(bet.creator != address(0), "Bet does not exist");
        require(!bet.closed, "Bet is already closed");
        require(
            block.timestamp > bet.endtime,
            "The Bet duration not ended now"
        );

        uint256 totalTokenAmount = _calculateTotalBetAmount(_betId);
        uint256 ethReceived = _swapTokensToETH(bet.token, totalTokenAmount);

        bet.totalEtherValue = ethReceived;
        bet.closed = true;
        emit BetClosed(_betId, bet.totalEtherValue);
    }

    /**
     * @dev Internal function to swap ERC20 tokens to ETH using Uniswap V2
     * @param token Address of the token to swap
     * @param tokenAmount Amount of tokens to swap
     * @return ethReceived Amount of ETH received from the swap
     */
    function _swapTokensToETH(
        address token,
        uint256 tokenAmount
    ) internal returns (uint256 ethReceived) {
        require(tokenAmount > 0, "Token amount must be greater than zero");

        IERC20 tokenContract = IERC20(token);

        // Approve the router to spend tokens
        tokenContract.forceApprove(address(uniswapRouter), tokenAmount);

        address[] memory path = new address[](2);
        path[0] = token;
        path[1] = uniswapRouter.WETH();

        uint256[] memory expectedAmounts = uniswapRouter.getAmountsOut(
            tokenAmount,
            path
        );
        uint256 expectedETH = expectedAmounts[1];

        uint256 minAmountOut = (expectedETH * (10000 - slippageTolerance)) /
            10000;

        uint256 ethBefore = address(this).balance;

        // Perform the swap
        uniswapRouter.swapExactTokensForETH(
            tokenAmount,
            minAmountOut,
            path,
            address(this),
            block.timestamp + 300
        );

        ethReceived = address(this).balance - ethBefore;

        return ethReceived;
    }

    /**
     * @dev Internal function to convert token amounts to ETH value using Chainlink price feeds
     * @param token Address of the token
     * @param tokenAmount Amount of tokens to convert
     * @return etherValue Equivalent ETH value
     * @notice This is used for display purposes only, actual swaps use Uniswap
     */
    function _convertTokensToEther(
        address token,
        uint256 tokenAmount
    ) internal view returns (uint256 etherValue) {
        require(
            tokenPriceFeeds[token] != address(0),
            "Price feed not available for token"
        );

        AggregatorV3Interface priceFeed = AggregatorV3Interface(
            tokenPriceFeeds[token]
        );

        (, int256 price, , uint256 updatedAt, ) = priceFeed.latestRoundData();

        require(price > 0, "Invalid price from oracle");
        require(updatedAt > 0, "Price data is stale");

        uint8 tokenDecimals = IERC20Metadata(token).decimals();
        uint8 priceDecimals = priceFeed.decimals();

        etherValue =
            (tokenAmount * uint256(price) * 1e18) /
            (10 ** tokenDecimals * 10 ** priceDecimals);

        return etherValue;
    }

    /**
     * @dev Internal function to calculate total token amount in a bet
     * @param _betId ID of the bet
     * @return totalAmount Total amount of tokens staked in the bet
     */
    function _calculateTotalBetAmount(
        uint256 _betId
    ) internal view returns (uint256 totalAmount) {
        Bet storage bet = bets[_betId];
        totalAmount = bet.amount * bet.participants.length;
        return totalAmount;
    }

    /**
     * @dev Returns the estimated ETH value of a bet using Chainlink price feeds
     * @param _betId ID of the bet
     * @return etherValue Estimated ETH value of all staked tokens
     */
    function getBetEtherValue(
        uint256 _betId
    ) external view returns (uint256 etherValue) {
        Bet storage bet = bets[_betId];
        require(bet.creator != address(0), "Bet does not exist");

        uint256 totalTokenAmount = _calculateTotalBetAmount(_betId);
        return _convertTokensToEther(bet.token, totalTokenAmount);
    }

    /**
     * @dev Requests a random number from Chainlink VRF to select a winner
     * @param _betId ID of the bet to select winner for
     * @notice Only the bet creator can call this function after the bet is closed
     */
    function selectWinner(uint256 _betId) external nonReentrant {
        Bet storage bet = bets[_betId];

        require(bet.creator != address(0), "Bet does not exist");
        require(
            msg.sender == bet.creator,
            "Only bet creator can select winner"
        );
        require(bet.closed, "Bet must be closed first");
        require(bet.winner == address(0), "Winner already selected");
        require(bet.participants.length > 0, "No participants in bet");
        require(bet.totalEtherValue > 0, "No ETH available for distribution");

        // Request randomness using VRF V2.5 with ETH payment (nativePayment = true)
        uint256 requestId = s_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash: i_keyHash,
                subId: i_subscriptionId,
                requestConfirmations: REQUEST_CONFIRMATIONS,
                callbackGasLimit: i_callbackGasLimit,
                numWords: NUM_WORDS,
                extraArgs: VRFV2PlusClient._argsToBytes(
                    VRFV2PlusClient.ExtraArgsV1({nativePayment: true})
                )
            })
        );

        vrfRequestToBetId[requestId] = _betId;

        emit WinnerRequested(_betId, requestId);
    }

    /**
     * @dev Callback function called by Chainlink VRF with random number
     * @param requestId ID of the VRF request
     * @param randomWords Array of random numbers (we only use the first one)
     * @notice This function automatically selects the winner and distributes ETH
     */
    function fulfillRandomWords(
        uint256 requestId,
        uint256[] calldata randomWords
    ) internal override {
        uint256 betId = vrfRequestToBetId[requestId];
        Bet storage bet = bets[betId];

        require(bet.creator != address(0), "Invalid bet");
        require(bet.winner == address(0), "Winner already selected");
        require(bet.totalEtherValue > 0, "Tokens not swapped to ETH");
        require(bet.participants.length > 0, "No participants");

        // Select winner based on random number
        uint256 winnerIndex = randomWords[0] % bet.participants.length;
        address winner = bet.participants[winnerIndex];
        bet.winner = winner;

        // Calculate winner amount and fees
        uint256 totalAmount = bet.totalEtherValue;
        uint256 feeAmount = (totalAmount * fee) / 100;
        uint256 winnerAmount = totalAmount - feeAmount;

        // Transfer winnings to the selected winner
        if (winnerAmount > 0) {
            (bool success, ) = payable(winner).call{value: winnerAmount}("");
            require(success, "ETH transfer to winner failed");
        }

        emit WinnerSelected(betId, winner, winnerAmount, feeAmount);
    }

    /**
     * @dev Returns the list of participants for a specific bet
     * @param _betId ID of the bet
     * @return Array of participant addresses
     */
    function getBetParticipants(
        uint256 _betId
    ) external view returns (address[] memory) {
        return bets[_betId].participants;
    }

    /**
     * @dev Receive function to accept ETH payments (needed for Uniswap swaps)
     */
    receive() external payable {}

    /**
     * @dev Fallback function to accept ETH payments
     */
    fallback() external payable {}
}
