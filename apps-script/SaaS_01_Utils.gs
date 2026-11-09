// >>> FICHIER : SaaS_01_Utils.gs <<< (à coller dans l'onglet du même nom)
/**
 * ============================================================================
 * SAAS — UTILITAIRES PARTAGÉS ET INITIALISATION DE LA STRUCTURE (V1.2 — LOT S1a)
 * ============================================================================
 * Hachage, tokens, sessions, réponses JSON, audit log, validation.
 * Toutes les fonctions sont préfixées saas pour éviter les conflits.
 *
 * V1.2 (LOT S1a) : le journal d'audit (AUDIT_LOG) et les sessions n'écrivent plus de
 * texte qui commence par = + - @ tel quel : Google Sheets l'interpréterait comme une
 * formule (l'adresse saisie sur l'écran de connexion est contrôlée par l'appelant).
 * saasNeutraliserCellule() précède ce texte d'une apostrophe, que Sheets n'affiche pas.
 * ============================================================================
 */

const SAAS_DUREE_SESSION_JOURS = 30;
const SAAS_FUSEAU = "Africa/Douala";
const SAAS_SEL_LONGUEUR = 16;

// ---------------------------------------------------------------------------
// RÉPONSES JSON STANDARDISÉES
// ---------------------------------------------------------------------------

/**
 * Construit une réponse JSON normalisée.
 * @param {boolean} succes
 * @param {*} donnees
 * @param {string} message
 * @param {number} code
 */
function saasReponse(succes, donnees, message, code) {
  const payload = {
    succes: !!succes,
    code: code || (succes ? 200 : 400),
    message: message || (succes ? "OK" : "Erreur"),
    donnees: donnees || null,
    timestamp: new Date().toISOString()
  };
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Réponse d'erreur rapide.
 */
function saasErreur(message, code) {
  return saasReponse(false, null, message, code || 400);
}

// ---------------------------------------------------------------------------
// HACHAGE MOT DE PASSE (SHA-256 + sel)
// ---------------------------------------------------------------------------

function saasGenererSel() {
  return Utilities.getUuid().replace(/-/g, "").substring(0, SAAS_SEL_LONGUEUR);
}

function saasHacherMotDePasse(motDePasse, sel) {
  if (!motDePasse || !sel) return "";
  const combine = String(sel) + "::" + String(motDePasse) + "::veille-saas-v1";
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, combine, Utilities.Charset.UTF_8
  );
  return digest.map(function (b) {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? "0" + v : v;
  }).join("");
}

function saasVerifierMotDePasse(motDePasse, sel, hashAttendu) {
  // LOT LC1 : un compte sans mot de passe (hash ou sel vide, cas des espaces pilotes) ne peut JAMAIS
  // se connecter par mot de passe. Sans cette garde, deux chaînes vides seraient jugées égales.
  if (!motDePasse || !sel || !hashAttendu) return false;
  const hash = saasHacherMotDePasse(motDePasse, sel);
  if (hash.length !== hashAttendu.length) return false;
  // Comparaison en temps constant
  let diff = 0;
  for (let i = 0; i < hash.length; i++) {
    diff |= hash.charCodeAt(i) ^ hashAttendu.charCodeAt(i);
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// TOKENS & SESSIONS
// ---------------------------------------------------------------------------

function saasGenererToken() {
  return Utilities.getUuid() + "-" + Date.now().toString(36) +
         "-" + Math.random().toString(36).substring(2, 10);
}

function saasDateMaintenant() {
  return Utilities.formatDate(new Date(), SAAS_FUSEAU, "yyyy-MM-dd HH:mm:ss");
}

function saasDateAjout(jours) {
  const d = new Date();
  d.setDate(d.getDate() + jours);
  return Utilities.formatDate(d, SAAS_FUSEAU, "yyyy-MM-dd HH:mm:ss");
}

function saasDateDepassee(dateStr) {
  if (!dateStr) return true;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return true;
  return d.getTime() < new Date().getTime();
}

/**
 * Crée une session utilisateur.
 */
function saasCreerSession(idUser, ip, userAgent) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName(SAAS_SHEET_SESSIONS);
  if (!feuille) return null;

  const token = saasGenererToken();
  const dateCreation = saasDateMaintenant();
  const dateExpiration = saasDateAjout(SAAS_DUREE_SESSION_JOURS);

  feuille.appendRow([
    token, idUser, dateCreation, dateExpiration,
    saasNeutraliserCellule(ip || ""), saasNeutraliserCellule(String(userAgent || "").substring(0, 250)), "OUI"
  ]);

  return { token: token, expiration: dateExpiration };
}

/**
 * Vérifie un token et retourne la session valide, ou null.
 */
function saasVerifierToken(token) {
  if (!token) return null;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName(SAAS_SHEET_SESSIONS);
  if (!feuille) return null;

  const data = feuille.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if ((data[i][0] || "").toString() === token) {
      const actif = (data[i][6] || "").toString().toUpperCase();
      if (actif !== "OUI") return null;
      if (saasDateDepassee((data[i][3] || "").toString())) return null;
      return {
        ligne: i + 1,
        token: token,
        idUser: (data[i][1] || "").toString(),
        dateExpiration: (data[i][3] || "").toString()
      };
    }
  }
  return null;
}

