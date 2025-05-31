import React, { useState, useEffect } from 'react';
import {
    Container,
    Table,
    Button,
    Modal,
    Form,
    Alert,
    Badge,
    Row,
    Col,
    Card,
    Spinner,
    ButtonGroup
} from 'react-bootstrap';
import { getContract } from '../utils/contract';
import { ethers, formatEther, parseEther } from 'ethers';
import ERC20Abi from '../contract/artifacts/@openzeppelin/contracts/token/ERC20/IERC20.sol/IERC20.json';

const HomePage = () => {
    const [bets, setBets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [contract, setContract] = useState(null);
    const [userAddress, setUserAddress] = useState('');

    // Modal states
    const [showCreateBet, setShowCreateBet] = useState(false);
    const [showAddToken, setShowAddToken] = useState(false);
    const [showRemoveToken, setShowRemoveToken] = useState(false);

    // Form states
    const [createBetForm, setCreateBetForm] = useState({
        token: '',
        amount: '',
        duration: ''
    });
    const [addTokenForm, setAddTokenForm] = useState({
        tokenAddress: '',
        priceFeedAddress: ''
    });
    const [removeTokenForm, setRemoveTokenForm] = useState({
        tokenAddress: ''
    });

    // Processing states
    const [processing, setProcessing] = useState({});

    const copyToClipboard = async (text, type) => {
        try {
            await navigator.clipboard.writeText(text);
            setSuccess(`${type} copied to clipboard!`);
            // Clear success message after 2 seconds
            setTimeout(() => setSuccess(''), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
            setError(`Failed to copy ${type}`);
        }
    };

    useEffect(() => {
        initializeContract();
    }, []);

    const initializeContract = async () => {
        try {
            setLoading(true);
            setError(''); // Clear any previous errors

            // Check if MetaMask is available
            if (!window.ethereum) {
                throw new Error("MetaMask not detected. Please install MetaMask.");
            }

            console.log("Initializing contract...");
            const contractInstance = await getContract();
            console.log("Contract instance created:", contractInstance.target);

            setContract(contractInstance);

            // Get user address
            const signer = contractInstance.runner;
            const address = await signer.getAddress();
            console.log("User address:", address);
            setUserAddress(address);

            // Fetch bets after contract is set
            console.log("Fetching bets...");
            await fetchBets(contractInstance);
            console.log("Bets fetched successfully");
        } catch (err) {
            const reason =
                err?.revert?.args?.[0] || err?.reason || err?.message || 'Transaction failed';
            setError(`Failed to initialize contract: ${reason}`);
            console.error('Contract initialization error:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchBets = async (contractInstance = contract) => {
        if (!contract) return;

        try {
            const betIdCount = await contract.betIdCount();
            const betsData = [];

            for (let i = 1; i <= betIdCount; i++) {
                try {
                    const bet = await contract.bets(i);
                    const participants = await contract.getBetParticipants(i);

                    betsData.push({
                        id: i,
                        creator: bet.creator,
                        token: bet.token,
                        amount: bet.amount.toString(),
                        endtime: Number(bet.endtime),
                        closed: bet.closed,
                        winner: bet.winner,
                        participants: participants,
                        totalEtherValue: bet.totalEtherValue.toString()
                    });
                } catch (err) {
                    console.error(`Error fetching bet ${i}:`, err);
                }
            }

            setBets(betsData);
        } catch (err) {
            const reason =
                err?.revert?.args?.[0] || err?.reason || err?.message || 'Transaction failed';
            setError(`Failed to fetch bets: ${reason}`);
            console.error('Fetch bets error:', err);
        }
    };

    const handleCreateBet = async (e) => {
        e.preventDefault();
        if (!contract) return;

        try {
            setProcessing(prev => ({ ...prev, createBet: true }));
            setError('');

            const durationInSeconds = parseInt(createBetForm.duration) * 60; // Convert minutes to seconds
            const amountInWei = parseEther(createBetForm.amount);

            const tx = await contract.createBet(
                createBetForm.token,
                amountInWei,
                durationInSeconds
            );

            await tx.wait();
            setSuccess('Bet created successfully!');
            setShowCreateBet(false);
            setCreateBetForm({ token: '', amount: '', duration: '' });
            await fetchBets();
        } catch (err) {
            const reason =
                err?.revert?.args?.[0] || err?.reason || err?.message || 'Transaction failed';
            setError(`Failed to create bet: ${reason}`);
            console.error('Create bet error:', err);
        } finally {
            setProcessing(prev => ({ ...prev, createBet: false }));
        }
    };

    const handleJoinBet = async (betId) => {
        if (!contract) return;

        try {
            setProcessing(prev => ({ ...prev, [`join_${betId}`]: true }));
            setError('');

            // Fetch bet data to get token and amount
            const bet = await contract.bets(betId);
            const tokenAddress = bet.token;
            const amount = bet.amount;

            // Approve token transfer
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const tokenContract = new ethers.Contract(tokenAddress, ERC20Abi.abi, signer);

            // Check allowance
            const allowance = await tokenContract.allowance(await signer.getAddress(), contract.target);

            if (allowance < amount) {
                const tx = await tokenContract.approve(contract.target, amount);
                await tx.wait();
                setSuccess("Token approved!");
            }

            const tx = await contract.joinBet(betId);
            await tx.wait();
            setSuccess('Successfully joined the bet!');
            await fetchBets();
        } catch (err) {
            const reason =
                err?.revert?.args?.[0] || err?.reason || err?.message || 'Transaction failed';
            setError(`Failed to join bet: ${reason}`);
            console.error('Join bet error:', err);
        } finally {
            setProcessing(prev => ({ ...prev, [`join_${betId}`]: false }));
        }
    };

    const handleEndBet = async (betId) => {
        if (!contract) return;

        try {
            setProcessing(prev => ({ ...prev, [`end_${betId}`]: true }));
            setError('');

            const tx = await contract.endBet(betId);
            await tx.wait();
            setSuccess('Bet ended successfully!');
            await fetchBets();
        } catch (err) {
            const reason =
                err?.revert?.args?.[0] || err?.reason || err?.message || 'Transaction failed';
            setError(`Failed to end bet: ${reason}`);
            console.error('End bet error:', err);
        } finally {
            setProcessing(prev => ({ ...prev, [`end_${betId}`]: false }));
        }
    };

    const handleSelectWinner = async (betId) => {
        if (!contract) return;

        try {
            setProcessing(prev => ({ ...prev, [`winner_${betId}`]: true }));
            setError('');

            const tx = await contract.selectWinner(betId);
            await tx.wait();
            setSuccess('Winner selection initiated! Please wait for randomness fulfillment.');
            await fetchBets();
        } catch (err) {
            const reason =
                err?.revert?.args?.[0] || err?.reason || err?.message || 'Transaction failed';
            setError(`Failed to select winner: ${reason}`);
            console.error('Select winner error:', err);
        } finally {
            setProcessing(prev => ({ ...prev, [`winner_${betId}`]: false }));
        }
    };

    const handleAddToken = async (e) => {
        e.preventDefault();
        if (!contract) return;

        try {
            setProcessing(prev => ({ ...prev, addToken: true }));
            setError('');

            const tx = await contract.addSupportedToken(
                addTokenForm.tokenAddress,
                addTokenForm.priceFeedAddress
            );

            await tx.wait();
            setSuccess('Token added successfully!');
            setShowAddToken(false);
            setAddTokenForm({ tokenAddress: '', priceFeedAddress: '' });
        } catch (err) {
            const reason =
                err?.revert?.args?.[0] || err?.reason || err?.message || 'Transaction failed';
            setError(`Failed to add token: ${reason}`);
            console.error('Add token error:', err);
        } finally {
            setProcessing(prev => ({ ...prev, addToken: false }));
        }
    };

    const handleRemoveToken = async (e) => {
        e.preventDefault();
        if (!contract) return;

        try {
            setProcessing(prev => ({ ...prev, removeToken: true }));
            setError('');

            const tx = await contract.removeSupportedToken(removeTokenForm.tokenAddress);
            await tx.wait();
            setSuccess('Token removed successfully!');
            setShowRemoveToken(false);
            setRemoveTokenForm({ tokenAddress: '' });
        } catch (err) {
            const reason =
                err?.revert?.args?.[0] || err?.reason || err?.message || 'Transaction failed';
            setError(`Failed to remove token: ${reason}`);
            console.error('Remove token error:', err);
        } finally {
            setProcessing(prev => ({ ...prev, removeToken: false }));
        }
    };

    const formatAddress = (address) => {
        if (!address || address === '0x0000000000000000000000000000000000000000') return 'N/A';
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };


    const AddressCopyComponent = ({ address, type, className = "" }) => {
        if (!address || address === '0x0000000000000000000000000000000000000000') {
            return <span className={className}>N/A</span>;
        }

        return (
            <div className={`d-flex align-items-center gap-1 ${className}`}>
                <code className="small">{formatAddress(address)}</code>
                <Button
                    variant="outline-secondary"
                    size="sm"
                    className="py-0 px-1"
                    onClick={() => copyToClipboard(address, type)}
                    title={`Copy ${type}`}
                    style={{ fontSize: '0.7rem', lineHeight: '1' }}
                >
                    📋
                </Button>
            </div>
        );
    };

    const formatTimestamp = (timestamp) => {
        return new Date(timestamp * 1000).toLocaleString();
    };

    const getBetStatus = (bet) => {
        const now = Date.now() / 1000;
        if (bet.winner !== '0x0000000000000000000000000000000000000000') {
            return <Badge bg="success">Winner Selected</Badge>;
        }
        if (bet.closed) {
            return <Badge bg="warning">Closed</Badge>;
        }
        if (now > bet.endtime) {
            return <Badge bg="danger">Expired</Badge>;
        }
        return <Badge bg="primary">Active</Badge>;
    };

    if (loading) {
        return (
            <Container className="d-flex justify-content-center align-items-center" style={{ minHeight: '400px' }}>
                <Spinner animation="border" role="status">
                    <span className="visually-hidden">Loading...</span>
                </Spinner>
            </Container>
        );
    }

    return (
        <Container fluid className="py-4">
            <Card>
                <Card.Header>
                    <Row className="align-items-center">
                        <Col>
                            <h2 className="mb-0">Betting Platform</h2>
                            <small className="text-muted">Connected: {formatAddress(userAddress)}</small>
                        </Col>
                        <Col xs="auto">
                            <ButtonGroup>
                                <Button
                                    variant="primary"
                                    onClick={() => setShowCreateBet(true)}
                                >
                                    Create Bet
                                </Button>
                                <Button
                                    variant="success"
                                    onClick={() => setShowAddToken(true)}
                                >
                                    Add Token
                                </Button>
                                <Button
                                    variant="danger"
                                    onClick={() => setShowRemoveToken(true)}
                                >
                                    Remove Token
                                </Button>
                            </ButtonGroup>
                        </Col>
                    </Row>
                </Card.Header>

                <Card.Body>
                    {error && (
                        <Alert variant="danger" dismissible onClose={() => setError('')}>
                            {error}
                        </Alert>
                    )}

                    {success && (
                        <Alert variant="success" dismissible onClose={() => setSuccess('')}>
                            {success}
                        </Alert>
                    )}

                    <Button
                        variant="outline-secondary"
                        size="sm"
                        onClick={fetchBets}
                        className="mb-3"
                        disabled={loading}
                    >
                        {loading ? 'Refreshing...' : 'Refresh Bets'}
                    </Button>

                    <Table responsive striped bordered hover>
                        <thead className="table-dark">
                            <tr>
                                <th>ID</th>
                                <th>Creator</th>
                                <th>Token</th>
                                <th>Amount</th>
                                <th>End Time</th>
                                <th>Participants</th>
                                <th>Status</th>
                                <th>Winner</th>
                                <th>ETH Value</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {bets.length === 0 ? (
                                <tr>
                                    <td colSpan="10" className="text-center py-4">
                                        No bets found. Create your first bet!
                                    </td>
                                </tr>
                            ) : (
                                bets.map((bet) => (
                                    <tr key={bet.id}>
                                        <td><strong>#{bet.id}</strong></td>
                                        <td>
                                            <AddressCopyComponent
                                                address={bet.creator}
                                                type="Creator Address"
                                            />
                                        </td>
                                        <td>
                                            <AddressCopyComponent
                                                address={bet.token}
                                                type="Token Address"
                                            />
                                        </td>
                                        <td>{formatEther(bet.amount)} tokens</td>
                                        <td className="small">{formatTimestamp(bet.endtime)}</td>
                                        <td>
                                            <Badge bg="info">{bet.participants.length}</Badge>
                                        </td>
                                        <td>{getBetStatus(bet)}</td>
                                        <td>{formatAddress(bet.winner)}</td>
                                        <td>
                                            {bet.totalEtherValue !== '0'
                                                ? `${formatEther(bet.totalEtherValue)} ETH`
                                                : 'N/A'
                                            }
                                        </td>
                                        <td>
                                            <ButtonGroup size="sm">
                                                <Button
                                                    variant="primary"
                                                    onClick={() => handleJoinBet(bet.id)}
                                                    disabled={processing[`join_${bet.id}`]}
                                                >
                                                    {processing[`join_${bet.id}`] ? 'Joining...' : 'Join'}
                                                </Button>

                                                <Button
                                                    variant="warning"
                                                    onClick={() => handleEndBet(bet.id)}
                                                    disabled={processing[`end_${bet.id}`]}
                                                >
                                                    {processing[`end_${bet.id}`] ? 'Ending...' : 'End'}
                                                </Button>
                                                <Button
                                                    variant="success"
                                                    onClick={() => handleSelectWinner(bet.id)}
                                                    disabled={processing[`winner_${bet.id}`]}
                                                >
                                                    {processing[`winner_${bet.id}`] ? 'Selecting...' : 'Select Winner'}
                                                </Button>
                                            </ButtonGroup>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </Table>
                </Card.Body>
            </Card>

            {/* Create Bet Modal */}
            <Modal show={showCreateBet} onHide={() => setShowCreateBet(false)} size="lg">
                <Modal.Header closeButton>
                    <Modal.Title>Create New Bet</Modal.Title>
                </Modal.Header>
                <Form onSubmit={handleCreateBet}>
                    <Modal.Body>
                        <Form.Group className="mb-3">
                            <Form.Label>Token Address</Form.Label>
                            <Form.Control
                                type="text"
                                placeholder="0x..."
                                value={createBetForm.token}
                                onChange={(e) => setCreateBetForm(prev => ({
                                    ...prev,
                                    token: e.target.value
                                }))}
                                required
                            />
                            <Form.Text className="text-muted">
                                Enter the address of the supported token
                            </Form.Text>
                        </Form.Group>

                        <Form.Group className="mb-3">
                            <Form.Label>Bet Amount (in tokens)</Form.Label>
                            <Form.Control
                                type="number"
                                step="0.000001"
                                placeholder="0.0"
                                value={createBetForm.amount}
                                onChange={(e) => setCreateBetForm(prev => ({
                                    ...prev,
                                    amount: e.target.value
                                }))}
                                required
                            />
                        </Form.Group>

                        <Form.Group className="mb-3">
                            <Form.Label>Duration (in minutes)</Form.Label>
                            <Form.Control
                                type="number"
                                placeholder="60"
                                value={createBetForm.duration}
                                onChange={(e) => setCreateBetForm(prev => ({
                                    ...prev,
                                    duration: e.target.value
                                }))}
                                required
                            />
                        </Form.Group>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={() => setShowCreateBet(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            type="submit"
                            disabled={processing.createBet}
                        >
                            {processing.createBet ? 'Creating...' : 'Create Bet'}
                        </Button>
                    </Modal.Footer>
                </Form>
            </Modal>

            {/* Add Token Modal */}
            <Modal show={showAddToken} onHide={() => setShowAddToken(false)} size="lg">
                <Modal.Header closeButton>
                    <Modal.Title>Add Supported Token</Modal.Title>
                </Modal.Header>
                <Form onSubmit={handleAddToken}>
                    <Modal.Body>
                        <Form.Group className="mb-3">
                            <Form.Label>Token Address</Form.Label>
                            <Form.Control
                                type="text"
                                placeholder="0x..."
                                value={addTokenForm.tokenAddress}
                                onChange={(e) => setAddTokenForm(prev => ({
                                    ...prev,
                                    tokenAddress: e.target.value
                                }))}
                                required
                            />
                        </Form.Group>

                        <Form.Group className="mb-3">
                            <Form.Label>Price Feed Address</Form.Label>
                            <Form.Control
                                type="text"
                                placeholder="0x..."
                                value={addTokenForm.priceFeedAddress}
                                onChange={(e) => setAddTokenForm(prev => ({
                                    ...prev,
                                    priceFeedAddress: e.target.value
                                }))}
                                required
                            />
                            <Form.Text className="text-muted">
                                Chainlink price feed address for this token
                            </Form.Text>
                        </Form.Group>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={() => setShowAddToken(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="success"
                            type="submit"
                            disabled={processing.addToken}
                        >
                            {processing.addToken ? 'Adding...' : 'Add Token'}
                        </Button>
                    </Modal.Footer>
                </Form>
            </Modal>

            {/* Remove Token Modal */}
            <Modal show={showRemoveToken} onHide={() => setShowRemoveToken(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>Remove Supported Token</Modal.Title>
                </Modal.Header>
                <Form onSubmit={handleRemoveToken}>
                    <Modal.Body>
                        <Form.Group className="mb-3">
                            <Form.Label>Token Address</Form.Label>
                            <Form.Control
                                type="text"
                                placeholder="0x..."
                                value={removeTokenForm.tokenAddress}
                                onChange={(e) => setRemoveTokenForm(prev => ({
                                    ...prev,
                                    tokenAddress: e.target.value
                                }))}
                                required
                            />
                        </Form.Group>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={() => setShowRemoveToken(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="danger"
                            type="submit"
                            disabled={processing.removeToken}
                        >
                            {processing.removeToken ? 'Removing...' : 'Remove Token'}
                        </Button>
                    </Modal.Footer>
                </Form>
            </Modal>
        </Container>
    );
};

export default HomePage;