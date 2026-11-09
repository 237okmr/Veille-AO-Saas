// >>> FICHIER : SaaS_02_Auth.gs <<< (à coller dans l'onglet du même nom)
/**
 * ============================================================================
 * SAAS — AUTHENTIFICATION (V1.4 — LOTS S2 / S4 / S1b / LC1)
 * ============================================================================
 * V1.4 (LOT LC1) : connexion par lien à usage unique (fin du fichier). Jeton jamais stocké en clair
 * (empreinte SHA-256 dans l'onglet LIENS_CONNEXION), jamais de lien pour un ADMIN, désactivé par
 * défaut (propriété du script SAAS_LIEN_ACTIF), route POST /auth/lien.
 * V1.3 (LOT S1b) : le nom, le téléphone et la langue saisis à l'inscription passent par
 * secNeutraliserLigne (SecuriteDonnees.gs, dont ce script dépend) avant d'être écrits dans
 * UTILISATEURS : un texte qui commence par = + - @ n'est jamais exécuté comme une formule.
 *
 * Inscription, connexion, déconnexion, vérification de session.
 * V1.1 (LOT S2) : INSCRIPTION PUBLIQUE FERMÉE. Seul l'administrateur crée les comptes
 * (route admin /admin/users/create). Même si l'inscription était rouverte, le champ
 * idClient envoyé par l'appelant est IGNORÉ : un compte n'est jamais rattaché à un
 * client sans l'admin. Plus aucun mot de passe ni hash n'est écrit dans le journal.
 *
 * V1.2 (LOT S4) : LIMITE DES TENTATIVES DE CONNEXION, par adresse e-mail (l'adresse IP est
 * fournie par l'appelant : elle est falsifiable et n'est donc pas utilisée).
 *   · 5 échecs en 15 minutes => connexion bloquée pour cette adresse pendant 15 minutes.
 *   · Adresse inexistante ou mot de passe faux : même compteur, même message (pas de
 *     moyen de deviner quelles adresses existent). Un compte désactivé n'est révélé
 *     qu'à qui connaît le bon mot de passe.
 *   · Un e-mail d'alerte à l'administrateur au premier blocage (maximum un par heure).
 *   · Compteurs en mémoire cache du script (CacheService) : aucune écriture dans les feuilles,
 *     sauf une ligne d'audit par blocage.
 *   · Compromis assumé : quelqu'un peut bloquer 15 minutes une adresse en échouant exprès.
 *     Cela ne donne aucun accès ; l'administrateur garde la main depuis l'éditeur.
 *
 * Supporte Email/Mot de passe (Google Sign-In sera ajouté en Phase 2 via
 * le flux OAuth côté frontend qui transmettra un id_token Google).
 * ============================================================================
 */

/**
 * LOT S2 — L'inscription publique est FERMÉE par défaut.
 * Pour la rouvrir (déconseillé) : propriété du script SAAS_INSCRIPTION_OUVERTE = OUI.
 */
function saasInscriptionOuverte() {
  try {
    return String(PropertiesService.getScriptProperties().getProperty("SAAS_INSCRIPTION_OUVERTE") || "")
      .trim().toUpperCase() === "OUI";
  } catch (e) {
    return false;
  }
}

/**
 * Inscription d'un nouvel utilisateur (FERMÉE par défaut, voir ci-dessus).
 * Quand elle est ouverte, le rôle est CLIENT et AUCUN client n'est rattaché :
 * c'est l'administrateur qui associe un compte à un client.
 *
 * @param {Object} payload { email, motDePasse, nom, telephone, langue }
 * @param {Object} e objet de l'événement
 * @return {ContentService.TextOutput}
 */
function saasAuthRegister(payload, e) {
  const ip = saasExtraireIp(e);
  const ua = saasExtraireUserAgent(e);

  // --- LOT S2 : inscription fermée ---
  if (!saasInscriptionOuverte()) {
    // Une seule ligne d'audit par minute au plus (évite de saturer AUDIT_LOG par des appels en boucle)
    try {
      const cache = CacheService.getScriptCache();
      if (!cache.get("REGISTER_BLOQUE_LOG")) {
        cache.put("REGISTER_BLOQUE_LOG", "1", 60);
        saasLogger("", (payload && payload.email) ? String(payload.email).substring(0, 80) : "", "", "REGISTER_BLOQUE",
                   "Inscription publique fermée", ip, false);
      }
    } catch (eLog) {}
    return saasErreur("Les inscriptions sont fermées. Contactez l'administrateur.", 403);
  }

  // --- Validation ---
  if (!payload || !payload.email || !payload.motDePasse) {
    saasLogger("", payload && payload.email, "", "REGISTER", "Champs manquants", ip, false);
    return saasErreur("Email et mot de passe requis.", 400);
  }

  const email = String(payload.email).trim().toLowerCase();
  if (!saasEmailValide(email)) {
    saasLogger("", email, "", "REGISTER", "Email invalide", ip, false);
    return saasErreur("Email invalide.", 400);
  }

  if (!saasMotDePasseValide(payload.motDePasse)) {
    saasLogger("", email, "", "REGISTER", "Mot de passe trop court", ip, false);
    return saasErreur("Le mot de passe doit contenir au moins 8 caractères.", 400);
  }

  // --- Vérifier unicité ---
  if (saasTrouverUtilisateurParEmail(email)) {
    saasLogger("", email, "", "REGISTER", "Email déjà utilisé", ip, false);
    return saasErreur("Cet email est déjà utilisé.", 409);
  }

  // --- Créer l'utilisateur ---
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName(SAAS_SHEET_UTILISATEURS);
  if (!feuille) return saasErreur("Structure SaaS non initialisée.", 500);

  const idUser = saasGenererId("USR");
  const sel = saasGenererSel();
  const hash = saasHacherMotDePasse(payload.motDePasse, sel);
  const dateCreation = saasDateMaintenant();

  // Rôle toujours CLIENT. idClient TOUJOURS vide : l'admin rattache le compte à un client.
  const role = "CLIENT";
  const actif = "OUI";

  feuille.appendRow(secNeutraliserLigne([
    idUser,
    email,
    hash,
    sel,
    (payload.nom || "").toString().trim(),
    (payload.telephone || "").toString().trim(),
    role,
    "",
    actif,
    dateCreation,
    "",
    (payload.langue || "fr").toString(),
    ""
  ]));

  saasLogger(idUser, email, role, "REGISTER", "Création compte réussie (sans client)", ip, true);

  // Créer une session immédiatement
  const session = saasCreerSession(idUser, ip, ua);

  return saasReponse(true, {
    idUser: idUser,
    email: email,
    nom: payload.nom || "",
    role: role,
    idClient: "",
    token: session ? session.token : null,
    expiration: session ? session.expiration : null
  }, "Compte créé. Un administrateur doit le rattacher à un client.", 201);
}

// ---------------------------------------------------------------------------
// LOT S4 — LIMITE DES TENTATIVES DE CONNEXION
// ---------------------------------------------------------------------------

const SAAS_LIMITE_MAX_ECHECS = 5;          // échecs autorisés...
const SAAS_LIMITE_FENETRE_SEC = 900;       // ...dans cette fenêtre (15 minutes)
const SAAS_LIMITE_BLOCAGE_SEC = 900;       // durée du blocage (15 minutes)
const SAAS_LIMITE_ALERTE_PAUSE_SEC = 3600; // au plus un e-mail d'alerte par heure
var SAAS_LIMITE_ALERTE_EMAIL = true;       // le test le coupe pour la durée de son exécution

