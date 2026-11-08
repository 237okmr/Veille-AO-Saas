// >>> FICHIER : Verrou.gs <<< (à coller dans l'onglet du même nom)
/**
 * ============================================================================
 * VERROU D'ÉCRITURE PARTAGÉ — V1.0 (LOT 6b)
 * ============================================================================
 * RÔLE
 * ---------------------------------------------------------------------------
 * Garantit qu'UN SEUL traitement à la fois écrit dans le classeur parmi :
 * routine de nuit, routine du matin, session complète, envoi des alertes,
 * rattrapage de nuit du contrôle de santé.
 *
 * COMPORTEMENT (choix validé)
 * ---------------------------------------------------------------------------
 *   · Si le verrou est déjà pris : on ATTEND jusqu'à 2 minutes.
 *   · Si le verrou n'est toujours pas libre : le traitement est ABANDONNÉ
 *     (rien n'est écrit) et une alerte e-mail est envoyée à l'administrateur.
 *   · Un traitement qui tient déjà le verrou peut en appeler un autre sans se
 *     bloquer lui-même (ex. la routine du matin appelle l'envoi des alertes).
 *   · Le verrou est TOUJOURS relâché à la fin, même en cas d'erreur. Si Google
 *     interrompt une exécution (6 minutes), il le libère automatiquement.
 *
 * LIMITE (à connaître)
 * ---------------------------------------------------------------------------
 * Ce verrou coordonne les scripts de ce projet entre eux. Il ne peut pas
 * empêcher l'agent Spark d'écrire en même temps : c'est l'écriture ciblée de
 * Validation.gs (lot 6a) qui protège les lignes de Spark.
 *
 * TEST SANS RISQUE : verrouTesterVerrou()
 * ============================================================================
 */

const VERROU_DELAI_ATTENTE_MS = 120000;   // 2 minutes
var VERROU_DETENU_PAR_CETTE_EXECUTION = false;

/**
 * Exécute une fonction sous verrou.
 * @param {string} nomTraitement  libellé (pour le journal et l'alerte)
 * @param {Function} fonction     le traitement à exécuter
 * @param {Object} [options]
 *        delaiMs   : durée d'attente maximale (défaut 2 minutes)
 *        alerter   : false pour ne pas envoyer d'e-mail si le verrou reste occupé (défaut true)
 *        surOccupe : fonction appelée si le verrou reste occupé (ex. pour noter l'incident)
 *        fabriqueVerrou : réservé aux tests (fournit un faux verrou)
 *        alerte    : réservé aux tests (remplace l'envoi d'e-mail)
 * @return {Object} { execute: boolean, resultat: valeur renvoyée par la fonction }
 */
function verrouExecuter(nomTraitement, fonction, options) {
  const opt = options || {};
  const delai = (typeof opt.delaiMs === "number") ? opt.delaiMs : VERROU_DELAI_ATTENTE_MS;

  // Cette exécution tient déjà le verrou : on ne se bloque pas soi-même.
  if (VERROU_DETENU_PAR_CETTE_EXECUTION) {
    return { execute: true, resultat: fonction(), reentrant: true };
  }

  const verrou = opt.fabriqueVerrou ? opt.fabriqueVerrou() : LockService.getScriptLock();
  let obtenu = false;
  try {
    obtenu = verrou.tryLock(delai);
  } catch (e) {
    Logger.log("[VERROU] Erreur à l'obtention du verrou (" + nomTraitement + ") : " + e.message);
    obtenu = false;
  }

  if (!obtenu) {
    const message = "« " + nomTraitement + " » n'a pas pu démarrer : un autre traitement tient le verrou depuis plus de " +
                    Math.round(delai / 1000) + " secondes. Rien n'a été écrit.";
    Logger.log("[VERROU] " + message);
    if (typeof opt.surOccupe === "function") {
      try { opt.surOccupe(message); } catch (e1) {}
    }
    if (opt.alerter !== false) {
      try {
        if (typeof opt.alerte === "function") {
          opt.alerte("Verrou occupé — " + nomTraitement, message);
        } else if (typeof envoyerAlerteCritiqueImmediate === "function") {
          envoyerAlerteCritiqueImmediate("Verrou occupé — " + nomTraitement, message);
        }
      } catch (e2) {
        Logger.log("[VERROU] Alerte impossible : " + e2.message);
      }
    }
    return { execute: false, resultat: null };
  }

  VERROU_DETENU_PAR_CETTE_EXECUTION = true;
  try {
    return { execute: true, resultat: fonction() };
  } finally {
    VERROU_DETENU_PAR_CETTE_EXECUTION = false;
    try { verrou.releaseLock(); } catch (e3) {}
  }
}

