import React from 'react';
import { LucideIcon } from 'lucide-react';
import { Card } from './Card';

export type KpiTone = 'neutre' | 'ok' | 'attention';

export interface KpiCardProps {
  label: string;
  valeur: string | number;
  sousTexte?: string;
  tonSousTexte?: KpiTone;
  icone?: LucideIcon | React.ComponentType<{ className?: string }>;
  onClick?: () => void;
  chargement?: boolean;
  className?: string;
  ariaLabel?: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  valeur,
  sousTexte,
  tonSousTexte = 'neutre',
  icone: Icon,
  onClick,
  chargement = false,
  className = '',
  ariaLabel
}) => {
  const isClickable = typeof onClick === 'function';

  const tonClass = {
    neutre: 'text-discret',
    ok: 'text-teal font-semibold',
    attention: 'text-amber-700 font-medium'
  }[tonSousTexte];

  const content = (
    <div className="flex flex-col justify-between h-full space-y-3">
      {/* Top row: Label & Icon */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.875rem] text-discret font-medium truncate">
          {label}
        </span>
        {Icon && (
          <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-teal" />
          </div>
        )}
      </div>

      {/* Main Metric Value */}
      <div>
        {chargement ? (
          <div className="h-8 w-24 bg-slate-200 rounded animate-pulse" />
        ) : (
          <div className="font-titre font-extrabold text-[1.75rem] tabular-nums text-encre leading-tight">
            {valeur}
          </div>
        )}

        {/* Subtext */}
        {chargement ? (
          <div className="h-4 w-32 bg-slate-100 rounded mt-1.5 animate-pulse" />
        ) : (
          sousTexte && (
            <p className={`text-[0.8125rem] mt-1 leading-normal ${tonClass}`}>
              {sousTexte}
            </p>
          )
        )}
      </div>
    </div>
  );

  if (isClickable) {
    return (
      <Card
        as="button"
        padding="md"
        onClick={onClick}
        aria-label={ariaLabel || `${label} : ${valeur}`}
        className={`w-full text-left transition-colors cursor-pointer hover:border-teal focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus ${className}`}
      >
        {content}
      </Card>
    );
  }

  return (
    <Card as="div" padding="md" className={className}>
      {content}
    </Card>
  );
};
