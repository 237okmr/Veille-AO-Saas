import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { SessionItem } from '../../types';
import {
  Lock,
  Trash2,
  RotateCw,
  ShieldCheck,
  Smartphone,
  Laptop,
  CheckCircle2,
  XCircle,
  AlertTriangle
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { formaterDateHeureDouala } from '../../utils/dates';

export const AdminSessions: React.FC = () => {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [purging, setPurging] = useState(false);
  const toast = useToast();

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const res = await api.getAdminSessions();
      const list = Array.isArray(res.donnees?.sessions) ? res.donnees.sessions : [];
      setSessions(list);
    } catch (e: any) {
      toast.error('Erreur', e.message);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInvalidate = async (idUser: string, email: string) => {
    try {
      await api.invalidateSession(idUser);
      setSessions((prev) =>
        prev.map((s) => (s.idUser === idUser ? { ...s, actif: 'NON' } : s))
      );
      toast.success('Session révoquée', `La session de ${email} a été invalidée.`);
    } catch (e: any) {
      toast.error('Erreur', e.message);
    }
  };

  const handlePurge = async () => {
    setPurging(true);
    try {
      const res = await api.purgeExpiredSessions();
      toast.success(
        'Sessions expirées purgées',
        `${res.donnees?.sessionsPurgees ?? 0} jetons expirés ont été nettoyés de la mémoire.`
      );
      loadSessions();
    } catch (e: any) {
      toast.error('Erreur de purge', e.message);
    } finally {
      setPurging(false);
    }
  };

  const formatDate = (iso?: string) => {
    if (!iso) return '-';
    const formatted = formaterDateHeureDouala(iso);
    return formatted === '—' ? '-' : formatted;
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Sessions Actives & Sécurité des Jetons
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Contrôle des jetons d'authentification en cours et révocation immédiate des accès.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadSessions}
            className="flex items-center gap-1.5 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Actualiser</span>
          </button>

          <button
            onClick={handlePurge}
            disabled={purging}
            className="flex items-center gap-2 py-2 px-4 rounded-xl text-xs font-semibold text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/30 hover:bg-rose-100 transition-colors shadow-2xs cursor-pointer"
          >
            <Trash2 className="w-4 h-4 text-rose-600" />
            <span>{purging ? 'Purge en cours...' : 'Purger sessions expirées'}</span>
          </button>
        </div>
      </div>

      {/* Sessions Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-4">Utilisateur</th>
                <th className="py-3 px-4">Jeton (Masqué)</th>
                <th className="py-3 px-4">Connexion</th>
                <th className="py-3 px-4">Dernière Activité</th>
                <th className="py-3 px-4">Adresse IP</th>
                <th className="py-3 px-4">Navigateur / Appareil</th>
                <th className="py-3 px-4">Statut</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
              {(Array.isArray(sessions) ? sessions : []).map((ses, idx) => (
                <tr key={ses.idSession || ses.tokenMasked || `${ses.idUser}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="py-3.5 px-4 font-sans">
                    <div className="space-y-0.5">
                      <p className="font-semibold text-slate-900 dark:text-white">{ses.nom || ses.email}</p>
                      <span className="text-[10px] text-slate-400 uppercase">{ses.role} · {ses.email}</span>
                    </div>
                  </td>

                  <td className="py-3.5 px-4 text-teal-700 dark:text-teal-400 font-bold">
                    {ses.tokenMasque || ses.tokenMasked || '••••••••'}
                  </td>

                  <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                    {formatDate(ses.dateConnexion || ses.dateCreation)}
                  </td>

                  <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                    {formatDate(ses.derniereActivite || ses.dateExpiration)}
                  </td>

                  <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300">
                    {ses.ip || '-'}
                  </td>

                  <td className="py-3.5 px-4 font-sans text-[11px] text-slate-500 max-w-[180px] truncate" title={ses.userAgent || 'Navigateur'}>
                    {ses.userAgent || '-'}
                  </td>

                  <td className="py-3.5 px-4 font-sans">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                        ses.actif === 'OUI'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                          : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                      }`}
                    >
                      {ses.actif === 'OUI' ? 'EN LIGNE' : 'RÉVOQUÉE'}
                    </span>
                  </td>

                  <td className="py-3.5 px-4 text-right font-sans">
                    {ses.actif === 'OUI' && (
                      <button
                        onClick={() => handleInvalidate(ses.idUser, ses.email)}
                        className="py-1 px-2.5 rounded-lg text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/50 border border-rose-200 dark:border-rose-900/40 transition-colors"
                      >
                        Invalider
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
