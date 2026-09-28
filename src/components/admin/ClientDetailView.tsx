import React, { useState, useEffect } from 'react';
import {
  Building2,
  ArrowLeft,
  Sparkles,
  Power,
  UserPlus,
  Edit3,
  Check,
  X,
  Mail,
  Globe,
  MapPin,
  FileText,
  Sliders,
  Bell,
  CreditCard,
  History,
  ShieldCheck,
  Copy,
  ExternalLink,
  Users,
  AlertCircle,
  RefreshCw,
  Search,
  Lock,
  Unlock,
  KeyRound,
  Filter,
  Database
} from 'lucide-react';
import {
  ClientProfile,
  User,
  ClientPreferencesData,
  AdminClientAlertItem,
  AdminClientAuditItem,
  OFFICIAL_CAMEROON_REGIONS,
  OFFICIAL_CAMEROON_PROCEDURES
} from '../../types';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { ConfirmActionModal } from '../common/ConfirmActionModal';
import { PasswordGeneratedModal } from '../common/PasswordGeneratedModal';
import { AiBilanModal } from './AiBilanModal';
import { ClientAiTab } from './tabs/ClientAiTab';
import { ClientAlertsTab } from './tabs/ClientAlertsTab';
import { ClientAiCacheTab } from './tabs/ClientAiCacheTab';
import { ClientAuditTab } from './tabs/ClientAuditTab';
import { ClientBillingTab } from './ClientBillingTab';

interface ClientDetailViewProps {
  clientId: string;
  onBack: () => void;
  onClientUpdated?: (client: ClientProfile) => void;
}

type TabKey = 'info' | 'ai' | 'users' | 'alerts' | 'cache-ia' | 'preferences' | 'billing' | 'audit';

