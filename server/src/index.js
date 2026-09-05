import express from "express";
import cors from "cors";
import {
  AGENT_WALLET,
  FACILITATOR_URL,
  MERCHANT_WALLET,
  NETWORK,
  OPENAI_API_KEY,
  PORT,
  SERVICES,
  X402_MODE,
} from "./config.js";
import { createPaidRoutes } from "./routes/paidRoutes.js";
import { createPlanTripRoute } from "./routes/planTrip.js";
import { PaymentAgent } from "./services/paymentAgent.js";

const app = express();
const paymentAgent = new PaymentAgent();

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    mode: X402_MODE,
    network: NETWORK,
    facilitator: X402_MODE === "live" ? FACILITATOR_URL : "local (simulated settlement)",
    llm: OPENAI_API_KEY ? "openai" : "deterministic-fallback",
  });
});

app.get("/api/services", (req, res) => {
  res.json({ services: SERVICES, merchant: MERCHANT_WALLET.address });
});

app.get("/api/wallet", (req, res) => {
  res.json(paymentAgent.getWalletState());
});

app.use(createPaidRoutes());
app.use(createPlanTripRoute(paymentAgent));

app.listen(PORT, () => {
  console.log(`AI Travel Negotiator server listening on http://localhost:${PORT}`);
  console.log(`  x402 mode:   ${X402_MODE} (${NETWORK})`);
  console.log(`  facilitator: ${X402_MODE === "live" ? FACILITATOR_URL : "local simulated"}`);
  console.log(`  agent wallet:    ${AGENT_WALLET.address}${AGENT_WALLET.generated ? " (ephemeral)" : ""}`);
  console.log(`  merchant wallet: ${MERCHANT_WALLET.address}${MERCHANT_WALLET.generated ? " (ephemeral)" : ""}`);
});
