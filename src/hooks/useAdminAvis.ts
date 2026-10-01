import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { api } from '../services/api';
import { AdminAvisResponse, AdminAvisParams } from '../types';

export type PeriodeType = 'tout' | '24h' | '7j' | '30j' | 'personnalisee';

export interface UseAdminAvisFilters {
  q: string;
  source: string;
  statut: string;
  periode: PeriodeType;
  customDateFrom: string;
  customDateTo: string;
  sortBy: 'dateCollecte' | 'dateLimite' | 'montant';
  sortOrder: 'desc' | 'asc';
  limit: number;
  offset: number;
}

export interface UseAdminAvisReturn {
  // Filtres
  filters: UseAdminAvisFilters;
  setQ: (val: string) => void;
  setSource: (val: string) => void;
  setStatut: (val: string) => void;
  setPeriode: (val: PeriodeType) => void;
  setCustomDateFrom: (val: string) => void;
  setCustomDateTo: (val: string) => void;
  setSort: (sortBy: 'dateCollecte' | 'dateLimite' | 'montant', sortOrder: 'desc' | 'asc') => void;
  setLimit: (val: number) => void;
  setOffset: (val: number) => void;
  reinitialiser: () => void;
  recharger: () => void;
  filtresActifs: boolean;
  dateError: string | null;

  // Données et statut
  response: AdminAvisResponse | null;
  loading: boolean;
  error: { message: string; code?: number } | null;
}

/**
 * Calcule la date AAAA-MM-JJ au fuseau horaire Africa/Douala avec un décalage en jours.
 */
