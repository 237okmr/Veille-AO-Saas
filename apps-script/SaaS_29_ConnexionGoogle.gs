/**
 * ============================================================================
 * SaaS_29_ConnexionGoogle.gs — Connexion administrateur par Google (couche additive)
 * ============================================================================
 *
 * Rôle : ouvrir une session pour le compte ADMIN dont l'adresse a été authentifiée par Google.
 *
 * Principe de sécurité :
 *  - La vérification de l'identité Google (signature, audience, expiration) est faite par le
 *    serveur de l'application (server.ts), jamais par ce script.
 *  - Ce script n'accepte la demande que si le serveur présente le SECRET DÉDIÉ
 *    (propriété du script GOOGLE_ADMIN_SECRET), indépendant du secret du proxy : la route reste
 *    protégée même quand le proxy est en mode OFF ou OBSERVE.
 *  - Sans secret configuré, la route refuse tout (échec fermé).
 *  - Seul un compte de rôle ADMIN et actif (colonne Actif = OUI) obtient une session.
 *  - Aucune nouvelle feuille, aucun déclencheur, aucun appel à l'IA.
 *
 * Fonctions à lancer dans l'éditeur Apps Script (une fois, dans cet ordre) :
 *   1. saasGoogleGenererSecret()      -> crée le secret dédié (écrit dans les propriétés du script)
 *   2. saasGoogleTesterSansEcriture() -> contrôle de la route, sans écriture ni e-mail
 * ============================================================================
 */

const SAAS_GOOGLE_PROP_SECRET = "GOOGLE_ADMIN_SECRET";

