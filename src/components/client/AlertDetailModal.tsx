import React, { useState, useEffect } from 'react';
import { TenderAlert, AlertNote } from '../../types';
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
  XCircle,
  EyeOff,
  Clock,
  FileText,
  Save,
  Tag,
  ExternalLink,
  MessageSquare,
  Send
} from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';

interface AlertDetailModalProps {
  alert: TenderAlert;
  onClose: () => void;
  onUpdate: (updated: TenderAlert) => void;
}

const DECISIONS: { value: 'GO' | 'NOGO' | 'EN_ATTENTE'; label: string }[] = [
  { value: 'EN_ATTENTE', label: 'En attente' },
  { value: 'GO', label: 'GO' },
  { value: 'NOGO', label: 'NO-GO' }
];

export const AlertDetailModal: React.FC<AlertDetailModalProps> = ({ alert, onClose, onUpdate }) => {
  const [note, setNote] = useState(alert.noteClient || '');
  const [savingNote, setSavingNote] = useState(false);
  const [state, setState] = useState(alert.etat);
  const toast = useToast();

  const [decision, setDecision] = useState<'GO' | 'NOGO' | 'EN_ATTENTE'>(alert.decision || 'EN_ATTENTE');
  const [decisionJustification, setDecisionJustification] = useState(alert.decisionJustification || '');
  const [decisionLien, setDecisionLien] = useState(alert.decisionLienComplementaire || '');
  const [savingDecision, setSavingDecision] = useState(false);

  const [notes, setNotes] = useState<AlertNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [newNoteText, setNewNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  useEffect(() => {
    loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alert.idMatch]);

  const loadNotes = async () => {
    setNotesLoading(true);
    try {
      const res = await api.getAlertNotes(alert.idMatch);
      setNotes(res.donnees?.notes || []);
    } catch (err: any) {
      toast.error('Erreur', err.message);
    } finally {
      setNotesLoading(false);
    }
  };

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

  const handleSaveDecision = async () => {
    setSavingDecision(true);
    try {
      const res = await api.setAlertDecision({
        idMatch: alert.idMatch,
        decision,
        justification: decisionJustification,
        lienDaoComplementaire: decisionLien
      });
      if (res.donnees) {
        onUpdate({
          ...alert,
          decision: res.donnees.decision as 'GO' | 'NOGO' | 'EN_ATTENTE',
          decisionJustification: res.donnees.decisionJustification,
          decisionLienComplementaire: res.donnees.decisionLienComplementaire,
          decisionPar: res.donnees.decisionPar,
          dateDecision: res.donnees.dateDecision
        });
        toast.success('Décision enregistrée', `Statut : ${res.donnees.decision}`);
      }
    } catch (err: any) {
      toast.error('Erreur', err.message);
    } finally {
      setSavingDecision(false);
    }
  };

  const handleAddNote = async () => {
    const texte = newNoteText.trim();
    if (!texte) return;
    setAddingNote(true);
    try {
      const res = await api.addAlertNote({ idMatch: alert.idMatch, texte });
      if (res.donnees?.note) {
        setNotes((prev) => [res.donnees!.note, ...prev]);
        setNewNoteText('');
        toast.success('Note ajoutée');
      }
    } catch (err: any) {
      toast.error('Erreur', err.message);
    } finally {
      setAddingNote(false);
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

  const decisionColor = (d: string) => {
    if (d === 'GO') return 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300';
    if (d === 'NOGO') return 'border-rose-400 bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300';
    return 'border-slate-300 bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in-95">
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

          <div className="p-4 rounded-xl border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-300">
              <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>Analyse et Justification de l'Intelligence Artificielle :</span>
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              {alert.justificationIA}
            </p>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
              <Tag className="w-4 h-4 text-teal-700" />
              <span>Décision de soumission (Go / No-Go)</span>
              {alert.decisionPar && (
                <span className="ml-auto text-[10px] font-normal text-slate-400">
                  Dernière décision par {alert.decisionPar}
                  {alert.dateDecision ? ` · ${formatDate(alert.dateDecision)}` : ''}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {DECISIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDecision(d.value)}
                  className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold border transition-colors ${
                    decision === d.value ? decisionColor(d.value) : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {d.value === 'GO' && <CheckCircle className="w-3.5 h-3.5" />}
                  {d.value === 'NOGO' && <XCircle className="w-3.5 h-3.5" />}
                  <span>{d.label}</span>
                </button>
              ))}
            </div>

            <textarea
              rows={2}
              value={decisionJustification}
              onChange={(e) => setDecisionJustification(e.target.value)}
              placeholder="Justification de la décision (ex : capacité technique insuffisante, marge trop faible, partenaire identifié...)"
              className="w-full p-3 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600/30 focus:border-teal-600 transition-colors"
            />

            <input
              type="text"
              value={decisionLien}
              onChange={(e) => setDecisionLien(e.target.value)}
              placeholder="Lien complémentaire (dossier interne, pièce jointe, etc.) — optionnel"
              className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600/30 focus:border-teal-600 transition-colors"
            />

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveDecision}
                disabled={savingDecision}
                className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingDecision ? 'Enregistrement...' : 'Enregistrer la décision'}</span>
              </button>
            </div>
          </div>

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

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
              <MessageSquare className="w-4 h-4 text-slate-500" />
              <span>Fil de notes de l'équipe ({notes.length})</span>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !addingNote) handleAddNote(); }}
                placeholder="Ajouter une note horodatée au fil de discussion interne..."
                className="flex-1 p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600/30 focus:border-teal-600 transition-colors"
              />
              <button
                type="button"
                onClick={handleAddNote}
                disabled={addingNote || !newNoteText.trim()}
                className="flex items-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 transition-colors shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-2 max-h-52 overflow-y-auto">
              {notesLoading ? (
                <p className="text-[11px] text-slate-400 text-center py-3">Chargement des notes...</p>
              ) : notes.length === 0 ? (
                <p className="text-[11px] text-slate-400 text-center py-3">Aucune note pour le moment.</p>
              ) : (
                notes.map((n) => (
                  <div key={n.idNote} className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{n.auteurEmail}</span>
                      <span className="text-[10px] text-slate-400">{formatDate(n.dateCreation)}</span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{n.texte}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
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
