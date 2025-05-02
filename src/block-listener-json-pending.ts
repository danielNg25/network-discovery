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
    isPending: boolean;
}

interface BlockComparison {
    latestBlock: BlockStats | null;
    pendingBlock: BlockStats | null;
    txDifference: number;
    gasDifference: bigint;
    timestamp: number;
}

class BlockListener {
    private provider: ethers.JsonRpcProvider;
    private lastBlockNumber = 0;
    private lastTimestamp = 0;
    private startTime = Date.now();
    private latestStats: BlockStats[] = [];
    private pendingStats: BlockStats[] = [];
    private comparisons: BlockComparison[] = [];
    private maxStats = 100;
    private isRunning = false;

    constructor(private url: string, private pollInterval: number = 1000) {
        this.provider = new ethers.JsonRpcProvider(url);
    }

    async start() {
        console.log(`Connecting to JSON-RPC at ${this.url}...`);
        this.isRunning = true;

        // Get initial blocks
        const currentBlock = await this.provider.getBlockNumber();
        await this.fetchAndCompareBlocks(currentBlock);

        // Start continuous polling
        while (this.isRunning) {
            try {
                const latestBlock = await this.provider.getBlockNumber();
                if (latestBlock > this.lastBlockNumber) {
                    await this.fetchAndCompareBlocks(latestBlock);
                }
            } catch (error) {
                console.error('Error polling for blocks:', error);
            }
            await sleep(this.pollInterval);
        }
    }

    private async fetchAndCompareBlocks(blockNumber: number) {
        try {
            // Fetch both latest and pending blocks in parallel
            const [latestBlock, pendingBlock] = await Promise.all([
                this.provider.getBlock(blockNumber),
                this.provider.getBlock('pending'),
            ]);

            if (!latestBlock) {
                console.error('Could not fetch latest block');
                return;
            }

            const currentTime = Date.now();
            const latestBlockTime =
                this.lastBlockNumber > 0
                    ? latestBlock.timestamp * 1000 - this.lastTimestamp
                    : 0;

            // Process latest block stats
            const latestStats: BlockStats = {
                blockNumber: latestBlock.number,
                timestamp: latestBlock.timestamp * 1000,
                blockTime: latestBlockTime,
                gasUsed: latestBlock.gasUsed,
                gasLimit: latestBlock.gasLimit,
                baseFeePerGas: latestBlock.baseFeePerGas ?? null,
                receiveTime: currentTime,
                processingTime: currentTime - latestBlock.timestamp * 1000,
                isPending: false,
            };

            this.latestStats.push(latestStats);
            if (this.latestStats.length > this.maxStats) {
                this.latestStats.shift();
            }

            // Process pending block if available
            let pendingStats: BlockStats | null = null;
            if (pendingBlock) {
                pendingStats = {
                    blockNumber: pendingBlock.number ?? latestBlock.number + 1,
                    timestamp: pendingBlock.timestamp * 1000,
                    blockTime: 0, // Not applicable for pending
                    gasUsed: pendingBlock.gasUsed,
                    gasLimit: pendingBlock.gasLimit,
                    baseFeePerGas: pendingBlock.baseFeePerGas ?? null,
                    receiveTime: currentTime,
                    processingTime: 0, // Not applicable for pending
                    isPending: true,
                };

                this.pendingStats.push(pendingStats);
                if (this.pendingStats.length > this.maxStats) {
                    this.pendingStats.shift();
                }
            }

            // Create comparison data
            const comparison: BlockComparison = {
                latestBlock: latestStats,
                pendingBlock: pendingStats,
                txDifference:
                    pendingBlock &&
                    latestBlock.transactions &&
                    pendingBlock.transactions
                        ? pendingBlock.transactions.length -
                          latestBlock.transactions.length
                        : 0,
                gasDifference: pendingBlock
                    ? pendingBlock.gasUsed - latestBlock.gasUsed
                    : 0n,
                timestamp: currentTime,
            };

            this.comparisons.push(comparison);
            if (this.comparisons.length > this.maxStats) {
                this.comparisons.shift();
            }

            // Output results
            console.log('\n------ Block Comparison ------');
            console.log(`Latest Block: #${latestBlock.number}`);
            console.log(
                `Latest Block Time: ${new Date(
                    latestBlock.timestamp * 1000
                ).toISOString()}`
            );
            console.log(
                `Latest Block Gas Used: ${latestBlock.gasUsed.toString()} / ${latestBlock.gasLimit.toString()}`
            );
            console.log(
                `Latest Block BaseFee: ${ethers.formatUnits(
                    latestBlock.baseFeePerGas ?? 0n,
                    'gwei'
                )} gwei`
            );

            if (pendingBlock) {
                console.log(
                    `\nPending Block: #${pendingBlock.number ?? 'N/A'}`
                );
                console.log(
                    `Pending Block Time: ${new Date(
                        pendingBlock.timestamp * 1000
                    ).toISOString()}`
                );
                console.log(
                    `Pending Block Gas Used: ${pendingBlock.gasUsed.toString()} / ${pendingBlock.gasLimit.toString()}`
                );
                console.log(
                    `Pending Block BaseFee: ${ethers.formatUnits(
                        pendingBlock.baseFeePerGas ?? 0n,
                        'gwei'
                    )} gwei`
                );

                if (pendingBlock.transactions && latestBlock.transactions) {
                    console.log(
                        `\nTransaction Count Difference: ${comparison.txDifference}`
                    );
                    console.log(
                        `Gas Used Difference: ${comparison.gasDifference.toString()}`
                    );
                }
            } else {
                console.log('\nPending Block: Not available');
            }

            console.log(`Current Time: ${new Date().toISOString()}`);
            console.log(
                `Latest Block Latency: ${
                    currentTime - latestBlock.timestamp * 1000
                }ms`
            );

            if (latestBlockTime > 0) {
                console.log(`Block Time: ${latestBlockTime}ms`);
            }

            this.lastBlockNumber = latestBlock.number;
            this.lastTimestamp = latestBlock.timestamp * 1000;
        } catch (error) {
            console.error('Error in fetchAndCompareBlocks:', error);
        }
    }

    stop() {
        this.isRunning = false;
    }
}

// Example usage
const rpcUrl = 'https://flare-api.flare.network/ext/C/rpc';
const listener = new BlockListener(rpcUrl, 50); // Poll every 50ms

// Handle process termination
process.on('SIGINT', () => {
    console.log('\nStopping block listener...');
    listener.stop();
    process.exit(0);
});

// Start listening
listener.start().catch(console.error);
