/**
 * Posts a prompt to the orchestrator and consumes its Server-Sent Event stream.
 *
 * @param {object} options - Stream options.
 * @param {string} options.prompt - Free form trip request.
 * @param {(event: object) => void} options.onActivity - Called for every agent step.
 * @param {(payload: object) => void} options.onItinerary - Called with the final itinerary and wallet.
 * @param {(message: string) => void} options.onError - Called when the agent fails.
 * @param {AbortSignal} [options.signal] - Optional abort signal.
 * @returns {Promise<void>} Resolves when the stream is finished.
 */
export async function planTripStream({ prompt, onActivity, onItinerary, onError, signal }) {
  const response = await fetch("/api/plan-trip", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
    signal,
  });

  if (!response.ok || !response.body) {
    onError(`Agent request failed with HTTP ${response.status}`);
    return;
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      handleChunk(chunk, { onActivity, onItinerary, onError });
      boundary = buffer.indexOf("\n\n");
    }
  }
}

/**
 * Parses a single SSE frame and dispatches it to the right callback.
 *
 * @param {string} chunk - Raw SSE frame.
 * @param {object} handlers - Callbacks for the parsed event.
 * @param {(event: object) => void} handlers.onActivity - Activity callback.
 * @param {(payload: object) => void} handlers.onItinerary - Itinerary callback.
 * @param {(message: string) => void} handlers.onError - Error callback.
 * @returns {void}
 */
function handleChunk(chunk, { onActivity, onItinerary, onError }) {
  let eventName = "message";
  const dataLines = [];

  for (const line of chunk.split("\n")) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return;

  const data = JSON.parse(dataLines.join("\n"));
  if (eventName === "activity") onActivity(data);
  if (eventName === "itinerary") onItinerary(data);
  if (eventName === "error") onError(data.message ?? "Unknown agent error");
}
