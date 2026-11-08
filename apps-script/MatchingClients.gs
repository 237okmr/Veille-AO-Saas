// >>> FICHIER : MatchingClients.gs <<< (à coller dans l'onglet du même nom)
/**
 * ============================================================================
 * SCRIPT 2 : MATCHING CLIENTS V3.5 (LOT S1b)
 * ============================================================================
 * NOUVEAUTÉ V3.5 (LOT S1b) : les motifs rédigés par l'IA et les noms de clients écrits dans
 * CACHE_IA et ALERTES_A_ENVOYER passent par secNeutraliserLigne (SecuriteDonnees.gs, dont ce
 * script dépend). Un motif qui commence par « - », « = » ou « + » n'est plus interprété comme
 * une formule par Google Sheets. Aucun autre changement de comportement.
 *
 * NOUVEAUTÉ V3.4 (LOT 4 — filet anti-doublon inter-sources)
 * ---------------------------------------------------------------------------
 *   • Avant tout appel à l'IA, un avis n'est PAS évalué pour un client si ce
 *     client a déjà une alerte (envoyée ou en attente) pour le MÊME avis publié
 *     par une AUTRE source (ex. ARMP et COLEPS). Économise aussi le quota Gemini.
 *   • Critères identiques à la déduplication (Deduplication.gs V2.3) : même
 *     numéro officiel, type, lots, montants, maîtres d'ouvrage et titres proches.
 *   • Si Deduplication.gs est absent, le filet est simplement inactif.
 *
 * CORRECTIFS V3.3 (issus du test de charge 6a)
 * ---------------------------------------------------------------------------
 *   • CHUNKING ADAPTATIF : le nombre de clients par sous-groupe est calculé
 *     dynamiquement pour respecter la contrainte
 *         nb_clients × nb_avis ≤ MC3_MAX_PAIRES_PAR_APPEL (100)
 *     Évite les réponses Gemini tronquées sur les gros sous-groupes.
 *
 *   • RETRY PAR SCISSION : si un sous-groupe échoue (parsing JSON invalide,
 *     réponse tronquée, timeout), il est scindé en 2 et réessayé. Profondeur
 *     maximale de scission : 2 niveaux (4 sous-groupes de secours max).
 *
 *   • DÉTECTION DE RÉPONSE INCOMPLÈTE : si Gemini renvoie moins de paires
 *     que le nombre attendu (avis × clients), le sous-groupe est considéré
 *     comme incomplet et scindé pour retry.
 *
 * RAPPEL V3.2
 * ---------------------------------------------------------------------------
 *   • Utilisation du profil compact (colonne H de PROFILS_ENRICHIS)
 *   • Garde-fou extrême à 50 clients par avis
 * ============================================================================
 */

const MC_TAILLE_LOT_AVIS_IA = 15;
const MC_SHEET_CACHE = "CACHE_IA";
const MC_PROP_DERNIERE_PURGE = "CACHE_IA_DERNIERE_PURGE";
const MC_INTERVALLE_PURGE_JOURS = 7;
const MC_AGE_MAX_CACHE_JOURS = 90;

const MC_MAX_TENTATIVES_IA = 2;
const MC_PROP_TENTATIVES_IA = "TENTATIVES_IA_PAR_AVIS";
const MC_LIBELLE_SECOURS = "[IA indisponible : mots-clés seuls] ";

const MC_BUDGET_TEMPS_MS = 270000;
const MC_MAX_ECHECS_LOTS_CONSECUTIFS = 2;

const MC_SHEET_PROFILS = "PROFILS_ENRICHIS";

// ---------------------------------------------------------------------------
// PONDÉRATIONS V3.0 — SCORE FINAL
// ---------------------------------------------------------------------------

const MC3_POIDS_IA = 0.80;
const MC3_POIDS_MOTS = 0.20;

const MC3_BONUS_MO_PRIORITAIRE = 0.30;
const MC3_BONUS_REGION_CIBLE = 0.20;
const MC3_BONUS_SOURCE_INTL = 0.20;
const MC3_BONUS_PROCEDURE = 0.10;

const MC3_MALUS_MONTANT_SOUS_MIN = -0.50;
const MC3_MALUS_REGION_HORS_CIBLE = -0.30;

// ---------------------------------------------------------------------------
// V3.3 — PARAMÈTRES DE CHUNKING
// ---------------------------------------------------------------------------

// Contrainte : nb_clients × nb_avis ≤ MC3_MAX_PAIRES_PAR_APPEL
// Le chunking adaptatif calcule dynamiquement le nombre de clients
// par sous-groupe pour ne jamais dépasser cette limite.
const MC3_MAX_PAIRES_PAR_APPEL = 100;

// Profondeur maximale de scission en cas d'échec d'un sous-groupe.
// 0 = pas de retry ; 1 = scinder une fois ; 2 = scinder deux fois (4 sous-sous-groupes)
const MC3_PROFONDEUR_SCISSION_MAX = 2;

// Nombre maximum de clients envoyés à l'IA pour UN avis (garde-fou extrême)
const MC3_MAX_CLIENTS_PAR_AVIS = 50;

// Taille maximale du profil métier en fallback (quand pas de compact)
const MC3_TAILLE_RESUME_PROFIL = 500;

const MC3_SOURCES_INTL = [
  "BAD", "BANQUE AFRICAINE", "BANQUE MONDIALE", "BM", "WORLD BANK",
  "UE", "UNION EUROPEENNE", "EUROPEAN UNION",
  "AFD", "AGENCE FRANCAISE",
  "ONU", "UNITED NATIONS", "PNUD", "UNDP", "UNICEF", "UNOPS",
  "UNIDO", "ONUDI", "FAO", "FIDA", "PNUE", "UNEP", "FEM", "GEF",
  "GIZ", "KOICA", "JICA", "USAID", "BID", "BOAD", "BDEAC",
  "DEVELOPMENTAID", "DGMARKET"
];

// ---------------------------------------------------------------------------
// CACHE IA
// ---------------------------------------------------------------------------

function chargerCacheIA(ss) {
  let feuille = ss.getSheetByName(MC_SHEET_CACHE);
  if (!feuille) {
    feuille = ss.insertSheet(MC_SHEET_CACHE);
    feuille.appendRow(["ID_AO", "ID_Client", "Note_IA", "Motif", "Date_Eval"]);
    feuille.getRange(1, 1, 1, 5).setFontWeight("bold")
      .setBackground("#0f172a").setFontColor("#ffffff");
    feuille.setFrozenRows(1);
    return { feuille: feuille, cache: new Map() };
  }
  const data = feuille.getDataRange().getValues();
  const cache = new Map();
  for (let i = 1; i < data.length; i++) {
    const idAO = (data[i][0] || "").toString().trim();
    const idClient = (data[i][1] || "").toString().trim();
    const noteIA = parseInt(data[i][2], 10);
    const motif = (data[i][3] || "").toString().trim();
    if (idAO && idClient && !isNaN(noteIA)) {
      cache.set(idAO + "|" + idClient, { noteIA: noteIA, motif: motif });
    }
  }
  return { feuille: feuille, cache: cache };
}

