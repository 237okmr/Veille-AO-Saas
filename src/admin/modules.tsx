import React from 'react';
import {
  LayoutDashboard,
  Bell,
  Building2,
  Users,
  History,
  Lock,
  Settings,
  Zap,
  Inbox,
  type LucideIcon
} from 'lucide-react';
import type { UserRole } from '../types';
import { AdminDashboard } from '../components/admin/AdminDashboard';
import { AdminClients } from '../components/admin/AdminClients';
import { AdminAvis } from '../components/admin/AdminAvis';
import { AdminAlertes } from '../components/admin/AdminAlertes';
import { AdminUsers } from '../components/admin/AdminUsers';
import { AdminPipeline } from '../components/admin/AdminPipeline';
import { AdminAudit } from '../components/admin/AdminAudit';
import { AdminSessions } from '../components/admin/AdminSessions';
import { AdminSettings } from '../components/admin/AdminSettings';

/**
 * MANIFESTE DE L'ESPACE ADMINISTRATION
 * ------------------------------------------------------------------
 * Source unique du menu latéral, de l'aiguillage des écrans, des titres de l'en-tête et des
 * adresses (/admin, /admin/reglages…). Pour ajouter un module :
 *   1. créer son composant dans src/components/admin/ ;
 *   2. ajouter UNE entrée dans MODULES_ADMIN ci-dessous (id, adresse, libellé, titre, icône, groupe, rôle minimum).
 * Rien d'autre à toucher (menu, en-tête et routage se mettent à jour seuls).
 *
 * Règles :
 *  - id : toujours préfixé « admin- » (les écrans existants s'y réfèrent pour naviguer).
 *  - chemin : unique, commence par /admin ; seul le tableau de bord vaut exactement /admin.
 *  - groupe : null = entrée isolée en tête du menu ; sinon l'un des GROUPES_ADMIN.
 *  - roleMin : rôle minimum pour voir et ouvrir le module (contrôle d'affichage ;
 *    le vrai contrôle reste côté serveur et Apps Script).
 */

export type GroupeAdminId = 'reglages' | 'clients' | 'collecte' | 'supervision';

export interface GroupeAdmin {
  id: GroupeAdminId;
  titre: string;
}

export interface ContexteModuleAdmin {
  onNavigate: (vue: string) => void;
}

export interface ModuleAdmin {
  id: string;
  chemin: string;
  label: string;
  titre: string;
  icon: LucideIcon;
  groupe: GroupeAdminId | null;
  roleMin: UserRole;
  rendu: (ctx: ContexteModuleAdmin) => React.ReactNode;
}

export const GROUPES_ADMIN: GroupeAdmin[] = [
  { id: 'reglages', titre: 'Réglages' },
  { id: 'clients', titre: 'Clients et alertes' },
  { id: 'collecte', titre: 'Collecte' },
  { id: 'supervision', titre: 'Supervision' }
];

export const MODULES_ADMIN: ModuleAdmin[] = [
  // --- En tête du menu ---
  {
    id: 'admin-dashboard',
    chemin: '/admin',
    label: 'Supervision globale',
    titre: 'Supervision globale SaaS',
    icon: LayoutDashboard,
    groupe: null,
    roleMin: 'ADMIN',
    rendu: ({ onNavigate }) => <AdminDashboard onNavigate={onNavigate} />
  },

  // --- Réglages ---
  {
    id: 'admin-settings',
    chemin: '/admin/reglages',
    label: 'Réglages',
    titre: 'Réglages de la plateforme',
    icon: Settings,
    groupe: 'reglages',
    roleMin: 'ADMIN',
    rendu: () => <AdminSettings />
  },
  {
    id: 'admin-sessions',
    chemin: '/admin/sessions',
    label: 'Sessions & Sécurité',
    titre: 'Sessions actives & Sécurité',
    icon: Lock,
    groupe: 'reglages',
    roleMin: 'ADMIN',
    rendu: () => <AdminSessions />
  },

  // --- Clients et alertes ---
  {
    id: 'admin-clients',
    chemin: '/admin/clients',
    label: 'Entreprises clientes',
    titre: 'Gestion des entreprises clientes',
    icon: Building2,
    groupe: 'clients',
    roleMin: 'ADMIN',
    rendu: () => <AdminClients />
  },
  {
    id: 'admin-users',
    chemin: '/admin/utilisateurs',
    label: 'Comptes utilisateurs',
    titre: 'Gestion des utilisateurs & rôles',
    icon: Users,
    groupe: 'clients',
    roleMin: 'ADMIN',
    rendu: () => <AdminUsers />
  },
  {
    id: 'admin-alertes',
    chemin: '/admin/alertes',
    label: 'Alertes clients',
    titre: 'Alertes clients',
    icon: Bell,
    groupe: 'clients',
    roleMin: 'ADMIN',
    rendu: ({ onNavigate }) => <AdminAlertes onNavigate={onNavigate} />
  },

  // --- Collecte ---
  {
    id: 'admin-avis',
    chemin: '/admin/avis',
    label: 'Avis collectés',
    titre: 'Avis collectés',
    icon: Inbox,
    groupe: 'collecte',
    roleMin: 'ADMIN',
    rendu: ({ onNavigate }) => <AdminAvis onNavigate={onNavigate} />
  },
  {
    id: 'admin-pipeline',
    chemin: '/admin/pipeline',
    label: 'Pipeline de collecte',
    titre: 'Actions du pipeline de collecte',
    icon: Zap,
    groupe: 'collecte',
    roleMin: 'ADMIN',
    rendu: () => <AdminPipeline />
  },

  // --- Supervision ---
  {
    id: 'admin-audit',
    chemin: '/admin/audit',
    label: 'Journal d’audit',
    titre: 'Journal d’audit & Événements',
    icon: History,
    groupe: 'supervision',
    roleMin: 'ADMIN',
    rendu: () => <AdminAudit />
  }
];

// ------------------------------------------------------------------
// Fonctions utilitaires (ne pas modifier pour ajouter un module)
// ------------------------------------------------------------------

const RANG_ROLE: Record<UserRole, number> = { CLIENT: 0, ADMIN: 1 };

/** Vrai si le rôle de l'utilisateur atteint le rôle minimum exigé. */
export function roleAutorise(role: UserRole | undefined | null, roleMin: UserRole): boolean {
  if (!role) return false;
  return (RANG_ROLE[role] ?? -1) >= RANG_ROLE[roleMin];
}

export function moduleAdminParId(id: string): ModuleAdmin | undefined {
  return MODULES_ADMIN.find((m) => m.id === id);
}

/** Retrouve un module par son adresse (insensible au slash final). Retourne undefined si inconnue. */
export function moduleAdminParChemin(chemin: string): ModuleAdmin | undefined {
  const propre = (chemin || '').replace(/\/+$/, '') || '/';
  return MODULES_ADMIN.find((m) => m.chemin === propre);
}

/** Modules visibles pour un rôle donné, dans l'ordre du manifeste. */
export function modulesAdminVisibles(role: UserRole | undefined | null): ModuleAdmin[] {
  return MODULES_ADMIN.filter((m) => roleAutorise(role, m.roleMin));
}
