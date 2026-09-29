import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import {
  ClientDashboardStats,
  RegionStat,
  ProcedureStat,
  TimelineStat,
  TopMO,
  TenderAlert,
  SourceFraicheur
} from '../../types';
import {
  Bell,
  CheckCircle2,
  Bookmark,
  Sparkles,
  Calendar,
  Banknote,
  TrendingUp,
  MapPin,
  ArrowRight,
  Building,
  ChevronRight,
  Download,
  AlertCircle,
  Rss
} from 'lucide-react';
import { AlertDetailModal } from './AlertDetailModal';

interface ClientDashboardProps {
  onNavigate: (view: string) => void;
}

export const ClientDashboard: React.FC<ClientDashboardProps> = ({ onNavigate }) => {
  const [stats, setStats] = useState<ClientDashboardStats | null>(null);
  const [regionStats, setRegionStats] = useState<RegionStat[]>([]);
  const [procedureStats, setProcedureStats] = useState<ProcedureStat[]>([]);
  const [timeline, setTimeline] = useState<TimelineStat[]>([]);
  const [topMOs, setTopMOs] = useState<TopMO[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<TenderAlert[]>([]);
  const [sources, setSources] = useState<SourceFraicheur[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAlert, setSelectedAlert] = useState<TenderAlert | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    api.getSources().then((res) => { if (res.donnees) setSources(res.donnees.sources); }).catch(() => {});
    try {
      const [sRes, rRes, pRes, tRes, moRes, aRes] = await Promise.all([
        api.getClientDashboardStats(30),
        api.getStatsByRegion(90),
        api.getStatsByProcedure(90),
        api.getStatsTimeline(30),
        api.getTopMO(90, 5),
        api.getAlerts({ limit: 4, sortBy: 'scoreMatch', sortOrder: 'desc' })
      ]);

      if (sRes.donnees) setStats(sRes.donnees);
      if (rRes.donnees) setRegionStats(Array.isArray(rRes.donnees) ? rRes.donnees : []);
      if (pRes.donnees) setProcedureStats(Array.isArray(pRes.donnees) ? pRes.donnees : []);
      if (tRes.donnees) setTimeline(Array.isArray(tRes.donnees) ? tRes.donnees : []);
      if (moRes.donnees) setTopMOs(Array.isArray(moRes.donnees) ? moRes.donnees : []);
      if (aRes.donnees?.alertes) setRecentAlerts(Array.isArray(aRes.donnees.alertes) ? aRes.donnees.alertes : []);
    } catch (e) {
      console.error('Error loading client dashboard:', e);
    } finally {
      setLoading(false);
    }
  };

  const formatFcfa = (val: number) => {
    if (val >= 1000000000) {
      return (val / 1000000000).toFixed(2) + ' Md FCFA';
    }
    if (val >= 1000000) {
      return (val / 1000000).toFixed(1) + ' M FCFA';
    }
    return new Intl.NumberFormat('fr-FR').format(val) + ' FCFA';
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return iso;
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6 animate-pulse">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-slate-200 dark:bg-slate-800" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-72 rounded-2xl bg-slate-200 dark:bg-slate-800" />
          <div className="h-72 rounded-2xl bg-slate-200 dark:bg-slate-800" />
        </div>
      </div>
    );
  }

  const safeRegionStats = Array.isArray(regionStats) ? regionStats : [];
  const maxRegionCount = Math.max(...safeRegionStats.map((r) => r.count || 0), 1);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner / Welcome - Luminous, Minimalist & Airy */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs relative overflow-hidden">
        <div className="space-y-1.5 relative z-10">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-teal-50 text-teal-800 border border-teal-200/60">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Veille active en temps réel
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Tableau de bord des marchés ciblés
          </h2>
          <p className="text-xs text-slate-600 max-w-xl leading-relaxed">
            Suivi des appels d'offres publics camerounais filtrés selon vos critères métiers et scorés par IA.
          </p>
        </div>
        <button
          onClick={() => onNavigate('client-alerts')}
          className="flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl text-xs font-semibold bg-teal-700 hover:bg-teal-800 text-white transition-all shrink-0 shadow-xs hover:shadow cursor-pointer"
        >
          <span>Consulter toutes les alertes</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Total Alerts */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>Total Alertes</span>
            <Bell className="w-4 h-4 text-teal-600" />
          </div>
          <p className="text-2xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
            {stats?.totalAlertes ?? 0}
          </p>
          <span className="text-[11px] text-slate-500">Marchés détectés</span>
        </div>

        {/* Non lues */}
        <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 shadow-xs">
          <div className="flex items-center justify-between text-xs text-amber-800 dark:text-amber-400 mb-1 font-semibold">
            <span>Non lues</span>
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          </div>
          <p className="text-2xl font-bold font-mono text-amber-700 dark:text-amber-300 tabular-nums">
            {stats?.nonLues ?? 0}
          </p>
          <span className="text-[11px] text-amber-600/80 dark:text-amber-400/70">À examiner</span>
        </div>

        {/* Traitées */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>Traitées</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
            {stats?.traitees ?? 0}
          </p>
          <span className="text-[11px] text-slate-500">Offres soumises</span>
        </div>

        {/* Sauvegardées */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>Sauvegardées</span>
            <Bookmark className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
            {stats?.sauvegardees ?? 0}
          </p>
          <span className="text-[11px] text-slate-500">En cours d'étude</span>
        </div>

        {/* Score Moyen */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>Score Moyen</span>
            <Sparkles className="w-4 h-4 text-teal-600" />
          </div>
          <p className="text-2xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
            {stats?.scoreMoyen ?? 0}%
          </p>
          <span className="text-[11px] text-teal-600 dark:text-teal-400">Pertinence métier</span>
        </div>

        {/* Prochaine Échéance */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>Prochaine Limite</span>
            <Calendar className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
            {stats?.prochaineEcheance ? formatDate(stats.prochaineEcheance) : '12 Oct 2026'}
          </p>
          <span className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold">Dans 15 jours</span>
        </div>
      </div>

      {/* Main Charts & Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Region Distribution Chart */}
        <div className="lg:col-span-2 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Répartition géographique des opportunités
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Nombre d'avis ciblés et montants cumulés par région du Cameroun
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            {regionStats.map((item) => {
              const pct = (item.count / maxRegionCount) * 100;
              return (
                <div key={item.region} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
                      <MapPin className="w-3.5 h-3.5 text-teal-600" />
                      <span>{item.region}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-slate-500 font-mono">
                        {formatFcfa(item.montantTotal)}
                      </span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums w-12 text-right">
                        {item.count} avis
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-teal-700 dark:bg-teal-600 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(pct, item.count > 0 ? 8 : 0)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Breakdown by Procedure */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-4">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Types de procédures
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              AON, AOO, AOI, Demandes de Cotation
            </p>
          </div>

          <div className="space-y-3 pt-2">
            {procedureStats.map((proc) => (
              <div key={proc.procedure} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200">{proc.procedure}</span>
                  <span className="font-mono text-xs font-semibold text-teal-700 dark:text-teal-400">{proc.count} marchés ({proc.percentage}%)</span>
                </div>
                <p className="text-[11px] text-slate-500 truncate">{proc.label}</p>
                <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-amber-500 h-full rounded-full" style={{ width: `${proc.percentage}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Fraîcheur des sources */}
      <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white mb-3">
          <Rss className="w-4 h-4 text-teal-700" />
          <span>Fraîcheur des sources</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {sources.map((s) => (
            <div key={s.plateforme} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-xs">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${s.actif ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                <span className="font-semibold text-slate-700 dark:text-slate-300">{s.plateforme}</span>
              </div>
              <span className="text-slate-400 font-mono text-[10px]">
                {s.derniereExecution || 'Jamais'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Section: Top High-Match Alerts & Top MO */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent High Match Alerts */}
        <div className="lg:col-span-2 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Meilleures correspondances IA récentes
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Avis prioritaires à score élevé nécessitant votre attention
              </p>
            </div>
            <button
              onClick={() => onNavigate('client-alerts')}
              className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline flex items-center gap-1"
            >
              <span>Voir tout</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {recentAlerts.map((alert) => (
              <div
                key={alert.idMatch}
                onClick={() => setSelectedAlert(alert)}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-teal-500/50 dark:hover:border-teal-500/50 bg-white dark:bg-slate-950 transition-all cursor-pointer group shadow-2xs space-y-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="font-mono font-bold text-teal-700 dark:text-teal-400">{alert.idAvis}</span>
                      <span aria-hidden="true">·</span>
                      <span>Région {alert.region}</span>
                      <span aria-hidden="true">·</span>
                      <span>Procédure {alert.procedure}</span>
                    </div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors line-clamp-2">
                      {alert.titre}
                    </h4>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold font-mono bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200 dark:border-teal-800/60">
                      {alert.scoreMatch}% IA
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-500">
                  <div className="flex items-center gap-1.5 truncate max-w-sm">
                    <Building className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">{alert.maitreOuvrage}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-200">
                      {formatFcfa(alert.montantEstime)}
                    </span>
                    <span className="text-amber-600 dark:text-amber-400 font-medium">
                      Limite : {formatDate(alert.dateLimite)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Maîtres d'Ouvrage */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-4">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Top Maîtres d'Ouvrage ciblés
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Autorités contractantes les plus actives
            </p>
          </div>

          <div className="space-y-3 pt-1">
            {topMOs.map((mo, idx) => (
              <div key={mo.nom} className="flex items-start justify-between gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-bold flex items-center justify-center shrink-0">
                    0{idx + 1}
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white leading-tight">
                      {mo.nom}
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                      {formatFcfa(mo.montantCumule)}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold text-teal-700 dark:text-teal-400 shrink-0">
                  {mo.avisCount} avis
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tender Modal */}
      {selectedAlert && (
        <AlertDetailModal
          alert={selectedAlert}
          onClose={() => setSelectedAlert(null)}
          onUpdate={(updated) => {
            setSelectedAlert(updated);
            setRecentAlerts((prev) => prev.map((a) => (a.idMatch === updated.idMatch ? updated : a)));
          }}
        />
      )}
    </div>
  );
};
