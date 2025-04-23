import { WebSocket } from 'ws';
import { ethers } from 'ethers';

interface BlockStats {
    blockNumber: number;
    timestamp: number;
    blockTime: number;
    gasUsed: bigint;
    gasLimit: bigint;
    baseFeePerGas: bigint | null;
    receiveTime: number;
    processingTime: number;
}

interface BlockHeader {
    number: string;
    hash: string;
    parentHash: string;
    timestamp: string;
    gasUsed: string;
    gasLimit: string;
    baseFeePerGas?: string;
}

class BlockListener {
    private ws: WebSocket | null = null;
    private lastBlockNumber = 0;
    private lastTimestamp = 0;
    private startTime = Date.now();
    private stats: BlockStats[] = [];
    private maxStats = 100;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 5000;
    private pingInterval: NodeJS.Timeout | null = null;
    private subscriptionId: string | null = null;
    private messageCount = 0;
    private lastMessageTime = 0;

    constructor(private url: string) {}

    async start() {
        console.log(`Connecting to WebSocket at ${this.url}...`);
        this.connect();
    }

    private connect() {
        this.ws = new WebSocket(this.url, {
            handshakeTimeout: 10000,
            perMessageDeflate: false,
            headers: {
                'User-Agent': 'Node.js/WebSocket',
            },
        });

        this.ws.on('open', () => {
            console.log('WebSocket connected');
            this.reconnectAttempts = 0;
            this.setupPingInterval();
            this.subscribeToNewHeads();
        });

        this.ws.on('message', (data: string) => {
            const receiveTime = Date.now();
            this.messageCount++;

            // Calculate message rate
            if (this.lastMessageTime > 0) {
                const timeSinceLastMessage = receiveTime - this.lastMessageTime;
                if (timeSinceLastMessage > 1000) {
                    // Log if more than 1 second between messages
                    console.log(
                        `Time since last message: ${timeSinceLastMessage}ms`
                    );
                }
            }
            this.lastMessageTime = receiveTime;

            try {
                const message = JSON.parse(data);

                // Handle subscription confirmation
                if (message.id === 1 && message.result) {
                    this.subscriptionId = message.result;
                    console.log('Successfully subscribed to newHeads');
                    return;
                }

                // Handle new block
                if (
                    message.method === 'eth_subscription' &&
                    message.params?.subscription === this.subscriptionId &&
                    message.params?.result
                ) {
                    const processingStart = Date.now();
                    this.handleNewBlock(message.params.result);
                    const processingTime = Date.now() - processingStart;
                    console.log(`Message processing time: ${processingTime}ms`);
                }
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        });

        this.ws.on('close', () => {
            console.log('WebSocket connection closed');
            this.cleanup();
            this.handleReconnect();
        });

        this.ws.on('error', (error) => {
            console.error('WebSocket error:', error);
            this.cleanup();
            this.handleReconnect();
        });
    }

    private setupPingInterval() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
        }
        this.pingInterval = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                const pingTime = Date.now();
                this.ws.ping();
                this.ws.once('pong', () => {
                    const pongTime = Date.now();
                    console.log(`Ping latency: ${pongTime - pingTime}ms`);
                });
            }
        }, 30000);
    }

    private subscribeToNewHeads() {
        if (!this.ws) return;

        const subscribeMessage = {
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_subscribe',
            params: ['newHeads'],
        };

        this.ws.send(JSON.stringify(subscribeMessage));
    }

    private handleNewBlock(block: BlockHeader) {
        const blockNumber = parseInt(block.number, 16);
        const timestamp = parseInt(block.timestamp, 16) * 1000;
        const currentTime = Date.now();
        const timeSinceStart = currentTime - this.startTime;
        const blockTime =
            this.lastBlockNumber > 0 ? timestamp - this.lastTimestamp : 0;

        // Update stats
        const stats: BlockStats = {
            blockNumber,
            timestamp,
            blockTime,
            gasUsed: BigInt(block.gasUsed),
            gasLimit: BigInt(block.gasLimit),
            baseFeePerGas: block.baseFeePerGas
                ? BigInt(block.baseFeePerGas)
                : null,
            receiveTime: currentTime,
            processingTime: currentTime - timestamp,
        };

        this.stats.push(stats);
        if (this.stats.length > this.maxStats) {
            this.stats.shift();
        }

        // Calculate averages
        const avgBlockTime =
            this.stats.reduce((sum, s) => sum + s.blockTime, 0) /
            this.stats.length;
        const avgGasUsed =
            this.stats.reduce((sum, s) => sum + s.gasUsed, 0n) /
            BigInt(this.stats.length);
        const avgGasLimit =
            this.stats.reduce((sum, s) => sum + s.gasLimit, 0n) /
            BigInt(this.stats.length);
        const avgProcessingTime =
            this.stats.reduce((sum, s) => sum + s.processingTime, 0) /
            this.stats.length;

        console.log('\nNew Block Received:');
        console.log(`Block Number: ${blockNumber}`);
        console.log(`Block Hash: ${block.hash}`);
        console.log(`Block Timestamp: ${new Date(timestamp).toISOString()}`);
        console.log(`Current Time: ${new Date().toISOString()}`);
        console.log(`Time Since Start: ${(timeSinceStart / 1000).toFixed(2)}s`);
        console.log(`Total Latency: ${currentTime - timestamp}ms`);
        console.log(
            `Network Latency: ${currentTime - timestamp - avgProcessingTime}ms`
        );
        console.log(`Avg Processing Time: ${avgProcessingTime.toFixed(2)}ms`);
        if (blockTime > 0) {
            console.log(`Block Time: ${blockTime}ms`);
            console.log(
                `Avg Block Time (last ${
                    this.stats.length
                }): ${avgBlockTime.toFixed(2)}ms`
            );
        }
        console.log(`Gas Used: ${ethers.formatUnits(block.gasUsed, 0)}`);
        console.log(`Gas Limit: ${ethers.formatUnits(block.gasLimit, 0)}`);
        console.log(
            `Gas Usage: ${(
                (Number(block.gasUsed) / Number(block.gasLimit)) *
                100
            ).toFixed(2)}%`
        );
        console.log(`Avg Gas Used: ${ethers.formatUnits(avgGasUsed, 0)}`);
        console.log(`Avg Gas Limit: ${ethers.formatUnits(avgGasLimit, 0)}`);
        if (block.baseFeePerGas) {
            console.log(
                `Base Fee: ${ethers.formatUnits(
                    block.baseFeePerGas,
                    'gwei'
                )} gwei`
            );
        }
        console.log(`Parent Hash: ${block.parentHash}`);

        this.lastBlockNumber = blockNumber;
        this.lastTimestamp = timestamp;
    }

    private handleReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(
                `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
            );
            setTimeout(() => this.connect(), this.reconnectDelay);
        } else {
            console.error('Max reconnection attempts reached. Exiting...');
            process.exit(1);
        }
    }

    private cleanup() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        this.subscriptionId = null;
    }

    stop() {
        this.cleanup();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}

// Example usage with a different Story node endpoint
const wsUrl = 'wss://opbnb-rpc.publicnode.com';
const listener = new BlockListener(wsUrl);

// Handle process termination
process.on('SIGINT', () => {
    console.log('\nStopping block listener...');
    listener.stop();
    process.exit(0);
});

// Start listening
listener.start().catch(console.error);
