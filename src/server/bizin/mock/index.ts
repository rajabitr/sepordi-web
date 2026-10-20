import "server-only";

import type { Transport } from "../transport";
import { seedWorld } from "./fixtures";
import { dispatch } from "./router";
import { getWorld } from "./state";

let warned = false;

/**
 * In-memory Bizin for BIZIN_MODE=mock. Selected only by that explicit setting (see transport.ts), never as a
 * fallback for a missing key; a production server running it says so in its log once.
 */
export const mockTransport: Transport = async (req) => {
  if (!warned && process.env.NODE_ENV === "production") {
    warned = true;
    console.warn("[sepordi] BIZIN_MODE=mock: Partner API calls are answered by the in-memory mock, not by Bizin.");
  }
  return dispatch(getWorld(seedWorld), req);
};

export { DEMO_SHOPS } from "./fixtures";
export { resetWorld } from "./state";