function saasLimiteEmpreinte(email) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(email || "").trim().toLowerCase())
  ).substring(0, 40);
}

function saasLimiteEstBloque(email) {
  try {
    return CacheService.getScriptCache().get("LB_" + saasLimiteEmpreinte(email)) !== null;
  } catch (e) {
    return false;   // en cas de panne du cache, on ne bloque pas les utilisateurs légitimes
  }
}

/** Efface le compteur d'échecs d'une adresse (après une connexion réussie). */
function saasLimiteReinitialiser(email) {
  try { CacheService.getScriptCache().remove("LE_" + saasLimiteEmpreinte(email)); } catch (e) {}
}

/**
 * Enregistre un échec de connexion. Au 5e échec dans la fenêtre : blocage + audit + alerte.
 * @return {boolean} true si l'adresse vient d'être bloquée
 */
function saasLimiteEnregistrerEchec(email, ip) {
  try {
    const cache = CacheService.getScriptCache();
    const h = saasLimiteEmpreinte(email);
    const maintenant = Date.now();

    let etat = null;
    try { etat = JSON.parse(cache.get("LE_" + h) || "null"); } catch (e) { etat = null; }
    if (!etat || (maintenant - etat.debut) > SAAS_LIMITE_FENETRE_SEC * 1000) {
      etat = { n: 0, debut: maintenant };
    }
    etat.n++;

    if (etat.n >= SAAS_LIMITE_MAX_ECHECS) {
      cache.put("LB_" + h, "1", SAAS_LIMITE_BLOCAGE_SEC);
      cache.remove("LE_" + h);
      saasLimiteNotifierBlocage(email, ip);
      return true;
    }

    const restant = Math.max(1, Math.ceil((etat.debut + SAAS_LIMITE_FENETRE_SEC * 1000 - maintenant) / 1000));
    cache.put("LE_" + h, JSON.stringify(etat), restant);
    return false;
  } catch (e) {
    Logger.log("[SAAS limite] Compteur indisponible : " + e.message);
    return false;
  }
}

