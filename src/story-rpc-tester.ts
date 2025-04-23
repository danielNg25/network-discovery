import { JsonRpcProvider } from 'ethers';
import axios from 'axios';

const STORY_RPCS = [
    'https://lightnode-json-rpc-mainnet-story.grandvalleys.com',
    'https://sly-lively-water.story-mainnet.quiknode.pro/2cb2f586bc9ac68d8b0c29e46a6005abd5f0425e',
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
    duration: number;
    timestamp: number;
}

async function testRPC(url: string): Promise<RPCResult> {
    const startTime = Date.now();
    const result: RPCResult = {
        url,
        success: false,
        method: 'unknown',
        duration: 0,
        timestamp: 0,
    };

    try {
        // Try with ethers.js first
        try {
            const provider = new JsonRpcProvider(url, undefined, {
                polling: false,
            });
            const blockNumber = await Promise.race([
                provider.getBlockNumber(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('timeout')), 2000)
                ),
            ]);
            result.success = true;
            result.blockNumber = blockNumber as number;
            result.method = 'ethers.js';
            result.timestamp = Date.now();
        } catch (ethersErr: any) {
            // If it's a network detection error, try direct RPC
            if (
                ethersErr.message.includes('failed to detect network') ||
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
                        throw new Error(response.data.error.message);
                    }

                    if (response.data.result) {
                        const blockNumber = parseInt(response.data.result, 16);
                        result.success = true;
                        result.blockNumber = blockNumber;
                        result.method = 'direct RPC';
                        result.timestamp = Date.now();
                    }
                } catch (rpcErr: any) {
                    result.error = rpcErr.message;
                    result.method = 'direct RPC';
                    result.timestamp = Date.now();
                }
            } else {
                result.error = ethersErr.message;
                result.method = 'ethers.js';
                result.timestamp = Date.now();
            }
        }
    } catch (err: any) {
        result.error = err.message;
        result.timestamp = Date.now();
    }

    result.duration = result.timestamp - startTime;
    return result;
}

async function main() {
    console.log('Starting Story RPC testing...');
    console.log(`Total RPCs to test: ${STORY_RPCS.length}\n`);

    const results = await Promise.all(STORY_RPCS.map(testRPC));

    // Sort results by block number (highest first)
    const successful = results
        .filter((r) => r.success)
        .sort((a, b) => (b.blockNumber || 0) - (a.blockNumber || 0));
    const failed = results.filter((r) => !r.success);

    // Print results
    console.log('Successful RPCs:');
    successful.forEach((result, index) => {
        console.log(`${index + 1}. ${result.url}`);
        console.log(`   Block: ${result.blockNumber}`);
        console.log(`   Method: ${result.method}`);
        console.log(`   Timestamp: ${result.timestamp}`);
        console.log(`   Duration: ${result.duration}ms\n`);
    });

    if (failed.length > 0) {
        console.log('\nFailed RPCs:');
        failed.forEach((result, index) => {
            console.log(`${index + 1}. ${result.url}`);
            console.log(`   Error: ${result.error}`);
            console.log(`   Method: ${result.method}`);
            console.log(`   Timestamp: ${result.timestamp}`);
            console.log(`   Duration: ${result.duration}ms\n`);
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
        console.log(`Block difference: ${highestBlock! - lowestBlock!}`);

        // Calculate time difference between first and last response
        const timeDiff = Math.abs(
            successful[0].timestamp -
                successful[successful.length - 1].timestamp
        );
        console.log(
            `Time difference between first and last response: ${timeDiff}ms`
        );
    }
}

main().catch(console.error);