function purgerCacheIASiNecessaire() {
  const props = PropertiesService.getScriptProperties();
  const dernierePurgeStr = props.getProperty(MC_PROP_DERNIERE_PURGE);
  const maintenant = new Date();
  if (dernierePurgeStr) {
    const dernierePurge = new Date(dernierePurgeStr);
    if (!isNaN(dernierePurge.getTime())) {
      const joursDepuis = (maintenant.getTime() - dernierePurge.getTime()) / (1000 * 60 * 60 * 24);
      if (joursDepuis < MC_INTERVALLE_PURGE_JOURS) return;
    }
  }
  purgerCacheIA();
  props.setProperty(MC_PROP_DERNIERE_PURGE, maintenant.toISOString());
}

function purgerCacheIA() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName(MC_SHEET_CACHE);
  if (!feuille) return;
  const data = feuille.getDataRange().getValues();
  if (data.length <= 1) return;
  const limite = new Date();
  limite.setDate(limite.getDate() - MC_AGE_MAX_CACHE_JOURS);
  const aGarder = [data[0]];
  let supprimes = 0;
  for (let i = 1; i < data.length; i++) {
    const dateEvalStr = data[i][4];
    if (!dateEvalStr) { aGarder.push(data[i]); continue; }
    const dateEval = new Date(dateEvalStr);
    if (isNaN(dateEval.getTime()) || dateEval >= limite) aGarder.push(data[i]);
    else supprimes++;
  }
  if (supprimes === 0) return;
  feuille.clearContents();
  if (aGarder.length > 0) {
    feuille.getRange(1, 1, aGarder.length, 5).setValues(aGarder.map(secNeutraliserLigne));
    feuille.getRange(1, 1, 1, 5).setFontWeight("bold")
      .setBackground("#0f172a").setFontColor("#ffffff");
  }
}

// ---------------------------------------------------------------------------
// TENTATIVES IA
// ---------------------------------------------------------------------------

function chargerTentativesIA() {
  try {
    const brut = PropertiesService.getScriptProperties().getProperty(MC_PROP_TENTATIVES_IA);
    return brut ? JSON.parse(brut) : {};
  } catch (e) { return {}; }
}
function sauverTentativesIA(obj) {
  try {
    PropertiesService.getScriptProperties().setProperty(MC_PROP_TENTATIVES_IA, JSON.stringify(obj || {}));
  } catch (e) {}
}

// ---------------------------------------------------------------------------
// OUTILS
// ---------------------------------------------------------------------------

function mcTempsEcouleMs(metriques) {
  if (!metriques || !metriques.debut) return 0;
  const debut = new Date(metriques.debut).getTime();
  return isNaN(debut) ? 0 : (new Date().getTime() - debut);
}

function marquerLignesStatut(feuille, lignes, colonne, valeur) {
  if (!lignes || lignes.length === 0) return;
  const tri = lignes.slice().sort(function (a, b) { return a - b; });
  function ecrire(debut, fin) {
    const n = fin - debut + 1;
    const valeurs = [];
    for (let i = 0; i < n; i++) valeurs.push([valeur]);
    feuille.getRange(debut, colonne, n, 1).setValues(valeurs);
  }
  let debutBloc = tri[0], precedent = tri[0];
  for (let i = 1; i < tri.length; i++) {
    if (tri[i] === precedent + 1) { precedent = tri[i]; continue; }
    ecrire(debutBloc, precedent);
    debutBloc = tri[i]; precedent = tri[i];
  }
  ecrire(debutBloc, precedent);
}

function extraireMontantNumerique(texteMontant) {
  if (!texteMontant || texteMontant === "Non précisé") return 0;
  const nettoye = texteMontant.toString().replace(/[^0-9]/g, "");
  return nettoye ? parseInt(nettoye, 10) : 0;
}

