import React from 'react';
import { useLangue } from '../../context/LangueContext';
import { LogoMarketAdvisor } from '../brand/LogoMarketAdvisor';

interface AccueilHeaderProps {
  onSelectConnexion?: () => void;
}

export const AccueilHeader: React.FC<AccueilHeaderProps> = ({ onSelectConnexion }) => {
  const { langue, setLangue, t } = useLangue();

  return (
    <header className="w-full bg-page border-b border-ligne shrink-0">
      {/* 4px Cameroon Flag Top Strip (3 thirds) */}
      <div className="h-1 w-full flex shrink-0" role="presentation" aria-hidden="true">
        <div className="w-1/3 h-full bg-[#007A5E]" />
        <div className="w-1/3 h-full bg-[#CE1126]" />
        <div className="w-1/3 h-full bg-[#FCD116]" />
      </div>

      {/* Main Navigation Row */}
      <div
        className="h-16 flex items-center justify-between"
        style={{
          paddingLeft: 'clamp(20px, 4vw, 56px)',
          paddingRight: 'clamp(20px, 4vw, 56px)'
        }}
      >
        {/* Left: Brand Identity Link */}
        <a
          href="/"
          aria-label="Market Advisor CM, retour à l'accueil"
          className="rounded-champ focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus transition-opacity hover:opacity-90"
        >
          <LogoMarketAdvisor taille="md" />
        </a>

        {/* Right: Language Switcher & Login CTA */}
        <div className="flex items-center gap-4 sm:gap-6">
          {/* FR / EN Language Selector (min 44px tap target) */}
          <div
            className="rounded-champ border border-ligne p-0.5 flex items-center bg-surface shadow-2xs"
            role="group"
            aria-label="Sélecteur de langue"
          >
            <button
              type="button"
              onClick={() => setLangue('fr')}
              aria-pressed={langue === 'fr'}
              className={`min-w-[44px] h-8 px-2.5 flex items-center justify-center font-bold text-[0.8125rem] rounded-[8px] transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus cursor-pointer ${
                langue === 'fr'
                  ? 'bg-teal text-white shadow-xs'
                  : 'text-discret hover:text-encre'
              }`}
            >
              FR
            </button>
            <button
              type="button"
              onClick={() => setLangue('en')}
              aria-pressed={langue === 'en'}
              className={`min-w-[44px] h-8 px-2.5 flex items-center justify-center font-bold text-[0.8125rem] rounded-[8px] transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus cursor-pointer ${
                langue === 'en'
                  ? 'bg-teal text-white shadow-xs'
                  : 'text-discret hover:text-encre'
              }`}
            >
              EN
            </button>
          </div>

          {/* Text Login Button -> Activates 'connexion' tab */}
          <button
            type="button"
            onClick={onSelectConnexion}
            className="text-teal font-semibold text-[0.875rem] underline hover:opacity-85 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus rounded-champ transition-opacity cursor-pointer"
          >
            {t('navConnexion')}
          </button>
        </div>
      </div>
    </header>
  );
};
