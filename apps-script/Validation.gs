// >>> FICHIER : Validation.gs <<< (à coller dans l'onglet du même nom)
/**
 * ============================================================================
 * MODULE DE NORMALISATION & VALIDATION DES ENTRÉES — V2.8 (LOT S1b)
 * ============================================================================
 * NOUVEAUTÉ V2.8 (LOT S1b) : les cellules réécrites par la normalisation passent par
 * secNeutraliserFormule (SecuriteDonnees.gs, dont ce script dépend) : un texte qui commence
 * par = + - @ n'est jamais réécrit sous forme de formule. Écriture ciblée (V2.7) inchangée.
 *
 * NOUVEAUTÉ V2.7 (LOT 6a — écriture ciblée)
 * ---------------------------------------------------------------------------
 *   • La validation ne réécrit plus TOUTE la feuille TOUS_AO. Elle n'écrit que
 *     les CELLULES réellement modifiées, ligne par ligne, après avoir vérifié
 *     que la ligne porte toujours le même ID_AO.
 *     - Une ligne ajoutée par Spark pendant la validation n'est plus jamais
 *       écrasée, et n'empêche plus la validation (avant : abandon complet si le
 *       nombre de lignes avait changé).
 *     - Les cellules non modifiées ne sont plus retouchées : fini les dates
 *       converties au passage (Date_Collecte, etc.).
 *   • backfillNormalisationComplete() utilise la même écriture ciblée.
 *   • Test sans risque : val2TesterEcritureCiblee() (feuille temporaire, supprimée).
 *
 * CORRECTIFS V2.6
 * ---------------------------------------------------------------------------
 *   • Bug A corrigé : val2TitleCaseMot utilise une LISTE BLANCHE de sigles
 *     protégés au lieu d'un critère de longueur. NKAMBE, KADEY, TIGNERE,
 *     etc. passent désormais en Title Case, tandis que MINTP, FEICOM, PNUD,
 *     etc. sont préservés en MAJ.
 *
 *   • Bug B corrigé : dans les blocs MAIRE/PREFET/GOUVERNEUR/etc., si le nom
 *     capturé commence déjà par un préfixe administratif (Commune, Préfecture,
 *     etc.), on ne rajoute PAS de second préfixe.
 *
 *   • val2ReparerDoublePrefixe étendu pour réparer "Maire de la Commune de X"
 *     → "Commune de X" en amont du matching.
 *
 * IDEMPOTENCE : peut être relancé sur les données déjà partiellement corrigées
 * par V2.5 sans effet de bord.
 * ============================================================================
 */

const VAL2_SEUIL_ANOMALIES_ALERTE = 10;

const VAL2_REGIONS_VALIDES = [
  "ADAMAOUA", "CENTRE", "EST", "EXTRÊME-NORD", "LITTORAL",
  "NORD", "NORD-OUEST", "OUEST", "SUD", "SUD-OUEST",
  "SERVICES CENTRAUX", "NATIONALE"
];

const VAL2_MO_PREFIXES_CENTRAUX = [
  "MINISTERE", "MINISTRE", "PRESIDENCE", "PRIMATURE",
  "SECRETARIAT GENERAL", "ASSEMBLEE NATIONALE", "SENAT",
  "MINEPDED", "MINTP", "MINHDU", "MINEPIA", "MINJEC", "MINADER",
  "MINEPAT", "MINCOM", "MINSANTE", "MINEE", "MINFI", "MINDCAF",
  "MINEDUB", "MINCOMMERCE", "MINTOUL", "MINFOP", "MINESUP",
  "MINRESI", "MINPOSTEL", "MINEFOP", "MINAT", "MINFOF", "MINMAP",
  "MINDDEVEL", "MINJUSTICE", "MINTSS", "MINAS"
];

const VAL2_BAILLEURS_CONNUS = [
  "BAD", "BM", "BANQUE MONDIALE", "AFD", "UE", "UNION EUROPEENNE",
  "PNUD", "UNDP", "UNICEF", "UNOPS", "UNIDO", "ONUDI", "FAO", "FIDA",
  "PNUE", "UNEP", "FEM", "GEF", "GIZ", "KOICA", "USAID", "JICA",
  "BID", "BOAD", "BDEAC", "SFI", "IFC", "AID", "IDA", "PAM", "WFP",
  "C2D", "PROLOG", "PIISAH", "PIRECT"
];

const VAL2_VILLE_VERS_REGION = {
  "DOUALA": "LITTORAL", "YAOUNDE": "CENTRE", "BAMENDA": "NORD-OUEST",
  "BUEA": "SUD-OUEST", "LIMBE": "SUD-OUEST", "BAFOUSSAM": "OUEST",
  "GAROUA": "NORD", "MAROUA": "EXTRÊME-NORD", "NGAOUNDERE": "ADAMAOUA",
  "BERTOUA": "EST", "EBOLOWA": "SUD"
};

const VAL2_CODES_REGION = {
  "CE": "CENTRE", "LT": "LITTORAL", "AD": "ADAMAOUA",
  "EN": "EXTRÊME-NORD", "NO": "NORD", "NW": "NORD-OUEST",
  "OU": "OUEST", "SU": "SUD", "SW": "SUD-OUEST", "ES": "EST"
};

// ---------------------------------------------------------------------------
// V2.6 — LISTE BLANCHE DE SIGLES PROTÉGÉS (remplace le critère de longueur)
// ---------------------------------------------------------------------------

const VAL2_SIGLES_PROTEGES = [
  // Ministères
  "MINEPDED", "MINTP", "MINHDU", "MINEPIA", "MINJEC", "MINADER",
  "MINEPAT", "MINCOM", "MINSANTE", "MINEE", "MINFI", "MINDCAF",
  "MINEDUB", "MINCOMMERCE", "MINTOUL", "MINFOP", "MINESUP",
  "MINRESI", "MINPOSTEL", "MINEFOP", "MINAT", "MINFOF", "MINMAP",
  "MINDDEVEL", "MINJUSTICE", "MINTSS", "MINAS", "MINESEC",
  // Établissements publics et agences
  "FEICOM", "CAA", "APN", "ANAFOOT", "CAMPOST", "CNTS", "SODECAO",
  "SONARA", "SONAMINES", "SONATREL", "SCDP", "ONCC", "ONIES", "EDC",
  "SIC", "PATNUC", "HISWACA", "PAEBC", "CCIMA", "CFC", "PAD",
  "ACREGIR", "CNDDR", "CRTV", "HGD", "HGY", "HGOPED",
  "SODECOTON", "CUD", "CUY", "CDEN", "ARSEL", "AER", "AGROPOLES",
  "MINRESI", "APME", "ASRAN", "CNPS", "CNPS",
  // Bailleurs et partenaires internationaux
  "BAD", "BM", "AFD", "UE", "PNUD", "UNDP", "UNICEF", "UNOPS",
  "UNIDO", "ONUDI", "FAO", "FIDA", "PNUE", "UNEP", "FEM", "GEF",
  "GIZ", "KOICA", "USAID", "JICA", "BID", "BOAD", "BDEAC",
  "SFI", "IFC", "AID", "IDA", "PAM", "WFP", "C2D", "PROLOG",
  "PIISAH", "PIRECT", "BEAC", "BVMAC", "CEMAC", "OIT", "ILO",
  "HCR", "UNWOMEN", "UN-WOMEN"
];

