// >>> FICHIER : SaaS_04_Securite.gs <<< (à coller dans l'onglet du même nom)
/**
 * ============================================================================
 * SAAS — SÉCURITÉ, CLÉ DU PROXY ET INTÉGRITÉ DU PROJET (V1.3 — fusion de SaaS_04 et SaaS_05)
 * ============================================================================
 * RÔLE
 * ---------------------------------------------------------------------------
 *   1. saasVerifierSecuriteAdmin()      → CONTRÔLE en lecture seule (aucun mot de
 *      passe ni hash affiché) : le mot de passe par défaut du code est-il encore
 *      valable ? combien de sessions sont actives ?
 *   2. saasDefinirMotDePasseAdmin()     → CHANGE le mot de passe de l'admin.
 *      Le nouveau mot de passe est lu dans les PROPRIÉTÉS DU SCRIPT (jamais écrit
 *      dans le code ni dans le journal), puis la propriété est effacée.
 *      Toutes les sessions de l'admin sont invalidées (il faut se reconnecter).
 *
 * MODE D'EMPLOI (aucun mot de passe à taper dans le code) :
 *   a) Paramètres du projet (roue dentée) → Propriétés du script → Modifier
 *      → ajouter la propriété  ADMIN_NOUVEAU_MDP  = votre nouveau mot de passe
 *      (12 caractères minimum). Enregistrer.
 *   b) Exécuter saasDefinirMotDePasseAdmin.
 *   c) Exécuter saasVerifierSecuriteAdmin pour vérifier.
 *
 *   3. saasVerifierEtatInscription()    → CONTRÔLE en lecture seule : la version fermée de
 *      l'inscription est-elle bien celle qui est active ? y a-t-il des comptes de test ?
 *   4. saasDesactiverComptesDeTest()    → passe en NON les comptes de test connus et ferme
 *      leurs sessions (aucune ligne supprimée ; l'admin n'est jamais touché).
 *
 *   5. Clé du proxy (lot S5a) : saasProxyGenererSecret, saasProxyModeOff, saasProxyModeObserve,
 *      saasProxyModeEnforce, saasProxyRapport, saasProxyRegenererSecret, saasTesterProxyCle.
 *
 * Aucun déclencheur. Aucune suppression de ligne.
 * ============================================================================
 */

const SAAS_SEC_PROP_NOUVEAU_MDP = "ADMIN_NOUVEAU_MDP";
const SAAS_SEC_PROP_EMAIL_ADMIN = "ADMIN_EMAIL";       // facultatif : à renseigner s'il y a plusieurs admins
const SAAS_SEC_MDP_MIN_LONGUEUR = 12;

// Mots de passe par défaut connus (présents dans d'anciennes versions du code)
const SAAS_SEC_MDP_PAR_DEFAUT = ["ChangezMoi2026!"];

/**
 * Vérifie la robustesse d'un nouveau mot de passe.
 * @return {string} "" si correct, sinon le motif de refus
 */
function saasSecMotifMotDePasseFaible(mdp) {
  const m = String(mdp || "");
  if (m.length < SAAS_SEC_MDP_MIN_LONGUEUR) return "moins de " + SAAS_SEC_MDP_MIN_LONGUEUR + " caractères";
  if (SAAS_SEC_MDP_PAR_DEFAUT.indexOf(m) !== -1) return "c'est le mot de passe par défaut du code";
  if (!/[a-z]/i.test(m) || !/[0-9]/.test(m)) return "il faut au moins une lettre et un chiffre";
  if (/^(.)\1+$/.test(m)) return "caractère répété";
  return "";
}

/**
 * Recherche l'utilisateur admin à modifier : l'e-mail de la propriété ADMIN_EMAIL
 * s'il existe, sinon l'unique compte ADMIN de la feuille UTILISATEURS.
 * @return {Object} { user, erreur }
 */
function saasSecTrouverAdmin() {
  const props = PropertiesService.getScriptProperties();
  const emailProp = String(props.getProperty(SAAS_SEC_PROP_EMAIL_ADMIN) || "").trim().toLowerCase();

  if (emailProp) {
    const u = saasTrouverUtilisateurParEmail(emailProp);
    if (!u) return { user: null, erreur: "Aucun utilisateur avec l'e-mail de la propriété " + SAAS_SEC_PROP_EMAIL_ADMIN + "." };
    if (String(u.role).toUpperCase() !== "ADMIN") return { user: null, erreur: "Cet utilisateur n'est pas ADMIN." };
    return { user: u, erreur: "" };
  }

  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_UTILISATEURS);
  if (!feuille) return { user: null, erreur: "Feuille UTILISATEURS introuvable." };
  const data = feuille.getDataRange().getValues();
  const admins = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][6] || "").trim().toUpperCase() === "ADMIN" && String(data[i][1] || "").trim()) {
      admins.push(String(data[i][1]).trim().toLowerCase());
    }
  }
  if (admins.length === 0) return { user: null, erreur: "Aucun compte ADMIN trouvé." };
  if (admins.length > 1) {
    return { user: null, erreur: "Plusieurs comptes ADMIN (" + admins.length + "). Ajouter la propriété " + SAAS_SEC_PROP_EMAIL_ADMIN + " avec l'e-mail à modifier." };
  }
  return { user: saasTrouverUtilisateurParEmail(admins[0]), erreur: "" };
}

/**
 * CHANGE le mot de passe de l'admin (nouveau mot de passe lu dans la propriété
 * ADMIN_NOUVEAU_MDP, puis propriété effacée).
 */
function saasDefinirMotDePasseAdmin() {
  Logger.log("=================================================");
  Logger.log("=== CHANGEMENT DU MOT DE PASSE ADMIN ===");
  Logger.log("Fichier : " + SpreadsheetApp.getActiveSpreadsheet().getName());
  Logger.log("=================================================");

  const props = PropertiesService.getScriptProperties();
  const nouveau = props.getProperty(SAAS_SEC_PROP_NOUVEAU_MDP);

  if (!nouveau) {
    Logger.log("❌ La propriété " + SAAS_SEC_PROP_NOUVEAU_MDP + " est absente ou vide.");
    Logger.log("   Paramètres du projet (roue dentée) → Propriétés du script → Modifier → ajouter " + SAAS_SEC_PROP_NOUVEAU_MDP + ".");
    return;
  }

  const motif = saasSecMotifMotDePasseFaible(nouveau);
  if (motif) {
    Logger.log("❌ Mot de passe refusé : " + motif + ". Rien n'a été modifié (la propriété est conservée pour correction).");
    return;
  }

  const recherche = saasSecTrouverAdmin();
  if (!recherche.user) {
    Logger.log("❌ " + recherche.erreur + " Rien n'a été modifié.");
    return;
  }
  const admin = recherche.user;

  const rep = saasAdminResetMotDePasse(admin.email, nouveau);
  let json = null;
  try { json = JSON.parse(rep.getContent()); } catch (e) { json = null; }

  if (!json || !json.succes) {
    Logger.log("❌ Échec de la réinitialisation : " + (json ? json.message : "réponse illisible") + ". La propriété est conservée.");
    return;
  }

  props.deleteProperty(SAAS_SEC_PROP_NOUVEAU_MDP);
  try {
    saasLogger(admin.idUser, admin.email, "ADMIN", "ADMIN_PASSWORD_CHANGE", "via éditeur Apps Script (sessions invalidées)", "", true);
  } catch (e) {}

  Logger.log("✅ Mot de passe changé pour le compte admin (" + admin.email + ").");
  Logger.log("✅ Toutes les sessions de ce compte sont invalidées : reconnectez-vous dans l'application.");
  Logger.log("✅ La propriété " + SAAS_SEC_PROP_NOUVEAU_MDP + " a été effacée.");
  Logger.log("Vérifier maintenant avec saasVerifierSecuriteAdmin().");
  Logger.log("=================================================");
}

