/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Utilitaires communs de lecture, validation et formatage des dates au fuseau Africa/Douala (UTC+1).
 * Sans dépendance externe, ne lance jamais d'exception.
 */

const FUSEAU_DOUALA = 'Africa/Douala';

/**
 * Vérifie si une année est bissextile.
 */
function estAnneeBissextile(annee: number): boolean {
  return (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0;
}

/**
 * Retourne le nombre maximum de jours dans un mois donné (1 à 12).
 */
function joursDansMois(annee: number, mois: number): number {
  if (mois < 1 || mois > 12) return 0;
  if (mois === 2) {
    return estAnneeBissextile(annee) ? 29 : 28;
  }
  if ([4, 6, 9, 11].includes(mois)) {
    return 30;
  }
  return 31;
}

/**
 * Analyse une date issue des flux (ISO, JJ-MM-AAAA, JJ/MM/AAAA, etc.) au fuseau Africa/Douala.
 * Ne lance JAMAIS d'exception, renvoie Date | null.
 */
export function parserDateLimite(valeur: unknown): Date | null {
  if (valeur === null || valeur === undefined) {
    return null;
  }

  if (valeur instanceof Date) {
    return isNaN(valeur.getTime()) ? null : valeur;
  }

  if (typeof valeur === 'number') {
    if (!Number.isFinite(valeur)) return null;
    const d = new Date(valeur);
    return isNaN(d.getTime()) ? null : d;
  }

  if (typeof valeur !== 'string') {
    return null;
  }

  // Nettoyage : retire espaces, apostrophes, tildes ou guillemets en tête/fin
  let str = valeur.trim().replace(/^['"`~]+/, '').trim();
  if (!str) {
    return null;
  }

  try {
    // 1. Format français : JJ-MM-AAAA ou JJ/MM/AAAA ou JJ.MM.AAAA (avec ou sans heure)
    const regexFr = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
    const matchFr = str.match(regexFr);

    if (matchFr) {
      const jour = parseInt(matchFr[1], 10);
      const mois = parseInt(matchFr[2], 10);
      const annee = parseInt(matchFr[3], 10);

      const aHeure = matchFr[4] !== undefined;
      const heure = aHeure ? parseInt(matchFr[4], 10) : 23;
      const minute = aHeure ? parseInt(matchFr[5], 10) : 59;
      const seconde = aHeure ? parseInt(matchFr[6] || '0', 10) : 59;

      if (
        annee < 1000 ||
        annee > 9999 ||
        mois < 1 ||
        mois > 12 ||
        jour < 1 ||
        jour > joursDansMois(annee, mois) ||
        heure < 0 ||
        heure > 23 ||
        minute < 0 ||
        minute > 59 ||
        seconde < 0 ||
        seconde > 59
      ) {
        return null;
      }

      // Douala est UTC+1 toute l'année : heure UTC = heure Douala - 1
      const timestampUtc = Date.UTC(annee, mois - 1, jour, heure - 1, minute, seconde);
      const date = new Date(timestampUtc);
      return isNaN(date.getTime()) ? null : date;
    }

    // 2. Format ISO avec indicateur de fuseau horaire (Z ou ±HH:mm ou ±HHmm)
    const regexIsoTz = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i;
    if (regexIsoTz.test(str)) {
      const y = parseInt(str.slice(0, 4), 10);
      const m = parseInt(str.slice(5, 7), 10);
      const d = parseInt(str.slice(8, 10), 10);

      if (y < 1000 || y > 9999 || m < 1 || m > 12 || d < 1 || d > joursDansMois(y, m)) {
        return null;
      }

      const date = new Date(str);
      return isNaN(date.getTime()) ? null : date;
    }

    // 3. Format ISO date seule : AAAA-MM-JJ (ex. 2026-10-09)
    const regexIsoDateSeule = /^(\d{4})-(\d{2})-(\d{2})$/;
    const matchIsoDate = str.match(regexIsoDateSeule);
    if (matchIsoDate) {
      const annee = parseInt(matchIsoDate[1], 10);
      const mois = parseInt(matchIsoDate[2], 10);
      const jour = parseInt(matchIsoDate[3], 10);

      if (annee < 1000 || annee > 9999 || mois < 1 || mois > 12 || jour < 1 || jour > joursDansMois(annee, mois)) {
        return null;
      }

      // 23h59min59s heure de Douala (UTC+1) = 22h59min59s UTC
      const timestampUtc = Date.UTC(annee, mois - 1, jour, 22, 59, 59);
      const date = new Date(timestampUtc);
      return isNaN(date.getTime()) ? null : date;
    }

    // 4. Format ISO sans fuseau : AAAA-MM-JJTHH:mm ou AAAA-MM-JJ HH:mm (avec ou sans secondes)
    const regexIsoSansTz = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?$/;
    const matchIsoSansTz = str.match(regexIsoSansTz);
    if (matchIsoSansTz) {
      const annee = parseInt(matchIsoSansTz[1], 10);
      const mois = parseInt(matchIsoSansTz[2], 10);
      const jour = parseInt(matchIsoSansTz[3], 10);
      const heure = parseInt(matchIsoSansTz[4], 10);
      const minute = parseInt(matchIsoSansTz[5], 10);
      const seconde = parseInt(matchIsoSansTz[6] || '0', 10);

      if (
        annee < 1000 ||
        annee > 9999 ||
        mois < 1 ||
        mois > 12 ||
        jour < 1 ||
        jour > joursDansMois(annee, mois) ||
        heure < 0 ||
        heure > 23 ||
        minute < 0 ||
        minute > 59 ||
        seconde < 0 ||
        seconde > 59
      ) {
        return null;
      }

      // Interprété comme heure de Douala (UTC+1)
      const timestampUtc = Date.UTC(annee, mois - 1, jour, heure - 1, minute, seconde);
      const date = new Date(timestampUtc);
      return isNaN(date.getTime()) ? null : date;
    }

    // Format non reconnu ou non standard : tentative de lecture prudente si Date standard l'accepte
    const dateFallback = new Date(str);
    if (!isNaN(dateFallback.getTime())) {
      return dateFallback;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Formateur interne pour obtenir l'année, le mois et le jour au fuseau Africa/Douala.
 */
const doualaPartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSEAU_DOUALA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

/**
 * Calcule la différence en JOURS CALENDAIRES entre la date de Douala d'aujourd'hui et la date de Douala de l'échéance :
 * 0 = aujourd'hui, positif = à venir, négatif = passée, null = date illisible.
 */
export function joursRestantsDouala(valeur: unknown, maintenant: Date = new Date()): number | null {
  const dateCible = parserDateLimite(valeur);
  if (!dateCible) {
    return null;
  }

  try {
    // Extraction de la date calendaire de 'maintenant' à Douala
    const partsMaintenant = doualaPartsFormatter.formatToParts(maintenant);
    const anneeM = parseInt(partsMaintenant.find((p) => p.type === 'year')?.value || '0', 10);
    const moisM = parseInt(partsMaintenant.find((p) => p.type === 'month')?.value || '0', 10);
    const jourM = parseInt(partsMaintenant.find((p) => p.type === 'day')?.value || '0', 10);

    // Extraction de la date calendaire de 'dateCible' à Douala
    const partsCible = doualaPartsFormatter.formatToParts(dateCible);
    const anneeC = parseInt(partsCible.find((p) => p.type === 'year')?.value || '0', 10);
    const moisC = parseInt(partsCible.find((p) => p.type === 'month')?.value || '0', 10);
    const jourC = parseInt(partsCible.find((p) => p.type === 'day')?.value || '0', 10);

    const utcMidnightMaintenant = Date.UTC(anneeM, moisM - 1, jourM, 0, 0, 0);
    const utcMidnightCible = Date.UTC(anneeC, moisC - 1, jourC, 0, 0, 0);

    const diffMs = utcMidnightCible - utcMidnightMaintenant;
    return Math.round(diffMs / (24 * 60 * 60 * 1000));
  } catch {
    return null;
  }
}

/**
 * Indique si une échéance est passée (vrai si passée, faux si encore valide ou si date illisible).
 */
export function estExpiree(valeur: unknown, maintenant: Date = new Date()): boolean {
  const d = parserDateLimite(valeur);
  if (!d) {
    return false;
  }
  return d.getTime() < maintenant.getTime();
}

/**
 * Formate une date au format « 9 oct. 2026 » (fr-FR) ou « 9 Oct 2026 » (en-GB) au fuseau Africa/Douala.
 * Renvoie « — » si la date est illisible. Ne lance jamais d'exception.
 */
export function formaterDateDouala(valeur: unknown, langue: 'fr' | 'en' = 'fr'): string {
  const d = parserDateLimite(valeur);
  if (!d) {
    return '—';
  }

  try {
    return new Intl.DateTimeFormat(langue === 'fr' ? 'fr-FR' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: FUSEAU_DOUALA
    }).format(d);
  } catch {
    return '—';
  }
}

/**
 * Formate une date avec heure au format « 9 oct. 2026, 12:00 » au fuseau Africa/Douala.
 * Renvoie « — » si la date est illisible. Ne lance jamais d'exception.
 */
export function formaterDateHeureDouala(valeur: unknown, langue: 'fr' | 'en' = 'fr'): string {
  const d = parserDateLimite(valeur);
  if (!d) {
    return '—';
  }

  try {
    const datePart = formaterDateDouala(d, langue);
    const timeFormatter = new Intl.DateTimeFormat('fr-FR', {
      timeZone: FUSEAU_DOUALA,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const timePart = timeFormatter.format(d);
    return `${datePart}, ${timePart}`;
  } catch {
    return '—';
  }
}
