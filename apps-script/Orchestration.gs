// >>> FICHIER : Orchestration.gs <<< (à coller dans l'onglet du même nom)
/**
 * ============================================================================
 * ÉTAPE 4 : ORCHESTRATION DU PIPELINE MULTI-SOURCES & MONITORING (V2.9)
 * ============================================================================
 * NOUVEAUTÉS V2.9 (LOT 6b — verrou d'écriture)
 * ---------------------------------------------------------------------------
 *   • Les routines de nuit, du matin et la session complète s'exécutent sous
 *     verrou (Verrou.gs) : un seul traitement écrit à la fois. Si le verrou reste
 *     occupé plus de 2 minutes, la routine est abandonnée SANS RIEN ÉCRIRE et
 *     une alerte e-mail est envoyée.
 *   • Les noms des fonctions appelées par les déclencheurs sont inchangés.
 *   • Si Verrou.gs est absent, les routines s'exécutent comme avant (sans verrou).
 *
 * NOUVEAUTÉS V2.8 (LOT 3 — rattrapage du matin)
 * ---------------------------------------------------------------------------
 *   • AVANT l'envoi des e-mails, la routine du matin traite les avis restés au
 *     statut NOUVEAU (ex. lignes de Spark arrivées après la nuit, ou nuit
 *     interrompue) : déduplication, validation, matching.
 *   • Limité à 150 secondes pour laisser le temps à l'envoi (limite Google : 6 min).
 *   • Un échec du rattrapage n'empêche JAMAIS l'envoi des alertes déjà prêtes.
 *   • Si la nuit était interrompue ou en échec et que le rattrapage a tout
 *     traité, l'état de nuit passe à REPRISE_OK (le contrôle de santé de 09h
 *     n'a alors plus rien à rattraper).
 *
 * NOUVEAUTÉS V2.7 (LOT 2 — nuit robuste)
 * ---------------------------------------------------------------------------
 *   • La routine de nuit inscrit son état dans une mémoire PERSISTANTE
 *     (EN_COURS -> TERMINEE ou ECHEC). Si Google coupe la nuit (6 min), l'état
 *     reste EN_COURS : le matin et le contrôle de santé (SanteQuotidienne.gs)
 *     la reconnaissent comme INTERROMPUE.
 *   • La routine du matin signale une nuit interrompue ou absente.
 *   • Durée de session corrigée : le matin mesure sa propre durée (avant, elle
 *     comptait depuis le début de la nuit : environ 18 500 s dans le journal).
 *
 * NOUVEAUTÉS V2.6
 * ---------------------------------------------------------------------------
 *   • DÉDUPLICATION CROSS-SOURCE intégrée au pipeline complet.
 *     Après la collecte multi-sources (ARMP + Spark/COLEPS/BAD/ONU) et AVANT
 *     la validation, un appel à dedupExecuterPostCollecte() détecte les
 *     doublons entre sources (ex : ARMP_65110 == COLEPS-24-09-26-1200-01).
 *
 *     Auparavant, seuls les avis ARMP étaient dédupliqués (via
 *     Collecteur_ARMP.dedupliquerAvisRecents). Les avis Spark pouvaient
 *     rester en doublon jusqu'à la session suivante.
 *
 *   • Ajouté dans les 3 points d'entrée du pipeline complet :
 *       - routineNuit_CollecteEtMatching
 *       - lancerRoutineVeilleQuotidienneComplete
 *       - testerOrchestrationSansEmail
 *
 * RAPPEL V2.5
 * ---------------------------------------------------------------------------
 *   • La routine du matin n'annule plus l'envoi quand la nuit a échoué
 *   • Les heures des déclencheurs (H6/H7) lues avec getDisplayValue()
 *   • Sources COLEPS/DevelopmentAid/BAD/ONU alimentées par Spark
 *   • Constantes préfixées ORCH_
 * ============================================================================
 */

const ORCH_CELL_HEURE_NUIT  = "H6";
const ORCH_CELL_HEURE_MATIN = "H7";

