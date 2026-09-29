/**
 * Composants d'interface réutilisables pour Market Advisor CM.
 * 
 * - Card : Conteneur structurant avec fond surface, bordure de ligne et coins arrondis.
 * - PageHeader : En-tête de section avec titre h2, description calibrée, badge contextuel et actions.
 * - KpiCard : Indicateur chiffré valorisant les métriques clés, avec gestion du chargement et mode bouton accessible.
 * - Button : Bouton d'action standardisé respectant la palette institutionnelle (primaire, secondaire, discret, danger).
 * - ChampTexte / ChampListe : Champs de formulaire accessibles avec label obligatoire, message d'aide et gestion d'erreur.
 * - Badge : Pastille d'état stylisée avec forme pilule et mapping sémantique des statuts d'alerte.
 */

export { Card } from './Card';
export type { CardProps } from './Card';

export { PageHeader } from './PageHeader';
export type { PageHeaderProps, PageHeaderBadge } from './PageHeader';

export { KpiCard } from './KpiCard';
export type { KpiCardProps, KpiTone } from './KpiCard';

export { Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';

export { ChampTexte, ChampListe } from './Champ';
export type { ChampTexteProps, ChampListeProps, ChampBaseProps } from './Champ';

export { Badge, tonPourStatutAlerte } from './Badge';
export type { BadgeProps, BadgeTone } from './Badge';
