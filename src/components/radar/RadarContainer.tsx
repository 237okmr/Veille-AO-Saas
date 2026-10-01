import React, { useState, useEffect } from 'react';
import { useReducedMotion } from 'framer-motion';
import { AvisRadar } from '../../types/radar';
import { genererExemplesAvisRadar, deduireSourceCanonique } from '../../utils/radarUtils';
import { parserDateLimite, estExpiree } from '../../utils/dates';
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

  // État initial sans saut visuel : liste vide et état de chargement actif
  const [avisList, setAvisList] = useState<AvisRadar[]>([]);
  const [isChargement, setIsChargement] = useState<boolean>(true);
  const [isSimulated, setIsSimulated] = useState<boolean>(true);
  const [isHoveredOrFocused, setIsHoveredOrFocused] = useState<boolean>(false);

  // État de pause global : survol/focus ou réduction de mouvement demandée
  const isCyclePaused = isHoveredOrFocused || Boolean(shouldReduceMotion) || isChargement;

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

  // Chargement unique des données réelles ou de repli
  useEffect(() => {
    let isMounted = true;

    const chargerDonneesRadar = async () => {
      try {
        const res = await api.getPublicRadarTicker();
        const isSimule = res?.donnees?.simulation === true;

        // Condition stricte : succès, non simulé par le backend, et présence d'avis
        if (
          isMounted &&
          res?.succes &&
          !isSimule &&
          res.donnees?.blips &&
          res.donnees.blips.length > 0
        ) {
          const avisValides: AvisRadar[] = res.donnees.blips
            .map((item) => {
              const sourceCanonique = deduireSourceCanonique(item.sourceNom, item.sourceType);

              let procCanonique: AvisRadar['procedure'] = 'AONO';
              const procUpper = item.typeProcedure?.toUpperCase() || '';
              if (procUpper.includes('AMI') || procUpper.includes('ASMI')) procCanonique = 'AMI';
              else if (procUpper.includes('AOI') || procUpper.includes('INTERNATIONAL')) procCanonique = 'AOI';

              const isNumValide =
                typeof item.montantEstime === 'number' &&
                Number.isFinite(item.montantEstime) &&
                item.montantEstime > 0;
              const montantFcfa = isNumValide ? item.montantEstime : null;

              const montantTexte =
                item.montantTexte &&
                typeof item.montantTexte === 'string' &&
                item.montantTexte.trim() !== ''
                  ? item.montantTexte.trim()
                  : null;

              return {
                id: item.idAO,
                titre: item.titreAO,
                autorite: item.maitreOuvrage,
                region: item.region || 'Cameroun',
                source: sourceCanonique,
                procedure: procCanonique,
                montantFcfa,
                montantTexte,
                dateLimiteIso: item.dateLimite,
                scoreIa: Number(item.scoreIA) || 0
              };
            })
            .filter((avis) => {
              const parsed = parserDateLimite(avis.dateLimiteIso);
              return parsed !== null && !estExpiree(avis.dateLimiteIso);
            });

          if (avisValides.length > 0) {
            setAvisList(avisValides);
            setIsSimulated(false);
            setIsChargement(false);
            return;
          }
        }
      } catch {
        // En cas d'erreur ou d'indisponibilité, bascule vers le jeu d'exemples
      }

      if (isMounted) {
        setAvisList(genererExemplesAvisRadar());
        setIsSimulated(true);
        setIsChargement(false);
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
        {/* Grand Radar SVG Animé (Pendant le chargement : structure complète sans points) */}
        <div className="flex flex-col items-center shrink-0">
          <RadarSvg
            avisList={isChargement ? [] : avisList}
            selectedId={selectedId}
            onSelectAvis={handleSelectAvis}
          />
        </div>

        {/* Emplacement Carte d'annonce sélectionnée (HUD Compact ou Squelette de chargement) */}
        <div className="w-full max-w-[340px] flex justify-center shrink-0">
          {isChargement ? (
            <div
              aria-busy="true"
              aria-label="Chargement des avis…"
              className="w-full max-w-[340px] min-h-[252px] bg-white/95 border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div
                    className={`h-5 w-24 bg-slate-200 rounded-full ${
                      shouldReduceMotion ? '' : 'motion-safe:animate-pulse'
                    }`}
                  />
                  <div
                    className={`h-5 w-16 bg-slate-200 rounded-full ${
                      shouldReduceMotion ? '' : 'motion-safe:animate-pulse'
                    }`}
                  />
                </div>
                <div
                  className={`h-4 w-full bg-slate-200 rounded ${
                    shouldReduceMotion ? '' : 'motion-safe:animate-pulse'
                  }`}
                />
                <div
                  className={`h-4 w-3/4 bg-slate-200 rounded ${
                    shouldReduceMotion ? '' : 'motion-safe:animate-pulse'
                  }`}
                />
                <div className="pt-2 space-y-2">
                  <div
                    className={`h-3 w-1/2 bg-slate-200 rounded ${
                      shouldReduceMotion ? '' : 'motion-safe:animate-pulse'
                    }`}
                  />
                  <div
                    className={`h-3 w-2/3 bg-slate-200 rounded ${
                      shouldReduceMotion ? '' : 'motion-safe:animate-pulse'
                    }`}
                  />
                </div>
              </div>
              <div className="flex items-center justify-center pt-3 border-t border-ligne">
                <span className="text-xs text-discret font-medium">
                  Chargement des avis…
                </span>
              </div>
            </div>
          ) : (
            <AnnonceCard avis={avisActif} />
          )}
        </div>
      </div>

      {/* Mention « Exemples illustratifs. » affichée UNIQUEMENT si données simulées/d'exemple */}
      {!isChargement && isSimulated && (
        <p className="text-center text-[11px] text-discret italic select-none mt-0.5">
          {t('noteIllustratif')}
        </p>
      )}
    </div>
  );
};
