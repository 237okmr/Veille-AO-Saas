import React, { useEffect, useRef } from 'react';
import { X, Sparkles, CheckCircle2, Mail, ExternalLink } from 'lucide-react';
import { useLangue } from '../../context/LangueContext';

interface ModalExempleAlerteProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ModalExempleAlerte: React.FC<ModalExempleAlerteProps> = ({ isOpen, onClose }) => {
  const { langue, t } = useLangue();
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Trap focus inside modal
  useEffect(() => {
    if (!isOpen) return;
    const focusableElements = modalRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusableElements && focusableElements.length > 0) {
      focusableElements[0].focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Calcul de la date limite dans 10 jours au fuseau Africa/Douala
  const dateDans10Jours = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  const dateFormatee = new Intl.DateTimeFormat(langue === 'fr' ? 'fr-FR' : 'en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Douala'
  }).format(dateDans10Jours);

  const dateComplete = langue === 'fr'
    ? `${dateFormatee}, 12 h 00 (heure de Douala)`
    : `${dateFormatee}, 12:00 PM (Douala time)`;

  const montantTexte = '48\u00A0M\u00A0FCFA';
  const delaiTexte = t('jourPluriel', { n: 10 });
  const scoreIaTexte = langue === 'fr' ? '4,8 / 5' : '4.8 / 5';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-alerte-titre"
    >
      <div
        ref={modalRef}
        className="w-full max-w-[560px] bg-surface rounded-carte border border-ligne shadow-hud p-5 sm:p-6 text-encre relative overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* En-tête de la modale */}
        <div className="flex items-center justify-between pb-3.5 border-b border-ligne shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal/10 text-teal flex items-center justify-center shrink-0">
              <Mail className="w-4 h-4" />
            </div>
            <h2 id="modal-alerte-titre" className="text-sm sm:text-base font-bold font-titre text-encre">
              {t('alerteTitre')}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t('fermer')}
            className="p-1.5 rounded-lg text-discret hover:text-encre hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus focus-visible:ring-offset-2 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corps défilable */}
        <div className="overflow-y-auto py-4 space-y-4 no-scrollbar">
          {/* Objet du mail */}
          <div className="p-3.5 rounded-champ bg-slate-50 border border-ligne">
            <span className="text-[11px] font-semibold text-discret uppercase tracking-wider block mb-1">
              {t('alerteObjet')} :
            </span>
            <p className="text-xs sm:text-sm font-bold text-encre leading-snug">
              {t('alerteObjetMail', { montant: montantTexte, delai: delaiTexte })}
            </p>
          </div>

          {/* Liste de définitions de l'avis */}
          <dl className="grid grid-cols-1 gap-2.5 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between py-1.5 border-b border-ligne/60 gap-1">
              <dt className="text-discret font-medium shrink-0 sm:w-1/3">{t('alerteReference')}</dt>
              <dd className="font-mono font-semibold text-encre sm:w-2/3 sm:text-right">
                N° 000/AONO/2026 (exemple)
              </dd>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between py-1.5 border-b border-ligne/60 gap-1">
              <dt className="text-discret font-medium shrink-0 sm:w-1/3">{t('alerteAutorite')}</dt>
              <dd className="font-semibold text-encre sm:w-2/3 sm:text-right">
                Commune de Bondjock
              </dd>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between py-1.5 border-b border-ligne/60 gap-1">
              <dt className="text-discret font-medium shrink-0 sm:w-1/3">{t('alerteObjet')}</dt>
              <dd className="font-semibold text-encre sm:w-2/3 sm:text-right">
                Extension du réseau d'eau potable et construction de 3 forages équipés
              </dd>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between py-1.5 border-b border-ligne/60 gap-1">
              <dt className="text-discret font-medium shrink-0 sm:w-1/3">{t('alerteMontant')}</dt>
              <dd className="font-mono font-extrabold text-teal sm:w-2/3 sm:text-right">
                {montantTexte}
              </dd>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between py-1.5 border-b border-ligne/60 gap-1">
              <dt className="text-discret font-medium shrink-0 sm:w-1/3">{t('alerteDateLimite')}</dt>
              <dd className="font-semibold text-encre sm:w-2/3 sm:text-right">
                {dateComplete}
              </dd>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between py-1.5 gap-1">
              <dt className="text-discret font-medium shrink-0 sm:w-1/3">{t('alerteScore')}</dt>
              <dd className="sm:w-2/3 sm:text-right">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-extrabold text-xs">
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  <span>{scoreIaTexte}</span>
                </span>
              </dd>
            </div>
          </dl>

          {/* Encadré explicatif vert (#E6F4F1 / #00695C) */}
          <div className="p-4 rounded-champ bg-ok-fond border border-ok/20 text-ok space-y-2">
            <h3 className="text-xs font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-ok shrink-0" />
              <span>{t('alertePourquoi')}</span>
            </h3>
            <ul className="text-xs space-y-1.5 pl-5 list-disc leading-relaxed font-medium">
              <li>{t('alerteRaison1')}</li>
              <li>{t('alerteRaison2')}</li>
            </ul>
          </div>

          {/* Bouton d'action d'exemple */}
          <div className="pt-2">
            <button
              type="button"
              className="w-full h-11 flex items-center justify-center gap-2 rounded-champ bg-teal text-white font-semibold text-xs hover:opacity-90 active:opacity-95 transition-all shadow-xs focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus focus-visible:ring-offset-2 cursor-pointer"
            >
              <span>{t('alerteOuvrir')}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
            <p className="text-[11px] text-discret leading-relaxed mt-2.5 text-center">
              {t('alerteNote')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
