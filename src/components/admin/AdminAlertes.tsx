import React, { useState, useEffect, useCallback } from 'react';
import { Building2, Bell, RefreshCw, AlertCircle, ArrowRight, Sparkles } from 'lucide-react';
import { api } from '../../services/api';
import { ClientProfile } from '../../types';
import { useToast } from '../../context/ToastContext';
import { ClientAlertsTab } from './tabs/ClientAlertsTab';

interface AdminAlertesProps {
  onNavigate: (view: string) => void;
}

export const AdminAlertes: React.FC<AdminAlertesProps> = ({ onNavigate }) => {
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const loadClients = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAdminClients({ limit: 100 });
      if (res.donnees?.clients) {
        const sorted = [...res.donnees.clients].sort((a, b) => {
          const nomA = a.nom || a.nomEntreprise || '';
          const nomB = b.nom || b.nomEntreprise || '';
          return nomA.localeCompare(nomB, 'fr', { sensitivity: 'base' });
        });
        setClients(sorted);
        if (sorted.length === 1) {
          setSelectedClientId(sorted[0].idClient);
        }
      } else {
        setClients([]);
      }
    } catch (err: any) {
      const msg = err?.message || 'Impossible de charger la liste des entreprises clientes.';
      setError(msg);
      toast.error('Erreur chargement clients', msg);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const selectedClient = clients.find((c) => c.idClient === selectedClientId);
  const selectedClientNom = selectedClient?.nom || selectedClient?.nomEntreprise || 'Entreprise cliente';

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl bg-white text-slate-900 border border-slate-200/90 shadow-xs">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-teal-50 text-teal-800 border border-teal-200/60">
              <Bell className="w-3.5 h-3.5 text-teal-700" />
              Supervision des alertes
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Alertes des entreprises clientes
          </h2>
          <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
            Choisissez une entreprise pour consulter, filtrer et exporter ses alertes.
          </p>
        </div>

        {/* Client Selector Box in Header */}
        <div className="w-full sm:w-auto min-w-[280px]">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 animate-pulse">
              <div className="w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
              <span>Chargement des entreprises...</span>
            </div>
          ) : error ? (
            <button
              type="button"
              onClick={loadClients}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Réessayer le chargement</span>
            </button>
          ) : clients.length > 0 ? (
            <div className="space-y-1">
              <label htmlFor="client-select" className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Entreprise cliente
              </label>
              <div className="relative">
                <select
                  id="client-select"
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className="w-full pl-3 pr-8 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600 cursor-pointer shadow-2xs"
                >
                  <option value="">-- Sélectionner une entreprise ({clients.length}) --</option>
                  {clients.map((c) => (
                    <option key={c.idClient} value={c.idClient}>
                      {c.nom || c.nomEntreprise || c.idClient}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-medium text-slate-600">Chargement des données clients...</p>
        </div>
      ) : error ? (
        <div className="p-8 text-center bg-white rounded-2xl border border-rose-200 shadow-xs space-y-4">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-900">Erreur de chargement</h3>
            <p className="text-xs text-slate-600 max-w-md mx-auto">{error}</p>
          </div>
          <button
            type="button"
            onClick={loadClients}
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-semibold transition-all shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-teal-600"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Réessayer</span>
          </button>
        </div>
      ) : clients.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <Building2 className="w-12 h-12 text-slate-300 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-900">Aucune entreprise cliente pour le moment</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Créez une première entreprise cliente pour configurer ses critères de veille et consulter ses alertes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('admin-clients')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-semibold transition-all shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-teal-600"
          >
            <span>Aller aux Entreprises clientes</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : !selectedClientId ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center mx-auto text-teal-700">
            <Building2 className="w-7 h-7" />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h3 className="text-base font-bold text-slate-900">Sélectionnez une entreprise cliente</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Veuillez sélectionner une entreprise dans le menu déroulant ci-dessus pour afficher l'historique de ses alertes ARMP et marchés attribués.
            </p>
          </div>
          <div className="pt-2 flex flex-wrap justify-center gap-2 max-w-2xl mx-auto">
            {clients.slice(0, 6).map((c) => (
              <button
                key={c.idClient}
                type="button"
                onClick={() => setSelectedClientId(c.idClient)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-teal-50 hover:border-teal-300 text-slate-700 hover:text-teal-900 text-xs font-medium transition-all cursor-pointer"
              >
                <Sparkles className="w-3 h-3 text-teal-600" />
                <span>{c.nom || c.nomEntreprise || c.idClient}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <ClientAlertsTab
          key={selectedClientId}
          clientId={selectedClientId}
          clientNom={selectedClientNom}
        />
      )}
    </div>
  );
};