function saasInvaliderSession(token) {
  if (!token) return false;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName(SAAS_SHEET_SESSIONS);
  if (!feuille) return false;
  const data = feuille.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if ((data[i][0] || "").toString() === token) {
      feuille.getRange(i + 1, 7).setValue("NON");
      return true;
    }
  }
  return false;
}

/**
 * Purge les sessions expirées (appelé occasionnellement).
 */
function saasPurgerSessionsExpirees() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName(SAAS_SHEET_SESSIONS);
  if (!feuille) return 0;
  const data = feuille.getDataRange().getValues();
  const aSupprimer = [];
  for (let i = 1; i < data.length; i++) {
    const exp = (data[i][3] || "").toString();
    const actif = (data[i][6] || "").toString().toUpperCase();
    if (actif !== "OUI" || saasDateDepassee(exp)) {
      aSupprimer.push(i + 1);
    }
  }
  // Suppression en partant de la fin
  aSupprimer.reverse().forEach(function (l) { feuille.deleteRow(l); });
  return aSupprimer.length;
}

// ---------------------------------------------------------------------------
// AUDIT LOG
// ---------------------------------------------------------------------------

/**
 * LOT S1a — Neutralise une valeur textuelle avant écriture dans une cellule :
 * une chaîne qui commence par = + - @ (ou une tabulation / un retour chariot)
 * reçoit une apostrophe devant, pour ne jamais être exécutée comme une formule.
 * S'appuie sur SecuriteDonnees.gs ; reprend la même règle si ce fichier est absent.
 */
function saasNeutraliserCellule(valeur) {
  if (typeof secNeutraliserFormule === "function") return secNeutraliserFormule(valeur);
  if (typeof valeur !== "string" || valeur === "") return valeur;
  return (/^\s*[=+\-@]/.test(valeur) || /^[\t\r]/.test(valeur)) ? "'" + valeur : valeur;
}

function saasLogger(idUser, email, role, action, details, ip, succes) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const feuille = ss.getSheetByName(SAAS_SHEET_AUDIT_LOG);
    if (!feuille) return;
    feuille.appendRow([
      saasDateMaintenant(),
      saasNeutraliserCellule(idUser || ""),
      saasNeutraliserCellule(email || ""),
      saasNeutraliserCellule(role || ""),
      saasNeutraliserCellule(action || ""),
      saasNeutraliserCellule(String(details || "").substring(0, 500)),
      saasNeutraliserCellule(ip || ""),
      succes ? "OUI" : "NON"
    ]);
  } catch (e) {
    Logger.log("[AUDIT] Échec écriture : " + e.message);
  }
}

// ---------------------------------------------------------------------------
// LECTURE / ÉCRITURE UTILISATEURS
// ---------------------------------------------------------------------------

