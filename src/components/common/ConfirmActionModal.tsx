import React, { useState, useEffect } from 'react';
import { AlertTriangle, X, ShieldAlert, CheckCircle2 } from 'lucide-react';

interface ConfirmActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string | React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'danger' | 'warning' | 'primary';
  level?: 1 | 2;
  requiredInputWord?: string;
  loading?: boolean;
}

export const ConfirmActionModal: React.FC<ConfirmActionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirmer',
  cancelText = 'Annuler',
  confirmVariant = 'danger',
  level = 1,
  requiredInputWord = 'CONFIRMER',
  loading = false
}) => {
  const [inputWord, setInputWord] = useState('');

  useEffect(() => {
    if (isOpen) {
      setInputWord('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isLevel2 = level === 2;
  const isInputValid = !isLevel2 || inputWord.trim().toUpperCase() === requiredInputWord.toUpperCase();

  const handleConfirm = () => {
    if (isInputValid && !loading) {
      onConfirm();
    }
  };

  const variantStyles = {
    danger: {
      icon: <ShieldAlert className="w-6 h-6 text-red-600 dark:text-red-400" />,
      iconBg: 'bg-red-100 dark:bg-red-950/50',
      btn: 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500 disabled:opacity-50'
    },
    warning: {
      icon: <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />,
      iconBg: 'bg-amber-100 dark:bg-amber-950/50',
      btn: 'bg-amber-600 hover:bg-amber-700 text-white focus:ring-amber-500 disabled:opacity-50'
    },
    primary: {
      icon: <CheckCircle2 className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />,
      iconBg: 'bg-indigo-100 dark:bg-indigo-950/50',
      btn: 'bg-indigo-600 hover:bg-indigo-700 text-white focus:ring-indigo-500 disabled:opacity-50'
    }
  }[confirmVariant];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div 
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transform transition-all"
        role="dialog"
        aria-modal="true"
      >
        <div className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <div className={`p-3 rounded-xl ${variantStyles.iconBg}`}>
                {variantStyles.icon}
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {title}
                </h3>
                <span className={`inline-flex items-center px-2 py-0.5 mt-1 rounded text-xs font-semibold ${
                  isLevel2 
                    ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}>
                  {isLevel2 ? 'Confirmation Niveau 2 (Saisie requise)' : 'Confirmation requise'}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={loading}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {description}
          </div>

          {isLevel2 && (
            <div className="mt-5 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Pour valider cette action critique, veuillez taper <span className="font-bold text-slate-900 dark:text-white font-mono bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600">{requiredInputWord}</span> ci-dessous :
              </label>
              <input
                type="text"
                value={inputWord}
                onChange={(e) => setInputWord(e.target.value)}
                placeholder={`Tapez "${requiredInputWord}"`}
                disabled={loading}
                autoFocus
                className="w-full px-3 py-2 text-sm font-mono border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          )}

          <div className="mt-6 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!isInputValid || loading}
              className={`px-5 py-2 text-sm font-semibold rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 ${variantStyles.btn}`}
            >
              {loading ? (
                <span className="flex items-center space-x-2">
                  <span className="w-4 h-4 border-2 border-white/60 border-t-white rounded-full animate-spin" />
                  <span>Traitement...</span>
                </span>
              ) : (
                confirmText
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
