import { x402Client, x402HTTPClient } from "@x402/core/client";
import { ExactAvmScheme } from "@x402/avm/exact/client";
import { toClientAvmSigner } from "@x402/avm";
import {
  AGENT_WALLET,
  ALGOD_URL,
  ASSET,
  BUDGET_POLICY,
  NETWORK,
  X402_MODE,
} from "../config.js";

const EXPLORER_BASE = "https://lora.algokit.io/testnet/transaction";

/**
 * Error thrown when the agent's budget policy refuses a paywall.
 */
export class BudgetRejectedError extends Error {}

/**
 * Converts an atomic asset amount into USD for budget decisions.
 *
 * @param {string|number} amount - Atomic amount of the settlement asset.
 * @returns {number} Amount in USD.
 */
function toUsd(amount) {
  return Number(amount) / 10 ** ASSET.decimals;
}

/**
 * The agent's wallet: budget policy, spend ledger and x402 payment execution.
 *
 * A single instance is shared across trip planning runs so the daily spend cap
 * and the wallet balance shown in the UI accumulate across requests.
 */
export class PaymentAgent {
  constructor() {
    this.signer = toClientAvmSigner(AGENT_WALLET.secretKeyBase64);
    this.client = new x402Client()
      .register(NETWORK, new ExactAvmScheme(this.signer, { algodUrl: ALGOD_URL }))
      .setSpendControls({ maxAmountPerPayment: `$${BUDGET_POLICY.maxPerRequestUsd}` });
    this.httpClient = new x402HTTPClient(this.client);
    this.transactions = [];
    this.spentTodayUsd = 0;
    this.spendDay = new Date().toISOString().slice(0, 10);
  }

