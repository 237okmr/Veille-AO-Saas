// >>> FICHIER : IA_ProfilGen.gs <<< (à coller dans l'onglet du même nom)
/**
 * ============================================================================
 * MODULE DE GÉNÉRATION AUTOMATIQUE DES PROFILS CLIENTS (V5.2 — LOT S1b)
 * ============================================================================
 * V5.2 (LOT S1b) : les textes générés par l'IA et les profils compacts écrits dans PROFILS_ENRICHIS
 * passent par secNeutraliserLigne / secNeutraliserFormule (SecuriteDonnees.gs, dont ce script
 * dépend) : un texte qui commence par = + - @ n'est plus interprété comme une formule.
 *
 * CORRECTIF V5.1
 * ---------------------------------------------------------------------------
 *   • Lecture de la clé Gemini corrigée : iagLireClesGemini(params) découpe
 *     proprement la liste multi-clés (séparée par virgules) et on prend la
 *     première clé. Corrige le bug 401 introduit par le passage à 2 clés.
 *
 * RAPPEL V5.0
 * ---------------------------------------------------------------------------
 *   • Génération du PROFIL_COMPACT (résumé structuré de 800-1200 car.)
 *   • Détection par hash pour éviter les régénérations inutiles
 *   • Colonnes PROFILS_ENRICHIS étendues : H=Profil_Compact, I=Version_Prompt_Compact
 * ============================================================================
 */

const PROFILE_SHEET = "PROFILS_ENRICHIS";
const PROFILE_MODEL = "gemini-3.5-flash-lite";
const PROFILE_URL_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
const PROFILE_MAX_TOKENS = 8192;
const PROFILE_TEMPERATURE = 0.2;

const PROFILE_CRAWL_MAX_PAGES = 15;
const PROFILE_CRAWL_MAX_DEPTH = 2;
const PROFILE_CRAWL_DELAY_MS = 300;
const PROFILE_CRAWL_PAGE_MAX_CHARS = 3000;
const PROFILE_CRAWL_TOTAL_MAX_CHARS = 20000;
const PROFILE_CRAWL_MIN_PAGE_CHARS = 150;

const PROFILE_MAX_INCLUSIONS_FINAL = 180;
const PROFILE_MAX_EXCLUSIONS_FINAL = 50;
const PROFILE_MAX_MO_FINAL = 40;
const PROFILE_SEUIL_DEDUP = 0.85;
const PROFILE_SEUIL_COUVERTURE_VALIDE = 0.90;

const PROFILE_COMPACT_MODEL = "gemini-3.5-flash-lite";
const PROFILE_COMPACT_MAX_TOKENS = 1024;
const PROFILE_COMPACT_TEMPERATURE = 0.1;
const PROFILE_COMPACT_TAILLE_MAX = 1200;
const PROFILE_COMPACT_TAILLE_MIN = 400;

// ---------------------------------------------------------------------------
// LISTE NOIRE PROCÉDURALE
// ---------------------------------------------------------------------------

const PROFILE_LISTE_NOIRE_INCLUSIONS = [
  "avis d'appel d'offres", "appel d'offres", "appels d'offres",
  "appel d'offres national", "appel d'offres international",
  "appel d'offres ouvert", "appel d'offres restreint",
  "appel a manifestation d'interet", "appel à manifestation d'intérêt",
  "ami", "aami", "asmi",
  "consultation restreinte", "demande de propositions", "demande de cotation",
  "dossier d'appel d'offres", "dossier de consultation", "dossiers de consultation",
  "dossier technique et financier", "dao", "dc", "dco", "rfq",
  "offre technique", "offre financiere", "offre financière",
  "commission de passation", "commission de passation des marches",
  "marche public", "marché public", "marche prive", "marché privé",
  "concours d'architecture", "concours",
  "prestations intellectuelles", "prestation intellectuelle",
  "missions de controle", "missions de contrôle",
  "execution des travaux", "exécution des travaux",
  "reception de chantier", "réception de chantier",
  "ordre de service", "dgd", "decompte general et definitif",
  "décompte général et définitif", "attachement",
  "proces-verbal", "procès-verbal", "pv de reception", "pv de réception",
  "levee de reserves", "levée de réserves",
  "garantie decennale", "garantie décennale", "assurance dommage-ouvrage",
  "maitre de l'ouvrage", "maître de l'ouvrage",
  "maitre d'ouvrage delegue", "maître d'ouvrage délégué",
  "maitre d'oeuvre associe", "maître d'œuvre associé",
  "contrat de maitrise d'oeuvre", "contrat de maîtrise d'œuvre",
  "convention", "protocole d'accord", "regie", "régie",
  "groupement d'entreprises", "co-traitance", "cotraitance",
  "sous-traitance", "soustraitance",
  "architecte coordonnateur", "chef de projet", "conducteur de travaux",
  "projeteur", "dessinateur", "ingenieur structure", "ingénieur structure",
  "ingenieur fluides", "ingénieur fluides",
  "economiste de la construction", "économiste de la construction",
  "metreur", "métreur", "mandataire", "architecte",
  "ingenieur conseil", "ingénieur conseil"
];

// ---------------------------------------------------------------------------
// UTILITAIRES
// ---------------------------------------------------------------------------

/**
 * V5.1 — Récupère la PREMIÈRE clé Gemini depuis PARAMETRES!H1, en utilisant
 * le parseur multi-clés de IA_Gemini.gs si disponible.
 */
function iagPremiereCleGemini(params) {
  if (!params) return "";
  // Si le parseur multi-clés est disponible, l'utiliser
  if (typeof iagLireClesGemini === "function") {
    try {
      const cles = iagLireClesGemini(params);
      if (cles && cles.length > 0) return cles[0];
    } catch (e) {
      Logger.log("[V5.1] iagLireClesGemini a échoué : " + e.message);
    }
  }
  // Fallback : découpage manuel (au cas où IA_Gemini.gs serait absent)
  const brut = params.getRange("H1").getValue().toString().trim();
  if (!brut) return "";
  const parties = brut.split(/[,\n;]/).map(function (c) { return c.trim(); }).filter(function (c) { return c; });
  return parties.length > 0 ? parties[0] : "";
}

function iagNormaliserPourComparaison(texte) {
  if (!texte) return "";
  return String(texte)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9À-ÿ '-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function iagEstDansListeNoire(expression) {
  const norm = iagNormaliserPourComparaison(expression);
  if (!norm) return true;
  for (let i = 0; i < PROFILE_LISTE_NOIRE_INCLUSIONS.length; i++) {
    const cible = iagNormaliserPourComparaison(PROFILE_LISTE_NOIRE_INCLUSIONS[i]);
    if (norm === cible) return true;
  }
  return false;
}

function iagSignatureTokens(expression) {
  const norm = iagNormaliserPourComparaison(expression);
  const tokens = norm.split(" ").filter(function (t) { return t.length > 2; });
  return Array.from(new Set(tokens)).sort();
}

function iagJaccard(a, b) {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a), setB = new Set(b);
  let inter = 0;
  setA.forEach(function (t) { if (setB.has(t)) inter++; });
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

function iagHacherPrompt(texte) {
  if (!texte) return "";
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.MD5, String(texte), Utilities.Charset.UTF_8
  );
  return Utilities.base64Encode(digest);
}

// ---------------------------------------------------------------------------
// LECTURE DES CLIENTS
// ---------------------------------------------------------------------------

