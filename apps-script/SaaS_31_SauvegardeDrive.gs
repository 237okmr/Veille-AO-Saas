// >>> FICHIER : SaaS_31_SauvegardeDrive.gs <<< (NOUVEAU fichier à créer dans l'éditeur Apps Script)
/**
 * ============================================================================
 * SAAS — SAUVEGARDE QUOTIDIENNE DU CLASSEUR VERS GOOGLE DRIVE (CHANTIER 1)
 * ============================================================================
 * Remplace le maillon le plus fragile de la chaîne de sauvegarde actuelle
 * (backup_sheet.ps1 -> Chrome invisible -> export) : ce Chrome invisible perd
 * sa session Google au bout de quelques jours (HTTP 401), ce qui fait échouer
 * la sauvegarde automatique SANS que personne ne s'en rende compte.
 *
 * Ici, Apps Script fait lui-même une copie horodatée du classeur dans un
 * dossier Google Drive dédié. Aucune session de navigateur, aucun compte de
 * service Google Cloud, aucune facturation possible : c'est le même mécanisme
 * que celui déjà utilisé par EnvoiEmails.gs ou Validation.gs en production.
 *
 * AUCUNE écriture dans le classeur lui-même : on ne fait que LIRE son contenu
 * pour en faire une copie ailleurs (dans Drive).
 *
 * Paramètres (en tête de fichier, volontairement en dur — aucun secret ici) :
 *   SAAS_SAUVEGARDE_DOSSIER_NOM   = nom du dossier Drive de destination
 *   SAAS_SAUVEGARDE_RETENTION_J   = nombre de jours de rétention (purge au-delà)
 *
 * Fonctions :
 *   saasSauvegardeTester()                 -> à lancer À LA MAIN dans le BAC À
 *                                              SABLE pour valider (fait une
 *                                              vraie copie : jamais en prod
 *                                              sans accord explicite).
 *   saasSauvegardeLister()                 -> lecture seule : liste les copies
 *                                              déjà présentes dans Drive.
 *   installerDeclencheurSauvegardeDrive()  -> installe le déclencheur quotidien
 *                                              (2h00, Africa/Douala). À LANCER
 *                                              UNE SEULE FOIS, après validation
 *                                              en bac à sable ET feu vert pour
 *                                              la production.
 *   desinstallerDeclencheurSauvegardeDrive() -> retire ce déclencheur (retour
 *                                              en arrière si besoin).
 * ============================================================================
 */

const SAAS_SAUVEGARDE_DOSSIER_NOM = 'Sauvegardes_Hub_Veille_AO';
const SAAS_SAUVEGARDE_RETENTION_J = 30;
const SAAS_SAUVEGARDE_PROP_DOSSIER_ID = 'SAUVEGARDE_DRIVE_DOSSIER_ID';
const SAAS_SAUVEGARDE_PREFIXE = 'Hub_Veille_Appels_Offres_';
const SAAS_SAUVEGARDE_FUSEAU = 'Africa/Douala';

/** Dossier Drive de destination : le retrouve par son ID mémorisé, sinon par son nom, sinon le crée. */
function saasSauvegardeDossier_() {
  const props = PropertiesService.getScriptProperties();
  const idConnu = props.getProperty(SAAS_SAUVEGARDE_PROP_DOSSIER_ID);

  if (idConnu) {
    try { return DriveApp.getFolderById(idConnu); } catch (e) { /* dossier introuvable : on retombe ci-dessous */ }
  }

  const existants = DriveApp.getFoldersByName(SAAS_SAUVEGARDE_DOSSIER_NOM);
  const dossier = existants.hasNext() ? existants.next() : DriveApp.createFolder(SAAS_SAUVEGARDE_DOSSIER_NOM);
  props.setProperty(SAAS_SAUVEGARDE_PROP_DOSSIER_ID, dossier.getId());
  return dossier;
}

function saasSauvegardeHorodatage_(date) {
  return Utilities.formatDate(date || new Date(), SAAS_SAUVEGARDE_FUSEAU, 'yyyy-MM-dd_HHmm');
}

