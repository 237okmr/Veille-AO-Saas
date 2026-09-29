import React from 'react';
import { useLangue } from '../../context/LangueContext';

export const EtapesCommentCaMarche: React.FC = () => {
  const { t } = useLangue();

  return (
    <ol className="grid grid-cols-1 sm:grid-cols-3 gap-3 list-none p-0 select-none">
      {/* Étape 1 */}
      <li className="flex flex-col p-3 rounded-champ bg-slate-50/80 border border-ligne">
        {/* Pastille numérotée */}
        <div className="w-5 h-5 rounded-full bg-ok-fond text-teal text-[11px] font-bold flex items-center justify-center shrink-0 mb-1.5">
          1
        </div>

        {/* Titre & Description */}
        <h4 className="font-titre font-bold text-xs text-encre leading-snug">
          {t('etape1Titre')}
        </h4>
        <p className="text-[11px] text-discret mt-0.5 leading-relaxed">
          {t('etape1Texte')}
        </p>
      </li>

      {/* Étape 2 */}
      <li className="flex flex-col p-3 rounded-champ bg-slate-50/80 border border-ligne">
        <div className="w-5 h-5 rounded-full bg-ok-fond text-teal text-[11px] font-bold flex items-center justify-center shrink-0 mb-1.5">
          2
        </div>

        <h4 className="font-titre font-bold text-xs text-encre leading-snug">
          {t('etape2Titre')}
        </h4>
        <p className="text-[11px] text-discret mt-0.5 leading-relaxed">
          {t('etape2Texte')}
        </p>
      </li>

      {/* Étape 3 */}
      <li className="flex flex-col p-3 rounded-champ bg-slate-50/80 border border-ligne">
        <div className="w-5 h-5 rounded-full bg-ok-fond text-teal text-[11px] font-bold flex items-center justify-center shrink-0 mb-1.5">
          3
        </div>

        <h4 className="font-titre font-bold text-xs text-encre leading-snug">
          {t('etape3Titre')}
        </h4>
        <p className="text-[11px] text-discret mt-0.5 leading-relaxed">
          {t('etape3Texte')}
        </p>
      </li>
    </ol>
  );
};
