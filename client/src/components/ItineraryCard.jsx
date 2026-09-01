/**
 * Renders the agent's final travel plan.
 *
 * @param {object} props - Component props.
 * @param {object|null} props.itinerary - Itinerary returned by the orchestrator.
 * @param {boolean} props.running - Whether the agent is still working.
 * @returns {JSX.Element} The itinerary card.
 */
export default function ItineraryCard({ itinerary, running }) {
  if (!itinerary) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-800 px-6 py-10 text-center text-slate-500">
        {running
          ? "The agent is negotiating for data…"
          : "Ask for a trip and the agent will buy the intelligence it needs to plan it."}
      </div>
    );
  }

  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6 shadow-xl shadow-black/40">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl font-semibold text-white">
          {itinerary.days} days in {itinerary.destination}
        </h2>
        <span className="font-mono text-sm text-emerald-300">
          est. ${itinerary.estimatedTotalUsd}
          {itinerary.budgetUsd ? ` / $${itinerary.budgetUsd}` : ""}
        </span>
      </div>
      <p className="mt-2 text-slate-300">{itinerary.summary}</p>

      <ol className="mt-5 space-y-3">
        {(itinerary.dailyPlan ?? []).map((day) => (
          <li key={day.day} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="flex items-baseline justify-between">
              <h3 className="font-medium text-slate-100">
                Day {day.day} · {day.title}
              </h3>
              <span className="font-mono text-xs text-slate-400">${day.estimatedCostUsd}</span>
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
              {(day.activities ?? []).map((activity) => (
                <li key={activity}>{activity}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      {(itinerary.notes ?? []).length > 0 && (
        <div className="mt-5">
          <h3 className="font-mono text-xs tracking-widest text-slate-400 uppercase">
            Purchased intelligence
          </h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-300">
            {itinerary.notes.map((note) => (
              <li key={note}>• {note}</li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
