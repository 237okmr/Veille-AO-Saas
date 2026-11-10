/**
 * SaaS_27_InstallerCycle.gs
 * Installe (une seule fois) le déclencheur quotidien du cycle de vie des espaces pilotes.
 * Fonction à exécuter : saasPiloteInstallerDeclencheurCycle
 * Fuseau : Africa/Douala (UTC+1). Créneau : entre 5 h et 6 h.
 * Idempotent : si un déclencheur existe déjà pour saasPiloteCycleQuotidien, rien n'est créé.
 * Aucune donnée touchée, aucune ligne supprimée.
 */

var SAAS_CYCLE_HANDLER = "saasPiloteCycleQuotidien";
var SAAS_CYCLE_HEURE = 5;
var SAAS_CYCLE_FUSEAU = "Africa/Douala";

function saasPiloteListerDeclencheursCycle() {
  var liste = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === SAAS_CYCLE_HANDLER;
  });
  Logger.log("Déclencheurs " + SAAS_CYCLE_HANDLER + " : " + liste.length);
  liste.forEach(function (t) {
    Logger.log(" - " + t.getUniqueId() + " | " + t.getEventType() + " | " + t.getTriggerSource());
  });
  return liste.length;
}

function saasPiloteInstallerDeclencheurCycle() {
  var existants = saasPiloteListerDeclencheursCycle();
  if (existants > 0) {
    Logger.log("Rien à faire : le déclencheur quotidien existe déjà.");
    return "DEJA_PRESENT";
  }
  ScriptApp.newTrigger(SAAS_CYCLE_HANDLER)
    .timeBased()
    .everyDays(1)
    .atHour(SAAS_CYCLE_HEURE)
    .inTimezone(SAAS_CYCLE_FUSEAU)
    .create();
  Logger.log("Déclencheur créé : " + SAAS_CYCLE_HANDLER + " chaque jour entre " + SAAS_CYCLE_HEURE + " h et " + (SAAS_CYCLE_HEURE + 1) + " h (" + SAAS_CYCLE_FUSEAU + ").");
  saasPiloteListerDeclencheursCycle();
  return "CREE";
}