/**
 * CONTRÔLE en lecture seule. N'affiche jamais de mot de passe ni de hash.
 */
function saasVerifierSecuriteAdmin() {
  Logger.log("=================================================");
  Logger.log("=== CONTRÔLE DE SÉCURITÉ DES COMPTES (lecture seule) ===");
  Logger.log("Fichier : " + SpreadsheetApp.getActiveSpreadsheet().getName());
  Logger.log("=================================================");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const fu = ss.getSheetByName(SAAS_SHEET_UTILISATEURS);
  if (!fu) { Logger.log("❌ Feuille UTILISATEURS introuvable."); return; }

  const data = fu.getDataRange().getValues();
  let nbUsers = 0, nbAdmins = 0, nbDefaut = 0;

  for (let i = 1; i < data.length; i++) {
    const email = String(data[i][1] || "").trim();
    if (!email) continue;
    nbUsers++;
    const role = String(data[i][6] || "").trim().toUpperCase();
    if (role === "ADMIN") nbAdmins++;
    const hash = String(data[i][2] || "");
    const sel = String(data[i][3] || "");

    let defautValide = false;
    SAAS_SEC_MDP_PAR_DEFAUT.forEach(function (mdp) {
      if (saasHacherMotDePasse(mdp, sel) === hash) defautValide = true;
    });
    if (defautValide) nbDefaut++;

    Logger.log("  " + (defautValide ? "❌" : "✅") + " " + email + " (" + role + ") — " +
               (defautValide ? "LE MOT DE PASSE PAR DÉFAUT DU CODE EST ENCORE VALABLE" : "ne correspond à aucun mot de passe par défaut connu"));
  }

  const fs = ss.getSheetByName(SAAS_SHEET_SESSIONS);
  let actives = 0;
  if (fs) {
    const ds = fs.getDataRange().getValues();
    for (let i = 1; i < ds.length; i++) {
      if (String(ds[i][6] || "").toUpperCase() === "OUI" && !saasDateDepassee(String(ds[i][3] || ""))) actives++;
    }
  }

  Logger.log("");
  Logger.log("Comptes : " + nbUsers + " (dont " + nbAdmins + " admin)");
  Logger.log("Sessions actives : " + actives + (actives > 3 ? "  ⚠️ beaucoup : issues de vos tests, elles restent valables 30 jours" : ""));
  Logger.log("Propriété " + SAAS_SEC_PROP_NOUVEAU_MDP + " présente : " +
             (PropertiesService.getScriptProperties().getProperty(SAAS_SEC_PROP_NOUVEAU_MDP) ? "OUI ⚠️ (à effacer si le changement n'a pas eu lieu)" : "non"));
  Logger.log("");
  Logger.log(nbDefaut === 0
    ? "✅ RÉSULTAT : aucun compte n'utilise un mot de passe par défaut connu."
    : "❌ RÉSULTAT : " + nbDefaut + " compte(s) avec mot de passe par défaut → lancer saasDefinirMotDePasseAdmin().");
  Logger.log("=================================================");
}

// Comptes créés par d'anciens tests (jamais de vrais clients)
const SAAS_SEC_COMPTES_DE_TEST = ["test-ferme@example.com", "autre@example.com", "x@x.cm", "nouveau@exemple.cm"];

/**
 * CONTRÔLE en lecture seule de l'état de l'inscription et des comptes de test.
 */
function saasVerifierEtatInscription() {
  Logger.log("=================================================");
  Logger.log("=== ÉTAT DE L'INSCRIPTION (lecture seule) ===");
  Logger.log("Fichier : " + SpreadsheetApp.getActiveSpreadsheet().getName());
  Logger.log("=================================================");

  const fonctionPresente = typeof saasAuthRegister === "function";
  const versionFermeeActive = fonctionPresente && (typeof saasInscriptionOuverte === "function") &&
                              String(saasAuthRegister).indexOf("saasInscriptionOuverte()") !== -1;
  Logger.log((versionFermeeActive ? "✅" : "❌") + " Version active de saasAuthRegister : " +
             (versionFermeeActive ? "FERMÉE (V1.1b)" : "ANCIENNE VERSION OUVERTE — recoller SaaS_02_Auth.gs dans l'onglet SaaS_02_Auth.gs"));
  if (versionFermeeActive) {
    Logger.log((saasInscriptionOuverte() ? "❌" : "✅") + " Propriété SAAS_INSCRIPTION_OUVERTE : " +
               (saasInscriptionOuverte() ? "OUI (inscription rouverte !)" : "non (fermée)"));
  }

  const fu = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_UTILISATEURS);
  const fs = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_SESSIONS);
  if (!fu) { Logger.log("❌ Feuille UTILISATEURS introuvable."); return; }

  const data = fu.getDataRange().getValues();
  let comptesTest = 0, comptesTestActifs = 0;
  Logger.log("--- Comptes ---");
  for (let i = 1; i < data.length; i++) {
    const email = String(data[i][1] || "").trim().toLowerCase();
    if (!email) continue;
    const estTest = SAAS_SEC_COMPTES_DE_TEST.indexOf(email) !== -1;
    const actif = String(data[i][8] || "").trim().toUpperCase() === "OUI";
    if (estTest) { comptesTest++; if (actif) comptesTestActifs++; }
    Logger.log("  " + (estTest ? "⚠️ COMPTE DE TEST " : "") + email + " | rôle " + (data[i][6] || "") +
               " | client " + (data[i][7] || "(aucun)") + " | actif " + (actif ? "OUI" : "NON"));
  }

  let sessionsActives = 0;
  if (fs) {
    const ds = fs.getDataRange().getValues();
    for (let i = 1; i < ds.length; i++) {
      if (String(ds[i][6] || "").toUpperCase() === "OUI" && !saasDateDepassee(String(ds[i][3] || ""))) sessionsActives++;
    }
  }
  Logger.log("");
  Logger.log("Comptes de test actifs : " + comptesTestActifs + " sur " + comptesTest);
  Logger.log("Sessions actives : " + sessionsActives);
  if (comptesTestActifs > 0) Logger.log("→ Lancer saasDesactiverComptesDeTest() pour les désactiver et fermer leurs sessions.");
  Logger.log("=================================================");
}

/**
 * Désactive (Actif = NON) les comptes de test connus et ferme leurs sessions.
 * Aucune ligne supprimée. Un compte ADMIN n'est jamais modifié. Sans danger si relancée.
 */
function saasDesactiverComptesDeTest() {
  Logger.log("=================================================");
  Logger.log("=== DÉSACTIVATION DES COMPTES DE TEST ===");
  Logger.log("=================================================");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const fu = ss.getSheetByName(SAAS_SHEET_UTILISATEURS);
  const fs = ss.getSheetByName(SAAS_SHEET_SESSIONS);
  if (!fu) { Logger.log("❌ Feuille UTILISATEURS introuvable."); return; }

  const data = fu.getDataRange().getValues();
  const idsDesactives = [];
  for (let i = 1; i < data.length; i++) {
    const email = String(data[i][1] || "").trim().toLowerCase();
    if (SAAS_SEC_COMPTES_DE_TEST.indexOf(email) === -1) continue;
    if (String(data[i][6] || "").trim().toUpperCase() === "ADMIN") {
      Logger.log("· " + email + " : compte ADMIN, ignoré.");
      continue;
    }
    if (String(data[i][8] || "").trim().toUpperCase() === "OUI") {
      fu.getRange(i + 1, 9).setValue("NON");
      Logger.log("✅ " + email + " : désactivé.");
      try { saasLogger(String(data[i][0] || ""), email, String(data[i][6] || ""), "COMPTE_TEST_DESACTIVE", "via éditeur Apps Script", "", true); } catch (e) {}
    } else {
      Logger.log("· " + email + " : déjà désactivé.");
    }
    idsDesactives.push(String(data[i][0] || ""));
  }

  let sessionsFermees = 0;
  if (fs && idsDesactives.length > 0) {
    const ds = fs.getDataRange().getValues();
    for (let i = 1; i < ds.length; i++) {
      if (idsDesactives.indexOf(String(ds[i][1] || "")) !== -1 && String(ds[i][6] || "").toUpperCase() === "OUI") {
        fs.getRange(i + 1, 7).setValue("NON");
        sessionsFermees++;
      }
    }
  }
  Logger.log("Sessions fermées : " + sessionsFermees);
  Logger.log("Vérifier avec saasVerifierEtatInscription().");
  Logger.log("=================================================");
}

