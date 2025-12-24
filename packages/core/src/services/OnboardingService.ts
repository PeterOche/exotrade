import { extendedApi } from '../api/ExtendedApiClient';
import { useAuthStore } from '../store';
import type { ExtendedConfig } from '../config';
import { DEFAULT_CONFIG } from '../config';
import { grindKey, getPublicKey, signOrderHash, calculateOrderHash } from '../signing/orderSigning';
import { hash, ec } from 'starknet';

export interface OnboardingCredentials {
    accountId: number;
    apiKey: string;
    starkPublicKey: string;
    starkPrivateKey: string;
    vault: number;
    walletAddress: string;
}

const STORAGE_KEY = 'exotrade_credentials';

/**
 * Onboarding Service
 * Implements Extended's exact onboarding protocol
 */
export class OnboardingService {
    private config: ExtendedConfig;
    private credentials: OnboardingCredentials | null = null;

    constructor(config: ExtendedConfig = DEFAULT_CONFIG) {
        this.config = config;
    }

    /**
     * Generate EIP-712 typed data for key derivation
     * This matches Extended SDK's get_key_derivation_struct_to_sign
     */
    generateKeyDerivationTypedData(accountIndex: number, walletAddress: string) {
        return {
            types: {
                EIP712Domain: [
                    { name: 'name', type: 'string' },
                ],
                AccountCreation: [
                    { name: 'accountIndex', type: 'int8' },
                    { name: 'wallet', type: 'address' },
                    { name: 'tosAccepted', type: 'bool' },
                ],
            },
            domain: {
                name: this.config.signingDomain,
            },
            primaryType: 'AccountCreation' as const,
            message: {
                accountIndex,
                wallet: walletAddress,
                tosAccepted: true,
            },
        };
    }

    /**
     * Generate EIP-712 typed data for account registration
     * This matches Extended SDK's AccountRegistration
     */
    generateRegistrationTypedData(
        accountIndex: number,
        walletAddress: string,
        timestamp: string,
        action: string = 'REGISTER'
    ) {
        return {
            types: {
                EIP712Domain: [
                    { name: 'name', type: 'string' },
                ],
                AccountRegistration: [
                    { name: 'accountIndex', type: 'int8' },
                    { name: 'wallet', type: 'address' },
                    { name: 'tosAccepted', type: 'bool' },
                    { name: 'time', type: 'string' },
                    { name: 'action', type: 'string' },
                    { name: 'host', type: 'string' },
                ],
            },
            domain: {
                name: this.config.signingDomain,
            },
            primaryType: 'AccountRegistration' as const,
            message: {
                accountIndex,
                wallet: walletAddress,
                tosAccepted: true,
                time: timestamp,
                action,
                host: this.config.onboardingUrl,
            },
        };
    }

    /**
     * Derive Stark keypair from EIP-712 signature
     */
    deriveStarkKeyFromSignature(signature: string): { privateKey: string; publicKey: string } {
        const privateKey = grindKey(signature);
        const publicKey = getPublicKey(privateKey);
        return { privateKey, publicKey };
    }

    /**
     * Generate L2 (Stark) signature for onboarding
     * Signs: pedersen_hash(wallet_address, stark_public_key)
     */
    generateL2Signature(
        walletAddress: string,
        starkPrivateKey: string,
        starkPublicKey: string
    ): { r: string; s: string } {
        // pedersen_hash(wallet_address, stark_public_key)
        const walletBigInt = BigInt(walletAddress);
        const publicKeyBigInt = BigInt(starkPublicKey);
        const messageHash = hash.computePedersenHash(walletBigInt, publicKeyBigInt);

        // Sign with Stark private key
        const signature = signOrderHash(starkPrivateKey, BigInt(messageHash));
        return signature;
    }

    /**
     * Check if we have stored credentials
     */
    hasStoredCredentials(): boolean {
        if (typeof window === 'undefined') return false;
        return !!localStorage.getItem(STORAGE_KEY);
    }

