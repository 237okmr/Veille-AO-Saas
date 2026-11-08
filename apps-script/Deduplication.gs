// >>> FICHIER : Deduplication.gs <<< (à coller dans l'onglet du même nom)
/**
 * ============================================================================
 * DÉDUPLICATION CROSS-SESSION ET INTER-SOURCES — V2.3
 * ============================================================================
 * RÔLE STRUCTUREL
 * ---------------------------------------------------------------------------
 * Empêche qu'une même opportunité soit traitée plusieurs fois, en tenant
 * compte du fait que, dans la passation camerounaise, le NUMÉRO OFFICIEL n'est
 * PAS un identifiant unique (il est réutilisé pour des lots, des séries
 * d'attributions, ou Décision+Communiqué d'un même avis).
 *
 * TROIS SIGNAUX CONCORDANTS POUR MARQUER UN DOUBLON
 * ---------------------------------------------------------------------------
 *   1. Empreinte forte : numéro normalisé + MO normalisé + indice de LOT
 *   2. Montant compatible à 5% près (ou absent des deux côtés)
 *   3. Titre similaire (Jaccard ≥ 0.5) — évite de confondre un lampadaire
 *      et un bloc latrine qui partageraient le même numéro source
 *
 * CAS "CONFLIT"
 * ---------------------------------------------------------------------------
 * Si (1) matche mais (2) ou (3) échoue, on log un CONFLIT sans marquer
 * DOUBLON. Cela expose les problèmes de qualité de la source (numéro
 * réutilisé) sans polluer le pipeline de matching.
 *
 * PHASE 2 (Jaccard seule, sans numéro)
 * ---------------------------------------------------------------------------
 * Réservée aux paires où AU MOINS UN des deux avis a un numéro fallback
 * (ARMP_xxx). Seuil relevé à 0.85 et signature minimale de 8 tokens pour
 * éliminer les faux positifs sur titres génériques ("Attribution de marché").
 *
 * PHASE 3 (V2.3 — LOT 4) : MÊME AVIS PUBLIÉ PAR DEUX SOURCES
 * ---------------------------------------------------------------------------
 * Le maître d'ouvrage s'écrit différemment selon la source ("CRTV" contre
 * "CRTV (cameroon Radio Television)", "Ndop Council" contre "Commune de Ndop"),
 * ce qui empêchait la phase 1 de voir ces doublons. La phase 3 compare des
 * avis de SOURCES DIFFÉRENTES avec : même numéro officiel (≥ 6 caractères, pas
 * un numéro de repli), même type de publication, lots compatibles, montants
 * compatibles, maîtres d'ouvrage compatibles ET titres suffisamment proches.
 * Référence conservée : l'avis le plus COMPLET (montant + date limite
 * renseignés) ; à égalité, le plus ancien. Seul un avis NOUVEAU peut être
 * marqué DOUBLON : un avis déjà traité n'est jamais modifié.
 *
 * ENTRÉE  : feuille TOUS_AO
 * APPEL   : dedupExecuterPostCollecte(metriques)
 * AUDIT   : auditerDeduplication()
 * ============================================================================
 */

const DEDUP2_FENETRE_JOURS = 60;
const DEDUP2_SEUIL_JACCARD_FLOU = 0.85;
const DEDUP2_SEUIL_JACCARD_TITRE = 0.50;
const DEDUP2_TAILLE_MIN_EMPREINTE = 12;
const DEDUP2_TAILLE_MIN_SIGNATURE_FLOU = 8;
const DEDUP2_TOLERANCE_MONTANT = 0.05;
const DEDUP2_SEUIL_JACCARD_INTER_SOURCES = 0.35;

// Mots trop génériques pour identifier un maître d'ouvrage
const DEDUP2_MOTS_GENERIQUES_MO = [
  "commune", "ministere", "communaute", "urbaine", "council", "projet",
  "delegation", "region", "regional", "des", "du", "de", "la", "le", "les",
  "et", "and", "the", "of", "cameroun", "cameroon"
];

const DEDUP2_MOTS_VIDES = [
  "dans", "pour", "avec", "sous", "sur", "les", "des", "une", "aux",
  "par", "est", "sont", "cette", "leur", "leurs", "tout", "tous",
  "travaux", "projet", "objet", "avis", "appel", "offres", "national",
  "ouvert", "marché", "marche", "public", "publics"
];

// ---------------------------------------------------------------------------
// NORMALISATIONS
// ---------------------------------------------------------------------------

