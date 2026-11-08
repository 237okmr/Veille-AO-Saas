// >>> FICHIER : SaaS_10_Client.gs <<< (à coller dans l'onglet du même nom)
/**
 * ============================================================================
 * SAAS — ENDPOINTS CLIENT : PROFIL & COMPTE (V1.2 — LOTS S1b / S2 / S3)
 * ============================================================================
 * V1.2 (LOTS S2 / S3) :
 *   • Changement de mot de passe : toutes les AUTRES sessions du compte sont fermées (la session
 *     en cours reste ouverte). Un mot de passe volé n'ouvre plus de session après le changement.
 *   • Régénération du profil IA : 3 par jour et par client (HTTP 429 au-delà). Chaque régénération
 *     consomme plusieurs appels IA ; le compteur repart à zéro chaque jour (Africa/Douala).
 *   • Test sans écriture : saasTesterSessionsEtRegeneration().
 *
 * V1.1 (LOT S1b) : tout texte saisi par le client (profil, prompt métier, site, nom, téléphone,
 * préférences) passe par secNeutraliserFormule / secNeutraliserLigne (SecuriteDonnees.gs, dont
 * ce script dépend) avant d'être écrit : un texte qui commence par = + - @ n'est jamais exécuté
 * comme une formule. Un numéro « +237… » reste un texte.
 *
 * Routes :
 *   GET  /client/profile
 *   POST /client/profile/update
 *   POST /client/profile/prompt
 *   POST /client/profile/regenerate
 *   POST /client/profile/site
 *   GET  /client/preferences
 *   POST /client/preferences
 *   POST /client/account/update
 *   POST /client/account/password
 *
 * À LANCER UNE FOIS : saasMigrerPhase2()
 * ============================================================================
 */

const SAAS_STATE_ALERTES = "ALERTES_USER_STATE";
const SAAS_SHEET_PROFILS_ENRICHIS = "PROFILS_ENRICHIS";

// ---------------------------------------------------------------------------
// MIGRATION PHASE 2
// ---------------------------------------------------------------------------

/**
 * 📄 SaaS_10_Client.gs — saasMigrerPhase2()
 * Crée la feuille ALERTES_USER_STATE si absente. Idempotent.
 */
function saasMigrerPhase2() {
  Logger.log("=================================================");
  Logger.log("=== MIGRATION PHASE 2 — SAAS ===");
  Logger.log("Fichier : " + SpreadsheetApp.getActiveSpreadsheet().getName());
  Logger.log("=================================================");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let feuille = ss.getSheetByName(SAAS_STATE_ALERTES);
  const actions = [];

  if (feuille) {
    Logger.log("· " + SAAS_STATE_ALERTES + " : déjà présente");
  } else {
    feuille = ss.insertSheet(SAAS_STATE_ALERTES);
    const entetes = [
      "ID_Match", "ID_Client", "ID_AO",
      "Lu", "Etat", "Note_Client",
      "Date_Lu", "Date_Action"
    ];
    feuille.getRange(1, 1, 1, entetes.length).setValues([entetes])
      .setFontWeight("bold").setBackground("#0f172a").setFontColor("#ffffff");
    feuille.setFrozenRows(1);
    feuille.setColumnWidth(1, 200);
    feuille.setColumnWidth(2, 120);
    feuille.setColumnWidth(3, 140);
    feuille.setColumnWidth(4, 70);
    feuille.setColumnWidth(5, 130);
    feuille.setColumnWidth(6, 260);
    feuille.setColumnWidth(7, 150);
    feuille.setColumnWidth(8, 150);
    Logger.log("✅ " + SAAS_STATE_ALERTES + " : créée");
    actions.push(SAAS_STATE_ALERTES);
  }

  Logger.log("");
  Logger.log("=================================================");
  if (actions.length === 0) {
    Logger.log("✅ Aucune action nécessaire.");
  } else {
    Logger.log("✅ " + actions.length + " feuille(s) créée(s).");
  }
  Logger.log("=================================================");
}

// ---------------------------------------------------------------------------
// LECTEURS / ÉCRIVAINS — CLIENTS
// ---------------------------------------------------------------------------

/**
 * 📄 SaaS_10_Client.gs — saasLireHeader(feuille)
 * Retourne les entêtes en majuscules trimmées.
 */
function saasLireHeader(feuille) {
  if (!feuille) return [];
  const derniere = Math.max(feuille.getLastColumn(), 1);
  return feuille.getRange(1, 1, 1, derniere).getValues()[0]
    .map(function (v) { return String(v || "").trim().toUpperCase(); });
}

/**
 * 📄 SaaS_10_Client.gs — saasLireClientComplet(idClient)
 * Retourne un objet structuré du client ou null.
 */
