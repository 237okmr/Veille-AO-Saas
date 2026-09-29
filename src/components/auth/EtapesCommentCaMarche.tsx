import React from 'react';
import { useLangue } from '../../context/LangueContext';

export const EtapesCommentCaMarche: React.FC = () => {
  const { t } = useLangue();

  return (
    <ol className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3.5 list-none p-0 hide-on-pc-under-940 select-none">
      {/* Étape 1 */}
      <li className="flex flex-col">
        {/* Filet supérieur de 2px avec segment teal de 32px */}
        <div className="w-full h-[2px] bg-ligne relative mb-3">
          <div className="w-8 h-[2px] bg-teal absolute left-0 top-0" />
        </div>

        {/* Pastille numérotée ronde de 24px */}
        <div className="w-6 h-6 rounded-full bg-ok-fond text-teal text-[0.8125rem] font-bold flex items-center justify-center shrink-0 mb-2">
          1
        </div>

        {/* Titre & Description */}
        <h4 className="font-titre font-bold text-[0.875rem] text-encre leading-snug">
          {t('etape1Titre')}
        </h4>
        <p className="text-[0.8125rem] text-discret mt-1 leading-relaxed">
          {t('etape1Texte')}
        </p>
      </li>

      {/* Étape 2 */}
      <li className="flex flex-col">
        {/* Filet supérieur de 2px avec segment teal de 32px */}
        <div className="w-full h-[2px] bg-ligne relative mb-3">
          <div className="w-8 h-[2px] bg-teal absolute left-0 top-0" />
        </div>

        {/* Pastille numérotée ronde de 24px */}
        <div className="w-6 h-6 rounded-full bg-ok-fond text-teal text-[0.8125rem] font-bold flex items-center justify-center shrink-0 mb-2">
          2
        </div>

        {/* Titre & Description */}
        <h4 className="font-titre font-bold text-[0.875rem] text-encre leading-snug">
          {t('etape2Titre')}
        </h4>
        <p className="text-[0.8125rem] text-discret mt-1 leading-relaxed">
          {t('etape2Texte')}
        </p>
      </li>

      {/* Étape 3 */}
      <li className="flex flex-col">
        {/* Filet supérieur de 2px avec segment teal de 32px */}
        <div className="w-full h-[2px] bg-ligne relative mb-3">
          <div className="w-8 h-[2px] bg-teal absolute left-0 top-0" />
        </div>

        {/* Pastille numérotée ronde de 24px */}
        <div className="w-6 h-6 rounded-full bg-ok-fond text-teal text-[0.8125rem] font-bold flex items-center justify-center shrink-0 mb-2">
          3
        </div>

        {/* Titre & Description */}
        <h4 className="font-titre font-bold text-[0.875rem] text-encre leading-snug">
          {t('etape3Titre')}
        </h4>
        <p className="text-[0.8125rem] text-discret mt-1 leading-relaxed">
          {t('etape3Texte')}
        </p>
      </li>
    </ol>
  );
};
