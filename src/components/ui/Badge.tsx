import React from 'react';

export type BadgeTone = 'ok' | 'attente' | 'info' | 'erreur' | 'neutre';

export interface BadgeProps {
  children: React.ReactNode;
  ton?: BadgeTone;
  point?: boolean;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  ton = 'neutre',
  point = false,
  className = ''
}) => {
  const tonClasses = {
    ok: 'bg-ok-fond text-ok',
    attente: 'bg-amber-50 text-amber-800',
    info: 'bg-sky-50 text-sky-800',
    erreur: 'bg-erreur-fond text-erreur',
    neutre: 'bg-slate-100 text-slate-700'
  }[ton];

  const dotClasses = {
    ok: 'bg-ok',
    attente: 'bg-amber-500',
    info: 'bg-sky-500',
    erreur: 'bg-erreur',
    neutre: 'bg-slate-400'
  }[ton];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-pilule text-[0.8125rem] font-semibold leading-normal ${tonClasses} ${className}`}
    >
      {point && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClasses}`} />}
      <span>{children}</span>
    </span>
  );
};

/**
 * Calcule le ton sémantique d'un badge à partir du statut d'une alerte.
 */
export function tonPourStatutAlerte(
  statut?: string | null
): BadgeTone {
  if (!statut) return 'neutre';
  const normalise = statut.toUpperCase().trim();

  switch (normalise) {
    case 'ENVOYÉ':
    case 'ENVOYE':
      return 'ok';
    case 'EN_ATTENTE':
      return 'attente';
    case 'REPORTÉ':
    case 'REPORTE':
      return 'info';
    case 'EXPIRÉ':
    case 'EXPIRE':
      return 'neutre';
    case 'DOUBLON':
      return 'erreur';
    default:
      return 'neutre';
  }
}
