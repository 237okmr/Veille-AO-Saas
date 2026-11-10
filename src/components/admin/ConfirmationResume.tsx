import React, { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../ui';

export interface LigneResume {
  label: string;
  ancien: string;
  nouveau: string;
  /** Phrase d'effet ou d'avertissement sous la ligne. */
  note?: string;
  /** Ligne mise en avant (impact quota, remplacement de clé…). */
  attention?: boolean;
}

interface ConfirmationResumeProps {
  titre: string;
  lignes: LigneResume[];
  libelleConfirmer?: string;
  enCours?: boolean;
  onConfirmer: () => void;
  onAnnuler: () => void;
}

/**
 * Fenêtre de confirmation avec résumé « ancienne valeur → nouvelle valeur ».
 * Les valeurs secrètes ne doivent jamais lui être passées en clair : l'appelant fournit des textes masqués.
 */
export const ConfirmationResume: React.FC<ConfirmationResumeProps> = ({
  titre,
  lignes,
  libelleConfirmer = 'Confirmer',
  enCours = false,
  onConfirmer,
  onAnnuler
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !enCours) onAnnuler();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enCours, onAnnuler]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmation-titre"
    >
      <div className="w-full max-w-lg bg-surface border border-ligne rounded-carte shadow-hud p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 id="confirmation-titre" className="text-lg font-semibold text-encre">{titre}</h2>

        <ul className="space-y-3">
          {lignes.map((l, i) => (
            <li
              key={i}
              className={`rounded-champ border px-3 py-2.5 ${
                l.attention ? 'border-amber-300 bg-amber-50' : 'border-ligne bg-page'
              }`}
            >
              <p className="text-[0.875rem] font-semibold text-encre">{l.label}</p>
              <p className="text-[0.875rem] text-encre mt-0.5 break-words">
                <span className="text-discret">{l.ancien}</span>
                <span aria-hidden="true" className="mx-2">→</span>
                <span className="sr-only"> devient </span>
                <span className="font-semibold">{l.nouveau}</span>
              </p>
              {l.note && (
                <p className="mt-1 flex items-start gap-1.5 text-[0.8125rem] text-discret">
                  {l.attention && <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />}
                  <span>{l.note}</span>
                </p>
              )}
            </li>
          ))}
        </ul>

        <p className="text-[0.8125rem] text-discret">
          Chaque modification est tracée dans le journal d’audit.
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <Button variante="secondaire" onClick={onAnnuler} disabled={enCours}>Annuler</Button>
          <Button onClick={onConfirmer} chargement={enCours}>{libelleConfirmer}</Button>
        </div>
      </div>
    </div>
  );
};
