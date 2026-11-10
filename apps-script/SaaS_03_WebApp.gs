// >>> FICHIER : SaaS_03_WebApp.gs <<< (à coller dans l'onglet du même nom)
/**
 * ============================================================================
 * SAAS — ROUTEUR WEB APP (V1.1 — LOT S5a)
 * ============================================================================
 * Point d'entrée HTTP de l'API SaaS. Reçoit les requêtes GET et POST,
 * authentifie, route vers le bon handler, et retourne du JSON.
 *
 * DÉPLOIEMENT :
 *   1. Déployer > Nouveau déploiement > Type : Application Web
 *   2. Exécuter en tant que : Moi
 *   3. Qui a accès : Tout le monde (ou Tout le monde avec compte Google)
 *   4. Copier l'URL /exec → à donner au frontend
 *
 * ROUTES PUBLIQUES (sans connexion) : /ping, /auth/login, /auth/lien, /auth/verify, /public/radar-ticker, /public/pilote.
 *
 * CONVENTIONS D'URL :
 *   GET  {url}?route=/auth/verify&token=xxx
 *   POST {url}  avec body JSON { "route": "/auth/login", "email": ..., ... }
 * ============================================================================
 */

// Identifiant de version du code (visible via ?route=/ping) : permet de vérifier que le
// DÉPLOIEMENT WEB exécute bien la dernière version du code (le déploiement ne suit pas
// l'éditeur : il faut publier une nouvelle version après chaque modification).
const SAAS_BUILD = "2026-11-10-PIL5";

// ============================================================================
// LOT S5a — CLÉ DU PROXY (secret partagé entre le proxy et cette application web)
// ============================================================================
// Trois modes, réglés par la propriété du script PROXY_SECRET_MODE :
//   OFF      (défaut) : aucune vérification.
//   OBSERVE  : la clé est vérifiée et comptée, mais rien n'est refusé.
//   ENFORCE  : toute requête sans la bonne clé est refusée (403 « Accès refusé »).
// Le secret est dans la propriété du script PROXY_SHARED_SECRET (jamais dans le code).
// Le proxy envoie la clé dans le champ « proxyKey » du corps de la requête.
// Une requête POST portant la bonne clé peut demander d'être traitée comme une requête
// GET (champ « methodeHttp »), car les routes de lecture n'acceptent que GET.
// Réglages : saasProxyModeOff / saasProxyModeObserve / saasProxyModeEnforce (SaaS_04_Securite.gs).
// ============================================================================

