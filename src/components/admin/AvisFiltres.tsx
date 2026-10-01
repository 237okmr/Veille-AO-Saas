import React from 'react';
import { Search, X, SlidersHorizontal, Calendar, ArrowUpDown, Layers } from 'lucide-react';
import { ChampTexte, ChampListe, Button, Card } from '../ui';
import { UseAdminAvisReturn, PeriodeType } from '../../hooks/useAdminAvis';

export interface AvisFiltresProps {
  hook: UseAdminAvisReturn;
}

export const AvisFiltres: React.FC<AvisFiltresProps> = ({ hook }) => {
  const {
    filters,
    setQ,
    setSource,
    setStatut,
    setPeriode,
    setCustomDateFrom,
    setCustomDateTo,
    setSort,
    setLimit,
    reinitialiser,
    filtresActifs,
    dateError,
    response,
    loading
  } = hook;

  const sources = response?.facettes?.sources || [];
  const statuts = response?.facettes?.statuts || [];
  const totalAvis = response?.total ?? 0;

  // Décodage de la valeur combinée du tri pour le select
  const currentSortValue = `${filters.sortBy}-${filters.sortOrder}`;

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'dateCollecte-desc') {
      setSort('dateCollecte', 'desc');
    } else if (val === 'dateLimite-asc') {
      setSort('dateLimite', 'asc');
    } else if (val === 'montant-desc') {
      setSort('montant', 'desc');
    }
  };

  return (
    <Card padding="md" className="space-y-4">
      {/* Rangée Principale des Filtres (Responsive: 1 col mobile, 2 col tablette, 4 col desktop) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Recherche texte */}
        <ChampTexte
          label="Recherche"
          placeholder="Rechercher (titre, autorité, numéro, région)"
          value={filters.q}
          onChange={(e) => setQ(e.target.value)}
          iconeGauche={Search}
        />

        {/* Source */}
        <ChampListe
          label="Source"
          value={filters.source}
          onChange={(e) => setSource(e.target.value)}
          iconeGauche={Layers}
        >
          <option value="">Toutes les sources</option>
          {sources.map((s) => (
            <option key={s.valeur} value={s.valeur}>
              {s.valeur} ({s.nombre})
            </option>
          ))}
        </ChampListe>

        {/* Statut */}
        <ChampListe
          label="Statut"
          value={filters.statut}
          onChange={(e) => setStatut(e.target.value)}
          iconeGauche={SlidersHorizontal}
        >
          <option value="">Tous les statuts</option>
          {statuts.map((st) => (
            <option key={st.valeur} value={st.valeur}>
              {st.valeur} ({st.nombre})
            </option>
          ))}
        </ChampListe>

        {/* Période */}
        <ChampListe
          label="Période"
          value={filters.periode}
          onChange={(e) => setPeriode(e.target.value as PeriodeType)}
          iconeGauche={Calendar}
        >
          <option value="tout">Tout</option>
          <option value="24h">Dernières 24 h</option>
          <option value="7j">Derniers 7 jours</option>
          <option value="30j">Derniers 30 jours</option>
          <option value="personnalisee">Personnalisée</option>
        </ChampListe>
      </div>

      {/* Rangée de Dates Personnalisées (visible uniquement si 'personnalisee') */}
      {filters.periode === 'personnalisee' && (
        <div className="p-3 bg-onglets rounded-champ border border-ligne space-y-2 animate-in fade-in duration-150">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ChampTexte
              type="date"
              label="Date de début (collecte)"
              value={filters.customDateFrom}
              onChange={(e) => setCustomDateFrom(e.target.value)}
              erreur={dateError || undefined}
            />
            <ChampTexte
              type="date"
              label="Date de fin (collecte)"
              value={filters.customDateTo}
              onChange={(e) => setCustomDateTo(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Rangée Secondaire : Tri, Pagination par page, Réinitialisation et Compteur */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pt-2 border-t border-ligne">
        <div className="flex flex-wrap items-center gap-3">
          {/* Tri */}
          <div className="w-full sm:w-auto min-w-[210px]">
            <ChampListe
              label="Trier par"
              value={currentSortValue}
              onChange={handleSortChange}
              iconeGauche={ArrowUpDown}
            >
              <option value="dateCollecte-desc">Plus récemment collectés</option>
              <option value="dateLimite-asc">Date limite la plus proche</option>
              <option value="montant-desc">Montant décroissant</option>
            </ChampListe>
          </div>

          {/* Nombre par page */}
          <div className="w-full sm:w-auto min-w-[110px]">
            <ChampListe
              label="Par page"
              value={String(filters.limit)}
              onChange={(e) => setLimit(Number(e.target.value))}
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </ChampListe>
          </div>

          {/* Bouton Réinitialiser (visible UNIQUEMENT si au moins un filtre est actif) */}
          {filtresActifs && (
            <div className="self-end pb-0.5">
              <Button
                type="button"
                variante="secondaire"
                taille="md"
                onClick={reinitialiser}
                iconeGauche={X}
                className="w-full sm:w-auto text-[0.875rem]"
              >
                Réinitialiser les filtres
              </Button>
            </div>
          )}
        </div>

        {/* Ligne de résumé accessible */}
        <div
          aria-live="polite"
          className="text-[0.875rem] font-medium text-discret self-center sm:self-end pb-2.5"
        >
          {loading && !response ? (
            <span>Chargement des avis...</span>
          ) : totalAvis > 0 ? (
            <span className="font-semibold text-encre">
              {totalAvis.toLocaleString('fr-FR')} {totalAvis > 1 ? 'avis' : 'avis'}
            </span>
          ) : (
            <span>Aucun avis ne correspond aux filtres</span>
          )}
        </div>
      </div>
    </Card>
  );
};
