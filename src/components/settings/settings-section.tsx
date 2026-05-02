import type { ReactNode } from "react";

/** 設定區塊 props */
export interface SettingsSectionProps {
  title: string;
  description: ReactNode;
  icon: ReactNode;
  badge?: string;
  badgeColor?: string;
  children: ReactNode;
}

/** 通用設定區塊容器 */
export function SettingsSection({
  title,
  description,
  icon,
  badge,
  badgeColor,
  children,
}: SettingsSectionProps) {
  return (
    <section className="bg-card border border-card-border rounded-xl p-5 sm:p-6 mb-4">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-accent-light text-accent flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {badge && (
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badgeColor}`}
              >
                {badge}
              </span>
            )}
          </div>
          <p className="text-xs text-muted mt-0.5">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