/** Comparaison à durée constante (évite de deviner le secret par le temps de réponse). */
function saasComparerSecret(a, b) {
  const x = String(a === null || a === undefined ? "" : a);
  const y = String(b === null || b === undefined ? "" : b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
}

/** Compte approximativement les appels reçus, par heure (mémoire cache, 6 h). */
function saasProxyCompter(type) {
  try {
    const cache = CacheService.getScriptCache();
    const cle = "PX_" + type + "_" + Utilities.formatDate(new Date(), "Africa/Douala", "yyyyMMddHH");
    cache.put(cle, String((parseInt(cache.get(cle) || "0", 10) || 0) + 1), 21600);
  } catch (e) {}
}

/**
 * Vérifie la clé du proxy et retire les champs techniques du payload.
 * @return {Object} { mode, valide, autorise }
 */
function saasProxyControle(payload, e, config) {
  // « config » ({ secret, mode, sansCompteur }) est réservé aux tests ; en production, lecture des propriétés.
  const props = config ? null : PropertiesService.getScriptProperties();
  const secret = String(config ? (config.secret || "") : (props.getProperty("PROXY_SHARED_SECRET") || ""));
  const mode = String(config ? (config.mode || "OFF") : (props.getProperty("PROXY_SECRET_MODE") || "OFF")).trim().toUpperCase();

  let presentee = "";
  if (payload && payload.proxyKey) presentee = String(payload.proxyKey);
  else if (e && e.parameter && e.parameter.proxyKey) presentee = String(e.parameter.proxyKey);

  const valide = secret.length >= 32 && presentee !== "" && saasComparerSecret(presentee, secret);
  if (payload) delete payload.proxyKey;

  if ((mode === "OBSERVE" || mode === "ENFORCE") && !(config && config.sansCompteur)) saasProxyCompter(valide ? "OK" : "KO");

  // Sécurité : sans secret configuré, le mode ENFORCE est ignoré (on ne verrouille pas tout par erreur)
  const enforce = (mode === "ENFORCE") && secret.length >= 32;
  return { mode: mode, valide: valide, autorise: !enforce || valide };
}

/** Réponse générique aux requêtes refusées (aucun indice sur la raison). */
function saasProxyRefuser(e) {
  try {
    const cache = CacheService.getScriptCache();
    if (cache.get("PX_REFUS_LOG") === null) {
      cache.put("PX_REFUS_LOG", "1", 60);   // une ligne d'audit par minute au plus
      saasLogger("", "", "", "PROXY_REFUS", "Requête sans clé de proxy valide refusée", saasExtraireIp(e), false);
    }
  } catch (err) {}
  return saasErreur("Accès refusé.", 403);
}

/**
 * Routeur GET.
 */
function doGet(e) {
  try {
    const route = (e && e.parameter && e.parameter.route) || "";
    const payload = e && e.parameter ? e.parameter : {};

    const controle = saasProxyControle(payload, e);
    if (!controle.autorise) return saasProxyRefuser(e);

    return saasRouter("GET", route, payload, e);
  } catch (err) {
    // LOT S3 : le détail technique reste dans le journal, jamais renvoyé à l'appelant
    const ref = Utilities.getUuid().substring(0, 8);
    Logger.log("[SAAS doGet] Exception (réf. " + ref + ") : " + err.message);
    return saasErreur("Erreur serveur (réf. " + ref + ").", 500);
  }
}

/**
 * Routeur POST.
 * Le frontend envoie un JSON avec au minimum le champ "route".
 */
function doPost(e) {
  try {
    const payload = saasLirePayloadPost(e);
    const route = (payload && payload.route) || "";

    const controle = saasProxyControle(payload, e);
    if (!controle.autorise) return saasProxyRefuser(e);

    // Une requête portant la bonne clé peut demander d'être traitée comme un GET
    let methode = "POST";
    if (controle.valide && String(payload.methodeHttp || "").toUpperCase() === "GET") methode = "GET";
    if (payload) delete payload.methodeHttp;

    return saasRouter(methode, route, payload, e);
  } catch (err) {
    // LOT S3 : le détail technique reste dans le journal, jamais renvoyé à l'appelant
    const ref = Utilities.getUuid().substring(0, 8);
    Logger.log("[SAAS doPost] Exception (réf. " + ref + ") : " + err.message);
    return saasErreur("Erreur serveur (réf. " + ref + ").", 500);
  }
}

/**
 * Routeur central.
 * @param {string} methode "GET" ou "POST"
 * @param {string} route chemin logique (ex. "/auth/login")
 * @param {Object} payload données reçues
 * @param {Object} e événement brut
 */
function saasRouter(methode, route, payload, e) {
  const r = (route || "").replace(/\/+$/, ""); // sans slash final
  const ip = saasExtraireIp(e);

  Logger.log("[SAAS " + methode + "] " + r + " (IP: " + ip + ")");

  // ------------------------------------------------------------------
  // ROUTES PUBLIQUES (pas d'authentification)
  // ------------------------------------------------------------------
  if (r === "/ping" || r === "" || r === "/") {
    return saasReponse(true, {
      service: "Veille Marchés Publics — API SaaS",
      version: "1.0",
      build: SAAS_BUILD,
      fichier: SpreadsheetApp.getActiveSpreadsheet().getName(),
      timestamp: saasDateMaintenant()
    }, "API opérationnelle.", 200);
  }

  // Radar de la page d'accueil : lecture seule, champs publics uniquement, mis en cache 5 min
  // (SaaS_23_AvisCollectes.gs). Reste soumis au contrôle de la clé du proxy (doGet / doPost).
  if (r === "/public/radar-ticker" && methode === "GET") {
    return saasPublicRadarTicker(payload, e);
  }

  // Demande d'accès pilote : enregistrée dans DEMANDES_PILOTE + e-mail à l'admin (SaaS_24_DemandesPilote.gs).
  // Soumise au contrôle de la clé du proxy (doGet / doPost) comme toutes les routes.
  if (r === "/public/pilote" && methode === "POST") {
    return saasPiloteDemande(payload, e);
  }

  // Confirmation du lien reçu par e-mail : crée l'espace pilote et connecte (SaaS_25_PiloteAuto.gs).
  if (r === "/public/pilote/confirmer" && methode === "POST") {
    return saasPiloteConfirmer(payload, e);
  }

  if (r === "/auth/register" && methode === "POST") {
    return saasAuthRegister(payload, e);
  }

  if (r === "/auth/login" && methode === "POST") {
    return saasAuthLogin(payload, e);
  }

  // Connexion par lien à usage unique des e-mails d'alerte (LOT LC1, SaaS_02_Auth.gs).
  // Inactive tant que la propriété du script SAAS_LIEN_ACTIF n'est pas égale à OUI.
  if (r === "/auth/lien" && methode === "POST") {
    return saasAuthLien(payload, e);
  }

  if (r === "/auth/logout" && methode === "POST") {
    return saasAuthLogout(payload, e);
  }

  if ((r === "/auth/verify" || r === "/auth/me") && (methode === "GET" || methode === "POST")) {
    return saasAuthVerify(payload, e);
  }

  // ------------------------------------------------------------------
  // À PARTIR D'ICI : AUTHENTIFICATION OBLIGATOIRE
  // ------------------------------------------------------------------
  const user = saasAuthGetCurrentUser(e, payload);
  if (!user) {
    saasLogger("", "", "", "AUTH_FAIL", "Route: " + r, ip, false);
    return saasErreur("Session invalide ou expirée. Veuillez vous reconnecter.", 401);
  }

  // ------------------------------------------------------------------
  // ROUTES CLIENT (Phase 2 — stub pour l'instant)
  // ------------------------------------------------------------------
  if (r.indexOf("/client/") === 0) {
    if (typeof saasRouterClient === "function") {
      return saasRouterClient(r, methode, payload, user, e);
    }
    return saasErreur("Routes client non encore installées (Phase 2).", 501);
  }

  // ------------------------------------------------------------------
  // ROUTES ADMIN (Phase 3 — stub pour l'instant)
  // ------------------------------------------------------------------
  if (r.indexOf("/admin/") === 0) {
    if (user.role !== "ADMIN") {
      saasLogger(user.idUser, user.email, user.role, "ADMIN_FORBIDDEN", "Route: " + r, ip, false);
      return saasErreur("Accès administrateur requis.", 403);
    }
    if (typeof saasRouterAdmin === "function") {
      return saasRouterAdmin(r, methode, payload, user, e);
    }
    return saasErreur("Routes admin non encore installées (Phase 3).", 501);
  }

  // ------------------------------------------------------------------
  // ROUTE INCONNUE
  // ------------------------------------------------------------------
  saasLogger(user.idUser, user.email, user.role, "ROUTE_INCONNUE", "Route: " + r, ip, false);
  return saasErreur("Route inconnue : " + r, 404);
}

// ============================================================================
// TESTS MANUELS
// ============================================================================

/**
 * RETIRÉE (LOT S3) : créait un compte admin avec un mot de passe par défaut écrit
 * dans le code. Utiliser saasCreerAdminDepuisProprietes() ci-dessous.
 */
function saasCreerAdminParDefaut() {
  Logger.log("Fonction retirée par sécurité (mot de passe par défaut).");
  Logger.log("→ Utiliser saasCreerAdminDepuisProprietes().");
}

/**
 * Crée un compte ADMIN à partir des PROPRIÉTÉS DU SCRIPT (aucun mot de passe dans le code) :
 *   ADMIN_CREATION_EMAIL  = adresse du nouvel admin
 *   ADMIN_NOUVEAU_MDP     = son mot de passe (12 caractères minimum, lettre + chiffre)
 * Les deux propriétés sont effacées après création. Refuse si l'e-mail existe déjà.
 */
function saasCreerAdminDepuisProprietes() {
  const props = PropertiesService.getScriptProperties();
  const email = String(props.getProperty("ADMIN_CREATION_EMAIL") || "").trim().toLowerCase();
  const mdp = props.getProperty("ADMIN_NOUVEAU_MDP");

  if (!email || !mdp) {
    Logger.log("❌ Propriétés ADMIN_CREATION_EMAIL et ADMIN_NOUVEAU_MDP requises. Rien n'a été créé.");
    return;
  }
  if (!saasEmailValide(email)) { Logger.log("❌ E-mail invalide. Rien n'a été créé."); return; }
  if (typeof saasSecMotifMotDePasseFaible === "function") {
    const motif = saasSecMotifMotDePasseFaible(mdp);
    if (motif) { Logger.log("❌ Mot de passe refusé : " + motif + ". Rien n'a été créé."); return; }
  } else if (!saasMotDePasseValide(mdp) || String(mdp).length < 12) {
    Logger.log("❌ Mot de passe trop court (12 caractères minimum). Rien n'a été créé.");
    return;
  }
  if (saasTrouverUtilisateurParEmail(email)) { Logger.log("ℹ Cet e-mail existe déjà. Rien n'a été créé."); return; }

  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_UTILISATEURS);
  if (!feuille) { Logger.log("❌ Structure non initialisée. Lancez saasInitialiserStructure()."); return; }

  const idUser = saasGenererId("USR");
  const sel = saasGenererSel();
  const hash = saasHacherMotDePasse(mdp, sel);
  feuille.appendRow([idUser, email, hash, sel, "Administrateur", "", "ADMIN", "", "OUI", saasDateMaintenant(), "", "fr", ""]);

  props.deleteProperty("ADMIN_CREATION_EMAIL");
  props.deleteProperty("ADMIN_NOUVEAU_MDP");
  saasLogger(idUser, email, "ADMIN", "ADMIN_CREATE", "via éditeur Apps Script", "", true);

  Logger.log("✅ Compte ADMIN créé : " + email + " (" + idUser + "). Propriétés effacées.");
}