const ORCH_PROP_METRIQUES = "METRIQUES_SESSION_VEILLE";
const ORCH_PROP_ETAPE     = "ETAPE_PIPELINE_VEILLE";
const ORCH_PROP_NUIT_ETAT = "ETAT_NUIT_PERSISTANT";
const ORCH_FUSEAU         = "Africa/Douala";
const ORCH_BUDGET_RATTRAPAGE_MATIN_MS = 150000;   // durée maximale du rattrapage du matin

/**
 * Compte les avis au statut NOUVEAU dans TOUS_AO (lecture seule).
 */
function orchCompterAvisNouveaux() {
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_AO);
  if (!feuille) return 0;
  const data = feuille.getDataRange().getValues();
  let n = 0;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][14] || "").trim().toUpperCase() === "NOUVEAU") n++;
  }
  return n;
}

/**
 * V2.8 — Rattrapage du matin : traite les avis NOUVEAU avant l'envoi.
 * N'envoie aucun e-mail. Ne lève jamais d'exception (l'envoi doit toujours avoir lieu).
 * @param {Object} metriques métriques de session (alimentées par le matching)
 * @param {Object} options   { simulation: true } = compte seulement, ne touche à rien
 * @return {Object} { ok, avant, apres, erreurs[], simulation }
 */
function orchRattraperAvisNouveaux(metriques, options) {
  const simulation = !!(options && options.simulation);
  const resultat = { ok: true, avant: 0, apres: 0, erreurs: [], simulation: simulation };

  try {
    resultat.avant = orchCompterAvisNouveaux();
    resultat.apres = resultat.avant;
  } catch (e) {
    resultat.ok = false;
    resultat.erreurs.push("comptage : " + e.message);
    return resultat;
  }

  if (resultat.avant === 0) {
    Logger.log("[RATTRAPAGE MATIN] Aucun avis NOUVEAU : rien à rattraper.");
    return resultat;
  }
  if (simulation) {
    Logger.log("[RATTRAPAGE MATIN] SIMULATION : " + resultat.avant + " avis NOUVEAU seraient traités (déduplication, validation, matching).");
    return resultat;
  }

  Logger.log("[RATTRAPAGE MATIN] " + resultat.avant + " avis NOUVEAU à traiter avant l'envoi.");

  // Le matching s'arrête de lui-même MC_BUDGET_TEMPS_MS après metriques.debut.
  // On antidate temporairement le début pour limiter le rattrapage à 150 s.
  const budgetMatching = (typeof MC_BUDGET_TEMPS_MS !== "undefined") ? MC_BUDGET_TEMPS_MS : 270000;
  const marge = Math.max(0, budgetMatching - ORCH_BUDGET_RATTRAPAGE_MATIN_MS);
  const debutReel = metriques.debut;
  metriques.debut = new Date(new Date().getTime() - marge);

  const etapes = [
    { nom: "déduplication", fn: function () { executerDeduplicationCrossSource(metriques); } },
    { nom: "validation", fn: function () { if (typeof validerEntreesNouvelles === "function") validerEntreesNouvelles(metriques); } },
    { nom: "matching", fn: function () {
        if (typeof executerMatchingClients !== "function") throw new Error("executerMatchingClients introuvable");
        executerMatchingClients(metriques);
      } }
  ];

  try {
    etapes.forEach(function (etape) {
      try {
        Logger.log("[RATTRAPAGE MATIN] " + etape.nom + "...");
        etape.fn();
      } catch (e) {
        resultat.ok = false;
        resultat.erreurs.push(etape.nom + " : " + e.message);
        Logger.log("[RATTRAPAGE MATIN] Échec " + etape.nom + " : " + e.message);
      }
    });
  } finally {
    metriques.debut = debutReel;
  }

  try { resultat.apres = orchCompterAvisNouveaux(); } catch (e) { resultat.apres = resultat.avant; }
  Logger.log("[RATTRAPAGE MATIN] Terminé : avis NOUVEAU " + resultat.avant + " -> " + resultat.apres +
             (resultat.erreurs.length ? " | erreurs : " + resultat.erreurs.join(" ; ") : ""));
  return resultat;
}

/**
 * Jour courant (aaaa-MM-jj) sur le fuseau Africa/Douala.
 */
function orchJourDouala(date) {
  return Utilities.formatDate(date || new Date(), ORCH_FUSEAU, "yyyy-MM-dd");
}