function dedupNormaliserNumero(numero) {
  if (!numero) return "";
  return String(numero).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function dedupNormaliserMO(mo) {
  if (!mo) return "";
  return String(mo)
    .replace(/\s*\(avec[^)]*\)\s*$/i, "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupSignatureFloue(titre, mo) {
  const t = ((titre || "") + " " + dedupNormaliserMO(mo))
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = t.split(" ").filter(function (tok) {
    return tok.length > 4 && DEDUP2_MOTS_VIDES.indexOf(tok) === -1;
  });

  return Array.from(new Set(tokens)).sort();
}

/**
 * Extrait un indice de lot s'il existe ("LOT 1", "LOT 2", "LOT 1 & 2"...).
 * Retourne "" si absent.
 */
function dedupExtraireIndiceLot(titre) {
  if (!titre) return "";
  const t = String(titre).toUpperCase();
  const m = /\bLOT\s*(?:N[°º]?)?\s*([0-9IVX]+)(?:\s*(?:&|ET)\s*([0-9IVX]+))?/.exec(t);
  if (!m) return "";
  return "LOT_" + m[1] + (m[2] ? "_" + m[2] : "");
}

/**
 * Extrait la valeur numérique d'un montant formaté.
 * Retourne 0 si absent ou non exploitable.
 */
function dedupMontantNumerique(montantStr) {
  if (!montantStr) return 0;
  const s = String(montantStr);
  if (s.indexOf("Non précisé") !== -1 || s.indexOf("N/A") !== -1) return 0;
  const n = parseInt(s.replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

/**
 * Deux montants sont compatibles si l'un est absent, ou si l'écart relatif
 * est ≤ 5%.
 */
function dedupMontantCompat(m1, m2) {
  const n1 = dedupMontantNumerique(m1);
  const n2 = dedupMontantNumerique(m2);
  if (n1 === 0 || n2 === 0) return true;
  const ecart = Math.abs(n1 - n2) / Math.max(n1, n2);
  return ecart <= DEDUP2_TOLERANCE_MONTANT;
}

/**
 * Empreinte forte : hash(numero_normalisé + MO_normalisé + indice_LOT).
 * Retourne "" si l'un des signaux est trop faible.
 */
function dedupEmpreinteForte(numero, mo, titre) {
  const numNorm = dedupNormaliserNumero(numero);
  const moNorm = dedupNormaliserMO(mo).replace(/ /g, "");
  const lot = dedupExtraireIndiceLot(titre);
  if (numNorm.length < 6) return "";
  if (moNorm.length < 4) return "";
  const base = numNorm + "|" + moNorm + "|" + lot;
  if (base.length < DEDUP2_TAILLE_MIN_EMPREINTE) return "";

  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.MD5, base, Utilities.Charset.UTF_8
  );
  return Utilities.base64Encode(digest).substring(0, 16);
}

function dedupJaccard(a, b) {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a), setB = new Set(b);
  let inter = 0;
  setA.forEach(function (t) { if (setB.has(t)) inter++; });
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

function dedupEstNumeroFallback(numero) {
  if (!numero) return true;
  const s = String(numero).trim();
  if (!s) return true;
  if (/^ARMP_[0-9]+$/i.test(s)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// V2.3 — OUTILS DE LA PHASE 3 (INTER-SOURCES)
// ---------------------------------------------------------------------------

function dedupNormaliserSource(source) {
  return String(source || "").toLowerCase().trim();
}

/** Mots qui identifient vraiment un maître d'ouvrage (sans les mots génériques). */
function dedupMoSignificatifs(mo) {
  const tokens = dedupNormaliserMO(mo).split(" ").filter(function (t) {
    return t.length >= 3 && DEDUP2_MOTS_GENERIQUES_MO.indexOf(t) === -1;
  });
  return Array.from(new Set(tokens));
}

/**
 * Deux maîtres d'ouvrage sont compatibles si les mots significatifs de l'un
 * sont tous contenus dans l'autre ("CRTV" dans "CRTV (cameroon Radio Television)"),
 * ou si l'un des deux est vide/inexploitable.
 */
function dedupMoCompatibles(moA, moB) {
  const a = dedupMoSignificatifs(moA);
  const b = dedupMoSignificatifs(moB);
  if (a.length === 0 || b.length === 0) return true;
  const inclus = function (petit, grand) {
    return petit.every(function (t) { return grand.indexOf(t) !== -1; });
  };
  return inclus(a, b) || inclus(b, a);
}

/** Lots compatibles : identiques, ou l'un des deux ne mentionne aucun lot. */
function dedupLotsCompatibles(l1, l2) {
  if (!l1 || !l2) return true;
  return l1 === l2;
}

/** Construit un "avis" comparable à partir de champs bruts. */
function dedupItemDepuisChamps(numero, titre, mo, montant, source, typePub, dateLimite) {
  return {
    numero: String(numero || ""),
    numeroNorm: dedupNormaliserNumero(numero),
    numeroFallback: dedupEstNumeroFallback(numero),
    titre: String(titre || ""),
    mo: String(mo || ""),
    moNorm: dedupNormaliserMO(mo),
    montant: String(montant || ""),
    lot: dedupExtraireIndiceLot(titre),
    source: String(source || "").trim(),
    typePub: (String(typePub || "").trim() || "Appel_Offres"),
    dateLimite: String(dateLimite || ""),
    signature: dedupSignatureFloue(titre, mo)
  };
}

/**
 * Complétude d'un avis : 1 point pour un montant renseigné, 1 point pour une
 * date limite réelle (ou "N/A" attendu pour une attribution). Une date estimée
 * (~) ou "Non précisée" ne compte pas.
 */
function dedupScoreCompletude(it) {
  let score = 0;
  if (dedupMontantNumerique(it.montant) > 0) score++;
  const dl = String(it.dateLimite || "").trim();
  if (dl.indexOf("N/A") !== -1) {
    score++;
  } else if (dl && dl.indexOf("Non précisée") === -1 && dl.indexOf("Estimée") === -1 && dl.charAt(0) !== "~") {
    score++;
  }
  return score;
}

/**
 * Décide si deux avis de sources différentes décrivent le MÊME avis.
 * @return {Object} { equivalents: boolean, jaccard: number, raison: string }
 */
function dedupSontEquivalentsInterSources(a, b) {
  const non = function (raison) { return { equivalents: false, jaccard: 0, raison: raison }; };
  if (!a || !b) return non("données absentes");
  if (!a.source || !b.source) return non("source inconnue");
  if (dedupNormaliserSource(a.source) === dedupNormaliserSource(b.source)) return non("même source");
  if (a.numeroFallback || b.numeroFallback) return non("numéro de repli");
  if (!a.numeroNorm || a.numeroNorm.length < 6 || a.numeroNorm !== b.numeroNorm) return non("numéros différents ou trop courts");
  if (a.typePub !== b.typePub) return non("types de publication différents");
  if (!dedupLotsCompatibles(a.lot, b.lot)) return non("lots différents");
  if (!dedupMontantCompat(a.montant, b.montant)) return non("montants incompatibles");
  if (!dedupMoCompatibles(a.mo, b.mo)) return non("maîtres d'ouvrage incompatibles");
  const jac = dedupJaccard(a.signature, b.signature);
  if (jac < DEDUP2_SEUIL_JACCARD_INTER_SOURCES) return non("titres trop différents (" + jac.toFixed(2) + ")");
  return { equivalents: true, jaccard: jac, raison: "même numéro, titres proches (" + jac.toFixed(2) + ")" };
}

/**
 * Marque une ligne DOUBLON (statut, colonne 15). La traçabilité est écrite en
 * colonne 18 UNIQUEMENT si elle est vide : on n'écrase jamais une donnée existante.
 */
function dedupMarquerDoublon(feuille, row, texteTrace) {
  feuille.getRange(row, 15).setValue("DOUBLON");
  const cellule = feuille.getRange(row, 18);
  if (String(cellule.getValue() || "").trim() === "") {
    cellule.setValue(texteTrace);
  } else {
    Logger.log("[DÉDUP] Ligne " + row + " : colonne 18 déjà renseignée, traçabilité non écrite (" + texteTrace + ").");
  }
}

// ---------------------------------------------------------------------------
// LECTURE DU CONTEXTE
// ---------------------------------------------------------------------------

function dedupLireContexte(ss, limiteJours, inclureToutStatut) {
  const nomFeuille = (typeof SHEET_AO !== "undefined") ? SHEET_AO : "TOUS_AO";
  const feuille = ss.getSheetByName(nomFeuille);
  if (!feuille) return { feuille: null, items: [] };

  const data = feuille.getDataRange().getValues();
  if (data.length <= 1) return { feuille: feuille, items: [] };

  const limite = new Date();
  limite.setDate(limite.getDate() - limiteJours);

  const items = [];
  for (let i = 1; i < data.length; i++) {
    const id = (data[i][0] || "").toString().trim();
    if (!id) continue;

    let dansFenetre = false;
    const dateCollecteStr = (data[i][2] || "").toString().trim();
    if (dateCollecteStr) {
      const d = new Date(dateCollecteStr);
      if (!isNaN(d.getTime()) && d >= limite) dansFenetre = true;
    }
    const statut = (data[i][14] || "").toString().trim().toUpperCase();
    if (statut === "NOUVEAU") dansFenetre = true;
    if (inclureToutStatut) dansFenetre = true;
    if (!dansFenetre) continue;

    const numero = (data[i][1] || "").toString();
    const titre = (data[i][5] || "").toString();
    const mo = (data[i][6] || "").toString();
    const montant = (data[i][10] || "").toString();

    items.push({
      row: i + 1,
      id: id,
      numero: numero,
      numeroNorm: dedupNormaliserNumero(numero),
      numeroFallback: dedupEstNumeroFallback(numero),
      titre: titre,
      mo: mo,
      moNorm: dedupNormaliserMO(mo),
      montant: montant,
      montantNum: dedupMontantNumerique(montant),
      lot: dedupExtraireIndiceLot(titre),
      statut: statut,
      source: (data[i][4] || "").toString().trim(),
      typePub: ((data[i][15] || "").toString().trim() || "Appel_Offres"),
      dateLimite: (data[i][11] || "").toString(),
      empreinte: dedupEmpreinteForte(numero, mo, titre),
      signature: dedupSignatureFloue(titre, mo)
    });
  }
  return { feuille: feuille, items: items };
}

// ---------------------------------------------------------------------------
// DÉTECTION
// ---------------------------------------------------------------------------

function dedupDetecterDoublons(items, ignorerStatut) {
  const exactes = new Map();
  const conflits = [];
  const floues = new Map();

  function estCandidate(item) {
    if (ignorerStatut) return true;
    return item.statut === "NOUVEAU";
  }

  // === PHASE 1 : empreintes fortes ===
  const parEmpreinte = new Map();
  const tries = items.slice().sort(function (a, b) { return a.row - b.row; });

  for (let i = 0; i < tries.length; i++) {
    const item = tries[i];
    if (!item.empreinte) continue;
    if (!parEmpreinte.has(item.empreinte)) parEmpreinte.set(item.empreinte, []);
    parEmpreinte.get(item.empreinte).push(item);
  }

  parEmpreinte.forEach(function (groupe, emp) {
    if (groupe.length < 2) return;

    // Comparaison pairwise dans le groupe
    for (let i = 0; i < groupe.length; i++) {
      for (let j = i + 1; j < groupe.length; j++) {
        const a = groupe[i];
        const b = groupe[j];

        // Signal 2 : montant compatible ?
        const montantOk = dedupMontantCompat(a.montant, b.montant);
        // Signal 3 : titre similaire ?
        const titreSim = dedupJaccard(a.signature, b.signature);

        if (montantOk && titreSim >= DEDUP2_SEUIL_JACCARD_TITRE) {
          if (estCandidate(b)) {
            exactes.set(b.row, {
              originalRow: a.row,
              originalId: a.id,
              motif: "Empreinte " + emp + " | Jaccard titre " + titreSim.toFixed(2),
              score: titreSim
            });
          }
        } else {
          // Signal 1 matche, mais 2 ou 3 échoue → CONFLIT (qualité de source)
          conflits.push({
            a: a, b: b, emp: emp,
            montantOk: montantOk, titreSim: titreSim,
            raison: !montantOk
              ? "Montants différents : " + a.montant + " vs " + b.montant
              : "Titres différents (Jaccard " + titreSim.toFixed(2) + ")"
          });
        }
      }
    }
  });

  // === PHASE 2 : Jaccard pure, réservée aux numéros fallback ===
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!estCandidate(item)) continue;
    if (exactes.has(item.row)) continue;
    if (!item.signature.length || item.signature.length < DEDUP2_TAILLE_MIN_SIGNATURE_FLOU) continue;

    for (let j = 0; j < items.length; j++) {
      if (i === j) continue;
      const autre = items[j];

      // Au moins un des deux doit avoir un numéro fallback
      const auMoinsUnFallback = item.numeroFallback || autre.numeroFallback;
      if (!auMoinsUnFallback) continue;

      // MO compatible
      const moOk = item.moNorm && autre.moNorm && (
        item.moNorm === autre.moNorm ||
        dedupJaccard(
          item.moNorm.split(" ").filter(function (t) { return t.length > 3; }),
          autre.moNorm.split(" ").filter(function (t) { return t.length > 3; })
        ) >= 0.9
      );
      if (!moOk) continue;

      // Montant compatible
      if (!dedupMontantCompat(item.montant, autre.montant)) continue;

      const sim = dedupJaccard(item.signature, autre.signature);
      if (sim >= DEDUP2_SEUIL_JACCARD_FLOU) {
        if (!floues.has(item.row)) {
          floues.set(item.row, {
            originalRow: autre.row,
            originalId: autre.id,
            motif: "Similarité " + sim.toFixed(2) + " avec " + autre.id,
            score: sim
          });
        }
        break;
      }
    }
  }

  // === PHASE 3 : même avis publié par deux sources différentes (V2.3) ===
  const croisees = new Map();
  const parNumero = new Map();
  items.forEach(function (it) {
    if (it.numeroFallback || !it.numeroNorm || it.numeroNorm.length < 6) return;
    if (!parNumero.has(it.numeroNorm)) parNumero.set(it.numeroNorm, []);
    parNumero.get(it.numeroNorm).push(it);
  });

  parNumero.forEach(function (groupe) {
    if (groupe.length < 2) return;
    const tri = groupe.slice().sort(function (x, y) { return x.row - y.row; });
    for (let i = 0; i < tri.length; i++) {
      for (let j = i + 1; j < tri.length; j++) {
        const a = tri[i];
        const b = tri[j];
        const eq = dedupSontEquivalentsInterSources(a, b);
        if (!eq.equivalents) continue;

        const scoreA = dedupScoreCompletude(a);
        const scoreB = dedupScoreCompletude(b);
        const ref = (scoreB > scoreA) ? b : a;          // égalité : le plus ancien
        const perdant = (ref === a) ? b : a;

        const dejaMarque = function (r) { return exactes.has(r) || floues.has(r) || croisees.has(r); };
        if (dejaMarque(ref.row) || dejaMarque(perdant.row)) continue;
        if (!estCandidate(perdant)) continue;            // avis déjà traité : jamais modifié

        croisees.set(perdant.row, {
          originalRow: ref.row,
          originalId: ref.id,
          motif: "Inter-sources : " + eq.raison + " | complétude " + Math.max(scoreA, scoreB) + " contre " + Math.min(scoreA, scoreB),
          score: eq.jaccard
        });
      }
    }
  });

  return { exactes: exactes, conflits: conflits, floues: floues, croisees: croisees };
}

// ---------------------------------------------------------------------------
// PRODUCTION
// ---------------------------------------------------------------------------

function dedupExecuterPostCollecte(metriques) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log("=================================================");
  Logger.log("[DÉDUP V2.2] Démarrage — fenêtre : " + DEDUP2_FENETRE_JOURS + " jours");
  Logger.log("=================================================");

  const ctx = dedupLireContexte(ss, DEDUP2_FENETRE_JOURS, false);
  if (!ctx.feuille) {
    Logger.log("[DÉDUP V2.2] Feuille TOUS_AO introuvable.");
    return { exactes: 0, floues: 0, croisees: 0, marquees: 0 };
  }

  const nbNouveaux = ctx.items.filter(function (it) { return it.statut === "NOUVEAU"; }).length;
  Logger.log("[DÉDUP V2.2] " + ctx.items.length + " avis récents, dont " + nbNouveaux + " NOUVEAU.");

  if (ctx.items.length < 2 || nbNouveaux === 0) {
    Logger.log("[DÉDUP V2.2] Rien à dédupliquer.");
    return { exactes: 0, floues: 0, croisees: 0, marquees: 0 };
  }

  const detections = dedupDetecterDoublons(ctx.items, false);
  const feuille = ctx.feuille;
  let marquees = 0;

  detections.exactes.forEach(function (info, row) {
    dedupMarquerDoublon(feuille, row, "Doublon de " + info.originalId);
    marquees++;
  });
  detections.floues.forEach(function (info, row) {
    dedupMarquerDoublon(feuille, row, "Doublon probable de " + info.originalId);
    marquees++;
  });
  detections.croisees.forEach(function (info, row) {
    dedupMarquerDoublon(feuille, row, "Doublon inter-sources de " + info.originalId + " (plus complet)");
    Logger.log("[DÉDUP V2.3] Ligne " + row + " marquée DOUBLON de " + info.originalId + " — " + info.motif);
    marquees++;
  });

  Logger.log("[DÉDUP V2.3] Exactes : " + detections.exactes.size +
             " | Floues : " + detections.floues.size +
             " | Inter-sources : " + detections.croisees.size +
             " | Conflits (non marqués) : " + detections.conflits.length);
  Logger.log("[DÉDUP V2.2] Terminé — " + marquees + " ligne(s) marquée(s).");

  if (metriques) metriques.doublonsDetectes = (metriques.doublonsDetectes || 0) + marquees;

  Logger.log("=================================================");
  return { exactes: detections.exactes.size, floues: detections.floues.size, croisees: detections.croisees.size, marquees: marquees };
}

// ---------------------------------------------------------------------------
// AUDIT
// ---------------------------------------------------------------------------

function auditerDeduplication() {
  Logger.log("=================================================");
  Logger.log("=== AUDIT DE DÉDUPLICATION V2.3 ===");
  Logger.log("Fichier : " + SpreadsheetApp.getActiveSpreadsheet().getName());
  Logger.log("Fenêtre : " + DEDUP2_FENETRE_JOURS + " jours");
  Logger.log("Phase 1 : empreinte + montant + titre ≥ " + DEDUP2_SEUIL_JACCARD_TITRE);
  Logger.log("Phase 2 : fallback + Jaccard ≥ " + DEDUP2_SEUIL_JACCARD_FLOU +
             " + signature ≥ " + DEDUP2_TAILLE_MIN_SIGNATURE_FLOU);
  Logger.log("=================================================");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ctx = dedupLireContexte(ss, DEDUP2_FENETRE_JOURS, true);
  if (!ctx.feuille) { Logger.log("TOUS_AO introuvable."); return; }

  const nbNouveaux = ctx.items.filter(function (it) { return it.statut === "NOUVEAU"; }).length;
  Logger.log("Avis analysés      : " + ctx.items.length);
  Logger.log("Dont NOUVEAU       : " + nbNouveaux);
  Logger.log("");

  if (ctx.items.length < 2) { Logger.log("Trop peu d'avis."); return; }

  const detections = dedupDetecterDoublons(ctx.items, true);
  const parRow = {};
  ctx.items.forEach(function (it) { parRow[it.row] = it; });

  // -------- DOUBLONS EXACTS --------
  Logger.log("=================================================");
  Logger.log("DOUBLONS CERTAINS : " + detections.exactes.size);
  Logger.log("=================================================");
  let n = 0;
  detections.exactes.forEach(function (info, row) {
    if (n >= 30) return;
    const it = parRow[row];
    const orig = parRow[info.originalRow];
    Logger.log("  #" + (n + 1) + " — " + it.id + "  ==  " + info.originalId +
               "  (score " + info.score.toFixed(2) + ")");
    Logger.log("     Lot A/B  : " + (it.lot || "—") + " / " + (orig ? (orig.lot || "—") : "?"));
    Logger.log("     Montant A: " + (it.montant || "—"));
    if (orig) Logger.log("     Montant B: " + (orig.montant || "—"));
    Logger.log("     Titre A  : " + (it.titre || "").substring(0, 90));
    if (orig) Logger.log("     Titre B  : " + (orig.titre || "").substring(0, 90));
    Logger.log("");
    n++;
  });
  if (detections.exactes.size > 30) Logger.log("  ... et " + (detections.exactes.size - 30) + " autre(s).");

  // -------- CONFLITS --------
  Logger.log("=================================================");
  Logger.log("CONFLITS (empreinte forte identique mais avis différents) : " + detections.conflits.length);
  Logger.log("→ Signal de qualité de données dans la source, non marqués DOUBLON");
  Logger.log("=================================================");
  n = 0;
  detections.conflits.forEach(function (c) {
    if (n >= 30) return;
    Logger.log("  #" + (n + 1) + " — " + c.a.id + " vs " + c.b.id);
    Logger.log("     Raison   : " + c.raison);
    Logger.log("     Titre A  : " + (c.a.titre || "").substring(0, 90));
    Logger.log("     Titre B  : " + (c.b.titre || "").substring(0, 90));
    Logger.log("");
    n++;
  });
  if (detections.conflits.length > 30) Logger.log("  ... et " + (detections.conflits.length - 30) + " autre(s).");

  // -------- DOUBLONS FLOUS --------
  Logger.log("=================================================");
  Logger.log("DOUBLONS PROBABLES (fallback) : " + detections.floues.size);
  Logger.log("=================================================");
  n = 0;
  detections.floues.forEach(function (info, row) {
    if (n >= 20) return;
    const it = parRow[row];
    const orig = parRow[info.originalRow];
    Logger.log("  #" + (n + 1) + " — " + it.id + "  ≈≈  " + info.originalId +
               "  (" + info.score.toFixed(3) + ")");
    Logger.log("     Titre A  : " + (it.titre || "").substring(0, 90));
    if (orig) Logger.log("     Titre B  : " + (orig.titre || "").substring(0, 90));
    Logger.log("");
    n++;
  });

  // -------- DOUBLONS INTER-SOURCES (V2.3) --------
  Logger.log("=================================================");
  Logger.log("DOUBLONS INTER-SOURCES (phase 3) : " + detections.croisees.size);
  Logger.log("→ Référence = avis le plus complet ; l'autre serait marqué DOUBLON (si NOUVEAU)");
  Logger.log("=================================================");
  n = 0;
  detections.croisees.forEach(function (info, row) {
    if (n >= 30) return;
    const it = parRow[row];
    const orig = parRow[info.originalRow];
    Logger.log("  #" + (n + 1) + " — " + it.id + " (" + it.source + ")  ==  " + info.originalId + (orig ? " (" + orig.source + ")" : ""));
    Logger.log("     " + info.motif);
    Logger.log("     MO A/B   : " + (it.mo || "—") + " / " + (orig ? (orig.mo || "—") : "?"));
    Logger.log("     Montant  : " + (it.montant || "—") + " / " + (orig ? (orig.montant || "—") : "?"));
    Logger.log("");
    n++;
  });

  Logger.log("=================================================");
  Logger.log("SYNTHÈSE");
  Logger.log("  · Doublons certains   : " + detections.exactes.size);
  Logger.log("  · Doublons probables  : " + detections.floues.size);
  Logger.log("  · Inter-sources       : " + detections.croisees.size);
  Logger.log("  · Conflits signalés   : " + detections.conflits.length + " (non marqués)");
  Logger.log("Aucune écriture effectuée.");
  Logger.log("=================================================");

  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      detections.exactes.size + " certains + " + detections.floues.size +
      " probables + " + detections.conflits.length + " conflits",
      "Audit dédup V2.2", 10
    );
  } catch (e) {}
}

