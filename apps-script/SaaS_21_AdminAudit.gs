// >>> FICHIER : SaaS_21_AdminAudit.gs <<< (à coller dans l'onglet du même nom)
/**
 * ============================================================================
 * SAAS — ENDPOINTS ADMIN : AUDIT, SESSIONS, STATS ET ACTIONS PIPELINE (V1.1 — fusion de SaaS_21 et SaaS_22)
 * ============================================================================
 * Routes :
 *   GET  /admin/audit                      — journal d'audit filtré
 *   GET  /admin/sessions                   — sessions actives
 *   POST /admin/sessions/invalidate        — invalider une session
 *   POST /admin/sessions/purge             — purge sessions expirées
 *   GET  /admin/stats                      — statistiques SaaS globales
 * ============================================================================
 */

/**
 * 📄 SaaS_21_AdminAudit.gs — saasRouterAdminAudit(route, methode, payload, user, e)
 */
function saasRouterAdminAudit(route, methode, payload, user, e) {
  if (route === "/audit" && methode === "GET")                    return saasAdminAuditList(payload, user, e);
  if (route === "/sessions" && methode === "GET")                 return saasAdminSessionsList(payload, user, e);
  if (route === "/sessions/invalidate" && methode === "POST")     return saasAdminSessionInvalidate(payload, user, e);
  if (route === "/sessions/purge" && methode === "POST")          return saasAdminSessionPurge(payload, user, e);
  if (route === "/stats" && methode === "GET")                    return saasAdminStats(payload, user, e);
  return saasErreur("Route admin audit inconnue : " + route, 404);
}

// ============================================================================
// AUDIT
// ============================================================================

/**
 * 📄 SaaS_21_AdminAudit.gs — saasAdminAuditList(payload, user, e)
 * GET /admin/audit?search=&action=&succes=&limit=200&offset=0
 */
function saasAdminAuditList(payload, user, e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName(SAAS_SHEET_AUDIT_LOG);
  if (!feuille) return saasErreur("Feuille AUDIT_LOG absente.", 500);

  const data = feuille.getDataRange().getValues();
  const p = payload || {};
  const search = (p.search || "").toString().toLowerCase();
  const actionFiltre = (p.action || "").toString().toUpperCase();
  const succesFiltre = (p.succes || "").toString().toUpperCase();
  const limit = Math.min(500, Math.max(1, Number(p.limit) || 200));
  const offset = Math.max(0, Number(p.offset) || 0);

  const entrees = [];
  for (let i = data.length - 1; i >= 1; i--) {
    const action = (data[i][4] || "").toString();
    const succes = (data[i][7] || "").toString().toUpperCase();
    const details = (data[i][5] || "").toString();
    const email = (data[i][2] || "").toString();

    if (actionFiltre && action.toUpperCase().indexOf(actionFiltre) === -1) continue;
    if (succesFiltre && succes !== succesFiltre) continue;
    if (search) {
      const hay = (action + " " + details + " " + email).toLowerCase();
      if (hay.indexOf(search) === -1) continue;
    }

    entrees.push({
      timestamp: (data[i][0] || "").toString(),
      idUser: (data[i][1] || "").toString(),
      email: email,
      role: (data[i][3] || "").toString(),
      action: action,
      details: details,
      ip: (data[i][6] || "").toString(),
      succes: succes
    });
  }

  const total = entrees.length;
  const page = entrees.slice(offset, offset + limit);

  return saasReponse(true, {
    total: total, limit: limit, offset: offset, count: page.length, entrees: page
  }, "OK", 200);
}

// ============================================================================
// SESSIONS
// ============================================================================

/**
 * 📄 SaaS_21_AdminAudit.gs — saasAdminSessionsList(payload, user, e)
 * GET /admin/sessions?actif=OUI|NON&idUser=
 */
