/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {
  parserDateLimite,
  joursRestantsDouala,
  estExpiree,
  formaterDateDouala,
  formaterDateHeureDouala
} from './dates';
import { formatDateDouala, formatDateTimeDouala } from './exportCsv';

console.log('Exécution des tests unitaires pour dates.ts et exportCsv.ts...');

// 1. Tests de parserDateLimite
// « 09-10-2026 » donne le 9 octobre 2026 à Douala (23h59min59s Douala = 22h59min59s UTC)
const d1 = parserDateLimite('09-10-2026');
assert.ok(d1 !== null, '09-10-2026 doit être analysable');
assert.strictEqual(d1.toISOString(), '2026-10-09T22:59:59.000Z');

// « 19-10-2026 » est valide
const d2 = parserDateLimite('19-10-2026');
assert.ok(d2 !== null, '19-10-2026 doit être valide');
assert.strictEqual(d2.toISOString(), '2026-10-19T22:59:59.000Z');

// « '09-10-2026 » (avec apostrophe) est valide
const d3 = parserDateLimite("'09-10-2026");
assert.ok(d3 !== null, "'09-10-2026 doit être valide");
assert.strictEqual(d3.toISOString(), '2026-10-09T22:59:59.000Z');

// « 09/10/2026 » est valide
const d4 = parserDateLimite('09/10/2026');
assert.ok(d4 !== null, '09/10/2026 doit être valide');
assert.strictEqual(d4.toISOString(), '2026-10-09T22:59:59.000Z');

// « 09-10-2026 12:00 » vaut 2026-10-09T11:00:00Z
const d5 = parserDateLimite('09-10-2026 12:00');
assert.ok(d5 !== null, '09-10-2026 12:00 doit être valide');
assert.strictEqual(d5.toISOString(), '2026-10-09T11:00:00.000Z');

// « 2026-10-09 » vaut 2026-10-09T22:59:59Z
const d6 = parserDateLimite('2026-10-09');
assert.ok(d6 !== null, '2026-10-09 doit être valide');
assert.strictEqual(d6.toISOString(), '2026-10-09T22:59:59.000Z');

// « 2026-10-09T11:00:00Z » est inchangé
const d7 = parserDateLimite('2026-10-09T11:00:00Z');
assert.ok(d7 !== null, '2026-10-09T11:00:00Z doit être valide');
assert.strictEqual(d7.toISOString(), '2026-10-09T11:00:00.000Z');

// « 31-02-2026 », « », « abc », undefined et null renvoient null
assert.strictEqual(parserDateLimite('31-02-2026'), null);
assert.strictEqual(parserDateLimite(''), null);
assert.strictEqual(parserDateLimite('abc'), null);
assert.strictEqual(parserDateLimite(undefined), null);
assert.strictEqual(parserDateLimite(null), null);

// 2. Tests de formaterDateDouala
const strFr = formaterDateDouala('19-10-2026', 'fr');
// En fr-FR, « 19 oct. 2026 »
assert.ok(strFr.includes('19') && strFr.includes('oct') && strFr.includes('2026'), `Format FR attendu avec 19 oct. 2026, reçu : "${strFr}"`);

const strInvalid = formaterDateDouala('abc');
assert.strictEqual(strInvalid, '—');

// Test de formaterDateHeureDouala
const strHeure = formaterDateHeureDouala('09-10-2026 12:00', 'fr');
assert.ok(strHeure.includes('9') && strHeure.includes('oct') && strHeure.includes('12:00'), `Format FR heure attendu avec 9 oct. 2026, 12:00, reçu : "${strHeure}"`);

// 3. Tests de joursRestantsDouala avec maintenant = 2026-09-29T10:00:00Z
// À 10:00:00 UTC le 2026-09-29, à Douala (UTC+1) il est 11:00 le 2026-09-29.
const maintenantFixe = new Date('2026-09-29T10:00:00Z');

// « 09-10-2026 » → 10 jours
const jr10 = joursRestantsDouala('09-10-2026', maintenantFixe);
assert.strictEqual(jr10, 10, `Attendu 10 jours pour 09-10-2026, reçu: ${jr10}`);

// « 29-09-2026 » → 0
const jr0 = joursRestantsDouala('29-09-2026', maintenantFixe);
assert.strictEqual(jr0, 0, `Attendu 0 jour pour 29-09-2026, reçu: ${jr0}`);

// « 28-09-2026 » → -1
const jrNeg1 = joursRestantsDouala('28-09-2026', maintenantFixe);
assert.strictEqual(jrNeg1, -1, `Attendu -1 jour pour 28-09-2026, reçu: ${jrNeg1}`);

// Date illisible → null
assert.strictEqual(joursRestantsDouala('abc', maintenantFixe), null);

// 4. Tests de estExpiree
assert.strictEqual(estExpiree('28-09-2026', maintenantFixe), true);
assert.strictEqual(estExpiree('29-09-2026', maintenantFixe), false); // se termine à 23h59 Douala > 11h Douala
assert.strictEqual(estExpiree('09-10-2026', maintenantFixe), false);
assert.strictEqual(estExpiree('abc', maintenantFixe), false);

// 5. Tests d'export CSV
assert.strictEqual(formatDateDouala('09-10-2026'), '09/10/2026');
assert.strictEqual(formatDateDouala('19-10-2026'), '19/10/2026');
assert.strictEqual(formatDateDouala('2026-10-09T11:00:00Z'), '09/10/2026');
assert.strictEqual(formatDateDouala('date-inconnue'), 'date-inconnue');
assert.strictEqual(formatDateDouala(''), '');
assert.strictEqual(formatDateDouala(undefined), '');

assert.strictEqual(formatDateTimeDouala('09-10-2026 12:00'), '09/10/2026 12:00');
assert.strictEqual(formatDateTimeDouala('2026-10-09T11:00:00Z'), '09/10/2026 12:00');
assert.strictEqual(formatDateTimeDouala('non-valide'), 'non-valide');

console.log('dates.ts : tous les tests passent');
