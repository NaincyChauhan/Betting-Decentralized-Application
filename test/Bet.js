const {
    time,
    loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Betapp", function () {
    async function deployBetappFixture() {
        const [owner, creator, participant1, participant2, participant3] = await ethers.getSigners();

        // Deploy mock ERC20 token
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const mocktoken = await MockERC20.deploy("Test Token", "LINK", 18);

        // Deploy mock chainlink price feed
        const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
        const mockPriceFeed = await MockPriceFeed.deploy(8, ethers.parseUnits("2000", 8));

        // Deploy mock VRF Coordinator
        const MockVRFCoordinator = await ethers.getContractFactory("MockVRFCoordinator");
        const mockVRFCoordinator = await MockVRFCoordinator.deploy();

        // Deploy mock Uniswap Router
        const MockUniswapRouter = await ethers.getContractFactory("MockUniswapRouter");
        const mockUniswapRouter = await MockUniswapRouter.deploy();

        // Deploy Betapp contract
        const Betapp = await ethers.getContractFactory("Betapp");
        const betapp = await Betapp.deploy(
            await mockVRFCoordinator.getAddress(),
            1,
            "0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae",
            500000,
            await mockUniswapRouter.getAddress(),
        );

        // Add supported token
        await betapp.addSupportedToken(await mocktoken.getAddress(), await mockPriceFeed.getAddress());

        // Setup token balances and approvals
        const tokenAmount = ethers.parseEther("100");
        await mocktoken.mint(creator.address, tokenAmount);
        await mocktoken.mint(participant1.address, tokenAmount);
        await mocktoken.mint(participant2.address, tokenAmount);
        await mocktoken.mint(participant3.address, tokenAmount);

        return {
            betapp,
            mocktoken,
            mockPriceFeed,
            mockVRFCoordinator,
            mockUniswapRouter,
            owner,
            creator,
            participant1,
            participant2,
            participant3,
            tokenAmount
        };
    }

    describe("Deployment", function () {
        it("Should deploy with correct initial values", async function () {
            const { betapp, mockUniswapRouter } = await loadFixture(deployBetappFixture);

            expect(await betapp.fee()).to.equal(1);
            expect(await betapp.betIdCount()).to.equal(0);
            expect(await betapp.slippageTolerance()).to.equal(300);
            expect(await betapp.uniswapRouter()).to.equal(await mockUniswapRouter.getAddress());
        });
    });

    describe("Token Management", function () {
        it("Should add supported token correctly", async function () {
            const { betapp, mocktoken, mockPriceFeed } = await loadFixture(deployBetappFixture);

            expect(await betapp.supportedTokens(await mocktoken.getAddress())).to.be.true;
            expect(await betapp.tokenPriceFeeds(await mocktoken.getAddress())).to.equal(await mockPriceFeed.getAddress());
        });

        it("Should prevent adding token twice", async function () {
            const { betapp, mocktoken, mockPriceFeed } = await loadFixture(deployBetappFixture);
            await expect(
                betapp.addSupportedToken(await mocktoken.getAddress(), await mockPriceFeed.getAddress())
            ).to.be.revertedWith("Token already supported");
        });

        it("Should prevent adding token with zero address", async function () {
            const { betapp, mockPriceFeed } = await loadFixture(deployBetappFixture);
            await expect(
                betapp.addSupportedToken(ethers.ZeroAddress, await mockPriceFeed.getAddress())
            ).to.be.revertedWith("Invalid token address");
        });

        it("Should remove supported token", async function () {
            const { betapp, mocktoken } = await loadFixture(deployBetappFixture);

            await betapp.removeSupportedToken(await mocktoken.getAddress());
            expect(await betapp.supportedTokens(await mocktoken.getAddress())).to.be.false;
        });

        it("Should only allow owner to manage tokens", async function () {
            const { betapp, mocktoken, mockPriceFeed, participant1 } = await loadFixture(deployBetappFixture);

            await expect(
                betapp.connect(participant1).addSupportedToken(await mocktoken.getAddress(),
                    await mockPriceFeed.getAddress())
            ).to.be.revertedWith("Only callable by owner");
        });
    });

    describe("Bet Creation", function () {
        it("Should create bet successfully", async function () {
            const { betapp, mocktoken, creator } = await loadFixture(deployBetappFixture);
            const betAmount = ethers.parseEther("10");
            const duration = 3600

            const tx = await betapp.connect(creator).createBet(
                await mocktoken.getAddress(),
                betAmount,
                duration
            );

            await expect(tx)
                .to.emit(betapp, "BetCreated")
                .withArgs(1, creator.address, await mocktoken.getAddress(), betAmount, 
                await time.latest() + duration);

            const bet = await betapp.bets(1);
            expect(bet.creator).to.equal(creator.address);
            expect(bet.token).to.equal(await mocktoken.getAddress());
            expect(bet.amount).to.equal(betAmount);
            expect(bet.closed).to.be.false;
            expect(await betapp.betIdCount()).to.equal(1);
        });

        it("Should prevent creating bet with zeor amount", async function () {
            const { betapp, mocktoken, creator } = await loadFixture(deployBetappFixture);

            await expect(betapp.connect(creator).createBet(await mocktoken.getAddress(),0, 3600))
            .to.be.revertedWith("Bet amount must be greater than zero");
        });

        it("Should prevent creating bet with zero duration", async function () {
            const { betapp, mocktoken, creator } = await loadFixture(deployBetappFixture);
            await expect(
                betapp.connect(creator).createBet(await mocktoken.getAddress(), ethers.parseEther("10"), 0)
            ).to.be.revertedWith("Duration must be greater than zero");
        });

        it("Should prevent creating bet with unsupported token", async function () {
            const { betapp, creator } = await loadFixture(deployBetappFixture);
            const MockERC20 = await ethers.getContractFactory("MockERC20");
            const unsupported_token = await MockERC20.deploy("Unsupported", "UNSUP", 18);

            await expect(
                betapp.connect(creator).createBet(await unsupported_token.getAddress(), ethers.parseEther("10"), 3600)
            ).to.be.revertedWith("Token not supported");
        });
    });

    describe("Joining Bets", function () {
        async function createBetFixture() {
            const fixture = await loadFixture(deployBetappFixture);
            const { betapp, mocktoken, creator } = fixture;
            const betAmount = ethers.parseEther("10");
            const duration = 3600;
            await betapp.connect(creator).createBet(
                await mocktoken.getAddress(),
                betAmount,
                duration,
            );
            return { ...fixture, betAmount };
        }

        it("Should join bet successfully", async function () {
            const { betapp, mocktoken, participant1, betAmount } = await loadFixture(createBetFixture);
            await mocktoken.connect(participant1).approve(await betapp.getAddress(), betAmount);

            const tx = await betapp.connect(participant1).joinBet(1);
            await expect(tx)
                .to.emit(betapp, "BetJoined")
                .withArgs(1, participant1.address);
            
            const participants = await betapp.getBetParticipants(1);
            expect(participants).to.include(participant1.address);
            expect(await mocktoken.balanceOf(await betapp.getAddress())).to.equal(betAmount);
        });

        it("Should prevent joining non-existent bet", async function () {
            const { betapp, participant1 } = await loadFixture(createBetFixture);
            await expect(
                betapp.connect(participant1).joinBet(999)
            ).to.be.rejectedWith("Bet does not exist");
        });

        it("Should prevent joining bet twice", async function () {
            const { betapp, mocktoken, participant1, betAmount } = await loadFixture(createBetFixture);
            await mocktoken.connect(participant1).approve(await betapp.getAddress(), betAmount * 2n);
            await betapp.connect(participant1).joinBet(1);

            await expect(
                betapp.connect(participant1).joinBet(1)
            ).to.be.revertedWith("You have already joined this bet");
        });

        it("Should prevent joining the bet with insufficient token allowance", async function () {
            const { betapp, mocktoken, participant1, betAmount } = await loadFixture(createBetFixture);

            // Transfer away most tokens
            await mocktoken.connect(participant1).approve(await betapp.getAddress(), betAmount - ethers.parseEther("1"));

            await expect(
                betapp.connect(participant1).joinBet(1)
            ).to.be.revertedWith("Insufficient token allowance");
        })

        it("Should prevent joining the bet with insufficient token balance", async function () {
            const { betapp, mocktoken, participant1, participant2, betAmount, tokenAmount } = await loadFixture(createBetFixture);

            // Transfer away most tokens
            await mocktoken.connect(participant1).approve(await betapp.getAddress(), betAmount);
            await mocktoken.connect(participant1).transfer(participant2, tokenAmount);

            await expect(
                betapp.connect(participant1).joinBet(1)
            ).to.be.revertedWith("Insufficient token balance");
        });

        it("Should prevent joining the epxired bet", async function () {
            const { betapp, mocktoken, participant1, betAmount} = await loadFixture(createBetFixture);

            // Fast forword time beyond bet end time 
            await time.increase(3601);
            await mocktoken.connect(participant1).approve(await betapp.getAddress(), betAmount);
            await expect(
                betapp.connect(participant1).joinBet(1)
            ).to.be.rejectedWith("Bet duration has expired");
        });
    });

    describe("Ending Bets", function () {
        async function createBetWithParticipantsFixture() {
            const fixture = await loadFixture(deployBetappFixture);
            const { betapp, mocktoken, creator, participant1, participant2 } = fixture;

            const betAmount = ethers.parseEther("10");
            const duration = 3600;

            await betapp.connect(creator).createBet(
                await mocktoken.getAddress(),
                betAmount,
                duration
            );

            // Add participants
            await mocktoken.connect(participant1).approve(await betapp.getAddress(),betAmount);
            await betapp.connect(participant1).joinBet(1);

            await mocktoken.connect(participant2).approve(await betapp.getAddress(), betAmount);
            await betapp.connect(participant2).joinBet(1);

            return { ...fixture, betAmount };
        }

        // it("Should end bet successfully by creator", async function () {
        //     const { betapp, mocktoken, mockUniswapRouter, creator, betAmount } = await loadFixture(createBetWithParticipantsFixture);

        //     // Fast forward time beyond bet and time
        //     await time.increase(3601);

        //     // Set up mock router to return some ETH
        //     const ethReceived = ethers.parseEther("0.04");
        //     await mockUniswapRouter.setETHOutput(ethReceived);

        //     const tx = await betapp.connect(creator).endBet(1);

        //     await expect(tx)
        //         .to.emit(betapp, "BetClosed")
        //         .withArgs(1, ethReceived);
            
        //     const bet = await betapp.bets(1);
        //     expect(bet.closed).to.be.true;
        //     expect(bet.totalEtherValue).to.equal(ethReceived);
        // });
    })
});
