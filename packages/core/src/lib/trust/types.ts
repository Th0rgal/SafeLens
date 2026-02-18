export type TrustLevel =
  | "proof-verified"
  | "self-verified"
  | "rpc-sourced"
  | "api-sourced"
  | "user-provided";

export type TrustConfig = {
  label: string;
  color: string;
  icon: "ShieldCheck" | "Lock" | "Server" | "Globe" | "User";
};

export const TRUST_CONFIG: Record<TrustLevel, TrustConfig> = {
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
