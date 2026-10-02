export interface RadarBlipItem {
  idAO: string;
  titreAO: string;
  maitreOuvrage: string;
  region: string;
  montantEstime: number | null;
  montantTexte?: string | null;
  dateLimite: string;
  typeProcedure: string;
  scoreIA: number; // e.g. 4.8 out of 5
  motifScore: string;
  sourceType: 'NATIONAL' | 'INTERNATIONAL_BAILLEURS';
  sourceNom: string;
  angle: number; // 0 to 360 degrees on radar circle
  radiusPercent: number; // 20% to 85% from center
  datePublication?: string;
}

export interface PublicRadarData {
  simulation?: boolean | null;
  perime?: boolean | null;
  derniereSynchro?: string | null;
  statutSynchro?: 'ACTIF' | 'SYNCHRONISE' | string | null;
  totalAvisAnalysesPeriode?: number | null;
  sourcesOverview?: {
    nationalCount?: number | null;
    internationalCount?: number | null;
    sourcesList?: string[];
  } | null;
  blips?: RadarBlipItem[];
}

export type UserRole = 'ADMIN' | 'CLIENT';
export type ActiveStatus = 'OUI' | 'NON';
export type AlertState = 'NOUVEAU' | 'TRAITE' | 'IGNORE' | 'SAUVEGARDE';
export type AlertStatus = 'DISPONIBLE' | 'CLOTURE' | 'ANNULE';

export type AlertSendStatus = 'EN_ATTENTE' | 'ENVOYÉ' | 'REPORTÉ' | 'EXPIRÉ' | 'DOUBLON';
export type SubscriptionPlan = 'GRATUIT' | 'STANDARD' | 'PREMIUM';
export type SubscriptionStatus = 'ACTIF' | 'ESSAI' | 'EXPIRE' | 'SUSPENDU';
export type InvoiceStatus = 'EN_ATTENTE' | 'PAYEE' | 'ANNULEE';

export interface User {
  idUser: string;
  email: string;
  nom: string;
  nomComplet?: string;
  telephone?: string;
  role: UserRole;
  idClient?: string;
  langue: 'fr' | 'en';
  photoUrl?: string;
  token?: string;
  expiration?: string;
  actif?: ActiveStatus;
  dateCreation?: string;
  derniereConnexion?: string;
}

export interface ClientProfile {
  idClient: string;
  nom: string;
  nomEntreprise?: string;
  emailDestinataire: string;
  motsClesInclusion?: string[] | string;
  motsClesExclusion?: string[] | string;
  regions?: string[] | string;
  regionsCibles?: string[] | string;
  procedures?: string[] | string;
  typesProceduresVisees?: string[] | string;
  montantMinimum?: number | string;
  seuilScore?: number | string;
  seuilScoreMinClient?: number | string;
  promptMetier?: string;
  promptMetierIA?: string;
  siteWeb?: string;
  moPrioritaires?: string[] | string;
  casUsageReference?: string;
  actif: ActiveStatus;
  dateCreation?: string;
  nbUtilisateurs?: number;
  profilIA?: ClientEnrichedProfile;
  preferences?: ClientPreferencesData;
  abonnement?: ClientSubscription;
  factures?: ClientInvoice[];
}

export interface ClientEnrichedProfile {
  idClient?: string;
  inclusions?: string[] | string;
  motsClesInclusion?: string[] | string;
  exclusions?: string[] | string;
  motsClesExclusion?: string[] | string;
  moPrioritaires?: string[] | string;
  motsClesCles?: string[] | string;
  secteursCibles?: string[] | string;
  dernierCalcul?: string;
  dateGeneration?: string;
  versionPrompt?: string;
  commentaireGen?: string;
  profilCompact?: string;
  versionPromptCompact?: string;
  tauxCouverture?: string | number;
  dureeGenerationSec?: number;
  crawlReussi?: boolean;
}

