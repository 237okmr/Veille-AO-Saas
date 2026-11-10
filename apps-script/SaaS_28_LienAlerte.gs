/**
 * SaaS_28_LienAlerte.gs — LOT PIL5
 * 1. Lien de connexion à usage unique dans l'e-mail d'alerte du matin.
 * 2. Définition du premier mot de passe (compte pilote créé sans mot de passe).
 * 3. État du compte pour le front : mot de passe défini ? essai en cours ? profil à compléter ?
 *
 * Règles :
 *  - Un lien n'est émis que si l'interrupteur SAAS_LIEN_ACTIF vaut OUI (propriété du script).
 *  - Un lien n'est placé que dans un e-mail adressé à UNE seule personne, dont le compte CLIENT actif
 *    est rattaché au client de l'alerte. Plusieurs destinataires : aucun lien (il ouvrirait le compte de l'un d'eux).
 *  - Jamais de lien pour un compte ADMIN (saasLienEmettre le refuse).
 *  - Aucune clé, aucun secret dans le code. Aucune ligne supprimée.
 * Test (bac à sable uniquement) : saasLienAlerteTester
 */

// ---------------------------------------------------------------------------
// 1. LIEN DANS L'E-MAIL D'ALERTE
// ---------------------------------------------------------------------------

/** Vrai si les liens de connexion sont activés ET que l'onglet LIENS_CONNEXION existe. */
function eeLiensActifs() {
  if (!saasLienActif()) return false;
  return !!SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_LIENS);
}

/** Lecture seule : état des liens, pour les journaux. */
function eeEtatLiens() {
  const etat = {
    interrupteur: saasLienActif() ? "OUI" : "NON",
    onglet: !!SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_LIENS),
    adresseBase: saasLienUrlBase()
  };
  Logger.log("[LIEN-ALERTE] interrupteur=" + etat.interrupteur + " | onglet=" + (etat.onglet ? "présent" : "ABSENT") + " | base=" + etat.adresseBase);
  return etat;
}

/**
 * Émet un lien pour le groupe d'alerte si, et seulement si, il y a une seule adresse
 * et qu'elle correspond à un compte CLIENT actif de ce client.
 * @return {{idLien:string, url:string}|null}
 */
function eeEmettreLienPourGroupe(idClient, adresses) {
  try {
    if (!eeLiensActifs()) return null;
    if (!adresses || adresses.length !== 1) return null;
    const user = saasTrouverUtilisateurParEmail(adresses[0]);
    if (!user) return null;
    if (String(user.idClient) !== String(idClient)) return null;
    if (!saasLienDestinataireEligible(user).ok) return null;
    const lien = saasLienEmettre(user.idUser, "ALERTE", SAAS_LIEN_VALIDITE_ALERTE_HEURES);
    return lien ? { idLien: lien.idLien, url: lien.url } : null;
  } catch (err) {
    Logger.log("[LIEN-ALERTE] Lien non émis : " + err.message);
    return null;
  }
}

/** Marque le lien ENVOYE si l'e-mail est parti, ANNULE sinon. Ne lève jamais d'erreur. */
function eeFinaliserLien(lien, envoyeOk) {
  if (!lien || !lien.idLien) return;
  try {
    if (envoyeOk) saasLienConfirmerEnvoi(lien.idLien);
    else saasLienAnnuler(lien.idLien, "E-mail d'alerte non parti");
  } catch (err) {
    Logger.log("[LIEN-ALERTE] Statut du lien non mis à jour : " + err.message);
  }
}

/** Bloc HTML du bouton de connexion, ou chaîne vide s'il n'y a pas de lien. */
function eeConstruireBlocLien(lien) {
  if (!lien || !lien.url) return "";
  const href = eeLienSur(lien.url);
  if (!href) return "";
  return '<div style="margin: 16px 0 4px 0; padding: 14px; background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; text-align: center;">' +
    '<a href="' + href + '" style="display: inline-block; background-color: #0f766e; color: #ffffff; text-decoration: none; font-size: 14px; padding: 10px 18px; border-radius: 6px;">Ouvrir mon espace en un clic</a>' +
    '<p style="margin: 10px 0 0 0; font-size: 11px; color: #64748b;">Ce lien est personnel : il ne sert qu\'une fois et reste valable 7 jours. Ne le transférez pas.</p>' +
    '</div>';
}

// ---------------------------------------------------------------------------
// 2 et 3. ROUTES CLIENT : ÉTAT DU COMPTE ET PREMIER MOT DE PASSE
// ---------------------------------------------------------------------------

