'use client';

import { useWallet } from '@solana/wallet-adapter-react';

export function WalletConnect() {
  const { publicKey, connect, disconnect, connecting, wallet, select, wallets } =
    useWallet();

  const handleClick = async () => {
    if (publicKey) {
      await disconnect();
      return;
    }

    if (!wallet) {
      const phantom = wallets.find((w) => w.adapter.name === 'Phantom');
      if (phantom) {
        select(phantom.adapter.name);
      }
      return;
    }

    await connect();
  };

  const shortenedKey = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`
    : null;

  return (
    <button
      onClick={handleClick}
      disabled={connecting}
      className="rounded-full border border-solid border-black/[.08] px-4 py-2 text-sm font-medium transition-colors hover:border-transparent hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-white/[.08] disabled:opacity-50"
    >
      {connecting
        ? 'Connecting...'
        : publicKey
          ? shortenedKey
          : 'Enable Reputation & Rewards (optional)'}
    </button>
  );
}
