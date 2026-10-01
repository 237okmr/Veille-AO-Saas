import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// SERVER LOG CAPTURE RING BUFFER (Diagnostic monitoring)
// ============================================================================

interface ServerLogEntry {
  id: number;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

const recentServerLogs: ServerLogEntry[] = [];
let nextLogId = 1;

// Masque les secrets (jetons de session, clé du proxy, mots de passe, jeton de lien de connexion)
// avant toute écriture dans le journal : mémoire du diagnostic ET console du serveur.
function masquerSecrets(texte: string): string {
  let t = String(texte);
  const secretProxy = (process.env.PROXY_SHARED_SECRET || '').trim();
  if (secretProxy.length >= 8) t = t.split(secretProxy).join('***');
  return t
    .replace(/([?&](?:token|proxyKey|jeton|key|secret|password|motDePasse)=)[^&\s)"']+/gi, '$1***')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+\/=-]+/gi, '$1***')
    .replace(/("(?:token|proxyKey|jeton|motDePasse|nouveauMotDePasse|ancienMotDePasse|password|secret)"\s*:\s*")[^"]*(")/gi, '$1***$2')
    .replace(/(#acces=)[0-9a-fA-F]{64}/g, '$1***');
}

function captureLog(level: 'info' | 'warn' | 'error', ...args: any[]) {
  const msg = masquerSecrets(args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
  recentServerLogs.push({
    id: nextLogId++,
    timestamp: new Date().toISOString(),
    level,
    message: msg
  });
  if (recentServerLogs.length > 60) {
    recentServerLogs.shift();
  }
}

const origLog = console.log;
const origWarn = console.warn;
const origErr = console.error;

const masquerArg = (a: any) =>
  typeof a === 'string' ? masquerSecrets(a) : (a instanceof Error ? masquerSecrets(a.stack || a.message) : a);

console.log = (...args: any[]) => {
  captureLog('info', ...args);
  origLog(...args.map(masquerArg));
};
console.warn = (...args: any[]) => {
  captureLog('warn', ...args);
  origWarn(...args.map(masquerArg));
};
console.error = (...args: any[]) => {
  captureLog('error', ...args);
  origErr(...args.map(masquerArg));
};

const app = express();
const PORT = process.env.PORT || 3000;
const API_URL = process.env.API_URL || '';

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ============================================================================
// IN-MEMORY SIMULATION DATA STORE (used if API_URL is unset or in sandbox mode)
// ============================================================================

interface MockUser {
  idUser: string;
  email: string;
  motDePasse: string;
  nom: string;
  telephone?: string;
  role: 'ADMIN' | 'CLIENT';
  idClient?: string;
  langue: 'fr' | 'en';
  actif: 'OUI' | 'NON';
  dateCreation: string;
}

interface MockClient {
  idClient: string;
  nom: string;
  emailDestinataire: string;
  regions: string[];
  procedures: string[];
  montantMinimum: number;
  seuilScore: number;
  promptMetier: string;
  siteWeb: string;
  moPrioritaires: string[];
  casUsageReference?: string;
  actif: 'OUI' | 'NON';
  dateCreation: string;
  abonnement?: any;
  factures?: any[];
  profilIA?: {
    inclusions: string[];
    exclusions: string[];
    motsClesCles: string[];
    secteursCibles: string[];
    dernierCalcul: string;
  };
}

interface MockTenderAlert {
  idMatch: string;
  idAvis: string;
  idClient: string;
  titre: string;
  maitreOuvrage: string;
  region: string;
  procedure: string; // 'AOO' | 'AON' | 'AOI' | 'DC' | 'ASMI' | 'GG'
  montantEstime: number; // in FCFA
  datePublication: string;
  dateLimite: string;
  scoreMatch: number; // 0 to 100
  justificationIA: string;
  statut: 'DISPONIBLE' | 'CLOTURE' | 'ANNULE';
  etat: 'NOUVEAU' | 'TRAITE' | 'IGNORE' | 'SAUVEGARDE';
  lu: boolean;
  noteClient?: string;
  lienDao?: string;
  secteur: string;
}

const mockClients: MockClient[] = [
  {
    idClient: 'CLI-001',
    nom: 'CAMEROON INFRA & BTP SARL',
    emailDestinataire: 'contact@cameroon-infra.cm',
    regions: ['Centre', 'Littoral', 'Ouest', 'Sud'],
    procedures: ['AOO', 'AON', 'AOI', 'DC'],
    montantMinimum: 50000000,
    seuilScore: 65,
    promptMetier: "Entreprise générale de BTP spécialisée en voirie, assainissement urbain, construction de ponts et réhabilitation d'infrastructures scolaires et sanitaires au Cameroun.",
    siteWeb: 'https://www.cameroon-infra.cm',
    moPrioritaires: ['MINTP', 'MINDCAF', 'Port Autonome de Douala', 'FEICOM', 'CUD (Communauté Urbaine de Douala)'],
    casUsageReference: 'Construction échangeur Nord Douala, Réfection RN3 Yaoundé-Douala',
    actif: 'OUI',
    dateCreation: '2025-11-10T08:30:00Z',
    profilIA: {
      inclusions: ['Travaux routiers', 'Génie civil', 'Ouvrages d’art', 'Bitumage', 'Drainage pluvial', 'Pavés autobloquants'],
      exclusions: ['Fourniture bureautique', 'Gardiennage', 'Logiciels IT purs', 'Produits pharmaceutiques'],
      motsClesCles: ['Voirie', 'BTP', 'Terrassement', 'Enrobé', 'Béton armé', 'MINTP'],
      secteursCibles: ['Bâtiment & Travaux Publics', 'Infrastructures Urbaines', 'Génie Civil'],
      dernierCalcul: new Date().toISOString()
    }
  },
  {
    idClient: 'CLI-002',
    nom: 'AFRICA TECH & DIGITAL SOLUTIONS',
    emailDestinataire: 'direction@africatech.cm',
    regions: ['Centre', 'Littoral', 'Adamaoua', 'Nord'],
    procedures: ['AOO', 'AON', 'DC', 'ASMI'],
    montantMinimum: 15000000,
    seuilScore: 70,
    promptMetier: "Entreprise de services numériques spécialisée en infogérance, cybersécurité, développement d'applications métiers et fourniture d'équipements datacenter pour administrations publiques.",
    siteWeb: 'https://www.africatech.cm',
    moPrioritaires: ['MINPOSTEL', 'MINFI', 'ART', 'ANTIC', 'CNPS', 'DGI'],
    actif: 'OUI',
    dateCreation: '2026-01-15T10:00:00Z',
    profilIA: {
      inclusions: ['Logiciels', 'Réseaux télécoms', 'Cybersécurité', 'Serveurs', 'Fibre optique', 'Numérisation d’archives'],
      exclusions: ['Travaux BTP lourds', 'Véhicules de fonction', 'Alimentation'],
      motsClesCles: ['ERP', 'Data Center', 'Cloud', 'Système d’information', 'Sécurité informatique'],
      secteursCibles: ['Technologies de l’Information & Télécoms', 'Transformation Digitale'],
      dernierCalcul: new Date().toISOString()
    }
  },
  {
    idClient: 'CLI-003',
    nom: 'EQUATORIAL PHARMA & HEALTH CAMEROON',
    emailDestinataire: 'marches@equatorialpharma.cm',
    regions: ['Centre', 'Littoral', 'Est', 'Extrême-Nord', 'Nord-Ouest', 'Sud-Ouest'],
    procedures: ['AOO', 'AON', 'AOI', 'DC'],
    montantMinimum: 25000000,
    seuilScore: 75,
    promptMetier: "Fournisseur agréé de consommables médicaux, équipements hospitaliers d'imagerie et de laboratoire, kits réactifs et réhabilitation de centres de santé.",
    siteWeb: 'https://www.equatorialpharma.cm',
    moPrioritaires: ['MINSANTE', 'CENAME', 'Hôpital Général de Yaoundé', 'Hôpital Laquintinie de Douala'],
    actif: 'OUI',
    dateCreation: '2026-02-01T14:20:00Z',
    profilIA: {
      inclusions: ['Matériel biomédical', 'Réactifs de laboratoire', 'Consommables médico-chirurgicaux', 'Échographes', 'Ambulances équipées'],
      exclusions: ['Logiciels de gestion RH', 'Travaux de peinture simples', 'Gardiennage'],
      motsClesCles: ['Santé', 'Biomédical', 'MINSANTE', 'Laboratoire', 'Scanner'],
      secteursCibles: ['Santé & Biomédical', 'Équipements Hospitaliers'],
      dernierCalcul: new Date().toISOString()
    }
  }
];

const mockUsers: MockUser[] = [
  {
    idUser: 'USR-ADMIN-01',
    email: 'admin@marchespublics.cm',
    motDePasse: 'admin123',
    nom: 'Dieudonné Mbarga (Super Admin)',
    telephone: '+237 677 12 34 56',
    role: 'ADMIN',
    langue: 'fr',
    actif: 'OUI',
    dateCreation: '2025-10-01T08:00:00Z'
  },
  {
    idUser: 'USR-ADMIN-02',
    email: '237okmr@gmail.com',
    motDePasse: 'ChangezMoi2026!',
    nom: 'Super Administrateur Diagnostic',
    telephone: '+237 677 00 00 00',
    role: 'ADMIN',
    langue: 'fr',
    actif: 'OUI',
    dateCreation: '2026-01-01T08:00:00Z'
  },
  {
    idUser: 'USR-CLI-01',
    email: 'client@cameroon-infra.cm',
    motDePasse: 'client123',
    nom: 'Alain Fotso',
    telephone: '+237 699 88 77 66',
    role: 'CLIENT',
    idClient: 'CLI-001',
    langue: 'fr',
    actif: 'OUI',
    dateCreation: '2025-11-10T09:00:00Z'
  },
  {
    idUser: 'USR-CLI-02',
    email: 'tech@africatech.cm',
    motDePasse: 'tech123',
    nom: 'Nathalie Ewane',
    telephone: '+237 655 44 33 22',
    role: 'CLIENT',
    idClient: 'CLI-002',
    langue: 'fr',
    actif: 'OUI',
    dateCreation: '2026-01-15T11:00:00Z'
  }
];

const mockAlerts: MockTenderAlert[] = [
  {
    idMatch: 'MTC-9001',
    idAvis: 'AO-2026-MINTP-088',
    idClient: 'CLI-001',
    titre: "Travaux de bitumage en enduit superficiel et aménagement des voies d'accès au pôle agro-industriel de Bafoussam - Ouest Cameroun",
    maitreOuvrage: 'MINTP (Ministère des Travaux Publics)',
    region: 'Ouest',
    procedure: 'AON',
    montantEstime: 385000000,
    datePublication: '2026-09-22T08:00:00Z',
    dateLimite: '2026-10-28T12:00:00Z',
    scoreMatch: 96,
    justificationIA: "Correspondance optimale à 96% : travaux de voirie et bitumage dans la région de l'Ouest, budget supérieur au seuil minimal de 50M FCFA, maître d'ouvrage (MINTP) listé en priorité absolue.",
    statut: 'DISPONIBLE',
    etat: 'NOUVEAU',
    lu: false,
    lienDao: 'https://armp.cm/dao/AO-2026-MINTP-088.pdf',
    secteur: 'BTP & Voirie'
  },
  {
    idMatch: 'MTC-9002',
    idAvis: 'AO-2026-CUD-142',
    idClient: 'CLI-001',
    titre: "Construction de 4 collecteurs primaires d'assainissement et dalots de drainage pluvial dans les bassins versants de Makepe-Missoke à Douala",
    maitreOuvrage: 'CUD (Communauté Urbaine de Douala)',
    region: 'Littoral',
    procedure: 'AOO',
    montantEstime: 620000000,
    datePublication: '2026-09-24T09:30:00Z',
    dateLimite: '2026-11-05T14:00:00Z',
    scoreMatch: 92,
    justificationIA: "Forte adéquation (92%) : génie civil hydraulique et drainage pluvial lourd dans le Littoral, montant très élevé (620M FCFA) correspondant à la capacité technique BTP.",
    statut: 'DISPONIBLE',
    etat: 'SAUVEGARDE',
    lu: true,
    noteClient: 'Dossier groupement avec Société Hydraulique Cameroun à préparer avant le 15 octobre.',
    lienDao: 'https://armp.cm/dao/AO-2026-CUD-142.pdf',
    secteur: 'Assainissement Urbain'
  },
  {
    idMatch: 'MTC-9003',
    idAvis: 'AO-2026-FEICOM-031',
    idClient: 'CLI-001',
    titre: "Travaux de construction de l'Hôtel de Ville de la Commune d'Ebolowa II et aménagements paysagers - Région du Sud",
    maitreOuvrage: 'FEICOM / Commune Ebolowa II',
    region: 'Sud',
    procedure: 'AON',
    montantEstime: 145000000,
    datePublication: '2026-09-18T11:00:00Z',
    dateLimite: '2026-10-15T11:00:00Z',
    scoreMatch: 88,
    justificationIA: "Adéquation BTP bâtiment institutionnel dans la région du Sud. Montant de 145M FCFA supérieur au plancher client. FEICOM identifié dans la liste de ciblage.",
    statut: 'DISPONIBLE',
    etat: 'TRAITE',
    lu: true,
    noteClient: 'Caution de soumission déposée auprès de la BICEC.',
    lienDao: 'https://armp.cm/dao/AO-2026-FEICOM-031.pdf',
    secteur: 'Bâtiment'
  },
  {
    idMatch: 'MTC-9004',
    idAvis: 'AO-2026-PAD-077',
    idClient: 'CLI-001',
    titre: "Fourniture et pose de revêtements lourds en dalles de béton armé pour la plateforme logistique du terminal polyvalent de Douala",
    maitreOuvrage: 'Port Autonome de Douala (PAD)',
    region: 'Littoral',
    procedure: 'AOI',
    montantEstime: 940000000,
    datePublication: '2026-09-20T15:00:00Z',
    dateLimite: '2026-11-20T15:00:00Z',
    scoreMatch: 85,
    justificationIA: "Opportunité majeure au Port de Douala (PAD). Génie civil et dallage lourd en béton armé. Seuil de 940M FCFA.",
    statut: 'DISPONIBLE',
    etat: 'NOUVEAU',
    lu: false,
    lienDao: 'https://armp.cm/dao/AO-2026-PAD-077.pdf',
    secteur: 'Infrastructures Portuaires'
  },
  {
    idMatch: 'MTC-9005',
    idAvis: 'AO-2026-MINEDUB-094',
    idClient: 'CLI-001',
    titre: "Construction de 12 blocs de 2 salles de classe équipées dans les écoles publiques du département du Nyong-et-Mfoumou (Centre)",
    maitreOuvrage: 'MINEDUB (Ministère de l’Éducation de Base)',
    region: 'Centre',
    procedure: 'DC',
    montantEstime: 72000000,
    datePublication: '2026-09-25T10:00:00Z',
    dateLimite: '2026-10-12T10:00:00Z',
    scoreMatch: 78,
    justificationIA: "Correspondance bâtiment scolaire dans le Centre, demande de cotation (DC) d'un montant de 72M FCFA.",
    statut: 'DISPONIBLE',
    etat: 'NOUVEAU',
    lu: false,
    lienDao: 'https://armp.cm/dao/AO-2026-MINEDUB-094.pdf',
    secteur: 'Éducation & Bâtiments'
  },
  {
    idMatch: 'MTC-9006',
    idAvis: 'AO-2026-MINDEF-012',
    idClient: 'CLI-001',
    titre: "Entretien périodique du réseau de pistes forestières d'évacuation sanitaire dans le Sud",
    maitreOuvrage: 'MINDEF / Génie Militaire',
    region: 'Sud',
    procedure: 'AON',
    montantEstime: 42000000,
    datePublication: '2026-09-15T09:00:00Z',
    dateLimite: '2026-10-01T12:00:00Z',
    scoreMatch: 58,
    justificationIA: "Score sous le seuil (58%) : montant estimé (42M FCFA) légèrement inférieur au montant minimum exigé par le client (50M FCFA).",
    statut: 'DISPONIBLE',
    etat: 'IGNORE',
    lu: true,
    lienDao: 'https://armp.cm/dao/AO-2026-MINDEF-012.pdf',
    secteur: 'Voirie'
  },
  {
    idMatch: 'MTC-9007',
    idAvis: 'AO-2026-MINDCAF-055',
    idClient: 'CLI-001',
    titre: "Aménagement d'une zone d'activités économiques et viabilisation des réseaux divers (VRD) à Olembé (Yaoundé)",
    maitreOuvrage: 'MINDCAF (Domaines, Cadastre et Affaires Foncières)',
    region: 'Centre',
    procedure: 'AON',
    montantEstime: 210000000,
    datePublication: '2026-09-26T14:00:00Z',
    dateLimite: '2026-11-02T12:00:00Z',
    scoreMatch: 91,
    justificationIA: "VRD et viabilisation foncière à Yaoundé. Parfait accord avec les compétences BTP et réseau d'infrastructures.",
    statut: 'DISPONIBLE',
    etat: 'NOUVEAU',
    lu: false,
    lienDao: 'https://armp.cm/dao/AO-2026-MINDCAF-055.pdf',
    secteur: 'VRD & Aménagement'
  }
];

const mockPreferences = {
  notifEmail: true,
  notifWhatsApp: true,
  notifInApp: true,
  whatsappNumero: '+237 699 88 77 66',
  frequence: 'QUOTIDIEN',
  heurePreferee: '07:30',
  langue: 'fr'
};

const mockAuditLogs = [
  {
    id: 'AUD-001',
    timestamp: '2026-09-27T16:20:10Z',
    email: 'admin@marchespublics.cm',
    role: 'ADMIN',
    action: 'PIPELINE_RUN_SCRAPING_ARMP',
    details: 'Exécution du scraper ARMP : 48 nouveaux avis collectés avec succès',
    ip: '102.244.155.12',
    succes: true
  },
  {
    id: 'AUD-002',
    timestamp: '2026-09-27T15:45:00Z',
    email: 'client@cameroon-infra.cm',
    role: 'CLIENT',
    action: 'CLIENT_PROFILE_UPDATE',
    details: 'Mise à jour des régions cibles (Centre, Littoral, Ouest, Sud)',
    ip: '129.0.210.45',
    succes: true
  },
  {
    id: 'AUD-003',
    timestamp: '2026-09-27T14:10:22Z',
    email: 'admin@marchespublics.cm',
    role: 'ADMIN',
    action: 'CLIENT_CREATE',
    details: 'Création client CLI-003 (EQUATORIAL PHARMA) avec génération IA',
    ip: '102.244.155.12',
    succes: true
  },
  {
    id: 'AUD-004',
    timestamp: '2026-09-27T12:00:15Z',
    email: 'tech@africatech.cm',
    role: 'CLIENT',
    action: 'ALERT_MARK_SAUVEGARDE',
    details: 'Marquage alerte MTC-9002 comme SAUVEGARDE',
    ip: '154.72.160.89',
    succes: true
  },
  {
    id: 'AUD-005',
    timestamp: '2026-09-27T08:00:00Z',
    email: 'system-bot@marchespublics.cm',
    role: 'SYSTEM',
    action: 'PIPELINE_EMAIL_DIGEST',
    details: 'Envoi du digest quotidien : 18 emails expédiés via Gmail API',
    ip: '127.0.0.1',
    succes: true
  }
];

const mockSessions = [
  {
    idSession: 'SES-01',
    idUser: 'USR-ADMIN-01',
    email: 'admin@marchespublics.cm',
    role: 'ADMIN',
    tokenMasque: 'tok_adm_...8f9a',
    dateConnexion: '2026-09-27T14:00:00Z',
    derniereActivite: '2026-09-27T16:40:00Z',
    ip: '102.244.155.12',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/128.0',
    actif: 'OUI'
  },
  {
    idSession: 'SES-02',
    idUser: 'USR-CLI-01',
    email: 'client@cameroon-infra.cm',
    role: 'CLIENT',
    tokenMasque: 'tok_cli_...2c4b',
    dateConnexion: '2026-09-27T15:10:00Z',
    derniereActivite: '2026-09-27T16:35:00Z',
    ip: '129.0.210.45',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edge/128.0',
    actif: 'OUI'
  },
  {
    idSession: 'SES-03',
    idUser: 'USR-CLI-02',
    email: 'tech@africatech.cm',
    role: 'CLIENT',
    tokenMasque: 'tok_cli_...9e1d',
    dateConnexion: '2026-09-26T18:00:00Z',
    derniereActivite: '2026-09-26T19:20:00Z',
    ip: '154.72.160.89',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) Safari/605.1',
    actif: 'OUI'
  }
];

const mockPipelineActions = [
  {
    code: 'SCRAPING_ARMP',
    nom: "Collecte des avis ARMP Cameroun",
    description: "Scrape le journal officiel des marchés publics ARMP (Appels d'offres, Additifs, Résultats d'attribution).",
    dernierLancement: '2026-09-27T16:20:00Z',
    statut: 'DISPONIBLE',
    dureeMoyenne: '14s',
    frequenceEstimee: 'Toutes les 4 heures'
  },
  {
    code: 'SCRAPING_DGTCFM',
    nom: "Collecte DGTCFM & Ministères",
    description: "Collecte les avis de sollicitation et consultations directes des délégations régionales et ministères.",
    dernierLancement: '2026-09-27T12:00:00Z',
    statut: 'DISPONIBLE',
    dureeMoyenne: '22s',
    frequenceEstimee: 'Quotidien (06h00)'
  },
  {
    code: 'AI_MATCHING_SCORING',
    nom: "Scoring & Matching IA (Gemini)",
    description: "Analyse sémantique vectorielle entre les avis collectés et les profils IA clients avec calcul de score et justification.",
    dernierLancement: '2026-09-27T16:25:00Z',
    statut: 'DISPONIBLE',
    dureeMoyenne: '35s',
    frequenceEstimee: 'Après chaque collecte'
  },
  {
    code: 'EMAIL_DIGEST_DISPATCHER',
    nom: "Générateur et Envoi des Alertes Email",
    description: "Assemble les bulletins personnalisés HTML avec liens de téléchargement direct des DAO et envoie via Gmail API.",
    dernierLancement: '2026-09-27T08:00:00Z',
    statut: 'DISPONIBLE',
    dureeMoyenne: '9s',
    frequenceEstimee: 'Quotidien (07h30)'
  },
  {
    code: 'WHATSAPP_ALERT_BOT',
    nom: "Notification WhatsApp Instantanée",
    description: "Transmet des résumés courts WhatsApp aux décideurs pour les marchés à score ≥ 85%.",
    dernierLancement: '2026-09-27T14:30:00Z',
    statut: 'DISPONIBLE',
    dureeMoyenne: '5s',
    frequenceEstimee: 'Temps réel'
  },
  {
    code: 'DATA_CLEANUP_OPTIMIZE',
    nom: "Archivage & Nettoyage des Sessions",
    description: "Purge les jetons expirés, compresse les historiques d'audit de plus de 90 jours et optimise les index.",
    dernierLancement: '2026-09-25T00:00:00Z',
    statut: 'DISPONIBLE',
    dureeMoyenne: '3s',
    frequenceEstimee: 'Hebdomadaire'
  }
];

// Active user sessions token map
const activeTokens: Record<string, { user: MockUser; expires: number }> = {
  'tok_demo_admin': {
    user: mockUsers[0],
    expires: Date.now() + 30 * 24 * 3600 * 1000
  },
  'tok_demo_client': {
    user: mockUsers[1],
    expires: Date.now() + 30 * 24 * 3600 * 1000
  }
};

// ============================================================================
// PROXY HELPER & ROUTE FORWARDER
// ============================================================================

const getEffectiveApiUrl = (): string => {
  const raw = (process.env.API_URL || '').trim();
  if (!raw || raw.includes('VOTRE_DEPLOYMENT_ID')) return '';
  if (raw.startsWith('https://script.google.com')) return raw;
  // If user provided deployment ID starting with AKfycb, construct full Web App URL
  if (raw.startsWith('AKfycb')) {
    return `https://script.google.com/macros/s/${raw}/exec`;
  }
  return raw;
};

const isRealApiConfigured = () => {
  const url = getEffectiveApiUrl();
  return Boolean(
    url &&
    url.trim() !== '' &&
    url.startsWith('https://script.google.com') &&
    !url.includes('VOTRE_DEPLOYMENT_ID')
  );
};

// Forwarding helper to Google Apps Script Web App
async function forwardToAppsScript(req: Request, targetRoute: string) {
  let url = getEffectiveApiUrl();
  
  // Apps Script web apps receive params either as query or within body
  const urlObj = new URL(url);
  urlObj.searchParams.set('route', targetRoute);
  urlObj.searchParams.set('proxyKey', process.env.PROXY_SHARED_SECRET || '');

  // Copy incoming query params
  for (const [key, value] of Object.entries(req.query)) {
    if (key !== 'route') {
      urlObj.searchParams.set(key, String(value));
    }
  }

  // Check auth token from header or query
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    urlObj.searchParams.set('token', authHeader.substring(7));
  } else if (req.query.token) {
    urlObj.searchParams.set('token', String(req.query.token));
  }

  const options: RequestInit = {
    method: req.method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    redirect: 'follow'
  };

  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    const rawBody = (req.body && typeof req.body === 'object') ? req.body : {};
    const authToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string | undefined);
    const bodyWithRoute = {
      ...rawBody,
      route: rawBody.route || targetRoute,
      ...(authToken && !rawBody.token ? { token: authToken } : {})
    };
    options.body = JSON.stringify(bodyWithRoute);
  }

  console.log('[DIAG-PROXYKEY] presente=' + urlObj.searchParams.has('proxyKey') + ' longueur=' + (urlObj.searchParams.get('proxyKey') || '').length);
  const response = await fetch(urlObj.toString(), options);
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    return {
      succes: response.ok,
      code: response.status,
      message: text || response.statusText,
      donnees: null,
      timestamp: new Date().toISOString()
    };
  }
}

// Vérifie que l'appelant est un administrateur connecté (en-tête Authorization uniquement,
// jamais dans l'adresse). Résultat gardé 60 s (accepté) ou 15 s (refusé) pour ne pas solliciter
// Apps Script à chaque appel. Sans en-tête, aucun appel à Apps Script n'est fait.
const adminCache = new Map<string, { ok: boolean; exp: number }>();
let verifsAdminFenetre = { debut: 0, n: 0 };
async function estAdministrateur(req: Request): Promise<boolean> {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return false;
  const token = auth.substring(7).trim();
  if (!token || token.length > 512) return false;

  const cached = adminCache.get(token);
  if (cached && cached.exp > Date.now()) return cached.ok;

  // Plafond : au plus 20 vérifications par minute auprès d'Apps Script (les réponses en cache ne
  // comptent pas), pour qu'une série de faux jetons ne consomme pas le quota d'Apps Script.
  const maintenant = Date.now();
  if (maintenant - verifsAdminFenetre.debut > 60_000) verifsAdminFenetre = { debut: maintenant, n: 0 };
  if (verifsAdminFenetre.n >= 20) return false;
  verifsAdminFenetre.n++;

  let ok = false;
  try {
    if (isRealApiConfigured()) {
      const rep = await forwardToAppsScript(
        { method: 'GET', query: {}, headers: { authorization: `Bearer ${token}` } } as any,
        '/auth/verify'
      );
      ok = Boolean(rep && rep.succes === true && rep.donnees && rep.donnees.role === 'ADMIN');
    } else {
      const session = activeTokens[token];
      ok = Boolean(session && session.expires > Date.now() && session.user.role === 'ADMIN');
    }
  } catch {
    ok = false;
  }

  if (adminCache.size >= 500) adminCache.clear();
  adminCache.set(token, { ok, exp: Date.now() + (ok ? 60_000 : 15_000) });
  return ok;
}

function scanSourceForDirectCalls(): Array<{ file: string; line: number; snippet: string }> {
  const results: Array<{ file: string; line: number; snippet: string }> = [];
  const srcDir = path.resolve(__dirname, 'src');

  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (/\.(tsx?|jsx?|html|css)$/.test(entry.name)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n');
          lines.forEach((line, index) => {
            const trimmed = line.trim();
            // Flag genuine direct HTTP network calls from browser
            if (
              trimmed.includes('script.google.com') &&
              !trimmed.includes('VOTRE_DEPLOYMENT_ID') &&
              (trimmed.includes('fetch(') || trimmed.includes('axios') || trimmed.includes('http') || trimmed.includes('XMLHttpRequest'))
            ) {
              results.push({
                file: path.relative(__dirname, fullPath),
                line: index + 1,
                snippet: trimmed
              });
            }
          });
        } catch {
          // ignore read error
        }
      }
    }
  }

  scanDir(srcDir);
  return results;
}

