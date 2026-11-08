// >>> FICHIER : IA_Gemini.gs <<< (à coller dans l'onglet du même nom)
/**
 * ============================================================================
 * MODULE CENTRAL IA — MULTI-FOURNISSEURS (V1.12 — LOT S3)
 * ============================================================================
 * NOUVEAUTÉ V1.12 (LOT S3) : PLAFOND JOURNALIER D'APPELS IA
 * ---------------------------------------------------------------------------
 *   • Au-delà de 300 appels IA par jour (réglable par la propriété du script
 *     IAG_PLAFOND_JOUR, entre 50 et 5000), iagRouterAppel ne contacte plus aucun
 *     fournisseur et renvoie null, comme lorsque l'IA est indisponible : le matching
 *     retombe sur les mots-clés seuls, aucun traitement ne s'arrête. Le compteur repart
 *     à zéro chaque jour (fuseau Africa/Douala). Une alerte e-mail est envoyée à
 *     l'administrateur (au plus une fois toutes les 6 heures).
 *   • Usage normal observé : moins de 30 appels par jour ; le plafond protège contre un
 *     emballement (boucle, appels répétés depuis l'écran client).
 *   • Test sans appel IA ni écriture : iagTesterPlafondQuota().
 *
 * NOUVEAUTÉS V1.11
 * ---------------------------------------------------------------------------
 *   • iagJobB_ScorerPaires retourne désormais un objet structuré :
 *         { resultats, attendu, recu, complet, erreur }
 *     au lieu d'un simple tableau. Permet au caller (MatchingClients V3.3)
 *     de détecter les réponses partielles/tronquées et de déclencher un retry.
 *
 *   • Prompt de scoring enrichi : ajout d'un bloc CONTEXTE qui précise à
 *     l'IA comment pondérer les profils riches vs pauvres, et d'un RAPPEL
 *     D'EXHAUSTIVITÉ qui insiste sur la complétude de la réponse.
 *
 * RAPPEL V1.10
 * ---------------------------------------------------------------------------
 *   • Comptage correct des appels (1 enregistrement par tentative HTTP)
 * ============================================================================
 */

const IAG_MODELES = [
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-flash-latest"
];

const IAG_MODELES_TEXTE = [
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
  "gemini-flash-latest"
];

const IAG_URL_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
const IAG_DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const IAG_DEEPSEEK_MODEL = "deepseek-chat";

const IAG_LOT_ENRICHISSEMENT   = 20;
const IAG_LOT_SCORING_AVIS     = 20;
const IAG_LOT_SCORING_CLIENTS  = 10;

const IAG_PROP_QUOTA = "IAG_QUOTA_JOUR";
const IAG_SEUIL_ALERTE = 400;
const IAG_PROP_PLAFOND = "IAG_PLAFOND_JOUR";   // LOT S3 : plafond dur journalier (propriété du script, facultative)
const IAG_PLAFOND_DEFAUT = 300;
const IAG_PLAFOND_MIN = 50;
const IAG_PLAFOND_MAX = 5000;
const IAG_MAX_TENTATIVES_GEMINI = 4;

// ---------------------------------------------------------------------------
// COMPTEUR DE QUOTA
// ---------------------------------------------------------------------------

function iagLireQuotaJour() {
  const props = PropertiesService.getScriptProperties();
  const aujourdhui = Utilities.formatDate(new Date(), "Africa/Douala", "yyyy-MM-dd");
  const brut = props.getProperty(IAG_PROP_QUOTA) || "";
  const parties = brut.split(":");

  if (parties.length >= 2 && parties[0] === aujourdhui) {
    return {
      date: aujourdhui,
      count: parseInt(parties[1], 10) || 0,
      gemini: parseInt(parties[2], 10) || 0,
      deepseek: parseInt(parties[3], 10) || 0,
      erreurs: parseInt(parties[4], 10) || 0
    };
  }
  return { date: aujourdhui, count: 0, gemini: 0, deepseek: 0, erreurs: 0 };
}

function iagSauverQuotaJour(q) {
  const props = PropertiesService.getScriptProperties();
  const val = q.date + ":" + q.count + ":" + (q.gemini || 0) + ":" +
              (q.deepseek || 0) + ":" + (q.erreurs || 0);
  props.setProperty(IAG_PROP_QUOTA, val);
}

function iagIncrementerQuota(fournisseur, succes) {
  const q = iagLireQuotaJour();
  q.count++;
  if (succes) {
    if (fournisseur === "gemini") q.gemini = (q.gemini || 0) + 1;
    else if (fournisseur === "deepseek") q.deepseek = (q.deepseek || 0) + 1;
  } else {
    q.erreurs = (q.erreurs || 0) + 1;
  }
  iagSauverQuotaJour(q);

  if (q.count === IAG_SEUIL_ALERTE) {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const params = ss.getSheetByName(SHEET_PARAMS);
      if (params) {
        const emailAdmin = params.getRange("H2").getValue().toString().trim();
        if (emailAdmin) {
          MailApp.sendEmail({
            to: emailAdmin,
            subject: "[IA] Seuil d'alerte quota atteint (" + q.count + " appels aujourd'hui)",
            htmlBody: "<p>Le pipeline a consommé <strong>" + q.count +
                      "</strong> appels IA aujourd'hui (Gemini : " + q.gemini +
                      ", DeepSeek : " + q.deepseek + ", erreurs : " + q.erreurs + ").</p>"
          });
        }
      }
    } catch (e) {
      Logger.log("Alerte quota impossible : " + e.message);
    }
  }
  return q.count;
}

function iagQuotaJour() {
  return iagLireQuotaJour().count;
}

// ---------------------------------------------------------------------------
// PLAFOND JOURNALIER (LOT S3)
// ---------------------------------------------------------------------------

/**
 * Interprète la valeur brute de la propriété IAG_PLAFOND_JOUR (calcul pur).
 * Valeur absente, non numérique ou hors de 50 à 5000 : plafond par défaut (300).
 */
function iagInterpreterPlafond(brut) {
  const n = parseInt(brut, 10);
  if (isNaN(n) || n < IAG_PLAFOND_MIN || n > IAG_PLAFOND_MAX) return IAG_PLAFOND_DEFAUT;
  return n;
}

