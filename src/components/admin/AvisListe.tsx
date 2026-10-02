import React, { useState, useRef } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Info,
  RefreshCw,
  AlertCircle,
  Inbox
} from 'lucide-react';
import { Card, Badge, Button, BadgeTone } from '../ui';
import { AvisCollecte } from '../../types';
import { UseAdminAvisReturn } from '../../hooks/useAdminAvis';
import {
  formaterDateDouala,
  formaterDateHeureDouala,
  joursRestantsDouala,
  parserDateLimite
} from '../../utils/dates';
import { formatterMontant } from '../../i18n/accueil';
import { lienSur } from '../../utils/liensSurs';

export interface AvisListeProps {
  hook: UseAdminAvisReturn;
}

/**
 * Formate un montant en FCFA de façon soignée ou renvoie le montant texte / mention non communiqué.
 */
function formatMontantAvis(
  montant: number | null | undefined,
  montantTexte?: string | null
): { text: string; isDiscret: boolean } {
  if (montant !== null && montant !== undefined && montant > 0) {
    if (montant >= 1_000_000_000) {
      const val = Number((montant / 1_000_000_000).toFixed(1));
      return { text: formatterMontant(val, 'Md', 'fr'), isDiscret: false };
    }
    if (montant >= 1_000_000) {
      const val = Number((montant / 1_000_000).toFixed(1));
      return { text: formatterMontant(val, 'M', 'fr'), isDiscret: false };
    }
    return { text: `${montant.toLocaleString('fr-FR')}\u00A0FCFA`, isDiscret: false };
  }

  const texte = montantTexte?.trim();
  if (texte) {
    return { text: texte, isDiscret: true };
  }

  return { text: 'Non communiqué', isDiscret: true };
}

/**
 * Détermine le ton du badge pour le type de source.
 */
function getSourceTone(sourceType?: string | null): BadgeTone {
  if (!sourceType) return 'neutre';
  const st = sourceType.toUpperCase().trim();
  if (st === 'INTERNATIONAL') return 'info';
  if (st === 'NATIONAL') return 'ok';
  return 'neutre';
}

/**
 * Détermine le ton du badge pour le statut de l'avis.
 */
function getStatutTone(statut?: string | null): BadgeTone {
  if (!statut) return 'neutre';
  const s = statut.toUpperCase().trim();
  if (s === 'NOUVEAU') return 'info';
  if (s === 'QUALIFIÉ' || s === 'QUALIFIE') return 'ok';
  if (s === 'REJETÉ' || s === 'REJETE') return 'erreur';
  if (s === 'EXPIRÉ' || s === 'EXPIRE' || s === 'ARCHIVÉ' || s === 'ARCHIVE') return 'neutre';
  return 'neutre';
}

/**
 * Détermine le badge de délai pour une date limite ferme.
 */
function getDelaiBadge(dateLimite: string | null | undefined): { label: string; tone: BadgeTone } | null {
  if (!dateLimite) return null;
  const j = joursRestantsDouala(dateLimite);
  if (j === null) return null;
  if (j < 0) {
    return { label: 'Expiré', tone: 'neutre' };
  }
  if (j <= 3) {
    return { label: `J-${j}`, tone: 'erreur' };
  }
  if (j <= 7) {
    return { label: `J-${j}`, tone: 'attente' };
  }
  return { label: `J-${j}`, tone: 'neutre' };
}

/**
 * Vérifie si l'avis correspond à une attribution de marché.
 */
function isAvisAttribution(avis: AvisCollecte): boolean {
  const proc = (avis.procedure || '').toUpperCase().trim();
  const stat = (avis.statut || '').toUpperCase().trim();
  return proc === 'ATTRIBUTION' || stat === 'ATTRIBUTION' || proc.includes('ATTRIBUTION');
}

/**
 * Vérifie si l'erreur correspond à une route inexistante ou 404 sur le serveur distant.
 */
