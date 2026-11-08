// >>> FICHIER : SecuriteDonnees.gs <<< (NOUVEAU fichier : à créer dans l'éditeur Apps Script, avec ce nom exact)
/**
 * ============================================================================
 * SÉCURITÉ DES DONNÉES — ÉCHAPPEMENT HTML ET NEUTRALISATION DES FORMULES (V1.1 — LOTS S1a / S1b)
 * ============================================================================
 * POURQUOI CE FICHIER
 * ---------------------------------------------------------------------------
 * Certains textes viennent de l'extérieur : titres d'avis publiés par l'ARMP ou
 * les sources, réponses de l'IA, adresse saisie sur l'écran de connexion, noms
 * saisis par les clients. Deux risques :
 *   1. HTML : inséré tel quel dans un e-mail, un texte peut casser la mise en page
 *      ou cacher un lien trompeur. Fonctions : secEchapperHtml, secLienSur.
 *   2. Formules : écrit tel quel dans une cellule, un texte qui commence par
 *      = + - ou @ est interprété par Google Sheets comme une FORMULE (par exemple
 *      =IMPORTXML(...) peut envoyer des données vers l'extérieur à l'ouverture
 *      du classeur). Fonctions : secNeutraliserFormule, secNeutraliserLigne.
 *      Le texte est alors précédé d'une apostrophe, que Sheets n'affiche pas
 *      (même procédé que les dates déjà écrites avec « ' » dans ce projet).
 *
 * CE FICHIER N'ÉCRIT RIEN ET N'ENVOIE RIEN. Aucune clé, aucune feuille modifiée.
 *
 * TESTS SANS RISQUE (aucune écriture, aucun e-mail) :
 *   secTesterSecuriteDonnees()       → vérifie les fonctions avec des textes simulés
 *   secAuditerFormulesSuspectes()    → LECTURE SEULE : repère les formules présentes
 *                                      dans les feuilles de données (qui n'en
 *                                      contiennent normalement aucune)
 *   secTesterLotS1b()                → vérifie, avec des textes simulés, les e-mails
 *                                      d'alerte administrateur, l'export CSV client et
 *                                      la réécriture de la validation (aucune écriture
 *                                      dans une vraie feuille, aucun e-mail)
 *
 * UTILISATEURS DE CE FICHIER (ils en dépendent) : EnvoiEmails.gs, SaaS_01_Utils.gs,
 * Reporting.gs, Monitoring.gs, Collecteur_ARMP.gs, Validation.gs, MatchingClients.gs,
 * IA_ProfilGen.gs, SaaS_02_Auth.gs, SaaS_10_Client.gs, SaaS_11_Alerts.gs, SaaS_20_Admin.gs,
 * Dashboard.gs. Ne pas supprimer ni renommer ce fichier.
 * ============================================================================
 */

/**
 * Échappe un texte pour l'insérer dans du HTML (contenu ou attribut).
 */