/**
 * TEST DU LOT 6b — sans aucune écriture dans le classeur, sans e-mail.
 * Vérifie la logique du verrou avec de faux verrous, puis contrôle que le
 * vrai verrou n'est pas resté bloqué.
 */
function verrouTesterVerrou() {
  Logger.log("=================================================");
  Logger.log("=== TEST LOT 6b : VERROU D'ÉCRITURE ===");
  Logger.log("=================================================");

  let ok = 0, ko = 0;
  const verifier = function (nom, condition, detail) {
    Logger.log((condition ? "  ✅ " : "  ❌ ") + nom + (detail ? " — " + detail : ""));
    if (condition) ok++; else ko++;
  };
  const fauxVerrou = function (accepte) {
    const etat = { tentatives: 0, liberations: 0 };
    return {
      etat: etat,
      tryLock: function () { etat.tentatives++; return accepte; },
      releaseLock: function () { etat.liberations++; }
    };
  };

  // 1. Cas normal
  let f1 = fauxVerrou(true);
  let indicateurPendant = null;
  const r1 = verrouExecuter("Test normal", function () { indicateurPendant = VERROU_DETENU_PAR_CETTE_EXECUTION; return 42; },
    { fabriqueVerrou: function () { return f1; }, alerte: function () {} });
  verifier("1. Le traitement s'exécute et son résultat est renvoyé", r1.execute === true && r1.resultat === 42);
  verifier("1b. Le verrou est marqué détenu pendant, libéré après", indicateurPendant === true && VERROU_DETENU_PAR_CETTE_EXECUTION === false && f1.etat.liberations === 1);

  // 2. Appel imbriqué (la routine du matin appelle l'envoi)
  let f2 = fauxVerrou(true);
  let interieurExecute = false;
  verrouExecuter("Externe", function () {
    const interne = verrouExecuter("Interne", function () { interieurExecute = true; return "ok"; },
      { fabriqueVerrou: function () { return fauxVerrou(false); }, alerte: function () {} });
    interieurExecute = interieurExecute && interne.execute === true && interne.reentrant === true;
  }, { fabriqueVerrou: function () { return f2; }, alerte: function () {} });
  verifier("2. Un appel imbriqué ne se bloque pas lui-même", interieurExecute === true && f2.etat.liberations === 1);

  // 3. Verrou occupé : rien n'est exécuté, alerte + notification
  let f3 = fauxVerrou(false);
  let executeQuandOccupe = false;
  let alertes = [];
  let notes = [];
  const r3 = verrouExecuter("Test occupé", function () { executeQuandOccupe = true; },
    { fabriqueVerrou: function () { return f3; }, alerte: function (t, d) { alertes.push(t + " | " + d); }, surOccupe: function (m) { notes.push(m); } });
  verifier("3. Verrou occupé : le traitement n'est PAS exécuté", r3.execute === false && executeQuandOccupe === false);
  verifier("3b. Une alerte est déclenchée et l'incident est notifié", alertes.length === 1 && notes.length === 1 && alertes[0].indexOf("Test occupé") !== -1);
  verifier("3c. Aucune libération d'un verrou jamais obtenu", f3.etat.liberations === 0 && VERROU_DETENU_PAR_CETTE_EXECUTION === false);

  // 4. Verrou occupé avec alerter:false
  let alertes4 = [];
  verrouExecuter("Test sans alerte", function () {}, { fabriqueVerrou: function () { return fauxVerrou(false); }, alerter: false, alerte: function (t) { alertes4.push(t); } });
  verifier("4. alerter:false n'envoie aucune alerte", alertes4.length === 0);

  // 5. Erreur dans le traitement : le verrou est libéré et l'erreur remonte
  let f5 = fauxVerrou(true);
  let erreurRemontee = false;
  try {
    verrouExecuter("Test erreur", function () { throw new Error("panne simulée"); },
      { fabriqueVerrou: function () { return f5; }, alerte: function () {} });
  } catch (e) { erreurRemontee = (e.message === "panne simulée"); }
  verifier("5. Après une erreur : verrou libéré, marqueur remis à zéro, erreur remontée",
           erreurRemontee && f5.etat.liberations === 1 && VERROU_DETENU_PAR_CETTE_EXECUTION === false);

  // 6. Le vrai verrou n'est pas resté bloqué
  const reel = LockService.getScriptLock();
  const obtenuReel = reel.tryLock(3000);
  if (obtenuReel) reel.releaseLock();
  verifier("6. Le vrai verrou du projet est libre", obtenuReel === true);

  Logger.log("");
  Logger.log("=== RÉSULTAT : " + ok + " contrôle(s) réussi(s), " + ko + " échec(s) ===");
}