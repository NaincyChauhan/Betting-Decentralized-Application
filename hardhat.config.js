require("dotenv").config()
require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    solidity: "0.8.28",
    networks: {
        sepolia: {
            url: process.env.REACT_APP_SEPOLIA_RPC_URL,
            accounts: [process.env.REACT_APP_PRIVATE_KEY],
        },
    },
    paths: {
        artifacts: "./frontend/src/contract/artifacts",
    }
};
