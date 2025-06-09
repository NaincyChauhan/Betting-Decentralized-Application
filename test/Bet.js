const {
    time,
    loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");

const UNISWAP_V2ROUTER02_ADDRESS = "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3";
const SEPOLIA_VRF_CONFIG = {
    vrfCoordinatorV2: "0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B",
    subscriptionId: "56963703521160896610015395822919131500514782509514383470110966893188127678192",
    key_hash: "0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae",
    callbackGasLimit: 500000,
    uniswap_router: UNISWAP_V2ROUTER02_ADDRESS,
};

describe("Betapp", function () {
    async function deployBetAppContract() {
        const [owner, otherAccount] = await ethers.getSigners();
        const Betapp = await ethers.getContractFactory("Betapp");
        const bet = await Betapp.deploy(
            SEPOLIA_VRF_CONFIG.vrfCoordinatorV2,
            SEPOLIA_VRF_CONFIG.subscriptionId,
            SEPOLIA_VRF_CONFIG.key_hash,
            SEPOLIA_VRF_CONFIG.callbackGasLimit,
            SEPOLIA_VRF_CONFIG.uniswap_router
        );
        await bet.waitForDeployment();
        return { bet, owner, otherAccount };
    }
});
