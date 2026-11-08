// >>> FICHIER : Diag_TousAo.gs <<< (nouveau fichier temporaire, lecture seule, à supprimer après usage)
/**
 * Diagnostic en lecture seule de l'onglet des avis (TOUS_AO).
 * Affiche dans le journal : le nom de chaque colonne, le nombre de cellules vides,
 * le nombre de valeurs distinctes, quelques exemples avec leur type (texte, nombre, date),
 * et, pour les colonnes à peu de valeurs (statut, source…), la liste complète avec les effectifs.
 * N'écrit RIEN dans le classeur. Aucun secret affiché (les adresses e-mail sont masquées).
 */
function diagnosticColonnesTousAo() {
  const nomFeuille = (typeof SHEET_AO !== "undefined" && SHEET_AO) ? SHEET_AO : "TOUS_AO";
  const f = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nomFeuille);
  if (!f) {
    Logger.log("❌ Feuille introuvable : " + nomFeuille);
    return;
  }

  const nbLignes = f.getLastRow();
  const nbCols = f.getLastColumn();
  Logger.log("Feuille : " + nomFeuille + " — " + Math.max(0, nbLignes - 1) + " ligne(s) de données, " + nbCols + " colonne(s).");
  if (nbLignes < 2 || nbCols < 1) {
    Logger.log("Aucune ligne de données à analyser.");
    return;
  }

  const valeurs = f.getRange(1, 1, nbLignes, nbCols).getValues();
  const entetes = valeurs[0];

  function lettreColonne(index) {
    let n = index + 1, s = "";
    while (n > 0) {
      const m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function typeEtTexte(v) {
    if (v instanceof Date) {
      return "[date] " + Utilities.formatDate(v, "Africa/Douala", "yyyy-MM-dd HH:mm");
    }
    if (typeof v === "number") return "[nombre] " + v;
    if (typeof v === "boolean") return "[booléen] " + v;
    let t = String(v).trim().replace(/[^\s@]+@[^\s@]+/g, "[e-mail]");
    if (t.length > 60) t = t.substring(0, 60) + "…";
    return "[texte] " + t;
  }

  for (let c = 0; c < nbCols; c++) {
    const effectifs = {};
    let nbDistincts = 0;
    let nbVides = 0;
    const exemples = [];

    for (let i = 1; i < valeurs.length; i++) {
      const brut = valeurs[i][c];
      const affichage = typeEtTexte(brut === null || brut === undefined ? "" : brut);
      const estVide = (brut === null || brut === undefined || String(brut).trim() === "");
      if (estVide) { nbVides++; continue; }
      if (exemples.length < 2 || i >= valeurs.length - 2) {
        if (exemples.length < 4) exemples.push("ligne " + (i + 1) + " : " + affichage);
      }
      if (!(affichage in effectifs)) { effectifs[affichage] = 0; nbDistincts++; }
      effectifs[affichage]++;
    }

    let ligne = "Colonne " + c + " (" + lettreColonne(c) + ") « " + String(entetes[c]).trim() + " » — vides : " + nbVides + " — valeurs distinctes : " + nbDistincts;
    Logger.log(ligne);

    if (nbDistincts > 0 && nbDistincts <= 12) {
      Object.keys(effectifs).forEach(function (cle) {
        Logger.log("      • " + cle + "  ×" + effectifs[cle]);
      });
    } else {
      exemples.forEach(function (ex) { Logger.log("      " + ex); });
    }
  }
  Logger.log("✅ Diagnostic terminé (lecture seule, rien n'a été modifié).");
}