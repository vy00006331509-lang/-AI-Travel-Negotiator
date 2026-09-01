import OpenAI from "openai";
import { OPENAI_API_KEY, OPENAI_MODEL, BUDGET_POLICY, SERVICES } from "../config.js";
import { BudgetRejectedError } from "../services/paymentAgent.js";
import { parseTripRequest } from "./tripParser.js";

const SYSTEM_PROMPT = `You are the AI Travel Negotiator, an autonomous travel agent with its own Algorand wallet.

You do not have built-in knowledge of live weather, transport or hotel pricing. To plan a credible trip you MUST buy that intelligence from the premium tools available to you. Those tools sit behind x402 paywalls; your wallet pays for them automatically as long as each purchase respects the budget policy (max $${BUDGET_POLICY.maxPerRequestUsd} per request, max $${BUDGET_POLICY.maxDailyUsd} per day).

Buy every piece of intelligence that is relevant to the request before answering, then produce the itinerary strictly as JSON matching:
{
  "destination": string,
  "days": number,
  "budgetUsd": number | null,
  "summary": string,
  "dailyPlan": [{ "day": number, "title": string, "activities": string[], "estimatedCostUsd": number }],
  "estimatedTotalUsd": number,
  "notes": string[]
}
Ground every recommendation in the purchased data (cite concrete numbers from it in notes) and keep the estimated total inside the user's budget when one is given.`;

const TOOLS = SERVICES.map((service) => ({
  type: "function",
  function: {
    name: `buy_${service.id}_intelligence`,
    description: `${service.description} Costs ${service.priceUsd} USDC via x402 on Algorand testnet.`,
    parameters: {
      type: "object",
      properties: {
        destination: { type: "string", description: "City or region to query." },
      },
      required: ["destination"],
      additionalProperties: false,
    },
  },
}));

/**
 * Runs the autonomous planning loop for a user prompt.
 *
 * @param {object} params - Planning parameters.
 * @param {string} params.prompt - The user's trip request.
 * @param {string} params.baseUrl - Base URL of the resource server.
 * @param {import("../services/paymentAgent.js").PaymentAgent} params.paymentAgent - Agent wallet.
 * @param {(event: object) => void} params.emit - Activity event sink.
 * @returns {Promise<object>} The generated itinerary.
 */
export async function planTrip({ prompt, baseUrl, paymentAgent, emit }) {
  const parsed = parseTripRequest(prompt);
  emit({
    level: "thinking",
    message: `Interpreted request: ${parsed.days} days in ${parsed.destination}${
      parsed.budgetUsd ? ` under $${parsed.budgetUsd}` : ""
    }`,
  });

  const purchased = {};

  /**
   * Buys one intelligence product and records it for the itinerary builder.
   *
   * @param {object} service - Service definition.
   * @param {string} destination - Destination to query.
   * @returns {Promise<object>} Purchased data or a refusal marker.
   */
  const buy = async (service, destination) => {
    try {
      const data = await paymentAgent.purchase({ service, destination, baseUrl, emit });
      purchased[service.id] = data;
      return data;
    } catch (error) {
      if (error instanceof BudgetRejectedError) {
        return { unavailable: true, reason: error.message };
      }
      throw error;
    }
  };

  if (!OPENAI_API_KEY) {
    emit({
      level: "thinking",
      message: "No OpenAI key configured — planning with the deterministic fallback planner",
    });
    for (const service of SERVICES) {
      await buy(service, parsed.destination);
    }
    return buildFallbackItinerary(parsed, purchased);
  }

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: prompt },
  ];

  for (let turn = 0; turn < 6; turn += 1) {
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages,
      tools: TOOLS,
      response_format: turn === 0 ? undefined : { type: "json_object" },
    });
    const choice = completion.choices[0].message;
    messages.push(choice);

    const calls = choice.tool_calls ?? [];
    if (calls.length === 0) {
      const itinerary = safeParseItinerary(choice.content, parsed, purchased);
      emit({ level: "thinking", message: "Itinerary composed from purchased intelligence" });
      return itinerary;
    }

    for (const call of calls) {
      const service = SERVICES.find((item) => `buy_${item.id}_intelligence` === call.function.name);
      if (!service) {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ error: "unknown tool" }),
        });
        continue;
      }
      const args = safeParseJson(call.function.arguments) ?? {};
      emit({
        level: "thinking",
        service: service.id,
        message: `Agent decided it needs ${service.name}`,
      });
      const data = await buy(service, args.destination || parsed.destination);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(data),
      });
    }
  }

  emit({ level: "thinking", message: "Turn limit reached — composing itinerary from purchased data" });
  return buildFallbackItinerary(parsed, purchased);
}