function saasTrouverUtilisateurParEmail(email) {
  if (!email) return null;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName(SAAS_SHEET_UTILISATEURS);
  if (!feuille) return null;
  const data = feuille.getDataRange().getValues();
  const cible = email.toString().trim().toLowerCase();
  for (let i = 1; i < data.length; i++) {
    if ((data[i][1] || "").toString().trim().toLowerCase() === cible) {
      return {
        ligne: i + 1,
        idUser: (data[i][0] || "").toString(),
        email: (data[i][1] || "").toString(),
        hash: (data[i][2] || "").toString(),
        sel: (data[i][3] || "").toString(),
        nom: (data[i][4] || "").toString(),
        telephone: (data[i][5] || "").toString(),
        role: (data[i][6] || "").toString().toUpperCase(),
        idClient: (data[i][7] || "").toString(),
        actif: (data[i][8] || "").toString().toUpperCase(),
        dateCreation: (data[i][9] || "").toString(),
        derniereConnexion: (data[i][10] || "").toString(),
        langue: (data[i][11] || "fr").toString(),
        photoUrl: (data[i][12] || "").toString()
      };
    }
  }
  return null;
}

function saasTrouverUtilisateurParId(idUser) {
  if (!idUser) return null;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName(SAAS_SHEET_UTILISATEURS);
  if (!feuille) return null;
  const data = feuille.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if ((data[i][0] || "").toString() === idUser) {
      return {
        ligne: i + 1,
        idUser: (data[i][0] || "").toString(),
        email: (data[i][1] || "").toString(),
        hash: (data[i][2] || "").toString(),
        sel: (data[i][3] || "").toString(),
        nom: (data[i][4] || "").toString(),
        telephone: (data[i][5] || "").toString(),
        role: (data[i][6] || "").toString().toUpperCase(),
        idClient: (data[i][7] || "").toString(),
        actif: (data[i][8] || "").toString().toUpperCase(),
        dateCreation: (data[i][9] || "").toString(),
        derniereConnexion: (data[i][10] || "").toString(),
        langue: (data[i][11] || "fr").toString(),
        photoUrl: (data[i][12] || "").toString()
      };
    }
  }
  return null;
}

function saasMettreAJourDerniereConnexion(ligne) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName(SAAS_SHEET_UTILISATEURS);
  if (!feuille) return;
  feuille.getRange(ligne, 11).setValue(saasDateMaintenant());
}

// ---------------------------------------------------------------------------
// VALIDATION
// ---------------------------------------------------------------------------

function saasEmailValide(email) {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email).trim());
}

function saasMotDePasseValide(mdp) {
  if (!mdp || String(mdp).length < 8) return false;
  return true;
}

function saasTelephoneValide(tel) {
  if (!tel) return true; // optionnel
  return /^\+?[0-9\s\-\.]{8,20}$/.test(String(tel).trim());
}

// ---------------------------------------------------------------------------
// PARSING DES REQUÊTES
// ---------------------------------------------------------------------------

function saasLirePayloadPost(e) {
  if (!e) return {};
  try {
    if (e.postData && e.postData.contents) {
      return JSON.parse(e.postData.contents);
    }
  } catch (err) {
    Logger.log("[SAAS] Payload POST invalide : " + err.message);
  }
  return {};
}

function saasExtraireToken(e, payload) {
  // Priorité 1 : header Authorization
  if (e && e.headers) {
    const auth = e.headers["Authorization"] || e.headers["authorization"];
    if (auth && auth.indexOf("Bearer ") === 0) {
      return auth.substring(7).trim();
    }
  }
  // Priorité 2 : paramètre ?token= dans l'URL
  if (e && e.parameter && e.parameter.token) {
    return e.parameter.token;
  }
  // Priorité 3 : champ token dans le payload
  if (payload && payload.token) {
    return payload.token;
  }
  return null;
}

function saasExtraireIp(e) {
  if (!e || !e.parameter) return "";
  return e.parameter.ip || "";
}

function saasExtraireUserAgent(e) {
  if (!e || !e.headers) return "";
  return e.headers["User-Agent"] || e.headers["user-agent"] || "";
}