export interface ClientPreferencesData {
  idClient?: string;
  notifEmail: boolean;
  notifWhatsApp: boolean;
  notifInApp: boolean;
  whatsappNumero?: string;
  frequence?: 'INSTANTANE' | 'QUOTIDIEN' | 'HEBDOMADAIRE';
  frequenceDigest?: 'QUOTIDIEN' | 'HEBDO' | 'MENSUEL' | 'INSTANTANE';
  heurePreferee: string;
  langue: 'fr' | 'en';
}

export type ClientPreferences = ClientPreferencesData;

export interface ClientSubscription {
  idAbonnement: string;
  idClient: string;
  plan: SubscriptionPlan | string;
  dateDebut: string;
  dateFin: string;
  statut: SubscriptionStatus | string;
  montantFCFA: number;
  modePaiement?: string;
  reference?: string;
  statutPaiement?: 'A_JOUR' | 'EN_RETARD' | 'IMPAYE' | string;
  periodicite?: 'MENSUEL' | 'TRIMESTRIEL' | 'ANNUEL' | string;
  quotaAlertesMois?: number;
  alertesConsommeesMois?: number;
}

export interface ClientInvoiceItem {
  designation: string;
  quantite: number;
  prixUnitaire: number;
  total: number;
}

export interface ClientInvoice {
  idFacture: string;
  idAbonnement?: string;
  idClient: string;
  dateEmission: string;
  periode?: string;
  montantFCFA: number;
  statut: InvoiceStatus | string;
  urlPdf?: string;
  modePaiement?: string;
  tvaTaux?: number;
  articles?: ClientInvoiceItem[];
}

export interface AdminClientAlertItem {
  idMatch: string;
  idAO?: string;
  idAvis?: string;
  numeroAvis?: string;
  idClient: string;
  nomClient?: string;
  emailDestinataire?: string;
  dateMatch: string;
  statut: AlertSendStatus | string;
  dateEnvoi?: string;
  score: number;
  justification?: string;
  scoreMots?: number;
  scoreIA?: number;
  titre?: string;
  maitreOuvrage?: string;
  region?: string;
  montant?: number;
  dateLimite?: string;
  lienDetail?: string;
  lienDAO?: string;
}

export interface AdminClientCacheIaItem {
  idAO: string;
  idClient: string;
  noteIA: number;
  motif: string;
  dateEval: string;
}

export interface AdminClientAuditItem {
  timestamp: string;
  idUser?: string;
  email: string;
  role: string;
  action: string;
  details: string;
  ip?: string;
  succes: boolean | 'OUI' | 'NON';
}

export interface TenderAlert {
  idMatch: string;
  idAvis: string;
  idClient: string;
  titre: string;
  maitreOuvrage: string;
  region: string;
  procedure: string;
  montantEstime: number;
  datePublication: string;
  dateLimite: string;
  scoreMatch: number;
  justificationIA: string;
  statut: AlertStatus;
  etat: AlertState;
  lu: boolean;
  noteClient?: string;
  lienDao?: string;
  secteur?: string;
  decision?: 'GO' | 'NOGO' | 'EN_ATTENTE';
  decisionJustification?: string;
  decisionLienComplementaire?: string;
  decisionPar?: string;
  dateDecision?: string;
  nbNotes?: number;
  estExpire?: boolean;
}

export interface AlertNote {
  idNote: string;
  idMatch: string;
  auteurEmail: string;
  auteurRole: string;
  texte: string;
  dateCreation: string;
}

export interface SourceFraicheur {
  plateforme: string;
  urlAccueil: string;
  actif: boolean;
  frequenceScraping: string;
  derniereExecution: string;
}

export interface AlertCounts {
  total: number;
  nonLues: number;
  nouveaux: number;
  traites: number;
  ignores: number;
  sauvegardes: number;
  expires: number;
}

export interface ClientDashboardStats {
  totalAlertes: number;
  nonLues: number;
  traitees: number;
  sauvegardees: number;
  scoreMoyen: number;
  prochaineEcheance: string;
  montantTotalCible: number;
}

export interface RegionStat {
  region: string;
  count: number;
  montantTotal: number;
}

export interface ProcedureStat {
  procedure: string;
  label: string;
  count: number;
  percentage: number;
}

