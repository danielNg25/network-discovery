import { ethers } from 'ethers';

const ERC20_ABI = ['function decimals() view returns (uint8)'];

async function checkArchiveNode(
    rpcUrl: string,
    tokenAddress: string,
    blockNumber: number
) {
    try {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const tokenContract = new ethers.Contract(
            tokenAddress,
            ERC20_ABI,
            provider
        );

        console.log(`\nChecking RPC: ${rpcUrl}`);
        console.log(`Token Address: ${tokenAddress}`);
        console.log(`Block Number: ${blockNumber}`);

        // Try to get decimals at the specified block
        const decimals = await tokenContract.decimals({
            blockTag: blockNumber,
        });

        console.log(`Success! RPC is an archive node.`);
        console.log(`Decimals: ${decimals}`);
        return { rpcUrl, isArchive: true, decimals };
    } catch (error) {
        if (error instanceof Error) {
            if (
                error.message.includes('missing trie node') ||
                error.message.includes('missing trie node') ||
                error.message.includes('historical state unavailable')
            ) {
                console.log('Error: RPC is not an archive node');
                console.log('The node does not have historical state data');
            } else {
                console.log('Error:', error.message);
            }
        }
        return {
            rpcUrl,
            isArchive: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

// Mock parameters
const MOCK_RPC_URLS = [
    'https://flare-api.flare.network/ext/C/rpc',
    'https://rpc.ankr.com/flare',
    'https://flare.rpc.thirdweb.com',
    'https://rpc.au.cc/flare',
    'https://flare.rpc.hypersync.xyz/',
    'https://flare.gateway.tenderly.co',
    'https://autumn-light-lambo.flare-mainnet.quiknode.pro/94b80321b067a74f6a720bbc4ef66be3b92bcc52/ext/bc/C/rpc/',
];

const MOCK_TOKEN_ADDRESS = '0x12e605bc104e93B45e1aD99F9e555f659051c2BB'; // DAI token on Ethereum
const MOCK_BLOCK_NUMBER = 40824000; // Some old block number

async function checkAllRPCs() {
    console.log('Starting RPC archive node check...');
    console.log(`Token Address: ${MOCK_TOKEN_ADDRESS}`);
    console.log(`Block Number: ${MOCK_BLOCK_NUMBER}`);
    console.log('\nChecking RPCs:');

    const results = await Promise.all(
        MOCK_RPC_URLS.map((rpcUrl) =>
            checkArchiveNode(rpcUrl, MOCK_TOKEN_ADDRESS, MOCK_BLOCK_NUMBER)
        )
    );

    console.log('\n=== Results ===');
    results.forEach((result) => {
        console.log(`\nRPC: ${result.rpcUrl}`);
        console.log(
            `Is Archive Node: ${result.isArchive ? '✅ Yes' : '❌ No'}`
        );
        if (result.isArchive) {
            console.log(`Decimals: ${result.decimals}`);
        } else {
            console.log(`Error: ${result.error}`);
        }
    });

    const archiveNodes = results.filter((r) => r.isArchive);
    console.log(
        `\nFound ${archiveNodes.length} archive nodes out of ${MOCK_RPC_URLS.length} RPCs`
    );
}

// Run the check
checkAllRPCs().catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
});
