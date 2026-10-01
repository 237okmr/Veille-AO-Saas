import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { ClientProfile as ClientProfileType, CAMEROON_REGIONS, CAMEROON_PROCEDURES } from '../../types';
import {
  Building2,
  Sparkles,
  MapPin,
  Banknote,
  FileText,
  Globe,
  Save,
  RotateCw,
  Check,
  ShieldCheck,
  Tag,
  Plus,
  Trash2
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { formaterDateDouala } from '../../utils/dates';

const toArrayHelper = (val: any): string[] => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') return val.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
};

export const ClientProfile: React.FC = () => {
  const [profile, setProfile] = useState<ClientProfileType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const toast = useToast();

  // Form states
  const [nom, setNom] = useState('');
  const [emailDestinataire, setEmailDestinataire] = useState('');
  const [regions, setRegions] = useState<string[]>([]);
  const [procedures, setProcedures] = useState<string[]>([]);
  const [montantMinimum, setMontantMinimum] = useState<number>(0);
  const [seuilScore, setSeuilScore] = useState<number>(70);
  const [promptMetier, setPromptMetier] = useState('');
  const [siteWeb, setSiteWeb] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const res = await api.getClientProfile();
      if (res.donnees) {
        setProfile(res.donnees);
        setNom(res.donnees.nom || '');
        setEmailDestinataire(res.donnees.emailDestinataire || '');
        setRegions(toArrayHelper(res.donnees.regions));
        setProcedures(toArrayHelper(res.donnees.procedures));
        setMontantMinimum(Number(res.donnees.montantMinimum) || 0);
        setSeuilScore(Number(res.donnees.seuilScore) || 70);
        setPromptMetier(res.donnees.promptMetier || '');
        setSiteWeb(res.donnees.siteWeb || '');
      }
    } catch (err: any) {
      toast.error('Erreur', err.message || 'Impossible de charger le profil entreprise');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleRegion = (region: string) => {
    setRegions((prev) =>
      prev.includes(region) ? prev.filter((r) => r !== region) : [...prev, region]
    );
  };

  const handleToggleProcedure = (code: string) => {
    setProcedures((prev) =>
      prev.includes(code) ? prev.filter((p) => p !== code) : [...prev, code]
    );
  };

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.updateClientProfile({
        nom,
        emailDestinataire,
        regions,
        procedures,
        montantMinimum,
        seuilScore
      });
      if (res.donnees) {
        setProfile(res.donnees);
        toast.success('Profil mis à jour', 'Les critères de veille ont été enregistrés avec succès.');
      }
    } catch (err: any) {
      toast.error('Erreur de sauvegarde', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSavePrompt = async () => {
    setSaving(true);
    try {
      const res = await api.updatePromptMetier(promptMetier);
      if (res.donnees) {
        setProfile(res.donnees);
        toast.success('Prompt métier enregistré', 'Le profil de ciblage IA utilisera cette description.');
      }
    } catch (err: any) {
      toast.error('Erreur', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSiteWeb = async () => {
    setSaving(true);
    try {
      const res = await api.updateSiteWeb(siteWeb);
      if (res.donnees) {
        setProfile(res.donnees);
        toast.success('Site web enregistré');
      }
    } catch (err: any) {
      toast.error('Erreur', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerateAi = async () => {
    setRegenerating(true);
    try {
      const res = await api.regenerateAiProfile();
      if (res.donnees) {
        setProfile(res.donnees);
        toast.success('Profil IA régénéré avec succès', 'Les mots-clés sémantiques et inclusions/exclusions ont été recalculés.');
      }
    } catch (err: any) {
      toast.error('Erreur de régénération', err.message);
    } finally {
      setRegenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6 max-w-5xl mx-auto animate-pulse">
        <div className="h-48 rounded-2xl bg-slate-200 dark:bg-slate-800" />
        <div className="h-64 rounded-2xl bg-slate-200 dark:bg-slate-800" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
          Profil Entreprise & Critères de Veille IA
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Personnalisez votre périmètre géographique, vos seuils financiers et la signature sémantique de votre société.
        </p>
      </div>

      {/* Main Form */}
      <form onSubmit={handleSaveGeneral} className="space-y-6">
        {/* Section 1: Informations Générales */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
            <Building2 className="w-4 h-4 text-teal-700" />
            <span>Informations de l'entreprise</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Raison sociale / Nom commercial
              </label>
              <input
                type="text"
                required
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600/30 focus:border-teal-600 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Email de réception des alertes AO
              </label>
              <input
                type="email"
                required
                value={emailDestinataire}
                onChange={(e) => setEmailDestinataire(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600/30 focus:border-teal-600 transition-colors"
              />
            </div>
          </div>

          {/* Budget minimum & Seuil score */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Montant estimatif minimum exigé (FCFA)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="1000000"
                  value={montantMinimum}
                  onChange={(e) => setMontantMinimum(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600/30 focus:border-teal-600 font-mono"
                />
                <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-slate-400 font-mono pointer-events-none">
                  FCFA
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Les marchés inférieurs à ce montant recevront une pondération réduite.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Seuil de score IA pour déclenchement d'alerte
                </label>
                <span className="text-xs font-mono font-bold text-teal-700 dark:text-teal-400">
                  {seuilScore}%
                </span>
              </div>
              <input
                type="range"
                min="50"
                max="95"
                step="5"
                value={seuilScore}
                onChange={(e) => setSeuilScore(Number(e.target.value))}
                className="w-full accent-teal-600 mt-2"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Seuls les avis avec une affinité ≥ {seuilScore}% vous seront notifiés par email/WhatsApp.
              </p>
            </div>
          </div>
        </div>

        {/* Section 2: Régions cibles au Cameroun */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <MapPin className="w-4 h-4 text-teal-700" />
              <span>Régions d'intervention ciblées au Cameroun</span>
            </div>
            <span className="text-xs font-semibold text-teal-700 dark:text-teal-400">
              {regions.length} / {CAMEROON_REGIONS.length} sélectionnée(s)
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
            {CAMEROON_REGIONS.map((r) => {
              const checked = regions.includes(r);
              return (
                <button
                  type="button"
                  key={r}
                  onClick={() => handleToggleRegion(r)}
                  className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-medium transition-all text-left ${
                    checked
                      ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/60 text-teal-900 dark:text-teal-200 font-semibold shadow-2xs'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                  }`}
                >
                  <span>{r}</span>
                  {checked && <Check className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 3: Types de procédures autorisées */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <FileText className="w-4 h-4 text-teal-700" />
              <span>Procédures de passation acceptées</span>
            </div>
            <span className="text-xs font-semibold text-teal-700 dark:text-teal-400">
              {procedures.length} type(s)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {CAMEROON_PROCEDURES.map((p) => {
              const checked = procedures.includes(p.code);
              return (
                <button
                  type="button"
                  key={p.code}
                  onClick={() => handleToggleProcedure(p.code)}
                  className={`flex items-center justify-between p-3 rounded-xl border text-xs font-medium transition-all text-left ${
                    checked
                      ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/60 text-teal-900 dark:text-teal-200 font-semibold shadow-2xs'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                  }`}
                >
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-900 dark:text-white">{p.code}</span>
                    <p className="text-[11px] text-slate-500 line-clamp-1">{p.label}</p>
                  </div>
                  {checked && <Check className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0 ml-2" />}
                </button>
              );
            })}
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 py-2.5 px-5 rounded-xl text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Enregistrement...' : 'Enregistrer les critères de veille'}</span>
            </button>
          </div>
        </div>
      </form>

      {/* Section 4: Prompt Métier & Analyse IA */}
      <div className="p-5 rounded-2xl border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/20 dark:bg-amber-950/20 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-amber-200/60 dark:border-amber-900/40">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>Prompt Métier & Synthèse Sémantique IA</span>
          </div>

          <button
            type="button"
            onClick={handleRegenerateAi}
            disabled={regenerating}
            className="flex items-center gap-2 py-1.5 px-3 rounded-lg text-xs font-semibold text-amber-900 dark:text-amber-200 bg-amber-200/80 dark:bg-amber-900/60 hover:bg-amber-300 dark:hover:bg-amber-800/80 transition-colors shadow-2xs cursor-pointer"
          >
            <RotateCw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} />
            <span>{regenerating ? 'Régénération IA...' : 'Régénérer le profil IA'}</span>
          </button>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            Description libre de votre savoir-faire et spécialités métiers
          </label>
          <textarea
            rows={4}
            value={promptMetier}
            onChange={(e) => setPromptMetier(e.target.value)}
            placeholder="Exemple : Entreprise de BTP spécialisée en terrassement, voirie urbaine, assainissement et construction d'ouvrages d'art. Nous disposons d'engins lourds à Douala et Yaoundé..."
            className="w-full p-3 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-colors leading-relaxed"
          />
          <div className="flex justify-end mt-2">
            <button
              type="button"
              onClick={handleSavePrompt}
              disabled={saving}
              className="py-1.5 px-3 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 transition-colors"
            >
              Enregistrer le prompt métier
            </button>
          </div>
        </div>

        {/* Website Scraper */}
        <div className="pt-2 border-t border-amber-200/60 dark:border-amber-900/40">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            Site web de l'entreprise (pour analyse sémantique automatique)
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Globe className="w-4 h-4" />
              </div>
              <input
                type="url"
                value={siteWeb}
                onChange={(e) => setSiteWeb(e.target.value)}
                placeholder="https://www.mon-entreprise.cm"
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-colors"
              />
            </div>
            <button
              type="button"
              onClick={handleSaveSiteWeb}
              className="py-2 px-3 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 transition-colors"
            >
              Enregistrer
            </button>
          </div>
        </div>

        {/* AI Breakdown Card */}
        {profile?.profilIA && (
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 space-y-3 mt-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                Signature IA Extraite
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                Dernier calcul : {profile.profilIA.dernierCalcul ? formaterDateDouala(profile.profilIA.dernierCalcul) : 'Récent'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {/* Inclusions */}
              <div className="space-y-1.5">
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                  Activités & Mots cibles inclus :
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {toArrayHelper(profile.profilIA.inclusions).map((inc) => (
                    <span
                      key={inc}
                      className="px-2 py-0.5 rounded text-[11px] bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                    >
                      {inc}
                    </span>
                  ))}
                </div>
              </div>

              {/* Exclusions */}
              <div className="space-y-1.5">
                <span className="font-semibold text-rose-700 dark:text-rose-400">
                  Mots & Prestations exclus :
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {toArrayHelper(profile.profilIA.exclusions).map((exc) => (
                    <span
                      key={exc}
                      className="px-2 py-0.5 rounded text-[11px] bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                    >
                      {exc}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
