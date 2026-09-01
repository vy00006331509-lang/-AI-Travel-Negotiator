import algosdk from "algosdk";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { decodeTransaction, getTransactionId, isExactAvmPayload } from "@x402/avm";
import { FACILITATOR_URL, NETWORK, X402_MODE } from "../config.js";

/**
 * Decodes the payer address and Algorand transaction id out of an
 * `exact` AVM payment payload without touching the network.
 *
 * @param {object} payload - The x402 payment payload sent by the agent.
 * @returns {{ payer: string, transaction: string, receiver?: string, amount?: string, assetId?: string }} Decoded payment.
 */
function inspectAvmPayload(payload) {
  const inner = payload?.payload;
  if (!isExactAvmPayload(inner)) {
    throw new Error("payload is not an exact/AVM payment group");
  }
  const bytes = decodeTransaction(inner.paymentGroup[inner.paymentIndex]);
  const signed = algosdk.decodeSignedTransaction(bytes);
  const transfer = signed.txn.assetTransfer;
  return {
    payer: signed.txn.sender.toString(),
    transaction: getTransactionId(bytes),
    receiver: transfer?.receiver?.toString(),
    amount: transfer === undefined ? undefined : String(transfer.amount),
    assetId: transfer === undefined ? undefined : String(transfer.assetIndex),
    signed: signed.sig !== undefined,
  };
}

/**
 * Facilitator client that runs the x402 verify/settle handshake locally.
 *
 * The payment payload it receives is a genuine, client-signed Algorand
 * transaction group; this client validates it against the payment
 * requirements and reports the group's real transaction id, but never
 * broadcasts it. Used so the demo works without a funded testnet wallet.
 *
 * @implements {import("@x402/core/server").FacilitatorClient}
 */
export class SimulatedFacilitatorClient {
  /** @param {string} network - CAIP-2 network the simulated facilitator serves. */
  constructor(network = NETWORK) {
    this.network = network;
    this.url = "simulated://local-facilitator";
  }

  /**
   * Validates the payment payload against the requirements.
   *
   * @param {object} paymentPayload - Payload produced by the paying client.
   * @param {object} paymentRequirements - Requirements advertised in the 402 response.
   * @returns {Promise<object>} An x402 verify response.
   */
  async verify(paymentPayload, paymentRequirements) {
    try {
      const payment = inspectAvmPayload(paymentPayload);
      const { payer } = payment;
      if (!payment.signed) {
        return { isValid: false, invalidReason: "invalid_signature", payer };
      }
      if (payment.receiver !== paymentRequirements.payTo) {
        return { isValid: false, invalidReason: "invalid_pay_to", payer };
      }
      if (payment.assetId !== String(paymentRequirements.asset)) {
        return { isValid: false, invalidReason: "invalid_asset", payer };
      }
      if (payment.amount !== String(paymentRequirements.amount)) {
        return { isValid: false, invalidReason: "insufficient_funds", payer };
      }
      return { isValid: true, payer };
    } catch (error) {
      return {
        isValid: false,
        invalidReason: "invalid_payload",
        invalidMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Reports the signed transaction group as settled without broadcasting it.
   *
   * @param {object} paymentPayload - Payload produced by the paying client.
   * @param {object} paymentRequirements - Requirements advertised in the 402 response.
   * @returns {Promise<object>} An x402 settle response.
   */
  async settle(paymentPayload, paymentRequirements) {
    try {
      const { payer, transaction } = inspectAvmPayload(paymentPayload);
      return {
        success: true,
        payer,
        transaction,
        network: paymentRequirements.network,
        amount: paymentRequirements.amount,
        extra: { simulated: true },
      };
    } catch (error) {
      return {
        success: false,
        errorReason: "settlement_failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        transaction: "",
        network: paymentRequirements.network,
      };
    }
  }

  /**
   * Advertises the single scheme/network pair this facilitator handles.
   *
   * @returns {Promise<object>} An x402 supported response.
   */
  async getSupported() {
    return {
      kinds: [{ x402Version: 2, scheme: "exact", network: this.network }],
      extensions: [],
      signers: {},
    };
  }
}

/**
 * Builds the facilitator client for the configured mode.
 *
 * @returns {import("@x402/core/server").FacilitatorClient} Facilitator client.
 */
export function createFacilitatorClient() {
  if (X402_MODE === "live") {
    return new HTTPFacilitatorClient({ url: FACILITATOR_URL });
  }
  return new SimulatedFacilitatorClient();
}
