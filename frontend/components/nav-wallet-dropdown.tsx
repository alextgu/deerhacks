'use client';

import { useRef, useEffect, useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import type { WalletName } from '@solana/wallet-adapter-base';

type NavWalletDropdownProps = {
  /** Optional: use on dashboard for consistent nav styling (e.g. "wallet-nav-btn") */
  buttonClassName?: string;
};

export function NavWalletDropdown({ buttonClassName }: NavWalletDropdownProps = {}) {
  const { publicKey, connect, disconnect, connecting, wallet, select, wallets } =
    useWallet();
  const { connection } = useConnection();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const syncedRef = useRef<string | null>(null);

  const fake = wallets.find((w) => w.adapter.name === 'Fake Wallet');
  const solflare = wallets.find((w) => w.adapter.name.toLowerCase().includes('solflare'));
  const phantom = wallets.find((w) => w.adapter.name === 'Phantom');

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // Sync wallet address + SOL balance to Supabase when connected (stay on same page)
  useEffect(() => {
    if (!publicKey) {
      if (syncedRef.current) {
        syncedRef.current = null;
        fetch('/api/profile/wallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress: null }),
        }).catch(() => {});
      }
      return;
    }
    const addr = publicKey.toBase58();
    if (syncedRef.current === addr) return;
    (async () => {
      try {
        const isFake = wallet?.adapter.name === 'Fake Wallet';
        const solBalance = isFake
          ? 1.5
          : (await connection.getBalance(publicKey)) / 1e9;
        const res = await fetch('/api/profile/wallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress: addr, solBalance }),
        });
        if (res.ok) {
          syncedRef.current = addr;
          if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('wallet-synced'));
        }
      } catch {}
    })();
  }, [publicKey, connection]);

  const handleSelect = async (name: WalletName) => {
    select(name);
    setOpen(false);
    try {
      await connect();
    } catch {
      // Connection may open extension popup; stay on page
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
    setOpen(false);
  };

  const shortenedKey = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`
    : null;

  return (
    <div className="nav-wallet-wrap" ref={ref} style={{ position: 'relative' }}>
      <style>{`
        .nav-wallet-dropdown-panel {
          position: absolute; top: 100%; right: 0; margin-top: 0.35rem; min-width: 200px;
          background: rgba(18,18,26,0.98); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 16px; padding: 0.5rem; backdrop-filter: blur(20px);
          box-shadow: 0 20px 60px rgba(0,0,0,0.5); z-index: 300;
          display: flex; flex-direction: column; gap: 0.15rem;
        }
        .nav-wallet-dropdown-panel .wallet-panel-info { padding: 0.75rem 0.85rem 0.6rem; }
        .nav-wallet-dropdown-panel .wallet-panel-name { font-size: 0.85rem; font-weight: 700; color: rgba(255,255,255,0.92); margin-bottom: 0.15rem; }
        .nav-wallet-dropdown-panel .wallet-panel-muted { font-size: 0.72rem; color: rgba(255,255,255,0.35); font-weight: 500; }
        .nav-wallet-dropdown-panel .wallet-panel-divider { height: 1px; background: rgba(255,255,255,0.07); margin: 0.25rem 0; }
        .nav-wallet-dropdown-panel .wallet-panel-item {
          display: flex; align-items: center; width: 100%; text-align: left;
          padding: 0.6rem 0.85rem; border-radius: 10px; border: none; background: none;
          font-size: 0.82rem; font-weight: 600; color: rgba(255,255,255,0.65);
          cursor: pointer; transition: background 0.15s, color 0.15s;
        }
        .nav-wallet-dropdown-panel .wallet-panel-item:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.92); }
        .nav-wallet-dropdown-panel .wallet-panel-item:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>
      <button
        type="button"
        className={buttonClassName ?? 'nb'}
        style={buttonClassName ? undefined : { display: 'flex', alignItems: 'center', gap: '0.4rem', borderColor: 'rgba(124,58,237,0.35)', color: 'var(--v2)' }}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="5" width="20" height="14" rx="2"/>
          <path d="M16 12h.01"/>
        </svg>
        {connecting ? 'Connecting...' : shortenedKey ?? 'Wallet'}
      </button>

      {open && (
        <div
          className="nav-wallet-dropdown-panel"
          id="wallet-dropdown"
        >
          {publicKey ? (
            <>
              <div className="wallet-panel-info">
                <div className="wallet-panel-name" style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  {shortenedKey}
                </div>
                <div className="wallet-panel-muted" style={{ fontSize: '0.7rem' }}>
                  {wallet?.adapter.name ?? 'Connected'}
                </div>
              </div>
              <div className="wallet-panel-divider" />
              <button type="button" className="wallet-panel-item" onClick={handleDisconnect}>
                Disconnect
              </button>
            </>
          ) : (
            <>
              <div className="wallet-panel-info">
                <div className="wallet-panel-muted" style={{ fontSize: '0.8rem' }}>Connect via extension (stays on this page)</div>
              </div>
              <div className="wallet-panel-divider" />
              {fake && (
                <button
                  type="button"
                  className="wallet-panel-item"
                  onClick={() => handleSelect(fake.adapter.name as WalletName)}
                  disabled={connecting}
                >
                  Demo wallet (no extension)
                </button>
              )}
              {solflare && (
                <button
                  type="button"
                  className="wallet-panel-item"
                  onClick={() => handleSelect(solflare.adapter.name as WalletName)}
                  disabled={connecting}
                >
                  Solflare
                </button>
              )}
              {phantom && (
                <button
                  type="button"
                  className="wallet-panel-item"
                  onClick={() => handleSelect(phantom.adapter.name as WalletName)}
                  disabled={connecting}
                >
                  Phantom
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
