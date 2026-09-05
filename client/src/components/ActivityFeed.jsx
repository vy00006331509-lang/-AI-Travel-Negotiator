import { useEffect, useRef } from "react";

const LEVEL_STYLES = {
  thinking: { color: "text-slate-300", label: "AGENT" },
  info: { color: "text-sky-300", label: "REQ" },
  paywall: { color: "text-amber-300", label: "402" },
  budget: { color: "text-emerald-300", label: "BUDGET" },
  signing: { color: "text-violet-300", label: "SIGN" },
  settled: { color: "text-emerald-400", label: "PAID" },
  data: { color: "text-cyan-300", label: "DATA" },
  rejected: { color: "text-rose-300", label: "DENIED" },
  error: { color: "text-rose-400", label: "ERROR" },
};

/**
 * Terminal style feed of the agent's internal reasoning and payment steps.
 *
 * @param {object} props - Component props.
 * @param {Array<object>} props.events - Agent activity events.
 * @param {boolean} props.running - Whether the agent is currently working.
 * @returns {JSX.Element} The activity panel.
 */
export default function ActivityFeed({ events, running }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [events.length]);

  return (
    <section className="flex h-full flex-col rounded-2xl border border-slate-800 bg-slate-950/80 shadow-xl shadow-black/40">
      <header className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <h2 className="ml-2 font-mono text-xs tracking-widest text-slate-400 uppercase">
          Live agent activity
        </h2>
        {running && (
          <span className="ml-auto animate-pulse font-mono text-[11px] text-emerald-400">
            ● negotiating
          </span>
        )}
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-3 font-mono text-[13px] leading-relaxed">
        {events.length === 0 && (
          <p className="text-slate-600">
            Waiting for a trip request. The agent will log every paywall, budget check and Algorand
            payment here.
          </p>
        )}
        {events.map((event, index) => {
          const style = LEVEL_STYLES[event.level] ?? LEVEL_STYLES.info;
          return (
            <div key={`${event.at}-${index}`} className="flex gap-3 py-0.5">
              <span className="shrink-0 text-slate-600">
                {new Date(event.at).toLocaleTimeString()}
              </span>
              <span className={`w-16 shrink-0 ${style.color}`}>[{style.label}]</span>
              <span className="text-slate-200">{event.message}</span>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
    </section>
  );
}
