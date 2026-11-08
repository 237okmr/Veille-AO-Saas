// >>> FICHIER : Monitoring.gs <<< (à coller dans l'onglet du même nom)
/**
 * ============================================================================
 * MONITORING AVANCÉ DE SANTÉ DU MATCHING — ÉTAPE 6B (V1.2 — LOT S1b)
 * ============================================================================
 * V1.2 (LOT S1b) : les messages d'anomalie et le nom du fichier sont ÉCHAPPÉS avant d'entrer
 * dans le HTML des e-mails administrateur (secEchapperHtml, SecuriteDonnees.gs).
 *
 * CORRECTIFS V1.1
 * ---------------------------------------------------------------------------
 *   • Ajout de 6 règles de diagnostic supplémentaires, dont 2 CRITIQUES
 *     qui avaient été manquées par la V1.0 :
 *       - Journal vide alors que le pipeline produit
 *       - Alertes bloquées en EN_ATTENTE sans aucun ENVOYÉ
 *
 *   • Séparation des anomalies en 3 niveaux :
 *       🔴 CRITIQUE       : empêche le pipeline de fonctionner
 *       🟡 AVERTISSEMENT  : signal de dégradation
 *       🔵 INFO           : observation neutre
 *
 *   • Paramètre optionnel envoyerEmailSiCritique :
 *       si true et ≥ 1 anomalie critique, un email est envoyé à l'admin.
 *
 * APPEL
 * ---------------------------------------------------------------------------
 *   mtAuditerSanteMatching()                     — 7 jours, pas d'email
 *   mtAuditerSanteMatching(30)                   — 30 jours
 *   mtAuditerSanteMatching(7, true)              — 7 jours + email si critique
 *
 * PRÉFIXE : MT_ pour éviter tout conflit global.
 * ============================================================================
 */

// ============================================================================
// FONCTION PRINCIPALE
// ============================================================================

