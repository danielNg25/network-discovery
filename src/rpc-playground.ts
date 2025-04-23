import { JsonRpcProvider, formatEther } from 'ethers';
import axios from 'axios';
import readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

interface RPCResponse {
    jsonrpc: string;
    id: number;
    result?: string;
    error?: {
        code: number;
        message: string;
    };
}

interface RPCResult {
    url: string;
    success: boolean;
    blockNumber?: number;
    error?: string;
    method: string;
}

const STORY_RPCS = [
    'https://mainnet.storyrpc.io',
    'https://story-evm-rpc.spidernode.net',
    'https://evm-rpc.story.mainnet.dteam.tech',
    'https://lightnode-json-rpc-mainnet-story.grandvalleys.com',
    'https://evm-rpc-story.j-node.net',
    'https://story-evm-rpc.krews.xyz',
    'https://story-mainnet-jsonrpc.blockhub.id',
    'https://evmrpc.story.nodestake.org',
    'https://story-mainnet.zenithnode.xyz',
    'https://evm-rpc.story.silentvalidator.com',
    'https://story-mainnet-evmrpc.mandragora.io',
    'https://rpc-storyevm.aldebaranode.xyz',
    'https://rpc.ankr.com/story_mainnet',
];

class RPCPlayground {
    private provider: JsonRpcProvider | null = null;
    private currentEndpoint: string = '';

    constructor() {
        this.showMenu();
    }

    private async showMenu(): Promise<void> {
        console.log('\nRPC Playground Menu:');
        console.log('1. Set RPC Endpoint');
        console.log('2. Test eth_blockNumber');
        console.log('3. Test eth_getBalance');
        console.log('4. Test eth_getBlockByNumber');
        console.log('5. Test Custom Method');
        console.log('6. Test Story RPCs');
        console.log('7. Exit');

        const choice = await this.prompt('Enter your choice: ');

        switch (choice) {
            case '1':
                await this.setEndpoint();
                break;
            case '2':
                await this.testBlockNumber();
                break;
            case '3':
                await this.testGetBalance();
                break;
            case '4':
                await this.testGetBlock();
                break;
            case '5':
                await this.testCustomMethod();
                break;
            case '6':
                await this.testStoryRPCs();
                break;
            case '7':
                rl.close();
                return;
            default:
                console.log('Invalid choice. Please try again.');
        }

        this.showMenu();
    }

    private prompt(question: string): Promise<string> {
        return new Promise((resolve) => {
            rl.question(question, resolve);
        });
    }

    private async setEndpoint(): Promise<void> {
        const endpoint = await this.prompt(
            'Enter RPC endpoint (e.g., http://localhost:8545): '
        );
        try {
            this.provider = new JsonRpcProvider(endpoint);
            this.currentEndpoint = endpoint;
            console.log('✓ RPC endpoint set successfully');
        } catch (error) {
            console.error('✗ Failed to set RPC endpoint:', error);
        }
    }

    private async testBlockNumber(): Promise<void> {
        if (!this.provider) {
            console.log('Please set an RPC endpoint first');
            return;
        }

        try {
            const blockNumber = await this.provider.getBlockNumber();
            console.log(`✓ Current block number: ${blockNumber}`);
        } catch (error) {
            console.error('✗ Failed to get block number:', error);
        }
    }

    private async testGetBalance(): Promise<void> {
        if (!this.provider) {
            console.log('Please set an RPC endpoint first');
            return;
        }

        const address = await this.prompt('Enter Ethereum address: ');
        try {
            const balance = await this.provider.getBalance(address);
            console.log(`✓ Balance: ${balance.toString()} wei`);
            console.log(`   (${formatEther(balance)} ETH)`);
        } catch (error) {
            console.error('✗ Failed to get balance:', error);
        }
    }

    private async testGetBlock(): Promise<void> {
        if (!this.provider) {
            console.log('Please set an RPC endpoint first');
            return;
        }

        const blockNumber = await this.prompt(
            'Enter block number (or "latest"): '
        );
        try {
            const block = await this.provider.getBlock(blockNumber);
            if (block) {
                console.log('✓ Block details:');
                console.log(`   Number: ${block.number}`);
                console.log(`   Hash: ${block.hash}`);
                console.log(
                    `   Timestamp: ${new Date(
                        block.timestamp * 1000
                    ).toISOString()}`
                );
                console.log(`   Transactions: ${block.transactions.length}`);
            } else {
                console.log('✗ Block not found');
            }
        } catch (error) {
            console.error('✗ Failed to get block:', error);
        }
    }

