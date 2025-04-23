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

class BlockListener {
    private provider: ethers.JsonRpcProvider;
    private lastBlockNumber = 0;
    private lastTimestamp = 0;
    private startTime = Date.now();
    private stats: BlockStats[] = [];
    private maxStats = 100;
    private pollingInterval: NodeJS.Timeout | null = null;
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

        // Start polling
        this.pollingInterval = setInterval(async () => {
            if (!this.isRunning) return;

            try {
                const latestBlock = await this.provider.getBlockNumber();
                if (latestBlock > this.lastBlockNumber) {
                    await this.handleNewBlock(latestBlock);
                }
            } catch (error) {
                console.error('Error polling for new blocks:', error);
            }
        }, this.pollInterval);
    }

    private async handleNewBlock(blockNumber: number) {
        const processingStart = Date.now();
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
        console.log(`Block Hash: ${block.hash}`);
        console.log(
            `Block Timestamp: ${new Date(block.timestamp * 1000).toISOString()}`
        );
        console.log(`Current Time: ${new Date().toISOString()}`);
        console.log(`Time Since Start: ${(timeSinceStart / 1000).toFixed(2)}s`);
        console.log(`Total Latency: ${currentTime - block.timestamp * 1000}ms`);
        console.log(`Processing Time: ${currentTime - processingStart}ms`);
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

        this.lastBlockNumber = block.number;
        this.lastTimestamp = block.timestamp * 1000;
    }

    stop() {
        this.isRunning = false;
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }
}

// Example usage
const rpcUrl = 'http://0.0.0.0:26545';
const listener = new BlockListener(rpcUrl, 1000); // Poll every second

// Handle process termination
process.on('SIGINT', () => {
    console.log('\nStopping block listener...');
    listener.stop();
    process.exit(0);
});

// Start listening
listener.start().catch(console.error);
