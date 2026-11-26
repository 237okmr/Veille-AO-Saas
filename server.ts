import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// SERVER LOG CAPTURE RING BUFFER (Diagnostic monitoring)
// ============================================================================

interface ServerLogEntry {
  id: number;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

const recentServerLogs: ServerLogEntry[] = [];
let nextLogId = 1;

// Masque les secrets (jetons de session, clé du proxy, mots de passe, jeton de lien de connexion)
// avant toute écriture dans le journal : mémoire du diagnostic ET console du serveur.
function masquerSecrets(texte: string): string {
  let t = String(texte);
  const secretProxy = (process.env.PROXY_SHARED_SECRET || '').trim();
  if (secretProxy.length >= 8) t = t.split(secretProxy).join('***');
  return t
    .replace(/([?&](?:token|proxyKey|jeton|key|secret|password|motDePasse)=)[^&\s)"']+/gi, '$1***')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+\/=-]+/gi, '$1***')
    .replace(/("(?:token|proxyKey|jeton|motDePasse|nouveauMotDePasse|ancienMotDePasse|password|secret)"\s*:\s*")[^"]*(")/gi, '$1***$2')
    .replace(/(#acces=)[0-9a-fA-F]{64}/g, '$1***');
}

function captureLog(level: 'info' | 'warn' | 'error', ...args: any[]) {
  const msg = masquerSecrets(args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
  recentServerLogs.push({
    id: nextLogId++,
    timestamp: new Date().toISOString(),
    level,
    message: msg
  });
  if (recentServerLogs.length > 60) {
    recentServerLogs.shift();
  }
}

const origLog = console.log;
const origWarn = console.warn;
const origErr = console.error;

const masquerArg = (a: any) =>
  typeof a === 'string' ? masquerSecrets(a) : (a instanceof Error ? masquerSecrets(a.stack || a.message) : a);

console.log = (...args: any[]) => {
  captureLog('info', ...args);
  origLog(...args.map(masquerArg));
};
console.warn = (...args: any[]) => {
  captureLog('warn', ...args);
  origWarn(...args.map(masquerArg));
};
console.error = (...args: any[]) => {
  captureLog('error', ...args);
  origErr(...args.map(masquerArg));
};

const app = express();

// Configuration trust proxy pour récupérer l'adresse IP réelle du client (ex. derrière Cloud Run)
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ============================================================================
// RATE LIMITING EN MÉMOIRE PAR ADRESSE IP (Sans dépendance externe)
// - /api/auth/login, connexion par lien (/api/auth/lien) et demande pilote (/api/public/pilote) : 10 requêtes / minute
// - /api/public/radar-ticker : 30 requêtes / minute
// - Reste de /api/* : 120 requêtes / minute
// Dépassement -> HTTP 429 + Retry-After + message en français
// Purge automatique des compteurs expirés toutes les 60 secondes
// ============================================================================

interface RateLimitBucket {
  count: number;
  resetTime: number; // timestamp en ms
}

const rateLimitStores = {
  auth: new Map<string, RateLimitBucket>(),
  radar: new Map<string, RateLimitBucket>(),
  api: new Map<string, RateLimitBucket>()
};

// Purge périodique pour éviter toute fuite de mémoire
setInterval(() => {
  const now = Date.now();
  for (const store of Object.values(rateLimitStores)) {
    for (const [ip, bucket] of store.entries()) {
      if (bucket.resetTime <= now) {
        store.delete(ip);
      }
    }
  }
}, 60000).unref();

function getRouteCategory(req: Request): 'auth' | 'radar' | 'api' {
  const rawPath = req.path || '';
  const queryRoute = String(req.query.route || '');
  const bodyRoute = (req.body && typeof req.body === 'object' && req.body.route) ? String(req.body.route) : '';
  const fullContext = `${rawPath} ${queryRoute} ${bodyRoute}`;

  if (fullContext.includes('/auth/login') || fullContext.includes('/auth/lien') || fullContext.includes('/auth/google') || fullContext.includes('/public/pilote')) {
    return 'auth';
  }
  if (rawPath.startsWith('/public/radar-ticker') || rawPath.startsWith('/api/public/radar-ticker') || queryRoute.includes('/public/radar-ticker')) {
    return 'radar';
  }
  return 'api';
}

// Middleware de limitation de débit pour toutes les routes /api/*
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  const clientIp = (req.ip || req.socket.remoteAddress || '127.0.0.1').trim();
  const category = getRouteCategory(req);

  const limits: Record<'auth' | 'radar' | 'api', number> = {
    auth: 10,
    radar: 30,
    api: 120
  };

  const maxAllowed = limits[category];
  const store = rateLimitStores[category];
  const now = Date.now();

  let bucket = store.get(clientIp);
  if (!bucket || bucket.resetTime <= now) {
    bucket = { count: 1, resetTime: now + 60000 };
    store.set(clientIp, bucket);
    return next();
  }

  if (bucket.count >= maxAllowed) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetTime - now) / 1000));
    res.set('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({
      succes: false,
      code: 429,
      message: "Trop de requêtes. Veuillez patienter avant de réessayer.",
      donnees: null,
      timestamp: new Date().toISOString()
    });
  }

  bucket.count++;
  next();
});

