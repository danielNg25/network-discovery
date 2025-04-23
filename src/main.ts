import { DPT, PeerInfo } from '@ethereumjs/devp2p';
import { Buffer } from 'buffer';
import { setTimeout } from 'timers/promises';
import dns from 'dns/promises';
import fs from 'fs/promises';
import path from 'path';

// Configuration
const config = {
    // Generate a random private key for this session
    privateKey: Buffer.from(
        '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        'hex'
    ),
    // Story bootnodes
    bootnodes: [
        // Kaia bootnodes
        'kni://18b36118cce093673499fc6e9aa196f047fe17a0de35b6f2a76a4557802f6abf9f89aa5e7330e93c9014b714b9df6378393611efe39aec9d3d831d6aa9d617ae@ston65.node.kaia.io:32323?ntype=bn',
        'kni://63f1c96874da85140ecca3ce24875cb5ef28fa228bc3572e16f690db4a48fc8067502d2f6e8f0c66fb558276a5ada1e4906852c7ae42b0003e9f9f25d1e123b1@ston873.node.kaia.io:32323?ntype=bn',
        'kni://94cc15e2014b86584908707de55800c0a2ea8a24dc5550dcb507043e4cf18ff04f21dc86ed17757dc63b1fa85bb418b901e5e24e4197ad4bbb0d96cd9389ed98@ston106.node.kaia.io:32323?ntype=bn',
        // // Story bootnodes
        // 'enode://f42110982b6ddaa4de8031f9fecb619d181902db5529a43bc9b1187debbc67771bf937b2210cbfd33babd2acbe138506596e23d0d1792ab3cb5229c5bb051544@b1.storyrpc.io:30303',
        // 'enode://2ae459a7cc28b59822377deec266e24e5ed00374d7a83e2e8d0d67dd89dc2b80366c1353c7909fe81b840f6081188850677fa20dd5d262c9e3f67eb23d0be0b5@b2.storyrpc.io:30303',
    ],
    // Local endpoint configuration
    endpoint: {
        address: '0.0.0.0',
        udpPort: 30303,
        tcpPort: 30303,
    },
    // Discovery parameters
    discovery: {
        refreshInterval: 30000, // 30 seconds
        maxPeers: 25,
        discoveryTimeout: 300000, // 5 minutes
        maxDiscoveryRounds: 20, // Maximum number of discovery rounds
        minDiscoveryRounds: 3, // Minimum rounds to ensure good coverage
        maxNodes: 0, // Maximum number of nodes to discover (0 for unlimited)
    },
};

// Convert node string to PeerInfo
async function nodeToPeerInfo(node: string): Promise<PeerInfo> {
    // Handle Kaia kni format
    if (node.startsWith('kni://')) {
        const match = node.match(/kni:\/\/([^@]+)@([^:]+):(\d+)/);
        if (!match) {
            throw new Error('Could not parse Kaia node');
        }
        const host = match[2];
        const port = parseInt(match[3]);
        return await resolveHost(host, port);
    }

    // Handle ENR format
    if (node.startsWith('enr:-')) {
        const match = node.match(/enr:-[^:]+:([^:]+):(\d+)/);
        if (!match) {
            throw new Error('Could not parse ENR');
        }
        const host = match[1];
        const port = parseInt(match[2]);
        return await resolveHost(host, port);
    }

    // Handle enode format
    if (node.startsWith('enode://')) {
        const match = node.match(/enode:\/\/([^@]+)@([^:]+):(\d+)/);
        if (!match) {
            throw new Error('Invalid enode format');
        }
        const host = match[2];
        const port = parseInt(match[3]);
        return await resolveHost(host, port);
    }

    throw new Error('Unsupported node format');
}

// Helper function to resolve host and create PeerInfo
async function resolveHost(host: string, port: number): Promise<PeerInfo> {
    // Check if host is already an IP address
    if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(host)) {
        return {
            address: host,
            udpPort: port,
            tcpPort: port,
        };
    }

    // If not an IP address, try to resolve the hostname
    try {
        const addresses = await dns.resolve(host);
        if (addresses.length === 0) {
            throw new Error(`Could not resolve hostname: ${host}`);
        }
        return {
            address: addresses[0],
            udpPort: port,
            tcpPort: port,
        };
    } catch (err) {
        console.warn(
            `Warning: Could not resolve hostname ${host}, using as-is`
        );
        return {
            address: host,
            udpPort: port,
            tcpPort: port,
        };
    }
}

