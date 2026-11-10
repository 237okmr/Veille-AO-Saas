// >>> FICHIER : SaaS_20_Admin.gs <<< (à coller dans l'onglet du même nom)
/**
 * ============================================================================
 * SAAS — ENDPOINTS ADMIN : GESTION CLIENTS & UTILISATEURS (V1.2 — LOT S1b)
 * ============================================================================
 * V1.2 (LOT S1b) : les textes saisis depuis l'écran d'administration (clients, profils IA, mots-clés,
 * préférences, utilisateurs, réglages) passent par secNeutraliserFormule / secNeutraliserLigne
 * (SecuriteDonnees.gs, dont ce script dépend) : une liste qui commence par « - » ou « = » n'est
 * plus interprétée comme une formule par Google Sheets.
 *
 * NOUVEAUTÉS V1.1 :
 *   • 6 nouvelles routes pour la fiche client complète admin
 *   • POST /admin/clients/update-ia-profile  — override manuel profil IA
 *   • POST /admin/clients/toggle-cascade      — désactivation cascade
 *   • GET  /admin/clients/alerts              — alertes d'un client
 *   • GET  /admin/clients/cache-ia            — évaluations IA d'un client
 *   • GET  /admin/clients/audit               — journal d'audit d'un client
 *   • GET/POST /admin/clients/preferences     — préférences d'un client
 *   • GET  /admin/avis                        — avis collectés, lecture seule (SaaS_23_AvisCollectes.gs)
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// ROUTEUR
// ---------------------------------------------------------------------------

/**
 * 📄 SaaS_20_Admin.gs — saasRouterAdmin(r, methode, payload, user, e)
 */
function saasRouterAdmin(r, methode, payload, user, e) {
  const route = r.replace(/^\/admin/, "");

  // --- Clients — CRUD de base ---
  if (route === "/clients" && methode === "GET")                       return saasAdminClientsList(payload, user, e);
  if (route === "/clients/detail" && methode === "GET")                return saasAdminClientDetail(payload, user, e);
  if (route === "/clients/create" && methode === "POST")               return saasAdminClientCreate(payload, user, e);
  if (route === "/clients/update" && methode === "POST")               return saasAdminClientUpdate(payload, user, e);
  if (route === "/clients/toggle" && methode === "POST")               return saasAdminClientToggle(payload, user, e);
  if (route === "/clients/toggle-cascade" && methode === "POST")       return saasAdminClientToggleCascade(payload, user, e);
  if (route === "/clients/regenerate" && methode === "POST")           return saasAdminClientRegenerate(payload, user, e);
  if (route === "/clients/update-ia-profile" && methode === "POST")    return saasAdminClientUpdateIAProfile(payload, user, e);

  // --- Clients — données liées ---
  if (route === "/clients/alerts" && methode === "GET")                return saasAdminClientAlerts(payload, user, e);
  if (route === "/clients/cache-ia" && methode === "GET")              return saasAdminClientCacheIA(payload, user, e);
  if (route === "/clients/audit" && methode === "GET")                 return saasAdminClientAudit(payload, user, e);
  if (route === "/clients/preferences" && methode === "GET")           return saasAdminClientGetPreferences(payload, user, e);
  if (route === "/clients/preferences" && methode === "POST")          return saasAdminClientUpdatePreferences(payload, user, e);

  // --- Avis collectés (lecture seule de TOUS_AO) — implémenté dans SaaS_23_AvisCollectes.gs ---
  if (route === "/avis" && methode === "GET")                          return saasAdminAvisList(payload, user, e);

  // --- Réglages (lots A1/A2) : mode proxy, paramètres métier, clés Gemini/DeepSeek ---
  if (route === "/reglages" && methode === "GET")                      return saasAdminReglagesGet(payload, user, e);
  if (route === "/reglages/proxy-mode" && methode === "POST")          return saasAdminReglagesProxyMode(payload, user, e);
  if (route === "/reglages/parametres" && methode === "POST")          return saasAdminReglagesUpdateParametres(payload, user, e);
  if (route === "/reglages/cles-gemini" && methode === "POST")         return saasAdminReglagesUpdateClesGemini(payload, user, e);
  if (route === "/reglages/cle-deepseek" && methode === "POST")        return saasAdminReglagesUpdateCleDeepSeek(payload, user, e);

  // --- Utilisateurs ---
  if (route === "/users" && methode === "GET")                         return saasAdminUsersList(payload, user, e);
  if (route === "/users/create" && methode === "POST")                 return saasAdminUserCreate(payload, user, e);
  if (route === "/users/update" && methode === "POST")                 return saasAdminUserUpdate(payload, user, e);
  if (route === "/users/toggle" && methode === "POST")                 return saasAdminUserToggle(payload, user, e);
  if (route === "/users/reset-password" && methode === "POST")         return saasAdminUserResetPassword(payload, user, e);

  // --- Audit / Sessions / Stats ---
  if (route.indexOf("/audit") === 0 || route.indexOf("/sessions") === 0 || route === "/stats") {
    if (typeof saasRouterAdminAudit === "function") {
      return saasRouterAdminAudit(route, methode, payload, user, e);
    }
  }

  // --- Actions pipeline ---
  if (route.indexOf("/actions") === 0) {
    if (typeof saasRouterAdminActions === "function") {
      return saasRouterAdminActions(route, methode, payload, user, e);
    }
  }

  return saasErreur("Route admin inconnue : " + route, 404);
}

// ============================================================================
// CLIENTS — LISTE ET DÉTAIL
// ============================================================================

/**
 * 📄 SaaS_20_Admin.gs — saasAdminClientsList(payload, user, e)
 * GET /admin/clients?search=&actif=OUI|NON&limit=50&offset=0
 */
function saasAdminClientsList(payload, user, e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName("CLIENTS");
  if (!feuille) return saasErreur("Feuille CLIENTS absente.", 500);

  const h = saasLireHeader(feuille);
  const idx = {};
  h.forEach(function (col, i) { idx[col] = i; });

  const data = feuille.getDataRange().getValues();
  const p = payload || {};
  const search = (p.search || "").toString().toLowerCase();
  const actifFiltre = (p.actif || "").toString().toUpperCase();
  const limit = Math.min(500, Math.max(1, Number(p.limit) || 200));
  const offset = Math.max(0, Number(p.offset) || 0);

  const clients = [];
  for (let i = 1; i < data.length; i++) {
    const id = (data[i][idx.ID_CLIENT] || "").toString().trim();
    if (!id) continue;
    const nom = (data[i][idx.NOM_ENTREPRISE] || "").toString().trim();
    const email = (idx.EMAIL_DESTINATAIRE !== undefined ? (data[i][idx.EMAIL_DESTINATAIRE] || "").toString().trim() : "");
    const actif = (data[i][idx.ACTIF] || "").toString().trim().toUpperCase();

    if (actifFiltre && actif !== actifFiltre) continue;
    if (search) {
      const hay = (id + " " + nom + " " + email).toLowerCase();
      if (hay.indexOf(search) === -1) continue;
    }

    clients.push({
      idClient: id,
      nom: nom,
      emailDestinataire: email,
      actif: actif,
      regions: idx.REGIONS_CIBLES !== undefined ? (data[i][idx.REGIONS_CIBLES] || "").toString() : "",
      procedures: idx.TYPES_PROCEDURES_VISEES !== undefined ? (data[i][idx.TYPES_PROCEDURES_VISEES] || "").toString() : "",
      montantMinimum: idx.MONTANT_MINIMUM !== undefined ? (data[i][idx.MONTANT_MINIMUM] || "").toString() : "",
      seuilScore: idx.SEUIL_SCORE_MIN_CLIENT !== undefined ? (data[i][idx.SEUIL_SCORE_MIN_CLIENT] || "").toString() : ""
    });
  }

  const total = clients.length;
  const page = clients.slice(offset, offset + limit);

  const ssUtil = ss.getSheetByName(SAAS_SHEET_UTILISATEURS);
  const compteUsers = {};
  if (ssUtil) {
    const du = ssUtil.getDataRange().getValues();
    for (let j = 1; j < du.length; j++) {
      const idC = (du[j][7] || "").toString().trim();
      if (idC) compteUsers[idC] = (compteUsers[idC] || 0) + 1;
    }
  }
  page.forEach(function (c) {
    c.nbUtilisateurs = compteUsers[c.idClient] || 0;
  });

  return saasReponse(true, { total: total, limit: limit, offset: offset, count: page.length, clients: page }, "Liste récupérée.", 200);
}