/**
 * Test de la Web App : à exécuter manuellement pour vérifier
 * que le routeur répond correctement.
 */
function saasTesterRouteur() {
  Logger.log("=== TEST ROUTEUR SAAS ===");

  // Test /ping
  Logger.log("");
  Logger.log("▶ Test /ping");
  const r1 = saasRouter("GET", "/ping", {}, { parameter: {} });
  Logger.log("  → " + r1.getContent());

  // Test /auth/login (sans identifiants valides)
  Logger.log("");
  Logger.log("▶ Test /auth/login (échec attendu)");
  const r2 = saasRouter("POST", "/auth/login", { email: "x@x.cm", motDePasse: "x" }, { parameter: {} });
  Logger.log("  → " + r2.getContent());

  // Test /client/profile (sans token)
  Logger.log("");
  Logger.log("▶ Test /client/profile (401 attendu)");
  const r3 = saasRouter("GET", "/client/profile", {}, { parameter: {} });
  Logger.log("  → " + r3.getContent());

  Logger.log("");
  Logger.log("=== FIN DES TESTS ===");
}
/**
 * 📄 SaaS_03_WebApp.gs — saasVerifierInstallationPhase3()
 * Vérifie localement (sans HTTP) que tous les modules et handlers
 * attendus sont accessibles. Aucune confusion possible avec un problème
 * de déploiement : ce test tourne directement dans l'éditeur.
 *
 * Usage : sélectionner saasVerifierInstallationPhase3 puis ▶ Exécuter.
 */
