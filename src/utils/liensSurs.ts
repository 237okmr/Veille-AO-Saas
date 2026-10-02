/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Caractères interdits : espaces (\s), caractères de contrôle (0x00-0x1F, 0x7F), et " ' < > ` \
const CARACTERES_INTERDITS = /[\s\x00-\x1F\x7F"'<>`\\]/;

// Détection d'un schéma explicite au début de la chaîne (ex: "http:", "https:", "javascript:", "data:", "ftp:")
const SCHEMA_PREFIX = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/**
 * Valide et assainit une URL pour un usage sécurisé (attributs href, liens externes).
 * Retourne le texte d'origine nettoyé (trim) si l'URL est valide et sûre, sinon null.
 */
export function lienSur(valeur: unknown): string | null {
  if (typeof valeur !== 'string') {
    return null;
  }

  const texteNettoye = valeur.trim();
  if (!texteNettoye) {
    return null;
  }

  // Doit commencer par http:// ou https:// (insensible à la casse)
  if (!/^https?:\/\//i.test(texteNettoye)) {
    return null;
  }

  // Ne doit contenir aucun espace, aucun caractère de contrôle et aucun caractère interdit (" ' < > ` \)
  if (CARACTERES_INTERDITS.test(texteNettoye)) {
    return null;
  }

  // Analyse syntaxique via new URL
  try {
    const url = new URL(texteNettoye);
    const protocole = url.protocol.toLowerCase();
    if (protocole !== 'http:' && protocole !== 'https:') {
      return null;
    }
    if (!url.hostname || url.hostname.trim() === '') {
      return null;
    }
  } catch {
    return null;
  }

  return texteNettoye;
}

/**
 * Si la valeur est une chaîne sans schéma (« xxx: »), ajoute « https:// » puis applique lienSur.
 * Si un autre schéma est présent (javascript:, data:, ftp:, etc.), retourne null.
 */
export function lienSurAvecHttps(valeur: unknown): string | null {
  if (typeof valeur !== 'string') {
    return null;
  }

  const texteNettoye = valeur.trim();
  if (!texteNettoye) {
    return null;
  }

  if (SCHEMA_PREFIX.test(texteNettoye)) {
    // Si un schéma commence par http:// ou https://, on passe directement à lienSur
    if (/^https?:\/\//i.test(texteNettoye)) {
      return lienSur(texteNettoye);
    }
    // Tout autre schéma (javascript:, data:, ftp:, mailto:, etc.) est refusé
    return null;
  }

  // Aucun schéma (« xxx: ») présent : on ajoute https://
  return lienSur(`https://${texteNettoye}`);
}