function val2EstSigleProtege(mot) {
  if (!mot) return false;
  const maj = String(mot).toUpperCase();
  return VAL2_SIGLES_PROTEGES.indexOf(maj) !== -1;
}

// Prépositions à conserver en minuscules
const VAL2_MOTS_MINUSCULES = [
  "de", "du", "des", "la", "le", "les", "l", "d",
  "et", "en", "à", "a", "au", "aux", "sur", "sous",
  "pour", "par", "dans"
];

// Noms propres (villes, régions, sigles explicites)
const VAL2_NOMS_PROPRES = {
  // Régions
  "extreme-nord": "Extrême-Nord",
  "extrême-nord": "Extrême-Nord",
  "nord-ouest": "Nord-Ouest",
  "sud-ouest": "Sud-Ouest",
  "adamaoua": "Adamaoua",
  "littoral": "Littoral",
  "centre": "Centre",
  "nord": "Nord",
  "ouest": "Ouest",
  "sud": "Sud",
  "est": "Est",
  // Villes
  "yaounde": "Yaoundé",
  "yaoundé": "Yaoundé",
  "douala": "Douala",
  "bamenda": "Bamenda",
  "bafoussam": "Bafoussam",
  "garoua": "Garoua",
  "maroua": "Maroua",
  "ngaoundere": "Ngaoundéré",
  "ngaoundéré": "Ngaoundéré",
  "bertoua": "Bertoua",
  "ebolowa": "Ebolowa",
  "buea": "Buea",
  "limbe": "Limbe",
  "kribi": "Kribi",
  "edea": "Edéa",
  "edéa": "Edéa",
  "nkongsamba": "Nkongsamba",
  "dschang": "Dschang",
  "foumban": "Foumban",
  "bafang": "Bafang",
  "mbouda": "Mbouda",
  // Sigles métier
  "soa": "SOA",
  "eies": "EIES",
  "eie": "EIE",
  "pges": "PGES",
  "cges": "CGES",
  "nies": "NIES",
  "wash": "WASH",
  "aep": "AEP",
  "vrd": "VRD",
  "bet": "BET",
  "aps": "APS",
  "apd": "APD",
  "ao": "AO",
  "aono": "AONO",
  "aonr": "AONR",
  "aoio": "AOIO",
  "ami": "AMI",
  "asmi": "ASMI",
  "dc": "DC",
  "dco": "DCO",
  "rfq": "RFQ",
  "dao": "DAO",
  "bip": "BIP",
  "c2d": "C2D",
  "ugp": "UGP",
  "pme": "PME",
  "pmi": "PMI",
  "ong": "ONG",
  "epic": "EPIC"
};

// ---------------------------------------------------------------------------
// COUCHE 1 — NETTOYAGE TECHNIQUE
// ---------------------------------------------------------------------------