class DevP2PDiscovery {
    private dpt: DPT;
    private discoveredPeers: Map<string, PeerInfo>;
    private refreshInterval: NodeJS.Timeout | null;
    private discoveryRounds: number;
    private lastDiscoveryCount: number;
    private discoveryComplete: boolean;
    private isStopping: boolean;
    private resultsFile: string;

    constructor() {
        this.discoveredPeers = new Map();
        this.refreshInterval = null;
        this.discoveryRounds = 0;
        this.lastDiscoveryCount = 0;
        this.discoveryComplete = false;
        this.isStopping = false;

        // Initialize results file with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        this.resultsFile = `discovery-results-${timestamp}.json`;

        // Initialize DPT
        this.dpt = new DPT(config.privateKey, {
            endpoint: config.endpoint,
            refreshInterval: config.discovery.refreshInterval,
        });

        // Set up event listeners
        this.setupEventListeners();
    }

    private async savePeerToFile(peer: PeerInfo): Promise<void> {
        const result = {
            timestamp: new Date().toISOString(),
            peer: {
                address: peer.address,
                udpPort: peer.udpPort,
                tcpPort: peer.tcpPort,
            },
            discoveryInfo: {
                totalPeers: this.discoveredPeers.size,
                discoveryRound: this.discoveryRounds,
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

            console.log(
                `✓ Saved discovered peer: ${peer.address}:${peer.udpPort}`
            );
        } catch (err) {
            console.error('Error saving discovered peer:', err);
        }
    }

    private setupEventListeners(): void {
        // Handle new peer discovery
        this.dpt.events.on('peer:added', async (peer: PeerInfo) => {
            if (this.isStopping) return;

            const peerId = this.getPeerId(peer);
            if (!this.discoveredPeers.has(peerId)) {
                this.discoveredPeers.set(peerId, peer);
                console.log('New peer discovered:', {
                    id: peerId,
                    address: peer.address,
                    udpPort: peer.udpPort,
                    tcpPort: peer.tcpPort,
                });

                // Save the peer immediately
                await this.savePeerToFile(peer);

                // Try to discover peers from this new node
                try {
                    await this.dpt.bootstrap(peer);
                } catch (err) {
                    console.warn(
                        `Failed to bootstrap from peer ${peerId}:`,
                        err
                    );
                }
            }
        });

        // Handle peer removal
        this.dpt.events.on('peer:removed', (peer: PeerInfo) => {
            const peerId = this.getPeerId(peer);
            this.discoveredPeers.delete(peerId);
            console.log('Peer removed:', peerId);
        });

        // Handle errors
        this.dpt.events.on('error', (err: Error) => {
            console.error('DPT error:', err);
        });
    }

    private getPeerId(peer: PeerInfo): string {
        return `${peer.address}:${peer.udpPort}`;
    }

    async start(): Promise<void> {
        try {
            // Bootstrap with all bootnodes
            for (const bootnode of config.bootnodes) {
                const peerInfo = await nodeToPeerInfo(bootnode);
                await this.dpt.bootstrap(peerInfo);
                console.log('Bootstrapped with bootnode:', bootnode);
            }

            // Start periodic refresh
            this.refreshInterval = setInterval(() => {
                this.refreshDiscovery();
            }, config.discovery.refreshInterval);

            console.log('Discovery started successfully');
        } catch (err) {
            console.error('Failed to start discovery:', err);
            throw err;
        }
    }

    async stop(): Promise<void> {
        this.isStopping = true;
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
        this.dpt.destroy();
        console.log('Discovery stopped');
    }

    private async refreshDiscovery(): Promise<void> {
        try {
            // Check if we've reached the maximum discovery rounds
            if (this.discoveryRounds >= config.discovery.maxDiscoveryRounds) {
                console.log(
                    `\nDiscovery stopped: Maximum rounds (${config.discovery.maxDiscoveryRounds}) reached`
                );
                this.discoveryComplete = true;
                return;
            }

            // Check if we've reached the maximum number of nodes
            if (
                config.discovery.maxNodes > 0 &&
                this.discoveredPeers.size >= config.discovery.maxNodes
            ) {
                console.log(
                    `\nDiscovery stopped: Maximum nodes (${config.discovery.maxNodes}) reached`
                );
                this.discoveryComplete = true;
                return;
            }

            // Check if no new peers were discovered in the last round
            const currentCount = this.discoveredPeers.size;
            if (
                currentCount === this.lastDiscoveryCount &&
                this.discoveryRounds >= config.discovery.minDiscoveryRounds
            ) {
                console.log(
                    `\nDiscovery stopped: No new peers discovered in the last round (minimum rounds completed)`
                );
                this.discoveryComplete = true;
                return;
            }

            // Update the last discovery count
            const newPeers = currentCount - this.lastDiscoveryCount;
            this.lastDiscoveryCount = currentCount;
            this.discoveryRounds++;

            // Refresh the DPT table
            await this.dpt.refresh();
            console.log(
                `Discovery round ${this.discoveryRounds}/${config.discovery.maxDiscoveryRounds} completed. ` +
                    `Current peers: ${this.discoveredPeers.size} (${
                        newPeers > 0 ? `+${newPeers} new` : 'no new'
                    } peers)${
                        config.discovery.maxNodes > 0
                            ? ` (max: ${config.discovery.maxNodes})`
                            : ''
                    }`
            );
        } catch (err) {
            console.error('Error during discovery refresh:', err);
        }
    }

    isDiscoveryComplete(): boolean {
        return this.discoveryComplete;
    }

    getDiscoveredPeers(): PeerInfo[] {
        return Array.from(this.discoveredPeers.values());
    }

    getPeerCount(): number {
        return this.discoveredPeers.size;
    }

    async saveResultsToFile(): Promise<void> {
        const summary = {
            timestamp: new Date().toISOString(),
            bootnodes: config.bootnodes,
            totalPeers: this.getPeerCount(),
            summary: this.getDiscoveredPeers().map((peer) => ({
                address: peer.address,
                udpPort: peer.udpPort,
                tcpPort: peer.tcpPort,
            })),
            discoveryRounds: this.discoveryRounds,
            discoveryComplete: this.discoveryComplete,
        };

        try {
            const resultsDir = path.join(process.cwd(), 'results');
            const summaryFile = `discovery-summary-${new Date()
                .toISOString()
                .replace(/[:.]/g, '-')}.json`;
            await fs.writeFile(
                path.join(resultsDir, summaryFile),
                JSON.stringify(summary, null, 2)
            );
            console.log(`Discovery summary saved to ${summaryFile}`);
        } catch (err) {
            console.error('Error saving discovery summary:', err);
        }
    }
}

// Main function
async function main() {
    const discovery = new DevP2PDiscovery();

    try {
        // Create results directory if it doesn't exist
        await fs.mkdir(path.join(process.cwd(), 'results'), {
            recursive: true,
        });

        // Start discovery
        await discovery.start();

        // Run until discovery is complete or timeout
        console.log('Starting network discovery...');
        const startTime = Date.now();

        while (!discovery.isDiscoveryComplete()) {
            await setTimeout(1000); // Check every second

            // Check for timeout
            if (Date.now() - startTime > config.discovery.discoveryTimeout) {
                console.log('\nDiscovery stopped: Timeout reached');
                break;
            }
        }

        // Stop discovery before getting results
        await discovery.stop();

        // Wait a moment to ensure all pending operations complete
        await setTimeout(2000);

        // Print final results
        const peers = discovery.getDiscoveredPeers();
        console.log('\nDiscovery Results:');
        console.log('Total peers discovered:', discovery.getPeerCount());
        console.log('\nPeer Details:');
        peers.forEach((peer, index) => {
            console.log(
                `${index + 1}. ${peer.address}:${peer.udpPort} (TCP: ${
                    peer.tcpPort
                })`
            );
        });

        // Save results to file
        await discovery.saveResultsToFile();
    } catch (err) {
        console.error('Error in main process:', err);
    }
}

// Run the discovery
main().catch(console.error);