// ---------------------------------------------------------------------------
// GÉNÉRATION D'IDS
// ---------------------------------------------------------------------------

function saasGenererId(prefixe) {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return prefixe + "_" + ts + rand;
}
/**
 * 📄 SaaS_01_Utils.gs — saasDebugAdmin()   (V1.1 — LOT S3)
 * Diagnostic des comptes : liste les utilisateurs et signale les anomalies.
 * N'affiche JAMAIS de hash, de sel ni de mot de passe (seulement leur présence).
 * Pour vérifier les mots de passe par défaut : saasVerifierSecuriteAdmin().
 */
function saasDebugAdmin() {
  Logger.log("=================================================");
  Logger.log("=== DEBUG COMPTES ===");
  Logger.log("Fichier : " + SpreadsheetApp.getActiveSpreadsheet().getName());
  Logger.log("=================================================");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName(SAAS_SHEET_UTILISATEURS);
  if (!feuille) {
    Logger.log("❌ Feuille UTILISATEURS absente.");
    return;
  }

  const data = feuille.getDataRange().getValues();
  Logger.log("Lignes totales (avec entête) : " + data.length);
  if (data.length <= 1) {
    Logger.log("❌ Aucun utilisateur enregistré.");
    return;
  }

  Logger.log("--- UTILISATEURS ---");
  for (let i = 1; i < data.length; i++) {
    const email = (data[i][1] || "").toString();
    const hash = (data[i][2] || "").toString();
    const sel = (data[i][3] || "").toString();
    Logger.log("  Ligne " + (i + 1) + " | " + (data[i][0] || "") + " | " + email +
               " | rôle " + (data[i][6] || "") + " | actif " + (data[i][8] || "") +
               " | client " + (data[i][7] || "(aucun)") +
               " | hash " + (hash.length > 0 ? "présent" : "ABSENT") +
               " | sel " + (sel.length > 0 ? "présent" : "ABSENT"));
    if (email !== email.toLowerCase()) {
      Logger.log("    ⚠ e-mail non enregistré en minuscules : la connexion risque d'échouer.");
    }
    if (email !== email.trim()) {
      Logger.log("    ⚠ e-mail avec espaces autour.");
    }
  }
  Logger.log("=== FIN DU DEBUG ===");
}

/**
 * 📄 SaaS_01_Utils.gs — saasFixAdminExistant()   (RETIRÉE — LOT S3)
 * Cette fonction contenait un mot de passe par défaut et l'affichait dans le journal.
 * Pour changer le mot de passe de l'admin, utiliser saasDefinirMotDePasseAdmin()
 * (fichier SaaS_04_Securite.gs) : le mot de passe est saisi dans les propriétés du
 * script, jamais dans le code ni dans le journal.
 */
function saasFixAdminExistant() {
  Logger.log("Fonction retirée par sécurité (elle manipulait un mot de passe par défaut).");
  Logger.log("→ Utiliser saasDefinirMotDePasseAdmin() dans SaaS_04_Securite.gs.");
}

// ============================================================================
// (ancien fichier SaaS_00_Initialisation.gs) — CONSTANTES DES FEUILLES ET INITIALISATION DE LA STRUCTURE
// À LANCER UNE FOIS : saasInitialiserStructure()  |  Diagnostic : saasDiagnosticStructure()
// ============================================================================

const SAAS_SHEET_UTILISATEURS = "UTILISATEURS";
const SAAS_SHEET_SESSIONS     = "SESSIONS";
const SAAS_SHEET_AUDIT_LOG    = "AUDIT_LOG";
const SAAS_SHEET_ABONNEMENTS  = "ABONNEMENTS";
const SAAS_SHEET_FACTURES     = "FACTURES";
const SAAS_SHEET_NOTIFS       = "NOTIFICATIONS";
const SAAS_SHEET_PREFS        = "PREFERENCES_CLIENT";

