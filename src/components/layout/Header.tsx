import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  LogOut,
  User as UserIcon,
  ShieldCheck,
  Building2,
  ChevronDown,
  Globe,
  Settings2,
  ExternalLink,
  Bell,
  Activity
} from 'lucide-react';

interface HeaderProps {
  currentView: string;
  onNavigate: (view: string) => void;
  onOpenApiConfig: () => void;
  unreadAlertsCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onNavigate,
  onOpenApiConfig,
  unreadAlertsCount = 0
}) => {
  const { user, logout, apiConfig } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getViewTitle = () => {
    switch (currentView) {
      // Client views
      case 'client-dashboard':
        return 'Tableau de bord de veille';
      case 'client-alerts':
        return 'Mes alertes & Marchés ciblés';
      case 'client-profile':
        return 'Profil entreprise & Critères IA';
      case 'client-preferences':
        return 'Préférences de notification';
      case 'client-account':
        return 'Paramètres du compte';
      // Admin views
      case 'admin-dashboard':
        return 'Supervision globale SaaS';
      case 'admin-clients':
        return 'Gestion des entreprises clientes';
      case 'admin-users':
        return 'Gestion des utilisateurs & rôles';
      case 'admin-pipeline':
        return 'Actions du pipeline de collecte';
      case 'admin-audit':
        return 'Journal d’audit & Événements';
      case 'admin-sessions':
        return 'Sessions actives & Sécurité';
      default:
        return 'Veille Marchés Publics';
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-4 sm:px-6">
      {/* Zone 1: Breadcrumbs / Title */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
          <span>{user?.role === 'ADMIN' ? 'Administration' : 'Espace Entreprise'}</span>
          <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">/</span>
          <h1 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
            {getViewTitle()}
          </h1>
        </div>
      </div>

      {/* Zone 2: Status & Quick Info */}
      <div className="hidden md:flex items-center gap-3">
        <button
          onClick={onOpenApiConfig}
          className="flex items-center gap-2 text-xs py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          title="Consulter le statut du proxy Google Apps Script"
        >
          <span className={`w-2 h-2 rounded-full ${apiConfig?.isConfigured ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
          <span>{apiConfig?.isConfigured ? 'API Apps Script active' : 'Mode Sandbox'}</span>
          <Settings2 className="w-3.5 h-3.5 text-slate-400" />
        </button>

        {user?.role === 'CLIENT' && (
          <button
            onClick={() => onNavigate('client-alerts')}
            className="relative p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Alertes non lues"
          >
            <Bell className="w-4 h-4" />
            {unreadAlertsCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-amber-500 rounded-full ring-2 ring-white dark:ring-slate-900" />
            )}
          </button>
        )}
      </div>

      {/* Zone 3: Actions & User Dropdown */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* User profile menu */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-teal-700 text-white flex items-center justify-center font-bold text-xs uppercase shadow-sm">
              {user?.nom ? user.nom.substring(0, 2) : 'CM'}
            </div>
            <div className="hidden lg:block">
              <p className="text-xs font-semibold text-slate-900 dark:text-white leading-tight truncate max-w-[140px]">
                {user?.nom}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                {user?.role === 'ADMIN' ? 'Super Admin' : 'Client'}
              </p>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden lg:block" />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-64 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95">
              <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
                <p className="text-xs font-semibold text-slate-900 dark:text-white">{user?.nom}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{user?.email}</p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300 border border-teal-200/50 dark:border-teal-800/50">
                    {user?.role === 'ADMIN' ? 'ADMINISTRATEUR' : 'ABONNÉ CLIENT'}
                  </span>
                  {user?.idClient && (
                    <span className="text-[10px] font-mono text-slate-400">
                      ID: {user.idClient}
                    </span>
                  )}
                </div>
              </div>

              <div className="py-1">
                {user?.role === 'CLIENT' ? (
                  <>
                    <button
                      onClick={() => {
                        onNavigate('client-profile');
                        setDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      <Building2 className="w-4 h-4 text-slate-400" />
                      <span>Mon Profil Entreprise & IA</span>
                    </button>
                    <button
                      onClick={() => {
                        onNavigate('client-account');
                        setDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      <UserIcon className="w-4 h-4 text-slate-400" />
                      <span>Paramètres du Compte</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        onNavigate('admin-dashboard');
                        setDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      <ShieldCheck className="w-4 h-4 text-slate-400" />
                      <span>Console Administrateur</span>
                    </button>
                  </>
                )}

                <button
                  onClick={() => {
                    onOpenApiConfig();
                    setDropdownOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <Globe className="w-4 h-4 text-slate-400" />
                  <span>Configuration API Proxy</span>
                </button>
              </div>

              <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                {user?.role === 'ADMIN' && (
                  <button
                    onClick={() => {
                      onNavigate('diagnostic');
                      setDropdownOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Activity className="w-4 h-4 text-teal-600" />
                    <span>Diagnostic technique</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Déconnexion</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