function saasLimiteEchapper(t) {
  return String(t === null || t === undefined ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Ligne d'audit + e-mail d'alerte (au plus un par heure). */
function saasLimiteNotifierBlocage(email, ip) {
  const emailCourt = String(email || "").substring(0, 60);
  saasLogger("", emailCourt, "", "LOGIN_BLOQUE",
             SAAS_LIMITE_MAX_ECHECS + " échecs en " + Math.round(SAAS_LIMITE_FENETRE_SEC / 60) + " min : connexion bloquée " +
             Math.round(SAAS_LIMITE_BLOCAGE_SEC / 60) + " min", ip, false);

  if (!SAAS_LIMITE_ALERTE_EMAIL) return;
  try {
    const cache = CacheService.getScriptCache();
    if (cache.get("LIMITE_ALERTE_ENVOYEE") !== null) return;
    cache.put("LIMITE_ALERTE_ENVOYEE", "1", SAAS_LIMITE_ALERTE_PAUSE_SEC);

    const params = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("PARAMETRES");
    const emailAdmin = params ? String(params.getRange("H2").getValue() || "").trim() : "";
    if (!emailAdmin) return;

    const quand = Utilities.formatDate(new Date(), "Africa/Douala", "dd/MM/yyyy HH:mm");
    // L'adresse saisie par l'appelant est ÉCHAPPÉE : elle ne doit jamais pouvoir injecter du HTML.
    const corps = '<div style="font-family:Arial,sans-serif;max-width:560px;">' +
      '<h3 style="color:#b45309;">🔒 Connexions bloquées</h3>' +
      '<p>Après ' + SAAS_LIMITE_MAX_ECHECS + ' échecs en ' + Math.round(SAAS_LIMITE_FENETRE_SEC / 60) + ' minutes, la connexion pour l\'adresse ' +
      '<b>' + saasLimiteEchapper(emailCourt) + '</b> est bloquée pendant ' + Math.round(SAAS_LIMITE_BLOCAGE_SEC / 60) + ' minutes (' + saasLimiteEchapper(quand) + ').</p>' +
      '<p style="font-size:12px;color:#64748b;">Aucune action requise. Si c\'est vous, attendez la fin du blocage. ' +
      'Si vous ne reconnaissez pas cette tentative : consultez AUDIT_LOG et changez le mot de passe (saasDefinirMotDePasseAdmin). ' +
      'Un seul e-mail de ce type est envoyé par heure.</p></div>';
    GmailApp.sendEmail(emailAdmin, "[Veille AO] 🔒 Connexions bloquées — " + quand, "", { htmlBody: corps, name: "Veille AO — Sécurité" });
  } catch (e) {
    Logger.log("[SAAS limite] Alerte e-mail impossible : " + e.message);
  }
}

/**
 * Connexion utilisateur.
 * @param {Object} payload { email, motDePasse }
 */
function saasAuthLogin(payload, e) {
  const ip = saasExtraireIp(e);
  const ua = saasExtraireUserAgent(e);

  if (!payload || !payload.email || !payload.motDePasse) {
    return saasErreur("Email et mot de passe requis.", 400);
  }

  const email = String(payload.email).trim().toLowerCase();

  // --- LOT S4 : adresse temporairement bloquée ---
  if (saasLimiteEstBloque(email)) {
    try {
      const cache = CacheService.getScriptCache();
      const cleLog = "LL_" + saasLimiteEmpreinte(email);
      if (cache.get(cleLog) === null) {
        cache.put(cleLog, "1", 60);   // une ligne d'audit par minute au plus
        saasLogger("", email.substring(0, 60), "", "LOGIN", "Tentative pendant un blocage", ip, false);
      }
    } catch (eLog) {}
    return saasErreur("Trop de tentatives de connexion. Réessayez dans " + Math.round(SAAS_LIMITE_BLOCAGE_SEC / 60) + " minutes.", 429);
  }

  const user = saasTrouverUtilisateurParEmail(email);

  if (!user) {
    saasLogger("", email, "", "LOGIN", "Utilisateur introuvable", ip, false);
    saasLimiteEnregistrerEchec(email, ip);
    return saasErreur("Email ou mot de passe incorrect.", 401);
  }

  // Mot de passe vérifié AVANT l'état du compte : un compte désactivé n'est révélé qu'à qui connaît le bon mot de passe.
  if (!saasVerifierMotDePasse(payload.motDePasse, user.sel, user.hash)) {
    saasLogger(user.idUser, email, user.role, "LOGIN", "Mot de passe incorrect", ip, false);
    saasLimiteEnregistrerEchec(email, ip);
    return saasErreur("Email ou mot de passe incorrect.", 401);
  }

  if (user.actif !== "OUI") {
    saasLogger(user.idUser, email, user.role, "LOGIN", "Compte désactivé", ip, false);
    return saasErreur("Compte désactivé. Contactez l'administrateur.", 403);
  }

  saasLimiteReinitialiser(email);

  // Mettre à jour la dernière connexion
  saasMettreAJourDerniereConnexion(user.ligne);

  // Créer une session
  const session = saasCreerSession(user.idUser, ip, ua);

  saasLogger(user.idUser, email, user.role, "LOGIN", "Connexion réussie", ip, true);

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

/**
 * Déconnexion.
 */
function saasAuthLogout(payload, e) {
  const token = saasExtraireToken(e, payload);
  const ip = saasExtraireIp(e);

  if (!token) return saasErreur("Token manquant.", 400);

  const session = saasVerifierToken(token);
  const user = session ? saasTrouverUtilisateurParId(session.idUser) : null;

  saasInvaliderSession(token);
  saasLogger(
    user ? user.idUser : "", user ? user.email : "",
    user ? user.role : "", "LOGOUT", "Déconnexion", ip, true
  );

  return saasReponse(true, null, "Déconnexion réussie.", 200);
}

/**
 * Vérifie la validité d'un token et retourne l'utilisateur.
 */
function saasAuthVerify(payload, e) {
  const token = saasExtraireToken(e, payload);
  if (!token) return saasErreur("Token manquant.", 400);

  const session = saasVerifierToken(token);
  if (!session) return saasErreur("Session invalide ou expirée.", 401);

  const user = saasTrouverUtilisateurParId(session.idUser);
  if (!user) return saasErreur("Utilisateur introuvable.", 404);
  if (user.actif !== "OUI") return saasErreur("Compte désactivé.", 403);

  return saasReponse(true, {
    idUser: user.idUser,
    email: user.email,
    nom: user.nom,
    telephone: user.telephone,
    role: user.role,
    idClient: user.idClient,
    langue: user.langue,
    photoUrl: user.photoUrl,
    expiration: session.dateExpiration
  }, "Session valide.", 200);
}

/**
 * Retourne l'utilisateur courant à partir de l'événement (utilisé par le routeur).
 * @return {Object|null}
 */
function saasAuthGetCurrentUser(e, payload) {
  const token = saasExtraireToken(e, payload);
  if (!token) return null;
  const session = saasVerifierToken(token);
  if (!session) return null;
  const user = saasTrouverUtilisateurParId(session.idUser);
  if (!user || user.actif !== "OUI") return null;
  user.token = token;
  return user;
}

/**
 * Crée des préférences par défaut pour un client.
 */
function saasCreerPreferencesParDefaut(idClient) {
  if (!idClient) return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName(SAAS_SHEET_PREFS);
  if (!feuille) return;

  // Vérifier si déjà présent
  const data = feuille.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if ((data[i][0] || "").toString() === idClient) return;
  }

  feuille.appendRow([
    idClient,
    "OUI",       // Notif_Email
    "NON",       // Notif_WhatsApp
    "OUI",       // Notif_InApp
    "",          // WhatsApp_Numero
    "QUOTIDIEN", // Frequence_Digest
    "07:00",     // Heure_Preferee
    "fr"         // Langue
  ]);
}

/**
 * Réinitialise le mot de passe (admin uniquement).
 * @param {string} emailCible
 * @param {string} nouveauMotDePasse
 */
function saasAdminResetMotDePasse(emailCible, nouveauMotDePasse) {
  if (!saasMotDePasseValide(nouveauMotDePasse)) {
    return saasErreur("Mot de passe trop court (8 caractères minimum).", 400);
  }
  const user = saasTrouverUtilisateurParEmail(emailCible);
  if (!user) return saasErreur("Utilisateur introuvable.", 404);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName(SAAS_SHEET_UTILISATEURS);
  const nouveauSel = saasGenererSel();
  const nouveauHash = saasHacherMotDePasse(nouveauMotDePasse, nouveauSel);

  feuille.getRange(user.ligne, 3).setValue(nouveauHash);
  feuille.getRange(user.ligne, 4).setValue(nouveauSel);

  // Invalider toutes les sessions de cet utilisateur
  const fs = ss.getSheetByName(SAAS_SHEET_SESSIONS);
  if (fs) {
    const ds = fs.getDataRange().getValues();
    for (let i = 1; i < ds.length; i++) {
      if ((ds[i][1] || "").toString() === user.idUser) {
        fs.getRange(i + 1, 7).setValue("NON");
      }
    }
  }

  return saasReponse(true, { idUser: user.idUser }, "Mot de passe réinitialisé.", 200);
}
/**
 * 📄 SaaS_02_Auth.gs — saasTestHelperLogin(email, motDePasse)
 * Utilitaire de test : se connecte en local et retourne le token.
 * À utiliser UNIQUEMENT depuis l'éditeur Apps Script. NE PAS EXPOSER VIA HTTP.
 * V1.1 : plus aucun identifiant par défaut — email ET mot de passe sont obligatoires.
 */
function saasTestHelperLogin(email, motDePasse) {
  if (!email || !motDePasse) {
    Logger.log("❌ email et motDePasse sont obligatoires (aucun identifiant par défaut).");
    return null;
  }
  const rep = saasAuthLogin({ email: email, motDePasse: motDePasse }, { parameter: {} });
  const json = JSON.parse(rep.getContent());
  Logger.log("=== RÉSULTAT LOGIN ===");
  Logger.log(json.succes ? "✅ Connexion réussie (rôle " + (json.donnees && json.donnees.role) + ")" : "❌ " + json.message);
  return json;
}

/**
 * 📄 SaaS_02_Auth.gs — saasTestHelperPing()
 * Test rapide sans identifiants.
 */
function saasTestHelperPing() {
  const rep = saasRouter("GET", "/client/alerts/count", {}, { parameter: {} });
  Logger.log(rep.getContent());
}

/**
 * 📄 SaaS_02_Auth.gs — saasDiagLoginComplet(email, motDePasse)
 * Déroule le processus de login pas à pas. V1.1 : n'affiche JAMAIS le mot de passe
 * ni le hash ni le sel.
 * Usage : saasDiagLoginComplet("adresse@exemple.com", "mot de passe")
 */
function saasDiagLoginComplet(email, motDePasse) {
  Logger.log("=================================================");
  Logger.log("=== DIAGNOSTIC LOGIN ===");
  Logger.log("Fichier : " + SpreadsheetApp.getActiveSpreadsheet().getName());
  Logger.log("=================================================");

  if (!email || !motDePasse) {
    Logger.log("❌ ARGUMENTS MANQUANTS : la fonction doit être appelée avec un e-mail et un mot de passe.");
    Logger.log("   (Sélectionner la fonction puis ▶ Exécuter passe des arguments vides.)");
    return;
  }

  const emailNet = String(email).trim().toLowerCase();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName(SAAS_SHEET_UTILISATEURS);
  if (!feuille) { Logger.log("❌ Feuille UTILISATEURS absente."); return; }

  const data = feuille.getDataRange().getValues();
  let userLigne = null;
  for (let i = 1; i < data.length; i++) {
    if ((data[i][1] || "").toString().trim().toLowerCase() === emailNet) { userLigne = data[i]; break; }
  }
  if (!userLigne) {
    Logger.log("❌ Aucun utilisateur avec cet e-mail. Le login répondra 401.");
    return;
  }
  Logger.log("✅ Utilisateur trouvé — rôle " + userLigne[6] + ", actif : " + userLigne[8]);

  const hashStocke = (userLigne[2] || "").toString();
  const selStocke = (userLigne[3] || "").toString();
  Logger.log("Hash présent : " + (hashStocke.length > 0 ? "oui" : "NON") + " | sel présent : " + (selStocke.length > 0 ? "oui" : "NON"));
  Logger.log("Mot de passe correct : " + (saasVerifierMotDePasse(String(motDePasse), selStocke, hashStocke) ? "✅ oui" : "❌ non"));

  const rep = saasAuthLogin({ email: emailNet, motDePasse: String(motDePasse) }, { parameter: {}, headers: {} });
  const json = JSON.parse(rep.getContent());
  Logger.log(json.succes ? "✅ LE LOGIN FONCTIONNE." : "❌ LE LOGIN ÉCHOUE (code " + json.code + " : " + json.message + ")");
  Logger.log("=================================================");
}

/**
 * TEST DU LOT S2 — l'inscription publique est fermée.
 * Ne crée AUCUN compte. Peut ajouter au plus une ligne REGISTER_BLOQUE dans AUDIT_LOG.
 */
function saasTesterInscriptionFermee() {
  Logger.log("=================================================");
  Logger.log("=== TEST LOT S2 : INSCRIPTION FERMÉE ===");
  Logger.log("=================================================");

  // GARDE-FOU : on n'appelle JAMAIS la vraie inscription si la version active n'est pas la version
  // fermée. Sans cela, ce test créerait de vrais comptes (cas d'un ancien fichier encore actif).
  const versionFermeeActive = (typeof saasInscriptionOuverte === "function") &&
                              String(saasAuthRegister).indexOf("saasInscriptionOuverte()") !== -1;
  if (!versionFermeeActive) {
    Logger.log("❌ TEST ANNULÉ : la version ACTIVE de saasAuthRegister n'est pas la version fermée (V1.1b).");
    Logger.log("   Aucun compte n'a été créé. Recollez SaaS_02_Auth.gs DANS L'ONGLET SaaS_02_Auth.gs,");
    Logger.log("   vérifiez qu'aucun autre onglet ne contient une copie de ce code, puis relancez.");
    Logger.log("   Diagnostic possible : saasVerifierEtatInscription() (SaaS_04_Securite.gs).");
    return;
  }
  if (saasInscriptionOuverte()) {
    Logger.log("❌ TEST ANNULÉ : l'inscription est OUVERTE (propriété SAAS_INSCRIPTION_OUVERTE = OUI). Aucun compte créé.");
    return;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName(SAAS_SHEET_UTILISATEURS);
  if (!feuille) { Logger.log("❌ Feuille UTILISATEURS absente."); return; }
  const avant = feuille.getLastRow();

  let ok = 0, ko = 0;
  const verifier = function (nom, condition, detail) {
    Logger.log((condition ? "  ✅ " : "  ❌ ") + nom + (detail ? " — " + detail : ""));
    if (condition) ok++; else ko++;
  };

  verifier("1. L'inscription est fermée par défaut", saasInscriptionOuverte() === false,
           "propriété SAAS_INSCRIPTION_OUVERTE = " + (PropertiesService.getScriptProperties().getProperty("SAAS_INSCRIPTION_OUVERTE") || "(absente)"));

  const rep = saasAuthRegister({ email: "test-ferme@example.com", motDePasse: "Test-Ferme-12345", idClient: "CLI_001", nom: "Test" },
                               { parameter: {}, headers: {} });
  const json = JSON.parse(rep.getContent());
  verifier("2. Une tentative avec un idClient reçoit un refus 403", json.succes === false && json.code === 403, "code " + json.code + " — " + json.message);
  verifier("3. Aucun compte n'a été créé", feuille.getLastRow() === avant, "lignes UTILISATEURS : " + avant + " → " + feuille.getLastRow());
  verifier("4. Aucune session n'a été renvoyée", !(json.donnees && json.donnees.token));

  const repVide = saasRouter("POST", "/auth/register", { email: "autre@example.com", motDePasse: "Autre-12345678", idClient: "CLI_002" }, { parameter: {} });
  const jsonVide = JSON.parse(repVide.getContent());
  verifier("5. Même refus en passant par le routeur public", jsonVide.succes === false && jsonVide.code === 403);

  Logger.log("");
  Logger.log("=== RÉSULTAT : " + ok + " contrôle(s) réussi(s), " + ko + " échec(s) ===");
}

/**
 * TEST DU LOT S4 — limite des tentatives de connexion.
 * Utilise DEUX adresses inexistantes (@example.invalid) : aucun vrai compte n'est touché,
 * aucun e-mail n'est envoyé. Ajoute quelques lignes dans AUDIT_LOG (échecs + un blocage).
 */
function saasTesterLimiteConnexion() {
  Logger.log("=================================================");
  Logger.log("=== TEST LOT S4 : LIMITE DES TENTATIVES DE CONNEXION ===");
  Logger.log("=================================================");

  // GARDE-FOU : la version active de saasAuthLogin doit contenir la limitation
  if (String(saasAuthLogin).indexOf("saasLimiteEstBloque(") === -1) {
    Logger.log("❌ TEST ANNULÉ : la version ACTIVE de saasAuthLogin ne contient pas la limitation (lot S4).");
    Logger.log("   Recollez SaaS_02_Auth.gs dans l'onglet SaaS_02_Auth.gs puis relancez.");
    return;
  }

  let ok = 0, ko = 0;
  const verifier = function (nom, condition, detail) {
    Logger.log((condition ? "  ✅ " : "  ❌ ") + nom + (detail ? " — " + detail : ""));
    if (condition) ok++; else ko++;
  };

  const A = "test-bruteforce@example.invalid";
  const B = "autre-test@example.invalid";
  const evenement = { parameter: {}, headers: {} };
  const tenter = function (email) {
    return JSON.parse(saasAuthLogin({ email: email, motDePasse: "mauvais-mot-de-passe-1" }, evenement).getContent());
  };
  const nettoyer = function () {
    try {
      const cache = CacheService.getScriptCache();
      [A, B].forEach(function (m) {
        const h = saasLimiteEmpreinte(m);
        cache.remove("LE_" + h); cache.remove("LB_" + h); cache.remove("LL_" + h);
      });
    } catch (e) {}
  };

  const alerteAvant = SAAS_LIMITE_ALERTE_EMAIL;
  SAAS_LIMITE_ALERTE_EMAIL = false;   // aucun e-mail pendant le test
  nettoyer();
  try {
    const codes = [];
    for (let i = 0; i < SAAS_LIMITE_MAX_ECHECS; i++) codes.push(tenter(A).code);
    verifier("1. Les " + SAAS_LIMITE_MAX_ECHECS + " premiers échecs répondent 401", codes.every(function (c) { return c === 401; }), "codes : " + codes.join(", "));
    verifier("2. L'adresse est alors bloquée", saasLimiteEstBloque(A) === true);

    const r6 = tenter(A);
    verifier("3. La tentative suivante répond 429 (trop de tentatives)", r6.code === 429, "code " + r6.code + " — " + r6.message);

    const rB = tenter(B);
    verifier("4. Une autre adresse n'est pas affectée (401 normal)", rB.code === 401 && saasLimiteEstBloque(B) === false, "code " + rB.code);

    nettoyer();
    const rApres = tenter(A);
    verifier("5. Après déblocage, l'adresse répond de nouveau 401", rApres.code === 401 && saasLimiteEstBloque(A) === false, "code " + rApres.code);

    saasLimiteReinitialiser(A);
    for (let i = 0; i < SAAS_LIMITE_MAX_ECHECS - 1; i++) tenter(A);
    saasLimiteReinitialiser(A);   // équivaut à une connexion réussie
    tenter(A);
    verifier("6. Un compteur réinitialisé repart de zéro (pas de blocage)", saasLimiteEstBloque(A) === false);
  } catch (err) {
    Logger.log("  ❌ Exception pendant le test : " + err.message);
    ko++;
  } finally {
    nettoyer();
    SAAS_LIMITE_ALERTE_EMAIL = alerteAvant;
  }

  Logger.log("");
  Logger.log("=== RÉSULTAT : " + ok + " contrôle(s) réussi(s), " + ko + " échec(s) ===");
}

// ---------------------------------------------------------------------------
// LOT LC1 — LIEN DE CONNEXION À USAGE UNIQUE
// ---------------------------------------------------------------------------
// Principe : un e-mail d'alerte porte un lien personnel « /#acces=<64 caractères hexadécimaux> ».
//   · Le jeton n'est JAMAIS écrit dans la feuille : seule son empreinte SHA-256 l'est (LIENS_CONNEXION).
//   · Usage unique : le premier clic (bouton de l'écran d'accès) consomme le lien, sous verrou.
//   · Jamais de lien pour un compte ADMIN, ni pour un compte inactif ou sans client.
//   · Désactivé tant que la propriété du script SAAS_LIEN_ACTIF n'est pas égale à OUI.
//   · Aucune ligne n'est supprimée : le statut passe EMIS > ENVOYE > UTILISE / ANNULE / EXPIRE.
// ---------------------------------------------------------------------------

const SAAS_SHEET_LIENS = "LIENS_CONNEXION";
const SAAS_LIEN_COLONNES = [
  { nom: "ID_Lien", largeur: 170 },
  { nom: "Hash_Jeton", largeur: 330 },
  { nom: "ID_User", largeur: 170 },
  { nom: "Email", largeur: 220 },
  { nom: "ID_Client", largeur: 110 },
  { nom: "Date_Emission", largeur: 150 },
  { nom: "Date_Expiration", largeur: 150 },
  { nom: "Expiration_Ms", largeur: 130 },
  { nom: "Statut", largeur: 110 },
  { nom: "Date_Utilisation", largeur: 150 },
  { nom: "IP_Utilisation", largeur: 130 }
];
// Numéros de colonnes (base 1) dans LIENS_CONNEXION
const SAAS_LIEN_COL = { ID: 1, HASH: 2, USER: 3, EMAIL: 4, CLIENT: 5, EMISSION: 6, EXPIRATION: 7, EXPIRATION_MS: 8, STATUT: 9, UTILISATION: 10, IP: 11 };

const SAAS_LIEN_VALIDITE_ALERTE_HEURES = 168;   // 7 jours
const SAAS_LIEN_MAX_ACTIFS_PAR_USER = 5;        // au-delà, les plus anciens liens sont annulés
const SAAS_LIEN_MAX_ECHECS = 10;                // échecs par IP...
const SAAS_LIEN_FENETRE_SEC = 900;              // ...en 15 minutes...
const SAAS_LIEN_BLOCAGE_SEC = 900;              // ...blocage de 15 minutes
const SAAS_LIEN_URL_BASE_DEFAUT = "https://market-advisor.ai.studio";
const SAAS_LIEN_MESSAGE_INVALIDE = "Ce lien a expiré ou a déjà été utilisé. Utilisez le lien de votre prochain e-mail d'alerte ou connectez-vous avec votre mot de passe.";
var SAAS_LIEN_FORCER = null;                    // les tests le fixent (true/false) le temps de leur exécution

/** Vrai seulement si la propriété du script SAAS_LIEN_ACTIF vaut OUI (défaut : désactivé). */
function saasLienActif() {
  if (SAAS_LIEN_FORCER !== null) return SAAS_LIEN_FORCER === true;
  try {
    return String(PropertiesService.getScriptProperties().getProperty("SAAS_LIEN_ACTIF") || "").trim().toUpperCase() === "OUI";
  } catch (e) {
    return false;
  }
}

/** Adresse publique de l'application (sans barre finale). Propriété facultative : SAAS_LIEN_URL_BASE. */
function saasLienUrlBase() {
  let base = "";
  try { base = String(PropertiesService.getScriptProperties().getProperty("SAAS_LIEN_URL_BASE") || "").trim(); } catch (e) {}
  if (!/^https:\/\/[^\s\/]+(\/[^\s]*)?$/.test(base)) base = SAAS_LIEN_URL_BASE_DEFAUT;
  return base.replace(/\/+$/, "");
}

/** Interrupteur : à lancer à la main depuis l'éditeur, après validation. */
function saasLienActiver() {
  PropertiesService.getScriptProperties().setProperty("SAAS_LIEN_ACTIF", "OUI");
  saasLogger("", "", "", "LIEN_INTERRUPTEUR", "Connexion par lien ACTIVÉE", "", true);
  Logger.log("✅ Connexion par lien ACTIVÉE (SAAS_LIEN_ACTIF = OUI).");
}

function saasLienDesactiver() {
  PropertiesService.getScriptProperties().setProperty("SAAS_LIEN_ACTIF", "NON");
  saasLogger("", "", "", "LIEN_INTERRUPTEUR", "Connexion par lien DÉSACTIVÉE", "", true);
  Logger.log("✅ Connexion par lien DÉSACTIVÉE (SAAS_LIEN_ACTIF = NON).");
}

/** Crée l'onglet LIENS_CONNEXION s'il est absent (ajout pur, ne touche à aucun onglet existant). */
function saasLienInitialiserOnglet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const message = saasCreerFeuilleSiAbsente(ss, SAAS_SHEET_LIENS, SAAS_LIEN_COLONNES);
  const feuille = ss.getSheetByName(SAAS_SHEET_LIENS);
  if (feuille) {
    // Texte brut pour l'empreinte : Sheets ne doit jamais la lire comme un nombre.
    feuille.getRange(1, SAAS_LIEN_COL.HASH, feuille.getMaxRows(), 1).setNumberFormat("@");
  }
  Logger.log(message);
  return message;
}

/** Jeton aléatoire de 64 caractères hexadécimaux (2 UUID v4 sans tirets). */
function saasLienGenererJeton() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "").toLowerCase();
}

