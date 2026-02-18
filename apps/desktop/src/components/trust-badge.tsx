import { ShieldCheck, Lock, Server, Globe, User } from "lucide-react";
import { type TrustLevel, TRUST_CONFIG } from "@safelens/core";
import { cn } from "@/lib/utils";

const iconMap = {
  ShieldCheck,
  Lock,
  Server,
  Globe,
  User,
};

interface TrustBadgeProps {
  level: TrustLevel;
  className?: string;
}

export function TrustBadge({ level, className }: TrustBadgeProps) {
  const config = TRUST_CONFIG[level];
  const Icon = iconMap[config.icon];

  return (
    <span
      className={cn("inline-flex items-center gap-1 text-xs", config.color, className)}
      title={config.label}
    >
      <Icon className="h-3 w-3" />
      <span>{config.label}</span>
    </span>
  );
}