// ============================================================================
// PROXY HELPER & ROUTE FORWARDER (Avec AbortController & Retry intelligent)
// ============================================================================

const APPS_SCRIPT_TIMEOUT_MS = Number(process.env.APPS_SCRIPT_TIMEOUT_MS) || 28000;
const APPS_SCRIPT_TIMEOUT_ADMIN_MS = 125000;

const getEffectiveApiUrl = (): string => {
  const raw = (process.env.API_URL || '').trim();
  if (!raw || raw.includes('VOTRE_DEPLOYMENT_ID')) return '';
  if (raw.startsWith('https://script.google.com')) return raw;
  // If user provided deployment ID starting with AKfycb, construct full Web App URL
  if (raw.startsWith('AKfycb')) {
    return `https://script.google.com/macros/s/${raw}/exec`;
  }
  return raw;
};

const isRealApiConfigured = () => {
  const url = getEffectiveApiUrl();
  return Boolean(
    url &&
    url.trim() !== '' &&
    url.startsWith('https://script.google.com') &&
    !url.includes('VOTRE_DEPLOYMENT_ID')
  );
};

// Forwarding helper to Google Apps Script Web App
async function executeForwardRequest(req: Request, targetRoute: string, timeoutMs: number) {
  const url = getEffectiveApiUrl();
  const urlObj = new URL(url);
  urlObj.searchParams.set('route', targetRoute);
  urlObj.searchParams.set('proxyKey', process.env.PROXY_SHARED_SECRET || '');

  // Copy incoming query params
  for (const [key, value] of Object.entries(req.query)) {
    if (key !== 'route') {
      urlObj.searchParams.set(key, String(value));
    }
  }

  // Check auth token from header or query
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    urlObj.searchParams.set('token', authHeader.substring(7));
  } else if (req.query.token) {
    urlObj.searchParams.set('token', String(req.query.token));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const options: RequestInit = {
    method: req.method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    redirect: 'follow',
    signal: controller.signal
  };

  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    const rawBody = (req.body && typeof req.body === 'object') ? req.body : {};
    const authToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string | undefined);
    const bodyWithRoute = {
      ...rawBody,
      route: rawBody.route || targetRoute,
      ...(authToken && !rawBody.token ? { token: authToken } : {})
    };
    options.body = JSON.stringify(bodyWithRoute);
  }

  try {
    const response = await fetch(urlObj.toString(), options);
    clearTimeout(timer);
    const text = await response.text();

    try {
      const parsed = JSON.parse(text);
      return { ok: true, isJson: true, data: parsed, httpStatus: response.status };
    } catch {
      return {
        ok: false,
        isJson: false,
        data: {
          succes: false,
          code: 502,
          message: "Réponse inattendue du service de données, réessayez dans un instant.",
          donnees: null,
          timestamp: new Date().toISOString()
        },
        httpStatus: response.status
      };
    }
  } catch (err: any) {
    clearTimeout(timer);
    const isTimeout = err.name === 'AbortError' || err.code === 20 || String(err.message).includes('aborted');
    return {
      ok: false,
      isJson: false,
      isTimeout,
      data: {
        succes: false,
        code: isTimeout ? 504 : 502,
        message: isTimeout
          ? "Délai d’attente dépassé lors de la communication avec le service de données."
          : `Erreur de connexion avec l'API Google Apps Script : ${err.message || 'Échec réseau'}`,
        donnees: null,
        timestamp: new Date().toISOString()
      },
      httpStatus: isTimeout ? 504 : 502
    };
  }
}

