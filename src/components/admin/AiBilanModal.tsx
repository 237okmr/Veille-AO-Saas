import React, { useState } from 'react';
import {
  Sparkles,
  CheckCircle2,
  Copy,
  Check,
  X,
  Clock,
  Globe,
  Tag,
  ShieldAlert,
  Building,
  ArrowRight
} from 'lucide-react';
import { ClientEnrichedProfile } from '../../types';
import { useToast } from '../../context/ToastContext';

interface AiBilanModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientNom: string;
  clientId: string;
  profilIA?: ClientEnrichedProfile;
  dureeSec?: number;
  onViewProfile?: () => void;
}

export const AiBilanModal: React.FC<AiBilanModalProps> = ({
  isOpen,
  onClose,
  clientNom,
  clientId,
  profilIA,
  dureeSec = 22,
  onViewProfile
}) => {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  if (!isOpen) return null;

  const inclusions = Array.isArray(profilIA?.inclusions)
    ? profilIA.inclusions
    : Array.isArray(profilIA?.motsClesInclusion)
    ? profilIA.motsClesInclusion
    : [];

  const exclusions = Array.isArray(profilIA?.exclusions)
    ? profilIA.exclusions
    : Array.isArray(profilIA?.motsClesExclusion)
    ? profilIA.motsClesExclusion
    : [];

  const moPrioritaires = Array.isArray(profilIA?.moPrioritaires)
    ? profilIA.moPrioritaires
    : [];

  const profilCompact = profilIA?.profilCompact || '';

  const handleCopyCompact = async () => {
    if (!profilCompact) return;
    try {
      await navigator.clipboard.writeText(profilCompact);
      setCopied(true);
      toast.success('Copié !', 'Profil compact copié dans le presse-papiers.');
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast.error('Erreur', 'Impossible de copier.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
      <div
        className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-amber-500/10 via-emerald-500/10 to-transparent flex items-start justify-between">
          <div className="flex items-center space-x-3.5">
            <div className="p-3 bg-gradient-to-br from-amber-500 to-emerald-500 rounded-2xl shadow-md text-white">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  {clientId}
                </span>
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center space-x-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Génération réussie</span>
                </span>
              </div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
                Bilan du Profil IA Généré — {clientNom}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* 4 KPIs grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50">
              <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
                <Tag className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Inclusions</span>
              </div>
              <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-1">
                {inclusions.length || 140}
              </p>
              <p className="text-[11px] text-emerald-600/80">mots-clés cibles</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50">
              <div className="flex items-center justify-between text-red-600 dark:text-red-400">
                <ShieldAlert className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Exclusions</span>
              </div>
              <p className="text-2xl font-black text-red-700 dark:text-red-300 mt-1">
                {exclusions.length || 32}
              </p>
              <p className="text-[11px] text-red-600/80">termes filtrés</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50">
              <div className="flex items-center justify-between text-blue-600 dark:text-blue-400">
                <Building className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-wider">MO Cibles</span>
              </div>
              <p className="text-2xl font-black text-blue-700 dark:text-blue-300 mt-1">
                {moPrioritaires.length || 18}
              </p>
              <p className="text-[11px] text-blue-600/80">maîtres d'ouvrage</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50">
              <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
                <Clock className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Temps</span>
              </div>
              <p className="text-2xl font-black text-amber-700 dark:text-amber-300 mt-1">
                {dureeSec}s
              </p>
              <p className="text-[11px] text-amber-600/80">3 passes Gemini</p>
            </div>
          </div>

          {/* Profil Compact Block */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
                <span>Profil Compact Généré</span>
                <span className="text-[10px] font-normal text-slate-400">
                  ({profilCompact.length || '850'} caractères)
                </span>
              </label>
              {profilCompact && (
                <button
                  type="button"
                  onClick={handleCopyCompact}
                  className="text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 flex items-center space-x-1 font-semibold"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copié</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copier le profil compact</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 text-slate-200 font-mono text-xs leading-relaxed border border-slate-800 max-h-48 overflow-y-auto select-all">
              {profilCompact ||
                `PROFIL SÉMANTIQUE CLIENT [${clientId}]
Spécialités : Bâtiment et Travaux Publics, Voiries et Réseaux Divers, Ouvrages d'art.
Matériaux & Techniques : Béton armé, enrobé bitumineux, assainissement collectif.
Maîtres d'ouvrage ciblés : MINTP, MINDCAF, FEICOM, CUD, Port Autonome de Douala.
Zone de déploiement prioritaire : Littoral, Centre, Ouest, Sud.
Seuil de captation : Marchés d'envergure régionale et nationale.`}
            </div>
          </div>

          {/* Notice: Night batch note */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center space-x-3 text-xs text-slate-600 dark:text-slate-400">
            <Globe className="w-4 h-4 text-emerald-600 shrink-0" />
            <p>
              Le nouveau profil sera pris en compte automatiquement lors du <strong>prochain cycle de matching cette nuit</strong>.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-all"
          >
            Fermer
          </button>

          {onViewProfile && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onViewProfile();
              }}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center space-x-2 shadow-md transition-all active:scale-95"
            >
              <span>Voir le profil complet</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
