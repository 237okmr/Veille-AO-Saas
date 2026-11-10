// >>> FICHIER : SaaS_26_PiloteCycle.gs <<< (à coller dans l'onglet du même nom)
/**
 * ============================================================================
 * SAAS — CYCLE DE VIE DU PILOTE : FIN D'ESSAI ET LISTE D'ATTENTE (V1.0 — LOT PIL4)
 * ============================================================================
 * Deux fonctions de travail, à lancer à la main ou (plus tard, sur validation) par un déclencheur
 * quotidien. AUCUN déclencheur n'est créé par ce fichier.
 *
 *   saasPiloteExpirerEssais()   à la fin de l'essai : statut EXPIRE, accès coupé (compte inactif,
 *                               sessions fermées), alertes stoppées (client inactif), place libérée.
 *                               Rien n'est supprimé : toutes les lignes et données restent.
 *   saasPiloteReleverAttente()  remplit les places libres avec les demandes en LISTE_ATTENTE, de la plus
 *                               ancienne à la plus récente : chacune reçoit son lien de confirmation (48 h).
 *   saasPiloteCycleQuotidien()  enchaîne les deux (c'est elle que le déclencheur appellera).
 *
 * Ces fonctions ne font rien tant que Pilote_Auto_Actif n'est pas sur OUI dans PARAMETRES.
 * Les deux premières ont une version « simulation » (lecture seule) : saasPiloteCycleSimuler().
 * TEST (bac à sable uniquement) : saasPiloteCycleTester()
 * ============================================================================
 */

var SAAS_PILOTE_ENVOI_FIN_ESSAI = true;   // le test le coupe : aucun e-mail réel

/** Date (objet) d'une cellule de date de la feuille, ou null. */
function saasPiloteDateCellule_(valeur) {
  if (valeur instanceof Date) return isNaN(valeur.getTime()) ? null : valeur;
  const d = new Date(String(valeur || ""));
  return isNaN(d.getTime()) ? null : d;
}

/** Désactive toutes les sessions ouvertes d'un utilisateur. @return {number} sessions fermées */
function saasPiloteFermerSessions_(idUser) {
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_SESSIONS);
  if (!feuille || feuille.getLastRow() < 2) return 0;
  const data = feuille.getRange(2, 1, feuille.getLastRow() - 1, 7).getValues();
  let n = 0;
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][1]) === idUser && String(data[i][6]).toUpperCase() === "OUI") {
      feuille.getRange(i + 2, 7).setValue("NON");
      n++;
    }
  }
  return n;
}

/** Met ACTIF à NON pour le client indiqué (aucune suppression). */
function saasPiloteDesactiverClient_(idClient) {
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("CLIENTS");
  if (!feuille || !idClient) return false;
  const data = feuille.getDataRange().getValues();
  const h = data[0].map(function (v) { return String(v).trim().toUpperCase(); });
  const iId = h.indexOf("ID_CLIENT"), iActif = h.indexOf("ACTIF");
  if (iId < 0 || iActif < 0) return false;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][iId]) === idClient) { feuille.getRange(i + 1, iActif + 1).setValue("NON"); return true; }
  }
  return false;
}

function saasPiloteTexteFinEssai(d) {
  const sujet = "Market Advisor CM : votre essai pilote est terminé";
  const texte =
    "Bonjour " + d.nom + ",\n\n" +
    "Votre période d'essai pilote pour " + d.entreprise + " est arrivée à son terme : votre accès et l'envoi de vos alertes sont suspendus. Vos données sont conservées.\n\n" +
    "Merci d'avoir testé Market Advisor CM. Pour poursuivre, répondez simplement à cet e-mail.\n\n" +
    "L'équipe Market Advisor CM";
  return { sujet: sujet, texte: texte, html: saasPiloteHtmlDepuisTexte_(texte) };
}

/**
 * Lecture seule : les pilotes dont l'essai est terminé (ou qui le seront), sans rien modifier.
 * @return {Array<{ligne:number,email:string,fin:string,echu:boolean}>}
 */
