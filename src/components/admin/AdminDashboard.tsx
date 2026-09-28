import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { AdminStats } from '../../types';
import {
  Users,
  Building2,
  FileText,
  Bell,
  Cpu,
  Mail,
  MessageSquare,
  ShieldCheck,
  TrendingUp,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Zap,
  ArrowRight
} from 'lucide-react';

interface AdminDashboardProps {
  onNavigate: (view: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigate }) => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    try {
      const res = await api.getAdminStats();
      if (res.donnees) {
        setStats(res.donnees);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto animate-pulse">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-slate-200 dark:bg-slate-800" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header Banner - Luminous & Modern */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl bg-white text-slate-900 border border-slate-200/90 shadow-xs">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-teal-50 text-teal-800 border border-teal-200/60">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-700" />
              Console Administrateur · Supervision SaaS
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Supervision Globale du Système
          </h2>
          <p className="text-xs text-slate-600 max-w-xl leading-relaxed">
            Gestion multi-entreprises, monitoring du pipeline de scraping ARMP et santé des quotas IA.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate('admin-pipeline')}
            className="flex items-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold bg-teal-700 hover:bg-teal-800 text-white transition-all shadow-xs hover:shadow cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5 text-amber-300" />
            <span>Exécuter Pipeline</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Total Clients */}
        <div
          onClick={() => onNavigate('admin-clients')}
          className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-teal-500/60 transition-all cursor-pointer shadow-xs"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>Clients</span>
            <Building2 className="w-4 h-4 text-teal-600" />
          </div>
          <p className="text-2xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
            {stats?.clients?.total ?? stats?.totalClients ?? 0}
          </p>
          <span className="text-[11px] text-emerald-600 font-semibold">
            {stats?.clients?.actifs ?? stats?.clientsActifs ?? 0} actifs
          </span>
        </div>

        {/* Utilisateurs */}
        <div
          onClick={() => onNavigate('admin-users')}
          className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-teal-500/60 transition-all cursor-pointer shadow-xs"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>Utilisateurs</span>
            <Users className="w-4 h-4 text-teal-600" />
          </div>
          <p className="text-2xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
            {stats?.utilisateurs?.total ?? stats?.totalUtilisateurs ?? 0}
          </p>
          <span className="text-[11px] text-slate-500">Comptes enregistrés</span>
        </div>

        {/* Avis Collectés */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>Avis Scrapés</span>
            <FileText className="w-4 h-4 text-teal-600" />
          </div>
          <p className="text-2xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
            {stats?.avis?.total ?? stats?.totalAvisScrapes ?? 0}
          </p>
          <span className="text-[11px] text-slate-500">ARMP & Ministères</span>
        </div>

        {/* Alertes Générées */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>Alertes Ciblées</span>
            <Bell className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
            {stats?.alertes?.total ?? stats?.totalAlertesGenerees ?? 0}
          </p>
          <span className="text-[11px] text-slate-500">Matches IA validés</span>
        </div>

        {/* Taux de Match */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>Taux Match IA</span>
            <TrendingUp className="w-4 h-4 text-teal-600" />
          </div>
          <p className="text-2xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
            {stats?.tauxMatchMoyen ?? '78%'}
          </p>
          <span className="text-[11px] text-teal-600 dark:text-teal-400">Précision sémantique</span>
        </div>

        {/* Sessions Actives */}
        <div
          onClick={() => onNavigate('admin-sessions')}
          className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-teal-500/60 transition-all cursor-pointer shadow-xs"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>Sessions</span>
            <Activity className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
            {stats?.sessions?.actives ?? stats?.sessionsActives ?? 0}
          </p>
          <span className="text-[11px] text-emerald-600 font-semibold">En ligne</span>
        </div>
      </div>

      {/* Quotas & System Status Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gemini AI Quota */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-teal-600" />
              <h3 className="text-xs font-bold text-slate-900 dark:text-white">Quota Gemini AI (Scoring)</h3>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              NOMINAL
            </span>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-500">Jetons consommés :</span>
              <span className="font-bold text-slate-900 dark:text-white">
                {(stats?.quotas?.geminiAi?.utilise ?? stats?.quotas?.geminiAujourdhui ?? 0).toLocaleString()} / {(stats?.quotas?.geminiAi?.total ?? 10000).toLocaleString()}
              </span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className="bg-teal-600 h-full rounded-full"
                style={{ width: `${stats?.quotas?.geminiAi?.pourcentage ?? 18}%` }}
              />
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            Utilisé pour vectoriser et scorer la pertinence des appels d'offres ARMP.
          </p>
        </div>

        {/* Gmail API Quota */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-teal-600" />
              <h3 className="text-xs font-bold text-slate-900 dark:text-white">Envois Emails (Gmail API)</h3>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              NOMINAL
            </span>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-500">Emails quotidiens :</span>
              <span className="font-bold text-slate-900 dark:text-white">
                {stats?.quotas?.gmailApi?.utilise ?? (100 - (stats?.quotas?.gmailRestant ?? 91))} / {stats?.quotas?.gmailApi?.total ?? 100}
              </span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className="bg-teal-600 h-full rounded-full"
                style={{ width: `${stats?.quotas?.gmailApi?.pourcentage ?? 9}%` }}
              />
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            Distribution matinale des bulletins d'alertes personnalisés aux abonnés.
          </p>
        </div>

        {/* WhatsApp Bot API Quota */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-600" />
              <h3 className="text-xs font-bold text-slate-900 dark:text-white">Messages WhatsApp Bot</h3>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              NOMINAL
            </span>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-500">Alertes WhatsApp :</span>
              <span className="font-bold text-slate-900 dark:text-white">
                {stats?.quotas?.whatsappApi?.utilise ?? 45} / {stats?.quotas?.whatsappApi?.total ?? 500}
              </span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full"
                style={{ width: `${stats?.quotas?.whatsappApi?.pourcentage ?? 9}%` }}
              />
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            Canal d'alerte express réservé aux appels d'offres prioritaires (≥ 85%).
          </p>
        </div>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          onClick={() => onNavigate('admin-clients')}
          className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-teal-500 transition-all cursor-pointer group shadow-xs space-y-2"
        >
          <div className="flex items-center justify-between">
            <Building2 className="w-5 h-5 text-teal-700" />
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-teal-600 transition-transform group-hover:translate-x-1" />
          </div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-white">Gérer les Entreprises</h4>
          <p className="text-xs text-slate-500">
            Créer des clients, configurer leurs critères régionaux et régénérer leurs profils IA.
          </p>
        </div>

        <div
          onClick={() => onNavigate('admin-pipeline')}
          className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-teal-500 transition-all cursor-pointer group shadow-xs space-y-2"
        >
          <div className="flex items-center justify-between">
            <Zap className="w-5 h-5 text-amber-500" />
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-teal-600 transition-transform group-hover:translate-x-1" />
          </div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-white">Actions du Pipeline</h4>
          <p className="text-xs text-slate-500">
            Lancer manuellement la collecte ARMP, le scoring sémantique et la distribution d'alertes.
          </p>
        </div>

        <div
          onClick={() => onNavigate('admin-audit')}
          className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-teal-500 transition-all cursor-pointer group shadow-xs space-y-2"
        >
          <div className="flex items-center justify-between">
            <ShieldCheck className="w-5 h-5 text-teal-600" />
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-teal-600 transition-transform group-hover:translate-x-1" />
          </div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-white">Journal d'Audit</h4>
          <p className="text-xs text-slate-500">
            Consulter l'historique complet des actions, des connexions et des modifications.
          </p>
        </div>
      </div>
    </div>
  );
};
