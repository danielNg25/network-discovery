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
    blockDiscoveryTime: number;
    blockInterval: number;
    receivedBeforeCreation: boolean;
}

class BlockListener {
    private provider: ethers.WebSocketProvider;
    private lastBlockNumber = 0;
    private lastTimestamp = 0;
    private lastReceiveTime = 0;
    private startTime = Date.now();
    private stats: BlockStats[] = [];
    private maxStats = 100;
    private isRunning = false;

    constructor(private url: string) {
        // Convert http url to ws url if necessary
        const wsUrl = url.replace(/^http/, 'ws');
        this.provider = new ethers.WebSocketProvider(wsUrl);
    }

    async start() {
        console.log(`Connecting to WebSocket at ${this.url}...`);
        this.isRunning = true;

        // Get initial block
        const currentBlock = await this.provider.getBlockNumber();
        await this.handleNewBlock(currentBlock);

        // Listen for new blocks
        this.provider.on('block', async (blockNumber: number) => {
            if (!this.isRunning) return;
            try {
                await this.handleNewBlock(blockNumber);
            } catch (error) {
                console.error('Error handling new block:', error);
            }
        });

        // Handle WebSocket connection errors
        this.provider.on('error', (error) => {
            console.error('WebSocket error:', error);
        });

        // // Handle WebSocket close
        // this.provider.on('close', (code, reason) => {
        //     console.log(`WebSocket closed: ${code} - ${reason}`);
        //     if (this.isRunning) {
        //         console.log('Attempting to reconnect...');
        //         this.reconnect();
        //     }
        // });
    }

    private async handleNewBlock(blockNumber: number) {
        if (blockNumber <= this.lastBlockNumber) return;

        const block = await this.provider.getBlock(blockNumber);
        if (!block) return;

        const currentTime = Date.now();
        const blockTimestamp = block.timestamp * 1000;
        const blockDiscoveryTime = currentTime - blockTimestamp;
        const blockInterval =
            this.lastBlockNumber > 0 ? blockTimestamp - this.lastTimestamp : 0;
        const timeSinceLastReceive =
            this.lastReceiveTime > 0
                ? blockTimestamp - this.lastReceiveTime
                : 0;

        const receivedBeforeCreation = currentTime < blockTimestamp;

        const stats: BlockStats = {
            blockNumber: block.number,
            timestamp: blockTimestamp,
            blockTime: blockInterval,
            gasUsed: block.gasUsed,
            gasLimit: block.gasLimit,
            baseFeePerGas: block.baseFeePerGas ?? null,
            receiveTime: currentTime,
            processingTime: currentTime - blockTimestamp,
            blockDiscoveryTime: receivedBeforeCreation
                ? -blockDiscoveryTime
                : blockDiscoveryTime,
            blockInterval,
            receivedBeforeCreation,
        };

        this.stats.push(stats);
        if (this.stats.length > this.maxStats) {
            this.stats.shift();
        }

        console.log('\nNew Block Received:');
        console.log(`Block Number: ${block.number}`);
        console.log(
            `Block Timestamp: ${new Date(blockTimestamp).toISOString()}`
        );
        console.log(`Current Time: ${new Date(currentTime).toISOString()}`);
        console.log(`Block Discovery Time: ${Math.abs(blockDiscoveryTime)}ms`);
        console.log(`Block Interval: ${blockInterval}ms`);
        console.log(`Time Since Last Receive: ${timeSinceLastReceive}ms`);
        if (receivedBeforeCreation) {
            console.log('⚠️ Received block before its creation time!');
        }

        this.lastBlockNumber = block.number;
        this.lastTimestamp = blockTimestamp;
        this.lastReceiveTime = currentTime;
    }

    private async reconnect() {
        try {
            await this.provider.destroy();
            this.provider = new ethers.WebSocketProvider(this.url);
            await this.start();
        } catch (error) {
            console.error('Reconnection failed:', error);
            setTimeout(() => this.reconnect(), 5000);
        }
    }

    stop() {
        this.isRunning = false;
        this.provider.removeAllListeners();
        this.provider.destroy();
    }
}

// Example usage
const wsUrl = 'ws://0.0.0.0:9650/ext/bc/C/ws';
const listener = new BlockListener(wsUrl);

// Handle process termination
process.on('SIGINT', () => {
    console.log('\nStopping block listener...');
    listener.stop();
    process.exit(0);
});

// Start listening
listener.start().catch(console.error);