export interface TimelineStat {
  date: string;
  alertes: number;
  scoreMoyen: number;
}

export interface TopMO {
  nom: string;
  avisCount: number;
  montantCumule: number;
}

export interface AdminStats {
  clients?: { total: number; actifs: number; inactifs: number };
  utilisateurs?: { total: number; actifs: number; admins: number };
  avis?: { total: number; nouveaux: number };
  alertes?: { total: number; enAttente: number; envoyees: number };
  sessions?: { actives: number };
  totalClients?: number;
  clientsActifs?: number;
  totalUtilisateurs?: number;
  totalAvisScrapes?: number;
  totalAlertesGenerees?: number;
  sessionsActives?: number;
  tauxMatchMoyen?: string;
  quotas?: {
    geminiAujourdhui?: number;
    gmailRestant?: number;
    geminiAi?: { utilise: number; total: number; pourcentage: number; status: string };
    gmailApi?: { utilise: number; total: number; pourcentage: number; status: string };
    whatsappApi?: { utilise: number; total: number; pourcentage: number; status: string };
  };
}

export interface PipelineAction {
  code: string;
  nom?: string;
  label?: string;
  fonction?: string;
  description?: string;
  dernierLancement?: string;
  statut?: 'DISPONIBLE' | 'EN_COURS' | 'ERREUR' | string;
  dureeMoyenne?: string;
  frequenceEstimee?: string;
  disponible?: boolean;
}

export interface AuditLogItem {
  id?: string;
  timestamp: string;
  idUser?: string;
  email: string;
  role: string;
  action: string;
  details: string;
  ip?: string;
  succes: boolean | 'OUI' | 'NON';
}

export interface SessionItem {
  idSession?: string;
  idUser: string;
  email: string;
  nom?: string;
  role: string;
  tokenMasque?: string;
  tokenMasked?: string;
  dateConnexion?: string;
  dateCreation?: string;
  dateExpiration?: string;
  derniereActivite?: string;
  ip?: string;
  userAgent?: string;
  actif: ActiveStatus;
}

// ============================================================================
// CONTRAT DE LA ROUTE GET /admin/avis (Onglet TOUS_AO - Base réelle Google Sheets)
// ============================================================================
// - Méthode et chemin : GET /admin/avis
// - Paramètres de requête (tous facultatifs) :
//   - limit : nombre (défaut 25, maximum 100)
//   - offset : nombre (défaut 0)
//   - source : string (nom exact de la source ; vide ou « TOUS » = toutes)
//   - statut : string (NOUVEAU, QUALIFIÉ, REJETÉ, EXPIRÉ ou ARCHIVÉ ; vide ou « TOUS » = tous)
//   - dateFrom : string (AAAA-MM-JJ, borne incluse, appliquée à la date de collecte au fuseau Africa/Douala)
//   - dateTo : string (AAAA-MM-JJ, borne incluse, appliquée à la date de collecte au fuseau Africa/Douala)
//   - q : string (recherche insensible à la casse et aux accents dans titre, autorite, numeroAvis, region, source)
//   - sortBy : 'dateCollecte' | 'dateLimite' | 'montant' (défaut 'dateCollecte')
//   - sortOrder : 'desc' | 'asc' (défaut 'desc')
// - Format de réponse standard : ApiResponse<AdminAvisResponse>
//   avec donnees = { total, limit, offset, count, avis, facettes }
//   où facettes = { sources: [{ valeur, nombre }], statuts: [{ valeur, nombre }] }
//   calculées globalement sur l'ensemble des avis, indépendamment des filtres actifs.
// ============================================================================

export interface AvisCollecte {
  idAvis: string;
  numeroAvis: string | null;
  titre: string;
  autorite: string | null;
  region: string | null;
  source: string;
  sourceType: 'NATIONAL' | 'INTERNATIONAL' | null;
  procedure: string | null;
  montant: number | null;
  montantTexte?: string | null;
  dateLimite: string | null;
  dateLimiteEstimee?: boolean;
  dateLimiteTexte?: string | null;
  datePublication: string | null;
  dateCollecte: string | null;
  statut: string;
  lien: string | null;
}