/** Empreinte SHA-256 (hexadécimale) d'un jeton : c'est la seule chose stockée. */
function saasLienHacher(jeton) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(jeton || ""), Utilities.Charset.UTF_8);
  return digest.map(function (b) {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? "0" + v : v;
  }).join("");
}

/** Qui a le droit à un lien : un CLIENT actif rattaché à un client. Jamais un ADMIN. */
function saasLienDestinataireEligible(user) {
  if (!user) return { ok: false, raison: "utilisateur introuvable" };
  if (String(user.role || "").toUpperCase() === "ADMIN") return { ok: false, raison: "compte administrateur" };
  if (String(user.role || "").toUpperCase() !== "CLIENT") return { ok: false, raison: "rôle non éligible" };
  if (String(user.actif || "").toUpperCase() !== "OUI") return { ok: false, raison: "compte inactif" };
  if (!String(user.idClient || "").trim()) return { ok: false, raison: "aucun client rattaché" };
  return { ok: true, raison: "" };
}

function saasLienVersDate_(valeur) {
  if (valeur instanceof Date) return valeur;
  const d = new Date(String(valeur || ""));
  return d;
}

/** Vrai si le lien (ligne de LIENS_CONNEXION) est expiré : Expiration_Ms d'abord, la date en secours. */
function saasLienExpire_(rang) {
  const ms = Number(rang[SAAS_LIEN_COL.EXPIRATION_MS - 1]);
  if (isFinite(ms) && ms > 0) return ms < Date.now();
  return saasDateDepassee(saasLienVersDate_(rang[SAAS_LIEN_COL.EXPIRATION - 1]).toString());
}

