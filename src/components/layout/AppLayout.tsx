import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { ClientDashboard } from '../client/ClientDashboard';
import { ClientAlerts } from '../client/ClientAlerts';
import { ClientProfile } from '../client/ClientProfile';
import { ClientPreferences } from '../client/ClientPreferences';
import { ClientDeadlines } from '../client/ClientDeadlines';
import { ClientAccount } from '../client/ClientAccount';
import { AdminDashboard } from '../admin/AdminDashboard';
import { AdminClients } from '../admin/AdminClients';
import { AdminAvis } from '../admin/AdminAvis';
import { AdminAlertes } from '../admin/AdminAlertes';
import { AdminUsers } from '../admin/AdminUsers';
import { AdminPipeline } from '../admin/AdminPipeline';
import { AdminAudit } from '../admin/AdminAudit';
import { AdminSessions } from '../admin/AdminSessions';
import { AdminSettings } from '../admin/AdminSettings';
import { DiagnosticPage } from '../diagnostic/DiagnosticPage';
import { ApiConfigModal } from '../common/ApiConfigModal';
import { LogoMarketAdvisor } from '../brand/LogoMarketAdvisor';
import { api } from '../../services/api';
import { Menu } from 'lucide-react';

export const AppLayout: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [currentView, setCurrentView] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const p = window.location.pathname;
      if (p === '/diagnostic') return isAdmin ? 'diagnostic' : 'client-dashboard';
      if (p === '/admin') return 'admin-dashboard';
      if (p === '/client') return 'client-dashboard';
    }
    return isAdmin ? 'admin-dashboard' : 'client-dashboard';
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [apiConfigOpen, setApiConfigOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Sync default view when user role changes or prevent non-admin from accessing diagnostic/admin views
  useEffect(() => {
    if (isAdmin && currentView.startsWith('client-')) {
      setCurrentView('admin-dashboard');
    } else if (!isAdmin && (currentView.startsWith('admin-') || currentView === 'diagnostic')) {
      setCurrentView('client-dashboard');
      if (typeof window !== 'undefined' && window.location.pathname === '/diagnostic') {
        window.history.replaceState({}, '', '/client');
      }
    }
  }, [isAdmin, currentView]);

  useEffect(() => {
    const handlePop = () => {
      const p = window.location.pathname;
      if (p === '/diagnostic') setCurrentView(isAdmin ? 'diagnostic' : 'client-dashboard');
      else if (p === '/admin') setCurrentView('admin-dashboard');
      else if (p === '/client') setCurrentView('client-dashboard');
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, [isAdmin]);

  const handleNavigate = (view: string) => {
    if (view === 'diagnostic' && !isAdmin) {
      setCurrentView('client-dashboard');
      window.history.pushState({}, '', '/client');
      return;
    }
    setCurrentView(view);
    if (view === 'admin-dashboard') {
      window.history.pushState({}, '', '/admin');
    } else if (view === 'client-dashboard') {
      window.history.pushState({}, '', '/client');
    } else if (view === 'diagnostic') {
      window.history.pushState({}, '', '/diagnostic');
    }
  };

  useEffect(() => {
    if (!isAdmin) {
      api.getAlertCounts().then((res) => {
        if (res.donnees) {
          setUnreadCount(res.donnees.nonLues || 0);
        }
      }).catch(() => {});
    }
  }, [isAdmin, currentView]);

  const renderCurrentView = () => {
    switch (currentView) {
      // Client Space
      case 'client-dashboard':
        return <ClientDashboard onNavigate={handleNavigate} />;
      case 'client-alerts':
        return <ClientAlerts />;
      case 'client-profile':
        return <ClientProfile />;
      case 'client-preferences':
        return <ClientPreferences />;
      case 'client-deadlines':
        return <ClientDeadlines />;
      case 'client-account':
        return <ClientAccount />;

      // Admin Space
      case 'admin-dashboard':
        return <AdminDashboard onNavigate={handleNavigate} />;
      case 'admin-clients':
        return <AdminClients />;
      case 'admin-avis':
        return <AdminAvis onNavigate={handleNavigate} />;
      case 'admin-alertes':
        return <AdminAlertes onNavigate={handleNavigate} />;
      case 'admin-users':
        return <AdminUsers />;
      case 'admin-pipeline':
        return <AdminPipeline />;
      case 'admin-audit':
        return <AdminAudit />;
      case 'admin-sessions':
        return <AdminSessions />;
      case 'admin-settings':
        return <AdminSettings />;
      case 'diagnostic':
        return isAdmin ? (
          <DiagnosticPage onBack={() => handleNavigate('admin-dashboard')} />
        ) : (
          <ClientDashboard onNavigate={handleNavigate} />
        );

      default:
        return isAdmin ? (
          <AdminDashboard onNavigate={handleNavigate} />
        ) : (
          <ClientDashboard onNavigate={handleNavigate} />
        );
    }
  };

  return (
    <div className="min-h-screen bg-page text-encre flex flex-col">
      {/* 4px Cameroon Flag Top Strip (3 thirds) */}
      <div className="h-1 w-full flex shrink-0" role="presentation" aria-hidden="true">
        <div className="w-1/3 h-full bg-[#007A5E]" />
        <div className="w-1/3 h-full bg-[#CE1126]" />
        <div className="w-1/3 h-full bg-[#FCD116]" />
      </div>

      <div className="flex-1 flex flex-col lg:flex-row min-w-0">
        {/* Sidebar Navigation */}
        <Sidebar
          currentView={currentView}
          onNavigate={handleNavigate}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          unreadCount={unreadCount}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Header */}
          <Header
            currentView={currentView}
            onNavigate={handleNavigate}
            onOpenApiConfig={() => setApiConfigOpen(true)}
            unreadAlertsCount={unreadCount}
          />

          {/* Mobile Header Bar */}
          <div className="lg:hidden flex items-center gap-3 px-4 h-14 border-b border-ligne bg-page">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Ouvrir le menu de navigation"
              aria-expanded={sidebarOpen}
              className="w-11 h-11 flex items-center justify-center rounded-champ hover:bg-onglets text-encre cursor-pointer"
            >
              <Menu className="w-5 h-5 text-encre" />
            </button>
            <LogoMarketAdvisor taille="sm" />
          </div>

          {/* Page View Viewport */}
          <main className="flex-1 overflow-y-auto pb-16">
            {renderCurrentView()}
          </main>
        </div>
      </div>

      {/* API Config Modal */}
      {apiConfigOpen && <ApiConfigModal onClose={() => setApiConfigOpen(false)} />}
    </div>
  );
};
