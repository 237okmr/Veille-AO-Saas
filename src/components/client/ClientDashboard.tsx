import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
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
  MapPin,
  ArrowRight,
  Building,
  ChevronRight,
  ChevronDown,
  Rss,
  BarChart3
} from 'lucide-react';
import { PageHeader } from '../ui/PageHeader';
import { KpiCard } from '../ui/KpiCard';
import { Button } from '../ui/Button';
import { AlertDetailModal } from './AlertDetailModal';
import { AujourdhuiBloc } from './AujourdhuiBloc';
import { joursRestants } from '../../utils/radarUtils';

/**
 * Constante regroupant tous les textes fixes de la page
 * pour faciliter une future localisation ou personnalisation.
 */
const TEXTES = {
  headerTitreAvecNom: (prenom: string) => `Bonjour ${prenom}, voici ce qui demande votre attention`,
  headerTitreSansNom: 'Bonjour, voici ce qui demande votre attention',
  headerDescription: 'Votre veille du jour, mise à jour à chaque collecte.',
  headerActionToutesAlertes: 'Consulter toutes les alertes',
  headerVeilleActive: 'Veille active en temps réel',

  kpiNonLues: 'Non lues',
  kpiNonLuesSousTexte: 'À examiner',
  kpiTraitees: 'Traitées',
  kpiTraiteesSousTexte: 'Alertes traitées',
  kpiSauvegardees: 'Sauvegardées',
  kpiSauvegardeesSousTexte: 'À étudier',
  kpiScoreMoyen: 'Score moyen',
  kpiScoreMoyenSousTexte: 'Pertinence pour votre activité',
  kpiProchaineEcheance: 'Prochaine échéance',
  kpiAucuneEcheance: 'Aucune échéance à venir',
  kpiAujourdhui: "aujourd'hui",
  kpiDansUnJour: 'dans 1 jour',
  kpiDansNJours: (n: number) => `dans ${n} jours`,

  sourcesTitre: 'Fraîcheur des sources',
  sourcesJamais: 'Jamais',

  analysesTitre: 'Analyses détaillées',
  analysesSousTitre: 'Répartition territoriale, types de marchés et maîtres d’ouvrage ciblés',
  regionTitre: 'Répartition géographique des opportunités',
  regionSousTitre: "Nombre d'avis ciblés et montants cumulés par région du Cameroun",
  regionAvisCount: (n: number) => `${n} avis`,
  procedureTitre: 'Types de procédures',
  procedureSousTitre: 'AON, AOO, AOI, Demandes de Cotation',
  procedureCount: (count: number, pct: number) => `${count} marchés (${pct}%)`,
  iaRecentesTitre: 'Meilleures correspondances IA récentes',
  iaRecentesSousTitre: 'Avis prioritaires à score élevé nécessitant votre attention',
  iaRecentesVoirTout: 'Voir tout',
  topMoTitre: "Top Maîtres d'Ouvrage ciblés",
  topMoSousTitre: 'Autorités contractantes les plus actives',
  topMoAvisCount: (n: number) => `${n} avis`
};

interface ClientDashboardProps {
  onNavigate: (view: string) => void;
}

