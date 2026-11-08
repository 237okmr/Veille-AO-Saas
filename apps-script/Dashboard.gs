// >>> FICHIER : Dashboard.gs <<< (à coller dans l'onglet du même nom)
/**
 * ============================================================================
 * MODULE DASHBOARD VISUEL (V1.2 — LOT S1b)
 * ============================================================================
 * V1.2 (LOT S1b) : les libellés tirés des données (noms de clients, d'organismes) passent par
 * secNeutraliserFormule (SecuriteDonnees.gs, dont ce script dépend).
 *
 * Nouveautés V1.1 :
 * - "Dernière session" affichée en date lisible (plus de format JavaScript long).
 * - Valeurs écrites au format texte : plus de nombres affichés en dates
 *   (ex. 116 -> 25/04/1900).
 * - Nouvelle ligne "Dernière collecte" : le statut de la dernière routine de
 *   collecte n'est plus masqué par la session du matin, qui réussit toujours.
 * - Nouvelle ligne "Alertes en attente d'envoi".
 * - 5 sections : état actuel, activité 7j, ventilation, top clients, cache IA
 * - Appelé automatiquement à chaque fin de session via finaliserEtConsignerRapport
 * ============================================================================
 */

const DB_SHEET = "DASHBOARD";
const DB_FUSEAU = "Africa/Douala";

/**
 * Point d'entrée : rafraîchit le contenu du dashboard.
 */
