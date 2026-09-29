/**
 * Types officiels pour le Radar Market Advisor CM (LOT 3A)
 */

export interface AvisRadar {
  id: string;
  titre: string;
  autorite: string; // maître d'ouvrage
  region: string;
  source: 'ARMP' | 'COLEPS' | 'BAILLEURS' | 'ONU';
  procedure: 'AONO' | 'AMI' | 'AOI';
  montantFcfa: number;
  dateLimiteIso: string;
  scoreIa: number; // 0 à 5
}

export type CategorieAvis = 'national' | 'international';
