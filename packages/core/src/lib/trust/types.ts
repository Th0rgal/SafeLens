export type TrustLevel = "self-verified" | "api-sourced" | "user-provided";

export type TrustConfig = {
  label: string;
  color: string;
  icon: "ShieldCheck" | "Globe" | "User";
};

export const TRUST_CONFIG: Record<
  TrustLevel,
  { label: string; color: string; icon: "ShieldCheck" | "Globe" | "User" }
> = {
  "self-verified": {
    label: "Self-verified",
    color: "text-emerald-400",
    icon: "ShieldCheck",
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