function iagLireClient(idClient, ss) {
  const feuille = ss.getSheetByName("CLIENTS");
  if (!feuille) return null;
  const data = feuille.getDataRange().getValues();
  if (data.length <= 1) return null;
  const h = data[0].map(function (v) { return v.toString().trim().toUpperCase(); });
  const idxId = h.indexOf("ID_CLIENT");
  const idxNom = h.indexOf("NOM_ENTREPRISE");
  const idxActif = h.indexOf("ACTIF");
  const idxPrompt = h.indexOf("PROMPT_METIER_IA");
  const idxSite = h.indexOf("SITE_WEB");
  const idxCas = h.indexOf("CAS_USAGE_REFERENCE");

  for (let i = 1; i < data.length; i++) {
    if ((data[i][idxId] || "").toString().trim() === idClient) {
      return {
        ligne: i + 1,
        id: idClient,
        nom: (data[i][idxNom] || "").toString().trim(),
        actif: (data[i][idxActif] || "").toString().trim().toUpperCase(),
        promptMetier: (idxPrompt !== -1 && data[i][idxPrompt])
          ? data[i][idxPrompt].toString().trim() : "",
        siteWeb: (idxSite !== -1 && data[i][idxSite])
          ? data[i][idxSite].toString().trim() : "",
        casUsage: (idxCas !== -1 && data[i][idxCas])
          ? data[i][idxCas].toString().split(/[\n;]/).map(function (c) { return c.trim(); }).filter(function (c) { return c; })
          : []
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// CRAWL
// ---------------------------------------------------------------------------

function iagExplorerSite(urlRacine) {
  const resultat = { ok: false, texte: "", raison: "", pages: [], hostname: "" };
  if (!urlRacine) { resultat.raison = "URL vide"; return resultat; }
  let url = String(urlRacine).trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  const hostname = iagExtraireHostname(url);
  if (!hostname) { resultat.raison = "Hostname illisible"; return resultat; }
  resultat.hostname = hostname;
  Logger.log("[CRAWL] Démarrage sur " + url);

  const dejaVus = {};
  const pagesLues = [];
  const queue = [];
  queue.push({ url: url, depth: 0, priorite: 0 });
  dejaVus[iagNormaliserUrl(url)] = true;

  let fetchs = 0, echecs = 0;

  while (queue.length > 0 && pagesLues.length < PROFILE_CRAWL_MAX_PAGES) {
    queue.sort(function (a, b) {
      if (a.priorite !== b.priorite) return a.priorite - b.priorite;
      return a.depth - b.depth;
    });
    const item = queue.shift();
    const urlCourante = item.url;
    const profondeur = item.depth;
    fetchs++;

    let html = null, codeHttp = 0;
    try {
      const res = UrlFetchApp.fetch(urlCourante, {
        method: "get", muteHttpExceptions: true, followRedirects: true,
        validateHttpsCertificates: true,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8"
        }
      });
      codeHttp = res.getResponseCode();
      if (codeHttp < 400) html = res.getContentText();
    } catch (e) { echecs++; }

    if (html) {
      const page = iagNettoyerHtmlPourProfil(html);
      if (page.texte && page.texte.length >= PROFILE_CRAWL_MIN_PAGE_CHARS) {
        pagesLues.push({ url: urlCourante, texte: page.texte, taille: page.texte.length });
        Logger.log("[CRAWL] ✓ " + urlCourante + " (" + page.texte.length + " car.)");
      } else {
        Logger.log("[CRAWL] · " + urlCourante + " (insuffisant)");
      }
      if (profondeur < PROFILE_CRAWL_MAX_DEPTH) {
        const liens = iagExtraireLiensInternes(html, urlCourante, hostname);
        liens.forEach(function (lien) {
          const norm = iagNormaliserUrl(lien);
          if (dejaVus[norm]) return;
          dejaVus[norm] = true;
          queue.push({ url: lien, depth: profondeur + 1, priorite: iagScorePrioriteUrl(lien) });
        });
      }
    } else {
      echecs++;
      Logger.log("[CRAWL] ✗ " + urlCourante + " (HTTP " + codeHttp + ")");
    }
    Utilities.sleep(PROFILE_CRAWL_DELAY_MS);
  }

  if (pagesLues.length === 0) {
    resultat.raison = "Aucune page exploitable (fetchs:" + fetchs + ", échecs:" + echecs + ")";
    return resultat;
  }
  resultat.ok = true;
  resultat.texte = iagConsoliderPages(pagesLues);
  resultat.pages = pagesLues;
  resultat.raison = pagesLues.length + " page(s) sur " + fetchs + " fetch(s)";
  return resultat;
}

function iagNettoyerHtmlPourProfil(html) {
  if (!html) return { titre: "", texte: "" };
  let t = String(html);
  t = t.replace(/<!--[\s\S]*?-->/g, " ");
  t = t.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ");
  t = t.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ");
  t = t.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, " ");
  t = t.replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, " ");
  t = t.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, " ");
  t = t.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, " ");
  t = t.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, " ");
  t = t.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, " ");

  const mTitle = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(t);
  const titre = mTitle ? iagDecoderEntites(mTitle[1]).replace(/\s+/g, " ").trim() : "";
  const mDesc = /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i.exec(t);
  const description = mDesc ? iagDecoderEntites(mDesc[1]).replace(/\s+/g, " ").trim() : "";

  t = t.replace(/<[^>]+>/g, " ");
  t = iagDecoderEntites(t);
  t = t.replace(/\s+/g, " ").trim();

  let texte = "";
  if (titre) texte += "TITRE : " + titre + "\n";
  if (description) texte += "DESCRIPTION : " + description + "\n";
  texte += "CONTENU : " + t;

  if (texte.length > PROFILE_CRAWL_PAGE_MAX_CHARS) {
    texte = texte.substring(0, PROFILE_CRAWL_PAGE_MAX_CHARS) + "...";
  }
  return { titre: titre, texte: texte };
}

function iagDecoderEntites(texte) {
  if (!texte) return "";
  return String(texte)
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(parseInt(n, 10)); })
    .replace(/&#x([0-9a-f]+);/gi, function (m, h) { return String.fromCharCode(parseInt(h, 16)); });
}

