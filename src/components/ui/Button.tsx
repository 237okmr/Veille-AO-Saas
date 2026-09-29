import React from 'react';
import { LucideIcon, Loader2 } from 'lucide-react';

export type ButtonVariant = 'primaire' | 'secondaire' | 'discret' | 'danger';
export type ButtonSize = 'md' | 'sm';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: ButtonVariant;
  taille?: ButtonSize;
  iconeGauche?: LucideIcon | React.ComponentType<{ className?: string }>;
  iconeDroite?: LucideIcon | React.ComponentType<{ className?: string }>;
  chargement?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variante = 'primaire',
  taille = 'md',
  iconeGauche: IconeGauche,
  iconeDroite: IconeDroite,
  chargement = false,
  type = 'button',
  disabled,
  className = '',
  ...props
}) => {
  const isDisabled = disabled || chargement;

  const baseClasses =
    'inline-flex items-center justify-center font-semibold rounded-champ transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none select-none';

  const sizeClasses = {
    md: 'h-[44px] px-4 text-[0.9375rem] gap-2',
    sm: 'h-[36px] px-3 text-[0.875rem] gap-1.5'
  }[taille];

  const variantClasses = {
    primaire: 'bg-teal text-white hover:bg-teal/90 active:bg-teal/95',
    secondaire: 'bg-surface border border-champ text-encre hover:bg-onglets',
    discret: 'bg-transparent text-teal hover:bg-ok-fond',
    danger: 'bg-erreur-fond text-erreur border border-erreur/20 hover:bg-erreur-fond/80'
  }[variante];

  return (
    <button
      type={type}
      disabled={isDisabled}
      className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {chargement ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span>{children}</span>
        </>
      ) : (
        <>
          {IconeGauche && <IconeGauche className="w-4 h-4 shrink-0" />}
          {children}
          {IconeDroite && <IconeDroite className="w-4 h-4 shrink-0" />}
        </>
      )}
    </button>
  );
};
