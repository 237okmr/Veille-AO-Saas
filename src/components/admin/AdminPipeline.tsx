import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { PipelineAction } from '../../types';
import {
  Zap,
  Play,
  RotateCw,
  Terminal,
  ShieldAlert,
  X,
  Activity,
  Layers
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { formaterDateHeureDouala } from '../../utils/dates';

const ACTION_DESCRIPTIONS: Record<string, string> = {
  'routine-nuit': 'Exécute la collecte nocturne des avis ARMP et le matching sémantique avec les profils clients.',
  'routine-matin': 'Prépare et expédie les alertes de marchés publics par email aux clients concernés.',
  'collecte-complete': 'Session quotidienne complète de bout en bout : collecte ARMP, matching sémantique et envoi des alertes.',
  'collecte-armp': 'Interroge le portail officiel ARMP et extrait les derniers avis d\'appel d\'offres publiés.',
  'matching': 'Effectue le scoring et matching sémantique des avis collectés avec les profils entreprises.',
  'envoi-emails': 'Distribue les emails de notification personnalisés aux entreprises pour les marchés pertinents.',
  'validation': 'Vérifie et normalise les avis récemment collectés (dates, montants, régions, lots).',
  'dedup': 'Détecte et élimine les avis ARMP collectés en doublon pour garantir l\'unicité de la base.',
  'audit-sante': 'Analyse l\'efficacité du moteur de matching, distribution des scores et taux de conversion.',
  'purge-cache': 'Vide le cache d\'évaluation sémantique pour forcer la réévaluation fraîche.',
  'audit-dedup': 'Génère un rapport détaillé sur les doublons détectés et l\'intégrité des données.',
  'diagnostic-ia': 'Vérifie la clé API du moteur d\'analyse, les quotas d\'appels, la connectivité et la latence.',
  'fraicheur-profils': 'Vérifie si les profils d\'intérêts des clients nécessitent une mise à jour ou régénération.',
  'migrer-compacts': 'Met à jour et optimise la représentation vectorielle/compacte des critères clients.',
  'backfill-normalisation': 'Re-traite l\'ensemble de l\'historique des avis avec les règles de normalisation actuelles.',
  'nettoyer-dates': 'Détecte et corrige les dates d\'échéance ou de publication invalides ou aberrantes.',
  'dashboard': 'Recalcule les agrégats statistiques globaux du tableau de bord administrateur.'
};

export const AdminPipeline: React.FC = () => {
  const [actions, setActions] = useState<PipelineAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningCode, setRunningCode] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<PipelineAction | null>(null);
  const [executionResult, setExecutionResult] = useState<{
    code: string;
    statut: string;
    dureeExecution: string;
    elementsTraites: string | number;
    details: string;
    timestamp: string;
  } | null>(null);
  const toast = useToast();

  useEffect(() => {
    loadActions();
  }, []);

  const loadActions = async () => {
    setLoading(true);
    try {
      const res = await api.getPipelineActions();
      const raw = res.donnees as any;
      let list: PipelineAction[] = [];

      if (Array.isArray(raw)) {
        list = raw;
      } else if (raw && typeof raw === 'object' && Array.isArray(raw.actions)) {
        list = raw.actions;
      }

      setActions(list);
    } catch (e: any) {
      toast.error('Erreur', e.message);
      setActions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!confirmAction) return;
    const action = confirmAction;
    setConfirmAction(null);
    setRunningCode(action.code);

    try {
      const start = Date.now();
      const res = await api.runPipelineAction(action.code);
      const elapsed = ((Date.now() - start) / 1000).toFixed(2) + 's';

      if (res.donnees) {
        const d = res.donnees as any;
        const durationFormatted = d.dureeMs
          ? `${(d.dureeMs / 1000).toFixed(2)}s`
          : d.dureeExecution || elapsed;

        const actionName = action.nom || action.label || d.label || action.code;
        const detailsMessage =
          d.details ||
          res.message ||
          `Fonction ${d.fonction || action.fonction || 'pipeline'} exécutée avec succès.`;

        setExecutionResult({
          code: d.code || action.code,
          statut: d.statut || (res.succes ? 'SUCCÈS' : 'ERREUR'),
          dureeExecution: durationFormatted,
          elementsTraites: d.elementsTraites ?? (d.retour !== null && d.retour !== undefined ? JSON.stringify(d.retour) : '1 tâche'),
          details: detailsMessage,
          timestamp: new Date().toLocaleTimeString('fr-FR')
        });
        toast.success(`Action « ${actionName} » terminée`, detailsMessage);
        loadActions();
      }
    } catch (err: any) {
      toast.error("Erreur lors de l'exécution", err.message);
    } finally {
      setRunningCode(null);
    }
  };

  const formatDate = (iso?: string) => {
    if (!iso) return 'À la demande';
    const formatted = formaterDateHeureDouala(iso);
    return formatted === '—' ? 'À la demande' : formatted;
  };

  const safeActions = Array.isArray(actions) ? actions : [];

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Layers className="w-5 h-5 text-teal-700 dark:text-teal-400" />
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Actions du Pipeline de Collecte & Ciblage
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Orchestration manuelle de la collecte ARMP, du moteur sémantique de ciblage et de la distribution d'alertes.
          </p>
        </div>

        <button
          onClick={loadActions}
          disabled={loading}
          className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors self-start cursor-pointer disabled:opacity-50"
        >
          <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Actualiser statuts</span>
        </button>
      </div>

      {/* Execution Result Log Terminal */}
      {executionResult && (
        <div className="p-4 rounded-2xl border border-teal-200 dark:border-teal-800/80 bg-slate-950 text-slate-100 shadow-lg space-y-2 animate-in fade-in">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2 text-xs font-mono text-teal-400 font-bold">
              <Terminal className="w-4 h-4" />
              <span>RAPPORT D'EXÉCUTION · [{executionResult.code}]</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400">
              <span>Durée : {executionResult.dureeExecution}</span>
              <span aria-hidden="true">·</span>
              <span>{executionResult.timestamp}</span>
              <button
                onClick={() => setExecutionResult(null)}
                className="text-slate-400 hover:text-white ml-2 cursor-pointer"
                title="Fermer le rapport"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <p className="text-xs font-mono text-emerald-400 leading-relaxed">
            ✓ Statut: {executionResult.statut} | Éléments traités : {executionResult.elementsTraites}
          </p>
          <p className="text-xs font-mono text-slate-300">
            {executionResult.details}
          </p>
        </div>
      )}

      {/* Loading State */}
      {loading && safeActions.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs animate-pulse space-y-4"
            >
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/3"></div>
              <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-full"></div>
              <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-2/3"></div>
              <div className="h-8 bg-slate-100 dark:bg-slate-800 rounded-xl mt-4"></div>
            </div>
          ))}
        </div>
      ) : safeActions.length === 0 ? (
        <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
          <Activity className="w-8 h-8 text-slate-400 mx-auto" />
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
            Aucune action de pipeline disponible
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Toutes les actions système sont synchronisées avec le script Google Apps Script. Cliquez sur Actualiser pour recharger.
          </p>
        </div>
      ) : (
        /* Grid of Pipeline Jobs */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {safeActions.map((act) => {
            const isRunning = runningCode === act.code;
            const actionTitle = act.nom || act.label || act.code;
            const actionDescription = act.description || ACTION_DESCRIPTIONS[act.code] || `Fonction : ${act.fonction || act.label || act.code}`;
            const cadence = act.frequenceEstimee || (act.code.includes('routine') ? 'Quotidien' : 'Manuel');
            const avgDuration = act.dureeMoyenne || '~ 5-15s';

            return (
              <div
                key={act.code}
                className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs flex flex-col justify-between space-y-4 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 border border-teal-200/60 dark:border-teal-800/60">
                        <Zap className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-mono text-[10px] font-bold text-slate-400 uppercase">
                          {act.code}
                        </span>
                        <h3 className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                          {actionTitle}
                        </h3>
                      </div>
                    </div>

                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                      {act.statut || 'DISPONIBLE'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed min-h-[38px]">
                    {actionDescription}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500 font-mono">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase">Dernier run</span>
                      <span className="text-slate-800 dark:text-slate-200 font-semibold">
                        {formatDate(act.dernierLancement)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase">Cadence</span>
                      <span className="text-slate-800 dark:text-slate-200 font-semibold">
                        {cadence}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => setConfirmAction(act)}
                    disabled={isRunning || runningCode !== null}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 transition-colors shadow-2xs disabled:opacity-40 cursor-pointer"
                  >
                    {isRunning ? (
                      <>
                        <RotateCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Exécution en cours...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                        <span>Lancer l'exécution</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CONFIRMATION MODAL */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4 animate-in fade-in">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Confirmer le lancement de l'action
                </h3>
                <p className="text-xs text-slate-500">
                  {confirmAction.nom || confirmAction.label || confirmAction.code}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl">
              Cette opération va déclencher le pipeline en direct via Apps Script. Durée moyenne estimée : <span className="font-mono font-bold">{confirmAction.dureeMoyenne || '~ 5-15s'}</span>.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmAction(null)}
                className="py-2 px-4 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={handleExecute}
                className="py-2 px-5 rounded-xl text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 transition-colors shadow-xs cursor-pointer"
              >
                Exécuter maintenant
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
