# EVM Node Discovery

A tool for discovering and testing EVM (Ethereum Virtual Machine) nodes using both direct RPC and devp2p discovery methods.

## Features

-   Discover nodes through bootnodes
-   Test RPC endpoint availability
-   Measure node latency and rate limits
-   Devp2p peer discovery
-   Support for multiple networks (Story, Polygon, etc.)

## Installation

```bash
bun install
```

## Usage

### RPC Node Discovery

```bash
bun run dev
```

This will:

1. Connect to bootnodes
2. Discover peers through the devp2p protocol
3. Run for 2 minutes
4. Print discovered peers

## Configuration

### Network Discovery

Edit `src/main.ts` to modify:

-   Bootnodes
-   Discovery parameters
-   Private key (for development only)

## Security Notes

-   The private key in devp2p discovery is for development only
-   In production, use a secure random private key
-   Be mindful of rate limits when testing RPC endpoints

## Todo

-   [ ] Add RPC endpoint testing functionality
-   [ ] Implement rate limit detection
-   [ ] Add support for additional networks
-   [ ] Create a node ranking system based on:
    -   [ ] Latency
    -   [ ] Uptime
    -   [ ] Rate limits
    -   [ ] Geographic location
-   [ ] Add configuration file support
-   [ ] Add metrics collection and reporting
