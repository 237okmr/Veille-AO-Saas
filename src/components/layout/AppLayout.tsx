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
import { AdminUsers } from '../admin/AdminUsers';
import { AdminPipeline } from '../admin/AdminPipeline';
import { AdminAudit } from '../admin/AdminAudit';
import { AdminSessions } from '../admin/AdminSessions';
import { AdminSettings } from '../admin/AdminSettings';
import { DiagnosticPage } from '../diagnostic/DiagnosticPage';
import { ApiConfigModal } from '../common/ApiConfigModal';
import { api } from '../../services/api';

export const AppLayout: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [currentView, setCurrentView] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const p = window.location.pathname;
      if (p === '/diagnostic') return 'diagnostic';
      if (p === '/admin') return 'admin-dashboard';
      if (p === '/client') return 'client-dashboard';
    }
    return isAdmin ? 'admin-dashboard' : 'client-dashboard';
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [apiConfigOpen, setApiConfigOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Sync default view when user role changes
  useEffect(() => {
    if (isAdmin && currentView.startsWith('client-')) {
      setCurrentView('admin-dashboard');
    } else if (!isAdmin && currentView.startsWith('admin-')) {
      setCurrentView('client-dashboard');
    }
  }, [isAdmin, currentView]);

  useEffect(() => {
    const handlePop = () => {
      const p = window.location.pathname;
      if (p === '/diagnostic') setCurrentView('diagnostic');
      else if (p === '/admin') setCurrentView('admin-dashboard');
      else if (p === '/client') setCurrentView('client-dashboard');
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  const handleNavigate = (view: string) => {
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
        return <DiagnosticPage onBack={() => handleNavigate(isAdmin ? 'admin-dashboard' : 'client-dashboard')} />;

      default:
        return isAdmin ? (
          <AdminDashboard onNavigate={handleNavigate} />
        ) : (
          <ClientDashboard onNavigate={handleNavigate} />
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/80 text-slate-900 flex flex-col lg:flex-row">
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

        {/* Mobile Header Bar Button */}
        <div className="lg:hidden flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-white">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex items-center gap-2 text-xs font-semibold text-teal-700 p-1.5 rounded-lg border border-slate-200"
          >
            <span className="w-4 h-0.5 bg-teal-700 block mb-1" />
            <span>Menu Navigation</span>
          </button>
        </div>

        {/* Page View Viewport */}
        <main className="flex-1 overflow-y-auto pb-16">
          {renderCurrentView()}
        </main>
      </div>

      {/* API Config Modal */}
      {apiConfigOpen && <ApiConfigModal onClose={() => setApiConfigOpen(false)} />}
    </div>
  );
};