function saasLienDateAjoutHeures_(heures) {
  return Utilities.formatDate(new Date(Date.now() + heures * 3600 * 1000), SAAS_FUSEAU, "yyyy-MM-dd HH:mm:ss");
}

/** Numéro de ligne (base 1) d'un lien dans LIENS_CONNEXION, ou -1. */
function saasLienTrouverLigneParId(idLien) {
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_LIENS);
  if (!feuille || !idLien) return -1;
  const data = feuille.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][SAAS_LIEN_COL.ID - 1]) === String(idLien)) return i + 1;
  }
  return -1;
}

/** Marque un lien comme ENVOYE (appelé quand l'e-mail est bien parti). */
function saasLienConfirmerEnvoi(idLien) {
  const ligne = saasLienTrouverLigneParId(idLien);
  if (ligne < 0) return false;
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_LIENS);
  if (String(feuille.getRange(ligne, SAAS_LIEN_COL.STATUT).getValue()) !== "EMIS") return false;
  feuille.getRange(ligne, SAAS_LIEN_COL.STATUT).setValue("ENVOYE");
  return true;
}

/** Annule un lien (e-mail non parti, trop de liens actifs...). La ligne reste en base. */
function saasLienAnnuler(idLien, motif) {
  const ligne = saasLienTrouverLigneParId(idLien);
  if (ligne < 0) return false;
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_LIENS);
  const statut = String(feuille.getRange(ligne, SAAS_LIEN_COL.STATUT).getValue());
  if (statut !== "EMIS" && statut !== "ENVOYE") return false;
  feuille.getRange(ligne, SAAS_LIEN_COL.STATUT).setValue("ANNULE");
  saasLogger("", "", "", "LIEN_ANNULE", String(idLien) + " : " + String(motif || "").substring(0, 200), "", true);
  return true;
}