/**
 * 📄 SaaS_20_Admin.gs — saasAdminClientDetail(payload, user, e)
 * GET /admin/clients/detail?idClient=CLI_001
 */
function saasAdminClientDetail(payload, user, e) {
  const idClient = (payload.idClient || "").toString().trim();
  if (!idClient) return saasErreur("Paramètre idClient requis.", 400);

  const client = saasLireClientComplet(idClient);
  if (!client) return saasErreur("Client introuvable.", 404);

  const enrichi = saasLireProfilEnrichi(idClient);
  const prefs = saasLirePreferences(idClient);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const fu = ss.getSheetByName(SAAS_SHEET_UTILISATEURS);
  const utilisateurs = [];
  if (fu) {
    const du = fu.getDataRange().getValues();
    for (let i = 1; i < du.length; i++) {
      if ((du[i][7] || "").toString().trim() === idClient) {
        utilisateurs.push({
          idUser: (du[i][0] || "").toString(),
          email: (du[i][1] || "").toString(),
          nom: (du[i][4] || "").toString(),
          role: (du[i][6] || "").toString(),
          actif: (du[i][8] || "").toString(),
          derniereConnexion: (du[i][10] || "").toString()
        });
      }
    }
  }

  return saasReponse(true, {
    client: client,
    profilIA: enrichi,
    preferences: prefs,
    utilisateurs: utilisateurs
  }, "OK", 200);
}

// ============================================================================
// CLIENTS — CRÉATION
// ============================================================================

/**
 * 📄 SaaS_20_Admin.gs — saasAdminClientCreate(payload, user, e)
 * POST /admin/clients/create
 */
