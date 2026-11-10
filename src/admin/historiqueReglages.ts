import { REGLAGES, DefinitionReglage } from './registreReglages';

/**
 * HISTORIQUE DES RÉGLAGES (lecture du journal d'audit)
 * ------------------------------------------------------------------
 * Format écrit par Apps Script dans la colonne Details des événements ADMIN_REGLAGES_PARAMETRES_UPDATE :
 *   champs=Cle1,Cle2 | avant/apres={"Cle1":["ancienne","nouvelle"],"Cle2":["…","…"]}
 * Les anciens événements (sans valeurs) ne contiennent que « champs=… » : ils restent lisibles,
 * mais ne proposent aucun rétablissement.
 * Seuls les réglages déclarés dans le registre (donc jamais les clés API) sont restaurables.
 */

const MARQUEUR = 'avant/apres=';

export interface ChangementReglage {
  def: DefinitionReglage;
  avant: string;
  apres: string;
}

export function lireChangementsReglages(action: string, details: string): ChangementReglage[] {
  if (!String(action || '').toUpperCase().includes('REGLAGES_PARAMETRES')) return [];
  const texte = String(details || '');
  const i = texte.indexOf(MARQUEUR);
  if (i === -1) return [];
  try {
    // Le JSON peut être suivi de « refuses=… » : on ne garde que jusqu'à la dernière accolade.
    const reste = texte.slice(i + MARQUEUR.length);
    const fin = reste.lastIndexOf('}');
    if (fin === -1) return [];
    const brut = JSON.parse(reste.slice(0, fin + 1).trim());
    if (!brut || typeof brut !== 'object') return [];
    const resultat: ChangementReglage[] = [];
    Object.keys(brut).forEach((cle) => {
      const def = REGLAGES.find((r) => r.cle === cle);
      const paire = brut[cle];
      if (!def || !Array.isArray(paire) || paire.length !== 2) return;
      resultat.push({ def, avant: String(paire[0] ?? ''), apres: String(paire[1] ?? '') });
    });
    return resultat;
  } catch {
    return [];
  }
}