function saasAdminSessionsList(payload, user, e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName(SAAS_SHEET_SESSIONS);
  if (!feuille) return saasErreur("Feuille SESSIONS absente.", 500);

  const data = feuille.getDataRange().getValues();
  const p = payload || {};
  const actifFiltre = (p.actif || "OUI").toString().toUpperCase();
  const idUserFiltre = (p.idUser || "").toString();

  const sessions = [];
  for (let i = 1; i < data.length; i++) {
    const token = (data[i][0] || "").toString();
    if (!token) continue;
    const actif = (data[i][6] || "").toString().toUpperCase();
    const idU = (data[i][1] || "").toString();
    if (actifFiltre && actif !== actifFiltre) continue;
    if (idUserFiltre && idU !== idUserFiltre) continue;

    const u = saasTrouverUtilisateurParId(idU);
    sessions.push({
      tokenMasked: token.substring(0, 8) + "…" + token.substring(token.length - 6),
      idUser: idU,
      email: u ? u.email : "",
      nom: u ? u.nom : "",
      dateCreation: (data[i][2] || "").toString(),
      dateExpiration: (data[i][3] || "").toString(),
      ip: (data[i][4] || "").toString(),
      userAgent: (data[i][5] || "").toString(),
      actif: actif
    });
  }

  return saasReponse(true, { total: sessions.length, sessions: sessions }, "OK", 200);
}

/**
 * 📄 SaaS_21_AdminAudit.gs — saasAdminSessionInvalidate(payload, user, e)
 * POST /admin/sessions/invalidate
 */
function saasAdminSessionInvalidate(payload, user, e) {
  const idUser = (payload.idUser || "").toString().trim();
  if (!idUser) return saasErreur("idUser requis.", 400);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName(SAAS_SHEET_SESSIONS);
  if (!feuille) return saasErreur("Feuille SESSIONS absente.", 500);

  const data = feuille.getDataRange().getValues();
  let invalidees = 0;
  for (let i = 1; i < data.length; i++) {
    if ((data[i][1] || "").toString() === idUser && (data[i][6] || "").toString().toUpperCase() === "OUI") {
      feuille.getRange(i + 1, 7).setValue("NON");
      invalidees++;
    }
  }

  saasLogger(user.idUser, user.email, user.role, "ADMIN_SESSION_INVALIDATE",
    "idUser=" + idUser + " n=" + invalidees, saasExtraireIp(e), true);

  return saasReponse(true, { idUser: idUser, invalidees: invalidees }, "Sessions invalidées.", 200);
}

/**
 * 📄 SaaS_21_AdminAudit.gs — saasAdminSessionPurge(payload, user, e)
 * POST /admin/sessions/purge
 */
function saasAdminSessionPurge(payload, user, e) {
  const nb = saasPurgerSessionsExpirees();
  saasLogger(user.idUser, user.email, user.role, "ADMIN_SESSION_PURGE",
    "n=" + nb, saasExtraireIp(e), true);
  return saasReponse(true, { supprimees: nb }, "Purge effectuée.", 200);
}

// ============================================================================
// STATS GLOBALES
// ============================================================================

/**
 * 📄 SaaS_21_AdminAudit.gs — saasAdminStats(payload, user, e)
 * GET /admin/stats
 */
