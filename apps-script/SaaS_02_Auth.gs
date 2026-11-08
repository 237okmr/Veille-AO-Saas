// >>> FICHIER : SaaS_02_Auth.gs <<< (à coller dans l'onglet du même nom)
/**
 * ============================================================================
 * SAAS — AUTHENTIFICATION (V1.3 — LOTS S2 / S4 / S1b)
 * ============================================================================
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