function iagExtraireLiensInternes(html, urlBase, hostname) {
  if (!html || !urlBase) return [];
  const liens = [];
  const regex = /<a\s[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let m;
  const vus = {};
  while ((m = regex.exec(html)) !== null) {
    let href = m[1].trim();
    if (!href) continue;
    if (/^(mailto:|tel:|javascript:|#|data:)/i.test(href)) continue;
    let abs;
    if (/^https?:\/\//i.test(href)) abs = href;
    else if (href.indexOf("//") === 0) abs = "https:" + href;
    else if (href.indexOf("/") === 0) abs = "https://" + hostname + href;
    else {
      const base = urlBase.replace(/[?#].*$/, "").replace(/\/$/, "");
      const dir = base.substring(0, base.lastIndexOf("/"));
      abs = dir + "/" + href;
    }
    abs = abs.replace(/#.*$/, "").replace(/\?.*$/, "").replace(/\/$/, "");
    if (!abs) continue;
    if (/\.(pdf|jpg|jpeg|png|gif|svg|webp|ico|css|js|xml|zip|rar|docx?|xlsx?|pptx?|mp4|mp3|avi|woff2?|ttf|eot)(\?|$)/i.test(abs)) continue;
    const hostAbs = iagExtraireHostname(abs);
    if (!hostAbs) continue;
    if (!iagMemeDomaine(hostAbs, hostname)) continue;
    const norm = iagNormaliserUrl(abs);
    if (vus[norm]) continue;
    vus[norm] = true;
    liens.push(abs);
  }
  return liens;
}

function iagExtraireHostname(url) {
  const m = /^https?:\/\/([^\/\?#]+)/i.exec(String(url));
  if (!m) return "";
  return m[1].toLowerCase().replace(/:\d+$/, "");
}
function iagMemeDomaine(a, b) {
  const x = a.replace(/^www\./, ""), y = b.replace(/^www\./, "");
  return x === y || x.endsWith("." + y) || y.endsWith("." + x);
}
function iagNormaliserUrl(url) {
  if (!url) return "";
  let u = String(url).trim().toLowerCase();
  u = u.replace(/^https?:\/\//, "").replace(/^www\./, "");
  return u.replace(/\/$/, "").replace(/#.*$/, "").replace(/\?.*$/, "");
}
function iagScorePrioriteUrl(url) {
  const u = url.toLowerCase();
  const mots = ["about", "a-propos", "apropos", "qui-sommes-nous", "presentation",
    "entreprise", "company", "societe", "services", "service", "expertise",
    "expertises", "domaines", "domaine", "activites", "activite", "metiers",
    "metier", "competences", "savoir-faire", "projects", "projets", "realisations",
    "realisation", "references", "portfolio", "clients", "equipe", "team",
    "mission", "vision", "valeurs", "historique"];
  for (let i = 0; i < mots.length; i++) if (u.indexOf(mots[i]) !== -1) return 1;
  return 5;
}
function iagConsoliderPages(pages) {
  const doc = [];
  let total = 0;
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const bloc = "═══ PAGE : " + p.url + " ═══\n" + p.texte + "\n";
    if (total + bloc.length > PROFILE_CRAWL_TOTAL_MAX_CHARS) {
      const reste = PROFILE_CRAWL_TOTAL_MAX_CHARS - total;
      if (reste > 500) doc.push(bloc.substring(0, reste) + "\n[...tronqué]");
      break;
    }
    doc.push(bloc);
    total += bloc.length;
  }
  return doc.join("\n");
}

// ---------------------------------------------------------------------------
// APPEL GEMINI GÉNÉRIQUE
// ---------------------------------------------------------------------------

function iagAppelerGeminiJSON(prompt, apiKey, metriques, label) {
  if (!apiKey || apiKey.length < 20) return null;
  const url = PROFILE_URL_BASE + PROFILE_MODEL + ":generateContent";
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: PROFILE_TEMPERATURE,
      maxOutputTokens: PROFILE_MAX_TOKENS
    }
  };
  try {
    if (typeof iagIncrementerQuota === "function") iagIncrementerQuota("gemini", true);
    if (metriques) metriques.appelsGemini = (metriques.appelsGemini || 0) + 1;
    const res = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: { "x-goog-api-key": apiKey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    const code = res.getResponseCode();
    if (code !== 200) {
      Logger.log("[PROFIL " + label + "] HTTP " + code + " : " + res.getContentText().substring(0, 200));
      return null;
    }
    const json = JSON.parse(res.getContentText());
    const texte = (typeof iagExtraireTexte === "function")
      ? iagExtraireTexte(json)
      : (json.candidates && json.candidates[0] && json.candidates[0].content &&
         json.candidates[0].content.parts && json.candidates[0].content.parts[0].text) || "";
    let parsed;
    try { parsed = JSON.parse(texte); }
    catch (e) {
      const d = texte.indexOf("{"), f = texte.lastIndexOf("}");
      if (d !== -1 && f > d) {
        try { parsed = JSON.parse(texte.substring(d, f + 1)); } catch (e2) { return null; }
      } else { return null; }
    }
    return parsed;
  } catch (e) {
    Logger.log("[PROFIL " + label + "] Exception : " + e.message);
    return null;
  }
}

// ============================================================================
// PASSE A — RAPPEL MAXIMAL
// ============================================================================

function iagPasseA_Rappel(nom, promptMetier, contenuSite, apiKey, metriques) {
  let blocSite = "";
  if (contenuSite && contenuSite.length >= 200) {
    blocSite = "\n\nCONTENU DU SITE WEB OFFICIEL :\n" + contenuSite + "\n=== FIN ===\n";
  }

  const prompt =
    "PASSE A — GÉNÉRATION LARGE POUR RAPPEL MAXIMAL.\n\n" +
    "Entreprise : " + nom + "\n\n" +
    "Profil métier :\n" + promptMetier + blocSite + "\n\n" +
    "MISSION : génère la liste la plus COMPLÈTE possible d'expressions qui " +
    "décrivent les compétences, domaines et activités de cette entreprise. " +
    "L'objectif est le RAPPEL : ne rater AUCUN cas d'usage. Accepte du bruit.\n\n" +
    "RÈGLES :\n" +
    "- Vise 120 à 180 expressions.\n" +
    "- Termes français ET anglais.\n" +
    "- Inclus les sigles métier reconnus (VRD, BET, EIES, PGES, WASH, APS, APD).\n" +
    "- Inclus les variantes singulier/pluriel.\n" +
    "- Inclus les termes techniques récurrents.\n\n" +
    "INTERDICTIONS :\n" +
    "- Noms d'organismes/bailleurs (MINEPDED, PNUD, BAD...).\n" +
    "- Termes procéduraux universels (avis d'appel d'offres, marché public, " +
    "DAO, commission de passation, offre technique, maître de l'ouvrage).\n" +
    "- Rôles et acteurs (architecte coordonnateur, chef de projet, métreur).\n" +
    "- Sigles ambigus de moins de 4 caractères (ami, os, pv, dc).\n" +
    "  Exception : VRD, BET, EIES, PGES, WASH, AEP, SIG, APS, APD.\n" +
    "- Noms de projets spécifiques.\n\n" +
    "Format JSON : { \"inclusions\": [\"...\", \"...\"] }";

  const resultat = iagAppelerGeminiJSON(prompt, apiKey, metriques, "PASSE A");
  if (!resultat || !Array.isArray(resultat.inclusions)) return [];
  return resultat.inclusions.map(function (s) { return String(s).trim(); }).filter(function (s) { return s; });
}

// ============================================================================
// PASSE B — PÔLES D'ACTIVITÉ + RACINES
// ============================================================================

function iagPasseB_Racines(nom, promptMetier, contenuSite, apiKey, metriques) {
  let blocSite = "";
  if (contenuSite && contenuSite.length >= 200) {
    blocSite = "\n\nCONTENU DU SITE WEB (extrait) :\n" + contenuSite.substring(0, 8000) + "\n=== FIN ===\n";
  }

  const prompt =
    "PASSE B — TERMES RACINES + PÔLES D'ACTIVITÉ.\n\n" +
    "Entreprise : " + nom + "\n\n" +
    "Profil métier :\n" + promptMetier + blocSite + "\n\n" +
    "MISSION EN DEUX VOLETS.\n\n" +

    "VOLET 1 — REPRISE EXACTE DES PÔLES D'ACTIVITÉ :\n" +
    "Le profil métier ci-dessus annonce souvent des PÔLES, DOMAINES ou " +
    "SECTEURS d'activité (souvent numérotés, en majuscules, ou introduits " +
    "par 'L'entreprise intervient dans' / 'Nos domaines' / 'Nos expertises').\n" +
    "Pour chaque pôle annoncé, tu DOIS générer :\n" +
    "  • l'expression EXACTE telle qu'annoncée dans le profil métier\n" +
    "  • ses variantes usuelles (singulier/pluriel)\n" +
    "Exemple : si le profil mentionne 'PROMOTION IMMOBILIÈRE', tu DOIS " +
    "produire 'promotion immobilière', 'promoteur immobilier', " +
    "'développement immobilier'.\n" +
    "Exemple : si le profil mentionne 'FORMATION ET RENFORCEMENT DES " +
    "CAPACITÉS', tu DOIS produire 'renforcement des capacités', 'formation " +
    "professionnelle', 'ingénierie pédagogique'.\n" +
    "Exemple : si le profil mentionne 'EAU ET ASSAINISSEMENT (WASH)', tu " +
    "DOIS produire 'eau et assainissement', 'WASH', 'adduction d'eau potable'.\n\n" +

    "VOLET 2 — TERMES RACINES DE SÉCURITÉ :\n" +
    "Garantis les termes RACINES qui captent les avis simples formulés avec " +
    "UN SEUL mot : \"voirie\", \"route\", \"bâtiment\", \"réhabilitation\", " +
    "\"construction\", \"rénovation\". Sans ces racines, des avis formulés " +
    "de façon brève passent à côté.\n\n" +

    "RÈGLES :\n" +
    "- Les racines d'UN SEUL mot sont AUTORISÉES dans cette passe.\n" +
    "- Vise 30 à 50 expressions au total (pôles + racines).\n" +
    "- Termes français ET anglais.\n\n" +

    "INTERDICTIONS : mêmes qu'en Passe A.\n\n" +

    "Format JSON : { \"inclusions\": [\"...\", \"...\"] }";

  const resultat = iagAppelerGeminiJSON(prompt, apiKey, metriques, "PASSE B");
  if (!resultat || !Array.isArray(resultat.inclusions)) return [];
  return resultat.inclusions.map(function (s) { return String(s).trim(); }).filter(function (s) { return s; });
}

// ============================================================================
// PASSE C — CAS LIMITES + EXCLUSIONS + MO
// ============================================================================

function iagPasseC_CasLimites(nom, promptMetier, contenuSite, casUsageUtilisateur, apiKey, metriques) {
  let blocSite = "";
  if (contenuSite && contenuSite.length >= 200) {
    blocSite = "\n\nCONTENU DU SITE WEB (extrait) :\n" + contenuSite.substring(0, 6000) + "\n";
  }

  let blocCas = "";
  if (casUsageUtilisateur && casUsageUtilisateur.length > 0) {
    blocCas = "\n\nCAS D'USAGE DE RÉFÉRENCE (avis que l'entreprise DOIT capter) :\n" +
      casUsageUtilisateur.map(function (c, i) { return (i + 1) + ". " + c; }).join("\n") +
      "\nPour chacun, identifie les mots-clés qui rendent cet avis pertinent.\n";
  }

  const prompt =
    "PASSE C — CAS LIMITES, EXCLUSIONS ET MO PRIORITAIRES.\n\n" +
    "Entreprise : " + nom + "\n\n" +
    "Profil métier :\n" + promptMetier + blocSite + blocCas + "\n\n" +
    "MISSION : trois volets.\n\n" +

    "VOLET 1 — INCLUSIONS DE RATTRAPAGE (8 à 12 expressions) :\n" +
    "Identifie des avis qui pourraient SEMBLER hors profil mais qui sont " +
    "PERTINENTS. Pour chacun, extrais les mots-clés qui rendent l'avis pertinent.\n" +
    "Exemple pour un cabinet d'architecture :\n" +
    "  • TRAVAUX D'ENTRETIEN DE LA ROUTE → voirie, route\n" +
    "  • CONSTRUCTION DE DALOT → génie civil, ouvrage\n\n" +

    "VOLET 2 — EXCLUSIONS RENFORCÉES (10 à 20 termes) :\n" +
    "Domaines où l'entreprise n'intervient JAMAIS. Concentre-toi sur ceux " +
    "qui pourraient matcher à tort.\n\n" +

    "VOLET 3 — MO PRIORITAIRES (15 à 30 organismes) :\n" +
    "Maîtres d'ouvrage typiquement émetteurs d'avis pertinents. " +
    "Ministères, agences, bailleurs internationaux, entreprises publiques. " +
    "Utilise les sigles officiels (MINEPDED, PNUD, BAD, FEICOM, etc.). " +
    "Inclus les partenaires mentionnés sur le site web.\n\n" +

    "Format JSON : { \"inclusions_rattrapage\": [...], \"exclusions\": [...], " +
    "\"mo_prioritaires\": [...] }";

  const resultat = iagAppelerGeminiJSON(prompt, apiKey, metriques, "PASSE C");
  if (!resultat) return { inclusions: [], exclusions: [], moPrioritaires: [] };
  return {
    inclusions: Array.isArray(resultat.inclusions_rattrapage)
      ? resultat.inclusions_rattrapage.map(function (s) { return String(s).trim(); }).filter(function (s) { return s; })
      : [],
    exclusions: Array.isArray(resultat.exclusions)
      ? resultat.exclusions.map(function (s) { return String(s).trim(); }).filter(function (s) { return s; })
      : [],
    moPrioritaires: Array.isArray(resultat.mo_prioritaires)
      ? resultat.mo_prioritaires.map(function (s) { return String(s).trim(); }).filter(function (s) { return s; })
      : []
  };
}

// ============================================================================
// FUSION DÉTERMINISTE
// ============================================================================

function iagFusionnerInclusions(listes) {
  const brut = [];
  listes.forEach(function (l) {
    if (Array.isArray(l)) l.forEach(function (e) { if (e && e.trim()) brut.push(e.trim()); });
  });

  const etape1 = [];
  let rejetListeNoire = 0, rejetCourt = 0;
  brut.forEach(function (e) {
    if (e.length < 4) { rejetCourt++; return; }
    if (iagEstDansListeNoire(e)) { rejetListeNoire++; return; }
    etape1.push(e);
  });

  const signatures = etape1.map(function (e) { return { texte: e, sig: iagSignatureTokens(e) }; });
  const etape2 = [];
  const dejaVus = [];
  let rejetDup = 0;
  signatures.forEach(function (item) {
    let estDoublon = false;
    for (let i = 0; i < dejaVus.length; i++) {
      if (iagJaccard(item.sig, dejaVus[i]) >= PROFILE_SEUIL_DEDUP) { estDoublon = true; break; }
    }
    if (estDoublon) rejetDup++;
    else { etape2.push(item.texte); dejaVus.push(item.sig); }
  });

  etape2.sort(function (a, b) {
    const aMono = a.indexOf(" ") === -1 ? 0 : 1;
    const bMono = b.indexOf(" ") === -1 ? 0 : 1;
    if (aMono !== bMono) return aMono - bMono;
    return b.length - a.length;
  });

  if (etape2.length > PROFILE_MAX_INCLUSIONS_FINAL) etape2.splice(PROFILE_MAX_INCLUSIONS_FINAL);

  return {
    finales: etape2,
    stats: {
      brut: brut.length,
      apresListeNoire: etape1.length,
      rejetListeNoire: rejetListeNoire,
      rejetCourt: rejetCourt,
      rejetDup: rejetDup
    }
  };
}

function iagFusionnerExclusions(listes) {
  const brut = [];
  listes.forEach(function (l) {
    if (Array.isArray(l)) l.forEach(function (e) { if (e && e.trim()) brut.push(e.trim()); });
  });
  const vus = {};
  const unique = [];
  brut.forEach(function (e) {
    if (e.length < 4) return;
    const n = iagNormaliserPourComparaison(e);
    if (vus[n]) return;
    vus[n] = true;
    unique.push(e);
  });
  if (unique.length > PROFILE_MAX_EXCLUSIONS_FINAL) unique.splice(PROFILE_MAX_EXCLUSIONS_FINAL);
  return unique;
}

function iagFusionnerMO(listes) {
  const brut = [];
  listes.forEach(function (l) {
    if (Array.isArray(l)) l.forEach(function (e) { if (e && e.trim()) brut.push(e.trim()); });
  });
  const vus = {};
  const unique = [];
  brut.forEach(function (e) {
    const n = iagNormaliserPourComparaison(e);
    if (!n) return;
    if (vus[n]) return;
    vus[n] = true;
    unique.push(e);
  });
  if (unique.length > PROFILE_MAX_MO_FINAL) unique.splice(PROFILE_MAX_MO_FINAL);
  return unique;
}

// ============================================================================
// TEST DE COUVERTURE
// ============================================================================

function iagTesterCouverture(inclusions, casAvis) {
  if (!casAvis || casAvis.length === 0) {
    return { score: 0, total: 0, details: [] };
  }
  const details = [];
  let score = 0;

  casAvis.forEach(function (avis) {
    const avisNet = (typeof nettoyerTexte === "function")
      ? nettoyerTexte(avis)
      : avis.toLowerCase();

    const matched = [];
    inclusions.forEach(function (inc) {
      let ok = false;
      if (typeof testerPresenceMot === "function") {
        ok = testerPresenceMot(avisNet, inc);
      } else {
        ok = avisNet.indexOf(inc.toLowerCase()) !== -1;
      }
      if (ok) matched.push(inc);
    });

    if (matched.length > 0) score++;
    details.push({ avis: avis, matched: matched.length > 0, par: matched });
  });

  return { score: score, total: casAvis.length, details: details };
}

// ============================================================================
// GÉNÉRATION DU PROFIL COMPACT
// ============================================================================

function iagGenererProfilCompact(nom, promptMetier, inclusions, exclusions, moPrioritaires, apiKey, metriques) {
  if (!apiKey || apiKey.length < 20) return "";

  const inc = inclusions.slice(0, 80).join(", ");
  const exc = exclusions.slice(0, 20).join(", ");
  const mo = moPrioritaires.slice(0, 30).join(", ");

  const prompt =
    "Tu génères un PROFIL COMPACT pour un moteur de matching automatique " +
    "d'avis d'appels d'offres camerounais.\n\n" +
    "ENTREPRISE : " + nom + "\n\n" +
    "PROFIL MÉTIER COMPLET (à résumer) :\n" + promptMetier + "\n\n" +
    "INCLUSIONS DÉJÀ EXTRAITES : " + inc + "\n\n" +
    "EXCLUSIONS DÉJÀ EXTRAITES : " + exc + "\n\n" +
    "MO PRIORITAIRES DÉJÀ EXTRAITS : " + mo + "\n\n" +

    "MISSION : produis un PROFIL COMPACT de " + PROFILE_COMPACT_TAILLE_MIN +
    " à " + PROFILE_COMPACT_TAILLE_MAX + " caractères MAXIMUM, structuré " +
    "pour être lu rapidement par un LLM qui doit juger la pertinence " +
    "d'avis d'appels d'offres.\n\n" +

    "FORMAT STRICT (respecte les sauts de ligne) :\n" +
    "DOMAINES: expertise1, expertise2, expertise3, expertise4, expertise5\n" +
    "MO_CITÉS: sigle1, sigle2, sigle3, sigle4, sigle5\n" +
    "ZONES: REGION1, REGION2, REGION3\n" +
    "TYPES_MARCHÉS: AONO, DC, AMI\n" +
    "EXCLUSIONS_CRITIQUES: terme1, terme2, terme3\n" +
    "RÉSUMÉ: Une phrase unique (150 car. max) qui capture le cœur de métier.\n\n" +

    "RÈGLES :\n" +
    "- DOMAINES : 5 à 8 expertises principales, séparées par virgules.\n" +
    "- MO_CITÉS : 5 à 10 organismes émetteurs habituels d'avis pertinents.\n" +
    "- ZONES : régions du Cameroun (CENTRE, LITTORAL, etc.) ou TOUTES si national.\n" +
    "- TYPES_MARCHÉS : AONO, DC, AMI, ATTRIBUTION (au moins 2).\n" +
    "- EXCLUSIONS_CRITIQUES : 3 à 6 domaines définitivement hors profil.\n" +
    "- RÉSUMÉ : 1 phrase synthétique.\n\n" +

    "INTERDICTIONS :\n" +
    "- Ne pas dépasser " + PROFILE_COMPACT_TAILLE_MAX + " caractères.\n" +
    "- Ne pas inventer de domaine non mentionné.\n" +
    "- Pas de préambule, pas de conclusion, pas de markdown.\n\n" +

    "Retourne UNIQUEMENT un objet JSON :\n" +
    "{ \"profil_compact\": \"DOMAINES: ...\\nMO_CITÉS: ...\\n...\" }";

  const url = PROFILE_URL_BASE + PROFILE_COMPACT_MODEL + ":generateContent";
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: PROFILE_COMPACT_TEMPERATURE,
      maxOutputTokens: PROFILE_COMPACT_MAX_TOKENS
    }
  };

  try {
    if (typeof iagIncrementerQuota === "function") iagIncrementerQuota("gemini", true);
    if (metriques) metriques.appelsGemini = (metriques.appelsGemini || 0) + 1;

    const res = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: { "x-goog-api-key": apiKey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    const code = res.getResponseCode();
    if (code !== 200) {
      Logger.log("[PROFIL COMPACT] HTTP " + code + " : " + res.getContentText().substring(0, 200));
      return "";
    }
    const json = JSON.parse(res.getContentText());
    const texte = (typeof iagExtraireTexte === "function")
      ? iagExtraireTexte(json)
      : (json.candidates && json.candidates[0] && json.candidates[0].content &&
         json.candidates[0].content.parts && json.candidates[0].content.parts[0].text) || "";

    let parsed;
    try { parsed = JSON.parse(texte); }
    catch (e) {
      const d = texte.indexOf("{"), f = texte.lastIndexOf("}");
      if (d !== -1 && f > d) {
        try { parsed = JSON.parse(texte.substring(d, f + 1)); } catch (e2) { return ""; }
      } else { return ""; }
    }

    const compact = (parsed && parsed.profil_compact) ? String(parsed.profil_compact).trim() : "";
    if (!compact || compact.length < 100) {
      Logger.log("[PROFIL COMPACT] Réponse trop courte (" + compact.length + " car.)");
      return "";
    }
    if (compact.length > PROFILE_COMPACT_TAILLE_MAX * 1.5) {
      Logger.log("[PROFIL COMPACT] Réponse trop longue (" + compact.length +
                 " car.) — tronquée.");
      return compact.substring(0, PROFILE_COMPACT_TAILLE_MAX);
    }
    return compact;
  } catch (e) {
    Logger.log("[PROFIL COMPACT] Exception : " + e.message);
    return "";
  }
}

function iagHacherProfilCompact(nom, promptMetier, inclusions, exclusions, moPrioritaires) {
  const base = [
    nom || "",
    promptMetier || "",
    (inclusions || []).join(","),
    (exclusions || []).join(","),
    (moPrioritaires || []).join(",")
  ].join("||");
  return iagHacherPrompt(base);
}

// ============================================================================
// PIPELINE COMPLET PAR CLIENT
// ============================================================================

function iagGenererProfilClient(idClient) {
  Logger.log("=================================================");
  Logger.log("=== GÉNÉRATION PROFIL ENRICHI V5.1 : " + idClient + " ===");
  Logger.log("=================================================");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const params = ss.getSheetByName(SHEET_PARAMS);
  if (!params) return false;

  // V5.1 : utilisation du parseur multi-clés (prend la 1ère clé)
  const apiKey = iagPremiereCleGemini(params);
  if (!apiKey || apiKey.length < 20) {
    Logger.log("Clé API absente ou invalide (H1).");
    return false;
  }

  const client = iagLireClient(idClient, ss);
  if (!client) { Logger.log("Client introuvable."); return false; }
  if (!client.promptMetier || client.promptMetier.length < 50) {
    Logger.log("Prompt trop court."); return false;
  }

  Logger.log("Client : " + client.nom);
  Logger.log("Prompt : " + client.promptMetier.length + " car.");
  Logger.log("Cas de référence : " + client.casUsage.length);

  let contenuSite = "";
  let siteUtilise = false;
  let nbPagesLues = 0;
  let raisonSite = "Non renseigné";

  if (client.siteWeb) {
    Logger.log("Site : " + client.siteWeb);
    const t0 = new Date().getTime();
    const rc = iagExplorerSite(client.siteWeb);
    const dur = Math.round((new Date().getTime() - t0) / 1000);
    if (rc.ok) {
      contenuSite = rc.texte;
      siteUtilise = true;
      nbPagesLues = rc.pages.length;
      raisonSite = rc.raison + " en " + dur + "s";
      Logger.log("✓ Crawl : " + nbPagesLues + " pages en " + dur + "s.");
    } else {
      raisonSite = rc.raison;
      Logger.log("⚠ Crawl : " + raisonSite);
    }
  }

  const metriques = { appelsGemini: 0 };
  const t0 = new Date().getTime();

  Logger.log("");
  Logger.log("─── PASSE A — Rappel maximal ───");
  const inclusionsA = iagPasseA_Rappel(client.nom, client.promptMetier, contenuSite, apiKey, metriques);
  Logger.log("Passe A : " + inclusionsA.length + " inclusions générées.");

  Logger.log("");
  Logger.log("─── PASSE B — Pôles + Racines ───");
  const inclusionsB = iagPasseB_Racines(client.nom, client.promptMetier, contenuSite, apiKey, metriques);
  Logger.log("Passe B : " + inclusionsB.length + " racines/composés générés.");

  Logger.log("");
  Logger.log("─── PASSE C — Cas limites + Exclusions + MO ───");
  const passeC = iagPasseC_CasLimites(client.nom, client.promptMetier, contenuSite, client.casUsage, apiKey, metriques);
  Logger.log("Passe C : " + passeC.inclusions.length + " rattrapages, " +
             passeC.exclusions.length + " exclusions, " +
             passeC.moPrioritaires.length + " MO.");

  const dureeIA = Math.round((new Date().getTime() - t0) / 1000);

  Logger.log("");
  Logger.log("─── FUSION DÉTERMINISTE ───");
  const fusionInc = iagFusionnerInclusions([inclusionsA, inclusionsB, passeC.inclusions]);
  Logger.log("Inclusions finales : " + fusionInc.finales.length);

  const fusionExc = iagFusionnerExclusions([passeC.exclusions]);
  Logger.log("Exclusions finales : " + fusionExc.length);

  const fusionMo = iagFusionnerMO([passeC.moPrioritaires]);
  Logger.log("MO prioritaires finaux : " + fusionMo.length);

  Logger.log("");
  Logger.log("─── TEST DE COUVERTURE ───");
  let couverture = { score: 0, total: 0, details: [] };
  if (client.casUsage.length > 0) {
    couverture = iagTesterCouverture(fusionInc.finales, client.casUsage);
    Logger.log("Couverture : " + couverture.score + "/" + couverture.total + " cas validés.");
  }

  const couvertureValide = client.casUsage.length === 0
    ? true
    : (couverture.score / couverture.total >= PROFILE_SEUIL_COUVERTURE_VALIDE);

  Logger.log("");
  Logger.log("─── PROFIL COMPACT (V5.1) ───");
  const hashCompact = iagHacherProfilCompact(client.nom, client.promptMetier,
    fusionInc.finales, fusionExc, fusionMo);
  Logger.log("Hash compact : " + hashCompact);

  const profilCompact = iagGenererProfilCompact(
    client.nom, client.promptMetier,
    fusionInc.finales, fusionExc, fusionMo,
    apiKey, metriques
  );
  Logger.log("Profil compact généré : " + profilCompact.length + " caractères.");
  if (profilCompact) {
    Logger.log("Extrait :");
    Logger.log(profilCompact.split("\n").map(function (l) { return "  " + l; }).join("\n"));
  }

  const versionPrompt = iagHacherPrompt(
    client.nom + "||" + client.promptMetier + "||" + (client.siteWeb || "")
  );

  const prefixeSite = siteUtilise
    ? "[Site: " + nbPagesLues + "p] "
    : (client.siteWeb ? "[Site injoignable] " : "[Pas de site] ");
  const prefixeCouv = client.casUsage.length > 0
    ? (couvertureValide ? "[Couv OK " + couverture.score + "/" + couverture.total + "] "
                        : "[À VÉRIFIER " + couverture.score + "/" + couverture.total + "] ")
    : "[Couv: sans réf] ";
  const commentaireFinal = (prefixeSite + prefixeCouv + "Généré en " + dureeIA + "s").substring(0, 250);

  iagEcrireProfilEnrichi(ss, idClient, {
    inclusions: fusionInc.finales.join(", "),
    exclusions: fusionExc.join(", "),
    moPrioritaires: fusionMo.join(", "),
    dateGeneration: Utilities.formatDate(new Date(), "Africa/Douala", "yyyy-MM-dd HH:mm"),
    versionPrompt: versionPrompt,
    commentaire: commentaireFinal,
    profilCompact: profilCompact,
    versionPromptCompact: hashCompact
  });

  Logger.log("");
  Logger.log("─── RÉSULTAT ───");
  Logger.log("Inclusions : " + fusionInc.finales.length);
  Logger.log("Exclusions : " + fusionExc.length);
  Logger.log("MO         : " + fusionMo.length);
  Logger.log("Compact    : " + profilCompact.length + " car.");
  Logger.log("Couverture : " + (client.casUsage.length > 0
    ? couverture.score + "/" + couverture.total + (couvertureValide ? " ✓ VALIDÉ" : " ⚠ À VÉRIFIER")
    : "non testée"));
  Logger.log("Appels Gemini : " + metriques.appelsGemini);
  Logger.log("=================================================");

  return true;
}

// ---------------------------------------------------------------------------
// ÉCRITURE (9 colonnes)
// ---------------------------------------------------------------------------

function iagEcrireProfilEnrichi(ss, idClient, data) {
  let feuille = ss.getSheetByName(PROFILE_SHEET);
  if (!feuille) {
    feuille = ss.insertSheet(PROFILE_SHEET);
    feuille.appendRow([
      "ID_Client", "Mots_Cles_Inclusion", "Mots_Cles_Exclusion",
      "MO_Prioritaires", "Date_Generation", "Version_Prompt", "Commentaire_Gen",
      "Profil_Compact", "Version_Prompt_Compact"
    ]);
    feuille.getRange(1, 1, 1, 9).setFontWeight("bold")
      .setBackground("#0f172a").setFontColor("#ffffff");
    feuille.setFrozenRows(1);
  } else {
    const entete = feuille.getRange(1, 1, 1, 9).getValues()[0];
    if (!entete[7] || String(entete[7]).trim() === "") {
      feuille.getRange(1, 8).setValue("Profil_Compact")
        .setFontWeight("bold").setBackground("#0f172a").setFontColor("#ffffff");
    }
    if (!entete[8] || String(entete[8]).trim() === "") {
      feuille.getRange(1, 9).setValue("Version_Prompt_Compact")
        .setFontWeight("bold").setBackground("#0f172a").setFontColor("#ffffff");
    }
  }

  const valeurs = feuille.getDataRange().getValues();
  let ligneCible = -1;
  for (let i = 1; i < valeurs.length; i++) {
    if ((valeurs[i][0] || "").toString().trim() === idClient) {
      ligneCible = i + 1; break;
    }
  }
  const row = [
    idClient,
    data.inclusions,
    data.exclusions,
    data.moPrioritaires,
    data.dateGeneration,
    data.versionPrompt,
    data.commentaire,
    data.profilCompact || "",
    data.versionPromptCompact || ""
  ];
  const rowSure = secNeutraliserLigne(row);
  if (ligneCible === -1) feuille.appendRow(rowSure);
  else feuille.getRange(ligneCible, 1, 1, rowSure.length).setValues([rowSure]);
}

// ============================================================================
// MIGRATION DES PROFILS COMPACTS
// ============================================================================

function iagInitialiserProfilsCompacts() {
  Logger.log("=================================================");
  Logger.log("=== MIGRATION DES PROFILS COMPACTS V5.1 ===");
  Logger.log("Fichier : " + SpreadsheetApp.getActiveSpreadsheet().getName());
  Logger.log("=================================================");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const params = ss.getSheetByName(SHEET_PARAMS);
  const feuilleClients = ss.getSheetByName("CLIENTS");
  const feuilleProfils = ss.getSheetByName(PROFILE_SHEET);

  if (!params || !feuilleClients || !feuilleProfils) {
    Logger.log("Feuilles requises introuvables.");
    return;
  }

  // V5.1 : utilisation du parseur multi-clés
  const apiKey = iagPremiereCleGemini(params);
  if (!apiKey || apiKey.length < 20) {
    Logger.log("Clé API absente ou invalide (H1).");
    return;
  }

  const dataProfils = feuilleProfils.getDataRange().getValues();
  const mapProfils = {};
  for (let i = 1; i < dataProfils.length; i++) {
    const id = (dataProfils[i][0] || "").toString().trim();
    if (!id) continue;
    mapProfils[id] = {
      ligne: i + 1,
      inclusions: (dataProfils[i][1] || "").toString(),
      exclusions: (dataProfils[i][2] || "").toString(),
      moPrioritaires: (dataProfils[i][3] || "").toString(),
      versionPromptCompact: (dataProfils[i][8] || "").toString().trim()
    };
  }

  const dataClients = feuilleClients.getDataRange().getValues();
  const hC = dataClients[0].map(function (v) { return v.toString().trim().toUpperCase(); });
  const idxIdC = hC.indexOf("ID_CLIENT");
  const idxNomC = hC.indexOf("NOM_ENTREPRISE");
  const idxActifC = hC.indexOf("ACTIF");
  const idxPromptC = hC.indexOf("PROMPT_METIER_IA");

  const clientsActifs = [];
  for (let i = 1; i < dataClients.length; i++) {
    const actif = (dataClients[i][idxActifC] || "").toString().trim().toUpperCase();
    if (actif !== "OUI" && actif !== "TRUE" && actif !== "1" && actif !== "ACTIF") continue;
    clientsActifs.push({
      id: (dataClients[i][idxIdC] || "").toString().trim(),
      nom: (dataClients[i][idxNomC] || "").toString().trim(),
      promptMetier: (idxPromptC !== -1 && dataClients[i][idxPromptC])
        ? dataClients[i][idxPromptC].toString().trim() : ""
    });
  }

  Logger.log("Clients actifs : " + clientsActifs.length);
  Logger.log("");

  const metriques = { appelsGemini: 0 };
  let regeneres = 0, inchanges = 0, ignores = 0;

  clientsActifs.forEach(function (client) {
    Logger.log("─── " + client.nom + " (" + client.id + ") ───");
    const profil = mapProfils[client.id];
    if (!profil) {
      Logger.log("  ⚠ Aucun profil enrichi trouvé. Lancer d'abord iagGenererProfilClient().");
      ignores++;
      return;
    }

    const inclusionsArr = profil.inclusions
      ? profil.inclusions.split(/[,;]/).map(function (s) { return s.trim(); }).filter(function (s) { return s; })
      : [];
    const exclusionsArr = profil.exclusions
      ? profil.exclusions.split(/[,;]/).map(function (s) { return s.trim(); }).filter(function (s) { return s; })
      : [];
    const moArr = profil.moPrioritaires
      ? profil.moPrioritaires.split(/[,;]/).map(function (s) { return s.trim(); }).filter(function (s) { return s; })
      : [];

    if (inclusionsArr.length === 0 && exclusionsArr.length === 0 && moArr.length === 0) {
      Logger.log("  ⚠ Profil enrichi vide. Ignoré.");
      ignores++;
      return;
    }

    const hashAttendu = iagHacherProfilCompact(
      client.nom, client.promptMetier, inclusionsArr, exclusionsArr, moArr
    );

    if (profil.versionPromptCompact === hashAttendu) {
      Logger.log("  ✓ Profil compact à jour (hash identique).");
      inchanges++;
      return;
    }

    Logger.log("  → Régénération nécessaire (hash différent).");
    Logger.log("    Ancien hash : " + (profil.versionPromptCompact || "(vide)"));
    Logger.log("    Nouveau hash: " + hashAttendu);

    const compact = iagGenererProfilCompact(
      client.nom, client.promptMetier,
      inclusionsArr, exclusionsArr, moArr,
      apiKey, metriques
    );

    if (!compact) {
      Logger.log("  ✗ Échec de génération.");
      return;
    }

    Logger.log("  ✓ Profil compact généré : " + compact.length + " caractères.");
    Logger.log("    Extrait : " + compact.substring(0, 150) + "...");

    feuilleProfils.getRange(profil.ligne, 8).setValue(secNeutraliserFormule(compact));
    feuilleProfils.getRange(profil.ligne, 9).setValue(hashAttendu);

    regeneres++;
    Utilities.sleep(500);
  });

  Logger.log("");
  Logger.log("=================================================");
  Logger.log("BILAN DE LA MIGRATION");
  Logger.log("  · Clients traités    : " + clientsActifs.length);
  Logger.log("  · Régénérés          : " + regeneres);
  Logger.log("  · Inchangés          : " + inchanges);
  Logger.log("  · Ignorés            : " + ignores);
  Logger.log("  · Appels Gemini      : " + metriques.appelsGemini);
  Logger.log("=================================================");
}

function iagRegenererProfilCompact(idClient) {
  const cible = idClient || "CLI_001";
  Logger.log("=== RÉGÉNÉRATION FORCÉE DU PROFIL COMPACT : " + cible + " ===");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const params = ss.getSheetByName(SHEET_PARAMS);
  const feuilleProfils = ss.getSheetByName(PROFILE_SHEET);

  if (!params || !feuilleProfils) {
    Logger.log("Feuilles requises introuvables.");
    return;
  }

  const apiKey = iagPremiereCleGemini(params);
  if (!apiKey || apiKey.length < 20) { Logger.log("Clé API absente."); return; }

  const client = iagLireClient(cible, ss);
  if (!client) { Logger.log("Client " + cible + " introuvable."); return; }

  const dataProfils = feuilleProfils.getDataRange().getValues();
  let ligneCible = -1;
  let inclusionsArr = [], exclusionsArr = [], moArr = [];
  for (let i = 1; i < dataProfils.length; i++) {
    if ((dataProfils[i][0] || "").toString().trim() === cible) {
      ligneCible = i + 1;
      inclusionsArr = (dataProfils[i][1] || "").toString().split(/[,;]/).map(function (s) { return s.trim(); }).filter(function (s) { return s; });
      exclusionsArr = (dataProfils[i][2] || "").toString().split(/[,;]/).map(function (s) { return s.trim(); }).filter(function (s) { return s; });
      moArr = (dataProfils[i][3] || "").toString().split(/[,;]/).map(function (s) { return s.trim(); }).filter(function (s) { return s; });
      break;
    }
  }
  if (ligneCible === -1) { Logger.log("Profil enrichi introuvable pour " + cible); return; }

  Logger.log("Client : " + client.nom);
  Logger.log("Inclusions : " + inclusionsArr.length);
  Logger.log("Exclusions : " + exclusionsArr.length);
  Logger.log("MO         : " + moArr.length);

  const metriques = { appelsGemini: 0 };
  const compact = iagGenererProfilCompact(
    client.nom, client.promptMetier,
    inclusionsArr, exclusionsArr, moArr,
    apiKey, metriques
  );

  if (!compact) { Logger.log("✗ Échec."); return; }

  const hash = iagHacherProfilCompact(client.nom, client.promptMetier, inclusionsArr, exclusionsArr, moArr);
  feuilleProfils.getRange(ligneCible, 8).setValue(secNeutraliserFormule(compact));
  feuilleProfils.getRange(ligneCible, 9).setValue(hash);

  Logger.log("");
  Logger.log("✓ Profil compact régénéré : " + compact.length + " caractères.");
  Logger.log("Contenu :");
  Logger.log(compact);
  Logger.log("");
  Logger.log("Appels Gemini : " + metriques.appelsGemini);
}

// ---------------------------------------------------------------------------
// POINTS D'ENTRÉE
// ---------------------------------------------------------------------------

function genererProfilArchiDia() { return iagGenererProfilClient("CLI_001"); }
function genererProfilERE()      { return iagGenererProfilClient("CLI_002"); }

function iagGenererTousProfils() {
  Logger.log("=== GÉNÉRATION EN MASSE V5.1 ===");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName("CLIENTS");
  if (!feuille) return;
  const data = feuille.getDataRange().getValues();
  const h = data[0].map(function (v) { return v.toString().trim().toUpperCase(); });
  const idxId = h.indexOf("ID_CLIENT");
  const idxActif = h.indexOf("ACTIF");
  const clients = [];
  for (let i = 1; i < data.length; i++) {
    const actif = (data[i][idxActif] || "").toString().trim().toUpperCase();
    if (actif !== "OUI" && actif !== "TRUE" && actif !== "1" && actif !== "ACTIF") continue;
    clients.push((data[i][idxId] || "").toString().trim());
  }
  Logger.log("Clients actifs : " + clients.length);
  clients.forEach(function (id) {
    iagGenererProfilClient(id);
    Utilities.sleep(3000);
  });
  Logger.log("=== FIN ===");
}

function iagVerifierFraicheurProfils() {
  Logger.log("=== VÉRIFICATION FRAÎCHEUR ===");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName(PROFILE_SHEET);
  if (!feuille) { Logger.log("Aucun profil."); return; }
  const data = feuille.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < data.length; i++) {
    map[(data[i][0] || "").toString().trim()] = {
      version: (data[i][5] || "").toString().trim(),
      versionCompact: (data[i][8] || "").toString().trim(),
      date: (data[i][4] || "").toString().trim()
    };
  }
  const fc = ss.getSheetByName("CLIENTS");
  const dc = fc.getDataRange().getValues();
  const h = dc[0].map(function (v) { return v.toString().trim().toUpperCase(); });
  const idxId = h.indexOf("ID_CLIENT"), idxNom = h.indexOf("NOM_ENTREPRISE"),
        idxActif = h.indexOf("ACTIF"), idxPrompt = h.indexOf("PROMPT_METIER_IA"),
        idxSite = h.indexOf("SITE_WEB");
  let ok = 0, obs = 0, manq = 0;
  for (let i = 1; i < dc.length; i++) {
    const actif = (dc[i][idxActif] || "").toString().trim().toUpperCase();
    if (actif !== "OUI" && actif !== "TRUE" && actif !== "1" && actif !== "ACTIF") continue;
    const id = (dc[i][idxId] || "").toString().trim();
    const nom = (dc[i][idxNom] || "").toString().trim();
    const prompt = (dc[i][idxPrompt] || "").toString().trim();
    const site = (idxSite !== -1 && dc[i][idxSite]) ? dc[i][idxSite].toString().trim() : "";
    const hash = iagHacherPrompt(nom + "||" + prompt + "||" + site);
    const p = map[id];
    if (!p) { Logger.log("✗ " + id + " : AUCUN"); manq++; }
    else if (p.version !== hash) { Logger.log("⚠ " + id + " : OBSOLÈTE (" + p.date + ")"); obs++; }
    else { Logger.log("✓ " + id + " : à jour (" + p.date + ")"); ok++; }
  }
  Logger.log("---");
  Logger.log("À jour: " + ok + " | Obsolètes: " + obs + " | Manquants: " + manq);
}

function iagTesterCrawlSite() {
  const ID_CLIENT_A_TESTER = "CLI_002";
  Logger.log("=== TEST CRAWL : " + ID_CLIENT_A_TESTER + " ===");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const client = iagLireClient(ID_CLIENT_A_TESTER, ss);
  if (!client || !client.siteWeb) { Logger.log("Client/site introuvable."); return; }
  const t0 = new Date().getTime();
  const r = iagExplorerSite(client.siteWeb);
  const dur = Math.round((new Date().getTime() - t0) / 1000);
  Logger.log("Durée : " + dur + "s | Statut : " + (r.ok ? "SUCCÈS" : "ÉCHEC"));
  Logger.log("Raison : " + r.raison);
  Logger.log("Pages : " + r.pages.length);
}