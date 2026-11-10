// >>> FICHIER : SaaS_25_PiloteAuto.gs <<< (à coller dans l'onglet du même nom)
/**
 * ============================================================================
 * SAAS — CRÉATION AUTOMATIQUE DE L'ESPACE PILOTE (V1.0 — LOT PIL3)
 * ============================================================================
 * Parcours : le prospect envoie le formulaire (SaaS_24) > il reçoit un e-mail avec un lien de
 * confirmation valable 48 heures > au clic, l'adresse est vérifiée, le compte, le client et ses
 * préférences sont créés et il arrive connecté dans son espace (route POST /public/pilote/confirmer).
 *
 * Garde-fous (tous modifiables dans la feuille PARAMETRES, colonnes G:H) :
 *   Pilote_Auto_Actif  OUI / NON   interrupteur (défaut NON : rien ne change tant qu'il n'est pas OUI)
 *   Pilote_Plafond     nombre      pilotes actifs en même temps (défaut 20) ; au-delà : liste d'attente
 *   Pilote_Duree_Jours nombre      durée de l'essai (défaut 30)
 * Autres protections : adresses e-mail jetables refusées, jeton jamais stocké en clair (empreinte
 * SHA-256), usage unique, doublon d'adresse écarté, limite d'essais par IP (comme /auth/lien).
 *
 * Aucune IA à la création : le profil part du secteur seul (mots-clés de départ). Aucune ligne n'est
 * jamais supprimée : les statuts de DEMANDES_PILOTE vont NOUVEAU / EN_ATTENTE_CONFIRMATION / ACTIF /
 * LISTE_ATTENTE / REFUSE (et EXPIRE au lot suivant).
 *
 * MISE EN SERVICE (à la main, après validation) :
 *   1. saasPiloteAjouterColonnesAuto()    ajoute 7 colonnes à droite de DEMANDES_PILOTE (L à R)
 *   2. saasPiloteInitialiserParametres()  ajoute les 3 réglages dans PARAMETRES (interrupteur sur NON)
 *   3. mettre Pilote_Auto_Actif sur OUI dans PARAMETRES quand tout est prêt
 * TEST (bac à sable uniquement) : saasPiloteAutoTester()
 * ============================================================================
 */

const SAAS_PILOTE_PARAM_AUTO = "Pilote_Auto_Actif";
const SAAS_PILOTE_PARAM_PLAFOND = "Pilote_Plafond";
const SAAS_PILOTE_PARAM_DUREE = "Pilote_Duree_Jours";
const SAAS_PILOTE_PLAFOND_DEFAUT = 20;
const SAAS_PILOTE_DUREE_DEFAUT = 30;
const SAAS_PILOTE_CONFIRMATION_HEURES = 48;
const SAAS_PILOTE_MESSAGE_LIEN_INVALIDE = "Ce lien n'est plus valable. Refaites votre demande depuis la page d'accueil : un nouveau lien vous sera envoyé.";

// Numéros de colonnes (base 1) de DEMANDES_PILOTE
const SAAS_PILOTE_COL = {
  ID: 1, DATE: 2, NOM: 3, ENTREPRISE: 4, EMAIL: 5, SECTEUR: 6, STATUT: 7, IP: 8, NOTIF: 9, NOTES: 10, CONFIRM_PROSPECT: 11,
  HASH: 12, EXP_MS: 13, DATE_CONF: 14, ID_USER: 15, ID_CLIENT: 16, DEBUT: 17, FIN: 18
};
const SAAS_PILOTE_COLONNES_AUTO = [
  { nom: "Hash_Confirmation", largeur: 300 },
  { nom: "Expiration_Confirmation_Ms", largeur: 160 },
  { nom: "Date_Confirmation", largeur: 150 },
  { nom: "ID_User", largeur: 170 },
  { nom: "ID_Client", largeur: 110 },
  { nom: "Date_Debut_Essai", largeur: 150 },
  { nom: "Date_Fin_Essai", largeur: 150 }
];

// Variables de test : un test les fixe le temps de son exécution, puis les remet à leur valeur.
var SAAS_PILOTE_FORCER_AUTO = null;       // true / false / null (null = lire PARAMETRES)
var SAAS_PILOTE_FORCER_PLAFOND = null;    // nombre ou null
var SAAS_PILOTE_ENVOI_MAILS = true;       // false : aucun e-mail réel, le jeton est gardé en mémoire pour le test
var SAAS_PILOTE_JETON_TEST = "";

// Domaines d'adresses temporaires les plus courants (le sous-domaine d'un domaine listé est aussi refusé).
const SAAS_PILOTE_DOMAINES_JETABLES = [
  "mailinator.com", "yopmail.com", "yopmail.fr", "guerrillamail.com", "guerrillamail.net", "sharklasers.com",
  "10minutemail.com", "10minutemail.net", "tempmail.com", "temp-mail.org", "temp-mail.io", "tempmailo.com",
  "throwawaymail.com", "trashmail.com", "trashmail.net", "getnada.com", "nada.email", "maildrop.cc",
  "dispostable.com", "fakeinbox.com", "mailnesia.com", "mintemail.com", "mohmal.com", "emailondeck.com",
  "moakt.com", "mytemp.email", "spamgourmet.com", "tmpmail.org", "tmpmail.net", "burnermail.io",
  "discard.email", "mail.tm", "inboxkitten.com", "anonbox.net", "mailcatch.com", "spambox.us",
  "tempail.com", "tempinbox.com", "fakemail.net", "jetable.org", "mailforspam.com", "example.invalid"
];

