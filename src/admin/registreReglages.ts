import type { ReglagesParametres } from '../types';

/**
 * REGISTRE DÉCLARATIF DES RÉGLAGES
 * ------------------------------------------------------------------
 * Décrit chaque réglage (libellé, effet, type, domaine). Les VALEURS restent dans la feuille
 * PARAMETRES et dans le coffre (PropertiesService) : ce fichier ne contient que des textes.
 *
 * Pour afficher un nouveau réglage déjà modifiable côté serveur :
 *   1. ajouter sa clé dans ReglagesParametres (src/types/index.ts) ;
 *   2. ajouter UNE entrée dans REGLAGES ci-dessous ;
 *   (un réglage non autorisé par Apps Script serait refusé à l'enregistrement.)
 */

export type DomaineReglage = 'collecte' | 'alertes' | 'ia' | 'securite';

export interface DomaineInfo {
  id: DomaineReglage;
  titre: string;
  description: string;
}

export const DOMAINES_REGLAGES: DomaineInfo[] = [
  { id: 'collecte', titre: 'Collecte', description: 'Ce que le pipeline collecte, quand, et ce qu’il retient.' },
  { id: 'alertes', titre: 'Alertes et e-mails', description: 'Adresses d’envoi, heure du courrier du matin, quota et reporting.' },
  { id: 'ia', titre: 'Intelligence artificielle', description: 'Clés des moteurs IA et moteur de secours.' },
  { id: 'securite', titre: 'Sécurité', description: 'Protection des échanges entre l’application et Apps Script.' }
];

export type TypeReglage = 'email' | 'nombre' | 'heure' | 'ouinon';

export interface DefinitionReglage {
  cle: keyof ReglagesParametres;
  domaine: DomaineReglage;
  label: string;
  /** Une phrase : ce que le réglage change concrètement. */
  effet: string;
  type: TypeReglage;
  /** Si renseigné, ce réglage impacte le quota d'appels IA : l'avertissement est repris dans la confirmation. */
  impactQuotaIA?: boolean;
}

export const REGLAGES: DefinitionReglage[] = [
  {
    cle: 'Fenetre_Veille_Heures',
    domaine: 'collecte',
    label: 'Fenêtre de veille (heures)',
    effet: 'Période, en heures, sur laquelle la veille regarde les avis. Plus elle est large, plus il y a d’avis à traiter.',
    type: 'nombre'
  },
  {
    cle: 'Heure_Collecte_Nuit',
    domaine: 'collecte',
    label: 'Heure de collecte (nuit)',
    effet: 'Heure (Africa/Douala) de la collecte de nuit, enregistrée dans PARAMETRES. Elle ne crée ni ne déplace aucun déclencheur à elle seule.',
    type: 'heure'
  },
  {
    cle: 'Seuil_Score_Pertinence_Min',
    domaine: 'collecte',
    label: 'Seuil de score de pertinence min.',
    effet: 'Score minimal de pertinence. Un seuil plus bas retient plus d’avis et peut donc augmenter les appels à l’IA.',
    type: 'nombre',
    impactQuotaIA: true
  },
  {
    cle: 'Email_Admin_Logs',
    domaine: 'alertes',
    label: 'E-mail administrateur (journaux)',
    effet: 'Adresse qui reçoit les messages techniques d’exploitation.',
    type: 'email'
  },
  {
    cle: 'Email_Reply_To',
    domaine: 'alertes',
    label: 'E-mail de réponse (Reply-To)',
    effet: 'Adresse vers laquelle partent les réponses des clients aux alertes e-mail.',
    type: 'email'
  },
  {
    cle: 'Heure_Envoi_Matin',
    domaine: 'alertes',
    label: 'Heure d’envoi (matin)',
    effet: 'Heure (Africa/Douala) de l’envoi du matin, enregistrée dans PARAMETRES. Elle ne crée ni ne déplace aucun déclencheur à elle seule.',
    type: 'heure'
  },
  {
    cle: 'Seuil_Alerte_Quota_Emails',
    domaine: 'alertes',
    label: 'Seuil d’alerte quota e-mails',
    effet: 'Seuil à partir duquel une alerte prévient que le quota d’e-mails approche.',
    type: 'nombre'
  },
  {
    cle: 'Activer_Reporting',
    domaine: 'alertes',
    label: 'Activer le reporting',
    effet: 'Active ou désactive le reporting destiné à l’administrateur.',
    type: 'ouinon'
  },
  {
    cle: 'Activer_Fallback_DeepSeek',
    domaine: 'ia',
    label: 'Moteur de secours (DeepSeek)',
    effet: 'Autorise le moteur secondaire DeepSeek lorsque le moteur principal ne répond pas. Peut consommer du quota DeepSeek.',
    type: 'ouinon',
    impactQuotaIA: true
  }
];

export function reglagesDuDomaine(domaine: DomaineReglage): DefinitionReglage[] {
  return REGLAGES.filter((r) => r.domaine === domaine);
}

/** Texte lisible d'une valeur pour le résumé de confirmation. */
export function valeurLisible(def: DefinitionReglage, valeur: unknown): string {
  const v = valeur === undefined || valeur === null ? '' : String(valeur).trim();
  if (v === '') return '(vide)';
  if (def.type === 'ouinon') return v === 'OUI' ? 'Activé' : 'Désactivé';
  return v;
}

/** Les modifications entre deux jeux de valeurs, pour les réglages d'un domaine. */
export function differences(
  domaine: DomaineReglage,
  avant: ReglagesParametres,
  apres: ReglagesParametres
): { def: DefinitionReglage; ancien: string; nouveau: string }[] {
  return reglagesDuDomaine(domaine)
    .filter((def) => String(avant[def.cle] ?? '').trim() !== String(apres[def.cle] ?? '').trim())
    .map((def) => ({
      def,
      ancien: valeurLisible(def, avant[def.cle]),
      nouveau: valeurLisible(def, apres[def.cle])
    }));
}
