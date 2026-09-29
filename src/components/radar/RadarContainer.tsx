import React, { useState, useEffect, useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';
import { AvisRadar } from '../../types/radar';
import { genererExemplesAvisRadar, joursRestants, categoriePourSource } from '../../utils/radarUtils';
import { RadarSvg } from './RadarSvg';
import { AnnonceCard } from './AnnonceCard';
import { RadarFilterBar } from './RadarFilterBar';
import { useCycleAvis, TypeFiltreRadar } from '../../hooks/useCycleAvis';
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

  const [filtre, setFiltre] = useState<TypeFiltreRadar>('ALL');
  const [isManualPaused, setIsManualPaused] = useState<boolean>(false);
  const [isHoveredOrFocused, setIsHoveredOrFocused] = useState<boolean>(false);

  // État de pause global : pause manuelle, survol/focus, ou réduction de mouvement demandée
  const isCyclePaused = isManualPaused || isHoveredOrFocused || Boolean(shouldReduceMotion);

  // Hook de défilement automatique (5,5s, top 5 IA)
  const {
    selectedId,
    avisActif,
    selectAvis
  } = useCycleAvis({
    avisList,
    filtre,
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

  // Décompte par filtre pour les puces
  const { countTous, countNational, countInternational } = useMemo(() => {
    let nat = 0;
    let inter = 0;
    avisList.forEach((a) => {
      const cat = categoriePourSource(a.source);
      if (cat === 'national') nat++;
      else if (cat === 'international') inter++;
    });
    return {
      countTous: avisList.length,
      countNational: nat,
      countInternational: inter
    };
  }, [avisList]);

  // Fonction de filtrage pour le radar
  const estFiltre = (avis: AvisRadar) => {
    if (filtre === 'ALL') return true;
    const cat = categoriePourSource(avis.source);
    if (filtre === 'NATIONAL') return cat === 'national';
    if (filtre === 'INTERNATIONAL') return cat === 'international';
    return true;
  };

  const handleSelectAvis = (avis: AvisRadar) => {
    selectAvis(avis);
    onSelectAvisProp?.(avis);
  };

  return (
    <div
      className="w-full flex flex-col items-center justify-center relative my-auto gap-3"
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
      {/* 1. Barre de filtres & bouton de pause */}
      <div className="w-full max-w-[820px] px-2">
        <RadarFilterBar
          filtreActif={filtre}
          onSelectFiltre={setFiltre}
          isManualPaused={isManualPaused}
          onTogglePause={() => setIsManualPaused((prev) => !prev)}
          countTous={countTous}
          countNational={countNational}
          countInternational={countInternational}
        />
      </div>

      {/* 2. Grille responsive : Grand Radar + Carte d'annonce HUD */}
      <div className="w-full flex flex-col lg:flex-row items-center justify-around xl:justify-center gap-6 xl:gap-10">
        {/* Grand Radar SVG Animé */}
        <div className="flex flex-col items-center shrink-0">
          <RadarSvg
            avisList={avisList}
            selectedId={selectedId}
            onSelectAvis={handleSelectAvis}
            estFiltre={estFiltre}
          />
        </div>

        {/* Carte d'annonce sélectionnée (HUD Compact) */}
        <div className="w-full max-w-[340px] flex justify-center shrink-0">
          <AnnonceCard avis={avisActif} />
        </div>
      </div>

      {/* 3. Mention « Exemples illustratifs. » affichée uniquement si données simulées (masquée sous 700px) */}
      {isSimulated && (
        <p className="text-center text-[11px] text-discret italic select-none mt-1 hide-on-short-screen">
          {t('noteIllustratif')}
        </p>
      )}
    </div>
  );
};
