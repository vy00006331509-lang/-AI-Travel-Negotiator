import "dotenv/config";
import algosdk from "algosdk";
import { ALGORAND_TESTNET_CAIP2, USDC_TESTNET_ASA_ID } from "@x402/avm";

/**
 * Returns a base64 encoded 64 byte Algorand secret key, either from the
 * environment or freshly generated for this process.
 *
 * @param {string} envVar - Name of the environment variable holding the key.
 * @returns {{ address: string, secretKeyBase64: string, generated: boolean }} Account material.
 */
function loadOrCreateAccount(envVar) {
  const fromEnv = process.env[envVar];
  if (fromEnv) {
    const secretKey = Buffer.from(fromEnv, "base64");
    const account = algosdk.mnemonicToSecretKey(
      algosdk.secretKeyToMnemonic(new Uint8Array(secretKey)),
    );
    return { address: account.addr.toString(), secretKeyBase64: fromEnv, generated: false };
  }
  const account = algosdk.generateAccount();
  return {
    address: account.addr.toString(),
    secretKeyBase64: Buffer.from(account.sk).toString("base64"),
    generated: true,
  };
}

export const NETWORK = ALGORAND_TESTNET_CAIP2;

export const PORT = Number(process.env.PORT ?? 4000);

export const ALGOD_URL = process.env.ALGOD_URL ?? "https://testnet-api.algonode.cloud";

export const FACILITATOR_URL =
  process.env.FACILITATOR_URL ?? "https://facilitator.goplausible.xyz";

/**
 * `live` settles payments through the GoPlausible facilitator on Algorand
 * testnet, which requires the agent wallet to hold testnet USDC. `simulated`
 * keeps the full x402 protocol flow (real 402 responses, real signed Algorand
 * transaction groups) but settles locally instead of broadcasting, so the demo
 * runs without a funded wallet.
 */
export const X402_MODE = process.env.X402_MODE === "live" ? "live" : "simulated";

export const AGENT_WALLET = loadOrCreateAccount("AGENT_PRIVATE_KEY");
export const MERCHANT_WALLET = loadOrCreateAccount("MERCHANT_PRIVATE_KEY");

export const ASSET = {
  id: String(USDC_TESTNET_ASA_ID),
  symbol: "USDC",
  decimals: 6,
};

/** Budget policy the agent enforces before authorizing any x402 payment. */
export const BUDGET_POLICY = {
  maxPerRequestUsd: Number(process.env.MAX_PER_REQUEST_USD ?? 0.05),
  maxDailyUsd: Number(process.env.MAX_DAILY_USD ?? 2),
  startingBalanceUsd: Number(process.env.AGENT_STARTING_BALANCE_USD ?? 5),
};

/** The premium intelligence services the agent can buy from. */
export const SERVICES = [
  {
    id: "weather",
    path: "/api/weather-intelligence",
    name: "Weather Intelligence",
    priceUsd: 0.002,
    description:
      "Historical and forecast weather patterns, packing guidance and rain risk for a destination.",
  },
  {
    id: "transport",
    path: "/api/transport-intelligence",
    name: "Transport Intelligence",
    priceUsd: 0.002,
    description:
      "Local transit passes, airport transfer options and typical intra-city costs for a destination.",
  },
  {
    id: "hotel",
    path: "/api/hotel-intelligence",
    name: "Hotel Intelligence",
    priceUsd: 0.002,
    description:
      "Neighbourhood level nightly rates, availability pressure and recommended areas to stay.",
  },
];

export const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
