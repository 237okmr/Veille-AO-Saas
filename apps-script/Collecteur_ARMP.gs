// >>> FICHIER : Collecteur_ARMP.gs <<< (à coller dans l'onglet du même nom)
/**
 * ============================================================================
 * SCRIPT 1 : COLLECTEUR ARMP V6.5 (LOT S1b)
 * ============================================================================
 * NOUVEAUTÉ V6.5 (LOT S1b) : les textes venus de l'ARMP et de l'IA (titre, maître d'ouvrage,
 * région, procédure, montant, numéro d'avis) ne sont plus écrits tels quels dans TOUS_AO : un
 * texte qui commence par = + - @ serait exécuté par Google Sheets comme une formule.
 * Ils reçoivent une apostrophe devant (secNeutraliserLigne / secNeutraliserFormule, fichier
 * SecuriteDonnees.gs, dont ce script dépend). Aucun autre changement de comportement.
 *
 * NOUVEAUTÉS V6.4 (LOT S1 — relance automatique + fenêtre de veille glissante)
 * ---------------------------------------------------------------------------
 *   • Relance automatique (3 tentatives au plus, pauses de 4 s puis 12 s) quand
 *     Google Sheets échoue de façon passagère (« Service Spreadsheets failed… »,
 *     délai dépassé, erreur serveur). Les autres erreurs (bug de code, droits,
 *     quota journalier) ne sont JAMAIS relancées. Aucune relance si plus de
 *     90 secondes se sont écoulées depuis le début de la première tentative, et
 *     le budget de temps d'une relance est réduit d'autant (la routine de nuit
 *     doit rester sous les 6 minutes de Google).
 *     Sans risque de doublon : chaque tentative relit la feuille et ignore les
 *     avis déjà présents. (Un avis inséré par une tentative interrompue n'est pas
 *     enrichi par l'IA ce jour-là ; le rattrapage du matin le valide et le traite.)
 *   • Fenêtre de veille glissante : la fenêtre (PARAMETRES!H4, 24 h par défaut)
 *     s'élargit automatiquement quand la dernière collecte COMPLÈTE remonte à
 *     plus longtemps (jour manqué, panne). Plafond : 168 h (modifiable par la
 *     propriété du script ARMP_FENETRE_MAX_HEURES, entre 48 et 336).
 *   • La date de dernière collecte complète est gardée dans la propriété du
 *     script ARMP_DERNIERE_COLLECTE_OK (aucune colonne ni feuille ajoutée).
 *     Une collecte interrompue (budget de temps, erreur réseau, page ARMP en
 *     erreur ou vide, limite de pages) n'avance PAS cette date.
 *   • Le résultat de la dernière collecte (complète ou non, raisons, tentatives)
 *     est gardé dans la propriété ARMP_ETAT_COLLECTE et lu par le contrôle de santé
 *     quotidien (SanteQuotidienne.gs V1.2) via armpLireEtatCollecte().
 *   • Test sans effet sur les feuilles : testerCollecteARMPFenetreEtRelance().
 *
 * NOUVEAUTÉS V6.3 (correctif B)
 * ---------------------------------------------------------------------------
 *   • extraireMaitreOuvrageTexte RÉÉCRITE : extraction plus robuste
 *     - Regex permissive jusqu'à 150 caractères (au lieu de 60)
 *     - Décodage HTML préalable
 *     - Coupure propre sur ; et autres séparateurs (Type:, Région:, etc.)
 *     - Patterns spécifiques pour MAIRE / PREFET / GOUVERNEUR / MINISTERE
 *
 * RAPPEL V6.2
 * ---------------------------------------------------------------------------
 *   • extraireRegionTexte par token exact
 *   • Mise à jour de Region via Gemini
 *   • dedupliquerAvisRecents passe Numero_Avis
 * ============================================================================
 */

const SHEET_AO = "TOUS_AO";
const SHEET_PARAMS = "PARAMETRES";
const MAX_PAGES = 10;

const ARMP_MARGE_DATE_SANS_HEURE_H = 24;
const ARMP_PAGES_PAR_LOT = 3;
const ARMP_BUDGET_COLLECTE_MS = 150000;
const ARMP_BUDGET_ENRICHISSEMENT_IA_MS = 90000;

// V6.4 — relance et fenêtre glissante
const ARMP_PROP_DERNIERE_COLLECTE_OK = "ARMP_DERNIERE_COLLECTE_OK";
const ARMP_PROP_FENETRE_MAX_HEURES = "ARMP_FENETRE_MAX_HEURES";
const ARMP_PROP_ETAT_COLLECTE = "ARMP_ETAT_COLLECTE";
const ARMP_FENETRE_MAX_HEURES_DEFAUT = 168;     // 7 jours
const ARMP_TOLERANCE_ECART_H = 6;               // écart normal entre deux collectes quotidiennes
const ARMP_MAX_PAGES_RATTRAPAGE = 25;           // pages lues quand la fenêtre est élargie
const ARMP_TENTATIVES_MAX = 3;
const ARMP_PAUSES_RELANCE_MS = [4000, 12000];
const ARMP_DUREE_MAX_AVANT_RELANCE_MS = 90000;  // temps écoulé depuis la 1re tentative au-delà duquel on ne relance plus
const ARMP_BUDGET_COLLECTE_MIN_MS = 45000;      // budget minimal de collecte lors d'une relance
const ARMP_BUDGET_IA_MIN_MS = 30000;            // budget minimal d'enrichissement IA lors d'une relance

// Contexte de la session de collecte en cours (début, numéro de tentative)
var armpContexteCollecte = { debutMs: 0, tentative: 1 };

// ----------------------------------------------------------------------------
// UTILITAIRES DE DATE
// ----------------------------------------------------------------------------

