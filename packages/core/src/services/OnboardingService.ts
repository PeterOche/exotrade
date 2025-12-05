import { extendedApi } from '../api/ExtendedApiClient';
import { useAuthStore } from '../store';
import type { ExtendedConfig } from '../config';
import { DEFAULT_CONFIG } from '../config';

interface OnboardingResult {
    accountId: number;
    apiKey: string;
    starkPublicKey: string;
    starkPrivateKey: string;
    vault: number;
}

/**
 * Onboarding Service
 * Handles user account creation and setup on Extended
 */
export class OnboardingService {
    private config: ExtendedConfig;

    constructor(config: ExtendedConfig = DEFAULT_CONFIG) {
        this.config = config;
    }

    /**
     * Generate EIP-712 typed data for key derivation
     * This follows Extended's SDK pattern
     */
    generateKeyDerivationMessage(accountIndex: number, walletAddress: string) {
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
     * Derive Stark private key from Ethereum signature
     * This follows Extended's SDK pattern using the 'r' value
     */
    deriveStarkKeyFromSignature(signature: string): string {
        // Remove 0x prefix if present
        const cleanSig = signature.replace(/^0x/, '');

        // Extract 'r' value (first 64 characters)
        const r = cleanSig.substring(0, 64);

        // Convert to BigInt and grind to valid Stark key
        // This is a simplified version - actual implementation needs grinding
        const rBigInt = BigInt('0x' + r);

        // For now, return the r value directly
        // TODO: Implement proper key grinding using starknet.js
        console.warn('[OnboardingService] Using simplified key derivation - implement proper grinding');

        return '0x' + r;
    }

    /**
     * Check if user already has an Extended account
     */
    async checkExistingAccount(): Promise<OnboardingResult | null> {
        try {
            const accountInfo = await extendedApi.getAccountInfo();
            if (accountInfo) {
                // Account exists, but we need the full credentials from storage
                // This would typically be stored securely after initial onboarding
                return null; // Let the app check local storage
            }
            return null;
        } catch {
            return null;
        }
    }

    /**
     * Onboard a new user to Extended
     * 
     * @param walletAddress - User's wallet address
     * @param signMessage - Function to sign EIP-712 message (from Privy)
     * @param referralCode - Optional referral code
     */
    async onboard(
        walletAddress: string,
        signMessage: (typedData: object) => Promise<string>,
        referralCode?: string
    ): Promise<OnboardingResult> {
        const accountIndex = 0; // Main account

        // Generate key derivation message
        const typedData = this.generateKeyDerivationMessage(accountIndex, walletAddress);

        // Sign with user's wallet (via Privy)
        const signature = await signMessage(typedData);

        // Derive Stark key from signature
        const starkPrivateKey = this.deriveStarkKeyFromSignature(signature);

        // TODO: Derive public key from private key using starknet.js
        // For now, use placeholder
        const starkPublicKey = '0x' + 'placeholder';

        // Create onboarding payload
        const onboardingPayload = {
            accountIndex,
            wallet: walletAddress,
            starkKey: starkPublicKey,
            referralCode,
        };

        // Submit onboarding request to Extended
        const response = await fetch(`${this.config.onboardingUrl}/api/v1/onboard`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'ExoTrade/1.0',
            },
            body: JSON.stringify(onboardingPayload),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Onboarding failed');
        }

        const result = await response.json();

        // Store credentials
        const credentials: OnboardingResult = {
            accountId: result.data.accountId,
            apiKey: result.data.apiKey,
            starkPublicKey,
            starkPrivateKey,
            vault: result.data.vault,
        };

        // Update auth store
        useAuthStore.getState().setAuth(
            credentials.apiKey,
            credentials.starkPrivateKey,
            credentials.accountId
        );
        useAuthStore.getState().setOnboarded(true);

        // Set API key on client
        extendedApi.setApiKey(credentials.apiKey);

        return credentials;
    }

    /**
     * Create a subaccount
     */
    async createSubaccount(
        accountIndex: number,
        walletAddress: string,
        signMessage: (typedData: object) => Promise<string>,
        description?: string
    ): Promise<OnboardingResult> {
        // Similar to onboard but for subaccounts
        // Subaccounts share the same wallet but have different indices
        const typedData = this.generateKeyDerivationMessage(accountIndex, walletAddress);
        const signature = await signMessage(typedData);
        const starkPrivateKey = this.deriveStarkKeyFromSignature(signature);
        const starkPublicKey = '0x' + 'placeholder';

        const payload = {
            accountIndex,
            wallet: walletAddress,
            starkKey: starkPublicKey,
            description,
        };

        const response = await fetch(`${this.config.onboardingUrl}/api/v1/onboard/subaccount`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'ExoTrade/1.0',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Subaccount creation failed');
        }

        const result = await response.json();

        return {
            accountId: result.data.accountId,
            apiKey: result.data.apiKey,
            starkPublicKey,
            starkPrivateKey,
            vault: result.data.vault,
        };
    }
}

// Singleton instance
export const onboardingService = new OnboardingService();
