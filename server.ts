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
// - /api/auth/login et connexion par lien (/api/auth/lien) : 10 requêtes / minute
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

  if (fullContext.includes('/auth/login') || fullContext.includes('/auth/lien')) {
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
