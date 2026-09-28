import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, ApiConfigInfo } from '../types';
import { api, getToken, setToken, removeToken, getStoredUser, setStoredUser } from '../services/api';
import { useToast } from './ToastContext';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  apiConfig: ApiConfigInfo | null;
  login: (email: string, motDePasse: string) => Promise<User>;
  register: (payload: { email: string; motDePasse: string; nom: string; telephone?: string; langue?: string }) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshConfig: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [loading, setLoading] = useState<boolean>(true);
  const [apiConfig, setApiConfig] = useState<ApiConfigInfo | null>(null);
  const toast = useToast();

  const refreshConfig = useCallback(async () => {
    try {
      const res = await api.getConfig();
      if (res.donnees) {
        setApiConfig(res.donnees);
      }
    } catch {
      // ignore
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const res = await api.verify(token);
      if (res.succes === true && res.donnees) {
        setUser(res.donnees);
        setStoredUser(res.donnees);
      } else {
        removeToken();
        setUser(null);
      }
    } catch {
      // If network transient failure but user in localStorage, maintain user
      if (!getStoredUser()) {
        removeToken();
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
    refreshConfig();

    const handleUnauthorized = () => {
      setUser(null);
      toast.warning('Session expirée', 'Veuillez vous reconnecter pour continuer.');
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, [refreshUser, refreshConfig, toast]);

  const login = async (email: string, motDePasse: string): Promise<User> => {
    const cleanEmail = email?.trim() || '';
    const cleanPassword = motDePasse || '';

    // Validation des identifiants vides avant envoi
    if (!cleanEmail || !cleanPassword) {
      const emptyMsg = !cleanEmail && !cleanPassword
        ? 'Veuillez saisir votre adresse email et votre mot de passe.'
        : !cleanEmail
        ? 'Veuillez saisir votre adresse email.'
        : 'Veuillez saisir votre mot de passe.';
      toast.error('Identifiants requis', emptyMsg);
      throw new Error(emptyMsg);
    }

    setLoading(true);
    try {
      const res = await api.login(cleanEmail, cleanPassword);

      // Structure exacte respectée :
      // • Vérifier le succès : response.succes === true (pas response.success)
      // • Extraire le token : response.donnees.token (pas response.data.token)
      // • Extraire l'utilisateur : response.donnees (pas response.data.user)
      // • Extraire le message : response.message (pas response.error)
      if (res.succes === true && res.donnees) {
        const token = res.donnees.token;
        if (!token) {
          throw new Error(res.message || 'Jeton de session absent de la réponse');
        }

        const authenticatedUser = res.donnees;

        // Stockage du token et de l'utilisateur complet dans localStorage
        setToken(token);
        setStoredUser(authenticatedUser);
        setUser(authenticatedUser);

        toast.success(
          res.message || 'Connexion réussie.',
          `Connecté en tant que ${authenticatedUser.role === 'ADMIN' ? 'Administrateur' : 'Client'}`
        );

        // Redirection automatique selon le rôle :
        // Si role === "ADMIN" → vers /admin (dashboard)
        // Si role === "CLIENT" → vers /client (dashboard)
        const targetPath = authenticatedUser.role === 'ADMIN' ? '/admin' : '/client';
        window.history.pushState({}, '', targetPath);
        window.dispatchEvent(new PopStateEvent('popstate'));

        return authenticatedUser;
      }

      // Si succes=false → afficher response.message (pas un message générique)
      throw new Error(res.message || 'Échec de la connexion');
    } catch (err: any) {
      const errorText = err.message || 'Email ou mot de passe incorrect';
      toast.error('Erreur de connexion', errorText);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const register = async (payload: { email: string; motDePasse: string; nom: string; telephone?: string; langue?: string }): Promise<User> => {
    setLoading(true);
    try {
      const res = await api.register(payload);
      if (res.succes === true && res.donnees && res.donnees.token) {
        setToken(res.donnees.token);
        setStoredUser(res.donnees);
        setUser(res.donnees);
        toast.success('Compte créé avec succès', 'Bienvenue sur votre espace de veille des marchés publics.');

        const targetPath = res.donnees.role === 'ADMIN' ? '/admin' : '/client';
        window.history.pushState({}, '', targetPath);
        window.dispatchEvent(new PopStateEvent('popstate'));

        return res.donnees;
      }
      throw new Error(res.message || "Échec de l'inscription");
    } catch (err: any) {
      toast.error("Erreur lors de l'inscription", err.message || 'Veuillez vérifier les informations');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // ignore
    } finally {
      removeToken();
      setUser(null);
      toast.info('Déconnexion réussie', 'À très bientôt sur la plateforme.');
      window.history.pushState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        apiConfig,
        login,
        register,
        logout,
        refreshUser,
        refreshConfig
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
