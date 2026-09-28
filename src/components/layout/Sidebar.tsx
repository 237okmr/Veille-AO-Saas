import React from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  Bell,
  Building2,
  Sliders,
  User,
  Users,
  Shield,
  Activity,
  History,
  Lock,
  Settings,
  Sparkles,
  FileSpreadsheet,
  Zap,
  X
} from 'lucide-react';

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
  const isAdmin = user?.role === 'ADMIN';

  const clientNav = [
    { id: 'client-dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
    { id: 'client-alerts', label: 'Mes alertes AO', icon: Bell, count: unreadCount },
    { id: 'client-profile', label: 'Profil Entreprise & IA', icon: Building2 },
    { id: 'client-preferences', label: 'Notifications & Alertes', icon: Sliders },
    { id: 'client-account', label: 'Mon Compte', icon: User }
  ];

  const adminNav = [
    { id: 'admin-dashboard', label: 'Supervision globale', icon: LayoutDashboard },
    { id: 'admin-clients', label: 'Entreprises clientes', icon: Building2 },
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
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-transform duration-200 lg:static lg:translate-x-0 flex flex-col ${
          isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {/* Brand Zone */}
        <div className="flex h-16 items-center justify-between px-5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            {/* Cameroon flag emblem badge */}
            <div className="relative w-8 h-8 rounded-lg overflow-hidden flex shadow-sm border border-slate-200 dark:border-slate-700 shrink-0">
              <div className="w-1/3 h-full bg-[#007a5e]" />
              <div className="w-1/3 h-full bg-[#ce1126] flex items-center justify-center">
                <span className="text-[#fcd116] text-[8px] font-black">★</span>
              </div>
              <div className="w-1/3 h-full bg-[#fcd116]" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-sm tracking-tight text-slate-900 dark:text-white leading-tight">
                MARCHÉS PUBLICS
              </span>
              <span className="text-[10px] font-semibold text-teal-700 dark:text-teal-400 tracking-wider">
                CAMEROUN VEILLE
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 lg:hidden rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {/* Main User Navigation */}
          <div>
            <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {isAdmin ? 'Administration SaaS' : 'Espace Client'}
            </div>
            <nav className="space-y-1">
              {(isAdmin ? adminNav : clientNav).map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onNavigate(item.id);
                      onClose();
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium rounded-xl transition-all text-left ${
                      isActive
                        ? 'bg-teal-50/90 dark:bg-teal-950/60 text-teal-900 dark:text-teal-300 font-semibold ring-1 ring-teal-200/60 dark:ring-teal-800/60 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive
                            ? 'text-teal-700 dark:text-teal-400'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </div>

                    {'count' in item && typeof item.count === 'number' && item.count > 0 && (
                      <span className="ml-2 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-500 text-white tabular-nums">
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Quick Context Card */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
              <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>Ciblage IA Actif</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Surveillance continue des avis ARMP, DGTCFM et ministères camerounais.
            </p>
          </div>
        </div>

        {/* Footer info */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-400 dark:text-slate-500">
          <div className="flex items-center justify-between">
            <span>v1.0.0 · Production</span>
            <span className="font-mono text-[10px]">Yaoundé/Douala</span>
          </div>
        </div>
      </aside>
    </>
  );
};
