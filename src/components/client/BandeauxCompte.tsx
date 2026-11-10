import React, { useEffect, useState } from 'react';
import { KeyRound, UserCog, X } from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { EtatCompte } from '../../types';

interface BandeauxCompteProps {
  /** Vue affichée : l'état est relu à chaque changement (le profil vient peut-être d'être complété). */
  vue: string;
  onNavigate: (view: string) => void;
}

const CLE_MDP = 'bandeau_mdp_masque';
const CLE_PROFIL = 'bandeau_profil_masque';

function lire(cle: string): boolean {
  try { return sessionStorage.getItem(cle) === '1'; } catch { return false; }
}
function ecrire(cle: string) {
  try { sessionStorage.setItem(cle, '1'); } catch { /* stockage indisponible : le bandeau reviendra, sans gravité */ }
}

/** Mêmes règles que le serveur : 12 caractères minimum, une lettre et un chiffre. */
function motifFaible(mdp: string): string {
  if (mdp.length < 12) return 'Le mot de passe doit contenir au moins 12 caractères.';
  if (!/[a-z]/i.test(mdp) || !/[0-9]/.test(mdp)) return 'Il faut au moins une lettre et un chiffre.';
  return '';
}

export const BandeauxCompte: React.FC<BandeauxCompteProps> = ({ vue, onNavigate }) => {
  const toast = useToast();
  const [etat, setEtat] = useState<EtatCompte | null>(null);
  const [masqueMdp, setMasqueMdp] = useState<boolean>(() => lire(CLE_MDP));
  const [masqueProfil, setMasqueProfil] = useState<boolean>(() => lire(CLE_PROFIL));
  const [formOuvert, setFormOuvert] = useState(false);
  const [mdp, setMdp] = useState('');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    let actif = true;
    api.getEtatCompte()
      .then((res) => { if (actif && res.donnees) setEtat(res.donnees); })
      .catch(() => { /* bandeaux facultatifs : aucune erreur affichée */ });
    return () => { actif = false; };
  }, [vue]);

  if (!etat) return null;

  const afficherMdp = !etat.aMotDePasse && !masqueMdp;
  const afficherProfil = etat.profilIncomplet && !masqueProfil && vue !== 'client-profile';
  const jours = etat.pilote.estPilote ? etat.pilote.joursRestants : null;
  const afficherEssai = jours !== null && jours <= 7;

  if (!afficherMdp && !afficherProfil && !afficherEssai) return null;

  const envoyer = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const motif = motifFaible(mdp);
    if (motif) { setErreur(motif); return; }
    setEnCours(true);
    setErreur('');
    try {
      await api.definirMotDePasseInitial(mdp);
      setMdp('');
      setFormOuvert(false);
      setEtat({ ...etat, aMotDePasse: true });
      toast.success('Mot de passe défini', 'Vous pourrez vous connecter avec votre e-mail et ce mot de passe.');
    } catch (err: any) {
      setErreur(err?.message || 'Le mot de passe n\'a pas pu être enregistré.');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="px-4 lg:px-8 pt-4 space-y-3">
      {afficherEssai && (
        <div role="status" className="rounded-champ border border-ligne bg-onglets px-4 py-3 text-[0.8125rem] text-encre">
          {jours === 0
            ? 'Votre essai gratuit se termine aujourd\'hui.'
            : `Votre essai gratuit se termine dans ${jours} jour${jours && jours > 1 ? 's' : ''}.`}
          {' '}Écrivez-nous pour le prolonger ou passer à l'offre suivante.
        </div>
      )}

      {afficherProfil && (
        <div role="region" aria-label="Compléter le profil" className="rounded-champ border border-teal/30 bg-teal/5 px-4 py-3 flex items-start gap-3">
          <UserCog className="w-5 h-5 text-teal shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1 text-[0.8125rem] text-encre">
            <p className="font-medium">Complétez votre profil pour des alertes plus justes.</p>
            <p className="text-discret mt-0.5">Vos alertes partent aujourd'hui de votre secteur seul. Ajoutez vos régions et vos types de marchés : deux minutes suffisent.</p>
            <button
              type="button"
              onClick={() => onNavigate('client-profile')}
              className="mt-2 px-3 py-1.5 rounded-champ bg-teal text-white text-[0.8125rem] cursor-pointer hover:opacity-90"
            >
              Compléter mon profil
            </button>
          </div>
          <button
            type="button"
            aria-label="Masquer ce rappel pour cette session"
            onClick={() => { ecrire(CLE_PROFIL); setMasqueProfil(true); }}
            className="w-8 h-8 flex items-center justify-center rounded-champ hover:bg-onglets cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {afficherMdp && (
        <div role="region" aria-label="Définir un mot de passe" className="rounded-champ border border-ligne bg-page px-4 py-3 flex items-start gap-3">
          <KeyRound className="w-5 h-5 text-teal shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1 text-[0.8125rem] text-encre">
            <p className="font-medium">Définissez un mot de passe quand vous voulez.</p>
            <p className="text-discret mt-0.5">Sans mot de passe, vous revenez ici par le lien de votre e-mail d'alerte du matin. Avec un mot de passe, vous vous connectez directement avec votre adresse e-mail.</p>
            {!formOuvert ? (
              <button
                type="button"
                onClick={() => setFormOuvert(true)}
                className="mt-2 px-3 py-1.5 rounded-champ border border-ligne text-[0.8125rem] cursor-pointer hover:bg-onglets"
              >
                Définir mon mot de passe
              </button>
            ) : (
              <form onSubmit={envoyer} className="mt-2 flex flex-col sm:flex-row gap-2 sm:items-start">
                <div className="flex-1">
                  <label htmlFor="mdp-initial" className="sr-only">Nouveau mot de passe</label>
                  <input
                    id="mdp-initial"
                    type="password"
                    autoComplete="new-password"
                    value={mdp}
                    onChange={(e) => { setMdp(e.target.value); setErreur(''); }}
                    placeholder="12 caractères minimum, avec une lettre et un chiffre"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600/30 focus:border-teal-600"
                  />
                  {erreur && <p role="alert" className="mt-1 text-[0.75rem] text-red-700">{erreur}</p>}
                </div>
                <button
                  type="submit"
                  disabled={enCours}
                  className="px-3 py-2 rounded-champ bg-teal text-white text-[0.8125rem] cursor-pointer hover:opacity-90 disabled:opacity-60"
                >
                  {enCours ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </form>
            )}
          </div>
          <button
            type="button"
            aria-label="Masquer ce rappel pour cette session"
            onClick={() => { ecrire(CLE_MDP); setMasqueMdp(true); }}
            className="w-8 h-8 flex items-center justify-center rounded-champ hover:bg-onglets cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