function saasAdminStats(payload, user, e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Clients
  const fc = ss.getSheetByName("CLIENTS");
  let totalClients = 0, clientsActifs = 0;
  if (fc) {
    const dc = fc.getDataRange().getValues();
    const h = saasLireHeader(fc);
    const idxActif = h.indexOf("ACTIF");
    const idxId = h.indexOf("ID_CLIENT");
    for (let i = 1; i < dc.length; i++) {
      const id = (dc[i][idxId] || "").toString().trim();
      if (!id) continue;
      totalClients++;
      const actif = (dc[i][idxActif] || "").toString().trim().toUpperCase();
      if (actif === "OUI" || actif === "TRUE" || actif === "1" || actif === "ACTIF") clientsActifs++;
    }
  }

  // Utilisateurs
  const fu = ss.getSheetByName(SAAS_SHEET_UTILISATEURS);
  let totalUsers = 0, usersActifs = 0, usersAdmin = 0;
  if (fu) {
    const du = fu.getDataRange().getValues();
    for (let i = 1; i < du.length; i++) {
      const id = (du[i][0] || "").toString().trim();
      if (!id) continue;
      totalUsers++;
      const actif = (du[i][8] || "").toString().toUpperCase();
      if (actif === "OUI") usersActifs++;
      if ((du[i][6] || "").toString().toUpperCase() === "ADMIN") usersAdmin++;
    }
  }

  // Avis
  const fao = ss.getSheetByName(SHEET_AO);
  let totalAvis = 0, avisNouveaux = 0;
  if (fao) {
    const dao = fao.getDataRange().getValues();
    for (let i = 1; i < dao.length; i++) {
      const id = (dao[i][0] || "").toString().trim();
      if (!id) continue;
      totalAvis++;
      if ((dao[i][14] || "").toString().trim().toUpperCase() === "NOUVEAU") avisNouveaux++;
    }
  }

  // Alertes
  const fal = ss.getSheetByName("ALERTES_A_ENVOYER");
  let totalAlertes = 0, alertesEnAttente = 0, alertesEnvoyees = 0;
  if (fal) {
    const dal = fal.getDataRange().getValues();
    for (let i = 1; i < dal.length; i++) {
      const id = (dal[i][0] || "").toString().trim();
      if (!id) continue;
      totalAlertes++;
      const st = (dal[i][7] || "").toString().trim().toUpperCase();
      if (st === "EN_ATTENTE" || st === "REPORTÉ") alertesEnAttente++;
      else if (st === "ENVOYÉ") alertesEnvoyees++;
    }
  }

  // Sessions actives
  let sessionsActives = 0;
  const fs = ss.getSheetByName(SAAS_SHEET_SESSIONS);
  if (fs) {
    const ds = fs.getDataRange().getValues();
    for (let i = 1; i < ds.length; i++) {
      if ((ds[i][6] || "").toString().toUpperCase() === "OUI" && !saasDateDepassee((ds[i][3] || "").toString())) {
        sessionsActives++;
      }
    }
  }

  // Quota Gemini
  let quotaIA = 0;
  if (typeof iagLireQuotaJour === "function") {
    try { quotaIA = iagLireQuotaJour().count; } catch (err) {}
  }

  // Quota Gmail
  let quotaGmail = 0;
  try { quotaGmail = MailApp.getRemainingDailyQuota(); } catch (err) {}

  return saasReponse(true, {
    clients: { total: totalClients, actifs: clientsActifs, inactifs: totalClients - clientsActifs },
    utilisateurs: { total: totalUsers, actifs: usersActifs, admins: usersAdmin },
    avis: { total: totalAvis, nouveaux: avisNouveaux },
    alertes: { total: totalAlertes, enAttente: alertesEnAttente, envoyees: alertesEnvoyees },
    sessions: { actives: sessionsActives },
    quotas: { geminiAujourdhui: quotaIA, gmailRestant: quotaGmail },
    environnement: {
      fichier: ss.getName(),
      timestamp: saasDateMaintenant()
    }
  }, "Statistiques SaaS.", 200);
}

// ============================================================================
// (ancien fichier SaaS_22_AdminActions.gs) — ENDPOINTS ADMIN : ACTIONS SUR LE PIPELINE
// ============================================================================

