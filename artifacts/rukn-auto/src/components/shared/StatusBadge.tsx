type InvoiceStatus = "pending" | "saved" | "injected" | string;

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  pending: {
    label: "قيد المراجعة",
    cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25",
  },
  saved: {
    label: "محفوظة",
    cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25",
  },
  injected: {
    label: "تم الحقن",
    cls: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/25",
  },
};

interface StatusBadgeProps {
  status: InvoiceStatus;
  className?: string;
}

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status] ?? {
    label: status,
    cls: "bg-muted text-muted-foreground border border-border",
  };
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.cls} ${className}`}
    >
      {cfg.label}
    </span>
  );
}
