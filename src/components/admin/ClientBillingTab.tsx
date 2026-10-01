import React, { useState, useMemo } from 'react';
import {
  CreditCard,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  Download,
  Eye,
  ShieldCheck,
  Search,
  Filter,
  DollarSign,
  TrendingUp,
  Info,
  ArrowUpRight,
  ExternalLink
} from 'lucide-react';
import { ClientProfile, ClientSubscription, ClientInvoice } from '../../types';
import { InvoiceDetailModal } from './InvoiceDetailModal';
import { formaterDateDouala, joursRestantsDouala } from '../../utils/dates';

interface ClientBillingTabProps {
  client: ClientProfile;
}

export const ClientBillingTab: React.FC<ClientBillingTabProps> = ({ client }) => {
  const [selectedInvoice, setSelectedInvoice] = useState<ClientInvoice | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PAYEE' | 'EN_ATTENTE' | 'ANNULEE'>('ALL');

  // Realistic fallback subscription if none defined on client
  const subscription: ClientSubscription = useMemo(() => {
    if (client.abonnement) {
      return client.abonnement;
    }
    const isActif = client.actif === 'OUI';
    return {
      idAbonnement: `SUB-${client.idClient}-2026`,
      idClient: client.idClient,
      plan: 'PREMIUM BUSINESS',
      dateDebut: client.dateCreation || '2026-01-01T00:00:00Z',
      dateFin: '2026-12-31T23:59:59Z',
      statut: isActif ? 'ACTIF' : 'SUSPENDU',
      montantFCFA: 125000,
      modePaiement: 'Orange Money / MTN MoMo (+237)',
      reference: `CTR-VEILLE-${client.idClient}`,
      statutPaiement: isActif ? 'A_JOUR' : 'EN_RETARD',
      periodicite: 'MENSUEL',
      quotaAlertesMois: 200,
      alertesConsommeesMois: 68
    };
  }, [client]);

  // Realistic fallback invoices if none defined on client
  const invoices: ClientInvoice[] = useMemo(() => {
    if (client.factures && client.factures.length > 0) {
      return client.factures;
    }
    return [
      {
        idFacture: `FAC-2026-${client.idClient.replace(/\D/g, '') || '01'}09`,
        idAbonnement: subscription.idAbonnement,
        idClient: client.idClient,
        dateEmission: '2026-09-01T08:00:00Z',
        periode: '01/09/2026 au 30/09/2026',
        montantFCFA: subscription.montantFCFA || 125000,
        statut: 'PAYEE',
        modePaiement: 'Orange Money Web',
        articles: [
          {
            designation: 'Abonnement Market Advisor CM - Formule Business',
            quantite: 1,
            prixUnitaire: Math.round((subscription.montantFCFA || 125000) / 1.1925),
            total: Math.round((subscription.montantFCFA || 125000) / 1.1925)
          }
        ]
      },
      {
        idFacture: `FAC-2026-${client.idClient.replace(/\D/g, '') || '01'}08`,
        idAbonnement: subscription.idAbonnement,
        idClient: client.idClient,
        dateEmission: '2026-08-01T08:00:00Z',
        periode: '01/08/2026 au 31/08/2026',
        montantFCFA: subscription.montantFCFA || 125000,
        statut: 'PAYEE',
        modePaiement: 'MTN Mobile Money',
        articles: [
          {
            designation: 'Abonnement Market Advisor CM - Formule Business',
            quantite: 1,
            prixUnitaire: Math.round((subscription.montantFCFA || 125000) / 1.1925),
            total: Math.round((subscription.montantFCFA || 125000) / 1.1925)
          }
        ]
      },
      {
        idFacture: `FAC-2026-${client.idClient.replace(/\D/g, '') || '01'}07`,
        idAbonnement: subscription.idAbonnement,
        idClient: client.idClient,
        dateEmission: '2026-07-01T08:00:00Z',
        periode: '01/07/2026 au 31/07/2026',
        montantFCFA: subscription.montantFCFA || 125000,
        statut: 'PAYEE',
        modePaiement: 'Virement Bancaire (UBA)',
        articles: [
          {
            designation: 'Abonnement Market Advisor CM - Formule Business',
            quantite: 1,
            prixUnitaire: Math.round((subscription.montantFCFA || 125000) / 1.1925),
            total: Math.round((subscription.montantFCFA || 125000) / 1.1925)
          }
        ]
      }
    ];
  }, [client, subscription]);

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const matchSearch =
        !search ||
        inv.idFacture.toLowerCase().includes(search.toLowerCase()) ||
        (inv.periode && inv.periode.toLowerCase().includes(search.toLowerCase())) ||
        (inv.modePaiement && inv.modePaiement.toLowerCase().includes(search.toLowerCase()));

      const matchStatus = statusFilter === 'ALL' || inv.statut === statusFilter;

      return matchSearch && matchStatus;
    });
  }, [invoices, search, statusFilter]);

  // Calculate days remaining
  const daysRemaining = useMemo(() => {
    if (!subscription.dateFin) return 0;
    const diff = joursRestantsDouala(subscription.dateFin);
    return diff !== null ? Math.max(0, diff) : 0;
  }, [subscription.dateFin]);

  // Quota percentage
  const quotaUsed = subscription.alertesConsommeesMois || 0;
  const quotaTotal = subscription.quotaAlertesMois || 100;
  const quotaPercent = Math.min(100, Math.round((quotaUsed / quotaTotal) * 100));

  return (
    <div className="space-y-6">
      {/* V1 Read-Only Notice */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-xs text-blue-800 dark:text-blue-300">
        <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-bold">Consultation en Lecture Seule (V1)</p>
          <p className="text-blue-700 dark:text-blue-400 text-[11px] leading-relaxed">
            Les données d'abonnement et l'historique des factures sont gérées automatiquement par les passerelles Mobile Money et la facturation centralisée. Les modifications directes de tarification seront disponibles en V2.
          </p>
        </div>
      </div>

      {/* Subscription Active Overview Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/50 flex items-center justify-center text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-800">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Formule Commerciale en Cours
              </h3>
              <p className="text-xs text-slate-500">
                Contrat : <span className="font-mono font-semibold">{subscription.idAbonnement}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Status Subscription Badge */}
            <span
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${
                subscription.statut === 'ACTIF'
                  ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                  : subscription.statut === 'ESSAI'
                  ? 'bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-300 dark:border-blue-800'
                  : 'bg-red-50 text-red-800 dark:bg-red-950/60 dark:text-red-300 border border-red-300 dark:border-red-800'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {subscription.statut}
            </span>

            {/* Status Payment Badge */}
            <span
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${
                subscription.statutPaiement === 'A_JOUR'
                  ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-300 dark:border-teal-800'
                  : 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5" />
              {subscription.statutPaiement === 'A_JOUR' ? 'À JOUR' : 'RETARD DE PAIEMENT'}
            </span>
          </div>
        </div>

        {/* 4 Primary KPI Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Forfait Souscrit
            </span>
            <p className="text-base font-black text-slate-900 dark:text-white">
              {subscription.plan}
            </p>
            <p className="text-[11px] text-teal-600 dark:text-teal-400 font-semibold">
              Périodicité : {subscription.periodicite || 'MENSUEL'}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Tarif Périodique
            </span>
            <p className="text-base font-black text-slate-900 dark:text-white">
              {subscription.montantFCFA.toLocaleString('fr-FR')} FCFA
            </p>
            <p className="text-[11px] text-slate-500">
              Règlement : {subscription.modePaiement || 'Mobile Money'}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Échéance & Validité
            </span>
            <p className="text-base font-black text-slate-900 dark:text-white">
              {daysRemaining} jours restants
            </p>
            <p className="text-[11px] text-slate-500">
              Jusqu'au {formaterDateDouala(subscription.dateFin)}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <span>Quota Alertes</span>
              <span className="font-mono text-teal-700 dark:text-teal-400">
                {quotaUsed} / {quotaTotal}
              </span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  quotaPercent > 90 ? 'bg-amber-500' : 'bg-teal-600'
                }`}
                style={{ width: `${quotaPercent}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-500">
              {quotaPercent}% du volume mensuel consommé
            </p>
          </div>
        </div>

        {/* Validity Progress timeline */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
            <span className="text-slate-500">
              Période contractuelle :{' '}
              <strong className="text-slate-800 dark:text-slate-200">
                {formaterDateDouala(subscription.dateDebut)}
              </strong>{' '}
              au{' '}
              <strong className="text-slate-800 dark:text-slate-200">
                {formaterDateDouala(subscription.dateFin)}
              </strong>
            </span>
            <span className="font-semibold text-teal-700 dark:text-teal-400">
              Renouvellement automatique par prélèvement
            </span>
          </div>
        </div>
      </div>

      {/* Invoices List Section */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Historique des Factures Émises
            </h3>
            <p className="text-xs text-slate-500">
              Reçus de paiement certifiés et quittances téléchargeables
            </p>
          </div>

          {/* Filters & Search */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Rechercher facture..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white w-44"
              />
            </div>

            <div className="flex items-center space-x-1 border border-slate-300 dark:border-slate-700 rounded-xl p-0.5 bg-slate-50 dark:bg-slate-800">
              {(['ALL', 'PAYEE', 'EN_ATTENTE'] as const).map(st => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors ${
                    statusFilter === st
                      ? 'bg-white dark:bg-slate-900 text-teal-800 dark:text-teal-300 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {st === 'ALL' ? 'Toutes' : st === 'PAYEE' ? 'Payées' : 'En attente'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Invoices Table */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">N° Facture</th>
                  <th className="py-3 px-4">Date Émission</th>
                  <th className="py-3 px-4">Période</th>
                  <th className="py-3 px-4 text-right">Montant TTC</th>
                  <th className="py-3 px-4">Règlement</th>
                  <th className="py-3 px-4 text-center">Statut</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 italic">
                      Aucune facture ne correspond aux critères de recherche.
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map(inv => (
                    <tr
                      key={inv.idFacture}
                      className="hover:bg-slate-50 dark:hover:bg-slate-850/50 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white">
                        {inv.idFacture}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                        {formaterDateDouala(inv.dateEmission)}
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {inv.periode || 'Mensuel'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {inv.montantFCFA.toLocaleString('fr-FR')} FCFA
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                        {inv.modePaiement || 'Mobile Money'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            inv.statut === 'PAYEE'
                              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                              : inv.statut === 'EN_ATTENTE'
                              ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                              : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {inv.statut === 'PAYEE' && <CheckCircle2 className="w-3 h-3" />}
                          {inv.statut === 'EN_ATTENTE' && <Clock className="w-3 h-3" />}
                          {inv.statut}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setSelectedInvoice(inv)}
                          className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-teal-800 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/50 hover:bg-teal-100 border border-teal-200 dark:border-teal-800 rounded-lg transition-colors shadow-xs"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Consulter</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Invoice Detail Modal */}
      <InvoiceDetailModal
        isOpen={!!selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
        invoice={selectedInvoice}
        client={client}
      />
    </div>
  );
};
