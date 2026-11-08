// >>> FICHIER : Reporting.gs <<< (à coller dans l'onglet du même nom)
/**
 * ============================================================================
 * MODULE DE MONITORING, AUDIT ET REPORTING MULTI-SOURCES (V3.2 — LOT S1b)
 * ============================================================================
 * Nouveauté V3.2 (LOT S1b) : tout texte venu de l'extérieur ou d'un message d'incident
 * (noms de clients, titres d'avis, motifs de l'IA, noms de sources, nom du fichier) est
 * ÉCHAPPÉ avant d'entrer dans le HTML des e-mails administrateur (secEchapperHtml). Le lien
 * « Vérifier l'avis original » n'est affiché que s'il est http(s) propre (secLienSur). Les
 * lignes écrites dans JOURNAL_MONITORING sont neutralisées contre les formules Sheets
 * (secNeutraliserLigne). Dépend de SecuriteDonnees.gs.
 *
 * Nouveauté V3.1 (correctifs sur retour d'usage) :
 * - Le tableau des sources dans l'email admin ne liste plus les organismes
 *   à 0. Une ligne TOTAL est ajoutée en bas pour vérifier la cohérence avec
 *   le chiffre "Nouveaux avis insérés" affiché plus haut.
 * - Si aucune source n'a produit d'avis, un message explicite remplace la
 *   table au lieu d'un tableau vide.
 * - Libellés de la section 2 clarifiés : les trois compteurs (Appels HTTP,
 *   Paires rejetées AVANT l'IA, Paires réellement soumises à l'IA) sont
 *   désormais regroupés et leur signification est explicite.
 *
 * Rappel V3.0 :
 * - Intégration du JOB D (audit qualité automatique) et détection TEST/PROD.
 *
 * Rappel V2.6 :
 * - Ventilation multi-sources, détection collecte muette, audit IA hebdo,
 *   rafraîchissement du DASHBOARD.
 * ============================================================================
 */

const SHEET_MONITORING = "JOURNAL_MONITORING";
const RM_SEUIL_SESSIONS_MUETTES = 3;
const RM_PROP_DERNIERE_AUDIT_IA = "AUDIT_QUALITE_IA_DERNIERE_EXEC";
const RM_INTERVALLE_AUDIT_IA_JOURS = 7;
const RM_TAILLE_ECHANTILLON_AUDIT_IA = 5;

// ----------------------------------------------------------------------------
// DÉTECTION D'ENVIRONNEMENT (TEST / PRODUCTION)
// ----------------------------------------------------------------------------

function rpDetecterEnvironnement() {
  if (typeof eeDetecterEnvironnement === "function") {
    try {
      return eeDetecterEnvironnement();
    } catch (e) {
      Logger.log("[REPORTING] eeDetecterEnvironnement a échoué : " + e.message);
    }
  }
  let nom = "";
  try { nom = SpreadsheetApp.getActiveSpreadsheet().getName() || ""; } catch (e) {}
  return {
    nomFichier: nom,
    estTest: false,
    libelle: "PRODUCTION",
    couleurFond: "",
    couleurBordure: "",
    couleurTexte: ""
  };
}

function rpConstruireBandeauEnv(env) {
  if (!env.estTest) return "";
  return `
    <div style="background-color: ${env.couleurFond}; border: 2px solid ${env.couleurBordure};
                color: ${env.couleurTexte}; padding: 12px 14px; margin-bottom: 16px;
                border-radius: 6px; font-family: Arial, sans-serif;">
      <div style="font-size: 14px; font-weight: bold; margin-bottom: 4px;">
        ⚠️ RAPPORT ISSU D'UN ENVIRONNEMENT DE TEST
      </div>
      <div style="font-size: 12px;">
        Ce message provient d'une copie ou d'un environnement de test et
        <strong>ne reflète pas l'état de la production</strong>.<br>
        Fichier source : <code style="background: rgba(0,0,0,0.06); padding: 1px 4px; border-radius: 3px;">${secEchapperHtml(env.nomFichier)}</code>
      </div>
    </div>`;
}

// ----------------------------------------------------------------------------
// INITIALISATION DES MÉTRIQUES DE SESSION
// ----------------------------------------------------------------------------