function rafraichirDashboard() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let feuille = ss.getSheetByName(DB_SHEET);
    if (!feuille) {
      feuille = ss.insertSheet(DB_SHEET, 0);
      Logger.log(`[DASHBOARD] Feuille "${DB_SHEET}" créée.`);
    }

    feuille.clear();
    feuille.clearFormats();

    const maintenant = new Date();
    const dateStr = Utilities.formatDate(maintenant, DB_FUSEAU, "dd/MM/yyyy HH:mm:ss");

    let ligne = 1;

    // ------------------------------------------------------------------
    // EN-TÊTE
    // ------------------------------------------------------------------
    feuille.getRange(ligne, 1, 1, 4).merge();
    feuille.getRange(ligne, 1).setValue("📊 DASHBOARD — VEILLE MARCHÉS PUBLICS")
      .setFontSize(16).setFontWeight("bold")
      .setBackground("#0f172a").setFontColor("#ffffff")
      .setHorizontalAlignment("center").setVerticalAlignment("middle");
    feuille.setRowHeight(ligne, 40);
    ligne++;

    feuille.getRange(ligne, 1, 1, 4).merge();
    feuille.getRange(ligne, 1).setValue(`Dernière mise à jour : ${dateStr}`)
      .setFontSize(10).setFontStyle("italic").setFontColor("#64748b")
      .setHorizontalAlignment("center");
    ligne += 2;

    // ------------------------------------------------------------------
    // SECTION 1 : ÉTAT ACTUEL
    // ------------------------------------------------------------------
    ecrireTitreSection(feuille, ligne, "🟢 ÉTAT ACTUEL", "#10b981");
    ligne++;

    const etatActuel = recupererEtatActuel(ss);
    ecrirePaire(feuille, ligne, "Dernière session", etatActuel.derniereSession); ligne++;
    ecrirePaire(feuille, ligne, "Statut de la dernière session", etatActuel.statut); ligne++;
    ecrirePaire(feuille, ligne, "Dernière collecte", etatActuel.derniereCollecte); ligne++;
    ecrirePaire(feuille, ligne, "Alertes en attente d'envoi", etatActuel.alertesEnAttente); ligne++;
    ecrirePaire(feuille, ligne, "Quota Gmail restant", etatActuel.quota + " emails"); ligne++;
    ecrirePaire(feuille, ligne, "Déclencheurs actifs", etatActuel.nbDeclencheurs); ligne++;
    ligne++;

    // ------------------------------------------------------------------
    // SECTION 2 : ACTIVITÉ — 7 DERNIERS JOURS
    // ------------------------------------------------------------------
    ecrireTitreSection(feuille, ligne, "📅 ACTIVITÉ — 7 DERNIERS JOURS", "#0284c7");
    ligne++;

    const activite7j = recupererActivite7Jours(ss);
    ecrirePaire(feuille, ligne, "Sessions exécutées", activite7j.nbSessions); ligne++;
    ecrirePaire(feuille, ligne, "Avis collectés", activite7j.nouveauxAO); ligne++;
    ecrirePaire(feuille, ligne, "Emails envoyés", activite7j.emailsEnvoyes); ligne++;
    ecrirePaire(feuille, ligne, "Incidents IA", activite7j.incidentsIA); ligne++;
    ecrirePaire(feuille, ligne, "Sessions en échec", activite7j.sessionsEchec); ligne++;
    ligne++;

    // ------------------------------------------------------------------
    // SECTION 3 : VENTILATION PAR ORGANISME — 7 JOURS
    // ------------------------------------------------------------------
    ecrireTitreSection(feuille, ligne, "🏛️ VENTILATION PAR ORGANISME — 7 JOURS", "#7c3aed");
    ligne++;

    const ventilation = recupererVentilationSources(ss);
    const organismes = Object.keys(ventilation);
    if (organismes.length === 0) {
      feuille.getRange(ligne, 1, 1, 4).merge();
      feuille.getRange(ligne, 1).setValue("Aucune donnée sur la période").setFontStyle("italic").setFontColor("#94a3b8");
      ligne++;
    } else {
      organismes.forEach(org => {
        ecrirePaire(feuille, ligne, org, ventilation[org] + " avis");
        ligne++;
      });
    }
    ligne++;

    // ------------------------------------------------------------------
    // SECTION 4 : TOP CLIENTS — 30 DERNIERS JOURS
    // ------------------------------------------------------------------
    ecrireTitreSection(feuille, ligne, "👥 TOP CLIENTS — 30 DERNIERS JOURS", "#f59e0b");
    ligne++;

    const topClients = recupererTopClients(ss);
    if (topClients.length === 0) {
      feuille.getRange(ligne, 1, 1, 4).merge();
      feuille.getRange(ligne, 1).setValue("Aucune alerte envoyée sur la période").setFontStyle("italic").setFontColor("#94a3b8");
      ligne++;
    } else {
      topClients.forEach(c => {
        ecrirePaire(feuille, ligne, c.nom, c.nbAlertes + " alertes");
        ligne++;
      });
    }
    ligne++;

    // ------------------------------------------------------------------
    // SECTION 5 : SANTÉ DU CACHE IA
    // ------------------------------------------------------------------
    ecrireTitreSection(feuille, ligne, "🧠 SANTÉ DU CACHE IA", "#dc2626");
    ligne++;

    const santeCache = recupererSanteCache(ss);
    ecrirePaire(feuille, ligne, "Entrées totales en cache", santeCache.total); ligne++;
    ecrirePaire(feuille, ligne, "Entrées ajoutées (7 jours)", santeCache.recentes); ligne++;
    ecrirePaire(feuille, ligne, "Dernière purge", santeCache.dernierePurge); ligne++;
    ecrirePaire(feuille, ligne, "Purge automatique", santeCache.statutPurge); ligne++;

    // ------------------------------------------------------------------
    // FORMATAGE FINAL
    // ------------------------------------------------------------------
    feuille.setColumnWidth(1, 250);
    feuille.setColumnWidth(2, 300);
    feuille.setColumnWidth(3, 50);
    feuille.setColumnWidth(4, 50);

    Logger.log(`[DASHBOARD] Mise à jour terminée (${ligne} lignes écrites).`);
  } catch (e) {
    Logger.log(`[DASHBOARD] Erreur : ${e.message}`);
  }
}

