import { AvisRadar, CategorieAvis } from '../types/radar';

/**
 * Détermine la catégorie (« national » ou « international ») selon la source.
 */
export function categoriePourSource(source: AvisRadar['source']): CategorieAvis {
  return source === 'ARMP' || source === 'COLEPS' ? 'national' : 'international';
}

/**
 * Déduit la source canonique ('ARMP' | 'COLEPS' | 'BAILLEURS' | 'ONU')
 * selon des règles strictes à base de mots entiers et du type de source.
 */
export function deduireSourceCanonique(
  sourceNom?: string | null,
  sourceType?: string | null
): AvisRadar['source'] {
  const nom = (sourceNom || '').trim();
  const typeUpper = (sourceType || '').trim().toUpperCase();

  // Mots entiers pour les agences de l'ONU
  const regexOnu = /\b(ONU|UN|UNDP|PNUD|UNICEF|OMS|WHO)\b/i;
  // Mot entier pour COLEPS
  const regexColeps = /\bCOLEPS\b/i;

  // (a) Regarde d'abord la propriété sourceType envoyée par l'API
  if (typeUpper) {
    const isInternational = typeUpper.startsWith('INTERNATIONAL');
    if (isInternational) {
      // (b) International : ONU si mot entier ONU/UN/PNUD/etc., sinon BAILLEURS
      return regexOnu.test(nom) ? 'ONU' : 'BAILLEURS';
    } else {
      // (c) National : COLEPS si mot entier COLEPS, sinon ARMP
      return regexColeps.test(nom) ? 'COLEPS' : 'ARMP';
    }
  }

  // (d) Si sourceType est absent, applique les mêmes règles de mots entiers sur le nom de la source
  if (regexOnu.test(nom)) {
    return 'ONU';
  }
  const regexBailleurs = /\b(BAILLEUR|BAILLEURS|BANQUE|BM|BAD|AFD|UE|DEVELOPMENTAID|DEVELOPMENT|INTERNATIONAL)\b/i;
  if (regexBailleurs.test(nom)) {
    return 'BAILLEURS';
  }
  if (regexColeps.test(nom)) {
    return 'COLEPS';
  }
  return 'ARMP';
}

/**
 * Calcule le nombre de jours restants jusqu'à la date limite au fuseau Africa/Douala (UTC+1).
 * Arrondi au jour supérieur, jamais négatif.
 */
export function joursRestants(dateLimiteIso: string): number {
  try {
    const now = new Date();
    const target = new Date(dateLimiteIso);

    // Décalage temporel en millisecondes
    const diffMs = target.getTime() - now.getTime();
    if (isNaN(diffMs) || diffMs <= 0) {
      return 0;
    }

    // Arrondi au jour supérieur
    const jours = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return Math.max(0, jours);
  } catch {
    return 0;
  }
}

/**
 * Échelle de rayon par paliers avec interpolation logarithmique :
 * 1 000 000 → 0,08
 * 10 000 000 → 0,3333
 * 100 000 000 → 0,6667
 * 1 000 000 000 → 1,0
 * En dessous de 1 000 000 : 0,08
 * Au-dessus de 1 000 000 000 : plafonné à 0,97
 */
export function rayonPourMontant(montantFcfa: number): number {
  if (montantFcfa <= 1_000_000) return 0.08;
  if (montantFcfa >= 1_000_000_000) return 0.97;

  const logM = Math.log10(montantFcfa);

  if (montantFcfa < 10_000_000) {
    // Entre 1M (10^6) et 10M (10^7)
    const fraction = logM - 6;
    return 0.08 + fraction * (0.3333 - 0.08);
  } else if (montantFcfa < 100_000_000) {
    // Entre 10M (10^7) et 100M (10^8)
    const fraction = logM - 7;
    return 0.3333 + fraction * (0.6667 - 0.3333);
  } else {
    // Entre 100M (10^8) et 1B (10^9)
    const fraction = logM - 8;
    return 0.6667 + fraction * (1.0 - 0.6667);
  }
}

export interface PositionRadar {
  x: number;
  y: number;
  angleDeg: number;
  rayonFraction: number;
  R: number;
  jours: number;
}

