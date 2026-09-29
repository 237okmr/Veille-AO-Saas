import React from 'react';
import { useLangue } from '../../context/LangueContext';

export const AccrocheCommerciale: React.FC = () => {
  const { t } = useLangue();

  return (
    <div className="w-full px-1 select-none">
      {/* 1. Titre H2 Commercial */}
      <h2 className="font-titre font-extrabold text-lg sm:text-xl lg:text-[1.35rem] leading-snug tracking-tight text-encre">
        {t('accrocheTitre')}
      </h2>

      {/* 2. Phrase d'appui */}
      <p className="mt-1.5 text-xs sm:text-sm text-discret font-normal leading-relaxed">
        {t('accrocheSousTitre')}
      </p>

      {/* 3. Trois arguments en liste sans puces avec coche SVG */}
      <ul className="mt-3.5 space-y-2 list-none p-0">
        <li className="flex items-center gap-2.5 text-xs sm:text-sm font-medium text-encre leading-snug">
          <svg
            viewBox="0 0 20 20"
            fill="none"
            className="w-[18px] h-[18px] text-teal shrink-0"
            aria-hidden="true"
          >
            <circle cx="10" cy="10" r="9" fill="#E6F4F1" />
            <path
              d="M6 10.5L8.5 13L14 7.5"
              stroke="#00695C"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{t('accroche1')}</span>
        </li>

        <li className="flex items-center gap-2.5 text-xs sm:text-sm font-medium text-encre leading-snug">
          <svg
            viewBox="0 0 20 20"
            fill="none"
            className="w-[18px] h-[18px] text-teal shrink-0"
            aria-hidden="true"
          >
            <circle cx="10" cy="10" r="9" fill="#E6F4F1" />
            <path
              d="M6 10.5L8.5 13L14 7.5"
              stroke="#00695C"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{t('accroche2')}</span>
        </li>

        <li className="flex items-center gap-2.5 text-xs sm:text-sm font-medium text-encre leading-snug">
          <svg
            viewBox="0 0 20 20"
            fill="none"
            className="w-[18px] h-[18px] text-teal shrink-0"
            aria-hidden="true"
          >
            <circle cx="10" cy="10" r="9" fill="#E6F4F1" />
            <path
              d="M6 10.5L8.5 13L14 7.5"
              stroke="#00695C"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{t('accroche3')}</span>
        </li>
      </ul>
    </div>
  );
};
