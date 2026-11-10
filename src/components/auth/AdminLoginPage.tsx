import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheck, Mail, Lock, AlertCircle, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { LogoMarketAdvisor } from '../brand/LogoMarketAdvisor';

// Page de connexion de l'espace administration (adresse /admin).
// - Bouton Google (principal) ; e-mail + mot de passe (secours).
// - Messages d'échec neutres : aucune indication sur l'existence d'un compte.
// - Le contrôle réel du rôle se fait côté serveur et Apps Script, jamais ici.

const GSI_SRC = 'https://accounts.google.com/gsi/client';

declare global {
  interface Window {
    google?: any;
  }
}

function chargerScriptGoogle(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existant = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    if (existant) {
      existant.addEventListener('load', () => resolve());
      existant.addEventListener('error', () => reject(new Error('gsi')));
      return;
    }
    const s = document.createElement('script');
    s.src = GSI_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('gsi'));
    document.head.appendChild(s);
  });
}

export const AdminLoginPage: React.FC = () => {
  const { login, loginGoogle, apiConfig, refreshConfig } = useAuth();

  const boutonGoogleRef = useRef<HTMLDivElement>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [googleIndisponible, setGoogleIndisponible] = useState(false);
  const [enCours, setEnCours] = useState(false);

  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [voirMdp, setVoirMdp] = useState(false);

  const clientId = apiConfig?.googleClientId || null;

  useEffect(() => {
    if (!apiConfig) void refreshConfig();
  }, [apiConfig, refreshConfig]);

  useEffect(() => {
    if (!apiConfig) return;
    if (!clientId) {
      setGoogleIndisponible(true);
      return;
    }
    let annule = false;
    chargerScriptGoogle()
      .then(() => {
        if (annule || !window.google?.accounts?.id || !boutonGoogleRef.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (reponse: { credential?: string }) => {
            if (!reponse?.credential) {
              setErreur('Accès refusé.');
              return;
            }
            setErreur(null);
            setEnCours(true);
            try {
              await loginGoogle(reponse.credential);
            } catch {
              setErreur('Accès refusé.');
            } finally {
              setEnCours(false);
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true
        });
        window.google.accounts.id.renderButton(boutonGoogleRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width: 320,
          locale: 'fr'
        });
      })
      .catch(() => {
        if (!annule) setGoogleIndisponible(true);
      });
    return () => {
      annule = true;
    };
  }, [apiConfig, clientId, loginGoogle]);

  const soumettreMotDePasse = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur(null);
    if (!email.trim() || !motDePasse) {
      setErreur('Saisissez votre adresse e-mail et votre mot de passe.');
      return;
    }
    setEnCours(true);
    try {
      await login(email.trim(), motDePasse);
    } catch {
      setErreur('Accès refusé.');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-page font-corps text-encre flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px] flex flex-col items-center space-y-6">
        <LogoMarketAdvisor taille="md" />

        <div className="w-full bg-white border border-ligne/80 rounded-carte shadow-hud p-6 sm:p-7 space-y-5">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-teal" aria-hidden="true" />
            <h1 className="text-lg font-semibold">Espace administration</h1>
          </div>

          {erreur && (
            <div role="alert" className="flex items-start gap-2 rounded-champ border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              <span>{erreur}</span>
            </div>
          )}

          <div className="flex flex-col items-center gap-2 min-h-[44px]">
            {!googleIndisponible && <div ref={boutonGoogleRef} aria-label="Connexion avec Google" />}
            {googleIndisponible && (
              <p className="text-sm text-discret text-center">
                La connexion Google est indisponible pour le moment. Utilisez votre adresse e-mail et votre mot de passe.
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-discret">
            <span className="flex-1 h-px bg-ligne" />
            <span>ou</span>
            <span className="flex-1 h-px bg-ligne" />
          </div>

          <form onSubmit={soumettreMotDePasse} className="space-y-3" noValidate>
            <label className="block">
              <span className="text-sm font-medium">Adresse e-mail</span>
              <div className="relative mt-1">
                <Mail className="w-4 h-4 text-discret absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-[44px] pl-9 pr-3 rounded-champ border border-ligne bg-white text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus"
                />
              </div>
            </label>
            <label className="block">
              <span className="text-sm font-medium">Mot de passe</span>
              <div className="relative mt-1">
                <Lock className="w-4 h-4 text-discret absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  type={voirMdp ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                  className="w-full h-[44px] pl-9 pr-10 rounded-champ border border-ligne bg-white text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus"
                />
                <button
                  type="button"
                  onClick={() => setVoirMdp((v) => !v)}
                  aria-label={voirMdp ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-discret hover:text-encre cursor-pointer"
                >
                  {voirMdp ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </label>
            <button
              type="submit"
              disabled={enCours}
              className="w-full h-[44px] flex items-center justify-center gap-2 rounded-champ bg-teal text-white text-sm font-semibold disabled:opacity-60 cursor-pointer focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus focus-visible:ring-offset-2"
            >
              {enCours ? 'Vérification…' : 'Se connecter'}
              {!enCours && <ArrowRight className="w-4 h-4" aria-hidden="true" />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
