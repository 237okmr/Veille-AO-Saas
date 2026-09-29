import React, { useState, useEffect } from 'react';
import { useReducedMotion } from 'framer-motion';
import { AvisRadar } from '../../types/radar';
import { genererExemplesAvisRadar, joursRestants } from '../../utils/radarUtils';
import { RadarSvg } from './RadarSvg';
import { AnnonceCard } from './AnnonceCard';
import { useCycleAvis } from '../../hooks/useCycleAvis';
import { api } from '../../services/api';
import { useLangue } from '../../context/LangueContext';

interface RadarContainerProps {
  onSelectAvisProp?: (avis: AvisRadar) => void;
}

export const RadarContainer: React.FC<RadarContainerProps> = ({
  onSelectAvisProp
}) => {
  const { t } = useLangue();
  const shouldReduceMotion = useReducedMotion();

  const [avisList, setAvisList] = useState<AvisRadar[]>(genererExemplesAvisRadar);
  const [isSimulated, setIsSimulated] = useState<boolean>(true);
  const [isHoveredOrFocused, setIsHoveredOrFocused] = useState<boolean>(false);

  // État de pause global : survol/focus ou réduction de mouvement demandée
  const isCyclePaused = isHoveredOrFocused || Boolean(shouldReduceMotion);

  // Hook de défilement automatique (5,5s, top 5 IA)
  const {
    selectedId,
    avisActif,
    selectAvis
  } = useCycleAvis({
    avisList,
    filtre: 'ALL',
    isPaused: isCyclePaused,
    intervalMs: 5500
  });

  // Chargement des données réelles ou de repli
  useEffect(() => {
    let isMounted = true;

    const chargerDonneesRadar = async () => {
      try {
        const res = await api.getPublicRadarTicker();
        if (isMounted && res?.donnees?.blips && res.donnees.blips.length > 0) {
          const avisValides: AvisRadar[] = res.donnees.blips
            .map((item) => {
              const srcUpper = item.sourceNom?.toUpperCase() || '';
              let sourceCanonique: AvisRadar['source'] = 'ARMP';
              if (srcUpper.includes('COLEPS')) sourceCanonique = 'COLEPS';
              else if (srcUpper.includes('ONU') || srcUpper.includes('UN')) sourceCanonique = 'ONU';
              else if (
                item.sourceType === 'INTERNATIONAL_BAILLEURS' ||
                srcUpper.includes('BAILLEUR') ||
                srcUpper.includes('BANQUE') ||
                srcUpper.includes('BAD')
              ) {
                sourceCanonique = 'BAILLEURS';
              }

              let procCanonique: AvisRadar['procedure'] = 'AONO';
              const procUpper = item.typeProcedure?.toUpperCase() || '';
              if (procUpper.includes('AMI')) procCanonique = 'AMI';
              else if (procUpper.includes('AOI') || procUpper.includes('INTERNATIONAL')) procCanonique = 'AOI';

              return {
                id: item.idAO,
                titre: item.titreAO,
                autorite: item.maitreOuvrage,
                region: item.region || 'Cameroun',
                source: sourceCanonique,
                procedure: procCanonique,
                montantFcfa: Number(item.montantEstime) || 0,
                dateLimiteIso: item.dateLimite,
                scoreIa: Number(item.scoreIA) || 0
              };
            })
            .filter((avis) => joursRestants(avis.dateLimiteIso) > 0);

          if (avisValides.length > 0) {
            setAvisList(avisValides);
            setIsSimulated(false);
            return;
          }
        }
      } catch {
        // En cas d'indisponibilité, maintien du jeu d'exemples
      }

      if (isMounted) {
        setAvisList(genererExemplesAvisRadar());
        setIsSimulated(true);
      }
    };

    chargerDonneesRadar();
  }, []);

  const handleSelectAvis = (avis: AvisRadar) => {
    selectAvis(avis);
    onSelectAvisProp?.(avis);
  };

  return (
    <div
      className="w-full flex flex-col items-center relative gap-4"
      onMouseEnter={() => setIsHoveredOrFocused(true)}
      onMouseLeave={() => setIsHoveredOrFocused(false)}
      onFocus={() => setIsHoveredOrFocused(true)}
      onBlur={(e) => {
        // Ne réactiver le cycle que si le focus sort complètement du conteneur
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsHoveredOrFocused(false);
        }
      }}
    >
      {/* Grille responsive : Grand Radar + Carte d'annonce HUD */}
      <div className="w-full flex flex-col sm:flex-row items-center justify-center gap-6 lg:gap-8">
        {/* Grand Radar SVG Animé */}
        <div className="flex flex-col items-center shrink-0">
          <RadarSvg
            avisList={avisList}
            selectedId={selectedId}
            onSelectAvis={handleSelectAvis}
          />
        </div>

        {/* Carte d'annonce sélectionnée (HUD Compact) */}
        <div className="w-full max-w-[340px] flex justify-center shrink-0">
          <AnnonceCard avis={avisActif} />
        </div>
      </div>

      {/* Mention « Exemples illustratifs. » affichée uniquement si données simulées */}
      {isSimulated && (
        <p className="text-center text-[11px] text-discret italic select-none mt-0.5">
          {t('noteIllustratif')}
        </p>
      )}
    </div>
  );
};
