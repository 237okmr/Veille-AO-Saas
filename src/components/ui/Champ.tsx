import React, { useId } from 'react';
import { LucideIcon, ChevronDown } from 'lucide-react';

export interface ChampBaseProps {
  label: string;
  aide?: string;
  erreur?: string;
  iconeGauche?: LucideIcon | React.ComponentType<{ className?: string }>;
  conteneurClassName?: string;
}

export interface ChampTexteProps
  extends ChampBaseProps,
    Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {}

export const ChampTexte: React.FC<ChampTexteProps> = ({
  label,
  aide,
  erreur,
  iconeGauche: IconeGauche,
  conteneurClassName = '',
  id: customId,
  className = '',
  disabled,
  ...props
}) => {
  const generatedId = useId();
  const inputId = customId || generatedId;
  const aideId = aide ? `${inputId}-aide` : undefined;
  const erreurId = erreur ? `${inputId}-erreur` : undefined;
  const describedBy = [erreurId, aideId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`space-y-1.5 ${conteneurClassName}`}>
      <label
        htmlFor={inputId}
        className="block text-[0.875rem] font-semibold text-encre"
      >
        {label}
      </label>

      <div className="relative flex items-center">
        {IconeGauche && (
          <div className="absolute left-3.5 flex items-center pointer-events-none text-discret">
            <IconeGauche className="w-5 h-5" />
          </div>
        )}

        <input
          id={inputId}
          disabled={disabled}
          aria-invalid={Boolean(erreur)}
          aria-describedby={describedBy}
          className={`w-full h-[44px] rounded-champ bg-surface text-[1rem] text-encre placeholder:text-discret border transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus disabled:opacity-50 disabled:cursor-not-allowed ${
            IconeGauche ? 'pl-11 pr-3.5' : 'px-3.5'
          } ${
            erreur
              ? 'border-erreur focus-visible:border-erreur'
              : 'border-champ focus-visible:border-transparent'
          } ${className}`}
          {...props}
        />
      </div>

      {erreur ? (
        <p id={erreurId} className="text-[0.8125rem] text-erreur font-medium">
          {erreur}
        </p>
      ) : aide ? (
        <p id={aideId} className="text-[0.8125rem] text-discret">
          {aide}
        </p>
      ) : null}
    </div>
  );
};

export interface ChampListeProps
  extends ChampBaseProps,
    React.SelectHTMLAttributes<HTMLSelectElement> {
  children?: React.ReactNode;
}

export const ChampListe: React.FC<ChampListeProps> = ({
  label,
  aide,
  erreur,
  iconeGauche: IconeGauche,
  conteneurClassName = '',
  id: customId,
  className = '',
  disabled,
  children,
  ...props
}) => {
  const generatedId = useId();
  const selectId = customId || generatedId;
  const aideId = aide ? `${selectId}-aide` : undefined;
  const erreurId = erreur ? `${selectId}-erreur` : undefined;
  const describedBy = [erreurId, aideId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`space-y-1.5 ${conteneurClassName}`}>
      <label
        htmlFor={selectId}
        className="block text-[0.875rem] font-semibold text-encre"
      >
        {label}
      </label>

      <div className="relative flex items-center">
        {IconeGauche && (
          <div className="absolute left-3.5 flex items-center pointer-events-none text-discret">
            <IconeGauche className="w-5 h-5" />
          </div>
        )}

        <select
          id={selectId}
          disabled={disabled}
          aria-invalid={Boolean(erreur)}
          aria-describedby={describedBy}
          className={`w-full h-[44px] rounded-champ bg-surface text-[1rem] text-encre border appearance-none transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
            IconeGauche ? 'pl-11 pr-10' : 'pl-3.5 pr-10'
          } ${
            erreur
              ? 'border-erreur focus-visible:border-erreur'
              : 'border-champ focus-visible:border-transparent'
          } ${className}`}
          {...props}
        >
          {children}
        </select>

        <div className="absolute right-3.5 flex items-center pointer-events-none text-discret">
          <ChevronDown className="w-4 h-4" />
        </div>
      </div>

      {erreur ? (
        <p id={erreurId} className="text-[0.8125rem] text-erreur font-medium">
          {erreur}
        </p>
      ) : aide ? (
        <p id={aideId} className="text-[0.8125rem] text-discret">
          {aide}
        </p>
      ) : null}
    </div>
  );
};
