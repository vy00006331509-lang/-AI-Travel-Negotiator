const DAY_PATTERN = /(\d+)\s*(?:-|\s)?\s*(?:day|days|night|nights)/i;
const BUDGET_PATTERN = /(?:under|below|max|budget(?:\s+of)?|less than)\s*\$?\s*([\d,]+)/i;
const DESTINATION_PATTERN = /\b(?:in|to|visit|visiting|around)\s+([A-Z][\w'-]*(?:\s+[A-Z][\w'-]*)*)/;

/**
 * Extracts trip parameters from a free-form prompt without calling an LLM.
 * Used as the deterministic fallback when no OpenAI key is configured, and as
 * the seed for the LLM orchestrator.
 *
 * @param {string} prompt - The user's trip request.
 * @returns {{ destination: string, days: number, budgetUsd: number|null }} Trip parameters.
 */
export function parseTripRequest(prompt) {
  const text = String(prompt ?? "").trim();
  const days = Number(text.match(DAY_PATTERN)?.[1] ?? 3);
  const budgetRaw = text.match(BUDGET_PATTERN)?.[1];
  const destination = text.match(DESTINATION_PATTERN)?.[1]?.trim();

  return {
    destination: destination || fallbackDestination(text),
    days: Number.isFinite(days) && days > 0 ? Math.min(days, 30) : 3,
    budgetUsd: budgetRaw ? Number(budgetRaw.replace(/,/g, "")) : null,
  };
}

/**
 * Last-resort destination guess: the longest capitalised-looking token.
 *
 * @param {string} text - The user's trip request.
 * @returns {string} Best-effort destination.
 */
function fallbackDestination(text) {
  const candidate = text
    .split(/[^A-Za-z'-]+/)
    .filter((word) => word.length > 2 && word[0] === word[0].toUpperCase())
    .sort((a, b) => b.length - a.length)[0];
  return candidate ?? "your destination";
}