/** Infos d'essai pilote d'un client (lecture seule) : { estPilote, finEssai, joursRestants }. */
function saasPiloteInfoClient_(idClient) {
  const vide = { estPilote: false, finEssai: "", joursRestants: null };
  try {
    const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_DEMANDES_PILOTE);
    if (!feuille || feuille.getLastRow() < 2 || feuille.getLastColumn() < SAAS_PILOTE_COL.FIN) return vide;
    const data = feuille.getRange(2, 1, feuille.getLastRow() - 1, SAAS_PILOTE_COL.FIN).getValues();
    for (let i = data.length - 1; i >= 0; i--) {
      if (String(data[i][SAAS_PILOTE_COL.ID_CLIENT - 1]) !== String(idClient)) continue;
      if (String(data[i][SAAS_PILOTE_COL.STATUT - 1]).trim().toUpperCase() !== "ACTIF") continue;
      const fin = saasPiloteDateCellule_(data[i][SAAS_PILOTE_COL.FIN - 1]);
      const jours = fin ? Math.max(0, Math.ceil((fin.getTime() - Date.now()) / 86400000)) : null;
      return {
        estPilote: true,
        finEssai: fin ? Utilities.formatDate(fin, SAAS_FUSEAU, "yyyy-MM-dd") : "",
        joursRestants: jours
      };
    }
  } catch (err) {
    Logger.log("[PILOTE] Infos d'essai illisibles : " + err.message);
  }
  return vide;
}

function saasListeVide_(valeur) {
  if (Array.isArray(valeur)) return valeur.filter(function (x) { return String(x || "").trim(); }).length === 0;
  return String(valeur === null || valeur === undefined ? "" : valeur).trim() === "";
}

/**
 * GET /client/account/etat
 * @return {{aMotDePasse:boolean, pilote:{estPilote:boolean, finEssai:string, joursRestants:?number}, profilIncomplet:boolean}}
 */
function saasClientEtatCompte(user, e) {
  const pilote = saasPiloteInfoClient_(user.idClient);
  let profilIncomplet = false;
  if (pilote.estPilote) {
    const client = saasLireClientComplet(user.idClient);
    profilIncomplet = !!client && saasListeVide_(client.regions);
  }
  return saasReponse(true, {
    aMotDePasse: String(user.hash || "").length > 0 && String(user.sel || "").length > 0,
    pilote: pilote,
    profilIncomplet: profilIncomplet
  }, "État du compte.", 200);
}

/**
 * POST /client/account/mot-de-passe-initial
 * Body : { nouveauMotDePasse }
 * Réservé aux comptes sans mot de passe. Les autres passent par /client/account/password.
 */
function saasClientDefinirMotDePasse(payload, user, e) {
  const ip = saasExtraireIp(e);
  if (String(user.hash || "").length > 0 && String(user.sel || "").length > 0) {
    return saasErreur("Un mot de passe existe déjà. Utilisez « Changer le mot de passe » dans votre compte.", 409);
  }
  const mdp = String((payload && payload.nouveauMotDePasse) || "");
  if (!mdp) return saasErreur("Mot de passe requis.", 400);
  const motif = (typeof saasSecMotifMotDePasseFaible === "function")
    ? saasSecMotifMotDePasseFaible(mdp)
    : (saasMotDePasseValide(mdp) ? "" : "moins de 8 caractères");
  if (motif) return saasErreur("Mot de passe refusé : " + motif + ".", 400);

  const verrou = LockService.getScriptLock();
  try {
    verrou.waitLock(10000);
  } catch (err) {
    return saasErreur("Service momentanément occupé. Réessayez dans un instant.", 503);
  }
  try {
    // Relecture sous verrou : deux clics ne doivent pas écraser un mot de passe déjà posé.
    const frais = saasTrouverUtilisateurParId(user.idUser);
    if (!frais || (String(frais.hash || "").length > 0 && String(frais.sel || "").length > 0)) {
      return saasErreur("Un mot de passe existe déjà. Utilisez « Changer le mot de passe » dans votre compte.", 409);
    }
    const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_UTILISATEURS);
    const sel = saasGenererSel();
    feuille.getRange(frais.ligne, 3).setValue(saasHacherMotDePasse(mdp, sel));
    feuille.getRange(frais.ligne, 4).setValue(sel);
  } finally {
    verrou.releaseLock();
  }

  let sessionsFermees = 0;
  try { sessionsFermees = saasInvaliderAutresSessions(user.idUser, user.token); } catch (err) {}
  saasLogger(user.idUser, user.email, user.role, "PASSWORD_INITIAL", "Premier mot de passe défini (" + sessionsFermees + " autre(s) session(s) fermée(s))", ip, true);
  return saasReponse(true, { aMotDePasse: true }, "Mot de passe défini. Vous pouvez désormais vous connecter avec votre e-mail et ce mot de passe.", 200);
}

// ---------------------------------------------------------------------------
// TEST (bac à sable uniquement)
// ---------------------------------------------------------------------------