/** Copie horodatée du classeur actif dans le dossier de sauvegarde. Ne modifie jamais le classeur d'origine. */
function saasSauvegardeExecuter() {
  const resultat = { ok: false, nomCopie: null, idCopie: null, purgees: [], erreur: null };
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const original = DriveApp.getFileById(ss.getId());
    const dossier = saasSauvegardeDossier_();
    const nomCopie = SAAS_SAUVEGARDE_PREFIXE + saasSauvegardeHorodatage_();

    const copie = original.makeCopy(nomCopie, dossier);
    resultat.ok = true;
    resultat.nomCopie = copie.getName();
    resultat.idCopie = copie.getId();

    resultat.purgees = saasSauvegardePurgerAnciennes_(dossier);

    Logger.log('[SAUVEGARDE DRIVE] OK : ' + resultat.nomCopie + ' (id ' + resultat.idCopie + ')' +
               (resultat.purgees.length ? ' | purgées : ' + resultat.purgees.join(', ') : ''));
  } catch (e) {
    resultat.erreur = e.message;
    Logger.log('[SAUVEGARDE DRIVE] ÉCHEC : ' + e.message);
  }
  return resultat;
}

/** Supprime (corbeille Drive) les copies plus anciennes que SAAS_SAUVEGARDE_RETENTION_J jours. */
function saasSauvegardePurgerAnciennes_(dossier) {
  const purgees = [];
  const limite = new Date().getTime() - SAAS_SAUVEGARDE_RETENTION_J * 24 * 60 * 60 * 1000;
  const fichiers = dossier.getFilesByType(MimeType.GOOGLE_SHEETS);
  while (fichiers.hasNext()) {
    const f = fichiers.next();
    if (f.getName().indexOf(SAAS_SAUVEGARDE_PREFIXE) !== 0) continue;
    if (f.getDateCreated().getTime() < limite) {
      f.setTrashed(true);
      purgees.push(f.getName());
    }
  }
  return purgees;
}

/** Lecture seule : liste les copies déjà présentes dans le dossier de sauvegarde, triées par date. */
function saasSauvegardeLister() {
  const dossier = saasSauvegardeDossier_();
  const fichiers = dossier.getFilesByType(MimeType.GOOGLE_SHEETS);
  const liste = [];
  while (fichiers.hasNext()) {
    const f = fichiers.next();
    if (f.getName().indexOf(SAAS_SAUVEGARDE_PREFIXE) !== 0) continue;
    liste.push({ nom: f.getName(), cree: f.getDateCreated(), id: f.getId() });
  }
  liste.sort(function (a, b) { return b.cree - a.cree; });

  Logger.log('=== SAUVEGARDES DRIVE (' + liste.length + ') — dossier « ' + SAAS_SAUVEGARDE_DOSSIER_NOM + ' » ===');
  liste.forEach(function (f) { Logger.log(f.cree + ' | ' + f.nom); });
  return liste;
}

/** À LANCER À LA MAIN DANS LE BAC À SABLE pour valider : fait une vraie copie, écrit et purge. */
function saasSauvegardeTester() {
  Logger.log('=== TEST SAUVEGARDE DRIVE (écrit réellement une copie dans Drive) ===');
  const r = saasSauvegardeExecuter();
  Logger.log('Résultat : ' + JSON.stringify(r));
  Logger.log('=== FIN DU TEST ===');
  return r;
}

/** Installe le déclencheur quotidien (2h00, Africa/Douala). À lancer une seule fois, après feu vert. */
function installerDeclencheurSauvegardeDrive() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'saasSauvegardeExecuter') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('saasSauvegardeExecuter')
    .timeBased().everyDays(1).atHour(2).inTimezone(SAAS_SAUVEGARDE_FUSEAU).create();
  Logger.log('[SAUVEGARDE DRIVE] Déclencheur installé : tous les jours à 2h00 (Africa/Douala).');
}

/** Retire le déclencheur de sauvegarde Drive (retour en arrière). */
function desinstallerDeclencheurSauvegardeDrive() {
  let supprimes = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'saasSauvegardeExecuter') { ScriptApp.deleteTrigger(t); supprimes++; }
  });
  Logger.log('[SAUVEGARDE DRIVE] Déclencheurs supprimés : ' + supprimes);
}