// ============================================================================
// LOT S5a — CLÉ DU PROXY (secret partagé)
// ============================================================================
// Le secret est rangé dans la propriété du script PROXY_SHARED_SECRET. Il n'est JAMAIS écrit dans
// le journal : pour le copier, aller dans Paramètres du projet → Propriétés du script.
// ============================================================================

const SAAS_PROXY_PROP_SECRET = "PROXY_SHARED_SECRET";
const SAAS_PROXY_PROP_MODE = "PROXY_SECRET_MODE";
const SAAS_PROXY_MIN_APPELS_AVANT_ENFORCE = 5;   // appels valides exigés (6 dernières heures) avant d'imposer

function saasProxyFabriquerSecret() {
  // Deux identifiants aléatoires (générateur sécurisé de Google) : 64 caractères hexadécimaux
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "");
}

function saasProxyLireEtat() {
  const props = PropertiesService.getScriptProperties();
  return {
    secretLongueur: String(props.getProperty(SAAS_PROXY_PROP_SECRET) || "").length,
    mode: String(props.getProperty(SAAS_PROXY_PROP_MODE) || "OFF").trim().toUpperCase()
  };
}

/** Compte les appels des N dernières heures (mémoire cache, valeurs approximatives). */
function saasProxyCompterDepuis(heures) {
  const cache = CacheService.getScriptCache();
  let ok = 0, ko = 0;
  const detail = [];
  for (let h = 0; h < heures; h++) {
    const suffixe = Utilities.formatDate(new Date(new Date().getTime() - h * 3600000), "Africa/Douala", "yyyyMMddHH");
    const a = parseInt(cache.get("PX_OK_" + suffixe) || "0", 10) || 0;
    const b = parseInt(cache.get("PX_KO_" + suffixe) || "0", 10) || 0;
    ok += a; ko += b;
    detail.push({ heure: suffixe.substring(8) + "h", ok: a, ko: b });
  }
  return { ok: ok, ko: ko, detail: detail };
}

/**
 * ÉTAPE 1 — Crée le secret s'il n'existe pas encore (sinon ne change RIEN : le proxy continue de fonctionner).
 */
function saasProxyGenererSecret() {
  Logger.log("=================================================");
  Logger.log("=== CLÉ DU PROXY : GÉNÉRATION DU SECRET ===");
  Logger.log("=================================================");
  const props = PropertiesService.getScriptProperties();
  if (String(props.getProperty(SAAS_PROXY_PROP_SECRET) || "").length >= 32) {
    Logger.log("ℹ Un secret existe déjà : rien n'a été changé.");
    Logger.log("  (Pour le remplacer volontairement : saasProxyRegenererSecret().)");
  } else {
    props.setProperty(SAAS_PROXY_PROP_SECRET, saasProxyFabriquerSecret());
    Logger.log("✅ Secret créé (64 caractères) dans la propriété " + SAAS_PROXY_PROP_SECRET + ".");
  }
  Logger.log("Pour le copier : roue dentée (Paramètres du projet) → Propriétés du script → " + SAAS_PROXY_PROP_SECRET + ".");
  Logger.log("Ne le collez jamais dans une conversation ni dans le code : seulement dans les Secrets d'AI Studio.");
  Logger.log("Mode actuel : " + saasProxyLireEtat().mode + " (le mode OFF ne bloque rien).");
  Logger.log("=================================================");
}

/** Remplace le secret (rotation). Repasse en OBSERVE pour ne rien couper avant la mise à jour du proxy. */
function saasProxyRegenererSecret() {
  const props = PropertiesService.getScriptProperties();
  props.setProperty(SAAS_PROXY_PROP_SECRET, saasProxyFabriquerSecret());
  if (saasProxyLireEtat().mode === "ENFORCE") props.setProperty(SAAS_PROXY_PROP_MODE, "OBSERVE");
  Logger.log("✅ Nouveau secret créé. Le mode est OBSERVE (rien n'est refusé).");
  Logger.log("Mettez à jour le secret dans AI Studio, vérifiez saasProxyRapport(), puis saasProxyModeEnforce().");
}

function saasProxyModeOff() {
  PropertiesService.getScriptProperties().setProperty(SAAS_PROXY_PROP_MODE, "OFF");
  Logger.log("✅ Mode OFF : aucune vérification de clé (comportement d'origine).");
  Logger.log("⚠ Publier une nouvelle version du déploiement n'est PAS nécessaire pour changer de mode.");
}

function saasProxyModeObserve() {
  if (saasProxyLireEtat().secretLongueur < 32) {
    Logger.log("❌ Aucun secret : lancer d'abord saasProxyGenererSecret(). Mode inchangé.");
    return;
  }
  PropertiesService.getScriptProperties().setProperty(SAAS_PROXY_PROP_MODE, "OBSERVE");
  Logger.log("✅ Mode OBSERVE : la clé est vérifiée et comptée, mais RIEN n'est refusé.");
  Logger.log("Vérifier ensuite avec saasProxyRapport().");
}

/** Impose la clé. Refuse tant que le proxy n'a pas prouvé qu'il l'envoie. */
function saasProxyModeEnforce() {
  const etat = saasProxyLireEtat();
  if (etat.secretLongueur < 32) {
    Logger.log("❌ Aucun secret : lancer d'abord saasProxyGenererSecret(). Mode inchangé.");
    return;
  }
  const c = saasProxyCompterDepuis(6);
  if (c.ok < SAAS_PROXY_MIN_APPELS_AVANT_ENFORCE) {
    Logger.log("❌ REFUSÉ : seulement " + c.ok + " appel(s) valide(s) avec la clé sur les 6 dernières heures (minimum " +
               SAAS_PROXY_MIN_APPELS_AVANT_ENFORCE + ").");
    Logger.log("   Le proxy n'envoie pas encore la clé (ou n'a pas servi). Mode inchangé : " + etat.mode + ".");
    Logger.log("   Faites quelques actions dans l'application, puis relancez saasProxyRapport().");
    return;
  }
  PropertiesService.getScriptProperties().setProperty(SAAS_PROXY_PROP_MODE, "ENFORCE");
  Logger.log("✅ Mode ENFORCE : toute requête sans la bonne clé est maintenant refusée (403).");
  Logger.log("Si l'application ne répond plus : saasProxyModeObserve() la remet en marche immédiatement.");
}

