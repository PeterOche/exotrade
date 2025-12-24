/**
 * Order Signing Utilities
 * 
 * Implements Extended's order signing using starknet.js
 * Based on Extended Python SDK: https://github.com/x10xchange/python_sdk/tree/starknet
 */

import { ec, hash, encode, num, typedData, shortString } from 'starknet';
import type { ExtendedConfig } from '../config';

// Order signing interface
interface OrderHashParams {
    positionId: number;
    baseAssetId: string;
    baseAmount: bigint;
    quoteAssetId: string;
    quoteAmount: bigint;
    feeAmount: bigint;
    feeAssetId: string;
    expiration: number;
    nonce: number;
    publicKey: string;
    domain: {
        name: string;
        version: string;
        chainId: string;
        revision: string;
    };
}

// Stark curve prime (CURVE.P)
const CURVE_P = BigInt('0x800000000000011000000000000000000000000000000000000000000000001');

/**
 * Convert a possibly negative bigint to a valid Stark field element
 * Negative values are converted to their modular equivalent
 */
function toFieldElement(value: bigint): bigint {
    if (value >= BigInt(0)) {
        return value;
    }
    // For negative values, add CURVE_P to get the equivalent positive field element
    return CURVE_P + value;
}

/**
 * Calculate order message hash following Extended's SNIP-12 pattern
 */
export function calculateOrderHash(params: OrderHashParams): bigint {
    const types = {
        StarknetDomain: [
            { name: 'name', type: 'shortstring' },
            { name: 'version', type: 'shortstring' },
            { name: 'chainId', type: 'shortstring' },
            { name: 'revision', type: 'felt' },
        ],
        AssetId: [
            { name: 'value', type: 'felt' }
        ],
        PositionId: [
            { name: 'value', type: 'AssetId' }
        ],
        SignedAmount: [
            { name: '_value', type: 'felt' }
        ],
        Timestamp: [
            { name: 'seconds', type: 'felt' }
        ],
        Order: [
            { name: 'positionId', type: 'PositionId' },
            { name: 'baseAssetId', type: 'AssetId' },
            { name: 'baseAmount', type: 'SignedAmount' },
            { name: 'quoteAssetId', type: 'AssetId' },
            { name: 'quoteAmount', type: 'SignedAmount' },
            { name: 'feeAssetId', type: 'AssetId' },
            { name: 'feeAmount', type: 'felt' },
            { name: 'expiration', type: 'Timestamp' },
            { name: 'salt', type: 'felt' }
        ]
    };

    // Ensure all numeric values are positive field elements and passed as hex strings
    // to avoid "0x-" BigInt conversion errors in the library
    const message = {
        positionId: { value: { value: num.toHex(params.positionId) } },
        baseAssetId: { value: num.toHex(params.baseAssetId) },
        baseAmount: { _value: num.toHex(toFieldElement(params.baseAmount)) },
        quoteAssetId: { value: num.toHex(params.quoteAssetId) },
        quoteAmount: { _value: num.toHex(toFieldElement(params.quoteAmount)) },
        feeAssetId: { value: num.toHex(params.feeAssetId) },
        feeAmount: num.toHex(params.feeAmount), // feeAmount is usually positive but handle as felt for safety
        expiration: { seconds: num.toHex(params.expiration) },
        salt: num.toHex(params.nonce)
    };

    const domain = {
        name: params.domain.name,
        version: params.domain.version,
        chainId: params.domain.chainId,
        revision: params.domain.revision
    };

    const myTypedData = {
        types,
        primaryType: 'Order',
        domain,
        message
    };

    // Calculate the hash using SNIP-12
    // Extended uses the publicKey as the signer address for the hash context
    console.error('[orderSigning] --- SNIP-12 SIGNING DEBUG ---');
    console.error('[orderSigning] Domain:', JSON.stringify(domain));
    console.error('[orderSigning] Message (Full):', JSON.stringify(message));

    const msgHash = typedData.getMessageHash(myTypedData, params.publicKey);
    console.error('[orderSigning] Resulting Hash:', msgHash);
    console.error('[orderSigning] --- END DEBUG ---');

    return BigInt(msgHash);
}