function saasInitialiserStructure() {
  Logger.log("=================================================");
  Logger.log("=== INITIALISATION STRUCTURE SAAS V1.0 ===");
  Logger.log("Fichier : " + SpreadsheetApp.getActiveSpreadsheet().getName());
  Logger.log("=================================================");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const actions = [];

  // --- UTILISATEURS ---
  actions.push(saasCreerFeuilleSiAbsente(ss, SAAS_SHEET_UTILISATEURS, [
    { nom: "ID_User",           largeur: 120 },
    { nom: "Email",             largeur: 220 },
    { nom: "MotDePasse_Hash",   largeur: 200 },
    { nom: "Sel",               largeur: 100 },
    { nom: "Nom_Complet",       largeur: 180 },
    { nom: "Telephone",         largeur: 140 },
    { nom: "Role",              largeur: 100 },
    { nom: "ID_Client",         largeur: 120 },
    { nom: "Actif",             largeur: 80 },
    { nom: "Date_Creation",     largeur: 150 },
    { nom: "Derniere_Connexion", largeur: 150 },
    { nom: "Langue",            largeur: 80 },
    { nom: "Photo_URL",         largeur: 200 }
  ]));

  // --- SESSIONS ---
  actions.push(saasCreerFeuilleSiAbsente(ss, SAAS_SHEET_SESSIONS, [
    { nom: "Token",          largeur: 260 },
    { nom: "ID_User",        largeur: 120 },
    { nom: "Date_Creation",  largeur: 150 },
    { nom: "Date_Expiration", largeur: 150 },
    { nom: "IP",             largeur: 140 },
    { nom: "User_Agent",     largeur: 300 },
    { nom: "Actif",          largeur: 80 }
  ]));

  // --- AUDIT_LOG ---
  actions.push(saasCreerFeuilleSiAbsente(ss, SAAS_SHEET_AUDIT_LOG, [
    { nom: "Timestamp",  largeur: 160 },
    { nom: "ID_User",    largeur: 120 },
    { nom: "Email",      largeur: 220 },
    { nom: "Role",       largeur: 100 },
    { nom: "Action",     largeur: 180 },
    { nom: "Details",    largeur: 400 },
    { nom: "IP",         largeur: 140 },
    { nom: "Succes",     largeur: 80 }
  ]));

  // --- ABONNEMENTS ---
  actions.push(saasCreerFeuilleSiAbsente(ss, SAAS_SHEET_ABONNEMENTS, [
    { nom: "ID_Abonnement",  largeur: 140 },
    { nom: "ID_Client",      largeur: 120 },
    { nom: "Plan",           largeur: 120 },
    { nom: "Date_Debut",     largeur: 130 },
    { nom: "Date_Fin",       largeur: 130 },
    { nom: "Statut",         largeur: 120 },
    { nom: "Montant_FCFA",   largeur: 130 },
    { nom: "Mode_Paiement",  largeur: 140 },
    { nom: "Reference",      largeur: 160 }
  ]));

  // --- FACTURES ---
  actions.push(saasCreerFeuilleSiAbsente(ss, SAAS_SHEET_FACTURES, [
    { nom: "ID_Facture",     largeur: 140 },
    { nom: "ID_Abonnement",  largeur: 140 },
    { nom: "ID_Client",      largeur: 120 },
    { nom: "Date_Emission",  largeur: 130 },
    { nom: "Montant_FCFA",   largeur: 130 },
    { nom: "Statut",         largeur: 120 },
    { nom: "URL_PDF",        largeur: 300 }
  ]));

  // --- NOTIFICATIONS ---
  actions.push(saasCreerFeuilleSiAbsente(ss, SAAS_SHEET_NOTIFS, [
    { nom: "ID_Notif",       largeur: 140 },
    { nom: "ID_Client",      largeur: 120 },
    { nom: "Type",           largeur: 120 },
    { nom: "Sujet",          largeur: 240 },
    { nom: "Contenu",        largeur: 400 },
    { nom: "Date_Creation",  largeur: 150 },
    { nom: "Date_Envoi",     largeur: 150 },
    { nom: "Statut",         largeur: 120 },
    { nom: "Canal",          largeur: 100 }
  ]));

  // --- PREFERENCES_CLIENT ---
  actions.push(saasCreerFeuilleSiAbsente(ss, SAAS_SHEET_PREFS, [
    { nom: "ID_Client",         largeur: 120 },
    { nom: "Notif_Email",       largeur: 100 },
    { nom: "Notif_WhatsApp",    largeur: 110 },
    { nom: "Notif_InApp",       largeur: 100 },
    { nom: "WhatsApp_Numero",   largeur: 160 },
    { nom: "Frequence_Digest",  largeur: 140 },
    { nom: "Heure_Preferee",    largeur: 120 },
    { nom: "Langue",            largeur: 80 }
  ]));

  // --- Bilan ---
  Logger.log("");
  Logger.log("=================================================");
  Logger.log("BILAN DE L'INITIALISATION");
  Logger.log("=================================================");
  actions.forEach(function (a, i) {
    Logger.log("  " + (i + 1) + ". " + a);
  });

  const creees = actions.filter(function (a) { return a.indexOf("créée") !== -1; }).length;
  const existantes = actions.filter(function (a) { return a.indexOf("existante") !== -1; }).length;

  Logger.log("");
  Logger.log("  → " + creees + " feuille(s) créée(s), " + existantes + " déjà présente(s).");
  Logger.log("=================================================");

  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      creees + " feuille(s) créée(s) · " + existantes + " existante(s)",
      "Initialisation SaaS", 10
    );
  } catch (e) {}
}