/**
 * Lit l'état persistant de la dernière nuit (objet) ou null.
 * Contrairement à ORCH_PROP_ETAPE, il n'est JAMAIS effacé par la routine du matin.
 */
function orchLireEtatNuit() {
  try {
    const brut = PropertiesService.getScriptProperties().getProperty(ORCH_PROP_NUIT_ETAT);
    return brut ? JSON.parse(brut) : null;
  } catch (e) {
    return null;
  }
}

/**
 * Écrit l'état persistant de la nuit (fusionne avec l'existant).
 * etat : EN_COURS | TERMINEE | ECHEC | INTERROMPUE | REPRISE_OK | REPRISE_ECHEC
 */
function orchEcrireEtatNuit(etat, extra) {
  try {
    const actuel = orchLireEtatNuit() || {};
    const maj = Object.assign({}, actuel, extra || {});
    maj.etat = etat;
    if (etat === "EN_COURS") {
      maj.jour = orchJourDouala();
      maj.debut = new Date().toISOString();
      maj.fin = null;
    } else if (etat === "TERMINEE" || etat === "ECHEC") {
      maj.fin = new Date().toISOString();
    }
    maj.maj = new Date().toISOString();
    PropertiesService.getScriptProperties().setProperty(ORCH_PROP_NUIT_ETAT, JSON.stringify(maj));
  } catch (e) {
    Logger.log("[ORCH] Impossible d'écrire l'état de nuit : " + e.message);
  }
}

/**
 * Lit une heure (0-23) dans une cellule, quel que soit son format
 * (texte "01:00", "1h", "7", ou cellule au format heure).
 */
function lireHeureDepuisCellule(cellule, valeurParDefaut) {
  const texte = String(cellule.getDisplayValue() || "").trim();
  const m = /^(\d{1,2})\s*(?:[:hH]|$)/.exec(texte);
  if (!m) return valeurParDefaut;

  let heure = parseInt(m[1], 10);
  if (/pm/i.test(texte) && heure < 12) heure += 12;
  if (/am/i.test(texte) && heure === 12) heure = 0;

  return (isNaN(heure) || heure < 0 || heure > 23) ? valeurParDefaut : heure;
}

function appelerCollecteurSecurise(nomFonction, nomSource, metriques) {
  Logger.log("-> Tentative de collecte : " + nomSource + " (fonction " + nomFonction + ")");
  const fn = globalThis[nomFonction];
  if (typeof fn !== "function") {
    Logger.log("[INFO] Collecteur \"" + nomSource + "\" non installé - étape ignorée proprement.");
    return false;
  }
  try {
    fn(metriques);
    Logger.log("✓ Collecte " + nomSource + " terminée.");
    return true;
  } catch (e) {
    Logger.log("[ERREUR " + nomSource.toUpperCase() + "] " + e.message);
    if (metriques && metriques.alertesCritiques) {
      metriques.alertesCritiques.push("Échec collecte " + nomSource + " : " + e.message);
    }
    return false;
  }
}

function executerPipelineCollecteMultiSources(metriques) {
  Logger.log("--- DÉMARRAGE DE LA COLLECTE MULTI-SOURCES ---");

  appelerCollecteurSecurise("executerCollecteARMP", "ARMP", metriques);
  Utilities.sleep(1500);

  // Optionnels : ignorés proprement s'ils n'existent pas
  appelerCollecteurSecurise("executerCollecteWorldBank", "Banque Mondiale", metriques);
  Utilities.sleep(1500);

  appelerCollecteurSecurise("executerCollecteDGMarket", "DGMarket / AFD", metriques);
  Utilities.sleep(1500);

  Logger.log("--- COLLECTE MULTI-SOURCES FINALISÉE ---");
}

/**
 * V2.6 — Déduplication cross-source.
 * Appelée après la collecte, avant la validation.
 * Détecte les doublons entre TOUTES les sources (ARMP + Spark).
 * Fonctionne même si le module Deduplication.gs est absent (dégradation propre).
 */
