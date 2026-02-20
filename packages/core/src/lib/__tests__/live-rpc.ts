import { it } from "vitest";

// Live RPC integration tests are opt-in to keep CI deterministic.
export const LIVE_RPC_ENV = "SAFELENS_LIVE_RPC_TESTS";
export const liveRpcEnabled = process.env[LIVE_RPC_ENV] === "1";
export const itLiveRpc = liveRpcEnabled ? it : it.skip;