function saasLireClientComplet(idClient) {
  if (!idClient) return null;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName("CLIENTS");
  if (!feuille) return null;

  const h = saasLireHeader(feuille);
  const idx = {};
  h.forEach(function (col, i) { idx[col] = i; });

  const data = feuille.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if ((data[i][idx.ID_CLIENT] || "").toString().trim() === idClient) {
      return {
        ligne: i + 1,
        idClient: idClient,
        nom:               (data[i][idx.NOM_ENTREPRISE] || "").toString().trim(),
        emailDestinataire: (data[i][idx.EMAIL_DESTINATAIRE] || "").toString().trim(),
        actif:             (data[i][idx.ACTIF] || "").toString().trim().toUpperCase(),
        regions:           saasSplitCSV(data[i][idx.REGIONS_CIBLES]),
        procedures:        saasSplitCSV(data[i][idx.TYPES_PROCEDURES_VISEES]),
        montantMinimum:    (idx.MONTANT_MINIMUM !== undefined && data[i][idx.MONTANT_MINIMUM] !== "") ? Number(data[i][idx.MONTANT_MINIMUM]) || 0 : 0,
        seuilScore:        (idx.SEUIL_SCORE_MIN_CLIENT !== undefined && data[i][idx.SEUIL_SCORE_MIN_CLIENT] !== "") ? Number(data[i][idx.SEUIL_SCORE_MIN_CLIENT]) || 0 : 0,
        promptMetier:      (idx.PROMPT_METIER_IA !== undefined ? (data[i][idx.PROMPT_METIER_IA] || "").toString().trim() : ""),
        siteWeb:           (idx.SITE_WEB !== undefined ? (data[i][idx.SITE_WEB] || "").toString().trim() : ""),
        motsClesInclusion: (idx.MOTS_CLES_INCLUSION !== undefined ? (data[i][idx.MOTS_CLES_INCLUSION] || "").toString().trim() : ""),
        motsClesExclusion: (idx.MOTS_CLES_EXCLUSION !== undefined ? (data[i][idx.MOTS_CLES_EXCLUSION] || "").toString().trim() : ""),
        moPrioritaires:    (idx.MO_PRIORITAIRES !== undefined ? (data[i][idx.MO_PRIORITAIRES] || "").toString().trim() : ""),
        casUsageReference: (idx.CAS_USAGE_REFERENCE !== undefined ? (data[i][idx.CAS_USAGE_REFERENCE] || "").toString().trim() : "")
      };
    }
  }
  return null;
}

/**
 * 📄 SaaS_10_Client.gs — saasLireProfilEnrichi(idClient)
 * Retourne le profil IA enrichi ou null.
 */
function saasLireProfilEnrichi(idClient) {
  if (!idClient) return null;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName(SAAS_SHEET_PROFILS_ENRICHIS);
  if (!feuille) return null;

  const data = feuille.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if ((data[i][0] || "").toString().trim() === idClient) {
      return {
        inclusions:    (data[i][1] || "").toString(),
        exclusions:    (data[i][2] || "").toString(),
        moPrioritaires:(data[i][3] || "").toString(),
        dateGeneration:(data[i][4] || "").toString(),
        commentaire:   (data[i][6] || "").toString(),
        profilCompact: (data[i][7] || "").toString(),
        versionCompact:(data[i][8] || "").toString()
      };
    }
  }
  return null;
}

function saasSplitCSV(valeur) {
  if (!valeur) return [];
  return valeur.toString().split(/[,;]/).map(function (s) { return s.trim(); }).filter(function (s) { return s; });
}

/**
 * 📄 SaaS_10_Client.gs — saasMajChampClient(idClient, nomColonne, valeur)
 * Met à jour une seule cellule du client. Utilise les entêtes.
 */
function saasMajChampClient(idClient, nomColonne, valeur) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName("CLIENTS");
  if (!feuille) return false;
  const h = saasLireHeader(feuille);
  const col = h.indexOf(nomColonne.toUpperCase());
  if (col === -1) {
    Logger.log("[SAAS] Colonne " + nomColonne + " introuvable dans CLIENTS");
    return false;
  }
  const client = saasLireClientComplet(idClient);
  if (!client) return false;
  feuille.getRange(client.ligne, col + 1).setValue(secNeutraliserFormule(valeur));
  return true;
}

// ---------------------------------------------------------------------------
// LECTEURS / ÉCRIVAINS — PRÉFÉRENCES
// ---------------------------------------------------------------------------