function val2NettoyerTexteBrut(texte) {
  if (texte === null || texte === undefined) return "";
  let t = String(texte);
  t = t
    .replace(/&#x([0-9a-f]+);/gi, function (m, h) {
      const c = parseInt(h, 16); return isNaN(c) ? " " : String.fromCharCode(c);
    })
    .replace(/&#(\d+);/g, function (m, n) {
      const c = parseInt(n, 10); return isNaN(c) ? " " : String.fromCharCode(c);
    })
    .replace(/&nbsp;/gi, " ").replace(/&quot;/gi, '"').replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&amp;/gi, "&");
  t = t.replace(/&[#a-zA-Z0-9]{1,10}$/, "").trim();
  t = t.replace(/[\u0000-\u001F\u007F]/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

// ---------------------------------------------------------------------------
// COUCHE 2 — NORMALISATION SÉMANTIQUE
// ---------------------------------------------------------------------------

/**
 * V2.6 — Title Case avec liste blanche de sigles.
 *   · Mots composés (tiret) traités par sous-parties
 *   · Sigles protégés (liste blanche) préservés en MAJ
 *   · Prépositions/articles courts restent en minuscules
 *   · Le reste passe en Title Case
 */
function val2TitleCase(texte) {
  if (!texte) return "";
  const mots = String(texte).split(/\s+/).filter(function (m) { return m; });

  return mots.map(function (mot, index) {
    if (!mot) return "";

    // Mot composé avec tiret
    if (mot.indexOf("-") !== -1) {
      const sousParties = mot.split("-");
      return sousParties.map(function (sp, spIndex) {
        return val2TitleCaseMot(sp, index === 0 && spIndex === 0);
      }).join("-");
    }

    return val2TitleCaseMot(mot, index === 0);
  }).join(" ").trim();
}

function val2TitleCaseMot(mot, estPremier) {
  if (!mot) return "";

  const bas = mot.toLowerCase().replace(/[''`]/g, "'");

  // 1) Dictionnaire de noms propres (priorité absolue)
  const sansApostrophe = bas.replace(/'/g, "");
  if (VAL2_NOMS_PROPRES[bas]) return VAL2_NOMS_PROPRES[bas];
  if (VAL2_NOMS_PROPRES[sansApostrophe]) return VAL2_NOMS_PROPRES[sansApostrophe];

  // 2) V2.6 — Sigle protégé par liste blanche (remplace le critère de longueur)
  if (val2EstSigleProtege(mot)) return mot.toUpperCase();

  // 3) Préposition / article (en minuscules sauf si premier mot)
  if (VAL2_MOTS_MINUSCULES.indexOf(bas) !== -1) {
    if (estPremier) return mot.charAt(0).toUpperCase() + mot.substring(1).toLowerCase();
    return bas;
  }

  // 4) Préposition attachée : d'Angossas, l'Extrême
  const m = /^([dDlL])[''](.+)$/.exec(mot);
  if (m) {
    const prefixe = m[1].toLowerCase() + "'";
    const reste = m[2];
    const resteCap = val2TitleCaseMot(reste, true);
    return prefixe + resteCap;
  }

  // 5) Cas général : capitalise la première lettre
  return mot.charAt(0).toUpperCase() + mot.substring(1).toLowerCase();
}

function val2DevelopperCodeRegion(code) {
  const c = String(code || "").toUpperCase().trim();
  return VAL2_CODES_REGION[c] || null;
}

function val2ArticlePourRegion(region) {
  const r = String(region || "").toUpperCase().trim();
  if (r === "ADAMAOUA" || r === "EST" || r === "EXTRÊME-NORD" || r === "OUEST") {
    return "de l'" + val2TitleCase(region);
  }
  return "du " + val2TitleCase(region);
}

function val2EstBailleurConnu(segment) {
  const s = String(segment || "").toUpperCase().trim();
  if (!s) return false;
  return VAL2_BAILLEURS_CONNUS.some(function (b) {
    return s === b || s.indexOf(b) !== -1;
  });
}

function val2SeparerPartenaires(moNet) {
  if (!moNet || moNet.indexOf("/") === -1) return null;
  const parts = moNet.split(/\s*\/\s*/).map(function (p) { return p.trim(); }).filter(function (p) { return p; });
  if (parts.length < 2) return null;
  const partenaires = [];
  const principaux = [];
  parts.forEach(function (p) {
    if (val2EstBailleurConnu(p)) partenaires.push(p.toUpperCase());
    else principaux.push(p);
  });
  if (partenaires.length === 0 || principaux.length === 0) return null;
  return { principal: principaux.join(" / "), partenaires: partenaires };
}

function val2ContientDejaPrefixe(mo) {
  if (!mo) return false;
  const m = String(mo).toUpperCase().trim();
  return /^(COMMUNE|COMMUNAUTE|PREFECTURE|GOUVERNORAT|CONSEIL|UNIVERSITE|MAIRIE|VILLE|MINISTERE|MINISTRE|PRESIDENCE|PRIMATURE)/.test(m);
}

/**
 * V2.6 — Réparation des doubles préfixes et des prépositions capitalisées.
 * Étendu pour capturer "Maire de la Commune de X" et "Maire de Commune de X".
 */
function val2ReparerDoublePrefixe(moNet) {
  if (!moNet) return moNet;
  let t = moNet;
  let avant;

  do {
    avant = t;

    // Doubles préfixes standards
    t = t.replace(/^(Commune\s+d[e']\s*)LA\s+Commune\s+d[e']\s+/i, "Commune de ");
    t = t.replace(/^(Commune\s+d[e']\s*)Commune\s+d[e']\s+/i, "Commune de ");
    t = t.replace(/^(Pr[ée]fecture\s+d[e']\s*)Pr[ée]fecture\s+d[e']\s+/i, "Préfecture de ");
    t = t.replace(/^(Gouvernorat\s+d[e']\s*)Gouvernorat\s+d[e']\s+/i, "Gouvernorat de ");
    t = t.replace(/^(Conseil\s+R[ée]gional\s+d[e']\s*)Conseil\s+R[ée]gional\s+d[e']\s+/i, "Conseil Régional de ");

    // V2.6 : "Maire de la Commune de X" → "Commune de X"
    t = t.replace(/^Maire\s+d[e']\s*[Ll]a\s+Commune\s+d[e']\s+/i, "Commune de ");
    t = t.replace(/^Maire\s+d[e']\s*Commune\s+d[e']\s+/i, "Commune de ");
    t = t.replace(/^Maire\s+d[e']\s*[Ll]a\s+Mairie\s+d[e']\s+/i, "Commune de ");
    t = t.replace(/^Maire\s+d[e']\s*[Ll]a\s+Ville\s+d[e']\s+/i, "Commune de ");

    // Prépositions capitalisées
    t = t.replace(/\s+De\s+/g, " de ");
    t = t.replace(/\s+Du\s+/g, " du ");
    t = t.replace(/\s+Des\s+/g, " des ");
    t = t.replace(/\s+La\s+/g, " la ");
    t = t.replace(/\s+Le\s+/g, " le ");
    t = t.replace(/\s+Les\s+/g, " les ");
    t = t.replace(/\s+Et\s+/g, " et ");
    t = t.replace(/\s+En\s+/g, " en ");
  } while (t !== avant);

  return t;
}

function val2NormaliserMO(moBrut) {
  if (!moBrut) return "Non précisé";
  let moNet = val2NettoyerTexteBrut(moBrut);
  if (!moNet) return "Non précisé";

  const original = moNet;
  moNet = val2ReparerDoublePrefixe(moNet);

  const split = val2SeparerPartenaires(moNet);
  let base = moNet;
  let suffixe = "";
  if (split) {
    base = split.principal;
    suffixe = " (avec " + split.partenaires.join(", ") + ")";
  }

  const moUp = base.toUpperCase();

  // Cas déjà préfixé : on ne re-préfixe PAS
  if (val2ContientDejaPrefixe(base)) {
    if (/^(MINISTERE|MINISTRE|PRESIDENCE|PRIMATURE)/.test(moUp) ||
        VAL2_MO_PREFIXES_CENTRAUX.some(function (p) { return moUp.startsWith(p); })) {
      return base.toUpperCase() + suffixe;
    }
    const resultat = val2TitleCase(base) + suffixe;
    if (resultat.replace(/[^a-zA-ZÀ-ÿ]/g, "").length < 5) return original + suffixe;
    return resultat;
  }

  const moUp2 = base.toUpperCase();
  let m;
  let resultat;

  m = /^CM\s+(.+)$/.exec(moUp2);
  if (m) { resultat = "Communauté Urbaine de " + val2TitleCase(m[1]) + suffixe;
    return resultat.replace(/[^a-zA-ZÀ-ÿ]/g, "").length < 5 ? original + suffixe : resultat; }

  if (moUp2 === "CUD") return "Communauté Urbaine de Douala" + suffixe;
  if (moUp2 === "CUY") return "Communauté Urbaine de Yaoundé" + suffixe;

  m = /^MAIR[EI]E?\s+D[EU']\s*(.+)$/.exec(moUp2);
  if (m) {
    let nom = m[1].replace(/^LA\s+/i, "").trim();
    // V2.6 : si le nom commence déjà par Commune/Préfecture/etc., ne pas re-préfixer
    if (/^(COMMUNE|COMMUNAUTE|PREFECTURE|GOUVERNORAT|MAIRIE|VILLE)/i.test(nom)) {
      resultat = val2TitleCase(nom) + suffixe;
    } else {
      resultat = "Commune de " + val2TitleCase(nom) + suffixe;
    }
    return resultat.replace(/[^a-zA-ZÀ-ÿ]/g, "").length < 5 ? original + suffixe : resultat;
  }
  m = /^MAIRE\s+(.+)$/.exec(moUp2);
  if (m) {
    let nom = m[1].replace(/^LA\s+/i, "").trim();
    if (/^(COMMUNE|COMMUNAUTE|PREFECTURE|GOUVERNORAT|MAIRIE|VILLE)/i.test(nom)) {
      resultat = val2TitleCase(nom) + suffixe;
    } else {
      resultat = "Commune de " + val2TitleCase(nom) + suffixe;
    }
    return resultat.replace(/[^a-zA-ZÀ-ÿ]/g, "").length < 5 ? original + suffixe : resultat;
  }

  m = /^PREFET\s*[>»]\s*(.+)$/.exec(moUp2);
  if (m) {
    let nom = m[1].trim();
    if (/^(PREFECTURE|GOUVERNORAT|COMMUNE|COMMUNAUTE)/i.test(nom)) {
      resultat = val2TitleCase(nom) + suffixe;
    } else {
      resultat = "Préfecture de " + val2TitleCase(nom) + suffixe;
    }
    return resultat.replace(/[^a-zA-ZÀ-ÿ]/g, "").length < 5 ? original + suffixe : resultat;
  }
  m = /^PREFET\s+D[EU']\s*(.+)$/.exec(moUp2);
  if (m) {
    let nom = m[1].trim();
    if (/^(PREFECTURE|GOUVERNORAT|COMMUNE|COMMUNAUTE)/i.test(nom)) {
      resultat = val2TitleCase(nom) + suffixe;
    } else {
      resultat = "Préfecture de " + val2TitleCase(nom) + suffixe;
    }
    return resultat.replace(/[^a-zA-ZÀ-ÿ]/g, "").length < 5 ? original + suffixe : resultat;
  }

  m = /^GOUVERNEUR\s+D[EU']\s*(.+)$/.exec(moUp2);
  if (m) {
    let nom = m[1].trim();
    if (/^(GOUVERNORAT|PREFECTURE|COMMUNE)/i.test(nom)) {
      resultat = val2TitleCase(nom) + suffixe;
    } else {
      resultat = "Gouvernorat de " + val2TitleCase(nom) + suffixe;
    }
    return resultat.replace(/[^a-zA-ZÀ-ÿ]/g, "").length < 5 ? original + suffixe : resultat;
  }

  m = /^CR\s+([A-Z]{2,3})$/.exec(moUp2);
  if (m) {
    const region = val2DevelopperCodeRegion(m[1]);
    if (region) return "Conseil Régional " + val2ArticlePourRegion(region) + suffixe;
  }

  m = /^(?:LE\s+)?(?:PRESIDENT\s+DU\s+)?CONSEIL\s+REGIONAL\s+D[EU']\s*(.+)$/.exec(moUp2);
  if (m) { resultat = "Conseil Régional de " + val2TitleCase(m[1]) + suffixe;
    return resultat.replace(/[^a-zA-ZÀ-ÿ]/g, "").length < 5 ? original + suffixe : resultat; }

  m = /^RECTEUR\s+DE\s+L[''`]?UNIVERSITE\s+D[EU']\s*(.+)$/.exec(moUp2);
  if (m) { resultat = "Université de " + val2TitleCase(m[1]) + suffixe;
    return resultat.replace(/[^a-zA-ZÀ-ÿ]/g, "").length < 5 ? original + suffixe : resultat; }

  m = /^DIRECTEUR\s+GENERAL\s+D[EU']\s*(.+)$/.exec(moUp2);
  if (m) { resultat = val2TitleCase(m[1]) + suffixe;
    return resultat.replace(/[^a-zA-ZÀ-ÿ]/g, "").length < 5 ? original + suffixe : resultat; }

  if (VAL2_MO_PREFIXES_CENTRAUX.some(function (p) { return moUp2.startsWith(p); })) {
    return base.toUpperCase() + suffixe;
  }

  resultat = val2TitleCase(base) + suffixe;
  return resultat.replace(/[^a-zA-ZÀ-ÿ]/g, "").length < 5 ? original + suffixe : resultat;
}

function val2RegionDepuisNom(nom) {
  if (!nom) return null;
  const n = String(nom).toUpperCase().trim();
  const alias = {
    "CENTRE": "CENTRE", "LITTORAL": "LITTORAL", "ADAMAOUA": "ADAMAOUA",
    "EXTRÊME-NORD": "EXTRÊME-NORD", "EXTREME-NORD": "EXTRÊME-NORD",
    "NORD": "NORD", "NORD-OUEST": "NORD-OUEST", "OUEST": "OUEST",
    "SUD": "SUD", "SUD-OUEST": "SUD-OUEST", "EST": "EST"
  };
  return alias[n] || null;
}

function val2InfererRegionDepuisMO(mo) {
  if (!mo) return null;
  const moUp = val2NettoyerTexteBrut(mo).toUpperCase();
  if (VAL2_MO_PREFIXES_CENTRAUX.some(function (p) { return moUp.startsWith(p); })) {
    return "SERVICES CENTRAUX";
  }
  let m = /CONSEIL\s+REGIONAL\s+(?:DE\s+L[''`]?|DU\s+|DE\s+)(.+)$/.exec(moUp);
  if (m) {
    const r = val2RegionDepuisNom(m[1]);
    if (r) return r;
  }
  for (const ville in VAL2_VILLE_VERS_REGION) {
    if (moUp.indexOf(ville) !== -1) return VAL2_VILLE_VERS_REGION[ville];
  }
  return null;
}

function val2NormaliserRegion(regionBrute) {
  if (!regionBrute) return "Nationale";
  const r = val2NettoyerTexteBrut(regionBrute).toUpperCase().trim();
  if (!r) return "Nationale";
  if (r === "CAMEROUN" || r === "CAMEROUN (INTERNATIONAL)" || r === "NATIONAL") return "Nationale";
  if (r === "NATIONALE") return "Nationale";
  for (let i = 0; i < VAL2_REGIONS_VALIDES.length; i++) {
    if (r === VAL2_REGIONS_VALIDES[i]) return VAL2_REGIONS_VALIDES[i];
  }
  if (r.indexOf("EXTRÊME-NORD") !== -1 || r.indexOf("EXTREME-NORD") !== -1) return "EXTRÊME-NORD";
  if (r.indexOf("NORD-OUEST") !== -1) return "NORD-OUEST";
  if (r.indexOf("SUD-OUEST") !== -1) return "SUD-OUEST";
  if (r.indexOf("SERVICES CENTRAUX") !== -1) return "SERVICES CENTRAUX";
  if (r === "ADAMAOUA") return "ADAMAOUA";
  if (r === "CENTRE") return "CENTRE";
  if (r === "LITTORAL") return "LITTORAL";
  if (r === "EST") return "EST";
  if (r === "NORD") return "NORD";
  if (r === "OUEST") return "OUEST";
  if (r === "SUD") return "SUD";
  return null;
}

function val2NormaliserProcedure(procBrute) {
  if (!procBrute) return "AUTRE";
  const p = val2NettoyerTexteBrut(procBrute).toUpperCase()
    .replace(/[’'`]/g, "'").replace(/\s+/g, " ").trim();
  if (!p) return "AUTRE";
  if (/\b(ASMI|AAMI|AMI)\b/.test(p) || p.indexOf("MANIFESTATION") !== -1) return "AMI";
  if (/\b(DC|DCO|RFQ)\b/.test(p) ||
      p.indexOf("COTATION") !== -1 ||
      p.indexOf("DEMANDE DE COTATION") !== -1 ||
      p.indexOf("REQUEST FOR QUOTATION") !== -1) return "DC";
  if (/\b(DDP|RFP)\b/.test(p) ||
      p.indexOf("DEMANDE DE PROPOSITION") !== -1 ||
      p.indexOf("REQUEST FOR PROPOSAL") !== -1) return "DDP";
  if (/\b(AONO|AONR|AOIO|AON|AOI|AO)\b/.test(p) ||
      p.indexOf("APPEL D'OFFRE") !== -1 ||
      p.indexOf("APPELS D'OFFRE") !== -1 ||
      p.indexOf("INVITATION TO BID") !== -1 ||
      p.indexOf("INVITATION TO TENDER") !== -1 ||
      p.indexOf("OPEN NATIONAL INVITATION") !== -1) return "AONO";
  if (p.indexOf("ATTRIBUTION") !== -1 ||
      p.indexOf("COMMUNIQUE") !== -1 ||
      p.indexOf("COMMUNIQUÉ") !== -1 ||
      p.indexOf("DEC-ATTR") !== -1 ||
      /\b(COMM)\b/.test(p)) return "ATTRIBUTION";
  return "AUTRE";
}

function val2NormaliserStatut(statutBrut) {
  const v = val2NettoyerTexteBrut(statutBrut).toUpperCase();
  if (!v) return "NOUVEAU";
  if (v === "NOUVEAU" || v === "NEW" || v === "NOVEAU" ||
      v === "À TRAITER" || v === "A TRAITER" || v === "PENDING" || v === "TO TREAT") return "NOUVEAU";
  if (v === "TRAITÉ" || v === "TRAITE" || v === "PROCESSED" || v === "TREATED") return "TRAITÉ";
  if (v === "DOUBLON" || v === "DUPLICATE" || v === "DUP") return "DOUBLON";
  if (v === "EXPIRÉ" || v === "EXPIRE" || v === "EXPIRED" || v === "FORCLOS") return "EXPIRÉ";
  return v;
}

function val2NormaliserMontant(montantBrut) {
  if (!montantBrut) return "Non précisé";
  const s = val2NettoyerTexteBrut(montantBrut);
  if (!s) return "Non précisé";
  const nums = s.replace(/[^0-9]/g, "");
  if (!nums) return "Non précisé";
  let devise = "FCFA";
  if (/\bUSD\b/i.test(s)) devise = "USD";
  else if (/\bEUR\b/i.test(s)) devise = "EUR";
  else if (/\bUC\b/i.test(s)) devise = "UC";
  const n = parseInt(nums, 10);
  if (isNaN(n) || n < 1000) return "Non précisé";
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " " + devise;
}

function val2NormaliserDateLimite(dateBrute, datePubBrute, procBrute, typePub) {
  if (dateBrute instanceof Date) {
    if (isNaN(dateBrute.getTime())) return "Non précisée";
    const annee = dateBrute.getFullYear();
    const maintenant = new Date();
    if (annee >= 2020 && annee <= maintenant.getFullYear() + 5) {
      const j = String(dateBrute.getDate()).padStart(2, "0");
      const mo = String(dateBrute.getMonth() + 1).padStart(2, "0");
      const a = dateBrute.getFullYear();
      const h = String(dateBrute.getHours()).padStart(2, "0");
      const mn = String(dateBrute.getMinutes()).padStart(2, "0");
      return j + "-" + mo + "-" + a + " " + h + ":" + mn;
    }
  }

  const s = val2NettoyerTexteBrut(dateBrute);
  if (!s) return "Non précisée";
  if (s.includes("N/A") || s.includes("Marché attribué")) return "N/A (Marché attribué)";
  if (s.includes("Non précisée")) return s;
  if (s.startsWith("~")) return s;

  const d = (typeof parseDateCameroun === "function") ? parseDateCameroun(s) : null;
  if (d && !isNaN(d.getTime())) {
    const annee = d.getFullYear();
    const maintenant = new Date();
    if (annee >= 2020 && annee <= maintenant.getFullYear() + 5) {
      const j = String(d.getDate()).padStart(2, "0");
      const mo = String(d.getMonth() + 1).padStart(2, "0");
      const a = d.getFullYear();
      const h = String(d.getHours()).padStart(2, "0");
      const mn = String(d.getMinutes()).padStart(2, "0");
      return j + "-" + mo + "-" + a + " " + h + ":" + mn;
    }
  }

  if (typeof estimerDateLimiteLegale === "function") {
    const est = estimerDateLimiteLegale(datePubBrute, procBrute, typePub);
    if (est && !est.startsWith("Non précisée")) return est;
  }
  return s;
}

// ---------------------------------------------------------------------------
// NORMALISATION D'UNE LIGNE
// ---------------------------------------------------------------------------

function val2NormaliserLigne(ligne) {
  const copie = ligne.slice();
  const changements = [];

  const moAvant = (copie[6] || "").toString();
  const moApres = val2NormaliserMO(moAvant);
  if (moApres !== moAvant) {
    copie[6] = moApres;
    changements.push({ nom: "Maitre_Ouvrage", avant: moAvant, apres: moApres });
  }

  const regionAvant = (copie[7] || "").toString();
  let regionApres = val2NormaliserRegion(regionAvant);
  let regionInferee = false;
  if (!regionApres) regionApres = "Nationale";
  if (regionApres === "Nationale") {
    const inferee = val2InfererRegionDepuisMO(copie[6]);
    if (inferee) { regionApres = inferee; regionInferee = true; }
  }
  if (regionApres !== regionAvant) {
    copie[7] = regionApres;
    changements.push({ nom: "Region", avant: regionAvant, apres: regionApres, raison: regionInferee ? "inférée depuis MO" : "normalisation" });
  }

  const procAvant = (copie[8] || "").toString();
  const procApres = val2NormaliserProcedure(procAvant);
  if (procApres !== procAvant) {
    copie[8] = procApres;
    changements.push({ nom: "Type_Procedure", avant: procAvant, apres: procApres });
  }

  const montantAvant = (copie[10] || "").toString();
  const montantApres = val2NormaliserMontant(montantAvant);
  if (montantApres !== montantAvant && montantApres !== "Non précisé") {
    copie[10] = montantApres;
    changements.push({ nom: "Montant", avant: montantAvant, apres: montantApres });
  }

  const dateAvant = copie[11];
  const typePub = (copie[15] || "Appel_Offres").toString();
  const dateApres = val2NormaliserDateLimite(dateAvant, copie[3], copie[8], typePub);
  const dateAvantStr = (dateAvant instanceof Date) ? dateAvant.toISOString() : (dateAvant || "").toString();
  if (dateApres !== dateAvantStr) {
    copie[11] = dateApres;
    changements.push({ nom: "Date_Limite", avant: dateAvantStr, apres: dateApres });
  }

  const statutAvant = (copie[14] || "").toString();
  const statutApres = val2NormaliserStatut(statutAvant);
  if (statutApres !== statutAvant) {
    copie[14] = statutApres;
    changements.push({ nom: "Statut_Traitement", avant: statutAvant, apres: statutApres });
  }

  const typePubAvant = (copie[15] || "").toString();
  if (!typePubAvant.trim()) {
    copie[15] = "Appel_Offres";
    changements.push({ nom: "Type_Publication", avant: typePubAvant, apres: "Appel_Offres" });
  }

  return { ligne: copie, changements: changements };
}

// ---------------------------------------------------------------------------
// PIPELINE
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// V2.7 — ÉCRITURE CIBLÉE
// ---------------------------------------------------------------------------

function val2ValeurPourComparaison(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? "" : "DATE:" + v.getTime();
  return (v === null || v === undefined) ? "" : String(v);
}

/**
 * Compare deux versions d'une ligne et renvoie uniquement les cellules qui changent.
 * @return {Array} [{ col: numéroDeColonne(1-based), valeur: nouvelleValeur }]
 */
function val2CalculerCellulesModifiees(ancienneLigne, nouvelleLigne) {
  const cellules = [];
  const n = Math.max(ancienneLigne.length, nouvelleLigne.length);
  for (let j = 0; j < n; j++) {
    if (val2ValeurPourComparaison(ancienneLigne[j]) !== val2ValeurPourComparaison(nouvelleLigne[j])) {
      cellules.push({ col: j + 1, valeur: nouvelleLigne[j] === undefined ? "" : nouvelleLigne[j] });
    }
  }
  return cellules;
}

/**
 * Écrit les modifications, une ligne à la fois, uniquement pour les colonnes modifiées
 * (les colonnes voisines modifiées sont regroupées en une seule écriture).
 * Avant d'écrire, la colonne A est relue : si la ligne ne porte plus le même ID_AO
 * (lignes décalées), elle est IGNORÉE.
 * @param {Sheet} feuille
 * @param {Array} modifications [{ row, id, cellules:[{col, valeur}] }]
 * @return {Object} { ecrites, ignorees }
 */
function val2EcrireModifications(feuille, modifications) {
  const resultat = { ecrites: 0, ignorees: 0 };
  if (!modifications || modifications.length === 0) return resultat;

  const derniere = feuille.getLastRow();
  const ids = derniere > 0 ? feuille.getRange(1, 1, derniere, 1).getValues() : [];

  modifications.forEach(function (m) {
    const idActuel = (m.row - 1 < ids.length) ? String(ids[m.row - 1][0] || "").trim() : "";
    if (idActuel !== m.id) {
      resultat.ignorees++;
      Logger.log("[VALIDATION V2.7] Ligne " + m.row + " ignorée : ID attendu \"" + m.id + "\", trouvé \"" + idActuel + "\".");
      return;
    }
    const cellules = m.cellules.slice().sort(function (a, b) { return a.col - b.col; });
    let debut = 0;
    while (debut < cellules.length) {
      let fin = debut;
      while (fin + 1 < cellules.length && cellules[fin + 1].col === cellules[fin].col + 1) fin++;
      const valeurs = [];
      for (let k = debut; k <= fin; k++) valeurs.push(secNeutraliserFormule(cellules[k].valeur));
      feuille.getRange(m.row, cellules[debut].col, 1, valeurs.length).setValues([valeurs]);
      debut = fin + 1;
    }
    resultat.ecrites++;
  });
  SpreadsheetApp.flush();
  return resultat;
}

/**
 * Calcule les modifications de normalisation à apporter.
 * @param {Array} data          contenu de la feuille (avec en-tête)
 * @param {boolean} seulementNouveaux  true = seulement les avis NOUVEAU ; false = toutes les lignes
 */
function val2CalculerModifications(data, seulementNouveaux) {
  const sortie = { modifications: [], corrigees: 0, exemples: [], details: [] };
  for (let i = 1; i < data.length; i++) {
    const idAO = (data[i][0] || "").toString().trim();
    if (!idAO) continue;
    if (seulementNouveaux) {
      const statut = val2NormaliserStatut((data[i][14] || "").toString());
      if (statut !== "NOUVEAU") continue;
    }
    const res = val2NormaliserLigne(data[i]);
    if (res.changements.length === 0) continue;

    const cellules = val2CalculerCellulesModifiees(data[i], res.ligne);
    if (cellules.length === 0) continue;

    sortie.modifications.push({ row: i + 1, id: idAO, cellules: cellules });
    sortie.corrigees++;
    sortie.details.push({ idAO: idAO, changements: res.changements });
    if (sortie.exemples.length < 20) {
      res.changements.forEach(function (c) {
        sortie.exemples.push(idAO + " · " + c.nom + ' : "' + c.avant + '" → "' + c.apres + '"');
      });
    }
  }
  return sortie;
}

/**
 * Valide et normalise les avis NOUVEAU d'une feuille (production ou bac à sable).
 */
function val2ValiderFeuille(feuille) {
  const data = feuille.getDataRange().getValues();
  if (data.length <= 1) return { ok: true, corrigees: 0, anomalies: 0, ecrites: 0, ignorees: 0 };

  const calcul = val2CalculerModifications(data, true);
  let ecriture = { ecrites: 0, ignorees: 0 };

  if (calcul.corrigees > 0) {
    feuille.getRange("L:L").setNumberFormat("@");
    ecriture = val2EcrireModifications(feuille, calcul.modifications);
  }

  Logger.log("[VALIDATION V2.7] " + calcul.corrigees + " ligne(s) à normaliser, " +
             ecriture.ecrites + " écrite(s), " + ecriture.ignorees + " ignorée(s) (ligne décalée).");
  calcul.exemples.forEach(function (e, i) { Logger.log("  " + (i + 1) + ". " + e); });

  return { ok: true, corrigees: calcul.corrigees, anomalies: 0, ecrites: ecriture.ecrites, ignorees: ecriture.ignorees };
}

function validerEntreesNouvelles(metriques) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const nomFeuille = (typeof SHEET_AO !== "undefined") ? SHEET_AO : "TOUS_AO";
  const feuille = ss.getSheetByName(nomFeuille);
  if (!feuille) { Logger.log("[VALIDATION V2.7] Feuille introuvable."); return { ok: false }; }
  return val2ValiderFeuille(feuille);
}

function backfillNormalisationComplete() {
  Logger.log("=== BACKFILL NORMALISATION V2.6 ===");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const nomFeuille = (typeof SHEET_AO !== "undefined") ? SHEET_AO : "TOUS_AO";
  const feuille = ss.getSheetByName(nomFeuille);
  if (!feuille) { Logger.log("Feuille introuvable."); return; }

  feuille.getRange("L:L").setNumberFormat("@");
  SpreadsheetApp.flush();

  const data = feuille.getDataRange().getValues();
  if (data.length <= 1) { Logger.log("Aucune donnée."); return; }

  const nbLignesInitial = data.length;
  const stats = { mo: 0, region: 0, regionInferee: 0, proc: 0, montant: 0, date: 0, statut: 0 };
  const exemples = { mo: [], region: [], date: [] };

  // V2.7 : on calcule les modifications, puis on n'écrit que les cellules modifiées
  const calcul = val2CalculerModifications(data, false);
  const corrigees = calcul.corrigees;

  calcul.details.forEach(function (detail) {
    const idAO = detail.idAO;
    detail.changements.forEach(function (ch) {
      if (ch.nom === "Maitre_Ouvrage") {
        stats.mo++;
        if (exemples.mo.length < 15) exemples.mo.push(idAO + ' : "' + ch.avant + '" → "' + ch.apres + '"');
      } else if (ch.nom === "Region") {
        stats.region++;
        if (ch.raison === "inférée depuis MO") stats.regionInferee++;
        if (exemples.region.length < 15) exemples.region.push(idAO + ' : "' + ch.avant + '" → "' + ch.apres + '"');
      } else if (ch.nom === "Type_Procedure") stats.proc++;
      else if (ch.nom === "Montant") stats.montant++;
      else if (ch.nom === "Date_Limite") {
        stats.date++;
        if (exemples.date.length < 15) exemples.date.push(idAO + ' : "' + ch.avant + '" → "' + ch.apres + '"');
      } else if (ch.nom === "Statut_Traitement") stats.statut++;
    });
  });

  if (corrigees === 0) { Logger.log("Aucune ligne à modifier."); return; }

  const ecriture = val2EcrireModifications(feuille, calcul.modifications);
  Logger.log("[BACKFILL V2.7] " + ecriture.ecrites + " ligne(s) écrite(s) (cellules modifiées seulement), " +
             ecriture.ignorees + " ignorée(s) (ligne décalée).");

  Logger.log("");
  Logger.log("=== STATISTIQUES V2.6 ===");
  Logger.log("Lignes analysées    : " + (nbLignesInitial - 1));
  Logger.log("Lignes corrigées    : " + corrigees);
  Logger.log("  · MO              : " + stats.mo);
  Logger.log("  · Région          : " + stats.region + " (dont " + stats.regionInferee + " inférées)");
  Logger.log("  · Procédure       : " + stats.proc);
  Logger.log("  · Montant         : " + stats.montant);
  Logger.log("  · Date limite     : " + stats.date);
  Logger.log("  · Statut          : " + stats.statut);
  Logger.log("");
  Logger.log("--- EXEMPLES MO ---");
  exemples.mo.forEach(function (e) { Logger.log("  " + e); });
  Logger.log("");
  Logger.log("--- EXEMPLES DATE ---");
  exemples.date.forEach(function (e) { Logger.log("  " + e); });
  Logger.log("");
  Logger.log("BACKFILL TERMINÉ — " + ecriture.ecrites + " ligne(s) mise(s) à jour.");
}

function auditerNormalisationEntrees() {
  Logger.log("=== AUDIT NORMALISATION V2.6 ===");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const nomFeuille = (typeof SHEET_AO !== "undefined") ? SHEET_AO : "TOUS_AO";
  const feuille = ss.getSheetByName(nomFeuille);
  if (!feuille) { Logger.log("Feuille introuvable."); return; }

  const data = feuille.getDataRange().getValues();
  const c = { total: 0, lignesModifiees: 0, mo: 0, region: 0, regionInferee: 0, proc: 0, montant: 0, date: 0, statut: 0 };

  for (let i = 1; i < data.length; i++) {
    const idAO = (data[i][0] || "").toString().trim();
    if (!idAO) continue;
    c.total++;
    const res = val2NormaliserLigne(data[i]);
    if (res.changements.length === 0) continue;
    c.lignesModifiees++;
    res.changements.forEach(function (ch) {
      if (ch.nom === "Maitre_Ouvrage") c.mo++;
      else if (ch.nom === "Region") { c.region++; if (ch.raison === "inférée depuis MO") c.regionInferee++; }
      else if (ch.nom === "Type_Procedure") c.proc++;
      else if (ch.nom === "Montant") c.montant++;
      else if (ch.nom === "Date_Limite") c.date++;
      else if (ch.nom === "Statut_Traitement") c.statut++;
    });
  }

  Logger.log("Lignes analysées   : " + c.total);
  Logger.log("Lignes à modifier  : " + c.lignesModifiees);
  Logger.log("  · MO             : " + c.mo);
  Logger.log("  · Région         : " + c.region + " (dont " + c.regionInferee + " inférées)");
  Logger.log("  · Procédure      : " + c.proc);
  Logger.log("  · Montant        : " + c.montant);
  Logger.log("  · Date           : " + c.date);
  Logger.log("  · Statut         : " + c.statut);
}

// ---------------------------------------------------------------------------
// TEST DU LOT 6a — BAC À SABLE (feuille temporaire créée puis supprimée)
// ---------------------------------------------------------------------------

/**
 * Test fonctionnel de l'écriture ciblée. Crée une feuille temporaire "_TEST_VALIDATION_TMP",
 * y simule des avis, vérifie le comportement, puis SUPPRIME la feuille temporaire.
 * Aucune feuille de production n'est modifiée. Aucun e-mail, aucun appel IA.
 */
function val2TesterEcritureCiblee() {
  Logger.log("=================================================");
  Logger.log("=== TEST LOT 6a : ÉCRITURE CIBLÉE (bac à sable) ===");
  Logger.log("Fichier : " + SpreadsheetApp.getActiveSpreadsheet().getName());
  Logger.log("=================================================");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const nomProd = (typeof SHEET_AO !== "undefined") ? SHEET_AO : "TOUS_AO";
  const prod = ss.getSheetByName(nomProd);
  if (!prod) { Logger.log("❌ Feuille " + nomProd + " introuvable."); return; }

  const NOM_TMP = "_TEST_VALIDATION_TMP";
  const ancienne = ss.getSheetByName(NOM_TMP);
  if (ancienne) ss.deleteSheet(ancienne);

  let ok = 0, ko = 0;
  const verifier = function (nom, condition, detail) {
    Logger.log((condition ? "  ✅ " : "  ❌ ") + nom + (detail ? " — " + detail : ""));
    if (condition) ok++; else ko++;
  };

  const tmp = ss.insertSheet(NOM_TMP);
  try {
    const nbCols = 19;
    tmp.getRange(1, 1, 1, nbCols).setValues(prod.getRange(1, 1, 1, nbCols).getValues());
    tmp.getRange("L:L").setNumberFormat("@");

    const dateCollecteA = new Date(2026, 8, 20, 2, 17, 0);
    const ligne = function (id, statut, mo, dateLimite, dateCollecte) {
      const l = new Array(nbCols).fill("");
      l[0] = id; l[1] = "N-" + id + "/2026"; l[2] = dateCollecte; l[4] = "ARMP Cameroun";
      l[5] = "Titre de test " + id; l[6] = mo; l[7] = "CENTRE"; l[8] = "AONO";
      l[10] = "12 000 000 FCFA"; l[11] = dateLimite; l[14] = statut; l[15] = "Appel_Offres";
      return l;
    };
    const lignes = [
      ligne("T_1", "Nouveau", "COMMUNE DE NKAMBE", "2026-10-30 12:00", "2026-09-28 02:17"),  // à normaliser
      ligne("T_2", "TRAITÉ", "COMMUNE DE KADEY", "2026-11-05 10:00", dateCollecteA),             // NE DOIT PAS être touchée
      ligne("T_3", "NOUVEAU", "Commune de Ntui", "30-10-2026 12:00", "2026-09-28 02:17")       // déjà propre
    ];
    tmp.getRange(2, 1, lignes.length, nbCols).setValues(lignes);
    SpreadsheetApp.flush();

    const avant = tmp.getRange(1, 1, 4, nbCols).getValues();

    // --- A. Écriture ciblée normale ---
    const r = val2ValiderFeuille(tmp);
    SpreadsheetApp.flush();
    const apres = tmp.getRange(1, 1, 4, nbCols).getValues();

    verifier("A1. Seule la ligne T_1 est normalisée", r.corrigees === 1 && apres[1][14] === "NOUVEAU" && apres[1][11] === "30-10-2026 12:00",
             r.corrigees + " ligne(s) modifiée(s), statut = " + apres[1][14] + ", date limite = " + apres[1][11]);
    verifier("A2. La ligne T_2 (TRAITÉ) est strictement intacte",
             val2ValeurPourComparaison(avant[2][2]) === val2ValeurPourComparaison(apres[2][2]) &&
             avant[2][6] === apres[2][6] && avant[2][11] === apres[2][11] && avant[2][14] === apres[2][14],
             "Date_Collecte reste de type " + (apres[2][2] instanceof Date ? "date" : "texte") + " (avant : " + (avant[2][2] instanceof Date ? "date" : "texte") + ")");
    verifier("A3. La ligne T_3 (déjà propre) est strictement intacte (toutes les colonnes)",
             avant[3].every(function (x, j) { return val2ValeurPourComparaison(x) === val2ValeurPourComparaison(apres[3][j]); }));
    verifier("A4. Les identifiants sont inchangés", apres[1][0] === "T_1" && apres[2][0] === "T_2" && apres[3][0] === "T_3");

    // --- B. Ligne ajoutée par un autre processus (Spark) PENDANT la validation ---
    tmp.getRange(2, 15).setValue("Nouveau");                         // T_1 redevient à normaliser
    SpreadsheetApp.flush();
    const donnees = tmp.getDataRange().getValues();
    const calcul = val2CalculerModifications(donnees, true);         // lecture faite...
    const ligneSpark = ligne("SPARK_1", "Nouveau", "MINISTERE DE TEST", "2026-12-01 09:00", "2026-09-28 05:46");
    tmp.appendRow(ligneSpark);                                       // ...Spark écrit une ligne ici...
    SpreadsheetApp.flush();
    const e1 = val2EcrireModifications(tmp, calcul.modifications);   // ...puis on écrit
    const sparkApres = tmp.getRange(5, 1, 1, nbCols).getValues()[0];
    verifier("B1. Les modifications sont écrites malgré la ligne ajoutée", e1.ecrites >= 1 && e1.ignorees === 0,
             e1.ecrites + " écrite(s), " + e1.ignorees + " ignorée(s)");
    verifier("B2. La ligne ajoutée par Spark n'est PAS écrasée",
             sparkApres[0] === "SPARK_1" && sparkApres[6] === "MINISTERE DE TEST" && sparkApres[14] === "Nouveau");

    // --- C. Lignes décalées : l'ID ne correspond plus → ignorée ---
    const avantC = tmp.getRange(3, 7).getValue();
    const e2 = val2EcrireModifications(tmp, [{ row: 3, id: "ID_QUI_N_EXISTE_PAS", cellules: [{ col: 7, valeur: "VALEUR_INTERDITE" }] }]);
    verifier("C1. Une ligne dont l'ID ne correspond pas est ignorée", e2.ecrites === 0 && e2.ignorees === 1 && tmp.getRange(3, 7).getValue() === avantC);

    // --- D. Regroupement des colonnes voisines ---
    const cel = val2CalculerCellulesModifiees(["a", "b", "c", "d", "e"], ["a", "B", "C", "d", "E"]);
    verifier("D1. Seules les cellules modifiées sont retenues", cel.length === 3 && cel[0].col === 2 && cel[1].col === 3 && cel[2].col === 5);
  } catch (e) {
    Logger.log("  ❌ Exception pendant le test : " + e.message);
    ko++;
  } finally {
    ss.deleteSheet(tmp);
    Logger.log("Feuille temporaire " + NOM_TMP + " supprimée.");
  }

  Logger.log("");
  Logger.log("=== RÉSULTAT : " + ok + " contrôle(s) réussi(s), " + ko + " échec(s) ===");
}