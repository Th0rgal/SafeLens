interface GenericDetailsCardProps {
  details: Record<string, unknown>;
}

export function GenericDetailsCard({ details }: GenericDetailsCardProps) {
  return (
    <div className="space-y-2 text-sm">
      {Object.entries(details).map(([key, value]) => (
        <div key={key} className="flex justify-between gap-4">
          <span className="shrink-0 font-medium text-muted">{key}</span>
          <span className="font-mono text-xs truncate">
            {typeof value === "object" ? JSON.stringify(value) : String(value ?? "")}
          </span>
        </div>
      ))}
    </div>
  );
}