function mtAuditerSanteMatching(nbJours, envoyerEmailSiCritique) {
  const jours = nbJours || 7;
  const envoiEmail = !!envoyerEmailSiCritique;

  Logger.log("=================================================");
  Logger.log("=== AUDIT DE SANTÉ DU MATCHING V1.1 ===");
  Logger.log("Fichier : " + SpreadsheetApp.getActiveSpreadsheet().getName());
  Logger.log("Période : " + jours + " derniers jours");
  Logger.log("Date    : " + Utilities.formatDate(new Date(), "Africa/Douala", "yyyy-MM-dd HH:mm"));
  Logger.log("Email si critique : " + (envoiEmail ? "OUI" : "NON"));
  Logger.log("=================================================");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cache = ss.getSheetByName("CACHE_IA");
  const alertes = ss.getSheetByName("ALERTES_A_ENVOYER");
  const journal = ss.getSheetByName("JOURNAL_MONITORING");
  const aoFeuille = ss.getSheetByName(SHEET_AO);
  const params = ss.getSheetByName(SHEET_PARAMS);

  const limite = new Date();
  limite.setDate(limite.getDate() - jours);

  // ------------------------------------------------------------------------
  // 1. CACHE IA
  // ------------------------------------------------------------------------
  Logger.log("");
  Logger.log("═══════════════════════════════════════════════════");
  Logger.log("1. CACHE IA");
  Logger.log("═══════════════════════════════════════════════════");

  const statsCache = mtAnalyserCache(cache, limite);
  Logger.log("  · Entrées totales           : " + statsCache.total);
  Logger.log("  · Entrées dans la période   : " + statsCache.recentes);
  Logger.log("  · Clients distincts         : " + statsCache.clientsDistincts);
  Logger.log("  · Avis distincts            : " + statsCache.avisDistincts);
  Logger.log("");
  Logger.log("  Distribution des notes IA :");
  [1, 2, 3, 4, 5].forEach(function (note) {
    const nb = statsCache.distribution[note] || 0;
    const pct = statsCache.recentes > 0 ? (nb * 100 / statsCache.recentes).toFixed(1) : "0.0";
    const barre = mtBarre(nb, statsCache.recentes, 30);
    Logger.log("    Note " + note + " : " + mtPad(nb, 5) + "  (" + mtPad(pct, 5) + "%)  " + barre);
  });

  if (statsCache.recentes > 0) {
    const noteMoyenne = statsCache.sommeNotes / statsCache.recentes;
    Logger.log("");
    Logger.log("  Note IA moyenne : " + noteMoyenne.toFixed(2) + " / 5");
    if (noteMoyenne < 2.0) {
      Logger.log("  🟡 Note moyenne très basse — possible sous-notation");
    } else if (noteMoyenne > 4.5) {
      Logger.log("  🟡 Note moyenne très haute — possible sur-notation");
    } else if (noteMoyenne >= 3.0 && noteMoyenne <= 4.0) {
      Logger.log("  ✓ Note moyenne dans la zone attendue");
    }
  }

  // ------------------------------------------------------------------------
  // 2. ALERTES
  // ------------------------------------------------------------------------
  Logger.log("");
  Logger.log("═══════════════════════════════════════════════════");
  Logger.log("2. ALERTES GÉNÉRÉES");
  Logger.log("═══════════════════════════════════════════════════");

  const statsAlertes = mtAnalyserAlertes(alertes, limite);
  Logger.log("  · Alertes totales           : " + statsAlertes.total);
  Logger.log("  · Alertes dans la période   : " + statsAlertes.recentes);
  Logger.log("");
  Logger.log("  Statuts :");
  ["EN_ATTENTE", "ENVOYÉ", "REPORTÉ", "EXPIRÉ", "DOUBLON"].forEach(function (st) {
    const nb = statsAlertes.parStatut[st] || 0;
    if (nb > 0) Logger.log("    · " + mtPad(st, 12) + " : " + nb);
  });
  Logger.log("");
  Logger.log("  Score de pertinence :");
  Logger.log("    · Score moyen             : " + statsAlertes.scoreMoyen.toFixed(2) + " / 5");
  Logger.log("    · Score ≥ 4.0             : " + statsAlertes.scoreHaut);
  Logger.log("    · Score 3.0 - 4.0         : " + statsAlertes.scoreMoyenZone);
  Logger.log("    · Score < 3.0             : " + statsAlertes.scoreBas);

  Logger.log("");
  Logger.log("  Top 5 clients par alertes :");
  statsAlertes.topClients.slice(0, 5).forEach(function (c, i) {
    Logger.log("    " + (i + 1) + ". " + mtPad(c.nom, 30) + " : " + c.nb);
  });

  // ------------------------------------------------------------------------
  // 3. JOURNAL DE MONITORING
  // ------------------------------------------------------------------------
  Logger.log("");
  Logger.log("═══════════════════════════════════════════════════");
  Logger.log("3. JOURNAL DE MONITORING");
  Logger.log("═══════════════════════════════════════════════════");

  const statsJournal = mtAnalyserJournal(journal, limite);
  Logger.log("  · Sessions dans la période  : " + statsJournal.sessions);
  Logger.log("  · Avis collectés            : " + statsJournal.nouveauxAO);
  Logger.log("  · Appels IA                 : " + statsJournal.appelsIA);
  Logger.log("  · Emails envoyés            : " + statsJournal.emailsEnvoyes);
  Logger.log("  · Sessions en échec         : " + statsJournal.echecs);

  if (statsJournal.sessions > 0) {
    Logger.log("");
    Logger.log("  Ratios par session :");
    Logger.log("    · Avis / session          : " + (statsJournal.nouveauxAO / statsJournal.sessions).toFixed(1));
    Logger.log("    · Appels IA / session     : " + (statsJournal.appelsIA / statsJournal.sessions).toFixed(1));
    Logger.log("    · Emails / session        : " + (statsJournal.emailsEnvoyes / statsJournal.sessions).toFixed(1));
  }

  // ------------------------------------------------------------------------
  // 4. SOURCES D'AVIS
  // ------------------------------------------------------------------------
  Logger.log("");
  Logger.log("═══════════════════════════════════════════════════");
  Logger.log("4. SOURCES D'AVIS (période)");
  Logger.log("═══════════════════════════════════════════════════");

  const statsSources = mtAnalyserSources(aoFeuille, limite);
  if (statsSources.total > 0) {
    Object.keys(statsSources.parSource).sort(function (a, b) {
      return statsSources.parSource[b] - statsSources.parSource[a];
    }).forEach(function (src) {
      const nb = statsSources.parSource[src];
      const pct = (nb * 100 / statsSources.total).toFixed(1);
      const barre = mtBarre(nb, statsSources.total, 20);
      Logger.log("  · " + mtPad(src, 25) + " : " + mtPad(nb, 4) + "  (" + mtPad(pct, 5) + "%)  " + barre);
    });
    Logger.log("");
    Logger.log("  TOTAL : " + statsSources.total + " avis");
  } else {
    Logger.log("  Aucun avis collecté dans la période.");
  }

  // ------------------------------------------------------------------------
  // 5. DÉTECTION DE DÉRIVE
  // ------------------------------------------------------------------------
  Logger.log("");
  Logger.log("═══════════════════════════════════════════════════");
  Logger.log("5. DÉTECTION DE DÉRIVE (période vs précédente)");
  Logger.log("═══════════════════════════════════════════════════");

  const limitePrecedente = new Date();
  limitePrecedente.setDate(limitePrecedente.getDate() - (jours * 2));

  const statsAlertesPrec = mtAnalyserAlertes(alertes, limitePrecedente, limite);
  const statsCachePrec = mtAnalyserCache(cache, limitePrecedente, limite);

  mtComparerPeriodes(statsAlertes, statsAlertesPrec, statsCache, statsCachePrec);

  // ------------------------------------------------------------------------
  // 6. DIAGNOSTIC DE SANTÉ (V1.1 — 8 règles)
  // ------------------------------------------------------------------------
  Logger.log("");
  Logger.log("═══════════════════════════════════════════════════");
  Logger.log("6. DIAGNOSTIC DE SANTÉ");
  Logger.log("═══════════════════════════════════════════════════");

  const diagnostic = mtDiagnostiquerSante(statsAlertes, statsCache, statsJournal, statsSources);

  // Affichage
  if (diagnostic.critiques.length === 0 && diagnostic.avertissements.length === 0) {
    Logger.log("");
    Logger.log("  ✅ Aucune anomalie détectée sur la période.");
    Logger.log("     Le pipeline fonctionne dans les paramètres attendus.");
  } else {
    if (diagnostic.critiques.length > 0) {
      Logger.log("");
      Logger.log("  🔴 ANOMALIES CRITIQUES (" + diagnostic.critiques.length + ") :");
      diagnostic.critiques.forEach(function (a, i) {
        Logger.log("    " + (i + 1) + ". " + a);
      });
    }
    if (diagnostic.avertissements.length > 0) {
      Logger.log("");
      Logger.log("  🟡 AVERTISSEMENTS (" + diagnostic.avertissements.length + ") :");
      diagnostic.avertissements.forEach(function (a, i) {
        Logger.log("    " + (i + 1) + ". " + a);
      });
    }
    if (diagnostic.infos.length > 0) {
      Logger.log("");
      Logger.log("  🔵 OBSERVATIONS :");
      diagnostic.infos.forEach(function (a, i) {
        Logger.log("    " + (i + 1) + ". " + a);
      });
    }
  }

  // ------------------------------------------------------------------------
  // 7. ENVOI EMAIL SI CRITIQUE
  // ------------------------------------------------------------------------
  if (envoiEmail && diagnostic.critiques.length > 0) {
    Logger.log("");
    Logger.log("═══════════════════════════════════════════════════");
    Logger.log("7. ENVOI EMAIL ADMIN (anomalies critiques)");
    Logger.log("═══════════════════════════════════════════════════");

    if (!params) {
      Logger.log("  ⚠ Feuille PARAMETRES introuvable — email non envoyé.");
    } else {
      const emailAdmin = params.getRange("H2").getValue().toString().trim();
      if (!emailAdmin) {
        Logger.log("  ⚠ Email admin non renseigné — email non envoyé.");
      } else {
        try {
          const corps = mtConstruireEmailCritique(diagnostic, jours);
          MailApp.sendEmail({
            to: emailAdmin,
            subject: "🔴 [Veille] " + diagnostic.critiques.length +
                     " anomalie(s) critique(s) détectée(s)",
            htmlBody: corps
          });
          Logger.log("  ✓ Email envoyé à " + emailAdmin);
        } catch (e) {
          Logger.log("  ✗ Erreur envoi email : " + e.message);
        }
      }
    }
  }

  Logger.log("");
  Logger.log("=================================================");
  Logger.log("FIN DE L'AUDIT DE SANTÉ");
  Logger.log("=================================================");

  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      "🔴 " + diagnostic.critiques.length + " | 🟡 " + diagnostic.avertissements.length +
      " | Alertes : " + statsAlertes.recentes,
      "Audit santé V1.1", 12
    );
  } catch (e) {}
}

