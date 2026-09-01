# AI Travel Negotiator

An autonomous travel agent that plans trips by **buying the data it needs**. When the agent hits an
`HTTP 402 Payment Required` paywall it checks its own budget policy, signs an Algorand payment with
the [x402](https://x402.org) protocol, settles it, retries the request and uses the unlocked
intelligence to write a better itinerary.

## The money moment

```
REQ     Requesting Weather Intelligence for Tokyo
402     HTTP 402 intercepted — Weather Intelligence quotes 0.002 USDC to 6MB47BYC…
BUDGET  Cost 0.002 USDC — budget approved (within per-request cap $0.05 and daily cap $2)
SIGN    Signed Algorand payment group from H32UCTBX… — routing via facilitator
PAID    Payment settled — tx BLIFSKQ3GOCMHHS7WLKW…
DATA    Weather Intelligence unlocked
```

Every step is a real x402 exchange: the server runs `@x402/express` with an `exact`/AVM scheme on
Algorand Testnet, and the agent builds and signs a genuine Algorand transaction group with
`@x402/avm` before retrying with the `X-PAYMENT` header.

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | React 19, Vite, Tailwind CSS v4 |
| Backend | Node.js, Express 5 |
| Agent | OpenAI (`gpt-4o-mini`) tool calling, with a deterministic fallback planner |
| Payments | `@x402/express`, `@x402/core`, `@x402/avm`, Algorand Testnet, GoPlausible facilitator |

## Endpoints

| Route | Description |
| --- | --- |
| `GET /api/weather-intelligence` | x402-protected, 0.002 USDC |
| `GET /api/transport-intelligence` | x402-protected, 0.002 USDC |
| `GET /api/hotel-intelligence` | x402-protected, 0.002 USDC |
| `POST /api/plan-trip` | Orchestrator; streams agent activity as SSE (`?stream=false` for one shot JSON) |
| `GET /api/wallet` | Agent wallet balance, budget policy and settled transactions |
| `GET /api/services` | Catalogue of paid intelligence providers |

## Running locally

```bash
cd server && npm install && cp .env.example .env && npm start   # http://localhost:4000
cd client && npm install && npm run dev                          # http://localhost:5173
```

The Vite dev server proxies `/api` to the backend, so no extra configuration is needed.

## Payment modes

`X402_MODE=simulated` (default) — the full x402 handshake runs for real: real 402 responses, real
payment requirements, a real signed Algorand transaction group. A local facilitator verifies the
signed group against the payment requirements (payee, asset, amount) and reports the real group
transaction id as settled **without broadcasting**, so the demo works without a funded testnet
wallet.

`X402_MODE=live` — settlement is routed to the GoPlausible facilitator
(`https://facilitator.goplausible.xyz`) on Algorand Testnet. This requires `AGENT_PRIVATE_KEY` to
hold a funded account that is opted in to the testnet USDC ASA (`10458941`).

Pricing is quoted in testnet **USDC** rather than native ALGO because that is the asset the x402
AVM `exact` scheme and the GoPlausible facilitator settle.

## Budget policy

Configured in `server/.env`, enforced in `server/src/services/paymentAgent.js` and additionally by
the x402 client's spend controls:

- max $0.05 per request
- max $2 per day
- $5 starting balance

Any quote that breaches a limit is refused and logged as `DENIED`; the agent then plans without
that data source.

## AI orchestration

With `OPENAI_API_KEY` set, the agent runs `gpt-4o-mini` with three tools
(`buy_weather_intelligence`, `buy_transport_intelligence`, `buy_hotel_intelligence`) and decides for
itself which feeds are worth paying for. Without a key it falls back to a deterministic planner that
purchases all three feeds, so the MVP always runs.