// Mots-clés de départ par secteur (le client les affine au premier accès ; aucune IA à la création).
const SAAS_PILOTE_MOTS_CLES = {
  BTP: "travaux, construction, bâtiment, route, voirie, génie civil, réhabilitation, assainissement, pont, forage, adduction d'eau, aménagement",
  FOURNITURES: "fourniture, acquisition, équipement, matériel, mobilier, véhicule, consommables, approvisionnement, livraison",
  ETUDES: "étude, consultant, assistance technique, maîtrise d'œuvre, audit, expertise, diagnostic, supervision, contrôle des travaux",
  INFORMATIQUE: "informatique, logiciel, système d'information, numérique, réseau, hébergement, maintenance informatique, digitalisation, cybersécurité, télécommunication",
  SANTE: "santé, médicament, équipement médical, hôpital, laboratoire, vaccin, dispositif médical, centre de santé, réactifs",
  AUTRE: ""
};
const SAAS_PILOTE_LIBELLES_SECTEUR = {
  BTP: "bâtiment et travaux publics", FOURNITURES: "fournitures et équipements", ETUDES: "études et conseil",
  INFORMATIQUE: "informatique et numérique", SANTE: "santé", AUTRE: "autre secteur"
};

// ---------------------------------------------------------------------------
// MISE EN SERVICE
// ---------------------------------------------------------------------------

/** Ajoute les en-têtes L à R de DEMANDES_PILOTE (sans toucher aux lignes). Sans effet si déjà fait. */
function saasPiloteAjouterColonnesAuto() {
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_DEMANDES_PILOTE);
  if (!feuille) { Logger.log("❌ Onglet DEMANDES_PILOTE absent : exécuter saasPiloteInitialiserOnglet()."); return; }
  let ajoutees = 0;
  SAAS_PILOTE_COLONNES_AUTO.forEach(function (c, i) {
    const cellule = feuille.getRange(1, SAAS_PILOTE_COL.HASH + i);
    const actuel = String(cellule.getValue() || "").trim();
    if (actuel === c.nom) return;
    if (actuel !== "") { Logger.log("⚠ " + cellule.getA1Notation() + " contient déjà « " + actuel + " » : rien modifié."); return; }
    cellule.setValue(c.nom).setFontWeight("bold").setBackground("#0f172a").setFontColor("#ffffff");
    feuille.setColumnWidth(SAAS_PILOTE_COL.HASH + i, c.largeur);
    ajoutees++;
  });
  // Empreinte en texte brut : Sheets ne doit jamais la lire comme un nombre.
  feuille.getRange(1, SAAS_PILOTE_COL.HASH, feuille.getMaxRows(), 1).setNumberFormat("@");
  Logger.log("✅ Colonnes de création automatique : " + ajoutees + " ajoutée(s) (les autres existaient déjà).");
}

/** Ajoute les 3 réglages manquants en bas de PARAMETRES (colonnes G:H). Interrupteur sur NON. */
function saasPiloteInitialiserParametres() {
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("PARAMETRES");
  if (!feuille) { Logger.log("❌ Feuille PARAMETRES absente."); return; }
  const derniere = Math.max(feuille.getLastRow(), 1);
  const valeurs = feuille.getRange(1, 7, derniere, 1).getValues();
  const existantes = {};
  let derniereLigneUtile = 0;
  valeurs.forEach(function (v, i) {
    const cle = String(v[0] || "").trim();
    if (cle) { existantes[cle] = true; derniereLigneUtile = i + 1; }
  });
  const aAjouter = [[SAAS_PILOTE_PARAM_AUTO, "NON"], [SAAS_PILOTE_PARAM_PLAFOND, SAAS_PILOTE_PLAFOND_DEFAUT], [SAAS_PILOTE_PARAM_DUREE, SAAS_PILOTE_DUREE_DEFAUT]]
    .filter(function (p) { return !existantes[p[0]]; });
  if (aAjouter.length === 0) { Logger.log("Les 3 réglages pilote existent déjà dans PARAMETRES."); return; }
  feuille.getRange(derniereLigneUtile + 1, 7, aAjouter.length, 2).setValues(aAjouter);
  Logger.log("✅ " + aAjouter.length + " réglage(s) ajouté(s) en G" + (derniereLigneUtile + 1) + ":H" + (derniereLigneUtile + aAjouter.length) + " (Pilote_Auto_Actif = NON).");
}

// ---------------------------------------------------------------------------
// RÉGLAGES
// ---------------------------------------------------------------------------

function saasPiloteLireParametre_(cle) {
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("PARAMETRES");
  if (!feuille || feuille.getLastRow() < 1) return "";
  const valeurs = feuille.getRange(1, 7, feuille.getLastRow(), 2).getValues();
  for (let i = 0; i < valeurs.length; i++) {
    if (String(valeurs[i][0] || "").trim() === cle) return valeurs[i][1];
  }
  return "";
}

/** Vrai seulement si Pilote_Auto_Actif vaut OUI dans PARAMETRES (défaut : NON). */
function saasPiloteAutoActif() {
  if (SAAS_PILOTE_FORCER_AUTO !== null) return SAAS_PILOTE_FORCER_AUTO === true;
  try {
    return String(saasPiloteLireParametre_(SAAS_PILOTE_PARAM_AUTO)).trim().toUpperCase() === "OUI";
  } catch (e) {
    return false;
  }
}

/** @return {{plafond:number, duree:number}} */
function saasPiloteLireLimites() {
  let plafond = parseInt(saasPiloteLireParametre_(SAAS_PILOTE_PARAM_PLAFOND), 10);
  let duree = parseInt(saasPiloteLireParametre_(SAAS_PILOTE_PARAM_DUREE), 10);
  if (SAAS_PILOTE_FORCER_PLAFOND !== null) plafond = SAAS_PILOTE_FORCER_PLAFOND;
  if (!isFinite(plafond) || plafond < 0) plafond = SAAS_PILOTE_PLAFOND_DEFAUT;
  if (!isFinite(duree) || duree < 1) duree = SAAS_PILOTE_DUREE_DEFAUT;
  return { plafond: plafond, duree: duree };
}