function ecrireTitreSection(feuille, ligne, titre, couleur) {
  feuille.getRange(ligne, 1, 1, 4).merge();
  feuille.getRange(ligne, 1).setValue(titre)
    .setFontSize(12).setFontWeight("bold")
    .setBackground(couleur).setFontColor("#ffffff")
    .setHorizontalAlignment("left").setVerticalAlignment("middle");
  feuille.setRowHeight(ligne, 28);
}

function ecrirePaire(feuille, ligne, label, valeur) {
  feuille.getRange(ligne, 1).setValue(secNeutraliserFormule(label))
    .setFontWeight("bold").setFontColor("#334155")
    .setHorizontalAlignment("left").setVerticalAlignment("middle")
    .setBackground("#f8fafc");

  // Format texte forcé : évite que Sheets transforme un nombre ou un texte en date
  feuille.getRange(ligne, 2)
    .setNumberFormat("@")
    .setValue(String(valeur))
    .setFontColor("#0f172a")
    .setHorizontalAlignment("left").setVerticalAlignment("middle")
    .setBackground("#f8fafc");

  feuille.getRange(ligne, 3, 1, 2).setBackground("#f8fafc");
}

/**
 * Convertit une valeur de cellule (Date ou texte) en Date, ou null.
 */
function dbEnDate(valeur) {
  if (valeur instanceof Date) return isNaN(valeur.getTime()) ? null : valeur;
  if (!valeur) return null;
  const d = new Date(valeur);
  return isNaN(d.getTime()) ? null : d;
}

function recupererEtatActuel(ss) {
  const resultat = {
    derniereSession: "Aucune",
    statut: "—",
    derniereCollecte: "—",
    alertesEnAttente: 0,
    quota: 0,
    nbDeclencheurs: 0
  };

  const feuilleLog = ss.getSheetByName("JOURNAL_MONITORING");
  if (feuilleLog) {
    const data = feuilleLog.getDataRange().getValues();
    if (data.length > 1) {
      const derniere = data[data.length - 1];
      const dateDerniere = dbEnDate(derniere[0]);
      resultat.derniereSession = dateDerniere
        ? Utilities.formatDate(dateDerniere, DB_FUSEAU, "dd/MM/yyyy HH:mm:ss")
        : (derniere[0] || "").toString();
      resultat.statut = (derniere[1] || "").toString();
      resultat.quota = parseInt(derniere[14], 10) || 0;

      // Dernière session de COLLECTE (pages scannées ou temps de collecte > 0) :
      // c'est elle qui révèle un plantage de la routine de nuit.
      for (let i = data.length - 1; i >= 1; i--) {
        const pages = parseInt(data[i][3], 10) || 0;
        const tempsCollecte = parseInt(data[i][6], 10) || 0;
        if (pages > 0 || tempsCollecte > 0) {
          const d = dbEnDate(data[i][0]);
          const dateTxt = d ? Utilities.formatDate(d, DB_FUSEAU, "dd/MM/yyyy HH:mm") : "date inconnue";
          resultat.derniereCollecte = `${(data[i][1] || "").toString()} — ${dateTxt}`;
          break;
        }
      }
    }
  }

  const feuilleAlertes = ss.getSheetByName("ALERTES_A_ENVOYER");
  if (feuilleAlertes) {
    const dataAlertes = feuilleAlertes.getDataRange().getValues();
    for (let i = 1; i < dataAlertes.length; i++) {
      const statut = (dataAlertes[i][7] || "").toString().trim().toUpperCase();
      if (statut === "EN_ATTENTE" || statut === "REPORTÉ") resultat.alertesEnAttente++;
    }
  }

  try {
    resultat.nbDeclencheurs = ScriptApp.getProjectTriggers().length;
  } catch (e) {
    resultat.nbDeclencheurs = 0;
  }

  return resultat;
}

