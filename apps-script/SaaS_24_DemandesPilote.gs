// >>> FICHIER : SaaS_24_DemandesPilote.gs <<< (à coller dans l'onglet du même nom)
/**
 * ============================================================================
 * SAAS — DEMANDES D'ACCÈS PILOTE (V1.1 — LOT PIL2 : confirmation au prospect)
 * ============================================================================
 * Route publique POST /public/pilote : enregistre la demande d'une entreprise
 * dans l'onglet DEMANDES_PILOTE (append-only, jamais de suppression de ligne)
 * et prévient l'administrateur par e-mail.
 *
 * Règles :
 *   - Aucune IA, aucun appel externe : validation scriptée seulement.
 *   - Dédoublonnage strict sur l'e-mail normalisé (minuscules, sans espaces) :
 *     une adresse déjà enregistrée ne crée ni nouvelle ligne ni nouvel e-mail,
 *     et la réponse au visiteur reste identique (rien ne révèle ce qui existe).
 *   - Heure de la demande : Africa/Douala (UTC+1), via saasDateMaintenant().
 *   - Cellules neutralisées contre l'injection de formule (saasNeutraliserCellule).
 *   - E-mail à l'admin : adresse lue dans PARAMETRES!H2 (comme les alertes de sécurité).
 *   - E-mail de confirmation au prospect (une seule fois par adresse : le dédoublonnage
 *     empêche tout renvoi), état noté dans la colonne Confirmation_Prospect.
 *   - Protection : champ piège « siteWeb », plafond global de 40 demandes/heure,
 *     verrou d'écriture, quota Gmail contrôlé avant l'envoi.
 *
 * MISE EN SERVICE (une seule fois, après collage de ce fichier) :
 *   Exécuter saasPiloteInitialiserOnglet() — crée l'onglet s'il est absent.
 * TEST (aucune écriture) :
 *   Exécuter saasPiloteTester().
 * ============================================================================
 */

const SAAS_SHEET_DEMANDES_PILOTE = "DEMANDES_PILOTE";
const SAAS_PILOTE_SECTEURS = ["BTP", "FOURNITURES", "ETUDES", "INFORMATIQUE", "SANTE", "AUTRE"];
const SAAS_PILOTE_MAX_PAR_HEURE = 40;
const SAAS_PILOTE_QUOTA_MINIMUM = 10;

const SAAS_PILOTE_COLONNES = [
  { nom: "ID_Demande",         largeur: 170 },
  { nom: "Date_Demande",       largeur: 150 },
  { nom: "Nom",                largeur: 180 },
  { nom: "Entreprise",         largeur: 200 },
  { nom: "Email",              largeur: 220 },
  { nom: "Secteur",            largeur: 120 },
  { nom: "Statut",             largeur: 110 },
  { nom: "IP",                 largeur: 120 },
  { nom: "Notification_Admin", largeur: 140 },
  { nom: "Notes_Admin",        largeur: 260 },
  { nom: "Confirmation_Prospect", largeur: 170 }
];

// ---------------------------------------------------------------------------
// MISE EN SERVICE
// ---------------------------------------------------------------------------

/**
 * 📄 SaaS_24_DemandesPilote.gs — saasPiloteInitialiserOnglet()
 * Crée l'onglet DEMANDES_PILOTE s'il n'existe pas. Ne touche à aucun autre onglet.
 */
function saasPiloteInitialiserOnglet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log(saasCreerFeuilleSiAbsente(ss, SAAS_SHEET_DEMANDES_PILOTE, SAAS_PILOTE_COLONNES));
}

/**
 * 📄 SaaS_24_DemandesPilote.gs — saasPiloteAjouterColonneConfirmation()
 * LOT PIL2 : ajoute l'en-tête Confirmation_Prospect (colonne K) à l'onglet existant, sans toucher aux lignes.
 * À exécuter une seule fois. Sans effet si l'en-tête est déjà là.
 */
