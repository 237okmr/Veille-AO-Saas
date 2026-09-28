import React, { useState } from 'react';
import { KeyRound, Copy, Check, AlertCircle, X, ShieldCheck } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

interface PasswordGeneratedModalProps {
  isOpen: boolean;
  onClose: () => void;
  email: string;
  nom?: string;
  password: string;
  actionTitle?: string;
}

export const PasswordGeneratedModal: React.FC<PasswordGeneratedModalProps> = ({
  isOpen,
  onClose,
  email,
  nom,
  password,
  actionTitle = 'Nouveau Mot de Passe Généré'
}) => {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      toast.success('Copié !', 'Le mot de passe a été copié dans le presse-papiers.');
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      toast.error('Erreur', 'Impossible de copier automatiquement.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div 
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transform transition-all"
        role="dialog"
        aria-modal="true"
      >
        <div className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-emerald-100 dark:bg-emerald-950/50 rounded-xl">
                <KeyRound className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {actionTitle}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {nom ? `${nom} (${email})` : email}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Warning banner */}
          <div className="mt-5 p-3.5 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-900/60 flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800 dark:text-amber-300 space-y-1">
              <p className="font-bold">Attention : ce mot de passe ne sera plus jamais affiché !</p>
              <p>Copiez-le et transmettez-le immédiatement et de façon sécurisée à l'utilisateur.</p>
            </div>
          </div>

          {/* Password display box */}
          <div className="mt-5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Mot de passe généré :
            </label>
            <div className="flex items-center justify-between p-3.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-300 dark:border-slate-700">
              <span className="font-mono text-lg font-extrabold text-slate-900 dark:text-emerald-400 select-all tracking-wider">
                {password}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-all shadow-sm active:scale-95"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Copié</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copier</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Additional details */}
          <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl text-xs text-slate-600 dark:text-slate-400 space-y-1 border border-slate-100 dark:border-slate-800">
            <div className="flex justify-between">
              <span className="text-slate-500">Identifiant de connexion :</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">{email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Politique de sécurité :</span>
              <span className="font-medium text-emerald-600 dark:text-emerald-400 flex items-center space-x-1">
                <ShieldCheck className="w-3.5 h-3.5 inline" />
                <span>Hachage SHA-256 avec sel</span>
              </span>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 font-semibold text-sm rounded-xl transition-all shadow"
            >
              J'ai bien noté le mot de passe
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
