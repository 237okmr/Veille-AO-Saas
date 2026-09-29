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
      case 'client-deadlines':
        return 'Calendrier des échéances';
      case 'client-account':
        return 'Paramètres du compte';
      // Admin views
      case 'admin-dashboard':
        return 'Supervision globale SaaS';
      case 'admin-clients':
        return 'Gestion des entreprises clientes';
      case 'admin-alertes':
        return 'Alertes clients';
      case 'admin-users':
        return 'Gestion des utilisateurs & rôles';
      case 'admin-pipeline':
        return 'Actions du pipeline de collecte';
      case 'admin-audit':
        return 'Journal d’audit & Événements';
      case 'admin-sessions':
        return 'Sessions actives & Sécurité';
      case 'admin-settings':
        return 'Réglages de la plateforme';
      case 'diagnostic':
        return 'Diagnostic technique';
      default:
        return 'Market Advisor CM';
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-ligne bg-surface/95 backdrop-blur px-4 sm:px-6">
      {/* Zone 1: Breadcrumbs / Title */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-[0.8125rem] font-medium text-discret">
          <span>{user?.role === 'ADMIN' ? 'Administration' : 'Espace Entreprise'}</span>
          <span aria-hidden="true" className="text-ligne">/</span>
          <h1 className="text-[0.9375rem] font-semibold text-encre truncate">
            {getViewTitle()}
          </h1>
        </div>
      </div>

      {/* Zone 2: Status & Quick Info */}
      <div className="hidden md:flex items-center gap-3">
        {/* Pastille technique : STRICTEMENT réservée aux administrateurs */}
        {user?.role === 'ADMIN' && (
          <button
            type="button"
            onClick={onOpenApiConfig}
            aria-label="Statut de connexion au proxy Google Apps Script"
            className="flex items-center gap-2 text-[0.8125rem] py-1.5 px-3 rounded-champ border border-ligne text-discret hover:text-encre hover:bg-onglets transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus"
            title="Consulter le statut du proxy Google Apps Script"
          >
            <span className={`w-2 h-2 rounded-full ${apiConfig?.isConfigured ? 'bg-emeraude' : 'bg-amber-500 animate-pulse'}`} />
            <span>{apiConfig?.isConfigured ? 'API Apps Script active' : 'Mode Sandbox'}</span>
            <Settings2 className="w-4 h-4 text-discret" />
          </button>
        )}

        {user?.role === 'CLIENT' && (
          <button
            type="button"
            onClick={() => onNavigate('client-alerts')}
            aria-label={`Alertes AO (${unreadAlertsCount} non lue${unreadAlertsCount > 1 ? 's' : ''})`}
            className="relative p-2 text-discret hover:text-encre rounded-champ hover:bg-onglets transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus"
            title="Consulter mes alertes"
          >
            <Bell className="w-5 h-5" />
            {unreadAlertsCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-500 rounded-full ring-2 ring-white" />
            )}
          </button>
        )}
      </div>

      {/* Zone 3: Actions & User Dropdown */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* User profile menu */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            aria-label="Menu du compte utilisateur"
            aria-expanded={dropdownOpen}
            className="flex items-center gap-2.5 p-1.5 rounded-champ hover:bg-onglets transition-colors text-left cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus"
          >
            <div className="w-8 h-8 rounded-champ bg-teal text-white flex items-center justify-center font-bold text-[0.8125rem] shadow-2xs">
              {user?.nom ? user.nom.substring(0, 2) : 'CM'}
            </div>
            <div className="hidden lg:block">
              <p className="text-[0.8125rem] font-semibold text-encre leading-tight truncate max-w-[140px]">
                {user?.nom}
              </p>
              <p className="text-[0.8125rem] text-discret leading-tight">
                {user?.role === 'ADMIN' ? 'Super Admin' : 'Client'}
              </p>
            </div>
            <ChevronDown className="w-4 h-4 text-discret hidden lg:block" />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-64 rounded-carte bg-surface border border-ligne shadow-hud py-1.5 z-50 animate-in fade-in zoom-in-95">
              <div className="px-4 py-2.5 border-b border-ligne">
                <p className="text-[0.875rem] font-semibold text-encre">{user?.nom}</p>
                <p className="text-[0.8125rem] text-discret truncate">{user?.email}</p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.8125rem] font-medium bg-ok-fond text-teal">
                    {user?.role === 'ADMIN' ? 'Administrateur' : 'Abonné client'}
                  </span>
                  {user?.idClient && (
                    <span className="text-[0.8125rem] text-discret">
                      ID: {user.idClient}
                    </span>
                  )}
                </div>
              </div>

              <div className="py-1">
                {user?.role === 'CLIENT' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        onNavigate('client-profile');
                        setDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-[0.8125rem] text-encre hover:bg-onglets transition-colors cursor-pointer"
                    >
                      <Building2 className="w-4 h-4 text-discret" />
                      <span>Mon profil entreprise & IA</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onNavigate('client-account');
                        setDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-[0.8125rem] text-encre hover:bg-onglets transition-colors cursor-pointer"
                    >
                      <UserIcon className="w-4 h-4 text-discret" />
                      <span>Paramètres du compte</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        onNavigate('admin-dashboard');
                        setDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-[0.8125rem] text-encre hover:bg-onglets transition-colors cursor-pointer"
                    >
                      <ShieldCheck className="w-4 h-4 text-discret" />
                      <span>Console administrateur</span>
                    </button>
                  </>
                )}

                {user?.role === 'ADMIN' && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenApiConfig();
                      setDropdownOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-[0.8125rem] text-encre hover:bg-onglets transition-colors cursor-pointer"
                  >
                    <Globe className="w-4 h-4 text-discret" />
                    <span>Configuration API proxy</span>
                  </button>
                )}
              </div>

              <div className="pt-1 border-t border-ligne">
                {user?.role === 'ADMIN' && (
                  <button
                    type="button"
                    onClick={() => {
                      onNavigate('diagnostic');
                      setDropdownOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-[0.8125rem] text-encre hover:bg-onglets transition-colors cursor-pointer"
                  >
                    <Activity className="w-4 h-4 text-teal" />
                    <span>Diagnostic technique</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-[0.8125rem] text-erreur hover:bg-erreur-fond transition-colors cursor-pointer"
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