/** Rapport en lecture seule : mode, secret, appels reçus avec/sans clé. */
function saasProxyRapport() {
  Logger.log("=================================================");
  Logger.log("=== CLÉ DU PROXY : RAPPORT (lecture seule) ===");
  Logger.log("=================================================");
  const etat = saasProxyLireEtat();
  Logger.log("Mode : " + etat.mode);
  Logger.log("Secret : " + (etat.secretLongueur >= 32 ? "présent (" + etat.secretLongueur + " caractères)" : "ABSENT ou trop court"));

  const c = saasProxyCompterDepuis(6);
  Logger.log("Appels comptés sur 6 heures (approximatifs, seulement en modes OBSERVE/ENFORCE) :");
  c.detail.slice().reverse().forEach(function (d) {
    Logger.log("   " + d.heure + " : avec clé valide " + d.ok + " | sans clé valide " + d.ko);
  });
  Logger.log("TOTAL : avec clé valide " + c.ok + " | sans clé valide " + c.ko);

  if (etat.mode === "OFF") {
    Logger.log("→ Mode OFF : rien n'est compté. Passer en observation : saasProxyModeObserve().");
  } else if (etat.mode === "OBSERVE") {
    if (c.ok >= SAAS_PROXY_MIN_APPELS_AVANT_ENFORCE && c.ko === 0) {
      Logger.log("✅ Tous les appels reçus portent la clé : vous pouvez lancer saasProxyModeEnforce().");
    } else if (c.ok >= SAAS_PROXY_MIN_APPELS_AVANT_ENFORCE) {
      Logger.log("⚠ Le proxy envoie la clé, mais " + c.ko + " appel(s) n'en avaient pas (proxy ancien, visiteurs ou robots).");
      Logger.log("  Si ces appels viennent de l'application, ne pas imposer. Sinon, saasProxyModeEnforce() est possible.");
    } else {
      Logger.log("→ Pas assez d'appels avec clé : le proxy ne l'envoie pas encore. Ne pas imposer.");
    }
  } else if (etat.mode === "ENFORCE") {
    Logger.log("✅ Clé imposée. Les appels « sans clé valide » ci-dessus ont été REFUSÉS.");
  }
  Logger.log("=================================================");
}

/**
 * TEST DU LOT S5a — logique de contrôle avec de fausses configurations : ne modifie ni le mode,
 * ni le secret, ni aucune feuille.
 */
function saasTesterProxyCle() {
  Logger.log("=================================================");
  Logger.log("=== TEST LOT S5a : CLÉ DU PROXY (logique) ===");
  Logger.log("=================================================");

  let ok = 0, ko = 0;
  const verifier = function (nom, condition, detail) {
    Logger.log((condition ? "  ✅ " : "  ❌ ") + nom + (detail ? " — " + detail : ""));
    if (condition) ok++; else ko++;
  };

  if (String(doPost).indexOf("saasProxyControle(") === -1 || String(doGet).indexOf("saasProxyControle(") === -1) {
    Logger.log("❌ TEST ANNULÉ : doGet/doPost n'appellent pas le contrôle de clé. Recoller SaaS_03_WebApp.gs (V1.1) dans son onglet.");
    return;
  }

  const S = "0123456789abcdef0123456789abcdef0123456789abcdef";   // faux secret de test (48 caractères)
  const cfg = function (mode, secret) { return { mode: mode, secret: secret === undefined ? S : secret, sansCompteur: true }; };
  const ev = { parameter: {} };

  let r = saasProxyControle({}, ev, cfg("OFF"));
  verifier("1. Mode OFF : une requête sans clé passe", r.autorise === true && r.valide === false);

  r = saasProxyControle({}, ev, cfg("OBSERVE"));
  verifier("2. Mode OBSERVE : une requête sans clé passe (mais n'est pas « valide »)", r.autorise === true && r.valide === false);

  let p = { proxyKey: S, route: "/ping" };
  r = saasProxyControle(p, ev, cfg("ENFORCE"));
  verifier("3. Mode ENFORCE : la bonne clé passe", r.autorise === true && r.valide === true);
  verifier("3b. La clé est retirée du contenu de la requête après contrôle", p.proxyKey === undefined && p.route === "/ping");

  r = saasProxyControle({ proxyKey: S + "x" }, ev, cfg("ENFORCE"));
  verifier("4. Mode ENFORCE : une mauvaise clé est refusée", r.autorise === false);

  r = saasProxyControle({}, ev, cfg("ENFORCE"));
  verifier("5. Mode ENFORCE : l'absence de clé est refusée", r.autorise === false);

  r = saasProxyControle({ proxyKey: "court" }, ev, cfg("ENFORCE", "court"));
  verifier("6. Sans vrai secret (trop court), ENFORCE est ignoré : on ne verrouille pas tout par erreur", r.autorise === true && r.valide === false);

  r = saasProxyControle({}, { parameter: { proxyKey: S } }, cfg("ENFORCE"));
  verifier("7. La clé est aussi acceptée dans l'URL (contrôle de secours)", r.valide === true);

  verifier("8. Comparaison de secrets : identiques / différents / longueurs différentes",
           saasComparerSecret("abc", "abc") === true && saasComparerSecret("abc", "abd") === false && saasComparerSecret("abc", "abcd") === false && saasComparerSecret("", "") === true);

  const etat = saasProxyLireEtat();
  Logger.log("  (État réel inchangé : mode " + etat.mode + ", secret " + (etat.secretLongueur >= 32 ? "présent" : "absent") + ")");

  Logger.log("");
  Logger.log("=== RÉSULTAT : " + ok + " contrôle(s) réussi(s), " + ko + " échec(s) ===");
}

// ============================================================================
// (ancien fichier SaaS_05_Integrite.gs)
// ============================================================================

/**
 * ============================================================================
 * CONTRÔLE D'INTÉGRITÉ DU PROJET ET DU DÉPLOIEMENT WEB (fusionné dans SaaS_04_Securite.gs)
 * ============================================================================
 * saasVerifierIntegriteFichiers() : vérifie, en lecture seule, que les 21 fichiers du projet sont
 * collés chacun dans leur onglet ET à jour, et signale les onglets à SUPPRIMER (anciens fichiers
 * de test). Aucune écriture, aucun e-mail, aucune connexion.
 *   · Chaque fichier commence par une ligne « // >>> FICHIER : Nom.gs <<< » : c'est le nom de
 *     l'onglet où il doit être collé.
 *   · Si l'éditeur affiche « SyntaxError: Identifier ... has already been declared @ Fichier.gs »,
 *     un fichier a été collé dans deux onglets : cette fonction ne peut pas s'exécuter tant que
 *     ce n'est pas corrigé ; l'onglet indiqué après le « @ » contient un doublon.
 *
 * saasVerifierDeploiement() : interroge l'application web depuis les serveurs de Google et
 * compare le numéro de version publié avec celui du code (voir le détail plus bas).
 * ============================================================================
 */