export const ClientDetailView: React.FC<ClientDetailViewProps> = ({
  clientId,
  onBack,
  onClientUpdated
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('info');
  const [client, setClient] = useState<ClientProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingInfo, setSavingInfo] = useState(false);
  const toast = useToast();

  // Modal states
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: React.ReactNode;
    confirmText?: string;
    confirmVariant?: 'danger' | 'warning' | 'primary';
    level?: 1 | 2;
    requiredWord?: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: () => {}
  });

  const [passwordModal, setPasswordModal] = useState<{
    isOpen: boolean;
    email: string;
    nom?: string;
    password: string;
    actionTitle?: string;
  }>({
    isOpen: false,
    email: '',
    password: ''
  });

  const [aiBilanModal, setAiBilanModal] = useState<{
    isOpen: boolean;
    dureeSec: number;
  }>({
    isOpen: false,
    dureeSec: 22
  });

  // Edit form state for TAB: info
  const [infoForm, setInfoForm] = useState({
    nom: '',
    emailDestinataire: '',
    regions: [] as string[],
    procedures: [] as string[],
    montantMinimum: 25000000,
    seuilScore: 3.0,
    promptMetier: '',
    siteWeb: '',
    moPrioritaires: [] as string[],
    moInput: '',
    casUsageReference: '',
    inclusionsFallback: [] as string[],
    inclusionsInput: '',
    exclusionsFallback: [] as string[],
    exclusionsInput: '',
    actif: 'OUI' as 'OUI' | 'NON'
  });

  // Users Tab State
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [createUserModalOpen, setCreateUserModalOpen] = useState(false);
  const [newUserForm, setNewUserForm] = useState({
    nom: '',
    email: '',
    telephone: '',
    langue: 'fr' as 'fr' | 'en'
  });
  const [creatingUser, setCreatingUser] = useState(false);

  // Preferences Tab State
  const [preferences, setPreferences] = useState<ClientPreferencesData>({
    notifEmail: true,
    notifWhatsApp: true,
    notifInApp: true,
    whatsappNumero: '',
    frequenceDigest: 'QUOTIDIEN',
    heurePreferee: '07:30',
    langue: 'fr'
  });
  const [savingPrefs, setSavingPrefs] = useState(false);

  // IA Tab State
  const [aiGenerating, setAiGenerating] = useState(false);

  useEffect(() => {
    loadClientDetail();
  }, [clientId]);

  useEffect(() => {
    if (activeTab === 'users') loadClientUsers();
    if (activeTab === 'preferences') loadClientPreferences();
  }, [activeTab]);

  const loadClientDetail = async () => {
    setLoading(true);
    try {
      const res = await api.getAdminClientDetail(clientId);
      if (res.donnees) {
        const raw = res.donnees as any;
        const clientData = raw.client || raw;
        const c: ClientProfile = {
          ...clientData,
          idClient: clientData.idClient || raw.idClient || clientId,
          nom: clientData.nom || clientData.nomEntreprise || raw.nom || '',
          nomEntreprise: clientData.nomEntreprise || clientData.nom || raw.nomEntreprise || '',
          emailDestinataire: clientData.emailDestinataire || raw.emailDestinataire || '',
          actif: clientData.actif || raw.actif || 'OUI',
          profilIA: raw.profilIA || clientData.profilIA,
          preferences: raw.preferences || clientData.preferences,
          utilisateurs: raw.utilisateurs || clientData.utilisateurs,
          abonnement: raw.abonnement || clientData.abonnement,
          factures: raw.factures || clientData.factures
        };
        setClient(c);

        if (raw.utilisateurs && Array.isArray(raw.utilisateurs) && raw.utilisateurs.length > 0) {
          setUsers(raw.utilisateurs);
        }

        if (raw.preferences && typeof raw.preferences === 'object') {
          setPreferences(prev => ({ ...prev, ...raw.preferences }));
        }

        // Normalize regions
        let rawRegs: string[] = [];
        if (Array.isArray(c.regions)) rawRegs = c.regions;
        else if (Array.isArray(c.regionsCibles)) rawRegs = c.regionsCibles;
        else if (typeof c.regions === 'string') rawRegs = c.regions.split(',').map(s => s.trim()).filter(Boolean);
        else if (typeof c.regionsCibles === 'string') rawRegs = c.regionsCibles.split(',').map(s => s.trim()).filter(Boolean);

        // Normalize procedures
        let rawProcs: string[] = [];
        if (Array.isArray(c.procedures)) rawProcs = c.procedures;
        else if (Array.isArray(c.typesProceduresVisees)) rawProcs = c.typesProceduresVisees;
        else if (typeof c.procedures === 'string') rawProcs = c.procedures.split(',').map(s => s.trim()).filter(Boolean);
        else if (typeof c.typesProceduresVisees === 'string') rawProcs = c.typesProceduresVisees.split(',').map(s => s.trim()).filter(Boolean);

        // Normalize MO
        let rawMos: string[] = [];
        if (Array.isArray(c.moPrioritaires)) rawMos = c.moPrioritaires;
        else if (typeof c.moPrioritaires === 'string') rawMos = c.moPrioritaires.split(',').map(s => s.trim()).filter(Boolean);

        // Normalize Score: enforce 1.0 to 5.0
        let sc = 3.0;
        const rawScore = c.seuilScoreMinClient ?? c.seuilScore;
        if (rawScore !== undefined && rawScore !== null && rawScore !== '') {
          const num = Number(rawScore);
          if (!isNaN(num) && num > 0) {
            sc = num > 5 ? Number((num / 20).toFixed(1)) : num;
          }
        }

        setInfoForm({
          nom: c.nomEntreprise || c.nom || '',
          emailDestinataire: c.emailDestinataire || '',
          regions: rawRegs,
          procedures: rawProcs,
          montantMinimum: Number(c.montantMinimum) || 20000000,
          seuilScore: sc,
          promptMetier: c.promptMetierIA || c.promptMetier || '',
          siteWeb: c.siteWeb || '',
          moPrioritaires: rawMos,
          moInput: rawMos.join(', '),
          casUsageReference: c.casUsageReference || '',
          inclusionsFallback: Array.isArray(c.motsClesInclusion) ? c.motsClesInclusion : (c.motsClesInclusion ? String(c.motsClesInclusion).split(',').map(s => s.trim()).filter(Boolean) : []),
          inclusionsInput: Array.isArray(c.motsClesInclusion) ? c.motsClesInclusion.join(', ') : (c.motsClesInclusion || ''),
          exclusionsFallback: Array.isArray(c.motsClesExclusion) ? c.motsClesExclusion : (c.motsClesExclusion ? String(c.motsClesExclusion).split(',').map(s => s.trim()).filter(Boolean) : []),
          exclusionsInput: Array.isArray(c.motsClesExclusion) ? c.motsClesExclusion.join(', ') : (c.motsClesExclusion || ''),
          actif: c.actif || 'OUI'
        });
      }
    } catch (err: any) {
      toast.error('Erreur de chargement', err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadClientUsers = async () => {
    setUsersLoading(true);
    try {
      const res = await api.getAdminUsers({ limit: 100 });
      if (res.donnees && res.donnees.users) {
        setUsers(res.donnees.users.filter(u => u.idClient === clientId));
      }
    } catch (err: any) {
      toast.error('Erreur', err.message);
    } finally {
      setUsersLoading(false);
    }
  };

  const loadClientPreferences = async () => {
    try {
      const res = await api.getAdminClientPreferences(clientId);
      if (res.donnees) {
        setPreferences(res.donnees);
      }
    } catch (err: any) {
      // Keep default preferences if not yet saved in DB
    }
  };

  // Quick Action: Toggle Cascade with Confirmation Level 1
  const handleToggleCascade = () => {
    if (!client) return;
    const isActivating = client.actif === 'NON';
    const nextStatus = isActivating ? 'OUI' : 'NON';

    setConfirmModal({
      isOpen: true,
      title: isActivating ? 'Activer le client et ses utilisateurs ?' : 'Désactiver le client en cascade ?',
      description: isActivating ? (
        <span>
          Le client <strong className="text-slate-900 dark:text-white">{client.nom}</strong> sera réactivé,
          ainsi que ses utilisateurs associés.
        </span>
      ) : (
        <span>
          <strong className="text-red-600 dark:text-red-400">Attention :</strong> La désactivation du client{' '}
          <strong className="text-slate-900 dark:text-white">{client.nom}</strong> entraînera la{' '}
          <strong>désactivation immédiate de tous ses comptes utilisateurs</strong> et l'invalidation de leurs sessions actives.
        </span>
      ),
      confirmText: isActivating ? 'Activer le client' : 'Désactiver en cascade',
      confirmVariant: isActivating ? 'primary' : 'danger',
      level: 1,
      onConfirm: async () => {
        try {
          const res = await api.toggleAdminClientCascade(client.idClient, nextStatus);
          if (res.donnees) {
            setClient(prev => prev ? { ...prev, actif: nextStatus } : prev);
            setInfoForm(prev => ({ ...prev, actif: nextStatus }));
            toast.success(
              'Statut mis à jour',
              `Client ${client.idClient} ${nextStatus === 'OUI' ? 'activé' : 'désactivé'} en cascade (${res.donnees.nbUsersModifies || 0} utilisateurs impactés)`
            );
            if (onClientUpdated && client) {
              onClientUpdated({ ...client, actif: nextStatus });
            }
          }
        } catch (err: any) {
          toast.error('Erreur cascade', err.message);
        } finally {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  // Quick Action: Regenerate IA with Confirmation Level 2 ("CONFIRMER")
  const handleRegenerateIa = () => {
    if (!client) return;
    setConfirmModal({
      isOpen: true,
      title: 'Régénération du profil IA Gemini',
      description: (
        <div className="space-y-2">
          <p>
            Vous êtes sur le point de lancer l'analyse sémantique complète pour{' '}
            <strong className="text-slate-900 dark:text-white">{client.nom}</strong>.
          </p>
          <p className="text-xs text-slate-500">
            Cette opération effectuera le crawl du site web ({client.siteWeb || 'aucun'}), exécutera les 3 passes
            Gemini et recalculera le profil compact. Le nouveau profil sera appliqué lors du prochain cycle de matching.
          </p>
        </div>
      ),
      confirmText: 'Lancer la régénération IA',
      confirmVariant: 'warning',
      level: 2,
      requiredWord: 'CONFIRMER',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setAiGenerating(true);
        const startTime = Date.now();
        toast.info('Génération IA en cours', 'Gemini analyse le profil métier et le site web...');
        try {
          const res = await api.regenerateAdminClientAi(client.idClient);
          const elapsedSec = Math.max(1, Math.round((Date.now() - startTime) / 1000));
          if (res.donnees) {
            setClient(res.donnees);
            toast.success(
              'Profil IA régénéré avec succès !',
              'Le profil compact et les nouveaux mots-clés sont disponibles dans l’onglet IA.'
            );
            if (onClientUpdated) onClientUpdated(res.donnees);
            setAiBilanModal({
              isOpen: true,
              dureeSec: elapsedSec
            });
          }
        } catch (err: any) {
          toast.error('Erreur régénération IA', err.message);
        } finally {
          setAiGenerating(false);
        }
      }
    });
  };

  // Create User for this client with auto-generated password: "Veille2026!" + 4 digits
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client) return;
    if (!newUserForm.email.includes('@')) {
      toast.error('Validation', 'Veuillez saisir un email valide.');
      return;
    }
    const autoPassword = `Veille2026!${Math.floor(1000 + Math.random() * 9000)}`;
    setCreatingUser(true);
    try {
      const res = await api.createAdminUser({
        email: newUserForm.email.trim(),
        nom: newUserForm.nom.trim() || client.nom,
        telephone: newUserForm.telephone.trim(),
        motDePasse: autoPassword,
        role: 'CLIENT',
        idClient: client.idClient
      });

      if (res.donnees) {
        toast.success('Utilisateur créé', `Le compte ${res.donnees.email} est opérationnel.`);
        setCreateUserModalOpen(false);
        setNewUserForm({ nom: '', email: '', telephone: '', langue: 'fr' });
        loadClientUsers();

        // Show single-time password modal
        setPasswordModal({
          isOpen: true,
          email: res.donnees.email,
          nom: res.donnees.nom,
          password: autoPassword,
          actionTitle: 'Compte Utilisateur Client Créé'
        });
      }
    } catch (err: any) {
      toast.error('Erreur création utilisateur', err.message);
    } finally {
      setCreatingUser(false);
    }
  };

  // Reset User Password
  const handleResetUserPassword = (user: User) => {
    const autoPassword = `Veille2026!${Math.floor(1000 + Math.random() * 9000)}`;
    setConfirmModal({
      isOpen: true,
      title: 'Réinitialiser le mot de passe',
      description: (
        <span>
          Voulez-vous générer un nouveau mot de passe temporaire pour{' '}
          <strong className="text-slate-900 dark:text-white">{user.nom} ({user.email})</strong> ?
        </span>
      ),
      confirmText: 'Réinitialiser',
      confirmVariant: 'warning',
      level: 1,
      onConfirm: async () => {
        try {
          await api.resetAdminUserPassword({
            idUser: user.idUser,
            email: user.email,
            nouveauMotDePasse: autoPassword
          });
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          setPasswordModal({
            isOpen: true,
            email: user.email,
            nom: user.nom,
            password: autoPassword,
            actionTitle: 'Mot de passe réinitialisé'
          });
        } catch (err: any) {
          toast.error('Erreur réinitialisation', err.message);
        }
      }
    });
  };

  // Toggle user active status
  const handleToggleUser = async (u: User) => {
    const nextStatus = u.actif === 'OUI' ? 'NON' : 'OUI';
    try {
      await api.toggleAdminUser(u.idUser, nextStatus);
      setUsers(prev => prev.map(item => item.idUser === u.idUser ? { ...item, actif: nextStatus } : item));
      toast.success(`Utilisateur ${nextStatus === 'OUI' ? 'activé' : 'désactivé'}`);
    } catch (err: any) {
      toast.error('Erreur', err.message);
    }
  };

  // Save Info Form
  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client) return;

    if (!infoForm.nom || infoForm.nom.trim().length < 3) {
      toast.error('Validation', "Le nom de l'entreprise doit comporter au moins 3 caractères.");
      return;
    }
    if (!infoForm.emailDestinataire || !infoForm.emailDestinataire.includes('@')) {
      toast.error('Validation', "Veuillez fournir une adresse email destinataire valide.");
      return;
    }

    setSavingInfo(true);
    try {
      const payload: Partial<ClientProfile> & { idClient: string } = {
        idClient: client.idClient,
        nom: infoForm.nom.trim(),
        nomEntreprise: infoForm.nom.trim(),
        emailDestinataire: infoForm.emailDestinataire.trim(),
        regions: infoForm.regions,
        regionsCibles: infoForm.regions,
        procedures: infoForm.procedures,
        typesProceduresVisees: infoForm.procedures,
        montantMinimum: Number(infoForm.montantMinimum),
        seuilScore: Number(infoForm.seuilScore),
        seuilScoreMinClient: Number(infoForm.seuilScore),
        promptMetier: infoForm.promptMetier,
        promptMetierIA: infoForm.promptMetier,
        siteWeb: infoForm.siteWeb.trim(),
        moPrioritaires: infoForm.moInput.split(',').map(s => s.trim()).filter(Boolean),
        casUsageReference: infoForm.casUsageReference,
        motsClesInclusion: infoForm.inclusionsInput.split(',').map(s => s.trim()).filter(Boolean),
        motsClesExclusion: infoForm.exclusionsInput.split(',').map(s => s.trim()).filter(Boolean),
        actif: infoForm.actif
      };

      const res = await api.updateAdminClient(payload);
      if (res.donnees) {
        setClient(res.donnees);
        toast.success('Succès', 'Critères de matching et informations client enregistrés.');
        if (onClientUpdated) onClientUpdated(res.donnees);
      }
    } catch (err: any) {
      toast.error('Erreur d’enregistrement', err.message);
    } finally {
      setSavingInfo(false);
    }
  };

  // Save Preferences Form
  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client) return;
    setSavingPrefs(true);
    try {
      const res = await api.updateAdminClientPreferences({
        idClient: client.idClient,
        ...preferences
      });
      if (res.donnees) {
        setPreferences(res.donnees);
        toast.success('Préférences enregistrées', 'Les paramètres de notification ont été mis à jour.');
      }
    } catch (err: any) {
      toast.error('Erreur', err.message);
    } finally {
      setSavingPrefs(false);
    }
  };

  // Helper for multi-select toggle
  const toggleArrayItem = (list: string[], item: string, setter: (val: string[]) => void) => {
    if (item === 'TOUTES') {
      if (list.includes('TOUTES')) {
        setter([]);
      } else {
        setter(['TOUTES']);
      }
      return;
    }

    const withoutToutes = list.filter(x => x !== 'TOUTES');
    if (withoutToutes.includes(item)) {
      setter(withoutToutes.filter(x => x !== item));
    } else {
      setter([...withoutToutes, item]);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-500 font-medium">Chargement de la fiche client {clientId}...</p>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Client {clientId} introuvable</h3>
        <p className="text-sm text-slate-500 mt-1">Ce client a peut-être été supprimé ou n'existe pas.</p>
        <button
          onClick={onBack}
          className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold inline-flex items-center space-x-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Retour à la liste</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Top Header Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start space-x-4">
            <button
              onClick={onBack}
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
              title="Retour à la liste"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="space-y-1">
              <div className="flex items-center space-x-3 flex-wrap gap-y-2">
                <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 select-all">
                  {client.idClient}
                </span>
                <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  {client.nomEntreprise || client.nom}
                </h1>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wide ${
                    client.actif === 'OUI'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                      : 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 border border-red-300 dark:border-red-800'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${client.actif === 'OUI' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  {client.actif === 'OUI' ? 'ACTIF' : 'INACTIF'}
                </span>
                {aiGenerating && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 animate-pulse border border-amber-300">
                    <Sparkles className="w-3 h-3 mr-1 animate-spin" />
                    Génération IA en cours...
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center space-x-3">
                <span className="flex items-center space-x-1">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>{client.emailDestinataire}</span>
                </span>
                {client.siteWeb && (
                  <a
                    href={client.siteWeb.startsWith('http') ? client.siteWeb : `https://${client.siteWeb}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center space-x-1 text-emerald-600 hover:underline"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>{client.siteWeb.replace(/^https?:\/\//, '')}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center flex-wrap gap-2">
            <button
              onClick={handleToggleCascade}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 border transition-all ${
                client.actif === 'OUI'
                  ? 'border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30'
                  : 'border-emerald-300 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
              }`}
            >
              <Power className="w-4 h-4" />
              <span>{client.actif === 'OUI' ? 'Désactiver (Cascade)' : 'Activer le client'}</span>
            </button>

            <button
              onClick={handleRegenerateIa}
              disabled={aiGenerating}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white flex items-center space-x-1.5 shadow-sm transition-all"
            >
              <Sparkles className={`w-4 h-4 ${aiGenerating ? 'animate-spin' : ''}`} />
              <span>Régénérer Profil IA</span>
            </button>

            <button
              onClick={() => setCreateUserModalOpen(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center space-x-1.5 shadow-sm transition-all"
            >
              <UserPlus className="w-4 h-4" />
              <span>+ Utilisateur</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mt-6 border-t border-slate-200 dark:border-slate-800 pt-4">
          <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar">
            {[
              { key: 'info', label: 'Informations & Matching', icon: Sliders },
              { key: 'ai', label: 'Intelligence Artificielle', icon: Sparkles },
              { key: 'users', label: 'Utilisateurs associés', icon: Users, badge: users.length },
              { key: 'alerts', label: 'Alertes & Historique', icon: Bell },
              { key: 'cache-ia', label: 'Cache IA', icon: Database },
              { key: 'preferences', label: 'Préférences Notif.', icon: FileText },
              { key: 'billing', label: 'Abonnement & Factures', icon: CreditCard },
              { key: 'audit', label: 'Journal d’Audit', icon: History }
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as TabKey)}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center space-x-2 whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-slate-900 text-white dark:bg-emerald-600 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* TAB 1: Informations & Matching */}
      {activeTab === 'info' && (
        <form onSubmit={handleSaveInfo} className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Configuration Complète du Matching & Critères de Filtrage
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Ces paramètres pilotent l'attribution automatique des avis ARMP à ce client.
              </p>
            </div>
            <button
              type="submit"
              disabled={savingInfo}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-sm transition-all disabled:opacity-50"
            >
              {savingInfo ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Enregistrement...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Enregistrer les modifications</span>
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* ID_CLIENT (Immuable) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                ID Client (Immuable)
              </label>
              <input
                type="text"
                value={client.idClient}
                disabled
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/60 font-mono text-xs text-slate-500 cursor-not-allowed"
              />
            </div>

            {/* NOM_ENTREPRISE */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Nom de l'entreprise <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={infoForm.nom}
                onChange={e => setInfoForm({ ...infoForm, nom: e.target.value })}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* EMAIL_DESTINATAIRE */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Email destinataire des alertes <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={infoForm.emailDestinataire}
                onChange={e => setInfoForm({ ...infoForm, emailDestinataire: e.target.value })}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* SEUIL SCORE MIN (1.0 to 5.0) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Seuil de score minimum (1.0 - 5.0)
                </label>
                <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                  {Number(infoForm.seuilScore).toFixed(1)} / 5.0
                </span>
              </div>
              <input
                type="number"
                step="0.1"
                min="1.0"
                max="5.0"
                value={infoForm.seuilScore}
                onChange={e => setInfoForm({ ...infoForm, seuilScore: parseFloat(e.target.value) || 3.0 })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
              />
              <p className="text-[11px] text-slate-400">Échelle officielle de 1.0 à 5.0 (défaut : 3.0)</p>
            </div>

            {/* MONTANT_MINIMUM */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Montant minimum (FCFA)
              </label>
              <input
                type="number"
                step="1000000"
                value={infoForm.montantMinimum}
                onChange={e => setInfoForm({ ...infoForm, montantMinimum: parseInt(e.target.value) || 0 })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
              />
              <p className="text-[11px] text-slate-400 font-mono">
                {new Intl.NumberFormat('fr-FR').format(infoForm.montantMinimum)} FCFA
              </p>
            </div>

            {/* SITE_WEB */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Site Web Entreprise (Crawl Gemini)
              </label>
              <input
                type="url"
                placeholder="https://..."
                value={infoForm.siteWeb}
                onChange={e => setInfoForm({ ...infoForm, siteWeb: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* REGIONS_CIBLES Multi-Select */}
          <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-4">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Régions ciblées (Cameroun)
              </label>
              <span className="text-xs text-slate-400">
                {infoForm.regions.includes('TOUTES') ? 'Toutes les régions' : `${infoForm.regions.length} sélectionnée(s)`}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {OFFICIAL_CAMEROON_REGIONS.map(reg => {
                const isSelected = infoForm.regions.includes(reg) || (reg !== 'TOUTES' && infoForm.regions.includes('TOUTES'));
                return (
                  <button
                    key={reg}
                    type="button"
                    onClick={() => toggleArrayItem(infoForm.regions, reg, val => setInfoForm({ ...infoForm, regions: val }))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      isSelected
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-emerald-500'
                    }`}
                  >
                    {reg}
                  </button>
                );
              })}
            </div>
          </div>

          {/* TYPES_PROCEDURES_VISEES Multi-Select */}
          <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-4">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Procédures visées
              </label>
              <span className="text-xs text-slate-400">
                {infoForm.procedures.includes('TOUTES') ? 'Toutes les procédures' : `${infoForm.procedures.length} sélectionnée(s)`}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {OFFICIAL_CAMEROON_PROCEDURES.map(proc => {
                const isSelected = infoForm.procedures.includes(proc) || (proc !== 'TOUTES' && infoForm.procedures.includes('TOUTES'));
                return (
                  <button
                    key={proc}
                    type="button"
                    onClick={() => toggleArrayItem(infoForm.procedures, proc, val => setInfoForm({ ...infoForm, procedures: val }))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      isSelected
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-500'
                    }`}
                  >
                    {proc}
                  </button>
                );
              })}
            </div>
          </div>

          {/* PROMPT_METIER_IA */}
          <div className="space-y-1.5 border-t border-slate-200 dark:border-slate-800 pt-4">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Description du Métier (Prompt Gemini IA)
              </label>
              <span className={`text-xs font-mono ${infoForm.promptMetier.length >= 50 ? 'text-emerald-600' : 'text-amber-500'}`}>
                {infoForm.promptMetier.length} caractères (recommandé: 500+)
              </span>
            </div>
            <textarea
              rows={4}
              value={infoForm.promptMetier}
              onChange={e => setInfoForm({ ...infoForm, promptMetier: e.target.value })}
              placeholder="Décrivez en détail les spécialités, technologies, matériaux, types de chantiers ou prestations pour alimenter l'analyse sémantique Gemini..."
              className="w-full p-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white leading-relaxed focus:ring-2 focus:ring-emerald-500 font-sans"
            />
          </div>

          {/* MO_PRIORITAIRES & CAS_USAGE_REFERENCE */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-slate-200 dark:border-slate-800 pt-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Maîtres d'Ouvrage Prioritaires (séparés par des virgules)
              </label>
              <input
                type="text"
                placeholder="MINTP, FEICOM, Port Autonome de Douala, CUD..."
                value={infoForm.moInput}
                onChange={e => setInfoForm({ ...infoForm, moInput: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Cas d'Usage de Référence (Avis cibles absolus)
              </label>
              <textarea
                rows={2}
                placeholder="Exemples précis d'appels d'offres que le client DOIT remporter..."
                value={infoForm.casUsageReference}
                onChange={e => setInfoForm({ ...infoForm, casUsageReference: e.target.value })}
                className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Mots-clés de secours (Fallback) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-slate-200 dark:border-slate-800 pt-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Mots-clés manuels d'Inclusion (Fallback si pas de profil IA)
              </label>
              <input
                type="text"
                placeholder="Bitumage, Génie Civil, Voirie..."
                value={infoForm.inclusionsInput}
                onChange={e => setInfoForm({ ...infoForm, inclusionsInput: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Mots-clés manuels d'Exclusion
              </label>
              <input
                type="text"
                placeholder="Fourniture bureau, Événementiel..."
                value={infoForm.exclusionsInput}
                onChange={e => setInfoForm({ ...infoForm, exclusionsInput: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="submit"
              disabled={savingInfo}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-sm transition-all"
            >
              {savingInfo ? 'Enregistrement...' : 'Enregistrer les critères du client'}
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: Intelligence Artificielle */}
      {activeTab === 'ai' && (
        <ClientAiTab
          client={client}
          onRegenerate={handleRegenerateIa}
          aiGenerating={aiGenerating}
          onProfileUpdated={(updated) => {
            setClient(updated);
            if (onClientUpdated) onClientUpdated(updated);
          }}
        />
      )}

      {/* TAB 3: Utilisateurs associés */}
      {activeTab === 'users' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Comptes Utilisateurs Rattachés ({users.length})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Ces utilisateurs peuvent se connecter pour consulter les alertes de {client.nom}.
              </p>
            </div>
            <button
              onClick={() => setCreateUserModalOpen(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-sm transition-all"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Créer un utilisateur</span>
            </button>
          </div>

          {usersLoading ? (
            <div className="p-8 text-center text-slate-400 text-sm">Chargement des utilisateurs...</div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
              <Users className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Aucun utilisateur rattaché pour l'instant</p>
              <p className="text-xs text-slate-500 mt-1">Créez le premier accès client avec mot de passe auto-généré.</p>
              <button
                onClick={() => setCreateUserModalOpen(true)}
                className="mt-3 px-3.5 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold"
              >
                + Créer un utilisateur
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
                    <th className="py-3 px-3">Nom</th>
                    <th className="py-3 px-3">Email</th>
                    <th className="py-3 px-3">Téléphone</th>
                    <th className="py-3 px-3">Rôle</th>
                    <th className="py-3 px-3">Statut</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {users.map(u => (
                    <tr key={u.idUser} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white">
                        {u.nomComplet || u.nom}
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300 font-mono">
                        {u.email}
                      </td>
                      <td className="py-3 px-3 text-slate-500">
                        {u.telephone || '—'}
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-bold">
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            u.actif === 'OUI'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                          }`}
                        >
                          {u.actif === 'OUI' ? 'ACTIF' : 'INACTIF'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => handleResetUserPassword(u)}
                          className="px-2 py-1 text-[11px] font-bold text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 rounded-lg border border-amber-300 dark:border-amber-800 inline-flex items-center space-x-1"
                          title="Réinitialiser le mot de passe"
                        >
                          <KeyRound className="w-3 h-3" />
                          <span>Reset MDP</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleUser(u)}
                          className={`px-2 py-1 text-[11px] font-bold rounded-lg border transition-all ${
                            u.actif === 'OUI'
                              ? 'text-red-600 border-red-300 hover:bg-red-50'
                              : 'text-emerald-600 border-emerald-300 hover:bg-emerald-50'
                          }`}
                        >
                          {u.actif === 'OUI' ? 'Désactiver' : 'Activer'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: Alertes & Correspondances */}
      {activeTab === 'alerts' && (
        <ClientAlertsTab
          clientId={client.idClient}
          clientNom={client.nomEntreprise || client.nom}
        />
      )}

      {/* TAB Cache IA */}
      {activeTab === 'cache-ia' && (
        <ClientAiCacheTab
          clientId={client.idClient}
          clientNom={client.nomEntreprise || client.nom}
        />
      )}

      {/* TAB 5: Préférences de notification */}
      {activeTab === 'preferences' && (
        <form onSubmit={handleSavePreferences} className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Canaux & Préférences de Notification Client
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Feuille PREFERENCES_CLIENT synchronisée via API REST.
              </p>
            </div>
            <button
              type="submit"
              disabled={savingPrefs}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
            >
              {savingPrefs ? 'Enregistrement...' : 'Enregistrer les canaux'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="flex items-center space-x-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 cursor-pointer">
              <input
                type="checkbox"
                checked={preferences.notifEmail}
                onChange={e => setPreferences({ ...preferences, notifEmail: e.target.checked })}
                className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
              />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Alertes par Email</span>
            </label>

            <label className="flex items-center space-x-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 cursor-pointer">
              <input
                type="checkbox"
                checked={preferences.notifWhatsApp}
                onChange={e => setPreferences({ ...preferences, notifWhatsApp: e.target.checked })}
                className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
              />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Alertes WhatsApp</span>
            </label>

            <label className="flex items-center space-x-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 cursor-pointer">
              <input
                type="checkbox"
                checked={preferences.notifInApp}
                onChange={e => setPreferences({ ...preferences, notifInApp: e.target.checked })}
                className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
              />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Notifications In-App</span>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Numéro WhatsApp (+237...)
              </label>
              <input
                type="text"
                placeholder="+237 6..."
                value={preferences.whatsappNumero || ''}
                onChange={e => setPreferences({ ...preferences, whatsappNumero: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Fréquence du Digest
              </label>
              <select
                value={preferences.frequenceDigest || 'QUOTIDIEN'}
                onChange={e => setPreferences({ ...preferences, frequenceDigest: e.target.value as any })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white"
              >
                <option value="INSTANTANE">Instantané</option>
                <option value="QUOTIDIEN">Quotidien (Matin)</option>
                <option value="HEBDO">Hebdomadaire</option>
                <option value="MENSUEL">Mensuel</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Heure préférée d'envoi
              </label>
              <input
                type="time"
                value={preferences.heurePreferee || '07:30'}
                onChange={e => setPreferences({ ...preferences, heurePreferee: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white"
              />
            </div>
          </div>
        </form>
      )}

      {/* TAB 6: Abonnements & Factures (V1 Lecture Seule) */}
      {activeTab === 'billing' && (
        <ClientBillingTab client={client} />
      )}

      {/* TAB 7: Journal d'Audit du Client */}
      {activeTab === 'audit' && (
        <ClientAuditTab
          clientId={client.idClient}
          clientNom={client.nomEntreprise || client.nom}
        />
      )}

      {/* MODAL: Create User */}
      {createUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="flex items-center space-x-2">
                  <UserPlus className="w-5 h-5 text-emerald-600" />
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Créer un Utilisateur Client
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setCreateUserModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-900/60 text-xs text-emerald-800 dark:text-emerald-300">
                L'utilisateur sera automatiquement rattaché à <strong>{client.nom} ({client.idClient})</strong>.
                Son mot de passe initial sera généré automatiquement (format : <code className="font-mono font-bold">Veille2026!xxxx</code>).
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Nom complet <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Jean Dupont"
                  value={newUserForm.nom}
                  onChange={e => setNewUserForm({ ...newUserForm, nom: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Email de connexion <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="contact@entreprise.cm"
                  value={newUserForm.email}
                  onChange={e => setNewUserForm({ ...newUserForm, email: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Téléphone (optionnel)
                </label>
                <input
                  type="tel"
                  placeholder="+237 6..."
                  value={newUserForm.telephone}
                  onChange={e => setNewUserForm({ ...newUserForm, telephone: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setCreateUserModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={creatingUser}
                  className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm disabled:opacity-50"
                >
                  {creatingUser ? 'Création...' : 'Créer & Générer le mot de passe'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmActionModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        description={confirmModal.description}
        confirmText={confirmModal.confirmText}
        confirmVariant={confirmModal.confirmVariant}
        level={confirmModal.level}
        requiredInputWord={confirmModal.requiredWord}
      />

      {/* Single-Time Password Modal */}
      <PasswordGeneratedModal
        isOpen={passwordModal.isOpen}
        onClose={() => setPasswordModal(prev => ({ ...prev, isOpen: false }))}
        email={passwordModal.email}
        nom={passwordModal.nom}
        password={passwordModal.password}
        actionTitle={passwordModal.actionTitle}
      />

      {/* AI Bilan Modal */}
      <AiBilanModal
        isOpen={aiBilanModal.isOpen}
        onClose={() => setAiBilanModal(prev => ({ ...prev, isOpen: false }))}
        clientNom={client.nomEntreprise || client.nom}
        clientId={client.idClient}
        profilIA={client.profilIA}
        dureeSec={aiBilanModal.dureeSec}
        onViewProfile={() => setActiveTab('ai')}
      />
    </div>
  );
};