function executerDeduplicationCrossSource(metriques) {
  Logger.log("--- DÉDUPLICATION CROSS-SOURCE ---");

  if (typeof dedupExecuterPostCollecte !== "function") {
    Logger.log("[DÉDUP] Module Deduplication.gs absent — étape ignorée.");
    return;
  }

  try {
    const res = dedupExecuterPostCollecte(metriques);
    if (res) {
      Logger.log("✓ Déduplication : " + res.marquees + " ligne(s) marquée(s) DOUBLON " +
                 "(exactes : " + res.exactes + ", floues : " + res.floues + ").");
    }
  } catch (e) {
    Logger.log("[DÉDUP] Échec : " + e.message);
    if (metriques && metriques.alertesCritiques) {
      metriques.alertesCritiques.push("Échec déduplication cross-source : " + e.message);
    }
  }

  Logger.log("--- DÉDUPLICATION CROSS-SOURCE FINALISÉE ---");
}

/**
 * V2.9 — Exécute un traitement sous verrou (ou sans verrou si Verrou.gs est absent).
 */
function orchAvecVerrou(nomTraitement, fonction) {
  if (typeof verrouExecuter === "function") {
    return verrouExecuter(nomTraitement, fonction);
  }
  Logger.log("[ORCH] Verrou.gs absent : exécution de « " + nomTraitement + " » sans verrou.");
  fonction();
  return { execute: true };
}

function routineNuit_CollecteEtMatching() {
  orchAvecVerrou("Routine de nuit", orchExecuterRoutineNuit);
}

function orchExecuterRoutineNuit() {
  const metriques = initialiserMetriquesSession();
  const props = PropertiesService.getScriptProperties();
  props.setProperty(ORCH_PROP_ETAPE, "NUIT_EN_COURS");
  orchEcrireEtatNuit("EN_COURS");

  Logger.log("=== DÉMARRAGE ROUTINE NOCTURNE ===");

  try {
    const t0 = new Date();
    executerPipelineCollecteMultiSources(metriques);
    metriques.dureeCollecteSec = Math.round((new Date().getTime() - t0.getTime()) / 1000);
    Utilities.sleep(3000);

    // V2.6 : déduplication cross-source avant validation
    executerDeduplicationCrossSource(metriques);
    Utilities.sleep(2000);

    // Validation des entrées avant matching
    if (typeof validerEntreesNouvelles === "function") {
      Logger.log("-> Validation des entrées...");
      validerEntreesNouvelles(metriques);
    }

    Logger.log("-> Lancement du matching...");
    if (typeof executerMatchingClients === "function") {
      executerMatchingClients(metriques);
    } else {
      Logger.log("[ERREUR] Fonction executerMatchingClients introuvable.");
      metriques.alertesCritiques.push("Fonction de matching absente.");
    }

    props.setProperty(ORCH_PROP_METRIQUES, JSON.stringify(metriques));
    props.setProperty(ORCH_PROP_ETAPE, "NUIT_TERMINEE");
    orchEcrireEtatNuit("TERMINEE");
    Logger.log("Métriques de nuit enregistrées.");

  } catch (err) {
    metriques.statut = "ÉCHEC";
    metriques.alertesCritiques.push("Erreur critique Routine Nuit : " + err.message);
    orchEcrireEtatNuit("ECHEC", { detail: String(err.message).substring(0, 300) });
    envoyerAlerteCritiqueImmediate("Panne Routine Nocturne", err.message);
    finaliserEtConsignerRapport(metriques);
    props.setProperty(ORCH_PROP_ETAPE, "NUIT_ECHEC");
  }

  Logger.log("=== FIN DE LA ROUTINE NOCTURNE ===");
}

function routineMatin_ExpeditionEmails() {
  orchAvecVerrou("Routine du matin", orchExecuterRoutineMatin);
}

