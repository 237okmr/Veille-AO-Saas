import React from 'react';
import { useLangue } from '../../context/LangueContext';

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
          aria-label="Market Advisor CM"
          className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus focus-visible:ring-offset-2 transition-opacity hover:opacity-90"
        >
          {/* Official SVG Logo */}
          <svg
            viewBox="0 0 40 40"
            fill="none"
            aria-hidden="true"
            className="w-8 h-8 text-teal shrink-0"
          >
            <circle cx="20" cy="20" r="17" stroke="currentColor" strokeWidth="2.5" />
            <circle cx="20" cy="20" r="9" stroke="currentColor" strokeWidth="2" opacity=".55" />
            <path d="M20 20 L36 24 A17 17 0 0 1 20 37 Z" fill="currentColor" opacity=".28" />
            <path d="M20 20 L36 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="26" cy="12" r="3" fill="currentColor" />
          </svg>

          {/* Wordmark & Country Badge */}
          <div className="flex items-center gap-1.5">
            <span className="font-titre font-extrabold text-[1.2rem] text-encre tracking-tight leading-none">
              Market Advisor
            </span>
            <span className="bg-teal text-white font-bold text-[0.8rem] rounded-[6px] px-1.5 py-0.5 leading-none">
              CM
            </span>
          </div>
        </a>

        {/* Right: Language Switcher & Login CTA */}
        <div className="flex items-center gap-4 sm:gap-6">
          {/* FR / EN Language Selector (10px rounded frame, min 44px tap target) */}
          <div
            className="rounded-[10px] border border-ligne p-0.5 flex items-center bg-white shadow-2xs"
            role="group"
            aria-label="Sélecteur de langue"
          >
            <button
              type="button"
              onClick={() => setLangue('fr')}
              aria-pressed={langue === 'fr'}
              className={`min-w-[44px] h-8 px-2.5 flex items-center justify-center font-bold text-xs rounded-[8px] transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus focus-visible:ring-offset-2 cursor-pointer ${
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
              className={`min-w-[44px] h-8 px-2.5 flex items-center justify-center font-bold text-xs rounded-[8px] transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus focus-visible:ring-offset-2 cursor-pointer ${
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
            className="text-teal font-semibold text-sm underline hover:opacity-85 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus focus-visible:ring-offset-2 rounded-md transition-opacity cursor-pointer"
          >
            {t('navConnexion')}
          </button>
        </div>
      </div>
    </header>
  );
};
