import { useCallback, useEffect, useState } from "react";
import ActivityFeed from "./components/ActivityFeed.jsx";
import ItineraryCard from "./components/ItineraryCard.jsx";
import WalletPanel from "./components/WalletPanel.jsx";
import { planTripStream } from "./lib/planTripStream.js";

const EXAMPLES = [
  "5 days in Tokyo under $1000",
  "3 days in Lisbon under $600",
  "7 days in Mexico City under $1500",
];

/**
 * AI Travel Negotiator dashboard.
 *
 * @returns {JSX.Element} The application shell.
 */
export default function App() {
  const [prompt, setPrompt] = useState(EXAMPLES[0]);
  const [events, setEvents] = useState([]);
  const [itinerary, setItinerary] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    fetch("/api/wallet")
      .then((res) => res.json())
      .then(setWallet)
      .catch(() => setError("Could not reach the agent backend on port 4000."));
  }, []);

  const submit = useCallback(
    async (event) => {
      event?.preventDefault();
      if (running || !prompt.trim()) return;

      setRunning(true);
      setError("");
      setEvents([]);
      setItinerary(null);

      try {
        await planTripStream({
          prompt,
          onActivity: (activity) => setEvents((prev) => [...prev, activity]),
          onItinerary: (payload) => {
            setItinerary(payload.itinerary);
            setWallet(payload.wallet);
          },
          onError: setError,
        });
      } catch (streamError) {
        setError(streamError instanceof Error ? streamError.message : String(streamError));
      } finally {
        setRunning(false);
      }
    },
    [prompt, running],
  );

  return (
    <div className="min-h-full bg-[radial-gradient(ellipse_at_top,#0f172a,#05070d_60%)] text-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">AI Travel Negotiator</h1>
            <p className="mt-1 text-slate-400">
              An autonomous agent that hits x402 paywalls, approves its own budget and pays for
              travel intelligence on Algorand Testnet.
            </p>
          </div>
          <div className="rounded-full border border-slate-800 bg-slate-950/80 px-4 py-2 font-mono text-xs text-slate-400">
            {wallet?.network ?? "algorand testnet"} · {wallet?.mode ?? "simulated"}
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
          <div className="space-y-6">
            <form
              onSubmit={submit}
              className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 shadow-xl shadow-black/40"
            >
              <label htmlFor="prompt" className="font-mono text-xs tracking-widest text-slate-400 uppercase">
                Trip request
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="5 days in Tokyo under $1000"
                  className="flex-1 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  disabled={running}
                  className="rounded-xl bg-emerald-500 px-5 py-3 font-medium text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {running ? "Negotiating…" : "Plan trip"}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setPrompt(example)}
                    className="rounded-full border border-slate-800 px-3 py-1 text-xs text-slate-400 hover:border-emerald-500 hover:text-emerald-300"
                  >
                    {example}
                  </button>
                ))}
              </div>
              {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
            </form>

            <ItineraryCard itinerary={itinerary} running={running} />
          </div>

          <div className="grid gap-6 lg:h-[calc(100vh-14rem)] lg:grid-rows-2">
            <ActivityFeed events={events} running={running} />
            <WalletPanel wallet={wallet} />
          </div>
        </div>
      </div>
    </div>
  );
}
