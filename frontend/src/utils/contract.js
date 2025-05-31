import { BrowserProvider, Contract } from 'ethers';
import BetappAbi from '../contract/artifacts/contracts/Betapp.sol/Betapp.json';
import contractConfig from '../config.json';

const CHAIN_ID = "11155111"; // Sepolia chain ID

export const getContract = async () => {
    if (!window.ethereum) {
        throw new Error("MetaMask not detected");
    }

    const provider = new BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const network = await provider.getNetwork();

    // Validate chain ID
    if (network.chainId.toString() !== CHAIN_ID) {
        alert(`Please switch to Sepolia Testnet (chainId: ${CHAIN_ID})`);
        throw new Error(`Please switch to Sepolia Testnet (chainId: ${CHAIN_ID})`);
    }

    const contractAddress = contractConfig[CHAIN_ID]?.Bet?.address;
    if (!contractAddress) {
        throw new Error("Contract address not found in config.json");
    }

    return new Contract(contractAddress, BetappAbi.abi, signer);
};
