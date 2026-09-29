import { useState, useEffect, useCallback, useRef } from 'react';
import { AvisRadar } from '../types/radar';
import { categoriePourSource } from '../utils/radarUtils';

export type TypeFiltreRadar = 'ALL' | 'NATIONAL' | 'INTERNATIONAL';

interface UseCycleAvisOptions {
  avisList: AvisRadar[];
  filtre: TypeFiltreRadar;
  isPaused: boolean;
  intervalMs?: number; // Par défaut 5500 ms (5,5 secondes)
}

export function useCycleAvis({
  avisList,
  filtre,
  isPaused,
  intervalMs = 5500
}: UseCycleAvisOptions) {
  // 1. Filtrer les avis selon le filtre actif
  const avisFiltres = avisList.filter((avis) => {
    if (filtre === 'ALL') return true;
    const cat = categoriePourSource(avis.source);
    if (filtre === 'NATIONAL') return cat === 'national';
    if (filtre === 'INTERNATIONAL') return cat === 'international';
    return true;
  });

  // 2. Retenir les 5 avis au meilleur score IA
  const top5Avis = [...avisFiltres]
    .sort((a, b) => b.scoreIa - a.scoreIa)
    .slice(0, 5);

  const [selectedId, setSelectedId] = useState<string | null>(() => {
    return top5Avis.length > 0 ? top5Avis[0].id : null;
  });

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 3. Si l'avis sélectionné sort du filtre actif ou n'existe pas, sélectionner le premier du top 5
  useEffect(() => {
    if (top5Avis.length === 0) {
      setSelectedId(null);
      return;
    }
    const existeDansTop5 = top5Avis.some((a) => a.id === selectedId);
    if (!existeDansTop5) {
      setSelectedId(top5Avis[0].id);
    }
  }, [filtre, top5Avis, selectedId]);

  // 4. Fonction pour passer au suivant
  const allerAuSuivant = useCallback(() => {
    if (top5Avis.length <= 1) return;
    setSelectedId((currentId) => {
      const indexActuel = top5Avis.findIndex((a) => a.id === currentId);
      const indexSuivant = (indexActuel + 1) % top5Avis.length;
      return top5Avis[indexSuivant].id;
    });
  }, [top5Avis]);

  // 5. Sélection manuelle réarmant le cycle
  const selectAvis = useCallback((avis: AvisRadar) => {
    setSelectedId(avis.id);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
  }, []);

  // 6. Gestion du minuteur de 5,5 secondes réarmé à chaque changement
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    if (isPaused || top5Avis.length <= 1) {
      return;
    }

    timerRef.current = setTimeout(() => {
      allerAuSuivant();
    }, intervalMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [selectedId, isPaused, top5Avis, intervalMs, allerAuSuivant]);

  // Avis actif complet
  const avisActif =
    top5Avis.find((a) => a.id === selectedId) ||
    avisFiltres.find((a) => a.id === selectedId) ||
    (top5Avis.length > 0 ? top5Avis[0] : null);

  return {
    selectedId,
    avisActif,
    top5Avis,
    avisFiltres,
    selectAvis,
    allerAuSuivant
  };
}