async function forwardToAppsScript(req: Request, targetRoute: string) {
  const isPostAdmin = (req.method === 'POST' || req.method === 'PUT') && targetRoute.startsWith('/admin/');
  const timeoutMs = isPostAdmin ? APPS_SCRIPT_TIMEOUT_ADMIN_MS : APPS_SCRIPT_TIMEOUT_MS;

  // Première tentative
  const firstAttempt = await executeForwardRequest(req, targetRoute, timeoutMs);

  // Si réponse JSON valide (même avec succes: false / 401 / 403 / 404), on retourne directement
  if (firstAttempt.isJson) {
    return firstAttempt.data;
  }

  // Seules les requêtes GET sont relancées en cas d'échec réseau, timeout ou non-JSON
  if (req.method === 'GET') {
    await new Promise(resolve => setTimeout(resolve, 800));
    const retryAttempt = await executeForwardRequest(req, targetRoute, timeoutMs);
    if (retryAttempt.isJson) {
      return retryAttempt.data;
    }
    return retryAttempt.data;
  }

  return firstAttempt.data;
}

// Vérifie que l'appelant est un administrateur connecté (en-tête Authorization uniquement,
// jamais dans l'adresse). Résultat gardé 60 s (accepté) ou 15 s (refusé) pour ne pas solliciter
// Apps Script à chaque appel. Sans en-tête, aucun appel à Apps Script n'est fait.
const adminCache = new Map<string, { ok: boolean; exp: number }>();
let verifsAdminFenetre = { debut: 0, n: 0 };
async function estAdministrateur(req: Request): Promise<boolean> {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return false;
  const token = auth.substring(7).trim();
  if (!token || token.length > 512) return false;

  const cached = adminCache.get(token);
  if (cached && cached.exp > Date.now()) return cached.ok;

  // Plafond : au plus 20 vérifications par minute auprès d'Apps Script (les réponses en cache ne
  // comptent pas), pour qu'une série de faux jetons ne consomme pas le quota d'Apps Script.
  const maintenant = Date.now();
  if (maintenant - verifsAdminFenetre.debut > 60_000) verifsAdminFenetre = { debut: maintenant, n: 0 };
  if (verifsAdminFenetre.n >= 20) return false;
  verifsAdminFenetre.n++;

  let ok = false;
  try {
    if (isRealApiConfigured()) {
      const rep = await forwardToAppsScript(
        { method: 'GET', query: {}, headers: { authorization: `Bearer ${token}` } } as any,
        '/auth/verify'
      );
      ok = Boolean(rep && rep.succes === true && rep.donnees && rep.donnees.role === 'ADMIN');
    }
  } catch {
    ok = false;
  }

  if (adminCache.size >= 500) adminCache.clear();
  adminCache.set(token, { ok, exp: Date.now() + (ok ? 60_000 : 15_000) });
  return ok;
}

function scanSourceForDirectCalls(): Array<{ file: string; line: number; snippet: string }> {
  const results: Array<{ file: string; line: number; snippet: string }> = [];
  const srcDir = path.resolve(__dirname, 'src');

  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (/\.(tsx?|jsx?|html|css)$/.test(entry.name)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n');
          lines.forEach((line, index) => {
            const trimmed = line.trim();
            if (
              trimmed.includes('script.google.com') &&
              !trimmed.includes('VOTRE_DEPLOYMENT_ID') &&
              (trimmed.includes('fetch(') || trimmed.includes('axios') || trimmed.includes('http') || trimmed.includes('XMLHttpRequest'))
            ) {
              results.push({
                file: path.relative(__dirname, fullPath),
                line: index + 1,
                snippet: trimmed
              });
            }
          });
        } catch {
          // ignore read error
        }
      }
    }
  }

  scanDir(srcDir);
  return results;
}

// ============================================================================
// API ROUTES HANDLER (/api/*)
// ============================================================================

app.get('/api/diagnostic/status', async (req: Request, res: Response) => {
  const effectiveUrl = getEffectiveApiUrl();
  const configured = isRealApiConfigured();
  const masked = effectiveUrl ? (effectiveUrl.length > 35 ? effectiveUrl.substring(0, 35) + '...' : effectiveUrl) : '';
  const admin = await estAdministrateur(req);
  const proxySecret = (process.env.PROXY_SHARED_SECRET || '').trim();
  const proxySecretConforme = proxySecret.length >= 32;

  res.set('Cache-Control', 'no-store');
  res.json({
    succes: true,
    code: 200,
    donnees: {
      apiUrlServer: admin ? effectiveUrl : masked,
      apiUrlServerMasked: masked,
      isConfigured: configured,
      mode: configured ? 'APPS_SCRIPT_PRODUCTION' : 'NON_CONFIGURE',
      ...(admin ? { proxySecretConforme } : {}),
      directCalls: admin ? scanSourceForDirectCalls() : [],
      serverLogs: admin ? recentServerLogs.slice(-20) : [],
      journalReserve: !admin
    },
    timestamp: new Date().toISOString()
  });
});

