const fs = require('fs');
const path = require('path');

const UNISWAP_V2ROUTER02_ADDRESS = "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3";
const SEPOLIA_VRF_CONFIG = {
    // vrfCoordinatorV2: "0x8103B0A8A00be2DDC778e6e7eaa21791Cd364625", // Sepolia VRF Coordinator
    vrfCoordinatorV2: "0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B", // Sepolia VRF Coordinator
    subscriptionId: "56963703521160896610015395822919131500514782509514383470110966893188127678192", 
    key_hash: "0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae", // 30 gwei Key Hash
    // key_hash: "0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c", // 30 gwei Key Hash
    callbackGasLimit: 500000,
    uniswap_router: UNISWAP_V2ROUTER02_ADDRESS,
};

async function main() {
    const signer = await ethers.provider.getSigner();
    const address = await signer.getAddress();
    const balance = await ethers.provider.getBalance(address);
    console.log("Deployer Address:", address);
    console.log("ETH Balance:", ethers.formatEther(balance));

    console.log("Deploying...");
    const Bet = await ethers.getContractFactory("Betapp");

    // Read Config File
    const filePath = path.join(__dirname, '../frontend/src/config.json');
    const jsonData = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(jsonData);
    const { chainId } = await ethers.provider.getNetwork();

    const _bet = await Bet.deploy(
        SEPOLIA_VRF_CONFIG.vrfCoordinatorV2,
        SEPOLIA_VRF_CONFIG.subscriptionId,
        SEPOLIA_VRF_CONFIG.key_hash,
        SEPOLIA_VRF_CONFIG.callbackGasLimit,
        SEPOLIA_VRF_CONFIG.uniswap_router
    );
        
    await _bet.waitForDeployment();

    data[chainId].Bet.address = _bet.target;
    console.log("Betting Contract Has Been Deployed : ", _bet.target);
    console.log("Deployment Completed.");
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });