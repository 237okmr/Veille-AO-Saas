// >>> FICHIER : SaaS_11_Alerts.gs <<< (à coller dans l'onglet du même nom)
/**
 * ============================================================================
 * SAAS — ENDPOINTS CLIENT : ALERTES ET STATISTIQUES (V1.2 — LOT S1b)
 * ============================================================================
 * V1.2 (LOT S1b) : les notes, décisions, justifications et noms de recherches saisis par le client
 * passent par secNeutraliserLigne (SecuriteDonnees.gs, dont ce script dépend) avant écriture ;
 * l'export CSV neutralise les textes qui commencent par = + - @ (injection de formule Excel).
 *
 * Routes :
 *   GET  /client/alerts              — liste filtrée + paginée
 *   GET  /client/alerts/detail       — détail d'une alerte
 *   GET  /client/alerts/count        — compteurs
 *   POST /client/alerts/mark         — marquer lu/traité/ignoré/sauvegardé
 *   POST /client/alerts/export       — export CSV
 * ============================================================================
 */

const SAAS_ALERTES_DEFAULT_LIMIT = 50;
const SAAS_ALERTES_MAX_LIMIT = 500;

/**
 * Parse une Date_Limite au format "DD-MM-YYYY" (avec préfixe ' ou ~ optionnel,
 * et un éventuel suffixe après un espace) telle que stockée dans TOUS_AO.
 * Retourne un objet Date ou null si illisible. Utilisé pour la fraîcheur/
 * l'archive des avis expirés (chantier D) — ne modifie aucune donnée.
 */
function saasParserDateLimite(dateLimiteStr) {
  if (!dateLimiteStr) return null;
  const s = String(dateLimiteStr).replace(/^['~]/, "").split(" ")[0];
  const parts = s.split("-");
  if (parts.length !== 3) return null;
  const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
  return isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------------------
// ROUTEUR
// ---------------------------------------------------------------------------

/**
 * 📄 SaaS_11_Alerts.gs — saasRouterAlerts(route, methode, payload, user, e)
 */
function saasRouterAlerts(route, methode, payload, user, e) {
  // route ressemble à "/alerts" ou "/alerts/detail" ou "/alerts/mark"
  if (route === "/alerts" && methode === "GET")           return saasAlertsList(payload, user, e);
  if (route === "/alerts/detail" && methode === "GET")    return saasAlertsGet(payload, user, e);
  if (route === "/alerts/count" && methode === "GET")     return saasAlertsCount(payload, user, e);
  if (route === "/alerts/mark" && methode === "POST")     return saasAlertsMark(payload, user, e);
  if (route === "/alerts/export" && methode === "POST")   return saasAlertsExport(payload, user, e);
  if (route === "/alerts/decision" && methode === "POST") return saasAlertsSetDecision(payload, user, e);
  if (route === "/alerts/notes" && methode === "GET")     return saasAlertsNotesList(payload, user, e);
  if (route === "/alerts/notes" && methode === "POST")    return saasAlertsNotesAdd(payload, user, e);
  if (route === "/alerts/saved-searches" && methode === "GET")         return saasAlertsSavedSearchesList(payload, user, e);
  if (route === "/alerts/saved-searches" && methode === "POST")        return saasAlertsSavedSearchesCreate(payload, user, e);
  if (route === "/alerts/saved-searches/toggle" && methode === "POST") return saasAlertsSavedSearchesToggle(payload, user, e);
  return saasErreur("Route alertes inconnue : " + route, 404);
}

// ---------------------------------------------------------------------------
// LECTEURS D'ÉTAT UTILISATEUR
// ---------------------------------------------------------------------------

/**
 * 📄 SaaS_11_Alerts.gs — saasChargerStateUtilisateur(idClient)
 * Retourne une Map { idMatch -> { lu, etat, note, dateLu, dateAction, ligne } }
 */
function saasChargerStateUtilisateur(idClient) {
  const map = new Map();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName(SAAS_STATE_ALERTES);
  if (!feuille) return map;

  const data = feuille.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const idMatch = (data[i][0] || "").toString().trim();
    const idC = (data[i][1] || "").toString().trim();
    if (!idMatch || idC !== idClient) continue;
    map.set(idMatch, {
      ligne: i + 1,
      lu: (data[i][3] || "").toString().toUpperCase() === "OUI",
      etat: (data[i][4] || "NOUVEAU").toString().toUpperCase(),
      note: (data[i][5] || "").toString(),
      dateLu: (data[i][6] || "").toString(),
      dateAction: (data[i][7] || "").toString()
    });
  }
  return map;
}

/**
 * 📄 SaaS_11_Alerts.gs — saasSauverState(idMatch, idClient, idAO, etat, note)
 * Crée ou met à jour l'état utilisateur d'une alerte.
 */
function saasSauverState(idMatch, idClient, idAO, etat, note) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName(SAAS_STATE_ALERTES);
  if (!feuille) return false;

  const maintenant = saasDateMaintenant();
  const data = feuille.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if ((data[i][0] || "").toString().trim() === idMatch &&
        (data[i][1] || "").toString().trim() === idClient) {
      const lu = (data[i][3] || "").toString().toUpperCase();
      const dateLu = lu === "OUI" ? (data[i][6] || maintenant) : maintenant;
      feuille.getRange(i + 1, 4, 1, 5).setValues([secNeutraliserLigne([
        "OUI", etat, note || "", dateLu, maintenant
      ])]);
      return true;
    }
  }
  feuille.appendRow(secNeutraliserLigne([
    idMatch, idClient, idAO, "OUI", etat, note || "", maintenant, maintenant
  ]));
  return true;
}

/**
 * 📄 SaaS_11_Alerts.gs — saasSauverStateLu(idMatch, idClient, idAO)
 * Marque juste comme lu (sans changer l'état).
 */
function saasSauverStateLu(idMatch, idClient, idAO) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName(SAAS_STATE_ALERTES);
  if (!feuille) return false;
  const maintenant = saasDateMaintenant();
  const data = feuille.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if ((data[i][0] || "").toString().trim() === idMatch &&
        (data[i][1] || "").toString().trim() === idClient) {
      if ((data[i][3] || "").toString().toUpperCase() === "OUI") return true;
      feuille.getRange(i + 1, 4).setValue("OUI");
      feuille.getRange(i + 1, 7).setValue(maintenant);
      return true;
    }
  }
  feuille.appendRow([idMatch, idClient, idAO, "OUI", "NOUVEAU", "", maintenant, maintenant]);
  return true;
}

// ---------------------------------------------------------------------------
// CHARGEMENT DES ALERTES + AVIS
// ---------------------------------------------------------------------------

/**
 * 📄 SaaS_11_Alerts.gs — saasChargerMapAvis()
 * Retourne une Map { idAO -> objet avis }.
 */
function saasChargerMapAvis() {
  const map = new Map();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName(SHEET_AO);
  if (!feuille) return map;
  const data = feuille.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const id = (data[i][0] || "").toString().trim();
    if (!id) continue;
    map.set(id, {
      idAO: id,
      numeroAvis: (data[i][1] || "").toString(),
      dateCollecte: (data[i][2] || "").toString(),
      datePub: (data[i][3] || "").toString(),
      source: (data[i][4] || "").toString(),
      titre: (data[i][5] || "").toString(),
      maitreOuvrage: (data[i][6] || "").toString(),
      region: (data[i][7] || "").toString(),
      procedure: (data[i][8] || "").toString(),
      montant: (data[i][10] || "").toString(),
      dateLimite: (data[i][11] || "").toString(),
      lienDetail: (data[i][12] || "").toString(),
      lienDAO: (data[i][13] || "").toString(),
      statutPipeline: (data[i][14] || "").toString(),
      typePublication: (data[i][15] || "Appel_Offres").toString()
    });
  }
  return map;
}

/**
 * 📄 SaaS_11_Alerts.gs — saasChargerAlertesClient(idClient)
 * Retourne un tableau enrichi d'alertes pour un client donné.
 * Fusionne ALERTES_A_ENVOYER + TOUS_AO + ALERTES_USER_STATE.
 */
function saasChargerAlertesClient(idClient) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName("ALERTES_A_ENVOYER");
  if (!feuille) return [];

  const mapAvis = saasChargerMapAvis();
  const mapState = saasChargerStateUtilisateur(idClient);
  const mapDecision = saasChargerSuiviClient(idClient);
  const mapNbNotes = saasCompterNotesClient(idClient);
  const data = feuille.getDataRange().getValues();
  const out = [];

  for (let i = 1; i < data.length; i++) {
    const idC = (data[i][3] || "").toString().trim();
    if (idC !== idClient) continue;

    const idMatch = (data[i][0] || "").toString().trim();
    const idAO = (data[i][1] || "").toString().trim();
    const avis = mapAvis.get(idAO) || {};
    const st = mapState.get(idMatch) || { lu: false, etat: "NOUVEAU", note: "", dateLu: "", dateAction: "" };
    const dec = mapDecision.get(idMatch) || { decision: "EN_ATTENTE", justification: "", lienComplementaire: "", decidePar: "", dateDecision: "" };

    out.push({
      idMatch: idMatch,
      idAO: idAO,
      numeroAvis: (data[i][2] || "").toString(),
      dateMatch: (data[i][6] || "").toString(),
      statutPipeline: (data[i][7] || "").toString().toUpperCase(),
      dateEnvoi: (data[i][8] || "").toString(),
      score: Number(data[i][9]) || 0,
      justification: (data[i][10] || "").toString(),
      scoreMots: Number(data[i][11]) || 0,
      scoreIA: Number(data[i][12]) || 0,
      // Avis enrichi
      titre: avis.titre || "",
      maitreOuvrage: avis.maitreOuvrage || "",
      region: avis.region || "",
      procedure: avis.procedure || "",
      montant: avis.montant || "",
      dateLimite: avis.dateLimite || "",
      lienDetail: avis.lienDetail || "",
      lienDAO: avis.lienDAO || "",
      source: avis.source || "",
      typePublication: avis.typePublication || "Appel_Offres",
      // État utilisateur
      lu: st.lu,
      etat: st.etat,
      noteClient: st.note,
      dateLu: st.dateLu,
      dateAction: st.dateAction,
      // Décision Go/No-Go (chantier A — couche additive, n'affecte ni etat ni le pipeline d'envoi)
      decision: dec.decision,
      decisionJustification: dec.justification,
      decisionLienComplementaire: dec.lienComplementaire,
      decisionPar: dec.decidePar,
      dateDecision: dec.dateDecision,
      nbNotes: mapNbNotes.get(idMatch) || 0,
      // Archive (chantier D) — calculé à la volée, n'affecte ni etat ni statutPipeline
      estExpire: (function () {
        const d = saasParserDateLimite(avis.dateLimite || "");
        return d ? d.getTime() < Date.now() : false;
      })()
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// HANDLERS
// ---------------------------------------------------------------------------

/**
 * 📄 SaaS_11_Alerts.gs — saasAlertsList(payload, user, e)
 * GET /client/alerts
 * Paramètres (tous optionnels) :
 *   statut (pipeline), etat, lu (OUI/NON), region, procedure,
 *   scoreMin, search, dateFrom, dateTo, sortBy (date|score), sortOrder (asc|desc),
 *   limit, offset
 */
function saasAlertsList(payload, user, e) {
  const toutes = saasChargerAlertesClient(user.idClient);
  const p = payload || {};

  const statutFiltre = (p.statut || "").toString().toUpperCase();
  const etatFiltre = (p.etat || "").toString().toUpperCase();
  const luFiltre = (p.lu || "").toString().toUpperCase();
  const regionFiltre = (p.region || "").toString().toUpperCase();
  const procedureFiltre = (p.procedure || "").toString().toUpperCase();
  const scoreMin = p.scoreMin ? Number(p.scoreMin) : null;
  const recherche = (p.search || "").toString().toLowerCase();
  const dateFrom = p.dateFrom ? new Date(p.dateFrom) : null;
  const dateTo = p.dateTo ? new Date(p.dateTo) : null;
  // Archive (chantier D) : "" (défaut, historique) = pas de filtre, comportement inchangé.
  // "OUI" = uniquement les avis expirés (vue archive). "NON" = uniquement les avis actifs.
  const expireFiltre = (p.expire || "").toString().toUpperCase();

  const sortBy = (p.sortBy || "date").toString().toLowerCase();
  const sortOrder = (p.sortOrder || "desc").toString().toLowerCase();
  const limit = Math.min(
    SAAS_ALERTES_MAX_LIMIT,
    Math.max(1, Number(p.limit) || SAAS_ALERTES_DEFAULT_LIMIT)
  );
  const offset = Math.max(0, Number(p.offset) || 0);

  // Filtres
  let filtrees = toutes.filter(function (a) {
    if (statutFiltre && a.statutPipeline !== statutFiltre) return false;
    if (etatFiltre && a.etat !== etatFiltre) return false;
    if (luFiltre === "OUI" && !a.lu) return false;
    if (luFiltre === "NON" && a.lu) return false;
    if (regionFiltre && a.region.toUpperCase().indexOf(regionFiltre) === -1) return false;
    if (procedureFiltre && a.procedure.toUpperCase().indexOf(procedureFiltre) === -1) return false;
    if (scoreMin !== null && a.score < scoreMin) return false;
    if (recherche) {
      const hay = (a.titre + " " + a.maitreOuvrage + " " + a.justification + " " + a.numeroAvis).toLowerCase();
      if (hay.indexOf(recherche) === -1) return false;
    }
    if (dateFrom) {
      const d = new Date(a.dateMatch);
      if (isNaN(d.getTime()) || d < dateFrom) return false;
    }
    if (dateTo) {
      const d = new Date(a.dateMatch);
      if (isNaN(d.getTime()) || d > dateTo) return false;
    }
    if (expireFiltre === "OUI" && !a.estExpire) return false;
    if (expireFiltre === "NON" && a.estExpire) return false;
    return true;
  });

  // Tri
  filtrees.sort(function (a, b) {
    let va, vb;
    if (sortBy === "score") { va = a.score; vb = b.score; }
    else { va = new Date(a.dateMatch).getTime() || 0; vb = new Date(b.dateMatch).getTime() || 0; }
    return sortOrder === "asc" ? (va - vb) : (vb - va);
  });

  const total = filtrees.length;
  const page = filtrees.slice(offset, offset + limit);

  return saasReponse(true, {
    total: total,
    limit: limit,
    offset: offset,
    count: page.length,
    alertes: page
  }, "Liste récupérée.", 200);
}

/**
 * 📄 SaaS_11_Alerts.gs — saasAlertsGet(payload, user, e)
 * GET /client/alerts/detail?idMatch=xxx
 */
function saasAlertsGet(payload, user, e) {
  const idMatch = (payload.idMatch || "").toString().trim();
  if (!idMatch) return saasErreur("Paramètre idMatch requis.", 400);

  const toutes = saasChargerAlertesClient(user.idClient);
  const alerte = toutes.find(function (a) { return a.idMatch === idMatch; });
  if (!alerte) return saasErreur("Alerte introuvable.", 404);

  // Marquer comme lue automatiquement
  if (!alerte.lu) {
    saasSauverStateLu(alerte.idMatch, user.idClient, alerte.idAO);
    alerte.lu = true;
  }

  return saasReponse(true, alerte, "Alerte récupérée.", 200);
}

/**
 * 📄 SaaS_11_Alerts.gs — saasAlertsCount(payload, user, e)
 * GET /client/alerts/count
 * Retourne : { total, nonLues, nouveaux, traites, ignores, sauvegardes }
 */
function saasAlertsCount(payload, user, e) {
  const toutes = saasChargerAlertesClient(user.idClient);
  let nonLues = 0, nouveaux = 0, traites = 0, ignores = 0, sauvegardes = 0, expires = 0;
  toutes.forEach(function (a) {
    if (!a.lu) nonLues++;
    if (a.etat === "NOUVEAU") nouveaux++;
    else if (a.etat === "TRAITE") traites++;
    else if (a.etat === "IGNORE") ignores++;
    else if (a.etat === "SAUVEGARDE") sauvegardes++;
    if (a.estExpire) expires++;
  });
  return saasReponse(true, {
    total: toutes.length,
    nonLues: nonLues,
    nouveaux: nouveaux,
    traites: traites,
    ignores: ignores,
    sauvegardes: sauvegardes,
    expires: expires
  }, "Compteurs récupérés.", 200);
}

/**
 * 📄 SaaS_11_Alerts.gs — saasAlertsMark(payload, user, e)
 * POST /client/alerts/mark
 * Body : { idMatch, etat, note? }
 * etat ∈ { NOUVEAU, TRAITE, IGNORE, SAUVEGARDE }
 */
function saasAlertsMark(payload, user, e) {
  const idMatch = (payload.idMatch || "").toString().trim();
  const etatBrut = (payload.etat || "").toString().toUpperCase();
  const note = (payload.note || "").toString().substring(0, 500);

  if (!idMatch) return saasErreur("idMatch requis.", 400);
  const etatsValides = ["NOUVEAU", "TRAITE", "IGNORE", "SAUVEGARDE"];
  if (etatsValides.indexOf(etatBrut) === -1) {
    return saasErreur("État invalide. Valeurs acceptées : " + etatsValides.join(", "), 400);
  }

  const toutes = saasChargerAlertesClient(user.idClient);
  const alerte = toutes.find(function (a) { return a.idMatch === idMatch; });
  if (!alerte) return saasErreur("Alerte introuvable.", 404);

  saasSauverState(idMatch, user.idClient, alerte.idAO, etatBrut, note);

  saasLogger(user.idUser, user.email, user.role, "ALERT_MARK",
    "idMatch=" + idMatch + " etat=" + etatBrut, saasExtraireIp(e), true);

  return saasReponse(true, { idMatch: idMatch, etat: etatBrut, note: note },
    "Alerte mise à jour.", 200);
}

/**
 * LOT S1b — Met en forme une cellule du CSV d'export (séparateur « ; », tout entre guillemets).
 * Un texte qui commence par = + - @ (ou par une tabulation / un retour chariot) serait exécuté
 * comme une formule à l'ouverture dans Excel ou Sheets : il reçoit une apostrophe devant.
 */
function saasAlertsCsvCellule(v) {
  const s = secNeutraliserFormule((v === null || v === undefined) ? "" : String(v));
  return '"' + s.replace(/"/g, '""') + '"';
}

/**
 * 📄 SaaS_11_Alerts.gs — saasAlertsExport(payload, user, e)
 * POST /client/alerts/export
 * Body : mêmes filtres que /client/alerts (hors pagination)
 * Retourne : { format: "csv", nomFichier, contenu }
 */
function saasAlertsExport(payload, user, e) {
  // Réutilise la logique de filtre en appelant saasAlertsList avec limit max
  const p = Object.assign({}, payload || {}, {
    limit: SAAS_ALERTES_MAX_LIMIT,
    offset: 0
  });
  const rep = saasAlertsList(p, user, e);
  const parsed = JSON.parse(rep.getContent());
  if (!parsed.succes) return rep;

  const alertes = parsed.donnees.alertes || [];
  const sep = ";";
  const esc = saasAlertsCsvCellule;
  const lignes = [];
  lignes.push([
    "ID_Match","Numero_Avis","Titre","Maitre_Ouvrage","Region","Procedure",
    "Montant","Date_Limite","Score","Motif_IA","Etat","Date_Match","Lien"
  ].map(esc).join(sep));

  alertes.forEach(function (a) {
    lignes.push([
      a.idMatch, a.numeroAvis, a.titre, a.maitreOuvrage, a.region, a.procedure,
      a.montant, a.dateLimite, a.score, a.justification, a.etat, a.dateMatch, a.lienDetail
    ].map(esc).join(sep));
  });

  const contenu = "\uFEFF" + lignes.join("\n"); // BOM UTF-8 pour Excel
  const nomFichier = "alertes_" + user.idClient + "_" + Utilities.formatDate(new Date(), SAAS_FUSEAU, "yyyyMMdd_HHmm") + ".csv";

  saasLogger(user.idUser, user.email, user.role, "ALERT_EXPORT",
    alertes.length + " lignes", saasExtraireIp(e), true);

  return saasReponse(true, {
    format: "csv",
    nomFichier: nomFichier,
    count: alertes.length,
    contenu: contenu
  }, "Export généré.", 200);
}

// ============================================================================
// CHANTIER A — DÉCISION GO/NO-GO & NOTES PAR AVIS
// ============================================================================
// Couche additive : ne modifie ni ALERTES_A_ENVOYER ni l'état (etat) existant,
// qui continuent seuls à piloter le pipeline d'envoi d'e-mails. Deux nouveaux
// onglets, créés une seule fois par saasInitSuiviAvisEtNotes() :
//   SUIVI_AVIS  (1 ligne par couple ID_Match/ID_Client) :
//     ID_Match | ID_Client | ID_AO | Decision | Justification |
//     Lien_DAO_Complementaire | Decide_Par_Email | Decide_Par_Role | Date_Decision
//   NOTES_AVIS  (append-only, plusieurs lignes par avis) :
//     ID_Note | ID_Match | ID_Client | ID_AO | Auteur_Email | Auteur_Role |
//     Texte | Date_Creation
// ============================================================================

const SAAS_SHEET_SUIVI_AVIS = "SUIVI_AVIS";
const SAAS_SHEET_NOTES_AVIS = "NOTES_AVIS";
const SAAS_DECISIONS_VALIDES = ["GO", "NOGO", "EN_ATTENTE"];

/**
 * ÉTAPE UNIQUE — Crée les onglets SUIVI_AVIS et NOTES_AVIS s'ils n'existent pas
 * encore (avec leurs en-têtes). Ne touche à rien s'ils existent déjà : sans
 * danger si relancée.
 */
function saasInitSuiviAvisEtNotes() {
  Logger.log("=================================================");
  Logger.log("=== INITIALISATION SUIVI_AVIS & NOTES_AVIS ===");
  Logger.log("=================================================");
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let f1 = ss.getSheetByName(SAAS_SHEET_SUIVI_AVIS);
  if (!f1) {
    f1 = ss.insertSheet(SAAS_SHEET_SUIVI_AVIS);
    f1.appendRow([
      "ID_Match", "ID_Client", "ID_AO", "Decision", "Justification",
      "Lien_DAO_Complementaire", "Decide_Par_Email", "Decide_Par_Role", "Date_Decision"
    ]);
    f1.setFrozenRows(1);
    Logger.log("✅ Onglet " + SAAS_SHEET_SUIVI_AVIS + " créé avec en-têtes.");
  } else {
    Logger.log("· Onglet " + SAAS_SHEET_SUIVI_AVIS + " déjà présent — inchangé.");
  }

  let f2 = ss.getSheetByName(SAAS_SHEET_NOTES_AVIS);
  if (!f2) {
    f2 = ss.insertSheet(SAAS_SHEET_NOTES_AVIS);
    f2.appendRow([
      "ID_Note", "ID_Match", "ID_Client", "ID_AO", "Auteur_Email", "Auteur_Role",
      "Texte", "Date_Creation"
    ]);
    f2.setFrozenRows(1);
    Logger.log("✅ Onglet " + SAAS_SHEET_NOTES_AVIS + " créé avec en-têtes.");
  } else {
    Logger.log("· Onglet " + SAAS_SHEET_NOTES_AVIS + " déjà présent — inchangé.");
  }

  Logger.log("Terminé. Aucun onglet existant n'a été modifié.");
  Logger.log("=================================================");
}

/** Lit SUIVI_AVIS pour un client. Retourne une Map idMatch -> décision. */
function saasChargerSuiviClient(idClient) {
  const map = new Map();
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_SUIVI_AVIS);
  if (!feuille) return map;
  const data = feuille.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const idMatch = (data[i][0] || "").toString().trim();
    const idC = (data[i][1] || "").toString().trim();
    if (!idMatch || idC !== idClient) continue;
    map.set(idMatch, {
      ligne: i + 1,
      decision: (data[i][3] || "EN_ATTENTE").toString().toUpperCase(),
      justification: (data[i][4] || "").toString(),
      lienComplementaire: (data[i][5] || "").toString(),
      decidePar: (data[i][6] || "").toString(),
      dateDecision: (data[i][8] || "").toString()
    });
  }
  return map;
}

/** Crée ou met à jour la décision Go/No-Go d'un avis pour un client donné. */
function saasSauverDecision(idMatch, idClient, idAO, decision, justification, lienComplementaire, user) {
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_SUIVI_AVIS);
  if (!feuille) return false;
  const maintenant = saasDateMaintenant();
  const data = feuille.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if ((data[i][0] || "").toString().trim() === idMatch &&
        (data[i][1] || "").toString().trim() === idClient) {
      feuille.getRange(i + 1, 4, 1, 6).setValues([secNeutraliserLigne([
        decision, justification || "", lienComplementaire || "", user.email, user.role, maintenant
      ])]);
      return true;
    }
  }
  feuille.appendRow(secNeutraliserLigne([
    idMatch, idClient, idAO, decision, justification || "", lienComplementaire || "",
    user.email, user.role, maintenant
  ]));
  return true;
}

/** Compte le nombre de notes par avis pour un client. Retourne Map idMatch -> nombre. */
function saasCompterNotesClient(idClient) {
  const map = new Map();
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_NOTES_AVIS);
  if (!feuille) return map;
  const data = feuille.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const idC = (data[i][2] || "").toString().trim();
    if (idC !== idClient) continue;
    const idMatch = (data[i][1] || "").toString().trim();
    if (!idMatch) continue;
    map.set(idMatch, (map.get(idMatch) || 0) + 1);
  }
  return map;
}

/** Lit toutes les notes d'un avis pour un client, triées du plus récent au plus ancien. */
function saasChargerNotesAlerte(idMatch, idClient) {
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_NOTES_AVIS);
  if (!feuille) return [];
  const data = feuille.getDataRange().getValues();
  const notes = [];
  for (let i = 1; i < data.length; i++) {
    if ((data[i][1] || "").toString().trim() !== idMatch) continue;
    if ((data[i][2] || "").toString().trim() !== idClient) continue;
    notes.push({
      idNote: (data[i][0] || "").toString(),
      idMatch: (data[i][1] || "").toString(),
      auteurEmail: (data[i][4] || "").toString(),
      auteurRole: (data[i][5] || "").toString(),
      texte: (data[i][6] || "").toString(),
      dateCreation: (data[i][7] || "").toString()
    });
  }
  notes.sort(function (a, b) { return new Date(b.dateCreation).getTime() - new Date(a.dateCreation).getTime(); });
  return notes;
}

/** Ajoute une note (append-only, jamais de suppression ni de modification). */
function saasAjouterNote(idMatch, idClient, idAO, user, texte) {
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_NOTES_AVIS);
  if (!feuille) return null;
  const idNote = saasGenererId("NOTE");
  const maintenant = saasDateMaintenant();
  feuille.appendRow(secNeutraliserLigne([idNote, idMatch, idClient, idAO, user.email, user.role, texte, maintenant]));
  return {
    idNote: idNote,
    idMatch: idMatch,
    auteurEmail: user.email,
    auteurRole: user.role,
    texte: texte,
    dateCreation: maintenant
  };
}

/**
 * 📄 SaaS_11_Alerts.gs — saasAlertsSetDecision(payload, user, e)
 * POST /client/alerts/decision
 * Body : { idMatch, decision, justification?, lienDaoComplementaire? }
 * decision ∈ { GO, NOGO, EN_ATTENTE }
 */
function saasAlertsSetDecision(payload, user, e) {
  const idMatch = (payload.idMatch || "").toString().trim();
  const decision = (payload.decision || "").toString().toUpperCase();
  const justification = (payload.justification || "").toString().substring(0, 1000);
  const lienComplementaire = (payload.lienDaoComplementaire || "").toString().substring(0, 500);

  if (!idMatch) return saasErreur("idMatch requis.", 400);
  if (SAAS_DECISIONS_VALIDES.indexOf(decision) === -1) {
    return saasErreur("decision invalide. Valeurs acceptées : " + SAAS_DECISIONS_VALIDES.join(", "), 400);
  }

  const toutes = saasChargerAlertesClient(user.idClient);
  const alerte = toutes.find(function (a) { return a.idMatch === idMatch; });
  if (!alerte) return saasErreur("Alerte introuvable.", 404);

  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_SUIVI_AVIS);
  if (!feuille) return saasErreur("Onglet SUIVI_AVIS absent. Lancer saasInitSuiviAvisEtNotes() dans l'éditeur.", 500);

  saasSauverDecision(idMatch, user.idClient, alerte.idAO, decision, justification, lienComplementaire, user);

  saasLogger(user.idUser, user.email, user.role, "ALERT_DECISION",
    "idMatch=" + idMatch + " decision=" + decision, saasExtraireIp(e), true);

  return saasReponse(true, {
    idMatch: idMatch,
    decision: decision,
    decisionJustification: justification,
    decisionLienComplementaire: lienComplementaire,
    decisionPar: user.email,
    dateDecision: saasDateMaintenant()
  }, "Décision enregistrée.", 200);
}

/**
 * 📄 SaaS_11_Alerts.gs — saasAlertsNotesList(payload, user, e)
 * GET /client/alerts/notes?idMatch=xxx
 */
function saasAlertsNotesList(payload, user, e) {
  const idMatch = (payload.idMatch || "").toString().trim();
  if (!idMatch) return saasErreur("idMatch requis.", 400);

  const toutes = saasChargerAlertesClient(user.idClient);
  const alerte = toutes.find(function (a) { return a.idMatch === idMatch; });
  if (!alerte) return saasErreur("Alerte introuvable.", 404);

  const notes = saasChargerNotesAlerte(idMatch, user.idClient);
  return saasReponse(true, { idMatch: idMatch, total: notes.length, notes: notes }, "Notes récupérées.", 200);
}

/**
 * 📄 SaaS_11_Alerts.gs — saasAlertsNotesAdd(payload, user, e)
 * POST /client/alerts/notes
 * Body : { idMatch, texte }
 */
function saasAlertsNotesAdd(payload, user, e) {
  const idMatch = (payload.idMatch || "").toString().trim();
  const texte = (payload.texte || "").toString().trim().substring(0, 2000);

  if (!idMatch) return saasErreur("idMatch requis.", 400);
  if (!texte) return saasErreur("Le texte de la note est requis.", 400);

  const toutes = saasChargerAlertesClient(user.idClient);
  const alerte = toutes.find(function (a) { return a.idMatch === idMatch; });
  if (!alerte) return saasErreur("Alerte introuvable.", 404);

  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_NOTES_AVIS);
  if (!feuille) return saasErreur("Onglet NOTES_AVIS absent. Lancer saasInitSuiviAvisEtNotes() dans l'éditeur.", 500);

  const note = saasAjouterNote(idMatch, user.idClient, alerte.idAO, user, texte);

  saasLogger(user.idUser, user.email, user.role, "ALERT_NOTE_ADD",
    "idMatch=" + idMatch, saasExtraireIp(e), true);

  return saasReponse(true, { idMatch: idMatch, note: note }, "Note ajoutée.", 201);
}

/**
 * TEST DU CHANTIER A — utilise un idMatch/idClient fictifs (préfixe TEST-) pour ne
 * jamais toucher aux vraies données. Les lignes de test restent visibles dans
 * SUIVI_AVIS/NOTES_AVIS (append-only, aucune suppression) mais sont clairement
 * identifiables par leur préfixe.
 */
