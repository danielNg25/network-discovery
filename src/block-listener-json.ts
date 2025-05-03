import { ethers } from 'ethers';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface BlockStats {
    blockNumber: number;
    timestamp: number;
    blockTime: number;
    gasUsed: bigint;
    gasLimit: bigint;
    baseFeePerGas: bigint | null;
    receiveTime: number;
    processingTime: number;
    blockDiscoveryTime: number; // Time between block creation and our discovery
    blockInterval: number; // Time between this block and previous block
    receivedBeforeCreation: boolean; // Whether we received this block before its timestamp
}

class BlockListener {
    private provider: ethers.JsonRpcProvider;
    private lastBlockNumber = 0;
    private lastTimestamp = 0;
    private lastReceiveTime = 0;
    private startTime = Date.now();
    private stats: BlockStats[] = [];
    private maxStats = 100;
    private isRunning = false;

    constructor(private url: string, private pollInterval: number = 1000) {
        this.provider = new ethers.JsonRpcProvider(url);
    }

    async start() {
        console.log(`Connecting to JSON-RPC at ${this.url}...`);
        this.isRunning = true;

        // Get initial block
        const currentBlock = await this.provider.getBlockNumber();
        await this.handleNewBlock(currentBlock);

        // Start continuous polling
        while (this.isRunning) {
            try {
                const latestBlock = await this.provider.getBlockNumber();
                if (latestBlock > this.lastBlockNumber) {
                    await this.handleNewBlock(latestBlock);
                }
            } catch (error) {
                console.error('Error polling for new blocks:', error);
            }
            await sleep(this.pollInterval);
        }
    }

    private async handleNewBlock(blockNumber: number) {
        const block = await this.provider.getBlock(blockNumber);
        if (!block) return;

        const currentTime = Date.now();
        const blockTimestamp = block.timestamp * 1000;
        const blockDiscoveryTime = currentTime - blockTimestamp;
        const blockInterval =
            this.lastBlockNumber > 0 ? blockTimestamp - this.lastTimestamp : 0;
        const timeSinceLastReceive =
            this.lastReceiveTime > 0 ? currentTime - this.lastReceiveTime : 0;

        // Check if we received this block before its creation time
        const receivedBeforeCreation = currentTime < blockTimestamp;

        // Update stats
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
        const avgDiscoveryTime =
            this.stats.reduce(
                (sum, s) => sum + Math.abs(s.blockDiscoveryTime),
                0
            ) / this.stats.length;

        console.log('\nNew Block Received:');
        console.log(`Block Number: ${block.number}`);
        console.log(
            `Block Timestamp: ${new Date(blockTimestamp).toISOString()}`
        );
        console.log(`Current Time: ${new Date(currentTime).toISOString()}`);
        console.log(
            `Block Discovery Time: ${
                receivedBeforeCreation ? '-' : ''
            }${Math.abs(
                blockDiscoveryTime
            )}ms (time between block creation and our discovery)`
        );
        console.log(
            `Block Interval: ${blockInterval}ms (time since last block)`
        );
        console.log(`Time Since Last Receive: ${timeSinceLastReceive}ms`);
        console.log(`Processing Time: ${currentTime - blockTimestamp}ms`);
        if (receivedBeforeCreation) {
            console.log('⚠️ Received block before its creation time!');
        }

        if (this.stats.length > 1) {
            console.log('\nAverages:');
            console.log(`Average Block Time: ${avgBlockTime.toFixed(2)}ms`);
            console.log(
                `Average Discovery Time: ${avgDiscoveryTime.toFixed(2)}ms`
            );
            console.log(
                `Average Processing Time: ${avgProcessingTime.toFixed(2)}ms`
            );
        }

        this.lastBlockNumber = block.number;
        this.lastTimestamp = blockTimestamp;
        this.lastReceiveTime = currentTime;
    }

    stop() {
        this.isRunning = false;
    }
}

// Example usage
const rpcUrl = 'http://0.0.0.0:9650/ext/bc/C/rpc';
const listener = new BlockListener(rpcUrl, 50); // Poll every 50ms

// Handle process termination
process.on('SIGINT', () => {
    console.log('\nStopping block listener...');
    listener.stop();
    process.exit(0);
});

// Start listening
listener.start().catch(console.error);
