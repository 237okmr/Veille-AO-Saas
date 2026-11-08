// >>> FICHIER : EnvoiEmails.gs <<< (à coller dans l'onglet du même nom)
/**
 * ============================================================================
 * SCRIPT 3 : DISTRIBUTION DES ALERTES V7.6
 * ============================================================================
 * Nouveauté V7.6 (LOT S1a) : tout texte venu de l'extérieur (titre, maître d'ouvrage,
 * procédure, motif et résumé de l'IA, nom du client, adresse de réponse, nom du
 * fichier) est ÉCHAPPÉ avant d'entrer dans le HTML de l'e-mail. Les liens « Consulter
 * l'avis » et « Télécharger le DAO » ne sont affichés que s'ils commencent par
 * http:// ou https:// et ne contiennent ni espace, ni guillemet, ni chevron.
 * La mise en page est inchangée. Les cartes et le corps du message sont construits
 * par eeConstruireCarteDossier() et eeConstruireCorpsEmail() (testables sans envoi) :
 * test sans risque : eeTesterRenduEmailSansEnvoi().
 *
 * Nouveauté V7.5 (LOT 6b) : le verrou passe par Verrou.gs (attente 2 minutes puis
 * abandon avec alerte e-mail ; sans blocage quand la routine du matin, qui tient
 * déjà le verrou, appelle cet envoi).
 *
 * Nouveauté V7.4 (LOT 5) : la clé Gemini du résumé IA (Job C) est lue via
 * iagLireClesGemini() (coffre en priorité) et non plus directement en H1.
 *
 * Rappel V7.3 (LOT 1 — envoi sécurisé) :
 * - Statuts ENVOYÉ / REPORTÉ / EXPIRÉ écrits immédiatement après chaque e-mail.
 * - E-mail non parti : signalé à l'administrateur, alerte conservée en attente.
 * - Verrou anti-envois simultanés + contrôle des en-têtes de ALERTES_A_ENVOYER.
 * - Mode simulation : eeTesterEnvoiSecurise() (aucun e-mail, aucune écriture).
 *
 * Rappel V7.1 :
 * - Détection automatique de l'environnement (TEST ou PRODUCTION) à partir
 *   du nom du classeur Google Sheets. Si le nom contient un mot-clé de test
 *   (test, copie, sauvegarde, backup, dev, draft, sandbox, essai, tmp, temp),
 *   le sujet du mail est préfixé "[TEST]" et un bandeau orange vif est
 *   inséré en tête du corps.
 * - Le nom exact du fichier source figure en pied de tous les mails,
 *   quelle que soit la version (test ou production).
 *
 * Rappel V7.0 :
 * - Intégration du JOB C (résumé d'accroche par client via iagJobC_ResumeClient).
 *   Si le module IA_Gemini est absent ou si la génération échoue, l'email part
 *   normalement sans la phrase d'accroche. Aucun blocage.
 *
 * Rappel V6.2 : parseDateCameroun n'est plus définie ici (elle vit dans le
 * Script 1). Ne pas la redéfinir sous peine d'écrasement silencieux.
 * ============================================================================
 */

const EE_PLAFOND_DOSSIERS_PAR_EMAIL = 15;
const EE_SEUIL_URGENCE_JOURS = 3;

