import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Search,
  Clock,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Database,
  Star,
  RefreshCw,
  FileCheck
} from 'lucide-react';
import { AdminClientCacheIaItem } from '../../../types';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { formaterDateHeureDouala } from '../../../utils/dates';

interface ClientAiCacheTabProps {
  clientId: string;
  clientNom: string;
}

export const ClientAiCacheTab: React.FC<ClientAiCacheTabProps> = ({ clientId, clientNom }) => {
  const [evaluations, setEvaluations] = useState<AdminClientCacheIaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const toast = useToast();

  useEffect(() => {
    loadCacheIa();
  }, [clientId, limit, offset]);

  const loadCacheIa = async () => {
    setLoading(true);
    try {
      const res = await api.getAdminClientCacheIa({
        idClient: clientId,
        limit,
        offset
      });
      if (res.donnees) {
        setEvaluations(res.donnees.evaluations || []);
        setTotal(res.donnees.total || 0);
      }
    } catch (err: any) {
      toast.error('Erreur Cache IA', err.message);
    } finally {
      setLoading(false);
    }
  };

  const filtered = evaluations.filter((item) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      item.idAO.toLowerCase().includes(term) ||
      (item.motif && item.motif.toLowerCase().includes(term))
    );
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-300">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Cache des Évaluations IA (CACHE_IA)
              </h2>
              <p className="text-xs text-slate-500">
                Historique des jugements sémantiques portés par Gemini pour la paire [Client / Avis].
              </p>
            </div>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Filtrer par avis ou mot du motif..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>
      </div>

      {/* Table of Evaluations */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 space-y-3">
            <div className="w-8 h-8 border-3 border-purple-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-500">Chargement des évaluations Gemini...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs space-y-2">
            <Sparkles className="w-8 h-8 mx-auto opacity-30 text-purple-400" />
            <p className="font-semibold text-slate-700 dark:text-slate-300">
              Aucune évaluation en cache pour ce client.
            </p>
            <p>Les avis analysés apparaîtront automatiquement après le cycle de scoring.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase tracking-wider font-bold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Identifiant Avis (AO)</th>
                  <th className="py-3 px-4 text-center">Note IA (1-5)</th>
                  <th className="py-3 px-4">Motif & Justification Sémantique</th>
                  <th className="py-3 px-4 text-right">Date d'Évaluation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {filtered.map((item, idx) => (
                  <tr key={`${item.idAO}-${idx}`} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                      {item.idAO}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-flex items-center space-x-1 font-mono text-xs font-black px-2.5 py-0.5 rounded-lg ${
                          item.noteIA >= 4.0
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-300'
                            : item.noteIA >= 3.0
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        <Star className="w-3 h-3 fill-current" />
                        <span>{item.noteIA.toFixed(1)}</span>
                      </span>
                    </td>

                    <td className="py-3.5 px-4 max-w-lg text-slate-700 dark:text-slate-300 text-xs leading-relaxed font-sans">
                      {item.motif || 'Aucun motif textuel fourni.'}
                    </td>

                    <td className="py-3.5 px-4 text-right text-slate-400 font-mono whitespace-nowrap">
                      {item.dateEval ? formaterDateHeureDouala(item.dateEval) : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