function orchExecuterRoutineMatin() {
  Logger.log("=== DÉMARRAGE ROUTINE MATINALE ===");

  const props = PropertiesService.getScriptProperties();
  const donneesNuit = props.getProperty(ORCH_PROP_METRIQUES);
  const etapeNuit = props.getProperty(ORCH_PROP_ETAPE);
  let metriques = initialiserMetriquesSession();

  if (donneesNuit) {
    try {
      const parsed = JSON.parse(donneesNuit);
      metriques = Object.assign(metriques, parsed);
      // V2.7 : la durée du matin se mesure depuis le début du matin (et non de la nuit)
      metriques.debut = new Date();
      Logger.log("Données de la collecte nocturne rattachées.");
    } catch (e) {
      Logger.log("Avertissement : lecture des propriétés de nuit impossible.");
    }
  } else {
    Logger.log("Aucune session nocturne. Utilisation des alertes 'EN_ATTENTE' existantes.");
  }

  // V2.7 : nuit interrompue (coupée par Google) ou absente aujourd'hui
  const etatNuit = orchLireEtatNuit();
  if (etapeNuit === "NUIT_EN_COURS") {
    Logger.log("[AVERTISSEMENT] La routine nocturne n'a jamais terminé (coupée avant la fin).");
    metriques.alertesCritiques.push(
      "Routine nocturne INTERROMPUE (jamais terminée, probable dépassement des 6 minutes) : envoi effectué avec les alertes déjà en attente."
    );
    orchEcrireEtatNuit("INTERROMPUE");
  } else if (etatNuit && etatNuit.jour !== orchJourDouala() && !donneesNuit) {
    Logger.log("[AVERTISSEMENT] Aucune routine nocturne enregistrée aujourd'hui.");
    metriques.alertesCritiques.push(
      "Aucune routine nocturne enregistrée aujourd'hui (le déclencheur de nuit n'a peut-être pas démarré)."
    );
  }

  // V2.5 : une nuit en échec n'empêche plus l'envoi des alertes déjà qualifiées.
  if (etapeNuit === "NUIT_ECHEC") {
    Logger.log("[AVERTISSEMENT] Routine nocturne en échec : envoi des alertes déjà en attente quand même.");
    metriques.alertesCritiques.push(
      "Routine nocturne en échec : envoi effectué avec les alertes déjà en attente."
    );
  }

  // V2.8 : rattrapage des avis NOUVEAU AVANT l'envoi (ne bloque jamais l'envoi)
  try {
    const rattrapage = orchRattraperAvisNouveaux(metriques);
    if (!rattrapage.ok) {
      metriques.alertesCritiques.push(
        "Rattrapage du matin incomplet (" + rattrapage.erreurs.join(" ; ") + ") : envoi effectué avec les alertes déjà prêtes."
      );
    }
    // Nuit interrompue ou en échec, entièrement rattrapée : on le note pour le contrôle de santé de 09h
    const etatApres = orchLireEtatNuit();
    if (rattrapage.ok && rattrapage.apres === 0 && etatApres && etatApres.jour === orchJourDouala() &&
        (etatApres.etat === "INTERROMPUE" || etatApres.etat === "ECHEC" || etatApres.etat === "REPRISE_ECHEC")) {
      orchEcrireEtatNuit("REPRISE_OK", {
        reprise: new Date().toISOString(),
        detail: "rattrapée par la routine du matin"
      });
    }
  } catch (eRat) {
    Logger.log("[RATTRAPAGE MATIN] Exception ignorée : " + eRat.message);
    metriques.alertesCritiques.push("Rattrapage du matin en erreur (" + eRat.message + ") : envoi effectué quand même.");
  }

  try {
    Logger.log("-> Expédition des digests...");
    if (typeof executerEnvoiAlertes === "function") {
      executerEnvoiAlertes(metriques);
    } else if (typeof executerEnvoiEmailsAlertes === "function") {
      executerEnvoiEmailsAlertes(metriques);
    } else {
      Logger.log("[ERREUR] Aucune fonction d'envoi trouvée.");
      metriques.alertesCritiques.push("Fonction d'envoi absente.");
    }
  } catch (err) {
    metriques.statut = "ÉCHEC";
    metriques.alertesCritiques.push("Erreur critique Routine Matin : " + err.message);
    envoyerAlerteCritiqueImmediate("Panne Routine Matinale", err.message);
  } finally {
    Logger.log("-> Finalisation du reporting...");
    finaliserEtConsignerRapport(metriques);
    props.deleteProperty(ORCH_PROP_METRIQUES);
    props.deleteProperty(ORCH_PROP_ETAPE);
  }

  Logger.log("=== FIN DE LA ROUTINE MATINALE ===");
}