/**
 * Calcule les coordonnées SVG (viewBox 540x540) d'un avis sur le radar :
 * angle = (joursRestants plafonné à 29,5 / 30) × 360° (dans le sens horaire à partir du haut)
 * R = rayon × 245
 * x = 270 + R sin(angle)
 * y = 270 − R cos(angle)
 */
export function calculerPositionAvis(avis: AvisRadar): PositionRadar {
  const jours = joursRestants(avis.dateLimiteIso);
  const joursPlafonnes = Math.min(29.5, jours);
  const angleDeg = (joursPlafonnes / 30) * 360;
  const angleRad = (angleDeg * Math.PI) / 180;

  const rayonFraction = rayonPourMontant(avis.montantFcfa);
  const R = rayonFraction * 245;

  const x = 270 + R * Math.sin(angleRad);
  const y = 270 - R * Math.cos(angleRad);

  return {
    x,
    y,
    angleDeg,
    rayonFraction,
    R,
    jours
  };
}

/**
 * Jeu d'exemples illustratifs conformes aux spécifications LOT 3A
 * (les dates sont calculées à partir de la date du jour au fuseau Africa/Douala).
 */
export function genererExemplesAvisRadar(): AvisRadar[] {
  const creerDateDansJours = (nbJours: number) => {
    return new Date(Date.now() + nbJours * 24 * 60 * 60 * 1000).toISOString();
  };

  return [
    {
      id: 'ex-1',
      titre: "Travaux d'extension du réseau d'eau potable et construction de 3 forages équipés",
      autorite: 'Commune de Bondjock',
      region: 'Centre',
      source: 'ARMP',
      procedure: 'AONO',
      montantFcfa: 48_000_000,
      dateLimiteIso: creerDateDansJours(10),
      scoreIa: 4.8
    },
    {
      id: 'ex-2',
      titre: "Construction d'un pont en béton armé sur la rivière Mbam",
      autorite: 'Ministère des Travaux publics',
      region: 'Centre',
      source: 'COLEPS',
      procedure: 'AONO',
      montantFcfa: 780_000_000,
      dateLimiteIso: creerDateDansJours(21),
      scoreIa: 4.3
    },
    {
      id: 'ex-3',
      titre: 'Fourniture de 2 000 tables-bancs pour les écoles publiques',
      autorite: 'Commune de Ngaoundéré II',
      region: 'Adamaoua',
      source: 'ARMP',
      procedure: 'AONO',
      montantFcfa: 36_000_000,
      dateLimiteIso: creerDateDansJours(5),
      scoreIa: 4.1
    },
    {
      id: 'ex-4',
      titre: 'Étude de faisabilité d\'un marché périodique',
      autorite: 'Commune de Bafoussam III',
      region: 'Ouest',
      source: 'ARMP',
      procedure: 'AMI',
      montantFcfa: 9_000_000,
      dateLimiteIso: creerDateDansJours(18),
      scoreIa: 3.6
    },
    {
      id: 'ex-5',
      titre: 'Programme d\'appui à l\'électrification rurale, lot 3',
      autorite: 'Bailleur de fonds international',
      region: 'Nord',
      source: 'BAILLEURS',
      procedure: 'AOI',
      montantFcfa: 1_400_000_000,
      dateLimiteIso: creerDateDansJours(27),
      scoreIa: 4.0
    },
    {
      id: 'ex-6',
      titre: 'Fourniture de kits de santé de base',
      autorite: 'Agence des Nations Unies',
      region: 'Extrême-Nord',
      source: 'ONU',
      procedure: 'AOI',
      montantFcfa: 210_000_000,
      dateLimiteIso: creerDateDansJours(26),
      scoreIa: 3.9
    },
    {
      id: 'ex-7',
      titre: 'Réhabilitation de 12 km de piste rurale',
      autorite: 'Commune de Mbandjock',
      region: 'Centre',
      source: 'COLEPS',
      procedure: 'AONO',
      montantFcfa: 160_000_000,
      dateLimiteIso: creerDateDansJours(8),
      scoreIa: 4.5
    },
    {
      id: 'ex-8',
      titre: 'Fourniture de produits d\'entretien et d\'hygiène',
      autorite: 'Hôpital régional',
      region: 'Littoral',
      source: 'COLEPS',
      procedure: 'AONO',
      montantFcfa: 22_000_000,
      dateLimiteIso: creerDateDansJours(2),
      scoreIa: 3.2
    }
  ];
}
