import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { TenderAlert } from '../../types';
import {
  CalendarClock,
  Building,
  MapPin,
  Sparkles,
  AlertTriangle,
  RotateCw
} from 'lucide-react';
import { AlertDetailModal } from './AlertDetailModal';
import { useToast } from '../../context/ToastContext';

/** Parse une Date_Limite au format "DD-MM-YYYY" (miroir de saasParserDateLimite côté Apps Script). */
function parseDeadline(str?: string): Date | null {
  if (!str) return null;
  const cleaned = str.replace(/^['~]/, '').split(' ')[0];
  const parts = cleaned.split('-');
  if (parts.length !== 3) return null;
  const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
  return isNaN(d.getTime()) ? null : d;
}

interface DayGroup {
  key: string;
  date: Date;
  alerts: TenderAlert[];
}

export const ClientDeadlines: React.FC = () => {
  const [alerts, setAlerts] = useState<TenderAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAlert, setSelectedAlert] = useState<TenderAlert | null>(null);
  const toast = useToast();

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getAlerts({ expire: 'NON', sortBy: 'deadline', sortOrder: 'asc', limit: 200 });
      setAlerts(Array.isArray(res.donnees?.alertes) ? res.donnees.alertes : []);
    } catch (e: any) {
      toast.error('Erreur', e.message);
    } finally {
      setLoading(false);
    }
  };

  const groups: DayGroup[] = [];
  alerts.forEach((a) => {
    const d = parseDeadline(a.dateLimite);
    if (!d) return;
    const key = d.toISOString().slice(0, 10);
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, date: d, alerts: [] };
      groups.push(g);
    }
    g.alerts.push(a);
  });
  groups.sort((a, b) => a.date.getTime() - b.date.getTime());

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysRemaining = (d: Date) => Math.round((d.getTime() - today.getTime()) / 86400000);

  const urgencyStyle = (jours: number) => {
    if (jours <= 2) return 'border-rose-300 dark:border-rose-800 bg-rose-50/60 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300';
    if (jours <= 7) return 'border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300';
    return 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900 text-slate-600 dark:text-slate-300';
  };

  const formatFcfa = (val: number) => new Intl.NumberFormat('fr-FR').format(val) + ' FCFA';

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-teal-700" />
            Calendrier des échéances
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Avis actifs triés par date limite de dépôt la plus proche.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <RotateCw className="w-3.5 h-3.5" />
          <span>Actualiser</span>
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center text-sm text-slate-500 dark:text-slate-400">
          Aucune échéance à venir pour le moment.
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => {
            const jours = daysRemaining(g.date);
            return (
              <div key={g.key} className="space-y-2">
                <div className="flex items-center gap-2 sticky top-0 z-10 py-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white capitalize">
                    {g.date.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${urgencyStyle(jours)}`}>
                    {jours <= 0 ? "Aujourd'hui" : jours === 1 ? 'Demain' : `Dans ${jours} jours`}
                  </span>
                </div>

                {g.alerts.map((alert) => (
                  <button
                    key={alert.idMatch}
                    onClick={() => setSelectedAlert(alert)}
                    className={`w-full text-left p-4 rounded-2xl border transition-colors ${urgencyStyle(jours)} hover:brightness-95`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="font-mono font-bold">{alert.idAvis}</span>
                          <span aria-hidden="true">·</span>
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{alert.region}</span>
                        </div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{alert.titre}</p>
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                          <Building className="w-3.5 h-3.5" />
                          <span>{alert.maitreOuvrage}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {jours <= 2 && <AlertTriangle className="w-4 h-4 text-rose-600" />}
                        <span className="text-xs font-bold font-mono text-slate-900 dark:text-white">
                          {formatFcfa(alert.montantEstime)}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold font-mono bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                          <Sparkles className="w-3 h-3" />
                          {alert.scoreMatch}%
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {selectedAlert && (
        <AlertDetailModal
          alert={selectedAlert}
          onClose={() => setSelectedAlert(null)}
          onUpdate={(updated) => {
            setAlerts((prev) => prev.map((a) => (a.idMatch === updated.idMatch ? updated : a)));
            setSelectedAlert(updated);
          }}
        />
      )}
    </div>
  );
};
