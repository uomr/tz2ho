import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  desc?: string;
  className?: string;
}

export function EmptyState({ icon: Icon, title, desc, className = "" }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center gap-3 py-14 text-muted-foreground ${className}`}>
      <Icon className="w-10 h-10 opacity-20" />
      <p className="text-sm font-medium">{title}</p>
      {desc && <p className="text-xs opacity-60">{desc}</p>}
    </div>
  );
}
