import React from 'react';
import { TenderAlert } from '../../types';
import { Card } from '../ui/Card';
import { Badge, BadgeTone } from '../ui/Badge';
import { joursRestantsDouala } from '../../utils/dates';
import {
  Clock,
  CheckCircle2,
  Building,
  Sparkles,
  ArrowRight,
  HelpCircle
} from 'lucide-react';

interface AujourdhuiBlocProps {
  loading: boolean;
  echeances: TenderAlert[];
  aDecider: TenderAlert[];
  onSelectAlert: (alert: TenderAlert) => void;
  onNavigate: (view: string) => void;
}

export const AujourdhuiBloc: React.FC<AujourdhuiBlocProps> = ({
  loading,
  echeances,
  aDecider,
  onSelectAlert,
  onNavigate
}) => {
  const formatFcfa = (val: number) => {
    if (!val) return '0 FCFA';
    if (val >= 1_000_000_000) {
      return (val / 1_000_000_000).toFixed(2) + ' Md FCFA';
    }
    if (val >= 1_000_000) {
      return (val / 1_000_000).toFixed(1) + ' M FCFA';
    }
    return new Intl.NumberFormat('fr-FR').format(val) + ' FCFA';
  };

  const getDelayTone = (jours: number | null): BadgeTone => {
    if (jours === null) return 'attente';
    if (jours <= 3) return 'erreur';
    if (jours <= 7) return 'attente';
    return 'neutre';
  };

  if (loading) {
    return (
      <section className="space-y-3" aria-label="À faire aujourd'hui (chargement)">
        <h2 className="font-titre font-[800] text-[1.25rem] leading-tight text-slate-900">
          À faire aujourd'hui
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <Card className="h-72 animate-pulse flex flex-col justify-between p-5 bg-white border-slate-200">
            <div className="space-y-3">
              <div className="h-5 w-48 bg-slate-200 rounded-md" />
              <div className="h-4 w-full bg-slate-100 rounded-md" />
              <div className="h-4 w-3/4 bg-slate-100 rounded-md" />
              <div className="h-4 w-5/6 bg-slate-100 rounded-md" />
            </div>
            <div className="h-8 w-28 bg-slate-200 rounded-lg self-end" />
          </Card>
          <Card className="h-72 animate-pulse flex flex-col justify-between p-5 bg-white border-slate-200">
            <div className="space-y-3">
              <div className="h-5 w-48 bg-slate-200 rounded-md" />
              <div className="h-4 w-full bg-slate-100 rounded-md" />
              <div className="h-4 w-3/4 bg-slate-100 rounded-md" />
              <div className="h-4 w-5/6 bg-slate-100 rounded-md" />
            </div>
            <div className="h-8 w-28 bg-slate-200 rounded-lg self-end" />
          </Card>
        </div>
      </section>
    );
  }

  // État où les deux listes sont vides
  if (echeances.length === 0 && aDecider.length === 0) {
    return (
      <section className="space-y-3" aria-label="À faire aujourd'hui">
        <h2 className="font-titre font-[800] text-[1.25rem] leading-tight text-slate-900">
          À faire aujourd'hui
        </h2>
        <Card className="p-6 text-center bg-white border-slate-200 shadow-xs space-y-3">
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-700 mx-auto flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <p className="text-[0.9375rem] font-bold text-slate-900">
            Tout est à jour. Aucune offre urgente ni à décider pour le moment.
          </p>
          <p className="text-[0.8125rem] text-slate-600 max-w-md mx-auto">
            Vos dossiers en cours sont sous contrôle et tous les nouveaux avis ont été examinés.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => onNavigate('client-alerts')}
              className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-[0.8125rem] font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-hidden"
            >
              <span>Consulter toutes les alertes</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </Card>
      </section>
    );
  }

  const echeancesTop5 = echeances.slice(0, 5);
  const aDeciderTop5 = aDecider.slice(0, 5);

  return (
    <section className="space-y-3" aria-label="À faire aujourd'hui">
      <div className="flex items-center justify-between">
        <h2 className="font-titre font-[800] text-[1.25rem] leading-tight text-slate-900">
          À faire aujourd'hui
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Section 1 : Échéances à surveiller */}
        <Card className="flex flex-col justify-between p-4 sm:p-5 bg-white border-slate-200 shadow-xs space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-rose-600 shrink-0" />
                <h3 className="font-bold text-[0.9375rem] text-slate-900">
                  Échéances à surveiller
                </h3>
              </div>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.8125rem] font-bold font-mono bg-rose-50 text-rose-700 border border-rose-200">
                {echeances.length}
              </span>
            </div>

            {echeances.length === 0 ? (
              <div className="py-8 text-center text-[0.8125rem] text-slate-500 font-medium">
                Aucune échéance proche
              </div>
            ) : (
              <div className="space-y-2.5">
                {echeancesTop5.map((alert) => {
                  const jr = joursRestantsDouala(alert.dateLimite);
                  const delayTone = getDelayTone(jr);
                  return (
                    <button
                      key={alert.idMatch}
                      type="button"
                      onClick={() => onSelectAlert(alert)}
                      className="w-full text-left p-3 min-h-[44px] rounded-xl border border-slate-200 hover:border-teal-500 bg-white hover:bg-slate-50/80 transition-all cursor-pointer group flex flex-col justify-between gap-2 shadow-2xs focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-hidden"
                    >
                      <div className="flex items-start justify-between gap-3 w-full">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-[0.875rem] text-slate-900 group-hover:text-teal-800 transition-colors line-clamp-2 leading-snug">
                            {alert.titre}
                          </p>
                        </div>
                        <div className="shrink-0 pt-0.5">
                          {jr === null ? (
                            <Badge ton="attente">
                              Date à vérifier
                            </Badge>
                          ) : (
                            <Badge ton={delayTone} point={jr <= 3}>
                              {jr === 0 ? "Aujourd'hui" : `J-${jr}`}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[0.8125rem] text-slate-600 w-full border-t border-slate-100">
                        <div className="flex items-center gap-1.5 min-w-0 max-w-[60%]">
                          <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{alert.maitreOuvrage}</span>
                        </div>
                        <div className="font-mono font-semibold text-slate-900 shrink-0">
                          {formatFcfa(alert.montantEstime)}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {echeances.length > 5 && (
            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => onNavigate('client-alerts')}
                className="w-full min-h-[44px] flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-[0.8125rem] font-semibold text-teal-800 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-hidden"
              >
                <span>Voir tout ({echeances.length})</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </Card>

        {/* Section 2 : À décider */}
        <Card className="flex flex-col justify-between p-4 sm:p-5 bg-white border-slate-200 shadow-xs space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-teal-700 shrink-0" />
                <h3 className="font-bold text-[0.9375rem] text-slate-900">
                  À décider
                </h3>
              </div>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.8125rem] font-bold font-mono bg-teal-50 text-teal-800 border border-teal-200">
                {aDecider.length}
              </span>
            </div>

            {aDecider.length === 0 ? (
              <div className="py-8 text-center text-[0.8125rem] text-slate-500 font-medium">
                Aucune offre en attente de décision
              </div>
            ) : (
              <div className="space-y-2.5">
                {aDeciderTop5.map((alert) => {
                  const jr = joursRestantsDouala(alert.dateLimite);
                  const delayTone = getDelayTone(jr);
                  return (
                    <button
                      key={alert.idMatch}
                      type="button"
                      onClick={() => onSelectAlert(alert)}
                      className="w-full text-left p-3 min-h-[44px] rounded-xl border border-slate-200 hover:border-teal-500 bg-white hover:bg-slate-50/80 transition-all cursor-pointer group flex flex-col justify-between gap-2 shadow-2xs focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-hidden"
                    >
                      <div className="flex items-start justify-between gap-3 w-full">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-[0.875rem] text-slate-900 group-hover:text-teal-800 transition-colors line-clamp-2 leading-snug">
                            {alert.titre}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[0.8125rem] font-bold font-mono bg-teal-50 text-teal-800 border border-teal-200">
                            <Sparkles className="w-3 h-3 text-teal-600" />
                            {alert.scoreMatch}% IA
                          </span>
                          {jr === null ? (
                            <Badge ton="attente" point={false}>
                              Date à vérifier
                            </Badge>
                          ) : (
                            <Badge ton={delayTone} point={jr <= 3}>
                              {jr === 0 ? "Aujourd'hui" : `J-${jr}`}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[0.8125rem] text-slate-600 w-full border-t border-slate-100">
                        <div className="flex items-center gap-1.5 min-w-0 max-w-[60%]">
                          <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{alert.maitreOuvrage}</span>
                        </div>
                        <div className="font-mono font-semibold text-slate-900 shrink-0">
                          {formatFcfa(alert.montantEstime)}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {aDecider.length > 5 && (
            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => onNavigate('client-alerts')}
                className="w-full min-h-[44px] flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-[0.8125rem] font-semibold text-teal-800 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-hidden"
              >
                <span>Voir tout ({aDecider.length})</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </Card>
      </div>
    </section>
  );
};