// ---------------------------------------------------------------------------
// COMPATIBILITÉ
// ---------------------------------------------------------------------------

/**
 * @deprecated Utiliser dedupExecuterPostCollecte() à la place.
 */
function dedupliquerAvisRecents(ss, avisInseresSession) {
  return dedupExecuterPostCollecte(null);
}

// ---------------------------------------------------------------------------
// TESTS DU LOT 4 — LECTURE SEULE (aucune écriture, aucun e-mail, aucun appel IA)
// ---------------------------------------------------------------------------

/**
 * Test fonctionnel de la phase 3 :
 *   A. cas de contrôle synthétiques (doublons attendus / faux positifs à éviter)
 *   B. passage en revue des avis réels de TOUS_AO (tous statuts) : paires trouvées
 */
function dedupTesterInterSources() {
  Logger.log("=================================================");
  Logger.log("=== TEST LOT 4 : DÉDUPLICATION INTER-SOURCES ===");
  Logger.log("Fichier : " + SpreadsheetApp.getActiveSpreadsheet().getName());
  Logger.log("=================================================");

  let ok = 0, ko = 0;
  const verifier = function (nom, attendu, obtenu) {
    const bon = (attendu === obtenu);
    Logger.log((bon ? "  ✅ " : "  ❌ ") + nom + " (attendu : " + attendu + ", obtenu : " + obtenu + ")");
    if (bon) ok++; else ko++;
  };

  const T = "AVIS D'APPEL D'OFFRES NATIONAL OUVERT N°011/AONO/CRTV/CIPM/2026 POUR LA FOURNITURE D'EQUIPEMENTS AUDIOVISUELS";
  const arm = dedupItemDepuisChamps("011/AONO/CRTV/CIPM/2026", T, "CRTV", "49 950 000 FCFA", "ARMP Cameroun", "Appel_Offres", "28-10-2026 12:00");
  const col = dedupItemDepuisChamps("011/AONO/CRTV/CIPM/2026", T.toLowerCase(), "CRTV (cameroon Radio Television)", "49 950 000 FCFA", "COLEPS", "Appel_Offres", "28-10-2026 12:00");

  Logger.log("A. Cas de contrôle");
  verifier("Même avis ARMP / COLEPS (MO écrit différemment)", true, dedupSontEquivalentsInterSources(arm, col).equivalents);
  verifier("Même source des deux côtés", false,
    dedupSontEquivalentsInterSources(arm, dedupItemDepuisChamps(arm.numero, T, "CRTV", "49 950 000 FCFA", "ARMP Cameroun", "Appel_Offres", "")).equivalents);
  verifier("Lots différents (Lot 1 / Lot 2)", false, dedupSontEquivalentsInterSources(
    dedupItemDepuisChamps("004/DC/2026-X", "ACHAT DE MATERIEL LOT 1 POUR LA COMMUNE", "Commune de Figuil", "", "ARMP Cameroun", "Appel_Offres", ""),
    dedupItemDepuisChamps("004/DC/2026-X", "ACHAT DE MATERIEL LOT 2 POUR LA COMMUNE", "Commune de Figuil", "", "COLEPS", "Appel_Offres", "")).equivalents);
  verifier("Lot mentionné d'un seul côté (compatible)", true, dedupSontEquivalentsInterSources(
    dedupItemDepuisChamps("004/DCO/MINEPAT/2026", "DEMANDE DE COTATION ACHAT EQUIPEMENTS DE BUREAU LOT 1 CGER", "Viva Benoue", "", "ARMP Cameroun", "Appel_Offres", ""),
    dedupItemDepuisChamps("004/DCO/MINEPAT/2026", "DEMANDE DE COTATION ACHAT EQUIPEMENTS DE BUREAU EN DEUX LOTS", "Meaden / Projet Viva-Bénoué (minepat)", "", "COLEPS", "Appel_Offres", "")).equivalents);
  verifier("Montants incompatibles (10 M / 20 M)", false, dedupSontEquivalentsInterSources(
    dedupItemDepuisChamps(arm.numero, T, "CRTV", "10 000 000 FCFA", "ARMP Cameroun", "Appel_Offres", ""),
    dedupItemDepuisChamps(arm.numero, T, "CRTV", "20 000 000 FCFA", "COLEPS", "Appel_Offres", "")).equivalents);
  verifier("Types différents (Attribution / Appel d'offres)", false, dedupSontEquivalentsInterSources(
    dedupItemDepuisChamps(arm.numero, T, "CRTV", "", "ARMP Cameroun", "Attribution", ""),
    dedupItemDepuisChamps(arm.numero, T, "CRTV", "", "COLEPS", "Appel_Offres", "")).equivalents);
  verifier("Maîtres d'ouvrage différents, même numéro", false, dedupSontEquivalentsInterSources(
    dedupItemDepuisChamps("001/AONO/2026-A", "ACQUISITION D'UN VEHICULE UTILITAIRE", "Commune de Ntui", "", "ARMP Cameroun", "Appel_Offres", ""),
    dedupItemDepuisChamps("001/AONO/2026-A", "ACQUISITION D'UN VEHICULE UTILITAIRE", "Commune de Figuil", "", "COLEPS", "Appel_Offres", "")).equivalents);
  verifier("Numéro de repli (ARMP_123)", false, dedupSontEquivalentsInterSources(
    dedupItemDepuisChamps("ARMP_123", T, "CRTV", "", "ARMP Cameroun", "Appel_Offres", ""),
    dedupItemDepuisChamps("ARMP_123", T, "CRTV", "", "COLEPS", "Appel_Offres", "")).equivalents);
  verifier("Titres sans rapport, même numéro", false, dedupSontEquivalentsInterSources(
    dedupItemDepuisChamps(arm.numero, "CONSTRUCTION D'UN FORAGE ET ADDUCTION D'EAU POTABLE VILLAGE", "CRTV", "", "ARMP Cameroun", "Appel_Offres", ""),
    dedupItemDepuisChamps(arm.numero, "RECRUTEMENT D'UN CABINET POUR AUDIT COMPTABLE ANNUEL", "CRTV", "", "COLEPS", "Appel_Offres", "")).equivalents);

  Logger.log("  Complétude : ARMP sans montant = " +
    dedupScoreCompletude(dedupItemDepuisChamps("x", "x", "x", "Non précisé", "ARMP", "Appel_Offres", "Non précisée")) +
    " | COLEPS avec montant + date = " +
    dedupScoreCompletude(dedupItemDepuisChamps("x", "x", "x", "35 000 000 FCFA", "COLEPS", "Appel_Offres", "16-10-2026 10:00")) + " (attendu 0 puis 2)");

  Logger.log("");
  Logger.log("B. Avis réels de TOUS_AO (lecture seule, tous statuts)");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ctx = dedupLireContexte(ss, 3650, true);
  if (!ctx.feuille) {
    Logger.log("  ❌ Feuille TOUS_AO introuvable.");
  } else {
    const detections = dedupDetecterDoublons(ctx.items, true);
    const parRow = {};
    ctx.items.forEach(function (it) { parRow[it.row] = it; });
    Logger.log("  Avis analysés : " + ctx.items.length + " | paires inter-sources détectées : " + detections.croisees.size);
    let n = 0;
    detections.croisees.forEach(function (info, row) {
      if (n >= 25) return;
      const perdant = parRow[row];
      const ref = parRow[info.originalRow];
      Logger.log("   · DOUBLON " + perdant.id + " (" + perdant.source + ")  →  référence " + info.originalId + (ref ? " (" + ref.source + ")" : ""));
      n++;
    });
    Logger.log("  (Rien n'est marqué : test en lecture seule. Les avis déjà TRAITÉ ne seront de toute façon jamais modifiés.)");
  }

  Logger.log("");
  Logger.log("=== RÉSULTAT : " + ok + " contrôle(s) réussi(s), " + ko + " échec(s) ===");
}