// ============================================================================
// ANALYSEURS (inchangés)
// ============================================================================

function mtAnalyserCache(feuille, limiteMin, limiteMax) {
  const res = {
    total: 0, recentes: 0,
    clientsDistincts: 0, avisDistincts: 0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    sommeNotes: 0
  };
  if (!feuille) return res;

  const data = feuille.getDataRange().getValues();
  res.total = Math.max(0, data.length - 1);

  const clients = {};
  const avis = {};

  for (let i = 1; i < data.length; i++) {
    const idAO = (data[i][0] || "").toString().trim();
    const idClient = (data[i][1] || "").toString().trim();
    const note = parseInt(data[i][2], 10);
    const dateEval = data[i][4];

    if (dateEval) {
      const d = new Date(dateEval);
      if (!isNaN(d.getTime())) {
        if (limiteMax) {
          if (d < limiteMin || d >= limiteMax) continue;
        } else {
          if (d < limiteMin) continue;
        }
      }
    }

    res.recentes++;
    if (!isNaN(note) && note >= 1 && note <= 5) {
      res.distribution[note] = (res.distribution[note] || 0) + 1;
      res.sommeNotes += note;
    }
    if (idClient) clients[idClient] = true;
    if (idAO) avis[idAO] = true;
  }

  res.clientsDistincts = Object.keys(clients).length;
  res.avisDistincts = Object.keys(avis).length;
  return res;
}

