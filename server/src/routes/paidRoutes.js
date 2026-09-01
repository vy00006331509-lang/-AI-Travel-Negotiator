import express from "express";
import { paymentMiddleware } from "@x402/express";
import { x402ResourceServer } from "@x402/core/server";
import { ExactAvmScheme } from "@x402/avm/exact/server";
import { ASSET, MERCHANT_WALLET, NETWORK, SERVICES } from "../config.js";
import { createFacilitatorClient } from "../services/facilitator.js";
import {
  hotelIntelligence,
  transportIntelligence,
  weatherIntelligence,
} from "../services/intelligence.js";

/**
 * Converts a USD-denominated price into the atomic amount of the settlement
 * asset. The exact/AVM scheme settles in ASAs, so prices are quoted directly
 * in atomic units of testnet USDC rather than left to a money parser.
 *
 * @param {number} priceUsd - Price in USD.
 * @returns {{ amount: string, asset: string }} x402 asset amount.
 */
function assetAmount(priceUsd) {
  return {
    amount: String(Math.round(priceUsd * 10 ** ASSET.decimals)),
    asset: ASSET.id,
  };
}

/**
 * Builds the router exposing the three x402-protected intelligence endpoints.
 *
 * Every route is wrapped by the x402 Express middleware, so a request without
 * a valid `X-PAYMENT` header is answered with HTTP 402 and the payment
 * requirements the agent needs in order to pay.
 *
 * @returns {import("express").Router} Router with the protected endpoints.
 */
export function createPaidRoutes() {
  const router = express.Router();

  const resourceServer = new x402ResourceServer(createFacilitatorClient()).register(
    NETWORK,
    new ExactAvmScheme(),
  );

  const routes = Object.fromEntries(
    SERVICES.map((service) => [
      `GET ${service.path}`,
      {
        accepts: {
          scheme: "exact",
          network: NETWORK,
          payTo: MERCHANT_WALLET.address,
          price: assetAmount(service.priceUsd),
          maxTimeoutSeconds: 120,
        },
        description: service.description,
        serviceName: service.name,
        mimeType: "application/json",
      },
    ]),
  );

  router.use(paymentMiddleware(routes, resourceServer));

  router.get("/api/weather-intelligence", (req, res) => {
    res.json(weatherIntelligence(String(req.query.destination ?? "unknown")));
  });

  router.get("/api/transport-intelligence", (req, res) => {
    res.json(transportIntelligence(String(req.query.destination ?? "unknown")));
  });

  router.get("/api/hotel-intelligence", (req, res) => {
    res.json(hotelIntelligence(String(req.query.destination ?? "unknown")));
  });

  return router;
}
