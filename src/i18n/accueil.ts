/**
 * Dictionnaire bilingue Français / Anglais pour la page d'accueil (Market Advisor CM).
 * 
 * DIRECTIVES DE FORMATAGE (pour les lots de composants) :
 * - Montants : espace insécable (\u00A0) entre le nombre, l'unité et la devise.
 *   Virgule décimale en français, point en anglais. Ex. "48 M FCFA", "1,4 Md FCFA" / "1.4 bn FCFA".
 * - Dates limites : fuseau obligatoire 'Africa/Douala' (UTC+1). Ex. "9 oct. 2026".
 */

export type Langue = 'fr' | 'en';

export const dictionnaireAccueil = {
  fr: {
    navConnexion: 'Se connecter',
    heroTitre: "Ne ratez plus un appel d'offres au Cameroun.",
    heroSousTitre: "Market Advisor CM surveille l'ARMP, les ministères, les mairies et les bailleurs, puis vous alerte uniquement sur les marchés qui correspondent à votre entreprise.",
    ctaPilote: 'Demander un accès pilote',
    ctaExempleAlerte: "Voir un exemple d'alerte",
    noteIllustratif: 'Exemples illustratifs.',
    filtreTous: 'Tous',
    filtreNational: 'National',
    filtreInternational: 'International',
    sourceBailleurs: 'Bailleurs',
    sourceOnu: 'ONU',
    pauseLabel: 'Mettre en pause le défilement des avis',
    lectureLabel: 'Reprendre le défilement des avis',
    scoreIa: 'Score IA',
    dateLimite: 'Date limite',
    jourSingulier: 'dans {n} jour',
    jourPluriel: 'dans {n} jours',
    uniteMillion: 'M',
    uniteMilliard: 'Md',
    devise: 'FCFA',
    jours7: '7 j',
    jours15: '15 j',
    jours22: '22 j',
    procAONO: "Appel d'offres national ouvert",
    procAMI: 'Appel à manifestation d’intérêt',
    procAOI: "Appel d'offres international",
    ongletPilote: 'Accès pilote',
    ongletConnexion: 'Déjà client',
    accrocheTitre: 'Ne lisez que les appels d’offres qui comptent pour vous.',
    accrocheSousTitre: 'Dites-nous ce que vous vendez, nous calibrons la veille.',
    accroche1: 'ARMP, COLEPS, mairies et bailleurs dans un seul flux',
    accroche2: 'Chaque avis noté par l’IA selon votre profil',
    accroche3: 'Alertes claires avec la date limite (heure de Douala)',
    pilotTitre: 'Demandez votre accès pilote',
    champNom: 'Nom complet',
    champEntreprise: 'Entreprise',
    champEmailPro: 'E-mail professionnel',
    champSecteur: 'Secteur d’activité',
    secteurChoisir: 'Choisir un secteur',
    secteurBtp: 'Travaux et BTP',
    secteurFournitures: 'Fournitures et équipements',
    secteurEtudes: 'Études et services intellectuels',
    secteurInformatique: 'Informatique et numérique',
    secteurSante: 'Santé',
    secteurAutre: 'Autre',
    placeholderEmail: 'vous@entreprise.cm',
    pilotEnvoyer: 'Demander mon accès pilote',
    pilotMentionLegale: 'Vos informations servent uniquement à traiter votre demande.',
    pilotOkTitre: 'Demande envoyée',
    pilotOkCorps: 'Nous vous écrivons à',
    pilotOkRecommencer: 'Envoyer une autre demande',
    connexionTitre: 'Connexion',
    connexionSousTitre: 'Vos identifiants vous sont fournis par votre administrateur.',
    champEmail: 'Adresse e-mail',
    champMotDePasse: 'Mot de passe',
    motDePasseOublie: 'Mot de passe oublié ?',
    connexionEnvoyer: 'Se connecter',
    connexionEnCours: 'Connexion en cours…',
    connexionErreur: 'Identifiants non reconnus. Vérifiez votre e-mail et votre mot de passe, ou demandez un accès pilote.',
    pasEncoreAcces: 'Pas encore d’accès ?',
    etape1Titre: 'Vous décrivez votre activité',
    etape1Texte: 'Secteur, régions et montants visés.',
    etape2Titre: 'Nous calibrons la veille',
    etape2Texte: 'Le score IA s’ajuste à votre profil.',
    etape3Titre: 'Vous recevez les bons avis',
    etape3Texte: 'Des alertes ciblées par e-mail.',
    sources: 'Sources suivies : ARMP, COLEPS, DGTCFM, ministères, mairies, FEICOM et bailleurs internationaux.',
    erreurObligatoire: 'Ce champ est obligatoire.',
    erreurEmail: 'Saisissez une adresse e-mail valide, par exemple vous@entreprise.cm.',
    erreurSecteur: 'Choisissez un secteur.',
    afficherMotDePasse: 'Afficher le mot de passe',
    masquerMotDePasse: 'Masquer le mot de passe',
    alerteTitre: 'Exemple d’alerte reçue par e-mail',
    alerteObjetMail: '[Market Advisor CM] Avis qualifié : {montant}, date limite {delai}',
    alerteReference: 'Référence',
    alerteAutorite: 'Autorité',
    alerteObjet: 'Objet',
    alerteMontant: 'Montant estimé',
    alerteDateLimite: 'Date limite',
    alerteScore: 'Score IA',
    alertePourquoi: 'Pourquoi cet avis vous est envoyé',
    alerteRaison1: 'Le secteur correspond à votre activité.',
    alerteRaison2: 'Le montant est dans votre fourchette habituelle.',
    alerteOuvrir: 'Ouvrir l’avis',
    alerteNote: 'Exemple illustratif : le gabarit réel reprend le format d’alerte figé du projet.',
    fermer: 'Fermer'
  },
  en: {
    navConnexion: 'Log in',
    heroTitre: 'Never miss a public tender in Cameroon again.',
    heroSousTitre: 'Market Advisor CM monitors the national procurement authority, ministries, councils and donors, then alerts you only to the tenders that fit your business.',
    ctaPilote: 'Request pilot access',
    ctaExempleAlerte: 'See a sample alert',
    noteIllustratif: 'Illustrative examples.',
    filtreTous: 'All',
    filtreNational: 'National',
    filtreInternational: 'International',
    sourceBailleurs: 'Donors',
    sourceOnu: 'UN',
    pauseLabel: 'Pause the notice carousel',
    lectureLabel: 'Resume the notice carousel',
    scoreIa: 'AI score',
    dateLimite: 'Deadline',
    jourSingulier: 'in {n} day',
    jourPluriel: 'in {n} days',
    uniteMillion: 'M',
    uniteMilliard: 'bn',
    devise: 'FCFA',
    jours7: '7 d',
    jours15: '15 d',
    jours22: '22 d',
    procAONO: 'National open tender',
    procAMI: 'Expression of interest',
    procAOI: 'International tender',
    ongletPilote: 'Pilot access',
    ongletConnexion: 'Existing client',
    accrocheTitre: 'Read only the tenders that matter to you.',
    accrocheSousTitre: 'Tell us what you sell and we will tune the watch.',
    accroche1: 'ARMP, COLEPS, councils and donors in a single feed',
    accroche2: 'Every notice scored by AI against your profile',
    accroche3: 'Clear alerts with the deadline (Douala time)',
    pilotTitre: 'Request your pilot access',
    champNom: 'Full name',
    champEntreprise: 'Company',
    champEmailPro: 'Work email',
    champSecteur: 'Industry',
    secteurChoisir: 'Choose an industry',
    secteurBtp: 'Construction and public works',
    secteurFournitures: 'Supplies and equipment',
    secteurEtudes: 'Studies and consulting',
    secteurInformatique: 'IT and digital',
    secteurSante: 'Health',
    secteurAutre: 'Other',
    placeholderEmail: 'you@company.cm',
    pilotEnvoyer: 'Request my pilot access',
    pilotMentionLegale: 'Your details are used only to process your request.',
    pilotOkTitre: 'Request sent',
    pilotOkCorps: 'We will write to you at',
    pilotOkRecommencer: 'Send another request',
    connexionTitre: 'Log in',
    connexionSousTitre: 'Your credentials are provided by your administrator.',
    champEmail: 'Email address',
    champMotDePasse: 'Password',
    motDePasseOublie: 'Forgot your password?',
    connexionEnvoyer: 'Log in',
    connexionEnCours: 'Signing in…',
    connexionErreur: 'Credentials not recognised. Check your email and password, or request pilot access.',
    pasEncoreAcces: 'No access yet?',
    etape1Titre: 'You describe your business',
    etape1Texte: 'Industry, regions and target values.',
    etape2Titre: 'We tune the watch',
    etape2Texte: 'The AI score adapts to your profile.',
    etape3Titre: 'You get the right notices',
    etape3Texte: 'Targeted alerts by email.',
    sources: 'Sources monitored: ARMP, COLEPS, DGTCFM, ministries, councils, FEICOM and international donors.',
    erreurObligatoire: 'This field is required.',
    erreurEmail: 'Enter a valid email address, for example you@company.cm.',
    erreurSecteur: 'Choose an industry.',
    afficherMotDePasse: 'Show password',
    masquerMotDePasse: 'Hide password',
    alerteTitre: 'Sample alert received by email',
    alerteObjetMail: '[Market Advisor CM] Qualified notice: {montant}, deadline {delai}',
    alerteReference: 'Reference',
    alerteAutorite: 'Authority',
    alerteObjet: 'Subject',
    alerteMontant: 'Estimated value',
    alerteDateLimite: 'Deadline',
    alerteScore: 'AI score',
    alertePourquoi: 'Why you receive this notice',
    alerteRaison1: 'The sector matches your business.',
    alerteRaison2: 'The value is within your usual range.',
    alerteOuvrir: 'Open the notice',
    alerteNote: "Illustrative example: the real template follows the project's fixed alert format.",
    fermer: 'Close'
  }
} as const;

export type CleAccueil = keyof typeof dictionnaireAccueil.fr;

/**
 * Formate un montant selon la langue.
 * Règle : espace insécable (\u00A0) entre nombre, unité et devise ; virgule en FR, point en EN.
 * Exemples : "48 M FCFA", "1,4 Md FCFA" (FR) / "1.4 bn FCFA" (EN)
 */
export function formatterMontant(montant: number, unite: 'M' | 'Md', langue: Langue = 'fr'): string {
  const nbFormate = langue === 'fr'
    ? montant.toString().replace('.', ',')
    : montant.toString();
  const uniteFormatee = unite === 'Md' && langue === 'en' ? 'bn' : unite;
  return `${nbFormate}\u00A0${uniteFormatee}\u00A0FCFA`;
}

/**
 * Formate une date au fuseau Africa/Douala.
 * Exemple : "9 oct. 2026"
 */
export function formatterDateLimite(date: Date | string, langue: Langue = 'fr'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(langue === 'fr' ? 'fr-FR' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Douala'
  }).format(d);
}