function mtAnalyserAlertes(feuille, limiteMin, limiteMax) {
  const res = {
    total: 0, recentes: 0,
    parStatut: {},
    scoreMoyen: 0, sommeScores: 0, nbScores: 0,
    scoreHaut: 0, scoreMoyenZone: 0, scoreBas: 0,
    parClient: {}
  };
  if (!feuille) return res;

  const data = feuille.getDataRange().getValues();
  res.total = Math.max(0, data.length - 1);

  for (let i = 1; i < data.length; i++) {
    const idClient = (data[i][3] || "").toString().trim();
    const nomClient = (data[i][4] || "").toString().trim();
    const statut = (data[i][7] || "").toString().trim().toUpperCase();
    const score = parseFloat(data[i][9]);
    const dateMatch = data[i][6];

    let dansFenetre = false;
    if (dateMatch) {
      const d = new Date(dateMatch);
      if (!isNaN(d.getTime())) {
        if (limiteMax) {
          dansFenetre = (d >= limiteMin && d < limiteMax);
        } else {
          dansFenetre = (d >= limiteMin);
        }
      }
    }
    if (!dansFenetre) continue;

    res.recentes++;
    res.parStatut[statut] = (res.parStatut[statut] || 0) + 1;

    if (!isNaN(score)) {
      res.sommeScores += score;
      res.nbScores++;
      if (score >= 4.0) res.scoreHaut++;
      else if (score >= 3.0) res.scoreMoyenZone++;
      else res.scoreBas++;
    }

    if (idClient) {
      if (!res.parClient[idClient]) res.parClient[idClient] = { nom: nomClient || idClient, nb: 0 };
      res.parClient[idClient].nb++;
    }
  }

  res.scoreMoyen = res.nbScores > 0 ? (res.sommeScores / res.nbScores) : 0;
  res.topClients = Object.keys(res.parClient).map(function (k) {
    return { id: k, nom: res.parClient[k].nom, nb: res.parClient[k].nb };
  }).sort(function (a, b) { return b.nb - a.nb; });

  return res;
}