/** LOT S1a — Échappe un texte pour le HTML (s'appuie sur SecuriteDonnees.gs, même règle en secours). */
function eeEchapper(texte) {
  if (typeof secEchapperHtml === "function") return secEchapperHtml(texte);
  return String(texte === null || texte === undefined ? "" : texte)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** LOT S1a — Lien sûr pour un attribut href (échappé), ou "" s'il n'est pas http(s) propre. */
function eeLienSur(url) {
  if (typeof secLienSur === "function") return secLienSur(url);
  const u = String(url === null || url === undefined ? "" : url).trim();
  if (!/^https?:\/\/[^\s"'<>`\\]+$/i.test(u)) return "";
  return eeEchapper(u);
}

// Mots-clés qui, dans le nom du classeur, signalent un environnement de test.
const EE_MOTIFS_TEST = [
  "test", "copie", "copy", "sauvegarde", "backup",
  "dev", "draft", "sandbox", "essai", "tmp", "temp"
];

/**
 * Détecte l'environnement d'exécution à partir du nom du classeur.
 * @return {Object} { nomFichier, estTest, libelle, couleurBandeau }
 */
function eeDetecterEnvironnement() {
  let nomFichier = "";
  try {
    nomFichier = SpreadsheetApp.getActiveSpreadsheet().getName() || "";
  } catch (e) {
    nomFichier = "(nom du classeur inaccessible)";
  }

  const nomLower = nomFichier.toLowerCase();
  let estTest = false;
  for (let i = 0; i < EE_MOTIFS_TEST.length; i++) {
    if (nomLower.includes(EE_MOTIFS_TEST[i])) {
      estTest = true;
      break;
    }
  }

  return {
    nomFichier: nomFichier,
    estTest: estTest,
    libelle: estTest ? "TEST" : "PRODUCTION",
    // Couleurs du bandeau d'avertissement
    couleurFond: estTest ? "#fef3c7" : "",
    couleurBordure: estTest ? "#f59e0b" : "",
    couleurTexte: estTest ? "#92400e" : ""
  };
}

/**
 * Construit le bandeau d'avertissement (vide en production).
 */
function eeConstruireBandeauEnv(env) {
  if (!env.estTest) return "";
  return `
    <div style="background-color: ${env.couleurFond}; border: 2px solid ${env.couleurBordure};
                color: ${env.couleurTexte}; padding: 12px 14px; margin-bottom: 16px;
                border-radius: 6px; font-family: Arial, sans-serif;">
      <div style="font-size: 14px; font-weight: bold; margin-bottom: 4px;">
        ⚠️ ENVIRONNEMENT DE TEST
      </div>
      <div style="font-size: 12px;">
        Ce message provient d'une copie ou d'un environnement de test et
        <strong>ne doit pas être pris comme une alerte de production</strong>.<br>
        Fichier source : <code style="background: rgba(0,0,0,0.06); padding: 1px 4px; border-radius: 3px;">${eeEchapper(env.nomFichier)}</code>
      </div>
    </div>`;
}

/**
 * Construit le pied de page avec traçabilité de la source.
 */
function eeConstruirePiedEnv(env, emailReplyTo) {
  return `
    <div style="text-align: center; font-size: 11px; color: #94a3b8; padding: 12px;">
      Plateforme automatisée d'intelligence économique | Pour toute question : ${eeEchapper(emailReplyTo)}<br>
      <span style="font-size: 10px; color: #cbd5e1;">
        Source : ${eeEchapper(env.nomFichier)} — Environnement : ${eeEchapper(env.libelle)}
      </span>
    </div>`;
}

/**
 * LOT S1a — Construit la carte HTML d'un dossier. Tout texte externe est échappé ;
 * un lien n'est affiché que s'il est sûr (http/https propre).
 * @param {Object} d { score, numeroAvis, idAO, motif, details: { ... } }
 */
function eeConstruireCarteDossier(d) {
  const ao = d.details || {};
  const dateAffichee = (ao.dateLimite || "Non précisée").toString().replace(/^[']/, "");

  let etiquetteDateLimite = "";
  if (ao.typePublication === "Attribution" || dateAffichee.includes("N/A")) {
    etiquetteDateLimite = `<span style="color: #2e7d32; font-weight: bold;">Opportunité de sous-traitance</span> (Attribution récente)`;
  } else if (dateAffichee.includes("Estimée") || dateAffichee.startsWith("~")) {
    etiquetteDateLimite = `<span style="color: #d97706; font-weight: bold;">Date limite estimée :</span> ${eeEchapper(dateAffichee)}`;
  } else {
    etiquetteDateLimite = `<strong>Date limite :</strong> ${eeEchapper(dateAffichee)}${genererBadgeEcheance(dateAffichee)}`;
  }

  const lienDetail = eeLienSur(ao.lienDetail);
  const lienDAO = eeLienSur(ao.lienDAO);
  const boutonDetail = lienDetail
    ? `<a href="${lienDetail}" style="background-color: #0f766e; color: #ffffff; text-decoration: none; padding: 6px 12px; font-size: 12px; border-radius: 4px; font-weight: bold; margin-right: 8px; display: inline-block;">Consulter l'avis</a>`
    : "";
  const boutonDAO = lienDAO
    ? `<a href="${lienDAO}" style="background-color: #f1f5f9; color: #0f766e; text-decoration: none; padding: 6px 12px; font-size: 12px; border-radius: 4px; font-weight: bold; border: 1px solid #cbd5e1; display: inline-block;">Télécharger le DAO</a>`
    : "";

  return `
      <div style="border: 1px solid #e2e8f0; border-left: 4px solid #0f766e; border-radius: 6px; padding: 14px; margin-bottom: 14px; background-color: #ffffff;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
          <span style="background-color: #f1f5f9; color: #475569; font-size: 11px; font-weight: bold; padding: 2px 8px; border-radius: 4px;">${eeEchapper(ao.procedure || "Marché Public")}</span>
          <span style="color: #0f766e; font-weight: bold; font-size: 13px;">Score: ${(Number(d.score) || 0).toFixed(1)}/5</span>
        </div>
        <div style="font-size: 12px; color: #64748b; margin-bottom: 4px;">RÉF : ${eeEchapper(d.numeroAvis || d.idAO)}</div>
        <div style="font-size: 14px; font-weight: bold; color: #0f172a; margin-bottom: 8px; line-height: 1.4;">${eeEchapper(ao.titre || "Avis de marché public")}</div>
        <div style="font-size: 12px; color: #334155; margin-bottom: 8px; font-style: italic; background-color: #f8fafc; padding: 6px; border-radius: 4px;">
          <strong>Pertinence IA :</strong> ${eeEchapper(d.motif || "Sélectionné pour vos compétences.")}
        </div>
        <div style="font-size: 12px; color: #334155; margin-bottom: 4px;">
          <strong>Maître d'ouvrage :</strong> ${eeEchapper(ao.maitreOuvrage || "Non précisé")} | <strong>Région :</strong> ${eeEchapper(ao.region || "Nationale")}
        </div>
        <div style="font-size: 12px; color: #334155; margin-bottom: 8px;">
          <strong>Montant :</strong> ${eeEchapper(ao.montant || "Non précisé")} | ${etiquetteDateLimite}
        </div>
        <div style="margin-top: 10px;">
          ${boutonDetail}
          ${boutonDAO}
        </div>
      </div>`;
}

/**
 * LOT S1a — Construit le corps complet de l'e-mail. Le nom du client est échappé ;
 * bandeauEnv, blocResume, cartesHtml et noteAutres sont du HTML déjà construit
 * (et déjà échappé) par les fonctions ci-dessus.
 */
function eeConstruireCorpsEmail(p) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto; color: #0f172a;">
      <div style="background-color: #0f766e; color: #ffffff; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
        <h2 style="margin: 0; font-size: 20px;">Veille Stratégique des Marchés Publics</h2>
        <p style="margin: 4px 0 0 0; font-size: 14px;">Sélection exclusive pour ${eeEchapper(p.clientNom)}</p>
      </div>
      <div style="padding: 20px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-top: none;">
        ${p.bandeauEnv}
        <p style="font-size: 13px; margin-bottom: 12px;">
          Bonjour,<br>
          Voici les <strong>${p.nbTop} opportunité(s) prioritaires</strong> sur ${p.nbTotal} détectée(s) pour votre profil.
        </p>
        ${p.blocResume}
        ${p.cartesHtml}
        ${p.noteAutres}
      </div>
      ${eeConstruirePiedEnv(p.env, p.emailReplyTo)}
    </div>`;
}

/**
 * Découpe une chaîne d'emails en liste d'adresses propres.
 */
function extraireAdressesEmails(chaineEmails) {
  if (!chaineEmails) return [];
  return chaineEmails.toString()
    .split(/[;,]/)
    .map(e => e.trim())
    .filter(e => e.length > 0 && e.includes("@"));
}

function verifierSiAvisExpire(dateLimiteStr) {
  if (!dateLimiteStr) return false;
  const str = dateLimiteStr.toString().trim();
  if (str.includes("N/A") || str.includes("attribué")) return false;

  if (str.includes("~")) {
    const extrait = /^['~]*([0-9]{2}-[0-9]{2}-[0-9]{4})/.exec(str.replace(/^['~]/, ""));
    if (extrait) {
      const d = parseDateCameroun(extrait[1] + " 23:59");
      return d ? d.getTime() < new Date().getTime() : false;
    }
    return false;
  }

  const d = parseDateCameroun(str);
  if (!d) return false;
  return d.getTime() < new Date().getTime();
}

function calculerJoursRestants(dateLimiteStr) {
  const d = parseDateCameroun(String(dateLimiteStr || "").replace(/^['~]/, ""));
  if (!d) return null;
  const diffMs = d.getTime() - new Date().getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function genererBadgeEcheance(dateLimiteStr) {
  if (!dateLimiteStr || dateLimiteStr.includes("N/A")) return "";
  const jours = calculerJoursRestants(dateLimiteStr);
  if (jours === null) return "";
  if (jours <= 0) {
    return ` <span style="background-color: #fecaca; color: #991b1b; font-size: 11px; font-weight: bold; padding: 2px 6px; border-radius: 4px;">FORCLOS</span>`;
  }
  if (jours <= 3) {
    return ` <span style="background-color: #fee2e2; color: #b91c1c; font-size: 11px; font-weight: bold; padding: 2px 6px; border-radius: 4px;">Urgent J-${jours}</span>`;
  }
  if (jours <= 7) {
    return ` <span style="background-color: #fef3c7; color: #92400e; font-size: 11px; font-weight: bold; padding: 2px 6px; border-radius: 4px;">J-${jours}</span>`;
  }
  return "";
}

/**
 * Charge la carte ID_Client -> Prompt_Metier_IA depuis la feuille CLIENTS.
 */
function eeChargerPromptsMetier(ss) {
  const map = new Map();
  const feuille = ss.getSheetByName("CLIENTS");
  if (!feuille) return map;

  const data = feuille.getDataRange().getValues();
  if (data.length <= 1) return map;

  const h = data[0].map(v => v.toString().trim().toUpperCase());
  const idxId = h.indexOf("ID_CLIENT");
  const idxPrompt = h.indexOf("PROMPT_METIER_IA");
  if (idxId === -1) return map;

  for (let i = 1; i < data.length; i++) {
    const id = (data[i][idxId] || "").toString().trim();
    if (!id) continue;
    const prompt = (idxPrompt !== -1 && data[i][idxPrompt]) ? data[i][idxPrompt].toString().trim() : "";
    map.set(id, { promptMetier: prompt });
  }
  return map;
}

// ============================================================================
// V7.3 — ENVOI SÉCURISÉ (LOT 1)
// ============================================================================
// 1. Les statuts (ENVOYÉ / REPORTÉ / EXPIRÉ) sont écrits dans la feuille
//    IMMÉDIATEMENT après chaque e-mail, et plus à la toute fin : une coupure
//    en cours de route ne provoque plus de renvoi en double.
// 2. Un e-mail qui n'a pas pu partir est signalé (session en AVERTISSEMENT +
//    alerte à l'administrateur). L'alerte reste EN_ATTENTE pour le lendemain.
// 3. Un verrou empêche deux envois de tourner en même temps
//    (ex. clic manuel pendant le déclencheur).
// Aucune ligne n'est jamais supprimée. Le schéma de la feuille est inchangé.
// ============================================================================

const EE_COL_STATUT = 8;   // colonne H : Statut_Envoi
const EE_COL_DATE_ENVOI = 9; // colonne I : Date_Envoi

/**
 * Vérifie que les colonnes de ALERTES_A_ENVOYER n'ont pas bougé.
 * Le code lit des positions fixes : si quelqu'un déplace une colonne,
 * on préfère s'arrêter plutôt que d'écrire au mauvais endroit.
 */
function eeEnteteAlertesConforme(feuille) {
  const h = feuille.getRange(1, 1, 1, 13).getValues()[0]
    .map(function (v) { return String(v || "").trim().toUpperCase(); });
  return h[1] === "ID_AO" && h[3] === "ID_CLIENT" &&
         h[7] === "STATUT_ENVOI" && h[8] === "DATE_ENVOI";
}

/**
 * Écrit tout de suite le statut d'un groupe de lignes, puis force
 * l'enregistrement dans la feuille (flush).
 */
function eeEcrireStatutsLignes(feuille, numerosLignes, statut, dateEnvoiStr) {
  numerosLignes.forEach(function (n) {
    if (statut === "ENVOYÉ") {
      feuille.getRange(n, EE_COL_STATUT, 1, 2).setValues([[statut, dateEnvoiStr]]);
    } else {
      feuille.getRange(n, EE_COL_STATUT).setValue(statut);
    }
  });
  SpreadsheetApp.flush();
}

/**
 * Point d'entrée de l'envoi. Prend le verrou, puis lance le traitement.
 * @param {Object} metriques  métriques de session (peut être null)
 * @param {Object} options    { simulation: true } = aucun e-mail, aucune écriture
 */
function executerEnvoiAlertes(metriques, options) {
  const simulation = !!(options && options.simulation);

  // Sans Verrou.gs : comportement d'avant (pas de verrou)
  if (typeof verrouExecuter !== "function") {
    Logger.log("[ENVOI] Verrou.gs absent : envoi sans verrou.");
    eeExecuterEnvoiInterne(metriques, simulation);
    return;
  }

  verrouExecuter("Envoi des alertes", function () {
    eeExecuterEnvoiInterne(metriques, simulation);
  }, {
    surOccupe: function (message) {
      if (metriques && metriques.alertesCritiques) metriques.alertesCritiques.push("Envoi annulé : " + message);
    }
  });
}

function eeExecuterEnvoiInterne(metriques, simulation) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuilleAlertes = ss.getSheetByName("ALERTES_A_ENVOYER");
  const feuilleAO = ss.getSheetByName(SHEET_AO);
  const feuilleParams = ss.getSheetByName(SHEET_PARAMS);

  if (!feuilleAlertes || !feuilleAO || !feuilleParams) {
    Logger.log("[ENVOI] Erreur : Feuilles introuvables.");
    if (metriques && metriques.alertesCritiques) {
      metriques.alertesCritiques.push("Envoi impossible : feuille ALERTES_A_ENVOYER, TOUS_AO ou PARAMETRES introuvable.");
    }
    return;
  }

  if (!eeEnteteAlertesConforme(feuilleAlertes)) {
    Logger.log("[ENVOI] ARRÊT : les colonnes de ALERTES_A_ENVOYER ne sont plus dans l'ordre attendu (schéma gelé).");
    if (metriques && metriques.alertesCritiques) {
      metriques.alertesCritiques.push("Envoi arrêté : en-têtes de ALERTES_A_ENVOYER modifiés (schéma attendu non respecté).");
    }
    return;
  }

  if (simulation) Logger.log("[ENVOI] *** MODE SIMULATION : aucun e-mail, aucune écriture, aucun appel IA ***");

  // Détection environnement (TEST / PRODUCTION)
  const env = eeDetecterEnvironnement();
  Logger.log(`[ENVOI] Environnement détecté : ${env.libelle} (fichier : "${env.nomFichier}")`);

  const prefixeSujet = env.estTest ? "[TEST] " : "";
  const bandeauEnv = eeConstruireBandeauEnv(env);

  // ------------------------------------------------------------------
  // 0. Contrôle du quota Gmail
  // ------------------------------------------------------------------
  const quotaRestant = MailApp.getRemainingDailyQuota();
  Logger.log(`[ENVOI] Quota Gmail restant : ${quotaRestant}`);
  if (quotaRestant < 5) {
    Logger.log("[ENVOI] Quota Gmail trop bas. Envoi annulé par sécurité.");
    if (metriques && metriques.alertesCritiques) metriques.alertesCritiques.push(`Quota Gmail insuffisant : ${quotaRestant}`);
    return;
  }

  const emailReplyTo = feuilleParams.getRange("H5").getValue().toString().trim() || "237okmr@gmail.com";
  // V7.4 : clé lue via le module IA (coffre en priorité, feuille en secours transitoire)
  const clesGemini = (typeof iagLireClesGemini === "function") ? iagLireClesGemini(feuilleParams) : [];
  const apiKey = clesGemini.length > 0 ? clesGemini[0] : "";

  // Chargement des profils clients pour Job C
  const mapClients = eeChargerPromptsMetier(ss);
  Logger.log(`[ENVOI] ${mapClients.size} profil(s) client chargé(s) pour le résumé IA.`);

  // ------------------------------------------------------------------
  // 1. Charger les détails des AO
  // ------------------------------------------------------------------
  const mapAO = new Map();
  const donneesAO = feuilleAO.getDataRange().getValues();
  for (let i = 1; i < donneesAO.length; i++) {
    const id = String(donneesAO[i][0] || "").trim();
    if (id) {
      mapAO.set(id, {
        titre: donneesAO[i][5],
        maitreOuvrage: donneesAO[i][6],
        region: donneesAO[i][7],
        procedure: donneesAO[i][8],
        typeBudget: donneesAO[i][9],
        montant: donneesAO[i][10],
        dateLimite: donneesAO[i][11],
        lienDetail: donneesAO[i][12],
        lienDAO: donneesAO[i][13],
        typePublication: donneesAO[i][15] || "Appel_Offres"
      });
    }
  }

  // ------------------------------------------------------------------
  // 2. Regrouper les alertes par ID_Client
  // ------------------------------------------------------------------
  const donneesAlertes = feuilleAlertes.getDataRange().getValues();
  const alertesParClient = new Map();
  const lignesExpirees = [];

  for (let i = 1; i < donneesAlertes.length; i++) {
    const statut = (donneesAlertes[i][7] || "").toString().trim().toUpperCase();
    if (statut !== "EN_ATTENTE" && statut !== "REPORTÉ") continue;

    const idClient = (donneesAlertes[i][3] || "").toString().trim();
    const idAO = String(donneesAlertes[i][1] || "").trim();
    const infoAO = mapAO.get(idAO);
    if (!idClient) continue;

    if (infoAO && verifierSiAvisExpire(infoAO.dateLimite)) {
      lignesExpirees.push(i + 1);
      if (metriques) metriques.alertesForclosesEcartees = (metriques.alertesForclosesEcartees || 0) + 1;
      continue;
    }

    if (!alertesParClient.has(idClient)) {
      alertesParClient.set(idClient, {
        clientId: idClient,
        clientNom: donneesAlertes[i][4] || "Client",
        emailsBruts: (donneesAlertes[i][5] || "").toString().trim(),
        dossiers: []
      });
    }

    const joursRestants = infoAO ? calculerJoursRestants(infoAO.dateLimite) : null;

    alertesParClient.get(idClient).dossiers.push({
      ligne: i + 1,
      idMatch: donneesAlertes[i][0],
      idAO: idAO,
      numeroAvis: donneesAlertes[i][2],
      score: parseFloat(donneesAlertes[i][9]) || 3.0,
      motif: donneesAlertes[i][10],
      details: infoAO || {},
      joursRestants: joursRestants
    });
  }

  // Les alertes forcloses sont marquées EXPIRÉ tout de suite (aucun risque).
  if (lignesExpirees.length > 0) {
    if (simulation) {
      Logger.log(`[SIMULATION] ${lignesExpirees.length} alerte(s) seraient marquée(s) EXPIRÉ.`);
    } else {
      eeEcrireStatutsLignes(feuilleAlertes, lignesExpirees, "EXPIRÉ", "");
      Logger.log(`[ENVOI] ${lignesExpirees.length} alerte(s) forclose(s) marquée(s) EXPIRÉ.`);
    }
  }

  Logger.log(`[ENVOI] ${alertesParClient.size} client(s) avec alertes en attente.`);

  // ------------------------------------------------------------------
  // 3. Envoi e-mail par client — statuts écrits juste après chaque envoi
  // ------------------------------------------------------------------
  let totalEmailsEnvoyes = 0;
  let totalSimules = 0;
  const echecsEnvoi = [];
  const echecsStatut = [];
  let arretQuota = false;

  const groupes = Array.from(alertesParClient.values());

  for (let g = 0; g < groupes.length; g++) {
    const groupe = groupes[g];

    if (arretQuota) break;

    const adressesDestinataires = extraireAdressesEmails(groupe.emailsBruts);
    if (adressesDestinataires.length === 0) {
      Logger.log(`[ENVOI] Client ${groupe.clientNom} sans email valide — ignoré.`);
      echecsEnvoi.push(groupe.clientNom + " (aucune adresse e-mail valide)");
      continue;
    }

    // Tri intelligent : urgents d'abord (joursRestants croissants), puis score décroissant
    groupe.dossiers.sort((a, b) => {
      const jA = a.joursRestants === null ? 9999 : a.joursRestants;
      const jB = b.joursRestants === null ? 9999 : b.joursRestants;
      const urgA = jA <= EE_SEUIL_URGENCE_JOURS ? 0 : 1;
      const urgB = jB <= EE_SEUIL_URGENCE_JOURS ? 0 : 1;
      if (urgA !== urgB) return urgA - urgB;
      if (urgA === 0 && jA !== jB) return jA - jB;
      return b.score - a.score;
    });

    const topDossiers = groupe.dossiers.slice(0, EE_PLAFOND_DOSSIERS_PAR_EMAIL);
    const dossiersReportes = groupe.dossiers.slice(EE_PLAFOND_DOSSIERS_PAR_EMAIL);

    // ---- JOB C : génération du résumé d'accroche (jamais en simulation) ----
    let resumeIA = "";
    if (!simulation && typeof iagJobC_ResumeClient === "function" && apiKey) {
      const profil = mapClients.get(groupe.clientId);
      const promptMetier = profil ? profil.promptMetier : "";
      const topAvisPourResume = topDossiers.map(d => ({
        titre: d.details.titre || "",
        montant: d.details.montant || "",
        joursRestants: d.joursRestants
      }));
      try {
        resumeIA = iagJobC_ResumeClient(groupe.clientNom, promptMetier, topAvisPourResume, apiKey, metriques);
        if (resumeIA) {
          Logger.log(`[ENVOI Job C] ${groupe.clientNom} : "${resumeIA.substring(0, 80)}..."`);
        }
      } catch (e) {
        Logger.log(`[ENVOI Job C] Échec pour ${groupe.clientNom} : ${e.message}`);
      }
    }

    const blocResume = resumeIA
      ? `<div style="background-color: #ecfeff; border-left: 4px solid #0f766e; padding: 10px 12px; margin-bottom: 16px; border-radius: 4px; font-size: 13px; color: #0f172a; font-style: italic;">
           ${eeEchapper(resumeIA)}
         </div>`
      : "";

    // ---- Construction HTML des cartes ----
    let cartesHtml = "";
    topDossiers.forEach(d => {
      cartesHtml += eeConstruireCarteDossier(d);
    });

    const nbTotal = groupe.dossiers.length;
    const nbAutres = dossiersReportes.length;
    const noteAutres = nbAutres > 0
      ? `<p style="font-size: 12px; color: #64748b; text-align: center; padding: 10px; background: #f1f5f9; border-radius: 4px;">
           + ${nbAutres} autre(s) opportunité(s) seront envoyées dans le prochain digest.
         </p>`
      : "";

    const corpsComplet = eeConstruireCorpsEmail({
      clientNom: groupe.clientNom,
      nbTop: topDossiers.length,
      nbTotal: nbTotal,
      bandeauEnv: bandeauEnv,
      blocResume: blocResume,
      cartesHtml: cartesHtml,
      noteAutres: noteAutres,
      env: env,
      emailReplyTo: emailReplyTo
    });

    const sujet = `${prefixeSujet}[Veille Marchés] ${groupe.clientNom}: ${topDossiers.length} opportunité(s) qualifiée(s)`;

    // ---- Simulation : on s'arrête ici pour ce client ----
    if (simulation) {
      totalSimules++;
      Logger.log(`[SIMULATION] ${groupe.clientNom} → ${adressesDestinataires.join(", ")} : ${topDossiers.length} dossier(s) seraient envoyé(s), ${dossiersReportes.length} reporté(s). Sujet : "${sujet}"`);
      continue;
    }

    // ---- ÉTAPE A : envoi de l'e-mail ----
    let envoyeOk = false;
    try {
      GmailApp.sendEmail(
        adressesDestinataires.join(", "),
        sujet,
        "",
        {
          htmlBody: corpsComplet,
          name: env.estTest ? "Veille Stratégique (TEST)" : "Veille Stratégique Cameroun",
          replyTo: emailReplyTo
        }
      );
      envoyeOk = true;
    } catch (e) {
      Logger.log(`[ERREUR EMAIL] ${groupe.clientNom} : ${e.message}`);
      echecsEnvoi.push(groupe.clientNom + " (" + e.message + ")");
      if (/quota|limit|too many|service invoked too many/i.test(String(e.message))) {
        arretQuota = true;
        Logger.log("[ENVOI] Limite Gmail atteinte : arrêt des envois restants (ils repartiront au prochain passage).");
      }
    }

    if (!envoyeOk) continue; // les alertes restent EN_ATTENTE / REPORTÉ

    // ---- ÉTAPE B : statuts écrits IMMÉDIATEMENT (une seule tentative de reprise) ----
    const dateEnvoiStr = Utilities.formatDate(new Date(), "Africa/Douala", "yyyy-MM-dd HH:mm:ss");
    const lignesEnvoyees = topDossiers.map(d => d.ligne);
    const lignesReportees = dossiersReportes.map(d => d.ligne);

    let statutsOk = false;
    for (let essai = 1; essai <= 2 && !statutsOk; essai++) {
      try {
        eeEcrireStatutsLignes(feuilleAlertes, lignesEnvoyees, "ENVOYÉ", dateEnvoiStr);
        if (lignesReportees.length > 0) {
          eeEcrireStatutsLignes(feuilleAlertes, lignesReportees, "REPORTÉ", "");
        }
        statutsOk = true;
      } catch (eEcr) {
        Logger.log(`[ENVOI] Écriture des statuts impossible (essai ${essai}) pour ${groupe.clientNom} : ${eEcr.message}`);
        Utilities.sleep(1500);
      }
    }
    if (!statutsOk) {
      echecsStatut.push(groupe.clientNom + " (lignes " + lignesEnvoyees.join(",") + ")");
    }

    totalEmailsEnvoyes++;
    if (metriques && metriques.detailDistribution) {
      metriques.detailDistribution[groupe.clientNom] = topDossiers.length;
    }

    Logger.log(`[ENVOI] ${groupe.clientNom} → ${adressesDestinataires.length} destinataire(s) : ${topDossiers.length} envoyé(s), ${dossiersReportes.length} reporté(s). Sujet : "${sujet}"`);
  }

  // ------------------------------------------------------------------
  // 4. Bilan et signalement des problèmes
  // ------------------------------------------------------------------
  if (!simulation) {
    if (echecsEnvoi.length > 0) {
      const msg = `${echecsEnvoi.length} e-mail(s) NON envoyé(s) : ${echecsEnvoi.join(" ; ")}. Les alertes restent en attente.`;
      if (metriques && metriques.alertesCritiques) metriques.alertesCritiques.push(msg);
      if (typeof envoyerAlerteCritiqueImmediate === "function") {
        try { envoyerAlerteCritiqueImmediate("Échec d'envoi d'alertes clients", msg); } catch (eAl) {}
      }
    }
    if (echecsStatut.length > 0) {
      const msg = `E-mail envoyé mais statut NON enregistré pour : ${echecsStatut.join(" ; ")}. RISQUE DE DOUBLON : passer ces lignes à ENVOYÉ à la main.`;
      if (metriques && metriques.alertesCritiques) metriques.alertesCritiques.push(msg);
      if (typeof envoyerAlerteCritiqueImmediate === "function") {
        try { envoyerAlerteCritiqueImmediate("Statuts d'envoi non enregistrés", msg); } catch (eAl2) {}
      }
    }

    if (metriques) {
      metriques.emailsEnvoyes = (metriques.emailsEnvoyes || 0) + totalEmailsEnvoyes;
      metriques.quotaEmailsRestant = MailApp.getRemainingDailyQuota();
    }
    Logger.log(`=== Expédition terminée : ${totalEmailsEnvoyes} e-mail(s) expédié(s), ${echecsEnvoi.length} échec(s). Environnement : ${env.libelle}. ===`);
  } else {
    Logger.log(`=== SIMULATION terminée : ${totalSimules} e-mail(s) auraient été expédiés, ${echecsEnvoi.length} problème(s) détecté(s). ===`);
  }
}

/**
 * TEST DU LOT 1 — sans aucun e-mail, sans aucune écriture, sans appel IA.
 * À exécuter depuis EnvoiEmails.gs : eeTesterEnvoiSecurise
 */
function eeTesterEnvoiSecurise() {
  Logger.log("=================================================");
  Logger.log("=== TEST LOT 1 : ENVOI SÉCURISÉ (SIMULATION) ===");
  Logger.log("Fichier : " + SpreadsheetApp.getActiveSpreadsheet().getName());
  Logger.log("=================================================");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName("ALERTES_A_ENVOYER");
  Logger.log(feuille && eeEnteteAlertesConforme(feuille)
    ? "✅ En-têtes de ALERTES_A_ENVOYER conformes (colonnes H et I = Statut_Envoi, Date_Envoi)."
    : "❌ En-têtes de ALERTES_A_ENVOYER NON conformes : l'envoi réel s'arrêterait.");

  const verrou = LockService.getScriptLock();
  if (verrou.tryLock(5000)) {
    Logger.log("✅ Verrou d'envoi obtenu puis libéré.");
    verrou.releaseLock();
  } else {
    Logger.log("❌ Verrou occupé : un autre traitement est en cours.");
  }

  Logger.log("Quota Gmail restant : " + MailApp.getRemainingDailyQuota());

  const metriques = { alertesCritiques: [], detailDistribution: {} };
  executerEnvoiAlertes(metriques, { simulation: true });

  Logger.log("Alertes critiques remontées : " + (metriques.alertesCritiques.length === 0 ? "aucune" : metriques.alertesCritiques.join(" ; ")));
  Logger.log("=== FIN DU TEST LOT 1 (aucun e-mail envoyé, aucune cellule modifiée) ===");
}

// ============================================================================
// TEST LOT S1a — RENDU DES E-MAILS SANS ENVOI (aucun e-mail, aucune écriture)
// ============================================================================

/**
 * Construit une carte et un corps d'e-mail avec des données hostiles simulées et
 * vérifie qu'aucun HTML injecté ne survit. N'ouvre aucune feuille, n'envoie rien.
 * À exécuter depuis EnvoiEmails.gs : eeTesterRenduEmailSansEnvoi
 */
function eeTesterRenduEmailSansEnvoi() {
  let ok = 0;
  let ko = 0;
  const verifier = function (nom, condition) {
    if (condition) { ok++; Logger.log("✅ " + nom); } else { ko++; Logger.log("❌ " + nom); }
  };

  const hostile = {
    score: 4.2,
    numeroAvis: "12/AO/<img src=x onerror=alert(1)>",
    idAO: "ARMP_1",
    motif: "<script>alert('motif')</script> pertinent",
    details: {
      procedure: 'AON"><b>gras</b>',
      titre: "<b>Titre</b> & \"fournitures\" d'équipements",
      maitreOuvrage: "<iframe src=//exemple.test></iframe>MAIRE DE X",
      region: "Centre",
      montant: "1 000 000 FCFA",
      dateLimite: "'30-10-2026 12:00",
      typePublication: "Appel_Offres",
      lienDetail: "javascript:alert(1)",
      lienDAO: 'https://exemple.cm/dao?a=1&b="onmouseover="x'
    }
  };
  const carte = eeConstruireCarteDossier(hostile);
  verifier("carte : aucune balise <script>", carte.indexOf("<script") === -1);
  verifier("carte : aucune balise <img>", carte.indexOf("<img") === -1);
  verifier("carte : aucune balise <iframe>", carte.indexOf("<iframe") === -1);
  verifier("carte : aucun <b> injecté", carte.indexOf("<b>gras</b>") === -1 && carte.indexOf("<b>Titre</b>") === -1);
  verifier("carte : lien javascript: absent", carte.toLowerCase().indexOf("javascript:") === -1);
  verifier("carte : lien avec guillemet refusé (pas de bouton DAO)", carte.indexOf("Télécharger le DAO") === -1);
  verifier("carte : le texte reste lisible (échappé)", carte.indexOf("&lt;b&gt;Titre&lt;/b&gt; &amp; &quot;fournitures&quot; d&#39;équipements") !== -1);

  const normal = eeConstruireCarteDossier({
    score: 3.5, numeroAvis: "05/AONO/2026", idAO: "ARMP_2", motif: "Correspond à votre métier",
    details: {
      procedure: "AONO", titre: "Fourniture de matériel", maitreOuvrage: "MINTP", region: "Littoral",
      montant: "5 000 000 FCFA", dateLimite: "'30-10-2026 12:00", typePublication: "Appel_Offres",
      lienDetail: "https://www.armp.cm/details?type_publication=AONO&id_publication=2",
      lienDAO: "http://pridesoft.armp.cm//0903_dao_dl?type_publication=AONO&id_publication=2"
    }
  });
  verifier("carte normale : bouton « Consulter l'avis » présent", normal.indexOf("Consulter l'avis") !== -1);
  verifier("carte normale : bouton DAO présent", normal.indexOf("Télécharger le DAO") !== -1);
  verifier("carte normale : lien avec & correctement écrit (&amp;)",
    normal.indexOf('href="https://www.armp.cm/details?type_publication=AONO&amp;id_publication=2"') !== -1);
  verifier("carte normale : score et titre présents", normal.indexOf("Score: 3.5/5") !== -1 && normal.indexOf("Fourniture de matériel") !== -1);

  const env = { nomFichier: "Hub <test>", libelle: "PRODUCTION", estTest: false };
  const corps = eeConstruireCorpsEmail({
    clientNom: "<u>Société</u> & Fils", nbTop: 1, nbTotal: 3,
    bandeauEnv: "", blocResume: "", cartesHtml: normal, noteAutres: "",
    env: env, emailReplyTo: "contact<x>@exemple.cm"
  });
  verifier("corps : nom du client échappé", corps.indexOf("&lt;u&gt;Société&lt;/u&gt; &amp; Fils") !== -1 && corps.indexOf("<u>") === -1);
  verifier("corps : pied de page échappé", corps.indexOf("contact&lt;x&gt;@exemple.cm") !== -1 && corps.indexOf("Hub &lt;test&gt;") !== -1);
  verifier("corps : la carte normale est conservée", corps.indexOf("Consulter l'avis") !== -1);

  const bandeau = eeConstruireBandeauEnv({
    estTest: true, nomFichier: "Copie <script>x</script>", couleurFond: "#fff", couleurBordure: "#000", couleurTexte: "#111", libelle: "TEST"
  });
  verifier("bandeau de test : nom du fichier échappé", bandeau.indexOf("<script") === -1 && bandeau.indexOf("&lt;script&gt;") !== -1);

  Logger.log("=== RÉSULTAT : " + ok + " réussi(s), " + ko + " échec(s) ===");
  if (ko > 0) throw new Error(ko + " vérification(s) en échec (voir le journal).");
}

// ============================================================================
// DIAGNOSTIC DE LA FILE D'ENVOI — V7.2
// ============================================================================
// Ajouté après executerEnvoiAlertes(). Analyse la file ALERTES_A_ENVOYER sans
// envoyer aucun email, pour comprendre pourquoi certaines alertes restent
// bloquées en EN_ATTENTE.
// ============================================================================

/**
 * Diagnostic complet de la file d'attente d'envoi.
 * Aucun email envoyé, aucun quota consommé.
 */
function eeDiagnostiquerFileEnvoi() {
  Logger.log("=================================================");
  Logger.log("=== DIAGNOSTIC DE LA FILE D'ENVOI D'ALERTES ===");
  Logger.log("Fichier : " + SpreadsheetApp.getActiveSpreadsheet().getName());
  Logger.log("Date    : " + Utilities.formatDate(new Date(), "Africa/Douala", "yyyy-MM-dd HH:mm"));
  Logger.log("=================================================");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuilleAlertes = ss.getSheetByName("ALERTES_A_ENVOYER");
  const feuilleClients = ss.getSheetByName("CLIENTS");
  const feuilleParams = ss.getSheetByName(SHEET_PARAMS);

  if (!feuilleAlertes || !feuilleClients || !feuilleParams) {
    Logger.log("❌ Feuilles requises introuvables.");
    return;
  }

  // ------------------------------------------------------------------------
  // 1. QUOTA GMAIL
  // ------------------------------------------------------------------------
  Logger.log("");
  Logger.log("═══════════════════════════════════════════════════");
  Logger.log("1. QUOTA GMAIL");
  Logger.log("═══════════════════════════════════════════════════");
  const quota = MailApp.getRemainingDailyQuota();
  Logger.log("  · Quota restant aujourd'hui : " + quota + " emails");
  if (quota < 5) {
    Logger.log("  🔴 Quota critique — envoi bloqué par sécurité");
  } else if (quota < 20) {
    Logger.log("  🟡 Quota bas — surveiller");
  } else {
    Logger.log("  ✓ Quota confortable");
  }

  // ------------------------------------------------------------------------
  // 2. RÉPARTITION DES ALERTES PAR STATUT
  // ------------------------------------------------------------------------
  Logger.log("");
  Logger.log("═══════════════════════════════════════════════════");
  Logger.log("2. RÉPARTITION DES ALERTES");
  Logger.log("═══════════════════════════════════════════════════");

  const dataAlertes = feuilleAlertes.getDataRange().getValues();
  const parStatut = {};
  const parClient = {};
  let total = 0;

  for (let i = 1; i < dataAlertes.length; i++) {
    const idClient = (dataAlertes[i][3] || "").toString().trim();
    const nomClient = (dataAlertes[i][4] || "").toString().trim();
    const statut = (dataAlertes[i][7] || "").toString().trim().toUpperCase();
    if (!idClient) continue;
    total++;
    parStatut[statut] = (parStatut[statut] || 0) + 1;
    if (!parClient[idClient]) parClient[idClient] = { nom: nomClient, statuts: {} };
    parClient[idClient].statuts[statut] = (parClient[idClient].statuts[statut] || 0) + 1;
  }

  Logger.log("  · Total alertes : " + total);
  Logger.log("");
  Object.keys(parStatut).sort().forEach(function (st) {
    Logger.log("    · " + st + " : " + parStatut[st]);
  });

  // ------------------------------------------------------------------------
  // 3. SIMULATION DU PROCHAIN ENVOI
  // ------------------------------------------------------------------------
  Logger.log("");
  Logger.log("═══════════════════════════════════════════════════");
  Logger.log("3. SIMULATION DU PROCHAIN ENVOI");
  Logger.log("═══════════════════════════════════════════════════");

  const mapAO = {};
  const feuilleAO = ss.getSheetByName(SHEET_AO);
  if (feuilleAO) {
    const donneesAO = feuilleAO.getDataRange().getValues();
    for (let i = 1; i < donneesAO.length; i++) {
      const id = (donneesAO[i][0] || "").toString().trim();
      if (id) {
        mapAO[id] = {
          titre: donneesAO[i][5],
          dateLimite: donneesAO[i][11],
          typePublication: donneesAO[i][15] || "Appel_Offres"
        };
      }
    }
  }

  // Analyser ce qui serait envoyé
  let aEnvoyer = 0, dejaExpire = 0, sansEmail = 0, clientInconnu = 0;
  const parClientEnvoyer = {};

  for (let i = 1; i < dataAlertes.length; i++) {
    const statut = (dataAlertes[i][7] || "").toString().trim().toUpperCase();
    if (statut !== "EN_ATTENTE" && statut !== "REPORTÉ") continue;

    const idClient = (dataAlertes[i][3] || "").toString().trim();
    const idAO = (dataAlertes[i][1] || "").toString().trim();
    const emailBrut = (dataAlertes[i][5] || "").toString().trim();

    const emailsValides = emailBrut.split(/[;,]/).map(function (e) { return e.trim(); })
      .filter(function (e) { return e && e.includes("@"); });

    if (emailsValides.length === 0) {
      sansEmail++;
      continue;
    }

    const infoAO = mapAO[idAO] || {};
    const dateLimite = (infoAO.dateLimite || "").toString();
    if (typeof verifierSiAvisExpire === "function" && verifierSiAvisExpire(dateLimite)) {
      dejaExpire++;
      continue;
    }

    aEnvoyer++;
    if (!parClientEnvoyer[idClient]) {
      parClientEnvoyer[idClient] = { nom: (dataAlertes[i][4] || "").toString(), nb: 0 };
    }
    parClientEnvoyer[idClient].nb++;
  }

  Logger.log("  · Alertes EN_ATTENTE/REPORTÉ : " + (parStatut["EN_ATTENTE"] || 0 + parStatut["REPORTÉ"] || 0));
  Logger.log("  · Dont seraient envoyées     : " + aEnvoyer);
  Logger.log("  · Dont forcloses (écartées)  : " + dejaExpire);
  Logger.log("  · Dont sans email valide     : " + sansEmail);

  Logger.log("");
  Logger.log("  Répartition par client :");
  Object.keys(parClientEnvoyer).forEach(function (id) {
    const c = parClientEnvoyer[id];
    const statuts = parClient[id] ? parClient[id].statuts : {};
    Logger.log("    · " + c.nom + " : " + c.nb + " prête(s) à envoyer");
  });

  // ------------------------------------------------------------------------
  // 4. PROBLÈMES DÉTECTÉS
  // ------------------------------------------------------------------------
  Logger.log("");
  Logger.log("═══════════════════════════════════════════════════");
  Logger.log("4. PROBLÈMES DÉTECTÉS");
  Logger.log("═══════════════════════════════════════════════════");

  const problemes = [];

  if (sansEmail > 0) {
    problemes.push("🔴 " + sansEmail + " alerte(s) sans email valide");
  }
  if (dejaExpire > 0) {
    problemes.push("🟡 " + dejaExpire + " alerte(s) forclose(s) non purgée(s)");
  }
  if (quota < 5) {
    problemes.push("🔴 Quota Gmail insuffisant (" + quota + " restant)");
  }
  if (aEnvoyer > quota) {
    problemes.push("🟡 " + aEnvoyer + " alertes à envoyer mais seulement " +
                   quota + " emails disponibles");
  }

  if (problemes.length === 0) {
    Logger.log("  ✓ Aucun problème détecté.");
    Logger.log("  → `executerEnvoiAlertes(null)` peut être lancée sans risque.");
  } else {
    problemes.forEach(function (p) { Logger.log("  " + p); });
  }

  // ------------------------------------------------------------------------
  // 5. RECOMMANDATIONS
  // ------------------------------------------------------------------------
  Logger.log("");
  Logger.log("═══════════════════════════════════════════════════");
  Logger.log("5. RECOMMANDATIONS");
  Logger.log("═══════════════════════════════════════════════════");

  if (aEnvoyer === 0) {
    Logger.log("  · Aucune alerte à envoyer — rien à faire.");
  } else if (aEnvoyer <= quota) {
    Logger.log("  · Tu peux lancer `executerEnvoiAlertes(null)`.");
    Logger.log("  · " + aEnvoyer + " email(s) seront envoyés.");
  } else {
    Logger.log("  · Envoi limité à " + quota + " emails par le quota Gmail.");
    Logger.log("  · Les alertes restantes seront REPORTÉES à demain.");
  }

  if (dejaExpire > 0) {
    Logger.log("  · Purger les " + dejaExpire + " alerte(s) forclose(s) :");
    Logger.log("    → Lancer `executerEnvoiAlertes(null)` (marquage EXPIRÉ automatique).");
  }

  Logger.log("");
  Logger.log("=================================================");
  Logger.log("FIN DU DIAGNOSTIC");
  Logger.log("=================================================");

  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      aEnvoyer + " à envoyer / " + quota + " quota",
      "Diagnostic envoi", 10
    );
  } catch (e) {}
}