function parseDateCameroun(chaineDate) {
  if (chaineDate instanceof Date) {
    return isNaN(chaineDate.getTime()) ? null : chaineDate;
  }
  if (!chaineDate || chaineDate === "Non précisée" || String(chaineDate).includes("N/A")) return null;
  const s = String(chaineDate).replace(/^['~]/, "").trim();

  let m = /^([0-9]{2})-([0-9]{2})-([0-9]{4})(?:\s+([0-9]{2}):([0-9]{2})(?::([0-9]{2}))?)?/.exec(s);
  if (m) {
    const d = new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    return isNaN(d.getTime()) ? null : d;
  }
  m = /^([0-9]{2})\/([0-9]{2})\/([0-9]{4})(?:\s+([0-9]{2}):([0-9]{2})(?::([0-9]{2}))?)?/.exec(s);
  if (m) {
    const d = new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    return isNaN(d.getTime()) ? null : d;
  }
  m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})(?:[ T]([0-9]{2}):([0-9]{2})(?::([0-9]{2}))?)?/.exec(s);
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    return isNaN(d.getTime()) ? null : d;
  }
  if (/^[A-Za-z]{3}\s[A-Za-z]{3}\s\d{1,2}\s\d{4}/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function estDateCoherente(dateObj, estDateLimite) {
  if (!dateObj || isNaN(dateObj.getTime())) return false;
  const annee = dateObj.getFullYear();
  const maintenant = new Date();
  if (annee < 2020 || annee > maintenant.getFullYear() + 5) return false;
  if (estDateLimite) {
    const limite = new Date(maintenant.getTime() - 24 * 60 * 60 * 1000);
    if (dateObj.getTime() < limite.getTime()) return false;
  }
  return true;
}

// ----------------------------------------------------------------------------
// UTILITAIRES HTML
// ----------------------------------------------------------------------------

function decoderEntitesHtml(texte) {
  if (!texte) return "";
  return String(texte)
    .replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(parseInt(n, 10)); })
    .replace(/&#x([0-9a-f]+);/gi, function (m, h) { return String.fromCharCode(parseInt(h, 16)); })
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function extraireCleLien(lien) {
  if (!lien) return null;
  const m = /type_publication=([A-Za-z\-]+)(?:&amp;|&)id_publication=([0-9]+)/i.exec(String(lien));
  return m ? (m[1].toUpperCase() + "|" + m[2]) : null;
}

function extraireNumeroAvis(texte, idPub) {
  if (!texte) return "ARMP_" + idPub;
  const t = String(texte).replace(/\s+/g, " ").trim();

  const regex = /([0-9]{2,6}[A-Z]?(?:\s*\/\s*[A-Z0-9][A-Z0-9\.\-]*){3,15})/gi;
  let match;
  let meilleur = null;
  while ((match = regex.exec(t)) !== null) {
    let candidat = match[1].replace(/\s*\/\s*/g, "/").replace(/\s+/g, "").toUpperCase();
    if (candidat.length > 120) candidat = candidat.substring(0, 120);
    if (!meilleur || candidat.length > meilleur.length) meilleur = candidat;
  }
  if (meilleur) return meilleur;

  const m2 = /\b([A-Z][A-Z0-9]{0,5}(?:-[A-Z0-9]{2,6}){2,4})\b/.exec(t);
  if (m2) return m2[1].toUpperCase();

  return "ARMP_" + idPub;
}

function extraireRegionTexte(texte) {
  if (!texte) return "Nationale";
  const t = String(texte).toUpperCase()
    .replace(/[^A-ZÀ-ÿ0-9\- ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/\bEXTR[ÊE]ME\s*-\s*NORD\b/.test(t) || /\bEXTREME\s*-\s*NORD\b/.test(t)) return "EXTRÊME-NORD";
  if (/\bNORD\s*-\s*OUEST\b/.test(t)) return "NORD-OUEST";
  if (/\bSUD\s*-\s*OUEST\b/.test(t)) return "SUD-OUEST";
  if (/\bSERVICES\s+CENTRAUX\b/.test(t)) return "SERVICES CENTRAUX";

  const tokens = new Set(t.split(" ").filter(function (x) { return x.length > 0; }));
  if (tokens.has("ADAMAOUA")) return "ADAMAOUA";
  if (tokens.has("LITTORAL")) return "LITTORAL";
  if (tokens.has("CENTRE")) return "CENTRE";
  if (tokens.has("NORD")) return "NORD";
  if (tokens.has("OUEST")) return "OUEST";
  if (tokens.has("SUD")) return "SUD";
  if (tokens.has("EST")) return "EST";
  return "Nationale";
}

/**
 * V6.3 — Extraction robuste du maître d'ouvrage.
 * Décodage HTML préalable, regex permissive (150 car.), coupure propre.
 */
function extraireMaitreOuvrageTexte(texte) {
  if (!texte) return "Non précisé";

  // Décodage HTML au cas où
  let t = decoderEntitesHtml(String(texte));
  t = t.replace(/[\u0000-\u001F\u007F]/g, " ");
  t = t.replace(/\s+/g, " ").trim();

  // --- Priorité 1 : pattern "MO/AC: X" (le plus fiable sur ARMP)
  let m = /MO\/AC\s*:?\s*([^\n\r]{3,150})/i.exec(t);
  if (m && m[1]) {
    let mo = m[1]
      .replace(/\s*Type\s*:.*$/i, "")
      .replace(/\s*R[ée]gion\s*:.*$/i, "")
      .replace(/\s*Montant\s*:.*$/i, "")
      .replace(/\s*Publi[ée]\s+le\s*:.*$/i, "")
      .replace(/\s*Date\s+de\s+cl[ôo]ture\s*:.*$/i, "")
      .replace(/\s*Heure\s+de\s+cl[ôo]ture\s*:.*$/i, "")
      .replace(/\s*T[ée]l[ée]charger\s*:.*$/i, "")
      .replace(/\s*Partager.*$/i, "")
      .replace(/;.*$/, "")
      .trim();
    if (mo && mo.length >= 3) return mo;
  }

  // --- Priorité 2 : patterns spécifiques sans MO/AC
  const patterns = [
    /(?:MAIRE|MAIRIE)\s+(?:DE\s+|D[''`]\s*)([A-ZÀ-ÿ][^,;.\n\r]{2,90})/i,
    /COMMUNE\s+(?:DE\s+|D[''`]\s*)([A-ZÀ-ÿ][^,;.\n\r]{2,90})/i,
    /PREFET\s*(?:DE\s+|D[''`]\s*|>\s*)([A-ZÀ-ÿ][^,;.\n\r]{2,90})/i,
    /GOUVERNEUR\s+(?:DE\s+|D[''`]\s*)([A-ZÀ-ÿ][^,;.\n\r]{2,90})/i,
    /MINIST(?:ERE|RE)\s+(?:DE\s+|D[''`]\s*)([A-ZÀ-ÿ][^,;.\n\r]{2,90})/i,
    /DIRECTEUR\s+G[ÉE]N[ÉE]RAL\s+(?:DE\s+|D[''`]\s*)([A-ZÀ-ÿ][^,;.\n\r]{2,90})/i,
    /RECTEUR\s+DE\s+L[''`]?UNIVERSIT[ÉE]\s+(?:DE\s+|D[''`]\s*)([A-ZÀ-ÿ][^,;.\n\r]{2,90})/i
  ];

  for (let i = 0; i < patterns.length; i++) {
    const match = patterns[i].exec(t);
    if (match && match[1]) {
      const mo = match[1].replace(/;.*$/, "").replace(/\s+/g, " ").trim();
      // Garde-fou : au moins 3 caractères significatifs
      if (mo && mo.length >= 3) return mo;
    }
  }

  return "Non précisé";
}

function estimerDateLimiteLegale(datePubStr, typeProcedure, typePublication) {
  if (typePublication === "Attribution") return "N/A (Marché attribué)";
  const datePub = parseDateCameroun(datePubStr);
  if (!datePub || !estDateCoherente(datePub, false)) {
    return "Non précisée (Consulter DAO)";
  }
  const proc = (typeProcedure || "").toUpperCase();
  let joursAjout = 21;
  if (proc.includes("DC") || proc.includes("COTATION") || proc.includes("RFQ")) joursAjout = 15;
  else if (proc.includes("AMI") || proc.includes("ASMI") || proc.includes("MANIFESTATION")) joursAjout = 21;
  else if (proc.includes("AO") || proc.includes("AONO") || proc.includes("AONI")) joursAjout = 30;

  const d = new Date(datePub.getTime() + joursAjout * 24 * 60 * 60 * 1000);
  const j = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const a = d.getFullYear();
  return "~" + j + "-" + mo + "-" + a + " 12:00 (Estimée: voir DAO)";
}

function extraireDateCloture(blocHtml) {
  const patterns = [
    /Date\s*de\s*cl[ôo]ture\s*:?[\s\S]*?<div[^>]*class=["']d-table-cell["'][^>]*>\s*([0-9]{2}-[0-9]{2}-[0-9]{4})/i,
    /Date\s*de\s*cl[ôo]ture\s*:?[\s\S]*?<div[^>]*class=["']d-table-cell["'][^>]*>\s*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i,
    /Date\s*de\s*cl[ôo]ture\s*:?\s*<\/?[^>]*>\s*([0-9]{2}-[0-9]{2}-[0-9]{4})/i,
    /Date\s*de\s*cl[ôo]ture\s*:?\s*<\/?[^>]*>\s*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i,
    /Cl[ôo]ture\s*:?\s*<\/?[^>]*>\s*([0-9]{2}-[0-9]{2}-[0-9]{4})/i
  ];
  let dateStr = "";
  for (let p of patterns) {
    const m = p.exec(blocHtml);
    if (m) { dateStr = m[1].trim(); break; }
  }
  if (!dateStr) return "Non précisée";

  dateStr = dateStr.replace(/\//g, "-");

  let heureStr = "12:00";
  const heures = [
    /Heure\s*de\s*cl[ôo]ture\s*:?[\s\S]*?<div[^>]*class=["']d-table-cell["'][^>]*>\s*([0-9]{2}:[0-9]{2})/i,
    /Heure\s*de\s*cl[ôo]ture\s*:?\s*([0-9]{2}:[0-9]{2})/i
  ];
  for (let p of heures) {
    const m = p.exec(blocHtml);
    if (m) { heureStr = m[1].trim(); break; }
  }
  return dateStr + " " + heureStr;
}

// ----------------------------------------------------------------------------
// CONVERSIONS POUR JOB A
// ----------------------------------------------------------------------------

function formaterMontantIA(montant, devise) {
  if (montant === null || montant === undefined || isNaN(montant)) return null;
  const n = Math.round(Number(montant));
  const str = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return str + " " + (devise || "FCFA");
}

function formaterDateLimiteIA(isoStr) {
  if (!isoStr) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(isoStr));
  if (!m) return null;
  return m[3] + "-" + m[2] + "-" + m[1] + " " + m[4] + ":" + m[5];
}

function armpLireCleApi(feuilleParams) {
  if (!feuilleParams) return "";
  // V6.3 : prend la première clé via iagLireClesGemini si disponible
  if (typeof iagLireClesGemini === "function") {
    try {
      const cles = iagLireClesGemini(feuilleParams);
      if (cles && cles.length > 0) return cles[0];
    } catch (e) {}
  }
  const brut = feuilleParams.getRange("H1").getValue().toString().trim();
  if (!brut) return "";
  const parties = brut.split(/[,\n;]/).map(function (c) { return c.trim(); }).filter(function (c) { return c; });
  return parties.length > 0 ? parties[0] : "";
}

// ============================================================================
// V6.4 — RELANCE AUTOMATIQUE ET FENÊTRE GLISSANTE
// ============================================================================

/**
 * Vrai si l'erreur ressemble à un incident passager de Google (relance utile).
 * Les erreurs de code, de droits et de quota journalier ne sont jamais relancées.
 */
function armpEstErreurTransitoire(message) {
  const m = String(message === null || message === undefined ? "" : message).toLowerCase();
  if (!m) return false;
  if (/for one day|limit exceeded|authorization|permission|not defined|is not a function|cannot read|undefined|introuvable/.test(m)) {
    return false;
  }
  return /spreadsheets failed|timed out|server error|try again|try utilities\.sleep|too many times in a short time|internal error|temporarily unavailable|service unavailable|backend error|service error/.test(m);
}

/**
 * Exécute une fonction avec relance automatique sur erreur passagère.
 * @param {string} nom Nom affiché dans le journal
 * @param {Function} fonction Fonction sans argument (relancée telle quelle)
 * @param {Object} [options] { tentativesMax, pausesMs, dureeMaxMs (temps écoulé depuis le début de la 1re tentative), pause(ms), avantRelance() }
 * @return {Object} { tentatives }  — relance l'erreur finale si toutes les tentatives échouent
 */
function armpAvecRelance(nom, fonction, options) {
  const opt = options || {};
  const tentativesMax = opt.tentativesMax || ARMP_TENTATIVES_MAX;
  const pausesMs = opt.pausesMs || ARMP_PAUSES_RELANCE_MS;
  const dureeMaxMs = (opt.dureeMaxMs !== undefined) ? opt.dureeMaxMs : ARMP_DUREE_MAX_AVANT_RELANCE_MS;
  const pause = opt.pause || function (ms) { Utilities.sleep(ms); };

  let derniereErreur = null;
  const debutGlobal = new Date().getTime();
  for (let t = 1; t <= tentativesMax; t++) {
    try {
      fonction();
      if (t > 1) Logger.log("[RELANCE] " + nom + " : réussi à la tentative " + t + ".");
      return { tentatives: t };
    } catch (e) {
      derniereErreur = e;
      const message = String((e && e.message) || e);
      const duree = new Date().getTime() - debutGlobal;
      const peutRelancer = t < tentativesMax && armpEstErreurTransitoire(message) && duree <= dureeMaxMs;
      Logger.log("[RELANCE] " + nom + " : tentative " + t + "/" + tentativesMax + " en échec (" + message + ")" +
                 (peutRelancer ? " — nouvelle tentative." : " — pas de nouvelle tentative."));
      if (!peutRelancer) {
        const erreurFinale = new Error(message + (t > 1 ? " (après " + t + " tentatives)" : ""));
        throw erreurFinale;
      }
      if (typeof opt.avantRelance === "function") opt.avantRelance();
      pause(pausesMs[Math.min(t - 1, pausesMs.length - 1)]);
    }
  }
  throw derniereErreur;
}

/**
 * Calcul PUR de la fenêtre de veille effective (aucun accès aux feuilles).
 * @param {number} fenetreConfigHeures fenêtre réglée dans PARAMETRES (H4)
 * @param {number|null} derniereOkMs instant (ms) de la dernière collecte complète
 * @param {number} maintenantMs instant courant (ms)
 * @param {number} plafondHeures plafond de la fenêtre
 * @return {Object} { heures, elargie, ecartHeures, plafonnee }
 */
function armpCalculerFenetreEffective(fenetreConfigHeures, derniereOkMs, maintenantMs, plafondHeures) {
  const base = (fenetreConfigHeures > 0) ? fenetreConfigHeures : 24;
  const plafond = Math.max(plafondHeures || ARMP_FENETRE_MAX_HEURES_DEFAUT, base);
  const res = { heures: base, elargie: false, ecartHeures: null, plafonnee: false };

  if (derniereOkMs === null || derniereOkMs === undefined || isNaN(derniereOkMs) || derniereOkMs > maintenantMs) {
    return res;
  }
  const ecart = Math.ceil((maintenantMs - derniereOkMs) / 3600000);
  res.ecartHeures = ecart;
  if (ecart <= base + ARMP_TOLERANCE_ECART_H) return res;

  res.elargie = true;
  if (ecart > plafond) {
    res.heures = plafond;
    res.plafonnee = true;
  } else {
    res.heures = ecart;
  }
  return res;
}

/** Plafond de la fenêtre : propriété ARMP_FENETRE_MAX_HEURES (48 à 336) ou 168 h. */
function armpLirePlafondFenetreHeures() {
  try {
    const brut = PropertiesService.getScriptProperties().getProperty(ARMP_PROP_FENETRE_MAX_HEURES);
    const n = parseInt(brut, 10);
    if (!isNaN(n) && n >= 48 && n <= 336) return n;
  } catch (e) {}
  return ARMP_FENETRE_MAX_HEURES_DEFAUT;
}

/**
 * Instant (ms) de la dernière collecte ARMP COMPLÈTE, ou null.
 * Source principale : propriété du script. Secours (premier passage seulement) :
 * PARAMETRES!E2 (dernière exécution), lu au fuseau Africa/Douala (UTC+1).
 */
function armpLireDerniereCollecteOkMs(feuilleParams) {
  try {
    const brut = PropertiesService.getScriptProperties().getProperty(ARMP_PROP_DERNIERE_COLLECTE_OK);
    if (brut) {
      const t = new Date(brut).getTime();
      if (!isNaN(t)) return t;
    }
  } catch (e) {}
  try {
    const v = feuilleParams.getRange("E2").getValue();
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v.getTime();
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(v || "").trim());
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - 60 * 60 * 1000;
  } catch (e) {}
  return null;
}

/** Temps écoulé (ms) depuis le début de la session de collecte en cours. */
function armpEcouleMs() {
  return armpContexteCollecte && armpContexteCollecte.debutMs ? (new Date().getTime() - armpContexteCollecte.debutMs) : 0;
}

/** Fusionne des informations dans l'état de la dernière collecte (propriété du script). */
function armpEnregistrerEtat(infos) {
  try {
    const props = PropertiesService.getScriptProperties();
    let actuel = {};
    try { actuel = JSON.parse(props.getProperty(ARMP_PROP_ETAT_COLLECTE) || "{}") || {}; } catch (e) { actuel = {}; }
    const maj = Object.assign({}, actuel, infos || {});
    if (maj.raisons && maj.raisons.length > 6) maj.raisons = maj.raisons.slice(0, 6);
    props.setProperty(ARMP_PROP_ETAT_COLLECTE, JSON.stringify(maj).substring(0, 8000));
  } catch (e) {
    Logger.log("[ARMP] Impossible d'enregistrer l'état de la collecte : " + e.message);
  }
}

/**
 * Lecture de l'état de la collecte pour le contrôle de santé (lecture seule).
 * @return {Object} { okMs: instant de la dernière collecte complète ou null, etat: objet ou null }
 */
function armpLireEtatCollecte() {
  let okMs = null;
  let etat = null;
  try {
    const props = PropertiesService.getScriptProperties();
    const brut = props.getProperty(ARMP_PROP_DERNIERE_COLLECTE_OK);
    if (brut) {
      const t = new Date(brut).getTime();
      if (!isNaN(t)) okMs = t;
    }
    const e = props.getProperty(ARMP_PROP_ETAT_COLLECTE);
    if (e) etat = JSON.parse(e);
  } catch (err) {}
  return { okMs: okMs, etat: etat };
}

/** Enregistre l'instant de départ d'une collecte complète. */
function armpMarquerCollecteOk(instantMs) {
  try {
    PropertiesService.getScriptProperties().setProperty(ARMP_PROP_DERNIERE_COLLECTE_OK, new Date(instantMs).toISOString());
  } catch (e) {
    Logger.log("[ARMP] Impossible d'enregistrer la date de collecte complète : " + e.message);
  }
}

// ============================================================================
// COLLECTE PRINCIPALE
// ============================================================================

/**
 * Point d'entrée de la collecte ARMP (nom inchangé : appelé par Orchestration.gs).
 * V6.4 : relance automatique sur incident passager de Google Sheets.
 */
function executerCollecteARMP(metriques) {
  const ignoresAvant = metriques ? (metriques.aoIgnoresHorsFenetre || 0) : 0;
  armpContexteCollecte = { debutMs: new Date().getTime(), tentative: 0 };
  let resultat;
  try {
    resultat = armpAvecRelance("Collecte ARMP", function () {
      armpContexteCollecte.tentative++;
      executerCollecteARMP_Tentative(metriques);
    }, {
      // Une tentative en échec ne doit pas compter deux fois les avis ignorés
      avantRelance: function () { if (metriques) metriques.aoIgnoresHorsFenetre = ignoresAvant; }
    });
  } catch (e) {
    armpEnregistrerEtat({
      fin: new Date().toISOString(), complete: false, echec: String(e.message).substring(0, 300),
      tentatives: armpContexteCollecte.tentative
    });
    throw e;
  }
  armpEnregistrerEtat({ tentatives: resultat.tentatives });
}

function executerCollecteARMP_Tentative(metriques) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuilleAO = ss.getSheetByName(SHEET_AO);
  const feuilleParams = ss.getSheetByName(SHEET_PARAMS);

  if (!feuilleAO || !feuilleParams) {
    Logger.log("Erreur : Feuilles requises introuvables.");
    return;
  }

  feuilleAO.getRange("L:L").setNumberFormat("@");

  let fenetreHeures = parseInt(feuilleParams.getRange("H4").getValue(), 10);
  if (isNaN(fenetreHeures) || fenetreHeures <= 0) fenetreHeures = 24;

  // V6.4 — fenêtre glissante : couvre tout l'écart depuis la dernière collecte complète
  const fenetre = armpCalculerFenetreEffective(
    fenetreHeures, armpLireDerniereCollecteOkMs(feuilleParams), new Date().getTime(), armpLirePlafondFenetreHeures());
  fenetreHeures = fenetre.heures;
  const pagesMax = fenetre.elargie ? ARMP_MAX_PAGES_RATTRAPAGE : MAX_PAGES;
  if (fenetre.elargie) {
    Logger.log("Collecte ARMP : fenêtre élargie à " + fenetreHeures + " h (dernière collecte complète il y a " +
               fenetre.ecartHeures + " h)" + (fenetre.plafonnee ? " — plafonnée." : "."));
    if (metriques && metriques.alertesCritiques) {
      metriques.alertesCritiques.push("Rattrapage ARMP : fenêtre élargie à " + fenetreHeures + " h" +
        (fenetre.plafonnee ? " (plafond atteint : des avis plus anciens ont pu être manqués)." : "."));
    }
  }
  const limiteFenetreMs = (fenetreHeures + ARMP_MARGE_DATE_SANS_HEURE_H) * 60 * 60 * 1000;

  const donneesExistantes = feuilleAO.getDataRange().getValues();
  const idsExistants = new Set();
  const clesLiensExistantes = new Set();
  for (let i = 1; i < donneesExistantes.length; i++) {
    if (donneesExistantes[i][0]) idsExistants.add(donneesExistantes[i][0].toString().trim());
    const cleLien = extraireCleLien(donneesExistantes[i][12]);
    if (cleLien) clesLiensExistantes.add(cleLien);
  }

  const maintenant = new Date();
  const dateCollecte = Utilities.formatDate(maintenant, "Africa/Douala", "yyyy-MM-dd HH:mm");

  let totalInseres = 0;
  let doublonsEvites = 0;
  let datesEstimees = 0;
  let continuerPagination = true;
  let budgetDepasse = false;
  let collecteComplete = true;   // V6.4 : devient faux si la collecte est interrompue ou suspecte
  const raisonsIncomplete = [];  // V6.4 : raisons lisibles, transmises au contrôle de santé
  const debutCollecte = new Date().getTime();
  // Lors d'une relance, le budget est réduit du temps déjà consommé (limite Google : 6 minutes)
  const budgetCollecteMs = Math.max(ARMP_BUDGET_COLLECTE_MIN_MS, ARMP_BUDGET_COLLECTE_MS - armpEcouleMs());

  const avisInseresSession = [];

  for (let pageDebut = 1; pageDebut <= pagesMax && continuerPagination; pageDebut += ARMP_PAGES_PAR_LOT) {
    if (new Date().getTime() - debutCollecte > budgetCollecteMs) {
      budgetDepasse = true;
      collecteComplete = false;
      raisonsIncomplete.push("budget de temps atteint avant la page " + pageDebut);
      Logger.log("Collecte ARMP : budget de temps atteint, arrêt avant la page " + pageDebut + ".");
      break;
    }

    const requetes = [];
    const numerosPages = [];
    for (let p = pageDebut; p < pageDebut + ARMP_PAGES_PAR_LOT && p <= pagesMax; p++) {
      numerosPages.push(p);
      requetes.push({
        url: "https://www.armp.cm/recherche_avancee?recherche_avancee_do=1&page=" + p,
        muteHttpExceptions: true,
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
      });
    }

    let reponses = [];
    try {
      reponses = UrlFetchApp.fetchAll(requetes);
    } catch (e) {
      Logger.log("Erreur réseau pages " + numerosPages.join(", ") + " : " + e.message);
      collecteComplete = false;
      raisonsIncomplete.push("erreur réseau (pages " + numerosPages.join(", ") + ")");
      if (metriques && metriques.alertesCritiques) {
        metriques.alertesCritiques.push("Collecte ARMP interrompue (erreur réseau pages " + numerosPages.join(", ") + ").");
      }
      break;
    }

    for (let k = 0; k < reponses.length && continuerPagination; k++) {
      const page = numerosPages[k];
      Logger.log("Collecte ARMP - Page " + page + "...");
      if (metriques) metriques.pagesScannees = page;

      // V6.4 : une page en erreur (site ARMP indisponible) ne doit pas passer pour « aucun avis »
      let codeHttp = 200;
      try { codeHttp = reponses[k].getResponseCode(); } catch (e) {}
      if (codeHttp >= 400) {
        Logger.log("Collecte ARMP - Page " + page + " : réponse HTTP " + codeHttp + ", arrêt de la pagination.");
        collecteComplete = false;
        raisonsIncomplete.push("site ARMP en erreur HTTP " + codeHttp + " (page " + page + ")");
        if (metriques && metriques.alertesCritiques) {
          metriques.alertesCritiques.push("Collecte ARMP : le site ARMP a répondu HTTP " + codeHttp + " (page " + page + ").");
        }
        continuerPagination = false;
        break;
      }

      const html = reponses[k].getContentText();

      const regexCartes = /<li[^>]*class=["'][^"']*list-group-item[^"']*["'][\s\S]*?<\/li>/gi;
      let carteMatch;
      let cartesSurPage = 0;
      let cartesRecentesSurPage = 0;

      while ((carteMatch = regexCartes.exec(html)) !== null) {
        const blocHtml = carteMatch[0];
        if (!blocHtml.includes("id_publication=")) continue;

        cartesSurPage++;
        const idMatch = /id_publication=([0-9]+)/i.exec(blocHtml);
        const typeMatch = /type_publication=([^&"'>]+)/i.exec(blocHtml);
        if (!idMatch) continue;

        const idPub = idMatch[1];
        const typePub = typeMatch ? typeMatch[1].toUpperCase() : "AONO";
        const texteNettoye = decoderEntitesHtml(blocHtml.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
        const texteMaj = texteNettoye.toUpperCase();

        if (typePub.includes("ADDITIF") || typePub.includes("DEC-ANN") || typePub.includes("DEC-INF") ||
            texteMaj.includes("ADDITIF") || texteMaj.includes("DÉCLARANT INFRUCTUEUX") ||
            texteMaj.includes("DECLARANT INFRUCTUEUX") || texteMaj.includes("ANNULATION")) {
          continue;
        }

        const idAO = "ARMP_" + idPub;
        const cleLien = typePub + "|" + idPub;

        let datePubBrute = "Non précisée";
        const matchPub = /Publi[ée]\s*le\s*:?[\s\S]*?<div[^>]*class=["']d-table-cell["'][^>]*>\s*([0-9]{2}-[0-9]{2}-[0-9]{4})/i.exec(blocHtml);
        if (matchPub) datePubBrute = matchPub[1].trim();

        const dateObjetPub = parseDateCameroun(datePubBrute);
        let estDansLaFenetre = false;
        if (dateObjetPub && estDateCoherente(dateObjetPub, false)) {
          const ecartMs = maintenant.getTime() - dateObjetPub.getTime();
          if (ecartMs >= 0 && ecartMs <= limiteFenetreMs) estDansLaFenetre = true;
        }

        if (estDansLaFenetre) {
          cartesRecentesSurPage++;

          if (idsExistants.has(idAO)) continue;
          if (clesLiensExistantes.has(cleLien)) { doublonsEvites++; continue; }

          const dateClotureBrute = extraireDateCloture(blocHtml);
          const estAttribution = typePub.includes("ATTR") || typePub.includes("COMM");
          const typePublication = estAttribution ? "Attribution" : "Appel_Offres";

          let montantExtrait = "Non précisé";
          const matchMontant = /(?:montant|co[uû]t|estimation)\s*:?[\s\S]*?([0-9\s]{5,}\s*FCFA)/i.exec(texteNettoye);
          if (matchMontant) montantExtrait = matchMontant[1].trim();

          const maitreOuvrage = extraireMaitreOuvrageTexte(texteNettoye);
          const region = extraireRegionTexte(texteNettoye);

          let dateClotureAffichee;
          if (estAttribution) {
            dateClotureAffichee = "N/A (Marché attribué)";
          } else if (dateClotureBrute && dateClotureBrute !== "Non précisée") {
            const dateClotureObjet = parseDateCameroun(dateClotureBrute);
            if (estDateCoherente(dateClotureObjet, true)) {
              dateClotureAffichee = "'" + dateClotureBrute;
            } else {
              dateClotureAffichee = "'" + estimerDateLimiteLegale(datePubBrute, typePub, typePublication);
              datesEstimees++;
            }
          } else {
            dateClotureAffichee = "'" + estimerDateLimiteLegale(datePubBrute, typePub, typePublication);
            datesEstimees++;
          }

          const numeroAvis = extraireNumeroAvis(texteNettoye, idPub);

          const ligne = [
            idAO,
            numeroAvis,
            dateCollecte,
            datePubBrute,
            "ARMP Cameroun",
            texteNettoye.substring(0, 250),
            maitreOuvrage,
            region,
            typePub,
            "Non précisé",
            montantExtrait,
            dateClotureAffichee,
            "https://www.armp.cm/details?type_publication=" + typePub + "&id_publication=" + idPub,
            "http://pridesoft.armp.cm//0903_dao_dl?type_publication=" + typePub + "&id_publication=" + idPub,
            "NOUVEAU",
            typePublication,
            estAttribution ? "Voir Avis / DAO" : "N/A",
            estAttribution ? montantExtrait : "N/A",
            estAttribution ? datePubBrute : "N/A"
          ];

          feuilleAO.appendRow(secNeutraliserLigne(ligne));

          idsExistants.add(idAO);
          clesLiensExistantes.add(cleLien);
          totalInseres++;

          avisInseresSession.push({
            row: feuilleAO.getLastRow(),
            id_ao: idAO,
            numero_avis: numeroAvis,
            texte_brut: texteNettoye,
            url_fiche: ligne[12],
            titre_actuel: ligne[5],
            maitre_actuel: ligne[6],
            region_actuelle: ligne[7],
            montant_actuel: ligne[10],
            date_limite_actuelle: ligne[11],
            procedure_actuelle: ligne[8]
          });
        } else {
          if (metriques) metriques.aoIgnoresHorsFenetre++;
        }
      }

      if (page === 1 && cartesSurPage === 0) {
        collecteComplete = false;
        raisonsIncomplete.push("page 1 sans aucun avis (site indisponible ou structure modifiée ?)");
        Logger.log("Collecte ARMP - Page 1 sans aucun avis : site indisponible ou structure modifiée ?");
        if (metriques && metriques.alertesCritiques) {
          metriques.alertesCritiques.push("Collecte ARMP : la page 1 ne contient aucun avis (site indisponible ou structure modifiée ?).");
        }
      }

      if (cartesSurPage > 0 && cartesRecentesSurPage === 0) {
        continuerPagination = false;
      }
    }
    Utilities.sleep(1000);
  }

  if (continuerPagination && !budgetDepasse && collecteComplete) {
    // Toutes les pages autorisées ont été lues et la dernière contenait encore des avis récents
    collecteComplete = false;
    raisonsIncomplete.push("limite de " + pagesMax + " pages atteinte");
    Logger.log("Collecte ARMP : limite de " + pagesMax + " pages atteinte, des avis récents peuvent rester.");
    if (metriques && metriques.alertesCritiques) {
      metriques.alertesCritiques.push("Collecte ARMP : limite de " + pagesMax + " pages atteinte (des avis récents peuvent rester).");
    }
  }

  if (metriques) {
    metriques.nouveauxAO += totalInseres;
    metriques.sources["ARMP"] = (metriques.sources["ARMP"] || 0) + totalInseres;
    if (budgetDepasse && metriques.alertesCritiques) {
      metriques.alertesCritiques.push("Collecte ARMP interrompue (budget de temps).");
    }
  }
  feuilleParams.getRange("E2").setValue(dateCollecte);
  armpEnregistrerEtat({
    fin: new Date().toISOString(), complete: collecteComplete, raisons: raisonsIncomplete,
    fenetreHeures: fenetreHeures, elargie: fenetre.elargie, inseres: totalInseres,
    tentatives: armpContexteCollecte.tentative, echec: ""
  });
  if (collecteComplete) {
    armpMarquerCollecteOk(maintenant.getTime());
  } else {
    Logger.log("Collecte ARMP incomplète : la date de dernière collecte complète n'est pas avancée (la prochaine fenêtre sera élargie).");
  }
  Logger.log("Collecte ARMP finalisée : " + totalInseres + " avis insérés, " +
             doublonsEvites + " doublon(s) évité(s), " + datesEstimees + " dates estimées.");

  try {
    dedupliquerAvisRecents(ss, avisInseresSession);
  } catch (e) {
    Logger.log("[DÉDUP] Échec : " + e.message);
  }

  try {
    const apiKey = armpLireCleApi(feuilleParams);
    if (apiKey && typeof iagJobA_EnrichirAvis === "function") {
      enrichirAvisRecentsAvecIA(ss, apiKey, metriques, avisInseresSession,
        armpContexteCollecte.tentative > 1 ? Math.max(ARMP_BUDGET_IA_MIN_MS, ARMP_BUDGET_ENRICHISSEMENT_IA_MS - armpEcouleMs()) : ARMP_BUDGET_ENRICHISSEMENT_IA_MS);
    } else {
      Logger.log("[JOB A] Clé API absente ou module IA_Gemini non installé.");
    }
  } catch (e) {
    Logger.log("[JOB A] Échec : " + e.message);
  }
}

// ============================================================================
// DÉDUPLICATION LOCALE
// ============================================================================

function dedupliquerAvisRecents(ss, avisInseresSession) {
  if (typeof dedupTrouverDoublons !== "function") {
    Logger.log("[DÉDUP] Module Deduplication.gs absent.");
    return;
  }
  const feuilleAO = ss.getSheetByName(SHEET_AO);
  if (!feuilleAO) return;

  const data = feuilleAO.getDataRange().getValues();
  const avisNouveaux = [];
  for (let i = 1; i < data.length; i++) {
    const statut = (data[i][14] || "").toString().trim().toUpperCase();
    if (statut === "NOUVEAU") {
      avisNouveaux.push({
        row: i + 1,
        id: (data[i][0] || "").toString().trim(),
        numeroAvis: (data[i][1] || "").toString().trim(),
        titre: (data[i][5] || "").toString().trim(),
        maitreOuvrage: (data[i][6] || "").toString().trim()
      });
    }
  }

  if (avisNouveaux.length < 2) return;

  const doublonsSet = dedupTrouverDoublons(avisNouveaux);
  if (doublonsSet.size === 0) return;

  avisNouveaux.forEach(function (a) {
    if (doublonsSet.has(a.id)) {
      feuilleAO.getRange(a.row, 15).setValue("DOUBLON");
    }
  });

  Logger.log("[DÉDUP] " + doublonsSet.size + " avis marqué(s) DOUBLON.");
}

// ============================================================================
// ENRICHISSEMENT IA — JOB A
// ============================================================================

function enrichirAvisRecentsAvecIA(ss, apiKey, metriques, avisInseresSession, budgetMs) {
  if (!avisInseresSession || avisInseresSession.length === 0) return;
  const budgetIA = (budgetMs > 0) ? budgetMs : ARMP_BUDGET_ENRICHISSEMENT_IA_MS;

  const feuilleAO = ss.getSheetByName(SHEET_AO);
  if (!feuilleAO) return;

  const data = feuilleAO.getDataRange().getValues();
  const statutParId = {};
  for (let i = 1; i < data.length; i++) {
    const id = (data[i][0] || "").toString().trim();
    if (id) statutParId[id] = (data[i][14] || "").toString().trim().toUpperCase();
  }

  const aEnrichir = [];
  avisInseresSession.forEach(function (a) {
    const st = statutParId[a.id_ao] || "";
    if (st === "NOUVEAU") {
      aEnrichir.push({ row: a.row, id_ao: a.id_ao, texte_brut: a.texte_brut, url_fiche: a.url_fiche });
    }
  });

  if (aEnrichir.length === 0) return;
  Logger.log("[JOB A] Enrichissement de " + aEnrichir.length + " avis via Gemini...");
  const debutEnrichissement = new Date().getTime();

  const TAILLE_SOUS_LOT = 20;
  const enrichisTotal = {};

  for (let i = 0; i < aEnrichir.length; i += TAILLE_SOUS_LOT) {
    if (new Date().getTime() - debutEnrichissement > budgetIA) {
      Logger.log("[JOB A] Budget atteint après " + i + " avis.");
      if (metriques) metriques.alertesCritiques.push("Enrichissement IA interrompu.");
      break;
    }
    const sousLot = aEnrichir.slice(i, i + TAILLE_SOUS_LOT);
    const resultats = iagJobA_EnrichirAvis(sousLot, apiKey, metriques);
    resultats.forEach(function (r) { enrichisTotal[r.id_ao] = r; });
    Utilities.sleep(400);
  }

  const lignesMaj = [];
  Object.keys(enrichisTotal).forEach(function (idAO) {
    const r = enrichisTotal[idAO];
    if (r.echec_ia) return;
    const avisSession = avisInseresSession.find(function (a) { return a.id_ao === idAO; });
    if (!avisSession) return;

    const titreFinal = (r.titre_propre && r.titre_propre.length > 5) ? r.titre_propre : avisSession.titre_actuel;
    const maitreFinal = (r.maitre_ouvrage && r.maitre_ouvrage !== "Non précisé") ? r.maitre_ouvrage : avisSession.maitre_actuel;

    const regionIAValide = r.region && typeof r.region === "string" &&
                           r.region.toUpperCase() !== "NATIONAL" &&
                           r.region.toUpperCase() !== "NATIONALE" &&
                           r.region.toUpperCase() !== "NULL";
    const regionFinale = regionIAValide ? r.region.toUpperCase() : avisSession.region_actuelle;

    const montantFormate = formaterMontantIA(r.montant, r.devise);
    const montantFinal = montantFormate || avisSession.montant_actuel;

    const dateLimiteFormatee = formaterDateLimiteIA(r.date_limite);
    const dateLimiteFinale = dateLimiteFormatee ? ("'" + dateLimiteFormatee) : avisSession.date_limite_actuelle;

    const procedureFinale = (r.procedure && r.procedure !== "AUTRE") ? r.procedure : avisSession.procedure_actuelle;
    const typePubFinal = r.type_pub || "Appel_Offres";

    lignesMaj.push({
      row: avisSession.row,
      titre: titreFinal, maitre: maitreFinal, region: regionFinale,
      montant: montantFinal, dateLimite: dateLimiteFinale,
      procedure: procedureFinale, typePub: typePubFinal
    });
  });

  lignesMaj.forEach(function (maj) {
    try {
      feuilleAO.getRange(maj.row, 6).setValue(secNeutraliserFormule(maj.titre));
      feuilleAO.getRange(maj.row, 7).setValue(secNeutraliserFormule(maj.maitre));
      feuilleAO.getRange(maj.row, 8).setValue(secNeutraliserFormule(maj.region));
      feuilleAO.getRange(maj.row, 9).setValue(secNeutraliserFormule(maj.procedure));
      feuilleAO.getRange(maj.row, 11).setValue(secNeutraliserFormule(maj.montant));
      feuilleAO.getRange(maj.row, 12).setValue(secNeutraliserFormule(maj.dateLimite));
      feuilleAO.getRange(maj.row, 16).setValue(secNeutraliserFormule(maj.typePub));
    } catch (e) {
      Logger.log("[JOB A] Échec mise à jour ligne " + maj.row + " : " + e.message);
    }
  });

  Logger.log("[JOB A] " + lignesMaj.length + " avis mis à jour via IA.");
}

// ============================================================================
// BACKFILLS MANUELS
// ============================================================================

function backfillNumeroAvis() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName(SHEET_AO);
  if (!feuille) { Logger.log("Feuille TOUS_AO introuvable."); return; }

  const data = feuille.getDataRange().getValues();
  let corriges = 0, inchanges = 0;

  for (let i = 1; i < data.length; i++) {
    const idAO = (data[i][0] || "").toString().trim();
    if (!idAO) continue;
    const numeroActuel = (data[i][1] || "").toString().trim();
    const titre = (data[i][5] || "").toString().trim();
    const idPub = idAO.replace(/^[A-Z]+_/, "") || "INCONNU";
    const nouveau = extraireNumeroAvis(numeroActuel + " " + titre, idPub);

    if (nouveau && nouveau !== numeroActuel) {
      feuille.getRange(i + 1, 2).setValue(secNeutraliserFormule(nouveau));
      corriges++;
    } else {
      inchanges++;
    }
  }

  Logger.log("Backfill terminé. " + corriges + " corrigé(s), " + inchanges + " déjà OK.");
}

function nettoyerDatesAberrantes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName(SHEET_AO);
  if (!feuille) { Logger.log("Feuille TOUS_AO introuvable."); return; }

  const data = feuille.getDataRange().getValues();
  const maintenant = new Date();

  let corrigees = 0, dejaOk = 0, attributions = 0, nonCorrigeables = 0;

  for (let i = 1; i < data.length; i++) {
    const idAO = (data[i][0] || "").toString().trim();
    if (!idAO) continue;

    const dateLimiteActuelle = (data[i][11] || "").toString().trim();
    const datePub = (data[i][3] || "").toString().trim();
    const typeProc = (data[i][8] || "").toString().trim();
    const typePub = (data[i][15] || "").toString().trim();

    if (typePub === "Attribution" || dateLimiteActuelle.includes("N/A")) { attributions++; continue; }
    if (dateLimiteActuelle.includes("Estimée") || dateLimiteActuelle.startsWith("~")) { dejaOk++; continue; }

    const dateObj = parseDateCameroun(dateLimiteActuelle);
    const estAberrante = !dateObj ||
      dateObj.getFullYear() < 2020 ||
      (dateObj.getTime() < maintenant.getTime() - 24 * 60 * 60 * 1000);

    if (estAberrante) {
      const nouvelleDate = estimerDateLimiteLegale(datePub, typeProc, typePub);
      if (nouvelleDate && !nouvelleDate.startsWith("Non précisée")) {
        feuille.getRange(i + 1, 12).setValue("'" + nouvelleDate);
        corrigees++;
      } else {
        nonCorrigeables++;
      }
    } else {
      dejaOk++;
    }
  }

  Logger.log("Nettoyage dates : " + corrigees + " corrigée(s), " +
             dejaOk + " OK, " + attributions + " attributions, " +
             nonCorrigeables + " non corrigeable(s).");
}

// ============================================================================
// TEST V6.4 — N'ÉCRIT DANS AUCUNE FEUILLE NI PROPRIÉTÉ
// ============================================================================

/**
 * Vérifie la détection des erreurs passagères, la relance et la fenêtre glissante
 * avec des valeurs simulées. À exécuter dans Apps Script : testerCollecteARMPFenetreEtRelance
 */
function testerCollecteARMPFenetreEtRelance() {
  let ok = 0;
  let ko = 0;
  const verifier = function (nom, condition) {
    if (condition) { ok++; Logger.log("✅ " + nom); } else { ko++; Logger.log("❌ " + nom); }
  };

  // 1. Détection des erreurs passagères
  verifier("« Service Spreadsheets failed… » est passager",
    armpEstErreurTransitoire("Service Spreadsheets failed while accessing document with id 1pu8"));
  verifier("« Service timed out » est passager", armpEstErreurTransitoire("Exception: Service timed out: Spreadsheets"));
  verifier("« Server error… try again » est passager", armpEstErreurTransitoire("We're sorry, a server error occurred. Please wait a bit and try again."));
  verifier("« not defined » n'est pas passager", !armpEstErreurTransitoire("compteurMatchsSemantiqueIA is not defined"));
  verifier("quota journalier n'est pas passager", !armpEstErreurTransitoire("Service invoked too many times for one day: urlfetch."));
  verifier("droits manquants ne sont pas passagers", !armpEstErreurTransitoire("Exception: You do not have permission to call SpreadsheetApp.openById"));

  // 2. Relance (sans pause réelle)
  let appels = 0;
  let r = armpAvecRelance("Test A", function () {
    appels++;
    if (appels < 3) throw new Error("Service Spreadsheets failed while accessing document");
  }, { pause: function () {} });
  verifier("réussite à la 3e tentative (" + appels + " appels)", appels === 3 && r.tentatives === 3);

  appels = 0;
  let leve = false;
  try {
    armpAvecRelance("Test B", function () { appels++; throw new Error("x is not defined"); }, { pause: function () {} });
  } catch (e) { leve = true; }
  verifier("erreur de code : aucune relance (" + appels + " appel)", leve && appels === 1);

  appels = 0;
  let messageFinal = "";
  try {
    armpAvecRelance("Test C", function () { appels++; throw new Error("Service Spreadsheets failed"); }, { pause: function () {} });
  } catch (e) { messageFinal = e.message; }
  verifier("3 échecs passagers : erreur finale mentionne les tentatives", appels === 3 && messageFinal.indexOf("3 tentatives") !== -1);

  appels = 0;
  try {
    armpAvecRelance("Test D", function () { appels++; throw new Error("Service Spreadsheets failed"); }, { pause: function () {}, dureeMaxMs: -1 });
  } catch (e) {}
  verifier("temps écoulé trop long : aucune relance", appels === 1);

  // 3. Fenêtre glissante
  const H = 3600000;
  const maintenant = Date.UTC(2026, 9, 1, 6, 25);   // 01/10/2026 07:25 à Douala
  let f = armpCalculerFenetreEffective(24, maintenant - 24 * H, maintenant, 168);
  verifier("collecte la veille : fenêtre 24 h inchangée", f.heures === 24 && !f.elargie);
  f = armpCalculerFenetreEffective(24, maintenant - 29 * H, maintenant, 168);
  verifier("écart de 29 h (tolérance 6 h) : fenêtre inchangée", f.heures === 24 && !f.elargie);
  f = armpCalculerFenetreEffective(24, maintenant - 49 * H, maintenant, 168);
  verifier("un jour manqué : fenêtre élargie à 49 h", f.heures === 49 && f.elargie && !f.plafonnee);
  f = armpCalculerFenetreEffective(24, maintenant - 400 * H, maintenant, 168);
  verifier("longue panne : fenêtre plafonnée à 168 h", f.heures === 168 && f.elargie && f.plafonnee);
  f = armpCalculerFenetreEffective(24, null, maintenant, 168);
  verifier("aucune date connue : fenêtre 24 h", f.heures === 24 && !f.elargie);
  f = armpCalculerFenetreEffective(48, maintenant - 52 * H, maintenant, 168);
  verifier("fenêtre réglée à 48 h, écart 52 h : inchangée (tolérance)", f.heures === 48 && !f.elargie);
  f = armpCalculerFenetreEffective(48, maintenant - 60 * H, maintenant, 168);
  verifier("fenêtre réglée à 48 h, écart 60 h : élargie à 60 h", f.heures === 60 && f.elargie);

  Logger.log("=== RÉSULTAT : " + ok + " réussi(s), " + ko + " échec(s) ===");
  if (ko > 0) throw new Error(ko + " vérification(s) en échec (voir le journal).");
}