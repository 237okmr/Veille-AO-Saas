/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ToastProvider } from './context/ToastContext';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthPage } from './components/auth/AuthPage';
import { AppLayout } from './components/layout/AppLayout';
import { DiagnosticPage } from './components/diagnostic/DiagnosticPage';

const MainRouter: React.FC = () => {
  const { user, loading } = useAuth();
  const [pathname, setPathname] = React.useState(() => {
    if (typeof window !== 'undefined') {
      return window.location.pathname;
    }
    return '/';
  });

  React.useEffect(() => {
    const handlePopState = () => {
      setPathname(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Direct access to /diagnostic route even if not logged in or if login failed
  if (pathname === '/diagnostic') {
    return (
      <DiagnosticPage
        onBack={() => {
          const target = user ? (user.role === 'ADMIN' ? '/admin' : '/client') : '/';
          window.history.pushState({}, '', target);
          setPathname(target);
        }}
      />
    );
  }

  React.useEffect(() => {
    if (user && (pathname === '/' || pathname === '')) {
      const target = user.role === 'ADMIN' ? '/admin' : '/client';
      window.history.replaceState({}, '', target);
      setPathname(target);
    }
  }, [user, pathname]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 border-3 border-teal-700/20 border-t-teal-700 rounded-full animate-spin" />
        <p className="text-xs font-semibold text-slate-500 font-mono tracking-wider">
          CHARGEMENT DE LA PLATEFORME...
        </p>
      </div>
    );
  }

  return user ? <AppLayout /> : <AuthPage />;
};

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <MainRouter />
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