/**
 * @param {string} value - JSON text.
 * @returns {object|null} Parsed object or null.
 */
function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Parses the model's itinerary JSON, falling back to a locally built plan.
 *
 * @param {string} content - Model response content.
 * @param {object} parsed - Parsed trip parameters.
 * @param {object} purchased - Intelligence purchased so far.
 * @returns {object} Itinerary.
 */
function safeParseItinerary(content, parsed, purchased) {
  const raw = safeParseJson(content ?? "");
  if (raw && Array.isArray(raw.dailyPlan)) {
    return { ...raw, sources: Object.keys(purchased) };
  }
  return buildFallbackItinerary(parsed, purchased, content ?? undefined);
}

/**
 * Builds an itinerary directly from the purchased intelligence.
 *
 * @param {object} parsed - Parsed trip parameters.
 * @param {object} purchased - Intelligence purchased so far.
 * @param {string} [summary] - Optional summary override.
 * @returns {object} Itinerary.
 */
function buildFallbackItinerary(parsed, purchased, summary) {
  const { destination, days, budgetUsd } = parsed;
  const weather = purchased.weather;
  const transport = purchased.transport;
  const hotel = purchased.hotel;

  const stay = hotel?.neighbourhoods?.[1] ?? hotel?.neighbourhoods?.[0];
  const nightly = stay?.nightlyUsd ?? 120;
  const transitDaily = transport?.cityPass?.dailyCostUsd ?? 8;
  const dailyFood = 45;

  const dailyPlan = Array.from({ length: days }, (_, index) => {
    const day = index + 1;
    const wet = weather?.forecast?.rainyDaysNext14 > 3 && day % 2 === 0;
    return {
      day,
      title: wet ? `Indoor-leaning day ${day}` : `Exploration day ${day}`,
      activities: wet
        ? [
            `Museums and covered markets around ${stay?.name ?? destination}`,
            "Long lunch at a local institution",
            "Evening walk if the rain clears",
          ]
        : [
            `${weather?.forecast?.bestOutdoorWindow ?? "morning"} walking route through ${destination}`,
            `Transit hop using the ${transport?.cityPass?.name ?? "day pass"}`,
            "Neighbourhood dinner",
          ],
      estimatedCostUsd: Number((nightly + transitDaily + dailyFood).toFixed(2)),
    };
  });

  const estimatedTotalUsd = Number(
    (
      dailyPlan.reduce((sum, day) => sum + day.estimatedCostUsd, 0) +
      (transport?.airportTransfer?.costUsd ?? 0) * 2
    ).toFixed(2),
  );

  const notes = [];
  if (weather) {
    notes.push(
      `Weather intelligence: highs near ${weather.forecast.averageHighC}°C, ${weather.forecast.rainyDaysNext14} rainy days expected. ${weather.advisory}`,
    );
  }
  if (transport) {
    notes.push(
      `Transport intelligence: ${transport.airportTransfer.option} from the airport at $${transport.airportTransfer.costUsd} (${transport.airportTransfer.minutes} min); ${transport.cityPass.name} costs $${transport.cityPass.dailyCostUsd}/day.`,
    );
  }
  if (hotel) {
    notes.push(
      `Hotel intelligence: ${stay.name} averages $${stay.nightlyUsd}/night with ${hotel.availabilityPressure} availability pressure. ${hotel.advisory}`,
    );
  }
  if (budgetUsd && estimatedTotalUsd > budgetUsd) {
    notes.push(
      `Estimated total $${estimatedTotalUsd} is above the $${budgetUsd} budget — drop to the residential-east area or shorten by a night to fit.`,
    );
  }

  return {
    destination,
    days,
    budgetUsd,
    summary:
      summary ??
      `A ${days}-day plan for ${destination} built from ${Object.keys(purchased).length} purchased intelligence feeds, staying in ${stay?.name ?? "a central neighbourhood"}.`,
    dailyPlan,
    estimatedTotalUsd,
    notes,
    sources: Object.keys(purchased),
  };
}
