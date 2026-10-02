import React, { useState, useEffect } from 'react';
import {
  X,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Check,
  Building2,
  Mail,
  MapPin,
  Sliders,
  DollarSign,
  FileText,
  Globe,
  Tag,
  UserPlus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ShieldAlert
} from 'lucide-react';
import {
  ClientProfile,
  OFFICIAL_CAMEROON_REGIONS,
  OFFICIAL_CAMEROON_PROCEDURES
} from '../../types';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { AiGenerationLoader } from './AiGenerationLoader';
import { AiBilanModal } from './AiBilanModal';
import { PasswordGeneratedModal } from '../common/PasswordGeneratedModal';

interface ClientCreateWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingClients: ClientProfile[];
  onClientCreated: (client: ClientProfile) => void;
}

export const ClientCreateWizardModal: React.FC<ClientCreateWizardModalProps> = ({
  isOpen,
  onClose,
  existingClients,
  onClientCreated
}) => {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);
  const toast = useToast();

  // Helper to compute next ID
  const computeNextId = (): string => {
    let maxNum = 0;
    existingClients.forEach((c) => {
      const match = c.idClient?.match(/(?:CLI[_-])(\d+)/i);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    });
    return `CLI_${String(maxNum + 1).padStart(3, '0')}`;
  };

  // Form State
  const [idClient, setIdClient] = useState('');
  const [nomEntreprise, setNomEntreprise] = useState('');
  const [emailDestinataire, setEmailDestinataire] = useState('');
  const [actif, setActif] = useState<'OUI' | 'NON'>('OUI');

  // Step 2 State
  const [regions, setRegions] = useState<string[]>(['CENTRE', 'LITTORAL']);
  const [procedures, setProcedures] = useState<string[]>(['AONO', 'AONI', 'DC']);
  const [montantMinimum, setMontantMinimum] = useState<number>(20000000);
  const [seuilScore, setSeuilScore] = useState<number>(3.0);

  // Step 3 State
  const [promptMetier, setPromptMetier] = useState('');
  const [siteWeb, setSiteWeb] = useState('');
  const [moPrioritairesInput, setMoPrioritairesInput] = useState('MINTP, FEICOM, CUD');
  const [casUsageReference, setCasUsageReference] = useState('');

  // Step 4 State
  const [inclusionsInput, setInclusionsInput] = useState('');
  const [exclusionsInput, setExclusionsInput] = useState('');
  const [genererIaImmediatement, setGenererIaImmediatement] = useState(true);
  const [creerUtilisateur, setCreerUtilisateur] = useState(false);
  const [userNom, setUserNom] = useState('');
  const [userEmail, setUserEmail] = useState('');

  // Execution states
  const [submitting, setSubmitting] = useState(false);
  const [showAiLoader, setShowAiLoader] = useState(false);
  const [createdClientForBilan, setCreatedClientForBilan] = useState<ClientProfile | null>(null);
  const [createdPasswordInfo, setCreatedPasswordInfo] = useState<{
    isOpen: boolean;
    email: string;
    nom: string;
    password: string;
  }>({
    isOpen: false,
    email: '',
    nom: '',
    password: ''
  });

  // Re-initialize ID when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
      setIdClient(computeNextId());
      setNomEntreprise('');
      setEmailDestinataire('');
      setActif('OUI');
      setRegions(['CENTRE', 'LITTORAL']);
      setProcedures(['AONO', 'AONI', 'DC']);
      setMontantMinimum(20000000);
      setSeuilScore(3.0);
      setPromptMetier('');
      setSiteWeb('');
      setMoPrioritairesInput('MINTP, FEICOM, CUD');
      setCasUsageReference('');
      setInclusionsInput('');
      setExclusionsInput('');
      setGenererIaImmediatement(true);
      setCreerUtilisateur(false);
      setUserNom('');
      setUserEmail('');
    }
  }, [isOpen, existingClients]);

  // Sync user email when main email changes
  useEffect(() => {
    if (!userEmail && emailDestinataire) {
      setUserEmail(emailDestinataire);
    }
  }, [emailDestinataire]);

  if (!isOpen && !showAiLoader && !createdClientForBilan && !createdPasswordInfo.isOpen) {
    return null;
  }

  // Check ID Uniqueness
  const isIdDuplicate = existingClients.some(
    (c) => c.idClient?.trim().toLowerCase() === idClient.trim().toLowerCase()
  );

  // Multi-select toggle
  const toggleArrayItem = (list: string[], item: string, setter: (val: string[]) => void) => {
    if (item === 'TOUTES') {
      setter(list.includes('TOUTES') ? [] : ['TOUTES']);
      return;
    }
    const filtered = list.filter((x) => x !== 'TOUTES');
    setter(filtered.includes(item) ? filtered.filter((x) => x !== item) : [...filtered, item]);
  };

  // Step Validations
  const validateStep1 = () => {
    if (!idClient.trim()) {
      toast.error('Validation', 'Veuillez définir un identifiant client.');
      return false;
    }
    if (isIdDuplicate) {
      toast.error('Validation', `L'identifiant ${idClient} est déjà utilisé par un autre client.`);
      return false;
    }
    if (nomEntreprise.trim().length < 3) {
      toast.error('Validation', "Le nom de l'entreprise doit comporter au moins 3 caractères.");
      return false;
    }
    if (!emailDestinataire.includes('@') || !emailDestinataire.includes('.')) {
      toast.error('Validation', 'Veuillez saisir une adresse email destinataire valide.');
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (regions.length === 0) {
      toast.error('Validation', 'Sélectionnez au moins une région cible ou "TOUTES".');
      return false;
    }
    if (procedures.length === 0) {
      toast.error('Validation', 'Sélectionnez au moins une procédure visée ou "TOUTES".');
      return false;
    }
    if (seuilScore < 1.0 || seuilScore > 5.0) {
      toast.error('Validation', 'Le seuil de score doit être compris entre 1.0 et 5.0.');
      return false;
    }
    return true;
  };

  const validateStep3 = () => {
    // If prompt is too short, warn that fallback inclusions will be required at step 4
    if (promptMetier.trim().length < 50) {
      toast.info(
        'Prompt court',
        'Le prompt fait moins de 50 caractères. Vous devrez saisir au moins 3 mots-clés manuels à l’étape 4.'
      );
    }
    return true;
  };

  const validateStep4 = () => {
    const rawInclusions = inclusionsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (promptMetier.trim().length < 50 && rawInclusions.length < 3) {
      toast.error(
        'Critère obligatoire manquant',
        'Vous devez obligatoirement fournir une DESCRIPTION DU MÉTIER (≥ 50 caractères) OU au moins 3 MOTS-CLÉS D’INCLUSION manuels.'
      );
      return false;
    }

    if (creerUtilisateur) {
      if (!userEmail || !userEmail.includes('@')) {
        toast.error('Validation utilisateur', 'Veuillez saisir un email valide pour le compte utilisateur.');
        return false;
      }
    }

    return true;
  };

  const handleNext = () => {
    if (currentStep === 1 && !validateStep1()) return;
    if (currentStep === 2 && !validateStep2()) return;
    if (currentStep === 3 && !validateStep3()) return;
    setCurrentStep((prev) => (prev < 4 ? ((prev + 1) as any) : prev));
  };

  const handlePrev = () => {
    setCurrentStep((prev) => (prev > 1 ? ((prev - 1) as any) : prev));
  };

  // Final Submission
  const handleSubmit = async () => {
    if (!validateStep1() || !validateStep2() || !validateStep4()) return;

    setSubmitting(true);
    if (genererIaImmediatement) {
      setShowAiLoader(true);
    }

    const payload = {
      idClient: idClient.trim(),
      nom: nomEntreprise.trim(),
      nomEntreprise: nomEntreprise.trim(),
      emailDestinataire: emailDestinataire.trim(),
      actif,
      regions: regions.includes('TOUTES') ? ['TOUTES'] : regions,
      procedures: procedures.includes('TOUTES') ? ['TOUTES'] : procedures,
      montantMinimum: Number(montantMinimum) || 0,
      seuilScore: Number(seuilScore) || 3.0,
      seuilScoreMinClient: Number(seuilScore) || 3.0,
      promptMetier: promptMetier.trim(),
      promptMetierIA: promptMetier.trim(),
      siteWeb: siteWeb.trim(),
      moPrioritaires: moPrioritairesInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      casUsageReference: casUsageReference.trim(),
      motsClesInclusion: inclusionsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      motsClesExclusion: exclusionsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      genererProfilIA: genererIaImmediatement
    };

    try {
      // 1. Create client
      const res = await api.createAdminClient(payload as any);
      let createdClient: ClientProfile = res.donnees || {
        ...payload,
        idClient: payload.idClient
      };

      // 2. If user requested, create user account
      let generatedPass = '';
      if (creerUtilisateur) {
        generatedPass = `Veille2026!${Math.floor(1000 + Math.random() * 9000)}`;
        try {
          await api.createAdminUser({
            email: userEmail.trim(),
            nom: userNom.trim() || nomEntreprise.trim(),
            motDePasse: generatedPass,
            role: 'CLIENT',
            idClient: createdClient.idClient
          });
        } catch (uErr: any) {
          toast.warning('Compte utilisateur', `Client créé mais erreur sur l'utilisateur : ${uErr.message}`);
        }
      }

      // Close loader & wizard
      setShowAiLoader(false);
      onClientCreated(createdClient);
      onClose();

      // Show IA Bilan Modal if generated
      if (genererIaImmediatement && createdClient.profilIA) {
        setCreatedClientForBilan(createdClient);
      } else {
        toast.success(
          'Client créé !',
          `L'entreprise ${createdClient.nom} a été ajoutée avec l'ID ${createdClient.idClient}.`
        );
      }

      // Show user password modal if created
      if (creerUtilisateur && generatedPass) {
        setCreatedPasswordInfo({
          isOpen: true,
          email: userEmail.trim(),
          nom: userNom.trim() || nomEntreprise.trim(),
          password: generatedPass
        });
      }
    } catch (err: any) {
      setShowAiLoader(false);
      toast.error('Erreur lors de la création', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Ai Generation Loader */}
      <AiGenerationLoader
        isOpen={showAiLoader}
        clientNom={nomEntreprise}
        siteWeb={siteWeb}
        timeoutSeconds={45}
        onTimeout={() => {
          setShowAiLoader(false);
          toast.error(
            'Délai dépassé',
            'Client créé. L\'analyse sémantique a pris plus de 45s. Réessayez depuis la fiche client.'
          );
        }}
      />

      {/* Ai Bilan Modal */}
      {createdClientForBilan && (
        <AiBilanModal
          isOpen={Boolean(createdClientForBilan)}
          onClose={() => setCreatedClientForBilan(null)}
          clientNom={createdClientForBilan.nom}
          clientId={createdClientForBilan.idClient}
          profilIA={createdClientForBilan.profilIA}
        />
      )}

      {/* Password Generated Modal */}
      <PasswordGeneratedModal
        isOpen={createdPasswordInfo.isOpen}
        onClose={() => setCreatedPasswordInfo((prev) => ({ ...prev, isOpen: false }))}
        email={createdPasswordInfo.email}
        nom={createdPasswordInfo.nom}
        password={createdPasswordInfo.password}
        actionTitle="Compte Utilisateur Client Créé"
      />

      {/* Wizard Dialog */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
          <div
            className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]"
            role="dialog"
            aria-modal="true"
          >
            {/* Header with Step Tracker */}
            <div className="p-6 border-b border-slate-200 bg-slate-50/50">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 rounded-2xl bg-emerald-600 text-white shadow-md">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-slate-900">
                      Nouveau Client & Configuration Matching
                    </h2>
                    <p className="text-xs text-slate-500">
                      Étape {currentStep} sur 4 :{' '}
                      {currentStep === 1 && 'Coordonnées & Identification'}
                      {currentStep === 2 && 'Critères de Matching & Filtres'}
                      {currentStep === 3 && 'Profil Métier & Analyse Sémantique'}
                      {currentStep === 4 && 'Mots-Clés de Secours & Finalisation'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Stepper Progress Bar */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { step: 1, label: '1. Coordonnées' },
                  { step: 2, label: '2. Critères' },
                  { step: 3, label: '3. Profil Métier' },
                  { step: 4, label: '4. Options & Profil' }
                ].map((s) => (
                  <div key={s.step} className="space-y-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        s.step < currentStep
                          ? 'bg-emerald-600'
                          : s.step === currentStep
                          ? 'bg-emerald-500 animate-pulse'
                          : 'bg-slate-200'
                      }`}
                    />
                    <span
                      className={`text-[10px] font-bold block truncate ${
                        s.step === currentStep
                          ? 'text-emerald-600'
                          : s.step < currentStep
                          ? 'text-slate-700'
                          : 'text-slate-400'
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Step Content */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* STEP 1: Coordonnées */}
              {currentStep === 1 && (
                <div className="space-y-5 animate-fadeIn">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* ID Client */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          ID Client (Unique) <span className="text-red-500">*</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => setIdClient(computeNextId())}
                          className="text-[11px] text-emerald-600 hover:underline flex items-center space-x-1 font-semibold"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Auto</span>
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          value={idClient}
                          onChange={(e) => setIdClient(e.target.value.trim().toUpperCase())}
                          placeholder="CLI_001"
                          className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-mono font-bold uppercase ${
                            isIdDuplicate
                              ? 'border-red-500 bg-red-50/50 dark:bg-red-950/20 text-red-700'
                              : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                          } focus:ring-2 focus:ring-emerald-500`}
                        />
                        <div className="absolute right-3 top-2.5">
                          {isIdDuplicate ? (
                            <ShieldAlert className="w-4 h-4 text-red-500" />
                          ) : idClient ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          ) : null}
                        </div>
                      </div>
                      {isIdDuplicate && (
                        <p className="text-[11px] text-red-500 font-semibold">
                          Cet identifiant est déjà utilisé. Veuillez en choisir un autre.
                        </p>
                      )}
                    </div>

                    {/* Statut Actif */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        Statut Initial
                      </label>
                      <div className="grid grid-cols-2 gap-2 pt-0.5">
                        <button
                          type="button"
                          onClick={() => setActif('OUI')}
                          className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                            actif === 'OUI'
                              ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                              : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          ✓ ACTIF
                        </button>
                        <button
                          type="button"
                          onClick={() => setActif('NON')}
                          className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                            actif === 'NON'
                              ? 'bg-red-600 border-red-600 text-white shadow-sm'
                              : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          ✕ INACTIF
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Nom Entreprise */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Nom de l'Entreprise <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: CAMEROUN BTP & CONSTRUCTIONS SARL"
                      value={nomEntreprise}
                      onChange={(e) => setNomEntreprise(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                    />
                    <p className="text-[11px] text-slate-400">Au moins 3 caractères requis.</p>
                  </div>

                  {/* Email Destinataire */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Email Destinataire des Alertes <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <input
                        type="email"
                        placeholder="contact@entreprise.cm"
                        value={emailDestinataire}
                        onChange={(e) => setEmailDestinataire(e.target.value)}
                        className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Adresse officielle où seront expédiés les bulletins et alertes d'appels d'offres.
                    </p>
                  </div>
                </div>
              )}

              {/* STEP 2: Critères de matching */}
              {currentStep === 2 && (
                <div className="space-y-6 animate-fadeIn">
                  {/* Régions Multi-Select */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        Régions Ciblées (Cameroun) <span className="text-red-500">*</span>
                      </label>
                      <span className="text-xs text-slate-400">
                        {regions.includes('TOUTES') ? 'Toutes les régions' : `${regions.length} sélectionnée(s)`}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {OFFICIAL_CAMEROON_REGIONS.map((reg) => {
                        const isSelected =
                          regions.includes(reg) || (reg !== 'TOUTES' && regions.includes('TOUTES'));
                        return (
                          <button
                            key={reg}
                            type="button"
                            onClick={() => toggleArrayItem(regions, reg, setRegions)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                              isSelected
                                ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                                : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-emerald-500'
                            }`}
                          >
                            {reg}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Procédures Multi-Select */}
                  <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-4">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        Procédures Visées <span className="text-red-500">*</span>
                      </label>
                      <span className="text-xs text-slate-400">
                        {procedures.includes('TOUTES')
                          ? 'Toutes les procédures'
                          : `${procedures.length} sélectionnée(s)`}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {OFFICIAL_CAMEROON_PROCEDURES.map((proc) => {
                        const isSelected =
                          procedures.includes(proc) ||
                          (proc !== 'TOUTES' && procedures.includes('TOUTES'));
                        return (
                          <button
                            key={proc}
                            type="button"
                            onClick={() => toggleArrayItem(procedures, proc, setProcedures)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                              isSelected
                                ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                                : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-500'
                            }`}
                          >
                            {proc}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Seuil Score & Montant Min */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-200 dark:border-slate-800 pt-4">
                    {/* Seuil de Score */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          Seuil de Score Min. (1.0 à 5.0)
                        </label>
                        <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                          {Number(seuilScore).toFixed(1)} / 5.0
                        </span>
                      </div>
                      <input
                        type="number"
                        step="0.1"
                        min="1.0"
                        max="5.0"
                        value={seuilScore}
                        onChange={(e) => setSeuilScore(parseFloat(e.target.value) || 3.0)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                      />
                      <p className="text-[11px] text-slate-400">
                        Échelle officielle 1.0 à 5.0 (défaut recommandé : 3.0).
                      </p>
                    </div>

                    {/* Montant Min */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        Montant Minimum Estimé (FCFA)
                      </label>
                      <input
                        type="number"
                        step="1000000"
                        value={montantMinimum}
                        onChange={(e) => setMontantMinimum(parseInt(e.target.value) || 0)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                      />
                      <p className="text-[11px] text-slate-400 font-mono">
                        {new Intl.NumberFormat('fr-FR').format(montantMinimum)} FCFA
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3: Profil Métier & Cas d'usage */}
              {currentStep === 3 && (
                <div className="space-y-5 animate-fadeIn">
                  {/* Prompt Métier */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Description du Métier & Savoir-faire
                      </label>
                      <span
                        className={`text-xs font-mono font-bold ${
                          promptMetier.length >= 50 ? 'text-emerald-600' : 'text-amber-500'
                        }`}
                      >
                        {promptMetier.length} caractères (recommandé: 500+)
                      </span>
                    </div>
                    <textarea
                      rows={4}
                      value={promptMetier}
                      onChange={(e) => setPromptMetier(e.target.value)}
                      placeholder="Ex: Entreprise de BTP spécialisée dans les travaux de voirie, terrassement, bitumage en béton bitumineux, ouvrages d'art et assainissement pluvial au Cameroun. Nous répondons aux marchés d'infrastructures routières et ferroviaires..."
                      className="w-full p-3.5 rounded-2xl border border-slate-300 bg-white text-xs text-slate-900 leading-relaxed focus:ring-2 focus:ring-emerald-500"
                    />
                    <p className="text-[11px] text-slate-400">
                      Ce texte alimente l'analyse sémantique pour extraire les mots-clés d'inclusion et d'exclusion.
                    </p>
                  </div>

                  {/* Site Web */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Site Web de l'Entreprise (Pour Analyse Sémantique)
                    </label>
                    <div className="relative">
                      <Globe className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <input
                        type="url"
                        placeholder="https://www.mon-entreprise.cm"
                        value={siteWeb}
                        onChange={(e) => setSiteWeb(e.target.value)}
                        className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400">
                      L'analyse automatique parcourt les pages clés pour enrichir le profil de ciblage.
                    </p>
                  </div>

                  {/* MO Prioritaires */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Maîtres d'Ouvrage Prioritaires (séparés par des virgules)
                    </label>
                    <input
                      type="text"
                      placeholder="MINTP, FEICOM, CUD, Port Autonome de Douala, CAMWATER"
                      value={moPrioritairesInput}
                      onChange={(e) => setMoPrioritairesInput(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                    />
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {['MINTP', 'FEICOM', 'CUD', 'CUY', 'MINDCAF', 'Port Douala', 'ENEO'].map((mo) => (
                        <button
                          key={mo}
                          type="button"
                          onClick={() => {
                            if (!moPrioritairesInput.includes(mo)) {
                              setMoPrioritairesInput((prev) => (prev ? `${prev}, ${mo}` : mo));
                            }
                          }}
                          className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                        >
                          + {mo}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Cas d'usage de référence */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Cas d'Usage de Référence (Avis Cibles Incontournables)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Ex: Travaux d'aménagement des voies d'accès au pont du Wouri, bitumage de la route Bafoussam-Bamenda..."
                      value={casUsageReference}
                      onChange={(e) => setCasUsageReference(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              )}

              {/* STEP 4: Options & Mots-Clés de secours */}
              {currentStep === 4 && (
                <div className="space-y-6 animate-fadeIn">
                  {/* Mots-clés de secours (Fallback) */}
                  <div className="space-y-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center space-x-2">
                      <Tag className="w-4 h-4 text-emerald-600" />
                      <span>Mots-clés manuels de secours (Fallback)</span>
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Utilisés en cas de génération différée ou comme filtre direct de secours.
                    </p>

                    <div className="space-y-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                          Inclusions manuelles (séparées par des virgules)
                        </label>
                        <input
                          type="text"
                          placeholder="Bitumage, Voirie, Génie Civil, Ouvrages d'art..."
                          value={inclusionsInput}
                          onChange={(e) => setInclusionsInput(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                          Exclusions manuelles (séparées par des virgules)
                        </label>
                        <input
                          type="text"
                          placeholder="Fourniture de bureau, Événementiel, Restauration..."
                          value={exclusionsInput}
                          onChange={(e) => setExclusionsInput(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Option Extraction Immédiate */}
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-emerald-500/10 to-transparent border border-amber-300/60 flex items-start space-x-3.5">
                    <input
                      type="checkbox"
                      id="optGenererIa"
                      checked={genererIaImmediatement}
                      onChange={(e) => setGenererIaImmediatement(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 mt-1 cursor-pointer"
                    />
                    <label htmlFor="optGenererIa" className="cursor-pointer space-y-0.5">
                      <span className="text-xs font-bold text-slate-900 flex items-center space-x-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        <span>Extraire les critères sémantiques automatiquement (recommandé)</span>
                      </span>
                      <p className="text-[11px] text-slate-500">
                        Lance l'analyse sémantique du site web et de la description métier (inclusions, exclusions, synthèse).
                        En cas de délai d'attente, le client sera créé avec ses critères de base.
                      </p>
                    </label>
                  </div>

                  {/* Option Créer Utilisateur */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                    <div className="flex items-start space-x-3.5">
                      <input
                        type="checkbox"
                        id="optCreerUser"
                        checked={creerUtilisateur}
                        onChange={(e) => setCreerUtilisateur(e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 mt-1 cursor-pointer"
                      />
                      <label htmlFor="optCreerUser" className="cursor-pointer space-y-0.5">
                        <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center space-x-1.5">
                          <UserPlus className="w-3.5 h-3.5 text-indigo-500" />
                          <span>Créer un compte utilisateur pour ce client</span>
                        </span>
                        <p className="text-[11px] text-slate-500">
                          Génère un mot de passe sécurisé temporaire affiché une seule fois avec bouton de copie.
                        </p>
                      </label>
                    </div>

                    {creerUtilisateur && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 pl-7 animate-fadeIn">
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                            Nom de l'utilisateur
                          </label>
                          <input
                            type="text"
                            placeholder={nomEntreprise || 'Ex: Responsable Veille'}
                            value={userNom}
                            onChange={(e) => setUserNom(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                            Email de connexion <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="email"
                            placeholder="admin@entreprise.cm"
                            value={userEmail}
                            onChange={(e) => setUserEmail(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Wizard Navigation Footer */}
            <div className="p-6 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
              {currentStep > 1 ? (
                <button
                  type="button"
                  onClick={handlePrev}
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-all flex items-center space-x-1.5"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Précédent</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded-xl transition-all"
                >
                  Annuler
                </button>
              )}

              {currentStep < 4 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-md transition-all active:scale-95"
                >
                  <span>Suivant</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center space-x-2 shadow-lg shadow-emerald-600/30 transition-all active:scale-95"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Création en cours...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Créer le Client</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
