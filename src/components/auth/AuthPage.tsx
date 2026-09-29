import React, { useState, useRef } from 'react';
import { useLangue } from '../../context/LangueContext';
import { RadarContainer } from '../radar/RadarContainer';
import { AccueilHeader } from './AccueilHeader';
import { HeroSection } from './HeroSection';
import { ModalExempleAlerte } from './ModalExempleAlerte';
import { VoletDroit, OngletActif } from './VoletDroit';

export const AuthPage: React.FC = () => {
  const { t } = useLangue();

  // État onglet actif partagé ('pilote' | 'connexion')
  const [ongletActif, setOngletActif] = useState<OngletActif>('connexion');
  const [isModalAlerteOpen, setIsModalAlerteOpen] = useState(false);

  const firstInputRef = useRef<HTMLInputElement>(null);

  const handleCtaPilote = () => {
    setOngletActif('pilote');
    // Focus sur le premier champ après bascule d'onglet
    setTimeout(() => {
      firstInputRef.current?.focus();
    }, 50);
  };

  return (
    <div className="w-full min-h-screen min-[981px]:h-[100dvh] min-[981px]:overflow-hidden bg-page font-corps text-encre flex flex-col">
      {/* 1. En-tête (4px drapeau + barre principale) */}
      <AccueilHeader onSelectConnexion={() => setOngletActif('connexion')} />

      {/* 2. Grille divisée sans scroll sur écran PC (>= 981px) */}
      <main className="flex-1 min-h-0 flex flex-col min-[981px]:grid min-[981px]:grid-cols-[minmax(0,1.5fr)_minmax(400px,1fr)] min-[981px]:overflow-hidden">
        {/* ==================================================================== */}
        {/* COLONNE GAUCHE : minmax(0, 1.5fr), pt: 20px, pb: 22px                */}
        {/* ==================================================================== */}
        <section
          aria-label="Présentation et Radar des opportunités"
          className="w-full pt-[20px] pb-[22px] px-4 sm:px-6 lg:px-8 min-[981px]:min-h-0 min-[981px]:overflow-y-auto no-scrollbar flex flex-col justify-between"
        >
          {/* Bloc d'accroche principal (Titre h1 + Sous-titre + 2 CTAs) */}
          <HeroSection
            onCtaPilote={handleCtaPilote}
            onOpenExempleAlerte={() => setIsModalAlerteOpen(true)}
          />

          {/* Radar des marchés animé et carte HUD */}
          <div className="flex-1 flex flex-col justify-center items-center py-1 w-full">
            <RadarContainer />
          </div>
        </section>

        {/* ==================================================================== */}
        {/* COLONNE DROITE : minmax(400px, 1fr), py: 22px, bordure gauche         */}
        {/* ==================================================================== */}
        <section
          aria-label="Espace utilisateur et accès pilote"
          className="w-full py-[22px] compact-padding-on-short-screen px-4 sm:px-6 lg:px-8 border-t min-[981px]:border-t-0 min-[981px]:border-l border-ligne min-[981px]:min-h-0 min-[981px]:overflow-y-auto no-scrollbar bg-page flex flex-col justify-center"
        >
          <VoletDroit
            ongletActif={ongletActif}
            onSelectOnglet={setOngletActif}
            firstInputRef={firstInputRef}
          />
        </section>
      </main>

      {/* 3. Fenêtre Modale « Exemple d'alerte » */}
      <ModalExempleAlerte
        isOpen={isModalAlerteOpen}
        onClose={() => setIsModalAlerteOpen(false)}
      />
    </div>
  );
};
