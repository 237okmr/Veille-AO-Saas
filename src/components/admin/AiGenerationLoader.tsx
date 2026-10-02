import React, { useState, useEffect } from 'react';
import { Sparkles, Globe, Cpu, FileCheck2, Clock, AlertTriangle } from 'lucide-react';

interface AiGenerationLoaderProps {
  isOpen: boolean;
  clientNom: string;
  siteWeb?: string;
  timeoutSeconds?: number;
  onTimeout?: () => void;
}

export const AiGenerationLoader: React.FC<AiGenerationLoaderProps> = ({
  isOpen,
  clientNom,
  siteWeb,
  timeoutSeconds = 45,
  onTimeout
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState(timeoutSeconds);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const steps = [
    { label: "Analyse sémantique du profil métier...", icon: Cpu, time: 0 },
    { label: siteWeb ? `Analyse et extraction du site web (${siteWeb})...` : "Vérification des sources sectorielles...", icon: Globe, time: 8 },
    { label: "Génération sémantique (Inclusions, Exclusions, MO)...", icon: Sparkles, time: 18 },
    { label: "Compilation du profil compact et calcul de couverture...", icon: FileCheck2, time: 32 }
  ];

  useEffect(() => {
    if (!isOpen) {
      setSecondsRemaining(timeoutSeconds);
      setCurrentStepIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (onTimeout) onTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, timeoutSeconds, onTimeout]);

  // Advance steps based on elapsed time
  useEffect(() => {
    if (!isOpen) return;
    const elapsed = timeoutSeconds - secondsRemaining;
    if (elapsed >= 32) setCurrentStepIndex(3);
    else if (elapsed >= 18) setCurrentStepIndex(2);
    else if (elapsed >= 8) setCurrentStepIndex(1);
    else setCurrentStepIndex(0);
  }, [secondsRemaining, isOpen, timeoutSeconds]);

  if (!isOpen) return null;

  const progressPercent = Math.min(
    100,
    Math.round(((timeoutSeconds - secondsRemaining) / timeoutSeconds) * 100)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div 
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-8 text-center space-y-6 transform transition-all"
        role="dialog"
        aria-modal="true"
      >
        {/* Animated Header Icon */}
        <div className="relative mx-auto w-20 h-20">
          <div className="absolute inset-0 bg-amber-500/20 rounded-full animate-ping" />
          <div className="relative w-20 h-20 bg-gradient-to-tr from-amber-500 to-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/30">
            <Sparkles className="w-10 h-10 text-white animate-spin-slow" />
          </div>
        </div>

        {/* Title & Target */}
        <div className="space-y-1.5">
          <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
            Génération du Profil de Ciblage en cours...
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Analyse approfondie pour <strong className="text-slate-900 dark:text-slate-200">{clientNom}</strong>
          </p>
        </div>

        {/* Stepper with check/spinner */}
        <div className="space-y-3 text-left bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60">
          {steps.map((s, idx) => {
            const Icon = s.icon;
            const isDone = currentStepIndex > idx;
            const isCurrent = currentStepIndex === idx;

            return (
              <div
                key={idx}
                className={`flex items-center space-x-3 transition-opacity ${
                  isCurrent
                    ? 'opacity-100 font-semibold'
                    : isDone
                    ? 'opacity-75 text-emerald-600 dark:text-emerald-400'
                    : 'opacity-40 text-slate-400'
                }`}
              >
                <div className="shrink-0">
                  {isDone ? (
                    <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold">
                      ✓
                    </div>
                  ) : isCurrent ? (
                    <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border border-slate-300 dark:border-slate-600 flex items-center justify-center text-[10px] text-slate-400">
                      {idx + 1}
                    </div>
                  )}
                </div>
                <div className="flex items-center space-x-2 text-xs truncate">
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className={isCurrent ? 'text-slate-900 dark:text-white font-bold' : ''}>
                    {s.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Progress Bar & Countdown */}
        <div className="space-y-2">
          <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-amber-500 via-emerald-500 to-emerald-400 h-2.5 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center space-x-1">
              <Clock className="w-3.5 h-3.5" />
              <span>Délai d'attente max : <strong>{secondsRemaining}s</strong></span>
            </span>
            <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
              {progressPercent}%
            </span>
          </div>
        </div>

        {/* Warning if taking time */}
        {secondsRemaining < 15 && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-900/60 text-[11px] text-amber-800 dark:text-amber-300 flex items-center space-x-2 text-left">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              L'analyse du site web et la génération prennent un peu plus de temps. En cas de dépassement, le client sera créé avec ses critères initiaux.
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