function saasAdminClientCreate(payload, user, e) {
  const p = payload || {};

  if (!p.nom || String(p.nom).trim().length < 3) {
    return saasErreur("Le nom de l'entreprise est requis (3 caractères minimum).", 400);
  }
  if (!p.emailDestinataire || !saasEmailValide(p.emailDestinataire)) {
    return saasErreur("Email destinataire invalide.", 400);
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName("CLIENTS");
  if (!feuille) return saasErreur("Feuille CLIENTS absente.", 500);

  const h = saasLireHeader(feuille);
  const idx = {};
  h.forEach(function (col, i) { idx[col] = i; });

  let idClient = (p.idClient || "").toString().trim();
  if (!idClient) {
    idClient = saasGenererIdClient(feuille, idx);
  } else {
    if (saasLireClientComplet(idClient)) {
      return saasErreur("L'ID_Client '" + idClient + "' existe déjà.", 409);
    }
  }

  const nbCols = h.length;
  const ligne = new Array(nbCols).fill("");

  const setCol = function (nomCol, valeur) {
    if (idx[nomCol] !== undefined) ligne[idx[nomCol]] = valeur;
  };

  setCol("ID_CLIENT", idClient);
  setCol("NOM_ENTREPRISE", String(p.nom).trim());
  setCol("EMAIL_DESTINATAIRE", String(p.emailDestinataire).trim().toLowerCase());
  setCol("ACTIF", "OUI");
  setCol("REGIONS_CIBLES", Array.isArray(p.regions) ? p.regions.join(", ") : (p.regions || ""));
  setCol("TYPES_PROCEDURES_VISEES", Array.isArray(p.procedures) ? p.procedures.join(", ") : (p.procedures || ""));
  setCol("MONTANT_MINIMUM", p.montantMinimum || 0);
  setCol("SEUIL_SCORE_MIN_CLIENT", p.seuilScore || 3.0);
  setCol("PROMPT_METIER_IA", p.promptMetier || "");
  setCol("SITE_WEB", p.siteWeb || "");
  setCol("MO_PRIORITAIRES", p.moPrioritaires || "");
  setCol("CAS_USAGE_REFERENCE", p.casUsageReference || "");
  setCol("MOTS_CLES_INCLUSION", "");
  setCol("MOTS_CLES_EXCLUSION", "");

  feuille.appendRow(secNeutraliserLigne(ligne));
  saasCreerPreferencesParDefaut(idClient);

  saasLogger(user.idUser, user.email, user.role, "ADMIN_CLIENT_CREATE",
    "idClient=" + idClient + " nom=" + p.nom, saasExtraireIp(e), true);

  let profilIA = null;
  let erreurIA = null;
  if (p.genererProfilIA) {
    if (typeof iagGenererProfilClient !== "function") {
      erreurIA = "Module IA_ProfilGen.gs absent.";
    } else {
      try {
        const ok = iagGenererProfilClient(idClient);
        if (ok) profilIA = saasLireProfilEnrichi(idClient);
        else erreurIA = "La génération a retourné false.";
      } catch (err) {
        erreurIA = "Exception : " + err.message;
      }
    }
  }

  return saasReponse(true, {
    idClient: idClient, nom: p.nom, profilIA: profilIA, erreurIA: erreurIA
  }, "Client créé avec succès." + (erreurIA ? " (Erreur IA : " + erreurIA + ")" : ""), 201);
}

/**
 * 📄 SaaS_20_Admin.gs — saasGenererIdClient(feuille, idx)
 */
function saasGenererIdClient(feuille, idx) {
  const data = feuille.getDataRange().getValues();
  let max = 0;
  for (let i = 1; i < data.length; i++) {
    const id = (data[i][idx.ID_CLIENT] || "").toString().trim();
    const m = /^CLI_0*(\d+)$/.exec(id);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return "CLI_" + String(max + 1).padStart(3, "0");
}

// ============================================================================
// CLIENTS — MISE À JOUR / TOGGLE / RÉGÉNÉRATION / CASCADE / IA
// ============================================================================

/**
 * 📄 SaaS_20_Admin.gs — saasAdminClientUpdate(payload, user, e)
 * POST /admin/clients/update
 */
function saasAdminClientUpdate(payload, user, e) {
  const idClient = (payload.idClient || "").toString().trim();
  if (!idClient) return saasErreur("idClient requis.", 400);

  const client = saasLireClientComplet(idClient);
  if (!client) return saasErreur("Client introuvable.", 404);

  const champs = [
    { nom: "NOM_ENTREPRISE", cle: "nom" },
    { nom: "EMAIL_DESTINATAIRE", cle: "emailDestinataire" },
    { nom: "REGIONS_CIBLES", cle: "regions", array: true },
    { nom: "TYPES_PROCEDURES_VISEES", cle: "procedures", array: true },
    { nom: "MONTANT_MINIMUM", cle: "montantMinimum", nombre: true },
    { nom: "SEUIL_SCORE_MIN_CLIENT", cle: "seuilScore", nombre: true },
    { nom: "PROMPT_METIER_IA", cle: "promptMetier" },
    { nom: "SITE_WEB", cle: "siteWeb" },
    { nom: "MO_PRIORITAIRES", cle: "moPrioritaires" },
    { nom: "CAS_USAGE_REFERENCE", cle: "casUsageReference" },
    { nom: "MOTS_CLES_INCLUSION", cle: "motsClesInclusion", array: true },
    { nom: "MOTS_CLES_EXCLUSION", cle: "motsClesExclusion", array: true },
    { nom: "ACTIF", cle: "actif" }
  ];

  const modif = [];
  for (let i = 0; i < champs.length; i++) {
    const c = champs[i];
    if (payload[c.cle] === undefined) continue;
    let val = payload[c.cle];
    if (c.array && Array.isArray(val)) val = val.join(", ");
    if (c.nombre) val = Number(val) || 0;
    if (saasMajChampClient(idClient, c.nom, val)) modif.push(c.cle);
  }

  saasLogger(user.idUser, user.email, user.role, "ADMIN_CLIENT_UPDATE",
    "idClient=" + idClient + " champs=" + modif.join(","), saasExtraireIp(e), true);

  return saasReponse(true, { idClient: idClient, modifie: modif }, "Client mis à jour.", 200);
}

/**
 * 📄 SaaS_20_Admin.gs — saasAdminClientToggle(payload, user, e)
 * POST /admin/clients/toggle (basique, sans cascade)
 */
function saasAdminClientToggle(payload, user, e) {
  const idClient = (payload.idClient || "").toString().trim();
  const actif = (payload.actif || "").toString().toUpperCase();
  if (!idClient) return saasErreur("idClient requis.", 400);
  if (actif !== "OUI" && actif !== "NON") return saasErreur("actif doit valoir OUI ou NON.", 400);

  const client = saasLireClientComplet(idClient);
  if (!client) return saasErreur("Client introuvable.", 404);

  saasMajChampClient(idClient, "ACTIF", actif);
  saasLogger(user.idUser, user.email, user.role, "ADMIN_CLIENT_TOGGLE",
    "idClient=" + idClient + " actif=" + actif, saasExtraireIp(e), true);

  return saasReponse(true, { idClient: idClient, actif: actif }, "Statut modifié.", 200);
}

/**
 * 📄 SaaS_20_Admin.gs — saasAdminClientToggleCascade(payload, user, e)
 * POST /admin/clients/toggle-cascade
 * Désactive le client + tous ses utilisateurs + invalide leurs sessions.
 */
function saasAdminClientToggleCascade(payload, user, e) {
  const idClient = (payload.idClient || "").toString().trim();
  const actif = (payload.actif || "").toString().toUpperCase();
  if (!idClient) return saasErreur("idClient requis.", 400);
  if (actif !== "OUI" && actif !== "NON") return saasErreur("actif doit valoir OUI ou NON.", 400);

  const client = saasLireClientComplet(idClient);
  if (!client) return saasErreur("Client introuvable.", 404);

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Modifier le statut du client
  saasMajChampClient(idClient, "ACTIF", actif);

  // 2. Cascade sur les utilisateurs
  const fu = ss.getSheetByName(SAAS_SHEET_UTILISATEURS);
  const fs = ss.getSheetByName(SAAS_SHEET_SESSIONS);
  let nbUsersModifies = 0;
  let nbSessionsInvalidees = 0;
  const idsUsers = [];

  if (fu) {
    const du = fu.getDataRange().getValues();
    for (let i = 1; i < du.length; i++) {
      const idC = (du[i][7] || "").toString().trim();
      if (idC === idClient) {
        fu.getRange(i + 1, 9).setValue(actif);
        idsUsers.push((du[i][0] || "").toString());
        nbUsersModifies++;
      }
    }
  }

  // 3. Invalider les sessions si désactivation
  if (actif === "NON" && fs && idsUsers.length > 0) {
    const ds = fs.getDataRange().getValues();
    for (let i = 1; i < ds.length; i++) {
      const idU = (ds[i][1] || "").toString();
      if (idsUsers.indexOf(idU) !== -1 && (ds[i][6] || "").toString().toUpperCase() === "OUI") {
        fs.getRange(i + 1, 7).setValue("NON");
        nbSessionsInvalidees++;
      }
    }
  }

  saasLogger(user.idUser, user.email, user.role, "ADMIN_CLIENT_TOGGLE_CASCADE",
    "idClient=" + idClient + " actif=" + actif + " users=" + nbUsersModifies + " sessions=" + nbSessionsInvalidees,
    saasExtraireIp(e), true);

  return saasReponse(true, {
    idClient: idClient,
    actif: actif,
    nbUsersModifies: nbUsersModifies,
    nbSessionsInvalidees: nbSessionsInvalidees
  }, "Client " + idClient + " et " + nbUsersModifies + " utilisateur(s) modifiés, " + nbSessionsInvalidees + " session(s) invalidée(s).", 200);
}

/**
 * 📄 SaaS_20_Admin.gs — saasAdminClientRegenerate(payload, user, e)
 * POST /admin/clients/regenerate
 */
function saasAdminClientRegenerate(payload, user, e) {
  const idClient = (payload.idClient || "").toString().trim();
  if (!idClient) return saasErreur("idClient requis.", 400);
  if (typeof iagGenererProfilClient !== "function") {
    return saasErreur("Module IA_ProfilGen.gs absent.", 501);
  }

  let ok = false;
  try { ok = iagGenererProfilClient(idClient); }
  catch (err) {
    saasLogger(user.idUser, user.email, user.role, "ADMIN_CLIENT_REGENERATE",
      "idClient=" + idClient + " exception=" + err.message, saasExtraireIp(e), false);
    return saasErreur("Exception : " + err.message, 500);
  }

  saasLogger(user.idUser, user.email, user.role, "ADMIN_CLIENT_REGENERATE",
    "idClient=" + idClient + " ok=" + ok, saasExtraireIp(e), ok);

  if (!ok) return saasErreur("La génération a échoué.", 500);

  const apres = saasLireProfilEnrichi(idClient);
  const nbInc = apres ? saasSplitCSV(apres.inclusions).length : 0;
  const nbExc = apres ? saasSplitCSV(apres.exclusions).length : 0;
  const nbMo  = apres ? saasSplitCSV(apres.moPrioritaires).length : 0;

  return saasReponse(true, {
    profilIA: apres,
    nbInclusions: nbInc,
    nbExclusions: nbExc,
    nbMO: nbMo,
    dateGeneration: apres ? apres.dateGeneration : ""
  }, "Profil régénéré : " + nbInc + " inclusions, " + nbExc + " exclusions, " + nbMO + " MO.", 200);
}

/**
 * 📄 SaaS_20_Admin.gs — saasAdminClientUpdateIAProfile(payload, user, e)
 * POST /admin/clients/update-ia-profile
 * Permet à l'admin d'écraser manuellement les inclusions/exclusions/MO.
 * Ne touche PAS à Profil_Compact ni aux versions de prompt.
 */
function saasAdminClientUpdateIAProfile(payload, user, e) {
  const idClient = (payload.idClient || "").toString().trim();
  if (!idClient) return saasErreur("idClient requis.", 400);

  const client = saasLireClientComplet(idClient);
  if (!client) return saasErreur("Client introuvable.", 404);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName(SAAS_SHEET_PROFILS_ENRICHIS);
  if (!feuille) return saasErreur("Feuille PROFILS_ENRICHIS absente.", 500);

  // Rechercher la ligne
  const data = feuille.getDataRange().getValues();
  let ligneCible = -1;
  for (let i = 1; i < data.length; i++) {
    if ((data[i][0] || "").toString().trim() === idClient) {
      ligneCible = i + 1;
      break;
    }
  }

  if (ligneCible === -1) {
    return saasErreur("Profil IA introuvable pour ce client. Générez-le d'abord.", 404);
  }

  const modif = [];

  // Colonne 2 : Mots_Cles_Inclusion
  if (payload.motsClesInclusion !== undefined) {
    const val = Array.isArray(payload.motsClesInclusion)
      ? payload.motsClesInclusion.join(", ")
      : String(payload.motsClesInclusion);
    feuille.getRange(ligneCible, 2).setValue(secNeutraliserFormule(val));
    modif.push("inclusions");
  }

  // Colonne 3 : Mots_Cles_Exclusion
  if (payload.motsClesExclusion !== undefined) {
    const val = Array.isArray(payload.motsClesExclusion)
      ? payload.motsClesExclusion.join(", ")
      : String(payload.motsClesExclusion);
    feuille.getRange(ligneCible, 3).setValue(secNeutraliserFormule(val));
    modif.push("exclusions");
  }

  // Colonne 4 : MO_Prioritaires
  if (payload.moPrioritaires !== undefined) {
    const val = Array.isArray(payload.moPrioritaires)
      ? payload.moPrioritaires.join(", ")
      : String(payload.moPrioritaires);
    feuille.getRange(ligneCible, 4).setValue(secNeutraliserFormule(val));
    modif.push("moPrioritaires");
  }

  // Ajout d'un marqueur "override admin" dans le commentaire (col 7)
  if (modif.length > 0) {
    const commentaireActuel = (data[ligneCible - 1][6] || "").toString();
    const marqueur = "[Override admin " + saasDateMaintenant() + "] ";
    const nouveauCommentaire = (marqueur + commentaireActuel).substring(0, 500);
    feuille.getRange(ligneCible, 7).setValue(secNeutraliserFormule(nouveauCommentaire));
  }

  saasLogger(user.idUser, user.email, user.role, "ADMIN_CLIENT_IA_OVERRIDE",
    "idClient=" + idClient + " champs=" + modif.join(","), saasExtraireIp(e), true);

  return saasReponse(true, { idClient: idClient, modifie: modif }, "Profil IA mis à jour (mode override).", 200);
}

// ============================================================================
// CLIENTS — DONNÉES LIÉES (alertes, cache-ia, audit, préférences)
// ============================================================================

/**
 * 📄 SaaS_20_Admin.gs — saasAdminClientAlerts(payload, user, e)
 * GET /admin/clients/alerts?idClient=CLI_001&limit=25&offset=0&statut=&scoreMin=&search=
 */
function saasAdminClientAlerts(payload, user, e) {
  const idClient = (payload.idClient || "").toString().trim();
  if (!idClient) return saasErreur("idClient requis.", 400);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName("ALERTES_A_ENVOYER");
  if (!feuille) return saasErreur("Feuille ALERTES_A_ENVOYER absente.", 500);

  // Charger la map des avis pour enrichir
  const mapAvis = {};
  const fao = ss.getSheetByName(SHEET_AO);
  if (fao) {
    const dao = fao.getDataRange().getValues();
    for (let i = 1; i < dao.length; i++) {
      const id = (dao[i][0] || "").toString().trim();
      if (id) mapAvis[id] = {
        titre: (dao[i][5] || "").toString(),
        maitreOuvrage: (dao[i][6] || "").toString(),
        region: (dao[i][7] || "").toString(),
        montant: (dao[i][10] || "").toString(),
        dateLimite: (dao[i][11] || "").toString(),
        lienDetail: (dao[i][12] || "").toString(),
        lienDAO: (dao[i][13] || "").toString()
      };
    }
  }

  const p = payload || {};
  const statutFiltre = (p.statut || "").toString().toUpperCase();
  const scoreMin = p.scoreMin !== undefined ? parseFloat(p.scoreMin) : null;
  const search = (p.search || "").toString().toLowerCase();
  const limit = Math.min(500, Math.max(1, Number(p.limit) || 25));
  const offset = Math.max(0, Number(p.offset) || 0);

  const data = feuille.getDataRange().getValues();
  const alertes = [];

  for (let i = 1; i < data.length; i++) {
    if ((data[i][3] || "").toString().trim() !== idClient) continue;

    const statut = (data[i][7] || "").toString().trim().toUpperCase();
    const score = parseFloat(data[i][9]) || 0;
    const justification = (data[i][10] || "").toString();
    const idAO = (data[i][1] || "").toString().trim();
    const numeroAvis = (data[i][2] || "").toString();
    const avis = mapAvis[idAO] || {};

    if (statutFiltre && statutFiltre !== "TOUS" && statut !== statutFiltre) continue;
    if (scoreMin !== null && score < scoreMin) continue;
    if (search) {
      const hay = (numeroAvis + " " + avis.titre + " " + avis.maitreOuvrage + " " + justification).toLowerCase();
      if (hay.indexOf(search) === -1) continue;
    }

    alertes.push({
      idMatch: (data[i][0] || "").toString(),
      idAO: idAO,
      numeroAvis: numeroAvis,
      idClient: idClient,
      nomClient: (data[i][4] || "").toString(),
      emailDestinataire: (data[i][5] || "").toString(),
      dateMatch: (data[i][6] || "").toString(),
      statut: statut,
      dateEnvoi: (data[i][8] || "").toString(),
      score: score,
      justification: justification,
      scoreMots: parseFloat(data[i][11]) || 0,
      scoreIA: parseFloat(data[i][12]) || 0,
      titre: avis.titre || "",
      maitreOuvrage: avis.maitreOuvrage || "",
      region: avis.region || "",
      montant: avis.montant || "",
      dateLimite: avis.dateLimite || "",
      lienDetail: avis.lienDetail || "",
      lienDAO: avis.lienDAO || ""
    });
  }

  // Tri par date décroissante
  alertes.sort(function (a, b) {
    return new Date(b.dateMatch).getTime() - new Date(a.dateMatch).getTime();
  });

  const total = alertes.length;
  const page = alertes.slice(offset, offset + limit);

  return saasReponse(true, {
    total: total, limit: limit, offset: offset, count: page.length, alertes: page
  }, "Alertes récupérées.", 200);
}

/**
 * 📄 SaaS_20_Admin.gs — saasAdminClientCacheIA(payload, user, e)
 * GET /admin/clients/cache-ia?idClient=CLI_001&limit=50&offset=0
 */
function saasAdminClientCacheIA(payload, user, e) {
  const idClient = (payload.idClient || "").toString().trim();
  if (!idClient) return saasErreur("idClient requis.", 400);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName("CACHE_IA");
  if (!feuille) return saasErreur("Feuille CACHE_IA absente.", 500);

  const p = payload || {};
  const limit = Math.min(500, Math.max(1, Number(p.limit) || 50));
  const offset = Math.max(0, Number(p.offset) || 0);

  const data = feuille.getDataRange().getValues();
  const evals = [];

  for (let i = 1; i < data.length; i++) {
    if ((data[i][1] || "").toString().trim() !== idClient) continue;
    evals.push({
      idAO: (data[i][0] || "").toString(),
      idClient: (data[i][1] || "").toString(),
      noteIA: parseInt(data[i][2], 10) || 0,
      motif: (data[i][3] || "").toString(),
      dateEval: (data[i][4] || "").toString()
    });
  }

  // Tri par date décroissante
  evals.sort(function (a, b) {
    return new Date(b.dateEval).getTime() - new Date(a.dateEval).getTime();
  });

  const total = evals.length;
  const page = evals.slice(offset, offset + limit);

  return saasReponse(true, {
    total: total, limit: limit, offset: offset, count: page.length, evaluations: page
  }, "Historique IA récupéré.", 200);
}

/**
 * 📄 SaaS_20_Admin.gs — saasAdminClientAudit(payload, user, e)
 * GET /admin/clients/audit?idClient=CLI_001&limit=50&offset=0
 * Filtre AUDIT_LOG par mention de l'ID_Client dans les détails.
 */
function saasAdminClientAudit(payload, user, e) {
  const idClient = (payload.idClient || "").toString().trim();
  if (!idClient) return saasErreur("idClient requis.", 400);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName(SAAS_SHEET_AUDIT_LOG);
  if (!feuille) return saasErreur("Feuille AUDIT_LOG absente.", 500);

  const p = payload || {};
  const limit = Math.min(500, Math.max(1, Number(p.limit) || 50));
  const offset = Math.max(0, Number(p.offset) || 0);

  const data = feuille.getDataRange().getValues();
  const logs = [];

  for (let i = data.length - 1; i >= 1; i--) {
    const details = (data[i][5] || "").toString();
    if (details.indexOf(idClient) === -1) continue;
    logs.push({
      timestamp: (data[i][0] || "").toString(),
      idUser: (data[i][1] || "").toString(),
      email: (data[i][2] || "").toString(),
      role: (data[i][3] || "").toString(),
      action: (data[i][4] || "").toString(),
      details: details,
      ip: (data[i][6] || "").toString(),
      succes: (data[i][7] || "").toString()
    });
  }

  const total = logs.length;
  const page = logs.slice(offset, offset + limit);

  return saasReponse(true, {
    total: total, limit: limit, offset: offset, count: page.length, logs: page
  }, "Journal d'audit du client.", 200);
}

/**
 * 📄 SaaS_20_Admin.gs — saasAdminClientGetPreferences(payload, user, e)
 * GET /admin/clients/preferences?idClient=CLI_001
 */
function saasAdminClientGetPreferences(payload, user, e) {
  const idClient = (payload.idClient || "").toString().trim();
  if (!idClient) return saasErreur("idClient requis.", 400);

  const prefs = saasLirePreferences(idClient);
  if (!prefs) return saasErreur("Préférences introuvables.", 404);
  return saasReponse(true, prefs, "Préférences du client.", 200);
}

/**
 * 📄 SaaS_20_Admin.gs — saasAdminClientUpdatePreferences(payload, user, e)
 * POST /admin/clients/preferences
 * Body : { idClient, notifEmail?, notifWhatsApp?, notifInApp?,
 *          whatsappNumero?, frequenceDigest?, heurePreferee?, langue? }
 */
function saasAdminClientUpdatePreferences(payload, user, e) {
  const idClient = (payload.idClient || "").toString().trim();
  if (!idClient) return saasErreur("idClient requis.", 400);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName(SAAS_SHEET_PREFS);
  if (!feuille) return saasErreur("Feuille PREFERENCES_CLIENT absente.", 500);

  let prefs = saasLirePreferences(idClient);
  if (!prefs) {
    saasCreerPreferencesParDefaut(idClient);
    prefs = saasLirePreferences(idClient);
  }
  if (!prefs) return saasErreur("Impossible de créer les préférences.", 500);

  const ouiNon = function (v, def) {
    if (v === undefined) return def;
    if (typeof v === "boolean") return v ? "OUI" : "NON";
    const s = String(v).toUpperCase();
    return (s === "OUI" || s === "TRUE" || s === "1" || s === "ON") ? "OUI" : "NON";
  };

  const lignes = [
    prefs.idClient,
    ouiNon(payload.notifEmail, prefs.notifEmail),
    ouiNon(payload.notifWhatsApp, prefs.notifWhatsApp),
    ouiNon(payload.notifInApp, prefs.notifInApp),
    (payload.whatsappNumero !== undefined ? String(payload.whatsappNumero).trim() : prefs.whatsappNumero),
    (payload.frequenceDigest !== undefined ? String(payload.frequenceDigest).toUpperCase() : prefs.frequence),
    (payload.heurePreferee !== undefined ? String(payload.heurePreferee).trim() : prefs.heurePreferee),
    (payload.langue !== undefined ? String(payload.langue).trim().toLowerCase() : prefs.langue)
  ];

  feuille.getRange(prefs.ligne, 1, 1, lignes.length).setValues([secNeutraliserLigne(lignes)]);

  saasLogger(user.idUser, user.email, user.role, "ADMIN_CLIENT_PREFS_UPDATE",
    "idClient=" + idClient, saasExtraireIp(e), true);

  return saasReponse(true, saasLirePreferences(idClient), "Préférences mises à jour.", 200);
}

// ============================================================================
// RÉGLAGES — MODE PROXY, PARAMÈTRES MÉTIER & CLÉS API (lots A1 + A2)
// ============================================================================
// Bloc 1 : pilotage du mode de la clé du proxy (OFF/OBSERVE/ENFORCE) et de son
//          rapport — réutilise sans les dupliquer les fonctions de
//          SaaS_04_Securite.gs (saasProxyLireEtat, saasProxyCompterDepuis,
//          saasProxyModeOff/Observe/Enforce). Ces fonctions ne demandent PAS de
//          nouvelle version de déploiement (elles ne changent qu'une propriété
//          du script), donc aucune coupure de service pour ce bloc.
// Bloc 2 : lecture/écriture des paramètres métier de l'onglet PARAMETRES
//          (colonnes G:H, clé/valeur), limitée à une liste blanche. Les champs
//          Heure_Collecte_Nuit / Heure_Envoi_Matin sont des cellules de type
//          Heure dans Sheets (objets Date côté script) : ils sont convertis en
//          "HH:mm" en lecture et revalidés/reconvertis en écriture.
// Bloc 3 : clés API (lot A2) — Cle_API_IA (Gemini, 2 clés) et Cle_API_IA_DeepSeek
//          (1 clé) ne sont JAMAIS lues ni écrites via la feuille PARAMETRES ici :
//          lecture via iagLireClesGemini/iagLireClesDeepSeek (coffre d'abord,
//          feuille en secours — IA_Gemini.gs), écriture UNIQUEMENT dans le coffre
//          (PropertiesService, IAG_PROP_CLES_GEMINI / IAG_PROP_CLES_DEEPSEEK).
// ============================================================================

// Paramètres pilotables depuis l'écran (tout le reste de PARAMETRES est ignoré)
const SAAS_REGLAGES_PARAMS_AUTORISES = [
  "Email_Admin_Logs",
  "Email_Reply_To",
  "Seuil_Score_Pertinence_Min",
  "Fenetre_Veille_Heures",
  "Heure_Collecte_Nuit",
  "Heure_Envoi_Matin",
  "Activer_Reporting",
  "Seuil_Alerte_Quota_Emails",
  "Activer_Fallback_DeepSeek"
];

// Parmi les paramètres ci-dessus, ceux qui sont des cellules "Heure" (objets Date côté script)
const SAAS_REGLAGES_PARAMS_HEURES = ["Heure_Collecte_Nuit", "Heure_Envoi_Matin"];

// Clés API : jamais lues ni écrites via la feuille depuis cet écran — voir Bloc 3
const SAAS_REGLAGES_PARAMS_CLES_API = ["Cle_API_IA", "Cle_API_IA_DeepSeek"];

/** Lit l'onglet PARAMETRES (colonnes G:H) sous forme de liste {cle, valeur, ligne}. */
function saasReglagesLirePARAMETRES_() {
  const nomFeuille = (typeof SHEET_PARAMS !== "undefined") ? SHEET_PARAMS : "PARAMETRES";
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nomFeuille);
  if (!feuille) return { feuille: null, lignes: [] };
  const derniereLigne = feuille.getLastRow();
  if (derniereLigne < 1) return { feuille: feuille, lignes: [] };
  const valeurs = feuille.getRange(1, 7, derniereLigne, 2).getValues(); // colonnes G:H
  const lignes = [];
  valeurs.forEach(function (v, i) {
    const cle = String(v[0] || "").trim();
    if (cle) lignes.push({ cle: cle, valeur: v[1], ligne: i + 1 });
  });
  return { feuille: feuille, lignes: lignes };
}

/**
 * 📄 SaaS_20_Admin.gs — saasAdminReglagesGet(payload, user, e)
 * GET /admin/reglages
 */
function saasAdminReglagesGet(payload, user, e) {
  // Bloc 1 : mode proxy + rapport (6 dernières heures)
  const etatProxy = saasProxyLireEtat();
  const rapportProxy = saasProxyCompterDepuis(6);

  // Bloc 2 : paramètres métier
  const donnees = saasReglagesLirePARAMETRES_();
  if (!donnees.feuille) return saasErreur("Feuille PARAMETRES absente.", 500);

  const parametres = {};
  donnees.lignes.forEach(function (l) {
    if (SAAS_REGLAGES_PARAMS_CLES_API.indexOf(l.cle) !== -1) return; // Bloc 3, géré séparément
    if (SAAS_REGLAGES_PARAMS_AUTORISES.indexOf(l.cle) === -1) return;

    let valeur = l.valeur;
    if (SAAS_REGLAGES_PARAMS_HEURES.indexOf(l.cle) !== -1 && Object.prototype.toString.call(valeur) === "[object Date]") {
      valeur = Utilities.formatDate(valeur, "Africa/Douala", "HH:mm");
    }
    parametres[l.cle] = valeur;
  });

  // Bloc 3 : clés API — via le coffre (IA_Gemini.gs), jamais la cellule brute
  const clesGemini = iagLireClesGemini(donnees.feuille);
  const clesDeepSeek = iagLireClesDeepSeek(donnees.feuille);
  const clesApi = {
    Cle_API_IA: { nbCles: clesGemini.length, masquees: clesGemini.map(iagMasquerCle) },
    Cle_API_IA_DeepSeek: { nbCles: clesDeepSeek.length, masquees: clesDeepSeek.map(iagMasquerCle) }
  };

  return saasReponse(true, {
    proxy: { mode: etatProxy.mode, secretPresent: etatProxy.secretLongueur >= 32, rapport6h: rapportProxy },
    parametres: parametres,
    clesApi: clesApi
  }, "Réglages récupérés.", 200);
}

/**
 * 📄 SaaS_20_Admin.gs — saasAdminReglagesProxyMode(payload, user, e)
 * POST /admin/reglages/proxy-mode   body : { mode: "OFF" | "OBSERVE" | "ENFORCE" }
 */
function saasAdminReglagesProxyMode(payload, user, e) {
  const mode = String((payload || {}).mode || "").trim().toUpperCase();
  if (["OFF", "OBSERVE", "ENFORCE"].indexOf(mode) === -1) {
    return saasErreur("mode doit valoir OFF, OBSERVE ou ENFORCE.", 400);
  }

  const avant = saasProxyLireEtat().mode;
  if (mode === "OFF") saasProxyModeOff();
  else if (mode === "OBSERVE") saasProxyModeObserve();
  else saasProxyModeEnforce();
  const apres = saasProxyLireEtat().mode;

  saasLogger(user.idUser, user.email, user.role, "ADMIN_REGLAGES_PROXY_MODE",
    "avant=" + avant + " demande=" + mode + " apres=" + apres, saasExtraireIp(e), apres === mode);

  if (apres !== mode) {
    return saasErreur(
      "Changement refusé : conditions non réunies pour passer en " + mode +
      " (secret absent, ou pas assez d'appels valides avant ENFORCE — voir saasProxyRapport() dans l'éditeur). Mode inchangé : " + apres + ".",
      409
    );
  }
  return saasReponse(true, { mode: apres }, "Mode proxy : " + apres + ".", 200);
}

/**
 * 📄 LOT 3 — Historique des réglages (ajout, aucune écriture).
 * Texte d'une valeur de PARAMETRES pour le journal d'audit : les heures (objets Date) sont
 * rendues en "HH:mm" fuseau Africa/Douala ; tout le reste en texte simple.
 */
function saasReglagesValeurTexte_(cle, valeur) {
  if (valeur === null || valeur === undefined) return "";
  if (Object.prototype.toString.call(valeur) === "[object Date]") {
    return Utilities.formatDate(valeur, "Africa/Douala", "HH:mm");
  }
  return String(valeur);
}

/**
 * 📄 LOT 3 — Fabrique la colonne Details d'un événement ADMIN_REGLAGES_PARAMETRES_UPDATE.
 * Format : champs=Cle1,Cle2 | avant/apres={"Cle1":["ancienne","nouvelle"]}
 * Les clés API ne passent jamais ici (elles sont refusées par la liste blanche).
 * La colonne est limitée à 500 caractères : si le JSON ne tient pas, on ne garde que les noms
 * de champs (l'historique reste lisible, sans bouton de rétablissement).
 * Fonction pure : aucune lecture ni écriture de feuille.
 */
function saasReglagesConstruireDetailsAudit_(changements, refuses) {
  const cles = Object.keys(changements || {});
  const finRefus = (refuses && refuses.length) ? " refuses=" + refuses.join(",") : "";
  const debut = "champs=" + cles.join(",");
  if (cles.length === 0) return (debut + finRefus).substring(0, 500);
  const json = JSON.stringify(changements);
  const complet = debut + " | avant/apres=" + json + finRefus;
  if (complet.length <= 500) return complet;
  return (debut + finRefus).substring(0, 500);
}

/**
 * 📄 SaaS_20_Admin.gs — saasAdminReglagesUpdateParametres(payload, user, e)
 * POST /admin/reglages/parametres
 * Body : un ou plusieurs champs de SAAS_REGLAGES_PARAMS_AUTORISES.
 * Tout champ hors liste (dont les clés API) est ignoré et renvoyé dans "refuses".
 * Heure_Collecte_Nuit / Heure_Envoi_Matin attendent le format "HH:mm".
 */
function saasAdminReglagesUpdateParametres(payload, user, e) {
  const donnees = saasReglagesLirePARAMETRES_();
  if (!donnees.feuille) return saasErreur("Feuille PARAMETRES absente.", 500);

  const p = payload || {};
  const parLigne = {};
  donnees.lignes.forEach(function (l) { parLigne[l.cle] = l.ligne; });

  const modif = [];
  const refuses = [];
  const changements = {}; // LOT 3 : { Cle: [ancienneValeur, nouvelleValeur] } pour le journal d'audit

  Object.keys(p).forEach(function (cle) {
    if (SAAS_REGLAGES_PARAMS_AUTORISES.indexOf(cle) === -1) { refuses.push(cle); return; }
    if (parLigne[cle] === undefined) { refuses.push(cle + " (absent de PARAMETRES)"); return; }

    let valeur = p[cle];
    let apresTexte = saasReglagesValeurTexte_(cle, valeur); // LOT 3

    if (SAAS_REGLAGES_PARAMS_HEURES.indexOf(cle) !== -1) {
      const val = String(valeur || "").trim();
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(val)) {
        refuses.push(cle + " (format attendu HH:mm)");
        return;
      }
      apresTexte = val;
      valeur = Utilities.parseDate("1899-12-30 " + val + ":00", "Africa/Douala", "yyyy-MM-dd HH:mm:ss");
    }

    // LOT 3 : ancienne valeur lue AVANT l'écriture (colonne H)
    const avantTexte = saasReglagesValeurTexte_(cle, donnees.feuille.getRange(parLigne[cle], 8).getValue());

    donnees.feuille.getRange(parLigne[cle], 8).setValue(secNeutraliserFormule(valeur)); // colonne H
    modif.push(cle);
    changements[cle] = [avantTexte, apresTexte];
  });

  saasLogger(user.idUser, user.email, user.role, "ADMIN_REGLAGES_PARAMETRES_UPDATE",
    saasReglagesConstruireDetailsAudit_(changements, refuses),
    saasExtraireIp(e), true);

  return saasReponse(true, { modifie: modif, refuses: refuses }, "Paramètres mis à jour.", 200);
}

