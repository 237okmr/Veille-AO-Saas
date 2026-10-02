import { AdminClientAlertItem } from '../types';
import { parserDateLimite } from './dates';

const HEADERS = [
  'Entreprise',
  "N° d'avis",
  'Titre',
  "Maître d'ouvrage",
  'Région',
  'Montant (FCFA)',
  'Date limite',
  'Statut',
  'Date du match',
  "Date d'envoi",
  'Score',
  'Justification',
  "Lien de l'avis"
];

/**
 * Format a date string into JJ/MM/AAAA in Africa/Douala timezone (UTC+1).
 * If the value is unparseable, returns the original text (never an empty cell or false date).
 */
export function formatDateDouala(val?: unknown): string {
  if (val === null || val === undefined) return '';
  const originalStr = String(val).trim();
  if (!originalStr) return '';

  const d = parserDateLimite(val);
  if (!d) return originalStr;

  try {
    const formatter = new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Africa/Douala',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const parts = formatter.formatToParts(d);
    const day = parts.find((p) => p.type === 'day')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const year = parts.find((p) => p.type === 'year')?.value;
    if (!day || !month || !year) return originalStr;
    return `${day}/${month}/${year}`;
  } catch {
    return originalStr;
  }
}

/**
 * Format a date string into JJ/MM/AAAA HH:mm in Africa/Douala timezone (UTC+1).
 * If the value is unparseable, returns the original text (never an empty cell or false date).
 */
export function formatDateTimeDouala(val?: unknown): string {
  if (val === null || val === undefined) return '';
  const originalStr = String(val).trim();
  if (!originalStr) return '';

  const d = parserDateLimite(val);
  if (!d) return originalStr;

  try {
    const formatter = new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Africa/Douala',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(d);
    const day = parts.find((p) => p.type === 'day')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const year = parts.find((p) => p.type === 'year')?.value;
    const hour = parts.find((p) => p.type === 'hour')?.value;
    const minute = parts.find((p) => p.type === 'minute')?.value;
    if (!day || !month || !year || !hour || !minute) return originalStr;
    return `${day}/${month}/${year} ${hour}:${minute}`;
  } catch {
    return originalStr;
  }
}

/**
 * Returns today's date in Africa/Douala timezone as AAAA-MM-JJ
 */
export function getTodayDoualaIso(): string {
  const d = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Douala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(d);
}

/**
 * Convert client name to clean slug for filename
 */
export function sanitizeClientSlug(nom: string): string {
  return (
    nom
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove accents
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-') // non-alphanumerics to dash
      .replace(/^-+|-+$/g, '') // trim leading/trailing dashes
    || 'client'
  );
}

/**
 * Escapes a cell for French CSV:
 * - Prepends single quote for formula injection characters (=, +, -, @), leading tabs (\t),
 *   carriage returns (\r), or spaces followed by (=, +, -, @) unless already starting with a single quote.
 * - Quotes strings containing semicolons, quotes, or newlines and doubles quotes.
 */
export function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  let str = String(val);

  // Formula injection defense
  if (!str.startsWith("'") && (/^[\t\r]/.test(str) || /^ *[=+\-@]/.test(str))) {
    str = `'${str}`;
  }

  // Quote wrapping & internal quote doubling if semicolon, quote, or newline present
  if (/[;"\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Converts list of alerts to CSV string and triggers browser download
 */
export function exportAlertsToCsv(alerts: AdminClientAlertItem[], fallbackClientNom: string): void {
  const headerLine = HEADERS.map(escapeCsvCell).join(';');
  const rows = alerts.map((al) => {
    const entreprise = al.nomClient || fallbackClientNom || '';
    const numAvis = al.numeroAvis || al.idAvis || al.idAO || '';
    const titre = al.titre || '';
    const mo = al.maitreOuvrage || '';
    const region = al.region || '';
    const montant =
      al.montant !== undefined && al.montant !== null && al.montant > 0
        ? String(al.montant)
        : '';
    const dateLimite = formatDateDouala(al.dateLimite);
    const statut = al.statut || '';
    const dateMatch = formatDateTimeDouala(al.dateMatch);
    const dateEnvoi = formatDateTimeDouala(al.dateEnvoi);
    const score =
      typeof al.score === 'number'
        ? al.score.toString().replace('.', ',')
        : '';
    const justification = al.justification || '';
    const lienAvis = al.lienDetail || al.lienDAO || '';

    return [
      entreprise,
      numAvis,
      titre,
      mo,
      region,
      montant,
      dateLimite,
      statut,
      dateMatch,
      dateEnvoi,
      score,
      justification,
      lienAvis
    ]
      .map(escapeCsvCell)
      .join(';');
  });

  const csvContent = '\uFEFF' + [headerLine, ...rows].join('\r\n') + '\r\n';
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const clientSlug = sanitizeClientSlug(fallbackClientNom);
  const todayIso = getTodayDoualaIso();
  link.download = `alertes_${clientSlug}_${todayIso}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