function initialiserMetriquesSession() {
  return {
    debut: new Date(),
    fin: null,
    statut: "SUCCÈS",
    alertesCritiques: [],

    pagesScannees: 0,
    nouveauxAO: 0,
    aoIgnoresHorsFenetre: 0,
    dureeCollecteSec: 0,
    sources: {
      "ARMP": 0,
      "Banque Mondiale": 0,
      "BAD": 0,
      "ONU": 0,
      "UE": 0,
      "AFD": 0,
      "DevelopmentAid": 0,
      "COLEPS": 0
    },

    appelsGemini: 0,
    retriesErreursIA: 0,
    matchsMotsCles: 0,
    matchsSemantiqueIA: 0,
    alertesGenerees: 0,
    pairesFiltreesIA: 0,
    pairesEvalueesIA: 0,

    emailsEnvoyes: 0,
    detailDistribution: {},
    alertesForclosesEcartees: 0,

    quotaEmailsRestant: MailApp.getRemainingDailyQuota()
  };
}

// ----------------------------------------------------------------------------
// ALERTE CRITIQUE IMMÉDIATE
// ----------------------------------------------------------------------------

/**
 * LOT S1b — Construit le HTML de l'alerte critique (testable sans envoi). Le type d'incident,
 * le détail et le nom du fichier sont échappés.
 */
function rpConstruireCorpsAlerteCritique(typeIncident, messageDetail, env, bandeauEnv, maintenantStr) {
  return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 15px; border: 2px solid #ef4444; border-radius: 8px; background-color: #fef2f2;">
        ${bandeauEnv}
        <h2 style="color: #b91c1c; margin-top: 0;">Alerte Système Veille Multi-Sources</h2>
        <p style="font-size: 14px; color: #1e293b;">
          Une anomalie nécessitant votre intervention s'est produite lors de la session automatisée :
        </p>
        <div style="background-color: #ffffff; border-left: 4px solid #ef4444; padding: 10px; margin: 15px 0; font-family: monospace; font-size: 13px; color: #0f172a;">
          <strong>Incident :</strong> ${secEchapperHtml(typeIncident)}<br><br>
          <strong>Détail :</strong> ${secEchapperHtml(messageDetail)}
        </div>
        <p style="font-size: 12px; color: #64748b;">
          Date de détection : ${maintenantStr} (Heure de Yaoundé).<br>
          Consultez l'onglet <em>JOURNAL_MONITORING</em> pour le diagnostic complet.<br>
          <span style="font-size: 11px; color: #94a3b8;">
            Source : ${secEchapperHtml(env.nomFichier)} — Environnement : ${secEchapperHtml(env.libelle)}
          </span>
        </p>
      </div>`;
}

function envoyerAlerteCritiqueImmediate(typeIncident, messageDetail) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const feuilleParams = ss.getSheetByName(SHEET_PARAMS);
    if (!feuilleParams) return;

    const emailAdmin = feuilleParams.getRange("H2").getValue().toString().trim();
    if (!emailAdmin) return;

    const env = rpDetecterEnvironnement();
    const prefixeSujet = env.estTest ? "[TEST] " : "";
    const bandeauEnv = rpConstruireBandeauEnv(env);

    const maintenantStr = Utilities.formatDate(new Date(), "Africa/Douala", "dd/MM/yyyy HH:mm:ss");
    const objet = `${prefixeSujet}🚨 [ALERTE CRITIQUE VEILLE] ${typeIncident} - ${maintenantStr}`;

    const corpsHtml = rpConstruireCorpsAlerteCritique(typeIncident, messageDetail, env, bandeauEnv, maintenantStr);

    MailApp.sendEmail({
      to: emailAdmin,
      subject: objet,
      htmlBody: corpsHtml
    });

    Logger.log(`-> Alerte critique transmise à l'administrateur (${emailAdmin}) : ${typeIncident} [${env.libelle}]`);
  } catch (err) {
    Logger.log("Erreur lors de l'expédition de l'alerte critique : " + err.message);
  }
}

// ----------------------------------------------------------------------------
// DÉTECTION DE COLLECTE MUETTE
// ----------------------------------------------------------------------------

