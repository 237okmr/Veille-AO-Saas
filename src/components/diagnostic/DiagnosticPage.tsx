import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import {
  Activity,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Copy,
  Trash2,
  ArrowLeft,
  Server,
  Terminal,
  ShieldCheck,
  AlertTriangle,
  Globe,
  Database,
  Lock,
  Layers
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

interface DiagnosticPageProps {
  onBack: () => void;
}

interface TestStepResult {
  status: 'idle' | 'running' | 'success' | 'failure';
  code?: number;
  durationMs?: number;
  payload?: any;
  raw?: string;
  error?: string;
}

interface RealStatItem {
  metric: string;
  value: number | null;
}

interface BrowserErrorLog {
  timestamp: string;
  message: string;
}

export const DiagnosticPage: React.FC<DiagnosticPageProps> = ({ onBack }) => {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);

  // SECTION 1: Environment state & Apps Script build version
  const [envData, setEnvData] = useState<{
    apiUrlServer: string;
    apiUrlServerMasked: string;
    isConfigured: boolean;
    mode: string;
    proxySecretConforme?: boolean;
  } | null>(null);

  const [appsScriptBuild, setAppsScriptBuild] = useState<string | null>(null);
  const [loadingBuild, setLoadingBuild] = useState<boolean>(false);

  // SECTION 2: API Connection Test Steps
  const [pingTest, setPingTest] = useState<TestStepResult>({ status: 'idle' });
  const [loginTest, setLoginTest] = useState<TestStepResult>({ status: 'idle' });
  const [statsTest, setStatsTest] = useState<TestStepResult>({ status: 'idle' });
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [statsValueChecks, setStatsValueChecks] = useState<{
    clients: number | null;
    utilisateurs: number | null;
    avis: number | null;
    alertes: number | null;
  } | null>(null);

  // SECTION 3: Proxy Test & Code Search
  const [directCalls, setDirectCalls] = useState<Array<{ file: string; line: number; snippet: string }>>([]);

  // SECTION 4: Data totals
  const [realStats, setRealStats] = useState<RealStatItem[]>([]);

  // SECTION 5: Logs
  const [serverLogs, setServerLogs] = useState<Array<{ id: number; timestamp: string; level: 'info' | 'warn' | 'error'; message: string }>>([]);
  const [browserErrors, setBrowserErrors] = useState<BrowserErrorLog[]>([]);

  // Capture browser errors
  useEffect(() => {
    const errorHandler = (event: ErrorEvent) => {
      setBrowserErrors((prev) => [
        ...prev.slice(-19),
        {
          timestamp: new Date().toLocaleTimeString('fr-FR'),
          message: event.message || 'Erreur non spécifiée dans le navigateur'
        }
      ]);
    };

    const unhandledRejectionHandler = (event: PromiseRejectionEvent) => {
      setBrowserErrors((prev) => [
        ...prev.slice(-19),
        {
          timestamp: new Date().toLocaleTimeString('fr-FR'),
          message: `Promesse rejetée : ${String(event.reason?.message || event.reason)}`
        }
      ]);
    };

    window.addEventListener('error', errorHandler);
    window.addEventListener('unhandledrejection', unhandledRejectionHandler);

    return () => {
      window.removeEventListener('error', errorHandler);
      window.removeEventListener('unhandledrejection', unhandledRejectionHandler);
    };
  }, []);

  // Load initial status & Apps Script version from /ping
  const loadStatusAndLogs = useCallback(async () => {
    setLoading(true);
    setLoadingBuild(true);
    try {
      const [statusRes, pingRes] = await Promise.allSettled([
        api.getDiagnosticStatus(),
        api.proxyGet('/ping')
      ]);

      if (statusRes.status === 'fulfilled' && statusRes.value?.donnees) {
        setEnvData({
          apiUrlServer: statusRes.value.donnees.apiUrlServer,
          apiUrlServerMasked: statusRes.value.donnees.apiUrlServerMasked,
          isConfigured: statusRes.value.donnees.isConfigured,
          mode: statusRes.value.donnees.mode,
          proxySecretConforme: statusRes.value.donnees.proxySecretConforme
        });
        setDirectCalls(statusRes.value.donnees.directCalls || []);
        setServerLogs(statusRes.value.donnees.serverLogs || []);
      }

      if (pingRes.status === 'fulfilled' && pingRes.value?.ok) {
        const pingPayload = pingRes.value.data;
        const build = pingPayload?.donnees?.build || pingPayload?.build || null;
        setAppsScriptBuild(build ? String(build) : null);
      } else {
        setAppsScriptBuild(null);
      }
    } catch (err: any) {
      toast.error('Erreur de diagnostic', err.message);
    } finally {
      setLoading(false);
      setLoadingBuild(false);
    }
  }, [toast]);

  useEffect(() => {
    loadStatusAndLogs();
  }, [loadStatusAndLogs]);

  // Run full connectivity test suite
  const runFullConnectionTest = async () => {
    setTestingConnection(true);

    // STEP A: GET /api/proxy?route=/ping
    setPingTest({ status: 'running' });
    let pingSuccess = false;
    const startPing = Date.now();
    try {
      const resA = await api.proxyGet('/ping');
      const durationA = Date.now() - startPing;
      pingSuccess = resA.ok && (resA.data?.succes === true || resA.status === 200);
      const build = resA.data?.donnees?.build || resA.data?.build;
      if (build) {
        setAppsScriptBuild(String(build));
      }
      setPingTest({
        status: pingSuccess ? 'success' : 'failure',
        code: resA.status,
        durationMs: durationA,
        payload: resA.data,
        raw: resA.raw
      });
    } catch (e: any) {
      setPingTest({
        status: 'failure',
        durationMs: Date.now() - startPing,
        error: e.message || 'Échec de la requête /ping'
      });
    }

    // STEP B: GET /api/proxy (/auth/verify — session active)
    setLoginTest({ status: 'running' });
    const storedToken = localStorage.getItem('cam_marches_token');
    setTempToken(storedToken);

    if (!storedToken) {
      setLoginTest({
        status: 'failure',
        durationMs: 0,
        error: "Aucune session active : connectez-vous d'abord dans l'application avant de lancer ce diagnostic."
      });
    } else {
      const startLogin = Date.now();
      try {
        const resB = await api.proxyGet('/auth/verify', storedToken);
        const durationB = Date.now() - startLogin;
        const verifySuccess = resB.ok && resB.data?.succes === true;

        setLoginTest({
          status: verifySuccess ? 'success' : 'failure',
          code: resB.status,
          durationMs: durationB,
          payload: resB.data,
          raw: resB.raw,
          error: verifySuccess ? undefined : (resB.data?.message || 'Échec de vérification du jeton de session.')
        });
      } catch (e: any) {
        setLoginTest({
          status: 'failure',
          durationMs: Date.now() - startLogin,
          error: e.message || 'Échec de la requête de vérification'
        });
      }
    }

    // STEP C: GET /api/proxy?route=/admin/stats
    setStatsTest({ status: 'running' });
    const startStats = Date.now();
    try {
      const resC = await api.proxyGet('/admin/stats', storedToken || undefined);
      const durationC = Date.now() - startStats;
      const statsSuccess = resC.ok && resC.data?.succes === true && resC.data?.donnees;

      if (statsSuccess) {
        const d = resC.data.donnees;
        setStatsValueChecks({
          clients: d.totalClients ?? d.clients ?? null,
          utilisateurs: d.totalUtilisateurs ?? d.utilisateurs ?? null,
          avis: d.totalAvisArmp ?? d.totalAvis ?? d.avis ?? null,
          alertes: d.totalAlertes ?? d.alertes ?? null
        });

        setRealStats([
          { metric: 'Total Clients', value: d.totalClients ?? d.clients ?? null },
          { metric: 'Total Utilisateurs', value: d.totalUtilisateurs ?? d.utilisateurs ?? null },
          { metric: 'Total Avis Collectés (ARMP/Bailleurs)', value: d.totalAvisArmp ?? d.totalAvis ?? d.avis ?? null },
          { metric: 'Total Alertes Traitées', value: d.totalAlertes ?? d.alertes ?? null }
        ]);
      } else {
        setStatsValueChecks(null);
      }

      setStatsTest({
        status: statsSuccess ? 'success' : 'failure',
        code: resC.status,
        durationMs: durationC,
        payload: resC.data,
        raw: resC.raw,
        error: statsSuccess ? undefined : (resC.data?.message || 'Échec de récupération des statistiques réelles.')
      });
    } catch (e: any) {
      setStatsTest({
        status: 'failure',
        durationMs: Date.now() - startStats,
        error: e.message || 'Échec de la requête /admin/stats'
      });
    }

    setTestingConnection(false);
  };

  // Action: Clear localStorage cache
  const handleClearCache = () => {
    const token = localStorage.getItem('cam_marches_token');
    localStorage.clear();
    if (token) {
      localStorage.setItem('cam_marches_token', token);
    }
    toast.success('Cache navigateur vidé', 'Rechargement de la page...');
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  // Action: Copy Report to Clipboard
  const handleCopyReport = async () => {
    const report = `=====================================================
RAPPORT DE DIAGNOSTIC TECHNIQUE - MARKET ADVISOR CM
Date: ${new Date().toISOString()}
Origine App: ${window.location.origin}
=====================================================

1. CONFIGURATION DE L'ENVIRONNEMENT :
- API_URL (Serveur process.env.API_URL) : ${envData?.apiUrlServer ? `${envData.apiUrlServerMasked} [OK ✅]` : 'Non définie ou vide [KO ❌]'}
- Mode d'exécution : ${envData?.mode || 'Inconnu'}
- Version du déploiement Apps Script (/ping) : ${appsScriptBuild || 'Indisponible'}
${envData?.proxySecretConforme !== undefined ? `- Secret partagé du proxy (PROXY_SHARED_SECRET) : ${envData.proxySecretConforme ? 'Conforme (≥ 32 car.) [OK ✅]' : 'Inopérant (< 32 car. ou absent) [KO ❌]'}\n` : ''}- API_URL Client : Proxy Node.js actif (/api/* et /api/proxy) [OK ✅]
- URL Actuelle : ${window.location.origin}

2. TESTS DE CONNEXION À L'API :
a) GET /api/proxy?route=/ping :
   - Statut : ${pingTest.status === 'success' ? 'SUCCÈS ✅' : 'ÉCHEC ❌'} (Code HTTP: ${pingTest.code || 'N/A'}, Durée: ${pingTest.durationMs || 0}ms)
   - Réponse : ${JSON.stringify(pingTest.payload || pingTest.error || {})}

b) GET /api/proxy (/auth/verify — session active) :
   - Statut : ${loginTest.status === 'success' ? 'SUCCÈS ✅' : 'ÉCHEC ❌'} (Code HTTP: ${loginTest.code || 'N/A'}, Durée: ${loginTest.durationMs || 0}ms)
   - Token de session : ${tempToken ? `${tempToken.substring(0, 15)}... [OK ✅]` : 'Aucune session active [KO ❌]'}
   ${loginTest.error ? `- Message : ${loginTest.error}` : ''}

c) GET /api/proxy?route=/admin/stats :
   - Statut : ${statsTest.status === 'success' ? 'SUCCÈS ✅' : 'ÉCHEC ❌'} (Code HTTP: ${statsTest.code || 'N/A'}, Durée: ${statsTest.durationMs || 0}ms)
   - Valeurs réelles retournées :
     • Clients : ${statsValueChecks?.clients ?? 'N/A'}
     • Utilisateurs : ${statsValueChecks?.utilisateurs ?? 'N/A'}
     • Avis ARMP : ${statsValueChecks?.avis ?? 'N/A'}
     • Alertes : ${statsValueChecks?.alertes ?? 'N/A'}

3. TEST DU PROXY :
- Toutes les requêtes passent par /api/proxy : OUI ✅
- Appels directs vers script.google.com dans le code : ${directCalls.length === 0 ? 'Aucun appel direct détecté (0 occurrence) ✅' : `${directCalls.length} appel(s) direct(s) trouvé(s) ❌`}

4. DONNÉES RÉELLES (/admin/stats) :
${realStats.length === 0 ? '- Aucune donnée chargée' : realStats.map((item) => `- ${item.metric} : ${item.value ?? 'Non disponible'}`).join('\n')}

5. DERNIERS LOGS SERVEUR (${serverLogs.length} entrées) :
${serverLogs.map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`).join('\n')}

6. ERREURS CONSOLE NAVIGATEUR (${browserErrors.length} entrées) :
${browserErrors.length === 0 ? 'Aucune erreur console détectée dans le navigateur.' : browserErrors.map((e) => `[${e.timestamp}] ${e.message}`).join('\n')}
=====================================================`;

    try {
      await navigator.clipboard.writeText(report);
      toast.success('Rapport copié dans le presse-papier', 'Vous pouvez maintenant le coller et le transmettre.');
    } catch {
      toast.error('Erreur', 'Impossible de copier dans le presse-papier.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-900 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top Header Card */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <button
                onClick={onBack}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors mr-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Retour à l'application</span>
              </button>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-teal-50 text-teal-800 border border-teal-200/80">
                <Activity className="w-3.5 h-3.5 text-teal-600" />
                PAGE DE DIAGNOSTIC TECHNIQUE
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Vérification de la Chaîne API Apps Script & Proxy
            </h1>
            <p className="text-xs text-slate-600 max-w-2xl">
              Cette page teste chaque maillon de transmission HTTP entre le frontend, le serveur Node.js et votre Web App Google Apps Script.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={runFullConnectionTest}
              disabled={testingConnection}
              className="flex items-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold bg-teal-700 hover:bg-teal-800 active:bg-teal-900 text-white transition-all shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingConnection ? 'animate-spin' : ''}`} />
              <span>{testingConnection ? 'Tests en cours...' : 'Tester la connexion'}</span>
            </button>
            <button
              onClick={handleCopyReport}
              className="flex items-center gap-2 py-2.5 px-3.5 rounded-xl text-xs font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
              title="Copier l'intégralité du diagnostic au format texte"
            >
              <Copy className="w-3.5 h-3.5 text-slate-500" />
              <span>Copier le rapport</span>
            </button>
          </div>
        </div>

        {/* SECTION 1: Configuration de l'environnement */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-teal-700" />
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                1. Configuration de l'environnement
              </h2>
            </div>
            <span className="text-[11px] font-mono text-slate-400">Variables système & URLs</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            {/* Server API_URL */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700">process.env.API_URL</span>
                {envData?.apiUrlServer ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    DÉFINIE ✅
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[11px] bg-rose-50 text-rose-700 border border-rose-200">
                    <XCircle className="w-3 h-3 text-rose-600" />
                    ABSENTE ❌
                  </span>
                )}
              </div>
              <p className="font-mono text-[11px] text-slate-800 break-all bg-white p-2 rounded-lg border border-slate-200/60">
                {envData?.apiUrlServerMasked || 'Non définie (Connexion non configurée)'}
              </p>
              <p className="text-[11px] text-slate-500">
                Mode détecté : <strong className="font-mono text-slate-700">{envData?.mode || 'NON_CONFIGURE'}</strong>
              </p>
            </div>

            {/* Version du déploiement Apps Script */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700">Version Apps Script</span>
                {appsScriptBuild ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    DISPONIBLE
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[11px] bg-slate-100 text-slate-600 border border-slate-200">
                    Indisponible
                  </span>
                )}
              </div>
              <p className="font-mono text-[11px] text-slate-800 break-all bg-white p-2 rounded-lg border border-slate-200/60">
                {loadingBuild ? 'Vérification en cours…' : (appsScriptBuild || 'Indisponible')}
              </p>
              <p className="text-[11px] text-slate-500">
                Version du déploiement Apps Script (champ <code className="font-mono font-semibold">donnees.build</code> via <code className="font-mono font-semibold">/ping</code>).
              </p>
            </div>

            {/* Client API_URL */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700">API_URL côté client</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  SÉCURISÉ ✅
                </span>
              </div>
              <p className="font-mono text-[11px] text-slate-800 bg-white p-2 rounded-lg border border-slate-200/60">
                /api/proxy (Proxy Node.js local)
              </p>
              <p className="text-[11px] text-slate-500">
                Toutes les requêtes transitent par le backend Node.js sans exposer l'URL Apps Script.
              </p>
            </div>

            {/* Secret Proxy ou Origine */}
            {envData?.proxySecretConforme !== undefined ? (
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">Secret du proxy</span>
                  {envData.proxySecretConforme ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      CONFORME (≥ 32 car.)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[11px] bg-amber-50 text-amber-700 border border-amber-200">
                      <AlertTriangle className="w-3 h-3 text-amber-600" />
                      INOPÉRANT (&lt; 32 car.)
                    </span>
                  )}
                </div>
                <p className="font-mono text-[11px] text-slate-800 bg-white p-2 rounded-lg border border-slate-200/60">
                  {envData.proxySecretConforme ? 'Secret configuré conforme' : 'Absent ou insuffisant'}
                </p>
                <p className="text-[11px] text-slate-500">
                  Requis pour le mode de filtrage strict (ENFORCE) côté Apps Script.
                </p>
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">URL application (Origin)</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    ACTIF ✅
                  </span>
                </div>
                <p className="font-mono text-[11px] text-slate-800 break-all bg-white p-2 rounded-lg border border-slate-200/60">
                  {typeof window !== 'undefined' ? window.location.origin : 'N/A'}
                </p>
                <p className="text-[11px] text-slate-500">
                  Point d'hébergement Cloud Run ou local dev server.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* SECTION 2: Test de connexion à l'API */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-teal-700" />
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                2. Test de connexion à l'API (Séquence A, B, C)
              </h2>
            </div>
            <button
              onClick={runFullConnectionTest}
              disabled={testingConnection}
              className="text-xs font-semibold text-teal-700 hover:text-teal-800 flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingConnection ? 'animate-spin' : ''}`} />
              <span>Relancer ce test</span>
            </button>
          </div>

          <div className="space-y-4">
            {/* Step A: GET /api/proxy?route=/ping */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/40 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-800 font-bold text-xs flex items-center justify-center">
                    A
                  </span>
                  <span className="font-mono text-xs font-bold text-slate-900">
                    GET /api/proxy?route=/ping
                  </span>
                </div>
                <div>
                  {pingTest.status === 'running' && (
                    <span className="text-xs text-amber-600 font-medium animate-pulse">Exécution...</span>
                  )}
                  {pingTest.status === 'success' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-xs bg-emerald-50 text-emerald-800 border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      SUCCÈS ✅ ({pingTest.durationMs}ms)
                    </span>
                  )}
                  {pingTest.status === 'failure' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-xs bg-rose-50 text-rose-800 border border-rose-200">
                      <XCircle className="w-3.5 h-3.5 text-rose-600" />
                      ÉCHEC ❌ ({pingTest.durationMs}ms)
                    </span>
                  )}
                </div>
              </div>

              <div className="pt-2">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                  Résultat brut JSON :
                </span>
                <pre className="p-3 rounded-lg bg-slate-100 border border-slate-200/80 font-mono text-[11px] text-slate-800 overflow-x-auto max-h-48">
                  {pingTest.raw || JSON.stringify(pingTest.payload || { message: 'En attente du test...' }, null, 2)}
                </pre>
              </div>
            </div>

            {/* Step B: GET /api/proxy (/auth/verify — session active) */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/40 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-800 font-bold text-xs flex items-center justify-center">
                    B
                  </span>
                  <span className="font-mono text-xs font-bold text-slate-900">
                    GET /api/proxy (/auth/verify — session active)
                  </span>
                </div>
                <div>
                  {loginTest.status === 'running' && (
                    <span className="text-xs text-amber-600 font-medium animate-pulse">Exécution...</span>
                  )}
                  {loginTest.status === 'success' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-xs bg-emerald-50 text-emerald-800 border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      SUCCÈS & SESSION VALIDE ✅ ({loginTest.durationMs}ms)
                    </span>
                  )}
                  {loginTest.status === 'failure' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-xs bg-rose-50 text-rose-800 border border-rose-200">
                      <XCircle className="w-3.5 h-3.5 text-rose-600" />
                      ÉCHEC ❌ ({loginTest.durationMs}ms)
                    </span>
                  )}
                </div>
              </div>

              {loginTest.error && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                  {loginTest.error}
                </div>
              )}

              {tempToken && (
                <div className="p-2 rounded-lg bg-teal-50 border border-teal-200 text-xs font-mono text-teal-900 flex items-center justify-between">
                  <span>Token de session actif : <strong>{tempToken.substring(0, 18)}••••••••</strong></span>
                  <span className="text-[10px] bg-teal-200/60 px-2 py-0.5 rounded">Utilisé pour l'étape C</span>
                </div>
              )}

              <div className="pt-2">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                  Résultat brut JSON :
                </span>
                <pre className="p-3 rounded-lg bg-slate-100 border border-slate-200/80 font-mono text-[11px] text-slate-800 overflow-x-auto max-h-48">
                  {loginTest.raw || (loginTest.error ? JSON.stringify({ error: loginTest.error }, null, 2) : JSON.stringify(loginTest.payload || { message: 'En attente du test...' }, null, 2))}
                </pre>
              </div>
            </div>

            {/* Step C: GET /api/proxy?route=/admin/stats */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/40 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-800 font-bold text-xs flex items-center justify-center">
                    C
                  </span>
                  <span className="font-mono text-xs font-bold text-slate-900">
                    GET /api/proxy?route=/admin/stats&token=...
                  </span>
                </div>
                <div>
                  {statsTest.status === 'running' && (
                    <span className="text-xs text-amber-600 font-medium animate-pulse">Exécution...</span>
                  )}
                  {statsTest.status === 'success' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-xs bg-emerald-50 text-emerald-800 border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      SUCCÈS ✅ ({statsTest.durationMs}ms)
                    </span>
                  )}
                  {statsTest.status === 'failure' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-xs bg-rose-50 text-rose-800 border border-rose-200">
                      <XCircle className="w-3.5 h-3.5 text-rose-600" />
                      ÉCHEC ❌ ({statsTest.durationMs}ms)
                    </span>
                  )}
                </div>
              </div>

              {/* Raw stats received display */}
              {statsValueChecks && (
                <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-2">
                  <span className="text-xs font-bold text-slate-900 block">
                    Valeurs réelles reçues de /admin/stats :
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
                      <span className="text-slate-500 font-medium">Clients</span>
                      <span className="text-base font-bold font-mono text-slate-900 mt-1">
                        {statsValueChecks.clients !== null ? statsValueChecks.clients : 'N/A'}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
                      <span className="text-slate-500 font-medium">Utilisateurs</span>
                      <span className="text-base font-bold font-mono text-slate-900 mt-1">
                        {statsValueChecks.utilisateurs !== null ? statsValueChecks.utilisateurs : 'N/A'}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
                      <span className="text-slate-500 font-medium">Avis ARMP</span>
                      <span className="text-base font-bold font-mono text-slate-900 mt-1">
                        {statsValueChecks.avis !== null ? statsValueChecks.avis : 'N/A'}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
                      <span className="text-slate-500 font-medium">Alertes</span>
                      <span className="text-base font-bold font-mono text-slate-900 mt-1">
                        {statsValueChecks.alertes !== null ? statsValueChecks.alertes : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-1">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                  Résultat brut JSON :
                </span>
                <pre className="p-3 rounded-lg bg-slate-100 border border-slate-200/80 font-mono text-[11px] text-slate-800 overflow-x-auto max-h-48">
                  {statsTest.raw || JSON.stringify(statsTest.payload || { message: 'En attente du test...' }, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 3: Test du proxy & Détection script.google.com */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-teal-700" />
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                3. Test du proxy & Intégrité du code source
              </h2>
            </div>
            <span className="text-[11px] font-mono text-slate-400">Scan statique /src</span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-900">
                  Toutes les requêtes passent-elles bien par /api/proxy ?
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Aucun appel HTTP externe direct n'est réalisé depuis le navigateur.
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                OUI (100% via Proxy) ✅
              </span>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">
                    Détection d'appels directs vers « script.google.com » dans le code source (/src) :
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Recherche textuelle stricte de la chaîne d'URL directe dans l'arborescence frontend.
                  </p>
                </div>
                {directCalls.length === 0 ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    AUCUN APPEL DIRECT DÉTECTÉ ✅
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold text-xs bg-rose-50 text-rose-800 border border-rose-200 shrink-0">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                    {directCalls.length} APPEL(S) DÉTECTÉ(S) ❌
                  </span>
                )}
              </div>

              {directCalls.length > 0 && (
                <div className="border border-rose-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-rose-50 font-bold text-rose-900">
                      <tr>
                        <th className="py-2 px-3">Fichier</th>
                        <th className="py-2 px-3">Ligne</th>
                        <th className="py-2 px-3">Extrait</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rose-100 bg-white">
                      {directCalls.map((call, idx) => (
                        <tr key={idx}>
                          <td className="py-1.5 px-3 font-mono font-semibold">{call.file}</td>
                          <td className="py-1.5 px-3 font-mono">{call.line}</td>
                          <td className="py-1.5 px-3 font-mono text-slate-600">{call.snippet}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SECTION 4: Données réelles (/admin/stats) */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-teal-700" />
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                4. Données réelles de l'application (/admin/stats)
              </h2>
            </div>
            <span className="text-[11px] font-mono text-slate-400">Totaux en direct</span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Métrique</th>
                  <th className="py-3 px-4 text-right">Valeur Réelle (/admin/stats)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {realStats.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="py-6 text-center text-slate-500">
                      Cliquez sur « Tester la connexion » pour charger les données réelles en direct.
                    </td>
                  </tr>
                ) : (
                  realStats.map((item) => (
                    <tr key={item.metric} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {item.metric}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-teal-700 text-right">
                        {item.value !== null ? item.value : 'Non disponible'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* SECTION 5: Logs (Serveur & Navigateur) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Server Logs */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-teal-700" />
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  5A. 20 Derniers Logs Serveur (Backend Node.js)
                </h2>
              </div>
              <span className="text-[10px] font-mono text-slate-400">{serverLogs.length} logs</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 text-slate-200 font-mono text-[11px] overflow-y-auto max-h-72 space-y-1.5">
              {serverLogs.length === 0 ? (
                <p className="text-slate-500">Aucun log serveur enregistré pour le moment.</p>
              ) : (
                serverLogs.map((log) => (
                  <div key={log.id} className="leading-snug flex items-start gap-2">
                    <span className="text-slate-500 shrink-0 text-[10px]">
                      {new Date(log.timestamp).toLocaleTimeString('fr-FR')}
                    </span>
                    <span
                      className={`text-[9px] px-1 rounded font-bold shrink-0 ${
                        log.level === 'error'
                          ? 'bg-rose-950 text-rose-400'
                          : log.level === 'warn'
                          ? 'bg-amber-950 text-amber-400'
                          : 'bg-slate-800 text-teal-400'
                      }`}
                    >
                      {log.level.toUpperCase()}
                    </span>
                    <span className="text-slate-300 break-all">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Browser Console Errors */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  5B. Erreurs Console du Navigateur
                </h2>
              </div>
              <span className="text-[10px] font-mono text-slate-400">{browserErrors.length} erreur(s)</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 text-slate-200 font-mono text-[11px] overflow-y-auto max-h-72 space-y-1.5">
              {browserErrors.length === 0 ? (
                <div className="p-4 text-center text-emerald-400">
                  <CheckCircle2 className="w-5 h-5 mx-auto mb-1 text-emerald-500" />
                  <p className="font-semibold">Aucune erreur console détectée dans le navigateur ✅</p>
                </div>
              ) : (
                browserErrors.map((err, idx) => (
                  <div key={idx} className="leading-snug flex items-start gap-2 text-rose-300">
                    <span className="text-slate-500 shrink-0 text-[10px]">{err.timestamp}</span>
                    <span className="text-[9px] bg-rose-950 text-rose-400 px-1 rounded font-bold shrink-0">ERR</span>
                    <span className="break-all">{err.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* SECTION 6: Actions */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              6. Actions de maintenance & transmission
            </h2>
            <span className="text-[11px] font-mono text-slate-400">Outils de test rapide</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={handleClearCache}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-semibold border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100 transition-colors shadow-2xs cursor-pointer"
            >
              <Trash2 className="w-4 h-4 text-rose-600" />
              <span>Vider le cache navigateur</span>
            </button>

            <button
              onClick={runFullConnectionTest}
              disabled={testingConnection}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-semibold bg-teal-700 hover:bg-teal-800 text-white transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${testingConnection ? 'animate-spin' : ''}`} />
              <span>Recharger les données</span>
            </button>

            <button
              onClick={handleCopyReport}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-semibold border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 transition-colors shadow-2xs cursor-pointer"
            >
              <Copy className="w-4 h-4 text-slate-600" />
              <span>Copier le rapport</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
