/**
 * Mock "premium intelligence" providers. In a real deployment these would be
 * third party paid APIs; here they return deterministic, destination-flavoured
 * data so the paid data actually changes the itinerary the agent produces.
 *
 * @param {string} destination - Destination the agent asked about.
 * @returns {object} Weather intelligence payload.
 */
export function weatherIntelligence(destination) {
  const seed = hash(destination);
  return {
    destination,
    source: "AeroMeteo Premium",
    forecast: {
      averageHighC: 18 + (seed % 12),
      averageLowC: 6 + (seed % 8),
      rainyDaysNext14: seed % 6,
      bestOutdoorWindow: ["morning", "late afternoon", "midday"][seed % 3],
    },
    packing: ["light rain shell", "layerable mid-weight jacket", "comfortable walking shoes"],
    advisory:
      seed % 6 > 3
        ? "Book at least two indoor-friendly activities; rain risk is elevated."
        : "Weather is stable enough to keep most days outdoors.",
  };
}

/**
 * @param {string} destination - Destination the agent asked about.
 * @returns {object} Transport intelligence payload.
 */
export function transportIntelligence(destination) {
  const seed = hash(destination);
  return {
    destination,
    source: "TransitGrid Premium",
    airportTransfer: {
      option: ["express rail", "airport limousine bus", "metro + transfer"][seed % 3],
      costUsd: 8 + (seed % 22),
      minutes: 35 + (seed % 40),
    },
    cityPass: {
      name: `${destination} unlimited transit pass`,
      dailyCostUsd: 5 + (seed % 6),
      coversAirport: seed % 2 === 0,
    },
    averageTaxiPerRideUsd: 9 + (seed % 15),
    tip: "Buying a multi-day transit pass beats single fares from day two onwards.",
  };
}

/**
 * @param {string} destination - Destination the agent asked about.
 * @returns {object} Hotel intelligence payload.
 */
export function hotelIntelligence(destination) {
  const seed = hash(destination);
  const base = 70 + (seed % 90);
  return {
    destination,
    source: "StayIndex Premium",
    neighbourhoods: [
      { name: "Central / station district", nightlyUsd: base + 40, walkScore: 96 },
      { name: "Old town", nightlyUsd: base + 15, walkScore: 91 },
      { name: "Residential east", nightlyUsd: base - 20, walkScore: 78 },
    ],
    availabilityPressure: ["low", "moderate", "high"][seed % 3],
    advisory: "Rates rise roughly 18% on weekends; anchor the stay midweek where possible.",
  };
}

/**
 * Small stable hash so mock data is consistent per destination.
 *
 * @param {string} value - String to hash.
 * @returns {number} Non-negative integer hash.
 */
function hash(value) {
  let out = 0;
  for (const char of String(value ?? "")) {
    out = (out * 31 + char.charCodeAt(0)) % 100000;
  }
  return out;
}