function detecterCollecteMuetteRecurrente(metriques) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuilleLog = ss.getSheetByName(SHEET_MONITORING);
  if (!feuilleLog) return false;

  const data = feuilleLog.getDataRange().getValues();
  if (data.length < 2) return false;

  const sessionsPrecedentes = [];
  const nbASelectionner = RM_SEUIL_SESSIONS_MUETTES - 1;

  for (let i = data.length - 1; i >= 1 && sessionsPrecedentes.length < nbASelectionner; i--) {
    sessionsPrecedentes.unshift({
      nouveauxAO: parseInt(data[i][4], 10) || 0,
      ignores: parseInt(data[i][5], 10) || 0
    });
  }

  if (sessionsPrecedentes.length < nbASelectionner) return false;

  const sessionActuelle = {
    nouveauxAO: metriques.nouveauxAO || 0,
    ignores: metriques.aoIgnoresHorsFenetre || 0
  };

  const toutesMuettes = sessionsPrecedentes.every(s => s.nouveauxAO === 0 && s.ignores === 0)
                        && sessionActuelle.nouveauxAO === 0
                        && sessionActuelle.ignores === 0;

  if (toutesMuettes) {
    Logger.log(`[SANTÉ COLLECTE] ${RM_SEUIL_SESSIONS_MUETTES} sessions consécutives muettes détectées.`);
  }
  return toutesMuettes;
}

// ----------------------------------------------------------------------------
// AUDIT QUALITÉ IA — VERSION HUMAINE (échantillon envoyé à l'admin)
// ----------------------------------------------------------------------------