const SAAS_ACTIONS_DISPONIBLES = [
  { code: "routine-nuit",       label: "Routine nocturne (collecte + matching)",    fn: "routineNuit_CollecteEtMatching" },
  { code: "routine-matin",      label: "Routine matinale (expédition emails)",      fn: "routineMatin_ExpeditionEmails" },
  { code: "collecte-complete",  label: "Session complète (collecte → envoi)",       fn: "lancerRoutineVeilleQuotidienneComplete" },
  { code: "collecte-armp",      label: "Collecte ARMP seule",                        fn: "executerCollecteARMP" },
  { code: "matching",           label: "Matching clients seul",                      fn: "executerMatchingClients" },
  { code: "envoi-emails",       label: "Expédition des alertes",                     fn: "executerEnvoiAlertes" },
  { code: "validation",         label: "Validation entrées (normalisation)",         fn: "validerEntreesNouvelles" },
  { code: "dedup",              label: "Déduplication post-collecte",                fn: "dedupExecuterPostCollecte" },
  { code: "audit-sante",        label: "Audit de santé du matching",                 fn: "mtAuditerSanteMatching" },
  { code: "purge-cache",        label: "Purge du cache IA",                          fn: "purgerCacheIA" },
  { code: "audit-dedup",        label: "Audit de la déduplication",                  fn: "auditerDeduplication" },
  { code: "diagnostic-ia",      label: "Diagnostic configuration IA",                fn: "iagDiagnosticConfigurationIA" },
  { code: "fraicheur-profils",  label: "Vérifier fraîcheur des profils",             fn: "iagVerifierFraicheurProfils" },
  { code: "migrer-compacts",    label: "Migrer les profils compacts",                fn: "iagInitialiserProfilsCompacts" },
  { code: "backfill-normalisation", label: "Backfill normalisation complète",        fn: "backfillNormalisationComplete" },
  { code: "nettoyer-dates",     label: "Nettoyer les dates aberrantes",              fn: "nettoyerDatesAberrantes" },
  { code: "dashboard",          label: "Rafraîchir le dashboard",                    fn: "rafraichirDashboard" }
];

/**
 * 📄 SaaS_22_AdminActions.gs — saasRouterAdminActions(route, methode, payload, user, e)
 */
function saasRouterAdminActions(route, methode, payload, user, e) {
  if (route === "/actions/list" && methode === "GET")     return saasAdminActionsList(payload, user, e);
  if (route === "/actions/run" && methode === "POST")     return saasAdminActionsRun(payload, user, e);
  return saasErreur("Route admin actions inconnue : " + route, 404);
}

/**
 * 📄 SaaS_22_AdminActions.gs — saasAdminActionsList(payload, user, e)
 * GET /admin/actions/list
 */
function saasAdminActionsList(payload, user, e) {
  const liste = SAAS_ACTIONS_DISPONIBLES.map(function (a) {
    const fn = globalThis[a.fn];
    return {
      code: a.code,
      label: a.label,
      fonction: a.fn,
      disponible: typeof fn === "function"
    };
  });
  return saasReponse(true, { actions: liste }, "OK", 200);
}

/**
 * 📄 SaaS_22_AdminActions.gs — saasAdminActionsRun(payload, user, e)
 * POST /admin/actions/run
 */
function saasAdminActionsRun(payload, user, e) {
  const code = (payload.code || "").toString().trim();
  if (!code) return saasErreur("Paramètre code requis.", 400);

  const action = SAAS_ACTIONS_DISPONIBLES.find(function (a) { return a.code === code; });
  if (!action) return saasErreur("Action inconnue : " + code, 404);

  const fn = globalThis[action.fn];
  if (typeof fn !== "function") {
    saasLogger(user.idUser, user.email, user.role, "ADMIN_ACTION_RUN",
      "code=" + code + " fonction " + action.fn + " absente", saasExtraireIp(e), false);
    return saasErreur("Fonction cible absente du projet : " + action.fn, 501);
  }

  const t0 = new Date().getTime();
  let resultat;
  let erreur = null;
  try {
    if (fn.length >= 1) {
      const metriques = (typeof initialiserMetriquesSession === "function")
        ? initialiserMetriquesSession()
        : { debut: new Date(), alertesCritiques: [], sources: {} };
      resultat = fn(metriques);
    } else {
      resultat = fn();
    }
  } catch (err) {
    erreur = err.message;
  }

  const dureeMs = new Date().getTime() - t0;

  saasLogger(user.idUser, user.email, user.role, "ADMIN_ACTION_RUN",
    "code=" + code + " duree=" + dureeMs + "ms" + (erreur ? " erreur=" + erreur : ""),
    saasExtraireIp(e), !erreur);

  if (erreur) {
    return saasErreur("Action échouée : " + erreur + " (durée : " + dureeMs + "ms)", 500);
  }

  return saasReponse(true, {
    code: code,
    label: action.label,
    fonction: action.fn,
    dureeMs: dureeMs,
    retour: resultat === undefined ? null : resultat
  }, "Action exécutée avec succès.", 200);
}