function saasPiloteAjouterColonneConfirmation() {
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_DEMANDES_PILOTE);
  if (!feuille) { Logger.log("❌ Onglet DEMANDES_PILOTE absent : exécuter saasPiloteInitialiserOnglet()."); return; }
  const cellule = feuille.getRange(1, 11);
  if (String(cellule.getValue() || "").trim() === "Confirmation_Prospect") { Logger.log("Colonne Confirmation_Prospect déjà présente."); return; }
  if (String(cellule.getValue() || "").trim() !== "") { Logger.log("⚠ La cellule K1 contient déjà autre chose : rien modifié."); return; }
  cellule.setValue("Confirmation_Prospect").setFontWeight("bold").setBackground("#0f172a").setFontColor("#ffffff");
  feuille.setColumnWidth(11, 170);
  Logger.log("✅ Colonne Confirmation_Prospect ajoutée en K1.");
}

// ---------------------------------------------------------------------------
// VALIDATION (fonction pure : n'écrit rien, testable sans effet)
// ---------------------------------------------------------------------------

/**
 * @param {Object} payload { nom, entreprise, email, secteur }
 * @return {Object} { ok, message, donnees }
 */
function saasPiloteValider(payload) {
  const p = payload || {};
  const nom = String(p.nom || "").replace(/\s+/g, " ").trim();
  const entreprise = String(p.entreprise || "").replace(/\s+/g, " ").trim();
  const email = String(p.email || "").trim().toLowerCase();
  const secteur = String(p.secteur || "").trim().toUpperCase();

  if (nom.length < 2 || nom.length > 100) return { ok: false, message: "Le nom est obligatoire (2 à 100 caractères)." };
  if (entreprise.length < 2 || entreprise.length > 120) return { ok: false, message: "L'entreprise est obligatoire (2 à 120 caractères)." };
  if (email.length > 120 || !saasEmailValide(email)) return { ok: false, message: "Adresse e-mail invalide." };
  if (SAAS_PILOTE_SECTEURS.indexOf(secteur) === -1) return { ok: false, message: "Secteur d'activité invalide." };

  return { ok: true, message: "OK", donnees: { nom: nom, entreprise: entreprise, email: email, secteur: secteur } };
}

// ---------------------------------------------------------------------------
// ROUTE PUBLIQUE
// ---------------------------------------------------------------------------

/**
 * POST /public/pilote
 * Body : { nom, entreprise, email, secteur, siteWeb (piège, doit rester vide) }
 */
