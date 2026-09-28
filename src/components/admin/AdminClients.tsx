import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { ClientProfile } from '../../types';
import {
  Search,
  Plus,
  Edit2,
  Power,
  RotateCw,
  ExternalLink
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { ClientDetailView } from './ClientDetailView';
import { ClientCreateWizardModal } from './ClientCreateWizardModal';

const formatList = (val: any, fallback = 'Toutes'): string => {
  if (!val) return fallback;
  if (Array.isArray(val)) {
    return val.length > 0 ? val.join(', ') : fallback;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    return trimmed ? trimmed : fallback;
  }
  return String(val);
};

export const AdminClients: React.FC = () => {
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    loadClients();
  }, [search, activeFilter]);

  const loadClients = async () => {
    setLoading(true);
    try {
      const res = await api.getAdminClients({
        search: search || undefined,
        actif: activeFilter || undefined
      });
      if (res.donnees) {
        setClients(res.donnees.clients || []);
      }
    } catch (e: any) {
      toast.error('Erreur', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (client: ClientProfile) => {
    const nextStatus = client.actif === 'OUI' ? 'NON' : 'OUI';
    try {
      const res = await api.toggleAdminClient(client.idClient, nextStatus);
      if (res.donnees) {
        setClients((prev) => prev.map((c) => (c.idClient === client.idClient ? res.donnees : c)));
        toast.success(`Client ${client.nom} ${nextStatus === 'OUI' ? 'activé' : 'désactivé'}`);
      }
    } catch (e: any) {
      toast.error('Erreur', e.message);
    }
  };

  const handleRegenerateAi = async (client: ClientProfile) => {
    try {
      toast.info('Régénération IA lancée...', `Recalcul du profil sémantique pour ${client.nom}`);
      const res = await api.regenerateAdminClientAi(client.idClient);
      if (res.donnees) {
        setClients((prev) => prev.map((c) => (c.idClient === client.idClient ? res.donnees : c)));
        toast.success('Profil IA régénéré', `Nouvelle signature calculée pour ${client.nom}`);
      }
    } catch (e: any) {
      toast.error('Erreur', e.message);
    }
  };

  const formatFcfa = (val: any) => {
    const num = Number(val);
    if (!val || isNaN(num) || num <= 0) return 'Non défini';
    if (num >= 1000000000) return (num / 1000000000).toFixed(1) + ' Md FCFA';
    if (num >= 1000000) return (num / 1000000).toFixed(0) + ' M FCFA';
    return new Intl.NumberFormat('fr-FR').format(num) + ' FCFA';
  };

  if (selectedClientId) {
    return (
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <ClientDetailView
          clientId={selectedClientId}
          onBack={() => {
            setSelectedClientId(null);
            loadClients();
          }}
          onClientUpdated={(updated) => {
            setClients((prev) => prev.map((c) => (c.idClient === updated.idClient ? updated : c)));
          }}
        />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Gestion des Entreprises Clientes
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Répertoire des entreprises abonnées, configuration des critères et des signatures IA.
          </p>
        </div>

        <button
          onClick={() => setCreateModalOpen(true)}
          className="flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 transition-colors shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Ajouter une Entreprise</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom ou email d'entreprise..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600/30 focus:border-teal-600 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveFilter('')}
            className={`py-2 px-3 rounded-xl text-xs font-medium border transition-colors ${
              activeFilter === ''
                ? 'border-teal-600 bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400'
            }`}
          >
            Tous ({clients.length})
          </button>
          <button
            onClick={() => setActiveFilter('OUI')}
            className={`py-2 px-3 rounded-xl text-xs font-medium border transition-colors ${
              activeFilter === 'OUI'
                ? 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400'
            }`}
          >
            Actifs
          </button>
          <button
            onClick={() => setActiveFilter('NON')}
            className={`py-2 px-3 rounded-xl text-xs font-medium border transition-colors ${
              activeFilter === 'NON'
                ? 'border-rose-600 bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400'
            }`}
          >
            Inactifs
          </button>
        </div>
      </div>

      {/* Clients Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-4">Entreprise & Réf</th>
                <th className="py-3 px-4">Régions Cibles</th>
                <th className="py-3 px-4">Procédures</th>
                <th className="py-3 px-4">Min. Budget</th>
                <th className="py-3 px-4">Seuil Score</th>
                <th className="py-3 px-4">Statut</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {clients.map((c) => (
                <tr
                  key={c.idClient}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="py-3.5 px-4">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                        <button
                          type="button"
                          onClick={() => setSelectedClientId(c.idClient)}
                          className="hover:underline hover:text-emerald-600 text-left font-bold"
                        >
                          {c.nom}
                        </button>
                        {c.siteWeb && (
                          <a
                            href={c.siteWeb}
                            target="_blank"
                            rel="noreferrer"
                            className="text-slate-400 hover:text-teal-600"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500">
                        <span className="font-mono text-teal-700 dark:text-teal-400">{c.idClient}</span>
                        <span aria-hidden="true">·</span>
                        <span>{c.emailDestinataire}</span>
                      </div>
                    </div>
                  </td>

                  <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                    <span className="line-clamp-1 max-w-[140px]" title={formatList(c.regions, 'Toutes')}>
                      {formatList(c.regions, 'Toutes')}
                    </span>
                  </td>

                  <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                    <span className="font-mono">{formatList(c.procedures, 'Toutes')}</span>
                  </td>

                  <td className="py-3.5 px-4 font-mono font-semibold text-slate-900 dark:text-white">
                    {formatFcfa(c.montantMinimum)}
                  </td>

                  <td className="py-3.5 px-4">
                    <span className="font-mono font-bold text-teal-700 dark:text-teal-400">
                      {c.seuilScore ? `${c.seuilScore}%` : 'Standard'}
                    </span>
                  </td>

                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                        c.actif === 'OUI'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                          : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                      }`}
                    >
                      {c.actif === 'OUI' ? 'ACTIF' : 'SUSPENDU'}
                    </span>
                  </td>

                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => handleRegenerateAi(c)}
                        className="p-1.5 rounded-lg border border-amber-200 dark:border-amber-800 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/60 transition-colors"
                        title="Régénérer profil IA"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => setSelectedClientId(c.idClient)}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                        title="Modifier / Ouvrir la fiche client"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                      </button>

                      <button
                        onClick={() => handleToggleActive(c)}
                        className={`p-1.5 rounded-lg border transition-colors ${
                          c.actif === 'OUI'
                            ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                            : 'border-rose-200 text-rose-600 hover:bg-rose-50'
                        }`}
                        title={c.actif === 'OUI' ? 'Désactiver' : 'Activer'}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4-STEP WIZARD CREATE MODAL */}
      <ClientCreateWizardModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        existingClients={clients}
        onClientCreated={(newClient) => {
          setClients((prev) => [newClient, ...prev]);
          setSelectedClientId(newClient.idClient);
        }}
      />
    </div>
  );
};
