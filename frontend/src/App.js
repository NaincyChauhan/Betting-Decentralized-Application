import React, { useState } from 'react';
import WalletConnect from './utils/WalletConnect';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import HomePage from './components/HomePage';

function App() {
    const [account, setAccount] = useState(null);

    return (
        <div>
            <WalletConnect setAccount={setAccount} />
            
            {account && <> 
            <HomePage />
            </> }

        </div>
    );
}

export default App;
