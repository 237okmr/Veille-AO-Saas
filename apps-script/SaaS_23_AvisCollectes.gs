// >>> FICHIER : SaaS_23_AvisCollectes.gs <<< (NOUVEAU fichier à créer dans l'éditeur Apps Script)
/**
 * ============================================================================
 * SAAS — AVIS COLLECTÉS (LOTS AV1 + AV2) — LECTURE SEULE
 * ============================================================================
 * Deux routes, toutes deux en LECTURE SEULE de l'onglet des avis (TOUS_AO) :
 *
 *   GET /admin/avis           (ADMIN)   liste filtrable, triable et paginée de tous
 *                                       les avis collectés (page « Avis collectés »).
 *   GET /public/radar-ticker  (PUBLIC)  quelques avis ouverts récents, uniquement des
 *                                       champs déjà publics, pour le radar de l'accueil.
 *
 * AUCUNE écriture dans le classeur, AUCUN déclencheur, AUCUN secret. Les colonnes sont
 * repérées par le NOM de leur en-tête (pas par leur position) : réordonner les colonnes
 * de TOUS_AO ne casse rien. En-têtes attendus : ID_AO, Numero_Avis, Date_Collecte,
 * Date_publication, Source_Plateforme, Titre_AO, Maitre_Ouvrage, Region, Type_Procedure,
 * Montant, Date_Limite, Lien_Fiche_Detail, Lien_DAO, Statut_Traitement, Type_Publication,
 * Attributaire_Principal, Montant_Attribue, Date_Attribution.
 *
 * Fuseau : toutes les dates sont lues et rendues à l'heure de Douala (UTC+1, sans heure
 * d'été). Une date limite sans heure vaut 23 h 59 min 59 s heure de Douala.
 *
 * LOT AV2 :
 *   • Date limite ESTIMÉE (« ~22-09-2026 12:00 (Estimée: voir DAO) ») : lue, avec le
 *     drapeau dateLimiteEstimee = true. Visible dans la liste admin, JAMAIS sur le radar public.
 *   • Date limite illisible (« Non précisée (Consulter DAO) ») : le texte d'origine est renvoyé
 *     dans dateLimiteTexte (aucune date n'est inventée).
 *   • Montant non lisible en FCFA (« 85 963 496 USD ») : renvoyé dans montantTexte tel quel.
 *     « Non précisé », « N/A » : montant null et montantTexte null.
 *   • Radar public : les avis SANS montant sont maintenant retenus (montantEstime = null) ;
 *     le radar les affiche en points creux sur un anneau fixe.
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// RÉGLAGES
// ---------------------------------------------------------------------------
const SAAS_AVIS_RADAR_MAX = 12;                 // nombre maximal d'avis sur le radar public
const SAAS_AVIS_RADAR_MAX_INTERNATIONAL = 4;    // dont au plus 4 avis internationaux en priorité
const SAAS_AVIS_RADAR_CACHE_SEC = 300;          // cache de 5 minutes (protège les quotas)
const SAAS_AVIS_RADAR_CACHE_CLE = "AVIS_RADAR_PUBLIC_V2";   // V2 : montants facultatifs (l'ancien cache est ignoré)
const SAAS_AVIS_DECALAGE_DOUALA_MS = 3600000;   // UTC+1
const SAAS_AVIS_LIMITE_PAR_DEFAUT = 25;
const SAAS_AVIS_LIMITE_MAX = 100;
// Statuts qui NE sont PAS des avis ouverts (comparaison sans accent ni casse) :
const SAAS_AVIS_STATUTS_NON_OUVERTS = ["expire", "doublon", "rejete", "archive"];

// ---------------------------------------------------------------------------
// OUTILS DE NORMALISATION ET DE LECTURE
// ---------------------------------------------------------------------------

/** Minuscules, sans accents, espaces compactés. */
function saasAvisNormaliser_(valeur) {
  if (valeur === null || valeur === undefined) return "";
  return String(valeur)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

/** Nom d'en-tête normalisé : minuscules, sans accents, espaces → « _ ». */
function saasAvisNormaliserEntete_(valeur) {
  return saasAvisNormaliser_(valeur).replace(/ /g, "_");
}

/** Vrai si la valeur est un objet Date (cellule de date de la feuille). */
function saasAvisEstDate_(valeur) {
  return Object.prototype.toString.call(valeur) === "[object Date]";
}

/** Texte nettoyé (jamais null). */
function saasAvisTexte_(valeur) {
  if (valeur === null || valeur === undefined) return "";
  if (saasAvisEstDate_(valeur)) return "";
  return String(valeur).trim();
}

/** Construit un instant (ms UTC) à partir d'une date et d'une heure de DOUALA ; null si la date n'existe pas. */
function saasAvisConstruireDouala_(annee, mois, jour, heure, minute, seconde) {
  const y = Number(annee), mo = Number(mois), d = Number(jour);
  const h = Number(heure), mi = Number(minute), s = Number(seconde);
  if (!isFinite(y) || !isFinite(mo) || !isFinite(d) || !isFinite(h) || !isFinite(mi) || !isFinite(s)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h < 0 || h > 23 || mi < 0 || mi > 59 || s < 0 || s > 59) return null;
  const test = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
  if (test.getUTCFullYear() !== y || test.getUTCMonth() !== mo - 1 || test.getUTCDate() !== d) return null;
  return Date.UTC(y, mo - 1, d, h, mi, s) - SAAS_AVIS_DECALAGE_DOUALA_MS;
}

/**
 * Lit une date de la feuille (objet Date ou texte) et renvoie un instant en ms, ou null.
 * Formats acceptés : objet Date ; ISO avec fuseau (Z ou ±hh:mm) ; ISO sans fuseau (heure de
 * Douala) ; AAAA-MM-JJ (fin de journée) ; JJ-MM-AAAA, JJ/MM/AAAA, JJ.MM.AAAA avec ou sans
 * « HH:mm[:ss] ». Toute autre valeur (« N/A (Marché attribué) », vide…) donne null.
 */
function saasAvisParserDate_(valeur) {
  if (valeur === null || valeur === undefined || valeur === "") return null;
  if (saasAvisEstDate_(valeur)) return isNaN(valeur.getTime()) ? null : valeur.getTime();
  if (typeof valeur !== "string") return null;
  const s = valeur.trim().replace(/^['~]+/, "").trim();
  if (!s) return null;

  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/.exec(s);
  if (m) {
    const aDeLHeure = m[4] !== undefined;
    if (m[7]) {
      if (!aDeLHeure) return null;
      const t = Date.parse(s.replace(" ", "T"));
      return isNaN(t) ? null : t;
    }
    return saasAvisConstruireDouala_(m[1], m[2], m[3], aDeLHeure ? m[4] : 23, aDeLHeure ? m[5] : 59, aDeLHeure && m[6] ? m[6] : (aDeLHeure ? 0 : 59));
  }

  m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m) {
    const aDeLHeure = m[4] !== undefined;
    return saasAvisConstruireDouala_(m[3], m[2], m[1], aDeLHeure ? m[4] : 23, aDeLHeure ? m[5] : 59, aDeLHeure && m[6] ? m[6] : (aDeLHeure ? 0 : 59));
  }
  return null;
}

/**
 * Lit la colonne Date_Limite. Renvoie { ms, estimee, texte } :
 *   ms      : instant en ms, ou null si la date n'est pas lisible ;
 *   estimee : true si la collecte signale une ESTIMATION (préfixe « ~ » ou mot « estimée ») ;
 *   texte   : texte d'origine (80 caractères au plus) quand la date est estimée ou illisible,
 *             sinon null. Les valeurs vides donnent { ms: null, estimee: false, texte: null }.
 */
function saasAvisLireDateLimite_(valeur) {
  if (valeur === null || valeur === undefined || valeur === "") return { ms: null, estimee: false, texte: null };
  if (saasAvisEstDate_(valeur)) {
    const t = isNaN(valeur.getTime()) ? null : valeur.getTime();
    return { ms: t, estimee: false, texte: null };
  }
  if (typeof valeur !== "string") return { ms: null, estimee: false, texte: null };

  const brut = valeur.trim();
  if (!brut) return { ms: null, estimee: false, texte: null };
  const texte = brut.length > 80 ? brut.substring(0, 80) + "…" : brut;

  const estimee = /^\s*~/.test(brut) || /estim/i.test(saasAvisNormaliser_(brut));
  // On retire le préfixe ~ / apostrophe et une éventuelle parenthèse finale avant de lire la date
  const nettoye = brut.replace(/^['~\s]+/, "").replace(/\s*\([^)]*\)\s*$/, "").trim();
  const ms = saasAvisParserDate_(nettoye);

  if (ms !== null) return { ms: ms, estimee: estimee, texte: estimee ? texte : null };
  return { ms: null, estimee: false, texte: texte };
}

/** Instant (ms) → texte ISO à l'heure de Douala, par exemple « 2026-10-05T12:00:00+01:00 ». */
function saasAvisVersIso_(ms) {
  if (ms === null || ms === undefined || !isFinite(ms)) return null;
  return Utilities.formatDate(new Date(ms), "Africa/Douala", "yyyy-MM-dd'T'HH:mm:ss") + "+01:00";
}

/** Date AAAA-MM-JJ (jour de Douala) d'un instant. */
function saasAvisJourDouala_(ms) {
  return Utilities.formatDate(new Date(ms), "Africa/Douala", "yyyy-MM-dd");
}

/**
 * Lit un montant en FCFA. Accepte un nombre ou un texte du type « 45 000 000 FCFA »,
 * « 45000000 », « 45.000.000 FCFA ». Toute autre forme (« Non précisé », « N/A », autre
 * devise, texte libre) donne null, de même qu'un montant inférieur à 1 000 FCFA (jugé
 * non fiable). Ne devine jamais.
 */
function saasAvisParserMontant_(valeur) {
  if (valeur === null || valeur === undefined || valeur === "") return null;
  if (typeof valeur === "number") return (isFinite(valeur) && valeur >= 1000) ? Math.round(valeur) : null;
  if (typeof valeur !== "string") return null;
  const s = valeur.trim();
  const m = /^(\d{1,3}(?:[\s\u00A0\u202F.]\d{3})+|\d+)(?:[.,]\d{1,2})?\s*(?:FCFA|F\s?CFA|XAF|FRANCS?\s+CFA)?$/i.exec(s);
  if (!m) return null;
  const n = Number(m[1].replace(/[\s\u00A0\u202F.]/g, ""));
  return (isFinite(n) && n >= 1000) ? n : null;
}

/** NATIONAL, INTERNATIONAL ou null, selon le nom de la source (mots entiers uniquement). */
function saasAvisTypeSource_(source) {
  const s = saasAvisNormaliser_(source);
  if (!s) return null;
  if (/(^|[^a-z])(armp|coleps|dgtcfm|feicom|minmap)([^a-z]|$)/.test(s)) return "NATIONAL";
  if (/(^|[^a-z])(onu|un|undp|pnud|unicef|oms|who|fao|bad|afd|bm|ue|developmentaid|banque africaine|banque mondiale|world bank|union europeenne)([^a-z]|$)/.test(s)) return "INTERNATIONAL";
  return null;
}

/** Garde seulement une adresse http:// ou https://, sinon null. */
function saasAvisLienSur_(valeur) {
  const s = saasAvisTexte_(valeur);
  return /^https?:\/\//i.test(s) ? s : null;
}

/** Valeur de texte « utile » : null pour vide, « N/A » et « Voir Avis / DAO ». */
function saasAvisTexteUtile_(valeur) {
  const s = saasAvisTexte_(valeur);
  if (!s) return null;
  const n = saasAvisNormaliser_(s);
  const vides = ["n/a", "na", "n.a.", "-", "--", "voir avis / dao", "non precise", "non precisee", "non communique", "non communiquee"];
  if (vides.indexOf(n) >= 0) return null;
  return s;
}

/** Position de chaque colonne d'après son en-tête. */
function saasAvisIndexColonnes_(entetes) {
  const noms = {
    id: "id_ao", numero: "numero_avis", dateCollecte: "date_collecte", datePublication: "date_publication",
    source: "source_plateforme", titre: "titre_ao", maitre: "maitre_ouvrage", region: "region",
    procedure: "type_procedure", montant: "montant", dateLimite: "date_limite",
    lienDetail: "lien_fiche_detail", lienDao: "lien_dao", statut: "statut_traitement",
    typePub: "type_publication", attributaire: "attributaire_principal",
    montantAttribue: "montant_attribue", dateAttribution: "date_attribution"
  };
  const index = {};
  const normalises = entetes.map(saasAvisNormaliserEntete_);
  Object.keys(noms).forEach(function (cle) {
    index[cle] = normalises.indexOf(noms[cle]);
  });
  return index;
}

/**
 * Lit TOUS_AO et renvoie { avis: [...], erreur: null } ou { avis: [], erreur: "message" }.
 * Chaque avis porte les champs publics et des clés internes (_ts…) pour le tri et le filtre.
 */
function saasAvisLireTous_() {
  const nomFeuille = (typeof SHEET_AO !== "undefined" && SHEET_AO) ? SHEET_AO : "TOUS_AO";
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nomFeuille);
  if (!feuille) return { avis: [], erreur: "Feuille " + nomFeuille + " absente." };

  const nbLignes = feuille.getLastRow();
  const nbCols = feuille.getLastColumn();
  if (nbLignes < 2 || nbCols < 1) return { avis: [], erreur: null };

  const valeurs = feuille.getRange(1, 1, nbLignes, nbCols).getValues();
  const idx = saasAvisIndexColonnes_(valeurs[0]);

  const manquantes = ["id", "titre", "source", "statut", "dateCollecte"].filter(function (c) { return idx[c] < 0; });
  if (manquantes.length) {
    return { avis: [], erreur: "Colonnes requises absentes de " + nomFeuille + " (en-têtes attendus : ID_AO, Titre_AO, Source_Plateforme, Statut_Traitement, Date_Collecte)." };
  }

  function cell(ligne, cle) { return idx[cle] >= 0 ? ligne[idx[cle]] : ""; }

  const avis = [];
  for (let i = 1; i < valeurs.length; i++) {
    const l = valeurs[i];
    const id = saasAvisTexte_(cell(l, "id"));
    if (!id) continue;

    const source = saasAvisTexte_(cell(l, "source"));
    const tsCollecte = saasAvisParserDate_(cell(l, "dateCollecte"));
    const tsPublication = saasAvisParserDate_(cell(l, "datePublication"));
    const limite = saasAvisLireDateLimite_(cell(l, "dateLimite"));
    const tsLimite = limite.ms;
    const tsAttribution = saasAvisParserDate_(cell(l, "dateAttribution"));
    const montant = saasAvisParserMontant_(cell(l, "montant"));
    let montantTexte = null;
    if (montant === null) {
      const mt = saasAvisTexteUtile_(cell(l, "montant"));
      montantTexte = mt ? (mt.length > 60 ? mt.substring(0, 60) + "…" : mt) : null;
    }
    const montantAttribue = saasAvisParserMontant_(cell(l, "montantAttribue"));

    avis.push({
      idAvis: id,
      numeroAvis: saasAvisTexteUtile_(cell(l, "numero")),
      titre: saasAvisTexte_(cell(l, "titre")),
      autorite: saasAvisTexteUtile_(cell(l, "maitre")),
      region: saasAvisTexteUtile_(cell(l, "region")),
      source: source,
      sourceType: saasAvisTypeSource_(source),
      procedure: saasAvisTexteUtile_(cell(l, "procedure")),
      montant: montant,
      montantTexte: montantTexte,
      dateLimite: saasAvisVersIso_(tsLimite),
      dateLimiteEstimee: limite.estimee,
      dateLimiteTexte: limite.texte,
      datePublication: saasAvisVersIso_(tsPublication),
      dateCollecte: saasAvisVersIso_(tsCollecte),
      statut: saasAvisTexte_(cell(l, "statut")),
      lien: saasAvisLienSur_(cell(l, "lienDetail")),
      lienDao: saasAvisLienSur_(cell(l, "lienDao")),
      typePublication: saasAvisTexteUtile_(cell(l, "typePub")),
      attributaire: saasAvisTexteUtile_(cell(l, "attributaire")),
      montantAttribue: montantAttribue,
      dateAttribution: saasAvisVersIso_(tsAttribution),
      _ligne: i,
      _tsCollecte: tsCollecte,
      _tsPublication: tsPublication,
      _tsLimite: tsLimite,
      _recherche: saasAvisNormaliser_([id, saasAvisTexte_(cell(l, "numero")), cell(l, "titre"), cell(l, "maitre"), cell(l, "region"), source].join(" "))
    });
  }
  return { avis: avis, erreur: null };
}

/** Copie publique d'un avis, sans les clés internes. */
function saasAvisSansInterne_(a) {
  const o = {};
  Object.keys(a).forEach(function (k) { if (k.charAt(0) !== "_") o[k] = a[k]; });
  return o;
}

/** Facettes : [{ valeur, nombre }] triées par effectif décroissant. */
function saasAvisFacette_(avis, champ) {
  const effectifs = {};
  avis.forEach(function (a) {
    const v = a[champ];
    if (v === null || v === undefined || v === "") return;
    effectifs[v] = (effectifs[v] || 0) + 1;
  });
  return Object.keys(effectifs)
    .map(function (v) { return { valeur: v, nombre: effectifs[v] }; })
    .sort(function (x, y) { return y.nombre - x.nombre || String(x.valeur).localeCompare(String(y.valeur)); });
}

// ---------------------------------------------------------------------------
// ROUTE ADMIN : GET /admin/avis
// ---------------------------------------------------------------------------

/**
 * 📄 SaaS_23_AvisCollectes.gs — saasAdminAvisList(payload, user, e)
 * GET /admin/avis?limit=25&offset=0&source=&statut=&typePublication=&dateFrom=&dateTo=&q=&sortBy=&sortOrder=
 *
 * Paramètres (tous facultatifs) :
 *   limit (25 par défaut, 100 au plus), offset ;
 *   source, statut, typePublication : valeur exacte (sans tenir compte des accents ni de la casse) ;
 *   dateFrom, dateTo : AAAA-MM-JJ, bornes incluses, sur la DATE DE COLLECTE (jour de Douala) ;
 *   q : texte cherché dans l'identifiant, le numéro, le titre, l'autorité, la région et la source ;
 *   sortBy : dateCollecte (défaut) | dateLimite | montant ; sortOrder : desc (défaut) | asc.
 * Réponse : { total, limit, offset, count, avis[], facettes: { sources, statuts, typesPublication } }
 * Les facettes portent sur l'ensemble des avis, sans tenir compte des filtres.
 */
function saasAdminAvisList(payload, user, e) {
  if (!user || user.role !== "ADMIN") return saasErreur("Accès administrateur requis.", 403);

  const p = payload || {};
  const lecture = saasAvisLireTous_();
  if (lecture.erreur) return saasErreur(lecture.erreur, 500);
  const tous = lecture.avis;

  const limit = Math.min(SAAS_AVIS_LIMITE_MAX, Math.max(1, parseInt(p.limit, 10) || SAAS_AVIS_LIMITE_PAR_DEFAUT));
  const offset = Math.max(0, parseInt(p.offset, 10) || 0);

  function filtreTexte(valeur) {
    const v = saasAvisNormaliser_(valeur);
    return (v === "" || v === "tous") ? "" : v;
  }
  const fSource = filtreTexte(p.source);
  const fStatut = filtreTexte(p.statut);
  const fType = filtreTexte(p.typePublication);
  const q = saasAvisNormaliser_(p.q);
  const dateFrom = /^\d{4}-\d{2}-\d{2}$/.test(String(p.dateFrom || "")) ? String(p.dateFrom) : "";
  const dateTo = /^\d{4}-\d{2}-\d{2}$/.test(String(p.dateTo || "")) ? String(p.dateTo) : "";
  const sortBy = ["dateCollecte", "dateLimite", "montant"].indexOf(String(p.sortBy)) >= 0 ? String(p.sortBy) : "dateCollecte";
  const sortOrder = String(p.sortOrder).toLowerCase() === "asc" ? "asc" : "desc";

  const filtres = tous.filter(function (a) {
    if (fSource && saasAvisNormaliser_(a.source) !== fSource) return false;
    if (fStatut && saasAvisNormaliser_(a.statut) !== fStatut) return false;
    if (fType && saasAvisNormaliser_(a.typePublication) !== fType) return false;
    if (q && a._recherche.indexOf(q) === -1) return false;
    if (dateFrom || dateTo) {
      if (a._tsCollecte === null) return false;
      const jour = saasAvisJourDouala_(a._tsCollecte);
      if (dateFrom && jour < dateFrom) return false;
      if (dateTo && jour > dateTo) return false;
    }
    return true;
  });

  function valeurTri(a) {
    if (sortBy === "montant") return a.montant;
    if (sortBy === "dateLimite") return a._tsLimite;
    return a._tsCollecte;
  }
  const sens = sortOrder === "asc" ? 1 : -1;
  filtres.sort(function (a, b) {
    const va = valeurTri(a), vb = valeurTri(b);
    const aNul = (va === null || va === undefined), bNul = (vb === null || vb === undefined);
    if (aNul && bNul) return (b._ligne - a._ligne);
    if (aNul) return 1;   // les valeurs absentes passent toujours en dernier
    if (bNul) return -1;
    if (va !== vb) return (va - vb) * sens;
    return (b._ligne - a._ligne);
  });

  const page = filtres.slice(offset, offset + limit).map(saasAvisSansInterne_);

  return saasReponse(true, {
    total: filtres.length,
    limit: limit,
    offset: offset,
    count: page.length,
    avis: page,
    facettes: {
      sources: saasAvisFacette_(tous, "source"),
      statuts: saasAvisFacette_(tous, "statut"),
      typesPublication: saasAvisFacette_(tous, "typePublication")
    }
  }, "Avis collectés récupérés.", 200);
}

// ---------------------------------------------------------------------------
// ROUTE PUBLIQUE : GET /public/radar-ticker
// ---------------------------------------------------------------------------

/**
 * 📄 SaaS_23_AvisCollectes.gs — saasPublicRadarTicker(payload, e, options)
 * GET /public/radar-ticker — SANS authentification, lecture seule.
 *
 * Renvoie au plus SAAS_AVIS_RADAR_MAX avis OUVERTS et RÉCENTS, nationaux et internationaux
 * mélangés (jusqu'à SAAS_AVIS_RADAR_MAX_INTERNATIONAL internationaux, le reste en nationaux),
 * triés du plus récemment publié au plus ancien. Un avis est retenu si : c'est un appel
 * d'offres (pas une attribution), son statut n'est ni expiré, ni doublon, ni rejeté, ni
 * archivé, et sa date limite est lisible, FERME (jamais une date estimée) et à venir. Le
 * montant est facultatif : sans montant, montantEstime vaut null (le radar affiche alors un point
 * creux) ; montantTexte porte le texte d'origine quand il existe (par exemple « 85 963 496 USD »).
 * Champs publics seulement ; AUCUN score ; aucun lien ni identifiant de client. Cache de 5 minutes.
 * @param {Object} options { sansCache: true } pour les tests.
 */
function saasPublicRadarTicker(payload, e, options) {
  const opts = options || {};
  const cache = CacheService.getScriptCache();

  if (!opts.sansCache) {
    const enCache = cache.get(SAAS_AVIS_RADAR_CACHE_CLE);
    if (enCache) {
      try { return saasReponse(true, JSON.parse(enCache), "Radar public (cache).", 200); } catch (err) { /* cache illisible : on recalcule */ }
    }
  }

  const lecture = saasAvisLireTous_();
  if (lecture.erreur) {
    Logger.log("[SAAS radar public] " + lecture.erreur);
    return saasErreur("Radar public momentanément indisponible.", 503);
  }

  const maintenant = Date.now();
  const candidats = lecture.avis.filter(function (a) {
    if (a.typePublication && saasAvisNormaliser_(a.typePublication) !== "appel_offres") return false;
    if (SAAS_AVIS_STATUTS_NON_OUVERTS.indexOf(saasAvisNormaliser_(a.statut)) >= 0) return false;
    if (a._tsLimite === null || a._tsLimite <= maintenant) return false;
    if (a.dateLimiteEstimee) return false;   // jamais d'échéance estimée sur la page publique
    return true;
  });

  function plusRecentD_abord(a, b) {
    const pa = a._tsPublication === null ? -Infinity : a._tsPublication;
    const pb = b._tsPublication === null ? -Infinity : b._tsPublication;
    if (pa !== pb) return pb - pa;
    const ca = a._tsCollecte === null ? -Infinity : a._tsCollecte;
    const cb = b._tsCollecte === null ? -Infinity : b._tsCollecte;
    if (ca !== cb) return cb - ca;
    return b._ligne - a._ligne;
  }

  const internationaux = candidats.filter(function (a) { return a.sourceType === "INTERNATIONAL"; }).sort(plusRecentD_abord);
  const nationaux = candidats.filter(function (a) { return a.sourceType !== "INTERNATIONAL"; }).sort(plusRecentD_abord);

  const nbInter = Math.min(SAAS_AVIS_RADAR_MAX_INTERNATIONAL, internationaux.length);
  const choisis = internationaux.slice(0, nbInter).concat(nationaux.slice(0, SAAS_AVIS_RADAR_MAX - nbInter));
  if (choisis.length < SAAS_AVIS_RADAR_MAX && internationaux.length > nbInter) {
    // Pas assez de nationaux : on complète avec d'autres internationaux
    choisis.push.apply(choisis, internationaux.slice(nbInter, nbInter + (SAAS_AVIS_RADAR_MAX - choisis.length)));
  }
  choisis.sort(plusRecentD_abord);

  const blips = choisis.map(function (a) {
    return {
      idAO: a.idAvis,
      titreAO: a.titre,
      maitreOuvrage: a.autorite || "",
      region: a.region || "",
      montantEstime: a.montant,
      montantTexte: a.montantTexte,
      dateLimite: a.dateLimite,
      typeProcedure: a.procedure || "",
      sourceType: a.sourceType || "NATIONAL",
      sourceNom: a.source,
      datePublication: a.datePublication
    };
  });

  // Chiffres réels uniquement
  let derniereCollecte = null;
  let collectes7j = 0;
  lecture.avis.forEach(function (a) {
    if (a._tsCollecte === null) return;
    if (derniereCollecte === null || a._tsCollecte > derniereCollecte) derniereCollecte = a._tsCollecte;
    if (maintenant - a._tsCollecte <= 7 * 86400000) collectes7j++;
  });

  const donnees = {
    blips: blips,
    derniereSynchro: saasAvisVersIso_(derniereCollecte),
    statutSynchro: null,
    totalAvisAnalysesPeriode: collectes7j,
    sourcesOverview: null
  };

  try { cache.put(SAAS_AVIS_RADAR_CACHE_CLE, JSON.stringify(donnees), SAAS_AVIS_RADAR_CACHE_SEC); } catch (err) { /* cache plein ou indisponible : sans conséquence */ }

  return saasReponse(true, donnees, "Radar public.", 200);
}

// ---------------------------------------------------------------------------
// TEST (LECTURE SEULE) — à lancer depuis l'éditeur
// ---------------------------------------------------------------------------

/**
 * TEST DU LOT AV1 — vérifie la lecture de TOUS_AO, la route admin (filtres, tri, pagination,
 * facettes), la route publique (sans cache) et le contrôle d'accès du routeur.
 * N'écrit RIEN dans le classeur.
 */
function saasTesterAvisAV1() {
  Logger.log("=================================================");
  Logger.log("=== TEST LOT AV1 : AVIS COLLECTÉS ===");
  Logger.log("=================================================");

  const lecture = saasAvisLireTous_();
  if (lecture.erreur) { Logger.log("❌ " + lecture.erreur); return; }
  const tous = lecture.avis;

  function compter(champ) {
    const c = {};
    tous.forEach(function (a) { const k = a[champ] === null ? "(vide)" : a[champ]; c[k] = (c[k] || 0) + 1; });
    return JSON.stringify(c);
  }

  Logger.log("--- 1. Lecture de la feuille ---");
  Logger.log("Avis lus : " + tous.length);
  Logger.log("Par type de publication : " + compter("typePublication"));
  Logger.log("Par statut : " + compter("statut"));
  Logger.log("Par type de source : " + compter("sourceType"));
  Logger.log("Montant lisible : " + tous.filter(function (a) { return a.montant !== null; }).length + " / " + tous.length);
  Logger.log("Montant non lisible mais avec texte (ex. devise étrangère) : " + tous.filter(function (a) { return a.montant === null && a.montantTexte !== null; }).length);
  Logger.log("Date limite lisible : " + tous.filter(function (a) { return a.dateLimite !== null; }).length + " / " + tous.length + " (dont estimées : " + tous.filter(function (a) { return a.dateLimiteEstimee; }).length + ")");
  Logger.log("Date limite illisible avec texte d'origine : " + tous.filter(function (a) { return a.dateLimite === null && a.dateLimiteTexte !== null; }).length);
  Logger.log("Date de collecte lisible : " + tous.filter(function (a) { return a.dateCollecte !== null; }).length + " / " + tous.length);

  const faux = { idUser: "TEST", email: "test-lot-av1@local", role: "ADMIN" };

  Logger.log("--- 2. GET /admin/avis (3 premiers, tri par défaut) ---");
  const r1 = JSON.parse(saasAdminAvisList({ limit: "3" }, faux, null).getContent());
  Logger.log("succes=" + r1.succes + " total=" + (r1.donnees && r1.donnees.total) + " count=" + (r1.donnees && r1.donnees.count));
  if (r1.donnees && r1.donnees.avis[0]) Logger.log("Premier avis : " + JSON.stringify(r1.donnees.avis[0]));
  if (r1.donnees) Logger.log("Facettes : " + JSON.stringify(r1.donnees.facettes));

  Logger.log("--- 3. Filtres, recherche, tri ---");
  const r2 = JSON.parse(saasAdminAvisList({ statut: "traite", source: "coleps", limit: "2" }, faux, null).getContent());
  Logger.log("statut=traite + source=coleps → total=" + r2.donnees.total + " (accents et casse ignorés)");
  const r3 = JSON.parse(saasAdminAvisList({ q: "route", limit: "2" }, faux, null).getContent());
  Logger.log("recherche « route » → total=" + r3.donnees.total);
  const r4 = JSON.parse(saasAdminAvisList({ sortBy: "montant", sortOrder: "desc", limit: "2" }, faux, null).getContent());
  Logger.log("tri par montant décroissant → montants : " + r4.donnees.avis.map(function (a) { return a.montant; }).join(" ; "));
  const r5 = JSON.parse(saasAdminAvisList({ typePublication: "Attribution", limit: "1" }, faux, null).getContent());
  Logger.log("type de publication = Attribution → total=" + r5.donnees.total);
  const r6 = JSON.parse(saasAdminAvisList({ dateFrom: "2026-09-30", dateTo: "2026-10-01", limit: "1" }, faux, null).getContent());
  Logger.log("collectés entre le 30/09 et le 01/10/2026 → total=" + r6.donnees.total);

  Logger.log("--- 4. GET /public/radar-ticker (sans cache) ---");
  const rp = JSON.parse(saasPublicRadarTicker({}, null, { sansCache: true }).getContent());
  Logger.log("succes=" + rp.succes + " avis sur le radar : " + (rp.donnees && rp.donnees.blips.length));
  if (rp.donnees && rp.donnees.blips.length) {
    Logger.log("Premier avis public : " + JSON.stringify(rp.donnees.blips[0]));
    Logger.log("Répartition : " + rp.donnees.blips.filter(function (b) { return b.sourceType === "INTERNATIONAL"; }).length + " international(aux) / " + rp.donnees.blips.filter(function (b) { return b.sourceType !== "INTERNATIONAL"; }).length + " national(aux)");
    Logger.log("Avec montant : " + rp.donnees.blips.filter(function (b) { return b.montantEstime !== null; }).length + " / sans montant : " + rp.donnees.blips.filter(function (b) { return b.montantEstime === null; }).length);
    Logger.log("Une date estimée est-elle présente ? " + (rp.donnees.blips.some(function (b) { return /~|estim/i.test(String(b.dateLimite)); }) ? "OUI (anormal)" : "non (attendu)"));
    Logger.log("Un score est-il présent ? " + (JSON.stringify(rp.donnees).indexOf("score") >= 0 ? "OUI (anormal)" : "non (attendu)"));
  }

  Logger.log("--- 5. Contrôle d'accès par le routeur ---");
  const pub = JSON.parse(saasRouter("GET", "/public/radar-ticker", {}, { parameter: {} }).getContent());
  Logger.log("/public/radar-ticker sans connexion → succes=" + pub.succes + " (attendu : true)");
  const adm = JSON.parse(saasRouter("GET", "/admin/avis", {}, { parameter: {} }).getContent());
  Logger.log("/admin/avis sans connexion → succes=" + adm.succes + " code=" + adm.code + " (attendu : false, 401)");

  Logger.log("");
  Logger.log("Vérifiez ci-dessus :");
  Logger.log("1) « Avis lus » vaut le nombre de lignes de TOUS_AO (403 le 01/10/2026) ; les statuts sont TRAITÉ / EXPIRÉ / DOUBLON.");
  Logger.log("2) Les dates estimées (~…) sont comptées à part ; les dates « Non précisée… » gardent leur texte d'origine.");
  Logger.log("3) Le radar public ne contient que des appels d'offres ouverts à échéance ferme, aucun score, avec un mélange national / international ; les avis sans montant ont montantEstime = null.");
  Logger.log("4) /public/radar-ticker répond sans connexion ; /admin/avis répond 401.");
  Logger.log("=================================================");
}