/** Plafond journalier d'appels IA en vigueur. */
function iagLirePlafondJour() {
  try {
    return iagInterpreterPlafond(PropertiesService.getScriptProperties().getProperty(IAG_PROP_PLAFOND));
  } catch (e) {
    return IAG_PLAFOND_DEFAUT;
  }
}

/** Vrai si le nombre d'appels du jour a atteint le plafond (calcul pur). */
function iagPlafondAtteint(nombreAppels, plafond) {
  return Number(nombreAppels) >= Number(plafond);
}

/**
 * Signale le plafond atteint : journal, anomalie dans la session en cours (une seule fois)
 * et e-mail à l'administrateur (au plus une fois toutes les 6 heures).
 */
function iagSignalerPlafondAtteint(nombreAppels, plafond, metriques) {
  Logger.log("[IAG Router] Plafond journalier atteint (" + nombreAppels + "/" + plafond + ") : appel IA refusé.");
  if (metriques && metriques.alertesCritiques && !metriques.plafondIASignale) {
    metriques.plafondIASignale = true;
    metriques.alertesCritiques.push("Plafond journalier d'appels IA atteint (" + nombreAppels + "/" + plafond +
      ") : l'IA est suspendue jusqu'à demain (mots-clés seuls).");
  }
  try {
    const cache = CacheService.getScriptCache();
    const cle = "IAG_PLAFOND_ALERTE";
    if (cache.get(cle) !== null) return;
    cache.put(cle, "1", 21600);
    if (typeof envoyerAlerteCritiqueImmediate === "function") {
      envoyerAlerteCritiqueImmediate("Plafond journalier d'appels IA atteint",
        nombreAppels + " appels aujourd'hui pour un plafond de " + plafond + ". L'IA est suspendue jusqu'à demain ; " +
        "le matching continue avec les mots-clés seuls. Si c'est un usage normal, relever la propriété du script " +
        IAG_PROP_PLAFOND + ".");
    }
  } catch (e) {
    Logger.log("[IAG Router] Alerte de plafond impossible : " + e.message);
  }
}

// ---------------------------------------------------------------------------
// CHARGEMENT DES CLÉS
// ---------------------------------------------------------------------------

// V1.12 (LOT 5) : les clés vivent dans le COFFRE (PropertiesService, propriétés du script).
// La feuille PARAMETRES (H1, H10) ne sert plus que de SECOURS tant qu'elle n'est pas vidée.
const IAG_PROP_CLES_GEMINI = "GEMINI_API_KEYS";       // une ou plusieurs clés séparées par des virgules
const IAG_PROP_CLES_DEEPSEEK = "DEEPSEEK_API_KEYS";   // idem
const IAG_MARQUEUR_CLE_EN_COFFRE = "(cle en coffre)";  // texte laissé dans la feuille après vidage
const IAG_AVERTISSEMENTS_CLES = {};                    // évite de répéter l'avertissement dans une même exécution

function iagChargerCles(chaineBrute) {
  if (!chaineBrute) return [];
  return String(chaineBrute)
    .split(/[,\n;]/)
    .map(function (c) { return c.trim(); })
    .filter(function (c) {
      // ignore les textes trop courts et les marqueurs du type "(cle en coffre)" ou "[...]"
      return c && c.length > 20 && c.charAt(0) !== "(" && c.charAt(0) !== "[";
    });
}

/** Lit les clés d'une propriété du script (coffre). Renvoie [] si absente. */
function iagLireClesDepuisProprietes(nomPropriete) {
  try {
    return iagChargerCles(PropertiesService.getScriptProperties().getProperty(nomPropriete));
  } catch (e) {
    return [];
  }
}

function iagAvertirCleDansFeuille(libelle) {
  if (IAG_AVERTISSEMENTS_CLES[libelle]) return;
  IAG_AVERTISSEMENTS_CLES[libelle] = true;
  Logger.log("[IAG] Clé " + libelle + " lue dans la feuille (secours). Migrer vers le coffre : iagMigrerClesVersProprietes().");
}

function iagLireClesGemini(feuilleParams) {
  const coffre = iagLireClesDepuisProprietes(IAG_PROP_CLES_GEMINI);
  if (coffre.length > 0) return coffre;
  if (!feuilleParams) return [];
  const feuille = iagChargerCles(feuilleParams.getRange("H1").getValue());
  if (feuille.length > 0) iagAvertirCleDansFeuille("Gemini (H1)");
  return feuille;
}

function iagLireClesDeepSeek(feuilleParams) {
  const coffre = iagLireClesDepuisProprietes(IAG_PROP_CLES_DEEPSEEK);
  if (coffre.length > 0) return coffre;
  if (!feuilleParams) return [];
  try {
    const feuille = iagChargerCles(feuilleParams.getRange("H10").getValue());
    if (feuille.length > 0) iagAvertirCleDansFeuille("DeepSeek (H10)");
    return feuille;
  } catch (e) { return []; }
}

/** Masque une clé : seuls les 4 derniers caractères sont montrés. */
function iagMasquerCle(cle) {
  const c = String(cle || "");
  return c.length > 8 ? ("…" + c.substring(c.length - 4)) : "(courte)";
}

function iagLireFlagDeepSeek(feuilleParams) {
  if (!feuilleParams) return false;
  try {
    const v = feuilleParams.getRange("H11").getValue().toString().trim().toUpperCase();
    return v === "OUI" || v === "TRUE" || v === "1" || v === "ACTIF";
  } catch (e) { return false; }
}

// ---------------------------------------------------------------------------
// DIAGNOSTIC CONFIGURATION
// ---------------------------------------------------------------------------