function saasPiloteDemande(payload, e) {
  const ip = saasExtraireIp(e);

  // 1. Champ piège rempli : on répond comme si tout allait bien, sans rien écrire.
  if (payload && String(payload.siteWeb || "").trim() !== "") {
    saasLogger("", "", "", "PILOTE_PIEGE", "Champ piège rempli : demande ignorée", ip, false);
    return saasReponse(true, null, "Demande enregistrée.", 201);
  }

  // 2. Validation
  const v = saasPiloteValider(payload);
  if (!v.ok) return saasErreur(v.message, 400);
  const d = v.donnees;
  if (saasPiloteEmailJetable(d.email)) {
    return saasErreur("Les adresses e-mail temporaires ne sont pas acceptées. Utilisez votre adresse professionnelle ou personnelle.", 400);
  }
  const modeAuto = saasPiloteAutoActif();

  // 3. Plafond global par heure (protège l'onglet et le quota Gmail)
  try {
    const cache = CacheService.getScriptCache();
    const cle = "PILOTE_H_" + Utilities.formatDate(new Date(), SAAS_FUSEAU, "yyyyMMddHH");
    const n = (parseInt(cache.get(cle) || "0", 10) || 0) + 1;
    cache.put(cle, String(n), 3700);
    if (n > SAAS_PILOTE_MAX_PAR_HEURE) {
      return saasErreur("Trop de demandes en ce moment. Réessayez dans une heure.", 429);
    }
  } catch (errCache) {}

  // 4. Écriture sous verrou (évite deux lignes pour deux envois simultanés)
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName(SAAS_SHEET_DEMANDES_PILOTE);
  if (!feuille) {
    saasLogger("", d.email, "", "PILOTE_ERREUR", "Onglet DEMANDES_PILOTE absent (exécuter saasPiloteInitialiserOnglet)", ip, false);
    return saasErreur("Service momentanément indisponible. Réessayez plus tard.", 503);
  }

  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(10000)) {
    return saasErreur("Service occupé. Réessayez dans un instant.", 503);
  }

  let idDemande = "";
  let ligne = 0;
  let doublon = false;
  let ligneExistante = 0;
  let statutExistant = "";
  try {
    const derniere = feuille.getLastRow();
    if (derniere >= 2) {
      const lignes = feuille.getRange(2, 1, derniere - 1, 7).getValues();
      for (let i = 0; i < lignes.length; i++) {
        if (String(lignes[i][4] || "").replace(/^'/, "").trim().toLowerCase() === d.email) {
          doublon = true; ligneExistante = i + 2; statutExistant = String(lignes[i][6] || ""); break;
        }
      }
    }
    if (!doublon) {
      idDemande = saasGenererId("PIL");
      feuille.appendRow([
        idDemande,
        saasDateMaintenant(),
        saasNeutraliserCellule(d.nom),
        saasNeutraliserCellule(d.entreprise),
        saasNeutraliserCellule(d.email),
        d.secteur,
        "NOUVEAU",
        saasNeutraliserCellule(ip || ""),
        "EN_ATTENTE",
        ""
      ]);
      ligne = feuille.getLastRow();
    }
  } finally {
    verrou.releaseLock();
  }

  // 5. Doublon : même réponse qu'une nouvelle demande, aucune écriture, aucun e-mail.
  if (doublon) {
    saasLogger("", d.email, "", "PILOTE_DOUBLON", "Demande déjà enregistrée", ip, true);
    // Mode automatique : une demande restée sans confirmation reçoit un nouveau lien (au plus un toutes les 10 minutes).
    if (modeAuto && statutExistant === "EN_ATTENTE_CONFIRMATION" && ligneExistante > 0) {
      try {
        const cache = CacheService.getScriptCache();
        const cleR = "PILOTE_RELANCE_" + saasLimiteEmpreinte(d.email);
        if (!cache.get(cleR)) {
          const etat = saasPiloteInviterConfirmation(feuille, ligneExistante, d);
          feuille.getRange(ligneExistante, 11).setValue(etat);
        }
      } catch (errRelance) {
        Logger.log("[PILOTE] Relance impossible : " + errRelance.message);
      }
    }
    return saasReponse(true, null, "Demande enregistrée.", 201);
  }

  saasLogger("", d.email, "", "PILOTE_DEMANDE", "Demande " + idDemande + " (" + d.secteur + ")", ip, true);

  // 6. Notification de l'administrateur (un échec n'annule jamais la demande, déjà enregistrée)
  const statutMail = SAAS_PILOTE_ENVOI_MAILS === false ? "SIMULÉ" : saasPiloteNotifierAdmin(idDemande, d);
  try { feuille.getRange(ligne, 9).setValue(statutMail); } catch (errStatut) {}

  // 7. Suite pour le prospect (jamais bloquante : la demande est déjà enregistrée).
  // Mode automatique : lien de confirmation (ou liste d'attente si le plafond est atteint).
  // Mode manuel : simple accusé de réception, comme avant.
  let statutProspect;
  try {
    statutProspect = modeAuto ? saasPiloteSuiteAutomatique(feuille, ligne, d) : saasPiloteConfirmerProspect(d);
  } catch (errSuite) {
    Logger.log("[PILOTE] Suite impossible : " + errSuite.message);
    statutProspect = "ÉCHEC";
  }
  try { feuille.getRange(ligne, 11).setValue(statutProspect); } catch (errStatut2) {}

  return saasReponse(true, null, "Demande enregistrée.", 201);
}

// ---------------------------------------------------------------------------
// NOTIFICATION E-MAIL
// ---------------------------------------------------------------------------