function mtAnalyserJournal(feuille, limite) {
  const res = {
    sessions: 0, nouveauxAO: 0, appelsIA: 0,
    emailsEnvoyes: 0, echecs: 0, pairesFiltrees: 0, pairesEvaluees: 0
  };
  if (!feuille) return res;

  const data = feuille.getDataRange().getValues();
  if (data.length <= 1) return res;

  for (let i = 1; i < data.length; i++) {
    const dateSession = data[i][0];
    if (!dateSession) continue;
    const d = new Date(dateSession);
    if (isNaN(d.getTime()) || d < limite) continue;

    res.sessions++;
    res.nouveauxAO += parseInt(data[i][4], 10) || 0;
    res.appelsIA += parseInt(data[i][7], 10) || 0;
    res.emailsEnvoyes += parseInt(data[i][11], 10) || 0;
    const statut = (data[i][1] || "").toString().toUpperCase();
    if (statut === "ÉCHEC") res.echecs++;
  }
  return res;
}

function mtAnalyserSources(feuille, limite) {
  const res = { total: 0, parSource: {} };
  if (!feuille) return res;

  const data = feuille.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const dateCollecte = data[i][2];
    if (!dateCollecte) continue;
    const d = new Date(dateCollecte);
    if (isNaN(d.getTime()) || d < limite) continue;

    const source = (data[i][4] || "Inconnu").toString().trim();
    if (!source) continue;
    res.parSource[source] = (res.parSource[source] || 0) + 1;
    res.total++;
  }
  return res;
}

// ============================================================================
// COMPARAISON DE PÉRIODES
// ============================================================================

function mtComparerPeriodes(courant, precedent, cacheCourant, cachePrecedent) {
  function delta(a, b) {
    if (b === 0) return a > 0 ? "nouveau" : "—";
    const pct = ((a - b) / b * 100).toFixed(1);
    const signe = a >= b ? "+" : "";
    return signe + pct + "%";
  }

  Logger.log("  Alertes (période actuelle vs précédente) :");
  Logger.log("    · Actuelle   : " + courant.recentes);
  Logger.log("    · Précédente : " + precedent.recentes);
  Logger.log("    · Évolution  : " + delta(courant.recentes, precedent.recentes));

  Logger.log("");
  Logger.log("  Score moyen :");
  Logger.log("    · Actuelle   : " + courant.scoreMoyen.toFixed(2));
  Logger.log("    · Précédente : " + precedent.scoreMoyen.toFixed(2));
  Logger.log("    · Delta      : " + (courant.scoreMoyen - precedent.scoreMoyen).toFixed(2));

  Logger.log("");
  Logger.log("  Évaluations IA :");
  Logger.log("    · Actuelle   : " + cacheCourant.recentes);
  Logger.log("    · Précédente : " + cachePrecedent.recentes);
  Logger.log("    · Évolution  : " + delta(cacheCourant.recentes, cachePrecedent.recentes));

  if (cacheCourant.recentes > 0 && cachePrecedent.recentes > 0) {
    const moyCourante = cacheCourant.sommeNotes / cacheCourant.recentes;
    const moyPrecedente = cachePrecedent.sommeNotes / cachePrecedent.recentes;
    Logger.log("");
    Logger.log("  Note IA moyenne :");
    Logger.log("    · Actuelle   : " + moyCourante.toFixed(2));
    Logger.log("    · Précédente : " + moyPrecedente.toFixed(2));
    const deltaNote = moyCourante - moyPrecedente;
    if (Math.abs(deltaNote) > 0.5) {
      Logger.log("    🟡 Dérive de " + deltaNote.toFixed(2) + " — vérifier la calibration");
    } else {
      Logger.log("    ✓ Note stable");
    }
  }
}

// ============================================================================
// DIAGNOSTIC V1.1 — 8 règles
// ============================================================================