/** Compare deux textes sans s'arrêter à la première différence (limite les fuites par le temps de réponse). */
function saasGoogleComparerSecrets(a, b) {
  const x = String(a || "");
  const y = String(b || "");
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) {
    diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Contrôle pur de la demande : aucune écriture, aucun effet de bord.
 * Retourne { ok, code, raison, user }.
 */
function saasGoogleVerifierDemande(payload) {
  const secretAttendu = String(PropertiesService.getScriptProperties().getProperty(SAAS_GOOGLE_PROP_SECRET) || "");
  if (secretAttendu.length < 32) {
    return { ok: false, code: 503, raison: "Secret Google non configuré" };
  }
  if (!payload || !saasGoogleComparerSecrets(payload.secretGoogle, secretAttendu)) {
    return { ok: false, code: 401, raison: "Secret Google invalide" };
  }
  const email = String(payload.email || "").trim().toLowerCase();
  if (!email || email.length > 200) {
    return { ok: false, code: 400, raison: "Adresse absente" };
  }
  const user = saasTrouverUtilisateurParEmail(email);
  if (!user) {
    return { ok: false, code: 401, raison: "Adresse inconnue", email: email };
  }
  if (user.role !== "ADMIN") {
    return { ok: false, code: 401, raison: "Compte non administrateur", email: email, user: user };
  }
  if (user.actif !== "OUI") {
    return { ok: false, code: 401, raison: "Compte administrateur désactivé", email: email, user: user };
  }
  return { ok: true, code: 200, raison: "OK", email: email, user: user };
}

/**
 * Route POST /auth/google-admin (appelée uniquement par le serveur de l'application).
 * @param {Object} payload { email, secretGoogle }
 */
function saasAuthGoogleAdmin(payload, e) {
  const ip = saasExtraireIp(e);
  const ua = saasExtraireUserAgent(e);

  const verdict = saasGoogleVerifierDemande(payload);

  if (!verdict.ok) {
    // Une ligne d'audit par refus, sans jamais écrire le secret.
    const idUser = verdict.user ? verdict.user.idUser : "";
    const role = verdict.user ? verdict.user.role : "";
    saasLogger(idUser, String(verdict.email || "").substring(0, 120), role, "LOGIN_GOOGLE", "Refus : " + verdict.raison, ip, false);
    // Message volontairement neutre : ne révèle ni l'existence du compte ni la cause exacte.
    if (verdict.code === 503) return saasErreur("Connexion Google indisponible.", 503);
    return saasErreur("Accès refusé.", 401);
  }

  const user = verdict.user;
  saasMettreAJourDerniereConnexion(user.ligne);
  const session = saasCreerSession(user.idUser, ip, ua);
  saasLogger(user.idUser, user.email, user.role, "LOGIN_GOOGLE", "Connexion réussie", ip, true);

  return saasReponse(true, {
    idUser: user.idUser,
    email: user.email,
    nom: user.nom,
    telephone: user.telephone,
    role: user.role,
    idClient: user.idClient,
    langue: user.langue,
    photoUrl: user.photoUrl,
    token: session ? session.token : null,
    expiration: session ? session.expiration : null
  }, "Connexion réussie.", 200);
}

// ---------------------------------------------------------------------------
// OUTILS À LANCER À LA MAIN DANS L'ÉDITEUR APPS SCRIPT
// ---------------------------------------------------------------------------

/** Crée le secret dédié s'il n'existe pas encore. N'écrase jamais un secret existant. */
function saasGoogleGenererSecret() {
  Logger.log("=================================================");
  Logger.log("=== CONNEXION GOOGLE ADMIN : SECRET DÉDIÉ ===");
  Logger.log("=================================================");
  const props = PropertiesService.getScriptProperties();
  if (String(props.getProperty(SAAS_GOOGLE_PROP_SECRET) || "").length >= 32) {
    Logger.log("ℹ Un secret existe déjà : rien n'a été changé.");
  } else {
    props.setProperty(SAAS_GOOGLE_PROP_SECRET, saasProxyFabriquerSecret());
    Logger.log("✅ Secret créé (64 caractères) dans la propriété " + SAAS_GOOGLE_PROP_SECRET + ".");
  }
  Logger.log("Pour le copier : roue dentée (Paramètres du projet) → Propriétés du script → " + SAAS_GOOGLE_PROP_SECRET + ".");
  Logger.log("Collez-le seulement dans les Secrets d'AI Studio (nom : GOOGLE_ADMIN_SECRET), jamais dans une conversation ni dans le code.");
  Logger.log("=================================================");
}

/**
 * Test sans écriture ni e-mail : n'appelle que le contrôle pur, jamais la création de session.
 * Attendu : secret absent -> 503 ; mauvais secret -> 401 ; bonne adresse administrateur -> 200.
 */
function saasGoogleTesterSansEcriture() {
  Logger.log("=== TEST CONNEXION GOOGLE (sans écriture) ===");
  const secret = String(PropertiesService.getScriptProperties().getProperty(SAAS_GOOGLE_PROP_SECRET) || "");
  Logger.log("Secret configuré : " + (secret.length >= 32 ? "OUI" : "NON (lancez saasGoogleGenererSecret)"));

  const sansSecret = saasGoogleVerifierDemande({ email: "x@x.cm" });
  Logger.log("1. Sans secret -> " + sansSecret.code + " (" + sansSecret.raison + ")  attendu : 401 ou 503");

  const mauvais = saasGoogleVerifierDemande({ email: "x@x.cm", secretGoogle: "mauvais" });
  Logger.log("2. Mauvais secret -> " + mauvais.code + " (" + mauvais.raison + ")  attendu : 401 ou 503");

  if (secret.length >= 32) {
    const inconnu = saasGoogleVerifierDemande({ email: "inconnu@example.com", secretGoogle: secret });
    Logger.log("3. Bon secret, adresse inconnue -> " + inconnu.code + " (" + inconnu.raison + ")  attendu : 401");

    const admin = saasGoogleVerifierDemande({ email: "237okmr@gmail.com", secretGoogle: secret });
    Logger.log("4. Bon secret, 237okmr@gmail.com -> " + admin.code + " (" + admin.raison + ")  attendu : 200");
  }
  Logger.log("Aucune session créée, aucune ligne écrite.");
}
