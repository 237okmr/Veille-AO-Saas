/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ToastProvider, useToast } from './context/ToastContext';
import { LangueProvider } from './context/LangueContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthPage } from './components/auth/AuthPage';
import { AccesParLien } from './components/auth/AccesParLien';
import { AppLayout } from './components/layout/AppLayout';
import { DiagnosticPage } from './components/diagnostic/DiagnosticPage';
import { LogoMarketAdvisor } from './components/brand/LogoMarketAdvisor';

// Lit le jeton du lien de connexion des e-mails d'alerte : « /#acces=<64 caractères hexadécimaux> ».
// Fonction pure (aucun effet de bord) : elle peut être appelée deux fois sans conséquence.
const lireJetonAcces = (): string | null => {
  if (typeof window === 'undefined') return null;
  const m = /^#acces=([0-9a-fA-F]{64})$/.exec(window.location.hash);
  return m ? m[1].toLowerCase() : null;
};

const MainRouter: React.FC = () => {
  // TOUS les hooks sont déclarés au début du composant, avant tout retour conditionnel.
  const { user, loading } = useAuth();
  const toast = useToast();

  // Jeton du lien de connexion : gardé en mémoire seulement, jamais écrit dans localStorage.
  const [jetonAcces, setJetonAcces] = React.useState<string | null>(() => lireJetonAcces());

  const [pathname, setPathname] = React.useState(() => {
    if (typeof window !== 'undefined') {
      return window.location.pathname;
    }
    return '/';
  });

  // Retire aussitôt le jeton de la barre d'adresse et de l'historique du navigateur.
  React.useEffect(() => {
    if (/^#acces=/.test(window.location.hash)) {
      window.history.replaceState({}, '', window.location.pathname + window.location.search);
    }
  }, []);

  // Écoute des événements d'historique du navigateur (boutons retour/avant)
  React.useEffect(() => {
    const handlePopState = () => {
      setPathname(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Sécurité route /diagnostic : si un non-administrateur tente d'y accéder, redirection propre vers l'accueil ou l'espace client
  React.useEffect(() => {
    if (!loading && pathname === '/diagnostic' && (!user || user.role !== 'ADMIN')) {
      const target = user ? '/client' : '/';
      window.history.replaceState({}, '', target);
      setPathname(target);
    }
  }, [loading, pathname, user]);

  // Redirection automatique de la racine vers /admin ou /client dès que l'utilisateur est connecté
  React.useEffect(() => {
    if (!loading && user && (pathname === '/' || pathname === '')) {
      const target = user.role === 'ADMIN' ? '/admin' : '/client';
      window.history.replaceState({}, '', target);
      setPathname(target);
    }
  }, [loading, user, pathname]);

  // 1. Lien de connexion reçu par e-mail : l'écran de confirmation passe avant tout le reste.
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

  // 2. Écran de chargement institutionnel avec le logo officiel
  if (loading) {
    return (
      <div className="min-h-screen bg-page flex flex-col items-center justify-center space-y-4 p-4">
        <LogoMarketAdvisor taille="md" />
        <div className="w-9 h-9 border-3 border-teal/20 border-t-teal rounded-full animate-spin" />
        <p role="status" className="text-[0.9375rem] text-discret font-medium">
          Chargement de votre espace…
        </p>
      </div>
    );
  }

  // 3. Page de diagnostic technique : STRICTEMENT réservée aux administrateurs
  if (pathname === '/diagnostic' && user && user.role === 'ADMIN') {
    return (
      <DiagnosticPage
        onBack={() => {
          const target = '/admin';
          window.history.pushState({}, '', target);
          setPathname(target);
        }}
      />
    );
  }

  // 4. Écran normal : espace applicatif authentifié ou page d'accueil / connexion
  return user ? <AppLayout /> : <AuthPage />;
};

export default function App() {
  return (
    <LangueProvider>
      <ToastProvider>
        <AuthProvider>
          <MainRouter />
        </AuthProvider>
      </ToastProvider>
    </LangueProvider>
  );
}
