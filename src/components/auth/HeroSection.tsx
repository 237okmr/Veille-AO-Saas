import React from 'react';
import { ArrowRight } from 'lucide-react';
import { useLangue } from '../../context/LangueContext';

interface HeroSectionProps {
  onCtaPilote: () => void;
  onOpenExempleAlerte?: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  onCtaPilote
}) => {
  const { t } = useLangue();

  return (
    <div className="w-full">
      {/* 1. Les 3 cartes de fonctionnement */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-3.5 lg:gap-4">
        {/* Carte 1 */}
        <div className="bg-white/95 border border-slate-200/90 rounded-2xl p-4 sm:p-4.5 shadow-xs flex flex-col justify-start">
          <div className="w-7 h-7 rounded-full bg-teal/10 text-teal font-bold text-xs sm:text-sm flex items-center justify-center shrink-0">
            1
          </div>
          <h2 className="font-titre font-bold text-sm sm:text-[0.95rem] text-encre mt-3 leading-snug">
            {t('etape1Titre')}
          </h2>
          <p className="text-xs sm:text-[0.8125rem] text-discret mt-1.5 leading-relaxed font-normal">
            {t('etape1Texte')}
          </p>
        </div>

        {/* Carte 2 */}
        <div className="bg-white/95 border border-slate-200/90 rounded-2xl p-4 sm:p-4.5 shadow-xs flex flex-col justify-start">
          <div className="w-7 h-7 rounded-full bg-teal/10 text-teal font-bold text-xs sm:text-sm flex items-center justify-center shrink-0">
            2
          </div>
          <h2 className="font-titre font-bold text-sm sm:text-[0.95rem] text-encre mt-3 leading-snug">
            {t('etape2Titre')}
          </h2>
          <p className="text-xs sm:text-[0.8125rem] text-discret mt-1.5 leading-relaxed font-normal">
            {t('etape2Texte')}
          </p>
        </div>

        {/* Carte 3 */}
        <div className="bg-white/95 border border-slate-200/90 rounded-2xl p-4 sm:p-4.5 shadow-xs flex flex-col justify-start">
          <div className="w-7 h-7 rounded-full bg-teal/10 text-teal font-bold text-xs sm:text-sm flex items-center justify-center shrink-0">
            3
          </div>
          <h2 className="font-titre font-bold text-sm sm:text-[0.95rem] text-encre mt-3 leading-snug">
            {t('etape3Titre')}
          </h2>
          <p className="text-xs sm:text-[0.8125rem] text-discret mt-1.5 leading-relaxed font-normal">
            {t('etape3Texte')}
          </p>
        </div>
      </div>

      {/* 2. Ligne avec Sources suivies à gauche et Bouton Demander un accès pilote à droite */}
      <div className="mt-4 sm:mt-5 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Texte des sources suivies */}
        <p className="text-xs sm:text-[0.8125rem] text-discret leading-relaxed select-none text-center sm:text-left flex-1">
          {t('sources')}
        </p>

        {/* CTA Principal : Demander un accès pilote */}
        <button
          type="button"
          onClick={onCtaPilote}
          className="h-11 sm:h-12 px-5 sm:px-6 rounded-champ bg-cta hover:bg-cta-survol active:opacity-95 text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus focus-visible:ring-offset-2 cursor-pointer shrink-0 w-full sm:w-auto"
        >
          <span>{t('ctaPilote')}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