function saasPiloteCycleLister_(feuille) {
  const derniere = feuille.getLastRow();
  const sortie = [];
  if (derniere < 2) return sortie;
  const data = feuille.getRange(2, 1, derniere - 1, SAAS_PILOTE_COL.FIN).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][SAAS_PILOTE_COL.STATUT - 1]).trim().toUpperCase() !== "ACTIF") continue;
    const fin = saasPiloteDateCellule_(data[i][SAAS_PILOTE_COL.FIN - 1]);
    sortie.push({
      ligne: i + 2,
      email: String(data[i][SAAS_PILOTE_COL.EMAIL - 1]).replace(/^'/, ""),
      fin: fin ? Utilities.formatDate(fin, SAAS_FUSEAU, "yyyy-MM-dd HH:mm") : "(date absente)",
      echu: !!fin && fin.getTime() < Date.now()
    });
  }
  return sortie;
}

/** Simulation : affiche ce que le cycle ferait, sans rien écrire. */
function saasPiloteCycleSimuler() {
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_DEMANDES_PILOTE);
  if (!feuille) { Logger.log("❌ Onglet DEMANDES_PILOTE absent."); return; }
  const l = saasPiloteCycleLister_(feuille);
  const limites = saasPiloteLireLimites();
  Logger.log("=== SIMULATION DU CYCLE PILOTE (rien n'est modifié) ===");
  Logger.log("Interrupteur : " + (saasPiloteAutoActif() ? "OUI" : "NON (le cycle ne ferait rien)") + " | plafond " + limites.plafond + " | durée " + limites.duree + " jours");
  l.forEach(function (p) { Logger.log("  " + (p.echu ? "⏹ à clore " : "▶ en cours ") + p.email + " — fin " + p.fin); });
  const aClore = l.filter(function (p) { return p.echu; }).length;
  const attente = saasPiloteCompterStatut_(feuille, "LISTE_ATTENTE");
  Logger.log("Actifs : " + l.length + " | à clore : " + aClore + " | en liste d'attente : " + attente + " | places libres après clôture : " + Math.max(0, limites.plafond - (l.length - aClore) - saasPiloteCompterInvitations_(feuille)));
}

function saasPiloteCompterStatut_(feuille, statut) {
  const derniere = feuille.getLastRow();
  if (derniere < 2) return 0;
  const v = feuille.getRange(2, SAAS_PILOTE_COL.STATUT, derniere - 1, 1).getValues();
  return v.filter(function (r) { return String(r[0]).trim().toUpperCase() === statut; }).length;
}

/** Liens de confirmation encore valables : ils réservent une place pour ne pas inviter plus de monde qu'il n'y en a. */
function saasPiloteCompterInvitations_(feuille) {
  const derniere = feuille.getLastRow();
  if (derniere < 2) return 0;
  const v = feuille.getRange(2, SAAS_PILOTE_COL.STATUT, derniere - 1, SAAS_PILOTE_COL.EXP_MS - SAAS_PILOTE_COL.STATUT + 1).getValues();
  let n = 0;
  v.forEach(function (r) {
    if (String(r[0]).trim().toUpperCase() === "EN_ATTENTE_CONFIRMATION" && Number(r[r.length - 1]) > Date.now()) n++;
  });
  return n;
}

/**
 * Clôture les essais terminés. Sans effet si Pilote_Auto_Actif n'est pas sur OUI.
 * @return {number} nombre de pilotes clos
 */