/** Nombre de pilotes au statut ACTIF dans DEMANDES_PILOTE. */
function saasPiloteCompterActifs(feuille) {
  const derniere = feuille.getLastRow();
  if (derniere < 2) return 0;
  const statuts = feuille.getRange(2, SAAS_PILOTE_COL.STATUT, derniere - 1, 1).getValues();
  let n = 0;
  statuts.forEach(function (s) { if (String(s[0] || "").trim().toUpperCase() === "ACTIF") n++; });
  return n;
}

/** Vrai si l'adresse appartient à un service d'adresses temporaires (ou à l'un de ses sous-domaines). */
function saasPiloteEmailJetable(email) {
  const m = /@([^@\s]+)$/.exec(String(email || "").trim().toLowerCase());
  if (!m) return false;
  const domaine = m[1];
  return SAAS_PILOTE_DOMAINES_JETABLES.some(function (j) { return domaine === j || domaine.slice(-(j.length + 1)) === "." + j; });
}

// ---------------------------------------------------------------------------
// E-MAILS (textes purs, testables sans effet)
// ---------------------------------------------------------------------------

function saasPiloteHtmlDepuisTexte_(texte, boutonUrl, boutonLibelle) {
  const paragraphes = texte.split("\n\n").map(function (par) {
    return "<p>" + saasPiloteEchapper(par).replace(/\n/g, "<br>") + "</p>";
  });
  let html = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a;line-height:1.5;max-width:560px">';
  if (boutonUrl) {
    html += paragraphes[0] + paragraphes[1];
    html += '<p style="margin:22px 0"><a href="' + saasPiloteEchapper(boutonUrl) + '" style="background:#0f766e;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;display:inline-block">' +
            saasPiloteEchapper(boutonLibelle) + '</a></p>';
    html += paragraphes.slice(2).join("");
  } else {
    html += paragraphes.join("");
  }
  return html + "</div>";
}

/** E-mail avec le lien de confirmation. */
function saasPiloteTexteLien(d, url, duree) {
  const sujet = "Market Advisor CM : confirmez votre adresse pour ouvrir votre espace pilote";
  const texte =
    "Bonjour " + d.nom + ",\n\n" +
    "Merci pour votre demande d'accès pilote pour " + d.entreprise + ". Pour ouvrir votre espace, confirmez votre adresse en cliquant sur le bouton ci-dessous (valable " + SAAS_PILOTE_CONFIRMATION_HEURES + " heures).\n\n" +
    "Ouvrir mon espace pilote : " + url + "\n\n" +
    "Vous arrivez directement dans votre espace, sans mot de passe à créer. L'essai dure " + duree + " jours. Vos premières alertes partent au prochain envoi du matin, à partir du secteur que vous avez indiqué (" + (SAAS_PILOTE_LIBELLES_SECTEUR[d.secteur] || d.secteur) + "), et vous pourrez affiner votre profil dès votre première visite.\n\n" +
    "Si vous n'êtes pas à l'origine de cette demande, ignorez simplement ce message : rien ne sera créé.\n\n" +
    "L'équipe Market Advisor CM";
  return { sujet: sujet, texte: texte, html: saasPiloteHtmlDepuisTexte_(texte.replace("Ouvrir mon espace pilote : " + url + "\n\n", ""), url, "Ouvrir mon espace pilote") };
}

/** E-mail de liste d'attente (plafond atteint). */
function saasPiloteTexteAttente(d) {
  const sujet = "Market Advisor CM : votre demande est sur liste d'attente";
  const texte =
    "Bonjour " + d.nom + ",\n\n" +
    "Nous avons bien reçu votre demande d'accès pilote pour " + d.entreprise + ". Toutes les places pilotes sont occupées en ce moment.\n\n" +
    "Votre demande est enregistrée : nous vous écrirons dès qu'une place se libère, avec un lien pour ouvrir votre espace.\n\n" +
    "L'équipe Market Advisor CM";
  return { sujet: sujet, texte: texte, html: saasPiloteHtmlDepuisTexte_(texte) };
}

/** Envoi commun. @return {string} "ENVOYÉ" | "ÉCHEC" | "QUOTA" | "ADRESSE_INVALIDE" | "SIMULÉ" */
function saasPiloteEnvoyer_(destinataire, mail) {
  try {
    if (!saasEmailValide(destinataire)) return "ADRESSE_INVALIDE";
    if (SAAS_PILOTE_ENVOI_MAILS === false) return "SIMULÉ";
    if (MailApp.getRemainingDailyQuota() < SAAS_PILOTE_QUOTA_MINIMUM) return "QUOTA";
    GmailApp.sendEmail(destinataire, mail.sujet, mail.texte, { htmlBody: mail.html, name: "Market Advisor CM" });
    return "ENVOYÉ";
  } catch (err) {
    Logger.log("[PILOTE] Échec e-mail : " + err.message);
    return "ÉCHEC";
  }
}

// ---------------------------------------------------------------------------
// SUITE D'UNE DEMANDE EN MODE AUTOMATIQUE (appelée par saasPiloteDemande)
// ---------------------------------------------------------------------------

/**
 * Prépare puis envoie le lien de confirmation pour la ligne indiquée de DEMANDES_PILOTE.
 * Écrit l'empreinte du jeton (jamais le jeton) et passe le statut à EN_ATTENTE_CONFIRMATION.
 * @return {string} état de l'envoi
 */