function saasTesterDecisionEtNotes() {
  Logger.log("=================================================");
  Logger.log("=== TEST CHANTIER A : DÉCISION GO/NO-GO & NOTES ===");
  Logger.log("=================================================");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(SAAS_SHEET_SUIVI_AVIS) || !ss.getSheetByName(SAAS_SHEET_NOTES_AVIS)) {
    Logger.log("❌ Onglets absents. Lancez d'abord saasInitSuiviAvisEtNotes().");
    return;
  }

  const faux = { idUser: "TEST", email: "test-chantier-a@local", role: "CLIENT", idClient: "TEST-CLI" };
  const idMatchTest = "TEST-MATCH-" + new Date().getTime();

  Logger.log("--- saasSauverDecision (upsert direct, hors route) ---");
  saasSauverDecision(idMatchTest, faux.idClient, "TEST-AO", "GO", "Test automatique", "", faux);
  const relu = saasChargerSuiviClient(faux.idClient).get(idMatchTest);
  Logger.log(relu && relu.decision === "GO" ? "✅ Décision relue correctement (GO)." : "❌ Décision non relue.");

  Logger.log("--- saasAjouterNote + saasChargerNotesAlerte (hors route) ---");
  saasAjouterNote(idMatchTest, faux.idClient, "TEST-AO", faux, "Ceci est une note de test.");
  const notes = saasChargerNotesAlerte(idMatchTest, faux.idClient);
  Logger.log(notes.length === 1 ? "✅ Note ajoutée et relue (1 note)." : "❌ Note non relue (" + notes.length + ").");

  Logger.log("--- POST /client/alerts/decision avec une décision invalide (doit être REFUSÉ) ---");
  const refus = saasAlertsSetDecision({ idMatch: idMatchTest, decision: "PEUT_ETRE" }, faux, null);
  Logger.log(refus.getContent());

  Logger.log("--- GET /client/alerts avec expire=TOUS (doit inclure le champ estExpire, lecture seule) ---");
  const listeTest = saasAlertsList({ expire: "TOUS", limit: 1 }, faux, null);
  Logger.log(listeTest.getContent());

  Logger.log("");
  Logger.log("Les lignes TEST-* peuvent être laissées telles quelles (aucune suppression de ligne) ou nettoyées manuellement plus tard si besoin.");
  Logger.log("=================================================");
}

// ============================================================================
// CHANTIER C — RECHERCHES SAUVEGARDÉES (raccourcis de filtres, par client)
// ============================================================================
// Partagées entre tous les utilisateurs d'un même client (pas de notification
// automatique : un simple raccourci pour réappliquer une combinaison de
// filtres en un clic). Onglet dédié RECHERCHES_SAUVEGARDEES, créé une seule
// fois par saasInitRecherchesSauvegardees(). "Suppression" = désactivation
// (colonne Actif), jamais de ligne réellement effacée.
//   ID_Recherche | ID_Client | Nom | Filtres_JSON | Actif | Cree_Par_Email | Date_Creation
// ============================================================================

const SAAS_SHEET_RECHERCHES = "RECHERCHES_SAUVEGARDEES";
const SAAS_RECHERCHES_MAX_ACTIVES = 20;
// Seules ces clés de filtre (identiques à GET /client/alerts) sont acceptées ;
// tout le reste est ignoré silencieusement pour éviter de stocker n'importe quoi.
const SAAS_RECHERCHES_CLES_FILTRES = [
  "statut", "etat", "lu", "region", "procedure", "scoreMin",
  "search", "dateFrom", "dateTo", "sortBy", "sortOrder", "expire"
];

/**
 * ÉTAPE UNIQUE — Crée l'onglet RECHERCHES_SAUVEGARDEES s'il n'existe pas
 * encore. Sans danger si relancée.
 */
function saasInitRecherchesSauvegardees() {
  Logger.log("=================================================");
  Logger.log("=== INITIALISATION RECHERCHES_SAUVEGARDEES ===");
  Logger.log("=================================================");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let f = ss.getSheetByName(SAAS_SHEET_RECHERCHES);
  if (!f) {
    f = ss.insertSheet(SAAS_SHEET_RECHERCHES);
    f.appendRow(["ID_Recherche", "ID_Client", "Nom", "Filtres_JSON", "Actif", "Cree_Par_Email", "Date_Creation"]);
    f.setFrozenRows(1);
    Logger.log("✅ Onglet " + SAAS_SHEET_RECHERCHES + " créé avec en-têtes.");
  } else {
    Logger.log("· Onglet " + SAAS_SHEET_RECHERCHES + " déjà présent — inchangé.");
  }
  Logger.log("=================================================");
}

/** Ne garde que les clés de filtre connues, pour éviter de stocker n'importe quel objet. */
function saasNettoyerFiltresRecherche(filtresBruts) {
  const propre = {};
  if (!filtresBruts || typeof filtresBruts !== "object") return propre;
  SAAS_RECHERCHES_CLES_FILTRES.forEach(function (cle) {
    if (filtresBruts[cle] !== undefined && filtresBruts[cle] !== "") {
      propre[cle] = filtresBruts[cle];
    }
  });
  return propre;
}

/** Lit les recherches sauvegardées actives d'un client. */
function saasChargerRecherchesClient(idClient) {
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_RECHERCHES);
  if (!feuille) return [];
  const data = feuille.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < data.length; i++) {
    if ((data[i][1] || "").toString().trim() !== idClient) continue;
    if ((data[i][4] || "").toString().toUpperCase() !== "OUI") continue;
    let filtres = {};
    try { filtres = JSON.parse(data[i][3] || "{}"); } catch (e) { filtres = {}; }
    out.push({
      idRecherche: (data[i][0] || "").toString(),
      nom: (data[i][2] || "").toString(),
      filtres: filtres,
      creeParEmail: (data[i][5] || "").toString(),
      dateCreation: (data[i][6] || "").toString()
    });
  }
  out.sort(function (a, b) { return new Date(b.dateCreation).getTime() - new Date(a.dateCreation).getTime(); });
  return out;
}

/**
 * 📄 SaaS_11_Alerts.gs — saasAlertsSavedSearchesList(payload, user, e)
 * GET /client/alerts/saved-searches
 */
function saasAlertsSavedSearchesList(payload, user, e) {
  const recherches = saasChargerRecherchesClient(user.idClient);
  return saasReponse(true, { total: recherches.length, recherches: recherches }, "Recherches sauvegardées récupérées.", 200);
}

/**
 * 📄 SaaS_11_Alerts.gs — saasAlertsSavedSearchesCreate(payload, user, e)
 * POST /client/alerts/saved-searches
 * Body : { nom, filtres: { ... } }
 */
