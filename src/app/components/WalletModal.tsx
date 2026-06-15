import { useEffect, useState } from 'react';
import { Wallet, X, Copy, Check, ArrowDownToLine, ArrowUpFromLine, Loader2, ExternalLink } from 'lucide-react';
import { useSuiClient } from '@mysten/dapp-kit';
import { useEnokiFlow } from '@mysten/enoki/react';
import { useAuth } from '../../lib/auth-context';
import { formatMistAsSui, isSuiAddress, sendSuiPayment } from '../../lib/sui-payments';

interface WalletModalProps {
  open: boolean;
  onClose: () => void;
}

export function WalletModal({ open, onClose }: WalletModalProps) {
  const { suiAddress } = useAuth();
  const suiClient = useSuiClient();
  const enokiFlow = useEnokiFlow();
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [txDigest, setTxDigest] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

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
  }, [open, suiAddress, suiClient, refreshKey]);

  useEffect(() => {
    if (!open) {
      setRecipient('');
      setAmount('');
      setSendError(null);
      setTxDigest(null);
      setSending(false);
    }
  }, [open]);

  const handleCopy = () => {
    if (!suiAddress) return;
    void navigator.clipboard?.writeText(suiAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWithdraw = async () => {
    setSendError(null);
    setTxDigest(null);

    const trimmedRecipient = recipient.trim();
    if (!isSuiAddress(trimmedRecipient)) {
      setSendError('Enter a valid Sui address (0x + 64 hex chars).');
      return;
    }

    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setSendError('Enter a SUI amount greater than zero.');
      return;
    }

    let amountMist: bigint;
    try {
      const mistFloat = Math.floor(parsed * 1_000_000_000);
      amountMist = BigInt(mistFloat);
    } catch {
      setSendError('Invalid amount.');
      return;
    }

    setSending(true);
    try {
      const result = await sendSuiPayment(
        { recipient: trimmedRecipient, amountMist },
        enokiFlow,
        suiClient,
      );
      setTxDigest(result.txDigest);
      setRecipient('');
      setAmount('');
      setRefreshKey((k) => k + 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSendError(message);
    } finally {
      setSending(false);
    }
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
      <div className="relative w-full max-w-sm glass-surface rounded-[var(--waltube-r-xl)] border border-[var(--waltube-text-3)] p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[var(--waltube-r-md)] bg-[var(--waltube-indigo)]/10 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-[var(--waltube-indigo)]" />
            </div>
            <div>
              <h2 className="font-primary font-semibold text-lg text-white">My Wallet</h2>
              <p className="font-accent text-xs text-[var(--waltube-text-2)]">Sui Testnet</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-[var(--waltube-r-sm)] text-[var(--waltube-text-2)] hover:text-white hover:bg-[var(--waltube-surface)] transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Balance Card */}
        <div className="rounded-[var(--waltube-r-lg)] bg-[var(--waltube-surface)] border border-[var(--waltube-text-3)]/50 p-5 mb-5">
          <p className="font-accent text-xs text-[var(--waltube-text-2)] mb-1">Available Balance</p>
          <div className="flex items-baseline gap-1">
            {balanceLoading ? (
              <span className="font-primary text-2xl text-[var(--waltube-text-2)]">Loading...</span>
            ) : balance !== null ? (
              <>
                <span className="font-primary text-3xl font-bold text-white">{balance}</span>
                <span className="font-accent text-sm text-[var(--waltube-text-2)]">SUI</span>
              </>
            ) : (
              <span className="font-primary text-lg text-[var(--waltube-text-2)]">Unavailable</span>
            )}
          </div>
        </div>

        {/* Deposit Section */}
        <div className="rounded-[var(--waltube-r-lg)] bg-[var(--waltube-surface)] border border-[var(--waltube-text-3)]/50 p-5 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <ArrowDownToLine className="w-4 h-4 text-[var(--waltube-blue)]" />
            <p className="font-accent text-sm font-medium text-white">Deposit</p>
          </div>
          <p className="font-accent text-xs text-[var(--waltube-text-2)] mb-3">
            Send SUI to this address to fund your wallet.
          </p>
          <div className="flex items-center gap-2 rounded-[var(--waltube-r-md)] bg-black/40 border border-[var(--waltube-text-3)]/30 px-3 py-2.5">
            <span className="font-mono text-xs text-[var(--waltube-text-2)] flex-1 truncate">
              {shortenedAddress}
            </span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--waltube-r-sm)] bg-[var(--waltube-indigo)]/10 text-[var(--waltube-indigo)] hover:bg-[var(--waltube-indigo)]/20 transition-all"
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
        <div className="rounded-[var(--waltube-r-lg)] bg-[var(--waltube-surface)] border border-[var(--waltube-text-3)]/50 p-5">
          <div className="flex items-center gap-2 mb-3">
            <ArrowUpFromLine className="w-4 h-4 text-[var(--waltube-indigo)]" />
            <p className="font-accent text-sm font-medium text-white">Withdraw</p>
          </div>
          <p className="font-accent text-xs text-[var(--waltube-text-2)] mb-3">
            Send SUI to another wallet address.
          </p>
          <div className="space-y-2 mb-3">
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="Recipient address (0x...)"
              className="w-full px-3 py-2.5 rounded-[var(--waltube-r-md)] bg-black/40 border border-[var(--waltube-text-3)]/30 text-white placeholder-[var(--waltube-text-2)] font-mono text-xs focus:outline-none focus:border-[var(--waltube-indigo)] transition-colors"
              disabled={sending}
            />
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount in SUI"
              step="0.001"
              min="0"
              className="w-full px-3 py-2.5 rounded-[var(--waltube-r-md)] bg-black/40 border border-[var(--waltube-text-3)]/30 text-white placeholder-[var(--waltube-text-2)] font-accent text-sm focus:outline-none focus:border-[var(--waltube-indigo)] transition-colors"
              disabled={sending}
            />
          </div>
          {sendError && (
            <div className="mb-3 rounded-[var(--waltube-r-sm)] bg-red-500/10 border border-red-500/30 px-3 py-2 font-accent text-xs text-red-300 break-words">
              {sendError}
            </div>
          )}
          {txDigest && (
            <a
              href={`https://testnet.suivision.xyz/txblock/${txDigest}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-3 flex items-center justify-between gap-2 rounded-[var(--waltube-r-sm)] bg-[#4cce8a]/10 border border-[#4cce8a]/30 px-3 py-2 font-accent text-xs text-[#9ef5c6] hover:bg-[#4cce8a]/15 transition-colors"
            >
              <span className="truncate">Sent! Tx: {txDigest.slice(0, 10)}...</span>
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
            </a>
          )}
          <button
            onClick={() => void handleWithdraw()}
            disabled={sending || !recipient.trim() || !amount.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-[var(--waltube-r-md)] bg-[var(--waltube-indigo)] text-white hover:opacity-90 transition-all font-accent text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <ArrowUpFromLine className="w-4 h-4" />
                Withdraw SUI
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
