/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ToastProvider, useToast } from './context/ToastContext';
import { ThemeProvider } from './context/ThemeContext';
import { LangueProvider } from './context/LangueContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthPage } from './components/auth/AuthPage';
import { AccesParLien } from './components/auth/AccesParLien';
import { AppLayout } from './components/layout/AppLayout';
import { DiagnosticPage } from './components/diagnostic/DiagnosticPage';

// Lit le jeton du lien de connexion des e-mails d'alerte : « /#acces=<64 caractères hexadécimaux> ».
// Fonction pure (aucun effet de bord) : elle peut être appelée deux fois sans conséquence.
const lireJetonAcces = (): string | null => {
  if (typeof window === 'undefined') return null;
  const m = /^#acces=([0-9a-fA-F]{64})$/.exec(window.location.hash);
  return m ? m[1].toLowerCase() : null;
};

const MainRouter: React.FC = () => {
  const { user, loading } = useAuth();
  const toast = useToast();

  // Jeton du lien de connexion : gardé en mémoire seulement, jamais écrit dans localStorage.
  const [jetonAcces, setJetonAcces] = React.useState<string | null>(() => lireJetonAcces());

  // Retire aussitôt le jeton de la barre d'adresse et de l'historique du navigateur.
  React.useEffect(() => {
    if (/^#acces=/.test(window.location.hash)) {
      window.history.replaceState({}, '', window.location.pathname + window.location.search);
    }
  }, []);

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

  // Lien de connexion reçu par e-mail : l'écran de confirmation passe avant tout le reste.
  if (jetonAcces) {
    return (
      <AccesParLien
        jeton={jetonAcces}
        onSucces={() => setJetonAcces(null)}
        onEchec={(message) => {
          setJetonAcces(null);
          toast.warning('Lien non valide', message);
        }}
        onAnnuler={() => setJetonAcces(null)}
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-page flex flex-col items-center justify-center space-y-4">
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
      <LangueProvider>
        <ToastProvider>
          <AuthProvider>
            <MainRouter />
          </AuthProvider>
        </ToastProvider>
      </LangueProvider>
    </ThemeProvider>
  );
}