function isRouteInexistante(error: { message: string; code?: number } | null): boolean {
  if (!error) return false;
  if (error.code === 404) return true;
  const msg = error.message.toLowerCase();
  return (
    msg.includes('404') ||
    msg.includes('route inconnue') ||
    msg.includes('introuvable') ||
    msg.includes('inexistante') ||
    msg.includes('non trouv') ||
    msg.includes('cannot get')
  );
}

export const AvisListe: React.FC<AvisListeProps> = ({ hook }) => {
  const {
    response,
    loading,
    error,
    filters,
    setOffset,
    reinitialiser,
    filtresActifs,
    recharger
  } = hook;

  // Gestion de l'état d'accordéon : un seul panneau ouvert à la fois
  const [openId, setOpenId] = useState<string | null>(null);
  const resumeRef = useRef<HTMLDivElement>(null);

  const toggleDetails = (idAvis: string) => {
    setOpenId((prev) => (prev === idAvis ? null : idAvis));
  };

  // Pagination
  const total = response?.total ?? 0;
  const limit = filters.limit || 25;
  const offset = filters.offset || 0;
  const avisList: AvisCollecte[] = response?.avis || [];

  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + limit, total);

  const handlePrevPage = () => {
    if (offset > 0) {
      const nextOffset = Math.max(0, offset - limit);
      setOffset(nextOffset);
      resumeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleNextPage = () => {
    if (offset + limit < total) {
      const nextOffset = offset + limit;
      setOffset(nextOffset);
      resumeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // 1. CAS PARTICULIER : ERREUR ROUTE INEXISTANTE / 404
  if (error && isRouteInexistante(error)) {
    return (
      <Card padding="md" className="border-ligne bg-slate-50 text-encre">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center shrink-0 text-slate-700">
            <Info className="w-5 h-5" />
          </div>
          <div className="space-y-1.5 flex-1">
            <h3 className="text-[0.9375rem] font-bold text-encre">
              Route API en attente de déploiement
            </h3>
            <p className="text-[0.875rem] text-discret leading-relaxed">
              Cette liste n'est pas encore activée sur le serveur de production. La route <code className="px-1.5 py-0.5 rounded bg-slate-200 text-encre text-[0.8125rem]">/admin/avis</code> doit d'abord être ajoutée côté Google Apps Script.
            </p>
            <div className="pt-2">
              <Button
                type="button"
                variante="secondaire"
                taille="sm"
                onClick={recharger}
                iconeGauche={RefreshCw}
              >
                Vérifier à nouveau
              </Button>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  // 2. CAS D'ERREUR STANDARD
  if (error) {
    return (
      <Card padding="md" className="border-erreur/30 bg-erreur-fond/30 text-encre">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-erreur shrink-0 mt-0.5" />
            <div>
              <h3 className="text-[0.9375rem] font-semibold text-erreur">
                Erreur lors du chargement des avis
              </h3>
              <p className="text-[0.875rem] text-discret mt-0.5">
                {error.message}
                {error.code ? ` (Code ${error.code})` : ''}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variante="secondaire"
            taille="sm"
            onClick={recharger}
            iconeGauche={RefreshCw}
            className="shrink-0 self-start sm:self-auto"
          >
            Réessayer
          </Button>
        </div>
      </Card>
    );
  }

  // 3. CAS DE CHARGEMENT SQUELETTES
  if (loading && !response) {
    return (
      <div className="space-y-4">
        {/* Squelette Tableau Desktop */}
        <div className="hidden lg:block border border-ligne rounded-carte bg-surface overflow-hidden">
          <div className="p-4 border-b border-ligne bg-slate-50 flex items-center justify-between">
            <div className="h-4 w-32 bg-slate-200 rounded motion-safe:animate-pulse" />
            <div className="h-4 w-24 bg-slate-200 rounded motion-safe:animate-pulse" />
          </div>
          <div className="divide-y divide-ligne">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="p-4 flex items-center justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="h-4 w-3/4 bg-slate-200 rounded motion-safe:animate-pulse" />
                  <div className="h-3 w-1/3 bg-slate-200 rounded motion-safe:animate-pulse" />
                </div>
                <div className="h-6 w-20 bg-slate-200 rounded-full motion-safe:animate-pulse" />
                <div className="h-4 w-28 bg-slate-200 rounded motion-safe:animate-pulse" />
                <div className="h-4 w-28 bg-slate-200 rounded motion-safe:animate-pulse" />
                <div className="h-4 w-24 bg-slate-200 rounded motion-safe:animate-pulse" />
              </div>
            ))}
          </div>
        </div>

        {/* Squelette Cartes Mobile/Tablette */}
        <div className="lg:hidden space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} padding="sm" className="space-y-3">
              <div className="flex justify-between items-center">
                <div className="h-5 w-24 bg-slate-200 rounded-full motion-safe:animate-pulse" />
                <div className="h-5 w-20 bg-slate-200 rounded-full motion-safe:animate-pulse" />
              </div>
              <div className="h-4 w-full bg-slate-200 rounded motion-safe:animate-pulse" />
              <div className="h-4 w-2/3 bg-slate-200 rounded motion-safe:animate-pulse" />
              <div className="h-3 w-1/2 bg-slate-200 rounded motion-safe:animate-pulse" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // 4. CAS DE LISTE VIDE
  if (!loading && avisList.length === 0) {
    return (
      <Card padding="md">
        <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-discret">
            <Inbox className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-[1rem] font-bold text-encre">
              Aucun avis ne correspond aux filtres
            </h3>
            <p className="text-[0.875rem] text-discret max-w-md">
              Modifiez vos critères de recherche ou réinitialisez les filtres pour afficher l'ensemble des avis collectés.
            </p>
          </div>
          {filtresActifs && (
            <Button
              type="button"
              variante="secondaire"
              taille="md"
              onClick={reinitialiser}
            >
              Réinitialiser les filtres
            </Button>
          )}
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4" ref={resumeRef}>
      {/* 5. TABLEAU DESKTOP (≥ 1024px) */}
      <div className="hidden lg:block border border-ligne rounded-carte bg-surface overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50/80 border-b border-ligne">
              <tr>
                <th scope="col" className="py-3.5 px-4 text-[0.8125rem] font-semibold text-discret min-w-[280px]">
                  Avis
                </th>
                <th scope="col" className="py-3.5 px-3 text-[0.8125rem] font-semibold text-discret min-w-[130px]">
                  Source
                </th>
                <th scope="col" className="py-3.5 px-3 text-[0.8125rem] font-semibold text-discret min-w-[180px]">
                  Autorité et région
                </th>
                <th scope="col" className="py-3.5 px-3 text-[0.8125rem] font-semibold text-discret min-w-[140px]">
                  Montant
                </th>
                <th scope="col" className="py-3.5 px-3 text-[0.8125rem] font-semibold text-discret min-w-[160px]">
                  Date limite
                </th>
                <th scope="col" className="py-3.5 px-3 text-[0.8125rem] font-semibold text-discret min-w-[110px]">
                  Statut
                </th>
                <th scope="col" className="py-3.5 px-3 text-[0.8125rem] font-semibold text-discret min-w-[140px]">
                  Collecté le
                </th>
                <th scope="col" className="py-3.5 px-3 text-[0.8125rem] font-semibold text-discret text-right min-w-[100px]">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ligne">
              {avisList.map((avis) => {
                const isExpanded = openId === avis.idAvis;
                const lienAvisSur = lienSur(avis.lien);
                const hasValidLink = lienAvisSur !== null;
                const montantInfo = formatMontantAvis(avis.montant, avis.montantTexte);

                // Analyse Date limite (Règles LOT V3 avec priorité Attribution)
                const isAttr = isAvisAttribution(avis);
                const parsedDate = parserDateLimite(avis.dateLimite);
                const isEstimee = Boolean(avis.dateLimiteEstimee && parsedDate);
                const delai = !isAttr && !isEstimee && parsedDate ? getDelaiBadge(avis.dateLimite) : null;
                const dateTexteLibre = !isAttr && !parsedDate && avis.dateLimiteTexte?.trim() ? avis.dateLimiteTexte.trim() : null;

                return (
                  <React.Fragment key={avis.idAvis}>
                    <tr className={`transition-colors hover:bg-slate-50/70 ${isExpanded ? 'bg-slate-50/90' : ''}`}>
                      {/* Colonne Avis */}
                      <td className="py-3.5 px-4 align-top">
                        <p className="text-[0.875rem] font-semibold text-encre line-clamp-2 leading-snug" title={avis.titre}>
                          {avis.titre || '—'}
                        </p>
                        <p className="text-[0.8125rem] text-discret mt-0.5">
                          {avis.numeroAvis ? `N° ${avis.numeroAvis}` : '—'}
                        </p>
                      </td>

                      {/* Colonne Source */}
                      <td className="py-3.5 px-3 align-top">
                        <Badge ton={getSourceTone(avis.sourceType)}>
                          {avis.source || '—'}
                        </Badge>
                      </td>

                      {/* Colonne Autorité et région */}
                      <td className="py-3.5 px-3 align-top text-[0.875rem]">
                        <p className="font-medium text-encre truncate max-w-[200px]" title={avis.autorite || undefined}>
                          {avis.autorite || '—'}
                        </p>
                        <p className="text-[0.8125rem] text-discret mt-0.5">
                          {avis.region || '—'}
                        </p>
                      </td>

                      {/* Colonne Montant */}
                      <td className="py-3.5 px-3 align-top text-[0.875rem]">
                        <span className={montantInfo.isDiscret ? 'text-discret font-normal' : 'font-medium text-encre'}>
                          {montantInfo.text}
                        </span>
                      </td>

                      {/* Colonne Date limite */}
                      <td className="py-3.5 px-3 align-top text-[0.875rem]">
                        {isAttr ? (
                          <span className="text-discret italic text-[0.875rem]">
                            Marché attribué
                          </span>
                        ) : isEstimee ? (
                          <div className="flex flex-col items-start gap-1">
                            <span className="text-encre font-medium text-[0.875rem]">
                              {`≈ ${formaterDateDouala(avis.dateLimite)} (estimée)`}
                            </span>
                            <Badge ton="neutre" className="text-[0.75rem]">
                              Estimée
                            </Badge>
                          </div>
                        ) : parsedDate ? (
                          <div className="flex flex-col items-start gap-1">
                            <span className="text-encre text-[0.875rem]">{formaterDateDouala(avis.dateLimite)}</span>
                            {delai && (
                              <Badge ton={delai.tone} className="text-[0.75rem]">
                                {delai.label}
                              </Badge>
                            )}
                          </div>
                        ) : dateTexteLibre ? (
                          <span
                            className="text-[0.875rem] text-discret line-clamp-2 max-w-[180px] leading-snug cursor-help"
                            title={dateTexteLibre}
                            tabIndex={0}
                          >
                            {dateTexteLibre}
                          </span>
                        ) : (
                          <span className="text-discret text-[0.875rem]">—</span>
                        )}
                      </td>

                      {/* Colonne Statut */}
                      <td className="py-3.5 px-3 align-top">
                        <Badge ton={getStatutTone(avis.statut)}>
                          {avis.statut || '—'}
                        </Badge>
                      </td>

                      {/* Colonne Collecté le */}
                      <td className="py-3.5 px-3 align-top text-[0.8125rem] text-discret">
                        {formaterDateHeureDouala(avis.dateCollecte)}
                      </td>

                      {/* Colonne Action (Détails) */}
                      <td className="py-3.5 px-3 align-top text-right">
                        <button
                          type="button"
                          onClick={() => toggleDetails(avis.idAvis)}
                          aria-expanded={isExpanded}
                          aria-controls={`details-desktop-${avis.idAvis}`}
                          className="h-[44px] min-w-[44px] px-3 inline-flex items-center justify-center gap-1.5 text-[0.8125rem] font-semibold text-teal hover:bg-ok-fond rounded-champ transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus"
                        >
                          <span>Détails</span>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 shrink-0" />
                          ) : (
                            <ChevronDown className="w-4 h-4 shrink-0" />
                          )}
                        </button>
                      </td>
                    </tr>

                    {/* Panneau de détails dépliable (Desktop) */}
                    {isExpanded && (
                      <tr id={`details-desktop-${avis.idAvis}`} className="bg-slate-50/95 border-b border-ligne">
                        <td colSpan={8} className="p-5">
                          <div className="bg-surface border border-ligne rounded-champ p-4 space-y-3">
                            <div className="border-b border-ligne pb-2">
                              <h4 className="text-[0.9375rem] font-bold text-encre leading-snug">
                                {avis.titre || '—'}
                              </h4>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-[0.875rem]">
                              <div>
                                <span className="block text-[0.8125rem] font-semibold text-discret">
                                  Numéro d'avis & Identifiant
                                </span>
                                <span className="text-encre font-medium">
                                  {avis.numeroAvis ? `N° ${avis.numeroAvis}` : 'Numéro non renseigné'}
                                </span>
                                <span className="block text-[0.8125rem] text-discret">
                                  ID: {avis.idAvis || '—'}
                                </span>
                              </div>

                              <div>
                                <span className="block text-[0.8125rem] font-semibold text-discret">
                                  Procédure
                                </span>
                                <span className="text-encre">
                                  {avis.procedure || '—'}
                                </span>
                              </div>

                              <div>
                                <span className="block text-[0.8125rem] font-semibold text-discret">
                                  Source & Type
                                </span>
                                <span className="text-encre">
                                  {avis.source || '—'} {avis.sourceType ? `(${avis.sourceType})` : ''}
                                </span>
                              </div>

                              <div>
                                <span className="block text-[0.8125rem] font-semibold text-discret">
                                  Montant estimé
                                </span>
                                <span className={montantInfo.isDiscret ? 'text-discret' : 'text-encre font-medium'}>
                                  {montantInfo.text}
                                </span>
                              </div>

                              <div>
                                <span className="block text-[0.8125rem] font-semibold text-discret">
                                  Date limite
                                </span>
                                {isAttr ? (
                                  <span className="text-discret italic">
                                    Marché attribué
                                  </span>
                                ) : isEstimee ? (
                                  <div>
                                    <span className="text-encre font-medium">
                                      {`≈ ${formaterDateDouala(avis.dateLimite)} (estimée)`}
                                    </span>
                                    <span className="block text-[0.8125rem] text-discret italic mt-0.5">
                                      Échéance estimée par la collecte : à vérifier dans le dossier (DAO)
                                    </span>
                                  </div>
                                ) : parsedDate ? (
                                  <span className="text-encre">
                                    {formaterDateDouala(avis.dateLimite)}
                                  </span>
                                ) : dateTexteLibre ? (
                                  <span className="text-discret" title={dateTexteLibre}>
                                    {dateTexteLibre}
                                  </span>
                                ) : (
                                  <span className="text-discret">—</span>
                                )}
                              </div>

                              <div>
                                <span className="block text-[0.8125rem] font-semibold text-discret">
                                  Date de publication
                                </span>
                                <span className="text-encre">
                                  {formaterDateDouala(avis.datePublication)}
                                </span>
                              </div>

                              <div>
                                <span className="block text-[0.8125rem] font-semibold text-discret">
                                  Date de collecte
                                </span>
                                <span className="text-encre">
                                  {formaterDateHeureDouala(avis.dateCollecte)}
                                </span>
                              </div>

                              <div>
                                <span className="block text-[0.8125rem] font-semibold text-discret">
                                  Lien d'origine
                                </span>
                                {hasValidLink ? (
                                  <a
                                    href={lienAvisSur}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-teal font-semibold hover:underline mt-0.5"
                                  >
                                    <span>Ouvrir l'avis d'origine</span>
                                    <ExternalLink className="w-4 h-4" />
                                  </a>
                                ) : (
                                  <span className="text-discret">Non renseigné</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. CARTES MOBILE & TABLETTE (< 1024px) */}
      <div className="lg:hidden space-y-3">
        {avisList.map((avis) => {
          const isExpanded = openId === avis.idAvis;
          const lienAvisSur = lienSur(avis.lien);
          const hasValidLink = lienAvisSur !== null;
          const montantInfo = formatMontantAvis(avis.montant, avis.montantTexte);

          // Analyse Date limite (Règles LOT V3 avec priorité Attribution)
          const isAttr = isAvisAttribution(avis);
          const parsedDate = parserDateLimite(avis.dateLimite);
          const isEstimee = Boolean(avis.dateLimiteEstimee && parsedDate);
          const delai = !isAttr && !isEstimee && parsedDate ? getDelaiBadge(avis.dateLimite) : null;
          const dateTexteLibre = !isAttr && !parsedDate && avis.dateLimiteTexte?.trim() ? avis.dateLimiteTexte.trim() : null;

          return (
            <Card
              key={avis.idAvis}
              padding="sm"
              className={`transition-colors ${isExpanded ? 'border-teal/60 ring-1 ring-teal/20' : 'hover:border-ligne'}`}
            >
              <div className="space-y-3">
                {/* En-tête de carte : Badges */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge ton={getSourceTone(avis.sourceType)}>
                      {avis.source || '—'}
                    </Badge>
                    <Badge ton={getStatutTone(avis.statut)}>
                      {avis.statut || '—'}
                    </Badge>
                  </div>
                  {isEstimee ? (
                    <Badge ton="neutre" className="text-[0.75rem]">
                      Estimée
                    </Badge>
                  ) : delai ? (
                    <Badge ton={delai.tone} className="text-[0.75rem]">
                      {delai.label}
                    </Badge>
                  ) : null}
                </div>

                {/* Titre et Numéro */}
                <div>
                  <h4 className="text-[0.9375rem] font-bold text-encre leading-snug line-clamp-2">
                    {avis.titre || '—'}
                  </h4>
                  {avis.numeroAvis && (
                    <p className="text-[0.8125rem] text-discret mt-0.5">
                      N° {avis.numeroAvis}
                    </p>
                  )}
                </div>

                {/* Données clés */}
                <div className="grid grid-cols-2 gap-2 text-[0.8125rem] text-discret pt-1 border-t border-ligne">
                  <div>
                    <span className="block text-[0.75rem] font-semibold text-discret">Autorité</span>
                    <span className="text-encre font-medium truncate block" title={avis.autorite || undefined}>
                      {avis.autorite || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[0.75rem] font-semibold text-discret">Région</span>
                    <span className="text-encre">{avis.region || '—'}</span>
                  </div>
                  <div>
                    <span className="block text-[0.75rem] font-semibold text-discret">Montant</span>
                    <span className={montantInfo.isDiscret ? 'text-discret font-normal truncate block' : 'text-encre font-medium truncate block'} title={montantInfo.text}>
                      {montantInfo.text}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[0.75rem] font-semibold text-discret">Date limite</span>
                    {isAttr ? (
                      <span className="text-discret italic text-[0.8125rem]">Marché attribué</span>
                    ) : isEstimee ? (
                      <span className="text-encre font-medium text-[0.8125rem]">
                        {`≈ ${formaterDateDouala(avis.dateLimite)} (estimée)`}
                      </span>
                    ) : parsedDate ? (
                      <span className="text-encre">{formaterDateDouala(avis.dateLimite)}</span>
                    ) : dateTexteLibre ? (
                      <span className="text-discret line-clamp-1" title={dateTexteLibre}>
                        {dateTexteLibre}
                      </span>
                    ) : (
                      <span className="text-discret">—</span>
                    )}
                  </div>
                </div>

                {/* Bouton déplier détails */}
                <div className="pt-2 flex items-center justify-between border-t border-ligne">
                  <span className="text-[0.8125rem] text-discret">
                    Collecté le {formaterDateDouala(avis.dateCollecte)}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleDetails(avis.idAvis)}
                    aria-expanded={isExpanded}
                    aria-controls={`details-mobile-${avis.idAvis}`}
                    className="h-[44px] px-3 inline-flex items-center justify-center gap-1 text-[0.8125rem] font-semibold text-teal hover:bg-ok-fond rounded-champ transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus"
                  >
                    <span>{isExpanded ? 'Masquer' : 'Détails'}</span>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 shrink-0" />
                    )}
                  </button>
                </div>

                {/* Panneau déplié Mobile */}
                {isExpanded && (
                  <div
                    id={`details-mobile-${avis.idAvis}`}
                    className="p-3 bg-slate-50 rounded-champ border border-ligne space-y-2 text-[0.8125rem] animate-in fade-in duration-150"
                  >
                    <div>
                      <span className="font-semibold text-discret block">Titre complet :</span>
                      <p className="text-encre mt-0.5">{avis.titre || '—'}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-discret block">Identifiant technique (idAvis) :</span>
                      <span className="text-encre">{avis.idAvis || '—'}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-discret block">Procédure :</span>
                      <span className="text-encre">{avis.procedure || '—'}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-discret block">Montant :</span>
                      <span className={montantInfo.isDiscret ? 'text-discret' : 'text-encre font-medium'}>
                        {montantInfo.text}
                      </span>
                    </div>
                    <div>
                      <span className="font-semibold text-discret block">Date limite :</span>
                      {isAttr ? (
                        <span className="text-discret italic">Marché attribué</span>
                      ) : isEstimee ? (
                        <div>
                          <span className="text-encre font-medium">
                            {`≈ ${formaterDateDouala(avis.dateLimite)} (estimée)`}
                          </span>
                          <span className="block text-[0.75rem] text-discret italic mt-0.5">
                            Échéance estimée par la collecte : à vérifier dans le dossier (DAO)
                          </span>
                        </div>
                      ) : parsedDate ? (
                        <span className="text-encre">{formaterDateDouala(avis.dateLimite)}</span>
                      ) : dateTexteLibre ? (
                        <span className="text-discret" title={dateTexteLibre}>{dateTexteLibre}</span>
                      ) : (
                        <span className="text-discret">—</span>
                      )}
                    </div>
                    <div>
                      <span className="font-semibold text-discret block">Date de publication :</span>
                      <span className="text-encre">{formaterDateDouala(avis.datePublication)}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-discret block">Date et heure de collecte :</span>
                      <span className="text-encre">{formaterDateHeureDouala(avis.dateCollecte)}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-discret block">Source et type :</span>
                      <span className="text-encre">{avis.source || '—'} {avis.sourceType ? `(${avis.sourceType})` : ''}</span>
                    </div>
                    {hasValidLink && (
                      <div className="pt-2 border-t border-ligne">
                        <a
                          href={lienAvisSur}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="h-[44px] inline-flex items-center gap-2 text-teal font-semibold hover:underline"
                        >
                          <span>Ouvrir l'avis d'origine</span>
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* 7. PAGINATION UNIFIÉE (44px, Accessible, Clavier & Tactile) */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-surface border border-ligne rounded-carte">
        <div className="text-[0.875rem] text-discret text-center sm:text-left">
          <span>Affichage de <strong className="text-encre font-semibold">{rangeStart}</strong> à <strong className="text-encre font-semibold">{rangeEnd}</strong> sur <strong className="text-encre font-semibold">{total}</strong> avis</span>
          <span className="mx-2" aria-hidden="true">·</span>
          <span>Page <strong className="text-encre font-semibold">{currentPage}</strong> / <strong className="text-encre font-semibold">{totalPages}</strong></span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variante="secondaire"
            taille="md"
            onClick={handlePrevPage}
            disabled={offset === 0 || loading}
            iconeGauche={ChevronLeft}
            className="h-[44px] min-w-[110px]"
          >
            Précédent
          </Button>
          <Button
            type="button"
            variante="secondaire"
            taille="md"
            onClick={handleNextPage}
            disabled={offset + limit >= total || loading}
            iconeDroite={ChevronRight}
            className="h-[44px] min-w-[110px]"
          >
            Suivant
          </Button>
        </div>
      </div>
    </div>
  );
};