function saasPiloteEchapper(texte) {
  return String(texte === null || texte === undefined ? "" : texte)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * @return {string} "ENVOYÉ" | "ÉCHEC" | "SANS_DESTINATAIRE" | "QUOTA"
 */
function saasPiloteNotifierAdmin(idDemande, d) {
  try {
    const params = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("PARAMETRES");
    const emailAdmin = params ? String(params.getRange("H2").getValue() || "").trim() : "";
    if (!emailAdmin || !saasEmailValide(emailAdmin)) return "SANS_DESTINATAIRE";
    if (MailApp.getRemainingDailyQuota() < SAAS_PILOTE_QUOTA_MINIMUM) return "QUOTA";

    const quand = Utilities.formatDate(new Date(), SAAS_FUSEAU, "dd/MM/yyyy HH:mm");
    const corps =
      '<div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a">' +
      '<p>Nouvelle demande d\'accès pilote reçue le ' + saasPiloteEchapper(quand) + ' (heure de Douala).</p>' +
      '<table cellpadding="6" style="border-collapse:collapse">' +
      '<tr><td><b>Nom</b></td><td>' + saasPiloteEchapper(d.nom) + '</td></tr>' +
      '<tr><td><b>Entreprise</b></td><td>' + saasPiloteEchapper(d.entreprise) + '</td></tr>' +
      '<tr><td><b>E-mail</b></td><td>' + saasPiloteEchapper(d.email) + '</td></tr>' +
      '<tr><td><b>Secteur</b></td><td>' + saasPiloteEchapper(d.secteur) + '</td></tr>' +
      '<tr><td><b>Référence</b></td><td>' + saasPiloteEchapper(idDemande) + '</td></tr>' +
      '</table>' +
      '<p>La demande est dans l\'onglet DEMANDES_PILOTE (statut NOUVEAU).</p></div>';

    GmailApp.sendEmail(
      emailAdmin,
      "[Veille AO] Nouvelle demande d'accès pilote — " + String(d.entreprise).substring(0, 60),
      "Nouvelle demande d'accès pilote : " + d.nom + " (" + d.entreprise + "), " + d.email + ", secteur " + d.secteur + ". Référence " + idDemande + ".",
      { htmlBody: corps, name: "Veille AO — Demandes pilote" }
    );
    return "ENVOYÉ";
  } catch (err) {
    Logger.log("[PILOTE] Échec e-mail admin : " + err.message);
    return "ÉCHEC";
  }
}

/**
 * Texte de la confirmation envoyée au prospect (fonction pure, testable sans effet).
 * @return {Object} { sujet, texte, html }
 */
function saasPiloteTexteConfirmation(d) {
  const sujet = "Market Advisor CM : votre demande d'accès pilote est bien reçue";
  const texte =
    "Bonjour " + d.nom + ",\n\n" +
    "Nous avons bien reçu votre demande d'accès pilote pour " + d.entreprise + ". Merci de votre confiance.\n\n" +
    "Nous la lisons personnellement et nous vous répondons sous 48 heures ouvrées, à cette adresse. " +
    "Pour calibrer votre veille, tenez prêts votre activité précise (secteur indiqué : " + d.secteur + "), " +
    "les régions qui vous intéressent et la fourchette de montants visée.\n\n" +
    "Si vous n'avez rien reçu d'ici là, répondez simplement à ce message.\n\n" +
    "L'équipe Market Advisor CM";
  const html = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a;line-height:1.5">' +
    texte.split("\n\n").map(function (par) { return "<p>" + saasPiloteEchapper(par) + "</p>"; }).join("") + "</div>";
  return { sujet: sujet, texte: texte, html: html };
}

/**
 * Envoie la confirmation au prospect.
 * @return {string} "ENVOYÉ" | "ÉCHEC" | "QUOTA" | "ADRESSE_INVALIDE"
 */
function saasPiloteConfirmerProspect(d) {
  try {
    if (!saasEmailValide(d.email)) return "ADRESSE_INVALIDE";
    if (MailApp.getRemainingDailyQuota() < SAAS_PILOTE_QUOTA_MINIMUM) return "QUOTA";
    const m = saasPiloteTexteConfirmation(d);
    GmailApp.sendEmail(d.email, m.sujet, m.texte, { htmlBody: m.html, name: "Market Advisor CM" });
    return "ENVOYÉ";
  } catch (err) {
    Logger.log("[PILOTE] Échec confirmation prospect : " + err.message);
    return "ÉCHEC";
  }
}

// ---------------------------------------------------------------------------
// TEST (aucune écriture dans les feuilles, aucun e-mail)
// ---------------------------------------------------------------------------

/**
 * 📄 SaaS_24_DemandesPilote.gs — saasPiloteTester()
 * Vérifie la validation, la présence de l'onglet et du destinataire. N'écrit rien.
 */
function saasPiloteTester() {
  let echecs = 0;
  const verifier = function (nom, condition, detail) {
    Logger.log((condition ? "✅ " : "❌ ") + nom + (detail ? " — " + detail : ""));
    if (!condition) echecs++;
  };
  const ok = { nom: "Awa Mballa", entreprise: "BTP Mballa SARL", email: "  Awa@Exemple.CM ", secteur: "btp" };

  const r1 = saasPiloteValider(ok);
  verifier("1. Demande correcte acceptée et normalisée", r1.ok && r1.donnees.email === "awa@exemple.cm" && r1.donnees.secteur === "BTP");
  verifier("2. Nom vide refusé", !saasPiloteValider({ nom: "", entreprise: "X Y", email: "a@b.cm", secteur: "BTP" }).ok);
  verifier("3. Entreprise vide refusée", !saasPiloteValider({ nom: "Awa", entreprise: "", email: "a@b.cm", secteur: "BTP" }).ok);
  verifier("4. E-mail invalide refusé", !saasPiloteValider({ nom: "Awa", entreprise: "Xy", email: "pas-un-mail", secteur: "BTP" }).ok);
  verifier("5. Secteur inconnu refusé", !saasPiloteValider({ nom: "Awa", entreprise: "Xy", email: "a@b.cm", secteur: "PIRATE" }).ok);
  verifier("6. Nom de 101 caractères refusé", !saasPiloteValider({ nom: new Array(102).join("a"), entreprise: "Xy", email: "a@b.cm", secteur: "BTP" }).ok);

  const piege = JSON.parse(saasPiloteDemande({ nom: "Bot", entreprise: "Bot", email: "bot@b.cm", secteur: "BTP", siteWeb: "http://spam" }, { parameter: {} }).getContent());
  verifier("7. Champ piège rempli : réponse neutre, rien d'écrit", piege.succes === true);

  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_DEMANDES_PILOTE);
  verifier("8. Onglet DEMANDES_PILOTE présent", !!feuille, feuille ? "" : "exécuter saasPiloteInitialiserOnglet()");

  const params = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("PARAMETRES");
  const emailAdmin = params ? String(params.getRange("H2").getValue() || "").trim() : "";
  verifier("9. Destinataire admin (PARAMETRES!H2) valide", saasEmailValide(emailAdmin));
  verifier("10. Quota Gmail suffisant", MailApp.getRemainingDailyQuota() >= SAAS_PILOTE_QUOTA_MINIMUM, "restant : " + MailApp.getRemainingDailyQuota());

  const conf = saasPiloteTexteConfirmation({ nom: "<b>Awa</b>", entreprise: "BTP & Co", email: "a@b.cm", secteur: "BTP" });
  verifier("11. Texte de confirmation : nom et entreprise présents", conf.texte.indexOf("<b>Awa</b>") !== -1 && conf.texte.indexOf("BTP & Co") !== -1);
  verifier("12. Version HTML : balises du visiteur neutralisées", conf.html.indexOf("<b>Awa</b>") === -1 && conf.html.indexOf("&lt;b&gt;Awa&lt;/b&gt;") !== -1);
  verifier("13. Colonne Confirmation_Prospect présente (K1)", !!feuille && String(feuille.getRange(1, 11).getValue()).trim() === "Confirmation_Prospect", "sinon exécuter saasPiloteAjouterColonneConfirmation()");

  Logger.log(echecs === 0 ? "🟢 Tous les contrôles sont passés." : "🔴 " + echecs + " contrôle(s) en échec.");
}
