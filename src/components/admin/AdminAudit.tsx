import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { AuditLogItem } from '../../types';
import {
  History,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCw,
  FileCode,
  X
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { formaterDateHeureDouala } from '../../utils/dates';

export const AdminAudit: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [successFilter, setSuccessFilter] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);
  const toast = useToast();

  useEffect(() => {
    loadAudit();
  }, [search, actionFilter, successFilter]);

  const loadAudit = async () => {
    setLoading(true);
    try {
      const res = await api.getAdminAuditLogs({
        search: search || undefined,
        action: actionFilter || undefined,
        succes: successFilter || undefined
      });
      const data = res.donnees;
      let rawList: AuditLogItem[] = [];
      if (data) {
        if (Array.isArray(data.logs)) {
          rawList = data.logs;
        } else if (Array.isArray(data.entrees)) {
          rawList = data.entrees;
        } else if (Array.isArray(data)) {
          rawList = data;
        }
      }
      setLogs(rawList);
    } catch (e: any) {
      toast.error('Erreur', e.message);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (iso: string) => {
    return formaterDateHeureDouala(iso);
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Journal d'Audit & Traçabilité
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Enregistrement immuable des accès, modifications de profils et déclenchements de pipelines.
          </p>
        </div>

        <button
          onClick={loadAudit}
          className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors self-start"
        >
          <RotateCw className="w-3.5 h-3.5" />
          <span>Actualiser les logs</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher (détails, email, action)..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600/30 focus:border-teal-600"
          />
        </div>

        <div>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600/30 focus:border-teal-600"
          >
            <option value="">Toutes les actions</option>
            <option value="PIPELINE">Actions Pipeline</option>
            <option value="CLIENT">Gestion Clients</option>
            <option value="ALERT">Actions Alertes</option>
            <option value="AUTH">Authentification</option>
          </select>
        </div>

        <div>
          <select
            value={successFilter}
            onChange={(e) => setSuccessFilter(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600/30 focus:border-teal-600"
          >
            <option value="">Tous statuts</option>
            <option value="true">Succès uniquement</option>
            <option value="false">Erreurs / Échecs</option>
          </select>
        </div>
      </div>

      {/* Audit Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-4">Horodatage</th>
                <th className="py-3 px-4">Utilisateur / Auteur</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Détails de l'événement</th>
                <th className="py-3 px-4">IP</th>
                <th className="py-3 px-4">Résultat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
              {logs.map((log, idx) => {
                const isSuccess = log.succes === true || log.succes === 'OUI' || String(log.succes).toLowerCase() === 'true';
                return (
                <tr
                  key={log.id || `${log.timestamp}-${idx}`}
                  onClick={() => setSelectedLog(log)}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                >
                  <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                    {formatDate(log.timestamp)}
                  </td>

                  <td className="py-3 px-4 font-sans">
                    <div className="space-y-0.5">
                      <p className="font-semibold text-slate-900 dark:text-white truncate max-w-[160px]">
                        {log.email || 'Système'}
                      </p>
                      <span className="text-[10px] text-slate-400 uppercase">{log.role || 'AUTO'}</span>
                    </div>
                  </td>

                  <td className="py-3 px-4 font-bold text-teal-700 dark:text-teal-400 whitespace-nowrap">
                    {log.action}
                  </td>

                  <td className="py-3 px-4 font-sans text-slate-700 dark:text-slate-300">
                    <p className="line-clamp-1 max-w-md">{log.details}</p>
                  </td>

                  <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                    {log.ip || '-'}
                  </td>

                  <td className="py-3 px-4">
                    {isSuccess ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-bold font-sans">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Succès</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-rose-600 font-bold font-sans">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Échec</span>
                      </span>
                    )}
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Log Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Détail de l'événement d'audit [{selectedLog.id}]
              </h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                  <span className="text-slate-400 block text-[10px]">Auteur</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedLog.email}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                  <span className="text-slate-400 block text-[10px]">Date</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">{formatDate(selectedLog.timestamp)}</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                <span className="text-slate-400 block text-[10px] mb-1">Action</span>
                <span className="font-mono font-bold text-teal-700 dark:text-teal-400">{selectedLog.action}</span>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                <span className="text-slate-400 block text-[10px] mb-1">Détails enregistrés</span>
                <p className="text-slate-800 dark:text-slate-200 font-mono leading-relaxed">{selectedLog.details}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
