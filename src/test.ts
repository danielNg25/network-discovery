import { ethers } from 'ethers';
import * as fs from 'fs';

interface PendingBlock {
    number: number;
    hash: string | null;
    timestamp: number;
    gasUsed: bigint;
    gasLimit: bigint;
    baseFeePerGas: bigint | null;
    receiveTime: number;
    transactions: ethers.TransactionResponse[];
}

class BlockListener {
    private provider: ethers.JsonRpcProvider;
    private startTime = Date.now();
    private pendingBlocksInterval: NodeJS.Timeout | null = null;
    private pendingBlocks: Map<number, PendingBlock> = new Map();
    private isRunning = false;
    private thisBlock: number = 0;
    private lastBlock: number = 0;

    constructor(private url: string, private pollInterval: number = 1000) {
        this.provider = new ethers.JsonRpcProvider(url);
    }

    async start() {
        console.log(`Connecting to JSON-RPC at ${this.url}...`);
        this.isRunning = true;

        // Start polling for pending blocks
        this.pendingBlocksInterval = setInterval(async () => {
            if (!this.isRunning) return;

            try {
                const pendingBlock = await this.provider.getBlock('pending');
                if (
                    pendingBlock &&
                    pendingBlock.number &&
                    pendingBlock.number > this.thisBlock
                ) {
                    await this.handlePendingBlock(pendingBlock);
                }
            } catch (error) {
                console.error('Error polling for pending blocks:', error);
            }
        }, this.pollInterval);
    }

    private async handlePendingBlock(block: ethers.Block) {
        if (!block.number) return;

        const now = Date.now();
        const blockTimestamp = block.timestamp * 1000; // Convert to milliseconds
        const latency = now - blockTimestamp;

        this.thisBlock = block.number;
        console.log(`thisBlock: ${block.number}`);
        const blockData = JSON.stringify(block, null, 2);
        fs.writeFileSync(`block-${block.number}.json`, blockData);

        // Query logs between last block and current block
        if (this.lastBlock > 0) {
            try {
                const logs = await this.provider.getLogs({
                    fromBlock: this.lastBlock,
                    toBlock: block.number,
                });

                if (logs.length > 0) {
                    console.log(
                        `\nLogs between blocks ${this.lastBlock} and ${block.number}:`
                    );
                    for (const log of logs) {
                        console.log(`\nLog: ${log.transactionHash}`);
                        console.log(`Address: ${log.address}`);
                        console.log(`Topics: ${log.topics.join(', ')}`);
                        console.log(`Data: ${log.data}`);
                    }
                }
            } catch (error) {
                console.error('Error fetching logs:', error);
            }
        }

        this.lastBlock = block.number;

        // Check if we've already seen this pending block
        if (this.pendingBlocks.has(block.number)) {
            return;
        }

        console.log(
            `\nPending block received: #${block.number} at ${new Date(
                now
            ).toISOString()}`
        );
        console.log(`Pending block hash: ${block.hash}`);
        console.log(
            `Pending block timestamp: ${new Date(blockTimestamp).toISOString()}`
        );
        console.log(`Latency: ${latency}ms (${(latency / 1000).toFixed(2)}s)`);
        console.log(`Gas Used: ${ethers.formatUnits(block.gasUsed, 0)}`);
        console.log(`Gas Limit: ${ethers.formatUnits(block.gasLimit, 0)}`);
        console.log(
            `Gas Usage: ${(
                (Number(block.gasUsed) / Number(block.gasLimit)) *
                100
            ).toFixed(2)}%`
        );
        if (block.baseFeePerGas) {
            console.log(
                `Base Fee: ${ethers.formatUnits(
                    block.baseFeePerGas,
                    'gwei'
                )} gwei`
            );
        }

        // // Fetch transactions from the pending block
        // try {
        //     const transactions = await Promise.all(
        //         block.transactions.map(async (txHash) => {
        //             try {
        //                 const tx = await this.provider.getTransaction(txHash);
        //                 if (tx) {
        //                     // Get transaction receipt to access logs
        //                     const receipt =
        //                         await this.provider.getTransactionReceipt(
        //                             txHash
        //                         );
        //                     return { tx, receipt };
        //                 }
        //                 return null;
        //             } catch (error) {
        //                 console.error(
        //                     `Error fetching transaction ${txHash}:`,
        //                     error
        //                 );
        //                 return null;
        //             }
        //         })
        //     );

        //     // Filter out null values and log transaction details
        //     const validTransactions = transactions.filter(
        //         (
        //             t
        //         ): t is {
        //             tx: ethers.TransactionResponse;
        //             receipt: ethers.TransactionReceipt | null;
        //         } => t !== null
        //     );

        //     console.log(
        //         `\nTransactions in pending block (${validTransactions.length}):`
        //     );
        //     for (const { tx, receipt } of validTransactions) {
        //         console.log(`\nTransaction: ${tx.hash}`);
        //         console.log(`From: ${tx.from}`);
        //         console.log(`To: ${tx.to || 'Contract Creation'}`);
        //         console.log(`Value: ${ethers.formatEther(tx.value)} ETH`);
        //         console.log(
        //             `Gas Price: ${ethers.formatUnits(
        //                 tx.gasPrice || 0,
        //                 'gwei'
        //             )} gwei`
        //         );
        //         console.log(`Gas Limit: ${tx.gasLimit.toString()}`);

        //         if (receipt) {
        //             console.log(
        //                 `Status: ${receipt.status === 1 ? 'Success' : 'Failed'}`
        //             );
        //             console.log(`Gas Used: ${receipt.gasUsed.toString()}`);
        //             console.log(
        //                 `Effective Gas Price: ${ethers.formatUnits(
        //                     receipt.effectiveGasPrice,
        //                     'gwei'
        //                 )} gwei`
        //             );

        //             if (receipt.logs.length > 0) {
        //                 console.log(`Logs (${receipt.logs.length}):`);
        //                 for (const log of receipt.logs) {
        //                     console.log(`  - Address: ${log.address}`);
        //                     console.log(`    Topics: ${log.topics.join(', ')}`);
        //                     console.log(`    Data: ${log.data}`);
        //                 }
        //             }
        //         }
        //     }

        //     // Store the pending block with its transactions
        //     this.pendingBlocks.set(block.number, {
        //         number: block.number,
        //         hash: block.hash,
        //         timestamp: blockTimestamp,
        //         gasUsed: block.gasUsed,
        //         gasLimit: block.gasLimit,
        //         baseFeePerGas: block.baseFeePerGas,
        //         receiveTime: now,
        //         transactions: validTransactions.map((t) => t.tx),
        //     });
        // } catch (error) {
        //     console.error('Error fetching transactions:', error);
        // }

        console.log(
            `Total pending blocks tracked: ${block.transactions.length}`
        );
    }

    stop() {
        this.isRunning = false;
        if (this.pendingBlocksInterval) {
            clearInterval(this.pendingBlocksInterval);
            this.pendingBlocksInterval = null;
        }
    }
}

// Example usage
const rpcUrl = 'https://mainnet.storyrpc.io';
const listener = new BlockListener(rpcUrl, 1000); // Poll every second

// Handle process termination
process.on('SIGINT', () => {
    console.log('\nStopping block listener...');
    listener.stop();
    process.exit(0);
});

// Start listening
listener.start().catch(console.error);
