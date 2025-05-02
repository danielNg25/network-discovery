import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

interface IPInfo {
    ip: string;
    country: string;
    countryCode: string;
    region: string;
    regionName: string;
    city: string;
    isp: string;
    org: string;
    as: string;
    lat: number;
    lon: number;
}

interface PeerData {
    jsonrpc: string;
    result: {
        numPeers: string;
        peers: {
            ip: string;
            publicIP: string;
            nodeID: string;
            version: string;
            lastSent: string;
            lastReceived: string;
            observedUptime: string;
            observedSubnetUptimes: Record<string, unknown>;
            trackedSubnets: unknown[];
            benched: unknown[];
        }[];
    };
    id: number;
}

async function lookupIP(ip: string): Promise<IPInfo> {
    try {
        // Extract the IP address without port
        const cleanIp = ip.split(':')[0];
        const response = await axios.get(`http://ip-api.com/json/${cleanIp}`);
        return response.data;
    } catch (error) {
        console.error(`Error looking up IP ${ip}:`, error);
        throw error;
    }
}

async function extractIpsFromPeers(): Promise<string[]> {
    try {
        // Read the peers.json file
        const peersPath = path.join(process.cwd(), 'peers.json');
        const peersData = await fs.readFile(peersPath, 'utf-8');
        const peers: PeerData = JSON.parse(peersData);

        // Extract IPs from the peers data
        return peers.result.peers.map((peer) => peer.publicIP);
    } catch (error) {
        console.error('Error reading peers.json:', error);
        return [];
    }
}

async function main() {
    // Get IPs from peers.json
    const ips = await extractIpsFromPeers();

    if (ips.length === 0) {
        console.error('No IPs found in peers.json');
        return;
    }

    console.log(`Found ${ips.length} peers in peers.json`);
    console.log('IP Address Lookup Results:\n');
    console.log('IP Address\t\tCountry\t\tCity\t\tISP\t\tAS');
    console.log(
        '--------------------------------------------------------------------------------'
    );

    // Create results directory if it doesn't exist
    const resultsDir = path.join(process.cwd(), 'results');
    await fs.mkdir(resultsDir, { recursive: true });

    // Create a file to store the IP lookup results
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultsFilePath = path.join(
        resultsDir,
        `ip-lookup-results-${timestamp}.json`
    );
    const resultsFile = await fs.open(resultsFilePath, 'w');

    try {
        for (const ip of ips) {
            try {
                const info = await lookupIP(ip);
                console.log(
                    `${ip}\t${info.country}\t${info.city}\t${info.isp}\t${info.as}`
                );

                // Save result to file
                const result = {
                    timestamp: new Date().toISOString(),
                    ip,
                    info,
                };
                await resultsFile.write(JSON.stringify(result) + '\n');

                // Add delay to respect API rate limits
                await new Promise((resolve) => setTimeout(resolve, 1000));
            } catch (error) {
                console.log(`${ip}\tError looking up IP`);
            }
        }
    } finally {
        await resultsFile.close();
        console.log(`\nResults saved to ${resultsFilePath}`);
    }
}

main().catch(console.error);
