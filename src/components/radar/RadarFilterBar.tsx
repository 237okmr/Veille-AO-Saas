import React from 'react';
import { Pause, Play } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import { useLangue } from '../../context/LangueContext';
import { TypeFiltreRadar } from '../../hooks/useCycleAvis';

interface RadarFilterBarProps {
  filtreActif: TypeFiltreRadar;
  onSelectFiltre: (filtre: TypeFiltreRadar) => void;
  isManualPaused: boolean;
  onTogglePause: () => void;
  countTous: number;
  countNational: number;
  countInternational: number;
}

export const RadarFilterBar: React.FC<RadarFilterBarProps> = ({
  filtreActif,
  onSelectFiltre,
  isManualPaused,
  onTogglePause,
  countTous,
  countNational,
  countInternational
}) => {
  const { t } = useLangue();
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="w-full flex flex-wrap items-center justify-between gap-2.5 mb-2">
      {/* 3 Puces de filtrage */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtres du radar">
        {/* Puce : Tous */}
        <button
          type="button"
          onClick={() => onSelectFiltre('ALL')}
          aria-pressed={filtreActif === 'ALL'}
          className={`h-[38px] px-3.5 rounded-full text-xs transition-all flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus focus-visible:ring-offset-2 cursor-pointer ${
            filtreActif === 'ALL'
              ? 'bg-teal text-white font-semibold shadow-xs'
              : 'bg-surface border border-champ text-encre font-medium hover:border-slate-500'
          }`}
        >
          <span>{t('filtreTous')}</span>
          <span
            className={`text-[11px] ${
              filtreActif === 'ALL' ? 'text-white/80' : 'text-discret'
            }`}
          >
            ({countTous})
          </span>
        </button>

        {/* Puce : National */}
        <button
          type="button"
          onClick={() => onSelectFiltre('NATIONAL')}
          aria-pressed={filtreActif === 'NATIONAL'}
          className={`h-[38px] px-3.5 rounded-full text-xs transition-all flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus focus-visible:ring-offset-2 cursor-pointer ${
            filtreActif === 'NATIONAL'
              ? 'bg-teal text-white font-semibold shadow-xs'
              : 'bg-surface border border-champ text-encre font-medium hover:border-slate-500'
          }`}
        >
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: '#0D9488' }}
            aria-hidden="true"
          />
          <span>{t('filtreNational')}</span>
          <span
            className={`text-[11px] ${
              filtreActif === 'NATIONAL' ? 'text-white/80' : 'text-discret'
            }`}
          >
            ({countNational})
          </span>
        </button>

        {/* Puce : International */}
        <button
          type="button"
          onClick={() => onSelectFiltre('INTERNATIONAL')}
          aria-pressed={filtreActif === 'INTERNATIONAL'}
          className={`h-[38px] px-3.5 rounded-full text-xs transition-all flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus focus-visible:ring-offset-2 cursor-pointer ${
            filtreActif === 'INTERNATIONAL'
              ? 'bg-teal text-white font-semibold shadow-xs'
              : 'bg-surface border border-champ text-encre font-medium hover:border-slate-500'
          }`}
        >
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: '#0EA5E9' }}
            aria-hidden="true"
          />
          <span>{t('filtreInternational')}</span>
          <span
            className={`text-[11px] ${
              filtreActif === 'INTERNATIONAL' ? 'text-white/80' : 'text-discret'
            }`}
          >
            ({countInternational})
          </span>
        </button>
      </div>

      {/* Bouton rond de pause/lecture (38px, masqué si prefers-reduced-motion) */}
      {!shouldReduceMotion && (
        <button
          type="button"
          onClick={onTogglePause}
          aria-pressed={isManualPaused}
          aria-label={isManualPaused ? t('lectureLabel') : t('pauseLabel')}
          title={isManualPaused ? t('lectureLabel') : t('pauseLabel')}
          className={`w-[38px] h-[38px] rounded-full flex items-center justify-center transition-colors border shadow-2xs focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus focus-visible:ring-offset-2 cursor-pointer ${
            isManualPaused
              ? 'bg-teal/10 border-teal text-teal'
              : 'bg-surface border-champ text-discret hover:text-encre hover:border-slate-500'
          }`}
        >
          {isManualPaused ? (
            <Play className="w-4 h-4 ml-0.5" />
          ) : (
            <Pause className="w-4 h-4" />
          )}
        </button>
      )}
    </div>
  );
};
