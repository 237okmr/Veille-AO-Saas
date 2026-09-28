import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { ClientPreferences as ClientPreferencesType } from '../../types';
import {
  Bell,
  Mail,
  MessageSquare,
  Clock,
  Globe,
  Save,
  CheckCircle2,
  Phone
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

export const ClientPreferences: React.FC = () => {
  const [prefs, setPrefs] = useState<ClientPreferencesType>({
    notifEmail: true,
    notifWhatsApp: true,
    notifInApp: true,
    whatsappNumero: '',
    frequence: 'QUOTIDIEN',
    heurePreferee: '07:30',
    langue: 'fr'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    setLoading(true);
    try {
      const res = await api.getPreferences();
      if (res.donnees) {
        setPrefs(res.donnees);
      }
    } catch (e: any) {
      toast.error('Erreur', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.updatePreferences(prefs);
      if (res.donnees) {
        setPrefs(res.donnees);
        toast.success('Préférences enregistrées', 'Vos paramètres de notifications ont été mis à jour.');
      }
    } catch (e: any) {
      toast.error('Erreur', e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4 max-w-3xl mx-auto animate-pulse">
        <div className="h-64 rounded-2xl bg-slate-200 dark:bg-slate-800" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
          Préférences de Notification & Alertes
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Définissez les canaux de réception (Email, WhatsApp, In-App) et la fréquence de vos synthèses.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Canaux de notification */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
            <Bell className="w-4 h-4 text-teal-700" />
            <span>Canaux de diffusion</span>
          </div>

          <div className="space-y-3">
            {/* Email */}
            <label className="flex items-start justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer">
              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">
                    Bulletins d'alertes par Email
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Réception du bulletin personnalisé avec liens de téléchargement direct des DAO.
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={prefs.notifEmail}
                onChange={(e) => setPrefs({ ...prefs, notifEmail: e.target.checked })}
                className="mt-1 rounded text-teal-600 focus:ring-teal-500"
              />
            </label>

            {/* WhatsApp */}
            <label className="flex items-start justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer">
              <div className="flex items-start gap-3">
                <MessageSquare className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">
                    Alertes instantanées WhatsApp
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Synthèse concise sur WhatsApp pour les marchés hautement pertinents (Score ≥ 85%).
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={prefs.notifWhatsApp}
                onChange={(e) => setPrefs({ ...prefs, notifWhatsApp: e.target.checked })}
                className="mt-1 rounded text-teal-600 focus:ring-teal-500"
              />
            </label>

            {/* Numéro WhatsApp */}
            {prefs.notifWhatsApp && (
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 ml-4 space-y-1.5 animate-in fade-in">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Numéro WhatsApp de réception
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Phone className="w-4 h-4" />
                  </div>
                  <input
                    type="tel"
                    value={prefs.whatsappNumero || ''}
                    onChange={(e) => setPrefs({ ...prefs, whatsappNumero: e.target.value })}
                    placeholder="+237 6XX XX XX XX"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>
            )}

            {/* In-App */}
            <label className="flex items-start justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer">
              <div className="flex items-start gap-3">
                <Bell className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">
                    Notifications In-App dans le tableau de bord
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Compteur dynamique et mise en évidence des nouveaux avis publiés.
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={prefs.notifInApp}
                onChange={(e) => setPrefs({ ...prefs, notifInApp: e.target.checked })}
                className="mt-1 rounded text-teal-600 focus:ring-teal-500"
              />
            </label>
          </div>
        </div>

        {/* Fréquence & Horaires */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
            <Clock className="w-4 h-4 text-teal-700" />
            <span>Fréquence & Heure d'envoi</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Fréquence des rapports
              </label>
              <select
                value={prefs.frequence}
                onChange={(e) => setPrefs({ ...prefs, frequence: e.target.value as any })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600/30 focus:border-teal-600"
              >
                <option value="INSTANTANE">Instantané (Dès publication d'un avis)</option>
                <option value="QUOTIDIEN">Quotidien (Récapitulatif matinal)</option>
                <option value="HEBDOMADAIRE">Hebdomadaire (Lundi matin)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Heure préférée (Heure de Yaoundé / GMT+1)
              </label>
              <input
                type="time"
                value={prefs.heurePreferee}
                onChange={(e) => setPrefs({ ...prefs, heurePreferee: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white font-mono"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 py-2.5 px-6 rounded-xl text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Enregistrement...' : 'Enregistrer les préférences'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
