// >>> FICHIER : SanteQuotidienne.gs <<< (à coller dans l'onglet du même nom)
/**
 * ============================================================================
 * CONTRÔLE DE SANTÉ QUOTIDIEN + RATTRAPAGE DE NUIT INTERROMPUE (V1.2 — LOT S1)
 * ============================================================================
 * NOUVEAUTÉ V1.2 : contrôle « COLLECTE_ARMP »
 * ---------------------------------------------------------------------------
 *   Lit l'état mémorisé par Collecteur_ARMP.gs V6.4 (armpLireEtatCollecte) :
 *     🟢 OK            : dernière collecte ARMP complète il y a 30 h ou moins
 *     🟠 À SURVEILLER  : plus de 30 h sans collecte complète, ou dernière
 *                        collecte incomplète (la prochaine fenêtre sera élargie)
 *     🔴 CRITIQUE      : plus de 48 h (2 jours) sans collecte complète
 *   Le gabarit du rapport est inchangé (même structure, une ligne de plus dans
 *   « controles »). Aucun rattrapage de collecte n'est lancé ici : la collecte
 *   suivante élargit d'elle-même sa fenêtre de veille (jusqu'à 7 jours).
 *
 * RÔLE
 * ---------------------------------------------------------------------------
 * Chaque jour vers 09h00 (Africa/Douala), après la routine du matin :
 *   1. Vérifie que la chaîne automatique a bien fonctionné (déclencheurs,
 *      routine de nuit, routine du matin, file d'alertes, avis en attente,
 *      quota Gmail).
 *   2. Envoie UN e-mail à l'administrateur (H2 de PARAMETRES), toujours dans
 *      le même gabarit : 🟢 OK / 🟠 À SURVEILLER / 🔴 CRITIQUE.
 *      Recevoir cet e-mail chaque jour prouve aussi que le contrôle lui-même
 *      fonctionne. Pas d'e-mail = le contrôle n'a pas tourné.
 *   3. Si la nuit a été interrompue (coupée par Google après 6 minutes) ou a
 *      planté : relance automatiquement déduplication + validation + matching
 *      (sans envoyer d'e-mail aux clients : ils partent à la routine du
 *      lendemain matin, ou à un envoi manuel).
 *
 * SÉCURITÉ
 * ---------------------------------------------------------------------------
 *   · Aucune ligne supprimée. Aucune clé API dans ce fichier.
 *   · Le rattrapage est sans risque de doublon : le matching ignore les couples
 *     avis/client déjà alertés, et réutilise le cache IA.
 *   · Ce fichier N'INSTALLE AUCUN déclencheur tout seul. L'installation se fait
 *     uniquement en lançant installerDeclencheurSanteQuotidienne().
 *
 * DÉPEND DE : Orchestration.gs V2.7 (orchLireEtatNuit, orchEcrireEtatNuit,
 *             orchJourDouala, executerDeduplicationCrossSource),
 *             Reporting.gs (initialiserMetriquesSession, SHEET_MONITORING),
 *             Collecteur_ARMP.gs V6.4 (SHEET_AO, SHEET_PARAMS, parseDateCameroun,
 *             armpLireEtatCollecte).
 *
 * TESTS (sans risque) :
 *   sqTesterControleSansAction()  → journal seulement (aucun e-mail, aucune action)
 *   sqTesterControleAvecEmail()   → envoie le rapport à l'administrateur, sans rattrapage
 *   sqTesterEvaluationCollecteARMP() → vérifie les seuils du nouveau contrôle (aucune écriture)
 * ============================================================================
 */

const SQ_FUSEAU = "Africa/Douala";
const SQ_HEURE_CONTROLE = 9;
const SQ_MAX_MINUTES_NUIT = 8;            // au-delà, une nuit "en cours" est considérée coupée
const SQ_PROP_RAPPORT = "SANTE_DERNIER_RAPPORT";
const SQ_VERSION_RAPPORT = "1.0";
const SQ_NIVEAUX = { OK: 0, ATTENTION: 1, CRITIQUE: 2 };
const SQ_ARMP_ATTENTION_H = 30;       // plus de 30 h sans collecte ARMP complète : à surveiller
const SQ_ARMP_CRITIQUE_H = 48;        // plus de 48 h (2 jours) : critique