/**
 * 📄 SaaS_20_Admin.gs — saasAdminReglagesUpdateClesGemini(payload, user, e)
 * POST /admin/reglages/cles-gemini   body : { cle1, cle2 }
 * Écrit UNIQUEMENT dans le coffre (PropertiesService, IAG_PROP_CLES_GEMINI défini
 * dans IA_Gemini.gs) — jamais dans la feuille PARAMETRES. Refuse si aucune clé
 * valide n'est fournie (l'IA cesserait de fonctionner) : rien n'est modifié.
 */
function saasAdminReglagesUpdateClesGemini(payload, user, e) {
  const p = payload || {};
  const brut1 = String(p.cle1 || "").trim();
  const brut2 = String(p.cle2 || "").trim();
  const validees = iagChargerCles([brut1, brut2].filter(Boolean).join(","));

  if (validees.length === 0) {
    return saasErreur("Au moins une clé Gemini valide (20 caractères minimum) est requise. Rien n'a été modifié.", 400);
  }

  const avant = iagLireClesDepuisProprietes(IAG_PROP_CLES_GEMINI);
  PropertiesService.getScriptProperties().setProperty(IAG_PROP_CLES_GEMINI, validees.join(","));

  saasLogger(user.idUser, user.email, user.role, "ADMIN_REGLAGES_CLES_GEMINI",
    "avant=" + avant.length + " cle(s) apres=" + validees.length + " cle(s)", saasExtraireIp(e), true);

  return saasReponse(true, {
    nbCles: validees.length,
    masquees: validees.map(iagMasquerCle)
  }, validees.length + " clé(s) Gemini enregistrée(s) dans le coffre.", 200);
}

