import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import {
  Lock,
  Mail,
  ArrowRight,
  Sun,
  Moon,
  Eye,
  EyeOff,
  AlertCircle,
  ShieldCheck
} from 'lucide-react';

export const AuthPage: React.FC = () => {
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanEmail = email.trim();
    const cleanPassword = password;

    if (!cleanEmail && !cleanPassword) {
      setFormError('Veuillez saisir votre adresse email et votre mot de passe.');
      return;
    }
    if (!cleanEmail) {
      setFormError('Veuillez saisir votre adresse email.');
      return;
    }
    if (!cleanPassword) {
      setFormError('Veuillez saisir votre mot de passe.');
      return;
    }

    setLoading(true);
    try {
      await login(cleanEmail, cleanPassword);
    } catch (err: any) {
      setFormError(err.message || 'Email ou mot de passe incorrect');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/70 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Top right theme toggle */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <button
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
          className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 shadow-xs hover:bg-slate-100 transition-colors"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4">
        {/* Brand header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center p-2 rounded-2xl bg-teal-50 border border-teal-200/80 mb-4 shadow-xs">
            {/* Flag icon */}
            <div className="w-8 h-8 rounded-lg overflow-hidden flex shadow-xs border border-slate-200">
              <div className="w-1/3 h-full bg-[#007a5e]" />
              <div className="w-1/3 h-full bg-[#ce1126] flex items-center justify-center">
                <span className="text-[#fcd116] text-[8px] font-black">★</span>
              </div>
              <div className="w-1/3 h-full bg-[#fcd116]" />
            </div>
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
            Veille des Marchés Publics
          </h2>
          <p className="mt-1.5 text-xs text-slate-600">
            Plateforme d’intelligence et de ciblage automatique des appels d’offres au Cameroun
          </p>
        </div>

        {/* Card - Pure White, Airy & Minimalist */}
        <div className="mt-8 bg-white py-8 px-4 sm:px-8 border border-slate-200/90 rounded-2xl shadow-sm">
          <div className="text-center mb-6">
            <h3 className="text-sm font-bold text-slate-900">Connexion</h3>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            {formError && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2.5 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1 font-medium leading-relaxed">{formError}</div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Adresse email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="ex: 237okmr@gmail.com"
                  className="w-full pl-10 pr-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 transition-colors placeholder:text-slate-400"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Mot de passe
                </label>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 transition-colors placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 active:bg-teal-900 transition-colors shadow-xs hover:shadow disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Se connecter</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-5 pt-5 border-t border-slate-100 flex items-start gap-2 text-[11px] text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-teal-600 shrink-0 mt-0.5" />
            <span>
              Accès réservé : vos identifiants vous sont fournis par l'administrateur de la plateforme.
              Aucune inscription publique n'est proposée ici.
            </span>
          </div>
        </div>

        {/* Feature proofs footer */}
        <div className="mt-8 text-center text-xs text-slate-500 space-y-1">
          <p>Veille ARMP · DGTCFM · Ministères · Mairies & FEICOM</p>
          <p className="text-[11px]">Couverture intégrale des 10 régions du Cameroun</p>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                window.history.pushState({}, '', '/diagnostic');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
              className="text-[11px] font-medium text-slate-400 hover:text-teal-700 underline decoration-slate-300 transition-colors cursor-pointer"
            >
              Diagnostic technique & connectivité API (/diagnostic)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
