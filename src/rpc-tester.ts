import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { JsonRpcProvider } from 'ethers';

interface Peer {
    address: string;
    udpPort: number;
    tcpPort: number;
}

interface DiscoveryResult {
    timestamp: string;
    bootnodes: string[];
    totalPeers: number;
    summary: {
        address: string;
        udpPort: number;
        tcpPort: number;
    }[];
    discoveryRounds: number;
    discoveryComplete: boolean;
}

interface WorkingEndpoint {
    url: string;
    protocol: string;
    address: string;
    port: number;
}

class RPCTester {
    private results: DiscoveryResult | null = null;
    private workingPeers: Map<string, WorkingEndpoint> = new Map();
    private rpcPorts = [
        8545, // Standard Ethereum RPC port
    ];
    private readonly CONCURRENCY_LIMIT = 10;
    private testedCount = 0;
    private workingCount = 0;
    private resultsFile: string = '';

    constructor() {
        // Initialize results file with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        this.resultsFile = `rpc-test-results-${timestamp}.json`;
    }

    async loadLatestResults(): Promise<void> {
        try {
            const resultsDir = path.join(process.cwd(), 'results');
            const files = await fs.readdir(resultsDir);

            if (files.length === 0) {
                throw new Error('No discovery results found');
            }

            // Sort files by name (which includes timestamp) and get the latest
            const latestFile = files
                .filter((file) => file.startsWith('discovery-summary-'))
                .sort()
                .pop();

            if (!latestFile) {
                throw new Error('No discovery summary found');
            }

            const filePath = path.join(resultsDir, latestFile);
            const fileContent = await fs.readFile(filePath, 'utf-8');
            this.results = JSON.parse(fileContent) as DiscoveryResult;

            console.log(`Loaded discovery results from ${latestFile}`);
            console.log(`Total peers to test: ${this.results.totalPeers}`);
        } catch (err) {
            console.error('Error loading discovery results:', err);
            throw err;
        }
    }

    private async saveWorkingEndpoint(
        endpoint: WorkingEndpoint
    ): Promise<void> {
        if (!this.results) {
            throw new Error('No discovery results loaded');
        }

        const result = {
            timestamp: new Date().toISOString(),
            endpoint: {
                url: endpoint.url,
                protocol: endpoint.protocol,
                address: endpoint.address,
                port: endpoint.port,
            },
            discoveryInfo: {
                originalTimestamp: this.results.timestamp,
                totalPeers: this.results.totalPeers,
                testedCount: this.testedCount,
                workingCount: this.workingCount,
            },
        };

        try {
            // Create results directory if it doesn't exist
            const resultsDir = path.join(process.cwd(), 'results');
            await fs.mkdir(resultsDir, { recursive: true });

            // Append the result to the file
            const filePath = path.join(resultsDir, this.resultsFile);
            const line = JSON.stringify(result) + '\n';
            await fs.appendFile(filePath, line);

            console.log(`✓ Saved working endpoint: ${endpoint.url}`);
        } catch (err) {
            console.error('Error saving working endpoint:', err);
        }
    }

