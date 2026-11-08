// >>> FICHIER : Diag_AvisAV1.gs <<< (nouveau fichier TEMPORAIRE, lecture seule, à supprimer après usage)
/**
 * Diagnostic en LECTURE SEULE complémentaire au test du lot AV1. Répond à trois questions :
 *   1. Quelles valeurs de « Montant » et de « Date_Limite » ne sont pas lues (appels d'offres) ?
 *   2. Pourquoi les avis INTERNATIONAUX ne figurent-ils pas sur le radar public ?
 *   3. Quels sont les montants les plus élevés (contrôle des valeurs extrêmes) ?
 * Nécessite le fichier SaaS_23_AvisCollectes.gs. N'écrit RIEN dans le classeur.
 */
function diagnosticAvisAV1b() {
  const nomFeuille = (typeof SHEET_AO !== "undefined" && SHEET_AO) ? SHEET_AO : "TOUS_AO";
  const f = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nomFeuille);
  if (!f) { Logger.log("❌ Feuille introuvable : " + nomFeuille); return; }
  const nbLignes = f.getLastRow(), nbCols = f.getLastColumn();
  if (nbLignes < 2) { Logger.log("Aucune donnée."); return; }

  const valeurs = f.getRange(1, 1, nbLignes, nbCols).getValues();
  const idx = saasAvisIndexColonnes_(valeurs[0]);
  const maintenant = Date.now();

  function brut(ligne, cle) {
    const v = idx[cle] >= 0 ? ligne[idx[cle]] : "";
    if (v === null || v === undefined || v === "") return "(vide)";
    if (Object.prototype.toString.call(v) === "[object Date]") return "[date] " + Utilities.formatDate(v, "Africa/Douala", "yyyy-MM-dd HH:mm");
    let t = String(v).trim().replace(/[^\s@]+@[^\s@]+/g, "[e-mail]");
    return t.length > 60 ? t.substring(0, 60) + "…" : t;
  }
  function top(compteur, max) {
    return Object.keys(compteur)
      .sort(function (a, b) { return compteur[b] - compteur[a] || a.localeCompare(b); })
      .slice(0, max)
      .map(function (k) { return "      • « " + k + " »  ×" + compteur[k]; });
  }

  const montantsIllisibles = {}, datesIllisibles = {};
  let nbAO = 0, nbAOmontantOk = 0, nbAOdateOk = 0, nbAOdateFuture = 0;
  const raisonsInter = {}, lignesInter = [], tousMontants = [];

  for (let i = 1; i < valeurs.length; i++) {
    const l = valeurs[i];
    const id = String(l[idx.id] || "").trim();
    if (!id) continue;

    const typePub = saasAvisNormaliser_(idx.typePub >= 0 ? l[idx.typePub] : "");
    const estAttribution = (typePub === "attribution");
    const statut = saasAvisNormaliser_(l[idx.statut]);
    const source = String(l[idx.source] || "").trim();
    const montant = saasAvisParserMontant_(idx.montant >= 0 ? l[idx.montant] : "");
    const tsLimite = saasAvisParserDate_(idx.dateLimite >= 0 ? l[idx.dateLimite] : "");

    if (montant !== null) {
      tousMontants.push({ montant: montant, id: id, typePub: typePub || "?", titre: brut(l, "titre") });
    }

    if (!estAttribution) {
      nbAO++;
      if (montant !== null) nbAOmontantOk++; else { const k = brut(l, "montant"); montantsIllisibles[k] = (montantsIllisibles[k] || 0) + 1; }
      if (tsLimite !== null) { nbAOdateOk++; if (tsLimite > maintenant) nbAOdateFuture++; } else { const k = brut(l, "dateLimite"); datesIllisibles[k] = (datesIllisibles[k] || 0) + 1; }
    }

    if (saasAvisTypeSource_(source) === "INTERNATIONAL") {
      let raison = "RETENU (devrait figurer sur le radar)";
      if (estAttribution) raison = "exclu : c'est une attribution";
      else if (SAAS_AVIS_STATUTS_NON_OUVERTS.indexOf(statut) >= 0) raison = "exclu : statut " + brut(l, "statut");
      else if (tsLimite === null) raison = "exclu : date limite illisible";
      else if (tsLimite <= maintenant) raison = "exclu : date limite déjà passée";
      else if (montant === null) raison = "exclu : montant illisible";
      raisonsInter[raison] = (raisonsInter[raison] || 0) + 1;
      lignesInter.push("      " + id + " | " + source + " | " + (typePub || "?") + " | statut " + brut(l, "statut") + " | limite " + brut(l, "dateLimite") + " | montant " + brut(l, "montant"));
    }
  }

  Logger.log("=================================================");
  Logger.log("=== DIAGNOSTIC AV1b (lecture seule) ===");
  Logger.log("=================================================");

  Logger.log("--- 1. APPELS D'OFFRES (hors attributions) : " + nbAO + " ligne(s) ---");
  Logger.log("Montant lu : " + nbAOmontantOk + " / " + nbAO);
  Logger.log("Date limite lue : " + nbAOdateOk + " / " + nbAO + " (dont à venir : " + nbAOdateFuture + ")");
  Logger.log("Valeurs de MONTANT non lues (les plus fréquentes) :");
  top(montantsIllisibles, 20).forEach(function (s) { Logger.log(s); });
  Logger.log("Valeurs de DATE LIMITE non lues (les plus fréquentes) :");
  top(datesIllisibles, 20).forEach(function (s) { Logger.log(s); });

  Logger.log("--- 2. AVIS INTERNATIONAUX : pourquoi absents du radar ? ---");
  Object.keys(raisonsInter).forEach(function (r) { Logger.log("   " + raisonsInter[r] + " × " + r); });
  Logger.log("Détail ligne par ligne :");
  lignesInter.forEach(function (s) { Logger.log(s); });

  Logger.log("--- 3. LES 5 MONTANTS LES PLUS ÉLEVÉS ---");
  tousMontants.sort(function (a, b) { return b.montant - a.montant; }).slice(0, 5).forEach(function (m) {
    Logger.log("   " + m.montant + " FCFA | " + m.id + " | " + m.typePub + " | " + m.titre);
  });
  Logger.log("✅ Diagnostic terminé (lecture seule, rien n'a été modifié).");
}