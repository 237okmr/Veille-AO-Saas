import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { TenderAlert } from '../../types';
import {
  CalendarClock,
  Building,
  MapPin,
  Sparkles,
  AlertTriangle,
  RotateCw,
  HelpCircle
} from 'lucide-react';
import { AlertDetailModal } from './AlertDetailModal';
import { useToast } from '../../context/ToastContext';
import { parserDateLimite, joursRestantsDouala } from '../../utils/dates';

interface DayGroup {
  key: string;
  label: string;
  isDateVerif: boolean;
  dateObj: Date | null;
  jours: number | null;
  alerts: TenderAlert[];
}

const doualaDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Douala',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

const doualaLongDateFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Africa/Douala',
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric'
});

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

  const validGroups: DayGroup[] = [];
  const invalidAlerts: TenderAlert[] = [];

  alerts.forEach((a) => {
    const d = parserDateLimite(a.dateLimite);
    if (!d) {
      invalidAlerts.push(a);
      return;
    }
    const key = doualaDayFormatter.format(d);
    let g = validGroups.find((x) => x.key === key);
    if (!g) {
      const label = doualaLongDateFormatter.format(d);
      const jr = joursRestantsDouala(a.dateLimite);
      g = {
        key,
        label,
        isDateVerif: false,
        dateObj: d,
        jours: jr,
        alerts: []
      };
      validGroups.push(g);
    }
    g.alerts.push(a);
  });

  validGroups.sort((a, b) => (a.dateObj?.getTime() || 0) - (b.dateObj?.getTime() || 0));

  const allGroups: DayGroup[] = [...validGroups];
  if (invalidAlerts.length > 0) {
    allGroups.push({
      key: 'date-a-verifier',
      label: 'Date à vérifier',
      isDateVerif: true,
      dateObj: null,
      jours: null,
      alerts: invalidAlerts
    });
  }

  const urgencyStyle = (jours: number | null, isDateVerif: boolean) => {
    if (isDateVerif || jours === null) {
      return 'border-amber-300 bg-amber-50/70 text-amber-800';
    }
    if (jours <= 2) {
      return 'border-rose-300 bg-rose-50/70 text-rose-700';
    }
    if (jours <= 7) {
      return 'border-amber-300 bg-amber-50/70 text-amber-700';
    }
    return 'border-slate-200 bg-slate-50/70 text-slate-700';
  };

  const formatFcfa = (val: number) => new Intl.NumberFormat('fr-FR').format(val) + ' FCFA';

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-teal-700" />
            Calendrier des échéances
          </h2>
          <p className="text-xs text-slate-500">
            Avis actifs triés par date limite de dépôt au fuseau Africa/Douala (UTC+1).
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 py-2 px-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
        >
          <RotateCw className="w-3.5 h-3.5" />
          <span>Actualiser</span>
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : allGroups.length === 0 ? (
        <div className="p-8 rounded-2xl border border-slate-200 bg-white text-center text-sm text-slate-500">
          Aucune échéance à venir pour le moment.
        </div>
      ) : (
        <div className="space-y-6">
          {allGroups.map((g) => {
            const jours = g.jours;
            return (
              <div key={g.key} className="space-y-2">
                <div className="flex items-center gap-2 sticky top-0 z-10 py-1 bg-page/90 backdrop-blur-xs">
                  {g.isDateVerif ? (
                    <span className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
                      <HelpCircle className="w-4 h-4 text-amber-600" />
                      Date à vérifier
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-slate-900 capitalize">
                      {g.label}
                    </span>
                  )}

                  {g.isDateVerif ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-300 bg-amber-50 text-amber-800">
                      {g.alerts.length} {g.alerts.length > 1 ? 'avis' : 'avis'} sans date valide
                    </span>
                  ) : (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${urgencyStyle(jours, false)}`}>
                      {jours === 0
                        ? "Aujourd'hui"
                        : jours === 1
                        ? 'Demain'
                        : jours !== null && jours < 0
                        ? `Expiré il y a ${Math.abs(jours)} j`
                        : `Dans ${jours} jours`}
                    </span>
                  )}
                </div>

                {g.alerts.map((alert) => (
                  <button
                    key={alert.idMatch}
                    type="button"
                    onClick={() => setSelectedAlert(alert)}
                    className={`w-full text-left p-4 rounded-2xl border transition-colors ${urgencyStyle(jours, g.isDateVerif)} hover:brightness-95 cursor-pointer`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-[11px] text-slate-500">
                          <span className="font-mono font-bold">{alert.idAvis}</span>
                          <span aria-hidden="true">·</span>
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{alert.region}</span>
                        </div>
                        <p className="text-sm font-bold text-slate-900">{alert.titre}</p>
                        <div className="flex items-center gap-1.5 text-xs text-slate-600">
                          <Building className="w-3.5 h-3.5" />
                          <span>{alert.maitreOuvrage}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {jours !== null && jours <= 2 && <AlertTriangle className="w-4 h-4 text-rose-600" />}
                        <span className="text-xs font-bold font-mono text-slate-900">
                          {formatFcfa(alert.montantEstime)}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold font-mono bg-teal-50 text-teal-800 border border-teal-200">
                          <Sparkles className="w-3 h-3 text-teal-600" />
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