function recupererActivite7Jours(ss) {
  const resultat = {
    nbSessions: 0,
    nouveauxAO: 0,
    emailsEnvoyes: 0,
    incidentsIA: 0,
    sessionsEchec: 0
  };

  const feuilleLog = ss.getSheetByName("JOURNAL_MONITORING");
  if (!feuilleLog) return resultat;

  const data = feuilleLog.getDataRange().getValues();
  const limite = new Date();
  limite.setDate(limite.getDate() - 7);

  for (let i = 1; i < data.length; i++) {
    const dateSession = dbEnDate(data[i][0]);
    if (!dateSession || dateSession < limite) continue;

    resultat.nbSessions++;
    resultat.nouveauxAO += parseInt(data[i][4], 10) || 0;
    resultat.emailsEnvoyes += parseInt(data[i][11], 10) || 0;
    resultat.incidentsIA += parseInt(data[i][8], 10) || 0;

    const statut = (data[i][1] || "").toString().toUpperCase();
    if (statut === "ÉCHEC") resultat.sessionsEchec++;
  }

  return resultat;
}

function recupererVentilationSources(ss) {
  const resultat = {};
  const feuilleAO = ss.getSheetByName(SHEET_AO);
  if (!feuilleAO) return resultat;

  const data = feuilleAO.getDataRange().getValues();
  const limite = new Date();
  limite.setDate(limite.getDate() - 7);

  for (let i = 1; i < data.length; i++) {
    const dateCollecte = dbEnDate(data[i][2]);
    if (!dateCollecte || dateCollecte < limite) continue;

    const source = (data[i][4] || "Inconnu").toString().trim();
    if (!source) continue;

    resultat[source] = (resultat[source] || 0) + 1;
  }

  return resultat;
}

function recupererTopClients(ss) {
  const feuilleAlertes = ss.getSheetByName("ALERTES_A_ENVOYER");
  if (!feuilleAlertes) return [];

  const data = feuilleAlertes.getDataRange().getValues();
  const limite = new Date();
  limite.setDate(limite.getDate() - 30);

  const compteur = {};

  for (let i = 1; i < data.length; i++) {
    const statut = (data[i][7] || "").toString().trim().toUpperCase();
    if (statut !== "ENVOYÉ") continue;

    const dateEnvoi = dbEnDate(data[i][8]);
    if (!dateEnvoi || dateEnvoi < limite) continue;

    const nom = (data[i][4] || "Client").toString().trim();
    compteur[nom] = (compteur[nom] || 0) + 1;
  }

  const classement = Object.keys(compteur)
    .map(nom => ({ nom: nom, nbAlertes: compteur[nom] }))
    .sort((a, b) => b.nbAlertes - a.nbAlertes)
    .slice(0, 5);

  return classement;
}

function recupererSanteCache(ss) {
  const resultat = {
    total: 0,
    recentes: 0,
    dernierePurge: "Jamais",
    statutPurge: "—"
  };

  const feuilleCache = ss.getSheetByName("CACHE_IA");
  if (feuilleCache) {
    const data = feuilleCache.getDataRange().getValues();
    resultat.total = Math.max(0, data.length - 1);

    const limite = new Date();
    limite.setDate(limite.getDate() - 7);

    for (let i = 1; i < data.length; i++) {
      const dateEval = dbEnDate(data[i][4]);
      if (dateEval && dateEval >= limite) {
        resultat.recentes++;
      }
    }
  }

  try {
    const derniere = PropertiesService.getScriptProperties().getProperty("CACHE_IA_DERNIERE_PURGE");
    if (derniere) {
      const d = new Date(derniere);
      if (!isNaN(d.getTime())) {
        resultat.dernierePurge = Utilities.formatDate(d, DB_FUSEAU, "dd/MM/yyyy HH:mm");
        const jours = (new Date().getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
        resultat.statutPurge = jours >= 7 ? "À déclencher au prochain run" : `Prochaine dans ${Math.ceil(7 - jours)} jour(s)`;
      }
    } else {
      resultat.dernierePurge = "Jamais";
      resultat.statutPurge = "Première purge au prochain run";
    }
  } catch (e) {
    Logger.log(`[DASHBOARD] Erreur lecture purge : ${e.message}`);
  }

  return resultat;
}