/**
 * 📄 SaaS_20_Admin.gs — saasAdminReglagesUpdateCleDeepSeek(payload, user, e)
 * POST /admin/reglages/cle-deepseek   body : { cle }
 * Écrit UNIQUEMENT dans le coffre (IAG_PROP_CLES_DEEPSEEK). Un champ vide efface
 * la clé (DeepSeek est un fallback optionnel, contrairement à Gemini).
 */
function saasAdminReglagesUpdateCleDeepSeek(payload, user, e) {
  const p = payload || {};
  const brut = String(p.cle || "").trim();

  if (!brut) {
    PropertiesService.getScriptProperties().deleteProperty(IAG_PROP_CLES_DEEPSEEK);
    saasLogger(user.idUser, user.email, user.role, "ADMIN_REGLAGES_CLE_DEEPSEEK",
      "clé effacée", saasExtraireIp(e), true);
    return saasReponse(true, { nbCles: 0 }, "Clé DeepSeek effacée du coffre.", 200);
  }

  const validees = iagChargerCles(brut);
  if (validees.length === 0) {
    return saasErreur("Clé DeepSeek invalide (20 caractères minimum). Rien n'a été modifié.", 400);
  }

  PropertiesService.getScriptProperties().setProperty(IAG_PROP_CLES_DEEPSEEK, validees.join(","));

  saasLogger(user.idUser, user.email, user.role, "ADMIN_REGLAGES_CLE_DEEPSEEK",
    "clé mise à jour", saasExtraireIp(e), true);

  return saasReponse(true, {
    nbCles: validees.length,
    masquees: validees.map(iagMasquerCle)
  }, "Clé DeepSeek enregistrée dans le coffre.", 200);
}