function saasVerifierInstallationPhase3() {
  Logger.log("=================================================");
  Logger.log("=== VÉRIFICATION INSTALLATION PHASE 3 ===");
  Logger.log("Fichier : " + SpreadsheetApp.getActiveSpreadsheet().getName());
  Logger.log("=================================================");
  Logger.log("");

  const fonctionsAttendues = [
    // Phase 1
    "saasInitialiserStructure", "saasReponse", "saasErreur",
    "saasAuthLogin", "saasAuthGetCurrentUser", "saasRouter",
    "saasCreerAdminDepuisProprietes",
    // Phase 2
    "saasMigrerPhase2", "saasRouterClient", "saasRouterAlerts", "saasRouterStats",
    // Phase 3 — LE POINT CRITIQUE
    "saasRouterAdmin", "saasRouterAdminAudit", "saasRouterAdminActions",
    "saasAdminClientsList", "saasAdminClientCreate",
    "saasAdminUsersList", "saasAdminStats", "saasAdminActionsRun"
  ];

  Logger.log("--- FONCTIONS DÉTECTÉES ---");
  const manquantes = [];
  fonctionsAttendues.forEach(function (f) {
    const existe = typeof globalThis[f] === "function";
    Logger.log("  " + (existe ? "✅" : "❌") + "  " + f);
    if (!existe) manquantes.push(f);
  });

  Logger.log("");
  if (manquantes.length === 0) {
    Logger.log("✅ TOUTES LES FONCTIONS SONT PRÉSENTES (" + fonctionsAttendues.length + ")");
  } else {
    Logger.log("❌ " + manquantes.length + " FONCTION(S) MANQUANTE(S) :");
    manquantes.forEach(function (f) { Logger.log("     · " + f); });
    Logger.log("");
    Logger.log("→ Cause probable : le(s) fichier(s) contenant ces fonctions n'a/ont pas");
    Logger.log("  été collé(s) dans CE projet Apps Script, ou contien(nen)t une erreur");
    Logger.log("  de syntaxe empêchant la compilation.");
  }
  Logger.log("");

  // --- Test direct du routeur admin ---
  Logger.log("--- TEST DIRECT saasRouter GET /admin/stats SANS token ---");
  try {
    const rep = saasRouter("GET", "/admin/stats", {}, { parameter: {} });
    Logger.log("  " + rep.getContent());
    Logger.log("  → Ce message doit être un 401 (session invalide), PAS un 501.");
    Logger.log("    S'il dit encore 'Routes admin non encore installées (Phase 3)' :");
    Logger.log("    c'est que saasRouterAdmin est introuvable même en local.");
  } catch (err) {
    Logger.log("  ❌ Exception : " + err.message);
  }

  Logger.log("");
  Logger.log("=================================================");
}

