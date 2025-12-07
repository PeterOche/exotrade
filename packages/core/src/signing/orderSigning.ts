/**
 * Order Signing Utilities
 * 
 * Implements Extended's order signing using starknet.js
 * Based on Extended Python SDK: https://github.com/x10xchange/python_sdk/tree/starknet
 */

import { ec, hash, encode, num } from 'starknet';
import type { ExtendedConfig } from '../config';

// Order signing constants
const ORDER_TYPE_HASH = hash.getSelectorFromName('Order');

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
    if (value >= 0n) {
        return value;
    }
    // For negative values, add CURVE_P to get the equivalent positive field element
    return CURVE_P + value;
}

/**
 * Calculate order message hash following Extended's pattern
 */
export function calculateOrderHash(params: OrderHashParams): bigint {
    // Domain separator
    const domainHash = hash.computePedersenHash(
        hash.computePedersenHash(
            hash.computePedersenHash(
                hash.getSelectorFromName(params.domain.name),
                hash.getSelectorFromName(params.domain.version)
            ),
            hash.getSelectorFromName(params.domain.chainId)
        ),
        BigInt(params.domain.revision)
    );

    // Order data hash - convert all values to field elements (handle negatives)
    const orderDataHash = hash.computePedersenHashOnElements([
        BigInt(params.positionId),
        BigInt(params.baseAssetId),
        toFieldElement(params.baseAmount),
        BigInt(params.quoteAssetId),
        toFieldElement(params.quoteAmount),
        toFieldElement(params.feeAmount),
        BigInt(params.feeAssetId),
        BigInt(params.expiration),
        BigInt(params.nonce),
        BigInt(params.publicKey),
    ]);

    // Final hash
    const finalHash = hash.computePedersenHash(domainHash, orderDataHash);
    return BigInt(finalHash);
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

    let syntheticAmount = BigInt(Math.round(syntheticAmountFloat * Number(syntheticMultiplier)));
    let collateralAmount = BigInt(Math.round(collateralAmountFloat * Number(collateralMultiplier)));

    // Calculate fee
    const totalFeeRate = parseFloat(params.feeRate) + (parseFloat(params.builderFee || '0'));
    const feeAmountFloat = collateralAmountFloat * totalFeeRate;
    const feeAmount = BigInt(Math.ceil(feeAmountFloat * Number(collateralMultiplier)));

    // Negate based on side (buying = negative collateral, selling = negative synthetic)
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