app.get('/api/config', (_req: Request, res: Response) => {
  const effectiveUrl = getEffectiveApiUrl();
  const configured = isRealApiConfigured();
  res.json({
    succes: true,
    code: 200,
    donnees: {
      isConfigured: configured,
      mode: configured ? 'APPS_SCRIPT_PRODUCTION' : 'NON_CONFIGURE',
      apiUrlDisplay: configured ? effectiveUrl.substring(0, 35) + '...' : 'Non configuré',
      googleClientId: (process.env.GOOGLE_CLIENT_ID || '').trim() || null,
      version: '1.0.0-PROD'
    },
    timestamp: new Date().toISOString()
  });
});

// ============================================================================
// PUBLIC RADAR TICKER (Lot 1c : Résistance aux pannes, Cache 24h & Déduplication de promesses)
// - Cache frais : 5 minutes (PUBLIC_RADAR_FRESH_TTL_MS = 5 min)
// - Rétention de repli : 24 heures (PUBLIC_RADAR_MAX_STALE_MS = 24 h)
// - Promesse unique en vol : évite les appels simultanés vers Apps Script
// - En cas d'échec après expiration des 5 min : renvoie les dernières données réelles avec perime: true
// - Sans données réelles en mémoire : renvoie la réponse vide standard
// ============================================================================

interface LastRealRadarSnapshot {
  data: any;
  timestamp: number;
}

let lastRealRadarSnapshot: LastRealRadarSnapshot | null = null;
let inFlightRadarPromise: Promise<any> | null = null;

const PUBLIC_RADAR_FRESH_TTL_MS = 5 * 60 * 1000;       // 5 minutes de validité nominale
const PUBLIC_RADAR_MAX_STALE_MS = 24 * 60 * 60 * 1000; // 24 heures de rétention maximale en cas de panne

async function fetchRadarTickerShared(): Promise<any> {
  if (inFlightRadarPromise) {
    return inFlightRadarPromise;
  }

  inFlightRadarPromise = (async () => {
    try {
      const apiResponse = await forwardToAppsScript(
        { method: 'GET', query: {}, headers: {} } as any,
        '/public/radar-ticker'
      );
      if (apiResponse && apiResponse.succes && apiResponse.donnees && !apiResponse.donnees.simulation) {
        lastRealRadarSnapshot = {
          data: apiResponse.donnees,
          timestamp: Date.now()
        };
      }
      return apiResponse;
    } catch (err) {
      console.warn('[Radar Public Ticker] Erreur lors du rafraîchissement Apps Script:', err);
      return null;
    } finally {
      inFlightRadarPromise = null;
    }
  })();

  return inFlightRadarPromise;
}

app.get('/api/public/radar-ticker', async (_req: Request, res: Response) => {
  const now = Date.now();

  // 1. Cache nominal frais (< 5 minutes)
  if (lastRealRadarSnapshot && (now - lastRealRadarSnapshot.timestamp < PUBLIC_RADAR_FRESH_TTL_MS)) {
    return res.json({
      succes: true,
      code: 200,
      message: "Radar Ticker récupéré du cache frais (TTL 5 min)",
      donnees: {
        ...lastRealRadarSnapshot.data,
        perime: false
      },
      timestamp: new Date().toISOString()
    });
  }

  // 2. Si l'API réelle est configurée, tentative de rafraîchissement (partagée entre requêtes concurrentes)
  if (isRealApiConfigured()) {
    const apiResponse = await fetchRadarTickerShared();
    if (apiResponse && apiResponse.succes && apiResponse.donnees && !apiResponse.donnees.simulation) {
      return res.json({
        succes: true,
        code: 200,
        message: "Radar Ticker actualisé depuis Apps Script",
        donnees: {
          ...apiResponse.donnees,
          perime: false
        },
        timestamp: new Date().toISOString()
      });
    }
  }

  // 3. Repli résistant : si Apps Script a échoué mais qu'une réponse réelle existe depuis < 24 h
  if (lastRealRadarSnapshot && (now - lastRealRadarSnapshot.timestamp < PUBLIC_RADAR_MAX_STALE_MS)) {
    return res.json({
      succes: true,
      code: 200,
      message: "Radar Ticker renvoyé depuis la dernière synchronisation réelle (données en cache périmées)",
      donnees: {
        ...lastRealRadarSnapshot.data,
        perime: true
      },
      timestamp: new Date().toISOString()
    });
  }

  // 4. Repli vide sans aucune donnée réelle en mémoire (ne fabrique JAMAIS de fausses données)
  return res.json({
    succes: true,
    code: 200,
    message: "Aucun avis public disponible : données d'exemple côté interface.",
    donnees: {
      simulation: true,
      perime: false,
      blips: [],
      derniereSynchro: null,
      statutSynchro: null,
      totalAvisAnalysesPeriode: null,
      sourcesOverview: null
    },
    timestamp: new Date().toISOString()
  });
});