function iagDiagnosticConfigurationIA() {
  Logger.log("=================================================");
  Logger.log("=== DIAGNOSTIC CONFIGURATION IA V1.12 ===");
  Logger.log("Fichier : " + SpreadsheetApp.getActiveSpreadsheet().getName());
  Logger.log("=================================================");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const params = ss.getSheetByName(SHEET_PARAMS);
  if (!params) { Logger.log("✗ Feuille PARAMETRES introuvable."); return; }

  const clesGemini = iagLireClesGemini(params);
  Logger.log("");
  Logger.log("--- CLÉS GEMINI (coffre, sinon H1) ---");
  Logger.log("Nombre de clés détectées : " + clesGemini.length);
  clesGemini.forEach(function (c, i) {
    Logger.log("    Clé #" + (i + 1) + " : " + iagMasquerCle(c) + "  (" + c.length + " car.)");
  });

  const clesDeepSeek = iagLireClesDeepSeek(params);
  Logger.log("");
  Logger.log("--- CLÉS DEEPSEEK (coffre, sinon H10) ---");
  Logger.log("Nombre de clés détectées : " + clesDeepSeek.length);

  const flagDeepSeek = iagLireFlagDeepSeek(params);
  Logger.log("");
  Logger.log("--- ACTIVATION FALLBACK DEEPSEEK (H11) ---");
  Logger.log("H11 = \"" + params.getRange("H11").getValue().toString() + "\"");
  Logger.log("Fallback DeepSeek : " + (flagDeepSeek ? "✓ ACTIVÉ" : "✗ DÉSACTIVÉ"));

  const q = iagLireQuotaJour();
  Logger.log("");
  Logger.log("--- QUOTA IA DU JOUR ---");
  Logger.log("Date              : " + q.date);
  Logger.log("Total appels      : " + q.count);
  Logger.log("  · Gemini        : " + q.gemini);
  Logger.log("  · DeepSeek      : " + q.deepseek);
  Logger.log("  · Erreurs       : " + q.erreurs);

  Logger.log("");
  Logger.log("=================================================");
  Logger.log("SYNTHÈSE");
  Logger.log("  · Clés Gemini    : " + clesGemini.length);
  Logger.log("  · Clés DeepSeek  : " + clesDeepSeek.length);
  Logger.log("  · DeepSeek actif : " + (flagDeepSeek ? "OUI" : "NON"));
  Logger.log("=================================================");
}

// ---------------------------------------------------------------------------
// TEST RÉEL DE LA ROTATION
// ---------------------------------------------------------------------------