/**
 * Sign order hash with Stark private key
 */
export function signOrderHash(
    privateKey: string,
    orderHash: bigint
): { r: string; s: string } {
    const signature = ec.starkCurve.sign(
        encode.removeHexPrefix(num.toHex(orderHash)),
        encode.removeHexPrefix(privateKey)
    );

    return {
        r: num.toHex(signature.r),
        s: num.toHex(signature.s),
    };
}

/**
 * Derive Stark public key from private key
 */
export function getPublicKey(privateKey: string): string {
    return ec.starkCurve.getStarkKey(privateKey);
}

/**
 * Grind key from signature 'r' value following Extended's pattern
 */
export function grindKey(r: string): string {
    const rHex = '0x' + encode.removeHexPrefix(r).slice(0, 64);
    // Use starknet.js grindKey
    return ec.starkCurve.grindKey(rHex);
}

interface OrderSigningParams {
    market: string;
    side: 'BUY' | 'SELL';
    syntheticAmount: string;
    price: string;
    feeRate: string;
    builderFee?: string;
    nonce: number;
    expirationSeconds: number;
    positionId: number;
    syntheticAssetId: string;
    collateralAssetId: string;
    syntheticDecimals: number;
    collateralDecimals: number;
}

/**
 * Create and sign an order
 */
export function createSignedOrder(
    privateKey: string,
    publicKey: string,
    params: OrderSigningParams,
    config: ExtendedConfig
): {
    signature: { r: string; s: string };
    syntheticAmount: bigint;
    collateralAmount: bigint;
    feeAmount: bigint;
} {
    const isBuying = params.side === 'BUY';

    // Convert to stark amounts (integers with proper decimals)
    const syntheticMultiplier = BigInt(10 ** params.syntheticDecimals);
    const collateralMultiplier = BigInt(10 ** params.collateralDecimals);

    const syntheticAmountFloat = parseFloat(params.syntheticAmount);
    const priceFloat = parseFloat(params.price);
    const collateralAmountFloat = syntheticAmountFloat * priceFloat;

    // Matching Python SDK rounding logic:
    // ROUNDING_BUY_CONTEXT = ROUND_UP (ceil for positive)
    // ROUNDING_SELL_CONTEXT = ROUND_DOWN (floor for positive)
    let syntheticAmount: bigint;
    let collateralAmount: bigint;

    if (isBuying) {
        syntheticAmount = BigInt(Math.ceil(syntheticAmountFloat * Number(syntheticMultiplier)));
        collateralAmount = BigInt(Math.ceil(collateralAmountFloat * Number(collateralMultiplier)));
    } else {
        syntheticAmount = BigInt(Math.floor(syntheticAmountFloat * Number(syntheticMultiplier)));
        collateralAmount = BigInt(Math.floor(collateralAmountFloat * Number(collateralMultiplier)));
    }

    // Calculate fee (always ROUND_UP per Python SDK)
    const totalFeeRate = parseFloat(params.feeRate) + (parseFloat(params.builderFee || '0'));
    const feeAmountFloat = collateralAmountFloat * totalFeeRate;
    const feeAmount = BigInt(Math.ceil(feeAmountFloat * Number(collateralMultiplier)));

    // Negate based on side
    if (isBuying) {
        collateralAmount = -collateralAmount;
    } else {
        syntheticAmount = -syntheticAmount;
    }

    // Calculate order hash
    const orderHash = calculateOrderHash({
        positionId: params.positionId,
        baseAssetId: params.syntheticAssetId,
        baseAmount: syntheticAmount,
        quoteAssetId: params.collateralAssetId,
        quoteAmount: collateralAmount,
        feeAmount,
        feeAssetId: params.collateralAssetId,
        expiration: params.expirationSeconds,
        nonce: params.nonce,
        publicKey,
        domain: config.starknetDomain,
    });

    // Sign
    const signature = signOrderHash(privateKey, orderHash);

    return {
        signature,
        syntheticAmount,
        collateralAmount,
        feeAmount,
    };
}
