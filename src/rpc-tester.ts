import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { JsonRpcProvider } from 'ethers';

interface WorkingEndpoint {
    url: string;
    protocol: string;
    address: string;
    port: number;
}

// List of IP addresses to test
const IP_ADDRESSES = [
    '34.88.230.215',
    '34.116.238.126',
    '91.134.71.21',
    '162.55.239.166',
    '65.108.128.251',
    '37.27.225.52',
    '69.67.149.105',
    '35.211.161.35',
    '35.237.65.141',
    '195.189.96.121',
    '152.53.121.15',
    '178.63.42.97',
    '211.219.19.79',
    '207.188.7.169',
    '51.159.20.50',
    '18.117.216.69',
    '34.65.109.135',
    '51.15.16.14',
    '132.145.196.86',
    '146.148.61.172',
    '141.98.217.86',
    '34.65.245.189',
    '34.88.78.125',
    '146.59.118.198',
    '152.53.114.91',
    '57.128.187.32',
    '134.122.42.130',
    '152.53.124.150',
    '35.246.149.9',
    '46.166.162.42',
    '35.211.121.91',
    '34.126.123.46',
    '141.94.155.97',
    '35.207.25.245',
    '35.211.19.204',
    '34.89.146.250',
    '150.136.221.45',
    '34.159.94.117',
    '57.128.187.248',
    '103.88.234.227',
    '65.109.119.56',
    '141.94.248.83',
    '141.147.145.117',
    '135.181.21.165',
    '144.76.5.118',
];

class RPCTester {
    private workingPeers: Map<string, WorkingEndpoint> = new Map();
    private rpcPorts = [8545, 26545]; // Standard Ethereum RPC port
    private readonly CONCURRENCY_LIMIT = 10;
    private testedCount = 0;
    private workingCount = 0;
    private resultsFile: string = '';

    constructor() {
        // Initialize results file with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        this.resultsFile = `rpc-test-results-${timestamp}.json`;
    }

    private async saveWorkingEndpoint(
        endpoint: WorkingEndpoint
    ): Promise<void> {
        const result = {
            timestamp: new Date().toISOString(),
            endpoint: {
                url: endpoint.url,
                protocol: endpoint.protocol,
                address: endpoint.address,
                port: endpoint.port,
            },
            testingInfo: {
                totalIPs: IP_ADDRESSES.length,
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

    private async testRPCEndpoint(ip: string, port: number): Promise<boolean> {
        const protocols = ['http', 'https'];

        for (const protocol of protocols) {
            const url = `${protocol}://${ip}:${port}`;

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
                        address: ip,
                        port,
                    };
                    this.workingPeers.set(`${ip}:${port}`, endpoint);
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
                        address: ip,
                        port,
                    };
                    this.workingPeers.set(`${ip}:${port}`, endpoint);
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

    async testAllIPs(): Promise<void> {
        console.log('\nStarting parallel RPC endpoint testing...');
        this.testedCount = 0;
        this.workingCount = 0;

        // Process IPs in chunks to maintain concurrency limit
        for (let i = 0; i < IP_ADDRESSES.length; i += this.CONCURRENCY_LIMIT) {
            const chunk = IP_ADDRESSES.slice(i, i + this.CONCURRENCY_LIMIT);
            const chunkPromises = chunk.map((ip) => this.testIP(ip));

            await Promise.all(chunkPromises);
        }

        console.log('\nTesting complete!');
        console.log(`Total IPs tested: ${this.testedCount}`);
        console.log(`Working RPC endpoints: ${this.workingCount}`);
    }

    private async testIP(ip: string): Promise<void> {
        let isWorking = false;
        this.testedCount++;

        // Try each RPC port
        for (const port of this.rpcPorts) {
            isWorking = await this.testRPCEndpoint(ip, port);
            if (isWorking) {
                this.workingCount++;
                break;
            }
        }

        if (!isWorking) {
            console.log(`✗ No working RPC endpoint found for ${ip}`);
        }

        // Progress update
        const progress = (
            (this.testedCount / IP_ADDRESSES.length) *
            100
        ).toFixed(1);
        console.log(
            `Progress: ${progress}% (${this.testedCount}/${IP_ADDRESSES.length}) - Working endpoints: ${this.workingCount}`
        );
    }

    async saveResults(): Promise<void> {
        const summary = {
            timestamp: new Date().toISOString(),
            totalIPsTested: IP_ADDRESSES.length,
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
        // Test all IPs
        await tester.testAllIPs();

        // Save results
        await tester.saveResults();
    } catch (err) {
        console.error('Error in RPC testing process:', err);
    }
}

// Run the RPC testing
main().catch(console.error);