function saasVerifierIntegriteFichiers() {
  Logger.log("=================================================");
  Logger.log("=== INTÉGRITÉ DES FICHIERS DU PROJET (lecture seule) ===");
  Logger.log("Fichier : " + SpreadsheetApp.getActiveSpreadsheet().getName());
  Logger.log("=================================================");

  const source = function (nom) {
    try { return typeof globalThis[nom] === "function" ? String(globalThis[nom]) : ""; } catch (e) { return ""; }
  };

  const fichiers = [
    { nom: "Collecteur_ARMP.gs",
      fonctions: ["parseDateCameroun", "estDateCoherente", "decoderEntitesHtml", "extraireCleLien", "extraireNumeroAvis", "extraireRegionTexte", "extraireMaitreOuvrageTexte", "estimerDateLimiteLegale", "extraireDateCloture", "formaterMontantIA", "formaterDateLimiteIA", "armpLireCleApi", "executerCollecteARMP", "dedupliquerAvisRecents", "enrichirAvisRecentsAvecIA", "backfillNumeroAvis", "nettoyerDatesAberrantes"],
      marqueurs: [] },
    { nom: "Dashboard.gs",
      fonctions: ["rafraichirDashboard", "ecrireTitreSection", "ecrirePaire", "dbEnDate", "recupererEtatActuel", "recupererActivite7Jours", "recupererVentilationSources", "recupererTopClients", "recupererSanteCache"],
      marqueurs: [] },
    { nom: "Deduplication.gs",
      fonctions: ["dedupNormaliserNumero", "dedupNormaliserMO", "dedupSignatureFloue", "dedupExtraireIndiceLot", "dedupMontantNumerique", "dedupMontantCompat", "dedupEmpreinteForte", "dedupJaccard", "dedupEstNumeroFallback", "dedupNormaliserSource", "dedupMoSignificatifs", "dedupMoCompatibles", "dedupLotsCompatibles", "dedupItemDepuisChamps", "dedupScoreCompletude", "dedupSontEquivalentsInterSources", "dedupMarquerDoublon", "dedupLireContexte", "dedupDetecterDoublons", "dedupExecuterPostCollecte", "auditerDeduplication", "dedupliquerAvisRecents", "dedupTesterInterSources"],
      marqueurs: [{ fn: "dedupExecuterPostCollecte", contient: "croisees", libelle: "doublons inter-sources (lot 4)" }] },
    { nom: "EnvoiEmails.gs",
      fonctions: ["eeDetecterEnvironnement", "eeConstruireBandeauEnv", "eeConstruirePiedEnv", "extraireAdressesEmails", "verifierSiAvisExpire", "calculerJoursRestants", "genererBadgeEcheance", "eeChargerPromptsMetier", "eeEnteteAlertesConforme", "eeEcrireStatutsLignes", "executerEnvoiAlertes", "eeExecuterEnvoiInterne", "eeTesterEnvoiSecurise", "eeDiagnostiquerFileEnvoi"],
      marqueurs: [{ fn: "executerEnvoiAlertes", contient: "verrouExecuter", libelle: "envoi sous verrou (lot 6b)" },
                  { fn: "eeExecuterEnvoiInterne", contient: "eeEtatLiens", libelle: "lien de connexion dans l'e-mail (lot LC1)" },
                  { fn: "eeExecuterEnvoiInterne", contient: "eeEmettreLienPourGroupe", libelle: "lien émis pour le bon destinataire (lot PIL5)" }] },
    { nom: "IA_Gemini.gs",
      fonctions: ["iagLireQuotaJour", "iagSauverQuotaJour", "iagIncrementerQuota", "iagQuotaJour", "iagChargerCles", "iagLireClesDepuisProprietes", "iagAvertirCleDansFeuille", "iagLireClesGemini", "iagLireClesDeepSeek", "iagMasquerCle", "iagLireFlagDeepSeek", "iagDiagnosticConfigurationIA", "iagTesterRotationCles", "iagExtraireTexte", "iagParserJson", "iagNettoyerTexteLibre", "iagTenterGemini", "iagTenterDeepSeek", "iagRouterAppel", "iagConstruirePayloadGemini", "iagAppelerGemini", "iagAppelerGeminiTexte", "iagJobA_EnrichirAvis", "iagJobB_ScorerPaires", "iagJobC_ResumeClient", "iagJobD_AuditerQualite", "iagMigrerClesVersProprietes", "iagVerifierCoffreCles", "iagEffacerClesDeLaFeuille"],
      marqueurs: [{ fn: "iagLireClesGemini", contient: "IAG_PROP_CLES_GEMINI", libelle: "clés dans le coffre (lot 5)" }] },
    { nom: "IA_ProfilGen.gs",
      fonctions: ["iagPremiereCleGemini", "iagNormaliserPourComparaison", "iagEstDansListeNoire", "iagSignatureTokens", "iagJaccard", "iagHacherPrompt", "iagLireClient", "iagExplorerSite", "iagNettoyerHtmlPourProfil", "iagDecoderEntites", "iagExtraireLiensInternes", "iagExtraireHostname", "iagMemeDomaine", "iagNormaliserUrl", "iagScorePrioriteUrl", "iagConsoliderPages", "iagAppelerGeminiJSON", "iagPasseA_Rappel", "iagPasseB_Racines", "iagPasseC_CasLimites", "iagFusionnerInclusions", "iagFusionnerExclusions", "iagFusionnerMO", "iagTesterCouverture", "iagGenererProfilCompact", "iagHacherProfilCompact", "iagGenererProfilClient", "iagEcrireProfilEnrichi", "iagInitialiserProfilsCompacts", "iagRegenererProfilCompact", "genererProfilArchiDia", "genererProfilERE", "iagGenererTousProfils", "iagVerifierFraicheurProfils", "iagTesterCrawlSite"],
      marqueurs: [] },
    { nom: "MatchingClients.gs",
      fonctions: ["chargerCacheIA", "purgerCacheIASiNecessaire", "purgerCacheIA", "chargerTentativesIA", "sauverTentativesIA", "mcTempsEcouleMs", "marquerLignesStatut", "extraireMontantNumerique", "nettoyerTexte", "testerPresenceMot", "normaliserProcedure", "mc3EstSourceInternationale", "mc3SousScoreMotsCles", "mc3SousScoreRegion", "mc3SousScoreProcedure", "mc3SousScoreMontant", "mc3SousScoreMO", "mc3SousScoreSource", "mc3CalculerScore", "mc3FiltrerGardeFou", "mc3ResumerProfil", "chargerProfilsEnrichis", "appelerGeminiMatrice", "executerMatchingClients", "mc4ConstruireContexteEquivalence", "mc4ItemDepuisAvis", "mc4TrouverAlerteEquivalente", "mc4EnregistrerAlerte", "mc4TesterFiletDoublonSource"],
      marqueurs: [{ fn: "executerMatchingClients", contient: "mc4TrouverAlerteEquivalente", libelle: "filet anti-doublon inter-sources (lot 4)" }] },
    { nom: "Monitoring.gs",
      fonctions: ["mtAuditerSanteMatching", "mtAnalyserCache", "mtAnalyserAlertes", "mtAnalyserJournal", "mtAnalyserSources", "mtComparerPeriodes", "mtDiagnostiquerSante", "mtConstruireEmailCritique", "mtPad", "mtBarre", "mtEnvoyerRapportHebdoSante", "installerTriggerMonitoringHebdo", "listerTriggersActifs"],
      marqueurs: [] },
    { nom: "Orchestration.gs",
      fonctions: ["orchCompterAvisNouveaux", "orchRattraperAvisNouveaux", "orchJourDouala", "orchLireEtatNuit", "orchEcrireEtatNuit", "lireHeureDepuisCellule", "appelerCollecteurSecurise", "executerPipelineCollecteMultiSources", "executerDeduplicationCrossSource", "orchAvecVerrou", "routineNuit_CollecteEtMatching", "orchExecuterRoutineNuit", "routineMatin_ExpeditionEmails", "orchExecuterRoutineMatin", "lancerRoutineVeilleQuotidienneComplete", "orchExecuterSessionComplete", "testerOrchestrationSansEmail", "orchExecuterTestSansEmail", "installerDeclencheursAutomatiques", "listerDeclencheursActifs", "orchTesterRattrapageMatinSimulation", "orchTesterRattrapageMatinReel"],
      marqueurs: [{ fn: "routineNuit_CollecteEtMatching", contient: "orchAvecVerrou", libelle: "routines sous verrou (lot 6b)" },
                  { fn: "orchRattraperAvisNouveaux", contient: "ORCH_BUDGET_RATTRAPAGE_MATIN_MS", libelle: "rattrapage du matin (lot 3)" }] },
    { nom: "Reporting.gs",
      fonctions: ["rpDetecterEnvironnement", "rpConstruireBandeauEnv", "initialiserMetriquesSession", "envoyerAlerteCritiqueImmediate", "detecterCollecteMuetteRecurrente", "envoyerAuditQualiteIAPeriode", "reinitialiserAuditIA", "finaliserEtConsignerRapport"],
      marqueurs: [] },
    { nom: "SaaS_01_Utils.gs",
      fonctions: ["saasReponse", "saasErreur", "saasGenererSel", "saasHacherMotDePasse", "saasVerifierMotDePasse", "saasGenererToken", "saasDateMaintenant", "saasDateAjout", "saasDateDepassee", "saasCreerSession", "saasVerifierToken", "saasInvaliderSession", "saasPurgerSessionsExpirees", "saasLogger", "saasTrouverUtilisateurParEmail", "saasTrouverUtilisateurParId", "saasMettreAJourDerniereConnexion", "saasEmailValide", "saasMotDePasseValide", "saasTelephoneValide", "saasLirePayloadPost", "saasExtraireToken", "saasExtraireIp", "saasExtraireUserAgent", "saasGenererId", "saasDebugAdmin", "saasFixAdminExistant", "saasInitialiserStructure", "saasCreerFeuilleSiAbsente", "saasDiagnosticStructure"],
      constantes: ["SAAS_SHEET_UTILISATEURS", "SAAS_SHEET_SESSIONS", "SAAS_SHEET_AUDIT_LOG", "SAAS_SHEET_PREFS"],
      marqueurs: [{ fn: "saasFixAdminExistant", contient: "retirée", libelle: "version du lot S3 (identifiants retirés)" }] },
    { nom: "SaaS_02_Auth.gs",
      fonctions: ["saasInscriptionOuverte", "saasAuthRegister", "saasLimiteEmpreinte", "saasLimiteEstBloque", "saasLimiteReinitialiser", "saasLimiteEnregistrerEchec", "saasLimiteEchapper", "saasLimiteNotifierBlocage", "saasAuthLogin", "saasAuthLogout", "saasAuthVerify", "saasAuthGetCurrentUser", "saasCreerPreferencesParDefaut", "saasAdminResetMotDePasse", "saasTestHelperLogin", "saasTestHelperPing", "saasDiagLoginComplet", "saasTesterInscriptionFermee", "saasTesterLimiteConnexion", "saasLienActif", "saasLienUrlBase", "saasLienActiver", "saasLienDesactiver", "saasLienInitialiserOnglet", "saasLienGenererJeton", "saasLienHacher", "saasLienDestinataireEligible", "saasLienEmettre", "saasLienTrouverLigneParId", "saasLienConfirmerEnvoi", "saasLienAnnuler", "saasLienEstBloque", "saasLienEnregistrerEchec", "saasAuthLien", "saasLienControleDestinataires", "saasLienRapport", "saasLienTesterCycle"],
      constantes: ["SAAS_SHEET_LIENS"],
      marqueurs: [{ fn: "saasAuthRegister", contient: "saasInscriptionOuverte()", libelle: "inscription FERMÉE (lot S2)" },
                  { fn: "saasAuthLogin", contient: "saasLimiteEstBloque(", libelle: "limite des tentatives de connexion (lot S4)" },
                  { fn: "saasAuthLien", contient: "saasLienEstBloque(", libelle: "lien de connexion à usage unique (lot LC1)" }] },
    { nom: "SaaS_03_WebApp.gs",
      fonctions: ["saasComparerSecret", "saasProxyCompter", "saasProxyControle", "saasProxyRefuser", "doGet", "doPost", "saasRouter", "saasCreerAdminParDefaut", "saasCreerAdminDepuisProprietes", "saasTesterRouteur", "saasVerifierInstallationPhase3", "saasVerifierInstallationPhase3AvecToken", "saasTesterS3"],
      marqueurs: [{ fn: "doGet", contient: "réf.", libelle: "erreurs sans fuite (lot S3)" },
                  { fn: "doPost", contient: "saasProxyControle(", libelle: "contrôle de la clé du proxy (lot S5a)" },
                  { fn: "saasRouter", contient: "SAAS_BUILD", libelle: "numéro de version dans /ping (lot S4)" },
                  { fn: "saasRouter", contient: "saasAuthLien", libelle: "route /auth/lien (lot LC1)" },
                  { fn: "saasRouter", contient: "saasPiloteConfirmer", libelle: "route /public/pilote/confirmer (lot PIL3)" }] },
    { nom: "SaaS_04_Securite.gs",
      fonctions: ["saasSecMotifMotDePasseFaible", "saasSecTrouverAdmin", "saasDefinirMotDePasseAdmin", "saasVerifierSecuriteAdmin", "saasVerifierEtatInscription", "saasDesactiverComptesDeTest", "saasProxyFabriquerSecret", "saasProxyLireEtat", "saasProxyCompterDepuis", "saasProxyGenererSecret", "saasProxyRegenererSecret", "saasProxyModeOff", "saasProxyModeObserve", "saasProxyModeEnforce", "saasProxyRapport", "saasTesterProxyCle"],
      marqueurs: [{ fn: "saasVerifierEtatInscription", contient: "versionFermeeActive", libelle: "version 1.2 (lots S1/S2/S5a)" }] },
    { nom: "SaaS_10_Client.gs",
      fonctions: ["saasMigrerPhase2", "saasLireHeader", "saasLireClientComplet", "saasLireProfilEnrichi", "saasSplitCSV", "saasMajChampClient", "saasLirePreferences", "saasRouterClient", "saasClientGetProfile", "saasClientUpdateProfile", "saasClientUpdatePrompt", "saasClientUpdateSite", "saasClientRegenerateProfile", "saasClientGetPreferences", "saasClientUpdatePreferences", "saasClientUpdateAccount", "saasClientChangePassword", "saasClientGetSources", "saasTesterSourcesFraicheur"],
      marqueurs: [{ fn: "saasRouterClient", contient: "/sources", libelle: "fraîcheur des sources (chantier D)" },
                  { fn: "saasRouterClient", contient: "/account/etat", libelle: "état du compte et premier mot de passe (lot PIL5)" }] },
    { nom: "SaaS_11_Alerts.gs",
      fonctions: ["saasRouterAlerts", "saasChargerStateUtilisateur", "saasSauverState", "saasSauverStateLu", "saasChargerMapAvis", "saasChargerAlertesClient", "saasParserDateLimite", "saasAlertsList", "saasAlertsGet", "saasAlertsCount", "saasAlertsMark", "saasAlertsExport", "saasInitSuiviAvisEtNotes", "saasChargerSuiviClient", "saasSauverDecision", "saasCompterNotesClient", "saasChargerNotesAlerte", "saasAjouterNote", "saasAlertsSetDecision", "saasAlertsNotesList", "saasAlertsNotesAdd", "saasTesterDecisionEtNotes", "saasInitRecherchesSauvegardees", "saasNettoyerFiltresRecherche", "saasChargerRecherchesClient", "saasAlertsSavedSearchesList", "saasAlertsSavedSearchesCreate", "saasAlertsSavedSearchesToggle", "saasTesterRecherchesSauvegardees", "saasRouterStats", "saasFiltreParJours", "saasStatsDashboard", "saasStatsByRegion", "saasStatsByProcedure", "saasStatsTimeline", "saasStatsTopMO"],
      marqueurs: [{ fn: "saasRouterAlerts", contient: "/alerts/decision", libelle: "décision Go/No-Go et notes par avis (chantier A)" },
                  { fn: "saasAlertsList", contient: "expireFiltre", libelle: "archive des avis expirés (chantier D)" },
                  { fn: "saasRouterAlerts", contient: "/alerts/saved-searches", libelle: "recherches sauvegardées par client (chantier C)" }] },
    { nom: "SaaS_20_Admin.gs",
      fonctions: ["saasRouterAdmin", "saasAdminClientsList", "saasAdminClientDetail", "saasAdminClientCreate", "saasGenererIdClient", "saasAdminClientUpdate", "saasAdminClientToggle", "saasAdminClientToggleCascade", "saasAdminClientRegenerate", "saasAdminClientUpdateIAProfile", "saasAdminClientAlerts", "saasAdminClientCacheIA", "saasAdminClientAudit", "saasAdminClientGetPreferences", "saasAdminClientUpdatePreferences", "saasReglagesLirePARAMETRES_", "saasAdminReglagesGet", "saasAdminReglagesProxyMode", "saasAdminReglagesUpdateParametres", "saasAdminReglagesUpdateClesGemini", "saasAdminReglagesUpdateCleDeepSeek", "saasTesterReglagesA1", "saasTesterReglagesA2", "saasAdminUsersList", "saasAdminUserCreate", "saasAdminUserUpdate", "saasAdminUserToggle", "saasAdminUserResetPassword"],
      marqueurs: [{ fn: "saasRouterAdmin", contient: "/reglages", libelle: "écran Réglages : mode proxy, paramètres métier, clés API (lots A1/A2)" }] },
    { nom: "SaaS_21_AdminAudit.gs",
      fonctions: ["saasRouterAdminAudit", "saasAdminAuditList", "saasAdminSessionsList", "saasAdminSessionInvalidate", "saasAdminSessionPurge", "saasAdminStats", "saasRouterAdminActions", "saasAdminActionsList", "saasAdminActionsRun"],
      marqueurs: [] },
    { nom: "SaaS_24_DemandesPilote.gs",
      fonctions: ["saasPiloteDemande", "saasPiloteConfirmerProspect"],
      marqueurs: [{ fn: "saasPiloteDemande", contient: "saasPiloteSuiteAutomatique", libelle: "ouverture automatique (lot PIL2)" }] },
    { nom: "SaaS_25_PiloteAuto.gs",
      fonctions: ["saasPiloteAutoActif", "saasPiloteInviterConfirmation", "saasPiloteSuiteAutomatique", "saasPiloteCreerEspace_", "saasPiloteConfirmer", "saasPiloteAutoTester"],
      marqueurs: [] },
    { nom: "SaaS_26_PiloteCycle.gs",
      fonctions: ["saasPiloteExpirerEssais", "saasPiloteReleverAttente", "saasPiloteCycleQuotidien", "saasPiloteCycleSimuler", "saasPiloteCycleTester"],
      marqueurs: [] },
    { nom: "SaaS_28_LienAlerte.gs",
      fonctions: ["eeLiensActifs", "eeEtatLiens", "eeEmettreLienPourGroupe", "eeFinaliserLien", "eeConstruireBlocLien", "saasClientEtatCompte", "saasClientDefinirMotDePasse", "saasLienAlerteTester", "saasLot5ControleSante", "saasLot5SimulerEnvoi"],
      marqueurs: [] },
    { nom: "SanteQuotidienne.gs",
      fonctions: ["sqEchapper", "sqJourDeValeur", "sqHeureDeValeur", "sqControle", "sqNiveauMax", "sqCompterAvisNouveaux", "sqControleDeclencheurs", "sqControleNuit", "sqControleMatin", "sqControleFileAlertes", "sqControleAvisEnAttente", "sqControleQuota", "sqConstruireRapport", "sqLoguerRapport", "sqRendreEmail", "sqEnvoyerRapport", "sqRattraperNuit", "sqControleSanteQuotidien", "sqExecuterControle", "sqTesterControleSansAction", "sqTesterControleAvecEmail", "installerDeclencheurSanteQuotidienne", "desinstallerDeclencheurSanteQuotidienne"],
      marqueurs: [{ fn: "sqRattraperNuit", contient: "verrouExecuter", libelle: "rattrapage de nuit sous verrou (lot 6b)" }] },
    { nom: "Validation.gs",
      fonctions: ["val2EstSigleProtege", "val2NettoyerTexteBrut", "val2TitleCase", "val2TitleCaseMot", "val2DevelopperCodeRegion", "val2ArticlePourRegion", "val2EstBailleurConnu", "val2SeparerPartenaires", "val2ContientDejaPrefixe", "val2ReparerDoublePrefixe", "val2NormaliserMO", "val2RegionDepuisNom", "val2InfererRegionDepuisMO", "val2NormaliserRegion", "val2NormaliserProcedure", "val2NormaliserStatut", "val2NormaliserMontant", "val2NormaliserDateLimite", "val2NormaliserLigne", "val2ValeurPourComparaison", "val2CalculerCellulesModifiees", "val2EcrireModifications", "val2CalculerModifications", "val2ValiderFeuille", "validerEntreesNouvelles", "backfillNormalisationComplete", "auditerNormalisationEntrees", "val2TesterEcritureCiblee"],
      marqueurs: [{ fn: "validerEntreesNouvelles", contient: "val2ValiderFeuille", libelle: "écriture ciblée (lot 6a)" }] },
    { nom: "Verrou.gs",
      fonctions: ["verrouExecuter", "verrouTesterVerrou"],
      marqueurs: [] }
  ];

  // Anciens fichiers qui doivent avoir été SUPPRIMÉS (leurs fonctions ne doivent plus exister)
  const aSupprimer = [
    { nom: "Tests.gs", fonctions: ["lancerTestsUnites", "testerFormaterEcheance", "testerCollecteARMP", "testerMatchingSeul", "auditerMatchingDetaille", "testerJobC", "auditerPreFiltrage", "auditerProfilClient", "reactiverAvisPourTest", "verifierProfilsEnrichis"] },
    { nom: "LoadTest.gs", fonctions: ["ltVerifierEnvironnementTest", "ltInjecterClientsTest", "ltSupprimerClientsTest", "ltSnapshotEtat", "ltExecuterTestCharge", "ltDiagnosticEtat"] },
    { nom: "Harmonisation.gs", fonctions: ["harmoniserDiagnostiquer", "harmoniserAppliquer"] }
  ];

  let problemes = 0;
  const enEchec = [];
  fichiers.forEach(function (f) {
    const manquantes = f.fonctions.filter(function (n) { return typeof globalThis[n] !== "function"; });
    const constManquantes = (f.constantes || []).filter(function (c) {
      try { return typeof globalThis[c] === "undefined" && eval("typeof " + c) === "undefined"; } catch (e) { return true; }
    });
    const anciennes = f.marqueurs.filter(function (m) {
      const s = source(m.fn);
      return s !== "" && s.indexOf(m.contient) === -1;
    });

    if (manquantes.length === 0 && constManquantes.length === 0 && anciennes.length === 0) {
      Logger.log("✅ " + f.nom + " : présent et à jour (" + f.fonctions.length + " fonctions)");
    } else {
      problemes++;
      enEchec.push(f);
      if (manquantes.length > 0 || constManquantes.length > 0) {
        const total = f.fonctions.length + (f.constantes || []).length;
        const nb = manquantes.length + constManquantes.length;
        Logger.log("❌ " + f.nom + " : " + nb + "/" + total + " élément(s) introuvable(s)" +
                   (nb === total ? " — LE FICHIER EST ABSENT OU ÉCRASÉ PAR UN AUTRE CONTENU" : ""));
        Logger.log("     Manquants : " + manquantes.concat(constManquantes).slice(0, 6).join(", ") + (nb > 6 ? ", …" : ""));
      }
      anciennes.forEach(function (m) {
        Logger.log("❌ " + f.nom + " : ANCIENNE VERSION active (" + m.libelle + " absent). Recoller le nouveau fichier dans cet onglet.");
      });
    }
  });

  const restes = aSupprimer.filter(function (o) {
    return o.fonctions.some(function (n) { return typeof globalThis[n] === "function"; });
  });
  restes.forEach(function (o) {
    problemes++;
    Logger.log("❌ L'onglet « " + o.nom + " » existe encore : il doit être SUPPRIMÉ (⋮ à côté du nom du fichier → Supprimer).");
  });
  if (restes.length === 0) Logger.log("✅ Aucun ancien fichier de test ou de migration ne subsiste.");

  Logger.log("");
  if (problemes === 0) {
    Logger.log("✅ RÉSULTAT : les " + fichiers.length + " fichiers du projet sont en place et à jour.");
    Logger.log("   Vérifiez aussi que la liste des onglets contient EXACTEMENT ces " + fichiers.length + " noms (rien d'autre).");
  } else {
    Logger.log("❌ RÉSULTAT : " + problemes + " problème(s). Pour chaque fichier à recoller, la 1re ligne de son onglet doit être :");
    enEchec.forEach(function (f) { Logger.log("     // >>> FICHIER : " + f.nom + " <<<"); });
  }
  Logger.log("=================================================");
}

