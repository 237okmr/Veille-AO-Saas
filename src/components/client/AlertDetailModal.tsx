import React, { useState } from 'react';
import { TenderAlert } from '../../types';
import {
  X,
  Building,
  MapPin,
  Calendar,
  Banknote,
  Sparkles,
  Download,
  Bookmark,
  CheckCircle,
  EyeOff,
  Clock,
  FileText,
  Save,
  Tag,
  ExternalLink
} from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';

interface AlertDetailModalProps {
  alert: TenderAlert;
  onClose: () => void;
  onUpdate: (updated: TenderAlert) => void;
}

export const AlertDetailModal: React.FC<AlertDetailModalProps> = ({ alert, onClose, onUpdate }) => {
  const [note, setNote] = useState(alert.noteClient || '');
  const [savingNote, setSavingNote] = useState(false);
  const [state, setState] = useState(alert.etat);
  const toast = useToast();

  const handleStateChange = async (newState: TenderAlert['etat']) => {
    try {
      const res = await api.markAlert({ idMatch: alert.idMatch, etat: newState, note });
      if (res.donnees) {
        setState(newState);
        onUpdate(res.donnees);
        toast.success(`Alerte marquée comme ${newState}`);
      }
    } catch (err: any) {
      toast.error('Erreur', err.message);
    }
  };

  const handleSaveNote = async () => {
    setSavingNote(true);
    try {
      const res = await api.markAlert({ idMatch: alert.idMatch, etat: state, note });
      if (res.donnees) {
        onUpdate(res.donnees);
        toast.success('Note enregistrée');
      }
    } catch (err: any) {
      toast.error('Erreur', err.message);
    } finally {
      setSavingNote(false);
    }
  };

  const formatFcfa = (val: number) => {
    return new Intl.NumberFormat('fr-FR').format(val) + ' FCFA';
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
          <div className="space-y-1 pr-6">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <span className="font-mono text-teal-700 dark:text-teal-400 font-bold">{alert.idAvis}</span>
              <span aria-hidden="true">·</span>
              <span>Région {alert.region}</span>
              <span aria-hidden="true">·</span>
              <span>Procédure {alert.procedure}</span>
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white leading-snug">
              {alert.titre}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1">
                <Banknote className="w-3.5 h-3.5 text-teal-600" />
                <span>Budget Estimé</span>
              </div>
              <p className="text-sm font-bold font-mono text-slate-900 dark:text-white tabular-nums">
                {formatFcfa(alert.montantEstime)}
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1">
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                <span>Date Limite de Dépôt</span>
              </div>
              <p className="text-xs font-semibold text-slate-900 dark:text-white">
                {formatDate(alert.dateLimite)}
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-teal-200 dark:border-teal-800/60 bg-teal-50/40 dark:bg-teal-950/30">
              <div className="flex items-center justify-between text-xs text-teal-800 dark:text-teal-300 mb-1 font-semibold">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                  <span>Score Ciblage IA</span>
                </div>
                <span className="font-bold font-mono text-base">{alert.scoreMatch}%</span>
              </div>
              <div className="w-full bg-teal-200 dark:bg-teal-900 h-1.5 rounded-full overflow-hidden">
                <div className="bg-teal-600 h-full rounded-full" style={{ width: `${alert.scoreMatch}%` }} />
              </div>
            </div>
          </div>

          {/* Maître d'Ouvrage info */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <Building className="w-4 h-4 text-slate-500" />
              <span>Maître d’Ouvrage / Autorité Contractante :</span>
            </div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {alert.maitreOuvrage}
            </p>
            <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 pt-1">
              <span>Date de publication : {formatDate(alert.datePublication)}</span>
              {alert.secteur && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Secteur : {alert.secteur}</span>
                </>
              )}
            </div>
          </div>

          {/* AI Justification Section */}
          <div className="p-4 rounded-xl border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-300">
              <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>Analyse et Justification de l'Intelligence Artificielle :</span>
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              {alert.justificationIA}
            </p>
          </div>

          {/* Client Note Area */}
          <div className="space-y-2">
            <label className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                <span>Note interne d'équipe / Suivi de soumission</span>
              </span>
              {savingNote && <span className="text-[11px] text-teal-600">Enregistrement...</span>}
            </label>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ajoutez des notes stratégiques (ex: sous-traitant identifié, dossier d'offre en cours de montage chez M. Dupont, etc.)..."
              className="w-full p-3 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600/30 focus:border-teal-600 transition-colors"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveNote}
                disabled={savingNote}
                className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium text-white bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Sauvegarder la note</span>
              </button>
            </div>
          </div>

          {/* Actions Bar */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            {/* States buttons */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
              <button
                onClick={() => handleStateChange('NOUVEAU')}
                className={`py-1.5 px-3 rounded-lg text-xs font-medium transition-colors ${
                  state === 'NOUVEAU'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Nouveau
              </button>
              <button
                onClick={() => handleStateChange('SAUVEGARDE')}
                className={`flex items-center gap-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors ${
                  state === 'SAUVEGARDE'
                    ? 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Bookmark className="w-3.5 h-3.5" />
                <span>Sauvegarder</span>
              </button>
              <button
                onClick={() => handleStateChange('TRAITE')}
                className={`flex items-center gap-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors ${
                  state === 'TRAITE'
                    ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Traité</span>
              </button>
              <button
                onClick={() => handleStateChange('IGNORE')}
                className={`flex items-center gap-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors ${
                  state === 'IGNORE'
                    ? 'bg-white dark:bg-slate-900 text-slate-500 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <EyeOff className="w-3.5 h-3.5" />
                <span>Ignorer</span>
              </button>
            </div>

            {/* DAO download */}
            {alert.lienDao ? (
              <a
                href={alert.lienDao}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 py-2 px-4 rounded-xl text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 transition-colors shadow-xs"
              >
                <Download className="w-4 h-4" />
                <span>Télécharger le DAO Officiel</span>
              </a>
            ) : (
              <button
                onClick={() => toast.info('Avis officiel', 'Le lien vers le DAO sera disponible dès publication du complément par l’ARMP.')}
                className="flex items-center gap-2 py-2 px-4 rounded-xl text-xs font-semibold text-teal-700 dark:text-teal-300 border border-teal-300 dark:border-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/40 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Consulter sur ARMP</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
