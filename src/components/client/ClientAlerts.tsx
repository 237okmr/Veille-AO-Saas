import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import {
  TenderAlert,
  AlertCounts,
  AlertFilterOptions,
  SavedSearch,
  CAMEROON_REGIONS,
  CAMEROON_PROCEDURES
} from '../../types';
import {
  Search,
  Filter,
  Download,
  Building,
  MapPin,
  Calendar,
  Sparkles,
  Bookmark,
  BookmarkPlus,
  CheckCircle,
  XCircle,
  EyeOff,
  Clock,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  RotateCcw,
  FileSpreadsheet,
  Archive,
  X
} from 'lucide-react';
import { AlertDetailModal } from './AlertDetailModal';
import { useToast } from '../../context/ToastContext';
import { formaterDateDouala } from '../../utils/dates';

export const ClientAlerts: React.FC = () => {
  const [alerts, setAlerts] = useState<TenderAlert[]>([]);
  const [counts, setCounts] = useState<AlertCounts | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedAlert, setSelectedAlert] = useState<TenderAlert | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showExpired, setShowExpired] = useState(false);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const toast = useToast();

  // Filter states
  const [search, setSearch] = useState('');
  const [selectedState, setSelectedState] = useState<string>('');
  const [selectedRegion, setSelectedRegion] = useState<string>('');
  const [selectedProcedure, setSelectedProcedure] = useState<string>('');
  const [scoreMin, setScoreMin] = useState<number>(0);
  const [onlyUnread, setOnlyUnread] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<string>('datePublication');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const limit = 10;

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const filters: AlertFilterOptions = {
        limit,
        offset: (page - 1) * limit,
        sortBy,
        sortOrder
      };
      filters.expire = showExpired ? 'OUI' : 'NON';
      if (search) filters.search = search;
      if (selectedState) filters.etat = selectedState;
      if (selectedRegion) filters.region = selectedRegion;
      if (selectedProcedure) filters.procedure = selectedProcedure;
      if (scoreMin > 0) filters.scoreMin = scoreMin;
      if (onlyUnread) filters.lu = 'false';

      const [alertsRes, countsRes] = await Promise.all([
        api.getAlerts(filters),
        api.getAlertCounts()
      ]);

      if (alertsRes.donnees) {
        setAlerts(Array.isArray(alertsRes.donnees.alertes) ? alertsRes.donnees.alertes : []);
        setTotal(alertsRes.donnees.total || 0);
      }
      if (countsRes.donnees) {
        setCounts(countsRes.donnees);
      }
    } catch (e: any) {
      toast.error('Erreur', e.message || 'Impossible de charger les alertes');
    } finally {
      setLoading(false);
    }
  }, [page, limit, sortBy, sortOrder, search, selectedState, selectedRegion, selectedProcedure, scoreMin, onlyUnread, showExpired, toast]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  useEffect(() => {
    api.getSavedSearches()
      .then((res) => setSavedSearches(res.donnees?.recherches || []))
      .catch(() => {});
  }, []);

  const handleApplySavedSearch = (s: SavedSearch) => {
    const f = s.filtres || {};
    setSearch(f.search || '');
    setSelectedState(f.etat || '');
    setSelectedRegion(f.region || '');
    setSelectedProcedure(f.procedure || '');
    setScoreMin(Number(f.scoreMin) || 0);
    setOnlyUnread(f.lu === 'false');
    setShowExpired(f.expire === 'OUI');
    if (f.sortBy) setSortBy(f.sortBy);
    if (f.sortOrder) setSortOrder(f.sortOrder);
    setPage(1);
    toast.success('Recherche appliquée', s.nom);
  };

  const handleSaveCurrentSearch = async () => {
    const nom = window.prompt('Nom de cette recherche sauvegardée (visible par toute votre équipe) :');
    if (!nom || !nom.trim()) return;

    const filtres: AlertFilterOptions = {};
    if (search) filtres.search = search;
    if (selectedState) filtres.etat = selectedState;
    if (selectedRegion) filtres.region = selectedRegion;
    if (selectedProcedure) filtres.procedure = selectedProcedure;
    if (scoreMin > 0) filtres.scoreMin = scoreMin;
    if (onlyUnread) filtres.lu = 'false';
    if (showExpired) filtres.expire = 'OUI';
    if (sortBy) filtres.sortBy = sortBy;
    if (sortOrder) filtres.sortOrder = sortOrder;

    if (Object.keys(filtres).length === 0) {
      toast.error('Aucun filtre actif', 'Appliquez au moins un filtre avant de sauvegarder une recherche.');
      return;
    }

    try {
      const res = await api.createSavedSearch({ nom: nom.trim(), filtres });
      if (res.donnees) {
        setSavedSearches((prev) => [res.donnees as SavedSearch, ...prev]);
        toast.success('Recherche sauvegardée', nom.trim());
      }
    } catch (err: any) {
      toast.error('Erreur', err.message);
    }
  };

  const handleDeactivateSavedSearch = async (s: SavedSearch, ev: React.MouseEvent) => {
    ev.stopPropagation();
    try {
      await api.toggleSavedSearch({ idRecherche: s.idRecherche, actif: 'NON' });
      setSavedSearches((prev) => prev.filter((x) => x.idRecherche !== s.idRecherche));
    } catch (err: any) {
      toast.error('Erreur', err.message);
    }
  };

  const handleResetFilters = () => {
    setSearch('');
    setSelectedState('');
    setSelectedRegion('');
    setSelectedProcedure('');
    setScoreMin(0);
    setOnlyUnread(false);
    setSortBy('datePublication');
    setSortOrder('desc');
    setPage(1);
  };

  const handleFastStateChange = async (alert: TenderAlert, newState: TenderAlert['etat'], e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await api.markAlert({ idMatch: alert.idMatch, etat: newState });
      if (res.donnees) {
        setAlerts((prev) => prev.map((a) => (a.idMatch === alert.idMatch ? res.donnees : a)));
        toast.success(`Alerte mise à jour (${newState})`);
        const c = await api.getAlertCounts();
        if (c.donnees) setCounts(c.donnees);
      }
    } catch (err: any) {
      toast.error('Erreur', err.message);
    }
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const res = await api.exportAlerts({
        search: search || undefined,
        etat: selectedState || undefined,
        region: selectedRegion || undefined,
        procedure: selectedProcedure || undefined,
        scoreMin: scoreMin > 0 ? scoreMin : undefined
      });

      if (res.donnees?.contenu) {
        const blob = new Blob([res.donnees.contenu], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', res.donnees.nomFichier || 'alertes-cameroun.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Export CSV généré avec succès', `${res.donnees.count} avis exportés`);
      }
    } catch (err: any) {
      toast.error("Erreur lors de l'export", err.message);
    } finally {
      setExporting(false);
    }
  };

  const formatFcfa = (val: number) => {
    return new Intl.NumberFormat('fr-FR').format(val) + ' FCFA';
  };

  const formatDate = (iso: string) => {
    return formaterDateDouala(iso);
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Header & Fast Counter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Mes Alertes Appels d'Offres
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Avis de marchés publics camerounais filtrés et scorés pour votre entreprise
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowExpired((v) => !v)}
            className={`flex items-center gap-2 py-2 px-4 rounded-xl text-xs font-semibold border transition-colors ${
              showExpired
                ? 'bg-slate-800 text-white border-slate-800'
                : 'text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Archive className="w-4 h-4" />
            <span>{showExpired ? 'Voir les avis actifs' : 'Voir les avis expirés'}</span>
          </button>

          <button
            onClick={handleExportCsv}
            disabled={exporting}
            className="flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-semibold text-teal-800 dark:text-teal-200 border border-teal-300 dark:border-teal-700 bg-teal-50/60 dark:bg-teal-950/40 hover:bg-teal-100 dark:hover:bg-teal-900/60 transition-colors shadow-2xs cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-teal-700 dark:text-teal-400" />
            <span>{exporting ? 'Génération...' : 'Exporter en CSV'}</span>
          </button>
        </div>
      </div>

      {/* State Filter Pills / Tabs */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
        <button
          onClick={() => {
            setSelectedState('');
            setPage(1);
          }}
          className={`flex items-center gap-2 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors ${
            selectedState === ''
              ? 'bg-teal-700 text-white font-semibold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <span>Toutes les alertes</span>
          <span className="text-[11px] opacity-80 tabular-nums">({counts?.total ?? 0})</span>
        </button>

        <button
          onClick={() => {
            setSelectedState('NOUVEAU');
            setPage(1);
          }}
          className={`flex items-center gap-2 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors ${
            selectedState === 'NOUVEAU'
              ? 'bg-teal-700 text-white font-semibold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <span>Nouveaux</span>
          <span className="text-[11px] opacity-80 tabular-nums">({counts?.nouveaux ?? 0})</span>
        </button>

        <button
          onClick={() => {
            setSelectedState('SAUVEGARDE');
            setPage(1);
          }}
          className={`flex items-center gap-2 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors ${
            selectedState === 'SAUVEGARDE'
              ? 'bg-teal-700 text-white font-semibold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <span>Sauvegardés</span>
          <span className="text-[11px] opacity-80 tabular-nums">({counts?.sauvegardes ?? 0})</span>
        </button>

        <button
          onClick={() => {
            setSelectedState('TRAITE');
            setPage(1);
          }}
          className={`flex items-center gap-2 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors ${
            selectedState === 'TRAITE'
              ? 'bg-teal-700 text-white font-semibold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <span>Traités</span>
          <span className="text-[11px] opacity-80 tabular-nums">({counts?.traites ?? 0})</span>
        </button>

        <button
          onClick={() => {
            setSelectedState('IGNORE');
            setPage(1);
          }}
          className={`flex items-center gap-2 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors ${
            selectedState === 'IGNORE'
              ? 'bg-teal-700 text-white font-semibold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <span>Ignorés</span>
          <span className="text-[11px] opacity-80 tabular-nums">({counts?.ignores ?? 0})</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Recherche (titre, MO, réf)..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600/30 focus:border-teal-600 transition-colors"
            />
          </div>

          {/* Region Select */}
          <div>
            <select
              value={selectedRegion}
              onChange={(e) => {
                setSelectedRegion(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600/30 focus:border-teal-600 transition-colors"
            >
              <option value="">Toutes les régions (10)</option>
              {CAMEROON_REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* Procedure Select */}
          <div>
            <select
              value={selectedProcedure}
              onChange={(e) => {
                setSelectedProcedure(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600/30 focus:border-teal-600 transition-colors"
            >
              <option value="">Toutes les procédures</option>
              {CAMEROON_PROCEDURES.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.code} - {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Sort By */}
          <div>
            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [sb, so] = e.target.value.split('-');
                setSortBy(sb);
                setSortOrder(so as 'asc' | 'desc');
                setPage(1);
              }}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600/30 focus:border-teal-600 transition-colors"
            >
              <option value="datePublication-desc">Plus récents d'abord</option>
              <option value="scoreMatch-desc">Score IA le plus élevé</option>
              <option value="dateLimite-asc">Date limite la plus proche</option>
            </select>
          </div>
        </div>

        {/* Second Row: Min score slider & Unread checkbox & reset */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div className="flex items-center gap-3">
            <span className="text-slate-500">Score IA minimum :</span>
            <input
              type="range"
              min="0"
              max="95"
              step="5"
              value={scoreMin}
              onChange={(e) => {
                setScoreMin(Number(e.target.value));
                setPage(1);
              }}
              className="w-28 accent-teal-600"
            />
            <span className="font-mono font-bold text-teal-700 dark:text-teal-400 tabular-nums">
              {scoreMin}%
            </span>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={onlyUnread}
                onChange={(e) => {
                  setOnlyUnread(e.target.checked);
                  setPage(1);
                }}
                className="rounded text-teal-600 focus:ring-teal-500"
              />
              <span>Non lues uniquement</span>
            </label>

            {(search || selectedState || selectedRegion || selectedProcedure || scoreMin > 0 || onlyUnread) && (
              <button
                onClick={handleResetFilters}
                className="flex items-center gap-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Réinitialiser les filtres</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Recherches sauvegardées (chantier C) — raccourcis de filtres partagés par client */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleSaveCurrentSearch}
          className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold text-teal-700 dark:text-teal-300 border border-dashed border-teal-300 dark:border-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/40 transition-colors"
        >
          <BookmarkPlus className="w-3.5 h-3.5" />
          <span>Sauvegarder cette recherche</span>
        </button>

        {savedSearches.map((s) => (
          <button
            key={s.idRecherche}
            onClick={() => handleApplySavedSearch(s)}
            className="group flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            title={`Créée par ${s.creeParEmail}`}
          >
            <span>{s.nom}</span>
            <X
              className="w-3 h-3 text-slate-400 group-hover:text-rose-500"
              onClick={(ev) => handleDeactivateSavedSearch(s, ev)}
            />
          </button>
        ))}
      </div>

      {/* Alerts List */}
      {loading ? (
        <div className="space-y-4 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-36 rounded-2xl bg-slate-200 dark:bg-slate-800" />
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Aucun appel d'offres ne correspond à vos critères de recherche.
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Essayez d'élargir vos filtres régionaux, de réduire le score minimal ou de réinitialiser la recherche.
          </p>
          <button
            onClick={handleResetFilters}
            className="py-2 px-4 rounded-xl text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 transition-colors"
          >
            Réinitialiser les filtres
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div
              key={alert.idMatch}
              onClick={() => setSelectedAlert(alert)}
              className={`p-5 rounded-2xl border transition-all cursor-pointer group shadow-2xs space-y-3 ${
                alert.lu
                  ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-teal-500/50'
                  : 'border-teal-300 dark:border-teal-800 bg-teal-50/20 dark:bg-teal-950/20 hover:border-teal-600 ring-1 ring-teal-500/20'
              }`}
            >
              {/* Header row */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-1 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono font-bold text-teal-700 dark:text-teal-400">
                      {alert.idAvis}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span>{alert.region}</span>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Procédure {alert.procedure}</span>
                    {!alert.lu && (
                      <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-white">
                        NOUVEAU
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors">
                    {alert.titre}
                  </h3>
                </div>

                {/* Score badge */}
                <div className="flex items-center gap-2 shrink-0">
                  {alert.decision === 'GO' && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      <CheckCircle className="w-3 h-3" />
                      GO
                    </span>
                  )}
                  {alert.decision === 'NOGO' && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                      <XCircle className="w-3 h-3" />
                      NO-GO
                    </span>
                  )}
                  <div className="text-right">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold font-mono bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                      <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                      <span>{alert.scoreMatch}% IA</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* AI Justification Snippet */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                <span className="font-semibold text-slate-800 dark:text-slate-200">Justification IA : </span>
                <span>{alert.justificationIA}</span>
              </div>

              {/* Bottom metadata & Quick Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                <div className="flex flex-wrap items-center gap-4 text-slate-500 dark:text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-medium text-slate-700 dark:text-slate-300">{alert.maitreOuvrage}</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono font-bold text-slate-900 dark:text-slate-200">
                    <span>{formatFcfa(alert.montantEstime)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Dépôt limite : {formatDate(alert.dateLimite)}</span>
                  </div>
                </div>

                {/* State switch buttons */}
                <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={(e) => handleFastStateChange(alert, 'SAUVEGARDE', e)}
                    className={`p-1.5 rounded-lg border transition-colors ${
                      alert.etat === 'SAUVEGARDE'
                        ? 'border-amber-400 bg-amber-50 text-amber-600 dark:bg-amber-950/50'
                        : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:text-amber-500'
                    }`}
                    title="Sauvegarder l'alerte"
                  >
                    <Bookmark className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleFastStateChange(alert, 'TRAITE', e)}
                    className={`p-1.5 rounded-lg border transition-colors ${
                      alert.etat === 'TRAITE'
                        ? 'border-emerald-400 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50'
                        : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:text-emerald-500'
                    }`}
                    title="Marquer comme traité"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleFastStateChange(alert, 'IGNORE', e)}
                    className={`p-1.5 rounded-lg border transition-colors ${
                      alert.etat === 'IGNORE'
                        ? 'border-slate-400 bg-slate-100 text-slate-600 dark:bg-slate-800'
                        : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-600'
                    }`}
                    title="Ignorer cette alerte"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedAlert(alert)}
                    className="ml-2 py-1 px-2.5 rounded-lg text-xs font-semibold bg-teal-700 text-white hover:bg-teal-800 transition-colors"
                  >
                    Consulter
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800 text-xs">
          <p className="text-slate-500">
            Affichage de {(page - 1) * limit + 1} à {Math.min(page * limit, total)} sur {total} alertes
          </p>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-semibold text-slate-900 dark:text-white tabular-nums">
              Page {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedAlert && (
        <AlertDetailModal
          alert={selectedAlert}
          onClose={() => setSelectedAlert(null)}
          onUpdate={(updated) => {
            setSelectedAlert(updated);
            setAlerts((prev) => prev.map((a) => (a.idMatch === updated.idMatch ? updated : a)));
          }}
        />
      )}
    </div>
  );
};