    private async testCustomMethod(): Promise<void> {
        if (!this.currentEndpoint) {
            console.log('Please set an RPC endpoint first');
            return;
        }

        const method = await this.prompt('Enter RPC method name: ');
        const params = await this.prompt('Enter parameters (JSON format): ');

        try {
            const response = await axios.post<RPCResponse>(
                this.currentEndpoint,
                {
                    jsonrpc: '2.0',
                    method,
                    params: JSON.parse(params),
                    id: 1,
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            );

            if (response.data.error) {
                console.error('✗ RPC Error:', response.data.error);
            } else {
                console.log(
                    '✓ Response:',
                    JSON.stringify(response.data.result, null, 2)
                );
            }
        } catch (error) {
            console.error('✗ Failed to execute custom method:', error);
        }
    }

    private async testStoryRPCs(): Promise<void> {
        console.log('Testing Story RPC endpoints...\n');

        const results = await Promise.all(
            STORY_RPCS.map(async (url): Promise<RPCResult> => {
                try {
                    // Try with ethers.js first
                    try {
                        const provider = new JsonRpcProvider(url, undefined, {
                            polling: false,
                        });
                        const blockNumber = await Promise.race([
                            provider.getBlockNumber(),
                            new Promise((_, reject) =>
                                setTimeout(
                                    () => reject(new Error('timeout')),
                                    2000
                                )
                            ),
                        ]);
                        return {
                            url,
                            success: true,
                            blockNumber: blockNumber as number,
                            method: 'ethers.js',
                        };
                    } catch (ethersErr: any) {
                        // If it's a network detection error, try direct RPC
                        if (
                            ethersErr.message.includes(
                                'failed to detect network'
                            ) ||
                            ethersErr.message === 'timeout'
                        ) {
                            try {
                                const response = await axios.post<RPCResponse>(
                                    url,
                                    {
                                        jsonrpc: '2.0',
                                        method: 'eth_blockNumber',
                                        params: [],
                                        id: 1,
                                    },
                                    {
                                        timeout: 2000,
                                        headers: {
                                            'Content-Type': 'application/json',
                                            Accept: 'application/json',
                                        },
                                    }
                                );

                                if (response.data.error) {
                                    throw new Error(
                                        response.data.error.message
                                    );
                                }

                                if (response.data.result) {
                                    const blockNumber = parseInt(
                                        response.data.result,
                                        16
                                    );
                                    return {
                                        url,
                                        success: true,
                                        blockNumber,
                                        method: 'direct RPC',
                                    };
                                }
                            } catch (rpcErr: any) {
                                return {
                                    url,
                                    success: false,
                                    error: rpcErr.message,
                                    method: 'direct RPC',
                                };
                            }
                        }
                        return {
                            url,
                            success: false,
                            error: ethersErr.message,
                            method: 'ethers.js',
                        };
                    }
                } catch (err: any) {
                    return {
                        url,
                        success: false,
                        error: err.message,
                        method: 'unknown',
                    };
                }
            })
        );

        // Sort results by success and block number
        const successful = results
            .filter(
                (r): r is RPCResult & { success: true; blockNumber: number } =>
                    r.success
            )
            .sort((a, b) => b.blockNumber - a.blockNumber);
        const failed = results.filter(
            (r): r is RPCResult & { success: false } => !r.success
        );

        // Print results
        console.log('Successful RPCs:');
        successful.forEach((result, index) => {
            console.log(`${index + 1}. ${result.url}`);
            console.log(`   Block: ${result.blockNumber}`);
            console.log(`   Method: ${result.method}\n`);
        });

        if (failed.length > 0) {
            console.log('\nFailed RPCs:');
            failed.forEach((result, index) => {
                console.log(`${index + 1}. ${result.url}`);
                console.log(`   Error: ${result.error}`);
                console.log(`   Method: ${result.method}\n`);
            });
        }

        // Print summary
        console.log('Summary:');
        console.log(`Total RPCs tested: ${STORY_RPCS.length}`);
        console.log(`Successful: ${successful.length}`);
        console.log(`Failed: ${failed.length}`);
        if (successful.length > 0) {
            const highestBlock = successful[0].blockNumber;
            const lowestBlock = successful[successful.length - 1].blockNumber;
            console.log(`Block range: ${lowestBlock} - ${highestBlock}`);
            console.log(`Block difference: ${highestBlock - lowestBlock}`);
        }
    }
}

// Start the playground
new RPCPlayground();
