import React, { useState, useRef, useEffect } from 'react';
import { Check, ArrowRight, RotateCcw } from 'lucide-react';
import { useLangue } from '../../context/LangueContext';

/**
 * Envoie une demande d'accès pilote.
 * TODO : branchement réel à valider (route Apps Script dédiée)
 */
export async function envoyerDemandePilote(payload: {
  nom: string;
  entreprise: string;
  email: string;
  secteur: string;
}): Promise<{ succes: boolean; message?: string }> {
  // Simulation de l'envoi réseau sans persistance locale
  await new Promise((resolve) => setTimeout(resolve, 500));
  return { succes: true };
}

interface FormulairePiloteProps {
  firstInputRef?: React.RefObject<HTMLInputElement | null>;
}

export const FormulairePilote: React.FC<FormulairePiloteProps> = ({ firstInputRef }) => {
  const { t } = useLangue();

  const [nom, setNom] = useState('');
  const [entreprise, setEntreprise] = useState('');
  const [email, setEmail] = useState('');
  const [secteur, setSecteur] = useState('');

  const [erreurs, setErreurs] = useState<{
    nom?: string;
    entreprise?: string;
    email?: string;
    secteur?: string;
  }>({});

  const [loading, setLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');

  const localNomRef = useRef<HTMLInputElement>(null);
  const entrepriseRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const secteurRef = useRef<HTMLSelectElement>(null);
  const confirmationRef = useRef<HTMLDivElement>(null);

  // Synchronisation de la ref du premier champ
  const nomInputRef = firstInputRef || localNomRef;

  // Focus sur l'écran de confirmation lors de l'affichage
  useEffect(() => {
    if (isSubmitted) {
      confirmationRef.current?.focus();
    }
  }, [isSubmitted]);

  const validerFormulaire = () => {
    const nouvellesErreurs: {
      nom?: string;
      entreprise?: string;
      email?: string;
      secteur?: string;
    } = {};

    const cleanNom = nom.trim();
    const cleanEntreprise = entreprise.trim();
    const cleanEmail = email.trim();
    const cleanSecteur = secteur.trim();

    if (!cleanNom) {
      nouvellesErreurs.nom = t('erreurObligatoire');
    }

    if (!cleanEntreprise) {
      nouvellesErreurs.entreprise = t('erreurObligatoire');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail) {
      nouvellesErreurs.email = t('erreurObligatoire');
    } else if (!emailRegex.test(cleanEmail)) {
      nouvellesErreurs.email = t('erreurEmail');
    }

    if (!cleanSecteur) {
      nouvellesErreurs.secteur = t('erreurSecteur');
    }

    setErreurs(nouvellesErreurs);

    // Focus sur le premier champ en erreur
    if (nouvellesErreurs.nom) {
      (nomInputRef as React.RefObject<HTMLInputElement>)?.current?.focus();
    } else if (nouvellesErreurs.entreprise) {
      entrepriseRef.current?.focus();
    } else if (nouvellesErreurs.email) {
      emailRef.current?.focus();
    } else if (nouvellesErreurs.secteur) {
      secteurRef.current?.focus();
    }

    return Object.keys(nouvellesErreurs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validerFormulaire()) {
      return;
    }

    setLoading(true);
    try {
      await envoyerDemandePilote({
        nom: nom.trim(),
        entreprise: entreprise.trim(),
        email: email.trim(),
        secteur: secteur.trim()
      });
      setSubmittedEmail(email.trim());
      setIsSubmitted(true);
    } catch {
      // En cas d'erreur de traitement
    } finally {
      setLoading(false);
    }
  };

  const handleRecommencer = () => {
    setNom('');
    setEntreprise('');
    setEmail('');
    setSecteur('');
    setErreurs({});
    setIsSubmitted(false);
    setSubmittedEmail('');
    setTimeout(() => {
      (nomInputRef as React.RefObject<HTMLInputElement>)?.current?.focus();
    }, 50);
  };

  // =========================================================================
  // 2. Écran de confirmation (même panneau)
  // =========================================================================
  if (isSubmitted) {
    return (
      <div
        ref={confirmationRef}
        tabIndex={-1}
        role="region"
        aria-live="polite"
        className="py-6 px-2 text-center flex flex-col items-center justify-center outline-none animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Pastille ronde verte avec coche */}
        <div className="w-12 h-12 rounded-full bg-ok-fond text-ok flex items-center justify-center mb-3.5 shadow-2xs">
          <Check className="w-6 h-6 stroke-[2.5]" />
        </div>

        {/* Titre confirmation */}
        <h2 className="font-titre font-bold text-base sm:text-lg text-encre mb-1.5">
          {t('pilotOkTitre')}
        </h2>

        {/* Phrase d'explication avec e-mail en gras */}
        <p className="text-xs sm:text-sm text-discret leading-relaxed max-w-xs mb-5">
          {t('pilotOkCorps')}{' '}
          <strong className="font-bold text-encre">{submittedEmail}</strong>.
        </p>

        {/* Bouton contour recommencer */}
        <button
          type="button"
          onClick={handleRecommencer}
          className="h-11 px-5 rounded-champ bg-surface border border-champ text-encre font-semibold text-xs hover:bg-slate-50 active:bg-slate-100 transition-colors flex items-center gap-2 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus focus-visible:ring-offset-2 cursor-pointer shadow-2xs"
        >
          <RotateCcw className="w-3.5 h-3.5 text-discret" />
          <span>{t('pilotOkRecommencer')}</span>
        </button>
      </div>
    );
  }

  // =========================================================================
  // 1. Formulaire de demande d'accès pilote
  // =========================================================================
  return (
    <div className="w-full">
      {/* Titre H2 (Pas de sous-titre) */}
      <h2 className="font-titre font-extrabold text-[1.45rem] leading-tight text-encre mb-3.5">
        {t('pilotTitre')}
      </h2>

      <form onSubmit={handleSubmit} noValidate className="space-y-0">
        {/* Ligne 1 : Nom complet et Entreprise (2 colonnes si conteneur >= 400px) */}
        <div className="grid grid-cols-1 @[400px]:grid-cols-2 gap-3 mb-3">
          {/* Champ : Nom complet */}
          <div>
            <label htmlFor="champ-nom-pilote" className="block text-[0.875rem] font-semibold text-encre mb-1.5">
              {t('champNom')}
            </label>
            <input
              id="champ-nom-pilote"
              ref={nomInputRef as React.RefObject<HTMLInputElement>}
              type="text"
              value={nom}
              onChange={(e) => {
                setNom(e.target.value);
                if (erreurs.nom) setErreurs((prev) => ({ ...prev, nom: undefined }));
              }}
              aria-invalid={Boolean(erreurs.nom)}
              aria-describedby={erreurs.nom ? 'erreur-nom-pilote' : undefined}
              className={`w-full h-[46px] px-3.5 text-xs sm:text-sm rounded-champ border bg-surface text-encre transition-colors placeholder:text-discret focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                erreurs.nom ? 'border-erreur ring-1 ring-erreur' : 'border-champ'
              }`}
            />
            {erreurs.nom && (
              <p id="erreur-nom-pilote" className="text-[0.8125rem] text-erreur mt-1 font-medium">
                {erreurs.nom}
              </p>
            )}
          </div>

          {/* Champ : Entreprise */}
          <div>
            <label htmlFor="champ-entreprise-pilote" className="block text-[0.875rem] font-semibold text-encre mb-1.5">
              {t('champEntreprise')}
            </label>
            <input
              id="champ-entreprise-pilote"
              ref={entrepriseRef}
              type="text"
              value={entreprise}
              onChange={(e) => {
                setEntreprise(e.target.value);
                if (erreurs.entreprise) setErreurs((prev) => ({ ...prev, entreprise: undefined }));
              }}
              aria-invalid={Boolean(erreurs.entreprise)}
              aria-describedby={erreurs.entreprise ? 'erreur-entreprise-pilote' : undefined}
              className={`w-full h-[46px] px-3.5 text-xs sm:text-sm rounded-champ border bg-surface text-encre transition-colors placeholder:text-discret focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                erreurs.entreprise ? 'border-erreur ring-1 ring-erreur' : 'border-champ'
              }`}
            />
            {erreurs.entreprise && (
              <p id="erreur-entreprise-pilote" className="text-[0.8125rem] text-erreur mt-1 font-medium">
                {erreurs.entreprise}
              </p>
            )}
          </div>
        </div>

        {/* Ligne 2 : E-mail professionnel */}
        <div className="mb-3">
          <label htmlFor="champ-email-pilote" className="block text-[0.875rem] font-semibold text-encre mb-1.5">
            {t('champEmailPro')}
          </label>
          <input
            id="champ-email-pilote"
            ref={emailRef}
            type="email"
            autoComplete="email"
            placeholder={t('placeholderEmail')}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (erreurs.email) setErreurs((prev) => ({ ...prev, email: undefined }));
            }}
            aria-invalid={Boolean(erreurs.email)}
            aria-describedby={erreurs.email ? 'erreur-email-pilote' : undefined}
            className={`w-full h-[46px] px-3.5 text-xs sm:text-sm rounded-champ border bg-surface text-encre transition-colors placeholder:text-discret focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus focus-visible:ring-offset-2 ${
              erreurs.email ? 'border-erreur ring-1 ring-erreur' : 'border-champ'
            }`}
          />
          {erreurs.email && (
            <p id="erreur-email-pilote" className="text-[0.8125rem] text-erreur mt-1 font-medium">
              {erreurs.email}
            </p>
          )}
        </div>

        {/* Ligne 3 : Secteur d'activité */}
        <div className="mb-4">
          <label htmlFor="champ-secteur-pilote" className="block text-[0.875rem] font-semibold text-encre mb-1.5">
            {t('champSecteur')}
          </label>
          <select
            id="champ-secteur-pilote"
            ref={secteurRef}
            value={secteur}
            onChange={(e) => {
              setSecteur(e.target.value);
              if (erreurs.secteur) setErreurs((prev) => ({ ...prev, secteur: undefined }));
            }}
            aria-invalid={Boolean(erreurs.secteur)}
            aria-describedby={erreurs.secteur ? 'erreur-secteur-pilote' : undefined}
            className={`w-full h-[46px] px-3.5 text-xs sm:text-sm rounded-champ border bg-surface text-encre transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus focus-visible:ring-offset-2 cursor-pointer ${
              erreurs.secteur ? 'border-erreur ring-1 ring-erreur' : 'border-champ'
            }`}
          >
            <option value="">{t('secteurChoisir')}</option>
            <option value="BTP">{t('secteurBtp')}</option>
            <option value="FOURNITURES">{t('secteurFournitures')}</option>
            <option value="ETUDES">{t('secteurEtudes')}</option>
            <option value="INFORMATIQUE">{t('secteurInformatique')}</option>
            <option value="SANTE">{t('secteurSante')}</option>
            <option value="AUTRE">{t('secteurAutre')}</option>
          </select>
          {erreurs.secteur && (
            <p id="erreur-secteur-pilote" className="text-[0.8125rem] text-erreur mt-1 font-medium">
              {erreurs.secteur}
            </p>
          )}
        </div>

        {/* Bouton d'envoi pleine largeur */}
        <button
          type="submit"
          disabled={loading}
          className="w-full h-[48px] px-4 rounded-champ bg-cta hover:bg-cta-survol active:opacity-95 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus focus-visible:ring-offset-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span>Envoi en cours…</span>
          ) : (
            <>
              <span>{t('pilotEnvoyer')}</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>

        {/* Mention légale sous le bouton */}
        <p className="text-[0.8125rem] text-discret text-center mt-2.5 leading-relaxed font-normal">
          {t('pilotMentionLegale')}
        </p>
      </form>
    </div>
  );
};
