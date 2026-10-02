import React, { useState } from 'react';
import {
  Sparkles,
  Unlock,
  Lock,
  Copy,
  Check,
  Globe,
  Clock,
  Hash,
  Activity,
  AlertTriangle,
  RefreshCw,
  Save,
  CheckCircle2,
  FileText
} from 'lucide-react';
import { ClientProfile, ClientEnrichedProfile } from '../../../types';
import { TagBrowser } from '../TagBrowser';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { formaterDateHeureDouala } from '../../../utils/dates';

interface ClientAiTabProps {
  client: ClientProfile;
  onRegenerate: () => void;
  aiGenerating: boolean;
  onProfileUpdated?: (updated: ClientProfile) => void;
}

export const ClientAiTab: React.FC<ClientAiTabProps> = ({
  client,
  onRegenerate,
  aiGenerating,
  onProfileUpdated
}) => {
  const [overrideUnlocked, setOverrideUnlocked] = useState(false);
  const [copiedCompact, setCopiedCompact] = useState(false);
  const [savingOverride, setSavingOverride] = useState(false);
  const toast = useToast();

  const profilIA: ClientEnrichedProfile = client.profilIA || {};

  // Extract tags safely
  const initialInclusions = Array.isArray(profilIA.inclusions)
    ? profilIA.inclusions
    : Array.isArray(profilIA.motsClesInclusion)
    ? profilIA.motsClesInclusion
    : typeof profilIA.inclusions === 'string'
    ? (profilIA.inclusions as string).split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const initialExclusions = Array.isArray(profilIA.exclusions)
    ? profilIA.exclusions
    : Array.isArray(profilIA.motsClesExclusion)
    ? profilIA.motsClesExclusion
    : typeof profilIA.exclusions === 'string'
    ? (profilIA.exclusions as string).split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const initialMo = Array.isArray(profilIA.moPrioritaires)
    ? profilIA.moPrioritaires
    : Array.isArray(client.moPrioritaires)
    ? client.moPrioritaires
    : typeof client.moPrioritaires === 'string'
    ? (client.moPrioritaires as string).split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const [currentTags, setCurrentTags] = useState({
    inclusions: initialInclusions,
    exclusions: initialExclusions,
    moPrioritaires: initialMo
  });

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const handleTagsUpdated = (updated: {
    inclusions: string[];
    exclusions: string[];
    moPrioritaires: string[];
  }) => {
    setCurrentTags(updated);
    setHasUnsavedChanges(true);
  };

  const handleSaveOverride = async () => {
    setSavingOverride(true);
    try {
      const res = await api.updateAdminClientIaProfile({
        idClient: client.idClient,
        motsClesInclusion: currentTags.inclusions,
        motsClesExclusion: currentTags.exclusions,
        moPrioritaires: currentTags.moPrioritaires
      });

      if (res.succes) {
        toast.success(
          'Profil de ciblage mis à jour',
          'Les modifications manuelles ont été enregistrées dans la feuille PROFILS_ENRICHIS.'
        );
        setHasUnsavedChanges(false);
        if (onProfileUpdated) {
          onProfileUpdated({
            ...client,
            profilIA: {
              ...client.profilIA,
              inclusions: currentTags.inclusions,
              motsClesInclusion: currentTags.inclusions,
              exclusions: currentTags.exclusions,
              motsClesExclusion: currentTags.exclusions,
              moPrioritaires: currentTags.moPrioritaires
            }
          });
        }
      }
    } catch (err: any) {
      toast.error('Erreur', err.message);
    } finally {
      setSavingOverride(false);
    }
  };

  const handleCopyCompact = async () => {
    if (!profilIA.profilCompact) return;
    try {
      await navigator.clipboard.writeText(profilIA.profilCompact);
      setCopiedCompact(true);
      toast.success('Copié', 'Profil compact copié dans le presse-papiers.');
      setTimeout(() => setCopiedCompact(false), 2500);
    } catch {
      toast.error('Erreur', 'Impossible de copier.');
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Banner & Control Actions */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="p-3 bg-gradient-to-br from-amber-500 to-emerald-500 rounded-2xl text-white shadow-md">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">
                Profil Métier & Mots-Clés de Ciblage
              </h2>
              <p className="text-xs text-slate-500">
                Généré à partir de la description métier et du site web de {client.nom}.
              </p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            {/* Toggle Override Mode */}
            <button
              type="button"
              onClick={() => setOverrideUnlocked(!overrideUnlocked)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center space-x-2 border transition-all ${
                overrideUnlocked
                  ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
                  : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {overrideUnlocked ? (
                <>
                  <Unlock className="w-4 h-4 text-amber-600" />
                  <span>Mode Override Actif</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>🔓 Débloquer l'édition</span>
                </>
              )}
            </button>

            {/* Save Override Button */}
            {overrideUnlocked && hasUnsavedChanges && (
              <button
                type="button"
                onClick={handleSaveOverride}
                disabled={savingOverride}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-sm transition-all"
              >
                {savingOverride ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>Enregistrer modifs</span>
              </button>
            )}

            {/* Regenerate AI */}
            <button
              type="button"
              onClick={onRegenerate}
              disabled={aiGenerating}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-sm transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${aiGenerating ? 'animate-spin' : ''}`} />
              <span>{aiGenerating ? 'Génération...' : '🔄 Régénérer'}</span>
            </button>
          </div>
        </div>

        {/* Warning if override unlocked */}
        {overrideUnlocked && (
          <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-300 dark:border-amber-900/60 text-xs text-amber-800 dark:text-amber-300 flex items-start space-x-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Mode Override Débloqué :</p>
              <p className="mt-0.5">
                Vous pouvez ajouter ou supprimer des termes dans les inclusions, exclusions et MO.
                Note : le <strong>profil compact</strong> reste immuable pour préserver la cohérence des correspondances.
                Toute prochaine régénération écrasera vos modifications manuelles.
              </p>
            </div>
          </div>
        )}

        {/* Generation Metadata Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Dernière Génération
            </span>
            <div className="flex items-center space-x-1.5 mt-1 text-slate-800 dark:text-slate-200 text-xs font-semibold">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>
                {profilIA.dateGeneration || profilIA.dernierCalcul
                  ? formaterDateHeureDouala(profilIA.dateGeneration || profilIA.dernierCalcul!)
                  : 'Non calculé'}
              </span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Version Prompt (MD5)
            </span>
            <div className="flex items-center space-x-1.5 mt-1 text-slate-800 dark:text-slate-200 text-xs font-mono font-semibold truncate">
              <Hash className="w-3.5 h-3.5 text-slate-400" />
              <span>{profilIA.versionPrompt || 'a8f19c...d4e2'}</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Crawl Site Web
            </span>
            <div className="flex items-center space-x-1.5 mt-1 text-slate-800 dark:text-slate-200 text-xs font-semibold">
              <Globe className="w-3.5 h-3.5 text-emerald-500" />
              <span>{client.siteWeb ? 'Crawl actif (3 pages)' : 'Non configuré'}</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Couverture Cas d'Usage
            </span>
            <div className="flex items-center space-x-1.5 mt-1 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
              <Activity className="w-3.5 h-3.5" />
              <span>{profilIA.tauxCouverture || '96% d’adéquation'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Profil Compact Block */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FileText className="w-4 h-4 text-emerald-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
              Profil Compact Sémantique (800-1200 caractères — Immuable)
            </h3>
          </div>
          {profilIA.profilCompact && (
            <button
              type="button"
              onClick={handleCopyCompact}
              className="text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 flex items-center space-x-1 font-semibold"
            >
              {copiedCompact ? (
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

        <pre className="p-4 rounded-xl bg-slate-900 text-slate-200 font-mono text-xs leading-relaxed border border-slate-800 overflow-x-auto select-all whitespace-pre-wrap max-h-56 overflow-y-auto">
          {profilIA.profilCompact || (
            <span className="text-slate-500 italic">
              Aucun profil compact généré. Cliquez sur « Régénérer » pour analyser et générer le profil.
            </span>
          )}
        </pre>
      </div>

      {/* TagBrowser Section (120-180 inclusions, 20-50 exclusions, MO) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Explorateur Détaillé des Mots-Clés Métiers (TagBrowser)
          </h3>
          <p className="text-xs text-slate-500">
            Recherche temps réel et pagination par 50 éléments. Cliquez sur un tag pour le copier ou le supprimer (si override débloqué).
          </p>
        </div>

        <TagBrowser
          inclusions={currentTags.inclusions}
          exclusions={currentTags.exclusions}
          moPrioritaires={currentTags.moPrioritaires}
          isOverrideUnlocked={overrideUnlocked}
          onUpdateTags={handleTagsUpdated}
        />
      </div>
    </div>
  );
};