// ---------------------------------------------------------------------------
// OUTILS
// ---------------------------------------------------------------------------

function sqEchapper(texte) {
  return String(texte === null || texte === undefined ? "" : texte)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Renvoie "aaaa-MM-jj" pour une cellule (Date ou texte), ou "". */
function sqJourDeValeur(v) {
  if (v instanceof Date) {
    return isNaN(v.getTime()) ? "" : Utilities.formatDate(v, SQ_FUSEAU, "yyyy-MM-dd");
  }
  const s = String(v || "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return m[1] + "-" + m[2] + "-" + m[3];
  m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  if (m) return m[3] + "-" + m[2] + "-" + m[1];
  return "";
}

/** Renvoie l'heure (0-23) d'une cellule (Date ou texte), ou -1. */
function sqHeureDeValeur(v) {
  if (v instanceof Date) {
    return isNaN(v.getTime()) ? -1 : parseInt(Utilities.formatDate(v, SQ_FUSEAU, "H"), 10);
  }
  const m = /(\d{1,2}):\d{2}/.exec(String(v || ""));
  return m ? parseInt(m[1], 10) : -1;
}

function sqControle(code, niveau, message) {
  return { code: code, niveau: niveau, message: message };
}

function sqNiveauMax(controles) {
  let max = "OK";
  controles.forEach(function (c) {
    if (SQ_NIVEAUX[c.niveau] > SQ_NIVEAUX[max]) max = c.niveau;
  });
  return max;
}

function sqCompterAvisNouveaux(ss) {
  const feuille = ss.getSheetByName(SHEET_AO);
  if (!feuille) return { nombre: 0, echeanceProche: "" };
  const data = feuille.getDataRange().getValues();
  let nombre = 0;
  let plusProche = null;
  for (let i = 1; i < data.length; i++) {
    const statut = String(data[i][14] || "").trim().toUpperCase();
    if (statut !== "NOUVEAU") continue;
    nombre++;
    if (typeof parseDateCameroun === "function") {
      const d = parseDateCameroun(data[i][11]);
      if (d && d.getTime() > new Date().getTime() && (!plusProche || d < plusProche)) plusProche = d;
    }
  }
  return {
    nombre: nombre,
    echeanceProche: plusProche ? Utilities.formatDate(plusProche, SQ_FUSEAU, "dd/MM/yyyy HH:mm") : ""
  };
}

// ---------------------------------------------------------------------------
// LES CONTRÔLES (lecture seule)
// ---------------------------------------------------------------------------

function sqControleDeclencheurs() {
  let handlers = [];
  try {
    handlers = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  } catch (e) {
    return sqControle("DECLENCHEURS", "ATTENTION", "Lecture des déclencheurs impossible : " + e.message);
  }
  const manquants = [];
  if (handlers.indexOf("routineNuit_CollecteEtMatching") === -1) manquants.push("routine de nuit");
  if (handlers.indexOf("routineMatin_ExpeditionEmails") === -1) manquants.push("routine du matin");
  if (manquants.length > 0) {
    return sqControle("DECLENCHEURS", "CRITIQUE",
      "Déclencheur(s) absent(s) : " + manquants.join(", ") + ". Lancer installerDeclencheursAutomatiques().");
  }
  if (handlers.indexOf("sqControleSanteQuotidien") === -1) {
    return sqControle("DECLENCHEURS", "ATTENTION",
      "Déclencheurs nuit et matin présents. Le déclencheur de ce contrôle n'est pas installé (" + handlers.length + " déclencheur(s) au total).");
  }
  return sqControle("DECLENCHEURS", "OK", "Déclencheurs nuit, matin et contrôle présents (" + handlers.length + " au total).");
}

/**
 * Contrôle de la routine de nuit. Renvoie { controle, aRattraper }.
 */
function sqControleNuit() {
  const etat = orchLireEtatNuit();
  const auj = orchJourDouala();

  if (!etat) {
    return {
      controle: sqControle("NUIT", "ATTENTION",
        "Aucun historique de la routine de nuit : normal tant que la première nuit n'a pas tourné avec Orchestration.gs V2.7."),
      aRattraper: false
    };
  }

  const debut = etat.debut ? new Date(etat.debut) : null;
  const fin = etat.fin ? new Date(etat.fin) : null;
  const heureDebut = debut ? Utilities.formatDate(debut, SQ_FUSEAU, "dd/MM HH:mm") : "?";
  let niveau = "OK";
  let message = "";
  let aRattraper = false;

  switch (etat.etat) {
    case "EN_COURS": {
      const minutes = debut ? Math.round((new Date().getTime() - debut.getTime()) / 60000) : 999;
      if (minutes > SQ_MAX_MINUTES_NUIT) {
        niveau = "CRITIQUE";
        aRattraper = true;
        message = "Routine de nuit INTERROMPUE : démarrée le " + heureDebut + " et jamais terminée (probable dépassement des 6 minutes).";
      } else {
        niveau = "ATTENTION";
        message = "Routine de nuit encore en cours (démarrée il y a " + minutes + " min).";
      }
      break;
    }
    case "INTERROMPUE":
      niveau = "CRITIQUE";
      aRattraper = true;
      message = "Routine de nuit INTERROMPUE (démarrée le " + heureDebut + ", jamais terminée).";
      break;
    case "ECHEC":
      niveau = "CRITIQUE";
      aRattraper = true;
      message = "Routine de nuit en ÉCHEC" + (etat.detail ? " : " + etat.detail : ".");
      break;
    case "REPRISE_ECHEC":
      niveau = "CRITIQUE";
      aRattraper = true;
      message = "Le dernier rattrapage de nuit a échoué" + (etat.detail ? " : " + etat.detail : ".") + " Nouvelle tentative.";
      break;
    case "REPRISE_OK":
      niveau = "ATTENTION";
      message = "Nuit du " + heureDebut + " interrompue puis rattrapée automatiquement.";
      break;
    case "TERMINEE": {
      const duree = (debut && fin) ? Math.round((fin.getTime() - debut.getTime()) / 1000) + " s" : "durée inconnue";
      message = "Routine de nuit terminée (démarrée le " + heureDebut + ", durée " + duree + ").";
      break;
    }
    default:
      niveau = "ATTENTION";
      message = "État de nuit inconnu : " + etat.etat;
  }

  if (etat.jour !== auj && (etat.etat === "TERMINEE" || etat.etat === "REPRISE_OK")) {
    niveau = "CRITIQUE";
    message = "Aucune routine de nuit enregistrée aujourd'hui (la dernière date du " + etat.jour +
              "). Le déclencheur de nuit n'a peut-être pas démarré.";
  }

  return { controle: sqControle("NUIT", niveau, message), aRattraper: aRattraper };
}

/**
 * Évaluation PURE de l'état de la collecte ARMP (aucun accès aux feuilles).
 * @param {number|null} okMs instant (ms) de la dernière collecte complète
 * @param {Object|null} etat état mémorisé par le collecteur
 * @param {number} maintenantMs instant courant (ms)
 * @return {Object} { niveau, message }
 */
function sqEvaluerCollecteARMP(okMs, etat, maintenantMs) {
  const raisons = (etat && etat.raisons && etat.raisons.length) ? etat.raisons.join(" ; ") : "";
  const echec = (etat && etat.echec) ? String(etat.echec) : "";
  const detail = echec ? " Dernier échec : " + echec : (raisons ? " Raison(s) : " + raisons + "." : "");

  if (okMs === null || okMs === undefined || isNaN(okMs)) {
    return {
      niveau: "ATTENTION",
      message: "Aucune collecte ARMP complète enregistrée (normal avant le premier passage avec Collecteur_ARMP.gs V6.4)." + detail
    };
  }

  const ageH = Math.round((maintenantMs - okMs) / 3600000);
  const dateOk = Utilities.formatDate(new Date(okMs), SQ_FUSEAU, "dd/MM HH:mm");

  if (ageH > SQ_ARMP_CRITIQUE_H) {
    return {
      niveau: "CRITIQUE",
      message: "Aucune collecte ARMP complète depuis " + ageH + " h (dernière : " + dateOk + ")." + detail
    };
  }
  if (ageH > SQ_ARMP_ATTENTION_H) {
    return {
      niveau: "ATTENTION",
      message: "Dernière collecte ARMP complète il y a " + ageH + " h (" + dateOk + ")." + detail +
        " La prochaine collecte élargira sa fenêtre de veille."
    };
  }
  if (etat && etat.complete === false) {
    return {
      niveau: "ATTENTION",
      message: "La dernière collecte ARMP est incomplète." + detail +
        " Dernière collecte complète il y a " + ageH + " h (" + dateOk + "). La prochaine fenêtre sera élargie."
    };
  }
  const tentatives = (etat && etat.tentatives > 1) ? " (réussie après " + etat.tentatives + " tentatives)" : "";
  const elargie = (etat && etat.elargie) ? " Fenêtre élargie à " + etat.fenetreHeures + " h pour rattraper un jour manqué." : "";
  return {
    niveau: "OK",
    message: "Dernière collecte ARMP complète il y a " + ageH + " h (" + dateOk + ")" + tentatives + "." + elargie
  };
}

function sqControleCollecteARMP() {
  if (typeof armpLireEtatCollecte !== "function") {
    return sqControle("COLLECTE_ARMP", "ATTENTION",
      "Collecteur_ARMP.gs V6.4 non installé : le contrôle de la collecte ARMP est impossible.");
  }
  try {
    const e = armpLireEtatCollecte();
    const r = sqEvaluerCollecteARMP(e.okMs, e.etat, new Date().getTime());
    return sqControle("COLLECTE_ARMP", r.niveau, r.message);
  } catch (err) {
    return sqControle("COLLECTE_ARMP", "ATTENTION", "Lecture de l'état de la collecte ARMP impossible : " + err.message);
  }
}

function sqControleMatin(ss) {
  const feuille = ss.getSheetByName(SHEET_MONITORING);
  if (!feuille) return sqControle("MATIN", "ATTENTION", "Feuille JOURNAL_MONITORING introuvable.");
  const data = feuille.getDataRange().getValues();
  const auj = orchJourDouala();

  for (let i = data.length - 1; i >= 1; i--) {
    if (sqJourDeValeur(data[i][0]) !== auj) continue;
    if (sqHeureDeValeur(data[i][0]) < 6) continue; // ligne écrite par la nuit
    const statut = String(data[i][1] || "").trim().toUpperCase();
    const emails = parseInt(data[i][11], 10) || 0;
    if (statut === "ÉCHEC" || statut === "ECHEC") {
      return sqControle("MATIN", "CRITIQUE", "Routine du matin en ÉCHEC (voir JOURNAL_MONITORING, ligne " + (i + 1) + ").");
    }
    if (statut === "AVERTISSEMENT") {
      return sqControle("MATIN", "ATTENTION", "Routine du matin exécutée avec avertissement (" + emails + " e-mail(s) envoyé(s)). Voir JOURNAL_MONITORING, ligne " + (i + 1) + ".");
    }
    return sqControle("MATIN", "OK", "Routine du matin exécutée (" + statut + ", " + emails + " e-mail(s) envoyé(s)).");
  }
  return sqControle("MATIN", "CRITIQUE", "Aucune routine du matin enregistrée aujourd'hui : le déclencheur du matin n'a peut-être pas démarré.");
}

function sqControleFileAlertes(ss) {
  const feuille = ss.getSheetByName("ALERTES_A_ENVOYER");
  if (!feuille) return sqControle("FILE_ALERTES", "ATTENTION", "Feuille ALERTES_A_ENVOYER introuvable.");
  const data = feuille.getDataRange().getValues();
  let enAttente = 0, reportees = 0;
  for (let i = 1; i < data.length; i++) {
    const st = String(data[i][7] || "").trim().toUpperCase();
    if (st === "EN_ATTENTE") enAttente++;
    else if (st === "REPORTÉ") reportees++;
  }
  if (enAttente + reportees === 0) {
    return sqControle("FILE_ALERTES", "OK", "Aucune alerte en attente d'envoi.");
  }
  return sqControle("FILE_ALERTES", "ATTENTION",
    enAttente + " alerte(s) EN_ATTENTE et " + reportees + " REPORTÉE(S) : elles partiront à la prochaine routine du matin.");
}

function sqControleAvisEnAttente(ss) {
  const r = sqCompterAvisNouveaux(ss);
  if (r.nombre === 0) return sqControle("AVIS_EN_ATTENTE", "OK", "Aucun avis en attente de traitement.");
  return sqControle("AVIS_EN_ATTENTE", "ATTENTION",
    r.nombre + " avis au statut NOUVEAU pas encore traité(s) (validation + matching)" +
    (r.echeanceProche ? ". Échéance la plus proche : " + r.echeanceProche + "." : "."));
}

function sqControleQuota(ss) {
  const feuilleParams = ss.getSheetByName(SHEET_PARAMS);
  let seuil = 10;
  if (feuilleParams) {
    const v = parseInt(feuilleParams.getRange("H9").getValue(), 10);
    if (!isNaN(v) && v > 0) seuil = v;
  }
  const restant = MailApp.getRemainingDailyQuota();
  if (restant <= seuil) {
    return sqControle("QUOTA_GMAIL", "CRITIQUE", "Quota Gmail critique : " + restant + " e-mail(s) restant(s) (seuil " + seuil + ").");
  }
  return sqControle("QUOTA_GMAIL", "OK", "Quota Gmail confortable : " + restant + " e-mail(s) restant(s).");
}

// ---------------------------------------------------------------------------
// RAPPORT (gabarit figé : même structure pour l'e-mail et de futurs webhooks)
// ---------------------------------------------------------------------------

function sqConstruireRapport(ss) {
  const nuit = sqControleNuit();
  const controles = [
    sqControleDeclencheurs(),
    nuit.controle,
    sqControleCollecteARMP(),
    sqControleMatin(ss),
    sqControleFileAlertes(ss),
    sqControleAvisEnAttente(ss),
    sqControleQuota(ss)
  ];

  let environnement = "PRODUCTION";
  try {
    if (typeof rpDetecterEnvironnement === "function") environnement = rpDetecterEnvironnement().libelle || "PRODUCTION";
  } catch (e) {}

  return {
    version: SQ_VERSION_RAPPORT,
    type: "SANTE_QUOTIDIENNE",
    genere_le: Utilities.formatDate(new Date(), SQ_FUSEAU, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    fichier: ss.getName(),
    environnement: environnement,
    niveau: sqNiveauMax(controles),
    controles: controles,
    actions: [],
    aRattraper: nuit.aRattraper
  };
}

function sqLoguerRapport(rapport) {
  const icones = { OK: "✅", ATTENTION: "⚠️", CRITIQUE: "❌" };
  Logger.log("Niveau global : " + rapport.niveau);
  rapport.controles.forEach(function (c) {
    Logger.log("  " + icones[c.niveau] + " " + c.code + " — " + c.message);
  });
  rapport.actions.forEach(function (a) { Logger.log("  ➜ ACTION : " + a); });
}

function sqRendreEmail(rapport) {
  const couleurs = {
    OK: { fond: "#dcfce7", texte: "#166534", libelle: "🟢 OK" },
    ATTENTION: { fond: "#fef3c7", texte: "#92400e", libelle: "🟠 À SURVEILLER" },
    CRITIQUE: { fond: "#fee2e2", texte: "#991b1b", libelle: "🔴 CRITIQUE" }
  };
  const icones = { OK: "✅", ATTENTION: "⚠️", CRITIQUE: "❌" };
  const c = couleurs[rapport.niveau];
  const dateTxt = Utilities.formatDate(new Date(), SQ_FUSEAU, "dd/MM/yyyy HH:mm");

  const lignes = rapport.controles.map(function (ct) {
    return '<tr>' +
      '<td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;width:28px;">' + icones[ct.niveau] + '</td>' +
      '<td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-weight:bold;width:150px;">' + sqEchapper(ct.code) + '</td>' +
      '<td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">' + sqEchapper(ct.message) + '</td>' +
      '</tr>';
  }).join("");

  const actions = rapport.actions.length > 0
    ? '<h3 style="font-size:14px;margin:18px 0 6px;">Actions automatiques</h3><ul style="font-size:13px;margin:0;padding-left:18px;">' +
      rapport.actions.map(function (a) { return "<li>" + sqEchapper(a) + "</li>"; }).join("") + "</ul>"
    : "";

  return '<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#0f172a;">' +
    '<div style="background:' + c.fond + ';color:' + c.texte + ';padding:16px 20px;border-radius:8px 8px 0 0;">' +
    '<div style="font-size:18px;font-weight:bold;">Contrôle de santé — ' + c.libelle + '</div>' +
    '<div style="font-size:12px;margin-top:4px;">' + sqEchapper(dateTxt) + ' · ' + sqEchapper(rapport.environnement) + ' · ' + sqEchapper(rapport.fichier) + '</div>' +
    '</div>' +
    '<div style="padding:16px 20px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;">' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px;">' + lignes + '</table>' +
    actions +
    '</div>' +
    '<div style="text-align:center;font-size:11px;color:#94a3b8;padding:10px;">Rapport v' + SQ_VERSION_RAPPORT + ' · généré automatiquement</div>' +
    '</div>';
}

function sqEnvoyerRapport(rapport, ss) {
  const feuilleParams = ss.getSheetByName(SHEET_PARAMS);
  const emailAdmin = feuilleParams ? String(feuilleParams.getRange("H2").getValue() || "").trim() : "";
  if (!emailAdmin) {
    Logger.log("[SANTÉ] Aucun e-mail administrateur (PARAMETRES!H2) : rapport non envoyé.");
    return false;
  }
  const libelles = { OK: "🟢 OK", ATTENTION: "🟠 À SURVEILLER", CRITIQUE: "🔴 CRITIQUE" };
  const prefixe = rapport.environnement === "TEST" ? "[TEST] " : "";
  const sujet = prefixe + "[Veille AO] Contrôle santé du " +
    Utilities.formatDate(new Date(), SQ_FUSEAU, "dd/MM/yyyy") + " — " + libelles[rapport.niveau];
  try {
    GmailApp.sendEmail(emailAdmin, sujet, "", {
      htmlBody: sqRendreEmail(rapport),
      name: "Veille AO — Contrôle santé"
    });
    Logger.log("[SANTÉ] Rapport envoyé à " + emailAdmin + " : " + sujet);
    return true;
  } catch (e) {
    Logger.log("[SANTÉ] Envoi du rapport impossible : " + e.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// RATTRAPAGE D'UNE NUIT INTERROMPUE
// ---------------------------------------------------------------------------

/**
 * Relance déduplication + validation + matching. N'envoie AUCUN e-mail client.
 * Sans danger si relancé : les alertes déjà créées et le cache IA sont réutilisés.
 */
function sqRattraperNuit(metriques) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const resultat = { ok: true, erreurs: [], avisAvant: 0, avisApres: 0, alertesGenerees: 0 };

  const corps = function () {
    resultat.avisAvant = sqCompterAvisNouveaux(ss).nombre;
    Logger.log("[SANTÉ] Rattrapage : " + resultat.avisAvant + " avis NOUVEAU avant reprise.");

    const etapes = [
      { nom: "déduplication", fn: function () { if (typeof executerDeduplicationCrossSource === "function") executerDeduplicationCrossSource(metriques); } },
      { nom: "validation", fn: function () { if (typeof validerEntreesNouvelles === "function") validerEntreesNouvelles(metriques); } },
      { nom: "matching", fn: function () { if (typeof executerMatchingClients === "function") executerMatchingClients(metriques); else throw new Error("executerMatchingClients introuvable"); } }
    ];

    etapes.forEach(function (etape) {
      try {
        Logger.log("[SANTÉ] Rattrapage : " + etape.nom + "...");
        etape.fn();
      } catch (e) {
        resultat.ok = false;
        resultat.erreurs.push(etape.nom + " : " + e.message);
        Logger.log("[SANTÉ] Rattrapage — échec " + etape.nom + " : " + e.message);
      }
    });

    resultat.avisApres = sqCompterAvisNouveaux(ss).nombre;
    resultat.alertesGenerees = (metriques && metriques.alertesGenerees) || 0;
  };

  if (typeof verrouExecuter === "function") {
    // Pas d'e-mail séparé : le rapport de santé signale lui-même l'échec du rattrapage.
    const v = verrouExecuter("Rattrapage de nuit (contrôle de santé)", corps, { alerter: false });
    if (!v.execute) {
      resultat.ok = false;
      resultat.erreurs.push("verrou occupé depuis plus de 2 minutes (un autre traitement est en cours)");
      return resultat;
    }
  } else {
    corps();
  }

  orchEcrireEtatNuit(resultat.ok ? "REPRISE_OK" : "REPRISE_ECHEC", {
    reprise: new Date().toISOString(),
    detail: resultat.ok ? "" : resultat.erreurs.join(" ; ").substring(0, 300)
  });
  return resultat;
}

// ---------------------------------------------------------------------------
// POINT D'ENTRÉE (déclencheur) ET VARIANTES
// ---------------------------------------------------------------------------

/**
 * Fonction appelée par le déclencheur quotidien de 09h00.
 * (Volontairement sans paramètre : Apps Script y injecterait un objet d'événement.)
 */
function sqControleSanteQuotidien() {
  sqExecuterControle({});
}

/**
 * @param {Object} opt  { simulation: true } = rien n'est envoyé ni modifié
 *                      { recuperer: false }  = pas de rattrapage
 *                      { envoyerEmail: false } = pas d'e-mail
 */
function sqExecuterControle(opt) {
  const options = opt || {};
  const simulation = options.simulation === true;
  const recuperer = options.recuperer !== false && !simulation;
  const envoyerEmail = options.envoyerEmail !== false && !simulation;

  Logger.log("=================================================");
  Logger.log("=== CONTRÔLE DE SANTÉ QUOTIDIEN" + (simulation ? " (SIMULATION)" : "") + " ===");
  Logger.log("Fichier : " + SpreadsheetApp.getActiveSpreadsheet().getName());
  Logger.log("Date    : " + Utilities.formatDate(new Date(), SQ_FUSEAU, "yyyy-MM-dd HH:mm"));
  Logger.log("=================================================");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // Métriques fraîches : le matching s'arrête de lui-même à 270 s après ce début.
  const metriques = (typeof initialiserMetriquesSession === "function")
    ? initialiserMetriquesSession()
    : { debut: new Date(), alertesCritiques: [], sources: {}, detailDistribution: {} };

  const rapport = sqConstruireRapport(ss);

  if (rapport.aRattraper) {
    if (recuperer) {
      Logger.log("[SANTÉ] Nuit interrompue ou en échec : lancement du rattrapage automatique.");
      const r = sqRattraperNuit(metriques);
      if (r.ok) {
        rapport.actions.push("Rattrapage automatique effectué : déduplication, validation et matching relancés. " +
          r.alertesGenerees + " alerte(s) générée(s) ; avis en attente : " + r.avisAvant + " → " + r.avisApres +
          ". Les e-mails clients partiront à la prochaine routine du matin.");
        rapport.controles.forEach(function (c) {
          if (c.code === "NUIT" && c.niveau === "CRITIQUE") {
            c.niveau = "ATTENTION";
            c.message += " Rattrapage automatique effectué.";
          }
        });
      } else {
        rapport.actions.push("Rattrapage automatique ÉCHOUÉ : " + r.erreurs.join(" ; ") + ". Nouvelle tentative demain à la même heure, ou lancer le rattrapage à la main.");
      }
      rapport.niveau = sqNiveauMax(rapport.controles);
    } else {
      rapport.actions.push(simulation
        ? "SIMULATION : un rattrapage automatique (déduplication + validation + matching) aurait été lancé."
        : "Rattrapage non lancé (option désactivée).");
    }
  }

  sqLoguerRapport(rapport);

  if (!simulation) {
    try {
      PropertiesService.getScriptProperties().setProperty(SQ_PROP_RAPPORT, JSON.stringify(rapport));
    } catch (e) {
      Logger.log("[SANTÉ] Mémorisation du rapport impossible : " + e.message);
    }
  }
  if (envoyerEmail) sqEnvoyerRapport(rapport, ss);

  Logger.log("=== FIN DU CONTRÔLE DE SANTÉ ===");
  return rapport;
}

// ---------------------------------------------------------------------------
// TESTS
// ---------------------------------------------------------------------------

/** Test 1 : journal seulement. Aucun e-mail, aucune action, aucune écriture. */
function sqTesterControleSansAction() {
  sqExecuterControle({ simulation: true });
}

/** Test 2 : envoie le rapport à l'administrateur (H2). Pas de rattrapage. */
function sqTesterControleAvecEmail() {
  sqExecuterControle({ recuperer: false });
}

/** Test 3 : vérifie les seuils du contrôle de la collecte ARMP avec des valeurs simulées. Aucune écriture. */
function sqTesterEvaluationCollecteARMP() {
  let ok = 0;
  let ko = 0;
  const verifier = function (nom, condition) {
    if (condition) { ok++; Logger.log("✅ " + nom); } else { ko++; Logger.log("❌ " + nom); }
  };
  const H = 3600000;
  const maintenant = Date.UTC(2026, 9, 1, 8, 0);

  let r = sqEvaluerCollecteARMP(maintenant - 2 * H, { complete: true, tentatives: 1 }, maintenant);
  verifier("collecte complète il y a 2 h : OK", r.niveau === "OK");
  r = sqEvaluerCollecteARMP(maintenant - 25 * H, { complete: false, raisons: ["site ARMP en erreur HTTP 503 (page 1)"] }, maintenant);
  verifier("dernière collecte incomplète (25 h) : À SURVEILLER", r.niveau === "ATTENTION" && r.message.indexOf("incomplète") !== -1);
  r = sqEvaluerCollecteARMP(maintenant - 31 * H, { complete: true }, maintenant);
  verifier("31 h sans collecte complète : À SURVEILLER", r.niveau === "ATTENTION");
  r = sqEvaluerCollecteARMP(maintenant - 48 * H, { complete: true }, maintenant);
  verifier("48 h exactement : encore À SURVEILLER", r.niveau === "ATTENTION");
  r = sqEvaluerCollecteARMP(maintenant - 49 * H, { complete: false, echec: "Service Spreadsheets failed" }, maintenant);
  verifier("49 h : CRITIQUE, avec le dernier échec", r.niveau === "CRITIQUE" && r.message.indexOf("Spreadsheets") !== -1);
  r = sqEvaluerCollecteARMP(null, null, maintenant);
  verifier("aucune donnée : À SURVEILLER (pas de fausse alarme)", r.niveau === "ATTENTION");
  r = sqEvaluerCollecteARMP(maintenant - 3 * H, { complete: true, tentatives: 3, elargie: true, fenetreHeures: 49 }, maintenant);
  verifier("réussite après 3 tentatives : OK, mention des tentatives et de la fenêtre élargie",
    r.niveau === "OK" && r.message.indexOf("3 tentatives") !== -1 && r.message.indexOf("49 h") !== -1);

  Logger.log("=== RÉSULTAT : " + ok + " réussi(s), " + ko + " échec(s) ===");
  if (ko > 0) throw new Error(ko + " vérification(s) en échec (voir le journal).");
}

// ---------------------------------------------------------------------------
// DÉCLENCHEUR — À NE LANCER QU'APRÈS VALIDATION EXPLICITE
// ---------------------------------------------------------------------------

/**
 * Installe le déclencheur quotidien du contrôle (entre 09h et 10h, Africa/Douala).
 * Ne supprime QUE d'anciens déclencheurs du même contrôle. Les autres sont intacts.
 */
function installerDeclencheurSanteQuotidienne() {
  let supprimes = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "sqControleSanteQuotidien") {
      ScriptApp.deleteTrigger(t);
      supprimes++;
    }
  });
  ScriptApp.newTrigger("sqControleSanteQuotidien")
    .timeBased().everyDays(1).atHour(SQ_HEURE_CONTROLE).inTimezone(SQ_FUSEAU).create();
  Logger.log("Déclencheur de contrôle installé : chaque jour entre " + SQ_HEURE_CONTROLE + "h et " +
             (SQ_HEURE_CONTROLE + 1) + "h (" + SQ_FUSEAU + "). Anciens supprimés : " + supprimes + ".");
}

/** Retire uniquement le déclencheur du contrôle de santé. */
function desinstallerDeclencheurSanteQuotidienne() {
  let supprimes = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "sqControleSanteQuotidien") {
      ScriptApp.deleteTrigger(t);
      supprimes++;
    }
  });
  Logger.log("Déclencheur(s) de contrôle supprimé(s) : " + supprimes + ".");
}