function saasAlertsSavedSearchesCreate(payload, user, e) {
  const nom = (payload.nom || "").toString().trim().substring(0, 100);
  if (nom.length < 2) return saasErreur("Le nom de la recherche doit contenir au moins 2 caractères.", 400);

  const filtres = saasNettoyerFiltresRecherche(payload.filtres);
  if (Object.keys(filtres).length === 0) {
    return saasErreur("Au moins un critère de filtre est requis.", 400);
  }

  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_RECHERCHES);
  if (!feuille) return saasErreur("Onglet RECHERCHES_SAUVEGARDEES absent. Lancer saasInitRecherchesSauvegardees() dans l'éditeur.", 500);

  const actives = saasChargerRecherchesClient(user.idClient);
  if (actives.length >= SAAS_RECHERCHES_MAX_ACTIVES) {
    return saasErreur("Limite de " + SAAS_RECHERCHES_MAX_ACTIVES + " recherches sauvegardées atteinte. Désactivez-en une avant d'en créer une nouvelle.", 409);
  }

  const idRecherche = saasGenererId("RECH");
  const maintenant = saasDateMaintenant();
  feuille.appendRow(secNeutraliserLigne([idRecherche, user.idClient, nom, JSON.stringify(filtres), "OUI", user.email, maintenant]));

  saasLogger(user.idUser, user.email, user.role, "SAVED_SEARCH_CREATE",
    "idRecherche=" + idRecherche + " nom=" + nom, saasExtraireIp(e), true);

  return saasReponse(true, {
    idRecherche: idRecherche, nom: nom, filtres: filtres, creeParEmail: user.email, dateCreation: maintenant
  }, "Recherche sauvegardée.", 201);
}

/**
 * 📄 SaaS_11_Alerts.gs — saasAlertsSavedSearchesToggle(payload, user, e)
 * POST /client/alerts/saved-searches/toggle
 * Body : { idRecherche, actif: "OUI" | "NON" }
 * "Suppression" = désactivation (actif=NON) : aucune ligne n'est jamais effacée.
 */
function saasAlertsSavedSearchesToggle(payload, user, e) {
  const idRecherche = (payload.idRecherche || "").toString().trim();
  const actif = (payload.actif || "").toString().toUpperCase();
  if (!idRecherche) return saasErreur("idRecherche requis.", 400);
  if (actif !== "OUI" && actif !== "NON") return saasErreur("actif doit valoir OUI ou NON.", 400);

  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_RECHERCHES);
  if (!feuille) return saasErreur("Onglet RECHERCHES_SAUVEGARDEES absent.", 500);

  const data = feuille.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if ((data[i][0] || "").toString().trim() === idRecherche &&
        (data[i][1] || "").toString().trim() === user.idClient) {
      feuille.getRange(i + 1, 5).setValue(actif);
      saasLogger(user.idUser, user.email, user.role, "SAVED_SEARCH_TOGGLE",
        "idRecherche=" + idRecherche + " actif=" + actif, saasExtraireIp(e), true);
      return saasReponse(true, { idRecherche: idRecherche, actif: actif }, "Recherche mise à jour.", 200);
    }
  }
  return saasErreur("Recherche sauvegardée introuvable.", 404);
}

/**
 * TEST DU CHANTIER C — utilise un idClient fictif (TEST-CLI) pour ne jamais
 * toucher aux vraies recherches d'un client. Append-only : la ligne de test
 * reste visible, sans suppression.
 */
function saasTesterRecherchesSauvegardees() {
  Logger.log("=================================================");
  Logger.log("=== TEST CHANTIER C : RECHERCHES SAUVEGARDÉES ===");
  Logger.log("=================================================");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(SAAS_SHEET_RECHERCHES)) {
    Logger.log("❌ Onglet absent. Lancez d'abord saasInitRecherchesSauvegardees().");
    return;
  }

  const faux = { idUser: "TEST", email: "test-chantier-c@local", role: "CLIENT", idClient: "TEST-CLI" };

  Logger.log("--- POST /client/alerts/saved-searches avec filtres vides (doit être REFUSÉ) ---");
  const refusVide = saasAlertsSavedSearchesCreate({ nom: "Test vide", filtres: {} }, faux, null);
  Logger.log(refusVide.getContent());

  Logger.log("--- POST /client/alerts/saved-searches (création normale) ---");
  const creation = saasAlertsSavedSearchesCreate({ nom: "Test région Centre", filtres: { region: "CENTRE", scoreMin: 3 } }, faux, null);
  Logger.log(creation.getContent());
  const idCree = JSON.parse(creation.getContent()).donnees.idRecherche;

  Logger.log("--- GET /client/alerts/saved-searches (doit contenir la recherche créée) ---");
  const liste = saasAlertsSavedSearchesList({}, faux, null);
  Logger.log(liste.getContent());

  Logger.log("--- POST /client/alerts/saved-searches/toggle (désactivation) ---");
  const toggle = saasAlertsSavedSearchesToggle({ idRecherche: idCree, actif: "NON" }, faux, null);
  Logger.log(toggle.getContent());

  const listeApres = saasAlertsSavedSearchesList({}, faux, null);
  const nbApres = JSON.parse(listeApres.getContent()).donnees.total;
  Logger.log(nbApres === 0 ? "✅ Désactivation confirmée (0 recherche active restante)." : "❌ La recherche apparaît encore comme active.");

  Logger.log("=================================================");
}



// ============================================================================
// (ancien fichier SaaS_12_Stats.gs) — ENDPOINTS CLIENT : STATISTIQUES
// ============================================================================

/**
 * 📄 SaaS_12_Stats.gs — saasRouterStats(route, methode, payload, user, e)
 */
function saasRouterStats(route, methode, payload, user, e) {
  if (methode !== "GET") return saasErreur("Méthode non autorisée.", 405);
  if (route === "/stats/dashboard")     return saasStatsDashboard(payload, user, e);
  if (route === "/stats/by-region")     return saasStatsByRegion(payload, user, e);
  if (route === "/stats/by-procedure")  return saasStatsByProcedure(payload, user, e);
  if (route === "/stats/timeline")      return saasStatsTimeline(payload, user, e);
  if (route === "/stats/top-mo")        return saasStatsTopMO(payload, user, e);
  return saasErreur("Route stats inconnue : " + route, 404);
}

/**
 * 📄 SaaS_12_Stats.gs — saasFiltreParJours(alertes, jours)
 */
function saasFiltreParJours(alertes, jours) {
  if (!jours || jours <= 0) return alertes;
  const limite = new Date();
  limite.setDate(limite.getDate() - jours);
  return alertes.filter(function (a) {
    const d = new Date(a.dateMatch);
    return !isNaN(d.getTime()) && d >= limite;
  });
}

/**
 * 📄 SaaS_12_Stats.gs — saasStatsDashboard(payload, user, e)
 * GET /client/stats/dashboard?jours=30
 */