/**
 * Émet un nouveau lien pour un utilisateur éligible.
 * Le jeton en clair n'existe qu'ici, en mémoire, pour être placé dans l'e-mail : l'appelant doit
 * ensuite appeler saasLienConfirmerEnvoi (e-mail parti) ou saasLienAnnuler (e-mail non parti).
 * @return {{idLien:string, jeton:string, expiration:string, url:string}|null}
 */
function saasLienEmettre(idUser, type, heures) {
  const user = saasTrouverUtilisateurParId(idUser);
  const eligible = saasLienDestinataireEligible(user);
  if (!eligible.ok) {
    saasLogger(idUser || "", user ? user.email : "", user ? user.role : "", "LIEN_REFUSE", "Lien non émis : " + eligible.raison, "", false);
    return null;
  }
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_LIENS);
  if (!feuille) return null;

  // Au plus SAAS_LIEN_MAX_ACTIFS_PAR_USER liens vivants par personne : les plus anciens sont annulés.
  const data = feuille.getDataRange().getValues();
  const vivants = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][SAAS_LIEN_COL.USER - 1]) !== String(idUser)) continue;
    const statut = String(data[i][SAAS_LIEN_COL.STATUT - 1]);
    if (statut !== "EMIS" && statut !== "ENVOYE") continue;
    if (saasLienExpire_(data[i])) continue;
    vivants.push(String(data[i][SAAS_LIEN_COL.ID - 1]));
  }
  while (vivants.length >= SAAS_LIEN_MAX_ACTIFS_PAR_USER) {
    saasLienAnnuler(vivants.shift(), "Remplacé : trop de liens actifs");
  }

  const jeton = saasLienGenererJeton();
  const idLien = saasGenererId("LNK");
  const validiteH = heures || SAAS_LIEN_VALIDITE_ALERTE_HEURES;
  const expiration = saasLienDateAjoutHeures_(validiteH);
  feuille.appendRow([
    idLien, saasLienHacher(jeton), idUser, saasNeutraliserCellule(user.email), user.idClient,
    saasDateMaintenant(), expiration, Date.now() + validiteH * 3600 * 1000, "EMIS", "", ""
  ]);
  return { idLien: idLien, jeton: jeton, expiration: expiration, url: saasLienUrlBase() + "/#acces=" + jeton };
}

// --- Limite des essais par adresse IP (compteurs en cache, aucune écriture dans les feuilles) ---

function saasLienEstBloque(ip) {
  try {
    return CacheService.getScriptCache().get("LKB_" + saasLimiteEmpreinte(ip || "inconnue")) !== null;
  } catch (e) {
    return false;
  }
}

function saasLienEnregistrerEchec(ip) {
  try {
    const cache = CacheService.getScriptCache();
    const h = saasLimiteEmpreinte(ip || "inconnue");
    const maintenant = Date.now();
    let etat = null;
    try { etat = JSON.parse(cache.get("LKE_" + h) || "null"); } catch (e) { etat = null; }
    if (!etat || (maintenant - etat.debut) > SAAS_LIEN_FENETRE_SEC * 1000) etat = { n: 0, debut: maintenant };
    etat.n++;
    if (etat.n >= SAAS_LIEN_MAX_ECHECS) {
      cache.put("LKB_" + h, "1", SAAS_LIEN_BLOCAGE_SEC);
      cache.remove("LKE_" + h);
      saasLogger("", "", "", "LIEN_BLOQUE", SAAS_LIEN_MAX_ECHECS + " liens invalides en " + Math.round(SAAS_LIEN_FENETRE_SEC / 60) + " min : IP bloquée", ip || "", false);
      return true;
    }
    const restant = Math.max(1, Math.ceil((etat.debut + SAAS_LIEN_FENETRE_SEC * 1000 - maintenant) / 1000));
    cache.put("LKE_" + h, JSON.stringify(etat), restant);
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * POST /auth/lien — connexion par lien à usage unique.
 * @param {Object} payload { jeton }  (64 caractères hexadécimaux)
 */
function saasAuthLien(payload, e) {
  const ip = saasExtraireIp(e);
  const ua = saasExtraireUserAgent(e);

  if (!saasLienActif()) {
    return saasErreur("La connexion par lien n'est pas disponible pour le moment. Connectez-vous avec votre mot de passe.", 503);
  }
  if (saasLienEstBloque(ip)) {
    return saasErreur("Trop de tentatives. Réessayez dans " + Math.round(SAAS_LIEN_BLOCAGE_SEC / 60) + " minutes.", 429);
  }

  const jeton = String((payload && payload.jeton) || "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(jeton)) {
    saasLienEnregistrerEchec(ip);
    return saasErreur(SAAS_LIEN_MESSAGE_INVALIDE, 401);
  }

  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_LIENS);
  if (!feuille) return saasErreur("Structure SaaS non initialisée.", 500);
  const empreinte = saasLienHacher(jeton);

  // Verrou : deux clics simultanés ne peuvent pas consommer le même lien deux fois.
  const verrou = LockService.getScriptLock();
  try {
    verrou.waitLock(10000);
  } catch (err) {
    return saasErreur("Service momentanément occupé. Réessayez dans un instant.", 503);
  }

  let user = null;
  let idLien = "";
  try {
    const data = feuille.getDataRange().getValues();
    let ligne = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][SAAS_LIEN_COL.HASH - 1]) === empreinte) { ligne = i + 1; break; }
    }
    if (ligne < 0) {
      saasLienEnregistrerEchec(ip);
      saasLogger("", "", "", "LOGIN_LIEN", "Lien inconnu", ip, false);
      return saasErreur(SAAS_LIEN_MESSAGE_INVALIDE, 401);
    }
    const rang = data[ligne - 1];
    idLien = String(rang[SAAS_LIEN_COL.ID - 1]);
    const statut = String(rang[SAAS_LIEN_COL.STATUT - 1]);
    if (statut !== "EMIS" && statut !== "ENVOYE") {
      saasLienEnregistrerEchec(ip);
      saasLogger(String(rang[SAAS_LIEN_COL.USER - 1]), "", "", "LOGIN_LIEN", "Lien déjà utilisé ou annulé (" + idLien + ")", ip, false);
      return saasErreur(SAAS_LIEN_MESSAGE_INVALIDE, 401);
    }
    if (saasLienExpire_(rang)) {
      feuille.getRange(ligne, SAAS_LIEN_COL.STATUT).setValue("EXPIRE");
      saasLogger(String(rang[SAAS_LIEN_COL.USER - 1]), "", "", "LOGIN_LIEN", "Lien expiré (" + idLien + ")", ip, false);
      return saasErreur(SAAS_LIEN_MESSAGE_INVALIDE, 401);
    }
    user = saasTrouverUtilisateurParId(String(rang[SAAS_LIEN_COL.USER - 1]));
    const eligible = saasLienDestinataireEligible(user);
    if (!eligible.ok) {
      feuille.getRange(ligne, SAAS_LIEN_COL.STATUT).setValue("ANNULE");
      // (la raison du refus est consignée dans AUDIT_LOG ci-dessous)
      saasLogger(user ? user.idUser : "", user ? user.email : "", user ? user.role : "", "LOGIN_LIEN", "Lien refusé : " + eligible.raison + " (" + idLien + ")", ip, false);
      return saasErreur(SAAS_LIEN_MESSAGE_INVALIDE, 403);
    }
    // Consommation : le lien ne servira plus jamais.
    feuille.getRange(ligne, SAAS_LIEN_COL.STATUT).setValue("UTILISE");
    feuille.getRange(ligne, SAAS_LIEN_COL.UTILISATION).setValue(saasDateMaintenant());
    feuille.getRange(ligne, SAAS_LIEN_COL.IP).setValue(saasNeutraliserCellule(ip || ""));
  } finally {
    verrou.releaseLock();
  }

  saasMettreAJourDerniereConnexion(user.ligne);
  const session = saasCreerSession(user.idUser, ip, ua);
  saasLogger(user.idUser, user.email, user.role, "LOGIN_LIEN", "Connexion par lien réussie (" + idLien + ")", ip, true);

  return saasReponse(true, {
    idUser: user.idUser,
    email: user.email,
    nom: user.nom,
    telephone: user.telephone,
    role: user.role,
    idClient: user.idClient,
    langue: user.langue,
    photoUrl: user.photoUrl,
    aMotDePasse: user.hash.length > 0 && user.sel.length > 0,
    token: session ? session.token : null,
    expiration: session ? session.expiration : null
  }, "Connexion réussie.", 200);
}

