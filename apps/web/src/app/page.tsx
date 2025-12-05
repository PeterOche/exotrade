'use client';

import { usePrivy } from '@privy-io/react-auth';
import Link from 'next/link';

export default function HomePage() {
  const { login, authenticated, user, logout, ready } = usePrivy();

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      {/* Hero Section */}
      <div className="max-w-lg w-full text-center space-y-8">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
            <span className="text-2xl font-bold text-white">E</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight">
            Exo<span className="text-green-500">Trade</span>
          </h1>
        </div>

        {/* Tagline */}
        <p className="text-lg text-zinc-400">
          Trade perpetuals on Starknet with a simple, mobile-first interface.
        </p>

        {/* Features */}
        <div className="grid grid-cols-3 gap-4 py-6">
          <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800">
            <div className="text-2xl mb-2">⚡</div>
            <div className="text-sm font-medium">Fast</div>
            <div className="text-xs text-zinc-500">Instant trades</div>
          </div>
          <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800">
            <div className="text-2xl mb-2">📱</div>
            <div className="text-sm font-medium">Mobile</div>
            <div className="text-xs text-zinc-500">Trade anywhere</div>
          </div>
          <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800">
            <div className="text-2xl mb-2">🔒</div>
            <div className="text-sm font-medium">Secure</div>
            <div className="text-xs text-zinc-500">Non-custodial</div>
          </div>
        </div>

        {/* Auth Section */}
        {!ready ? (
          <div className="h-14 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : authenticated ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800">
              <div className="text-sm text-zinc-400 mb-1">Connected as</div>
              <div className="font-mono text-sm truncate">
                {user?.email?.address || user?.wallet?.address || 'Unknown'}
              </div>
            </div>
            <Link
              href="/trade/BTC-USD"
              className="block w-full py-4 px-6 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold text-lg hover:opacity-90 transition-opacity"
            >
              Start Trading →
            </Link>
            <button
              onClick={logout}
              className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={login}
            className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold text-lg hover:opacity-90 transition-opacity"
          >
            Get Started
          </button>
        )}

        {/* Footer */}
        <p className="text-xs text-zinc-600">
          Powered by Extended DEX on Starknet
        </p>
      </div>
    </main>
  );
}
