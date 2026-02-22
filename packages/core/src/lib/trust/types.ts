import type { TrustClassification } from "../types";

/**
 * TrustLevel is an alias for TrustClassification so that both the Zod
 * schema (used for runtime validation) and the display/config layer
 * share a single source of truth.  Adding a sixth level to the Zod enum
 * will surface a compile error in TRUST_CONFIG automatically.
 */
export type TrustLevel = TrustClassification;

export type TrustConfig = {
  label: string;
  color: string;
  icon: "ShieldCheck" | "Lock" | "Server" | "Globe" | "User";
};

export const TRUST_CONFIG: Record<TrustLevel, TrustConfig> = {
  "consensus-verified": {
    label: "Consensus-verified",
    color: "text-green-400",
    icon: "ShieldCheck",
  },
  "consensus-verified-beacon": {
    label: "Consensus-verified (Beacon)",
    color: "text-green-400",
    icon: "ShieldCheck",
  },
  "consensus-verified-opstack": {
    label: "Consensus-verified (OP Stack)",
    color: "text-green-400",
    icon: "ShieldCheck",
  },
  "consensus-verified-linea": {
    label: "Consensus-verified (Linea)",
    color: "text-green-400",
    icon: "ShieldCheck",
  },
  "proof-verified": {
    label: "Proof-verified",
    color: "text-blue-400",
    icon: "Lock",
  },
  "self-verified": {
    label: "Self-verified",
    color: "text-emerald-400",
    icon: "ShieldCheck",
  },
  "rpc-sourced": {
    label: "RPC-sourced",
    color: "text-orange-400",
    icon: "Server",
  },
  "api-sourced": {
    label: "API-sourced",
    color: "text-amber-400",
    icon: "Globe",
  },
  "user-provided": {
    label: "User-provided",
    color: "text-gray-400",
    icon: "User",
  },
};