function envoyerAuditQualiteIAPeriode() {
  const props = PropertiesService.getScriptProperties();
  const derniereStr = props.getProperty(RM_PROP_DERNIERE_AUDIT_IA);
  const maintenant = new Date();

  if (derniereStr) {
    const derniere = new Date(derniereStr);
    if (!isNaN(derniere.getTime())) {
      const jours = (maintenant.getTime() - derniere.getTime()) / (1000 * 60 * 60 * 24);
      if (jours < RM_INTERVALLE_AUDIT_IA_JOURS) {
        Logger.log(`[AUDIT IA] Non nécessaire (dernier audit il y a ${jours.toFixed(1)} jour(s)).`);
        return;
      }
    }
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuilleCache = ss.getSheetByName("CACHE_IA");
  const feuilleAO = ss.getSheetByName(SHEET_AO);
  const feuilleParams = ss.getSheetByName(SHEET_PARAMS);

  if (!feuilleCache || !feuilleAO || !feuilleParams) {
    Logger.log("[AUDIT IA] Feuilles requises introuvables.");
    return;
  }

  const emailAdmin = feuilleParams.getRange("H2").getValue().toString().trim();
  if (!emailAdmin) return;

  const dataCache = feuilleCache.getDataRange().getValues();
  if (dataCache.length <= 1) {
    Logger.log("[AUDIT IA] Cache vide, audit ignoré.");
    props.setProperty(RM_PROP_DERNIERE_AUDIT_IA, maintenant.toISOString());
    return;
  }

  const mapAO = new Map();
  const dataAO = feuilleAO.getDataRange().getValues();
  for (let i = 1; i < dataAO.length; i++) {
    const id = (dataAO[i][0] || "").toString().trim();
    if (id) {
      mapAO.set(id, {
        numeroAvis: (dataAO[i][1] || "").toString(),
        titre: (dataAO[i][5] || "").toString(),
        maitreOuvrage: (dataAO[i][6] || "").toString(),
        region: (dataAO[i][7] || "").toString(),
        montant: (dataAO[i][10] || "").toString(),
        lienDetail: (dataAO[i][12] || "").toString()
      });
    }
  }

  const entreesValides = [];
  for (let i = 1; i < dataCache.length; i++) {
    const idAO = (dataCache[i][0] || "").toString().trim();
    const idClient = (dataCache[i][1] || "").toString().trim();
    const noteIA = parseInt(dataCache[i][2], 10);
    const motif = (dataCache[i][3] || "").toString().trim();
    if (idAO && idClient && !isNaN(noteIA) && mapAO.has(idAO)) {
      entreesValides.push({ idAO, idClient, noteIA, motif });
    }
  }

  if (entreesValides.length === 0) {
    Logger.log("[AUDIT IA] Aucune entrée valide pour l'audit.");
    props.setProperty(RM_PROP_DERNIERE_AUDIT_IA, maintenant.toISOString());
    return;
  }

  const hautes = entreesValides.filter(e => e.noteIA >= 4);
  const basses = entreesValides.filter(e => e.noteIA <= 2);
  const medianes = entreesValides.filter(e => e.noteIA === 3);

  function pigerAleatoirement(tableau, nombre) {
    const copie = tableau.slice();
    const resultat = [];
    while (resultat.length < nombre && copie.length > 0) {
      const idx = Math.floor(Math.random() * copie.length);
      resultat.push(copie.splice(idx, 1)[0]);
    }
    return resultat;
  }

  let echantillon = [];
  echantillon = echantillon.concat(pigerAleatoirement(hautes, 2));
  echantillon = echantillon.concat(pigerAleatoirement(basses, 2));
  echantillon = echantillon.concat(pigerAleatoirement(medianes, 1));

  if (echantillon.length < RM_TAILLE_ECHANTILLON_AUDIT_IA) {
    const dejaPris = new Set(echantillon.map(e => `${e.idAO}|${e.idClient}`));
    const reste = entreesValides.filter(e => !dejaPris.has(`${e.idAO}|${e.idClient}`));
    const complement = pigerAleatoirement(reste, RM_TAILLE_ECHANTILLON_AUDIT_IA - echantillon.length);
    echantillon = echantillon.concat(complement);
  }

  const env = rpDetecterEnvironnement();
  const prefixeSujet = env.estTest ? "[TEST] " : "";
  const bandeauEnv = rpConstruireBandeauEnv(env);

  let cartesHtml = "";
  echantillon.forEach((e, index) => {
    const ao = mapAO.get(e.idAO) || {};
    const couleurNote = e.noteIA >= 4 ? "#10b981" : (e.noteIA <= 2 ? "#ef4444" : "#f59e0b");
    cartesHtml += `
      <div style="border: 1px solid #e2e8f0; border-left: 4px solid ${couleurNote}; border-radius: 6px; padding: 14px; margin-bottom: 12px; background: #ffffff;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
          <span style="font-size: 12px; color: #64748b;">#${index + 1} — Client ${secEchapperHtml(e.idClient)}</span>
          <span style="background-color: ${couleurNote}; color: #ffffff; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">Note IA : ${e.noteIA}/5</span>
        </div>
        <div style="font-size: 12px; color: #64748b; margin-bottom: 4px;">ID : ${secEchapperHtml(e.idAO)} — Réf : ${secEchapperHtml(ao.numeroAvis || "N/A")}</div>
        <div style="font-size: 13px; font-weight: bold; color: #0f172a; margin-bottom: 6px;">${secEchapperHtml(ao.titre || "(Titre indisponible)")}</div>
        <div style="font-size: 12px; color: #334155; margin-bottom: 6px;">
          <strong>Maître d'ouvrage :</strong> ${secEchapperHtml(ao.maitreOuvrage || "Non précisé")} | <strong>Région :</strong> ${secEchapperHtml(ao.region || "Non précisée")} | <strong>Montant :</strong> ${secEchapperHtml(ao.montant || "Non précisé")}
        </div>
        <div style="font-size: 12px; color: #0f172a; background: #f8fafc; padding: 8px; border-radius: 4px; font-style: italic; margin-bottom: 8px;">
          <strong>Motif IA :</strong> ${secEchapperHtml(e.motif || "(aucun motif)")}
        </div>
        <div style="font-size: 12px;">
          <a href="${secLienSur(ao.lienDetail) || "#"}" style="color: #0f766e; text-decoration: underline;">Vérifier l'avis original</a>
        </div>
      </div>`;
  });

  const corpsHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto; color: #0f172a;">
      <div style="background-color: #0f172a; color: #ffffff; padding: 18px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">🔍 Audit Qualité IA — Échantillon Hebdomadaire</h2>
        <p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8;">
          ${echantillon.length} évaluations Gemini à vérifier manuellement
        </p>
      </div>
      <div style="padding: 18px; background: #f8fafc; border: 1px solid #e2e8f0; border-top: none;">
        ${bandeauEnv}
        <p style="font-size: 13px; color: #334155; margin-bottom: 14px;">
          Voici un échantillon représentatif des évaluations récentes de l'IA Gemini.
          Prenez 5 minutes pour les parcourir et repérer toute anomalie.
        </p>
        ${cartesHtml}
        <p style="font-size: 11px; color: #94a3b8; text-align: center; margin-top: 16px;">
          Échantillon équilibré : 2 notes hautes, 2 notes basses, 1 note médiane.
        </p>
      </div>
      <div style="text-align: center; font-size: 11px; color: #94a3b8; padding: 10px;">
        Système de veille automatisée — Audit qualité IA<br>
        <span style="font-size: 10px; color: #cbd5e1;">
          Source : ${secEchapperHtml(env.nomFichier)} — Environnement : ${secEchapperHtml(env.libelle)}
        </span>
      </div>
    </div>`;

  try {
    MailApp.sendEmail({
      to: emailAdmin,
      subject: `${prefixeSujet}[Audit Qualité IA] Échantillon de ${echantillon.length} évaluations — ${Utilities.formatDate(maintenant, "Africa/Douala", "dd/MM/yyyy")}`,
      htmlBody: corpsHtml
    });
    Logger.log(`[AUDIT IA] Échantillon de ${echantillon.length} évaluation(s) envoyé à ${emailAdmin} [${env.libelle}].`);
    props.setProperty(RM_PROP_DERNIERE_AUDIT_IA, maintenant.toISOString());
  } catch (err) {
    Logger.log(`[AUDIT IA] Erreur d'envoi : ${err.message}`);
  }
}