function lancerRoutineVeilleQuotidienneComplete() {
  orchAvecVerrou("Session complète", orchExecuterSessionComplete);
}

function orchExecuterSessionComplete() {
  const metriques = initialiserMetriquesSession();
  Logger.log("=== SESSION COMPLÈTE MULTI-SOURCES ===");

  try {
    const t0 = new Date();
    executerPipelineCollecteMultiSources(metriques);
    metriques.dureeCollecteSec = Math.round((new Date().getTime() - t0.getTime()) / 1000);
    Utilities.sleep(3000);

    // V2.6 : déduplication cross-source
    executerDeduplicationCrossSource(metriques);
    Utilities.sleep(2000);

    if (typeof validerEntreesNouvelles === "function") {
      Logger.log("-> Validation des entrées...");
      validerEntreesNouvelles(metriques);
    }

    if (typeof executerMatchingClients === "function") {
      executerMatchingClients(metriques);
    }
    Utilities.sleep(3000);

    if (typeof executerEnvoiAlertes === "function") {
      executerEnvoiAlertes(metriques);
    }

  } catch (err) {
    metriques.statut = "ÉCHEC";
    metriques.alertesCritiques.push("Erreur session complète : " + err.message);
    envoyerAlerteCritiqueImmediate("Échec Session Complète", err.message);
  } finally {
    finaliserEtConsignerRapport(metriques);
  }

  Logger.log("=== SESSION COMPLÈTE TERMINÉE ===");
}

function testerOrchestrationSansEmail() {
  orchAvecVerrou("Test d'orchestration", orchExecuterTestSansEmail);
}

function orchExecuterTestSansEmail() {
  const metriques = initialiserMetriquesSession();
  Logger.log("=== 🧪 TEST ORCHESTRATION SANS ENVOI D'EMAILS ===");

  try {
    const t0 = new Date();
    executerPipelineCollecteMultiSources(metriques);
    metriques.dureeCollecteSec = Math.round((new Date().getTime() - t0.getTime()) / 1000);
    Utilities.sleep(2000);

    // V2.6 : déduplication cross-source
    executerDeduplicationCrossSource(metriques);
    Utilities.sleep(1500);

    if (typeof validerEntreesNouvelles === "function") {
      Logger.log("-> Validation des entrées...");
      validerEntreesNouvelles(metriques);
    }

    if (typeof executerMatchingClients === "function") {
      executerMatchingClients(metriques);
    } else {
      Logger.log("[ERREUR] executerMatchingClients introuvable.");
    }

    Logger.log(`🧪 Test terminé : ${metriques.nouveauxAO} avis collectés, ` +
               `${metriques.alertesGenerees || 0} alertes générées (non envoyées).`);

  } catch (err) {
    metriques.statut = "ÉCHEC";
    metriques.alertesCritiques.push("Erreur test : " + err.message);
    Logger.log("Erreur test : " + err.message);
  }

  Logger.log("=== 🧪 FIN DU TEST ===");
}