function mtDiagnostiquerSante(statsAlertes, statsCache, statsJournal, statsSources) {
  const crit = [];
  const avert = [];
  const infos = [];

  // ─────────────────────────────────────────────────────────────────────
  // RÈGLE 1 (CRITIQUE) — Journal vide alors que le pipeline produit
  // ─────────────────────────────────────────────────────────────────────
  const pipelineActif = (statsCache.recentes > 10) || (statsAlertes.recentes > 5) || (statsSources.total > 20);
  if (statsJournal.sessions === 0 && pipelineActif) {
    crit.push("JOURNAL_MONITORING vide alors que le pipeline produit (" +
              statsCache.recentes + " évaluations, " + statsAlertes.recentes + " alertes). " +
              "finaliserEtConsignerRapport() n'est pas appelée.");
  }

  // ─────────────────────────────────────────────────────────────────────
  // RÈGLE 2 (CRITIQUE) — Alertes bloquées en EN_ATTENTE
  // ─────────────────────────────────────────────────────────────────────
  const enAttente = statsAlertes.parStatut["EN_ATTENTE"] || 0;
  const envoyes = statsAlertes.parStatut["ENVOYÉ"] || 0;
  if (enAttente >= 20 && envoyes === 0) {
    crit.push(enAttente + " alerte(s) EN_ATTENTE et 0 ENVOYÉ. " +
              "executerEnvoiAlertes() n'a jamais abouti.");
  } else if (enAttente >= 50 && envoyes > 0) {
    avert.push(enAttente + " alerte(s) EN_ATTENTE avec " + envoyes + " ENVOYÉ. " +
               "Ratio anormalement élevé — vérifier la file d'envoi.");
  }

  // ─────────────────────────────────────────────────────────────────────
  // RÈGLE 3 (CRITIQUE) — Collecte massive sans alerte
  // ─────────────────────────────────────────────────────────────────────
  if (statsSources.total >= 50 && statsAlertes.recentes === 0) {
    crit.push(statsSources.total + " avis collectés mais 0 alerte générée. " +
              "Pré-filtrage ou IA probablement cassés.");
  }

  // ─────────────────────────────────────────────────────────────────────
  // RÈGLE 4 (CRITIQUE) — Aucune alerte générée sur la période
  // ─────────────────────────────────────────────────────────────────────
  if (statsAlertes.recentes === 0 && statsJournal.sessions > 0 && statsCache.recentes === 0) {
    crit.push("Aucune activité détectée : ni alertes, ni évaluations, ni journal.");
  }

  // ─────────────────────────────────────────────────────────────────────
  // RÈGLE 5 (AVERTISSEMENT) — Score moyen bas
  // ─────────────────────────────────────────────────────────────────────
  if (statsAlertes.nbScores > 5 && statsAlertes.scoreMoyen < 3.2) {
    avert.push("Score moyen bas (" + statsAlertes.scoreMoyen.toFixed(2) +
               ") — calibration possiblement stricte.");
  }

  // ─────────────────────────────────────────────────────────────────────
  // RÈGLE 6 (AVERTISSEMENT) — Note IA dérivante
  // ─────────────────────────────────────────────────────────────────────
  if (statsCache.recentes > 10) {
    const moy = statsCache.sommeNotes / statsCache.recentes;
    if (moy < 2.0) {
      avert.push("Note IA moyenne très basse (" + moy.toFixed(2) +
                 ") — possibles faux négatifs.");
    } else if (moy > 4.5) {
      avert.push("Note IA moyenne très haute (" + moy.toFixed(2) +
                 ") — possibles faux positifs.");
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // RÈGLE 7 (AVERTISSEMENT) — Taux d'échec sessions
  // ─────────────────────────────────────────────────────────────────────
  if (statsJournal.sessions > 0) {
    const tauxEchec = (statsJournal.echecs / statsJournal.sessions) * 100;
    if (tauxEchec > 20) {
      avert.push("Taux d'échec sessions élevé (" + tauxEchec.toFixed(1) + "%).");
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // RÈGLE 8 (INFO) — Volume très bas sur 7j
  // ─────────────────────────────────────────────────────────────────────
  if (statsCache.recentes > 0 && statsCache.recentes < 10) {
    infos.push("Volume très bas : seulement " + statsCache.recentes +
               " évaluation(s) sur la période.");
  }
  if (statsSources.total > 0 && statsSources.total < 10) {
    infos.push("Collecte faible : seulement " + statsSources.total +
               " avis collecté(s) sur la période.");
  }

  return { critiques: crit, avertissements: avert, infos: infos };
}

// ============================================================================
// EMAIL CRITIQUE
// ============================================================================

function mtConstruireEmailCritique(diagnostic, jours) {
  const dateStr = Utilities.formatDate(new Date(), "Africa/Douala", "dd/MM/yyyy HH:mm");
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let html = '<div style="font-family: Arial, sans-serif; max-width: 640px; padding: 15px; ' +
             'border: 2px solid #ef4444; border-radius: 8px; background-color: #fef2f2;">';
  html += '<h2 style="color: #b91c1c; margin-top: 0;">🔴 Anomalies critiques détectées</h2>';
  html += '<p style="font-size: 14px; color: #1e293b;">';
  html += 'L\'audit de santé du pipeline de veille (période : ' + jours + ' jours) a détecté ';
  html += '<strong>' + diagnostic.critiques.length + ' anomalie(s) critique(s)</strong>.';
  html += '</p>';

  html += '<div style="background-color: #ffffff; border-left: 4px solid #ef4444; ' +
          'padding: 10px; margin: 15px 0;">';
  html += '<ul style="margin: 0; padding-left: 20px; color: #7f1d1d; font-size: 13px;">';
  diagnostic.critiques.forEach(function (a) {
    html += '<li style="margin-bottom: 8px;">' + secEchapperHtml(a) + '</li>';
  });
  html += '</ul></div>';

  if (diagnostic.avertissements.length > 0) {
    html += '<h3 style="color: #92400e; font-size: 14px;">🟡 Avertissements secondaires</h3>';
    html += '<ul style="padding-left: 20px; color: #78350f; font-size: 12px;">';
    diagnostic.avertissements.forEach(function (a) {
      html += '<li>' + secEchapperHtml(a) + '</li>';
    });
    html += '</ul>';
  }

  html += '<p style="font-size: 12px; color: #64748b; margin-top: 20px;">';
  html += 'Fichier : ' + secEchapperHtml(ss.getName()) + '<br>';
  html += 'Date du contrôle : ' + dateStr + ' (Heure de Yaoundé)';
  html += '</p>';
  html += '</div>';

  return html;
}

// ============================================================================
// UTILITAIRES
// ============================================================================

function mtPad(str, largeur) {
  const s = String(str);
  if (s.length >= largeur) return s;
  return s + new Array(largeur - s.length + 1).join(" ");
}

function mtBarre(valeur, total, largeur) {
  if (total === 0) return "";
  const n = Math.round(valeur / total * largeur);
  return "█".repeat(Math.max(0, n));
}

// ============================================================================
// RAPPORT HEBDO PROGRAMMÉ
// ============================================================================

function mtEnvoyerRapportHebdoSante() {
  Logger.log("=== RAPPORT HEBDOMADAIRE DE SANTÉ ===");

  const buffer = [];
  const logOrig = Logger.log;
  Logger.log = function (msg) {
    buffer.push(String(msg));
    logOrig.call(Logger, msg);
  };

  try {
    mtAuditerSanteMatching(7, false);
  } finally {
    Logger.log = logOrig;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const params = ss.getSheetByName(SHEET_PARAMS);
  if (!params) return;
  const emailAdmin = params.getRange("H2").getValue().toString().trim();
  if (!emailAdmin) return;

  const corpsHtml =
    '<div style="font-family: monospace; font-size: 12px; white-space: pre-wrap;">' +
    secEchapperHtml(buffer.join("\n")) +
    '</div>';

  try {
    MailApp.sendEmail({
      to: emailAdmin,
      subject: "[Veille] Rapport de santé hebdomadaire — " +
               Utilities.formatDate(new Date(), "Africa/Douala", "dd/MM/yyyy"),
      htmlBody: '<h3>Rapport de santé du pipeline de veille</h3>' + corpsHtml
    });
    Logger.log("Rapport hebdomadaire envoyé à " + emailAdmin);
  } catch (e) {
    Logger.log("Erreur envoi rapport : " + e.message);
  }
}
// ============================================================================
// INSTALLATION DU TRIGGER HEBDOMADAIRE — V1.2
// ============================================================================
// Programme l'envoi du rapport de santé chaque dimanche à 20h (heure de
// Douala). Supprime les triggers existants sur mtEnvoyerRapportHebdoSante
// pour éviter les doublons.
// ============================================================================

/**
 * Installe (ou réinstalle) le trigger hebdomadaire du rapport de santé.
 * Supprime les triggers existants pour éviter les doublons.
 */
function installerTriggerMonitoringHebdo() {
  Logger.log("=================================================");
  Logger.log("=== INSTALLATION DU TRIGGER HEBDO MONITORING ===");
  Logger.log("Fichier : " + SpreadsheetApp.getActiveSpreadsheet().getName());
  Logger.log("=================================================");

  const JOUR_SEMAINE = ScriptApp.WeekDay.SUNDAY;
  const HEURE = 20;  // 20h00 heure de Douala

  // --- Étape 1 : supprimer les triggers existants
  const declencheurs = ScriptApp.getProjectTriggers();
  let supprimes = 0;

  declencheurs.forEach(function (trig) {
    const fn = trig.getHandlerFunction();
    if (fn === "mtEnvoyerRapportHebdoSante") {
      ScriptApp.deleteTrigger(trig);
      supprimes++;
      Logger.log("  Trigger existant supprimé.");
    }
  });

  if (supprimes === 0) {
    Logger.log("  Aucun trigger existant à supprimer.");
  }

  // --- Étape 2 : créer le nouveau trigger
  try {
    ScriptApp.newTrigger("mtEnvoyerRapportHebdoSante")
      .timeBased()
      .onWeekDay(JOUR_SEMAINE)
      .atHour(HEURE)
      .inTimezone("Africa/Douala")
      .create();

    Logger.log("");
    Logger.log("✓ Trigger installé :");
    Logger.log("  · Fonction    : mtEnvoyerRapportHebdoSante");
    Logger.log("  · Fréquence   : chaque dimanche");
    Logger.log("  · Heure       : " + HEURE + "h00 (Africa/Douala)");
    Logger.log("  · Prochaine   : dimanche prochain à " + HEURE + "h00");
  } catch (e) {
    Logger.log("✗ Échec de création du trigger : " + e.message);
    return;
  }

  // --- Étape 3 : état actuel
  Logger.log("");
  Logger.log("--- TRIGGERS ACTIFS DU PROJET ---");
  const tous = ScriptApp.getProjectTriggers();
  Logger.log("Total : " + tous.length + " trigger(s)");
  tous.forEach(function (t, i) {
    Logger.log("  " + (i + 1) + ". " + t.getHandlerFunction() +
               " (" + t.getEventType() + ")");
  });

  Logger.log("");
  Logger.log("=================================================");
  Logger.log("INSTALLATION TERMINÉE");
  Logger.log("=================================================");

  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      "Rapport santé : chaque dimanche à " + HEURE + "h",
      "Trigger hebdo installé", 10
    );
  } catch (e) {}
}

/**
 * Liste tous les triggers actifs du projet. Utile pour vérifier.
 */
function listerTriggersActifs() {
  Logger.log("=== TRIGGERS ACTIFS DU PROJET ===");
  const tous = ScriptApp.getProjectTriggers();
  if (tous.length === 0) {
    Logger.log("Aucun trigger actif.");
    return;
  }
  Logger.log("Total : " + tous.length);
  tous.forEach(function (t, i) {
    const fn = t.getHandlerFunction();
    const type = t.getEventType();
    let detail = "";
    // Tenter d'obtenir plus d'infos selon le type
    try {
      if (type === ScriptApp.EventType.CLOCK) {
        detail = " (time-based)";
      }
    } catch (e) {}
    Logger.log("  " + (i + 1) + ". " + fn + " — " + type + detail);
  });
}