// ============================================================================
// API ROUTES HANDLER (/api/*)
// ============================================================================

app.get('/api/diagnostic/status', async (req: Request, res: Response) => {
  const effectiveUrl = getEffectiveApiUrl();
  const configured = isRealApiConfigured();
  const masked = effectiveUrl ? (effectiveUrl.length > 35 ? effectiveUrl.substring(0, 35) + '...' : effectiveUrl) : '';
  // Le journal du serveur, l'adresse complète d'Apps Script et le détail du code source
  // sont réservés aux administrateurs connectés. Les autres voient seulement l'état général.
  const admin = await estAdministrateur(req);
  res.set('Cache-Control', 'no-store');
  res.json({
    succes: true,
    code: 200,
    donnees: {
      apiUrlServer: admin ? effectiveUrl : masked,
      apiUrlServerMasked: masked,
      isConfigured: configured,
      mode: configured ? 'APPS_SCRIPT_PRODUCTION' : 'SANDBOX_SIMULATION',
      directCalls: admin ? scanSourceForDirectCalls() : [],
      serverLogs: admin ? recentServerLogs.slice(-20) : [],
      journalReserve: !admin
    },
    timestamp: new Date().toISOString()
  });
});

app.get('/api/config', (_req: Request, res: Response) => {
  const effectiveUrl = getEffectiveApiUrl();
  const configured = isRealApiConfigured();
  res.json({
    succes: true,
    code: 200,
    donnees: {
      isConfigured: configured,
      mode: configured ? 'APPS_SCRIPT_PRODUCTION' : 'SANDBOX_SIMULATION',
      apiUrlDisplay: configured ? effectiveUrl.substring(0, 35) + '...' : 'Mode Simulation Intégré',
      version: '1.0.0-PROD'
    },
    timestamp: new Date().toISOString()
  });
});