/**
 * TEST DU LOT A1 — appelle les 3 premières fonctions avec un faux utilisateur admin.
 * Le seul champ testé en écriture (Cle_API_IA) est volontairement refusé : aucun risque.
 */
function saasTesterReglagesA1() {
  Logger.log("=================================================");
  Logger.log("=== TEST LOT A1 : ÉCRAN RÉGLAGES ===");
  Logger.log("=================================================");

  const faux = { idUser: "TEST", email: "test-lot-a1@local", role: "ADMIN" };

  Logger.log("--- GET /admin/reglages ---");
  const lecture = saasAdminReglagesGet({}, faux, null);
  Logger.log(lecture.getContent());

  Logger.log("--- POST /admin/reglages/parametres avec Cle_API_IA (doit être REFUSÉ) ---");
  const refus = saasAdminReglagesUpdateParametres({ Cle_API_IA: "essai-ne-doit-pas-etre-ecrit" }, faux, null);
  Logger.log(refus.getContent());

  Logger.log("--- POST /admin/reglages/proxy-mode avec un mode invalide (doit être REFUSÉ) ---");
  const modeInvalide = saasAdminReglagesProxyMode({ mode: "NIMPORTEQUOI" }, faux, null);
  Logger.log(modeInvalide.getContent());

  Logger.log("");
  Logger.log("Vérifiez ci-dessus :");
  Logger.log("1) Le GET renvoie bien proxy / parametres / clesApi (avec Cle_API_IA masquée dans clesApi).");
  Logger.log("2) Le POST avec Cle_API_IA apparaît dans 'refuses', PAS dans 'modifie'.");
  Logger.log("3) Le mode invalide renvoie une erreur 400.");
  Logger.log("=================================================");
}

