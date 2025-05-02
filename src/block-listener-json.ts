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
}

class BlockListener {
    private provider: ethers.JsonRpcProvider;
    private lastBlockNumber = 0;
    private lastTimestamp = 0;
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
        const timeSinceStart = currentTime - this.startTime;
        const blockTime =
            this.lastBlockNumber > 0
                ? block.timestamp * 1000 - this.lastTimestamp
                : 0;

        // Update stats
        const stats: BlockStats = {
            blockNumber: block.number,
            timestamp: block.timestamp * 1000,
            blockTime,
            gasUsed: block.gasUsed,
            gasLimit: block.gasLimit,
            baseFeePerGas: block.baseFeePerGas ?? null,
            receiveTime: currentTime,
            processingTime: currentTime - block.timestamp * 1000,
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
        console.log(`Block Number: ${block.number}`);
        console.log(
            `Block Timestamp: ${new Date(block.timestamp * 1000).toISOString()}`
        );
        console.log(`Current Time: ${new Date().toISOString()}`);
        console.log(`Total Latency: ${currentTime - block.timestamp * 1000}ms`);
        if (blockTime > 0) {
            console.log(`Block Time: ${blockTime}ms`);
        }
        this.lastBlockNumber = block.number;
        this.lastTimestamp = block.timestamp * 1000;
    }

    stop() {
        this.isRunning = false;
    }
}

// Example usage
const rpcUrl = 'https://flare-api.flare.network/ext/C/rpc';
const listener = new BlockListener(rpcUrl, 50); // Poll every 100ms

// Handle process termination
process.on('SIGINT', () => {
    console.log('\nStopping block listener...');
    listener.stop();
    process.exit(0);
});

// Start listening
listener.start().catch(console.error);
