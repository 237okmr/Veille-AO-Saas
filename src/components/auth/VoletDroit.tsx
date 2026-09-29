import React, { useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLangue } from '../../context/LangueContext';
import {
  Lock,
  Mail,
  ArrowRight,
  Eye,
  EyeOff,
  AlertCircle,
  ShieldCheck
} from 'lucide-react';
import { AccrocheCommerciale } from './AccrocheCommerciale';
import { EtapesCommentCaMarche } from './EtapesCommentCaMarche';

export type OngletActif = 'pilote' | 'connexion';

interface VoletDroitProps {
  ongletActif: OngletActif;
  onSelectOnglet: (onglet: OngletActif) => void;
  firstInputRef?: React.RefObject<HTMLInputElement | null>;
}

export const VoletDroit: React.FC<VoletDroitProps> = ({
  ongletActif,
  onSelectOnglet,
  firstInputRef
}) => {
  const { login } = useAuth();
  const { t } = useLangue();

  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const tabPiloteRef = useRef<HTMLButtonElement>(null);
  const tabConnexionRef = useRef<HTMLButtonElement>(null);

  // Navigation accessible au clavier (flèches gauche et droite)
  const handleTabKeyDown = (e: React.KeyboardEvent, currentTab: OngletActif) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const nextTab: OngletActif = currentTab === 'pilote' ? 'connexion' : 'pilote';
      onSelectOnglet(nextTab);
      if (nextTab === 'pilote') {
        tabPiloteRef.current?.focus();
      } else {
        tabConnexionRef.current?.focus();
      }
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanEmail = email.trim();
    const cleanPassword = password;

    if (!cleanEmail && !cleanPassword) {
      setFormError(t('erreurObligatoire') || 'Veuillez saisir votre adresse email et votre mot de passe.');
      return;
    }
    if (!cleanEmail) {
      setFormError(t('erreurEmail') || 'Veuillez saisir votre adresse email.');
      return;
    }
    if (!cleanPassword) {
      setFormError(t('erreurObligatoire') || 'Veuillez saisir votre mot de passe.');
      return;
    }

    setLoading(true);
    try {
      await login(cleanEmail, cleanPassword);
    } catch (err: any) {
      setFormError(err.message || t('connexionErreur') || 'Identifiants non reconnus.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-[470px] mx-auto my-auto flex flex-col justify-center">
      {/* 1. Accroche commerciale au-dessus du cadre */}
      <AccrocheCommerciale />

      {/* 2. Cadre à onglets marqué conteneur (@container) */}
      <div className="@container w-full bg-white/95 backdrop-blur-[12px] border border-ligne/80 rounded-carte shadow-hud p-5 text-encre">
        {/* Barre d'onglets (Gouttière #F1F5F9, onglets 44px) */}
        <div
          role="tablist"
          aria-label="Choix d'accès"
          className="grid grid-cols-2 p-1 bg-onglets rounded-champ gap-1"
        >
          {/* Onglet : Accès pilote */}
          <button
            ref={tabPiloteRef}
            type="button"
            role="tab"
            id="tab-pilote"
            aria-controls="panel-pilote"
            aria-selected={ongletActif === 'pilote'}
            tabIndex={ongletActif === 'pilote' ? 0 : -1}
            onClick={() => onSelectOnglet('pilote')}
            onKeyDown={(e) => handleTabKeyDown(e, 'pilote')}
            className={`h-[44px] flex items-center justify-center font-semibold text-xs rounded-champ transition-all focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus focus-visible:ring-offset-2 cursor-pointer ${
              ongletActif === 'pilote'
                ? 'bg-teal text-white shadow-xs'
                : 'text-discret hover:text-encre'
            }`}
          >
            {t('ongletPilote')}
          </button>

          {/* Onglet : Déjà client */}
          <button
            ref={tabConnexionRef}
            type="button"
            role="tab"
            id="tab-connexion"
            aria-controls="panel-connexion"
            aria-selected={ongletActif === 'connexion'}
            tabIndex={ongletActif === 'connexion' ? 0 : -1}
            onClick={() => onSelectOnglet('connexion')}
            onKeyDown={(e) => handleTabKeyDown(e, 'connexion')}
            className={`h-[44px] flex items-center justify-center font-semibold text-xs rounded-champ transition-all focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus focus-visible:ring-offset-2 cursor-pointer ${
              ongletActif === 'connexion'
                ? 'bg-teal text-white shadow-xs'
                : 'text-discret hover:text-encre'
            }`}
          >
            {t('ongletConnexion')}
          </button>
        </div>

        {/* Panneaux sous les onglets (marge haute 16px) */}
        <div className="mt-4">
          {/* PANNEAU 1 : Accès Pilote (Provisoire avant LOT 5B) */}
          {ongletActif === 'pilote' && (
            <div
              role="tabpanel"
              id="panel-pilote"
              aria-labelledby="tab-pilote"
              className="space-y-4 animate-in fade-in duration-200"
            >
              <div className="text-center pb-2 border-b border-ligne">
                <h3 className="text-sm font-bold font-titre text-encre">
                  {t('pilotTitre')}
                </h3>
                <p className="text-xs text-discret mt-0.5">
                  {t('accrocheSousTitre')}
                </p>
              </div>

              {/* Étapes résumées */}
              <div className="space-y-2.5 py-1">
                <div className="flex items-start gap-2.5 p-2.5 rounded-champ bg-slate-50 border border-ligne/80 text-xs">
                  <span className="w-5 h-5 rounded-full bg-teal text-white font-bold flex items-center justify-center text-[10px] shrink-0">
                    1
                  </span>
                  <div>
                    <span className="font-semibold text-encre block">{t('etape1Titre')}</span>
                    <span className="text-discret text-[11px]">{t('etape1Texte')}</span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 rounded-champ bg-slate-50 border border-ligne/80 text-xs">
                  <span className="w-5 h-5 rounded-full bg-teal text-white font-bold flex items-center justify-center text-[10px] shrink-0">
                    2
                  </span>
                  <div>
                    <span className="font-semibold text-encre block">{t('etape2Titre')}</span>
                    <span className="text-discret text-[11px]">{t('etape2Texte')}</span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 rounded-champ bg-slate-50 border border-ligne/80 text-xs">
                  <span className="w-5 h-5 rounded-full bg-teal text-white font-bold flex items-center justify-center text-[10px] shrink-0">
                    3
                  </span>
                  <div>
                    <span className="font-semibold text-encre block">{t('etape3Titre')}</span>
                    <span className="text-discret text-[11px]">{t('etape3Texte')}</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onSelectOnglet('connexion')}
                className="w-full py-2.5 px-4 rounded-champ bg-cta hover:bg-cta-survol text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <span>{t('pilotEnvoyer')}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* PANNEAU 2 : Déjà client / Connexion */}
          {ongletActif === 'connexion' && (
            <div
              role="tabpanel"
              id="panel-connexion"
              aria-labelledby="tab-connexion"
              className="space-y-4 animate-in fade-in duration-200"
            >
              <div className="text-center pb-2 border-b border-ligne">
                <h3 className="text-sm font-bold font-titre text-encre">
                  {t('connexionTitre')}
                </h3>
                <p className="text-xs text-discret mt-0.5 leading-relaxed">
                  {t('connexionSousTitre')}
                </p>
              </div>

              <form onSubmit={handleLoginSubmit} className="space-y-3.5">
                {formError && (
                  <div className="p-3 rounded-champ bg-erreur-fond border border-erreur/20 text-xs text-erreur flex items-start gap-2 animate-in fade-in">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="flex-1 font-medium leading-relaxed">{formError}</div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-encre mb-1.5">
                    {t('champEmail')}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-discret">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      ref={firstInputRef as any}
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (formError) setFormError(null);
                      }}
                      placeholder="vous@entreprise.cm"
                      className="w-full pl-10 pr-3.5 py-2.5 text-xs rounded-champ border border-ligne bg-surface text-encre focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus focus-visible:ring-offset-2 transition-colors placeholder:text-discret"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-encre">
                      {t('champMotDePasse')}
                    </label>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-discret">
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
                      className="w-full pl-10 pr-10 py-2.5 text-xs rounded-champ border border-ligne bg-surface text-encre focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus focus-visible:ring-offset-2 transition-colors placeholder:text-discret"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? t('masquerMotDePasse') : t('afficherMotDePasse')}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-discret hover:text-encre focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus focus-visible:ring-offset-2 rounded cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Bouton de connexion */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-champ text-xs font-semibold text-white bg-teal hover:opacity-90 active:opacity-95 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus focus-visible:ring-offset-2 transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {loading ? (
                    <span>{t('connexionEnCours')}</span>
                  ) : (
                    <>
                      <span>{t('connexionEnvoyer')}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-4 pt-4 border-t border-ligne flex items-start gap-2 text-[11px] text-discret leading-relaxed">
                <ShieldCheck className="w-3.5 h-3.5 text-teal shrink-0 mt-0.5" />
                <span>{t('connexionSousTitre')}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Trois étapes sous le cadre à onglets (visible si hauteur >= 940px sur PC, toujours sur mobile) */}
      <EtapesCommentCaMarche />

      {/* 4. Ligne des sources sous les étapes (masquée sous 700px de hauteur sur PC) */}
      <p className="mt-3.5 text-center text-[0.8125rem] text-discret hide-sources-under-700 select-none">
        {t('sources')}
      </p>
    </div>
  );
};
