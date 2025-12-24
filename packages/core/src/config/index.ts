// Extended API Configuration

export interface ExtendedConfig {
    apiBaseUrl: string;
    streamUrl: string;
    onboardingUrl: string;
    signingDomain: string;
    collateralDecimals: number;
    starknetDomain: {
        name: string;
        version: string;
        chainId: string;
        revision: string;
    };
    collateralAssetId: string;
}

export const MAINNET_CONFIG: ExtendedConfig = {
    apiBaseUrl: 'https://api.starknet.extended.exchange/api/v1',
    streamUrl: 'wss://api.starknet.extended.exchange/stream.extended.exchange/v1',
    onboardingUrl: 'https://api.starknet.extended.exchange',
    signingDomain: 'extended.exchange',
    collateralDecimals: 6,
    starknetDomain: {
        name: 'Perpetuals',
        version: 'v0',
        chainId: 'SN_MAIN',
        revision: '1',
    },
    collateralAssetId: '0x1',
};

export const TESTNET_CONFIG: ExtendedConfig = {
    apiBaseUrl: 'https://api.starknet.sepolia.extended.exchange/api/v1',
    streamUrl: 'wss://starknet.sepolia.extended.exchange/stream.extended.exchange/v1',
    onboardingUrl: 'https://api.starknet.sepolia.extended.exchange',
    signingDomain: 'starknet.sepolia.extended.exchange',
    collateralDecimals: 6,
    starknetDomain: {
        name: 'Perpetuals',
        version: 'v0',
        chainId: 'SN_SEPOLIA',
        revision: '1',
    },
    // USDC collateral asset ID (Pedersen hash of asset info)
    collateralAssetId: '0x31857064564ed0ff978e687456963cba09c2c6985d8f9300a1de4962fafa054',
};

// Default to testnet for development
export const DEFAULT_CONFIG = TESTNET_CONFIG;
