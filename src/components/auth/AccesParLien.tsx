import React, { useState } from 'react';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

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

export const AccesParLien: React.FC<AccesParLienProps> = ({ jeton, onSucces, onEchec, onAnnuler }) => {
  const { loginParLien } = useAuth();
  const [enCours, setEnCours] = useState(false);

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
    <div className="min-h-screen bg-page font-corps text-encre flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white border border-ligne rounded-xl shadow-sm p-8 text-center space-y-5">
        <div className="mx-auto w-12 h-12 rounded-full bg-teal-700/10 flex items-center justify-center">
          <ShieldCheck className="w-6 h-6 text-teal-700" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Accès à votre espace personnel</h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Vous avez ouvert le lien personnel reçu dans votre e-mail d'alerte.
            Cliquez ci-dessous pour retrouver toutes vos alertes.
          </p>
        </div>

        <button
          type="button"
          onClick={handleAcces}
          disabled={enCours}
          className="w-full inline-flex items-center justify-center gap-2 bg-teal-700 hover:bg-teal-800 disabled:opacity-70 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-lg px-4 py-3 transition-colors"
        >
          {enCours ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              Connexion en cours…
            </>
          ) : (
            'Accéder à mon espace'
          )}
        </button>

        <button
          type="button"
          onClick={onAnnuler}
          disabled={enCours}
          className="text-xs text-slate-500 hover:text-teal-700 underline disabled:opacity-50"
        >
          Me connecter avec mon mot de passe
        </button>

        <p className="text-[11px] text-slate-400 leading-relaxed">
          Ce lien est personnel, valable 7 jours et ne fonctionne qu'une seule fois.
          Ne le transférez à personne.
        </p>
      </div>
    </div>
  );
};
