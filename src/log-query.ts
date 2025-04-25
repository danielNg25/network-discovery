import { ethers } from 'ethers';

class LogQuery {
    private provider: ethers.JsonRpcProvider;
    private isRunning = false;
    private pollInterval: NodeJS.Timeout | null = null;
    private lastBlock: number = 0;

    constructor(private url: string, private interval: number = 1000) {
        this.provider = new ethers.JsonRpcProvider(url);
    }

    async start() {
        console.log(`Connecting to JSON-RPC at ${this.url}...`);
        this.isRunning = true;

        // Start polling for events
        this.pollInterval = setInterval(async () => {
            if (!this.isRunning) return;

            try {
                const logs = await this.provider.getLogs({
                    fromBlock: 'pending',
                    toBlock: 'pending',
                });

                if (logs.length > 0) {
                    console.log(`\nEvents in pending block (${logs.length}):`);
                    for (const log of logs) {
                        console.log(`\nEvent: ${log.transactionHash}`);
                        console.log(`Address: ${log.address}`);
                        console.log(`Topics: ${log.topics.join(', ')}`);
                        console.log(`Data: ${log.data}`);
                    }
                }
            } catch (error) {
                console.error('Error fetching events:', error);
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
const logQuery = new LogQuery(rpcUrl, 100); // Poll every 100ms

// Handle process termination
process.on('SIGINT', () => {
    console.log('\nStopping log query...');
    logQuery.stop();
    process.exit(0);
});

// Start querying
logQuery.start().catch(console.error);