function iagTesterRotationCles(testerDeepSeek) {
  Logger.log("=================================================");
  Logger.log("=== TEST RÉEL DE LA ROTATION DES CLÉS V1.11 ===");
  Logger.log("=================================================");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const params = ss.getSheetByName(SHEET_PARAMS);
  if (!params) { Logger.log("PARAMETRES introuvable."); return; }

  const clesGemini = iagLireClesGemini(params);
  const clesDeepSeek = iagLireClesDeepSeek(params);

  const promptTest = "Réponds uniquement avec le mot : OK";
  const payload = {
    contents: [{ parts: [{ text: promptTest }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 10 }
  };

  const quotaAvant = iagLireQuotaJour();

  const resultatsGemini = [];
  for (let i = 0; i < clesGemini.length; i++) {
    const cle = clesGemini[i];
    let succes = false, modeleUtilise = "", erreur = "";
    const modeles = IAG_MODELES_TEXTE;
    for (let m = 0; m < modeles.length && !succes; m++) {
      const r = iagTenterGemini(cle, modeles[m], payload, IAG_URL_BASE);
      iagIncrementerQuota("gemini", r.succes && !!r.texte);
      if (r.succes && r.texte) {
        succes = true; modeleUtilise = modeles[m];
      } else if (r.code === 429) { erreur = "429 quota"; break; }
      else if (r.code === 400 || r.code === 403) { erreur = "clé invalide " + r.code; break; }
      else { erreur = "code " + r.code; Utilities.sleep(500); }
    }
    resultatsGemini.push({ index: i + 1, succes: succes, modele: modeleUtilise, erreur: erreur });
    Utilities.sleep(800);
  }

  const quotaApres = iagLireQuotaJour();
  Logger.log("Quota AVANT : " + quotaAvant.count + " | APRÈS : " + quotaApres.count);
  const clesOk = resultatsGemini.filter(function (r) { return r.succes; }).length;
  resultatsGemini.forEach(function (r) {
    Logger.log("  Clé #" + r.index + " : " + (r.succes ? "✓ OK (" + r.modele + ")" : "✗ " + r.erreur));
  });
  Logger.log("Total : " + clesOk + "/" + clesGemini.length + " clés opérationnelles.");
}

// ---------------------------------------------------------------------------
// EXTRACTION DE TEXTE
// ---------------------------------------------------------------------------

function iagExtraireTexte(json) {
  const parts = json && json.candidates && json.candidates[0] &&
                json.candidates[0].content && json.candidates[0].content.parts;
  if (!parts || !parts.length) return "";
  return parts
    .filter(function (p) { return p && p.text && !p.thought; })
    .map(function (p) { return p.text; })
    .join("");
}

function iagParserJson(texte) {
  if (!texte) return null;
  let t = String(texte).trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try { return JSON.parse(t); }
  catch (e) {
    const d = t.indexOf("{"), f = t.lastIndexOf("}");
    if (d !== -1 && f > d) {
      try { return JSON.parse(t.substring(d, f + 1)); } catch (e2) { return null; }
    }
    return null;
  }
}

function iagNettoyerTexteLibre(texte) {
  if (!texte) return "";
  let t = String(texte).trim();
  t = t.replace(/^```[a-zA-Z]*\s*/i, "").replace(/\s*```$/i, "").trim();
  t = t.replace(/^(voici|résumé|resume|phrase|réponse|reponse|accroche)\s*:?\s*/i, "").trim();
  t = t.replace(/^(Target\s*\/\s*Fit|Analysis|Thought|Reasoning|Response|Answer)\s*:?\s*/i, "").trim();
  t = t.replace(/^\*+\s*/, "").replace(/\s*\*+$/, "").trim();
  if (t.length >= 2) {
    const premier = t.charAt(0), dernier = t.charAt(t.length - 1);
    const estGuillemet = function (c) {
      return c === '"' || c === "'" || c === "\u00AB" || c === "\u00BB" ||
             c === "\u201C" || c === "\u201D" || c === "\u2018" || c === "\u2019";
    };
    if (estGuillemet(premier) && estGuillemet(dernier)) {
      t = t.substring(1, t.length - 1).trim();
    }
  }
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

// ---------------------------------------------------------------------------
// APPEL GEMINI (bas niveau)
// ---------------------------------------------------------------------------

function iagTenterGemini(cle, modele, payload, baseUrl) {
  const url = baseUrl + modele + ":generateContent";
  let code = 0, texte = "", corps = "";
  try {
    const res = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: { "x-goog-api-key": cle },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    code = res.getResponseCode();
    corps = res.getContentText();
    if (code === 200) {
      try {
        const json = JSON.parse(corps);
        texte = iagExtraireTexte(json);
        return { code: code, texte: texte, modele: modele, succes: true };
      } catch (e) {
        return { code: 200, texte: "", modele: modele, succes: false, erreur: "parse" };
      }
    }
    return { code: code, texte: "", modele: modele, succes: false, erreur: corps.substring(0, 200) };
  } catch (e) {
    return { code: 0, texte: "", modele: modele, succes: false, erreur: e.message };
  }
}

// ---------------------------------------------------------------------------
// APPEL DEEPSEEK (bas niveau)
// ---------------------------------------------------------------------------

function iagTenterDeepSeek(cle, prompt, options) {
  const opts = options || {};
  const modeJson = !!opts.modeJson;
  const temperature = (opts.temperature !== undefined) ? opts.temperature : 0.1;
  const maxTokens = opts.maxTokens || 4096;

  const payload = {
    model: IAG_DEEPSEEK_MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: temperature,
    max_tokens: maxTokens
  };
  if (modeJson) payload.response_format = { type: "json_object" };

  try {
    const res = UrlFetchApp.fetch(IAG_DEEPSEEK_URL, {
      method: "post",
      contentType: "application/json",
      headers: { "Authorization": "Bearer " + cle },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    const code = res.getResponseCode();
    const corps = res.getContentText();
    if (code === 200) {
      try {
        const json = JSON.parse(corps);
        const txt = json.choices && json.choices[0] && json.choices[0].message &&
                    json.choices[0].message.content;
        return { code: code, texte: txt || "", succes: !!txt };
      } catch (e) {
        return { code: 200, texte: "", succes: false, erreur: "parse" };
      }
    }
    return { code: code, texte: "", succes: false, erreur: corps.substring(0, 200) };
  } catch (e) {
    return { code: 0, texte: "", succes: false, erreur: e.message };
  }
}

// ---------------------------------------------------------------------------
// ROUTEUR UNIFIÉ
// ---------------------------------------------------------------------------

function iagRouterAppel(prompt, mode, options, metriques) {
  if (!prompt) return null;

  // LOT S3 : plafond journalier — aucun fournisseur n'est contacté au-delà
  const appelsDuJour = iagLireQuotaJour().count;
  const plafondJour = iagLirePlafondJour();
  if (iagPlafondAtteint(appelsDuJour, plafondJour)) {
    iagSignalerPlafondAtteint(appelsDuJour, plafondJour, metriques);
    return null;
  }

  const opts = options || {};
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const params = ss.getSheetByName(SHEET_PARAMS);
  if (!params) return null;

  const clesGemini = iagLireClesGemini(params);
  const clesDeepSeek = iagLireClesDeepSeek(params);
  const deepseekActif = iagLireFlagDeepSeek(params) && clesDeepSeek.length > 0;

  if (clesGemini.length === 0 && !deepseekActif) {
    Logger.log("[IAG Router] Aucune clé disponible.");
    return null;
  }

  if (clesGemini.length > 0) {
    const modeles = (mode === "texte") ? IAG_MODELES_TEXTE : IAG_MODELES;
    let tentative = 0;

    for (let m = 0; m < modeles.length; m++) {
      const modele = modeles[m];
      for (let k = 0; k < clesGemini.length; k++) {
        tentative++;
        if (tentative > IAG_MAX_TENTATIVES_GEMINI) break;

        const cle = clesGemini[k];
        const payload = iagConstruirePayloadGemini(prompt, mode, opts);

        const r = iagTenterGemini(cle, modele, payload, IAG_URL_BASE);
        iagIncrementerQuota("gemini", r.succes && !!r.texte);

        if (r.succes && r.texte) {
          if (metriques) metriques.appelsGemini = (metriques.appelsGemini || 0) + 1;
          return r.texte;
        }

        if (r.code === 429 || r.code >= 500 || r.code === 0) {
          Utilities.sleep(500);
          continue;
        }
        break;
      }
      if (tentative > IAG_MAX_TENTATIVES_GEMINI) break;
    }
  }

  if (deepseekActif) {
    for (let k = 0; k < clesDeepSeek.length; k++) {
      const cle = clesDeepSeek[k];
      const r = iagTenterDeepSeek(cle, prompt, {
        modeJson: mode === "json",
        maxTokens: opts.maxTokens || 4096,
        temperature: opts.temperature
      });
      iagIncrementerQuota("deepseek", r.succes && !!r.texte);

      if (r.succes && r.texte) {
        if (metriques) metriques.appelsDeepSeek = (metriques.appelsDeepSeek || 0) + 1;
        return r.texte;
      }
      Utilities.sleep(500);
    }
  }

  return null;
}

function iagConstruirePayloadGemini(prompt, mode, opts) {
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: (opts.temperature !== undefined) ? opts.temperature : 0.1,
      maxOutputTokens: opts.maxTokens || 8192
    }
  };
  if (mode === "json") payload.generationConfig.responseMimeType = "application/json";
  return payload;
}

// ---------------------------------------------------------------------------
// POINTS D'ENTRÉE PUBLICS
// ---------------------------------------------------------------------------

function iagAppelerGemini(prompt, apiKey, metriques, options) {
  const texte = iagRouterAppel(prompt, "json", options || {}, metriques);
  if (!texte) return null;
  return iagParserJson(texte);
}

function iagAppelerGeminiTexte(prompt, apiKey, metriques, options) {
  const texte = iagRouterAppel(prompt, "texte", options || {}, metriques);
  if (!texte) return "";
  return iagNettoyerTexteLibre(texte);
}

// ============================================================================
// JOB A — ENRICHISSEMENT STRUCTURÉ
// ============================================================================

function iagJobA_EnrichirAvis(avisBruts, apiKey, metriques) {
  if (!avisBruts || !avisBruts.length) return [];
  const enrichis = [];

  for (let i = 0; i < avisBruts.length; i += IAG_LOT_ENRICHISSEMENT) {
    const lot = avisBruts.slice(i, i + IAG_LOT_ENRICHISSEMENT);
    const avisTexte = lot.map(function (a) {
      return "--- ID: " + a.id_ao + "\nTEXTE: " +
             (a.texte_brut || "").substring(0, 1500) + "\nURL: " + (a.url_fiche || "");
    }).join("\n\n");

    const prompt =
      "Tu es un extracteur structuré d'avis d'appels d'offres camerounais. " +
      "Tu réponds STRICTEMENT en JSON, sans texte autour. " +
      "Si une donnée est absente, mets null. N'invente jamais.\n\n" +
      "Analyse les avis ci-dessous et retourne un objet JSON :\n" +
      "{\n  \"avis\": [\n    {\n" +
      "      \"id_ao\": \"ARMP_64837\",\n" +
      "      \"titre_propre\": \"Titre nettoyé (200 car. max)\",\n" +
      "      \"maitre_ouvrage\": \"Nom complet normalisé de l'autorité contractante ou null\",\n" +
      "      \"region\": \"CENTRE\",\n" +
      "      \"montant\": 45000000,\n" +
      "      \"devise\": \"FCFA\",\n" +
      "      \"date_limite\": \"2026-09-24T12:00\",\n" +
      "      \"procedure\": \"AONO\",\n" +
      "      \"type_pub\": \"Appel_Offres\",\n" +
      "      \"est_additif\": false,\n" +
      "      \"est_annule\": false\n" +
      "    }\n  ]\n}\n\n" +
      "RÈGLES GÉNÉRALES :\n" +
      "- procedure ∈ {AONO, DC, AMI, AONR, AOIO, ATTRIBUTION, AUTRE}\n" +
      "- type_pub ∈ {Appel_Offres, Attribution}\n" +
      "- montant : entier (45000000, pas \"45 M\"), ou null\n" +
      "- devise : FCFA, USD, EUR, ou null\n" +
      "- date_limite : ISO YYYY-MM-DDTHH:MM, ou null\n" +
      "- est_additif : true si additif / modification / rectification\n" +
      "- est_annule : true si annulation / infructueux / résilié\n\n" +
      "RÈGLES RÉGION :\n" +
      "- Valeur exacte parmi : ADAMAOUA, CENTRE, EST, EXTRÊME-NORD, LITTORAL, NORD,\n" +
      "  NORD-OUEST, OUEST, SUD, SUD-OUEST, SERVICES CENTRAUX, ou null.\n" +
      "- Sinon → null (ne pas deviner au hasard).\n\n" +
      "RÈGLES MAÎTRE D'OUVRAGE (NORMALISATION OBLIGATOIRE) :\n" +
      "- Écris toujours le nom COMPLET et développé de l'autorité contractante.\n" +
      "- Développe : CM X → Communauté Urbaine de X ; MAIRE DE X → Commune de X ;\n" +
      "  PREFET > X → Préfecture de X ; GOUVERNEUR DE X → Gouvernorat de X ;\n" +
      "  CR XX → Conseil Régional développé.\n" +
      "- CONSERVE TELS QUELS les sigles ministériels (MINTP, MINEPDED...)\n" +
      "  et d'établissements publics (FEICOM, CAA, APN, HISWACA...).\n\n" +
      "AVIS À TRAITER :\n" + avisTexte;

    const resultat = iagAppelerGemini(prompt, apiKey, metriques, { maxTokens: 8192 });

    if (resultat && Array.isArray(resultat.avis)) {
      resultat.avis.forEach(function (a) {
        enrichis.push({
          id_ao: a.id_ao,
          titre_propre: a.titre_propre || "",
          maitre_ouvrage: a.maitre_ouvrage || "Non précisé",
          region: a.region || null,
          montant: (typeof a.montant === "number") ? a.montant : null,
          devise: a.devise || "FCFA",
          date_limite: a.date_limite || null,
          procedure: a.procedure || "AUTRE",
          type_pub: a.type_pub || "Appel_Offres",
          est_additif: !!a.est_additif,
          est_annule: !!a.est_annule
        });
      });
    } else {
      lot.forEach(function (a) {
        enrichis.push({
          id_ao: a.id_ao, titre_propre: "", maitre_ouvrage: "Non précisé",
          region: null, montant: null, devise: "FCFA", date_limite: null,
          procedure: "AUTRE", type_pub: "Appel_Offres",
          est_additif: false, est_annule: false, echec_ia: true
        });
      });
    }
    Utilities.sleep(400);
  }
  return enrichis;
}

// ============================================================================
// JOB B — SCORING AVIS × CLIENT (V1.11 — retour structuré + prompt enrichi)
// ============================================================================

/**
 * Score les paires (avis × client) avec Gemini.
 *
 * @return {Object} { resultats, attendu, recu, complet, erreur }
 *   · resultats : tableau de { id_ao, id_client, note_ia, motif }
 *   · attendu   : nb_avis × nb_clients
 *   · recu      : resultats.length
 *   · complet   : (recu === attendu)
 *   · erreur    : string|null (raison de l'échec si non complet)
 */
function iagJobB_ScorerPaires(avisLot, clientsLot, apiKey, metriques) {
  if (!avisLot.length || !clientsLot.length) {
    return { resultats: [], attendu: 0, recu: 0, complet: true, erreur: null };
  }

  const nbAvis = avisLot.length;
  const nbClients = clientsLot.length;
  const attendu = nbAvis * nbClients;

  const promptClients = clientsLot.map(function (c) {
    return '- CLIENT_ID: "' + c.id + '" | NOM: "' + c.nom + '"\n' +
           '  PROFIL: "' + (c.promptMetier || "") + '"';
  }).join("\n");

  const promptAvis = avisLot.map(function (a) {
    return '- DOSSIER_ID: "' + a.id + '"\n' +
           '  TITRE: "' + a.titre + '"\n' +
           '  AUTORITÉ CONTRACTANTE: "' + a.maitreOuvrage + '"\n' +
           '  RÉGION: "' + a.region + '" | PROCÉDURE: "' + a.procedureNormalisee +
           '" | TYPE: "' + a.typePub + '"';
  }).join("\n");

  const prompt =
    "Tu es l'auditeur en chef chargé du dispatching des marchés publics au Cameroun.\n\n" +

    "CONTEXTE :\n" +
    "- Les profils clients sont structurés en sections (DOMAINES, MO_CITÉS,\n" +
    "  ZONES, TYPES_MARCHÉS, EXCLUSIONS_CRITIQUES, RÉSUMÉ).\n" +
    "- Un profil RICHE (500+ caractères) doit être jugé sur la convergence\n" +
    "  de SES domaines déclarés et de l'avis.\n" +
    "- Un profil PAUVRE (<200 caractères) doit être jugé STRICTEMENT sur\n" +
    "  les informations fournies (aucune extrapolation).\n" +
    "- Les EXCLUSIONS_CRITIQUES priment sur toute autre considération :\n" +
    "  si l'avis tombe dans une exclusion, la note est 1 ou 2.\n\n" +

    "ENTREPRISES CLIENTES (" + nbClients + ") :\n" + promptClients + "\n\n" +
    "AVIS À ANALYSER (" + nbAvis + ") :\n" + promptAvis + "\n\n" +

    "MISSION : pour CHAQUE paire (avis × client), attribue une note entière 1-5.\n\n" +
    "GRILLE :\n" +
    "- 1 = totalement hors-sujet\n" +
    "- 2 = non pertinent (mauvais domaine ou exclu par les règles)\n" +
    "- 3 = connexe / sous-traitance accessible\n" +
    "- 4 = opportunité directe très adaptée\n" +
    "- 5 = cœur de métier évident\n\n" +
    "Motif court (10 mots max) par paire.\n\n" +

    "RAPPEL D'EXHAUSTIVITÉ CRITIQUE :\n" +
    "Tu DOIS produire EXACTEMENT " + attendu + " entrées dans le tableau\n" +
    "\"resultats\" (" + nbAvis + " avis × " + nbClients + " clients).\n" +
    "Aucune paire ne doit être omise. Compte bien avant de répondre.\n\n" +

    "Réponds STRICTEMENT en JSON :\n" +
    '{ "resultats": [ { "id_ao": "...", "id_client": "...", "note_ia": 4, "motif": "..." } ] }';

  const texte = iagRouterAppel(prompt, "json", { maxTokens: 8192 }, metriques);

  if (!texte) {
    return { resultats: [], attendu: attendu, recu: 0, complet: false, erreur: "réponse vide" };
  }

  const parsed = iagParserJson(texte);

  if (!parsed || !Array.isArray(parsed.resultats)) {
    return { resultats: [], attendu: attendu, recu: 0, complet: false, erreur: "JSON invalide" };
  }

  const resultats = parsed.resultats.map(function (r) {
    return {
      id_ao: r.id_ao,
      id_client: r.id_client,
      note_ia: Math.min(Math.max(parseInt(r.note_ia, 10) || 1, 1), 5),
      motif: (r.motif || "").toString().trim()
    };
  });

  const recu = resultats.length;
  const complet = (recu === attendu);

  if (!complet) {
    Logger.log("[IA JobB V1.11] Réponse incomplète : " + recu + "/" + attendu +
               " paires reçues.");
  }

  return {
    resultats: resultats,
    attendu: attendu,
    recu: recu,
    complet: complet,
    erreur: complet ? null : ("incomplet " + recu + "/" + attendu)
  };
}

// ============================================================================
// JOB C — RÉSUMÉ D'ACCROCHE PAR CLIENT
// ============================================================================

function iagJobC_ResumeClient(clientNom, promptMetier, topAvis, apiKey, metriques) {
  if (!topAvis.length) return "";

  const liste = topAvis.slice(0, 8).map(function (a) {
    return "- " + a.titre + " (" + (a.montant || "montant non précisé") + ", " +
           (a.joursRestants !== null ? "J-" + a.joursRestants : "date non précisée") + ")";
  }).join("\n");

  const prompt =
    "Tu rédiges UNE phrase d'accroche courte, en français, ton professionnel, pour un email de veille marchés publics.\n\n" +
    "Entreprise cliente : " + clientNom + "\n" +
    "Profil métier : " + promptMetier + "\n\n" +
    "Avis retenus pour cette entreprise :\n" + liste + "\n\n" +
    "CONSIGNES STRICTES :\n" +
    "- UNE SEULE phrase, maximum 25 mots.\n" +
    "- Commence directement par \"Ces appels d'offres\" (pas de Bonjour, pas de formule d'appel).\n" +
    "- Mentionne EXPLICITEMENT le nom exact de l'entreprise (" + clientNom + ").\n" +
    "- Résume en quoi ces opportunités correspondent à son profil.\n" +
    "- N'invente aucun secteur : reste fidèle au profil métier ci-dessus.\n" +
    "- Pas de signature, pas de formule de politesse.\n" +
    "- Réponds en TEXTE BRUT, sans guillemets, sans balises, sans préambule.";

  const texte = iagAppelerGeminiTexte(prompt, apiKey, metriques, {
    maxTokens: 800, temperature: 0.3
  });

  return texte || "";
}

// ============================================================================
// JOB D — AUDIT QUALITÉ HEBDOMADAIRE
// ============================================================================

function iagJobD_AuditerQualite() {
  const props = PropertiesService.getScriptProperties();
  const propDerniere = "IAG_AUDIT_DERNIERE_EXEC";
  const maintenant = new Date();
  const derniere = props.getProperty(propDerniere);

  if (derniere) {
    const d = new Date(derniere);
    if (!isNaN(d.getTime())) {
      const jours = (maintenant.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
      if (jours < 7) {
        Logger.log("[IAG Audit] Non nécessaire (" + jours.toFixed(1) + " j).");
        return;
      }
    }
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cache = ss.getSheetByName("CACHE_IA");
  const aoFeuille = ss.getSheetByName(SHEET_AO);
  const params = ss.getSheetByName(SHEET_PARAMS);
  if (!cache || !aoFeuille || !params) return;

  const emailAdmin = params.getRange("H2").getValue().toString().trim();
  if (!emailAdmin) return;

  const dataCache = cache.getDataRange().getValues();
  if (dataCache.length <= 1) return;

  const mapAO = {};
  const dataAO = aoFeuille.getDataRange().getValues();
  for (let i = 1; i < dataAO.length; i++) {
    mapAO[dataAO[i][0]] = {
      titre: (dataAO[i][5] || "").toString(),
      mo: (dataAO[i][6] || "").toString()
    };
  }

  const hautes = [], basses = [], medianes = [];
  for (let i = 1; i < dataCache.length; i++) {
    const note = parseInt(dataCache[i][2], 10);
    const item = { idAO: dataCache[i][0], idClient: dataCache[i][1], note: note, motif: dataCache[i][3] };
    if (note >= 4) hautes.push(item);
    else if (note <= 2) basses.push(item);
    else medianes.push(item);
  }
  function tirer(arr, n) {
    const copie = arr.slice();
    const out = [];
    while (out.length < n && copie.length) {
      out.push(copie.splice(Math.floor(Math.random() * copie.length), 1)[0]);
    }
    return out;
  }
  const ech = [].concat(tirer(hautes, 2), tirer(basses, 2), tirer(medianes, 1));
  if (!ech.length) return;

  const paires = ech.map(function (e, i) {
    const ao = mapAO[e.idAO] || {};
    return (i + 1) + ". ID_AO=" + e.idAO + " | ID_CLIENT=" + e.idClient +
           " | Note initiale=" + e.note + " | Motif initial=\"" + e.motif + "\"\n" +
           "   Titre: \"" + ao.titre + "\"\n" +
           "   MO: \"" + ao.mo + "\"";
  }).join("\n\n");

  const prompt =
    "Tu es un auditeur qualité. Réponds en JSON strict.\n\n" +
    "Pour chacune des 5 évaluations ci-dessous, indique si la note te semble cohérente.\n" +
    'Retourne : { "audits": [ { "id_ao": "...", "id_client": "...", ' +
    '"note_verifiee": 4, "coherent": true, "commentaire": "..." } ] }\n\n' +
    "ÉVALUATIONS :\n" + paires;

  const metriques = { appelsGemini: 0 };
  const res = iagAppelerGemini(prompt, null, metriques, { maxTokens: 2048 });

  let cartes = "";
  if (res && Array.isArray(res.audits)) {
    res.audits.forEach(function (a, i) {
      const couleur = a.coherent ? "#10b981" : "#ef4444";
      cartes += '<div style="border-left:4px solid ' + couleur +
                '; padding:10px; margin:8px 0; background:#f8fafc;">' +
                "<strong>#" + (i + 1) + " — " + a.id_ao + " / " + a.id_client + "</strong><br>" +
                "Note vérifiée : " + a.note_verifiee + "/5 — " +
                (a.coherent ? "✓ cohérent" : "⚠ divergence") + "<br>" +
                "<em>" + (a.commentaire || "") + "</em></div>";
    });
  } else {
    cartes = "<p>Audit indisponible cette semaine.</p>";
  }

  try {
    MailApp.sendEmail({
      to: emailAdmin,
      subject: "[Audit IA] Contrôle hebdomadaire — " +
               Utilities.formatDate(maintenant, "Africa/Douala", "dd/MM/yyyy"),
      htmlBody: '<div style="font-family:Arial; max-width:640px;">' +
                '<h2 style="color:#0f172a;">Audit qualité IA</h2>' +
                "<p>Échantillon de 5 évaluations re-jugées par l'IA.</p>" +
                cartes + "</div>"
    });
    props.setProperty(propDerniere, maintenant.toISOString());
    Logger.log("[IAG Audit] Rapport envoyé.");
  } catch (e) {
    Logger.log("[IAG Audit] Erreur envoi : " + e.message);
  }
}

// ============================================================================
// LOT 5 — COFFRE À CLÉS : MIGRATION, VÉRIFICATION, VIDAGE DE LA FEUILLE
// ============================================================================
// Aucune clé n'est jamais écrite en entier dans le journal (4 derniers caractères seulement).
// ============================================================================

/**
 * ÉTAPE 1 — Copie les clés de la feuille (H1 Gemini, H10 DeepSeek) vers le coffre.
 * Ne modifie PAS la feuille. Sans danger si relancée : si le coffre contient déjà
 * des clés, rien n'est écrasé.
 */
function iagMigrerClesVersProprietes() {
  Logger.log("=================================================");
  Logger.log("=== MIGRATION DES CLÉS VERS LE COFFRE (PropertiesService) ===");
  Logger.log("Fichier : " + SpreadsheetApp.getActiveSpreadsheet().getName());
  Logger.log("=================================================");

  const params = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PARAMS);
  if (!params) { Logger.log("✗ Feuille PARAMETRES introuvable."); return; }
  const props = PropertiesService.getScriptProperties();

  const travaux = [
    { nom: "Gemini", cellule: "H1", propriete: IAG_PROP_CLES_GEMINI },
    { nom: "DeepSeek", cellule: "H10", propriete: IAG_PROP_CLES_DEEPSEEK }
  ];

  travaux.forEach(function (t) {
    const dejaEnCoffre = iagLireClesDepuisProprietes(t.propriete);
    if (dejaEnCoffre.length > 0) {
      Logger.log("· " + t.nom + " : le coffre contient déjà " + dejaEnCoffre.length + " clé(s) — aucune écriture.");
      return;
    }
    const cles = iagChargerCles(params.getRange(t.cellule).getValue());
    if (cles.length === 0) {
      Logger.log("· " + t.nom + " : aucune clé dans " + t.cellule + " — rien à migrer.");
      return;
    }
    props.setProperty(t.propriete, cles.join(","));

    const relues = iagLireClesDepuisProprietes(t.propriete);
    const identiques = relues.length === cles.length && relues.every(function (c, i) { return c === cles[i]; });
    Logger.log((identiques ? "✅ " : "❌ ") + t.nom + " : " + cles.length + " clé(s) copiée(s) vers " + t.propriete +
               " (" + cles.map(iagMasquerCle).join(", ") + ")" + (identiques ? " — relecture conforme." : " — RELECTURE NON CONFORME !"));
  });

  Logger.log("");
  Logger.log("La feuille PARAMETRES n'a PAS été modifiée (elle reste le secours).");
  Logger.log("Étape suivante : lancer iagVerifierCoffreCles().");
  Logger.log("=================================================");
}

/**
 * ÉTAPE 2 — Contrôle en lecture seule : où le code lit-il les clés ?
 */
function iagVerifierCoffreCles() {
  Logger.log("=================================================");
  Logger.log("=== VÉRIFICATION DU COFFRE À CLÉS (lecture seule) ===");
  Logger.log("=================================================");

  const params = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PARAMS);
  if (!params) { Logger.log("✗ Feuille PARAMETRES introuvable."); return; }

  const controles = [
    { nom: "Gemini", cellule: "H1", propriete: IAG_PROP_CLES_GEMINI, lecture: iagLireClesGemini },
    { nom: "DeepSeek", cellule: "H10", propriete: IAG_PROP_CLES_DEEPSEEK, lecture: iagLireClesDeepSeek }
  ];

  controles.forEach(function (c) {
    const coffre = iagLireClesDepuisProprietes(c.propriete);
    const feuille = iagChargerCles(params.getRange(c.cellule).getValue());
    const utilisees = c.lecture(params);
    const source = coffre.length > 0 ? "COFFRE" : (feuille.length > 0 ? "FEUILLE (secours)" : "AUCUNE");

    Logger.log("--- " + c.nom + " ---");
    Logger.log("  Clés dans le coffre  : " + coffre.length + (coffre.length ? " (" + coffre.map(iagMasquerCle).join(", ") + ")" : ""));
    Logger.log("  Clés dans la feuille " + c.cellule + " : " + feuille.length);
    Logger.log("  Source utilisée par le code : " + source + " (" + utilisees.length + " clé(s))");
    if (coffre.length > 0 && feuille.length > 0) {
      Logger.log("  ⚠️ Les clés sont encore lisibles dans la feuille : à vider après validation (iagEffacerClesDeLaFeuille).");
    }
    if (coffre.length === 0 && feuille.length === 0 && c.nom === "Gemini") {
      Logger.log("  ❌ Aucune clé Gemini : l'IA ne fonctionnera pas.");
    }
  });
  Logger.log("=================================================");
}

/**
 * ÉTAPE 3 — À LANCER SEULEMENT APRÈS VALIDATION : remplace les clés de la feuille
 * (H1, H10) par un marqueur. Refuse de s'exécuter si le coffre ne contient pas
 * exactement les mêmes clés.
 */
function iagEffacerClesDeLaFeuille() {
  Logger.log("=================================================");
  Logger.log("=== VIDAGE DES CLÉS DE LA FEUILLE PARAMETRES ===");
  Logger.log("=================================================");

  const params = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PARAMS);
  if (!params) { Logger.log("✗ Feuille PARAMETRES introuvable."); return; }

  const travaux = [
    { nom: "Gemini", cellule: "H1", propriete: IAG_PROP_CLES_GEMINI },
    { nom: "DeepSeek", cellule: "H10", propriete: IAG_PROP_CLES_DEEPSEEK }
  ];

  // 1) Contrôle préalable : rien n'est écrit tant que tout n'est pas conforme
  const aVider = [];
  for (let i = 0; i < travaux.length; i++) {
    const t = travaux[i];
    const feuille = iagChargerCles(params.getRange(t.cellule).getValue());
    if (feuille.length === 0) {
      Logger.log("· " + t.nom + " : " + t.cellule + " ne contient pas de clé — rien à vider.");
      continue;
    }
    const coffre = iagLireClesDepuisProprietes(t.propriete);
    const tousPresents = feuille.every(function (c) { return coffre.indexOf(c) !== -1; });
    if (!tousPresents) {
      Logger.log("❌ " + t.nom + " : le coffre ne contient pas toutes les clés de " + t.cellule + ". ARRÊT, la feuille n'est pas modifiée.");
      Logger.log("   Lancer d'abord iagMigrerClesVersProprietes().");
      return;
    }
    aVider.push(t);
  }

  // 2) Vidage
  aVider.forEach(function (t) {
    const cellule = params.getRange(t.cellule);
    cellule.setValue(IAG_MARQUEUR_CLE_EN_COFFRE);
    cellule.setNote("La clé est stockée dans les propriétés du script (" + t.propriete + "). Ne rien écrire ici.");
    Logger.log("✅ " + t.nom + " : " + t.cellule + " remplacée par \"" + IAG_MARQUEUR_CLE_EN_COFFRE + "\".");
  });
  if (aVider.length === 0) Logger.log("Aucune cellule modifiée.");
  Logger.log("Vérifier ensuite avec iagVerifierCoffreCles().");
  Logger.log("=================================================");
}

// ============================================================================
// TEST LOT S3 — PLAFOND JOURNALIER (aucun appel IA, aucune écriture, aucun e-mail)
// ============================================================================

/**
 * Vérifie avec des valeurs simulées l'interprétation du plafond et le seuil d'arrêt.
 * À exécuter depuis IA_Gemini.gs : iagTesterPlafondQuota
 */
function iagTesterPlafondQuota() {
  let ok = 0;
  let ko = 0;
  const verifier = function (nom, condition) {
    if (condition) { ok++; Logger.log("✅ " + nom); } else { ko++; Logger.log("❌ " + nom); }
  };

  verifier("propriété absente : plafond par défaut (300)", iagInterpreterPlafond(null) === 300 && iagInterpreterPlafond(undefined) === 300 && iagInterpreterPlafond("") === 300);
  verifier("valeur « 500 » acceptée", iagInterpreterPlafond("500") === 500);
  verifier("valeur « 50 » (minimum) acceptée", iagInterpreterPlafond("50") === 50);
  verifier("valeur « 5000 » (maximum) acceptée", iagInterpreterPlafond("5000") === 5000);
  verifier("valeur trop basse (10) : défaut", iagInterpreterPlafond("10") === 300);
  verifier("valeur trop haute (99999) : défaut", iagInterpreterPlafond("99999") === 300);
  verifier("texte non numérique : défaut", iagInterpreterPlafond("beaucoup") === 300);
  verifier("299 appels sur 300 : pas encore atteint", iagPlafondAtteint(299, 300) === false);
  verifier("300 appels sur 300 : atteint", iagPlafondAtteint(300, 300) === true);
  verifier("450 appels sur 300 : atteint", iagPlafondAtteint(450, 300) === true);
  verifier("usage normal observé (30 appels) très en dessous du plafond par défaut", iagPlafondAtteint(30, IAG_PLAFOND_DEFAUT) === false);
  verifier("le seuil d'alerte (400) reste au-dessus du plafond par défaut : le plafond agit en premier ou est relevé volontairement",
    IAG_SEUIL_ALERTE >= IAG_PLAFOND_DEFAUT);

  Logger.log("=== RÉSULTAT : " + ok + " réussi(s), " + ko + " échec(s) ===");
  if (ko > 0) throw new Error(ko + " vérification(s) en échec (voir le journal).");
}