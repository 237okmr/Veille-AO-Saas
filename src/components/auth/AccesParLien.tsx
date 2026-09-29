import React, { useState, useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { LogoMarketAdvisor } from '../brand/LogoMarketAdvisor';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

interface AccesParLienProps {
  /** Jeton à usage unique lu dans le lien de l'e-mail (gardé en mémoire uniquement). */
  jeton: string;
  /** Appelé quand la connexion a réussi. */
  onSucces: () => void;
  /** Appelé quand le lien est refusé (expiré, déjà utilisé, etc.) avec le message à afficher. */
  onEchec: (message: string) => void;
  /** Appelé quand la personne préfère se connecter avec son mot de passe. */
  onAnnuler: () => void;
}

export const AccesParLien: React.FC<AccesParLienProps> = ({
  jeton,
  onSucces,
  onEchec,
  onAnnuler
}) => {
  const { loginParLien } = useAuth();
  const [enCours, setEnCours] = useState(false);

  // Focus automatique au chargement sans faire défiler la page
  useEffect(() => {
    const el = document.getElementById('btn-acces-espace');
    el?.focus({ preventScroll: true });
  }, []);

  // Le jeton n'est consommé QUE par ce clic : une simple ouverture de la page
  // (antivirus, aperçu d'e-mail) ne l'utilise pas.
  const handleAcces = async () => {
    if (enCours) return;
    setEnCours(true);
    try {
      await loginParLien(jeton);
      onSucces();
    } catch (err: any) {
      setEnCours(false);
      onEchec(
        err?.message ||
          'Ce lien a expiré ou a déjà été utilisé. Connectez-vous avec votre adresse e-mail et votre mot de passe.'
      );
    }
  };

  return (
    <div className="min-h-screen bg-page font-corps text-encre flex flex-col justify-between">
      {/* Barre tricolore 4px (3 tiers #007A5E, #CE1126, #FCD116) */}
      <div className="h-1 w-full flex shrink-0" role="presentation" aria-hidden="true">
        <div className="w-1/3 h-full bg-[#007A5E]" />
        <div className="w-1/3 h-full bg-[#CE1126]" />
        <div className="w-1/3 h-full bg-[#FCD116]" />
      </div>

      {/* Zone centrale : Logo + Carte */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-8 sm:py-12 w-full max-w-[448px] mx-auto">
        {/* Logo centré au-dessus de la carte */}
        <div className="mb-6 flex justify-center">
          <LogoMarketAdvisor taille="md" />
        </div>

        {/* Carte d'accès */}
        <Card padding="md" elevated className="w-full p-6 sm:p-8 text-center space-y-5 bg-surface border-ligne">
          {/* Pastille ronde 48 px */}
          <div className="mx-auto w-12 h-12 rounded-full bg-ok-fond flex items-center justify-center text-teal shrink-0">
            <ShieldCheck className="w-6 h-6 text-teal" aria-hidden="true" />
          </div>

          <div className="space-y-2">
            <h1 className="font-titre font-[800] text-[1.5rem] text-encre leading-tight">
              Accès à votre espace personnel
            </h1>
            <p className="text-[0.9375rem] text-discret leading-relaxed">
              Vous avez ouvert le lien personnel reçu dans votre e-mail d'alerte. Cliquez ci-dessous pour retrouver toutes vos alertes, sans mot de passe.
            </p>
          </div>

          <div className="pt-2 space-y-3">
            {/* Bouton principal avec état de chargement */}
            <Button
              id="btn-acces-espace"
              type="button"
              variante="primaire"
              taille="md"
              chargement={enCours}
              onClick={handleAcces}
              className="w-full font-semibold"
              autoFocus
              aria-live="polite"
            >
              {enCours ? 'Connexion en cours…' : 'Accéder à mon espace'}
            </Button>

            {/* Lien secondaire avec zone de clic 44px */}
            <div>
              <button
                type="button"
                onClick={onAnnuler}
                disabled={enCours}
                className="inline-flex items-center justify-center min-h-[44px] px-3 text-[0.875rem] font-medium text-discret hover:text-teal underline transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus rounded-champ disabled:opacity-50"
              >
                Me connecter avec mon mot de passe
              </button>
            </div>
          </div>

          <p className="text-[0.8125rem] text-discret leading-relaxed pt-3 border-t border-ligne">
            Ce lien est personnel, valable 7 jours et ne fonctionne qu'une seule fois. Ne le transférez à personne.
          </p>
        </Card>
      </main>

      {/* Espace inférieur pour équilibrer le centrage vertical */}
      <footer className="py-4 text-center text-[0.8125rem] text-discret select-none" role="contentinfo">
        Market Advisor CM
      </footer>
    </div>
  );
};
