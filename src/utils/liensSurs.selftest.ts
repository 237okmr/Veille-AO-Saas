/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import { lienSur, lienSurAvecHttps } from './liensSurs';

console.log('Exécution des tests unitaires pour liensSurs.ts...');

// 1. https avec paramètres et « & » accepté
const urlParams = 'https://exemple.cm/recherche?type=AONO&secteur=BTP&region=Centre';
assert.strictEqual(
  lienSur(urlParams),
  urlParams,
  'HTTPS avec paramètres et « & » doit être accepté et conservé à l’identique'
);

// 2. http avec double barre dans le chemin accepté
const urlDoubleBarre = 'http://pridesoft.armp.cm//0903_dao_dl?type_publication=AONO&id_publication=2';
assert.strictEqual(
  lienSur(urlDoubleBarre),
  urlDoubleBarre,
  'HTTP avec double barre dans le chemin doit être accepté'
);

// 3. majuscules « HTTPS://EXEMPLE.CM » acceptées
assert.strictEqual(
  lienSur('HTTPS://EXEMPLE.CM'),
  'HTTPS://EXEMPLE.CM',
  'Les schémas et hôtes en majuscules doivent être acceptés et conservés'
);

// 4. espaces autour retirés (trim)
assert.strictEqual(
  lienSur('   https://exemple.cm/avis/123   '),
  'https://exemple.cm/avis/123',
  'Les espaces de début et fin doivent être retirés'
);

// 5. schémas dangereux et invalides refusés
assert.strictEqual(lienSur('javascript:alert(1)'), null, 'javascript: doit être refusé');
assert.strictEqual(lienSur('data:text/html;base64,AAAA'), null, 'data: doit être refusé');
assert.strictEqual(lienSur('//exemple.cm'), null, '// relatif doit être refusé');
assert.strictEqual(lienSur('ftp://exemple.cm'), null, 'ftp:// doit être refusé');
assert.strictEqual(lienSur('httpexemple.cm'), null, 'httpexemple.cm doit être refusé');
assert.strictEqual(lienSur('http://'), null, 'http:// sans hôte doit être refusé');

// 6. liens avec espace au milieu, guillemets, chevrons, accents graves ou antislashs refusés
assert.strictEqual(lienSur('https://exemple.cm/avec espace/test'), null, 'Espace au milieu doit être refusé');
assert.strictEqual(lienSur('https://exemple.cm/"injected"'), null, 'Guillemet double doit être refusé');
assert.strictEqual(lienSur("https://exemple.cm/'injected'"), null, 'Guillemet simple doit être refusé');
assert.strictEqual(lienSur('https://exemple.cm/<script>'), null, 'Chevron ouvrant doit être refusé');
assert.strictEqual(lienSur('https://exemple.cm/>test'), null, 'Chevron fermant doit être refusé');
assert.strictEqual(lienSur('https://exemple.cm/`backtick`'), null, 'Accent grave (backtick) doit être refusé');
assert.strictEqual(lienSur('https://exemple.cm/\\injected'), null, 'Antislash doit être refusé');

// 7. chaîne vide, null, undefined et nombre refusés
assert.strictEqual(lienSur(''), null, 'Chaîne vide doit renvoyer null');
assert.strictEqual(lienSur('   '), null, 'Chaîne d’espaces doit renvoyer null');
assert.strictEqual(lienSur(null), null, 'null doit renvoyer null');
assert.strictEqual(lienSur(undefined), null, 'undefined doit renvoyer null');
assert.strictEqual(lienSur(12345), null, 'Nombre doit renvoyer null');
assert.strictEqual(lienSur({}), null, 'Objet doit renvoyer null');
assert.strictEqual(lienSur(true), null, 'Booléen doit renvoyer null');

// 8. Tests de lienSurAvecHttps
assert.strictEqual(
  lienSurAvecHttps('exemple.cm'),
  'https://exemple.cm',
  'lienSurAvecHttps("exemple.cm") doit ajouter https://'
);
assert.strictEqual(
  lienSurAvecHttps('pridesoft.armp.cm/avis?id=42'),
  'https://pridesoft.armp.cm/avis?id=42',
  'lienSurAvecHttps sans schéma doit ajouter https://'
);
assert.strictEqual(
  lienSurAvecHttps('   exemple.cm/test   '),
  'https://exemple.cm/test',
  'lienSurAvecHttps avec espaces autour doit nettoyer et ajouter https://'
);
assert.strictEqual(
  lienSurAvecHttps('http://exemple.cm/avis'),
  'http://exemple.cm/avis',
  'lienSurAvecHttps avec http:// doit conserver http://'
);
assert.strictEqual(
  lienSurAvecHttps('https://exemple.cm/avis'),
  'https://exemple.cm/avis',
  'lienSurAvecHttps avec https:// doit conserver https://'
);
assert.strictEqual(
  lienSurAvecHttps('javascript:alert(1)'),
  null,
  'lienSurAvecHttps avec javascript: doit renvoyer null'
);
assert.strictEqual(
  lienSurAvecHttps('data:text/html;base64,AAAA'),
  null,
  'lienSurAvecHttps avec data: doit renvoyer null'
);
assert.strictEqual(
  lienSurAvecHttps('ftp://exemple.cm'),
  null,
  'lienSurAvecHttps avec ftp: doit renvoyer null'
);
assert.strictEqual(
  lienSurAvecHttps('mailto:contact@exemple.cm'),
  null,
  'lienSurAvecHttps avec mailto: doit renvoyer null'
);
assert.strictEqual(
  lienSurAvecHttps(''),
  null,
  'lienSurAvecHttps avec chaîne vide doit renvoyer null'
);
assert.strictEqual(
  lienSurAvecHttps(null),
  null,
  'lienSurAvecHttps avec null doit renvoyer null'
);
assert.strictEqual(
  lienSurAvecHttps(undefined),
  null,
  'lienSurAvecHttps avec undefined doit renvoyer null'
);

console.log('liensSurs.ts : tous les tests passent');
