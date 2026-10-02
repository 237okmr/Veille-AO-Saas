import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { ReglagesData, ReglagesParametres } from '../../types';
import {
  ShieldCheck,
  RotateCw,
  Save,
  KeyRound,
  Gauge
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

const PROXY_MODES: { value: 'OFF' | 'OBSERVE' | 'ENFORCE'; label: string; desc: string }[] = [
  { value: 'OFF', label: 'OFF', desc: "Aucune vérification de clé (comportement d'origine)" },
  { value: 'OBSERVE', label: 'OBSERVE', desc: 'La clé est vérifiée et comptée, rien n’est refusé' },
  { value: 'ENFORCE', label: 'ENFORCE', desc: 'Toute requête sans la bonne clé est refusée' }
];

export const AdminSettings: React.FC = () => {
  const [data, setData] = useState<ReglagesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [proxyBusy, setProxyBusy] = useState(false);
  const [paramsBusy, setParamsBusy] = useState(false);
  const [geminiBusy, setGeminiBusy] = useState(false);
  const [deepseekBusy, setDeepseekBusy] = useState(false);

  const [form, setForm] = useState<ReglagesParametres>({});
  const [cle1, setCle1] = useState('');
  const [cle2, setCle2] = useState('');
  const [cleDeepSeek, setCleDeepSeek] = useState('');

  const toast = useToast();

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getReglages();
      if (res.donnees) {
        setData(res.donnees);
        setForm(res.donnees.parametres);
      }
    } catch (e: any) {
      toast.error('Erreur', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleProxyMode = async (mode: 'OFF' | 'OBSERVE' | 'ENFORCE') => {
    setProxyBusy(true);
    try {
      const res = await api.updateProxyMode(mode);
      toast.success('Mode proxy modifié', `Mode : ${res.donnees?.mode}`);
      load();
    } catch (e: any) {
      toast.error('Changement refusé', e.message);
    } finally {
      setProxyBusy(false);
    }
  };

  const handleSaveParams = async () => {
    setParamsBusy(true);
    try {
      const res = await api.updateReglagesParametres(form);
      const refuses = res.donnees?.refuses || [];
      if (refuses.length > 0) {
        toast.error('Certains champs refusés', refuses.join(', '));
      } else {
        toast.success('Paramètres enregistrés', `${res.donnees?.modifie?.length || 0} champ(s) mis à jour.`);
      }
      load();
    } catch (e: any) {
      toast.error('Erreur', e.message);
    } finally {
      setParamsBusy(false);
    }
  };

  const handleSaveGemini = async () => {
    if (!cle1.trim() && !cle2.trim()) {
      toast.error('Champs vides', 'Renseignez au moins une clé.');
      return;
    }
    const confirmed = window.confirm(
      "Attention : les 2 champs ci-dessous remplaceront ENTIÈREMENT les clés actuellement dans le coffre. " +
      "Un champ laissé vide n'est PAS conservé — renseignez les 2 clés si vous voulez les garder toutes les deux. Continuer ?"
    );
    if (!confirmed) return;

    setGeminiBusy(true);
    try {
      const res = await api.updateReglagesClesGemini({ cle1, cle2 });
      toast.success('Clés mises à jour', `${res.donnees?.nbCles} clé(s) dans le coffre.`);
      setCle1('');
      setCle2('');
      load();
    } catch (e: any) {
      toast.error('Erreur', e.message);
    } finally {
      setGeminiBusy(false);
    }
  };

  const handleSaveDeepSeek = async () => {
    const isClearing = !cleDeepSeek.trim();
    const confirmed = window.confirm(
      isClearing
        ? "Le champ est vide : la clé DeepSeek actuelle sera EFFACÉE du coffre. Continuer ?"
        : "Cette clé remplacera la clé DeepSeek actuellement dans le coffre. Continuer ?"
    );
    if (!confirmed) return;

    setDeepseekBusy(true);
    try {
      const res = await api.updateReglagesCleDeepSeek({ cle: cleDeepSeek });
      toast.success(
        isClearing ? 'Clé DeepSeek effacée' : 'Clé DeepSeek mise à jour',
        isClearing ? 'Le fallback DeepSeek est désormais sans clé.' : `${res.donnees?.nbCles} clé(s) dans le coffre.`
      );
      setCleDeepSeek('');
      load();
    } catch (e: any) {
      toast.error('Erreur', e.message);
    } finally {
      setDeepseekBusy(false);
    }
  };

  const setField = (key: keyof ReglagesParametres, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  if (loading && !data) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-teal-700/20 border-t-teal-700 rounded-full animate-spin" />
      </div>
    );
  }

  const modeColor = (mode?: string) => {
    if (mode === 'ENFORCE') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
    if (mode === 'OBSERVE') return 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800';
    return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700';
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Réglages de la plateforme
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Mode de sécurité du proxy, paramètres métier et clés API — sans repasser par l'éditeur Apps Script.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <RotateCw className="w-3.5 h-3.5" />
          <span>Actualiser</span>
        </button>
      </div>

      {/* SECTION 1 : MODE PROXY */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-teal-700" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Mode de la clé du proxy</h3>
          <span className={`ml-auto inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold border ${modeColor(data?.proxy.mode)}`}>
            {data?.proxy.mode || '—'}
          </span>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Secret présent : <strong>{data?.proxy.secretPresent ? 'oui' : 'non'}</strong> · Sur les 6 dernières heures :{' '}
          <strong className="text-emerald-600">{data?.proxy.rapport6h.ok ?? 0} avec clé valide</strong>,{' '}
          <strong className="text-rose-600">{data?.proxy.rapport6h.ko ?? 0} sans clé valide</strong>.
        </p>

        <div className="flex flex-wrap gap-2">
          {PROXY_MODES.map((m) => (
            <button
              key={m.value}
              disabled={proxyBusy || data?.proxy.mode === m.value}
              onClick={() => handleProxyMode(m.value)}
              title={m.desc}
              className={`py-2 px-4 rounded-xl text-xs font-semibold border transition-colors ${
                data?.proxy.mode === m.value
                  ? 'opacity-50 cursor-not-allowed border-slate-200 dark:border-slate-800 text-slate-400'
                  : 'border-teal-200 dark:border-teal-900/60 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/40'
              }`}
            >
              Passer en {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* SECTION 2 : PARAMÈTRES MÉTIER */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-teal-700" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Paramètres métier</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Email admin (logs)</label>
            <input
              type="email"
              value={form.Email_Admin_Logs || ''}
              onChange={(e) => setField('Email_Admin_Logs', e.target.value)}
              className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Email de réponse (Reply-To)</label>
            <input
              type="email"
              value={form.Email_Reply_To || ''}
              onChange={(e) => setField('Email_Reply_To', e.target.value)}
              className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Seuil de score de pertinence min.</label>
            <input
              type="number"
              value={form.Seuil_Score_Pertinence_Min ?? ''}
              onChange={(e) => setField('Seuil_Score_Pertinence_Min', e.target.value)}
              className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Fenêtre de veille (heures)</label>
            <input
              type="number"
              value={form.Fenetre_Veille_Heures ?? ''}
              onChange={(e) => setField('Fenetre_Veille_Heures', e.target.value)}
              className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Heure de collecte (nuit)</label>
            <input
              type="time"
              value={form.Heure_Collecte_Nuit || ''}
              onChange={(e) => setField('Heure_Collecte_Nuit', e.target.value)}
              className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Heure d'envoi (matin)</label>
            <input
              type="time"
              value={form.Heure_Envoi_Matin || ''}
              onChange={(e) => setField('Heure_Envoi_Matin', e.target.value)}
              className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Seuil d'alerte quota e-mails</label>
            <input
              type="number"
              value={form.Seuil_Alerte_Quota_Emails ?? ''}
              onChange={(e) => setField('Seuil_Alerte_Quota_Emails', e.target.value)}
              className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
            />
          </div>
          <div className="flex items-center gap-4 pt-5">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={form.Activer_Reporting === 'OUI'}
                onChange={(e) => setField('Activer_Reporting', e.target.checked ? 'OUI' : 'NON')}
                className="rounded border-slate-300"
              />
              Activer le reporting
            </label>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={form.Activer_Fallback_DeepSeek === 'OUI'}
                onChange={(e) => setField('Activer_Fallback_DeepSeek', e.target.checked ? 'OUI' : 'NON')}
                className="rounded border-slate-300"
              />
              Fallback DeepSeek
            </label>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleSaveParams}
            disabled={paramsBusy}
            className="flex items-center gap-2 py-2 px-4 rounded-xl text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {paramsBusy ? 'Enregistrement...' : 'Enregistrer les paramètres'}
          </button>
        </div>
      </div>

      {/* SECTION 3 : CLÉS API */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs p-5 space-y-6">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-teal-700" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Clés API (coffre)</h3>
        </div>

        {/* Clés Moteur Principal */}
        <div className="space-y-3 pb-5 border-b border-slate-100 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Moteur Principal — {data?.clesApi.Cle_API_IA.nbCles ?? 0} clé(s) actuellement dans le coffre
            {data?.clesApi.Cle_API_IA.masquees.length ? (
              <> (<span className="font-mono">{data.clesApi.Cle_API_IA.masquees.join(', ')}</span>)</>
            ) : null}
            .
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="password"
              placeholder="Nouvelle clé principale #1"
              value={cle1}
              onChange={(e) => setCle1(e.target.value)}
              className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
            />
            <input
              type="password"
              placeholder="Nouvelle clé principale #2"
              value={cle2}
              onChange={(e) => setCle2(e.target.value)}
              className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
            />
          </div>
          <p className="text-[10px] text-amber-600 dark:text-amber-400">
            Les 2 champs remplacent ensemble les clés existantes — un champ laissé vide n'est pas conservé.
          </p>
          <div className="flex justify-end">
            <button
              onClick={handleSaveGemini}
              disabled={geminiBusy}
              className="flex items-center gap-2 py-2 px-4 rounded-xl text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {geminiBusy ? 'Enregistrement...' : 'Mettre à jour les clés'}
            </button>
          </div>
        </div>

        {/* Moteur Secondaire */}
        <div className="space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Moteur Secondaire (fallback) — {data?.clesApi.Cle_API_IA_DeepSeek.nbCles ?? 0} clé(s) actuellement dans le coffre
            {data?.clesApi.Cle_API_IA_DeepSeek.masquees.length ? (
              <> (<span className="font-mono">{data.clesApi.Cle_API_IA_DeepSeek.masquees.join(', ')}</span>)</>
            ) : null}
            .
          </p>
          <input
            type="password"
            placeholder="Nouvelle clé DeepSeek (laisser vide pour effacer)"
            value={cleDeepSeek}
            onChange={(e) => setCleDeepSeek(e.target.value)}
            className="w-full sm:w-1/2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
          />
          <div className="flex justify-end">
            <button
              onClick={handleSaveDeepSeek}
              disabled={deepseekBusy}
              className="flex items-center gap-2 py-2 px-4 rounded-xl text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {deepseekBusy ? 'Enregistrement...' : 'Mettre à jour la clé DeepSeek'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