/**
 * 📄 SaaS_03_WebApp.gs — saasVerifierInstallationPhase3AvecToken()   (RETIRÉE — LOT S3)
 * Elle se connectait avec une adresse réelle et un mot de passe par défaut écrits dans
 * le code. Pour vérifier l'installation, utiliser saasVerifierInstallationPhase3()
 * (sans connexion) et saasVerifierSecuriteAdmin().
 */
function saasVerifierInstallationPhase3AvecToken() {
  Logger.log("Fonction retirée par sécurité (elle contenait des identifiants en dur).");
  Logger.log("→ Utiliser saasVerifierInstallationPhase3() et saasVerifierSecuriteAdmin().");
}

/**
 * TEST DU LOT S3 — aucune modification de la feuille UTILISATEURS.
 * Vérifie que les fonctions retirées ne font plus rien, que la création d'admin exige
 * les propriétés, et que les erreurs internes ne fuient plus vers l'appelant.
 */
function saasTesterS3() {
  Logger.log("=================================================");
  Logger.log("=== TEST LOT S3 : IDENTIFIANTS EN DUR ET FUITE D'ERREURS ===");
  Logger.log("=================================================");

  let ok = 0, ko = 0;
  const verifier = function (nom, condition, detail) {
    Logger.log((condition ? "  ✅ " : "  ❌ ") + nom + (detail ? " — " + detail : ""));
    if (condition) ok++; else ko++;
  };

  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_UTILISATEURS);
  if (!feuille) { Logger.log("❌ Feuille UTILISATEURS absente."); return; }
  const instantane = function () { return JSON.stringify(feuille.getDataRange().getValues()); };
  const avant = instantane();

  saasFixAdminExistant("x@x.cm", "quelconque");
  verifier("1. saasFixAdminExistant ne modifie plus rien", instantane() === avant);

  saasCreerAdminParDefaut();
  verifier("2. saasCreerAdminParDefaut ne crée plus rien", instantane() === avant);

  const props = PropertiesService.getScriptProperties();
  if (props.getProperty("ADMIN_CREATION_EMAIL") || props.getProperty("ADMIN_NOUVEAU_MDP")) {
    Logger.log("  ⚠️ 3. Sauté : une propriété ADMIN_CREATION_EMAIL / ADMIN_NOUVEAU_MDP est présente (la création aurait lieu).");
  } else {
    saasCreerAdminDepuisProprietes();
    verifier("3. La création d'admin exige les propriétés (rien créé sans elles)", instantane() === avant);
  }

  saasVerifierInstallationPhase3AvecToken();
  verifier("4. L'ancienne vérification avec identifiants est retirée (aucune connexion)", instantane() === avant);

  // Erreur interne provoquée volontairement : le message secret ne doit pas sortir
  const evenementPiege = {};
  Object.defineProperty(evenementPiege, "parameter", { get: function () { throw new Error("SECRET_INTERNE_A_NE_PAS_REVELER"); } });
  const rep = doPost(evenementPiege);
  const texte = rep.getContent();
  verifier("5. Une erreur interne ne révèle pas son détail à l'appelant", texte.indexOf("SECRET_INTERNE") === -1, texte.substring(0, 120));
  verifier("5b. La réponse contient une référence d'incident", texte.indexOf("réf.") !== -1);

  verifier("6. Les données utilisateurs sont inchangées à la fin du test", instantane() === avant);

  Logger.log("");
  Logger.log("=== RÉSULTAT : " + ok + " contrôle(s) réussi(s), " + ko + " échec(s) ===");
}