// ============================================================================
// PUBLIC RADAR TICKER CACHE & ROUTE
// - Cas nominal : transmission à Google Apps Script (/public/radar-ticker).
//   Si l'Apps Script répond avec succès et des données réelles, mise en cache mémoire (TTL 5 min).
// - Cas de repli (API non configurée, route absente ou échec réseau) :
//   Renvoie une réponse explicite (simulation: true, blips: [], métadonnées nulles) sans fabriquer
//   aucun faux avis ni faux chiffre. La réponse de repli n'est JAMAIS mise en cache.
// ============================================================================
interface PublicRadarCache {
  data: any;
  timestamp: number;
}
let publicRadarMemoryCache: PublicRadarCache | null = null;
const PUBLIC_RADAR_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL

app.get('/api/public/radar-ticker', async (_req: Request, res: Response) => {
  if (publicRadarMemoryCache && (Date.now() - publicRadarMemoryCache.timestamp < PUBLIC_RADAR_TTL_MS)) {
    return res.json({
      succes: true,
      code: 200,
      message: "Radar Ticker récupéré du cache (TTL 5 min)",
      donnees: publicRadarMemoryCache.data,
      timestamp: new Date().toISOString()
    });
  }

  if (isRealApiConfigured()) {
    try {
      const apiResponse = await forwardToAppsScript({ method: 'GET', query: {}, headers: {} } as any, '/public/radar-ticker');
      if (apiResponse && apiResponse.succes && apiResponse.donnees) {
        publicRadarMemoryCache = { data: apiResponse.donnees, timestamp: Date.now() };
        return res.json(apiResponse);
      }
    } catch (e) {
      console.warn('[Radar Public Endpoint] Forwarding failed, using fallback empty response:', e);
    }
  }

  return res.json({
    succes: true,
    code: 200,
    message: "Aucun avis public disponible : données d'exemple côté interface.",
    donnees: {
      simulation: true,
      blips: [],
      derniereSynchro: null,
      statutSynchro: null,
      totalAvisAnalysesPeriode: null,
      sourcesOverview: null
    },
    timestamp: new Date().toISOString()
  });
});