function saasLirePreferences(idClient) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName(SAAS_SHEET_PREFS);
  if (!feuille) return null;
  const data = feuille.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if ((data[i][0] || "").toString().trim() === idClient) {
      return {
        ligne: i + 1,
        idClient: idClient,
        notifEmail:     (data[i][1] || "").toString().toUpperCase(),
        notifWhatsApp:  (data[i][2] || "").toString().toUpperCase(),
        notifInApp:     (data[i][3] || "").toString().toUpperCase(),
        whatsappNumero: (data[i][4] || "").toString(),
        frequence:      (data[i][5] || "QUOTIDIEN").toString().toUpperCase(),
        heurePreferee:  (data[i][6] || "07:00").toString(),
        langue:         (data[i][7] || "fr").toString()
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// ROUTEUR CLIENT
// ---------------------------------------------------------------------------

/**
 * 📄 SaaS_10_Client.gs — saasRouterClient(r, methode, payload, user, e)
 * Routeur des endpoints /client/*. Appelé par saasRouter() (SaaS_03_WebApp.gs).
 */
function saasRouterClient(r, methode, payload, user, e) {
  if (!user.idClient) {
    return saasErreur("Aucun client n'est associé à votre compte. Contactez l'administrateur.", 403);
  }

  // Retirer le préfixe /client
  const route = r.replace(/^\/client/, "");

  // --- Profil ---
  if (route === "/profile" && methode === "GET")  return saasClientGetProfile(user, e);
  if (route === "/profile/update" && methode === "POST")    return saasClientUpdateProfile(payload, user, e);
  if (route === "/profile/prompt" && methode === "POST")    return saasClientUpdatePrompt(payload, user, e);
  if (route === "/profile/regenerate" && methode === "POST")return saasClientRegenerateProfile(user, e);
  if (route === "/profile/site" && methode === "POST")      return saasClientUpdateSite(payload, user, e);

  // --- Préférences ---
  if (route === "/preferences" && methode === "GET")  return saasClientGetPreferences(user, e);
  if (route === "/preferences" && methode === "POST") return saasClientUpdatePreferences(payload, user, e);

  // --- Compte ---
  if (route === "/account/update" && methode === "POST")   return saasClientUpdateAccount(payload, user, e);
  if (route === "/account/password" && methode === "POST") return saasClientChangePassword(payload, user, e);

  // --- Fraîcheur des sources (chantier D) ---
  if (route === "/sources" && methode === "GET") return saasClientGetSources(user, e);

  // Déléguer aux autres fichiers (SaaS_11_Alerts.gs, SaaS_12_Stats.gs)
  if (route.indexOf("/alerts") === 0 && typeof saasRouterAlerts === "function") {
    return saasRouterAlerts(route, methode, payload, user, e);
  }
  if (route.indexOf("/stats") === 0 && typeof saasRouterStats === "function") {
    return saasRouterStats(route, methode, payload, user, e);
  }

  return saasErreur("Route client inconnue : " + route, 404);
}

// ---------------------------------------------------------------------------
// HANDLERS — PROFIL
// ---------------------------------------------------------------------------

/**
 * 📄 SaaS_10_Client.gs — saasClientGetProfile(user, e)
 * GET /client/profile
 */
function saasClientGetProfile(user, e) {
  const client = saasLireClientComplet(user.idClient);
  if (!client) return saasErreur("Profil client introuvable.", 404);

  const enrichi = saasLireProfilEnrichi(user.idClient);
  const prefs = saasLirePreferences(user.idClient);

  return saasReponse(true, {
    idClient: client.idClient,
    nom: client.nom,
    emailDestinataire: client.emailDestinataire,
    actif: client.actif,
    siteWeb: client.siteWeb,
    regions: client.regions,
    procedures: client.procedures,
    montantMinimum: client.montantMinimum,
    seuilScore: client.seuilScore,
    promptMetier: client.promptMetier,
    motsClesInclusion: saasSplitCSV(client.motsClesInclusion),
    motsClesExclusion: saasSplitCSV(client.motsClesExclusion),
    moPrioritaires: saasSplitCSV(client.moPrioritaires),
    casUsageReference: client.casUsageReference,
    profilIA: enrichi ? {
      inclusions: saasSplitCSV(enrichi.inclusions),
      exclusions: saasSplitCSV(enrichi.exclusions),
      moPrioritaires: saasSplitCSV(enrichi.moPrioritaires),
      dateGeneration: enrichi.dateGeneration,
      profilCompact: enrichi.profilCompact,
      commentaire: enrichi.commentaire
    } : null,
    preferences: prefs,
    compte: {
      idUser: user.idUser,
      email: user.email,
      nom: user.nom,
      telephone: user.telephone,
      role: user.role,
      langue: user.langue
    }
  }, "Profil récupéré.", 200);
}

/**
 * 📄 SaaS_10_Client.gs — saasClientUpdateProfile(payload, user, e)
 * POST /client/profile/update
 * Champs acceptés : nom, emailDestinataire, regions[], procedures[], montantMinimum, seuilScore
 */
function saasClientUpdateProfile(payload, user, e) {
  const client = saasLireClientComplet(user.idClient);
  if (!client) return saasErreur("Profil client introuvable.", 404);

  const maj = [];
  const erreurs = [];

  if (payload.nom !== undefined) {
    const nom = String(payload.nom).trim();
    if (nom.length < 3) erreurs.push("Nom trop court.");
    else if (saasMajChampClient(user.idClient, "NOM_ENTREPRISE", nom)) maj.push("nom");
  }

  if (payload.emailDestinataire !== undefined) {
    const em = String(payload.emailDestinataire).trim().toLowerCase();
    if (!saasEmailValide(em)) erreurs.push("Email destinataire invalide.");
    else if (saasMajChampClient(user.idClient, "EMAIL_DESTINATAIRE", em)) maj.push("emailDestinataire");
  }

  if (payload.regions !== undefined) {
    const val = Array.isArray(payload.regions) ? payload.regions.join(", ") : String(payload.regions);
    if (saasMajChampClient(user.idClient, "REGIONS_CIBLES", val)) maj.push("regions");
  }

  if (payload.procedures !== undefined) {
    const val = Array.isArray(payload.procedures) ? payload.procedures.join(", ") : String(payload.procedures);
    if (saasMajChampClient(user.idClient, "TYPES_PROCEDURES_VISEES", val)) maj.push("procedures");
  }

  if (payload.montantMinimum !== undefined) {
    const n = Number(payload.montantMinimum) || 0;
    if (n < 0) erreurs.push("Montant minimum invalide.");
    else if (saasMajChampClient(user.idClient, "MONTANT_MINIMUM", n)) maj.push("montantMinimum");
  }

  if (payload.seuilScore !== undefined) {
    const n = Number(payload.seuilScore);
    if (isNaN(n) || n < 1 || n > 5) erreurs.push("Seuil de score hors plage (1–5).");
    else if (saasMajChampClient(user.idClient, "SEUIL_SCORE_MIN_CLIENT", n)) maj.push("seuilScore");
  }

  if (erreurs.length > 0) {
    return saasErreur("Validation échouée : " + erreurs.join(" | "), 400);
  }
  if (maj.length === 0) {
    return saasReponse(true, { modifie: [] }, "Aucun champ à mettre à jour.", 200);
  }

  saasLogger(user.idUser, user.email, user.role, "PROFILE_UPDATE",
    "Champs: " + maj.join(","), saasExtraireIp(e), true);

  return saasReponse(true, { modifie: maj }, "Profil mis à jour.", 200);
}

/**
 * 📄 SaaS_10_Client.gs — saasClientUpdatePrompt(payload, user, e)
 * POST /client/profile/prompt
 * Body : { promptMetier: "..." }
 */
function saasClientUpdatePrompt(payload, user, e) {
  if (!payload.promptMetier || String(payload.promptMetier).length < 50) {
    return saasErreur("Le prompt métier doit contenir au moins 50 caractères.", 400);
  }
  const val = String(payload.promptMetier).trim();
  if (!saasMajChampClient(user.idClient, "PROMPT_METIER_IA", val)) {
    return saasErreur("Impossible d'enregistrer le prompt.", 500);
  }
  saasLogger(user.idUser, user.email, user.role, "PROMPT_UPDATE",
    "Longueur: " + val.length, saasExtraireIp(e), true);
  return saasReponse(true, { longueur: val.length },
    "Prompt enregistré. Lancez /client/profile/regenerate pour reconstruire votre profil IA.", 200);
}

/**
 * 📄 SaaS_10_Client.gs — saasClientUpdateSite(payload, user, e)
 * POST /client/profile/site
 * Body : { siteWeb: "https://..." }
 */
function saasClientUpdateSite(payload, user, e) {
  const url = (payload.siteWeb || "").toString().trim();
  if (url && !/^https?:\/\//i.test(url)) {
    return saasErreur("URL invalide (doit commencer par http:// ou https://).", 400);
  }
  if (!saasMajChampClient(user.idClient, "SITE_WEB", url)) {
    return saasErreur("Impossible d'enregistrer l'URL du site.", 500);
  }
  saasLogger(user.idUser, user.email, user.role, "SITE_UPDATE",
    "URL: " + url, saasExtraireIp(e), true);
  return saasReponse(true, { siteWeb: url },
    "URL enregistrée. Relancez /client/profile/regenerate pour intégrer le contenu du site.", 200);
}

/**
 * 📄 SaaS_10_Client.gs — saasClientRegenerateProfile(user, e)
 * POST /client/profile/regenerate
 * Appelle iagGenererProfilClient() (module IA_ProfilGen.gs) en synchrone.
 * Opération longue (30–60 s).
 */
function saasClientRegenerateProfile(user, e) {
  if (typeof iagGenererProfilClient !== "function") {
    return saasErreur("Module de génération de profil absent (IA_ProfilGen.gs).", 501);
  }

  // LOT S3 : limite journalière par client (chaque régénération consomme plusieurs appels IA)
  const reservation = saasRegenReserver(user.idClient);
  if (!reservation.autorise) {
    saasLogger(user.idUser, user.email, user.role, "PROFILE_REGENERATE",
      "Limite journalière atteinte (" + SAAS_REGEN_MAX_PAR_JOUR + "/jour)", saasExtraireIp(e), false);
    return saasErreur("Limite atteinte : " + SAAS_REGEN_MAX_PAR_JOUR +
      " régénérations de profil par jour. Réessayez demain.", 429);
  }

  const avant = saasLireProfilEnrichi(user.idClient);
  const dateAvant = avant ? avant.dateGeneration : "";

  let ok = false;
  try {
    ok = iagGenererProfilClient(user.idClient);
  } catch (err) {
    saasLogger(user.idUser, user.email, user.role, "PROFILE_REGENERATE",
      "Exception: " + err.message, saasExtraireIp(e), false);
    return saasErreur("Échec de la génération : " + err.message, 500);
  }

  if (!ok) {
    saasLogger(user.idUser, user.email, user.role, "PROFILE_REGENERATE",
      "Retour false", saasExtraireIp(e), false);
    return saasErreur("La génération de profil a échoué. Vérifiez le prompt métier.", 500);
  }

  const apres = saasLireProfilEnrichi(user.idClient);
  saasLogger(user.idUser, user.email, user.role, "PROFILE_REGENERATE",
    "Succès", saasExtraireIp(e), true);

  return saasReponse(true, {
    dateAvant: dateAvant,
    dateApres: apres ? apres.dateGeneration : "",
    nbInclusions: apres ? saasSplitCSV(apres.inclusions).length : 0,
    nbExclusions: apres ? saasSplitCSV(apres.exclusions).length : 0,
    nbMO:         apres ? saasSplitCSV(apres.moPrioritaires).length : 0,
    profilCompact: apres ? apres.profilCompact : ""
  }, "Profil IA régénéré avec succès.", 200);
}

// ---------------------------------------------------------------------------
// HANDLERS — PRÉFÉRENCES
// ---------------------------------------------------------------------------

/**
 * 📄 SaaS_10_Client.gs — saasClientGetPreferences(user, e)
 * GET /client/preferences
 */
function saasClientGetPreferences(user, e) {
  let prefs = saasLirePreferences(user.idClient);
  if (!prefs) {
    saasCreerPreferencesParDefaut(user.idClient);
    prefs = saasLirePreferences(user.idClient);
  }
  if (!prefs) return saasErreur("Préférences introuvables.", 404);
  return saasReponse(true, prefs, "Préférences récupérées.", 200);
}

/**
 * 📄 SaaS_10_Client.gs — saasClientUpdatePreferences(payload, user, e)
 * POST /client/preferences
 * Body : { notifEmail, notifWhatsApp, notifInApp, whatsappNumero, frequence, heurePreferee, langue }
 */
function saasClientUpdatePreferences(payload, user, e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName(SAAS_SHEET_PREFS);
  if (!feuille) return saasErreur("Feuille PREFERENCES_CLIENT absente.", 500);

  let prefs = saasLirePreferences(user.idClient);
  if (!prefs) {
    saasCreerPreferencesParDefaut(user.idClient);
    prefs = saasLirePreferences(user.idClient);
  }
  if (!prefs) return saasErreur("Impossible de créer les préférences.", 500);

  const ouiNon = function (v, def) {
    if (v === undefined) return def;
    const s = String(v).toUpperCase();
    return (s === "OUI" || s === "TRUE" || s === "1" || s === "ON") ? "OUI" : "NON";
  };

  const lignes = [
    prefs.idClient,
    ouiNon(payload.notifEmail, prefs.notifEmail),
    ouiNon(payload.notifWhatsApp, prefs.notifWhatsApp),
    ouiNon(payload.notifInApp, prefs.notifInApp),
    (payload.whatsappNumero !== undefined ? String(payload.whatsappNumero).trim() : prefs.whatsappNumero),
    (payload.frequence !== undefined ? String(payload.frequence).toUpperCase() : prefs.frequence),
    (payload.heurePreferee !== undefined ? String(payload.heurePreferee).trim() : prefs.heurePreferee),
    (payload.langue !== undefined ? String(payload.langue).trim().toLowerCase() : prefs.langue)
  ];

  feuille.getRange(prefs.ligne, 1, 1, lignes.length).setValues([secNeutraliserLigne(lignes)]);

  saasLogger(user.idUser, user.email, user.role, "PREFERENCES_UPDATE", "", saasExtraireIp(e), true);
  return saasReponse(true, saasLirePreferences(user.idClient), "Préférences mises à jour.", 200);
}

// ---------------------------------------------------------------------------
// HANDLERS — COMPTE UTILISATEUR
// ---------------------------------------------------------------------------

/**
 * 📄 SaaS_10_Client.gs — saasClientUpdateAccount(payload, user, e)
 * POST /client/account/update
 * Body : { nom, telephone, langue }
 */
function saasClientUpdateAccount(payload, user, e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName(SAAS_SHEET_UTILISATEURS);
  if (!feuille) return saasErreur("Feuille UTILISATEURS absente.", 500);

  const erreurs = [];
  const modif = [];

  if (payload.nom !== undefined) {
    const val = String(payload.nom).trim();
    if (val.length < 2) erreurs.push("Nom trop court.");
    else { feuille.getRange(user.ligne, 5).setValue(secNeutraliserFormule(val)); modif.push("nom"); }
  }

  if (payload.telephone !== undefined) {
    const val = String(payload.telephone).trim();
    if (!saasTelephoneValide(val)) erreurs.push("Téléphone invalide.");
    else { feuille.getRange(user.ligne, 6).setValue(secNeutraliserFormule(val)); modif.push("telephone"); }
  }

  if (payload.langue !== undefined) {
    const val = String(payload.langue).trim().toLowerCase().substring(0, 5);
    feuille.getRange(user.ligne, 12).setValue(secNeutraliserFormule(val));
    modif.push("langue");
  }

  if (erreurs.length > 0) return saasErreur("Validation échouée : " + erreurs.join(" | "), 400);

  saasLogger(user.idUser, user.email, user.role, "ACCOUNT_UPDATE",
    modif.join(","), saasExtraireIp(e), true);
  return saasReponse(true, { modifie: modif }, "Compte mis à jour.", 200);
}

/**
 * 📄 SaaS_10_Client.gs — saasClientChangePassword(payload, user, e)
 * POST /client/account/password
 * Body : { ancienMotDePasse, nouveauMotDePasse }
 */
function saasClientChangePassword(payload, user, e) {
  if (!payload.ancienMotDePasse || !payload.nouveauMotDePasse) {
    return saasErreur("Ancien et nouveau mot de passe requis.", 400);
  }
  if (!saasMotDePasseValide(payload.nouveauMotDePasse)) {
    return saasErreur("Le nouveau mot de passe doit contenir au moins 8 caractères.", 400);
  }
  if (!saasVerifierMotDePasse(payload.ancienMotDePasse, user.sel, user.hash)) {
    saasLogger(user.idUser, user.email, user.role, "PASSWORD_CHANGE",
      "Ancien mot de passe incorrect", saasExtraireIp(e), false);
    return saasErreur("Ancien mot de passe incorrect.", 401);
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName(SAAS_SHEET_UTILISATEURS);
  const nouveauSel = saasGenererSel();
  const nouveauHash = saasHacherMotDePasse(payload.nouveauMotDePasse, nouveauSel);

  feuille.getRange(user.ligne, 3).setValue(nouveauHash);
  feuille.getRange(user.ligne, 4).setValue(nouveauSel);

  // LOT S2 : fermer toutes les AUTRES sessions du compte (la session en cours reste ouverte)
  let sessionsFermees = 0;
  let echecFermeture = false;
  try {
    sessionsFermees = saasInvaliderAutresSessions(user.idUser, user.token);
  } catch (errSessions) {
    echecFermeture = true;
    Logger.log("[SAAS] Fermeture des autres sessions impossible : " + errSessions.message);
  }

  saasLogger(user.idUser, user.email, user.role, "PASSWORD_CHANGE",
    "Succès" + (echecFermeture ? " (fermeture des autres sessions impossible)" : " (" + sessionsFermees + " autre(s) session(s) fermée(s))"),
    saasExtraireIp(e), true);
  return saasReponse(true, { sessionsFermees: sessionsFermees }, echecFermeture
    ? "Mot de passe modifié. La fermeture des autres sessions a échoué : déconnectez-vous puis reconnectez-vous."
    : "Mot de passe modifié. Vos autres sessions ont été fermées.", 200);
}

// ---------------------------------------------------------------------------
// FRAÎCHEUR DES SOURCES (chantier D) — lecture seule, colonnes A:E de PARAMETRES
// ---------------------------------------------------------------------------
// N'a rien à voir avec le bloc clé/valeur (colonnes G:H) déjà utilisé par
// l'écran Réglages (SaaS_20_Admin.gs) : ici on lit la table des plateformes
// scrapées (Plateforme, URL_Accueil, Actif, Frequence_Scraping,
// Derniere_Execution), déjà alimentée par le pipeline de collecte.
// ---------------------------------------------------------------------------

/**
 * 📄 SaaS_10_Client.gs — saasClientGetSources(user, e)
 * GET /client/sources
 * Lecture seule : renvoie l'état de fraîcheur de chaque source configurée.
 */
function saasClientGetSources(user, e) {
  const nomFeuille = (typeof SHEET_PARAMS !== "undefined") ? SHEET_PARAMS : "PARAMETRES";
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nomFeuille);
  if (!feuille) return saasErreur("Feuille PARAMETRES absente.", 500);

  const derniereLigne = feuille.getLastRow();
  if (derniereLigne < 2) {
    return saasReponse(true, { sources: [] }, "Aucune source configurée.", 200);
  }

  // Colonnes A:E, à partir de la ligne 2 (ligne 1 = en-têtes)
  const valeurs = feuille.getRange(2, 1, derniereLigne - 1, 5).getValues();
  const sources = [];

  valeurs.forEach(function (v) {
    const plateforme = (v[0] || "").toString().trim();
    if (!plateforme) return;

    let derniereExecution = v[4];
    if (Object.prototype.toString.call(derniereExecution) === "[object Date]") {
      derniereExecution = Utilities.formatDate(derniereExecution, "Africa/Douala", "dd/MM/yyyy HH:mm");
    } else {
      derniereExecution = (derniereExecution || "").toString().trim();
    }

    sources.push({
      plateforme: plateforme,
      urlAccueil: (v[1] || "").toString().trim(),
      actif: (v[2] || "").toString().trim().toUpperCase() === "OUI",
      frequenceScraping: (v[3] || "").toString().trim(),
      derniereExecution: derniereExecution
    });
  });

  return saasReponse(true, { sources: sources }, "Sources récupérées.", 200);
}

/**
 * TEST — lecture seule, aucune écriture. Vérifie juste que la route répond
 * et que chaque source a bien un champ derniereExecution lisible.
 */
function saasTesterSourcesFraicheur() {
  Logger.log("=================================================");
  Logger.log("=== TEST CHANTIER D : FRAÎCHEUR DES SOURCES ===");
  Logger.log("=================================================");

  const faux = { idUser: "TEST", email: "test-chantier-d@local", role: "CLIENT", idClient: "TEST-CLI" };
  const rep = saasClientGetSources(faux, null);
  Logger.log(rep.getContent());

  const parsed = JSON.parse(rep.getContent());
  if (parsed.succes && Array.isArray(parsed.donnees.sources)) {
    Logger.log("✅ " + parsed.donnees.sources.length + " source(s) lue(s) depuis PARAMETRES (colonnes A:E).");
  } else {
    Logger.log("❌ Réponse inattendue.");
  }
  Logger.log("=================================================");
}

// ============================================================================
// LOT S2 — FERMETURE DES AUTRES SESSIONS APRÈS CHANGEMENT DE MOT DE PASSE
// ============================================================================

/**
 * Calcul PUR : numéros de lignes (base 1, en-tête = ligne 1) des sessions ACTIVES d'un
 * utilisateur, à l'exception de la session à conserver.
 * @param {Array} data contenu de la feuille SESSIONS (avec en-tête) : [token, idUser, ..., actif en colonne 7]
 */
function saasSessionsAInvalider(data, idUser, tokenGarde) {
  const lignes = [];
  for (let i = 1; i < data.length; i++) {
    const token = String(data[i][0] || "");
    if (!token) continue;
    if (String(data[i][1] || "") !== String(idUser)) continue;
    if (String(data[i][6] || "").toUpperCase() !== "OUI") continue;
    if (tokenGarde && token === String(tokenGarde)) continue;
    lignes.push(i + 1);
  }
  return lignes;
}

/** Ferme (Actif = NON) toutes les sessions actives de l'utilisateur sauf celle à conserver. Aucune ligne supprimée. */
function saasInvaliderAutresSessions(idUser, tokenGarde) {
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_SESSIONS);
  if (!feuille) return 0;
  const lignes = saasSessionsAInvalider(feuille.getDataRange().getValues(), idUser, tokenGarde);
  lignes.forEach(function (n) { feuille.getRange(n, 7).setValue("NON"); });
  return lignes.length;
}

// ============================================================================
// LOT S3 — LIMITE JOURNALIÈRE DE RÉGÉNÉRATION DU PROFIL IA
// ============================================================================

const SAAS_REGEN_MAX_PAR_JOUR = 3;
const SAAS_REGEN_PROP = "SAAS_REGEN_PROFIL_JOUR";   // propriété du script : { jour, n: { idClient: nombre } }

/**
 * Calcul PUR : décide si une régénération est autorisée et renvoie le nouvel état à enregistrer.
 * @param {string|null} etatBrut contenu JSON de la propriété (ou null)
 * @param {string} idClient
 * @param {string} jour AAAA-MM-JJ (Africa/Douala)
 * @param {number} maximum régénérations autorisées par jour et par client
 * @return {Object} { autorise, utilises, restant, etat }
 */
function saasRegenEvaluerLimite(etatBrut, idClient, jour, maximum) {
  let etat = null;
  try { etat = JSON.parse(etatBrut || "null"); } catch (e) { etat = null; }
  if (!etat || typeof etat !== "object" || etat.jour !== jour || !etat.n || typeof etat.n !== "object") {
    etat = { jour: jour, n: {} };
  }
  const deja = Number(etat.n[idClient]) || 0;
  if (deja >= maximum) {
    return { autorise: false, utilises: deja, restant: 0, etat: etat };
  }
  etat.n[idClient] = deja + 1;
  return { autorise: true, utilises: deja + 1, restant: maximum - (deja + 1), etat: etat };
}

/** Réserve une régénération pour ce client (écrit le compteur du jour si elle est autorisée). */
function saasRegenReserver(idClient) {
  const jour = Utilities.formatDate(new Date(), SAAS_FUSEAU, "yyyy-MM-dd");
  try {
    const props = PropertiesService.getScriptProperties();
    const res = saasRegenEvaluerLimite(props.getProperty(SAAS_REGEN_PROP), String(idClient), jour, SAAS_REGEN_MAX_PAR_JOUR);
    if (res.autorise) props.setProperty(SAAS_REGEN_PROP, JSON.stringify(res.etat));
    return res;
  } catch (err) {
    // En cas de panne des propriétés, on ne bloque pas un client légitime
    Logger.log("[SAAS] Compteur de régénération indisponible : " + err.message);
    return { autorise: true, utilises: 0, restant: SAAS_REGEN_MAX_PAR_JOUR, etat: null };
  }
}

// ============================================================================
// TEST LOTS S2 / S3 — AUCUNE ÉCRITURE, AUCUN APPEL IA, AUCUN E-MAIL
// ============================================================================

/**
 * Vérifie avec des données simulées la fermeture des autres sessions et la limite de régénération.
 * À exécuter depuis SaaS_10_Client.gs : saasTesterSessionsEtRegeneration
 */
function saasTesterSessionsEtRegeneration() {
  let ok = 0;
  let ko = 0;
  const verifier = function (nom, condition) {
    if (condition) { ok++; Logger.log("✅ " + nom); } else { ko++; Logger.log("❌ " + nom); }
  };

  // 1. Sessions à fermer (données simulées de la feuille SESSIONS)
  const data = [
    ["Token", "ID_User", "Date_Creation", "Date_Expiration", "IP", "User_Agent", "Actif"],
    ["T_COURANTE", "U1", "", "", "", "", "OUI"],
    ["T_AUTRE_1",  "U1", "", "", "", "", "OUI"],
    ["T_AUTRE_2",  "U1", "", "", "", "", "OUI"],
    ["T_DEJA_OFF", "U1", "", "", "", "", "NON"],
    ["T_AUTRE_USER", "U2", "", "", "", "", "OUI"],
    ["", "U1", "", "", "", "", "OUI"]
  ];
  const aFermer = saasSessionsAInvalider(data, "U1", "T_COURANTE");
  verifier("sessions : seules les 2 autres sessions actives de U1 sont visées (lignes 3 et 4)", aFermer.length === 2 && aFermer[0] === 3 && aFermer[1] === 4);
  verifier("sessions : la session courante est conservée", aFermer.indexOf(2) === -1);
  verifier("sessions : une session déjà fermée, celle d'un autre utilisateur et une ligne vide sont ignorées", aFermer.indexOf(5) === -1 && aFermer.indexOf(6) === -1 && aFermer.indexOf(7) === -1);
  verifier("sessions : sans session à conserver, toutes les sessions actives de U1 sont visées",
    saasSessionsAInvalider(data, "U1", "").length === 3);
  verifier("sessions : utilisateur inconnu, aucune ligne", saasSessionsAInvalider(data, "U9", "T_COURANTE").length === 0);

  // 2. Limite de régénération
  const J1 = "2026-10-02";
  let r = saasRegenEvaluerLimite(null, "CLI_001", J1, 3);
  verifier("régénération : 1re autorisée (2 restantes)", r.autorise && r.utilises === 1 && r.restant === 2);
  r = saasRegenEvaluerLimite(JSON.stringify(r.etat), "CLI_001", J1, 3);
  verifier("régénération : 2e autorisée (1 restante)", r.autorise && r.utilises === 2 && r.restant === 1);
  r = saasRegenEvaluerLimite(JSON.stringify(r.etat), "CLI_001", J1, 3);
  verifier("régénération : 3e autorisée (0 restante)", r.autorise && r.utilises === 3 && r.restant === 0);
  const etat3 = JSON.stringify(r.etat);
  r = saasRegenEvaluerLimite(etat3, "CLI_001", J1, 3);
  verifier("régénération : 4e refusée", r.autorise === false && r.utilises === 3);
  const autreClient = saasRegenEvaluerLimite(etat3, "CLI_002", J1, 3);
  verifier("régénération : un autre client n'est pas limité par le premier", autreClient.autorise && autreClient.utilises === 1);
  const lendemain = saasRegenEvaluerLimite(etat3, "CLI_001", "2026-10-03", 3);
  verifier("régénération : le compteur repart à zéro le lendemain", lendemain.autorise && lendemain.utilises === 1);
  verifier("régénération : propriété illisible (texte quelconque) : traitée comme vide",
    saasRegenEvaluerLimite("pas du json", "CLI_001", J1, 3).autorise === true);
  verifier("régénération : propriété au mauvais format : traitée comme vide",
    saasRegenEvaluerLimite(JSON.stringify({ jour: J1, n: "x" }), "CLI_001", J1, 3).autorise === true);
  verifier("régénération : la limite par défaut est bien de 3 par jour", SAAS_REGEN_MAX_PAR_JOUR === 3);

  Logger.log("=== RÉSULTAT : " + ok + " réussi(s), " + ko + " échec(s) ===");
  if (ko > 0) throw new Error(ko + " vérification(s) en échec (voir le journal).");
}