function installerDeclencheursAutomatiques() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuilleParams = ss.getSheetByName(SHEET_PARAMS);

  if (!feuilleParams) {
    Logger.log("Erreur : Feuille PARAMETRES introuvable.");
    return;
  }

  // Lecture fiable des heures (texte ou format heure)
  const heureNuit  = lireHeureDepuisCellule(feuilleParams.getRange(ORCH_CELL_HEURE_NUIT), 2);
  const heureMatin = lireHeureDepuisCellule(feuilleParams.getRange(ORCH_CELL_HEURE_MATIN), 7);

  const declencheurs = ScriptApp.getProjectTriggers();
  let supprimes = 0;
  declencheurs.forEach(trig => {
    const fn = trig.getHandlerFunction();
    if (fn === "routineNuit_CollecteEtMatching" ||
        fn === "routineMatin_ExpeditionEmails" ||
        fn === "lancerRoutineVeilleQuotidienneComplete" ||
        fn === "lancerRoutineVeilleQuotidienne" ||
        fn === "testerOrchestrationSansEmail" ||
        fn === "executerEnvoiAlertes") {
      ScriptApp.deleteTrigger(trig);
      supprimes++;
      Logger.log("Déclencheur supprimé : " + fn);
    }
  });

  ScriptApp.newTrigger("routineNuit_CollecteEtMatching")
    .timeBased().everyDays(1).atHour(heureNuit).inTimezone("Africa/Douala").create();

  ScriptApp.newTrigger("routineMatin_ExpeditionEmails")
    .timeBased().everyDays(1).atHour(heureMatin).inTimezone("Africa/Douala").create();

  const message = `Déclencheurs installés :
- Routine Nocturne : ${heureNuit}h00 (Africa/Douala)
- Routine Matinale : ${heureMatin}h00 (Africa/Douala)
- Anciens supprimés : ${supprimes}`;

  Logger.log(message);

  try {
    ss.toast(
      `Nocturne : ${heureNuit}h00 | Matinale : ${heureMatin}h00 | Anciens supprimés : ${supprimes}`,
      "✓ Déclencheurs installés",
      8
    );
  } catch (e) {
    Logger.log("Impossible d'afficher le toast : " + e.message);
  }
}

function listerDeclencheursActifs() {
  const declencheurs = ScriptApp.getProjectTriggers();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (declencheurs.length === 0) {
    const msg = "⚠️ Aucun déclencheur actif. Lancez installerDeclencheursAutomatiques().";
    Logger.log(msg);
    try { ss.toast(msg, "Déclencheurs actifs", 8); } catch (e) {}
    return;
  }

  let message = `Déclencheurs actifs : ${declencheurs.length}\n`;
  declencheurs.forEach((t, i) => {
    message += `${i + 1}. ${t.getHandlerFunction()} — ${t.getEventType()}\n`;
  });

  Logger.log(message);
  try { ss.toast(message, "Déclencheurs actifs", 12); } catch (e) {}
}

// ============================================================================
// TESTS DU LOT 3
// ============================================================================

/**
 * TEST SANS RISQUE : compte les avis NOUVEAU et annonce ce que ferait le rattrapage.
 * Aucune écriture, aucun e-mail, aucun appel IA.
 */
function orchTesterRattrapageMatinSimulation() {
  Logger.log("=================================================");
  Logger.log("=== TEST LOT 3 : RATTRAPAGE DU MATIN (SIMULATION) ===");
  Logger.log("Fichier : " + SpreadsheetApp.getActiveSpreadsheet().getName());
  Logger.log("=================================================");
  const metriques = initialiserMetriquesSession();
  const r = orchRattraperAvisNouveaux(metriques, { simulation: true });
  Logger.log("Avis NOUVEAU à traiter : " + r.avant);
  Logger.log("Budget du rattrapage : " + (ORCH_BUDGET_RATTRAPAGE_MATIN_MS / 1000) + " s");
  Logger.log("Résultat : " + (r.ok ? "OK" : "PROBLÈME : " + r.erreurs.join(" ; ")));
  Logger.log("=== FIN DU TEST (rien n'a été modifié) ===");
}

/**
 * TEST RÉEL (À LANCER UNIQUEMENT APRÈS VALIDATION) : exécute vraiment
 * déduplication + validation + matching sur les avis NOUVEAU, comme la nuit.
 * Écrit dans TOUS_AO et ALERTES_A_ENVOYER (nouvelles alertes EN_ATTENTE) et peut
 * consommer du quota Gemini. N'ENVOIE AUCUN E-MAIL : les alertes partiront à la
 * prochaine routine du matin.
 */
function orchTesterRattrapageMatinReel() {
  Logger.log("=== TEST LOT 3 : RATTRAPAGE RÉEL (aucun e-mail) ===");
  const metriques = initialiserMetriquesSession();
  const r = orchRattraperAvisNouveaux(metriques);
  Logger.log("Avis NOUVEAU : " + r.avant + " -> " + r.apres);
  Logger.log("Alertes générées : " + (metriques.alertesGenerees || 0));
  Logger.log("Résultat : " + (r.ok ? "OK" : "PROBLÈME : " + r.erreurs.join(" ; ")));
  Logger.log("=== FIN DU TEST RÉEL ===");
}