function saasStatsDashboard(payload, user, e) {
  const jours = Number(payload.jours) || 30;
  const toutes = saasChargerAlertesClient(user.idClient);
  const recentes = saasFiltreParJours(toutes, jours);

  // Agrégats
  let scoreMoyen = 0, scoreSomme = 0, scoreN = 0;
  let nonLues = 0, traites = 0, ignores = 0, sauvegardes = 0;

  recentes.forEach(function (a) {
    if (a.score > 0) { scoreSomme += a.score; scoreN++; }
    if (!a.lu) nonLues++;
    if (a.etat === "TRAITE") traites++;
    else if (a.etat === "IGNORE") ignores++;
    else if (a.etat === "SAUVEGARDE") sauvegardes++;
  });
  scoreMoyen = scoreN > 0 ? Number((scoreSomme / scoreN).toFixed(2)) : 0;

  // Répartition par type de publication
  const parType = {};
  recentes.forEach(function (a) {
    const t = a.typePublication || "Appel_Offres";
    parType[t] = (parType[t] || 0) + 1;
  });

  // Prochaine échéance
  let prochaineEcheance = null;
  recentes.forEach(function (a) {
    if (!a.dateLimite || a.dateLimite.indexOf("N/A") !== -1) return;
    const s = a.dateLimite.replace(/^['~]/, "").split(" ")[0];
    const parts = s.split("-");
    if (parts.length !== 3) return;
    const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
    if (isNaN(d.getTime())) return;
    if (d < new Date()) return;
    if (!prochaineEcheance || d < prochaineEcheance.date) {
      prochaineEcheance = { date: d, alerte: a };
    }
  });

  return saasReponse(true, {
    periode: jours + " jours",
    total: toutes.length,
    totalPeriode: recentes.length,
    nonLues: nonLues,
    traites: traites,
    ignores: ignores,
    sauvegardes: sauvegardes,
    scoreMoyen: scoreMoyen,
    repartitionType: parType,
    prochaineEcheance: prochaineEcheance ? {
      date: Utilities.formatDate(prochaineEcheance.date, SAAS_FUSEAU, "yyyy-MM-dd"),
      titre: prochaineEcheance.alerte.titre,
      idMatch: prochaineEcheance.alerte.idMatch
    } : null
  }, "Dashboard récupéré.", 200);
}

/**
 * 📄 SaaS_12_Stats.gs — saasStatsByRegion(payload, user, e)
 * GET /client/stats/by-region?jours=90
 */
function saasStatsByRegion(payload, user, e) {
  const jours = Number(payload.jours) || 90;
  const toutes = saasChargerAlertesClient(user.idClient);
  const recentes = saasFiltreParJours(toutes, jours);

  const parRegion = {};
  recentes.forEach(function (a) {
    const r = (a.region || "Non précisée").toUpperCase();
    if (!parRegion[r]) parRegion[r] = { total: 0, scoreSomme: 0, scoreN: 0 };
    parRegion[r].total++;
    if (a.score > 0) { parRegion[r].scoreSomme += a.score; parRegion[r].scoreN++; }
  });

  const arr = Object.keys(parRegion).map(function (r) {
    const v = parRegion[r];
    return {
      region: r,
      total: v.total,
      scoreMoyen: v.scoreN > 0 ? Number((v.scoreSomme / v.scoreN).toFixed(2)) : 0
    };
  }).sort(function (a, b) { return b.total - a.total; });

  return saasReponse(true, { periode: jours + " jours", repartition: arr }, "OK", 200);
}

/**
 * 📄 SaaS_12_Stats.gs — saasStatsByProcedure(payload, user, e)
 * GET /client/stats/by-procedure?jours=90
 */
function saasStatsByProcedure(payload, user, e) {
  const jours = Number(payload.jours) || 90;
  const toutes = saasChargerAlertesClient(user.idClient);
  const recentes = saasFiltreParJours(toutes, jours);

  const parProc = {};
  recentes.forEach(function (a) {
    const p = (a.procedure || "AUTRE").toUpperCase();
    parProc[p] = (parProc[p] || 0) + 1;
  });
  const arr = Object.keys(parProc).map(function (p) {
    return { procedure: p, total: parProc[p] };
  }).sort(function (a, b) { return b.total - a.total; });

  return saasReponse(true, { periode: jours + " jours", repartition: arr }, "OK", 200);
}

/**
 * 📄 SaaS_12_Stats.gs — saasStatsTimeline(payload, user, e)
 * GET /client/stats/timeline?jours=30
 * Retourne une série journalière { date, total, scoreMoyen }
 */
function saasStatsTimeline(payload, user, e) {
  const jours = Number(payload.jours) || 30;
  const toutes = saasChargerAlertesClient(user.idClient);

  const map = {};
  toutes.forEach(function (a) {
    const d = new Date(a.dateMatch);
    if (isNaN(d.getTime())) return;
    const key = Utilities.formatDate(d, SAAS_FUSEAU, "yyyy-MM-dd");
    if (!map[key]) map[key] = { total: 0, scoreSomme: 0, scoreN: 0 };
    map[key].total++;
    if (a.score > 0) { map[key].scoreSomme += a.score; map[key].scoreN++; }
  });

  // Construire la liste continue des N derniers jours
  const serie = [];
  const auj = new Date();
  for (let i = jours - 1; i >= 0; i--) {
    const d = new Date(auj);
    d.setDate(d.getDate() - i);
    const key = Utilities.formatDate(d, SAAS_FUSEAU, "yyyy-MM-dd");
    const v = map[key] || { total: 0, scoreSomme: 0, scoreN: 0 };
    serie.push({
      date: key,
      total: v.total,
      scoreMoyen: v.scoreN > 0 ? Number((v.scoreSomme / v.scoreN).toFixed(2)) : 0
    });
  }

  return saasReponse(true, { periode: jours + " jours", serie: serie }, "OK", 200);
}

/**
 * 📄 SaaS_12_Stats.gs — saasStatsTopMO(payload, user, e)
 * GET /client/stats/top-mo?jours=90&limit=10
 */
function saasStatsTopMO(payload, user, e) {
  const jours = Number(payload.jours) || 90;
  const limit = Math.min(50, Math.max(1, Number(payload.limit) || 10));
  const toutes = saasChargerAlertesClient(user.idClient);
  const recentes = saasFiltreParJours(toutes, jours);

  const compteur = {};
  recentes.forEach(function (a) {
    const mo = (a.maitreOuvrage || "Non précisé").trim();
    if (!mo) return;
    compteur[mo] = (compteur[mo] || 0) + 1;
  });

  const arr = Object.keys(compteur).map(function (mo) {
    return { maitreOuvrage: mo, total: compteur[mo] };
  }).sort(function (a, b) { return b.total - a.total; }).slice(0, limit);

  return saasReponse(true, { periode: jours + " jours", top: arr }, "OK", 200);
}