import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Langue, CleAccueil, dictionnaireAccueil } from '../i18n/accueil';

interface LangueContextValue {
  langue: Langue;
  setLangue: (langue: Langue) => void;
  changerLangue: (langue: Langue) => void;
  t: (cle: CleAccueil, params?: Record<string, string | number>) => string;
}

const getInitialLangue = (): Langue => {
  try {
    const saved = localStorage.getItem('mact-langue');
    if (saved === 'en' || saved === 'fr') {
      return saved;
    }
  } catch (e) {
    // Ignore error reading localStorage
  }
  return 'fr';
};

const LangueContext = createContext<LangueContextValue | undefined>(undefined);

export const LangueProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [langue, setLangueState] = useState<Langue>(getInitialLangue);

  const setLangue = useCallback((nouvelleLangue: Langue) => {
    setLangueState(nouvelleLangue);
    try {
      localStorage.setItem('mact-langue', nouvelleLangue);
    } catch (e) {
      // Ignore error writing localStorage
    }
  }, []);

  useEffect(() => {
    try {
      document.documentElement.lang = langue;
    } catch (e) {
      // Ignore error updating document element
    }
  }, [langue]);

  const t = useCallback((cle: CleAccueil, params?: Record<string, string | number>): string => {
    let texte: string = dictionnaireAccueil[langue]?.[cle] || dictionnaireAccueil.fr[cle] || cle;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        texte = texte.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      });
    }
    return texte;
  }, [langue]);

  return (
    <LangueContext.Provider value={{ langue, setLangue, changerLangue: setLangue, t }}>
      {children}
    </LangueContext.Provider>
  );
};

export const useLangue = (): LangueContextValue => {
  const context = useContext(LangueContext);
  if (!context) {
    throw new Error('useLangue doit être utilisé au sein d’un LangueProvider');
  }
  return context;
};