/** Lecture seule : combien de comptes recevront un lien, et lesquels sont écartés (et pourquoi). */
function saasLienControleDestinataires() {
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_UTILISATEURS);
  if (!feuille) { Logger.log("❌ Feuille UTILISATEURS absente."); return null; }
  const data = feuille.getDataRange().getValues();
  const bilan = { eligibles: 0, ecartes: 0 };
  Logger.log("=== LIEN DE CONNEXION : DESTINATAIRES ===");
  for (let i = 1; i < data.length; i++) {
    const user = saasTrouverUtilisateurParId(String(data[i][0] || ""));
    if (!user) continue;
    const r = saasLienDestinataireEligible(user);
    if (r.ok) bilan.eligibles++; else bilan.ecartes++;
    Logger.log((r.ok ? "  ✅ " : "  ⛔ ") + user.email + " (" + user.role + ")" + (r.ok ? "" : " — " + r.raison));
  }
  Logger.log("Éligibles : " + bilan.eligibles + " | écartés : " + bilan.ecartes + " | interrupteur : " + (saasLienActif() ? "ACTIVÉ" : "DÉSACTIVÉ"));
  return bilan;
}

/** Lecture seule : état de LIENS_CONNEXION (décompte par statut). */
function saasLienRapport() {
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAAS_SHEET_LIENS);
  Logger.log("=== LIEN DE CONNEXION : RAPPORT ===");
  Logger.log("Interrupteur : " + (saasLienActif() ? "ACTIVÉ" : "DÉSACTIVÉ") + " | adresse de base : " + saasLienUrlBase());
  if (!feuille) { Logger.log("Onglet LIENS_CONNEXION absent (lancer saasLienInitialiserOnglet)."); return null; }
  const data = feuille.getDataRange().getValues();
  const compte = {};
  for (let i = 1; i < data.length; i++) {
    const s = String(data[i][SAAS_LIEN_COL.STATUT - 1] || "(vide)");
    compte[s] = (compte[s] || 0) + 1;
  }
  Logger.log("Liens : " + Math.max(0, data.length - 1) + " | " + JSON.stringify(compte));
  return compte;
}

/**
 * TEST DU LOT LC1 — cycle complet du lien (BAC À SABLE UNIQUEMENT).
 * Écrit dans UTILISATEURS, LIENS_CONNEXION, SESSIONS et AUDIT_LOG (aucune ligne supprimée) :
 * refuse de tourner si le classeur ne s'appelle pas « SANDBOX... » ou si la propriété du script
 * SAAS_TEST_AUTORISE n'est pas OUI. Aucun e-mail n'est envoyé. Le compte de test est désactivé à la fin.
 */