/**
 * TEST DU LOT A2 — vérifie le correctif des heures et les routes de clés API,
 * SANS jamais écrire une vraie clé ni effacer la clé DeepSeek existante :
 * toutes les tentatives d'écriture ci-dessous sont volontairement invalides
 * (champs vides ou trop courts) pour rester dans les refus attendus.
 */
function saasTesterReglagesA2() {
  Logger.log("=================================================");
  Logger.log("=== TEST LOT A2 : HEURES + CLÉS API ===");
  Logger.log("=================================================");

  const faux = { idUser: "TEST", email: "test-lot-a2@local", role: "ADMIN" };

  Logger.log("--- GET /admin/reglages (vérifier le format HH:mm des heures) ---");
  const lecture = saasAdminReglagesGet({}, faux, null);
  Logger.log(lecture.getContent());

  Logger.log("--- POST /admin/reglages/cles-gemini avec 2 champs vides (doit être REFUSÉ) ---");
  const refusGemini = saasAdminReglagesUpdateClesGemini({ cle1: "", cle2: "" }, faux, null);
  Logger.log(refusGemini.getContent());

  Logger.log("--- POST /admin/reglages/cle-deepseek avec une clé trop courte (doit être REFUSÉ) ---");
  const refusDeepSeek = saasAdminReglagesUpdateCleDeepSeek({ cle: "trop-court" }, faux, null);
  Logger.log(refusDeepSeek.getContent());

  Logger.log("--- POST /admin/reglages/parametres avec une heure mal formée (doit être REFUSÉ) ---");
  const refusHeure = saasAdminReglagesUpdateParametres({ Heure_Collecte_Nuit: "6h00" }, faux, null);
  Logger.log(refusHeure.getContent());

  Logger.log("");
  Logger.log("Vérifiez ci-dessus :");
  Logger.log("1) Dans le GET, Heure_Collecte_Nuit et Heure_Envoi_Matin apparaissent en \"HH:mm\" (ex. \"06:00\"), plus en date ISO.");
  Logger.log("2) clesApi.Cle_API_IA / Cle_API_IA_DeepSeek montrent les mêmes comptes/masques qu'au test A1 (lues via le coffre).");
  Logger.log("3) Les 3 tentatives d'écriture ci-dessus sont TOUTES refusées : aucune clé ni heure de production n'a changé.");
  Logger.log("=================================================");
}

/**
 * TEST DU LOT 3 — SANS ÉCRITURE, SANS E-MAIL.
 * Vérifie uniquement les deux fonctions pures du journal des réglages :
 * aucune feuille n'est lue ni modifiée, aucun réglage n'est changé.
 */
function saasTesterReglagesLot3SansEcriture() {
  Logger.log("=== TEST LOT 3 : HISTORIQUE DES RÉGLAGES (sans écriture) ===");

  const t1 = saasReglagesValeurTexte_("Seuil_Score_Pertinence_Min", 3);
  Logger.log("1. Nombre 3 -> '" + t1 + "'  attendu : '3'");

  // Date récente : les dates de 1899 (cellules « heure ») ont un décalage historique qui fausse un test synthétique.
  const heure = Utilities.parseDate("2026-01-01 06:00:00", "Africa/Douala", "yyyy-MM-dd HH:mm:ss");
  const t2 = saasReglagesValeurTexte_("Heure_Collecte_Nuit", heure);
  Logger.log("2. Heure 06:00 -> '" + t2 + "'  attendu : '06:00'");

  const d1 = saasReglagesConstruireDetailsAudit_({ Seuil_Score_Pertinence_Min: ["3", "4"] }, []);
  Logger.log("3. Un champ -> " + d1);
  Logger.log("   attendu : champs=Seuil_Score_Pertinence_Min | avant/apres={\"Seuil_Score_Pertinence_Min\":[\"3\",\"4\"]}");

  const gros = {};
  for (let i = 0; i < 12; i++) gros["Champ_" + i] = ["a".repeat(40), "b".repeat(40)];
  const d2 = saasReglagesConstruireDetailsAudit_(gros, []);
  Logger.log("4. Texte trop long -> longueur " + d2.length + ", contient avant/apres : " + (d2.indexOf("avant/apres=") !== -1) + "  attendu : <= 500 et false");

  const d3 = saasReglagesConstruireDetailsAudit_({}, ["Cle_API_IA"]);
  Logger.log("5. Rien d'accepté + refus -> " + d3 + "  attendu : champs= refuses=Cle_API_IA");

  Logger.log("Aucune écriture effectuée.");
}

// ============================================================================
// UTILISATEURS
// ============================================================================

/**
 * 📄 SaaS_20_Admin.gs — saasAdminUsersList(payload, user, e)
 */