function reinitialiserAuditIA() {
  PropertiesService.getScriptProperties().deleteProperty(RM_PROP_DERNIERE_AUDIT_IA);
  Logger.log("[AUDIT IA] Marqueur réinitialisé. Prochain audit possible immédiatement.");
}

// ----------------------------------------------------------------------------
// FINALISATION ET CONSIGNATION DU RAPPORT
// ----------------------------------------------------------------------------

function finaliserEtConsignerRapport(metriques) {
  let estTestManuel = false;
  if (!metriques) {
    estTestManuel = true;
    Logger.log("Exécution directe détectée : génération d'un rapport de validation.");
    metriques = initialiserMetriquesSession();
    metriques.pagesScannees = 8;
    metriques.nouveauxAO = 14;
    metriques.sources = {
      "ARMP": 8,
      "Banque Mondiale": 2,
      "BAD": 1,
      "ONU": 2,
      "UE": 0,
      "AFD": 1,
      "DevelopmentAid": 0,
      "COLEPS": 0
    };
    metriques.aoIgnoresHorsFenetre = 5;
    metriques.dureeCollecteSec = 42;
    metriques.appelsGemini = 4;
    metriques.matchsMotsCles = 6;
    metriques.matchsSemantiqueIA = 5;
    metriques.emailsEnvoyes = 2;
    metriques.detailDistribution = { "Client Démo 1": 7, "Client Démo 2": 4 };
  }

  metriques.fin = new Date();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuilleParams = ss.getSheetByName(SHEET_PARAMS);
  if (!feuilleParams) {
    Logger.log("Erreur : Feuille PARAMETRES introuvable.");
    return;
  }

  const env = rpDetecterEnvironnement();
  const prefixeSujet = env.estTest ? "[TEST] " : "";
  const bandeauEnv = rpConstruireBandeauEnv(env);

  const emailAdmin = feuilleParams.getRange("H2").getValue().toString().trim();
  const activeReporting = feuilleParams.getRange("H8").getValue().toString().trim().toUpperCase();
  let seuilQuotaAbsolu = parseInt(feuilleParams.getRange("H9").getValue(), 10);
  if (isNaN(seuilQuotaAbsolu) || seuilQuotaAbsolu <= 0) seuilQuotaAbsolu = 10;

  const quotaRestant = MailApp.getRemainingDailyQuota();
  metriques.quotaEmailsRestant = quotaRestant;

  if (!estTestManuel) {
    if (detecterCollecteMuetteRecurrente(metriques)) {
      const msg = `Collecte muette sur ${RM_SEUIL_SESSIONS_MUETTES} sessions consécutives (0 avis inséré ET 0 avis vu hors fenêtre). Le scraper ARMP est peut-être cassé ou bloqué.`;
      metriques.alertesCritiques.push(msg);
      envoyerAlerteCritiqueImmediate("Collecte muette récurrente", msg);
    }

    if (metriques.retriesErreursIA > 0) {
      metriques.alertesCritiques.push(
        `${metriques.retriesErreursIA} incident(s) de communication avec l'API Gemini.`
      );
    }

    if (quotaRestant <= seuilQuotaAbsolu) {
      const msgQuota = `Quota d'envoi Gmail critique : ${quotaRestant} e-mails restants (seuil : ${seuilQuotaAbsolu}).`;
      metriques.alertesCritiques.push(msgQuota);
      envoyerAlerteCritiqueImmediate("Quota Gmail Presque Épuisé", msgQuota);
    }
  }

  if (metriques.alertesCritiques.length > 0 && metriques.statut !== "ÉCHEC") {
    metriques.statut = "AVERTISSEMENT";
  }

  const debutDate = (metriques.debut instanceof Date) ? metriques.debut : new Date(metriques.debut);
  const dureeTotaleSec = Math.round((metriques.fin.getTime() - debutDate.getTime()) / 1000);
  const dateSessionStr = Utilities.formatDate(metriques.fin, "Africa/Douala", "yyyy-MM-dd HH:mm:ss");

  const detailClientsArray = [];
  for (let client in metriques.detailDistribution) {
    detailClientsArray.push(`${client} : ${metriques.detailDistribution[client]}`);
  }
  const detailDistributionStr = detailClientsArray.length > 0 ? detailClientsArray.join(" | ") : "Aucun envoi";

  // ---- Journalisation du détail des sources (pour debug) ----
  Logger.log("[REPORTING] Détail des sources :");
  let totalSourcesCompte = 0;
  if (metriques.sources) {
    for (let src in metriques.sources) {
      const val = metriques.sources[src] || 0;
      totalSourcesCompte += val;
      Logger.log(`  - ${src} : ${val}`);
    }
  }
  Logger.log(`[REPORTING] Total sources : ${totalSourcesCompte} | Nouveaux AO : ${metriques.nouveauxAO}`);

  const ventilationSourcesArray = [];
  if (metriques.sources) {
    for (let src in metriques.sources) {
      if (metriques.sources[src] > 0) {
        ventilationSourcesArray.push(`${src}: ${metriques.sources[src]}`);
      }
    }
  }
  const ventilationStr = ventilationSourcesArray.length > 0
    ? `[Sources: ${ventilationSourcesArray.join(", ")}]`
    : "[Sources: 0]";

  const alertesTexte = metriques.alertesCritiques.length > 0
    ? metriques.alertesCritiques.join(" ; ")
    : (estTestManuel ? "Test de validation" : "R.A.S");

  const remarquesCompletes = `${ventilationStr} ${alertesTexte}`;

  // ---- Écriture dans JOURNAL_MONITORING ----
  let feuilleLog = ss.getSheetByName(SHEET_MONITORING);
  if (!feuilleLog) {
    feuilleLog = ss.insertSheet(SHEET_MONITORING);
    feuilleLog.appendRow([
      "Date_Session", "Statut_Session", "Duree_Totale_Sec",
      "Pages_Scannees", "AO_Nouveaux_Inseres", "AO_Ignores_Hors_Fenetre", "Temps_Collecte_Sec",
      "Appels_IA_Gemini", "Retries_Erreurs_IA", "Matchs_Mots_Cles", "Matchs_Semantique_IA",
      "Emails_Envoyes", "Detail_Distribution", "Alertes_Forcloses_Ecartees",
      "Quota_Emails_Restant", "Remarques_Alertes"
    ]);
    feuilleLog.getRange(1, 1, 1, 16).setFontWeight("bold").setBackground("#0f172a").setFontColor("#ffffff");
  }

  feuilleLog.appendRow(secNeutraliserLigne([
    dateSessionStr,
    metriques.statut,
    dureeTotaleSec,
    metriques.pagesScannees,
    metriques.nouveauxAO,
    metriques.aoIgnoresHorsFenetre,
    metriques.dureeCollecteSec,
    metriques.appelsGemini,
    metriques.retriesErreursIA,
    metriques.matchsMotsCles,
    metriques.matchsSemantiqueIA,
    metriques.emailsEnvoyes,
    detailDistributionStr,
    metriques.alertesForclosesEcartees,
    quotaRestant,
    remarquesCompletes
  ]));

  const derniereLigne = feuilleLog.getLastRow();
  const celluleStatut = feuilleLog.getRange(derniereLigne, 2);
  if (metriques.statut === "SUCCÈS") {
    celluleStatut.setBackground("#dcfce7").setFontColor("#15803d");
  } else if (metriques.statut === "AVERTISSEMENT") {
    celluleStatut.setBackground("#fef9c3").setFontColor("#854d0e");
  } else {
    celluleStatut.setBackground("#fee2e2").setFontColor("#b91c1c");
  }

  // ---- Construction de l'email admin ----
  if (activeReporting === "OUI" && emailAdmin) {
    const dateJourStr = Utilities.formatDate(metriques.fin, "Africa/Douala", "dd/MM/yyyy");
    const objetRapport = `${prefixeSujet}[Bilan Veille Consolidée] Statut : ${metriques.statut} - ${dateJourStr}`;
    const couleurStatutBadge = metriques.statut === "SUCCÈS"
      ? "#10b981"
      : (metriques.statut === "AVERTISSEMENT" ? "#f59e0b" : "#ef4444");

    let bandeauAlerteHtml = "";
    if (metriques.alertesCritiques.length > 0) {
      bandeauAlerteHtml = `
        <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 10px; margin-bottom: 15px; border-radius: 4px;">
          <strong style="color: #b91c1c;">Anomalies signalées :</strong>
          <ul style="margin: 5px 0 0 15px; padding: 0; color: #7f1d1d; font-size: 12px;">
            ${metriques.alertesCritiques.map(a => `<li>${secEchapperHtml(a)}</li>`).join("")}
          </ul>
        </div>`;
    }

    // ---- FIX V3.1 : filtrage des sources à 0 + ligne TOTAL ----
    let lignesSourcesHtml = "";
    let totalAffiche = 0;
    let nbSourcesActives = 0;
    if (metriques.sources) {
      for (let s in metriques.sources) {
        const val = metriques.sources[s] || 0;
        if (val > 0) {
          nbSourcesActives++;
          totalAffiche += val;
          lignesSourcesHtml += `<tr>
            <td style="padding: 4px 8px; border-bottom: 1px solid #e2e8f0; font-size: 12px;">${secEchapperHtml(s)}</td>
            <td style="padding: 4px 8px; border-bottom: 1px solid #e2e8f0; font-size: 12px; font-weight: bold; text-align: right;">${val}</td>
          </tr>`;
        }
      }
    }

    let blocSourcesHtml;
    if (nbSourcesActives === 0) {
      blocSourcesHtml = `
        <div style="background-color: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 4px; padding: 12px; margin-bottom: 14px; font-size: 12px; color: #64748b; text-align: center; font-style: italic;">
          Aucun avis inséré cette session — aucune source n'a produit de nouvel élément.
        </div>`;
    } else {
      blocSourcesHtml = `
        <table style="width: 100%; border-collapse: collapse; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; margin-bottom: 14px;">
          <thead>
            <tr style="background: #f1f5f9;">
              <th style="padding: 4px 8px; text-align: left; font-size: 11px; color: #64748b;">ORGANISME</th>
              <th style="padding: 4px 8px; text-align: right; font-size: 11px; color: #64748b;">AVIS INSÉRÉS</th>
            </tr>
          </thead>
          <tbody>
            ${lignesSourcesHtml}
            <tr style="background: #e2e8f0;">
              <td style="padding: 5px 8px; font-size: 12px; font-weight: bold; color: #0f172a;">TOTAL (${nbSourcesActives} source${nbSourcesActives > 1 ? "s" : ""} active${nbSourcesActives > 1 ? "s" : ""})</td>
              <td style="padding: 5px 8px; font-size: 12px; font-weight: bold; text-align: right; color: #0f172a;">${totalAffiche}</td>
            </tr>
          </tbody>
        </table>`;
    }

    const corpsEmailHtml = `
      <!DOCTYPE html>
      <html>
        <body style="font-family: Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 12px; color: #1e293b;">
          <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden;">

            <div style="background-color: #0f172a; padding: 16px; color: #ffffff;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 14px; font-weight: bold;">RAPPORT DE VEILLE MULTI-SOURCES</span>
                <span style="background-color: ${couleurStatutBadge}; color: #ffffff; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">
                  ${metriques.statut}
                </span>
              </div>
              <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">Session du ${dateJourStr} exécutée en ${dureeTotaleSec}s</div>
            </div>

            <div style="padding: 16px;">
              ${bandeauEnv}
              ${bandeauAlerteHtml}

              <h4 style="margin: 0 0 8px 0; color: #0284c7; text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px;">1. Collecte Multi-Sources</h4>
              <p style="font-size: 13px; line-height: 1.5; margin: 0 0 10px 0;">
                • Total nouveaux avis insérés : <strong>${metriques.nouveauxAO}</strong><br>
                • Avis forclos ou hors fenêtre : <strong>${metriques.aoIgnoresHorsFenetre}</strong><br>
                • Durée globale de la collecte : <strong>${metriques.dureeCollecteSec}s</strong>
              </p>

              ${blocSourcesHtml}

              <h4 style="margin: 0 0 8px 0; color: #0284c7; text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px;">2. Qualification &amp; Matching IA</h4>
              <div style="font-size: 12px; color: #475569; background: #f8fafc; border-left: 3px solid #94a3b8; padding: 8px 10px; margin-bottom: 10px; border-radius: 3px; line-height: 1.5;">
                <em>Trois compteurs distincts, à ne pas confondre :</em><br>
                • <strong>Requêtes HTTP</strong> : nombre d'appels réseau réels vers Gemini (1 requête = 1 lot d'avis × clients).<br>
                • <strong>Paires rejetées avant l'IA</strong> : combinaisons (avis × client) écartées par le pré-filtrage gratuit (région, exclusions, montant).<br>
                • <strong>Paires soumises à l'IA</strong> : combinaisons réellement envoyées à Gemini pour notation.
              </div>
              <p style="font-size: 13px; line-height: 1.5; margin: 0 0 14px 0;">
                • Requêtes HTTP vers Gemini : <strong>${metriques.appelsGemini}</strong><br>
                • Paires rejetées avant l'IA : <strong>${metriques.pairesFiltreesIA || 0}</strong><br>
                • Paires soumises à l'IA : <strong>${metriques.pairesEvalueesIA || 0}</strong><br>
                • Matchs par mots-clés directs : <strong>${metriques.matchsMotsCles}</strong><br>
                • Matchs à haute pertinence IA (score ≥ 4) : <strong>${metriques.matchsSemantiqueIA}</strong><br>
                • Incidents API Gemini : <strong>${metriques.retriesErreursIA}</strong><br>
                • Alertes générées : <strong>${metriques.alertesGenerees || 0}</strong>
              </p>

              <h4 style="margin: 0 0 8px 0; color: #0284c7; text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px;">3. Distribution des Alertes</h4>
              <p style="font-size: 13px; line-height: 1.5; margin: 0 0 14px 0;">
                • E-mails expédiés avec succès : <strong>${metriques.emailsEnvoyes}</strong><br>
                • Détail par souscripteur : <strong>${secEchapperHtml(detailDistributionStr)}</strong><br>
                • Alertes forcloses écartées : <strong>${metriques.alertesForclosesEcartees}</strong>
              </p>

              <h4 style="margin: 0 0 8px 0; color: #0284c7; text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px;">4. Solde &amp; Quotas</h4>
              <p style="font-size: 13px; line-height: 1.5; margin: 0 0 0 0;">
                • Quota d'envoi Gmail restant : <strong>${quotaRestant}</strong>
              </p>
            </div>

            <div style="background-color: #f1f5f9; padding: 10px 16px; font-size: 11px; color: #64748b; text-align: center;">
              Synthèse consignée automatiquement dans la feuille <strong>JOURNAL_MONITORING</strong>.<br>
              <span style="font-size: 10px; color: #cbd5e1;">
                Source : ${secEchapperHtml(env.nomFichier)} — Environnement : ${secEchapperHtml(env.libelle)}
              </span>
            </div>

          </div>
        </body>
      </html>`;

    MailApp.sendEmail({
      to: emailAdmin,
      subject: objetRapport,
      htmlBody: corpsEmailHtml
    });

    Logger.log(`-> Rapport consolidé transmis à l'administrateur : ${emailAdmin} [${env.libelle}]`);
  }

  // ------------------------------------------------------------------
  // Audit qualité IA — deux volets complémentaires
  // ------------------------------------------------------------------
  try {
    envoyerAuditQualiteIAPeriode();
  } catch (e) {
    Logger.log(`[AUDIT IA] Erreur inattendue (volet humain) : ${e.message}`);
  }

  try {
    if (typeof iagJobD_AuditerQualite === "function") {
      iagJobD_AuditerQualite();
    }
  } catch (e) {
    Logger.log(`[AUDIT IA] Erreur inattendue (Job D) : ${e.message}`);
  }

  // ------------------------------------------------------------------
  // Rafraîchissement du dashboard
  // ------------------------------------------------------------------
  try {
    rafraichirDashboard();
  } catch (e) {
    Logger.log(`[DASHBOARD] Erreur inattendue : ${e.message}`);
  }
}