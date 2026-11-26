// >>> FICHIER : SaaS_30_SyncSupabase.gs <<< (NOUVEAU fichier à créer dans l'éditeur Apps Script)
/**
 * ============================================================================
 * SAAS — SYNCHRONISATION VERS SUPABASE (CHANTIER 2 — BASE EN LECTURE SEULE)
 * ============================================================================
 * Copie en LECTURE SEULE du classeur vers Supabase, pour accélérer l'affichage
 * des écrans Avis Collectés et Alertes Clients côté application. Le classeur
 * reste la référence : collecte, matching, alertes et IA sont INCHANGÉS.
 * AUCUNE écriture dans le classeur depuis ce fichier.
 *
 *   TOUS_AO (via saasAvisLireTous_, déjà existant)        -> table "avis"
 *   Alertes déjà croisées par client (via saasChargerAlertesClient,
 *   déjà existant)                                         -> table "alertes_client"
 *
 * Tout est renvoyé à chaque passage (upsert sur la clé primaire) : plus simple
 * et auto-réparateur qu'un suivi des seules nouveautés, sans risque de quotas
 * à la taille actuelle des données.
 *
 * Clés attendues dans Propriétés du script (Paramètres du projet) :
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *
 * Fonction à lancer manuellement pour tester : saasSyncSupabaseTout()
 * Pas encore appelée automatiquement : aucun déclencheur n'est créé ici.
 * ============================================================================
 */

const SAAS_SUPA_TAILLE_PAQUET = 300;

function saasSupaConfig_() {
  const props = PropertiesService.getScriptProperties();
  const url = (props.getProperty('SUPABASE_URL') || '').trim();
  const cle = (props.getProperty('SUPABASE_SERVICE_KEY') || '').trim();
  if (!url || !cle) throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_KEY absent des propriétés du script.');
  return { url: url, cle: cle };
}

/** Envoie un tableau de lignes vers une table Supabase, par paquets, en upsert sur la clé de conflit donnée. */
function saasSupaEnvoyerParPaquets_(table, conflictCols, lignes) {
  if (!lignes.length) return { envoyees: 0, erreurs: [] };
  const config = saasSupaConfig_();
  const endpoint = config.url + '/rest/v1/' + table + '?on_conflict=' + encodeURIComponent(conflictCols);
  const erreurs = [];
  let envoyees = 0;

  for (let i = 0; i < lignes.length; i += SAAS_SUPA_TAILLE_PAQUET) {
    const paquet = lignes.slice(i, i + SAAS_SUPA_TAILLE_PAQUET);
    const reponse = UrlFetchApp.fetch(endpoint, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        apikey: config.cle,
        Authorization: 'Bearer ' + config.cle,
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      payload: JSON.stringify(paquet),
      muteHttpExceptions: true
    });
    const code = reponse.getResponseCode();
    if (code >= 200 && code < 300) {
      envoyees += paquet.length;
    } else {
      erreurs.push('Paquet ' + (Math.floor(i / SAAS_SUPA_TAILLE_PAQUET) + 1) + ' (HTTP ' + code + ') : ' + reponse.getContentText().substring(0, 300));
    }
  }
  return { envoyees: envoyees, erreurs: erreurs };
}

/** Construit les lignes de la table "avis" à partir de TOUS_AO (réutilise saasAvisLireTous_, lecture seule). */
function saasSupaConstruireLignesAvis_() {
  const lecture = saasAvisLireTous_();
  if (lecture.erreur) throw new Error('Lecture TOUS_AO impossible : ' + lecture.erreur);
  const maintenant = new Date().toISOString();
  return lecture.avis.map(function (a) {
    return {
      id_avis: a.idAvis,
      numero_avis: a.numeroAvis || null,
      titre: a.titre || null,
      autorite: a.autorite || null,
      region: a.region || null,
      source: a.source || null,
      source_type: a.sourceType || null,
      procedure: a.procedure || null,
      montant: a.montant,
      montant_texte: a.montantTexte || null,
      date_limite: a.dateLimite || null,
      date_limite_estimee: !!a.dateLimiteEstimee,
      date_limite_texte: a.dateLimiteTexte || null,
      date_publication: a.datePublication || null,
      date_collecte: a.dateCollecte || null,
      statut: a.statut || null,
      lien: a.lien || null,
      lien_dao: a.lienDao || null,
      type_publication: a.typePublication || null,
      attributaire: a.attributaire || null,
      montant_attribue: a.montantAttribue,
      date_attribution: a.dateAttribution || null,
      recherche: a._recherche || null,
      synced_at: maintenant
    };
  });
}