// Proxy router for all /api/* requests
app.all('/api/*', async (req: Request, res: Response) => {
  const rawSubPath = req.path.replace(/^\/api/, '');
  const queryRoute = req.query.route as string;
  const bodyRoute = req.body?.route as string;
  const requestedRoute = queryRoute || bodyRoute;
  
  const subPath = (rawSubPath === '/proxy' && requestedRoute)
    ? (requestedRoute.startsWith('/') ? requestedRoute : `/${requestedRoute}`)
    : rawSubPath;

  console.log(`[Proxy] ${req.method} ${subPath} (incoming URL: ${req.originalUrl})`);

  // 1. If real Apps Script URL is set and valid, proxy directly!
  if (isRealApiConfigured()) {
    try {
      const apiResponse = await forwardToAppsScript(req, subPath);
      return res.status(apiResponse.code || 200).json(apiResponse);
    } catch (err: any) {
      console.error(`[API Proxy Error on ${subPath}]:`, err);
      return res.status(502).json({
        succes: false,
        code: 502,
        message: `Erreur de connexion avec l'API Google Apps Script : ${err.message || 'Délai d’attente dépassé'}`,
        donnees: null,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Ping route for connectivity testing
  if (subPath === '/ping') {
    return res.json({
      succes: true,
      code: 200,
      message: "PONG - API opérationnelle",
      donnees: {
        status: "UP",
        timestamp: new Date().toISOString(),
        version: "1.0.0"
      },
      timestamp: new Date().toISOString()
    });
  }

  // 2. Otherwise execute local mock engine for full out-of-the-box experience
  const token = (req.headers.authorization?.replace(/^Bearer /, '') || (req.query.token as string) || (req.body?.token as string)) as string;
  let currentUser: MockUser | null = null;
  if (token && activeTokens[token]) {
    currentUser = activeTokens[token].user;
  }

  // ROUTE: POST /auth/login
  if (subPath === '/auth/login' && req.method === 'POST') {
    const { email, motDePasse } = req.body;
    const user = mockUsers.find(u => u.email.toLowerCase() === (email || '').toLowerCase().trim());

    if (!user || user.motDePasse !== motDePasse) {
      return res.status(401).json({
        succes: false,
        code: 401,
        message: "Identifiants invalides. Vérifiez votre adresse email et mot de passe.",
        donnees: null,
        timestamp: new Date().toISOString()
      });
    }

    if (user.actif !== 'OUI') {
      return res.status(403).json({
        succes: false,
        code: 403,
        message: "Votre compte est désactivé. Veuillez contacter l'administrateur.",
        donnees: null,
        timestamp: new Date().toISOString()
      });
    }

    const genToken = `tok_${user.role.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    activeTokens[genToken] = {
      user,
      expires: Date.now() + 7 * 24 * 3600 * 1000
    };

    return res.json({
      succes: true,
      code: 200,
      message: "Connexion réussie",
      donnees: {
        idUser: user.idUser,
        email: user.email,
        nom: user.nom,
        telephone: user.telephone,
        role: user.role,
        idClient: user.idClient,
        langue: user.langue,
        token: genToken,
        expiration: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
      },
      timestamp: new Date().toISOString()
    });
  }

  // ROUTE: POST /auth/register
  if (subPath === '/auth/register' && req.method === 'POST') {
    const { email, motDePasse, nom, telephone, langue } = req.body;
    if (!email || !motDePasse || !nom) {
      return res.status(400).json({
        succes: false,
        code: 400,
        message: "Email, mot de passe et nom sont obligatoires.",
        donnees: null,
        timestamp: new Date().toISOString()
      });
    }

    const existing = mockUsers.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
    if (existing) {
      return res.status(400).json({
        succes: false,
        code: 400,
        message: "Un compte existe déjà avec cette adresse email.",
        donnees: null,
        timestamp: new Date().toISOString()
      });
    }

    // Create client & user
    const newClientId = `CLI-00${mockClients.length + 1}`;
    const newClient: MockClient = {
      idClient: newClientId,
      nom: nom.toUpperCase(),
      emailDestinataire: email,
      regions: ['Centre', 'Littoral'],
      procedures: ['AOO', 'AON', 'DC'],
      montantMinimum: 20000000,
      seuilScore: 70,
      promptMetier: `Entreprise ${nom} opérant au Cameroun.`,
      siteWeb: '',
      moPrioritaires: ['MINTP', 'FEICOM'],
      actif: 'OUI',
      dateCreation: new Date().toISOString(),
      profilIA: {
        inclusions: ['Prestations de services', 'Fournitures', 'Travaux'],
        exclusions: [],
        motsClesCles: [nom],
        secteursCibles: ['Divers'],
        dernierCalcul: new Date().toISOString()
      }
    };
    mockClients.push(newClient);

    const newUser: MockUser = {
      idUser: `USR-CLI-0${mockUsers.length + 1}`,
      email: email.toLowerCase().trim(),
      motDePasse,
      nom,
      telephone: telephone || '',
      role: 'CLIENT',
      idClient: newClientId,
      langue: langue || 'fr',
      actif: 'OUI',
      dateCreation: new Date().toISOString()
    };
    mockUsers.push(newUser);

    const genToken = `tok_cli_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    activeTokens[genToken] = {
      user: newUser,
      expires: Date.now() + 7 * 24 * 3600 * 1000
    };

    return res.json({
      succes: true,
      code: 200,
      message: "Inscription réussie",
      donnees: {
        idUser: newUser.idUser,
        email: newUser.email,
        nom: newUser.nom,
        role: newUser.role,
        idClient: newUser.idClient,
        token: genToken,
        expiration: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
      },
      timestamp: new Date().toISOString()
    });
  }

  // ROUTE: GET /auth/verify
  if (subPath === '/auth/verify' && req.method === 'GET') {
    if (!currentUser) {
      return res.status(401).json({
        succes: false,
        code: 401,
        message: "Token invalide ou expiré.",
        donnees: null,
        timestamp: new Date().toISOString()
      });
    }

    return res.json({
      succes: true,
      code: 200,
      message: "Session valide",
      donnees: {
        idUser: currentUser.idUser,
        email: currentUser.email,
        nom: currentUser.nom,
        telephone: currentUser.telephone,
        role: currentUser.role,
        idClient: currentUser.idClient,
        langue: currentUser.langue,
        expiration: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
      },
      timestamp: new Date().toISOString()
    });
  }

  // ROUTE: POST /auth/logout
  if (subPath === '/auth/logout' && req.method === 'POST') {
    if (token && activeTokens[token]) {
      delete activeTokens[token];
    }
    return res.json({
      succes: true,
      code: 200,
      message: "Déconnexion effectuée",
      donnees: null,
      timestamp: new Date().toISOString()
    });
  }

  // ==========================
  // AUTH GUARD FOR PROTECTED
  // ==========================
  if (!currentUser) {
    return res.status(401).json({
      succes: false,
      code: 401,
      message: "Accès refusé. Veuillez vous connecter.",
      donnees: null,
      timestamp: new Date().toISOString()
    });
  }

  // ============================================================================
  // CLIENT ROUTES
  // ============================================================================

  // GET /client/profile
  if (subPath === '/client/profile' && req.method === 'GET') {
    const client = mockClients.find(c => c.idClient === (currentUser?.idClient || 'CLI-001')) || mockClients[0];
    return res.json({
      succes: true,
      code: 200,
      donnees: {
        ...client,
        preferences: mockPreferences
      },
      timestamp: new Date().toISOString()
    });
  }

  // POST /client/profile/update
  if (subPath === '/client/profile/update' && req.method === 'POST') {
    const client = mockClients.find(c => c.idClient === (currentUser?.idClient || 'CLI-001')) || mockClients[0];
    const { nom, emailDestinataire, regions, procedures, montantMinimum, seuilScore } = req.body;
    if (nom) client.nom = nom;
    if (emailDestinataire) client.emailDestinataire = emailDestinataire;
    if (regions) client.regions = regions;
    if (procedures) client.procedures = procedures;
    if (montantMinimum !== undefined) client.montantMinimum = Number(montantMinimum);
    if (seuilScore !== undefined) client.seuilScore = Number(seuilScore);

    return res.json({
      succes: true,
      code: 200,
      message: "Profil client mis à jour avec succès",
      donnees: client,
      timestamp: new Date().toISOString()
    });
  }

  // POST /client/profile/prompt
  if (subPath === '/client/profile/prompt' && req.method === 'POST') {
    const client = mockClients.find(c => c.idClient === (currentUser?.idClient || 'CLI-001')) || mockClients[0];
    client.promptMetier = req.body.promptMetier || client.promptMetier;
    return res.json({
      succes: true,
      code: 200,
      message: "Prompt métier enregistré",
      donnees: client,
      timestamp: new Date().toISOString()
    });
  }

  // POST /client/profile/site
  if (subPath === '/client/profile/site' && req.method === 'POST') {
    const client = mockClients.find(c => c.idClient === (currentUser?.idClient || 'CLI-001')) || mockClients[0];
    client.siteWeb = req.body.siteWeb || client.siteWeb;
    return res.json({
      succes: true,
      code: 200,
      message: "Site web enregistré",
      donnees: client,
      timestamp: new Date().toISOString()
    });
  }

  // POST /client/profile/regenerate
  if (subPath === '/client/profile/regenerate' && req.method === 'POST') {
    const client = mockClients.find(c => c.idClient === (currentUser?.idClient || 'CLI-001')) || mockClients[0];
    client.profilIA = {
      inclusions: ['Travaux spécialisés BTP', 'Génie civil lourd', 'Infrastructures hydrauliques', 'Voiries urbaines & bitumage'],
      exclusions: ['Prestations intellectuelles pures', 'Gardiennage', 'Fournitures de bureau'],
      motsClesCles: ['BTP', 'Drainage', 'Chaussée', 'Génie Civil', 'MINTP', 'CUD'],
      secteursCibles: ['Bâtiment & Travaux Publics', 'Voirie et Réseaux Divers'],
      dernierCalcul: new Date().toISOString()
    };
    return res.json({
      succes: true,
      code: 200,
      message: "Profil IA réanalysé et régénéré avec succès",
      donnees: client,
      timestamp: new Date().toISOString()
    });
  }

  // GET & POST /client/preferences
  if (subPath === '/client/preferences') {
    if (req.method === 'GET') {
      return res.json({
        succes: true,
        code: 200,
        donnees: mockPreferences,
        timestamp: new Date().toISOString()
      });
    }
    if (req.method === 'POST') {
      Object.assign(mockPreferences, req.body);
      return res.json({
        succes: true,
        code: 200,
        message: "Préférences de notifications enregistrées",
        donnees: mockPreferences,
        timestamp: new Date().toISOString()
      });
    }
  }

  // POST /client/account/update
  if (subPath === '/client/account/update' && req.method === 'POST') {
    const { nom, telephone, langue } = req.body;
    if (nom) currentUser.nom = nom;
    if (telephone !== undefined) currentUser.telephone = telephone;
    if (langue) currentUser.langue = langue;

    return res.json({
      succes: true,
      code: 200,
      message: "Compte utilisateur mis à jour",
      donnees: currentUser,
      timestamp: new Date().toISOString()
    });
  }

  // POST /client/account/password
  if (subPath === '/client/account/password' && req.method === 'POST') {
    const { ancienMotDePasse, nouveauMotDePasse } = req.body;
    if (currentUser.motDePasse !== ancienMotDePasse) {
      return res.status(400).json({
        succes: false,
        code: 400,
        message: "L'ancien mot de passe est incorrect.",
        donnees: null,
        timestamp: new Date().toISOString()
      });
    }
    currentUser.motDePasse = nouveauMotDePasse;
    return res.json({
      succes: true,
      code: 200,
      message: "Mot de passe modifié avec succès",
      donnees: null,
      timestamp: new Date().toISOString()
    });
  }

  // GET /client/alerts
  if (subPath === '/client/alerts' && req.method === 'GET') {
    const { statut, etat, lu, region, procedure, scoreMin, search, sortBy, sortOrder } = req.query;
    let clientId = currentUser.idClient || 'CLI-001';

    let filtered = mockAlerts.filter(a => a.idClient === clientId);

    if (statut) filtered = filtered.filter(a => a.statut === statut);
    if (etat) filtered = filtered.filter(a => a.etat === etat);
    if (lu !== undefined && lu !== '') filtered = filtered.filter(a => a.lu === (lu === 'true'));
    if (region) filtered = filtered.filter(a => a.region === region);
    if (procedure) filtered = filtered.filter(a => a.procedure === procedure);
    if (scoreMin) filtered = filtered.filter(a => a.scoreMatch >= Number(scoreMin));
    if (search) {
      const q = String(search).toLowerCase();
      filtered = filtered.filter(a => 
        a.titre.toLowerCase().includes(q) ||
        a.maitreOuvrage.toLowerCase().includes(q) ||
        a.idAvis.toLowerCase().includes(q)
      );
    }

    if (sortBy === 'scoreMatch') {
      filtered.sort((a, b) => sortOrder === 'asc' ? a.scoreMatch - b.scoreMatch : b.scoreMatch - a.scoreMatch);
    } else if (sortBy === 'dateLimite') {
      filtered.sort((a, b) => sortOrder === 'asc' ? new Date(a.dateLimite).getTime() - new Date(b.dateLimite).getTime() : new Date(b.dateLimite).getTime() - new Date(a.dateLimite).getTime());
    } else {
      filtered.sort((a, b) => new Date(b.datePublication).getTime() - new Date(a.datePublication).getTime());
    }

    const limit = Number(req.query.limit) || 20;
    const offset = Number(req.query.offset) || 0;
    const paginated = filtered.slice(offset, offset + limit);

    return res.json({
      succes: true,
      code: 200,
      donnees: {
        total: filtered.length,
        limit,
        offset,
        count: paginated.length,
        alertes: paginated
      },
      timestamp: new Date().toISOString()
    });
  }

  // GET /client/alerts/count
  if (subPath === '/client/alerts/count' && req.method === 'GET') {
    const clientId = currentUser.idClient || 'CLI-001';
    const alerts = mockAlerts.filter(a => a.idClient === clientId);
    return res.json({
      succes: true,
      code: 200,
      donnees: {
        total: alerts.length,
        nonLues: alerts.filter(a => !a.lu).length,
        nouveaux: alerts.filter(a => a.etat === 'NOUVEAU').length,
        traites: alerts.filter(a => a.etat === 'TRAITE').length,
        ignores: alerts.filter(a => a.etat === 'IGNORE').length,
        sauvegardes: alerts.filter(a => a.etat === 'SAUVEGARDE').length
      },
      timestamp: new Date().toISOString()
    });
  }

  // GET /client/alerts/detail
  if (subPath === '/client/alerts/detail' && req.method === 'GET') {
    const idMatch = req.query.idMatch as string;
    const alert = mockAlerts.find(a => a.idMatch === idMatch);
    if (!alert) {
      return res.status(404).json({
        succes: false,
        code: 404,
        message: "Alerte introuvable",
        donnees: null,
        timestamp: new Date().toISOString()
      });
    }
    alert.lu = true;
    return res.json({
      succes: true,
      code: 200,
      donnees: alert,
      timestamp: new Date().toISOString()
    });
  }

  // POST /client/alerts/mark
  if (subPath === '/client/alerts/mark' && req.method === 'POST') {
    const { idMatch, etat, note } = req.body;
    const alert = mockAlerts.find(a => a.idMatch === idMatch);
    if (!alert) {
      return res.status(404).json({
        succes: false,
        code: 404,
        message: "Alerte introuvable",
        donnees: null,
        timestamp: new Date().toISOString()
      });
    }
    if (etat) alert.etat = etat;
    if (note !== undefined) alert.noteClient = note;
    alert.lu = true;

    return res.json({
      succes: true,
      code: 200,
      message: "Statut de l'alerte mis à jour",
      donnees: alert,
      timestamp: new Date().toISOString()
    });
  }

  // POST /client/alerts/export
  if (subPath === '/client/alerts/export' && req.method === 'POST') {
    const clientId = currentUser.idClient || 'CLI-001';
    const alerts = mockAlerts.filter(a => a.idClient === clientId);
    
    let csv = "ID Avis;Titre;Maître d'Ouvrage;Région;Procédure;Montant Estimé FCFA;Date Limite;Score IA;Statut;Etat;Note\n";
    alerts.forEach(a => {
      csv += `"${a.idAvis}";"${a.titre.replace(/"/g, '""')}";"${a.maitreOuvrage}";"${a.region}";"${a.procedure}";${a.montantEstime};"${a.dateLimite}";${a.scoreMatch};"${a.statut}";"${a.etat}";"${(a.noteClient || '').replace(/"/g, '""')}"\n`;
    });

    return res.json({
      succes: true,
      code: 200,
      donnees: {
        format: 'csv',
        nomFichier: `export-alertes-cameroun-${new Date().toISOString().split('T')[0]}.csv`,
        count: alerts.length,
        contenu: csv
      },
      timestamp: new Date().toISOString()
    });
  }

  // CLIENT STATS
  if (subPath.startsWith('/client/stats/')) {
    if (subPath === '/client/stats/dashboard') {
      const clientId = currentUser.idClient || 'CLI-001';
      const alerts = mockAlerts.filter(a => a.idClient === clientId);
      const avgScore = alerts.length ? Math.round(alerts.reduce((s, a) => s + a.scoreMatch, 0) / alerts.length) : 0;
      
      return res.json({
        succes: true,
        code: 200,
        donnees: {
          totalAlertes: alerts.length,
          nonLues: alerts.filter(a => !a.lu).length,
          traitees: alerts.filter(a => a.etat === 'TRAITE').length,
          sauvegardees: alerts.filter(a => a.etat === 'SAUVEGARDE').length,
          scoreMoyen: avgScore,
          prochaineEcheance: '2026-10-12T10:00:00Z',
          montantTotalCible: alerts.reduce((sum, a) => sum + a.montantEstime, 0)
        },
        timestamp: new Date().toISOString()
      });
    }

    if (subPath === '/client/stats/by-region') {
      return res.json({
        succes: true,
        code: 200,
        donnees: [
          { region: 'Littoral', count: 2, montantTotal: 1560000000 },
          { region: 'Centre', count: 2, montantTotal: 282000000 },
          { region: 'Ouest', count: 1, montantTotal: 385000000 },
          { region: 'Sud', count: 2, montantTotal: 187000000 },
          { region: 'Nord', count: 0, montantTotal: 0 },
          { region: 'Adamaoua', count: 0, montantTotal: 0 }
        ],
        timestamp: new Date().toISOString()
      });
    }

    if (subPath === '/client/stats/by-procedure') {
      return res.json({
        succes: true,
        code: 200,
        donnees: [
          { procedure: 'AON', label: 'Appel d’Offres National', count: 3, percentage: 43 },
          { procedure: 'AOO', label: 'Appel d’Offres Ouvert', count: 1, percentage: 14 },
          { procedure: 'AOI', label: 'Appel d’Offres International', count: 1, percentage: 14 },
          { procedure: 'DC', label: 'Demande de Cotation', count: 1, percentage: 14 },
          { procedure: 'ASMI', label: 'Manifestation d’Intérêt', count: 1, percentage: 14 }
        ],
        timestamp: new Date().toISOString()
      });
    }

    if (subPath === '/client/stats/timeline') {
      return res.json({
        succes: true,
        code: 200,
        donnees: [
          { date: '2026-09-20', alertes: 1, scoreMoyen: 85 },
          { date: '2026-09-21', alertes: 0, scoreMoyen: 0 },
          { date: '2026-09-22', alertes: 1, scoreMoyen: 96 },
          { date: '2026-09-23', alertes: 0, scoreMoyen: 0 },
          { date: '2026-09-24', alertes: 2, scoreMoyen: 90 },
          { date: '2026-09-25', alertes: 1, scoreMoyen: 78 },
          { date: '2026-09-26', alertes: 1, scoreMoyen: 91 },
          { date: '2026-09-27', alertes: 1, scoreMoyen: 94 }
        ],
        timestamp: new Date().toISOString()
      });
    }

    if (subPath === '/client/stats/top-mo') {
      return res.json({
        succes: true,
        code: 200,
        donnees: [
          { nom: 'Port Autonome de Douala', avisCount: 1, montantCumule: 940000000 },
          { nom: 'Communauté Urbaine de Douala', avisCount: 1, montantCumule: 620000000 },
          { nom: 'Ministère des Travaux Publics', avisCount: 1, montantCumule: 385000000 },
          { nom: 'MINDCAF', avisCount: 1, montantCumule: 210000000 },
          { nom: 'FEICOM', avisCount: 1, montantCumule: 145000000 }
        ],
        timestamp: new Date().toISOString()
      });
    }
  }

  // ============================================================================
  // ADMIN ROUTES (Guarded by role === 'ADMIN')
  // ============================================================================
  if (subPath.startsWith('/admin')) {
    if (currentUser.role !== 'ADMIN') {
      return res.status(403).json({
        succes: false,
        code: 403,
        message: "Accès interdit. Cette ressource requiert le rôle ADMINISTRATEUR.",
        donnees: null,
        timestamp: new Date().toISOString()
      });
    }

    // GET /admin/stats
    if (subPath === '/admin/stats' && req.method === 'GET') {
      return res.json({
        succes: true,
        code: 200,
        donnees: {
          clients: { total: 2, actifs: 2 },
          utilisateurs: { total: 1, actifs: 1 },
          avis: { total: 293, enCours: 142 },
          alertes: { total: 65, nonLues: 12 },
          totalClients: 2,
          clientsActifs: 2,
          totalUtilisateurs: 1,
          totalAvisScrapes: 293,
          totalAlertesGenerees: 65,
          sessionsActives: mockSessions.filter(s => s.actif === 'OUI').length,
          tauxMatchMoyen: '78.4%',
          quotas: {
            geminiAi: { utilise: 18450, total: 100000, pourcentage: 18.4, status: 'NOMINAL' },
            gmailApi: { utilise: 342, total: 2000, pourcentage: 17.1, status: 'NOMINAL' },
            whatsappApi: { utilise: 89, total: 1000, pourcentage: 8.9, status: 'NOMINAL' }
          }
        },
        timestamp: new Date().toISOString()
      });
    }

    // GET /admin/clients
    if (subPath === '/admin/clients' && req.method === 'GET') {
      const { search, actif } = req.query;
      let clients = [...mockClients];
      if (actif) clients = clients.filter(c => c.actif === actif);
      if (search) {
        const q = String(search).toLowerCase();
        clients = clients.filter(c => c.nom.toLowerCase().includes(q) || c.emailDestinataire.toLowerCase().includes(q));
      }
      return res.json({
        succes: true,
        code: 200,
        donnees: {
          total: clients.length,
          clients
        },
        timestamp: new Date().toISOString()
      });
    }

    // GET /admin/clients/detail
    if (subPath === '/admin/clients/detail' && req.method === 'GET') {
      const idClient = req.query.idClient as string;
      const client = mockClients.find(c => c.idClient === idClient);
      if (!client) {
        return res.status(404).json({
          succes: false,
          code: 404,
          message: "Client introuvable",
          donnees: null,
          timestamp: new Date().toISOString()
        });
      }
      const clientWithBilling = {
        ...client,
        abonnement: client.abonnement || {
          idAbonnement: `SUB-${client.idClient}-2026`,
          idClient: client.idClient,
          plan: 'PREMIUM BUSINESS',
          dateDebut: client.dateCreation || '2026-01-01T00:00:00Z',
          dateFin: '2026-12-31T23:59:59Z',
          statut: client.actif === 'OUI' ? 'ACTIF' : 'SUSPENDU',
          montantFCFA: 125000,
          modePaiement: 'Orange Money / MTN MoMo (+237)',
          reference: `CTR-VEILLE-${client.idClient}`,
          statutPaiement: client.actif === 'OUI' ? 'A_JOUR' : 'EN_RETARD',
          periodicite: 'MENSUEL',
          quotaAlertesMois: 200,
          alertesConsommeesMois: 68
        },
        factures: client.factures || [
          {
            idFacture: `FAC-2026-${client.idClient.replace(/\D/g, '') || '01'}09`,
            idAbonnement: `SUB-${client.idClient}-2026`,
            idClient: client.idClient,
            dateEmission: '2026-09-01T08:00:00Z',
            periode: '01/09/2026 au 30/09/2026',
            montantFCFA: 125000,
            statut: 'PAYEE',
            modePaiement: 'Orange Money Web'
          },
          {
            idFacture: `FAC-2026-${client.idClient.replace(/\D/g, '') || '01'}08`,
            idAbonnement: `SUB-${client.idClient}-2026`,
            idClient: client.idClient,
            dateEmission: '2026-08-01T08:00:00Z',
            periode: '01/08/2026 au 31/08/2026',
            montantFCFA: 125000,
            statut: 'PAYEE',
            modePaiement: 'MTN Mobile Money'
          }
        ]
      };
      return res.json({
        succes: true,
        code: 200,
        donnees: clientWithBilling,
        timestamp: new Date().toISOString()
      });
    }

    // POST /admin/clients/create
    if (subPath === '/admin/clients/create' && req.method === 'POST') {
      const { nom, emailDestinataire, regions, procedures, montantMinimum, seuilScore, promptMetier, siteWeb, moPrioritaires, casUsageReference, genererProfilIA } = req.body;
      const newId = `CLI-00${mockClients.length + 1}`;
      const newClient: MockClient = {
        idClient: newId,
        nom: nom || 'NOUVEAU CLIENT',
        emailDestinataire: emailDestinataire || '',
        regions: regions || ['Centre', 'Littoral'],
        procedures: procedures || ['AOO', 'AON'],
        montantMinimum: Number(montantMinimum) || 20000000,
        seuilScore: Number(seuilScore) || 70,
        promptMetier: promptMetier || '',
        siteWeb: siteWeb || '',
        moPrioritaires: moPrioritaires || [],
        casUsageReference: casUsageReference || '',
        actif: 'OUI',
        dateCreation: new Date().toISOString(),
        profilIA: genererProfilIA ? {
          inclusions: ['Prestations techniques', 'Marchés publics ciblés'],
          exclusions: ['Fournitures non reliées'],
          motsClesCles: [(nom || '').split(' ')[0]],
          secteursCibles: ['Général'],
          dernierCalcul: new Date().toISOString()
        } : undefined
      };
      mockClients.push(newClient);

      mockAuditLogs.unshift({
        id: `AUD-${Date.now().toString().slice(-4)}`,
        timestamp: new Date().toISOString(),
        email: currentUser.email,
        role: 'ADMIN',
        action: 'CLIENT_CREATE',
        details: `Création du client ${newId} (${newClient.nom})`,
        ip: req.ip || '127.0.0.1',
        succes: true
      });

      return res.json({
        succes: true,
        code: 200,
        message: "Client créé avec succès",
        donnees: newClient,
        timestamp: new Date().toISOString()
      });
    }

    // POST /admin/clients/update
    if (subPath === '/admin/clients/update' && req.method === 'POST') {
      const { idClient, ...updates } = req.body;
      const client = mockClients.find(c => c.idClient === idClient);
      if (!client) {
        return res.status(404).json({
          succes: false,
          code: 404,
          message: "Client introuvable",
          donnees: null,
          timestamp: new Date().toISOString()
        });
      }
      Object.assign(client, updates);
      return res.json({
        succes: true,
        code: 200,
        message: "Client mis à jour",
        donnees: client,
        timestamp: new Date().toISOString()
      });
    }

    // POST /admin/clients/update-ia-profile
    if (subPath === '/admin/clients/update-ia-profile' && req.method === 'POST') {
      const { idClient, motsClesInclusion, motsClesExclusion, moPrioritaires } = req.body;
      const client = mockClients.find(c => c.idClient === idClient);
      if (!client) {
        return res.status(404).json({
          succes: false,
          code: 404,
          message: "Client introuvable",
          donnees: null,
          timestamp: new Date().toISOString()
        });
      }
      if (!client.profilIA) {
        client.profilIA = {
          inclusions: [],
          exclusions: [],
          motsClesCles: [],
          secteursCibles: [],
          dernierCalcul: new Date().toISOString()
        };
      }
      client.profilIA.inclusions = motsClesInclusion || client.profilIA.inclusions;
      client.profilIA.exclusions = motsClesExclusion || client.profilIA.exclusions;
      client.moPrioritaires = moPrioritaires || client.moPrioritaires;
      client.profilIA.dernierCalcul = new Date().toISOString();

      return res.json({
        succes: true,
        code: 200,
        message: "Profil IA mis à jour avec succès",
        donnees: {
          idClient,
          modifie: ['inclusions', 'exclusions', 'moPrioritaires']
        },
        timestamp: new Date().toISOString()
      });
    }

    // POST /admin/clients/toggle-cascade
    if (subPath === '/admin/clients/toggle-cascade' && req.method === 'POST') {
      const { idClient, actif } = req.body;
      const client = mockClients.find(c => c.idClient === idClient);
      if (!client) {
        return res.status(404).json({
          succes: false,
          code: 404,
          message: "Client introuvable",
          donnees: null,
          timestamp: new Date().toISOString()
        });
      }
      const newStatus = actif || (client.actif === 'OUI' ? 'NON' : 'OUI');
      client.actif = newStatus;

      // Cascade to linked users
      let nbUsersModifies = 0;
      let nbSessionsInvalidees = 0;
      mockUsers.forEach(u => {
        if (u.idClient === idClient) {
          u.actif = newStatus;
          nbUsersModifies++;
          // Invalidate user sessions if deactivated
          if (newStatus === 'NON') {
            mockSessions.forEach(s => {
              if (s.idUser === u.idUser) {
                s.actif = 'NON';
                nbSessionsInvalidees++;
              }
            });
          }
        }
      });

      return res.json({
        succes: true,
        code: 200,
        message: `Client ${idClient} ${newStatus === 'OUI' ? 'activé' : 'désactivé'} avec succès`,
        donnees: {
          idClient,
          actif: newStatus,
          nbUsersModifies,
          nbSessionsInvalidees
        },
        timestamp: new Date().toISOString()
      });
    }

    // GET /admin/clients/alerts
    if (subPath === '/admin/clients/alerts' && req.method === 'GET') {
      const idClient = req.query.idClient as string;
      const limit = Number(req.query.limit) || 25;
      const offset = Number(req.query.offset) || 0;
      const statut = req.query.statut as string;
      const scoreMin = req.query.scoreMin !== undefined ? Number(req.query.scoreMin) : undefined;
      const search = (req.query.search as string || '').toLowerCase();

      let clientAlerts = mockAlerts.filter(a => !idClient || a.idClient === idClient);
      if (statut && statut !== 'TOUS') {
        clientAlerts = clientAlerts.filter(a => a.statut === statut || a.etat === statut);
      }
      if (scoreMin !== undefined && !isNaN(scoreMin)) {
        clientAlerts = clientAlerts.filter(a => {
          // Normalize score to 1-5 scale if stored as 0-100
          const sc = a.scoreMatch > 5 ? (a.scoreMatch / 20) : a.scoreMatch;
          return sc >= scoreMin;
        });
      }
      if (search) {
        clientAlerts = clientAlerts.filter(a =>
          a.titre.toLowerCase().includes(search) ||
          a.idAvis.toLowerCase().includes(search) ||
          a.maitreOuvrage.toLowerCase().includes(search)
        );
      }

      const total = clientAlerts.length;
      const paged = clientAlerts.slice(offset, offset + limit).map(a => ({
        idMatch: a.idMatch,
        idAO: a.idAvis,
        numeroAvis: a.idAvis,
        idClient: a.idClient,
        nomClient: mockClients.find(c => c.idClient === a.idClient)?.nom || 'Client',
        emailDestinataire: mockClients.find(c => c.idClient === a.idClient)?.emailDestinataire || '',
        dateMatch: a.datePublication,
        statut: a.statut === 'DISPONIBLE' ? 'ENVOYÉ' : 'EN_ATTENTE',
        dateEnvoi: a.datePublication,
        score: a.scoreMatch > 5 ? Number((a.scoreMatch / 20).toFixed(1)) : a.scoreMatch,
        justification: a.justificationIA,
        scoreMots: 4.2,
        scoreIA: 4.5,
        titre: a.titre,
        maitreOuvrage: a.maitreOuvrage,
        region: a.region,
        montant: a.montantEstime,
        dateLimite: a.dateLimite,
        lienDetail: `/alertes/${a.idMatch}`,
        lienDAO: a.lienDao || 'https://armp.cm/daos'
      }));

      return res.json({
        succes: true,
        code: 200,
        donnees: {
          total,
          limit,
          offset,
          count: paged.length,
          alertes: paged
        },
        timestamp: new Date().toISOString()
      });
    }

    // GET /admin/clients/cache-ia
    if (subPath === '/admin/clients/cache-ia' && req.method === 'GET') {
      const idClient = req.query.idClient as string;
      const limit = Number(req.query.limit) || 50;
      const offset = Number(req.query.offset) || 0;

      const evaluations = mockAlerts.map((a, i) => ({
        idAO: a.idAvis,
        idClient: idClient || a.idClient,
        noteIA: Number((3.5 + (i % 3) * 0.5).toFixed(1)),
        motif: `Évaluation Gemini : ${a.justificationIA}`,
        dateEval: a.datePublication
      })).slice(offset, offset + limit);

      return res.json({
        succes: true,
        code: 200,
        donnees: {
          total: evaluations.length,
          evaluations
        },
        timestamp: new Date().toISOString()
      });
    }

    // GET /admin/clients/audit
    if (subPath === '/admin/clients/audit' && req.method === 'GET') {
      const idClient = req.query.idClient as string;
      const limit = Number(req.query.limit) || 50;
      const offset = Number(req.query.offset) || 0;

      const clientLogs = mockAuditLogs.filter(l => 
        !idClient || l.details.includes(idClient) || (idClient === 'CLI-001' && l.role === 'CLIENT')
      );

      return res.json({
        succes: true,
        code: 200,
        donnees: {
          total: clientLogs.length,
          logs: clientLogs.slice(offset, offset + limit).map(l => ({
            timestamp: l.timestamp,
            idUser: 'USR-001',
            email: l.email,
            role: l.role,
            action: l.action,
            details: l.details,
            ip: l.ip,
            succes: l.succes
          }))
        },
        timestamp: new Date().toISOString()
      });
    }

    // GET /admin/clients/preferences
    if (subPath === '/admin/clients/preferences' && req.method === 'GET') {
      const idClient = req.query.idClient as string;
      return res.json({
        succes: true,
        code: 200,
        donnees: {
          idClient: idClient || 'CLI-001',
          notifEmail: mockPreferences.notifEmail,
          notifWhatsApp: mockPreferences.notifWhatsApp,
          notifInApp: mockPreferences.notifInApp,
          whatsappNumero: mockPreferences.whatsappNumero,
          frequence: mockPreferences.frequence,
          frequenceDigest: mockPreferences.frequence as any,
          heurePreferee: mockPreferences.heurePreferee,
          langue: mockPreferences.langue,
          ligne: 2
        },
        timestamp: new Date().toISOString()
      });
    }

    // POST /admin/clients/preferences
    if (subPath === '/admin/clients/preferences' && req.method === 'POST') {
      const { idClient, notifEmail, notifWhatsApp, notifInApp, whatsappNumero, frequenceDigest, heurePreferee, langue } = req.body;
      if (notifEmail !== undefined) mockPreferences.notifEmail = Boolean(notifEmail);
      if (notifWhatsApp !== undefined) mockPreferences.notifWhatsApp = Boolean(notifWhatsApp);
      if (notifInApp !== undefined) mockPreferences.notifInApp = Boolean(notifInApp);
      if (whatsappNumero !== undefined) mockPreferences.whatsappNumero = whatsappNumero;
      if (frequenceDigest !== undefined) mockPreferences.frequence = frequenceDigest;
      if (heurePreferee !== undefined) mockPreferences.heurePreferee = heurePreferee;
      if (langue !== undefined) mockPreferences.langue = langue;

      return res.json({
        succes: true,
        code: 200,
        message: "Préférences client enregistrées avec succès",
        donnees: {
          idClient: idClient || 'CLI-001',
          notifEmail: mockPreferences.notifEmail,
          notifWhatsApp: mockPreferences.notifWhatsApp,
          notifInApp: mockPreferences.notifInApp,
          whatsappNumero: mockPreferences.whatsappNumero,
          frequence: mockPreferences.frequence,
          heurePreferee: mockPreferences.heurePreferee,
          langue: mockPreferences.langue,
          ligne: 2
        },
        timestamp: new Date().toISOString()
      });
    }

    // POST /admin/clients/toggle
    if (subPath === '/admin/clients/toggle' && req.method === 'POST') {
      const { idClient, actif } = req.body;
      const client = mockClients.find(c => c.idClient === idClient);
      if (!client) {
        return res.status(404).json({
          succes: false,
          code: 404,
          message: "Client introuvable",
          donnees: null,
          timestamp: new Date().toISOString()
        });
      }
      client.actif = actif || (client.actif === 'OUI' ? 'NON' : 'OUI');
      return res.json({
        succes: true,
        code: 200,
        message: `Client ${client.actif === 'OUI' ? 'activé' : 'désactivé'}`,
        donnees: client,
        timestamp: new Date().toISOString()
      });
    }

    // POST /admin/clients/regenerate
    if (subPath === '/admin/clients/regenerate' && req.method === 'POST') {
      const { idClient } = req.body;
      const client = mockClients.find(c => c.idClient === idClient);
      if (!client) {
        return res.status(404).json({
          succes: false,
          code: 404,
          message: "Client introuvable",
          donnees: null,
          timestamp: new Date().toISOString()
        });
      }
      client.profilIA = {
        inclusions: ['Lots techniques majeurs', 'Marchés prioritaires Cameroun', 'Offres directes'],
        exclusions: ['Lots hors compétence', 'Petits achats sous-traités'],
        motsClesCles: ['Marché Public', 'ARMP', client.nom.split(' ')[0]],
        secteursCibles: ['Ingénierie & Services Spécialisés'],
        dernierCalcul: new Date().toISOString()
      };
      return res.json({
        succes: true,
        code: 200,
        message: "Profil IA du client régénéré",
        donnees: client,
        timestamp: new Date().toISOString()
      });
    }

    // GET /admin/users
    if (subPath === '/admin/users' && req.method === 'GET') {
      const { role, actif, search } = req.query;
      let users = [...mockUsers];
      if (role) users = users.filter(u => u.role === role);
      if (actif) users = users.filter(u => u.actif === actif);
      if (search) {
        const q = String(search).toLowerCase();
        users = users.filter(u => u.email.toLowerCase().includes(q) || u.nom.toLowerCase().includes(q));
      }
      return res.json({
        succes: true,
        code: 200,
        donnees: {
          total: users.length,
          users: users.map(u => ({ ...u, motDePasse: '••••••••' }))
        },
        timestamp: new Date().toISOString()
      });
    }

    // POST /admin/users/create
    if (subPath === '/admin/users/create' && req.method === 'POST') {
      const { email, motDePasse, nom, telephone, role, idClient } = req.body;
      const newUser: MockUser = {
        idUser: `USR-${(role || 'CLI').toUpperCase()}-0${mockUsers.length + 1}`,
        email: (email || '').toLowerCase().trim(),
        motDePasse: motDePasse || 'DefaultPass2026',
        nom: nom || 'Nouvel Utilisateur',
        telephone: telephone || '',
        role: role || 'CLIENT',
        idClient: idClient || undefined,
        langue: 'fr',
        actif: 'OUI',
        dateCreation: new Date().toISOString()
      };
      mockUsers.push(newUser);
      return res.json({
        succes: true,
        code: 200,
        message: "Utilisateur créé",
        donnees: { ...newUser, motDePasse: '••••••••' },
        timestamp: new Date().toISOString()
      });
    }

    // POST /admin/users/update
    if (subPath === '/admin/users/update' && req.method === 'POST') {
      const { idUser, nom, telephone, role, idClient } = req.body;
      const user = mockUsers.find(u => u.idUser === idUser);
      if (!user) {
        return res.status(404).json({
          succes: false,
          code: 404,
          message: "Utilisateur introuvable",
          donnees: null,
          timestamp: new Date().toISOString()
        });
      }
      if (nom) user.nom = nom;
      if (telephone !== undefined) user.telephone = telephone;
      if (role) user.role = role;
      if (idClient !== undefined) user.idClient = idClient;

      return res.json({
        succes: true,
        code: 200,
        message: "Utilisateur mis à jour",
        donnees: { ...user, motDePasse: '••••••••' },
        timestamp: new Date().toISOString()
      });
    }

    // POST /admin/users/toggle
    if (subPath === '/admin/users/toggle' && req.method === 'POST') {
      const { idUser, actif } = req.body;
      const user = mockUsers.find(u => u.idUser === idUser);
      if (!user) {
        return res.status(404).json({
          succes: false,
          code: 404,
          message: "Utilisateur introuvable",
          donnees: null,
          timestamp: new Date().toISOString()
        });
      }
      user.actif = actif || (user.actif === 'OUI' ? 'NON' : 'OUI');
      return res.json({
        succes: true,
        code: 200,
        message: `Utilisateur ${user.actif === 'OUI' ? 'activé' : 'désactivé'}`,
        donnees: { ...user, motDePasse: '••••••••' },
        timestamp: new Date().toISOString()
      });
    }

    // POST /admin/users/reset-password
    if (subPath === '/admin/users/reset-password' && req.method === 'POST') {
      const { idUser, email, nouveauMotDePasse } = req.body;
      const user = mockUsers.find(u => u.idUser === idUser || (email && u.email.toLowerCase() === email.toLowerCase()));
      if (!user) {
        return res.status(404).json({
          succes: false,
          code: 404,
          message: "Utilisateur introuvable",
          donnees: null,
          timestamp: new Date().toISOString()
        });
      }
      user.motDePasse = nouveauMotDePasse || 'Cameroun2026!';
      return res.json({
        succes: true,
        code: 200,
        message: "Mot de passe réinitialisé avec succès",
        donnees: null,
        timestamp: new Date().toISOString()
      });
    }

    // GET /admin/actions/list
    if (subPath === '/admin/actions/list' && req.method === 'GET') {
      return res.json({
        succes: true,
        code: 200,
        donnees: mockPipelineActions,
        timestamp: new Date().toISOString()
      });
    }

    // POST /admin/actions/run
    if (subPath === '/admin/actions/run' && req.method === 'POST') {
      const { code } = req.body;
      const action = mockPipelineActions.find(a => a.code === code);
      if (!action) {
        return res.status(404).json({
          succes: false,
          code: 404,
          message: `Action de pipeline inconnue: ${code}`,
          donnees: null,
          timestamp: new Date().toISOString()
        });
      }
      action.dernierLancement = new Date().toISOString();

      mockAuditLogs.unshift({
        id: `AUD-${Date.now().toString().slice(-4)}`,
        timestamp: new Date().toISOString(),
        email: currentUser.email,
        role: 'ADMIN',
        action: `PIPELINE_RUN_${code}`,
        details: `Exécution manuelle de l'action : ${action.nom}`,
        ip: req.ip || '127.0.0.1',
        succes: true
      });

      return res.json({
        succes: true,
        code: 200,
        message: `Action « ${action.nom} » exécutée avec succès`,
        donnees: {
          code: action.code,
          statut: 'SUCCES',
          dureeExecution: '3.42s',
          elementsTraites: 24,
          details: `Pipeline ${action.nom} terminé sans avertissement.`
        },
        timestamp: new Date().toISOString()
      });
    }

    // GET /admin/audit
    if (subPath === '/admin/audit' && req.method === 'GET') {
      const { search, action, succes } = req.query;
      let logs = [...mockAuditLogs];
      if (action) logs = logs.filter(l => l.action.includes(String(action)));
      if (succes !== undefined && succes !== '') logs = logs.filter(l => l.succes === (succes === 'true'));
      if (search) {
        const q = String(search).toLowerCase();
        logs = logs.filter(l => l.details.toLowerCase().includes(q) || l.email.toLowerCase().includes(q) || l.action.toLowerCase().includes(q));
      }
      return res.json({
        succes: true,
        code: 200,
        donnees: {
          total: logs.length,
          logs
        },
        timestamp: new Date().toISOString()
      });
    }

    // GET /admin/sessions
    if (subPath === '/admin/sessions' && req.method === 'GET') {
      const { actif } = req.query;
      let sessions = [...mockSessions];
      if (actif) sessions = sessions.filter(s => s.actif === actif);
      return res.json({
        succes: true,
        code: 200,
        donnees: {
          total: sessions.length,
          sessions
        },
        timestamp: new Date().toISOString()
      });
    }

    // POST /admin/sessions/invalidate
    if (subPath === '/admin/sessions/invalidate' && req.method === 'POST') {
      const { idUser } = req.body;
      const targetSession = mockSessions.find(s => s.idUser === idUser);
      if (targetSession) {
        targetSession.actif = 'NON';
      }
      return res.json({
        succes: true,
        code: 200,
        message: "Session invalidée",
        donnees: null,
        timestamp: new Date().toISOString()
      });
    }

    // POST /admin/sessions/purge
    if (subPath === '/admin/sessions/purge' && req.method === 'POST') {
      return res.json({
        succes: true,
        code: 200,
        message: "Sessions expirées purgées avec succès",
        donnees: { sessionsPurgees: 14 },
        timestamp: new Date().toISOString()
      });
    }
  }

  // Fallback for unhandled routes
  return res.status(404).json({
    succes: false,
    code: 404,
    message: `Route non trouvée: ${req.method} ${subPath}`,
    donnees: null,
    timestamp: new Date().toISOString()
  });
});

// ============================================================================
// VITE MIDDLEWARE OR STATIC PRODUCTION FILES
// ============================================================================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`[Veille Marchés Cameroun] Server running on http://0.0.0.0:${PORT}`);
    console.log(`[Veille Marchés Cameroun] API Target: ${isRealApiConfigured() ? API_URL : 'Sandbox Simulation (Default)'}`);
  });
}

startServer();