function secEchapperHtml(texte) {
  return String(texte === null || texte === undefined ? "" : texte)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Valide une adresse de lien pour un attribut href. Renvoie l'adresse prête à être
 * insérée dans le HTML (échappée), ou "" si elle n'est pas sûre.
 * Acceptées : http:// et https:// uniquement, sans espace, guillemet, chevron
 * ni antislash.
 */
function secLienSur(url) {
  const u = String(url === null || url === undefined ? "" : url).trim();
  if (!/^https?:\/\/[^\s"'<>`\\]+$/i.test(u)) return "";
  return secEchapperHtml(u);
}

/**
 * Neutralise une valeur destinée à une cellule : une chaîne qui commence par
 * = + - @ (éventuellement après des espaces) ou par une tabulation / un retour
 * chariot reçoit une apostrophe devant. Les nombres, dates, booléens et valeurs
 * vides sont renvoyés tels quels.
 */
function secNeutraliserFormule(valeur) {
  if (typeof valeur !== "string") return valeur;
  if (valeur === "") return valeur;
  if (/^\s*[=+\-@]/.test(valeur) || /^[\t\r]/.test(valeur)) return "'" + valeur;
  return valeur;
}

/**
 * Neutralise toutes les chaînes d'une ligne (tableau) avant appendRow / setValues.
 */
function secNeutraliserLigne(ligne) {
  if (!Array.isArray(ligne)) return ligne;
  return ligne.map(secNeutraliserFormule);
}

// ---------------------------------------------------------------------------
// TEST — AUCUNE ÉCRITURE, AUCUN E-MAIL
// ---------------------------------------------------------------------------

function secTesterSecuriteDonnees() {
  let ok = 0;
  let ko = 0;
  const verifier = function (nom, condition) {
    if (condition) { ok++; Logger.log("✅ " + nom); } else { ko++; Logger.log("❌ " + nom); }
  };

  // 1. Échappement HTML
  verifier("« < > » sont échappés", secEchapperHtml("<script>alert(1)</script>") === "&lt;script&gt;alert(1)&lt;/script&gt;");
  verifier("« & » est échappé", secEchapperHtml("Fourniture & pose") === "Fourniture &amp; pose");
  verifier("guillemets et apostrophe sont échappés", secEchapperHtml("a\"b'c") === "a&quot;b&#39;c");
  verifier("valeurs vides : chaîne vide", secEchapperHtml(null) === "" && secEchapperHtml(undefined) === "");
  verifier("un nombre devient du texte", secEchapperHtml(42) === "42");

  // 2. Liens
  verifier("lien https accepté", secLienSur("https://www.armp.cm/details?type_publication=AONO&id_publication=1") ===
    "https://www.armp.cm/details?type_publication=AONO&amp;id_publication=1");
  verifier("lien http accepté", secLienSur("http://pridesoft.armp.cm//0903_dao_dl?x=1") === "http://pridesoft.armp.cm//0903_dao_dl?x=1");
  verifier("javascript: refusé", secLienSur("javascript:alert(1)") === "");
  verifier("data: refusé", secLienSur("data:text/html;base64,AAAA") === "");
  verifier("lien avec guillemet refusé", secLienSur("https://exemple.cm/a\"onmouseover=\"x") === "");
  verifier("lien avec espace refusé", secLienSur("https://exemple.cm/a b") === "");
  verifier("lien vide refusé", secLienSur("") === "" && secLienSur(null) === "");

  // 3. Formules
  verifier("=formule neutralisée", secNeutraliserFormule("=IMPORTXML(\"http://x\",\"//a\")") === "'=IMPORTXML(\"http://x\",\"//a\")");
  verifier("+ initial neutralisé", secNeutraliserFormule("+237699000000") === "'+237699000000");
  verifier("- initial neutralisé", secNeutraliserFormule("-5+3") === "'-5+3");
  verifier("@ initial neutralisé", secNeutraliserFormule("@SUM(1)") === "'@SUM(1)");
  verifier("espaces puis = neutralisés", secNeutraliserFormule("  =1+1") === "'  =1+1");
  verifier("texte normal inchangé", secNeutraliserFormule("Fourniture de bureau") === "Fourniture de bureau");
  verifier("= au milieu : inchangé", secNeutraliserFormule("a=b") === "a=b");
  verifier("déjà préfixé : inchangé", secNeutraliserFormule("'=x") === "'=x");
  verifier("nombre inchangé", secNeutraliserFormule(123) === 123);
  verifier("null inchangé", secNeutraliserFormule(null) === null);
  verifier("chaîne vide inchangée", secNeutraliserFormule("") === "");
  const d = new Date(2026, 9, 1);
  verifier("date inchangée", secNeutraliserFormule(d) === d);
  const l = secNeutraliserLigne(["ID", "=1+1", 5, "ok"]);
  verifier("ligne : seules les chaînes dangereuses changent", l[0] === "ID" && l[1] === "'=1+1" && l[2] === 5 && l[3] === "ok");

  // 4. Fonction équivalente du journal d'audit (SaaS_01_Utils.gs)
  if (typeof saasNeutraliserCellule === "function") {
    verifier("journal d'audit : =formule neutralisée", saasNeutraliserCellule("=HYPERLINK(\"http://x\")") === "'=HYPERLINK(\"http://x\")");
    verifier("journal d'audit : texte normal inchangé", saasNeutraliserCellule("Connexion réussie") === "Connexion réussie");
  } else {
    Logger.log("ℹ️ saasNeutraliserCellule absente (SaaS_01_Utils.gs V1.2 non installé) : vérification ignorée.");
  }

  Logger.log("=== RÉSULTAT : " + ok + " réussi(s), " + ko + " échec(s) ===");
  if (ko > 0) throw new Error(ko + " vérification(s) en échec (voir le journal).");
}

// ---------------------------------------------------------------------------
// AUDIT EN LECTURE SEULE DES FORMULES PRÉSENTES DANS LES FEUILLES DE DONNÉES
// ---------------------------------------------------------------------------

const SEC_FEUILLES_A_AUDITER = [
  "TOUS_AO", "AUDIT_LOG", "CLIENTS", "UTILISATEURS", "SESSIONS", "ALERTES_A_ENVOYER",
  "CACHE_IA", "PROFILS_ENRICHIS", "PREFERENCES_CLIENT", "SUIVI_AVIS", "NOTES_AVIS",
  "RECHERCHES_SAUVEGARDEES", "ALERTES_USER_STATE", "JOURNAL_MONITORING"
];

/**
 * LECTURE SEULE : parcourt les feuilles de données et signale toute cellule qui
 * contient une formule (elles ne devraient en contenir aucune). N'écrit rien,
 * ne modifie rien. Affiche au plus 5 exemples par feuille (80 premiers caractères).
 * @return {number} nombre total de formules trouvées
 */
function secAuditerFormulesSuspectes() {
  Logger.log("=================================================");
  Logger.log("=== AUDIT DES FORMULES (lecture seule) ===");
  Logger.log("Fichier : " + SpreadsheetApp.getActiveSpreadsheet().getName());
  Logger.log("=================================================");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let total = 0;

  SEC_FEUILLES_A_AUDITER.forEach(function (nom) {
    const feuille = ss.getSheetByName(nom);
    if (!feuille) { Logger.log("· " + nom + " : feuille absente (ignorée)."); return; }

    const nbLignes = feuille.getLastRow();
    const nbColonnes = feuille.getLastColumn();
    if (nbLignes < 1 || nbColonnes < 1) { Logger.log("· " + nom + " : vide."); return; }

    const formules = feuille.getRange(1, 1, nbLignes, nbColonnes).getFormulas();
    let compte = 0;
    const exemples = [];
    for (let i = 0; i < formules.length; i++) {
      for (let j = 0; j < formules[i].length; j++) {
        const f = formules[i][j];
        if (f !== "") {
          compte++;
          if (exemples.length < 5) {
            exemples.push(feuille.getRange(i + 1, j + 1).getA1Notation() + " : " + String(f).substring(0, 80));
          }
        }
      }
    }

    if (compte === 0) {
      Logger.log("✅ " + nom + " : aucune formule (" + nbLignes + " ligne(s) lues).");
    } else {
      Logger.log("⚠️ " + nom + " : " + compte + " formule(s) trouvée(s).");
      exemples.forEach(function (x) { Logger.log("     " + x); });
    }
    total += compte;
  });

  Logger.log("=== FIN : " + total + " formule(s) au total" + (total === 0 ? " ✅" : " ⚠️ à examiner") + " ===");
  return total;
}

// ---------------------------------------------------------------------------
// TEST LOT S1b — AUCUNE ÉCRITURE DANS UNE VRAIE FEUILLE, AUCUN E-MAIL
// ---------------------------------------------------------------------------

/**
 * Vérifie avec des textes simulés (hostiles) :
 *   1. le corps de l'alerte critique administrateur (Reporting.gs) ;
 *   2. l'e-mail d'anomalies critiques (Monitoring.gs) ;
 *   3. la cellule du CSV d'export client (SaaS_11_Alerts.gs) ;
 *   4. la réécriture de la normalisation (Validation.gs), sur une FAUSSE feuille en mémoire.
 * Aucun e-mail n'est envoyé et aucune feuille du classeur n'est modifiée.
 */
function secTesterLotS1b() {
  let ok = 0;
  let ko = 0;
  const verifier = function (nom, condition) {
    if (condition) { ok++; Logger.log("✅ " + nom); } else { ko++; Logger.log("❌ " + nom); }
  };
  const hostile = "<script>alert(1)</script><img src=x onerror=1>";

  // 1. Alerte critique administrateur
  if (typeof rpConstruireCorpsAlerteCritique === "function") {
    const env = { nomFichier: "Hub <prod>", libelle: "PRODUCTION", estTest: false };
    const corps = rpConstruireCorpsAlerteCritique("Panne <b>nuit</b>", hostile + " client \"X\" & Fils", env, "", "02/10/2026 10:00:00");
    verifier("alerte admin : aucune balise <script> ni <img>", !/<script|<img/i.test(corps));
    verifier("alerte admin : le détail reste lisible (échappé)", corps.indexOf("&lt;script&gt;alert(1)&lt;/script&gt;") !== -1);
    verifier("alerte admin : le type d'incident est échappé", corps.indexOf("Panne &lt;b&gt;nuit&lt;/b&gt;") !== -1 && corps.indexOf("<b>nuit</b>") === -1);
    verifier("alerte admin : le nom du fichier est échappé", corps.indexOf("Hub &lt;prod&gt;") !== -1);
  } else {
    verifier("Reporting.gs V3.2 installé (rpConstruireCorpsAlerteCritique)", false);
  }

  // 2. E-mail d'anomalies critiques (Monitoring)
  if (typeof mtConstruireEmailCritique === "function") {
    const html = mtConstruireEmailCritique({ critiques: [hostile], avertissements: ["<i>avert</i>"] }, 7);
    verifier("monitoring : anomalie échappée", !/<script|<img/i.test(html) && html.indexOf("&lt;script&gt;") !== -1);
    verifier("monitoring : avertissement échappé", html.indexOf("<i>avert</i>") === -1 && html.indexOf("&lt;i&gt;avert&lt;/i&gt;") !== -1);
    verifier("monitoring : mise en page conservée (<ul>, <li>)", html.indexOf("<ul") !== -1 && html.indexOf("<li") !== -1);
  } else {
    verifier("Monitoring.gs V1.2 installé (mtConstruireEmailCritique)", false);
  }

  // 3. CSV d'export client
  if (typeof saasAlertsCsvCellule === "function") {
    verifier("CSV client : =formule neutralisée", saasAlertsCsvCellule("=cmd|' /C calc'!A0") === "\"'=cmd|' /C calc'!A0\"");
    verifier("CSV client : + initial neutralisé", saasAlertsCsvCellule("+237699000000") === "\"'+237699000000\"");
    verifier("CSV client : - initial neutralisé", saasAlertsCsvCellule("-5 lots") === "\"'-5 lots\"");
    verifier("CSV client : @ initial neutralisé", saasAlertsCsvCellule("@SUM(1)") === "\"'@SUM(1)\"");
    verifier("CSV client : espaces puis = neutralisés", saasAlertsCsvCellule("  =1+1") === "\"'  =1+1\"");
    verifier("CSV client : texte normal inchangé", saasAlertsCsvCellule("Fourniture de bureau") === "\"Fourniture de bureau\"");
    verifier("CSV client : guillemets internes doublés", saasAlertsCsvCellule("dit \"oui\"") === "\"dit \"\"oui\"\"\"");
    verifier("CSV client : vide et nombre", saasAlertsCsvCellule(null) === "\"\"" && saasAlertsCsvCellule(4.2) === "\"4.2\"");
    verifier("CSV client : date déjà préfixée non doublée", saasAlertsCsvCellule("'30-10-2026") === "\"'30-10-2026\"");
  } else {
    verifier("SaaS_11_Alerts.gs V1.2 installé (saasAlertsCsvCellule)", false);
  }

  // 4. Réécriture de la validation sur une fausse feuille (en mémoire)
  if (typeof val2EcrireModifications === "function") {
    const ecrit = [];
    const fausseFeuille = {
      getLastRow: function () { return 2; },
      getRange: function (r, c, nr, nc) {
        return {
          getValues: function () { return [["ID"], ["A1"]].slice(r - 1, r - 1 + (nr || 1)); },
          setValues: function (v) { ecrit.push(v[0]); }
        };
      }
    };
    val2EcrireModifications(fausseFeuille, [{ row: 2, id: "A1", cellules: [
      { col: 6, valeur: "=HYPERLINK(\"http://exemple.test\")" }, { col: 7, valeur: "-5 lots" }, { col: 11, valeur: "5 000 FCFA" }
    ] }]);
    const aplati = [].concat.apply([], ecrit);
    verifier("validation : formule neutralisée à la réécriture", aplati.indexOf("'=HYPERLINK(\"http://exemple.test\")") !== -1);
    verifier("validation : « -5 lots » neutralisé, texte normal inchangé", aplati.indexOf("'-5 lots") !== -1 && aplati.indexOf("5 000 FCFA") !== -1);
  } else {
    verifier("Validation.gs V2.8 installé (val2EcrireModifications)", false);
  }

  Logger.log("=== RÉSULTAT : " + ok + " réussi(s), " + ko + " échec(s) ===");
  if (ko > 0) throw new Error(ko + " vérification(s) en échec (voir le journal).");
}