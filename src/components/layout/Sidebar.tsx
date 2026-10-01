import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLangue } from '../../context/LangueContext';
import {
  LayoutDashboard,
  Bell,
  Building2,
  Sliders,
  User,
  Users,
  History,
  Lock,
  Settings,
  CalendarClock,
  Zap,
  Inbox,
  X
} from 'lucide-react';
import { LogoMarketAdvisor } from '../brand/LogoMarketAdvisor';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  isOpen: boolean;
  onClose: () => void;
  unreadCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  isOpen,
  onClose,
  unreadCount = 0
}) => {
  const { user } = useAuth();
  const { t } = useLangue();
  const isAdmin = user?.role === 'ADMIN';

  const clientNav = [
    { id: 'client-dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
    { id: 'client-alerts', label: 'Mes alertes AO', icon: Bell, count: unreadCount },
    { id: 'client-deadlines', label: 'Calendrier des échéances', icon: CalendarClock },
    { id: 'client-profile', label: 'Profil Entreprise & IA', icon: Building2 },
    { id: 'client-preferences', label: 'Notifications & Alertes', icon: Sliders },
    { id: 'client-account', label: 'Mon Compte', icon: User }
  ];

  const adminNav = [
    { id: 'admin-dashboard', label: 'Supervision globale', icon: LayoutDashboard },
    { id: 'admin-clients', label: 'Entreprises clientes', icon: Building2 },
    { id: 'admin-avis', label: 'Avis collectés', icon: Inbox },
    { id: 'admin-alertes', label: 'Alertes clients', icon: Bell },
    { id: 'admin-users', label: 'Comptes utilisateurs', icon: Users },
    { id: 'admin-pipeline', label: 'Pipeline de collecte', icon: Zap },
    { id: 'admin-audit', label: 'Journal d’audit', icon: History },
    { id: 'admin-sessions', label: 'Sessions & Sécurité', icon: Lock },
    { id: 'admin-settings', label: 'Réglages', icon: Settings }
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 border-r border-ligne bg-surface transition-transform duration-200 lg:static lg:translate-x-0 flex flex-col ${
          isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {/* Brand Zone */}
        <div className="flex h-16 items-center justify-between px-4 sm:px-5 border-b border-ligne">
          <button
            type="button"
            onClick={() => onNavigate(isAdmin ? 'admin-dashboard' : 'client-dashboard')}
            aria-label="Market Advisor CM, retour au tableau de bord"
            className="flex items-center text-left rounded-champ transition-opacity hover:opacity-90 cursor-pointer"
          >
            <LogoMarketAdvisor taille="sm" />
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le menu"
            className="p-2 text-discret hover:text-encre lg:hidden rounded-champ cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {/* Main User Navigation */}
          <div>
            <div className="px-3 pb-2 text-[0.8125rem] font-semibold text-discret">
              {isAdmin ? 'Administration SaaS' : 'Espace client'}
            </div>
            <nav className="space-y-1">
              {(isAdmin ? adminNav : clientNav).map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onNavigate(item.id);
                      onClose();
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full h-[44px] flex items-center justify-between px-3 text-[0.9375rem] rounded-champ transition-colors text-left cursor-pointer ${
                      isActive
                        ? 'bg-ok-fond text-teal font-semibold'
                        : 'text-discret hover:bg-onglets hover:text-encre font-medium'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Icon
                        className={`w-5 h-5 shrink-0 ${
                          isActive ? 'text-teal' : 'text-discret'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </div>

                    {'count' in item && typeof item.count === 'number' && item.count > 0 && (
                      <span className="ml-2 px-2 py-0.5 text-[0.75rem] font-bold rounded-full bg-amber-500 text-white tabular-nums">
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Discrete sources followed line */}
          <div className="px-3 pt-4 border-t border-ligne text-[0.8125rem] text-discret leading-relaxed">
            {t('sources')}
          </div>
        </div>

        {/* Footer info */}
        <div className="p-4 border-t border-ligne text-[0.8125rem] text-discret">
          <span>Market Advisor CM · v1.0.0</span>
        </div>
      </aside>
    </>
  );
};