function saasLienTesterCycle() {
  Logger.log("=================================================");
  Logger.log("=== TEST LOT LC1 : CYCLE DU LIEN DE CONNEXION ===");
  Logger.log("=================================================");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const autorise = /sandbox|bac/i.test(ss.getName()) ||
                   String(PropertiesService.getScriptProperties().getProperty("SAAS_TEST_AUTORISE") || "").toUpperCase() === "OUI";
  if (!autorise) {
    Logger.log("❌ TEST ANNULÉ : ce classeur (« " + ss.getName() + " ») n'est pas un bac à sable. Rien n'a été écrit.");
    return;
  }
  if (String(saasAuthLien).indexOf("saasLienEstBloque(") === -1) {
    Logger.log("❌ TEST ANNULÉ : la version active de saasAuthLien est absente. Recollez SaaS_02_Auth.gs.");
    return;
  }

  let ok = 0, ko = 0;
  const verifier = function (nom, condition, detail) {
    Logger.log((condition ? "  ✅ " : "  ❌ ") + nom + (detail ? " — " + detail : ""));
    if (condition) ok++; else ko++;
  };
  const evt = { parameter: {}, headers: {} };
  const IP_TEST = "203.0.113.77";
  const appeler = function (jeton, ip) {
    return JSON.parse(saasAuthLien({ jeton: jeton }, { parameter: { ip: ip || IP_TEST }, headers: {} }).getContent());
  };
  const nettoyerCache = function () {
    try {
      const c = CacheService.getScriptCache();
      const h = saasLimiteEmpreinte(IP_TEST);
      c.remove("LKE_" + h); c.remove("LKB_" + h);
    } catch (err) {}
  };

  const forcerAvant = SAAS_LIEN_FORCER;
  const alerteAvant = SAAS_LIMITE_ALERTE_EMAIL;
  SAAS_LIMITE_ALERTE_EMAIL = false;
  nettoyerCache();
  let ligneUser = -1;
  try {
    saasLienInitialiserOnglet();
    const feuilleLiens = ss.getSheetByName(SAAS_SHEET_LIENS);
    const feuilleUsers = ss.getSheetByName(SAAS_SHEET_UTILISATEURS);

    // 1. Jeton et empreinte
    const j1 = saasLienGenererJeton(), j2 = saasLienGenererJeton();
    verifier("1. Jeton de 64 caractères hexadécimaux, différent à chaque appel", /^[0-9a-f]{64}$/.test(j1) && j1 !== j2);
    const h1 = saasLienHacher(j1);
    verifier("2. Empreinte SHA-256 stable et différente du jeton", /^[0-9a-f]{64}$/.test(h1) && h1 === saasLienHacher(j1) && h1 !== j1);

    // 3. Éligibilité
    verifier("3a. Un ADMIN n'a jamais de lien", saasLienDestinataireEligible({ role: "ADMIN", actif: "OUI", idClient: "CLI_X" }).ok === false);
    verifier("3b. Un compte inactif n'a pas de lien", saasLienDestinataireEligible({ role: "CLIENT", actif: "NON", idClient: "CLI_X" }).ok === false);
    verifier("3c. Un compte sans client n'a pas de lien", saasLienDestinataireEligible({ role: "CLIENT", actif: "OUI", idClient: "" }).ok === false);
    verifier("3d. Un CLIENT actif rattaché est éligible", saasLienDestinataireEligible({ role: "CLIENT", actif: "OUI", idClient: "CLI_X" }).ok === true);

    // 4. Interrupteur
    SAAS_LIEN_FORCER = false;
    verifier("4. Interrupteur coupé : réponse 503", appeler(j1).code === 503);
    SAAS_LIEN_FORCER = true;

    // 5. Format invalide
    verifier("5. Jeton mal formé : refus 401", appeler("pas-un-jeton").code === 401);

    // Compte de test (sans mot de passe : hash et sel vides)
    const idUser = saasGenererId("USR");
    const emailTest = "lien-test-" + Date.now() + "@example.invalid";
    feuilleUsers.appendRow([idUser, emailTest, "", "", "Test Lien", "", "CLIENT", "CLI_TEST_LIEN", "OUI", saasDateMaintenant(), "", "fr", ""]);
    ligneUser = saasTrouverUtilisateurParId(idUser).ligne;

    // 6. Émission : le jeton n'est jamais écrit en clair
    const lien = saasLienEmettre(idUser, "TEST", 1);
    verifier("6a. Émission réussie pour un client éligible", !!lien && /^[0-9a-f]{64}$/.test(lien.jeton));
    const tout = JSON.stringify(feuilleLiens.getDataRange().getValues());
    verifier("6b. Le jeton en clair n'apparaît nulle part dans la feuille", tout.indexOf(lien.jeton) === -1);
    verifier("6c. L'adresse du lien contient le jeton après #acces=", lien.url.indexOf("/#acces=" + lien.jeton) !== -1, lien.url.substring(0, 50) + "…");
    verifier("6d. Statut EMIS puis ENVOYE", (function () {
      const l = saasLienTrouverLigneParId(lien.idLien);
      const avant = String(feuilleLiens.getRange(l, SAAS_LIEN_COL.STATUT).getValue());
      saasLienConfirmerEnvoi(lien.idLien);
      return avant === "EMIS" && String(feuilleLiens.getRange(l, SAAS_LIEN_COL.STATUT).getValue()) === "ENVOYE";
    })());

    // 7. Utilisation
    const r1 = appeler(lien.jeton);
    verifier("7a. Premier usage : connexion réussie (200) avec une session", r1.succes === true && !!(r1.donnees && r1.donnees.token), "code " + r1.code);
    verifier("7b. Le compte n'a pas de mot de passe (aMotDePasse = false)", r1.donnees && r1.donnees.aMotDePasse === false);
    verifier("7c. Statut UTILISE", String(feuilleLiens.getRange(saasLienTrouverLigneParId(lien.idLien), SAAS_LIEN_COL.STATUT).getValue()) === "UTILISE");
    if (r1.donnees && r1.donnees.token) saasInvaliderSession(r1.donnees.token);

    // 8. Deuxième usage
    const r2 = appeler(lien.jeton);
    verifier("8. Deuxième usage : refus 401", r2.succes === false && r2.code === 401, "code " + r2.code);

    // 9. Lien expiré
    const lienExp = saasLienEmettre(idUser, "TEST", 1);
    feuilleLiens.getRange(saasLienTrouverLigneParId(lienExp.idLien), SAAS_LIEN_COL.EXPIRATION).setValue("2020-01-01 00:00:00");
    feuilleLiens.getRange(saasLienTrouverLigneParId(lienExp.idLien), SAAS_LIEN_COL.EXPIRATION_MS).setValue(1000);
    const r3 = appeler(lienExp.jeton);
    verifier("9. Lien expiré : refus 401 et statut EXPIRE", r3.code === 401 &&
             String(feuilleLiens.getRange(saasLienTrouverLigneParId(lienExp.idLien), SAAS_LIEN_COL.STATUT).getValue()) === "EXPIRE");

    // 10. Lien annulé
    const lienAnn = saasLienEmettre(idUser, "TEST", 1);
    saasLienAnnuler(lienAnn.idLien, "test");
    verifier("10. Lien annulé : refus 401", appeler(lienAnn.jeton).code === 401);

    // 11. Compte désactivé après émission
    const lienDes = saasLienEmettre(idUser, "TEST", 1);
    feuilleUsers.getRange(ligneUser, 9).setValue("NON");
    verifier("11. Compte désactivé : lien refusé (403) et annulé", appeler(lienDes.jeton).code === 403 &&
             String(feuilleLiens.getRange(saasLienTrouverLigneParId(lienDes.idLien), SAAS_LIEN_COL.STATUT).getValue()) === "ANNULE");
    feuilleUsers.getRange(ligneUser, 9).setValue("OUI");

    // 12. Plafond de liens vivants
    for (let k = 0; k < SAAS_LIEN_MAX_ACTIFS_PAR_USER + 2; k++) saasLienEmettre(idUser, "TEST", 1);
    const vivants = feuilleLiens.getDataRange().getValues().filter(function (r, idx) {
      return idx > 0 && String(r[SAAS_LIEN_COL.USER - 1]) === idUser && (String(r[SAAS_LIEN_COL.STATUT - 1]) === "EMIS" || String(r[SAAS_LIEN_COL.STATUT - 1]) === "ENVOYE");
    }).length;
    verifier("12. Jamais plus de " + SAAS_LIEN_MAX_ACTIFS_PAR_USER + " liens vivants par personne", vivants <= SAAS_LIEN_MAX_ACTIFS_PAR_USER, vivants + " vivants");

    // 13. Garde contre le mot de passe vide
    verifier("13a. saasVerifierMotDePasse refuse un hash vide", saasVerifierMotDePasse("n'importe quoi", "", "") === false);
    const repLogin = JSON.parse(saasAuthLogin({ email: emailTest, motDePasse: "n'importe quoi" }, evt).getContent());
    verifier("13b. Un compte sans mot de passe ne se connecte pas par mot de passe", repLogin.succes === false && repLogin.code === 401, "code " + repLogin.code);
    try { saasLimiteReinitialiser(emailTest); } catch (err) {}

    // 14. Blocage par IP
    nettoyerCache();
    const codes = [];
    for (let k = 0; k < SAAS_LIEN_MAX_ECHECS; k++) codes.push(appeler(saasLienGenererJeton()).code);
    verifier("14a. " + SAAS_LIEN_MAX_ECHECS + " liens inconnus répondent 401", codes.every(function (c) { return c === 401; }), codes.join(","));
    verifier("14b. L'IP est alors bloquée (429)", appeler(saasLienGenererJeton()).code === 429);
    nettoyerCache();
  } catch (err) {
    Logger.log("  ❌ Exception pendant le test : " + err.message);
    ko++;
  } finally {
    // Le compte de test est désactivé (jamais supprimé).
    try {
      if (ligneUser > 0) ss.getSheetByName(SAAS_SHEET_UTILISATEURS).getRange(ligneUser, 9).setValue("NON");
    } catch (err) {}
    nettoyerCache();
    SAAS_LIEN_FORCER = forcerAvant;
    SAAS_LIMITE_ALERTE_EMAIL = alerteAvant;
  }

  Logger.log("");
  Logger.log("=== RÉSULTAT : " + ok + " contrôle(s) réussi(s), " + ko + " échec(s) ===");
}
