import React from 'react';
import { Zap } from 'lucide-react';
import { PageHeader } from '../ui';
import { AvisFiltres } from './AvisFiltres';
import { AvisListe } from './AvisListe';
import { useAdminAvis } from '../../hooks/useAdminAvis';

interface AdminAvisProps {
  onNavigate: (view: string) => void;
}

export const AdminAvis: React.FC<AdminAvisProps> = ({ onNavigate: _onNavigate }) => {
  const hook = useAdminAvis();

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* En-tête de page institutionnel */}
      <PageHeader
        badge={{
          label: 'Pipeline de collecte',
          icon: Zap
        }}
        titre="Avis collectés"
        description="Tous les avis récupérés par la collecte, avant qualification et envoi aux clients. Lecture seule."
      />

      {/* Barre de filtres responsive */}
      <AvisFiltres hook={hook} />

      {/* Liste Définitive (Tableau Desktop ≥ 1024px, Cartes Mobile < 1024px, Détails dépliables, Pagination & Gestion d'états) */}
      <AvisListe hook={hook} />
    </div>
  );
};
