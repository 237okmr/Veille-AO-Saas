import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface PageHeaderBadge {
  icon?: LucideIcon | React.ComponentType<{ className?: string }>;
  label: string;
}

export interface PageHeaderProps {
  badge?: PageHeaderBadge;
  titre: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  badge,
  titre,
  description,
  actions,
  className = ''
}) => {
  const BadgeIcon = badge?.icon;

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 ${className}`}
    >
      <div className="space-y-1.5 min-w-0">
        {badge && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-ok-fond text-teal">
            {BadgeIcon && <BadgeIcon className="w-3.5 h-3.5 shrink-0 text-teal" />}
            <span>{badge.label}</span>
          </div>
        )}
        <h2 className="font-titre font-extrabold text-[1.5rem] leading-[1.15] tracking-[-0.02em] text-encre">
          {titre}
        </h2>
        {description && (
          <p className="text-[0.9375rem] text-discret max-w-[62ch] leading-relaxed">
            {description}
          </p>
        )}
      </div>

      {actions && (
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap sm:flex-nowrap">
          {actions}
        </div>
      )}
    </div>
  );
};
