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
      type="button"
      onClick={handleClick}
      disabled={connecting}
      className="rounded-full border px-4 py-2 text-sm font-medium transition-colors hover:border-transparent hover:bg-black-04"
      style={connecting ? { opacity: 0.5 } : undefined}
    >
      {connecting
        ? 'Connecting...'
        : publicKey
          ? shortenedKey
          : 'Enable Reputation & Rewards (optional)'}
    </button>
  );
}