// ============================================================================
// CONNEXION ADMINISTRATEUR PAR GOOGLE
// - Le navigateur envoie le jeton Google (credential) ; l'adresse n'est JAMAIS prise dans le corps.
// - Google vérifie la signature et l'expiration (tokeninfo) ; on contrôle l'audience, l'émetteur et l'adresse vérifiée.
// - Apps Script ouvre la session seulement si le secret dédié GOOGLE_ADMIN_SECRET est présenté
//   et si l'adresse correspond à un compte ADMIN actif.
// - Réponse d'échec neutre : aucune indication sur l'existence du compte.
// ============================================================================
const reponseRefusGoogle = (res: Response, code = 401, message = 'Accès refusé.') =>
  res.status(code).json({ succes: false, code, message, donnees: null, timestamp: new Date().toISOString() });

app.post('/api/auth/google', async (req: Request, res: Response) => {
  const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
  const secretGoogle = (process.env.GOOGLE_ADMIN_SECRET || '').trim();
  if (!clientId || secretGoogle.length < 32 || !isRealApiConfigured()) {
    return reponseRefusGoogle(res, 503, 'Connexion Google indisponible.');
  }

  const credential = req.body && typeof req.body.credential === 'string' ? req.body.credential.trim() : '';
  if (!credential || credential.length > 4096) return reponseRefusGoogle(res);

  let info: any = null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential),
      { signal: ctrl.signal }
    );
    clearTimeout(timer);
    if (!r.ok) return reponseRefusGoogle(res);
    info = await r.json();
  } catch {
    return reponseRefusGoogle(res, 502, 'Connexion Google momentanément indisponible.');
  }

  const emetteurOk = info && (info.iss === 'https://accounts.google.com' || info.iss === 'accounts.google.com');
  const expOk = info && Number(info.exp) * 1000 > Date.now();
  const verifie = info && (info.email_verified === true || info.email_verified === 'true');
  const email = info && typeof info.email === 'string' ? info.email.trim().toLowerCase() : '';
  if (!info || info.aud !== clientId || !emetteurOk || !expOk || !verifie || !email) {
    return reponseRefusGoogle(res);
  }

  try {
    const rep = await forwardToAppsScript(
      {
        method: 'POST',
        query: {},
        headers: {},
        body: { route: '/auth/google-admin', email, secretGoogle }
      } as any,
      '/auth/google-admin'
    );
    if (rep && rep.succes === true && rep.donnees && rep.donnees.role === 'ADMIN') {
      return res.status(200).json(rep);
    }
    return reponseRefusGoogle(res, rep && rep.code === 503 ? 503 : 401, rep && rep.code === 503 ? 'Connexion Google indisponible.' : 'Accès refusé.');
  } catch {
    return reponseRefusGoogle(res, 502, 'Connexion Google momentanément indisponible.');
  }
});

// ============================================================================
// CHANTIER 2 — LECTURE RAPIDE DEPUIS SUPABASE (repli automatique sur Apps Script)
// Le classeur Google Sheets reste la référence ; ces deux routes ne font QUE
// lire une copie en lecture seule, alimentée par apps-script/SaaS_30_SyncSupabase.gs.
// Aucune écriture ici. Si Supabase n'est pas configuré, injoignable ou en erreur,
// on repart automatiquement sur le comportement actuel (proxy vers Apps Script).
// ============================================================================

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_PUBLISHABLE_KEY = (process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();
const SUPABASE_READ_TIMEOUT_MS = 4000;
const SUPABASE_PAGE_SIZE = 1000; // PostgREST plafonne à 1000 lignes par requête par défaut.

const isSupabaseConfigured = () => Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

// Récupère TOUTES les lignes d'une table, par pages de SUPABASE_PAGE_SIZE (en-tête Range),
// pour ne jamais tronquer silencieusement au-delà de la limite par défaut de PostgREST.
async function supabaseSelect(table: string): Promise<any[] | null> {
  if (!isSupabaseConfigured()) return null;
  const toutes: any[] = [];
  let depart = 0;
  try {
    for (;;) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), SUPABASE_READ_TIMEOUT_MS);
      const fin = depart + SUPABASE_PAGE_SIZE - 1;
      const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
          Range: `${depart}-${fin}`
        },
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!response.ok && response.status !== 206) return null;
      const page = await response.json();
      if (!Array.isArray(page)) return null;
      toutes.push(...page);
      if (page.length < SUPABASE_PAGE_SIZE) break;
      depart += SUPABASE_PAGE_SIZE;
    }
    return toutes;
  } catch (err) {
    console.warn('[Chantier 2] Lecture Supabase indisponible, repli sur Apps Script :', (err as Error).message);
    return null;
  }
}

