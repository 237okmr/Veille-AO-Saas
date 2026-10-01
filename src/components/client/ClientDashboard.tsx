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
import { parserDateLimite, joursRestantsDouala, formaterDateDouala } from '../../utils/dates';

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

  // (a) Échéances à surveiller : GO ou SAUVEGARDE, date valide, délai restant <= 14 jours, tri croissant par deadline
  const echeances = useMemo(() => {
    return activeAlerts
      .filter((a) => {
        const isEligible = a.decision === 'GO' || a.etat === 'SAUVEGARDE';
        if (!isEligible) return false;
        const jr = joursRestantsDouala(a.dateLimite);
        return jr !== null && jr <= 14;
      })
      .sort((a, b) => {
        const jrA = joursRestantsDouala(a.dateLimite);
        const jrB = joursRestantsDouala(b.dateLimite);
        if (jrA !== null && jrB !== null && jrA !== jrB) return jrA - jrB;
        const timeA = parserDateLimite(a.dateLimite)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const timeB = parserDateLimite(b.dateLimite)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return timeA - timeB;
      });
  }, [activeAlerts]);

  // (b) À décider : NOUVEAU ou non lue, décision absente ou EN_ATTENTE, tri décroissant par score (les dates illisibles conservées)
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

  // Calcul honnête et dynamique de la prochaine échéance
  const prochainDelai = useMemo(() => {
    const d = parserDateLimite(stats?.prochaineEcheance);
    if (!d || !stats?.prochaineEcheance) {
      return {
        valeur: TEXTES.kpiAucuneEcheance,
        sousTexte: undefined,
        ton: 'neutre' as const
      };
    }
    const jr = joursRestantsDouala(stats.prochaineEcheance);
    const dateStr = formaterDateDouala(stats.prochaineEcheance);
    let sousTexte: string | undefined = undefined;
    if (jr !== null) {
      if (jr === 0) sousTexte = TEXTES.kpiAujourdhui;
      else if (jr === 1) sousTexte = TEXTES.kpiDansUnJour;
      else if (jr > 1) sousTexte = TEXTES.kpiDansNJours(jr);
    }

    return {
      valeur: dateStr,
      sousTexte,
      ton: (jr !== null && jr <= 3 ? 'attention' : 'neutre') as 'attention' | 'neutre'
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Rss className="w-4 h-4 text-teal shrink-0" />
            <h3 className="font-titre font-bold text-[0.9375rem] text-slate-900">
              {TEXTES.sourcesTitre}
            </h3>
          </div>
          <span className="text-[0.8125rem] text-slate-500 font-medium">
            {TEXTES.headerVeilleActive}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
          {sources.length === 0 ? (
            ['ARMP', 'COLEPS', 'MINMAP', 'DGTCFM', 'FEICOM', 'BAILLEURS'].map((s) => (
              <div key={s} className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/50 space-y-1">
                <p className="font-bold text-[0.8125rem] text-slate-700">{s}</p>
                <p className="text-[0.8125rem] text-slate-500">Collecte active</p>
              </div>
            ))
          ) : (
            sources.map((s) => (
              <div key={s.plateforme} className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/50 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[0.8125rem] text-slate-800">{s.plateforme}</span>
                  <span className={`w-2 h-2 rounded-full ${s.actif ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                </div>
                <p className="text-[0.8125rem] text-slate-500 truncate">
                  {s.derniereExecution ? formaterDateDouala(s.derniereExecution) : TEXTES.sourcesJamais}
                </p>
              </div>
            ))
          )}
        </div>
      </section>

      {/* 5. Section repliable « Analyses détaillées » (details/summary accessible) */}
      <details
        open={isDesktop}
        className="group border border-slate-200 rounded-carte bg-white shadow-2xs overflow-hidden"
      >
        <summary
          tabIndex={0}
          className="w-full flex items-center justify-between p-4 sm:p-5 min-h-[44px] cursor-pointer bg-slate-50/70 hover:bg-slate-100/80 transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 list-none"
        >
          <div className="flex items-center gap-2.5">
            <BarChart3 className="w-5 h-5 text-teal shrink-0" />
            <div>
              <h2 className="font-titre font-bold text-[1rem] text-slate-900 leading-tight">
                {TEXTES.analysesTitre}
              </h2>
              <p className="text-[0.8125rem] text-slate-600">
                {TEXTES.analysesSousTitre}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[0.8125rem] font-semibold text-teal group-open:hidden">
              Afficher
            </span>
            <span className="text-[0.8125rem] font-semibold text-teal hidden group-open:inline">
              Masquer
            </span>
            <ChevronDown className="w-5 h-5 text-slate-500 transition-transform duration-200 group-open:rotate-180" />
          </div>
        </summary>

        <div className="p-4 sm:p-6 space-y-6 border-t border-slate-200">
          {/* Charts Grid: Regional and Procedure Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Regional Breakdown Card */}
            <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
              <div>
                <h3 className="text-[0.9375rem] font-bold text-slate-900">
                  {TEXTES.regionTitre}
                </h3>
                <p className="text-[0.8125rem] text-slate-600">
                  {TEXTES.regionSousTitre}
                </p>
              </div>

              <div className="space-y-3 pt-2">
                {safeRegionStats.slice(0, 5).map((reg) => (
                  <div key={reg.region} className="space-y-1">
                    <div className="flex justify-between text-[0.8125rem] font-semibold">
                      <span className="text-slate-700 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        {reg.region}
                      </span>
                      <span className="text-slate-900">
                        {TEXTES.regionAvisCount(reg.count)} ({formatFcfa(reg.montantTotal)})
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-teal h-full rounded-full transition-all duration-500"
                        style={{ width: `${(reg.count / maxRegionCount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Procedure Breakdown Card */}
            <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
              <div>
                <h3 className="text-[0.9375rem] font-bold text-slate-900">
                  {TEXTES.procedureTitre}
                </h3>
                <p className="text-[0.8125rem] text-slate-600">
                  {TEXTES.procedureSousTitre}
                </p>
              </div>

              <div className="space-y-3 pt-2">
                {procedureStats.map((proc) => (
                  <div key={proc.procedure} className="space-y-1">
                    <div className="flex justify-between text-[0.8125rem] font-semibold">
                      <span className="text-slate-700">{proc.procedure}</span>
                      <span className="text-slate-900">
                        {TEXTES.procedureCount(proc.count, proc.percentage)}
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
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
                          Limite : {formaterDateDouala(alert.dateLimite)}
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

              <div className="space-y-3 pt-2">
                {topMOs.map((mo, idx) => (
                  <div
                    key={mo.nom}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100"
                  >
                    <div className="flex items-center gap-3 truncate">
                      <div className="w-6 h-6 rounded-lg bg-teal-50 text-teal font-mono font-bold text-[0.8125rem] flex items-center justify-center shrink-0">
                        {idx + 1}
                      </div>
                      <span className="text-[0.8125rem] font-semibold text-slate-800 truncate">
                        {mo.nom}
                      </span>
                    </div>
                    <span className="text-[0.8125rem] font-mono font-bold text-slate-600 shrink-0 ml-2">
                      {TEXTES.topMoAvisCount(mo.avisCount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </details>

      {/* 6. Modale de détail d'alerte */}
      {selectedAlert && (
        <AlertDetailModal
          alert={selectedAlert}
          onClose={() => setSelectedAlert(null)}
          onUpdate={(updatedAlert) => {
            setActiveAlerts((prev) =>
              prev.map((a) => (a.idMatch === updatedAlert.idMatch ? updatedAlert : a))
            );
            setRecentAlerts((prev) =>
              prev.map((a) => (a.idMatch === updatedAlert.idMatch ? updatedAlert : a))
            );
            setSelectedAlert(updatedAlert);
          }}
        />
      )}
    </div>
  );
};
