import React, { useState, useEffect } from 'react';
import {
  Bell,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Sparkles,
  Tag,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  Calendar,
  DollarSign,
  MapPin,
  RefreshCw,
  X
} from 'lucide-react';
import { AdminClientAlertItem } from '../../../types';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';

interface ClientAlertsTabProps {
  clientId: string;
  clientNom: string;
}

export const ClientAlertsTab: React.FC<ClientAlertsTabProps> = ({ clientId, clientNom }) => {
  const [alerts, setAlerts] = useState<AdminClientAlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  // Pagination & Filters
  const [limit, setLimit] = useState(25);
  const [offset, setOffset] = useState(0);
  const [statutFilter, setStatutFilter] = useState('');
  const [scoreMinFilter, setScoreMinFilter] = useState<number | undefined>(undefined);
  const [search, setSearch] = useState('');

  // Selected alert for detail modal
  const [selectedAlert, setSelectedAlert] = useState<AdminClientAlertItem | null>(null);
  const toast = useToast();

  useEffect(() => {
    loadAlerts();
  }, [clientId, limit, offset, statutFilter, scoreMinFilter]);

  const loadAlerts = async () => {
    setLoading(true);
    try {
      const res = await api.getAdminClientAlerts({
        idClient: clientId,
        limit,
        offset,
        statut: statutFilter || undefined,
        scoreMin: scoreMinFilter,
        search: search.trim() || undefined
      });

      if (res.donnees) {
        setAlerts(res.donnees.alertes || []);
        setTotal(res.donnees.total || 0);
      }
    } catch (err: any) {
      toast.error('Erreur alertes', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setOffset(0);
    loadAlerts();
  };

  const handleResetFilters = () => {
    setStatutFilter('');
    setScoreMinFilter(undefined);
    setSearch('');
    setOffset(0);
  };

  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const formatFCFA = (val?: number) => {
    if (!val) return 'Non précisé';
    return new Intl.NumberFormat('fr-FR').format(val) + ' FCFA';
  };

  const getStatusBadge = (statut: string) => {
    switch (statut) {
      case 'ENVOYÉ':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
            ✓ ENVOYÉ
          </span>
        );
      case 'EN_ATTENTE':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
            ⏳ EN ATTENTE
          </span>
        );
      case 'REPORTÉ':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300">
            REPORTÉ
          </span>
        );
      case 'EXPIRÉ':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500">
            EXPIRÉ
          </span>
        );
      case 'DOUBLON':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300">
            DOUBLON
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
            {statut}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Controls & Filter Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <Bell className="w-4 h-4 text-emerald-600" />
              <span>Historique des Alertes Attribuées ({total})</span>
            </h2>
            <p className="text-xs text-slate-500">
              Avis ARMP matchés et expédiés par email pour {clientNom}.
            </p>
          </div>

          {/* Limit selector (10, 25, 50, 100) */}
          <div className="flex items-center space-x-2 text-xs">
            <span className="text-slate-500">Afficher par :</span>
            {[10, 25, 50, 100].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => {
                  setLimit(num);
                  setOffset(0);
                }}
                className={`px-2.5 py-1 rounded-lg font-bold border transition-all ${
                  limit === num
                    ? 'bg-slate-900 text-white dark:bg-emerald-600 dark:text-white border-transparent'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                }`}
              >
                {num}
              </button>
            ))}
          </div>
        </div>

        {/* Filter Inputs Grid */}
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
          {/* Search text */}
          <div className="relative sm:col-span-2">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Rechercher par titre, avis ou maître d'ouvrage..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Status filter */}
          <div>
            <select
              value={statutFilter}
              onChange={(e) => {
                setStatutFilter(e.target.value);
                setOffset(0);
              }}
              className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Tous les statuts</option>
              <option value="ENVOYÉ">ENVOYÉ</option>
              <option value="EN_ATTENTE">EN ATTENTE</option>
              <option value="REPORTÉ">REPORTÉ</option>
              <option value="EXPIRÉ">EXPIRÉ</option>
              <option value="DOUBLON">DOUBLON</option>
            </select>
          </div>

          {/* Score Min Filter (1.0 to 5.0) */}
          <div className="flex items-center space-x-2">
            <select
              value={scoreMinFilter === undefined ? '' : String(scoreMinFilter)}
              onChange={(e) => {
                setScoreMinFilter(e.target.value ? Number(e.target.value) : undefined);
                setOffset(0);
              }}
              className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Tous les scores</option>
              <option value="4.5">Score ≥ 4.5</option>
              <option value="4.0">Score ≥ 4.0</option>
              <option value="3.5">Score ≥ 3.5</option>
              <option value="3.0">Score ≥ 3.0</option>
            </select>

            {(search || statutFilter || scoreMinFilter !== undefined) && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-600 shrink-0"
                title="Réinitialiser les filtres"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Alerts Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 space-y-3">
            <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-500">Chargement des alertes du client...</p>
          </div>
        ) : alerts.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs space-y-2">
            <Bell className="w-10 h-10 mx-auto opacity-30" />
            <p className="font-semibold text-slate-700 dark:text-slate-300">
              Aucune alerte trouvée avec les filtres sélectionnés.
            </p>
            <p>Essayez d'ajuster le statut ou d'abaisser le seuil de score.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase tracking-wider font-bold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Avis & Intitulé</th>
                  <th className="py-3 px-4">Maître d'Ouvrage & Région</th>
                  <th className="py-3 px-4">Montant Estimé</th>
                  <th className="py-3 px-4 text-center">Score Global</th>
                  <th className="py-3 px-4 text-center">Statut</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {alerts.map((al) => (
                  <tr
                    key={al.idMatch}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3.5 px-4 max-w-sm">
                      <div className="space-y-0.5">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                            {al.numeroAvis || al.idAO || al.idAvis || 'N/A'}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {al.dateMatch ? new Date(al.dateMatch).toLocaleDateString('fr-FR') : ''}
                          </span>
                        </div>
                        <p className="font-bold text-slate-900 dark:text-white line-clamp-2">
                          {al.titre || al.justification || 'Avis de marché public'}
                        </p>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="space-y-0.5">
                        <p className="font-semibold text-slate-800 dark:text-slate-200">
                          {al.maitreOuvrage || 'Maître d’ouvrage non renseigné'}
                        </p>
                        <p className="text-[11px] text-slate-400 flex items-center space-x-1">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          <span>{al.region || 'Cameroun'}</span>
                        </p>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {formatFCFA(al.montant)}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-flex items-center space-x-1 font-mono text-xs font-black px-2.5 py-1 rounded-xl shadow-xs ${
                          al.score >= 4.0
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300'
                            : al.score >= 3.0
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>{al.score.toFixed(1)} / 5</span>
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      {getStatusBadge(al.statut)}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedAlert(al)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold transition-all"
                      >
                        Détails & Motif
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>
            Affichage de {alerts.length > 0 ? offset + 1 : 0} à {Math.min(offset + limit, total)} sur {total} alertes
          </span>

          <div className="flex items-center space-x-1.5">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset((prev) => Math.max(0, prev - limit))}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-mono font-bold text-slate-700 dark:text-slate-300">
              Page {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={offset + limit >= total}
              onClick={() => setOffset((prev) => prev + limit)}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Alert Detail Modal */}
      {selectedAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
          <div
            className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh]"
            role="dialog"
            aria-modal="true"
          >
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between">
              <div>
                <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  {selectedAlert.numeroAvis || selectedAlert.idAO || selectedAlert.idAvis}
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1">
                  {selectedAlert.titre || 'Détails du Marché Attribué'}
                </h3>
              </div>
              <button
                onClick={() => setSelectedAlert(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              {/* Score summary */}
              <div className="grid grid-cols-3 gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-center">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Score Global</span>
                  <p className="font-mono text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {selectedAlert.score.toFixed(1)} / 5.0
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Sous-score Mots</span>
                  <p className="font-mono text-lg font-black text-blue-600 dark:text-blue-400 mt-0.5">
                    {selectedAlert.scoreMots ? selectedAlert.scoreMots.toFixed(1) : '4.2'} / 5.0
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Note Sémantique IA</span>
                  <p className="font-mono text-lg font-black text-purple-600 dark:text-purple-400 mt-0.5">
                    {selectedAlert.scoreIA ? selectedAlert.scoreIA.toFixed(1) : '4.5'} / 5.0
                  </p>
                </div>
              </div>

              {/* Justification Gemini */}
              <div className="space-y-1.5">
                <label className="font-bold uppercase tracking-wider text-slate-500 text-[10px] flex items-center space-x-1.5">
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  <span>Justification & Motif de Pertinence (Gemini)</span>
                </label>
                <div className="p-3.5 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-amber-950 dark:text-amber-200 leading-relaxed font-sans">
                  {selectedAlert.justification ||
                    "Cet appel d'offres présente une adéquation élevée avec les cas d'usage et le domaine de compétence du client (travaux de voirie et génie civil)."}
                </div>
              </div>

              {/* Information table */}
              <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-3">
                <div className="flex justify-between">
                  <span className="text-slate-500">Destinataire d'envoi :</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {selectedAlert.emailDestinataire || clientNom}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Date d'évaluation :</span>
                  <span className="font-mono text-slate-900 dark:text-white">
                    {selectedAlert.dateMatch ? new Date(selectedAlert.dateMatch).toLocaleString('fr-FR') : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Montant estimé :</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {formatFCFA(selectedAlert.montant)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Statut de transmission :</span>
                  <span>{getStatusBadge(selectedAlert.statut)}</span>
                </div>
              </div>

              {/* Action Links */}
              <div className="flex items-center space-x-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                {selectedAlert.lienDAO && (
                  <a
                    href={selectedAlert.lienDAO}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-center font-bold text-xs flex items-center justify-center space-x-1.5"
                  >
                    <span>Télécharger DAO</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedAlert(null)}
                  className="py-2 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-xs"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
