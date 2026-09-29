import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  children?: React.ReactNode;
  padding?: 'md' | 'sm' | 'none';
  elevated?: boolean;
  as?: React.ElementType;
  className?: string;
}

export const Card: React.FC<CardProps> = ({
  children,
  padding = 'md',
  elevated = false,
  as: Component = 'div',
  className = '',
  ...props
}) => {
  const paddingClass = {
    md: 'p-5',
    sm: 'p-4',
    none: 'p-0'
  }[padding];

  return (
    <Component
      className={`bg-surface border border-ligne rounded-carte ${paddingClass} ${
        elevated ? 'shadow-hud' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </Component>
  );
};