function saasAdminUsersList(payload, user, e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName(SAAS_SHEET_UTILISATEURS);
  if (!feuille) return saasErreur("Feuille UTILISATEURS absente.", 500);

  const data = feuille.getDataRange().getValues();
  const p = payload || {};
  const roleFiltre = (p.role || "").toString().toUpperCase();
  const actifFiltre = (p.actif || "").toString().toUpperCase();
  const search = (p.search || "").toString().toLowerCase();
  const limit = Math.min(500, Math.max(1, Number(p.limit) || 200));
  const offset = Math.max(0, Number(p.offset) || 0);

  const users = [];
  for (let i = 1; i < data.length; i++) {
    const idUser = (data[i][0] || "").toString().trim();
    if (!idUser) continue;
    const email = (data[i][1] || "").toString();
    const nom = (data[i][4] || "").toString();
    const role = (data[i][6] || "").toString().toUpperCase();
    const idClient = (data[i][7] || "").toString();
    const actif = (data[i][8] || "").toString().toUpperCase();

    if (roleFiltre && role !== roleFiltre) continue;
    if (actifFiltre && actif !== actifFiltre) continue;
    if (search) {
      const hay = (idUser + " " + email + " " + nom + " " + idClient).toLowerCase();
      if (hay.indexOf(search) === -1) continue;
    }

    users.push({
      idUser: idUser, email: email, nom: nom,
      telephone: (data[i][5] || "").toString(),
      role: role, idClient: idClient, actif: actif,
      dateCreation: (data[i][9] || "").toString(),
      derniereConnexion: (data[i][10] || "").toString()
    });
  }

  const total = users.length;
  const page = users.slice(offset, offset + limit);

  return saasReponse(true, { total: total, limit: limit, offset: offset, count: page.length, utilisateurs: page }, "OK", 200);
}

/**
 * 📄 SaaS_20_Admin.gs — saasAdminUserCreate(payload, user, e)
 */
function saasAdminUserCreate(payload, user, e) {
  const p = payload || {};
  if (!saasEmailValide(p.email)) return saasErreur("Email invalide.", 400);
  if (!saasMotDePasseValide(p.motDePasse)) return saasErreur("Mot de passe trop court (8 car. min.).", 400);

  const role = (p.role || "CLIENT").toString().toUpperCase();
  if (role !== "ADMIN" && role !== "CLIENT") return saasErreur("Rôle invalide.", 400);

  const email = String(p.email).trim().toLowerCase();
  if (saasTrouverUtilisateurParEmail(email)) return saasErreur("Cet email existe déjà.", 409);

  if (p.idClient) {
    const c = saasLireClientComplet(p.idClient);
    if (!c) return saasErreur("Client '" + p.idClient + "' introuvable.", 404);
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName(SAAS_SHEET_UTILISATEURS);
  const idUser = saasGenererId("USR");
  const sel = saasGenererSel();
  const hash = saasHacherMotDePasse(p.motDePasse, sel);

  feuille.appendRow(secNeutraliserLigne([
    idUser, email, hash, sel,
    (p.nom || "").toString().trim(),
    (p.telephone || "").toString().trim(),
    role,
    (p.idClient || "").toString().trim(),
    "OUI",
    saasDateMaintenant(), "",
    (p.langue || "fr").toString(), ""
  ]));

  saasLogger(user.idUser, user.email, user.role, "ADMIN_USER_CREATE",
    "idUser=" + idUser + " email=" + email + " role=" + role, saasExtraireIp(e), true);

  return saasReponse(true, { idUser: idUser, email: email, role: role, idClient: p.idClient || "" }, "Utilisateur créé.", 201);
}

/**
 * 📄 SaaS_20_Admin.gs — saasAdminUserUpdate(payload, user, e)
 */
function saasAdminUserUpdate(payload, user, e) {
  const idUser = (payload.idUser || "").toString().trim();
  if (!idUser) return saasErreur("idUser requis.", 400);

  const cible = saasTrouverUtilisateurParId(idUser);
  if (!cible) return saasErreur("Utilisateur introuvable.", 404);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName(SAAS_SHEET_UTILISATEURS);
  const modif = [];

  if (payload.nom !== undefined) { feuille.getRange(cible.ligne, 5).setValue(secNeutraliserFormule(String(payload.nom).trim())); modif.push("nom"); }
  if (payload.telephone !== undefined) {
    if (!saasTelephoneValide(payload.telephone)) return saasErreur("Téléphone invalide.", 400);
    feuille.getRange(cible.ligne, 6).setValue(secNeutraliserFormule(String(payload.telephone).trim()));
    modif.push("telephone");
  }
  if (payload.role !== undefined) {
    const role = String(payload.role).toUpperCase();
    if (role !== "ADMIN" && role !== "CLIENT") return saasErreur("Rôle invalide.", 400);
    feuille.getRange(cible.ligne, 7).setValue(role);
    modif.push("role");
  }
  if (payload.idClient !== undefined) {
    const idC = String(payload.idClient).trim();
    if (idC && !saasLireClientComplet(idC)) return saasErreur("Client introuvable.", 404);
    feuille.getRange(cible.ligne, 8).setValue(idC);
    modif.push("idClient");
  }

  saasLogger(user.idUser, user.email, user.role, "ADMIN_USER_UPDATE",
    "idUser=" + idUser + " champs=" + modif.join(","), saasExtraireIp(e), true);

  return saasReponse(true, { idUser: idUser, modifie: modif }, "Utilisateur mis à jour.", 200);
}

/**
 * 📄 SaaS_20_Admin.gs — saasAdminUserToggle(payload, user, e)
 */
function saasAdminUserToggle(payload, user, e) {
  const idUser = (payload.idUser || "").toString().trim();
  const actif = (payload.actif || "").toString().toUpperCase();
  if (!idUser) return saasErreur("idUser requis.", 400);
  if (actif !== "OUI" && actif !== "NON") return saasErreur("actif doit valoir OUI ou NON.", 400);

  const cible = saasTrouverUtilisateurParId(idUser);
  if (!cible) return saasErreur("Utilisateur introuvable.", 404);

  if (cible.idUser === user.idUser && actif === "NON") {
    return saasErreur("Vous ne pouvez pas désactiver votre propre compte.", 400);
  }

  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_UTILISATEURS);
  feuille.getRange(cible.ligne, 9).setValue(actif);

  if (actif === "NON") {
    const fs = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_SESSIONS);
    if (fs) {
      const ds = fs.getDataRange().getValues();
      for (let i = 1; i < ds.length; i++) {
        if ((ds[i][1] || "").toString() === idUser) {
          fs.getRange(i + 1, 7).setValue("NON");
        }
      }
    }
  }

  saasLogger(user.idUser, user.email, user.role, "ADMIN_USER_TOGGLE",
    "idUser=" + idUser + " actif=" + actif, saasExtraireIp(e), true);

  return saasReponse(true, { idUser: idUser, actif: actif }, "Statut modifié.", 200);
}

/**
 * 📄 SaaS_20_Admin.gs — saasAdminUserResetPassword(payload, user, e)
 */
function saasAdminUserResetPassword(payload, user, e) {
  const nouveau = (payload.nouveauMotDePasse || "").toString();
  if (!saasMotDePasseValide(nouveau)) return saasErreur("Mot de passe trop court.", 400);

  let cible = null;
  if (payload.idUser) cible = saasTrouverUtilisateurParId(payload.idUser);
  else if (payload.email) cible = saasTrouverUtilisateurParEmail(payload.email);
  if (!cible) return saasErreur("Utilisateur introuvable.", 404);

  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_UTILISATEURS);
  const sel = saasGenererSel();
  const hash = saasHacherMotDePasse(nouveau, sel);
  feuille.getRange(cible.ligne, 3).setValue(hash);
  feuille.getRange(cible.ligne, 4).setValue(sel);

  const fs = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_SESSIONS);
  if (fs) {
    const ds = fs.getDataRange().getValues();
    for (let i = 1; i < ds.length; i++) {
      if ((ds[i][1] || "").toString() === cible.idUser) fs.getRange(i + 1, 7).setValue("NON");
    }
  }

  saasLogger(user.idUser, user.email, user.role, "ADMIN_USER_RESET_PWD",
    "idUser=" + cible.idUser, saasExtraireIp(e), true);

  return saasReponse(true, { idUser: cible.idUser }, "Mot de passe réinitialisé.", 200);
}