function getDoualaDateStr(offsetDays = 0): string {
  const now = new Date();
  const target = new Date(now.getTime() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Douala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(target);
}

const DEFAULT_FILTERS: UseAdminAvisFilters = {
  q: '',
  source: '',
  statut: '',
  periode: 'tout',
  customDateFrom: '',
  customDateTo: '',
  sortBy: 'dateCollecte',
  sortOrder: 'desc',
  limit: 25,
  offset: 0
};

export function useAdminAvis(): UseAdminAvisReturn {
  const [filters, setFilters] = useState<UseAdminAvisFilters>(DEFAULT_FILTERS);
  const [debouncedQ, setDebouncedQ] = useState<string>('');
  
  // État initial strictement vide (sans données fictives)
  const [response, setResponse] = useState<AdminAvisResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<{ message: string; code?: number } | null>(null);

  const requestIdRef = useRef<number>(0);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  // Temporisation de la recherche textuelle (400 ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(filters.q);
    }, 400);
    return () => clearTimeout(timer);
  }, [filters.q]);

  // Calcul des dates selon la période au fuseau Africa/Douala
  const { computedDateFrom, computedDateTo, dateError } = useMemo(() => {
    let from: string | undefined;
    let to: string | undefined;
    let err: string | null = null;

    if (filters.periode === '24h') {
      from = getDoualaDateStr(-1); // Hier à Douala
    } else if (filters.periode === '7j') {
      from = getDoualaDateStr(-7);
    } else if (filters.periode === '30j') {
      from = getDoualaDateStr(-30);
    } else if (filters.periode === 'personnalisee') {
      from = filters.customDateFrom.trim() || undefined;
      to = filters.customDateTo.trim() || undefined;

      if (from && to && from > to) {
        err = 'La date de début ne peut pas être postérieure à la date de fin.';
      }
    }

    return { computedDateFrom: from, computedDateTo: to, dateError: err };
  }, [filters.periode, filters.customDateFrom, filters.customDateTo]);

  // Détection des filtres actifs
  const filtresActifs = useMemo(() => {
    const hasQ = filters.q.trim() !== '';
    const hasSource = filters.source.trim() !== '' && filters.source !== 'TOUS';
    const hasStatut = filters.statut.trim() !== '' && filters.statut !== 'TOUS';
    const hasPeriode = filters.periode !== 'tout';
    const hasCustomDates = filters.periode === 'personnalisee' && (Boolean(filters.customDateFrom) || Boolean(filters.customDateTo));
    const hasNonDefaultSort = filters.sortBy !== 'dateCollecte' || filters.sortOrder !== 'desc';
    const hasNonDefaultLimit = filters.limit !== 25;

    return hasQ || hasSource || hasStatut || hasPeriode || hasCustomDates || hasNonDefaultSort || hasNonDefaultLimit;
  }, [filters]);

  // Setters avec remise à zéro de l'offset
  const setQ = useCallback((val: string) => {
    setFilters((prev) => ({ ...prev, q: val, offset: 0 }));
  }, []);

  const setSource = useCallback((val: string) => {
    setFilters((prev) => ({ ...prev, source: val, offset: 0 }));
  }, []);

  const setStatut = useCallback((val: string) => {
    setFilters((prev) => ({ ...prev, statut: val, offset: 0 }));
  }, []);

  const setPeriode = useCallback((val: PeriodeType) => {
    setFilters((prev) => ({ ...prev, periode: val, offset: 0 }));
  }, []);

  const setCustomDateFrom = useCallback((val: string) => {
    setFilters((prev) => ({ ...prev, customDateFrom: val, offset: 0 }));
  }, []);

  const setCustomDateTo = useCallback((val: string) => {
    setFilters((prev) => ({ ...prev, customDateTo: val, offset: 0 }));
  }, []);

  const setSort = useCallback((sortBy: 'dateCollecte' | 'dateLimite' | 'montant', sortOrder: 'desc' | 'asc') => {
    setFilters((prev) => ({ ...prev, sortBy, sortOrder, offset: 0 }));
  }, []);

  const setLimit = useCallback((val: number) => {
    setFilters((prev) => ({ ...prev, limit: val, offset: 0 }));
  }, []);

  const setOffset = useCallback((val: number) => {
    setFilters((prev) => ({ ...prev, offset: val }));
  }, []);

  const reinitialiser = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const recharger = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  // SEUL endroit qui déclenche l'appel API GET /admin/avis
  useEffect(() => {
    if (dateError) {
      // Ne pas lancer de requête si les dates sont invalides
      return;
    }

    const currentReqId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    const apiParams: AdminAvisParams = {
      limit: filters.limit,
      offset: filters.offset,
      source: filters.source && filters.source !== 'TOUS' ? filters.source : undefined,
      statut: filters.statut && filters.statut !== 'TOUS' ? filters.statut : undefined,
      dateFrom: computedDateFrom,
      dateTo: computedDateTo,
      q: debouncedQ.trim() ? debouncedQ.trim() : undefined,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder
    };

    api.getAdminAvis(apiParams)
      .then((res) => {
        if (currentReqId !== requestIdRef.current) return;
        if (res.donnees) {
          setResponse(res.donnees);
        } else {
          setResponse({
            total: 0,
            limit: filters.limit,
            offset: filters.offset,
            count: 0,
            avis: [],
            facettes: { sources: [], statuts: [] }
          });
        }
        setError(null);
      })
      .catch((err: any) => {
        if (currentReqId !== requestIdRef.current) return;
        setError({
          message: err?.message || 'Impossible de récupérer la liste des avis collectés.',
          code: err?.code
        });
      })
      .finally(() => {
        if (currentReqId === requestIdRef.current) {
          setLoading(false);
        }
      });
  }, [
    debouncedQ,
    filters.source,
    filters.statut,
    computedDateFrom,
    computedDateTo,
    filters.sortBy,
    filters.sortOrder,
    filters.limit,
    filters.offset,
    refreshTrigger,
    dateError
  ]);

  return {
    filters,
    setQ,
    setSource,
    setStatut,
    setPeriode,
    setCustomDateFrom,
    setCustomDateTo,
    setSort,
    setLimit,
    setOffset,
    reinitialiser,
    recharger,
    filtresActifs,
    dateError,
    response,
    loading,
    error
  };
}