/**
 * Crée une feuille avec entêtes si elle n'existe pas.
 * @return {string} Message de statut
 */
function saasCreerFeuilleSiAbsente(ss, nom, colonnes) {
  let feuille = ss.getSheetByName(nom);
  if (feuille) {
    // Vérifie que les entêtes sont corrects, sans écraser
    const entetesActuels = feuille.getRange(1, 1, 1, Math.max(feuille.getLastColumn(), colonnes.length)).getValues()[0];
    const tousPresents = colonnes.every(function (col, idx) {
      return String(entetesActuels[idx] || "").trim() === col.nom;
    });
    if (!tousPresents) {
      Logger.log("⚠ " + nom + " existe mais les entêtes diffèrent — vérifiez manuellement.");
      return nom + " : existante (entêtes différents — à vérifier)";
    }
    return nom + " : existante (" + colonnes.length + " colonnes)";
  }

  feuille = ss.insertSheet(nom);
  const entetes = colonnes.map(function (c) { return c.nom; });
  feuille.getRange(1, 1, 1, entetes.length).setValues([entetes])
    .setFontWeight("bold").setBackground("#0f172a").setFontColor("#ffffff");
  feuille.setFrozenRows(1);
  colonnes.forEach(function (c, idx) {
    feuille.setColumnWidth(idx + 1, c.largeur || 150);
  });
  return nom + " : créée (" + colonnes.length + " colonnes)";
}

/**
 * Diagnostic : vérifie que toutes les feuilles SaaS sont présentes.
 */
function saasDiagnosticStructure() {
  Logger.log("=== DIAGNOSTIC STRUCTURE SAAS ===");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const requises = [
    SAAS_SHEET_UTILISATEURS, SAAS_SHEET_SESSIONS, SAAS_SHEET_AUDIT_LOG,
    SAAS_SHEET_ABONNEMENTS, SAAS_SHEET_FACTURES, SAAS_SHEET_NOTIFS,
    SAAS_SHEET_PREFS
  ];
  let ok = 0, manquantes = 0;
  requises.forEach(function (nom) {
    const f = ss.getSheetByName(nom);
    if (f) {
      Logger.log("  ✅ " + nom + " (" + (f.getLastRow() - 1) + " ligne(s) de données)");
      ok++;
    } else {
      Logger.log("  ❌ " + nom + " : MANQUANTE");
      manquantes++;
    }
  });
  Logger.log("");
  Logger.log("  → " + ok + "/" + requises.length + " feuille(s) présente(s)");
  if (manquantes > 0) Logger.log("  → Lancer saasInitialiserStructure()");
}