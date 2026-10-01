import React, { useState, useEffect } from 'react';
import {
  History,
  ShieldCheck,
  ShieldAlert,
  Search,
  Clock,
  User,
  Activity,
  Calendar
} from 'lucide-react';
import { AdminClientAuditItem } from '../../../types';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { formaterDateHeureDouala } from '../../../utils/dates';

interface ClientAuditTabProps {
  clientId: string;
  clientNom: string;
}

export const ClientAuditTab: React.FC<ClientAuditTabProps> = ({ clientId, clientNom }) => {
  const [logs, setLogs] = useState<AdminClientAuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const toast = useToast();

  useEffect(() => {
    loadAudit();
  }, [clientId]);

  const loadAudit = async () => {
    setLoading(true);
    try {
      const res = await api.getAdminClientAudit({ idClient: clientId, limit: 100 });
      if (res.donnees) {
        setLogs(res.donnees.logs || []);
      }
    } catch (err: any) {
      toast.error('Erreur journal', err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter((l) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      l.action.toLowerCase().includes(term) ||
      l.details.toLowerCase().includes(term) ||
      l.email.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Banner */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Journal d'Audit du Client ({logs.length})
              </h2>
              <p className="text-xs text-slate-500">
                Traçabilité des modifications et actions exécutées sur la fiche de {clientNom}.
              </p>
            </div>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Filtrer l'historique..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 space-y-3">
            <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-500">Chargement de l'audit...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs space-y-2">
            <Activity className="w-8 h-8 mx-auto opacity-30" />
            <p className="font-semibold text-slate-700 dark:text-slate-300">
              Aucune entrée d'audit enregistrée pour ce client.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase tracking-wider font-bold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Horodatage</th>
                  <th className="py-3 px-4">Auteur</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Détails & Modifications</th>
                  <th className="py-3 px-4 text-center">Résultat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {filteredLogs.map((log, idx) => {
                  const isOk = log.succes === true || log.succes === 'OUI';
                  return (
                    <tr key={idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="py-3.5 px-4 font-mono text-slate-500 whitespace-nowrap">
                        {log.timestamp ? formaterDateHeureDouala(log.timestamp) : 'N/A'}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          <p className="font-bold text-slate-900 dark:text-white">
                            {log.email || 'Système'}
                          </p>
                          <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {log.role}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        {log.action}
                      </td>

                      <td className="py-3.5 px-4 max-w-md text-slate-700 dark:text-slate-300 font-sans leading-relaxed">
                        {log.details}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        {isOk ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                            <ShieldCheck className="w-3 h-3" />
                            <span>SUCCÈS</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300">
                            <ShieldAlert className="w-3 h-3" />
                            <span>ÉCHEC</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