  /**
   * Rolls the daily spend counter over at UTC midnight.
   *
   * @returns {void}
   */
  rollDailyWindow() {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.spendDay) {
      this.spendDay = today;
      this.spentTodayUsd = 0;
    }
  }

  /**
   * Current wallet snapshot for the frontend transaction explorer.
   *
   * @returns {object} Wallet address, balances, policy and settled transactions.
   */
  getWalletState() {
    this.rollDailyWindow();
    return {
      address: AGENT_WALLET.address,
      network: NETWORK,
      mode: X402_MODE,
      asset: ASSET,
      startingBalanceUsd: BUDGET_POLICY.startingBalanceUsd,
      balanceUsd: Number(
        (BUDGET_POLICY.startingBalanceUsd - this.totalSpentUsd()).toFixed(6),
      ),
      spentTodayUsd: Number(this.spentTodayUsd.toFixed(6)),
      policy: BUDGET_POLICY,
      transactions: this.transactions,
    };
  }

  /**
   * @returns {number} Total USD settled by this agent since start-up.
   */
  totalSpentUsd() {
    return this.transactions.reduce((sum, tx) => sum + tx.amountUsd, 0);
  }

  /**
   * Applies the agent's budget policy to a quoted paywall price.
   *
   * @param {number} costUsd - Quoted price in USD.
   * @returns {{ approved: boolean, reason: string }} Policy decision.
   */
  evaluateBudget(costUsd) {
    this.rollDailyWindow();
    if (costUsd > BUDGET_POLICY.maxPerRequestUsd) {
      return {
        approved: false,
        reason: `quote $${costUsd} exceeds per-request cap $${BUDGET_POLICY.maxPerRequestUsd}`,
      };
    }
    if (this.spentTodayUsd + costUsd > BUDGET_POLICY.maxDailyUsd) {
      return {
        approved: false,
        reason: `quote $${costUsd} would breach daily cap $${BUDGET_POLICY.maxDailyUsd}`,
      };
    }
    if (costUsd > BUDGET_POLICY.startingBalanceUsd - this.totalSpentUsd()) {
      return { approved: false, reason: "insufficient wallet balance" };
    }
    return {
      approved: true,
      reason: `within per-request cap $${BUDGET_POLICY.maxPerRequestUsd} and daily cap $${BUDGET_POLICY.maxDailyUsd}`,
    };
  }

  /**
   * Buys one premium intelligence resource over x402.
   *
   * This is the "money moment": the first request is made with no payment and
   * is expected to fail with HTTP 402. The payment requirements from that
   * response are checked against the budget policy, a real Algorand payment
   * group is signed with `@x402/avm`, and the request is retried with the
   * `X-PAYMENT` header so the facilitator can settle it.
   *
   * @param {object} params - Purchase parameters.
   * @param {object} params.service - Service definition from the config.
   * @param {string} params.destination - Destination to query.
   * @param {string} params.baseUrl - Base URL of the resource server.
   * @param {(event: object) => void} params.emit - Activity event sink.
   * @returns {Promise<object>} The unlocked intelligence data.
   */
  async purchase({ service, destination, baseUrl, emit }) {
    const url = `${baseUrl}${service.path}?destination=${encodeURIComponent(destination)}`;

    emit({
      level: "info",
      service: service.id,
      message: `Requesting ${service.name} for ${destination}`,
    });

    const unpaid = await fetch(url);
    if (unpaid.status !== 402) {
      emit({
        level: "info",
        service: service.id,
        message: `${service.name} returned ${unpaid.status} without a paywall`,
      });
      return unpaid.json();
    }

    const body = await unpaid.json().catch(() => undefined);
    const paymentRequired = this.httpClient.getPaymentRequiredResponse(
      (name) => unpaid.headers.get(name),
      body,
    );
    const [requirements] = paymentRequired.accepts;
    const costUsd = toUsd(requirements.amount);

    emit({
      level: "paywall",
      service: service.id,
      message: `HTTP 402 intercepted — ${service.name} quotes ${costUsd} ${ASSET.symbol} to ${requirements.payTo.slice(0, 8)}…`,
      costUsd,
    });

    const decision = this.evaluateBudget(costUsd);
    if (!decision.approved) {
      emit({
        level: "rejected",
        service: service.id,
        message: `Budget policy declined ${service.name}: ${decision.reason}`,
        costUsd,
      });
      throw new BudgetRejectedError(decision.reason);
    }

    emit({
      level: "budget",
      service: service.id,
      message: `Cost ${costUsd} ${ASSET.symbol} — budget approved (${decision.reason})`,
      costUsd,
    });

    const payload = await this.client.createPaymentPayload(paymentRequired);
    emit({
      level: "signing",
      service: service.id,
      message: `Signed Algorand payment group from ${AGENT_WALLET.address.slice(0, 8)}… — routing via ${X402_MODE === "live" ? "GoPlausible facilitator" : "local facilitator (simulated settlement)"}`,
      costUsd,
    });

    const headers = this.httpClient.encodePaymentSignatureHeader(payload);
    const paid = await fetch(url, { headers });
    const { settleResponse } = await this.httpClient.processPaymentResult(
      payload,
      (name) => paid.headers.get(name),
      paid.status,
    );

    if (!paid.ok) {
      const reason = settleResponse?.errorMessage ?? `HTTP ${paid.status}`;
      emit({
        level: "error",
        service: service.id,
        message: `Payment for ${service.name} failed: ${reason}`,
        costUsd,
      });
      throw new Error(`Payment failed for ${service.name}: ${reason}`);
    }

    const txId = settleResponse?.transaction ?? "";
    this.spentTodayUsd += costUsd;
    const transaction = {
      id: txId,
      service: service.name,
      serviceId: service.id,
      amountUsd: costUsd,
      asset: ASSET.symbol,
      network: NETWORK,
      payTo: requirements.payTo,
      settledAt: new Date().toISOString(),
      simulated: X402_MODE !== "live",
      explorerUrl: txId ? `${EXPLORER_BASE}/${txId}` : null,
    };
    this.transactions.push(transaction);

    emit({
      level: "settled",
      service: service.id,
      message: `Payment confirmed via Algorand — ${costUsd} ${ASSET.symbol}, tx ${txId.slice(0, 12)}…`,
      costUsd,
      transaction,
    });

    const data = await paid.json();
    emit({
      level: "data",
      service: service.id,
      message: `${service.name} unlocked`,
    });
    return data;
  }
}