/** Liste les identifiants des clients actifs (onglet CLIENTS, colonne ACTIF = OUI). */
function saasSupaListerClientsActifs_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = ss.getSheetByName('CLIENTS');
  if (!feuille) return [];
  const data = feuille.getDataRange().getValues();
  const entetes = saasLireHeader(feuille);
  const idxId = entetes.indexOf('ID_CLIENT');
  const idxActif = entetes.indexOf('ACTIF');
  if (idxId < 0) return [];
  const ids = [];
  for (let i = 1; i < data.length; i++) {
    const id = (data[i][idxId] || '').toString().trim();
    if (!id) continue;
    if (idxActif >= 0) {
      const actif = (data[i][idxActif] || '').toString().trim().toUpperCase();
      if (actif !== 'OUI') continue;
    }
    ids.push(id);
  }
  return ids;
}

/** Construit les lignes "alertes_client" d'un client (réutilise saasChargerAlertesClient, lecture seule). */
function saasSupaConstruireLignesAlertesClient_(idClient) {
  const alertes = saasChargerAlertesClient(idClient);
  const maintenant = new Date().toISOString();
  return alertes.map(function (al) {
    return {
      id_match: al.idMatch,
      id_client: idClient,
      id_avis: al.idAO,
      numero_avis: al.numeroAvis || null,
      date_match: al.dateMatch || null,
      statut_pipeline: al.statutPipeline || null,
      date_envoi: al.dateEnvoi || null,
      score: al.score,
      justification: al.justification || null,
      score_mots: al.scoreMots,
      score_ia: al.scoreIA,
      titre: al.titre || null,
      maitre_ouvrage: al.maitreOuvrage || null,
      region: al.region || null,
      procedure: al.procedure || null,
      montant: al.montant || null,
      date_limite: al.dateLimite || null,
      lien_detail: al.lienDetail || null,
      lien_dao: al.lienDAO || null,
      source: al.source || null,
      type_publication: al.typePublication || null,
      lu: !!al.lu,
      etat: al.etat || null,
      note_client: al.noteClient || null,
      date_lu: al.dateLu || null,
      date_action: al.dateAction || null,
      decision: al.decision || null,
      decision_justification: al.decisionJustification || null,
      decision_lien_complementaire: al.decisionLienComplementaire || null,
      decision_par: al.decisionPar || null,
      date_decision: al.dateDecision || null,
      nb_notes: al.nbNotes || 0,
      est_expire: !!al.estExpire,
      synced_at: maintenant
    };
  });
}

/**
 * Fonction principale : synchronise TOUS_AO et les alertes de tous les clients actifs
 * vers Supabase. Ne modifie JAMAIS le classeur. À lancer manuellement pour tester,
 * puis (après validation) à appeler en fin de collecte et en fin de passage Spark.
 */
function saasSyncSupabaseTout() {
  const debut = new Date().getTime();
  const resultat = { avis: null, alertes: {}, dureeMs: 0 };

  const lignesAvis = saasSupaConstruireLignesAvis_();
  resultat.avis = saasSupaEnvoyerParPaquets_('avis', 'id_avis', lignesAvis);

  const clients = saasSupaListerClientsActifs_();
  clients.forEach(function (idClient) {
    const lignes = saasSupaConstruireLignesAlertesClient_(idClient);
    resultat.alertes[idClient] = saasSupaEnvoyerParPaquets_('alertes_client', 'id_client,id_match', lignes);
  });

  resultat.dureeMs = new Date().getTime() - debut;
  Logger.log(JSON.stringify(resultat));
  return resultat;
}
