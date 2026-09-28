import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import {
  Globe,
  CheckCircle2,
  AlertCircle,
  X,
  Server,
  Key,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  Code
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

interface ApiConfigModalProps {
  onClose: () => void;
}

export const ApiConfigModal: React.FC<ApiConfigModalProps> = ({ onClose }) => {
  const { apiConfig, refreshConfig } = useAuth();
  const [testing, setTesting] = useState(false);
  const [pingResult, setPingResult] = useState<{ success: boolean; message: string; duration: string } | null>(null);
  const toast = useToast();

  const handleTestConnection = async () => {
    setTesting(true);
    setPingResult(null);
    const start = Date.now();
    try {
      await api.getConfig();
      const elapsed = Date.now() - start;
      setPingResult({
        success: true,
        message: apiConfig?.isConfigured
          ? 'Connexion établie avec succès avec le proxy Google Apps Script !'
          : 'Moteur Sandbox local actif et pleinement opérationnel.',
        duration: `${elapsed}ms`
      });
      await refreshConfig();
      toast.success('Test de connexion réussi');
    } catch (e: any) {
      setPingResult({
        success: false,
        message: e.message || 'Impossible de joindre le proxy API.',
        duration: `${Date.now() - start}ms`
      });
      toast.error('Échec du test');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 border border-teal-200/60 dark:border-teal-800/60">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Configuration du Proxy API Google Apps Script
              </h3>
              <p className="text-[11px] text-slate-500">
                Liaison sécurisée entre le frontend React et l'API distante
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 text-xs">
          {/* Current Mode Badge */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Mode d'exécution actuel :
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold font-mono text-[11px] ${
                  apiConfig?.isConfigured
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${apiConfig?.isConfigured ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                <span>{apiConfig?.mode || 'SANDBOX_SIMULATION'}</span>
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
              <span>Cible proxy :</span>
              <span className="font-mono text-slate-800 dark:text-slate-200 font-medium">
                {apiConfig?.apiUrlDisplay || 'Sandbox intégrée'}
              </span>
            </div>
          </div>

          {/* Connection Test Button */}
          <div>
            <button
              onClick={handleTestConnection}
              disabled={testing}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-teal-700 dark:hover:bg-teal-800 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
              <span>{testing ? 'Test de ping en cours...' : 'Tester la connexion avec l’API'}</span>
            </button>

            {pingResult && (
              <div
                className={`mt-2.5 p-3 rounded-xl border flex items-start gap-2 text-xs animate-in fade-in ${
                  pingResult.success
                    ? 'bg-emerald-50/60 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                    : 'bg-rose-50/60 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
                }`}
              >
                {pingResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-semibold">{pingResult.message}</p>
                  <p className="text-[10px] opacity-80 font-mono mt-0.5">Latence : {pingResult.duration}</p>
                </div>
              </div>
            )}
          </div>

          {/* How to configure API_URL */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-teal-600" />
              <span>Comment configurer votre URL Apps Script ?</span>
            </h4>
            <div className="space-y-1.5 text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
              <p>
                1. Dans les paramètres d'environnement de votre projet AI Studio, définissez la variable d'environnement :
              </p>
              <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-950 font-mono text-slate-900 dark:text-teal-300 text-[11px] border border-slate-200 dark:border-slate-800">
                API_URL="https://script.google.com/macros/s/VOTRE_DEPLOYMENT_ID/exec"
              </div>
              <p>
                2. Le backend Node.js transmet automatiquement toutes les requêtes (/auth/*, /client/*, /admin/*) avec passage du jeton Bearer et gestion des redirections CORS 302.
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="py-1.5 px-4 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
