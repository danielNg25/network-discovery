import { ethers } from 'ethers';

class LogQuery {
    private provider: ethers.JsonRpcProvider;
    private isRunning = false;
    private pollInterval: NodeJS.Timeout | null = null;
    private lastLatestBlock: number = 0;
    private lastPendingBlock: number = 0;

    constructor(private url: string, private interval: number = 1000) {
        this.provider = new ethers.JsonRpcProvider(url);
    }

    async start() {
        console.log(`Connecting to JSON-RPC at ${this.url}...`);
        this.isRunning = true;

        // Start polling for blocks
        this.pollInterval = setInterval(async () => {
            if (!this.isRunning) return;

            try {
                const [latestBlock, pendingBlock] = await Promise.all([
                    this.provider.getBlock('latest'),
                    this.provider.getBlock('pending'),
                ]);

                if (latestBlock?.number && pendingBlock?.number) {
                    if (
                        latestBlock.number !== this.lastLatestBlock ||
                        pendingBlock.number !== this.lastPendingBlock
                    ) {
                        const now = Date.now();
                        const latestLatency =
                            now - latestBlock.timestamp * 1000;
                        const pendingLatency =
                            now - pendingBlock.timestamp * 1000;

                        console.log(`\nLatest Block: #${latestBlock.number}`);
                        console.log(
                            `Latest Block Timestamp: ${new Date(
                                latestBlock.timestamp * 1000
                            ).toISOString()}`
                        );
                        console.log(
                            `Latest Block Latency: ${latestLatency}ms (${(
                                latestLatency / 1000
                            ).toFixed(2)}s)`
                        );
                        console.log(`Pending Block: #${pendingBlock.number}`);
                        console.log(
                            `Pending Block Timestamp: ${new Date(
                                pendingBlock.timestamp * 1000
                            ).toISOString()}`
                        );
                        console.log(
                            `Pending Block Latency: ${pendingLatency}ms (${(
                                pendingLatency / 1000
                            ).toFixed(2)}s)`
                        );
                        console.log(
                            `Block Difference: ${
                                pendingBlock.number - latestBlock.number
                            }`
                        );

                        this.lastLatestBlock = latestBlock.number;
                        this.lastPendingBlock = pendingBlock.number;
                    }
                }
            } catch (error) {
                console.error('Error polling for blocks:', error);
            }
        }, this.interval);
    }

    stop() {
        this.isRunning = false;
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }
}

// Example usage
const rpcUrl = 'http://0.0.0.0:26545';
const logQuery = new LogQuery(rpcUrl, 100); // Poll every 250ms

// Handle process termination
process.on('SIGINT', () => {
    console.log('\nStopping log query...');
    logQuery.stop();
    process.exit(0);
});

// Start querying
logQuery.start().catch(console.error);
