import express from "express";
import { planTrip } from "../agent/orchestrator.js";

/**
 * Builds the orchestrator router.
 *
 * `POST /api/plan-trip` streams the agent's step-by-step actions as
 * Server-Sent Events and finishes with the generated itinerary. Clients that
 * prefer a single response can pass `?stream=false`.
 *
 * @param {import("../services/paymentAgent.js").PaymentAgent} paymentAgent - Shared agent wallet.
 * @returns {import("express").Router} Router exposing the orchestrator.
 */
export function createPlanTripRoute(paymentAgent) {
  const router = express.Router();

  router.post("/api/plan-trip", async (req, res) => {
    const prompt = String(req.body?.prompt ?? "").trim();
    if (!prompt) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const streaming = req.query.stream !== "false";
    const events = [];

    /**
     * Records an agent step and, when streaming, pushes it to the client.
     *
     * @param {object} event - Partial activity event.
     * @returns {void}
     */
    const emit = (event) => {
      const enriched = { ...event, at: new Date().toISOString() };
      events.push(enriched);
      if (streaming) {
        res.write(`event: activity\ndata: ${JSON.stringify(enriched)}\n\n`);
      }
    };

    if (streaming) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });
    }

    try {
      const itinerary = await planTrip({ prompt, baseUrl, paymentAgent, emit });
      const wallet = paymentAgent.getWalletState();
      if (streaming) {
        res.write(`event: itinerary\ndata: ${JSON.stringify({ itinerary, wallet })}\n\n`);
        res.write("event: done\ndata: {}\n\n");
        res.end();
      } else {
        res.json({ itinerary, wallet, events });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (streaming) {
        res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: message, events });
      }
    }
  });

  return router;
}