export const ClientDashboard: React.FC<ClientDashboardProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [stats, setStats] = useState<ClientDashboardStats | null>(null);
  const [regionStats, setRegionStats] = useState<RegionStat[]>([]);
  const [procedureStats, setProcedureStats] = useState<ProcedureStat[]>([]);
  const [timeline, setTimeline] = useState<TimelineStat[]>([]);
  const [topMOs, setTopMOs] = useState<TopMO[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<TenderAlert[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<TenderAlert[]>([]);
  const [sources, setSources] = useState<SourceFraicheur[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAlert, setSelectedAlert] = useState<TenderAlert | null>(null);

  // Valeur calculée une seule fois au montage pour l'ouverture par défaut du volet
  const [isDesktop] = useState(() => (typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true));

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    api.getSources().then((res) => { if (res.donnees) setSources(res.donnees.sources); }).catch(() => {});
    try {
      const [sRes, rRes, pRes, tRes, moRes, aRes, todayAlertsRes] = await Promise.all([
        api.getClientDashboardStats(30),
        api.getStatsByRegion(90),
        api.getStatsByProcedure(90),
        api.getStatsTimeline(30),
        api.getTopMO(90, 5),
        api.getAlerts({ limit: 4, sortBy: 'scoreMatch', sortOrder: 'desc' }),
        api.getAlerts({ expire: 'NON', sortBy: 'deadline', sortOrder: 'asc', limit: 50 })
      ]);

      if (sRes.donnees) setStats(sRes.donnees);
      if (rRes.donnees) setRegionStats(Array.isArray(rRes.donnees) ? rRes.donnees : []);
      if (pRes.donnees) setProcedureStats(Array.isArray(pRes.donnees) ? pRes.donnees : []);
      if (tRes.donnees) setTimeline(Array.isArray(tRes.donnees) ? tRes.donnees : []);
      if (moRes.donnees) setTopMOs(Array.isArray(moRes.donnees) ? moRes.donnees : []);
      if (aRes.donnees?.alertes) setRecentAlerts(Array.isArray(aRes.donnees.alertes) ? aRes.donnees.alertes : []);
      if (todayAlertsRes.donnees?.alertes) setActiveAlerts(Array.isArray(todayAlertsRes.donnees.alertes) ? todayAlertsRes.donnees.alertes : []);
    } catch (e) {
      console.error('Error loading client dashboard:', e);
    } finally {
      setLoading(false);
    }
  };

  // (a) Échéances à surveiller : GO ou SAUVEGARDE, délai restant <= 14 jours, tri croissant par deadline
  const echeances = useMemo(() => {
    return activeAlerts
      .filter((a) => {
        const isEligible = a.decision === 'GO' || a.etat === 'SAUVEGARDE';
        if (!isEligible) return false;
        const jr = joursRestants(a.dateLimite);
        return jr <= 14;
      })
      .sort((a, b) => {
        const jrA = joursRestants(a.dateLimite);
        const jrB = joursRestants(b.dateLimite);
        if (jrA !== jrB) return jrA - jrB;
        const timeA = a.dateLimite ? new Date(a.dateLimite).getTime() : 0;
        const timeB = b.dateLimite ? new Date(b.dateLimite).getTime() : 0;
        return timeA - timeB;
      });
  }, [activeAlerts]);

  // (b) À décider : NOUVEAU ou non lue, décision absente ou EN_ATTENTE, tri décroissant par score
  const aDecider = useMemo(() => {
    return activeAlerts
      .filter((a) => {
        const isNewOrUnread = a.etat === 'NOUVEAU' || !a.lu;
        const noDecision = !a.decision || a.decision === 'EN_ATTENTE';
        return isNewOrUnread && noDecision;
      })
      .sort((a, b) => (b.scoreMatch ?? 0) - (a.scoreMatch ?? 0));
  }, [activeAlerts]);

  const formatFcfa = (val: number) => {
    if (!val) return '0 FCFA';
    if (val >= 1000000000) {
      return (val / 1000000000).toFixed(2) + ' Md FCFA';
    }
    if (val >= 1000000) {
      return (val / 1000000).toFixed(1) + ' M FCFA';
    }
    return new Intl.NumberFormat('fr-FR').format(val) + ' FCFA';
  };

  const formatDateDouala = (iso: string) => {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return new Intl.DateTimeFormat('fr-FR', {
        timeZone: 'Africa/Douala',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      }).format(d);
    } catch {
      return iso;
    }
  };

  // Calcul honnête et dynamique de la prochaine échéance
  const prochainDelai = useMemo(() => {
    if (!stats?.prochaineEcheance) {
      return {
        valeur: TEXTES.kpiAucuneEcheance,
        sousTexte: undefined,
        ton: 'neutre' as const
      };
    }
    const jr = joursRestants(stats.prochaineEcheance);
    const dateStr = formatDateDouala(stats.prochaineEcheance);
    let sousTexte = TEXTES.kpiDansNJours(jr);
    if (jr === 0) sousTexte = TEXTES.kpiAujourdhui;
    else if (jr === 1) sousTexte = TEXTES.kpiDansUnJour;

    return {
      valeur: dateStr,
      sousTexte,
      ton: (jr <= 3 ? 'attention' : 'neutre') as 'attention' | 'neutre'
    };
  }, [stats?.prochaineEcheance]);

  // Prénom de l'utilisateur extrait proprement
  const prenom = user?.nom ? user.nom.trim().split(/\s+/)[0] : '';
  const titreHeader = prenom ? TEXTES.headerTitreAvecNom(prenom) : TEXTES.headerTitreSansNom;

  const safeRegionStats = Array.isArray(regionStats) ? regionStats : [];
  const maxRegionCount = Math.max(...safeRegionStats.map((r) => r.count || 0), 1);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* 1. Bandeau d'accueil PageHeader */}
      <PageHeader
        titre={titreHeader}
        description={TEXTES.headerDescription}
        actions={
          <Button
            variante="primaire"
            taille="md"
            iconeDroite={ArrowRight}
            onClick={() => onNavigate('client-alerts')}
          >
            {TEXTES.headerActionToutesAlertes}
          </Button>
        }
      />

      {/* 2. Bloc « À faire aujourd'hui » */}
      <AujourdhuiBloc
        loading={loading}
        echeances={echeances}
        aDecider={aDecider}
        onSelectAlert={(alert) => setSelectedAlert(alert)}
        onNavigate={onNavigate}
      />

      {/* 3. Grille des 5 Indicateurs KpiCard (2 col mobile, 3 tablette, 5 desktop) */}
      <section aria-label="Indicateurs clés" className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          {/* Non lues */}
          <KpiCard
            label={TEXTES.kpiNonLues}
            valeur={stats?.nonLues ?? 0}
            sousTexte={TEXTES.kpiNonLuesSousTexte}
            tonSousTexte="attention"
            icone={Bell}
            onClick={() => onNavigate('client-alerts')}
            chargement={loading}
            ariaLabel={`${TEXTES.kpiNonLues} : ${stats?.nonLues ?? 0}`}
          />

          {/* Traitées */}
          <KpiCard
            label={TEXTES.kpiTraitees}
            valeur={stats?.traitees ?? 0}
            sousTexte={TEXTES.kpiTraiteesSousTexte}
            tonSousTexte="ok"
            icone={CheckCircle2}
            chargement={loading}
          />

          {/* Sauvegardées */}
          <KpiCard
            label={TEXTES.kpiSauvegardees}
            valeur={stats?.sauvegardees ?? 0}
            sousTexte={TEXTES.kpiSauvegardeesSousTexte}
            tonSousTexte="neutre"
            icone={Bookmark}
            chargement={loading}
          />

          {/* Score Moyen */}
          <KpiCard
            label={TEXTES.kpiScoreMoyen}
            valeur={`${stats?.scoreMoyen ?? 0}%`}
            sousTexte={TEXTES.kpiScoreMoyenSousTexte}
            tonSousTexte="ok"
            icone={Sparkles}
            chargement={loading}
          />

          {/* Prochaine Échéance */}
          <KpiCard
            label={TEXTES.kpiProchaineEcheance}
            valeur={prochainDelai.valeur}
            sousTexte={prochainDelai.sousTexte}
            tonSousTexte={prochainDelai.ton}
            icone={Calendar}
            chargement={loading}
          />
        </div>
      </section>

      {/* 4. Fraîcheur des sources */}
      <section className="p-4 sm:p-5 rounded-carte border border-slate-200 bg-white shadow-2xs space-y-3" aria-label="Sources et synchronisation">
        <div className="flex items-center gap-2 text-[0.875rem] font-bold text-slate-900">
          <Rss className="w-4 h-4 text-teal" />
          <span>{TEXTES.sourcesTitre}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {sources.map((s) => (
            <div key={s.plateforme} className="flex items-center justify-between p-3 rounded-champ bg-slate-50 text-[0.8125rem]">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.actif ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                <span className="font-semibold text-slate-800">{s.plateforme}</span>
              </div>
              <span className="text-slate-500 font-mono text-[0.8125rem]">
                {s.derniereExecution || TEXTES.sourcesJamais}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* 5. Analyses regroupées dans un volet details/summary */}
      <details
        open={isDesktop}
        className="group border border-slate-200 rounded-carte bg-white overflow-hidden shadow-xs"
      >
        <summary className="flex items-center justify-between p-4 sm:px-6 min-h-[44px] cursor-pointer font-titre font-bold text-[1.125rem] text-slate-900 select-none hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
          <div className="flex items-center gap-2.5">
            <BarChart3 className="w-5 h-5 text-teal" />
            <span>{TEXTES.analysesTitre}</span>
          </div>
          <ChevronDown className="w-5 h-5 text-slate-500 transition-transform duration-200 group-open:rotate-180" />
        </summary>

        <div className="p-4 sm:p-6 pt-2 space-y-6 border-t border-slate-100">
          {/* Main Charts & Visualizations */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Region Distribution Chart */}
            <div className="lg:col-span-2 p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
              <div className="space-y-0.5">
                <h3 className="text-[0.9375rem] font-bold text-slate-900">
                  {TEXTES.regionTitre}
                </h3>
                <p className="text-[0.8125rem] text-slate-600">
                  {TEXTES.regionSousTitre}
                </p>
              </div>

              <div className="space-y-3 pt-2">
                {safeRegionStats.map((item) => {
                  const pct = (item.count / maxRegionCount) * 100;
                  return (
                    <div key={item.region} className="space-y-1">
                      <div className="flex items-center justify-between text-[0.8125rem]">
                        <div className="flex items-center gap-2 font-medium text-slate-800">
                          <MapPin className="w-4 h-4 text-teal" />
                          <span>{item.region}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[0.8125rem] text-slate-600 font-mono">
                            {formatFcfa(item.montantTotal)}
                          </span>
                          <span className="font-mono font-bold text-slate-900 tabular-nums w-14 text-right">
                            {TEXTES.regionAvisCount(item.count)}
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                        <div
                          className="bg-teal h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(pct, item.count > 0 ? 8 : 0)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: Breakdown by Procedure */}
            <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
              <div className="space-y-0.5">
                <h3 className="text-[0.9375rem] font-bold text-slate-900">
                  {TEXTES.procedureTitre}
                </h3>
                <p className="text-[0.8125rem] text-slate-600">
                  {TEXTES.procedureSousTitre}
                </p>
              </div>

              <div className="space-y-3 pt-2">
                {procedureStats.map((proc) => (
                  <div key={proc.procedure} className="p-3 rounded-xl bg-slate-50 space-y-1.5">
                    <div className="flex items-center justify-between text-[0.8125rem]">
                      <span className="font-bold text-slate-800">{proc.procedure}</span>
                      <span className="font-mono text-[0.8125rem] font-semibold text-teal">
                        {TEXTES.procedureCount(proc.count, proc.percentage)}
                      </span>
                    </div>
                    <p className="text-[0.8125rem] text-slate-600 truncate">{proc.label}</p>
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-amber-500 h-full rounded-full" style={{ width: `${proc.percentage}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom Section: Top High-Match Alerts & Top MO */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Recent High Match Alerts */}
            <div className="lg:col-span-2 p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[0.9375rem] font-bold text-slate-900">
                    {TEXTES.iaRecentesTitre}
                  </h3>
                  <p className="text-[0.8125rem] text-slate-600">
                    {TEXTES.iaRecentesSousTitre}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('client-alerts')}
                  className="text-[0.8125rem] font-semibold text-teal hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>{TEXTES.iaRecentesVoirTout}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                {recentAlerts.map((alert) => (
                  <div
                    key={alert.idMatch}
                    onClick={() => setSelectedAlert(alert)}
                    className="p-4 rounded-xl border border-slate-200 hover:border-teal/50 bg-white transition-all cursor-pointer group shadow-2xs space-y-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 text-[0.8125rem] text-slate-600">
                          <span className="font-mono font-bold text-teal">{alert.idAvis}</span>
                          <span aria-hidden="true">·</span>
                          <span>Région {alert.region}</span>
                          <span aria-hidden="true">·</span>
                          <span>Procédure {alert.procedure}</span>
                        </div>
                        <h4 className="text-[0.875rem] font-bold text-slate-900 group-hover:text-teal transition-colors line-clamp-2">
                          {alert.titre}
                        </h4>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[0.8125rem] font-bold font-mono bg-teal-50 text-teal-800 border border-teal-200">
                          {alert.scoreMatch}% IA
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[0.8125rem] text-slate-600">
                      <div className="flex items-center gap-1.5 truncate max-w-sm">
                        <Building className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                        <span className="truncate">{alert.maitreOuvrage}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-mono font-semibold text-slate-900">
                          {formatFcfa(alert.montantEstime)}
                        </span>
                        <span className="text-amber-700 font-medium">
                          Limite : {formatDateDouala(alert.dateLimite)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Maîtres d'Ouvrage */}
            <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
              <div className="space-y-0.5">
                <h3 className="text-[0.9375rem] font-bold text-slate-900">
                  {TEXTES.topMoTitre}
                </h3>
                <p className="text-[0.8125rem] text-slate-600">
                  {TEXTES.topMoSousTitre}
                </p>
              </div>

              <div className="space-y-3 pt-1">
                {topMOs.map((mo, idx) => (
                  <div key={mo.nom} className="flex items-start justify-between gap-2 p-3 rounded-xl bg-slate-50">
                    <div className="flex items-start gap-2.5">
                      <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 text-[0.8125rem] font-bold flex items-center justify-center shrink-0">
                        0{idx + 1}
                      </span>
                      <div>
                        <p className="text-[0.875rem] font-semibold text-slate-900 leading-tight">
                          {mo.nom}
                        </p>
                        <p className="text-[0.8125rem] text-slate-600 font-mono mt-0.5">
                          {formatFcfa(mo.montantCumule)}
                        </p>
                      </div>
                    </div>
                    <span className="text-[0.8125rem] font-mono font-bold text-teal shrink-0">
                      {TEXTES.topMoAvisCount(mo.avisCount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </details>

      {/* Tender Modal */}
      {selectedAlert && (
        <AlertDetailModal
          alert={selectedAlert}
          onClose={() => setSelectedAlert(null)}
          onUpdate={(updated) => {
            setSelectedAlert(updated);
            setRecentAlerts((prev) => prev.map((a) => (a.idMatch === updated.idMatch ? updated : a)));
            setActiveAlerts((prev) => prev.map((a) => (a.idMatch === updated.idMatch ? updated : a)));
          }}
        />
      )}
    </div>
  );
};
