import { DPT, PeerInfo } from '@ethereumjs/devp2p';
import { Buffer } from 'buffer';
import { setTimeout } from 'timers/promises';
import dns from 'dns/promises';

// Configuration
const config = {
    // Generate a random private key for this session
    privateKey: Buffer.from(
        '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        'hex'
    ),
    // Story bootnodes
    bootnodes: [
        'enode://f42110982b6ddaa4de8031f9fecb619d181902db5529a43bc9b1187debbc67771bf937b2210cbfd33babd2acbe138506596e23d0d1792ab3cb5229c5bb051544@b1.storyrpc.io:30303',
        'enode://2ae459a7cc28b59822377deec266e24e5ed00374d7a83e2e8d0d67dd89dc2b80366c1353c7909fe81b840f6081188850677fa20dd5d262c9e3f67eb23d0be0b5@b2.storyrpc.io:30303',
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
    },
};

// Convert enode string to PeerInfo with DNS resolution
async function enodeToPeerInfo(enode: string): Promise<PeerInfo> {
    const match = enode.match(/enode:\/\/([^@]+)@([^:]+):(\d+)/);
    if (!match) throw new Error('Invalid enode format');

    const host = match[2];
    const port = parseInt(match[3]);

    // Resolve hostname to IP address
    const addresses = await dns.resolve(host);
    if (addresses.length === 0) {
        throw new Error(`Could not resolve hostname: ${host}`);
    }

    return {
        address: addresses[0],
        udpPort: port,
        tcpPort: port,
    };
}

class DevP2PDiscovery {
    private dpt: DPT;
    private discoveredPeers: Map<string, PeerInfo>;
    private refreshInterval: NodeJS.Timeout | null;

    constructor() {
        this.discoveredPeers = new Map();
        this.refreshInterval = null;

        // Initialize DPT
        this.dpt = new DPT(config.privateKey, {
            endpoint: config.endpoint,
            refreshInterval: config.discovery.refreshInterval,
        });

        // Set up event listeners
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        // Handle new peer discovery
        this.dpt.events.on('peer:added', (peer: PeerInfo) => {
            const peerId = this.getPeerId(peer);
            this.discoveredPeers.set(peerId, peer);
            console.log('New peer discovered:', {
                id: peerId,
                address: peer.address,
                udpPort: peer.udpPort,
                tcpPort: peer.tcpPort,
            });
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
                const peerInfo = await enodeToPeerInfo(bootnode);
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
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
        this.dpt.destroy();
        console.log('Discovery stopped');
    }

    private async refreshDiscovery(): Promise<void> {
        try {
            // Refresh the DPT table
            await this.dpt.refresh();
            console.log(
                'Discovery refreshed. Current peers:',
                this.discoveredPeers.size
            );
        } catch (err) {
            console.error('Error during discovery refresh:', err);
        }
    }

    getDiscoveredPeers(): PeerInfo[] {
        return Array.from(this.discoveredPeers.values());
    }

    getPeerCount(): number {
        return this.discoveredPeers.size;
    }
}

// Main function
async function main() {
    const discovery = new DevP2PDiscovery();

    try {
        // Start discovery
        await discovery.start();

        // Run for 2 minutes
        console.log('Running discovery for 2 minutes...');
        await setTimeout(120000);

        // Stop discovery
        await discovery.stop();

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
    } catch (err) {
        console.error('Error in main process:', err);
    }
}

// Run the discovery
main().catch(console.error);
