import { useEffect, useState } from 'react';
import { Wallet, X, Copy, Check, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { useSuiClient } from '@mysten/dapp-kit';
import { useAuth } from '../../lib/auth-context';
import { formatMistAsSui } from '../../lib/sui-payments';

interface WalletModalProps {
  open: boolean;
  onClose: () => void;
}

export function WalletModal({ open, onClose }: WalletModalProps) {
  const { suiAddress } = useAuth();
  const suiClient = useSuiClient();
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !suiAddress || !suiClient) return;

    let cancelled = false;
    setBalanceLoading(true);

    suiClient
      .getBalance({ owner: suiAddress })
      .then((result) => {
        if (!cancelled && result?.totalBalance) {
          setBalance(formatMistAsSui(BigInt(result.totalBalance)));
        } else if (!cancelled) {
          setBalance('0');
        }
      })
      .catch(() => {
        if (!cancelled) setBalance(null);
      })
      .finally(() => {
        if (!cancelled) setBalanceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, suiAddress, suiClient]);

  const handleCopy = () => {
    if (!suiAddress) return;
    void navigator.clipboard?.writeText(suiAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWithdraw = () => {
    // Dummy — placeholder for future withdraw flow
    alert('Withdraw flow coming soon');
  };

  const shortenedAddress = suiAddress
    ? `${suiAddress.slice(0, 8)}...${suiAddress.slice(-6)}`
    : '';

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal card */}
      <div className="relative w-full max-w-sm glass-surface rounded-[var(--cuerate-r-xl)] border border-[var(--cuerate-text-3)] p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[var(--cuerate-r-md)] bg-[var(--cuerate-indigo)]/10 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-[var(--cuerate-indigo)]" />
            </div>
            <div>
              <h2 className="font-primary font-semibold text-lg text-white">My Wallet</h2>
              <p className="font-accent text-xs text-[var(--cuerate-text-2)]">Sui Testnet</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-[var(--cuerate-r-sm)] text-[var(--cuerate-text-2)] hover:text-white hover:bg-[var(--cuerate-surface)] transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Balance Card */}
        <div className="rounded-[var(--cuerate-r-lg)] bg-[var(--cuerate-surface)] border border-[var(--cuerate-text-3)]/50 p-5 mb-5">
          <p className="font-accent text-xs text-[var(--cuerate-text-2)] mb-1">Available Balance</p>
          <div className="flex items-baseline gap-1">
            {balanceLoading ? (
              <span className="font-primary text-2xl text-[var(--cuerate-text-2)]">Loading...</span>
            ) : balance !== null ? (
              <>
                <span className="font-primary text-3xl font-bold text-white">{balance}</span>
                <span className="font-accent text-sm text-[var(--cuerate-text-2)]">SUI</span>
              </>
            ) : (
              <span className="font-primary text-lg text-[var(--cuerate-text-2)]">Unavailable</span>
            )}
          </div>
        </div>

        {/* Deposit Section */}
        <div className="rounded-[var(--cuerate-r-lg)] bg-[var(--cuerate-surface)] border border-[var(--cuerate-text-3)]/50 p-5 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <ArrowDownToLine className="w-4 h-4 text-[var(--cuerate-blue)]" />
            <p className="font-accent text-sm font-medium text-white">Deposit</p>
          </div>
          <p className="font-accent text-xs text-[var(--cuerate-text-2)] mb-3">
            Send SUI to this address to fund your wallet.
          </p>
          <div className="flex items-center gap-2 rounded-[var(--cuerate-r-md)] bg-black/40 border border-[var(--cuerate-text-3)]/30 px-3 py-2.5">
            <span className="font-mono text-xs text-[var(--cuerate-text-2)] flex-1 truncate">
              {shortenedAddress}
            </span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--cuerate-r-sm)] bg-[var(--cuerate-indigo)]/10 text-[var(--cuerate-indigo)] hover:bg-[var(--cuerate-indigo)]/20 transition-all"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span className="font-accent text-xs">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span className="font-accent text-xs">Copy</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Withdraw Section */}
        <div className="rounded-[var(--cuerate-r-lg)] bg-[var(--cuerate-surface)] border border-[var(--cuerate-text-3)]/50 p-5">
          <div className="flex items-center gap-2 mb-3">
            <ArrowUpFromLine className="w-4 h-4 text-[var(--cuerate-text-2)]" />
            <p className="font-accent text-sm font-medium text-[var(--cuerate-text-2)]">Withdraw</p>
          </div>
          <p className="font-accent text-xs text-[var(--cuerate-text-2)] mb-3">
            Send SUI to another wallet address.
          </p>
          <button
            onClick={handleWithdraw}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-[var(--cuerate-r-md)] bg-[var(--cuerate-surface)] border border-[var(--cuerate-text-3)] text-[var(--cuerate-text-2)] hover:text-white hover:border-[var(--cuerate-text-2)] transition-all font-accent text-sm"
          >
            <ArrowUpFromLine className="w-4 h-4" />
            Withdraw SUI
          </button>
        </div>
      </div>
    </div>
  );
}
