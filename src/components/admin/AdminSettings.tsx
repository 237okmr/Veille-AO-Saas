import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../services/api';
import { ReglagesData, ReglagesParametres } from '../../types';
import { RotateCw, Save, KeyRound, ShieldCheck } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { Button, Card } from '../ui';
import { ConfirmationResume, LigneResume } from './ConfirmationResume';
import {
  DOMAINES_REGLAGES,
  DomaineReglage,
  DefinitionReglage,
  differences,
  reglagesDuDomaine
} from '../../admin/registreReglages';

const PROXY_MODES: { value: 'OFF' | 'OBSERVE' | 'ENFORCE'; desc: string }[] = [
  { value: 'OFF', desc: "Aucune vérification de clé (comportement d'origine)." },
  { value: 'OBSERVE', desc: 'La clé est vérifiée et comptée, rien n’est refusé.' },
  { value: 'ENFORCE', desc: 'Toute requête sans la bonne clé est refusée.' }
];

type Confirmation = { titre: string; lignes: LigneResume[]; libelle: string; action: () => Promise<void> } | null;

const classeChamp =
  'w-full h-[44px] px-3 rounded-champ border border-ligne bg-white text-[0.9375rem] text-encre focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus';

export const AdminSettings: React.FC = () => {
  const [data, setData] = useState<ReglagesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [domaine, setDomaine] = useState<DomaineReglage>('collecte');
  const [form, setForm] = useState<ReglagesParametres>({});
  const [cle1, setCle1] = useState('');
  const [cle2, setCle2] = useState('');
  const [cleDeepSeek, setCleDeepSeek] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [enCours, setEnCours] = useState(false);

  const toast = useToast();

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getReglages();
      if (res.donnees) {
        setData(res.donnees);
        setForm(res.donnees.parametres);
      }
    } catch (e: any) {
      toast.error('Erreur', e.message);
    } finally {
      setLoading(false);
    }
  };

  const setField = (key: keyof ReglagesParametres, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // Changements en attente, par domaine (valeurs enregistrées vs saisie).
  const changements = useMemo(() => {
    const base = data?.parametres || {};
    const parDomaine: Record<string, ReturnType<typeof differences>> = {};
    DOMAINES_REGLAGES.forEach((d) => {
      parDomaine[d.id] = differences(d.id, base, form);
    });
    return parDomaine;
  }, [data, form]);

  const executer = async () => {
    if (!confirmation) return;
    setEnCours(true);
    try {
      await confirmation.action();
      setConfirmation(null);
    } finally {
      setEnCours(false);
    }
  };

  // --- Enregistrement des paramètres d'un domaine (seuls les champs modifiés sont envoyés) ---
  const demanderEnregistrement = (d: DomaineReglage) => {
    const diffs = changements[d];
    if (!diffs || diffs.length === 0) return;
    const lignes: LigneResume[] = diffs.map(({ def, ancien, nouveau }) => ({
      label: def.label,
      ancien,
      nouveau,
      note: def.effet,
      attention: !!def.impactQuotaIA
    }));
    setConfirmation({
      titre: 'Confirmer ces modifications ?',
      lignes,
      libelle: 'Enregistrer',
      action: async () => {
        const payload: ReglagesParametres = {};
        diffs.forEach(({ def }) => {
          (payload as Record<string, unknown>)[def.cle] = form[def.cle];
        });
        try {
          const res = await api.updateReglagesParametres(payload);
          const refuses = res.donnees?.refuses || [];
          if (refuses.length > 0) {
            toast.error('Certains champs refusés', refuses.join(', '));
          } else {
            toast.success('Paramètres enregistrés', `${res.donnees?.modifie?.length || 0} champ(s) mis à jour.`);
          }
          await load();
        } catch (e: any) {
          toast.error('Erreur', e.message);
        }
      }
    });
  };

  // --- Mode du proxy ---
  const demanderModeProxy = (mode: 'OFF' | 'OBSERVE' | 'ENFORCE') => {
    const ancien = data?.proxy.mode || '—';
    const note = PROXY_MODES.find((m) => m.value === mode)?.desc;
    setConfirmation({
      titre: 'Changer le mode de la clé du proxy ?',
      lignes: [
        {
          label: 'Mode de la clé du proxy',
          ancien,
          nouveau: mode,
          note:
            mode === 'ENFORCE'
              ? `${note} Vérifiez que le secret du proxy est bien présent côté application avant de continuer.`
              : note,
          attention: mode === 'ENFORCE' || mode === 'OFF'
        }
      ],
      libelle: `Passer en ${mode}`,
      action: async () => {
        try {
          const res = await api.updateProxyMode(mode);
          toast.success('Mode proxy modifié', `Mode : ${res.donnees?.mode}`);
          await load();
        } catch (e: any) {
          toast.error('Changement refusé', e.message);
        }
      }
    });
  };

  // --- Clés IA (valeurs jamais affichées) ---
  const demanderClesPrincipales = () => {
    if (!cle1.trim() && !cle2.trim()) {
      toast.error('Champs vides', 'Renseignez au moins une clé.');
      return;
    }
    const nbActuel = data?.clesApi.Cle_API_IA.nbCles ?? 0;
    const nbNouveau = [cle1, cle2].filter((c) => c.trim()).length;
    setConfirmation({
      titre: 'Remplacer les clés du moteur principal ?',
      lignes: [
        {
          label: 'Clés du moteur principal',
          ancien: `${nbActuel} clé(s) dans le coffre`,
          nouveau: `${nbNouveau} clé(s) saisie(s)`,
          note: 'Les deux champs remplacent ENTIÈREMENT les clés actuelles. Un champ laissé vide n’est pas conservé. Les valeurs ne sont jamais affichées.',
          attention: true
        }
      ],
      libelle: 'Remplacer les clés',
      action: async () => {
        try {
          const res = await api.updateReglagesClesGemini({ cle1, cle2 });
          toast.success('Clés mises à jour', `${res.donnees?.nbCles} clé(s) dans le coffre.`);
          setCle1('');
          setCle2('');
          await load();
        } catch (e: any) {
          toast.error('Erreur', e.message);
        }
      }
    });
  };

  const demanderCleDeepSeek = () => {
    const effacement = !cleDeepSeek.trim();
    const nbActuel = data?.clesApi.Cle_API_IA_DeepSeek.nbCles ?? 0;
    setConfirmation({
      titre: effacement ? 'Effacer la clé DeepSeek ?' : 'Remplacer la clé DeepSeek ?',
      lignes: [
        {
          label: 'Clé du moteur secondaire (DeepSeek)',
          ancien: `${nbActuel} clé(s) dans le coffre`,
          nouveau: effacement ? 'aucune clé' : '1 clé saisie',
          note: effacement
            ? 'Le moteur de secours n’aura plus de clé. Les valeurs ne sont jamais affichées.'
            : 'La clé actuelle est remplacée. Les valeurs ne sont jamais affichées.',
          attention: true
        }
      ],
      libelle: effacement ? 'Effacer la clé' : 'Remplacer la clé',
      action: async () => {
        try {
          const res = await api.updateReglagesCleDeepSeek({ cle: cleDeepSeek });
          toast.success(
            effacement ? 'Clé DeepSeek effacée' : 'Clé DeepSeek mise à jour',
            effacement ? 'Le fallback DeepSeek est désormais sans clé.' : `${res.donnees?.nbCles} clé(s) dans le coffre.`
          );
          setCleDeepSeek('');
          await load();
        } catch (e: any) {
          toast.error('Erreur', e.message);
        }
      }
    });
  };

  if (loading && !data) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-teal/20 border-t-teal rounded-full animate-spin" />
      </div>
    );
  }

  const rendreChamp = (def: DefinitionReglage) => {
    const id = `reglage-${def.cle}`;
    const aide = `${id}-effet`;
    const valeur = (form[def.cle] ?? '') as string | number;
    return (
      <div key={def.cle} className="space-y-1.5">
        {def.type === 'ouinon' ? (
          <label htmlFor={id} className="flex items-center gap-2.5 min-h-[44px] text-[0.9375rem] font-medium text-encre cursor-pointer">
            <input
              id={id}
              type="checkbox"
              checked={form[def.cle] === 'OUI'}
              onChange={(e) => setField(def.cle, e.target.checked ? 'OUI' : 'NON')}
              aria-describedby={aide}
              className="w-5 h-5 rounded border-ligne accent-teal"
            />
            {def.label}
          </label>
        ) : (
          <>
            <label htmlFor={id} className="block text-[0.875rem] font-semibold text-encre">{def.label}</label>
            <input
              id={id}
              type={def.type === 'nombre' ? 'number' : def.type === 'heure' ? 'time' : 'email'}
              value={valeur}
              onChange={(e) => setField(def.cle, e.target.value)}
              aria-describedby={aide}
              className={classeChamp}
            />
          </>
        )}
        <p id={aide} className="text-[0.8125rem] text-discret">{def.effet}</p>
      </div>
    );
  };

  const nbEnAttente = (d: DomaineReglage) => changements[d]?.length || 0;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-encre">Réglages de la plateforme</h2>
          <p className="text-[0.875rem] text-discret">
            Chaque réglage indique ce qu’il change. Toute modification passe par un résumé de confirmation.
          </p>
        </div>
        <Button variante="secondaire" taille="sm" iconeGauche={RotateCw} onClick={load}>Actualiser</Button>
      </div>

      {/* Onglets par domaine */}
      <div role="tablist" aria-label="Domaines de réglages" className="flex flex-wrap gap-1 border-b border-ligne">
        {DOMAINES_REGLAGES.map((d) => {
          const actif = domaine === d.id;
          const n = nbEnAttente(d.id);
          return (
            <button
              key={d.id}
              id={`onglet-${d.id}`}
              role="tab"
              type="button"
              aria-selected={actif}
              aria-controls={`panneau-${d.id}`}
              onClick={() => setDomaine(d.id)}
              className={`h-[44px] px-4 text-[0.9375rem] font-semibold border-b-2 -mb-px cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus rounded-t-champ ${
                actif ? 'border-teal text-teal' : 'border-transparent text-discret hover:text-encre'
              }`}
            >
              {d.titre}
              {n > 0 && (
                <span className="ml-2 px-1.5 py-0.5 rounded-full text-[0.75rem] bg-amber-500 text-white tabular-nums">{n}</span>
              )}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`panneau-${domaine}`}
        aria-labelledby={`onglet-${domaine}`}
        className="space-y-5"
      >
        <p className="text-[0.875rem] text-discret">
          {DOMAINES_REGLAGES.find((d) => d.id === domaine)?.description}
        </p>

        {domaine !== 'securite' && (
          <Card className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
              {reglagesDuDomaine(domaine).map(rendreChamp)}
            </div>
            {reglagesDuDomaine(domaine).length > 0 && (
              <div className="flex items-center justify-end gap-3">
                {nbEnAttente(domaine) === 0 && (
                  <span className="text-[0.8125rem] text-discret">Aucun changement en attente.</span>
                )}
                <Button
                  iconeGauche={Save}
                  disabled={nbEnAttente(domaine) === 0}
                  onClick={() => demanderEnregistrement(domaine)}
                >
                  Enregistrer les modifications
                </Button>
              </div>
            )}
          </Card>
        )}

        {domaine === 'ia' && (
          <Card className="space-y-6">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-teal" aria-hidden="true" />
              <h3 className="text-[0.9375rem] font-semibold text-encre">Clés API (coffre)</h3>
            </div>

            <div className="space-y-3 pb-5 border-b border-ligne">
              <p className="text-[0.875rem] text-discret">
                Moteur principal : {data?.clesApi.Cle_API_IA.nbCles ?? 0} clé(s) dans le coffre
                {data?.clesApi.Cle_API_IA.masquees.length ? (
                  <> (<span className="font-mono">{data.clesApi.Cle_API_IA.masquees.join(', ')}</span>)</>
                ) : null}
                . Un remplacement agit sur le quota Gemini.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="password"
                  autoComplete="off"
                  aria-label="Nouvelle clé principale 1"
                  placeholder="Nouvelle clé principale n° 1"
                  value={cle1}
                  onChange={(e) => setCle1(e.target.value)}
                  className={classeChamp}
                />
                <input
                  type="password"
                  autoComplete="off"
                  aria-label="Nouvelle clé principale 2"
                  placeholder="Nouvelle clé principale n° 2"
                  value={cle2}
                  onChange={(e) => setCle2(e.target.value)}
                  className={classeChamp}
                />
              </div>
              <p className="text-[0.8125rem] text-amber-700">
                Les deux champs remplacent ensemble les clés existantes : un champ vide n’est pas conservé.
              </p>
              <div className="flex justify-end">
                <Button iconeGauche={Save} onClick={demanderClesPrincipales}>Mettre à jour les clés</Button>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-[0.875rem] text-discret">
                Moteur secondaire : {data?.clesApi.Cle_API_IA_DeepSeek.nbCles ?? 0} clé(s) dans le coffre
                {data?.clesApi.Cle_API_IA_DeepSeek.masquees.length ? (
                  <> (<span className="font-mono">{data.clesApi.Cle_API_IA_DeepSeek.masquees.join(', ')}</span>)</>
                ) : null}
                .
              </p>
              <input
                type="password"
                autoComplete="off"
                aria-label="Nouvelle clé DeepSeek"
                placeholder="Nouvelle clé DeepSeek (laisser vide pour effacer)"
                value={cleDeepSeek}
                onChange={(e) => setCleDeepSeek(e.target.value)}
                className={`${classeChamp} sm:w-1/2`}
              />
              <div className="flex justify-end">
                <Button iconeGauche={Save} onClick={demanderCleDeepSeek}>Mettre à jour la clé DeepSeek</Button>
              </div>
            </div>
          </Card>
        )}

        {domaine === 'securite' && (
          <Card className="space-y-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-teal" aria-hidden="true" />
              <h3 className="text-[0.9375rem] font-semibold text-encre">Mode de la clé du proxy</h3>
              <span className="ml-auto inline-flex items-center px-2.5 py-1 rounded-champ text-[0.8125rem] font-bold border border-ligne bg-page text-encre">
                {data?.proxy.mode || '—'}
              </span>
            </div>

            <p className="text-[0.875rem] text-discret">
              Secret présent : <strong>{data?.proxy.secretPresent ? 'oui' : 'non'}</strong>. Sur les 6 dernières heures :{' '}
              <strong className="text-emerald-700">{data?.proxy.rapport6h.ok ?? 0} avec clé valide</strong>,{' '}
              <strong className="text-erreur">{data?.proxy.rapport6h.ko ?? 0} sans clé valide</strong>.
            </p>

            <ul className="space-y-1 text-[0.8125rem] text-discret">
              {PROXY_MODES.map((m) => (
                <li key={m.value}><span className="font-semibold text-encre">{m.value}</span> : {m.desc}</li>
              ))}
            </ul>

            <div className="flex flex-wrap gap-2">
              {PROXY_MODES.map((m) => (
                <Button
                  key={m.value}
                  variante="secondaire"
                  disabled={data?.proxy.mode === m.value}
                  onClick={() => demanderModeProxy(m.value)}
                >
                  Passer en {m.value}
                </Button>
              ))}
            </div>
          </Card>
        )}
      </div>

      {confirmation && (
        <ConfirmationResume
          titre={confirmation.titre}
          lignes={confirmation.lignes}
          libelleConfirmer={confirmation.libelle}
          enCours={enCours}
          onConfirmer={executer}
          onAnnuler={() => setConfirmation(null)}
        />
      )}
    </div>
  );
};