function saasPiloteInviterConfirmation(feuille, ligne, d) {
  const jeton = saasLienGenererJeton();
  feuille.getRange(ligne, SAAS_PILOTE_COL.HASH).setValue(saasLienHacher(jeton));
  feuille.getRange(ligne, SAAS_PILOTE_COL.EXP_MS).setValue(Date.now() + SAAS_PILOTE_CONFIRMATION_HEURES * 3600 * 1000);
  feuille.getRange(ligne, SAAS_PILOTE_COL.STATUT).setValue("EN_ATTENTE_CONFIRMATION");
  if (SAAS_PILOTE_ENVOI_MAILS === false) SAAS_PILOTE_JETON_TEST = jeton;
  try { CacheService.getScriptCache().put("PILOTE_RELANCE_" + saasLimiteEmpreinte(d.email), "1", 600); } catch (errCache) {}
  const url = saasLienUrlBase() + "/#confirmer=" + jeton;
  return saasPiloteEnvoyer_(d.email, saasPiloteTexteLien(d, url, saasPiloteLireLimites().duree));
}

/**
 * Décide de la suite d'une demande : liste d'attente si le plafond est atteint, sinon lien de confirmation.
 * @return {string} état de l'envoi (écrit dans Confirmation_Prospect)
 */
function saasPiloteSuiteAutomatique(feuille, ligne, d) {
  if (saasPiloteCompterActifs(feuille) >= saasPiloteLireLimites().plafond) {
    feuille.getRange(ligne, SAAS_PILOTE_COL.STATUT).setValue("LISTE_ATTENTE");
    saasLogger("", d.email, "", "PILOTE_ATTENTE", "Plafond atteint : liste d'attente (ligne " + ligne + ")", "", true);
    return saasPiloteEnvoyer_(d.email, saasPiloteTexteAttente(d));
  }
  return saasPiloteInviterConfirmation(feuille, ligne, d);
}

// ---------------------------------------------------------------------------
// CONFIRMATION : CRÉATION DE L'ESPACE
// ---------------------------------------------------------------------------

/** Crée le compte (sans mot de passe), le client et ses préférences. À appeler sous verrou. */
function saasPiloteCreerEspace_(d) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuilleUsers = ss.getSheetByName(SAAS_SHEET_UTILISATEURS);
  const feuilleClients = ss.getSheetByName("CLIENTS");
  if (!feuilleUsers || !feuilleClients) throw new Error("Feuille UTILISATEURS ou CLIENTS absente.");

  // Client : colonnes repérées par leur nom, comme la création par l'administrateur.
  const h = saasLireHeader(feuilleClients);
  const idx = {};
  h.forEach(function (col, i) { idx[col] = i; });
  const idClient = saasGenererIdClient(feuilleClients, idx);
  const ligneClient = new Array(h.length).fill("");
  const set = function (nom, valeur) { if (idx[nom] !== undefined) ligneClient[idx[nom]] = valeur; };
  set("ID_CLIENT", idClient);
  set("NOM_ENTREPRISE", d.entreprise);
  set("EMAIL_DESTINATAIRE", d.email);
  set("ACTIF", "OUI");
  set("REGIONS_CIBLES", "");
  set("TYPES_PROCEDURES_VISEES", "");
  set("MONTANT_MINIMUM", 0);
  set("SEUIL_SCORE_MIN_CLIENT", 3.0);
  set("PROMPT_METIER_IA", "Entreprise du secteur " + (SAAS_PILOTE_LIBELLES_SECTEUR[d.secteur] || d.secteur) + ".");
  set("MOTS_CLES_INCLUSION", SAAS_PILOTE_MOTS_CLES[d.secteur] || "");
  set("MOTS_CLES_EXCLUSION", "");
  feuilleClients.appendRow(ligneClient.map(saasNeutraliserCellule));

  // Utilisateur : hash et sel vides = aucune connexion par mot de passe tant qu'il n'en a pas défini un.
  const idUser = saasGenererId("USR");
  feuilleUsers.appendRow([
    idUser, d.email, "", "", d.nom, "", "CLIENT", idClient, "OUI", saasDateMaintenant(), "", "fr", ""
  ].map(saasNeutraliserCellule));

  saasCreerPreferencesParDefaut(idClient);
  return { idUser: idUser, idClient: idClient };
}

function saasPiloteNotifierActivation_(d, ids, finEssai) {
  try {
    if (SAAS_PILOTE_ENVOI_MAILS === false) return;
    const params = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("PARAMETRES");
    const emailAdmin = params ? String(params.getRange("H2").getValue() || "").trim() : "";
    if (!emailAdmin || !saasEmailValide(emailAdmin) || MailApp.getRemainingDailyQuota() < SAAS_PILOTE_QUOTA_MINIMUM) return;
    const texte = "Espace pilote ouvert : " + d.entreprise + " (" + d.nom + ", " + d.email + "), secteur " + d.secteur +
      ". Client " + ids.idClient + ", fin d'essai le " + finEssai + "." +
      (d.secteur === "AUTRE" ? " Secteur AUTRE : aucun mot-clé de départ, profil à compléter." : "");
    GmailApp.sendEmail(emailAdmin, "[Veille AO] Espace pilote ouvert — " + String(d.entreprise).substring(0, 60), texte, { name: "Veille AO — Demandes pilote" });
  } catch (err) {
    Logger.log("[PILOTE] Notification d'activation impossible : " + err.message);
  }
}

/**
 * POST /public/pilote/confirmer — le clic du prospect sur le lien reçu par e-mail.
 * @param {Object} payload { jeton } (64 caractères hexadécimaux)
 */