// Même logique de normalisation que saasAvisNormaliser_ (Apps Script) : minuscules, sans accents.
function supaNormaliser(valeur: any): string {
  if (valeur === null || valeur === undefined) return '';
  return String(valeur)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

function supaFacette(lignes: any[], champ: string) {
  const effectifs: Record<string, number> = {};
  lignes.forEach((a) => {
    const v = a[champ];
    if (v === null || v === undefined || v === '') return;
    effectifs[v] = (effectifs[v] || 0) + 1;
  });
  return Object.keys(effectifs)
    .map((v) => ({ valeur: v, nombre: effectifs[v] }))
    .sort((x, y) => y.nombre - x.nombre || String(x.valeur).localeCompare(String(y.valeur)));
}

// Convertit une ligne Supabase (colonnes snake_case) vers la forme attendue par l'interface
// (identique à ce que renvoie saasAvisSansInterne_ côté Apps Script).
function supaAvisVersForme(a: any) {
  return {
    idAvis: a.id_avis,
    numeroAvis: a.numero_avis,
    titre: a.titre,
    autorite: a.autorite,
    region: a.region,
    source: a.source,
    sourceType: a.source_type,
    procedure: a.procedure,
    montant: a.montant,
    montantTexte: a.montant_texte,
    dateLimite: a.date_limite,
    dateLimiteEstimee: a.date_limite_estimee,
    dateLimiteTexte: a.date_limite_texte,
    datePublication: a.date_publication,
    dateCollecte: a.date_collecte,
    statut: a.statut,
    lien: a.lien,
    lienDao: a.lien_dao,
    typePublication: a.type_publication,
    attributaire: a.attributaire,
    montantAttribue: a.montant_attribue,
    dateAttribution: a.date_attribution,
    _ligne: a.ligne,
    _recherche: a.recherche || '',
    _tsCollecte: a.date_collecte ? new Date(a.date_collecte).getTime() : null,
    _tsLimite: a.date_limite ? new Date(a.date_limite).getTime() : null,
    // Le jour de collecte (fuseau Douala) est déjà dans les 10 premiers caractères
    // de l'ISO stocké (yyyy-MM-ddTHH:mm:ss+01:00) : pas besoin de recalcul de fuseau.
    _jourCollecte: a.date_collecte ? String(a.date_collecte).slice(0, 10) : null
  };
}

// Reproduit fidèlement saasAdminAvisList (SaaS_23_AvisCollectes.gs) : mêmes filtres,
// même tri, mêmes facettes, même pagination — mais sur la copie Supabase.
async function tryAdminAvisFromSupabase(query: any) {
  const lignesBrutes = await supabaseSelect('avis');
  if (!lignesBrutes) return null;
  const tous = lignesBrutes.map(supaAvisVersForme);

  const p = query || {};
  const limit = Math.min(100, Math.max(1, parseInt(p.limit, 10) || 25));
  const offset = Math.max(0, parseInt(p.offset, 10) || 0);

  function filtreTexte(v: any) {
    const n = supaNormaliser(v);
    return (n === '' || n === 'tous') ? '' : n;
  }
  const fSource = filtreTexte(p.source);
  const fStatut = filtreTexte(p.statut);
  const fType = filtreTexte(p.typePublication);
  const q = supaNormaliser(p.q);
  const dateFrom = /^\d{4}-\d{2}-\d{2}$/.test(String(p.dateFrom || '')) ? String(p.dateFrom) : '';
  const dateTo = /^\d{4}-\d{2}-\d{2}$/.test(String(p.dateTo || '')) ? String(p.dateTo) : '';
  const sortBy = ['dateCollecte', 'dateLimite', 'montant'].indexOf(String(p.sortBy)) >= 0 ? String(p.sortBy) : 'dateCollecte';
  const sortOrder = String(p.sortOrder).toLowerCase() === 'asc' ? 'asc' : 'desc';

  const filtres = tous.filter((a: any) => {
    if (fSource && supaNormaliser(a.source) !== fSource) return false;
    if (fStatut && supaNormaliser(a.statut) !== fStatut) return false;
    if (fType && supaNormaliser(a.typePublication) !== fType) return false;
    if (q && a._recherche.indexOf(q) === -1) return false;
    if (dateFrom || dateTo) {
      if (!a._jourCollecte) return false;
      if (dateFrom && a._jourCollecte < dateFrom) return false;
      if (dateTo && a._jourCollecte > dateTo) return false;
    }
    return true;
  });

  function valeurTri(a: any) {
    if (sortBy === 'montant') return a.montant;
    if (sortBy === 'dateLimite') return a._tsLimite;
    return a._tsCollecte;
  }
  const sens = sortOrder === 'asc' ? 1 : -1;
  filtres.sort((a: any, b: any) => {
    const va = valeurTri(a), vb = valeurTri(b);
    const aNul = (va === null || va === undefined), bNul = (vb === null || vb === undefined);
    if (aNul && bNul) return (b._ligne || 0) - (a._ligne || 0);
    if (aNul) return 1;
    if (bNul) return -1;
    if (va !== vb) return (va - vb) * sens;
    return (b._ligne || 0) - (a._ligne || 0);
  });

  const page = filtres.slice(offset, offset + limit).map((a: any) => {
    const { _recherche, _tsCollecte, _tsLimite, _jourCollecte, _ligne, ...reste } = a;
    return reste;
  });

  return {
    succes: true,
    code: 200,
    message: 'Avis collectés récupérés.',
    donnees: {
      total: filtres.length,
      limit,
      offset,
      count: page.length,
      avis: page,
      facettes: {
        sources: supaFacette(tous, 'source'),
        statuts: supaFacette(tous, 'statut'),
        typesPublication: supaFacette(tous, 'typePublication')
      }
    },
    timestamp: new Date().toISOString()
  };
}

// Convertit une ligne Supabase "alertes_client" vers la forme AdminClientAlertItem attendue.
function supaAlerteVersForme(al: any) {
  return {
    idMatch: al.id_match,
    _ligne: al.ligne,
    idAO: al.id_avis,
    numeroAvis: al.numero_avis,
    idClient: al.id_client,
    nomClient: al.nom_client,
    emailDestinataire: al.email_destinataire,
    dateMatch: al.date_match,
    statut: al.statut_pipeline,
    dateEnvoi: al.date_envoi,
    score: al.score,
    justification: al.justification,
    scoreMots: al.score_mots,
    scoreIA: al.score_ia,
    titre: al.titre,
    maitreOuvrage: al.maitre_ouvrage,
    region: al.region,
    montant: al.montant,
    dateLimite: al.date_limite,
    lienDetail: al.lien_detail,
    lienDAO: al.lien_dao
  };
}

// Reproduit fidèlement saasAdminClientAlerts (SaaS_20_Admin.gs) sur la copie Supabase.
async function tryAdminClientAlertsFromSupabase(query: any) {
  const idClient = String(query?.idClient || '').trim();
  if (!idClient) return null;
  const lignesBrutes = await supabaseSelect('alertes_client');
  if (!lignesBrutes) return null;

  const p = query || {};
  const statutFiltre = String(p.statut || '').toUpperCase();
  const scoreMin = p.scoreMin !== undefined ? parseFloat(p.scoreMin) : null;
  const search = String(p.search || '').toLowerCase();
  const limit = Math.min(500, Math.max(1, Number(p.limit) || 25));
  const offset = Math.max(0, Number(p.offset) || 0);

  const alertes = lignesBrutes
    .filter((al: any) => al.id_client === idClient)
    .map(supaAlerteVersForme)
    .filter((al: any) => {
      if (statutFiltre && statutFiltre !== 'TOUS' && String(al.statut).toUpperCase() !== statutFiltre) return false;
      if (scoreMin !== null && (Number(al.score) || 0) < scoreMin) return false;
      if (search) {
        const hay = `${al.numeroAvis} ${al.titre} ${al.maitreOuvrage} ${al.justification}`.toLowerCase();
        if (hay.indexOf(search) === -1) return false;
      }
      return true;
    });

  // Même tri que saasAdminClientAlerts (dateMatch desc) ; departage par position dans
  // ALERTES_A_ENVOYER (ascendant) pour reproduire l'ordre d'un tri stable sur le classeur.
  alertes.sort((a: any, b: any) => {
    const diff = new Date(b.dateMatch).getTime() - new Date(a.dateMatch).getTime();
    if (diff !== 0) return diff;
    return (a._ligne || 0) - (b._ligne || 0);
  });

  const total = alertes.length;
  const page = alertes.slice(offset, offset + limit).map((a: any) => { const { _ligne, ...reste } = a; return reste; });

  return {
    succes: true,
    code: 200,
    message: 'Alertes récupérées.',
    donnees: { total, limit, offset, count: page.length, alertes: page },
    timestamp: new Date().toISOString()
  };
}

app.get('/api/admin/avis', async (req: Request, res: Response) => {
  if (!(await estAdministrateur(req))) {
    return res.status(401).json({ succes: false, code: 401, message: 'Authentification administrateur requise.', donnees: null, timestamp: new Date().toISOString() });
  }
  try {
    const rapide = await tryAdminAvisFromSupabase(req.query);
    if (rapide) return res.json(rapide);
  } catch (err) {
    console.warn('[Chantier 2] Echec de la lecture rapide (avis), repli sur Apps Script :', err);
  }
  const apiResponse = await forwardToAppsScript(req, '/admin/avis');
  return res.status(apiResponse.code || 200).json(apiResponse);
});

app.get('/api/admin/clients/alerts', async (req: Request, res: Response) => {
  if (!(await estAdministrateur(req))) {
    return res.status(401).json({ succes: false, code: 401, message: 'Authentification administrateur requise.', donnees: null, timestamp: new Date().toISOString() });
  }
  try {
    const rapide = await tryAdminClientAlertsFromSupabase(req.query);
    if (rapide) return res.json(rapide);
  } catch (err) {
    console.warn('[Chantier 2] Echec de la lecture rapide (alertes), repli sur Apps Script :', err);
  }
  const apiResponse = await forwardToAppsScript(req, '/admin/clients/alerts');
  return res.status(apiResponse.code || 200).json(apiResponse);
});

// Proxy router for all other /api/* requests
app.all('/api/*', async (req: Request, res: Response) => {
  const rawSubPath = req.path.replace(/^\/api/, '');
  const queryRoute = req.query.route as string;
  const bodyRoute = req.body?.route as string;
  const requestedRoute = queryRoute || bodyRoute;
  
  const subPath = (rawSubPath === '/proxy' && requestedRoute)
    ? (requestedRoute.startsWith('/') ? requestedRoute : `/${requestedRoute}`)
    : rawSubPath;

  // 1. If real Apps Script URL is set and valid, proxy directly!
  if (isRealApiConfigured()) {
    try {
      const apiResponse = await forwardToAppsScript(req, subPath);
      return res.status(apiResponse.code || 200).json(apiResponse);
    } catch (err: any) {
      console.error(`[API Proxy Error on ${subPath}]:`, err);
      return res.status(502).json({
        succes: false,
        code: 502,
        message: `Erreur de connexion avec l'API Google Apps Script : ${err.message || 'Délai d’attente dépassé'}`,
        donnees: null,
        timestamp: new Date().toISOString()
      });
    }
  }

  // 2. Database connection is not configured -> return 503 for all /api/* routes (including /api/ping)
  return res.status(503).json({
    succes: false,
    code: 503,
    message: "Service momentanément indisponible : la connexion à la base de données n'est pas configurée. Contactez l'administrateur.",
    donnees: null,
    timestamp: new Date().toISOString()
  });
});

// ============================================================================
// VITE MIDDLEWARE OR STATIC PRODUCTION FILES
// ============================================================================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`[Market Advisor CM] Server running on http://0.0.0.0:${PORT}`);
    if (isRealApiConfigured()) {
      console.log(`[Market Advisor CM] API Target: ${getEffectiveApiUrl().substring(0, 35)}...`);
      const proxySecret = (process.env.PROXY_SHARED_SECRET || '').trim();
      if (proxySecret.length < 32) {
        console.warn(`[Market Advisor CM] AVERTISSEMENT : PROXY_SHARED_SECRET est absente ou comporte moins de 32 caractères. Le mode de vérification stricte (ENFORCE) d'Apps Script est inopérant.`);
      }
    } else {
      console.warn(`[Market Advisor CM] AVERTISSEMENT : Variable d'environnement API_URL non configurée. Les routes API répondront HTTP 503.`);
    }
  });
}

startServer();