export interface FacetteAvis {
  valeur: string;
  nombre: number;
}

export interface AdminAvisFacettes {
  sources: FacetteAvis[];
  statuts: FacetteAvis[];
}

export interface AdminAvisParams {
  limit?: number;
  offset?: number;
  source?: string;
  statut?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
  sortBy?: 'dateCollecte' | 'dateLimite' | 'montant' | string;
  sortOrder?: 'desc' | 'asc';
}

export interface AdminAvisResponse {
  total: number;
  limit: number;
  offset: number;
  count: number;
  avis: AvisCollecte[];
  facettes: AdminAvisFacettes;
}

export interface ApiResponse<T = any> {
  succes: boolean;
  code: number;
  message?: string;
  donnees: T;
  timestamp: string;
}

export interface ApiConfigInfo {
  isConfigured: boolean;
  mode: 'APPS_SCRIPT_PRODUCTION' | 'NON_CONFIGURE';
  apiUrlDisplay: string;
  version: string;
}

export interface ReglagesProxyEtat {
  mode: 'OFF' | 'OBSERVE' | 'ENFORCE';
  secretPresent: boolean;
  rapport6h: {
    ok: number;
    ko: number;
    detail: { heure: string; ok: number; ko: number }[];
  };
}

export interface ReglagesParametres {
  Email_Admin_Logs?: string;
  Email_Reply_To?: string;
  Seuil_Score_Pertinence_Min?: number | string;
  Fenetre_Veille_Heures?: number | string;
  Heure_Collecte_Nuit?: string;
  Heure_Envoi_Matin?: string;
  Activer_Reporting?: 'OUI' | 'NON' | string;
  Seuil_Alerte_Quota_Emails?: number | string;
  Activer_Fallback_DeepSeek?: 'OUI' | 'NON' | string;
}

export interface ReglagesCleApiInfo {
  nbCles: number;
  masquees: string[];
}

export interface ReglagesData {
  proxy: ReglagesProxyEtat;
  parametres: ReglagesParametres;
  clesApi: {
    Cle_API_IA: ReglagesCleApiInfo;
    Cle_API_IA_DeepSeek: ReglagesCleApiInfo;
  };
}

export interface AlertFilterOptions {
  statut?: string;
  etat?: string;
  lu?: string;
  expire?: 'OUI' | 'NON' | 'TOUS';
  region?: string;
  procedure?: string;
  scoreMin?: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: 'date' | 'score' | 'deadline' | string;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface SavedSearch {
  idRecherche: string;
  nom: string;
  filtres: AlertFilterOptions;
  creeParEmail: string;
  dateCreation: string;
}

export const OFFICIAL_CAMEROON_REGIONS = [
  'ADAMAOUA',
  'CENTRE',
  'EST',
  'EXTRÊME-NORD',
  'LITTORAL',
  'NORD',
  'NORD-OUEST',
  'OUEST',
  'SUD',
  'SUD-OUEST',
  'TOUTES'
] as const;

export const OFFICIAL_CAMEROON_PROCEDURES = [
  'AONO',
  'AONI',
  'DC',
  'AMI',
  'ATTRIBUTION',
  'TOUTES'
] as const;

export const CAMEROON_REGIONS = [
  'Centre',
  'Littoral',
  'Ouest',
  'Nord-Ouest',
  'Sud-Ouest',
  'Adamaoua',
  'Nord',
  'Extrême-Nord',
  'Est',
  'Sud'
] as const;

export const CAMEROON_PROCEDURES = [
  { code: 'AON', label: "Appel d'Offres National (AON)" },
  { code: 'AOO', label: "Appel d'Offres Ouvert (AOO)" },
  { code: 'AOI', label: "Appel d'Offres International (AOI)" },
  { code: 'DC', label: "Demande de Cotation (DC)" },
  { code: 'ASMI', label: "Appel à Sollicitation de Manifestation d'Intérêt (ASMI)" },
  { code: 'GG', label: "Gré à Gré (GG)" }
] as const;
