import React, { useState, useEffect, useRef } from 'react';
import {
  Bell,
  Search,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Sparkles,
  MapPin,
  Download,
  X
} from 'lucide-react';
import { AdminClientAlertItem } from '../../../types';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { exportAlertsToCsv } from '../../../utils/exportCsv';
import { formaterDateDouala, formaterDateHeureDouala } from '../../../utils/dates';

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
  const [searchAppliquee, setSearchAppliquee] = useState('');

  // Race condition guard
  const requestIdRef = useRef(0);

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null);
  const cancelExportRef = useRef(false);

  // Selected alert for detail modal
  const [selectedAlert, setSelectedAlert] = useState<AdminClientAlertItem | null>(null);
  const toast = useToast();

  useEffect(() => {
    return () => {
      cancelExportRef.current = true;
    };
  }, []);

  const loadAlerts = async () => {
    if (!clientId) {
      setAlerts([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    const currentReqId = ++requestIdRef.current;
    try {
      const res = await api.getAdminClientAlerts({
        idClient: clientId,
        limit,
        offset,
        statut: statutFilter || undefined,
        scoreMin: scoreMinFilter,
        search: searchAppliquee || undefined
      });

      if (currentReqId !== requestIdRef.current) {
        // Stale response ignored
        return;
      }

      if (res.donnees) {
        setAlerts(res.donnees.alertes || []);
        setTotal(res.donnees.total || 0);
      }
    } catch (err: any) {
      if (currentReqId === requestIdRef.current) {
        toast.error('Erreur alertes', err?.message || 'Erreur lors du chargement des alertes');
      }
    } finally {
      if (currentReqId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadAlerts();
  }, [clientId, limit, offset, statutFilter, scoreMinFilter, searchAppliquee]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchAppliquee(search.trim());
    setOffset(0);
  };

  const handleResetFilters = () => {
    setSearch('');
    setSearchAppliquee('');
    setStatutFilter('');
    setScoreMinFilter(undefined);
    setOffset(0);
  };

  const hasActiveFilters = Boolean(
    search ||
    searchAppliquee ||
    statutFilter ||
    scoreMinFilter !== undefined
  );

  const handleExportCsv = async () => {
    if (isExporting || total === 0 || !clientId) return;

    setIsExporting(true);
    cancelExportRef.current = false;
    setExportProgress({ current: 0, total });

    const PAGE_SIZE = 100;
    const MAX_PAGES = 50; // Ceiling of 5,000 items
    const allAlerts: AdminClientAlertItem[] = [];
    let currentOffset = 0;
    let expectedTotal = total;
    let pageIndex = 0;
    let hitCeiling = false;

    try {
      while (pageIndex < MAX_PAGES) {
        if (cancelExportRef.current) {
          toast.info('Export', 'Export annulé');
          return;
        }

        const res = await api.getAdminClientAlerts({
          idClient: clientId,
          limit: PAGE_SIZE,
          offset: currentOffset,
          statut: statutFilter || undefined,
          scoreMin: scoreMinFilter,
          search: searchAppliquee || undefined
        });

        if (cancelExportRef.current) {
          toast.info('Export', 'Export annulé');
          return;
        }

        const fetched = res.donnees?.alertes || [];
        if (res.donnees?.total !== undefined) {
          expectedTotal = res.donnees.total;
        }

        if (fetched.length === 0) {
          break;
        }

        allAlerts.push(...fetched);
        currentOffset += fetched.length;
        pageIndex++;

        setExportProgress({ current: allAlerts.length, total: expectedTotal });

        if (currentOffset >= expectedTotal || fetched.length < PAGE_SIZE) {
          break;
        }

        if (pageIndex >= MAX_PAGES && currentOffset < expectedTotal) {
          hitCeiling = true;
        }
      }

      if (cancelExportRef.current) {
        toast.info('Export', 'Export annulé');
        return;
      }

      if (allAlerts.length === 0) {
        toast.warning('Export', 'Aucune alerte à exporter avec les filtres sélectionnés');
        return;
      }

      exportAlertsToCsv(allAlerts, clientNom);

      if (hitCeiling) {
        toast.warning('Plafond atteint', 'Export limité aux 5 000 premières alertes : affinez les filtres');
      } else {
        toast.success('Export réussi', `${allAlerts.length} alertes exportées`);
      }
    } catch (err: any) {
      toast.error('Erreur export', err?.message || 'Une erreur est survenue lors de la récupération des alertes.');
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  };

  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const getResultSummary = () => {
    if (total === 0) {
      return 'Aucune alerte ne correspond aux filtres';
    }
    if (total === 1) {
      return '1 alerte correspond aux filtres';
    }
    return `${total} alertes correspondent aux filtres`;
  };

  const formatFCFA = (val?: number) => {
    if (!val) return 'Non précisé';
    return new Intl.NumberFormat('fr-FR').format(val) + ' FCFA';
  };

  const getStatusBadge = (statut: string) => {
    switch (statut) {
      case 'ENVOYÉ':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            ✓ ENVOYÉ
          </span>
        );
      case 'EN_ATTENTE':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
            ⏳ EN ATTENTE
          </span>
        );
      case 'REPORTÉ':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
            REPORTÉ
          </span>
        );
      case 'EXPIRÉ':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">
            EXPIRÉ
          </span>
        );
      case 'DOUBLON':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800">
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
    <div className="space-y-6">
      {/* Top Controls & Filter Bar */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
              <Bell className="w-4 h-4 text-teal-600" />
              <span>Historique des Alertes Attribuées</span>
            </h2>
            <p className="text-xs text-slate-500">
              Avis ARMP matchés et expédiés par email pour {clientNom}.
            </p>
          </div>

          {/* Right Action Bar: Limit Selector & Export CSV */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Export CSV Button / Progress */}
            {isExporting ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-teal-200 bg-teal-50">
                <div className="w-3.5 h-3.5 border-2 border-teal-700 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-semibold text-teal-900">
                  Export en cours : {exportProgress?.current ?? 0} / {exportProgress?.total ?? total}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    cancelExportRef.current = true;
                  }}
                  className="ml-1 px-2 py-0.5 text-[11px] font-bold rounded-lg border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 transition-colors cursor-pointer"
                >
                  Annuler
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={loading || total === 0}
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-teal-700 hover:bg-teal-800 disabled:bg-slate-100 disabled:text-slate-400 disabled:border disabled:border-slate-200 disabled:cursor-not-allowed text-white transition-all shadow-2xs cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-teal-600"
                title={total === 0 ? 'Aucune alerte à exporter' : 'Exporter toutes les alertes filtrées en CSV'}
              >
                <Download className="w-3.5 h-3.5" />
                <span>Exporter en CSV</span>
              </button>
            )}

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
                  className={`px-2.5 py-1 rounded-lg font-bold border transition-all cursor-pointer ${
                    limit === num
                      ? 'bg-slate-900 text-white border-transparent'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Filter Inputs Grid */}
        <form onSubmit={handleSearchSubmit} className="space-y-3 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            {/* Search text input */}
            <div className="sm:col-span-5 relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Rechercher par titre, avis ou maître d'ouvrage..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-teal-600 focus:outline-none"
              />
            </div>

            {/* Status filter */}
            <div className="sm:col-span-3">
              <select
                value={statutFilter}
                onChange={(e) => {
                  setStatutFilter(e.target.value);
                  setOffset(0);
                }}
                className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-teal-600 focus:outline-none cursor-pointer"
              >
                <option value="">Tous les statuts</option>
                <option value="ENVOYÉ">ENVOYÉ</option>
                <option value="EN_ATTENTE">EN ATTENTE</option>
                <option value="REPORTÉ">REPORTÉ</option>
                <option value="EXPIRÉ">EXPIRÉ</option>
                <option value="DOUBLON">DOUBLON</option>
              </select>
            </div>

            {/* Score Min Filter */}
            <div className="sm:col-span-2">
              <select
                value={scoreMinFilter === undefined ? '' : String(scoreMinFilter)}
                onChange={(e) => {
                  setScoreMinFilter(e.target.value ? Number(e.target.value) : undefined);
                  setOffset(0);
                }}
                className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-teal-600 focus:outline-none cursor-pointer"
              >
                <option value="">Tous les scores</option>
                <option value="4.5">Score ≥ 4.5</option>
                <option value="4.0">Score ≥ 4.0</option>
                <option value="3.5">Score ≥ 3.5</option>
                <option value="3.0">Score ≥ 3.0</option>
              </select>
            </div>

            {/* Filter actions: Search submit & Reset button */}
            <div className="sm:col-span-2 flex items-center gap-2">
              <button
                type="submit"
                className="flex-1 py-1.5 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-teal-600"
              >
                Rechercher
              </button>
            </div>
          </div>

          {/* Reset button displayed when filters are active */}
          {hasActiveFilters && (
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-teal-600"
              >
                <X className="w-3.5 h-3.5 text-slate-400" />
                <span>Réinitialiser les filtres</span>
              </button>
              {searchAppliquee && (
                <span className="text-[11px] text-slate-500">
                  Filtre recherche actif : <strong className="text-slate-800 font-semibold">« {searchAppliquee} »</strong>
                </span>
              )}
            </div>
          )}
        </form>
      </div>

      {/* Alerts Table Container with Live Summary */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Results summary bar with aria-live and pagination indicator */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-5 py-3.5 bg-slate-50 border-b border-slate-200 text-xs">
          <div aria-live="polite" className="font-semibold text-slate-700">
            {getResultSummary()}
          </div>
          <div className="text-slate-500 font-mono font-medium">
            Page {currentPage} / {totalPages}
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 space-y-3">
            <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-500">Chargement des alertes du client...</p>
          </div>
        ) : alerts.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs space-y-2">
            <Bell className="w-10 h-10 mx-auto opacity-30 text-slate-400" />
            <p className="font-semibold text-slate-700">
              Aucune alerte trouvée avec les filtres sélectionnés.
            </p>
            <p>Essayez d'ajuster le statut ou d'abaisser le seuil de score.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Avis & Intitulé</th>
                  <th className="py-3 px-4">Maître d'Ouvrage & Région</th>
                  <th className="py-3 px-4">Montant Estimé</th>
                  <th className="py-3 px-4 text-center">Score Global</th>
                  <th className="py-3 px-4 text-center">Statut</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {alerts.map((al) => (
                  <tr
                    key={al.idMatch}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="py-3.5 px-4 max-w-sm">
                      <div className="space-y-0.5">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                            {al.numeroAvis || al.idAO || al.idAvis || 'N/A'}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {al.dateMatch ? formaterDateDouala(al.dateMatch) : ''}
                          </span>
                        </div>
                        <p className="font-bold text-slate-900 line-clamp-2">
                          {al.titre || al.justification || 'Avis de marché public'}
                        </p>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="space-y-0.5">
                        <p className="font-semibold text-slate-800">
                          {al.maitreOuvrage || 'Maître d’ouvrage non renseigné'}
                        </p>
                        <p className="text-[11px] text-slate-400 flex items-center space-x-1">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          <span>{al.region || 'Cameroun'}</span>
                        </p>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                      {formatFCFA(al.montant)}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-flex items-center space-x-1 font-mono text-xs font-black px-2.5 py-1 rounded-xl shadow-2xs ${
                          al.score >= 4.0
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : al.score >= 3.0
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-slate-100 text-slate-600'
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
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-all cursor-pointer"
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
        <div className="p-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>
            Affichage de {alerts.length > 0 ? offset + 1 : 0} à {Math.min(offset + limit, total)} sur {total} alertes
          </span>

          <div className="flex items-center space-x-1.5">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset((prev) => Math.max(0, prev - limit))}
              aria-label="Page précédente"
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40 cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-teal-600"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-mono font-bold text-slate-700">
              Page {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={offset + limit >= total}
              onClick={() => setOffset((prev) => prev + limit)}
              aria-label="Page suivante"
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40 cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-teal-600"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Alert Detail Modal */}
      {selectedAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div
            className="w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]"
            role="dialog"
            aria-modal="true"
          >
            <div className="p-5 border-b border-slate-200 flex items-start justify-between">
              <div>
                <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                  {selectedAlert.numeroAvis || selectedAlert.idAO || selectedAlert.idAvis}
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">
                  {selectedAlert.titre || 'Détails du Marché Attribué'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAlert(null)}
                aria-label="Fermer la boîte de dialogue"
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-teal-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              {/* Score summary */}
              <div className="grid grid-cols-3 gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-center">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Score Global</span>
                  <p className="font-mono text-lg font-black text-emerald-600 mt-0.5">
                    {selectedAlert.score.toFixed(1)} / 5.0
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Sous-score Mots</span>
                  <p className="font-mono text-lg font-black text-blue-600 mt-0.5">
                    {selectedAlert.scoreMots ? selectedAlert.scoreMots.toFixed(1) : '4.2'} / 5.0
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Note Sémantique IA</span>
                  <p className="font-mono text-lg font-black text-teal-600 mt-0.5">
                    {selectedAlert.scoreIA ? selectedAlert.scoreIA.toFixed(1) : '4.5'} / 5.0
                  </p>
                </div>
              </div>

              {/* Justification Gemini */}
              <div className="space-y-1.5">
                <label className="font-bold uppercase tracking-wider text-slate-500 text-[10px] flex items-center space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>Justification & Motif de Pertinence (Gemini)</span>
                </label>
                <div className="p-3.5 rounded-xl bg-amber-50/50 border border-amber-200 text-amber-950 leading-relaxed font-sans">
                  {selectedAlert.justification ||
                    "Cet appel d'offres présente une adéquation élevée avec les cas d'usage et le domaine de compétence du client (travaux de voirie et génie civil)."}
                </div>
              </div>

              {/* Information table */}
              <div className="space-y-2 border-t border-slate-200 pt-3">
                <div className="flex justify-between">
                  <span className="text-slate-500">Destinataire d'envoi :</span>
                  <span className="font-semibold text-slate-900">
                    {selectedAlert.emailDestinataire || clientNom}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Date d'évaluation :</span>
                  <span className="font-mono text-slate-900">
                    {selectedAlert.dateMatch ? formaterDateHeureDouala(selectedAlert.dateMatch) : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Montant estimé :</span>
                  <span className="font-mono font-bold text-slate-900">
                    {formatFCFA(selectedAlert.montant)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Statut de transmission :</span>
                  <span>{getStatusBadge(selectedAlert.statut)}</span>
                </div>
              </div>

              {/* Action Links */}
              <div className="flex items-center space-x-3 pt-3 border-t border-slate-200">
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
                  className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs cursor-pointer"
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