function saasPiloteConfirmer(payload, e) {
  const ip = saasExtraireIp(e);
  const ua = saasExtraireUserAgent(e);

  if (!saasPiloteAutoActif()) {
    return saasErreur("L'ouverture automatique n'est pas disponible pour le moment. Nous répondons à chaque demande sous 48 heures ouvrées.", 503);
  }
  if (saasLienEstBloque(ip)) {
    return saasErreur("Trop de tentatives. Réessayez dans quelques minutes.", 429);
  }
  const jeton = String((payload && payload.jeton) || "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(jeton)) {
    saasLienEnregistrerEchec(ip);
    return saasErreur(SAAS_PILOTE_MESSAGE_LIEN_INVALIDE, 401);
  }
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_DEMANDES_PILOTE);
  if (!feuille) return saasErreur("Service momentanément indisponible. Réessayez plus tard.", 503);
  const empreinte = saasLienHacher(jeton);

  const verrou = LockService.getScriptLock();
  try {
    verrou.waitLock(10000);
  } catch (err) {
    return saasErreur("Service occupé. Réessayez dans un instant.", 503);
  }

  let ids = null;
  let d = null;
  let finEssai = "";
  try {
    const derniere = feuille.getLastRow();
    let ligne = -1;
    let rang = null;
    if (derniere >= 2) {
      const data = feuille.getRange(2, 1, derniere - 1, SAAS_PILOTE_COL.FIN).getValues();
      for (let i = 0; i < data.length; i++) {
        if (String(data[i][SAAS_PILOTE_COL.HASH - 1]) === empreinte) { ligne = i + 2; rang = data[i]; break; }
      }
    }
    if (ligne < 0) {
      saasLienEnregistrerEchec(ip);
      saasLogger("", "", "", "PILOTE_CONFIRME", "Lien inconnu ou déjà utilisé", ip, false);
      return saasErreur(SAAS_PILOTE_MESSAGE_LIEN_INVALIDE, 401);
    }
    d = {
      nom: String(rang[SAAS_PILOTE_COL.NOM - 1]).replace(/^'/, ""),
      entreprise: String(rang[SAAS_PILOTE_COL.ENTREPRISE - 1]).replace(/^'/, ""),
      email: String(rang[SAAS_PILOTE_COL.EMAIL - 1]).replace(/^'/, "").trim().toLowerCase(),
      secteur: String(rang[SAAS_PILOTE_COL.SECTEUR - 1]).trim().toUpperCase()
    };
    if (String(rang[SAAS_PILOTE_COL.STATUT - 1]) !== "EN_ATTENTE_CONFIRMATION") {
      saasLogger("", d.email, "", "PILOTE_CONFIRME", "Statut " + rang[SAAS_PILOTE_COL.STATUT - 1] + " : confirmation refusée", ip, false);
      return saasErreur(SAAS_PILOTE_MESSAGE_LIEN_INVALIDE, 401);
    }
    const expMs = Number(rang[SAAS_PILOTE_COL.EXP_MS - 1]);
    if (!isFinite(expMs) || expMs < Date.now()) {
      saasLogger("", d.email, "", "PILOTE_CONFIRME", "Lien expiré (ligne " + ligne + ")", ip, false);
      return saasErreur(SAAS_PILOTE_MESSAGE_LIEN_INVALIDE, 401);
    }
    // Plafond revérifié au moment de la création (le lien a pu être envoyé quand il restait de la place).
    const limites = saasPiloteLireLimites();
    if (saasPiloteCompterActifs(feuille) >= limites.plafond) {
      feuille.getRange(ligne, SAAS_PILOTE_COL.STATUT).setValue("LISTE_ATTENTE");
      saasLogger("", d.email, "", "PILOTE_ATTENTE", "Plafond atteint à la confirmation (ligne " + ligne + ")", ip, true);
      return saasErreur("Toutes les places pilotes viennent d'être prises. Votre demande est sur liste d'attente : nous vous écrirons dès qu'une place se libère.", 409);
    }
    if (saasTrouverUtilisateurParEmail(d.email)) {
      feuille.getRange(ligne, SAAS_PILOTE_COL.STATUT).setValue("REFUSE");
      feuille.getRange(ligne, SAAS_PILOTE_COL.NOTES).setValue("Un compte existe déjà avec cette adresse.");
      saasLogger("", d.email, "", "PILOTE_CONFIRME", "Adresse déjà utilisée par un compte", ip, false);
      return saasErreur("Un compte existe déjà avec cette adresse. Connectez-vous avec le lien de votre dernier e-mail d'alerte.", 409);
    }

    ids = saasPiloteCreerEspace_(d);
    finEssai = saasDateAjout(limites.duree);
    feuille.getRange(ligne, SAAS_PILOTE_COL.STATUT).setValue("ACTIF");
    feuille.getRange(ligne, SAAS_PILOTE_COL.HASH).setValue("");           // le lien ne servira plus jamais
    feuille.getRange(ligne, SAAS_PILOTE_COL.DATE_CONF, 1, 5).setValues([[saasDateMaintenant(), ids.idUser, ids.idClient, saasDateMaintenant(), finEssai]]);
  } catch (err) {
    saasLogger("", d ? d.email : "", "", "PILOTE_ERREUR", "Création de l'espace : " + err.message, ip, false);
    return saasErreur("Service momentanément indisponible. Réessayez dans un instant : votre lien reste valable.", 500);
  } finally {
    verrou.releaseLock();
  }

  saasLogger(ids.idUser, d.email, "CLIENT", "PILOTE_CONFIRME", "Espace pilote ouvert, client " + ids.idClient + ", fin d'essai " + finEssai, ip, true);
  saasPiloteNotifierActivation_(d, ids, finEssai);

  const user = saasTrouverUtilisateurParId(ids.idUser);
  saasMettreAJourDerniereConnexion(user.ligne);
  const session = saasCreerSession(user.idUser, ip, ua);
  return saasReponse(true, {
    idUser: user.idUser,
    email: user.email,
    nom: user.nom,
    telephone: user.telephone,
    role: user.role,
    idClient: user.idClient,
    langue: user.langue,
    photoUrl: user.photoUrl,
    aMotDePasse: false,
    finEssai: finEssai,
    token: session ? session.token : null,
    expiration: session ? session.expiration : null
  }, "Votre espace pilote est ouvert.", 200);
}

// ---------------------------------------------------------------------------
// TEST (BAC À SABLE UNIQUEMENT)
// ---------------------------------------------------------------------------

/**
 * TEST DU LOT PIL3 — parcours complet de la création automatique.
 * Écrit dans DEMANDES_PILOTE, UTILISATEURS, CLIENTS, PREFERENCES_CLIENT, LIENS_CONNEXION, SESSIONS et AUDIT_LOG
 * (aucune ligne supprimée ; les comptes et clients de test sont désactivés à la fin). Aucun e-mail réel n'est envoyé.
 * Refuse de tourner si le classeur ne s'appelle pas « SANDBOX... » ou si SAAS_TEST_AUTORISE n'est pas OUI.
 */
function saasPiloteAutoTester() {
  Logger.log("=================================================");
  Logger.log("=== TEST LOT PIL3 : CRÉATION AUTOMATIQUE DU PILOTE ===");
  Logger.log("=================================================");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const autorise = /sandbox|bac/i.test(ss.getName()) ||
                   String(PropertiesService.getScriptProperties().getProperty("SAAS_TEST_AUTORISE") || "").toUpperCase() === "OUI";
  if (!autorise) { Logger.log("❌ TEST ANNULÉ : ce classeur (« " + ss.getName() + " ») n'est pas un bac à sable. Rien n'a été écrit."); return; }
  if (typeof saasAuthLien !== "function" || String(saasPiloteDemande).indexOf("saasPiloteSuiteAutomatique") === -1) {
    Logger.log("❌ TEST ANNULÉ : SaaS_24_DemandesPilote.gs (version PIL3) ou SaaS_02_Auth.gs (LC1) n'est pas à jour."); return;
  }
  const feuille = ss.getSheetByName(SAAS_SHEET_DEMANDES_PILOTE);
  if (!feuille || String(feuille.getRange(1, SAAS_PILOTE_COL.FIN).getValue()).trim() !== "Date_Fin_Essai") {
    Logger.log("❌ TEST ANNULÉ : colonnes manquantes. Exécuter saasPiloteAjouterColonnesAuto() puis relancer."); return;
  }

  let ok = 0, ko = 0;
  const verifier = function (nom, condition, detail) {
    Logger.log((condition ? "  ✅ " : "  ❌ ") + nom + (detail ? " — " + detail : ""));
    if (condition) ok++; else ko++;
  };
  const evt = { parameter: { ip: "203.0.113.88" }, headers: {} };
  const demander = function (email, secteur) {
    return JSON.parse(saasPiloteDemande({ nom: "Test Pilote", entreprise: "Entreprise Test " + email.split("@")[0], email: email, secteur: secteur || "BTP" }, evt).getContent());
  };
  const confirmer = function (jeton) { return JSON.parse(saasPiloteConfirmer({ jeton: jeton }, evt).getContent()); };
  const trouver = function (email) {
    const n = feuille.getLastRow();
    if (n < 2) return null;
    const data = feuille.getRange(2, 1, n - 1, SAAS_PILOTE_COL.FIN).getValues();
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][SAAS_PILOTE_COL.EMAIL - 1]).replace(/^'/, "").toLowerCase() === email) return { ligne: i + 2, rang: data[i] };
    }
    return null;
  };
  const nbLignes = function (nom) { const f = ss.getSheetByName(nom); return f ? f.getLastRow() : 0; };
  const nettoyerCache = function () {
    try {
      const c = CacheService.getScriptCache();
      const h = saasLimiteEmpreinte("203.0.113.88");
      c.remove("LKE_" + h); c.remove("LKB_" + h);
      c.remove("PILOTE_H_" + Utilities.formatDate(new Date(), SAAS_FUSEAU, "yyyyMMddHH"));
    } catch (err) {}
  };

  const stamp = Date.now();
  const A = "pil3-a-" + stamp + "@example.com";
  const B = "pil3-b-" + stamp + "@example.com";
  const C = "pil3-c-" + stamp + "@example.com";
  const avant = { auto: SAAS_PILOTE_FORCER_AUTO, plafond: SAAS_PILOTE_FORCER_PLAFOND, mails: SAAS_PILOTE_ENVOI_MAILS, lien: SAAS_LIEN_FORCER };
  const alerteAvant = SAAS_LIMITE_ALERTE_EMAIL;
  const creesIdUser = [];
  nettoyerCache();
  try {
    SAAS_PILOTE_ENVOI_MAILS = false;
    SAAS_LIMITE_ALERTE_EMAIL = false;

    // 1. Réglages et textes
    SAAS_PILOTE_FORCER_AUTO = null; SAAS_PILOTE_FORCER_PLAFOND = null;
    const limites = saasPiloteLireLimites();
    verifier("1a. Plafond et durée lisibles (défauts 20 et 30 si absents)", limites.plafond >= 0 && limites.duree >= 1, "plafond " + limites.plafond + ", durée " + limites.duree);
    verifier("1b. Mots-clés de départ : BTP renseigné, AUTRE vide", SAAS_PILOTE_MOTS_CLES.BTP.indexOf("travaux") !== -1 && SAAS_PILOTE_MOTS_CLES.AUTRE === "");
    const mail = saasPiloteTexteLien({ nom: "<b>Awa</b>", entreprise: "BTP & Co", email: "a@b.cm", secteur: "BTP" }, "https://exemple.cm/#confirmer=" + "a".repeat(64), 30);
    verifier("1c. E-mail de lien : balises du visiteur neutralisées, lien présent", mail.html.indexOf("<b>Awa</b>") === -1 && mail.html.indexOf("#confirmer=") !== -1 && mail.texte.indexOf("#confirmer=") !== -1);

    // 2. Adresses jetables
    verifier("2a. mailinator.com refusé", saasPiloteEmailJetable("x@mailinator.com") === true);
    verifier("2b. Sous-domaine d'un domaine jetable refusé", saasPiloteEmailJetable("x@a.yopmail.com") === true);
    verifier("2c. gmail.com et un domaine d'entreprise acceptés", saasPiloteEmailJetable("x@gmail.com") === false && saasPiloteEmailJetable("x@entreprise.cm") === false);

    // 3. Mode manuel (interrupteur sur NON) : rien d'automatique
    SAAS_PILOTE_FORCER_AUTO = false;
    const rM = JSON.parse(saasPiloteConfirmer({ jeton: "a".repeat(64) }, evt).getContent());
    verifier("3a. Interrupteur NON : /public/pilote/confirmer répond 503", rM.code === 503);

    // 4. Mode automatique : demande
    SAAS_PILOTE_FORCER_AUTO = true; SAAS_PILOTE_FORCER_PLAFOND = 1000;
    const rJet = demander("faux-" + stamp + "@mailinator.com");
    verifier("4a. Adresse jetable refusée (400) par la route", rJet.code === 400 && !trouver("faux-" + stamp + "@mailinator.com"));
    SAAS_PILOTE_JETON_TEST = "";
    const rA = demander(A);
    const ligneA = trouver(A);
    verifier("4b. Demande acceptée (201), ligne créée en EN_ATTENTE_CONFIRMATION", rA.code === 201 && !!ligneA && ligneA.rang[SAAS_PILOTE_COL.STATUT - 1] === "EN_ATTENTE_CONFIRMATION");
    const jetonA = SAAS_PILOTE_JETON_TEST;
    verifier("4c. Jeton de 64 caractères généré, seule son empreinte est dans la feuille",
             /^[0-9a-f]{64}$/.test(jetonA) && JSON.stringify(feuille.getDataRange().getValues()).indexOf(jetonA) === -1 &&
             String(ligneA.rang[SAAS_PILOTE_COL.HASH - 1]) === saasLienHacher(jetonA));
    verifier("4d. Aucune création avant confirmation (pas de compte pour cette adresse)", !saasTrouverUtilisateurParEmail(A));

    // 5. Doublon
    const nAvant = feuille.getLastRow();
    const rDup = demander(A);
    verifier("5. Doublon : même réponse neutre (201), aucune ligne de plus", rDup.code === 201 && feuille.getLastRow() === nAvant);

    // 6. Mauvais jetons
    verifier("6a. Jeton mal formé : 401", confirmer("pas-un-jeton").code === 401);
    verifier("6b. Jeton inconnu bien formé : 401", confirmer("b".repeat(64)).code === 401);

    // 7. Confirmation réussie
    const nUsers = nbLignes(SAAS_SHEET_UTILISATEURS), nCli = nbLignes("CLIENTS"), nPref = nbLignes(SAAS_SHEET_PREFS);
    const rC = confirmer(jetonA);
    verifier("7a. Confirmation : 200 avec une session CLIENT sans mot de passe", rC.succes === true && !!rC.donnees && !!rC.donnees.token && rC.donnees.role === "CLIENT" && rC.donnees.aMotDePasse === false, "code " + rC.code + (rC.succes ? "" : " — " + rC.message));
    if (rC.donnees && rC.donnees.idUser) creesIdUser.push(rC.donnees.idUser);
    verifier("7b. Un compte, un client et des préférences créés (+1 ligne chacun)",
             nbLignes(SAAS_SHEET_UTILISATEURS) === nUsers + 1 && nbLignes("CLIENTS") === nCli + 1 && nbLignes(SAAS_SHEET_PREFS) === nPref + 1);
    const ligneA2 = trouver(A);
    verifier("7c. Demande passée à ACTIF avec ID_User, ID_Client et dates d'essai",
             ligneA2.rang[SAAS_PILOTE_COL.STATUT - 1] === "ACTIF" && !!ligneA2.rang[SAAS_PILOTE_COL.ID_USER - 1] && !!ligneA2.rang[SAAS_PILOTE_COL.ID_CLIENT - 1] &&
             !!ligneA2.rang[SAAS_PILOTE_COL.DEBUT - 1] && !!ligneA2.rang[SAAS_PILOTE_COL.FIN - 1]);
    const debut = new Date(String(ligneA2.rang[SAAS_PILOTE_COL.DEBUT - 1])), fin = new Date(String(ligneA2.rang[SAAS_PILOTE_COL.FIN - 1]));
    const jours = Math.round((fin.getTime() - debut.getTime()) / 86400000);
    verifier("7d. Durée d'essai conforme au réglage", jours === saasPiloteLireLimites().duree, jours + " jours");
    const cliData = ss.getSheetByName("CLIENTS").getDataRange().getValues();
    const hCli = cliData[0].map(function (v) { return String(v).trim().toUpperCase(); });
    const rangCli = cliData[cliData.length - 1];
    verifier("7e. Client ACTIF avec mots-clés de départ du secteur", String(rangCli[hCli.indexOf("ACTIF")]) === "OUI" && String(rangCli[hCli.indexOf("MOTS_CLES_INCLUSION")]).indexOf("travaux") !== -1);
    const userA = saasTrouverUtilisateurParEmail(A);
    verifier("7f. Compte sans mot de passe (hash et sel vides) : aucune connexion par mot de passe",
             userA.hash === "" && userA.sel === "" && JSON.parse(saasAuthLogin({ email: A, motDePasse: "n'importe quoi" }, { parameter: {}, headers: {} }).getContent()).code === 401);
    try { saasLimiteReinitialiser(A); } catch (err) {}
    SAAS_LIEN_FORCER = true;
    const lienAlerte = saasLienEmettre(userA.idUser, "ALERTE", 1);
    verifier("7g. Le nouveau compte peut recevoir un lien d'accès des alertes (lot LC1)", !!lienAlerte && /#acces=[0-9a-f]{64}$/.test(lienAlerte.url));
    if (rC.donnees && rC.donnees.token) saasInvaliderSession(rC.donnees.token);

    // 8. Réemploi du lien
    verifier("8. Lien déjà utilisé : 401", confirmer(jetonA).code === 401);

    // 9. Lien expiré puis nouveau lien à la nouvelle demande
    SAAS_PILOTE_JETON_TEST = "";
    demander(B);
    const jetonB1 = SAAS_PILOTE_JETON_TEST;
    const ligneB = trouver(B);
    feuille.getRange(ligneB.ligne, SAAS_PILOTE_COL.EXP_MS).setValue(1000);
    verifier("9a. Lien expiré : 401", confirmer(jetonB1).code === 401);
    try { CacheService.getScriptCache().remove("PILOTE_RELANCE_" + saasLimiteEmpreinte(B)); } catch (err) {}
    SAAS_PILOTE_JETON_TEST = "";
    const rRelance = demander(B);
    const jetonB2 = SAAS_PILOTE_JETON_TEST;
    verifier("9b. Nouvelle demande de la même adresse : nouveau lien (autre jeton), toujours une seule ligne",
             rRelance.code === 201 && /^[0-9a-f]{64}$/.test(jetonB2) && jetonB2 !== jetonB1 &&
             String(trouver(B).rang[SAAS_PILOTE_COL.HASH - 1]) === saasLienHacher(jetonB2));

    // 10. Plafond : atteint à la demande
    SAAS_PILOTE_FORCER_PLAFOND = 1;   // A est déjà ACTIF
    SAAS_PILOTE_JETON_TEST = "";
    demander(C);
    const ligneC = trouver(C);
    verifier("10a. Plafond atteint : demande en LISTE_ATTENTE, aucun jeton émis", ligneC.rang[SAAS_PILOTE_COL.STATUT - 1] === "LISTE_ATTENTE" && String(ligneC.rang[SAAS_PILOTE_COL.HASH - 1]) === "" && SAAS_PILOTE_JETON_TEST === "");
    // 11. Plafond atteint entre l'envoi du lien et le clic
    const rB = confirmer(jetonB2);
    verifier("11a. Lien valide mais plafond atteint entre-temps : 409 et LISTE_ATTENTE", rB.code === 409 && trouver(B).rang[SAAS_PILOTE_COL.STATUT - 1] === "LISTE_ATTENTE", "code " + rB.code);
    verifier("11b. Aucun compte créé pour cette adresse", !saasTrouverUtilisateurParEmail(B));

    // 12. Blocage par IP après trop de liens invalides
    nettoyerCache();
    const codes = [];
    for (let k = 0; k < SAAS_LIEN_MAX_ECHECS; k++) codes.push(confirmer(saasLienGenererJeton()).code);
    verifier("12. Trop de liens invalides depuis la même IP : 429", confirmer(saasLienGenererJeton()).code === 429 && codes.every(function (c) { return c === 401; }));
  } catch (err) {
    Logger.log("  ❌ Exception pendant le test : " + err.message);
    ko++;
  } finally {
    // Nettoyage : comptes et clients de test désactivés (jamais supprimés), notes TEST sur les demandes.
    try {
      const fu = ss.getSheetByName(SAAS_SHEET_UTILISATEURS), fc = ss.getSheetByName("CLIENTS");
      creesIdUser.forEach(function (id) {
        const u = saasTrouverUtilisateurParId(id);
        if (u) {
          fu.getRange(u.ligne, 9).setValue("NON");
          const cd = fc.getDataRange().getValues();
          const hh = cd[0].map(function (v) { return String(v).trim().toUpperCase(); });
          for (let i = 1; i < cd.length; i++) { if (String(cd[i][hh.indexOf("ID_CLIENT")]) === u.idClient) fc.getRange(i + 1, hh.indexOf("ACTIF") + 1).setValue("NON"); }
        }
      });
      [A, B, C].forEach(function (m) { const l = trouver(m); if (l && !l.rang[SAAS_PILOTE_COL.NOTES - 1]) feuille.getRange(l.ligne, SAAS_PILOTE_COL.NOTES).setValue("TEST PIL3"); });
    } catch (err) {}
    nettoyerCache();
    SAAS_PILOTE_FORCER_AUTO = avant.auto; SAAS_PILOTE_FORCER_PLAFOND = avant.plafond;
    SAAS_PILOTE_ENVOI_MAILS = avant.mails; SAAS_LIEN_FORCER = avant.lien; SAAS_LIMITE_ALERTE_EMAIL = alerteAvant;
  }
  Logger.log("");
  Logger.log("=== RÉSULTAT : " + ok + " contrôle(s) réussi(s), " + ko + " échec(s) ===");
}
