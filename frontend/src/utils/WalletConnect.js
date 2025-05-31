import React, { useState } from 'react';
import { ethers } from 'ethers';
import { switchToSepolia } from './switchNet';
import { Button } from 'react-bootstrap';

const WalletConnect = ({ setAccount }) => {
    const [connected, setConnected] = useState(false);

    const connectWallet = async () => {
        if (window.ethereum) {
            try {
                await switchToSepolia();
                const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                setAccount(accounts[0]);
                setConnected(true);
            } catch (err) {
                console.error("Wallet connection failed", err);
            }
        } else {
            alert("Please install MetaMask!");
        }
    };

    return (
        <div>
            {connected ? "" : <> <Button variant="primary" onClick={connectWallet}>
                Connect Wallet
            </Button> </>}

        </div>
    );
};

export default WalletConnect;
