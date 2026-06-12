import { Shield, User, ShieldCheck } from "lucide-react";

type Role = "employee" | "admin" | "superadmin" | string;

const ROLE_CONFIG: Record<string, { label: string; cls: string; Icon: React.ElementType }> = {
  admin: {
    label: "مدير",
    cls: "text-violet-600 dark:text-violet-300 bg-violet-500/10 border border-violet-500/25",
    Icon: Shield,
  },
  employee: {
    label: "موظف",
    cls: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/25",
    Icon: User,
  },
  superadmin: {
    label: "مدير المنصة",
    cls: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/25",
    Icon: ShieldCheck,
  },
};

interface RoleBadgeProps {
  role: Role;
  className?: string;
}

export function RoleBadge({ role, className = "" }: RoleBadgeProps) {
  const cfg = ROLE_CONFIG[role] ?? {
    label: role,
    cls: "text-muted-foreground bg-muted border border-border",
    Icon: User,
  };
  const { Icon, label, cls } = cfg;
  return (
    <span
      className={`inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls} ${className}`}
    >
      <Icon className="w-3 h-3 shrink-0" />
      {label}
    </span>
  );
}
