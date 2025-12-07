'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore, useAccountStore, extendedApi } from '@exotrade/core';
import { usePrivy } from '@privy-io/react-auth';

export default function WalletPage() {
    const router = useRouter();
    const { ready, authenticated, user } = usePrivy();
    const { isOnboarded, depositAddress } = useAuthStore();
    const { balance } = useAccountStore();
    const [copied, setCopied] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // Fetch balance on mount
    useEffect(() => {
        const fetchBalance = async () => {
            try {
                const balanceData = await extendedApi.getBalance();
                if (balanceData) {
                    useAccountStore.getState().setBalance(balanceData);
                }
            } catch (error) {
                console.error('Failed to fetch balance:', error);
            } finally {
                setIsLoading(false);
            }
        };

        if (isOnboarded) {
            fetchBalance();
        } else {
            setIsLoading(false);
        }
    }, [isOnboarded]);

    // Redirect if not connected
    useEffect(() => {
        if (ready && !authenticated) {
            router.push('/');
        }
    }, [ready, authenticated, router]);

    const copyToClipboard = async () => {
        if (!depositAddress) return;
        try {
            await navigator.clipboard.writeText(depositAddress);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error('Failed to copy:', error);
        }
    };

    const formatAddress = (address: string) => {
        if (!address) return '';
        return `${address.slice(0, 10)}...${address.slice(-8)}`;
    };

    const formatUSD = (value: string | undefined) => {
        if (!value) return '$0.00';
        const num = parseFloat(value);
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(num);
    };

    if (!ready) {
        return (
            <div className="wallet-page">
                <div className="loading">Loading...</div>
            </div>
        );
    }

    return (
        <div className="wallet-page">
            <header className="wallet-header">
                <button className="back-button" onClick={() => router.back()}>
                    ← Back
                </button>
                <h1>Wallet</h1>
            </header>

            <main className="wallet-content">
                {/* Balance Card */}
                <section className="wallet-card balance-card">
                    <h2>Account Balance</h2>
                    {isLoading ? (
                        <div className="loading">Loading balance...</div>
                    ) : !isOnboarded ? (
                        <div className="not-onboarded">
                            <p>Please complete onboarding first</p>
                            <button
                                className="action-button"
                                onClick={() => router.push('/trade/BTC-USD')}
                            >
                                Go to Trading
                            </button>
                        </div>
                    ) : (
                        <div className="balance-grid">
                            <div className="balance-item">
                                <span className="label">Equity</span>
                                <span className="value">{formatUSD(balance?.equity)}</span>
                            </div>
                            <div className="balance-item">
                                <span className="label">Available for Trade</span>
                                <span className="value highlight">{formatUSD(balance?.availableForTrade)}</span>
                            </div>
                            <div className="balance-item">
                                <span className="label">Wallet Balance</span>
                                <span className="value">{formatUSD(balance?.balance)}</span>
                            </div>
                            <div className="balance-item">
                                <span className="label">Unrealized PnL</span>
                                <span className={`value ${parseFloat(balance?.unrealisedPnl || '0') >= 0 ? 'positive' : 'negative'}`}>
                                    {formatUSD(balance?.unrealisedPnl)}
                                </span>
                            </div>
                            <div className="balance-item">
                                <span className="label">Initial Margin</span>
                                <span className="value">{formatUSD(balance?.initialMargin)}</span>
                            </div>
                            <div className="balance-item">
                                <span className="label">Available for Withdrawal</span>
                                <span className="value">{formatUSD(balance?.availableForWithdrawal)}</span>
                            </div>
                        </div>
                    )}
                </section>

                {/* Deposit Address Card */}
                <section className="wallet-card deposit-card">
                    <h2>Deposit Funds</h2>
                    {!isOnboarded || !depositAddress ? (
                        <div className="not-onboarded">
                            <p>Complete onboarding to get your deposit address</p>
                        </div>
                    ) : (
                        <>
                            <p className="deposit-instructions">
                                Send <strong>USDC</strong> on <strong>Starknet</strong> to the address below.
                                Make sure you're on the correct network!
                            </p>

                            <div className="address-box">
                                <div className="address-content">
                                    <span className="address-label">Starknet Address</span>
                                    <code className="address-value">{formatAddress(depositAddress)}</code>
                                </div>
                                <button
                                    className={`copy-button ${copied ? 'copied' : ''}`}
                                    onClick={copyToClipboard}
                                >
                                    {copied ? '✓ Copied!' : 'Copy'}
                                </button>
                            </div>

                            <div className="full-address">
                                <span className="label">Full Address:</span>
                                <code>{depositAddress}</code>
                            </div>

                            <div className="network-warning">
                                <span className="warning-icon">⚠️</span>
                                <span>
                                    Only send USDC on <strong>Starknet Sepolia</strong> (Testnet).
                                    Funds sent on other networks will be lost.
                                </span>
                            </div>

                            <a
                                href="https://starknet.sepolia.extended.exchange"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="faucet-link"
                            >
                                Get Testnet USDC from Extended Faucet →
                            </a>
                        </>
                    )}
                </section>

                {/* Actions */}
                <section className="wallet-actions">
                    <button
                        className="action-button primary"
                        onClick={() => router.push('/trade/BTC-USD')}
                    >
                        Start Trading
                    </button>
                </section>
            </main>

            <style jsx>{`
                .wallet-page {
                    min-height: 100vh;
                    background: #0a0a0f;
                    color: #fff;
                    padding: 0 16px 32px;
                }

                .wallet-header {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    padding: 16px 0;
                    border-bottom: 1px solid #1a1a2e;
                    margin-bottom: 24px;
                }

                .back-button {
                    background: none;
                    border: none;
                    color: #888;
                    font-size: 16px;
                    cursor: pointer;
                    padding: 8px;
                }

                .back-button:hover {
                    color: #fff;
                }

                h1 {
                    font-size: 24px;
                    font-weight: 600;
                    margin: 0;
                }

                .wallet-content {
                    max-width: 600px;
                    margin: 0 auto;
                }

                .wallet-card {
                    background: linear-gradient(145deg, #12121a, #1a1a2e);
                    border: 1px solid #2a2a3e;
                    border-radius: 16px;
                    padding: 24px;
                    margin-bottom: 20px;
                }

                .wallet-card h2 {
                    font-size: 18px;
                    font-weight: 600;
                    margin: 0 0 20px 0;
                    color: #fff;
                }

                .loading {
                    color: #666;
                    text-align: center;
                    padding: 20px;
                }

                .not-onboarded {
                    text-align: center;
                    color: #888;
                    padding: 20px;
                }

                .balance-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 16px;
                }

                .balance-item {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }

                .balance-item .label {
                    font-size: 12px;
                    color: #666;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .balance-item .value {
                    font-size: 18px;
                    font-weight: 600;
                    color: #fff;
                }

                .balance-item .value.highlight {
                    color: #00d4aa;
                    font-size: 24px;
                }

                .balance-item .value.positive {
                    color: #00d4aa;
                }

                .balance-item .value.negative {
                    color: #ff4757;
                }

                .deposit-instructions {
                    color: #999;
                    font-size: 14px;
                    margin-bottom: 20px;
                    line-height: 1.5;
                }

                .address-box {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    background: #0a0a0f;
                    border: 1px solid #2a2a3e;
                    border-radius: 12px;
                    padding: 16px;
                    margin-bottom: 12px;
                }

                .address-content {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }

                .address-label {
                    font-size: 11px;
                    color: #666;
                    text-transform: uppercase;
                }

                .address-value {
                    font-size: 16px;
                    font-family: 'SF Mono', Monaco, monospace;
                    color: #00d4aa;
                }

                .copy-button {
                    background: linear-gradient(135deg, #00d4aa, #00a88a);
                    border: none;
                    border-radius: 8px;
                    color: #000;
                    font-weight: 600;
                    padding: 10px 20px;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .copy-button:hover {
                    transform: scale(1.02);
                }

                .copy-button.copied {
                    background: #2a2a3e;
                    color: #00d4aa;
                }

                .full-address {
                    background: #0a0a0f;
                    border-radius: 8px;
                    padding: 12px;
                    margin-bottom: 16px;
                }

                .full-address .label {
                    display: block;
                    font-size: 11px;
                    color: #666;
                    margin-bottom: 4px;
                }

                .full-address code {
                    font-size: 12px;
                    font-family: 'SF Mono', Monaco, monospace;
                    color: #888;
                    word-break: break-all;
                }

                .network-warning {
                    display: flex;
                    align-items: flex-start;
                    gap: 10px;
                    background: rgba(255, 193, 7, 0.1);
                    border: 1px solid rgba(255, 193, 7, 0.3);
                    border-radius: 8px;
                    padding: 12px;
                    font-size: 13px;
                    color: #ffc107;
                    margin-bottom: 16px;
                }

                .warning-icon {
                    font-size: 16px;
                }

                .faucet-link {
                    display: block;
                    text-align: center;
                    color: #00d4aa;
                    text-decoration: none;
                    font-size: 14px;
                    font-weight: 500;
                    padding: 12px;
                    border: 1px solid #00d4aa;
                    border-radius: 8px;
                    transition: all 0.2s;
                }

                .faucet-link:hover {
                    background: rgba(0, 212, 170, 0.1);
                }

                .wallet-actions {
                    margin-top: 24px;
                }

                .action-button {
                    width: 100%;
                    padding: 16px;
                    border: none;
                    border-radius: 12px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .action-button.primary {
                    background: linear-gradient(135deg, #00d4aa, #00a88a);
                    color: #000;
                }

                .action-button.primary:hover {
                    transform: scale(1.01);
                    box-shadow: 0 4px 20px rgba(0, 212, 170, 0.3);
                }

                @media (max-width: 480px) {
                    .balance-grid {
                        grid-template-columns: 1fr;
                    }

                    .address-box {
                        flex-direction: column;
                        gap: 12px;
                        align-items: stretch;
                    }

                    .copy-button {
                        width: 100%;
                    }
                }
            `}</style>
        </div>
    );
}