/**
 * TEST PIL5 — lien dans l'alerte, premier mot de passe, état du compte.
 * Fichier : SaaS_28_LienAlerte.gs — fonction : saasLienAlerteTester
 * Écrit dans CLIENTS, UTILISATEURS, PREFERENCES, LIENS_CONNEXION, SESSIONS, AUDIT_LOG (aucune ligne supprimée).
 * Aucun e-mail n'est envoyé. Refuse de tourner hors bac à sable.
 */
function saasLienAlerteTester() {
  Logger.log("=================================================");
  Logger.log("=== TEST PIL5 : LIEN DANS L'ALERTE, MOT DE PASSE, ÉTAT ===");
  Logger.log("=================================================");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const autorise = /sandbox|bac/i.test(ss.getName()) ||
                   String(PropertiesService.getScriptProperties().getProperty("SAAS_TEST_AUTORISE") || "").toUpperCase() === "OUI";
  if (!autorise) { Logger.log("❌ TEST ANNULÉ : ce classeur (« " + ss.getName() + " ») n'est pas un bac à sable. Rien n'a été écrit."); return; }
  if (!ss.getSheetByName(SAAS_SHEET_LIENS)) { Logger.log("❌ TEST ANNULÉ : onglet LIENS_CONNEXION absent (saasLienInitialiserOnglet)."); return; }

  let ok = 0, ko = 0;
  const verifier = function (nom, condition, detail) {
    Logger.log((condition ? "  ✅ " : "  ❌ ") + nom + (detail ? " — " + detail : ""));
    if (condition) ok++; else ko++;
  };
  const evt = { parameter: { ip: "203.0.113.77" }, headers: {} };
  const json = function (sortie) { return JSON.parse(sortie.getContent()); };
  const avant = SAAS_LIEN_FORCER;
  const stamp = Date.now();
  const email = "test.pil5." + stamp + "@example.com";
  const emailB = "test.pil5b." + stamp + "@example.com";
  let ids = null;

  try {
    SAAS_LIEN_FORCER = true;
    ids = saasPiloteCreerEspace_({ nom: "Test Pil5", entreprise: "Entreprise Pil5 " + stamp, email: email, secteur: "BTP" });
    verifier("1. Espace de test créé (compte sans mot de passe)", !!ids.idUser && !!ids.idClient, ids.idUser);

    // --- Lien dans l'alerte ---
    const l1 = eeEmettreLienPourGroupe(ids.idClient, [email]);
    verifier("2. Une seule adresse du bon client : un lien est émis", !!l1 && /#acces=[0-9a-f]{64}$/.test(l1.url), l1 ? l1.idLien : "aucun lien");
    verifier("3. Deux adresses : aucun lien", eeEmettreLienPourGroupe(ids.idClient, [email, emailB]) === null);
    verifier("4. Mauvais client : aucun lien", eeEmettreLienPourGroupe("CLI_AUTRE", [email]) === null);
    verifier("5. Adresse inconnue : aucun lien", eeEmettreLienPourGroupe(ids.idClient, [emailB]) === null);
    const bloc = eeConstruireBlocLien(l1);
    verifier("6. Bloc HTML : bouton avec le lien, texte d'usage unique", bloc.indexOf(l1.url) > -1 && /ne sert qu'une fois/.test(bloc) && bloc.indexOf("undefined") === -1);
    verifier("7. Sans lien : bloc vide", eeConstruireBlocLien(null) === "");
    eeFinaliserLien(l1, true);
    const rapport = saasLienRapport();
    verifier("8. E-mail parti : le lien passe ENVOYE", !!rapport && Number(rapport.ENVOYE) >= 1, JSON.stringify(rapport));
    const l2 = eeEmettreLienPourGroupe(ids.idClient, [email]);
    eeFinaliserLien(l2, false);
    verifier("9. E-mail non parti : le lien est ANNULE", saasLienTrouverLigneParId(l2.idLien) > 0 &&
      String(ss.getSheetByName(SAAS_SHEET_LIENS).getRange(saasLienTrouverLigneParId(l2.idLien), SAAS_LIEN_COL.STATUT).getValue()) === "ANNULE");

    // --- Clic sur le lien : connexion, sans mot de passe défini ---
    const jeton = l1.url.split("#acces=")[1];
    const rLien = json(saasAuthLien({ jeton: jeton }, evt));
    verifier("10. Le lien ouvre une session CLIENT, aMotDePasse = false", rLien.succes === true && rLien.donnees.role === "CLIENT" && rLien.donnees.aMotDePasse === false, "code " + rLien.code);
    const rRejeu = json(saasAuthLien({ jeton: jeton }, evt));
    verifier("11. Le même lien ne sert pas deux fois", rRejeu.succes === false && rRejeu.code === 401);

    // --- État du compte ---
    const user1 = saasAuthGetCurrentUser(null, { token: rLien.donnees.token });
    verifier("12. Session retrouvée à partir du jeton", !!user1 && user1.idUser === ids.idUser);
    const etat1 = json(saasClientEtatCompte(user1, evt));
    verifier("13. État : pas de mot de passe ; espace hors demande pilote, donc ni essai ni bandeau profil",
      etat1.succes && etat1.donnees.aMotDePasse === false && etat1.donnees.pilote.estPilote === false && etat1.donnees.profilIncomplet === false,
      JSON.stringify(etat1.donnees));

    // --- Premier mot de passe ---
    const faible = json(saasClientDefinirMotDePasse({ nouveauMotDePasse: "court1" }, user1, evt));
    verifier("14. Mot de passe faible refusé (400)", faible.succes === false && faible.code === 400, faible.message);
    const sans = json(saasClientDefinirMotDePasse({}, user1, evt));
    verifier("15. Mot de passe absent refusé (400)", sans.succes === false && sans.code === 400);
    const bon = json(saasClientDefinirMotDePasse({ nouveauMotDePasse: "Pil5-Essai-" + stamp }, user1, evt));
    verifier("16. Mot de passe solide accepté (200)", bon.succes === true && bon.code === 200, bon.message);
    const user2 = saasTrouverUtilisateurParId(ids.idUser);
    verifier("17. Hash et sel écrits", !!user2 && user2.hash.length > 0 && user2.sel.length > 0);
    const deux = json(saasClientDefinirMotDePasse({ nouveauMotDePasse: "Autre-Essai-" + stamp }, user1, evt));
    verifier("18. Second appel refusé (409), mot de passe inchangé", deux.succes === false && deux.code === 409);
    const rLogin = json(saasAuthLogin({ email: email, motDePasse: "Pil5-Essai-" + stamp }, evt));
    verifier("19. Connexion par e-mail et mot de passe fonctionne", rLogin.succes === true && !!rLogin.donnees.token, "code " + rLogin.code);
    const userN = saasAuthGetCurrentUser(null, { token: rLogin.donnees.token });
    const etat2 = json(saasClientEtatCompte(userN, evt));
    verifier("20. État : aMotDePasse = true", etat2.succes && etat2.donnees.aMotDePasse === true);

    // --- Interrupteur coupé ---
    SAAS_LIEN_FORCER = false;
    verifier("21. Interrupteur coupé : aucun lien émis", eeEmettreLienPourGroupe(ids.idClient, [email]) === null && eeLiensActifs() === false);
  } catch (err) {
    verifier("Exécution sans exception", false, err.message);
  } finally {
    SAAS_LIEN_FORCER = avant;
    // Nettoyage : le compte et le client de test sont désactivés (rien n'est supprimé).
    try {
      if (ids) {
        const u = saasTrouverUtilisateurParId(ids.idUser);
        if (u) ss.getSheetByName(SAAS_SHEET_UTILISATEURS).getRange(u.ligne, 9).setValue("NON");
        const fc = ss.getSheetByName("CLIENTS");
        const h = saasLireHeader(fc);
        const colId = h.indexOf("ID_CLIENT"), colActif = h.indexOf("ACTIF");
        if (colId > -1 && colActif > -1) {
          const dc = fc.getDataRange().getValues();
          for (let i = 1; i < dc.length; i++) {
            if (String(dc[i][colId]) === String(ids.idClient)) { fc.getRange(i + 1, colActif + 1).setValue("NON"); break; }
          }
        }
        saasPiloteFermerSessions_(ids.idUser);
      }
    } catch (errNet) {
      Logger.log("Nettoyage partiel : " + errNet.message);
    }
  }
  Logger.log("-------------------------------------------------");
  Logger.log("RÉSULTAT : " + ok + " réussi(s), " + ko + " échec(s).");
  Logger.log(ko === 0 ? "✅ TOUS LES CONTRÔLES PASSENT" : "❌ DES CONTRÔLES ÉCHOUENT");
  return { ok: ok, ko: ko };
}

// ---------------------------------------------------------------------------
// RACCOURCIS DE CONTRÔLE (lecture seule) : à sélectionner dans la barre d'outils de ce fichier
// ---------------------------------------------------------------------------

/** Contrôle de santé du projet (lecture seule) : appelle saasVerifierIntegriteFichiers. */
function saasLot5ControleSante() {
  return saasVerifierIntegriteFichiers();
}

/** Simulation d'envoi des alertes : aucun e-mail, aucune écriture (appelle eeTesterEnvoiSecurise). */
function saasLot5SimulerEnvoi() {
  return eeTesterEnvoiSecurise();
}
