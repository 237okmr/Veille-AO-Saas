import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Building2, MapPin, Sparkles } from 'lucide-react';
import { AvisRadar } from '../../types/radar';
import { useLangue } from '../../context/LangueContext';
import { formatterDateLimite, formatterMontant } from '../../i18n/accueil';
import { categoriePourSource, joursRestants } from '../../utils/radarUtils';

interface AnnonceCardProps {
  avis: AvisRadar | null;
}

export const AnnonceCard: React.FC<AnnonceCardProps> = ({ avis }) => {
  const { langue, t } = useLangue();
  const shouldReduceMotion = useReducedMotion();

  if (!avis) {
    return (
      <div
        aria-live="polite"
        className="w-full max-w-[340px] min-h-[252px] flex items-center justify-center p-3 border border-dashed border-ligne rounded-carte text-discret text-xs"
      >
        Aucun avis sélectionné
      </div>
    );
  }

  const isNational = categoriePourSource(avis.source) === 'national';
  const couleurPastille = isNational ? '#0D9488' : '#0EA5E9';

  // Libellé de la source
  const libelleSource =
    avis.source === 'BAILLEURS'
      ? t('sourceBailleurs')
      : avis.source === 'ONU'
      ? t('sourceOnu')
      : avis.source;

  // Libellé complet de la procédure
  const libelleCompletProcedure =
    avis.procedure === 'AONO'
      ? t('procAONO')
      : avis.procedure === 'AMI'
      ? t('procAMI')
      : t('procAOI');

  // Formatage du score IA
  const scoreFormate =
    langue === 'fr'
      ? `${avis.scoreIa.toFixed(1).replace('.', ',')}/5`
      : `${avis.scoreIa.toFixed(1)}/5`;

  // Formatage du montant
  const uniteMontant = avis.montantFcfa >= 1_000_000_000 ? 'Md' : 'M';
  const valeurNumerique =
    avis.montantFcfa >= 1_000_000_000
      ? Number((avis.montantFcfa / 1_000_000_000).toFixed(1))
      : Math.round(avis.montantFcfa / 1_000_000);
  const montantAffiche = formatterMontant(valeurNumerique, uniteMontant, langue);

  // Formatage de la date limite et délai (Africa/Douala UTC+1)
  const dateFormatee = formatterDateLimite(avis.dateLimiteIso, langue);
  const jours = joursRestants(avis.dateLimiteIso);
  const delaiAffiche =
    jours === 1
      ? t('jourSingulier', { n: 1 })
      : t('jourPluriel', { n: Math.max(0, jours) });

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="w-full max-w-[320px] sm:max-w-[340px] min-h-[252px] relative z-20 flex flex-col justify-center"
    >
      <AnimatePresence mode="wait">
        <motion.article
          key={avis.id}
          initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -8 }}
          transition={{
            duration: shouldReduceMotion ? 0 : 0.4,
            ease: 'easeOut'
          }}
          className="w-full bg-white/95 backdrop-blur-[12px] border border-ligne/80 rounded-carte shadow-hud p-3 sm:p-4 relative z-20 overflow-visible text-encre"
        >
          {/* ================================================================ */}
          {/* 1. LIGNE HAUTE : Source + Procédure (gauche) & Score IA (droite) */}
          {/* ================================================================ */}
          <div className="flex items-center justify-between gap-1.5 mb-2.5">
            {/* Gauche : Source & Procédure */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Étiquette de Source avec pastille colorée */}
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-[10px] sm:text-[11px] font-semibold text-slate-700">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: couleurPastille }}
                  aria-hidden="true"
                />
                <span>{libelleSource}</span>
              </span>

              {/* Étiquette de Procédure avec infobulle au survol / focus */}
              <span
                tabIndex={0}
                title={libelleCompletProcedure}
                aria-label={`${avis.procedure} : ${libelleCompletProcedure}`}
                className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-discret hover:text-encre hover:bg-slate-200/80 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus focus-visible:ring-offset-2 transition-colors cursor-help"
              >
                {avis.procedure}
              </span>
            </div>

            {/* Droite : Badge Score IA (rebond désactivé si mouvement réduit) */}
            <motion.div
              initial={shouldReduceMotion ? { scale: 1 } : { scale: 0.96 }}
              animate={{ scale: 1 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.3, ease: 'easeOut' }}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-ok-fond text-ok font-extrabold text-[10px] sm:text-[11px] shrink-0"
            >
              <Sparkles className="w-2.5 h-2.5 text-ok shrink-0" aria-hidden="true" />
              <span>{`${t('scoreIa')} ${scoreFormate}`}</span>
            </motion.div>
          </div>

          {/* ================================================================ */}
          {/* 2. TITRE OFFICIEL (H2, max 3 lignes, min 2 lignes)               */}
          {/* ================================================================ */}
          <h2 className="font-titre font-bold text-xs sm:text-[0.875rem] leading-snug text-encre line-clamp-3 min-h-[2.5em] mb-2.5">
            {avis.titre}
          </h2>

          {/* ================================================================ */}
          {/* 3. DEUX LIGNES AVEC ICÔNE : Autorité & Région                    */}
          {/* ================================================================ */}
          <div className="space-y-1 text-[11px] sm:text-xs text-discret font-normal mb-3">
            <div className="flex items-center gap-1.5 truncate">
              <Building2 className="w-3.5 h-3.5 text-discret/70 shrink-0" aria-hidden="true" />
              <span className="truncate">{avis.autorite}</span>
            </div>
            <div className="flex items-center gap-1.5 truncate">
              <MapPin className="w-3.5 h-3.5 text-discret/70 shrink-0" aria-hidden="true" />
              <span className="truncate">{avis.region}</span>
            </div>
          </div>

          {/* ================================================================ */}
          {/* 4. PIED DE CARTE : Montant (gauche) & Date Limite (droite)        */}
          {/* ================================================================ */}
          <div className="border-t border-ligne/80 pt-2.5 flex items-baseline justify-between gap-2">
            {/* Montant estimé en gros (rebond désactivé si mouvement réduit) */}
            <motion.div
              initial={shouldReduceMotion ? { scale: 1 } : { scale: 0.96 }}
              animate={{ scale: 1 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.3, ease: 'easeOut' }}
              className="font-titre font-extrabold text-sm sm:text-base text-encre tabular-nums tracking-tight leading-none"
            >
              {montantAffiche}
            </motion.div>

            {/* Date limite et délai relatif */}
            <div className="text-right shrink-0">
              <span className="block text-[9px] sm:text-[10px] font-semibold text-discret uppercase tracking-wider leading-none mb-0.5">
                {t('dateLimite')}
              </span>
              <span className="text-[10px] sm:text-[11px] font-semibold text-encre">
                {`${dateFormatee} · ${delaiAffiche}`}
              </span>
            </div>
          </div>
        </motion.article>
      </AnimatePresence>
    </div>
  );
};