function saasPiloteExpirerEssais() {
  if (!saasPiloteAutoActif()) { Logger.log("Pilote_Auto_Actif n'est pas sur OUI : aucune clôture."); return 0; }
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_DEMANDES_PILOTE);
  if (!feuille) return 0;
  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(20000)) { Logger.log("Verrou occupé : réessayer plus tard."); return 0; }
  const clos = [];
  try {
    const derniere = feuille.getLastRow();
    if (derniere < 2) return 0;
    const data = feuille.getRange(2, 1, derniere - 1, SAAS_PILOTE_COL.FIN).getValues();
    for (let i = 0; i < data.length; i++) {
      const rang = data[i];
      if (String(rang[SAAS_PILOTE_COL.STATUT - 1]).trim().toUpperCase() !== "ACTIF") continue;
      const fin = saasPiloteDateCellule_(rang[SAAS_PILOTE_COL.FIN - 1]);
      if (!fin || fin.getTime() >= Date.now()) continue;       // date absente : on ne clôt jamais par erreur
      const ligne = i + 2;
      const idUser = String(rang[SAAS_PILOTE_COL.ID_USER - 1]);
      const idClient = String(rang[SAAS_PILOTE_COL.ID_CLIENT - 1]);
      const user = saasTrouverUtilisateurParId(idUser);
      if (user && user.role === "CLIENT") {
        SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_UTILISATEURS).getRange(user.ligne, 9).setValue("NON");
      }
      saasPiloteFermerSessions_(idUser);
      saasPiloteDesactiverClient_(idClient);
      feuille.getRange(ligne, SAAS_PILOTE_COL.STATUT).setValue("EXPIRE");
      feuille.getRange(ligne, SAAS_PILOTE_COL.NOTES).setValue("Essai terminé le " + saasDateMaintenant());
      saasLogger(idUser, String(rang[SAAS_PILOTE_COL.EMAIL - 1]).replace(/^'/, ""), "CLIENT", "PILOTE_EXPIRE", "Fin d'essai, accès et alertes suspendus (client " + idClient + ")", "", true);
      clos.push({
        nom: String(rang[SAAS_PILOTE_COL.NOM - 1]).replace(/^'/, ""),
        entreprise: String(rang[SAAS_PILOTE_COL.ENTREPRISE - 1]).replace(/^'/, ""),
        email: String(rang[SAAS_PILOTE_COL.EMAIL - 1]).replace(/^'/, "").trim().toLowerCase()
      });
    }
  } finally {
    verrou.releaseLock();
  }
  if (SAAS_PILOTE_ENVOI_FIN_ESSAI !== false) {
    clos.forEach(function (d) { saasPiloteEnvoyer_(d.email, saasPiloteTexteFinEssai(d)); });
  }
  Logger.log("Essais clos : " + clos.length);
  return clos.length;
}

/**
 * Invite, de la plus ancienne à la plus récente, les demandes en LISTE_ATTENTE tant qu'il reste des places.
 * Sans effet si Pilote_Auto_Actif n'est pas sur OUI.
 * @return {number} nombre de personnes invitées
 */
function saasPiloteReleverAttente() {
  if (!saasPiloteAutoActif()) { Logger.log("Pilote_Auto_Actif n'est pas sur OUI : aucune invitation."); return 0; }
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_DEMANDES_PILOTE);
  if (!feuille) return 0;
  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(20000)) { Logger.log("Verrou occupé : réessayer plus tard."); return 0; }
  let invites = 0;
  try {
    const derniere = feuille.getLastRow();
    if (derniere < 2) return 0;
    const plafond = saasPiloteLireLimites().plafond;
    let libres = plafond - saasPiloteCompterActifs(feuille) - saasPiloteCompterInvitations_(feuille);
    if (libres <= 0) return 0;
    const data = feuille.getRange(2, 1, derniere - 1, SAAS_PILOTE_COL.FIN).getValues();
    for (let i = 0; i < data.length && libres > 0; i++) {   // l'ordre des lignes = l'ordre d'arrivée
      if (String(data[i][SAAS_PILOTE_COL.STATUT - 1]).trim().toUpperCase() !== "LISTE_ATTENTE") continue;
      const d = {
        nom: String(data[i][SAAS_PILOTE_COL.NOM - 1]).replace(/^'/, ""),
        entreprise: String(data[i][SAAS_PILOTE_COL.ENTREPRISE - 1]).replace(/^'/, ""),
        email: String(data[i][SAAS_PILOTE_COL.EMAIL - 1]).replace(/^'/, "").trim().toLowerCase(),
        secteur: String(data[i][SAAS_PILOTE_COL.SECTEUR - 1]).trim().toUpperCase()
      };
      const etat = saasPiloteInviterConfirmation(feuille, i + 2, d);
      feuille.getRange(i + 2, SAAS_PILOTE_COL.CONFIRM_PROSPECT).setValue(etat);
      saasLogger("", d.email, "", "PILOTE_INVITE", "Place libérée : lien de confirmation envoyé depuis la liste d'attente (ligne " + (i + 2) + ")", "", true);
      invites++; libres--;
    }
  } finally {
    verrou.releaseLock();
  }
  Logger.log("Invités depuis la liste d'attente : " + invites);
  return invites;
}

/** Point d'entrée du futur déclencheur quotidien : clôture d'abord, puis remplissage des places libérées. */
function saasPiloteCycleQuotidien() {
  const clos = saasPiloteExpirerEssais();
  const invites = saasPiloteReleverAttente();
  Logger.log("=== CYCLE PILOTE : " + clos + " clos, " + invites + " invité(s) ===");
}

/**
 * TEST DU LOT PIL4 — fin d'essai et liste d'attente (BAC À SABLE UNIQUEMENT).
 * Aucun e-mail réel, aucune ligne supprimée ; les comptes et clients de test finissent inactifs.
 */
function saasPiloteCycleTester() {
  Logger.log("=================================================");
  Logger.log("=== TEST LOT PIL4 : FIN D'ESSAI ET LISTE D'ATTENTE ===");
  Logger.log("=================================================");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const autorise = /sandbox|bac/i.test(ss.getName()) ||
                   String(PropertiesService.getScriptProperties().getProperty("SAAS_TEST_AUTORISE") || "").toUpperCase() === "OUI";
  if (!autorise) { Logger.log("❌ TEST ANNULÉ : ce classeur (« " + ss.getName() + " ») n'est pas un bac à sable. Rien n'a été écrit."); return; }
  const feuille = ss.getSheetByName(SAAS_SHEET_DEMANDES_PILOTE);
  if (!feuille || String(feuille.getRange(1, SAAS_PILOTE_COL.FIN).getValue()).trim() !== "Date_Fin_Essai") {
    Logger.log("❌ TEST ANNULÉ : colonnes manquantes (saasPiloteAjouterColonnesAuto)."); return;
  }
  let ok = 0, ko = 0;
  const verifier = function (nom, condition, detail) {
    Logger.log((condition ? "  ✅ " : "  ❌ ") + nom + (detail ? " — " + detail : ""));
    if (condition) ok++; else ko++;
  };
  const evt = { parameter: { ip: "203.0.113.99" }, headers: {} };
  const demander = function (email) {
    return JSON.parse(saasPiloteDemande({ nom: "Test Cycle", entreprise: "Entreprise Cycle " + email.split("@")[0], email: email, secteur: "BTP" }, evt).getContent());
  };
  const confirmer = function (jeton) { return JSON.parse(saasPiloteConfirmer({ jeton: jeton }, evt).getContent()); };
  const trouver = function (email) {
    const n = feuille.getLastRow();
    const data = feuille.getRange(2, 1, n - 1, SAAS_PILOTE_COL.FIN).getValues();
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][SAAS_PILOTE_COL.EMAIL - 1]).replace(/^'/, "").toLowerCase() === email) return { ligne: i + 2, rang: data[i] };
    }
    return null;
  };
  const statut = function (email) { const t = trouver(email); return t ? String(t.rang[SAAS_PILOTE_COL.STATUT - 1]) : ""; };
  const nettoyerCache = function () {
    try {
      const c = CacheService.getScriptCache();
      const h = saasLimiteEmpreinte("203.0.113.99");
      c.remove("LKE_" + h); c.remove("LKB_" + h);
      c.remove("PILOTE_H_" + Utilities.formatDate(new Date(), SAAS_FUSEAU, "yyyyMMddHH"));
    } catch (err) {}
  };

  const stamp = Date.now();
  const A = "pil4-a-" + stamp + "@example.com", B = "pil4-b-" + stamp + "@example.com", C = "pil4-c-" + stamp + "@example.com";
  const avant = { auto: SAAS_PILOTE_FORCER_AUTO, plafond: SAAS_PILOTE_FORCER_PLAFOND, mails: SAAS_PILOTE_ENVOI_MAILS, fin: SAAS_PILOTE_ENVOI_FIN_ESSAI };
  const alerteAvant = SAAS_LIMITE_ALERTE_EMAIL;
  const ids = [];
  nettoyerCache();
  try {
    SAAS_PILOTE_ENVOI_MAILS = false; SAAS_PILOTE_ENVOI_FIN_ESSAI = false; SAAS_LIMITE_ALERTE_EMAIL = false;

    // 0. Restes d'anciens tests (lignes marquées TEST encore en attente) : mises à l'écart pour ne pas fausser l'ordre d'arrivée
    const nl = feuille.getLastRow();
    if (nl >= 2) {
      const vieux = feuille.getRange(2, 1, nl - 1, SAAS_PILOTE_COL.NOTES).getValues();
      vieux.forEach(function (r, i) {
        const st = String(r[SAAS_PILOTE_COL.STATUT - 1]);
        if ((st === "LISTE_ATTENTE" || st === "EN_ATTENTE_CONFIRMATION") && /^TEST/.test(String(r[SAAS_PILOTE_COL.NOTES - 1]))) {
          feuille.getRange(i + 2, SAAS_PILOTE_COL.STATUT).setValue("REFUSE");
        }
      });
    }

    // 1. Interrupteur NON : rien ne bouge
    SAAS_PILOTE_FORCER_AUTO = false;
    verifier("1. Interrupteur NON : ni clôture ni invitation", saasPiloteExpirerEssais() === 0 && saasPiloteReleverAttente() === 0);

    // Mise en place : plafond = (actifs actuels + 1), donc A occupe la dernière place
    SAAS_PILOTE_FORCER_AUTO = true;
    SAAS_PILOTE_FORCER_PLAFOND = 1000;
    SAAS_PILOTE_JETON_TEST = "";
    demander(A);
    const rA = confirmer(SAAS_PILOTE_JETON_TEST);
    verifier("2a. Pilote A ouvert (200)", rA.succes === true && !!rA.donnees, "code " + rA.code);
    if (rA.donnees) ids.push(rA.donnees.idUser);
    const idUserA = rA.donnees ? rA.donnees.idUser : "";
    const idClientA = rA.donnees ? rA.donnees.idClient : "";
    SAAS_PILOTE_FORCER_PLAFOND = saasPiloteCompterActifs(feuille);   // plafond atteint
    demander(B);
    demander(C);
    verifier("2b. B et C arrivent en liste d'attente (plafond atteint)", statut(B) === "LISTE_ATTENTE" && statut(C) === "LISTE_ATTENTE");

    // 3. Essai de A en cours : rien à clore, aucune place libre
    const nLignes = feuille.getLastRow();
    verifier("3. Essai en cours : aucune clôture, aucune invitation", saasPiloteExpirerEssais() === 0 && saasPiloteReleverAttente() === 0 && statut(A) === "ACTIF");

    // 4. Fin d'essai de A (date reculée)
    const nSess = ss.getSheetByName(SAAS_SHEET_SESSIONS).getLastRow(), nUsers = ss.getSheetByName(SAAS_SHEET_UTILISATEURS).getLastRow(), nCli = ss.getSheetByName("CLIENTS").getLastRow();
    SAAS_PILOTE_JETON_TEST = "";
    const sessionA = saasCreerSession(idUserA, "203.0.113.99", "test");
    feuille.getRange(trouver(A).ligne, SAAS_PILOTE_COL.FIN).setValue("2020-01-01 00:00:00");
    const clos = saasPiloteExpirerEssais();
    verifier("4a. Un seul pilote clos", clos === 1, "clos " + clos);
    verifier("4b. Statut EXPIRE, ligne conservée", statut(A) === "EXPIRE" && feuille.getLastRow() === nLignes);
    const uA = saasTrouverUtilisateurParId(idUserA);
    verifier("4c. Compte inactif, aucune ligne supprimée (utilisateurs, clients)", uA && uA.actif === "NON" && ss.getSheetByName(SAAS_SHEET_UTILISATEURS).getLastRow() === nUsers + 0 && ss.getSheetByName("CLIENTS").getLastRow() === nCli);
    verifier("4d. Session de A fermée : le jeton ne vaut plus rien", !saasVerifierToken(sessionA.token));
    const cd = ss.getSheetByName("CLIENTS").getDataRange().getValues();
    const hh = cd[0].map(function (v) { return String(v).trim().toUpperCase(); });
    const rangCli = cd.filter(function (r) { return String(r[hh.indexOf("ID_CLIENT")]) === idClientA; })[0];
    verifier("4e. Client inactif : les alertes sont stoppées", !!rangCli && String(rangCli[hh.indexOf("ACTIF")]) === "NON");
    verifier("4f. Reconnexion par lien refusée (compte inactif)", saasLienDestinataireEligible(uA).ok === false);
    verifier("4g. Le plafond est libéré (0 actif)", saasPiloteCompterActifs(feuille) === SAAS_PILOTE_FORCER_PLAFOND - 1);

    // 5. Idempotence
    verifier("5. Deuxième passage : rien à clore", saasPiloteExpirerEssais() === 0);

    // 6. Liste d'attente : une place libre, B (arrivé avant C) est invité, pas C
    SAAS_PILOTE_JETON_TEST = "";
    const invites = saasPiloteReleverAttente();
    verifier("6a. Une seule invitation (une seule place libre)", invites === 1, "invités " + invites);
    verifier("6b. B (le plus ancien) invité avec un jeton, C attend toujours", statut(B) === "EN_ATTENTE_CONFIRMATION" && /^[0-9a-f]{64}$/.test(SAAS_PILOTE_JETON_TEST) && statut(C) === "LISTE_ATTENTE");
    const jetonB = SAAS_PILOTE_JETON_TEST;
    verifier("6c. Invitation en attente = place réservée : pas d'autre invitation", saasPiloteReleverAttente() === 0 && statut(C) === "LISTE_ATTENTE");

    // 7. B confirme : ouvert ; la liste d'attente ne bouge plus (plafond atteint)
    const rB = confirmer(jetonB);
    verifier("7a. B confirme : espace ouvert (200)", rB.succes === true, "code " + rB.code);
    if (rB.donnees) ids.push(rB.donnees.idUser);
    verifier("7b. C reste en liste d'attente", saasPiloteReleverAttente() === 0 && statut(C) === "LISTE_ATTENTE");

    // 8. Cycle quotidien complet
    feuille.getRange(trouver(B).ligne, SAAS_PILOTE_COL.FIN).setValue("2020-01-01 00:00:00");
    SAAS_PILOTE_JETON_TEST = "";
    saasPiloteCycleQuotidien();
    verifier("8. Cycle quotidien : B clos, C invité", statut(B) === "EXPIRE" && statut(C) === "EN_ATTENTE_CONFIRMATION" && /^[0-9a-f]{64}$/.test(SAAS_PILOTE_JETON_TEST));
    verifier("9. Simulation en lecture seule : n'écrit rien", (function () { const n = feuille.getLastRow(); const s = statut(C); saasPiloteCycleSimuler(); return feuille.getLastRow() === n && statut(C) === s; })());
  } catch (err) {
    Logger.log("  ❌ Exception pendant le test : " + err.message);
    ko++;
  } finally {
    try {
      const fu = ss.getSheetByName(SAAS_SHEET_UTILISATEURS);
      ids.forEach(function (id) {
        const u = saasTrouverUtilisateurParId(id);
        if (u) { fu.getRange(u.ligne, 9).setValue("NON"); saasPiloteDesactiverClient_(u.idClient); saasPiloteFermerSessions_(id); }
      });
      [A, B, C].forEach(function (m) { const t = trouver(m); if (t && !t.rang[SAAS_PILOTE_COL.NOTES - 1]) feuille.getRange(t.ligne, SAAS_PILOTE_COL.NOTES).setValue("TEST PIL4"); });
    } catch (err) {}
    nettoyerCache();
    SAAS_PILOTE_FORCER_AUTO = avant.auto; SAAS_PILOTE_FORCER_PLAFOND = avant.plafond;
    SAAS_PILOTE_ENVOI_MAILS = avant.mails; SAAS_PILOTE_ENVOI_FIN_ESSAI = avant.fin; SAAS_LIMITE_ALERTE_EMAIL = alerteAvant;
  }
  Logger.log("");
  Logger.log("=== RÉSULTAT : " + ok + " contrôle(s) réussi(s), " + ko + " échec(s) ===");
}
