import React, { useState, useEffect, useRef } from 'react';
import { TenderAlert, AlertNote } from '../../types';
import {
  X,
  Building,
  Clock,
  Banknote,
  Sparkles,
  Download,
  Bookmark,
  CheckCircle,
  XCircle,
  EyeOff,
  FileText,
  Save,
  Tag,
  ExternalLink,
  MessageSquare,
  Send,
  AlertCircle
} from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { formaterDateDouala, formaterDateHeureDouala } from '../../utils/dates';
import { lienSur } from '../../utils/liensSurs';

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

const RAISONS_IGNORER = [
  'Hors de mon secteur',
  'Trop gros pour nous',
  'Trop petit',
  'Hors de nos régions',
  'Déjà vu ou doublon',
  'Autre'
];

/**
 * Extrait la raison d'ignorer depuis la note client si elle existe.
 */
function extraireRaisonIgnorer(noteTexte?: string | null): string | null {
  if (!noteTexte) return null;
  const match = noteTexte.match(/\[Raison d['’]ignorer\]\s*([^\n\r]+)/i);
  return match ? match[1].trim() : null;
}

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

  // État du panneau « Pourquoi ignorer cette offre ? »
  const [showIgnorePanel, setShowIgnorePanel] = useState(false);
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [autreTexte, setAutreTexte] = useState<string>('');
  const [submittingIgnore, setSubmittingIgnore] = useState(false);
  const firstReasonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alert.idMatch]);

  // Gestion du focus et de la touche Échap
  useEffect(() => {
    if (showIgnorePanel) {
      firstReasonRef.current?.focus();
    }
  }, [showIgnorePanel]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showIgnorePanel) {
          e.stopPropagation();
          setShowIgnorePanel(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showIgnorePanel, onClose]);

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
    if (newState === 'IGNORE') {
      setShowIgnorePanel(true);
      return;
    }
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

  const handleConfirmIgnore = async (withReason: boolean) => {
    setSubmittingIgnore(true);
    try {
      let finalNote = note.trim();
      if (withReason && selectedReason) {
        const raisonDetail =
          selectedReason === 'Autre' && autreTexte.trim()
            ? `Autre - ${autreTexte.trim().slice(0, 200)}`
            : selectedReason;

        // Remplacement d'une éventuelle ancienne ligne de raison
        const regexRaison = /\n?\[Raison d['’]ignorer\].*$/i;
        if (regexRaison.test(finalNote)) {
          finalNote = finalNote.replace(regexRaison, '').trim();
        }

        finalNote = finalNote
          ? `${finalNote}\n[Raison d'ignorer] ${raisonDetail}`
          : `[Raison d'ignorer] ${raisonDetail}`;
      }

      const res = await api.markAlert({
        idMatch: alert.idMatch,
        etat: 'IGNORE',
        note: finalNote
      });

      if (res.donnees) {
        setState('IGNORE');
        setNote(finalNote);
        setShowIgnorePanel(false);
        onUpdate(res.donnees);
        toast.success(
          withReason && selectedReason
            ? `Offre ignorée (${selectedReason})`
            : 'Offre marquée comme ignorée'
        );
      }
    } catch (err: any) {
      toast.error('Erreur', err.message || 'Impossible d’ignorer l’offre');
    } finally {
      setSubmittingIgnore(false);
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
    return formaterDateDouala(iso);
  };

  const formatDateTime = (iso: string) => {
    return formaterDateHeureDouala(iso);
  };

  const decisionColor = (d: string) => {
    if (d === 'GO') return 'border-emerald-400 bg-emerald-50 text-emerald-700';
    if (d === 'NOGO') return 'border-rose-400 bg-rose-50 text-rose-700';
    return 'border-slate-300 bg-slate-50 text-slate-600';
  };

  const raisonIgnoree = extraireRaisonIgnorer(note);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-3xl rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in-95">
        {/* En-tête de la modale */}
        <div className="flex items-start justify-between p-6 border-b border-slate-200 bg-slate-50/70">
          <div className="space-y-1.5 pr-6">
            <div className="flex items-center gap-2 text-[0.8125rem] font-semibold text-slate-600">
              <span className="font-mono text-teal-700 font-bold">{alert.idAvis}</span>
              <span aria-hidden="true">·</span>
              <span>Région {alert.region}</span>
              <span aria-hidden="true">·</span>
              <span>Procédure {alert.procedure}</span>
            </div>
            <h3 className="text-base font-bold text-slate-900 leading-snug">
              {alert.titre}
            </h3>
            {state === 'IGNORE' && raisonIgnoree && (
              <div className="pt-1">
                <Badge ton="neutre" className="text-[0.8125rem]">
                  Ignorée : {raisonIgnoree}
                </Badge>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-200/60 transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Fermer la fenêtre"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Panneau contextuel : Pourquoi ignorer cette offre ? */}
          {showIgnorePanel && (
            <div
              className="p-5 rounded-2xl bg-amber-50/70 border border-amber-200 shadow-sm space-y-4 animate-in fade-in duration-150"
              role="region"
              aria-label="Pourquoi ignorer cette offre ?"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-[0.9375rem]">
                  <EyeOff className="w-5 h-5 text-amber-700 shrink-0" />
                  <h4>Pourquoi ignorer cette offre ?</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIgnorePanel(false)}
                  className="text-slate-400 hover:text-slate-700 p-1 rounded-lg cursor-pointer"
                  aria-label="Fermer le panneau des raisons"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-[0.875rem] text-slate-700 leading-relaxed">
                Préciser la raison nous permettra d'affiner votre profil de veille et d'améliorer la pertinence de vos futures alertes.
              </p>

              {/* Groupe de puces accessibles (Radio group) */}
              <div
                role="radiogroup"
                aria-label="Raisons d'ignorer"
                className="flex flex-wrap gap-2.5 pt-1"
              >
                {RAISONS_IGNORER.map((raison, index) => {
                  const isSelected = selectedReason === raison;
                  return (
                    <button
                      key={raison}
                      ref={index === 0 ? firstReasonRef : undefined}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setSelectedReason(raison)}
                      className={`min-h-[44px] px-3.5 py-2 rounded-xl text-[0.875rem] font-semibold border transition-all cursor-pointer flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
                        isSelected
                          ? 'bg-teal-700 text-white border-teal-700 shadow-xs ring-1 ring-teal-700'
                          : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100 hover:border-slate-400'
                      }`}
                    >
                      {raison}
                    </button>
                  );
                })}
              </div>

              {/* Champ texte libre conditionnel pour "Autre" */}
              {selectedReason === 'Autre' && (
                <div className="space-y-1.5 pt-1 animate-in fade-in">
                  <label htmlFor="autre-raison" className="block text-[0.875rem] font-medium text-slate-800">
                    Précisez la raison (optionnel, 200 caractères max) :
                  </label>
                  <input
                    id="autre-raison"
                    type="text"
                    maxLength={200}
                    value={autreTexte}
                    onChange={(e) => setAutreTexte(e.target.value)}
                    placeholder="Ex : Cahier des charges trop flou, délai de réponse trop court..."
                    className="w-full p-3 min-h-[44px] text-[0.875rem] rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600"
                  />
                  <span className="block text-right text-[0.8125rem] text-slate-500">
                    {autreTexte.length} / 200
                  </span>
                </div>
              )}

              {/* Actions du panneau */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-amber-200/80">
                <div className="flex flex-wrap items-center gap-2.5">
                  <Button
                    type="button"
                    variante="primaire"
                    taille="md"
                    disabled={submittingIgnore || !selectedReason}
                    onClick={() => handleConfirmIgnore(true)}
                  >
                    {submittingIgnore ? 'Enregistrement...' : "Ignorer l'offre"}
                  </Button>
                  <Button
                    type="button"
                    variante="secondaire"
                    taille="md"
                    disabled={submittingIgnore}
                    onClick={() => handleConfirmIgnore(false)}
                  >
                    Ignorer sans préciser
                  </Button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowIgnorePanel(false)}
                  className="text-[0.875rem] font-medium text-slate-600 hover:text-slate-900 underline min-h-[44px] px-2 flex items-center cursor-pointer"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {/* Grille des caractéristiques clés */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
              <div className="flex items-center gap-2 text-[0.8125rem] text-slate-500 mb-1">
                <Banknote className="w-4 h-4 text-teal-600" />
                <span>Budget Estimé</span>
              </div>
              <p className="text-[0.9375rem] font-bold font-mono text-slate-900 tabular-nums">
                {formatFcfa(alert.montantEstime)}
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
              <div className="flex items-center gap-2 text-[0.8125rem] text-slate-500 mb-1">
                <Clock className="w-4 h-4 text-amber-500" />
                <span>Date Limite de Dépôt</span>
              </div>
              <p className="text-[0.875rem] font-semibold text-slate-900">
                {formatDate(alert.dateLimite)}
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-teal-200 bg-teal-50/40 shadow-2xs">
              <div className="flex items-center justify-between text-[0.8125rem] text-teal-900 mb-1 font-semibold">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-teal-600" />
                  <span>Score de Pertinence</span>
                </div>
                <span className="font-bold font-mono text-base text-teal-800">{alert.scoreMatch}%</span>
              </div>
              <div className="w-full bg-teal-200 h-1.5 rounded-full overflow-hidden">
                <div className="bg-teal-600 h-full rounded-full" style={{ width: `${alert.scoreMatch}%` }} />
              </div>
            </div>
          </div>

          {/* Maître d'ouvrage et détails de publication */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
            <div className="flex items-center gap-2 text-[0.8125rem] font-semibold text-slate-700">
              <Building className="w-4 h-4 text-slate-500" />
              <span>Maître d’Ouvrage / Autorité Contractante :</span>
            </div>
            <p className="text-[0.9375rem] font-semibold text-slate-900">
              {alert.maitreOuvrage}
            </p>
            <div className="flex items-center gap-3 text-[0.8125rem] text-slate-600 pt-1">
              <span>Date de publication : {formatDate(alert.datePublication)}</span>
              {alert.secteur && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Secteur : {alert.secteur}</span>
                </>
              )}
            </div>
          </div>

          {/* Analyse de correspondance */}
          <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 space-y-2">
            <div className="flex items-center gap-2 text-[0.8125rem] font-bold text-amber-900">
              <Sparkles className="w-4 h-4 text-amber-700 shrink-0" />
              <span>Analyse de correspondance et critères :</span>
            </div>
            <p className="text-[0.875rem] text-slate-700 leading-relaxed">
              {alert.justificationIA}
            </p>
          </div>

          {/* Décision de soumission Go / No-Go */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3 shadow-2xs">
            <div className="flex items-center gap-2 text-[0.8125rem] font-bold text-slate-900">
              <Tag className="w-4 h-4 text-teal-700" />
              <span>Décision de soumission (Go / No-Go)</span>
              {alert.decisionPar && (
                <span className="ml-auto text-[0.8125rem] font-normal text-slate-500">
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
                  className={`min-h-[44px] flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-[0.8125rem] font-semibold border transition-colors cursor-pointer ${
                    decision === d.value ? decisionColor(d.value) : 'border-slate-200 text-slate-600 hover:border-slate-300'
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
              className="w-full p-3 text-[0.8125rem] rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600/30 focus:border-teal-600 transition-colors"
            />

            <input
              type="text"
              value={decisionLien}
              onChange={(e) => setDecisionLien(e.target.value)}
              placeholder="Lien complémentaire (dossier interne, pièce jointe, etc.) — optionnel"
              className="w-full p-2.5 min-h-[44px] text-[0.8125rem] rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600/30 focus:border-teal-600 transition-colors"
            />

            <div className="flex justify-end">
              <Button
                type="button"
                variante="primaire"
                taille="sm"
                onClick={handleSaveDecision}
                disabled={savingDecision}
                iconeGauche={Save}
              >
                {savingDecision ? 'Enregistrement...' : 'Enregistrer la décision'}
              </Button>
            </div>
          </div>

          {/* Note interne */}
          <div className="space-y-2">
            <label className="flex items-center justify-between text-[0.8125rem] font-semibold text-slate-700">
              <span className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                <span>Note interne d'équipe / Suivi de soumission</span>
              </span>
              {savingNote && <span className="text-[0.8125rem] text-teal-600">Enregistrement...</span>}
            </label>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ajoutez des notes stratégiques (ex: sous-traitant identifié, dossier d'offre en cours de montage...)..."
              className="w-full p-3 text-[0.8125rem] rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600/30 focus:border-teal-600 transition-colors"
            />
            <div className="flex justify-end">
              <Button
                type="button"
                variante="secondaire"
                taille="sm"
                onClick={handleSaveNote}
                disabled={savingNote}
                iconeGauche={Save}
              >
                Sauvegarder la note
              </Button>
            </div>
          </div>

          {/* Fil de discussion d'équipe */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[0.8125rem] font-bold text-slate-900">
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
                className="flex-1 p-2.5 min-h-[44px] text-[0.8125rem] rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600/30 focus:border-teal-600 transition-colors"
              />
              <button
                type="button"
                onClick={handleAddNote}
                disabled={addingNote || !newNoteText.trim()}
                className="flex items-center justify-center min-h-[44px] min-w-[44px] p-2.5 rounded-xl text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 transition-colors shrink-0 cursor-pointer"
                aria-label="Envoyer la note"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-52 overflow-y-auto">
              {notesLoading ? (
                <p className="text-[0.8125rem] text-slate-400 text-center py-3">Chargement des notes...</p>
              ) : notes.length === 0 ? (
                <p className="text-[0.8125rem] text-slate-400 text-center py-3">Aucune note pour le moment.</p>
              ) : (
                notes.map((n) => (
                  <div key={n.idNote} className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-[0.8125rem]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-slate-700">{n.auteurEmail}</span>
                      <span className="text-[0.8125rem] text-slate-400">{formatDate(n.dateCreation)}</span>
                    </div>
                    <p className="text-slate-600 leading-relaxed">{n.texte}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Barre inférieure des actions d'état et DAO */}
          <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-slate-100">
              <button
                type="button"
                onClick={() => handleStateChange('NOUVEAU')}
                className={`min-h-[44px] py-1.5 px-3 rounded-lg text-[0.8125rem] font-medium transition-colors cursor-pointer ${
                  state === 'NOUVEAU'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Nouveau
              </button>
              <button
                type="button"
                onClick={() => handleStateChange('SAUVEGARDE')}
                className={`min-h-[44px] flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-[0.8125rem] font-medium transition-colors cursor-pointer ${
                  state === 'SAUVEGARDE'
                    ? 'bg-white text-amber-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Bookmark className="w-3.5 h-3.5" />
                <span>Sauvegarder</span>
              </button>
              <button
                type="button"
                onClick={() => handleStateChange('TRAITE')}
                className={`min-h-[44px] flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-[0.8125rem] font-medium transition-colors cursor-pointer ${
                  state === 'TRAITE'
                    ? 'bg-white text-emerald-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Traité</span>
              </button>
              <button
                type="button"
                onClick={() => handleStateChange('IGNORE')}
                className={`min-h-[44px] flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-[0.8125rem] font-medium transition-colors cursor-pointer ${
                  state === 'IGNORE'
                    ? 'bg-white text-slate-700 font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <EyeOff className="w-3.5 h-3.5" />
                <span>Ignorer</span>
              </button>
            </div>

            {(() => {
              const lienDaoSur = lienSur(alert.lienDao);
              return lienDaoSur ? (
                <a
                  href={lienDaoSur}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 min-h-[44px] py-2 px-4 rounded-xl text-[0.8125rem] font-semibold text-white bg-teal-700 hover:bg-teal-800 transition-colors shadow-xs"
                >
                  <Download className="w-4 h-4" />
                  <span>Télécharger le DAO Officiel</span>
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => toast.info('Avis officiel', 'Le lien vers le DAO sera disponible dès publication du complément par l’ARMP.')}
                  className="flex items-center gap-2 min-h-[44px] py-2 px-4 rounded-xl text-[0.8125rem] font-semibold text-teal-800 border border-teal-300 hover:bg-teal-50 transition-colors cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Consulter sur ARMP</span>
                </button>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
};
