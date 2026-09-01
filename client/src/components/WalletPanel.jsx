/**
 * Shortens an Algorand address or transaction id for display.
 *
 * @param {string} value - Full identifier.
 * @returns {string} Truncated identifier.
 */
function short(value) {
  if (!value) return "—";
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

/**
 * Wallet balance meter plus the agent's Algorand testnet transactions.
 *
 * @param {object} props - Component props.
 * @param {object|null} props.wallet - Wallet state returned by the server.
 * @returns {JSX.Element} The transaction explorer panel.
 */
export default function WalletPanel({ wallet }) {
  const balance = wallet?.balanceUsd ?? 0;
  const starting = wallet?.startingBalanceUsd ?? 0;
  const pct = starting > 0 ? Math.max(0, Math.min(100, (balance / starting) * 100)) : 0;
  const transactions = wallet?.transactions ?? [];

  return (
    <section className="flex h-full flex-col rounded-2xl border border-slate-800 bg-slate-950/80 shadow-xl shadow-black/40">
      <header className="border-b border-slate-800 px-4 py-3">
        <h2 className="font-mono text-xs tracking-widest text-slate-400 uppercase">
          Agent wallet & transactions
        </h2>
      </header>

      <div className="space-y-3 border-b border-slate-800 px-4 py-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-slate-400">Balance</span>
          <span className="font-mono text-2xl text-emerald-300">
            {balance.toFixed(3)} {wallet?.asset?.symbol ?? "USDC"}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
        <dl className="grid grid-cols-2 gap-2 text-xs text-slate-400">
          <div>
            <dt>Spent today</dt>
            <dd className="font-mono text-slate-200">
              {(wallet?.spentTodayUsd ?? 0).toFixed(3)} / {wallet?.policy?.maxDailyUsd ?? 0}
            </dd>
          </div>
          <div>
            <dt>Per-request cap</dt>
            <dd className="font-mono text-slate-200">${wallet?.policy?.maxPerRequestUsd ?? 0}</dd>
          </div>
          <div className="col-span-2">
            <dt>Payer address</dt>
            <dd className="font-mono break-all text-slate-200">{short(wallet?.address)}</dd>
          </div>
          <div className="col-span-2">
            <dt>Settlement</dt>
            <dd className="font-mono text-slate-200">
              {wallet?.mode === "live" ? "GoPlausible facilitator (live)" : "Local facilitator (simulated)"}
            </dd>
          </div>
        </dl>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {transactions.length === 0 && (
          <p className="text-sm text-slate-600">No x402 payments settled yet.</p>
        )}
        <ul className="space-y-2">
          {transactions.map((tx) => (
            <li
              key={tx.id}
              className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-slate-200">{tx.service}</span>
                <span className="font-mono text-emerald-300">
                  -{tx.amountUsd} {tx.asset}
                </span>
              </div>
              <a
                className="font-mono text-xs text-sky-400 hover:underline"
                href={tx.explorerUrl}
                target="_blank"
                rel="noreferrer"
              >
                {short(tx.id)}
              </a>
              <p className="font-mono text-[11px] text-slate-500">to {short(tx.payTo)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
