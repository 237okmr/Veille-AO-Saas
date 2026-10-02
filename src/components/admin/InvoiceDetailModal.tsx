import React, { useRef } from 'react';
import {
  X,
  Printer,
  Download,
  CheckCircle2,
  Clock,
  AlertCircle,
  Building2,
  FileText,
  Mail,
  Phone,
  ShieldCheck,
  Calendar
} from 'lucide-react';
import { ClientInvoice, ClientProfile } from '../../types';
import { formaterDateDouala } from '../../utils/dates';

interface InvoiceDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: ClientInvoice | null;
  client: ClientProfile;
}

export const InvoiceDetailModal: React.FC<InvoiceDetailModalProps> = ({
  isOpen,
  onClose,
  invoice,
  client
}) => {
  const printRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !invoice) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadStub = () => {
    // Generates a clean text/JSON or trigger browser print
    window.print();
  };

  const statusBadge = () => {
    switch (invoice.statut) {
      case 'PAYEE':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5" />
            PAYÉE
          </span>
        );
      case 'EN_ATTENTE':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
            <Clock className="w-3.5 h-3.5" />
            EN ATTENTE DE RÈGLEMENT
          </span>
        );
      case 'ANNULEE':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
            <AlertCircle className="w-3.5 h-3.5" />
            ANNULÉE
          </span>
        );
    }
  };

  const montantHT = Math.round(invoice.montantFCFA / 1.1925);
  const montantTVA = invoice.montantFCFA - montantHT;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn overflow-y-auto">
      <div className="w-full max-w-3xl my-6 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header Actions Bar */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center space-x-2">
            <FileText className="w-5 h-5 text-teal-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Facture #{invoice.idFacture}
              </h3>
              <p className="text-[11px] text-slate-500">
                Émise le {formaterDateDouala(invoice.dateEmission)}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 transition-colors shadow-xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimer</span>
            </button>
            <button
              onClick={handleDownloadStub}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Invoice Printable Document Body */}
        <div ref={printRef} className="p-6 sm:p-8 space-y-6 overflow-y-auto bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
          {/* Top Brand & Status */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-teal-600 flex items-center justify-center text-white font-black text-sm">
                  VP
                </div>
                <span className="text-lg font-black tracking-tight text-slate-900 dark:text-white">
                  VEILLE PRO CAMEROUN
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Plateforme d'Analyse des Marchés Publics & Veille Stratégique
              </p>
              <p className="text-[11px] text-slate-400">
                Douala / Yaoundé · République du Cameroun · RC/DLA/2026/B/102
              </p>
            </div>

            <div className="text-left sm:text-right space-y-1.5">
              {statusBadge()}
              <div className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                FACTURE N° {invoice.idFacture}
              </div>
              <div className="text-xs text-slate-500">
                Date : {formaterDateDouala(invoice.dateEmission)}
              </div>
            </div>
          </div>

          {/* Client & Billing Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Facturé à :
              </span>
              <p className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-teal-600 shrink-0" />
                {client.nomEntreprise || client.nom}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                {client.emailDestinataire}
              </p>
              <p className="text-xs text-slate-500">
                Identifiant Client : <span className="font-mono font-semibold">{client.idClient}</span>
              </p>
            </div>

            <div className="space-y-1 sm:text-right">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Détails du Règlement :
              </span>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Mode : {invoice.modePaiement || 'Mobile Money / Virement'}
              </p>
              {invoice.periode && (
                <p className="text-xs text-slate-500 flex sm:justify-end items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  Période : {invoice.periode}
                </p>
              )}
              {invoice.idAbonnement && (
                <p className="text-xs text-slate-500 font-mono">
                  Réf Contrat : {invoice.idAbonnement}
                </p>
              )}
            </div>
          </div>

          {/* Articles Table */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-4">Désignation des Prestations</th>
                  <th className="py-2.5 px-3 text-center">Qté</th>
                  <th className="py-2.5 px-3 text-right">Prix Unitaire</th>
                  <th className="py-2.5 px-4 text-right">Total HT (FCFA)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(invoice.articles && invoice.articles.length > 0) ? (
                  invoice.articles.map((art, idx) => (
                    <tr key={idx}>
                      <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">
                        {art.designation}
                      </td>
                      <td className="py-3 px-3 text-center text-slate-600 dark:text-slate-400">
                        {art.quantite}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-600 dark:text-slate-400">
                        {art.prixUnitaire.toLocaleString('fr-FR')}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                        {art.total.toLocaleString('fr-FR')}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">
                      Abonnement Plateforme Market Advisor CM ({invoice.periode || 'Mensuel'})
                    </td>
                    <td className="py-3 px-3 text-center text-slate-600 dark:text-slate-400">1</td>
                    <td className="py-3 px-3 text-right text-slate-600 dark:text-slate-400">
                      {montantHT.toLocaleString('fr-FR')}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                      {montantHT.toLocaleString('fr-FR')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Totals Summary */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-2">
            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 max-w-sm">
              <span className="font-bold text-slate-700 dark:text-slate-300 block mb-0.5">
                Note de conformité fiscale :
              </span>
              TVA appliquée conformément au Code Général des Impôts du Cameroun (Taux légal normal de 19,25%).
            </div>

            <div className="w-full sm:w-64 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-500">
                <span>Total Hors Taxe :</span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  {montantHT.toLocaleString('fr-FR')} FCFA
                </span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>TVA (19,25%) :</span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  {montantTVA.toLocaleString('fr-FR')} FCFA
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-800 text-sm font-bold text-slate-900 dark:text-white">
                <span>Total TTC :</span>
                <span className="font-mono text-teal-700 dark:text-teal-400">
                  {invoice.montantFCFA.toLocaleString('fr-FR')} FCFA
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-850 border-t border-slate-200 dark:border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-xl transition-colors shadow-xs"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