    /**
     * Load credentials from localStorage
     */
    loadStoredCredentials(): OnboardingCredentials | null {
        if (typeof window === 'undefined') return null;

        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (!stored) return null;

            const credentials = JSON.parse(stored) as OnboardingCredentials;
            this.credentials = credentials;

            // Set API key on client
            extendedApi.setApiKey(credentials.apiKey);

            // Update auth store
            useAuthStore.getState().setAuth(
                credentials.apiKey,
                credentials.starkPrivateKey,
                credentials.accountId
            );
            useAuthStore.getState().setOnboarded(true);

            console.log('[OnboardingService] Loaded credentials for:', credentials.walletAddress);
            return credentials;
        } catch (error) {
            console.error('[OnboardingService] Failed to load credentials:', error);
            return null;
        }
    }

    /**
     * Store credentials to localStorage
     */
    private storeCredentials(credentials: OnboardingCredentials): void {
        if (typeof window === 'undefined') return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
        this.credentials = credentials;
    }

    /**
     * Clear stored credentials (logout)
     */
    clearCredentials(): void {
        if (typeof window !== 'undefined') {
            localStorage.removeItem(STORAGE_KEY);
        }
        this.credentials = null;
        useAuthStore.getState().logout();
    }

    /**
     * Get current credentials
     */
    getCredentials(): OnboardingCredentials | null {
        return this.credentials;
    }

    /**
     * Full onboarding flow
     * 
     * @param walletAddress - User's wallet address
     * @param signTypedData - Function to sign EIP-712 typed data
     * @param signMessage - Function to sign plain messages (for API key creation)
     * @param referralCode - Optional referral code
     */
    async onboard(
        walletAddress: string,
        signTypedData: (typedData: object) => Promise<string>,
        signMessage?: (message: string) => Promise<string>,
        referralCode?: string
    ): Promise<OnboardingCredentials> {
        console.log('[OnboardingService] Starting onboarding for:', walletAddress);

        // Step 1: Sign key derivation message and derive Stark keys
        const keyDerivationData = this.generateKeyDerivationTypedData(0, walletAddress);
        console.log('[OnboardingService] Signing key derivation message...');
        const keyDerivationSig = await signTypedData(keyDerivationData);

        const { privateKey: starkPrivateKey, publicKey: starkPublicKey } =
            this.deriveStarkKeyFromSignature(keyDerivationSig);
        console.log('[OnboardingService] Derived Stark public key:', starkPublicKey);

        // Step 2: Sign registration message  
        const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
        const registrationData = this.generateRegistrationTypedData(0, walletAddress, timestamp);
        console.log('[OnboardingService] Signing registration message...');
        const l1Signature = await signTypedData(registrationData);

        // Step 3: Generate L2 signature
        const l2Signature = this.generateL2Signature(walletAddress, starkPrivateKey, starkPublicKey);
        console.log('[OnboardingService] L2 signature generated');

        // Step 4: Build onboarding payload
        const onboardingPayload = {
            l1Signature,
            l2Key: starkPublicKey,
            l2Signature: {
                r: l2Signature.r,
                s: l2Signature.s,
            },
            accountCreation: {
                accountIndex: 0,
                wallet: walletAddress,
                tosAccepted: true,
                time: timestamp,
                action: 'REGISTER',
                host: this.config.onboardingUrl,
            },
            referralCode,
        };

        console.log('[OnboardingService] Onboarding payload:', JSON.stringify(onboardingPayload, null, 2));

        // Step 5: Submit to Extended
        const onboardUrl = typeof window !== 'undefined'
            ? '/api/onboard'
            : `${this.config.onboardingUrl}/auth/onboard`;

        const response = await fetch(onboardUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(onboardingPayload),
        });

        const contentType = response.headers.get('content-type');
        if (!contentType?.includes('application/json')) {
            const text = await response.text();
            console.error('[OnboardingService] Non-JSON response:', response.status, text.substring(0, 200));
            throw new Error(`Onboarding failed (${response.status}): ${text.substring(0, 100)}`);
        }

        const result = await response.json();
        console.log('[OnboardingService] Onboarding response:', result);

        if (!response.ok || result.status === 'ERROR') {
            throw new Error(result.error?.message || result.message || 'Onboarding failed');
        }

        // Step 6: Extract credentials
        const credentials: OnboardingCredentials = {
            accountId: result.data?.defaultAccount?.id || result.data?.accountId || 0,
            apiKey: '', // Will be created in next step
            starkPublicKey,
            starkPrivateKey,
            vault: result.data?.defaultAccount?.l2Vault || result.data?.vault || 1,
            walletAddress,
        };

        console.log('[OnboardingService] Account created, vault:', credentials.vault);

        // Step 7: Create API key (if account was created successfully and signMessage provided)
        if (credentials.accountId && signMessage) {
            try {
                credentials.apiKey = await this.createApiKey(
                    walletAddress,
                    credentials.accountId,
                    signMessage
                );
                console.log('[OnboardingService] API key created');
            } catch (apiKeyError) {
                console.warn('[OnboardingService] Failed to create API key:', apiKeyError);
                // Continue without API key - user can create manually
            }
        }

        // Store and return credentials
        this.storeCredentials(credentials);

        useAuthStore.getState().setAuth(
            credentials.apiKey,
            credentials.starkPrivateKey,
            credentials.accountId
        );
        useAuthStore.getState().setOnboarded(true);

        // Store deposit address (Starknet bridge address for receiving funds)
        const depositAddress = result.data?.defaultAccount?.bridgeStarknetAddress;
        if (depositAddress) {
            useAuthStore.getState().setDepositAddress(depositAddress);
            localStorage.setItem('exotrade_deposit_address', depositAddress);
        }

        if (credentials.apiKey) {
            extendedApi.setApiKey(credentials.apiKey);
            console.log('[OnboardingService] Set API key:', credentials.apiKey.slice(0, 8) + '...');
        }

        if (credentials.accountId) {
            extendedApi.setAccountId(credentials.accountId);
            console.log('[OnboardingService] Set accountId:', credentials.accountId);
        }

        console.log('[OnboardingService] Onboarding complete');
        return credentials;
    }

    /**
     * Create API key for an account
     */
    async createApiKey(
        walletAddress: string,
        accountId: number,
        signMessage: (message: string) => Promise<string>
    ): Promise<string> {
        const requestPath = '/api/v1/user/account/api-key';
        const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
        const messageToSign = `${requestPath}@${timestamp}`;

        const l1Signature = await signMessage(messageToSign);

        const apiKeyUrl = typeof window !== 'undefined'
            ? '/api/extended/user/account/api-key'
            : `${this.config.onboardingUrl}${requestPath}`;

        const response = await fetch(apiKeyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'L1_SIGNATURE': l1Signature,
                'L1_MESSAGE_TIME': timestamp,
                'X-X10-ACTIVE-ACCOUNT': String(accountId),
            },
            body: JSON.stringify({ description: 'ExoTrade Trading Key' }),
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error?.message || 'Failed to create API key');
        }

        return result.data?.key || '';
    }

    /**
     * Check if user is onboarded
     */
    async checkOnboardingStatus(walletAddress: string): Promise<OnboardingCredentials | null> {
        const stored = this.loadStoredCredentials();

        if (!stored) return null;

        if (stored.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
            console.log('[OnboardingService] Wallet mismatch, clearing credentials');
            this.clearCredentials();
            return null;
        }

        // Restore API key and account ID to extendedApi
        if (stored.apiKey) {
            extendedApi.setApiKey(stored.apiKey);
        }
        if (stored.accountId) {
            extendedApi.setAccountId(stored.accountId);
        }

        // Update auth store with credentials
        useAuthStore.getState().setAuth(
            stored.apiKey,
            stored.starkPrivateKey,
            stored.accountId
        );
        useAuthStore.getState().setOnboarded(true);

        // Load saved deposit address
        const savedDepositAddress = localStorage.getItem('exotrade_deposit_address');
        if (savedDepositAddress) {
            useAuthStore.getState().setDepositAddress(savedDepositAddress);
        }

        console.log('[OnboardingService] Restored credentials for account:', stored.accountId);
        return stored;
    }
}

// Singleton instance
export const onboardingService = new OnboardingService();