/**
 * Vérifie ce que le DÉPLOIEMENT WEB exécute réellement (et non ce qui est dans l'éditeur).
 * Appelle la route publique /ping depuis les serveurs de Google. Aucune écriture.
 * Si l'URL n'est pas trouvée automatiquement : propriété du script SAAS_URL_DEPLOIEMENT
 * = URL de l'application web (Déployer → Gérer les déploiements → « URL de l'application web »).
 *
 * V1.3 (lot S5a) : envoie la clé du proxy (lue dans le coffre) dans le corps d'une requête POST, et,
 * en mode ENFORCE, vérifie aussi qu'une requête SANS clé est bien refusée.
 */
function saasVerifierDeploiement() {
  Logger.log("=================================================");
  Logger.log("=== VÉRIFICATION DU DÉPLOIEMENT WEB (lecture seule) ===");
  Logger.log("Fichier : " + SpreadsheetApp.getActiveSpreadsheet().getName());
  Logger.log("=================================================");

  const props = PropertiesService.getScriptProperties();
  let url = String(props.getProperty("SAAS_URL_DEPLOIEMENT") || "").trim();
  let origine = "propriété SAAS_URL_DEPLOIEMENT";
  if (!url) {
    origine = "détection automatique";
    try { url = ScriptApp.getService().getUrl() || ""; } catch (e) { url = ""; }
  }

  if (!url) {
    Logger.log("❌ Aucune URL de déploiement trouvée automatiquement.");
    Logger.log("   Ajoutez la propriété du script SAAS_URL_DEPLOIEMENT (roue dentée → Propriétés du script)");
    Logger.log("   avec l'URL copiée dans Déployer → Gérer les déploiements, puis relancez.");
    return;
  }
  if (/\/dev$/.test(url)) {
    Logger.log("⚠️ L'URL détectée est une URL de TEST (/dev), pas le déploiement public. Utilisez la propriété SAAS_URL_DEPLOIEMENT.");
    return;
  }

  const masquee = url.length > 44 ? (url.substring(0, 32) + "…" + url.substring(url.length - 6)) : url;
  Logger.log("URL interrogée (" + origine + ") : " + masquee);

  const secret = String(props.getProperty("PROXY_SHARED_SECRET") || "");
  const mode = String(props.getProperty("PROXY_SECRET_MODE") || "OFF").trim().toUpperCase();
  Logger.log("Clé du proxy : mode " + mode + ", secret " + (secret.length >= 32 ? "présent" : "absent"));

  // Appel principal : avec la clé (POST) si elle existe, sinon requête GET simple
  let reponse;
  try {
    if (secret.length >= 32) {
      reponse = UrlFetchApp.fetch(url, {
        method: "post", contentType: "application/json", muteHttpExceptions: true, followRedirects: true,
        payload: JSON.stringify({ route: "/ping", methodeHttp: "GET", proxyKey: secret })
      });
    } else {
      reponse = UrlFetchApp.fetch(url + (url.indexOf("?") === -1 ? "?" : "&") + "route=/ping",
                                  { muteHttpExceptions: true, followRedirects: true });
    }
  } catch (e) {
    Logger.log("❌ Appel impossible : " + e.message);
    return;
  }

  const code = reponse.getResponseCode();
  const corps = String(reponse.getContentText() || "");
  Logger.log("Code HTTP reçu : " + code);

  if (code === 404) {
    Logger.log("❌ Déploiement introuvable (404) : URL périmée, déploiement supprimé ou copie incomplète.");
    return;
  }

  let json = null;
  try { json = JSON.parse(corps); } catch (e) { json = null; }

  if (!json) {
    const pageWeb = /<html|<!doctype/i.test(corps);
    Logger.log("❌ La réponse n'est pas celle de l'API" + (pageWeb
      ? " : une PAGE WEB est renvoyée (connexion Google demandée ? l'accès n'est peut-être pas « Tout le monde »)."
      : " : contenu inattendu."));
    return;
  }

  if (json.succes === false && Number(json.code) === 403) {
    Logger.log("❌ L'API refuse même la requête portant la clé du coffre : le secret publié n'est pas celui du coffre,");
    Logger.log("   ou une ancienne version est déployée. Publier une nouvelle version, ou saasProxyModeObserve().");
    return;
  }

  const buildPublie = json.donnees && json.donnees.build ? String(json.donnees.build) : "";
  const buildCode = (typeof SAAS_BUILD !== "undefined") ? SAAS_BUILD : "";

  Logger.log("✅ L'API répond (service : " + (json.donnees && json.donnees.service ? json.donnees.service : "?") + ").");
  Logger.log("Version publiée : " + (buildPublie || "(aucun numéro : ANCIEN CODE)"));
  Logger.log("Version du code dans l'éditeur : " + (buildCode || "?"));

  if (buildPublie && buildPublie === buildCode) {
    Logger.log("✅ Le déploiement exécute la DERNIÈRE version du code.");
  } else {
    Logger.log("❌ Le déploiement exécute une ANCIENNE version.");
    Logger.log("   → Déployer → Gérer les déploiements → crayon → Version : Nouvelle version → Déployer.");
  }

  // Contrôle du refus SANS clé (seulement pertinent en mode ENFORCE)
  if (mode === "ENFORCE" && buildPublie === buildCode) {
    try {
      const sansCle = UrlFetchApp.fetch(url + (url.indexOf("?") === -1 ? "?" : "&") + "route=/ping",
                                        { muteHttpExceptions: true, followRedirects: true });
      let j2 = null;
      try { j2 = JSON.parse(String(sansCle.getContentText() || "")); } catch (e) { j2 = null; }
      if (j2 && j2.succes === false && Number(j2.code) === 403) {
        Logger.log("✅ Une requête SANS clé est bien refusée (403 « Accès refusé »).");
      } else {
        Logger.log("❌ Une requête SANS clé n'est PAS refusée alors que le mode est ENFORCE : publier une nouvelle version du déploiement.");
      }
    } catch (e) {
      Logger.log("⚠️ Contrôle « sans clé » impossible : " + e.message);
    }
  } else if (mode !== "ENFORCE") {
    Logger.log("ℹ Mode " + mode + " : les requêtes sans clé sont encore acceptées (normal avant ENFORCE).");
  }

  Logger.log("=================================================");
}