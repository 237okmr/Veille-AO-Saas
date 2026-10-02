/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import { escapeCsvCell } from './exportCsv';

console.log('Exécution des tests unitaires pour exportCsv.ts (escapeCsvCell)...');

// 1. « =1+1 » donne « '=1+1 »
assert.strictEqual(
  escapeCsvCell('=1+1'),
  "'=1+1",
  '« =1+1 » doit recevoir une apostrophe de neutralisation'
);

// 2. « +237699000000 » donne « '+237699000000 »
assert.strictEqual(
  escapeCsvCell('+237699000000'),
  "'+237699000000",
  '« +237699000000 » doit recevoir une apostrophe de neutralisation'
);

// 3. « -5 » donne « '-5 »
assert.strictEqual(
  escapeCsvCell('-5'),
  "'-5",
  '« -5 » doit recevoir une apostrophe de neutralisation'
);

// 4. « @SUM(1) » donne « '@SUM(1) »
assert.strictEqual(
  escapeCsvCell('@SUM(1)'),
  "'@SUM(1)",
  '« @SUM(1) » doit recevoir une apostrophe de neutralisation'
);

// 5. « <tabulation>=1 » reçoit l'apostrophe
assert.strictEqual(
  escapeCsvCell('\t=1'),
  "'\t=1",
  '« <tabulation>=1 » doit recevoir une apostrophe de neutralisation'
);

// 6. « <retour chariot>=1 » reçoit l'apostrophe et est mis entre guillemets
assert.strictEqual(
  escapeCsvCell('\r=1'),
  "\"'\r=1\"",
  '« <retour chariot>=1 » doit recevoir une apostrophe et être mis entre guillemets'
);

// 7. « <deux espaces>=1+1 » reçoit l'apostrophe
assert.strictEqual(
  escapeCsvCell('  =1+1'),
  "'  =1+1",
  '« <deux espaces>=1+1 » doit recevoir une apostrophe de neutralisation'
);

// 8. « Fourniture de bureau » inchangé
assert.strictEqual(
  escapeCsvCell('Fourniture de bureau'),
  'Fourniture de bureau',
  '« Fourniture de bureau » doit rester inchangé'
);

// 9. « a;b » mis entre guillemets sans apostrophe
assert.strictEqual(
  escapeCsvCell('a;b'),
  '"a;b"',
  '« a;b » doit être mis entre guillemets sans apostrophe'
);

// 10. Un texte avec guillemets internes a ses guillemets doublés
assert.strictEqual(
  escapeCsvCell('Marché de "Travaux"'),
  '"Marché de ""Travaux"""',
  'Les guillemets internes doivent être doublés et la cellule entourée de guillemets'
);

// 11. « 'déjà » inchangé
assert.strictEqual(
  escapeCsvCell("'déjà"),
  "'déjà",
  '« \'déjà » commençant déjà par une apostrophe ne doit pas en recevoir une deuxième'
);

// 12. null et undefined donnent une chaîne vide
assert.strictEqual(escapeCsvCell(null), '', 'null doit renvoyer une chaîne vide');
assert.strictEqual(escapeCsvCell(undefined), '', 'undefined doit renvoyer une chaîne vide');

// 13. Le nombre 5 donne « 5 »
assert.strictEqual(escapeCsvCell(5), '5', 'Le nombre 5 doit renvoyer "5"');

console.log('exportCsv.ts : tous les tests passent');