    private async testRPCEndpoint(
        peer: { address: string; tcpPort: number },
        port: number
    ): Promise<boolean> {
        const protocols = ['http', 'https'];

        for (const protocol of protocols) {
            const url = `${protocol}://${peer.address}:${port}`;

            try {
                console.log(`Trying ${url}...`);

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
                    console.log(
                        `✓ Success with ethers.js: Block ${blockNumber}`
                    );

                    // Create and save the working endpoint
                    const endpoint: WorkingEndpoint = {
                        url,
                        protocol,
                        address: peer.address,
                        port,
                    };
                    this.workingPeers.set(`${peer.address}:${port}`, endpoint);
                    await this.saveWorkingEndpoint(endpoint);
                    return true;
                } catch (ethersErr: any) {
                    // If it's a network detection error, fail fast
                    if (
                        ethersErr.message.includes(
                            'failed to detect network'
                        ) ||
                        ethersErr.message === 'timeout'
                    ) {
                        console.log(`✗ Network detection failed for ${url}`);
                        continue;
                    }
                    console.log(`ethers.js failed: ${ethersErr}`);
                }

                // Fallback to direct JSON-RPC call with shorter timeout
                const response = await axios.post(
                    url,
                    {
                        jsonrpc: '2.0',
                        method: 'eth_blockNumber',
                        params: [],
                        id: 1,
                    },
                    {
                        timeout: 2000, // 2 second timeout
                        headers: {
                            'Content-Type': 'application/json',
                            Accept: 'application/json',
                        },
                    }
                );

                if (
                    response.status === 200 &&
                    response.data &&
                    response.data.jsonrpc === '2.0' &&
                    response.data.result !== undefined
                ) {
                    console.log(
                        `✓ Success with direct RPC: Block ${response.data.result}`
                    );

                    // Create and save the working endpoint
                    const endpoint: WorkingEndpoint = {
                        url,
                        protocol,
                        address: peer.address,
                        port,
                    };
                    this.workingPeers.set(`${peer.address}:${port}`, endpoint);
                    await this.saveWorkingEndpoint(endpoint);
                    return true;
                }
            } catch (err) {
                if (axios.isAxiosError(err)) {
                    if (err.response) {
                        console.log(
                            `HTTP Error: ${err.response.status} - ${err.response.statusText}`
                        );
                    } else if (err.request) {
                        console.log(`Network Error: ${err.message}`);
                    } else {
                        console.log(`Error: ${err.message}`);
                    }
                } else {
                    console.log(`Unknown error: ${err}`);
                }
            }
        }

        return false;
    }

    async testAllPeers(): Promise<void> {
        if (!this.results) {
            throw new Error('No discovery results loaded');
        }

        console.log('\nStarting parallel RPC endpoint testing...');
        this.testedCount = 0;
        this.workingCount = 0;

        // Process peers in chunks to maintain concurrency limit
        for (
            let i = 0;
            i < this.results.summary.length;
            i += this.CONCURRENCY_LIMIT
        ) {
            const chunk = this.results.summary.slice(
                i,
                i + this.CONCURRENCY_LIMIT
            );
            const chunkPromises = chunk.map((peer) => this.testPeer(peer));

            await Promise.all(chunkPromises);
        }

        console.log('\nTesting complete!');
        console.log(`Total peers tested: ${this.testedCount}`);
        console.log(`Working RPC endpoints: ${this.workingCount}`);
    }

    private async testPeer(peer: {
        address: string;
        tcpPort: number;
    }): Promise<void> {
        let isWorking = false;
        this.testedCount++;

        // Try each common RPC port
        for (const port of this.rpcPorts) {
            isWorking = await this.testRPCEndpoint(peer, port);
            if (isWorking) {
                this.workingCount++;
                break;
            }
        }

        if (!isWorking) {
            console.log(`✗ No working RPC endpoint found for ${peer.address}`);
        }

        // Progress update
        const progress = (
            (this.testedCount / this.results!.totalPeers) *
            100
        ).toFixed(1);
        console.log(
            `Progress: ${progress}% (${this.testedCount}/${
                this.results!.totalPeers
            }) - Working endpoints: ${this.workingCount}`
        );
    }

    async saveResults(): Promise<void> {
        if (!this.results) {
            throw new Error('No discovery results loaded');
        }

        const summary = {
            timestamp: new Date().toISOString(),
            originalDiscoveryTimestamp: this.results.timestamp,
            totalPeersTested: this.results.totalPeers,
            workingCount: this.workingPeers.size,
            summary: Array.from(this.workingPeers.values()).map((endpoint) => ({
                url: endpoint.url,
                protocol: endpoint.protocol,
                address: endpoint.address,
                port: endpoint.port,
            })),
        };

        try {
            const resultsDir = path.join(process.cwd(), 'results');
            const summaryFile = `rpc-test-summary-${this.resultsFile}`;
            await fs.writeFile(
                path.join(resultsDir, summaryFile),
                JSON.stringify(summary, null, 2)
            );
            console.log(`RPC test summary saved to ${summaryFile}`);
        } catch (err) {
            console.error('Error saving RPC test summary:', err);
        }
    }
}

// Main function
async function main() {
    const tester = new RPCTester();

    try {
        // Load the latest discovery results
        await tester.loadLatestResults();

        // Test all peers
        await tester.testAllPeers();

        // Save results
        await tester.saveResults();
    } catch (err) {
        console.error('Error in RPC testing process:', err);
    }
}

// Run the RPC testing
main().catch(console.error);
