import React from 'react';
import { ArrowRight, Eye } from 'lucide-react';
import { useLangue } from '../../context/LangueContext';

interface HeroSectionProps {
  onCtaPilote: () => void;
  onOpenExempleAlerte: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  onCtaPilote,
  onOpenExempleAlerte
}) => {
  const { t } = useLangue();

  return (
    <div className="w-full mb-4 sm:mb-6">
      {/* 1. Titre Principal H1 Unique */}
      <h1
        className="font-titre font-extrabold text-encre max-w-[22ch] leading-[1.06] tracking-[-0.025em]"
        style={{
          fontSize: 'clamp(1.9rem, 3.2vw, 2.7rem)'
        }}
      >
        {t('heroTitre')}
      </h1>

      {/* 2. Sous-Titre (Masqué sous 700px de hauteur de fenêtre) */}
      <p className="mt-3 text-[1.0625rem] text-discret max-w-[62ch] leading-relaxed font-normal hide-on-short-screen">
        {t('heroSousTitre')}
      </p>

      {/* 3. Boutons d'action côte à côte */}
      <div className="mt-[16px] sm:mt-[18px] flex flex-wrap items-center gap-3">
        {/* CTA Principal : Demander un accès pilote */}
        <button
          type="button"
          onClick={onCtaPilote}
          className="h-11 sm:h-12 px-5 sm:px-6 rounded-champ bg-cta hover:bg-cta-survol active:opacity-95 text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus focus-visible:ring-offset-2 cursor-pointer"
        >
          <span>{t('ctaPilote')}</span>
          <ArrowRight className="w-4 h-4" />
        </button>

        {/* CTA Secondaire : Voir un exemple d'alerte */}
        <button
          type="button"
          onClick={onOpenExempleAlerte}
          className="h-11 sm:h-12 px-4 sm:px-5 rounded-champ bg-surface border border-champ text-encre hover:bg-slate-50 active:bg-slate-100 font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus focus-visible:ring-offset-2 cursor-pointer"
        >
          <Eye className="w-4 h-4 text-discret" />
          <span>{t('ctaExempleAlerte')}</span>
        </button>
      </div>
    </div>
  );
};