function nettoyerTexte(str) {
  if (!str) return "";
  return str.toString().toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[\n\r\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function testerPresenceMot(texte, mot) {
  if (!texte || !mot) return false;
  const motNet = nettoyerTexte(mot);
  if (motNet.includes(" ") || motNet.includes("'")) {
    return texte.includes(motNet);
  }
  const racine = motNet.replace(/[sx]$/, "");
  if (racine.length < 3) {
    return new RegExp("(^|[^a-zA-Z0-9À-ÿ])" + motNet + "([^a-zA-Z0-9À-ÿ]|$)", "i").test(texte);
  }
  return new RegExp("(^|[^a-zA-Z0-9À-ÿ])" + racine + "(?:s|x)?([^a-zA-Z0-9À-ÿ]|$)", "i").test(texte);
}

function normaliserProcedure(proc) {
  const p = (proc || "").toUpperCase();
  if (p.includes("AONO") || p === "AO" || p.includes("APPEL D'OFFRES") || p.includes("AONR") || p.includes("AOIO")) return "AONO";
  if (p.includes("COTATION") || p === "DC" || p.includes("DCO") || p.includes("RFQ")) return "DC";
  if (p.includes("MANIFESTATION") || p.includes("AMI") || p.includes("ASMI")) return "AMI";
  if (p.includes("ATTR") || p.includes("COMM")) return "ATTRIBUTION";
  return p;
}

// ---------------------------------------------------------------------------
// SOUS-SCORES V3.0
// ---------------------------------------------------------------------------

function mc3EstSourceInternationale(source) {
  if (!source) return false;
  const s = source.toUpperCase();
  return MC3_SOURCES_INTL.some(function (x) { return s.indexOf(x) !== -1; });
}

function mc3SousScoreMotsCles(nbMotsTrouves) {
  if (nbMotsTrouves === 0) return 0;
  if (nbMotsTrouves === 1) return 3;
  return 5;
}

function mc3SousScoreRegion(avis, client) {
  if (!client.regions || client.regions.length === 0) return 3;
  if (client.regions.indexOf("TOUTES") !== -1 || client.regions.indexOf("TOUS") !== -1) return 3;

  const r = (avis.region || "").toUpperCase();
  if (r.indexOf("NATIONALE") !== -1 || r.indexOf("SERVICES CENTRAUX") !== -1 ||
      r.indexOf("CAMEROUN") !== -1 || r.indexOf("CEMAC") !== -1) return 3;

  for (let i = 0; i < client.regions.length; i++) {
    if (r.indexOf(client.regions[i]) !== -1) return 5;
  }
  return 0;
}

function mc3SousScoreProcedure(avis, client) {
  if (!client.procedures || client.procedures.length === 0) return 3;
  if (client.procedures.indexOf("TOUTES") !== -1 || client.procedures.indexOf("TOUS") !== -1) return 3;
  if (client.procedures.indexOf(avis.procedureNormalisee) !== -1) return 5;
  return 0;
}

function mc3SousScoreMontant(avis, client) {
  if (!client.montantMin || client.montantMin <= 0) return 3;
  const m = avis.montantValeur || 0;
  if (m === 0) return 3;
  if (m >= client.montantMin) return 5;
  return 0;
}

function mc3SousScoreMO(depuisMOPrioritaire) {
  return depuisMOPrioritaire ? 5 : 0;
}

function mc3SousScoreSource(avis) {
  return mc3EstSourceInternationale(avis.source) ? 5 : 3;
}

function mc3CalculerScore(avis, client, ce, resultatIA) {
  const nbMots = ce.motsTrouves ? ce.motsTrouves.length : 0;
  const sMots = mc3SousScoreMotsCles(nbMots);
  const sRegion = mc3SousScoreRegion(avis, client);
  const sProc = mc3SousScoreProcedure(avis, client);
  const sMontant = mc3SousScoreMontant(avis, client);
  const sMO = mc3SousScoreMO(ce.depuisMOPrioritaire);
  const sSource = mc3SousScoreSource(avis);

  let scoreIA, motifIA;
  if (resultatIA && typeof resultatIA.noteIA === "number") {
    scoreIA = resultatIA.noteIA;
    motifIA = resultatIA.motif || "";
  } else {
    scoreIA = (sMots >= 3) ? 3 : 0;
    motifIA = MC_LIBELLE_SECOURS + "Opportunité sur [" + (ce.motsTrouves || []).join(", ") + "].";
  }

  const scoreBase = (scoreIA * MC3_POIDS_IA) + (sMots * MC3_POIDS_MOTS);

  let bonusMO = 0, bonusRegion = 0, bonusSource = 0, bonusProc = 0;
  let malusMontant = 0, malusRegion = 0;
  const raisons = [];

  if (sMO === 5) { bonusMO = MC3_BONUS_MO_PRIORITAIRE; raisons.push("MO prioritaire +" + bonusMO.toFixed(1)); }
  if (sRegion === 5) { bonusRegion = MC3_BONUS_REGION_CIBLE; raisons.push("Région cible +" + bonusRegion.toFixed(1)); }
  if (sSource === 5) { bonusSource = MC3_BONUS_SOURCE_INTL; raisons.push("Source internationale +" + bonusSource.toFixed(1)); }
  if (sProc === 5) { bonusProc = MC3_BONUS_PROCEDURE; raisons.push("Procédure ciblée +" + bonusProc.toFixed(1)); }

  if (sMontant === 0 && avis.montantValeur > 0) {
    malusMontant = MC3_MALUS_MONTANT_SOUS_MIN;
    raisons.push("Montant < minimum " + malusMontant.toFixed(1));
  }
  if (sRegion === 0 && client.regions && client.regions.length > 0) {
    malusRegion = MC3_MALUS_REGION_HORS_CIBLE;
    raisons.push("Hors région cible " + malusRegion.toFixed(1));
  }

  const scoreBrut = scoreBase + bonusMO + bonusRegion + bonusSource + bonusProc + malusMontant + malusRegion;
  const scoreFinal = Number(Math.min(Math.max(scoreBrut, 0), 5).toFixed(2));

  const decomposition =
    "IA " + scoreIA.toFixed(1) +
    " · Mots " + sMots.toFixed(1) +
    (raisons.length ? " · " + raisons.join(" · ") : "");

  return {
    scoreFinal: scoreFinal,
    scoreIA: scoreIA,
    sMots: sMots,
    sMO: sMO, sRegion: sRegion, sProc: sProc, sMontant: sMontant, sSource: sSource,
    decomposition: decomposition,
    motifIA: motifIA,
    nbMots: nbMots
  };
}

// ---------------------------------------------------------------------------
// GARDE-FOU EXTRÊME
// ---------------------------------------------------------------------------

function mc3FiltrerGardeFou(avis, clientsEligibles) {
  if (clientsEligibles.length <= MC3_MAX_CLIENTS_PAR_AVIS) {
    return { retenus: clientsEligibles, ecartes: 0 };
  }
  const tries = clientsEligibles.slice().sort(function (a, b) {
    const na = a.motsTrouves ? a.motsTrouves.length : 0;
    const nb = b.motsTrouves ? b.motsTrouves.length : 0;
    return nb - na;
  });
  return {
    retenus: tries.slice(0, MC3_MAX_CLIENTS_PAR_AVIS),
    ecartes: tries.length - MC3_MAX_CLIENTS_PAR_AVIS
  };
}

function mc3ResumerProfil(promptMetier) {
  if (!promptMetier) return "";
  const s = String(promptMetier);
  if (s.length <= MC3_TAILLE_RESUME_PROFIL) return s;
  return s.substring(0, MC3_TAILLE_RESUME_PROFIL) + "…";
}

// ---------------------------------------------------------------------------
// CHARGEMENT DES PROFILS ENRICHIS
// ---------------------------------------------------------------------------

function chargerProfilsEnrichis(ss) {
  const map = new Map();
  const feuille = ss.getSheetByName(MC_SHEET_PROFILS);
  if (!feuille) return map;
  const data = feuille.getDataRange().getValues();
  if (data.length <= 1) return map;

  const h = data[0].map(function (v) { return v.toString().trim().toUpperCase(); });
  const idxId = h.indexOf("ID_CLIENT");
  const idxInc = h.indexOf("MOTS_CLES_INCLUSION");
  const idxExc = h.indexOf("MOTS_CLES_EXCLUSION");
  const idxMo = h.indexOf("MO_PRIORITAIRES");
  const idxDate = h.indexOf("DATE_GENERATION");
  const idxCompact = h.indexOf("PROFIL_COMPACT");
  const idxVersionCompact = h.indexOf("VERSION_PROMPT_COMPACT");
  if (idxId === -1) return map;

  for (let i = 1; i < data.length; i++) {
    const id = (data[i][idxId] || "").toString().trim();
    if (!id) continue;
    map.set(id, {
      inclusions: (idxInc !== -1 && data[i][idxInc])
        ? data[i][idxInc].toString().split(/[,;]/).map(function (m) { return m.trim().toLowerCase(); }).filter(function (m) { return m; })
        : [],
      exclusions: (idxExc !== -1 && data[i][idxExc])
        ? data[i][idxExc].toString().split(/[,;]/).map(function (e) { return e.trim().toLowerCase(); }).filter(function (e) { return e; })
        : [],
      moPrioritaires: (idxMo !== -1 && data[i][idxMo])
        ? data[i][idxMo].toString().split(/[,;]/).map(function (m) { return m.trim().toLowerCase(); }).filter(function (m) { return m; })
        : [],
      date: (idxDate !== -1 && data[i][idxDate]) ? data[i][idxDate].toString() : "",
      profilCompact: (idxCompact !== -1 && data[i][idxCompact]) ? data[i][idxCompact].toString().trim() : "",
      versionCompact: (idxVersionCompact !== -1 && data[i][idxVersionCompact]) ? data[i][idxVersionCompact].toString().trim() : ""
    });
  }
  return map;
}

// ---------------------------------------------------------------------------
// V3.3 — APPEL MATRICE AVEC CHUNKING ADAPTATIF ET RETRY PAR SCISSION
// ---------------------------------------------------------------------------

/**
 * Appelle Gemini pour un lot d'avis et un ensemble de clients.
 * Chunking adaptatif : nb_clients_par_appel = floor(MAX_PAIRES / nb_avis)
 * Retry par scission : si échec ou réponse incomplète, on scinde le
 * sous-groupe en 2 et on réessaie (profondeur max MC3_PROFONDEUR_SCISSION_MAX).
 *
 * @return {Object} { resultats: [...], sousGroupes: { total, reussis, scissions } }
 */
function appelerGeminiMatrice(lotAvis, clientsCandidats, apiKey, metriques) {
  if (!lotAvis.length || !clientsCandidats.length) {
    return { resultats: [], sousGroupes: { total: 0, reussis: 0, scissions: 0 } };
  }
  if (typeof iagJobB_ScorerPaires !== "function") {
    Logger.log("[IA] iagJobB_ScorerPaires introuvable.");
    return { resultats: [], sousGroupes: { total: 0, reussis: 0, scissions: 0 } };
  }

  // V3.3 : chunking adaptatif basé sur la contrainte de paires max
  const nbAvis = lotAvis.length;
  const tailleSousGroupe = Math.max(1, Math.floor(MC3_MAX_PAIRES_PAR_APPEL / nbAvis));
  const nbSousGroupes = Math.ceil(clientsCandidats.length / tailleSousGroupe);

  Logger.log("[IA V3.3] " + clientsCandidats.length + " client(s) × " + nbAvis +
             " avis = " + (clientsCandidats.length * nbAvis) + " paires.");
  Logger.log("[IA V3.3] Chunk adaptatif : " + tailleSousGroupe +
             " client(s) par sous-groupe → " + nbSousGroupes + " sous-groupe(s).");

  const tousResultats = [];
  let nbReussis = 0;
  let nbScissionsTotal = 0;

  // Compteurs pour bilan
  const stats = { total: nbSousGroupes, reussis: 0, scissions: 0 };

  // Fonction récursive de traitement d'un sous-groupe
  function traiterSousGroupe(clientsSG, profondeur, identifiant) {
    if (clientsSG.length === 0) return;

    const label = "Sous-groupe " + identifiant +
                  " (niveau " + profondeur + ", " + clientsSG.length + " client(s))";
    const attendu = clientsSG.length * nbAvis;

    Logger.log("[IA V3.3] " + label + " : " + attendu + " paires attendues.");

    let resultat;
    try {
      resultat = iagJobB_ScorerPaires(lotAvis, clientsSG, apiKey, metriques);
    } catch (e) {
      Logger.log("[IA V3.3] " + label + " exception : " + e.message);
      resultat = null;
    }

    // Cas 1 : réponse complète
    if (resultat && resultat.complet && resultat.resultats && resultat.resultats.length > 0) {
      resultat.resultats.forEach(function (r) { tousResultats.push(r); });
      stats.reussis++;
      Logger.log("[IA V3.3] " + label + " ✓ COMPLET (" + resultat.resultats.length + " paires).");
      return;
    }

    // Cas 2 : réponse partielle (JSON valide mais incomplet)
    const recu = (resultat && resultat.resultats) ? resultat.resultats.length : 0;
    const raison = resultat ? (resultat.erreur || "incomplet") : "null";

    Logger.log("[IA V3.3] " + label + " ⚠ ÉCHEC/PARTIEL — reçu " + recu +
               "/" + attendu + " (" + raison + ").");

    // Si on a déjà des résultats partiels valides, on les conserve
    if (resultat && resultat.resultats && resultat.resultats.length > 0) {
      resultat.resultats.forEach(function (r) { tousResultats.push(r); });
    }

    // Cas 3 : profondeur max atteinte, on abandonne
    if (profondeur >= MC3_PROFONDEUR_SCISSION_MAX || clientsSG.length <= 1) {
      Logger.log("[IA V3.3] " + label + " ✗ ABANDON (profondeur max ou 1 client).");
      return;
    }

    // Cas 4 : scinder en 2 et réessayer
    stats.scissions++;
    nbScissionsTotal++;
    const milieu = Math.ceil(clientsSG.length / 2);
    const sgA = clientsSG.slice(0, milieu);
    const sgB = clientsSG.slice(milieu);

    Logger.log("[IA V3.3] " + label + " → SCISSION en 2 : " +
               sgA.length + " + " + sgB.length + " clients.");

    traiterSousGroupe(sgA, profondeur + 1, identifiant + "a");
    traiterSousGroupe(sgB, profondeur + 1, identifiant + "b");
  }

  // Boucle principale sur les sous-groupes initiaux
  for (let i = 0; i < clientsCandidats.length; i += tailleSousGroupe) {
    const sg = clientsCandidats.slice(i, i + tailleSousGroupe);
    const num = Math.floor(i / tailleSousGroupe) + 1;
    traiterSousGroupe(sg, 0, String(num));
    Utilities.sleep(600);
  }

  Logger.log("[IA V3.3] Bilan des appels : " + stats.reussis + " réussi(s) / " +
             stats.total + " sous-groupe(s) initial(aux), " +
             stats.scissions + " scission(s) déclenchée(s).");
  Logger.log("[IA V3.3] Total paires reçues : " + tousResultats.length +
             " / " + (clientsCandidats.length * nbAvis) + " attendues.");

  return {
    resultats: tousResultats,
    sousGroupes: stats
  };
}

// ============================================================================
// PIPELINE PRINCIPAL V3.3
// ============================================================================

function executerMatchingClients(metriques) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuilleAO = ss.getSheetByName(SHEET_AO);
  const feuilleClients = ss.getSheetByName("CLIENTS");
  const feuilleAlertes = ss.getSheetByName("ALERTES_A_ENVOYER");
  const feuilleParams = ss.getSheetByName(SHEET_PARAMS);
  if (!feuilleAO || !feuilleClients || !feuilleAlertes || !feuilleParams) return;

  purgerCacheIASiNecessaire();
  feuilleAlertes.getRange("J:J").setNumberFormat("0.00");

  let seuilGlobal = parseFloat(feuilleParams.getRange("H3").getValue());
  if (isNaN(seuilGlobal) || seuilGlobal <= 0) seuilGlobal = 3.0;
  const dateMatchStr = Utilities.formatDate(new Date(), "Africa/Douala", "yyyy-MM-dd HH:mm");

  const profilsEnrichis = chargerProfilsEnrichis(ss);

  const donneesClients = feuilleClients.getDataRange().getValues();
  if (donneesClients.length <= 1) return;
  const h = donneesClients[0].map(function (v) { return v.toString().trim().toUpperCase(); });
  const idxId = h.indexOf("ID_CLIENT");
  const idxNom = h.indexOf("NOM_ENTREPRISE");
  const idxEmail = h.indexOf("EMAIL_DESTINATAIRE");
  const idxActif = h.indexOf("ACTIF");
  const idxE = h.indexOf("MOTS_CLES_INCLUSION");
  const idxF = h.indexOf("MOTS_CLES_EXCLUSION");
  const idxO = h.indexOf("MO_PRIORITAIRES");
  const idxRegions = h.indexOf("REGIONS_CIBLES");
  const idxProcedures = h.indexOf("TYPES_PROCEDURES_VISEES");
  const idxMontantMin = h.indexOf("MONTANT_MINIMUM");
  const idxSeuilClient = h.indexOf("SEUIL_SCORE_MIN_CLIENT");
  const idxPrompt = h.indexOf("PROMPT_METIER_IA");

  const clientsActifs = [];
  let viaEnrichi = 0, viaManuel = 0;
  let avecCompact = 0, sansCompact = 0;

  for (let i = 1; i < donneesClients.length; i++) {
    const ligne = donneesClients[i];
    const statutActif = (ligne[idxActif] || "").toString().trim().toUpperCase();
    if (statutActif !== "OUI" && statutActif !== "TRUE" && statutActif !== "1" && statutActif !== "ACTIF") continue;

    const idClient = (ligne[idxId] || ("CLI_" + i)).toString().trim();
    const seuilVal = (idxSeuilClient !== -1 && ligne[idxSeuilClient] !== "") ? parseFloat(ligne[idxSeuilClient]) : NaN;
    const profil = profilsEnrichis.get(idClient);
    const promptMetierClient = (idxPrompt !== -1 && ligne[idxPrompt]) ? ligne[idxPrompt].toString().trim() : "";

    let inclusions, exclusions, moPrioritaires, source;
    let profilPourIA = "";

    if (profil && (profil.inclusions.length > 0 || profil.exclusions.length > 0 || profil.moPrioritaires.length > 0)) {
      inclusions = profil.inclusions;
      exclusions = profil.exclusions;
      moPrioritaires = profil.moPrioritaires;
      source = "PROFILS_ENRICHIS";
      viaEnrichi++;

      if (profil.profilCompact && profil.profilCompact.length >= 100) {
        profilPourIA = profil.profilCompact;
        avecCompact++;
      } else {
        profilPourIA = mc3ResumerProfil(promptMetierClient);
        sansCompact++;
      }
    } else {
      inclusions = (idxE !== -1 && ligne[idxE]) ? ligne[idxE].toString().split(/[,;]/).map(function (m) { return m.trim().toLowerCase(); }).filter(function (m) { return m; }) : [];
      exclusions = (idxF !== -1 && ligne[idxF]) ? ligne[idxF].toString().split(/[,;]/).map(function (e) { return e.trim().toLowerCase(); }).filter(function (e) { return e; }) : [];
      moPrioritaires = (idxO !== -1 && ligne[idxO]) ? ligne[idxO].toString().split(/[,;]/).map(function (m) { return m.trim().toLowerCase(); }).filter(function (m) { return m; }) : [];
      source = "CLIENTS (manuel)";
      viaManuel++;
      profilPourIA = mc3ResumerProfil(promptMetierClient);
      sansCompact++;
    }

    clientsActifs.push({
      id: idClient,
      nom: (ligne[idxNom] || ("Client " + i)).toString().trim(),
      email: (ligne[idxEmail] || "").toString().trim(),
      inclusions: inclusions,
      exclusions: exclusions,
      moPrioritaires: moPrioritaires,
      source: source,
      regions: (idxRegions !== -1 && ligne[idxRegions]) ? ligne[idxRegions].toString().split(/[,;]/).map(function (r) { return r.trim().toUpperCase(); }).filter(function (r) { return r; }) : [],
      procedures: (idxProcedures !== -1 && ligne[idxProcedures]) ? ligne[idxProcedures].toString().split(/[,;]/).map(function (p) { return normaliserProcedure(p); }).filter(function (p) { return p; }) : [],
      montantMin: (idxMontantMin !== -1 && ligne[idxMontantMin] !== "") ? extraireMontantNumerique(ligne[idxMontantMin]) : 0,
      seuilMin: !isNaN(seuilVal) && seuilVal > 0 ? seuilVal : seuilGlobal,
      promptMetier: profilPourIA
    });
  }

  Logger.log("Clients actifs : " + clientsActifs.length);
  Logger.log("  - Via PROFILS_ENRICHIS : " + viaEnrichi);
  Logger.log("  - Via CLIENTS (manuel) : " + viaManuel);
  Logger.log("  - Avec profil compact  : " + avecCompact);
  Logger.log("  - Sans compact (fallback tronqué) : " + sansCompact);
  if (clientsActifs.length === 0) return;

  const donneesAO = feuilleAO.getDataRange().getValues();
  const avisNouveaux = [];
  for (let i = 1; i < donneesAO.length; i++) {
    const statutAO = (donneesAO[i][14] || "").toString().trim().toUpperCase();
    if (statutAO === "NOUVEAU") {
      const mo = (donneesAO[i][6] || "").toString().trim();
      avisNouveaux.push({
        row: i + 1,
        id: (donneesAO[i][0] || "").toString().trim(),
        numeroAvis: (donneesAO[i][1] || "").toString().trim(),
        titre: (donneesAO[i][5] || "").toString().trim(),
        maitreOuvrage: mo,
        maitreOuvrageNormalise: nettoyerTexte(mo),
        region: (donneesAO[i][7] || "Nationale").toString().trim().toUpperCase(),
        procedureNormalisee: normaliserProcedure(donneesAO[i][8]),
        montantValeur: extraireMontantNumerique(donneesAO[i][10]),
        typePub: (donneesAO[i][15] || "Appel_Offres").toString().trim(),
        source: (donneesAO[i][4] || "").toString().trim(),
        texteComparaison: nettoyerTexte((donneesAO[i][5] || "") + " " + mo)
      });
    }
  }

  const tentatives = chargerTentativesIA();
  const idsNouveaux = new Set(avisNouveaux.map(function (a) { return a.id; }));
  let tentativesNettoyees = false;
  Object.keys(tentatives).forEach(function (id) {
    if (!idsNouveaux.has(id)) { delete tentatives[id]; tentativesNettoyees = true; }
  });
  if (tentativesNettoyees) sauverTentativesIA(tentatives);
  Logger.log("Avis 'NOUVEAU' à évaluer : " + avisNouveaux.length);
  if (avisNouveaux.length === 0) return;

  // V3.4 : contexte du filet anti-doublon inter-sources (alertes déjà existantes par client)
  const contexteEquiv = mc4ConstruireContexteEquivalence(donneesAO, feuilleAlertes.getDataRange().getValues());
  let alertesEcarteesDoublonSource = 0;

  const cacheInfo = chargerCacheIA(ss);
  const cacheIA = cacheInfo.cache;
  const feuilleCache = cacheInfo.feuille;

  const avisCandidats = [];
  let pairesFiltrees = 0, pairesEligibles = 0, pairesViaMo = 0;
  let pairesEcarteesParGardeFou = 0;
  const raisonsRejet = { exclusion: 0, region: 0, procedure: 0, montant: 0, aucunMotCle: 0, doublonSource: 0 };

  avisNouveaux.forEach(function (avis) {
    const clientsEligibles = [];
    clientsActifs.forEach(function (client) {
      // V3.4 : ce client a déjà une alerte pour le même avis venu d'une autre source ?
      const idEquivalent = mc4TrouverAlerteEquivalente(contexteEquiv, avis, client.id);
      if (idEquivalent) {
        pairesFiltrees++; raisonsRejet.doublonSource++; alertesEcarteesDoublonSource++;
        Logger.log("[DOUBLON SOURCE] " + avis.id + " ignoré pour " + client.nom + " : déjà alerté via " + idEquivalent + ".");
        return;
      }

      if (client.exclusions.some(function (ex) { return testerPresenceMot(avis.texteComparaison, ex); })) {
        pairesFiltrees++; raisonsRejet.exclusion++; return;
      }

      if (client.moPrioritaires.length > 0) {
        const viaMo = client.moPrioritaires.some(function (mo) {
          return testerPresenceMot(avis.maitreOuvrageNormalise, mo);
        });
        if (viaMo) {
          clientsEligibles.push({ client: client, motsTrouves: [], depuisMOPrioritaire: true });
          pairesEligibles++; pairesViaMo++;
          return;
        }
      }

      const aFiltreRegion = client.regions.length > 0 && client.regions.indexOf("TOUTES") === -1 && client.regions.indexOf("TOUS") === -1;
      const estGlobal = avis.region.indexOf("NATIONALE") !== -1 || avis.region.indexOf("SERVICES CENTRAUX") !== -1 ||
                        avis.region.indexOf("CAMEROUN") !== -1 || avis.region.indexOf("CEMAC") !== -1;
      if (aFiltreRegion && !estGlobal && !client.regions.some(function (r) { return avis.region.indexOf(r) !== -1; })) {
        pairesFiltrees++; raisonsRejet.region++; return;
      }

      const aFiltreProc = client.procedures.length > 0 && client.procedures.indexOf("TOUTES") === -1 && client.procedures.indexOf("TOUS") === -1;
      if (aFiltreProc && client.procedures.indexOf(avis.procedureNormalisee) === -1) {
        pairesFiltrees++; raisonsRejet.procedure++; return;
      }

      if (client.montantMin > 0 && avis.montantValeur > 0 && avis.montantValeur < client.montantMin) {
        pairesFiltrees++; raisonsRejet.montant++; return;
      }

      const motsTrouves = client.inclusions.filter(function (mc) { return testerPresenceMot(avis.texteComparaison, mc); });
      const cleCache = avis.id + "|" + client.id;
      const dejaEnCache = cacheIA.has(cleCache);
      if (!dejaEnCache && client.inclusions.length > 0 && motsTrouves.length === 0) {
        pairesFiltrees++; raisonsRejet.aucunMotCle++; return;
      }

      clientsEligibles.push({ client: client, motsTrouves: motsTrouves, depuisMOPrioritaire: false });
      pairesEligibles++;
    });

    if (clientsEligibles.length > 0) {
      const filtre = mc3FiltrerGardeFou(avis, clientsEligibles);
      pairesEcarteesParGardeFou += filtre.ecartes;
      avisCandidats.push({ avis: avis, clientsEligibles: filtre.retenus });
    }
  });

  Logger.log("=================================================");
  Logger.log("[PRÉ-FILTRAGE V3.3] Bilan");
  Logger.log("  · Paires totales              : " + (avisNouveaux.length * clientsActifs.length));
  Logger.log("  · Rejetées par exclusion      : " + raisonsRejet.exclusion);
  Logger.log("  · Rejetées par région         : " + raisonsRejet.region);
  Logger.log("  · Rejetées par procédure      : " + raisonsRejet.procedure);
  Logger.log("  · Rejetées par montant        : " + raisonsRejet.montant);
  Logger.log("  · Rejetées par mots-clés      : " + raisonsRejet.aucunMotCle);
  Logger.log("  · Rejetées doublon inter-sources : " + raisonsRejet.doublonSource);
  Logger.log("  · Éligibles après filtrage    : " + pairesEligibles + " (dont " + pairesViaMo + " via MO prioritaire)");
  Logger.log("  · Écartées par garde-fou (max " + MC3_MAX_CLIENTS_PAR_AVIS + "/avis) : " + pairesEcarteesParGardeFou);
  Logger.log("  · Envoyées à l'IA             : " + (pairesEligibles - pairesEcarteesParGardeFou));
  Logger.log("=================================================");

  if (metriques) {
    metriques.pairesFiltreesIA = (metriques.pairesFiltreesIA || 0) + pairesFiltrees;
    metriques.pairesEvalueesIA = (metriques.pairesEvalueesIA || 0) + (pairesEligibles - pairesEcarteesParGardeFou);
    metriques.pairesEcarteesParGardeFou = (metriques.pairesEcarteesParGardeFou || 0) + pairesEcarteesParGardeFou;
  }

  const resultatsIA = new Map();
  avisCandidats.forEach(function (item) {
    item.clientsEligibles.forEach(function (ce) {
      const cle = item.avis.id + "|" + ce.client.id;
      if (cacheIA.has(cle)) resultatsIA.set(cle, cacheIA.get(cle));
    });
  });

  const avisARenvoyer = avisCandidats.filter(function (item) {
    return item.clientsEligibles.some(function (ce) {
      return !cacheIA.has(item.avis.id + "|" + ce.client.id);
    });
  });
  Logger.log("[IA] " + avisARenvoyer.length + " avis à envoyer à Gemini.");

  const nouvellesEvals = [];
  const idsEnvoyesIA = new Set();
  let echecsConsecutifsIA = 0;
  let iaInterrompue = false;
  let totalScissions = 0;

  for (let b = 0; b < avisARenvoyer.length; b += MC_TAILLE_LOT_AVIS_IA) {
    if (mcTempsEcouleMs(metriques) > MC_BUDGET_TEMPS_MS) { iaInterrompue = true; break; }
    if (echecsConsecutifsIA >= MC_MAX_ECHECS_LOTS_CONSECUTIFS) { iaInterrompue = true; break; }

    const tranche = avisARenvoyer.slice(b, b + MC_TAILLE_LOT_AVIS_IA);
    Logger.log("Envoi du lot " + (b + 1) + " à " + Math.min(b + MC_TAILLE_LOT_AVIS_IA, avisARenvoyer.length) + " vers Gemini...");

    const clientIdsDuLot = new Set();
    tranche.forEach(function (item) {
      item.clientsEligibles.forEach(function (ce) { clientIdsDuLot.add(ce.client.id); });
    });
    const clientsDuLot = clientsActifs.filter(function (c) { return clientIdsDuLot.has(c.id); });
    tranche.forEach(function (item) { idsEnvoyesIA.add(item.avis.id); });

    const lotAvisSimplifies = tranche.map(function (item) { return item.avis; });
    const reponse = appelerGeminiMatrice(lotAvisSimplifies, clientsDuLot, null, metriques);

    totalScissions += reponse.sousGroupes.scissions;

    if (reponse.resultats && reponse.resultats.length > 0) {
      echecsConsecutifsIA = 0;
      reponse.resultats.forEach(function (r) {
        if (r.id_ao && r.id_client) {
          const noteIA = Math.min(Math.max(parseInt(r.note_ia, 10) || 1, 1), 5);
          const motif = (r.motif || "").toString().trim();
          const cle = r.id_ao + "|" + r.id_client;
          resultatsIA.set(cle, { noteIA: noteIA, motif: motif });
          nouvellesEvals.push({ idAO: r.id_ao, idClient: r.id_client, noteIA: noteIA, motif: motif });
        }
      });
    } else {
      echecsConsecutifsIA++;
    }
    Utilities.sleep(800);
  }

  if (nouvellesEvals.length > 0) {
    const dateEval = Utilities.formatDate(new Date(), "Africa/Douala", "yyyy-MM-dd HH:mm");
    const lignes = nouvellesEvals.map(function (e) { return [e.idAO, e.idClient, e.noteIA, e.motif, dateEval]; });
    feuilleCache.getRange(feuilleCache.getLastRow() + 1, 1, lignes.length, 5).setValues(lignes.map(secNeutraliserLigne));
    Logger.log("[CACHE IA] " + lignes.length + " nouvelle(s) évaluation(s).");
  }

  const idsEnAttenteRetry = new Set();
  const idsMotsClesSeuls = new Set();

  avisCandidats.forEach(function (item) {
    const id = item.avis.id;
    const incomplet = item.clientsEligibles.some(function (ce) {
      return !resultatsIA.has(id + "|" + ce.client.id);
    });
    if (!incomplet) { delete tentatives[id]; return; }
    if (!idsEnvoyesIA.has(id)) { idsEnAttenteRetry.add(id); return; }
    const n = (tentatives[id] || 0) + 1;
    if (n < MC_MAX_TENTATIVES_IA) { tentatives[id] = n; idsEnAttenteRetry.add(id); }
    else { delete tentatives[id]; idsMotsClesSeuls.add(id); }
  });
  sauverTentativesIA(tentatives);

  const donneesAlertes = feuilleAlertes.getDataRange().getValues();
  const alertesExistantes = new Set();
  for (let i = 1; i < donneesAlertes.length; i++) {
    const idAO = (donneesAlertes[i][1] || "").toString().trim();
    const idClient = (donneesAlertes[i][3] || "").toString().trim();
    if (idAO && idClient) alertesExistantes.add(idAO + "__" + idClient);
  }

  let totalAlertesInserees = 0, compteurMatchsMotsCles = 0, compteurMatchsIA = 0, compteurViaMo = 0;
  let sommeScores = 0;
  const lignesAlertes = [];

  avisCandidats.forEach(function (item) {
    const avis = item.avis;
    if (idsEnAttenteRetry.has(avis.id)) return;
    item.clientsEligibles.forEach(function (ce) {
      const client = ce.client;
      const cleAlerte = avis.id + "__" + client.id;
      if (alertesExistantes.has(cleAlerte)) return;

      // V3.4 : dernier contrôle (couvre aussi deux avis équivalents créés dans cette même exécution)
      const idEquivalentFinal = mc4TrouverAlerteEquivalente(contexteEquiv, avis, client.id);
      if (idEquivalentFinal) {
        alertesEcarteesDoublonSource++;
        Logger.log("[DOUBLON SOURCE] " + avis.id + " : alerte non créée pour " + client.nom + " (équivalent : " + idEquivalentFinal + ").");
        return;
      }

      const cleCache = avis.id + "|" + client.id;
      const resultatIA = resultatsIA.has(cleCache) ? resultatsIA.get(cleCache) : null;

      const score = mc3CalculerScore(avis, client, ce, resultatIA);
      if (score.nbMots > 0) compteurMatchsMotsCles++;
      if (score.scoreIA >= 4) compteurMatchsIA++;
      if (score.scoreFinal < 3) return;
      if (score.scoreFinal < client.seuilMin) return;

      const idMatch = "M_" + avis.id + "_" + client.id + "_" + Date.now().toString().slice(-4) + totalAlertesInserees;
      const libelleType = avis.typePub === "Attribution" ? "[Sous-traitance] " : "";
      const justification = libelleType + (score.motifIA || "Opportunité sélectionnée par l'IA.");

      lignesAlertes.push([
        idMatch, avis.id, avis.numeroAvis, client.id, client.nom, client.email,
        dateMatchStr, "EN_ATTENTE", "", score.scoreFinal, justification,
        score.sMots, score.scoreIA
      ]);
      alertesExistantes.add(cleAlerte);
      mc4EnregistrerAlerte(contexteEquiv, avis, client.id);
      totalAlertesInserees++;
      sommeScores += score.scoreFinal;
      if (ce.depuisMOPrioritaire) compteurViaMo++;

      Logger.log("Match : " + avis.id + " -> " + client.nom +
                 " | Score " + score.scoreFinal.toFixed(2) +
                 " (" + score.decomposition + ")" +
                 (ce.depuisMOPrioritaire ? " [MO]" : ""));
    });
  });

  if (lignesAlertes.length > 0) {
    feuilleAlertes.getRange(feuilleAlertes.getLastRow() + 1, 1, lignesAlertes.length, 13).setValues(lignesAlertes.map(secNeutraliserLigne));
  }

  const lignesATraiter = avisNouveaux.filter(function (a) { return !idsEnAttenteRetry.has(a.id); }).map(function (a) { return a.row; });
  marquerLignesStatut(feuilleAO, lignesATraiter, 15, "TRAITÉ");

  const scoreMoyen = totalAlertesInserees > 0 ? (sommeScores / totalAlertesInserees).toFixed(2) : "—";

  if (metriques) {
    metriques.alertesGenerees = (metriques.alertesGenerees || 0) + totalAlertesInserees;
    metriques.matchsMotsCles = (metriques.matchsMotsCles || 0) + compteurMatchsMotsCles;
    metriques.matchsSemantiqueIA = (metriques.matchsSemantiqueIA || 0) + compteurMatchsIA;
    metriques.avisEnAttenteRetryIA = (metriques.avisEnAttenteRetryIA || 0) + idsEnAttenteRetry.size;
    metriques.avisMotsClesSeuls = (metriques.avisMotsClesSeuls || 0) + idsMotsClesSeuls.size;
    metriques.alertesViaMOPrioritaire = (metriques.alertesViaMOPrioritaire || 0) + compteurViaMo;
    metriques.alertesEcarteesDoublonSource = (metriques.alertesEcarteesDoublonSource || 0) + alertesEcarteesDoublonSource;
  }

  Logger.log("=== Matching V3.3 achevé ===");
  Logger.log("  · " + totalAlertesInserees + " alerte(s) générée(s) (dont " + compteurViaMo + " via MO prioritaire)");
  Logger.log("  · Score moyen : " + scoreMoyen + "/5");
  Logger.log("  · Matchs mots-clés : " + compteurMatchsMotsCles);
  Logger.log("  · Matchs IA ≥ 4 : " + compteurMatchsIA);
  Logger.log("  · Écartées par garde-fou : " + pairesEcarteesParGardeFou);
  Logger.log("  · Scissions déclenchées : " + totalScissions);
  Logger.log("  · Écartées doublon inter-sources : " + alertesEcarteesDoublonSource);
  Logger.log("=================================================");
}

// ============================================================================
// V3.4 — FILET ANTI-DOUBLON INTER-SOURCES (LOT 4)
// ============================================================================

/**
 * Prépare, pour chaque client, la liste des avis déjà alertés (sous forme
 * comparable). Renvoie null si Deduplication.gs est absent (filet inactif).
 * @param {Array} donneesAO      contenu de TOUS_AO (avec en-tête)
 * @param {Array} donneesAlertes contenu de ALERTES_A_ENVOYER (avec en-tête)
 */
function mc4ConstruireContexteEquivalence(donneesAO, donneesAlertes) {
  if (typeof dedupItemDepuisChamps !== "function" || typeof dedupSontEquivalentsInterSources !== "function") {
    Logger.log("[DOUBLON SOURCE] Deduplication.gs V2.3 absent : filet anti-doublon inactif.");
    return null;
  }

  const indexAO = new Map();
  for (let i = 1; i < donneesAO.length; i++) {
    const id = (donneesAO[i][0] || "").toString().trim();
    if (id) indexAO.set(id, i);
  }

  const contexte = { parClient: new Map(), cacheAvis: new Map() };
  for (let k = 1; k < donneesAlertes.length; k++) {
    const idAO = (donneesAlertes[k][1] || "").toString().trim();
    const idClient = (donneesAlertes[k][3] || "").toString().trim();
    if (!idAO || !idClient || !indexAO.has(idAO)) continue;
    const l = donneesAO[indexAO.get(idAO)];
    const item = dedupItemDepuisChamps(l[1], l[5], l[6], l[10], l[4], l[15], l[11]);
    item.id = idAO;
    if (!contexte.parClient.has(idClient)) contexte.parClient.set(idClient, []);
    contexte.parClient.get(idClient).push(item);
  }
  return contexte;
}

/** Convertit un avis du matching en objet comparable (mis en cache par avis). */
function mc4ItemDepuisAvis(contexte, avis) {
  if (contexte.cacheAvis.has(avis.id)) return contexte.cacheAvis.get(avis.id);
  const item = dedupItemDepuisChamps(
    avis.numeroAvis, avis.titre, avis.maitreOuvrage,
    avis.montantValeur ? String(avis.montantValeur) : "",
    avis.source, avis.typePub, ""
  );
  item.id = avis.id;
  contexte.cacheAvis.set(avis.id, item);
  return item;
}

/**
 * Renvoie l'ID d'un avis déjà alerté pour ce client et équivalent à cet avis
 * (même avis, autre source), ou "" s'il n'y en a pas.
 */
function mc4TrouverAlerteEquivalente(contexte, avis, idClient) {
  if (!contexte) return "";
  const existants = contexte.parClient.get(idClient);
  if (!existants || existants.length === 0) return "";
  const item = mc4ItemDepuisAvis(contexte, avis);
  for (let i = 0; i < existants.length; i++) {
    if (existants[i].id === avis.id) continue;
    if (dedupSontEquivalentsInterSources(item, existants[i]).equivalents) return existants[i].id;
  }
  return "";
}

/** Enregistre une alerte qui vient d'être créée (pour les contrôles suivants de la même exécution). */
function mc4EnregistrerAlerte(contexte, avis, idClient) {
  if (!contexte) return;
  if (!contexte.parClient.has(idClient)) contexte.parClient.set(idClient, []);
  contexte.parClient.get(idClient).push(mc4ItemDepuisAvis(contexte, avis));
}

/**
 * TEST DU LOT 4 (matching) — lecture seule : rejoue le filet sur les alertes
 * déjà présentes et liste les avis qui auraient été écartés. Aucune écriture,
 * aucun e-mail, aucun appel IA.
 */
function mc4TesterFiletDoublonSource() {
  Logger.log("=================================================");
  Logger.log("=== TEST LOT 4 : FILET ANTI-DOUBLON (matching) ===");
  Logger.log("Fichier : " + SpreadsheetApp.getActiveSpreadsheet().getName());
  Logger.log("=================================================");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const donneesAO = ss.getSheetByName(SHEET_AO).getDataRange().getValues();
  const donneesAlertes = ss.getSheetByName("ALERTES_A_ENVOYER").getDataRange().getValues();
  const contexte = mc4ConstruireContexteEquivalence(donneesAO, donneesAlertes);
  if (!contexte) { Logger.log("❌ Deduplication.gs V2.3 absent : filet inactif."); return; }

  let nbClients = 0, nbAlertes = 0;
  contexte.parClient.forEach(function (liste) { nbClients++; nbAlertes += liste.length; });
  Logger.log("Contexte : " + nbAlertes + " alerte(s) connue(s) pour " + nbClients + " client(s).");

  // Rejeu : pour chaque avis de TOUS_AO, y a-t-il une alerte équivalente d'une autre source pour un client ?
  let trouves = 0;
  const vus = new Set();
  for (let i = 1; i < donneesAO.length; i++) {
    const l = donneesAO[i];
    const id = (l[0] || "").toString().trim();
    if (!id) continue;
    const avis = {
      id: id, numeroAvis: (l[1] || "").toString(), titre: (l[5] || "").toString(),
      maitreOuvrage: (l[6] || "").toString(), montantValeur: extraireMontantNumerique(l[10]),
      source: (l[4] || "").toString(), typePub: (l[15] || "Appel_Offres").toString()
    };
    contexte.parClient.forEach(function (liste, idClient) {
      const eq = mc4TrouverAlerteEquivalente(contexte, avis, idClient);
      const cle = id + "|" + idClient;
      if (eq && !vus.has(cle)) {
        vus.add(cle);
        trouves++;
        Logger.log("  · " + id + " (" + avis.source + ") n'aurait PAS été alerté à " + idClient + " : déjà alerté via " + eq);
      }
    });
  }
  Logger.log("");
  Logger.log("Bilan : " + trouves + " avis auraient été écartés par le filet (aucune écriture effectuée).");
  Logger.log("=== FIN DU TEST ===");
}