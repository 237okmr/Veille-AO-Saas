import React, { useState, useRef } from 'react';
import { useLangue } from '../../context/LangueContext';
import { RadarContainer } from '../radar/RadarContainer';
import { AccueilHeader } from './AccueilHeader';
import { HeroSection } from './HeroSection';
import { VoletDroit, OngletActif } from './VoletDroit';

export const AuthPage: React.FC = () => {
  const { t } = useLangue();

  // État onglet actif partagé ('pilote' | 'connexion') - Défaut : 'pilote' pour conversion
  const [ongletActif, setOngletActif] = useState<OngletActif>('pilote');

  const firstInputRef = useRef<HTMLInputElement>(null);

  const handleCtaPilote = () => {
    setOngletActif('pilote');
    // Focus sur le premier champ après bascule d'onglet
    setTimeout(() => {
      firstInputRef.current?.focus();
    }, 50);
  };

  return (
    <div className="w-full min-h-screen bg-page font-corps text-encre flex flex-col">
      {/* 1. En-tête (4px drapeau + barre principale) */}
      <AccueilHeader onSelectConnexion={() => setOngletActif('connexion')} />

      {/* 2. Grille responsive et fluide sans blocage vertical */}
      <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 xl:gap-12 items-start">
        {/* ==================================================================== */}
        {/* COLONNE GAUCHE (7 colonnes lg) : Présentation & Radar                */}
        {/* ==================================================================== */}
        <section
          aria-label="Présentation et Radar des opportunités"
          className="lg:col-span-7 flex flex-col space-y-6 w-full"
        >
          {/* Bloc d'accroche (3 cartes étapes + sources + CTA) */}
          <HeroSection onCtaPilote={handleCtaPilote} />

          {/* Radar des marchés animé et carte HUD */}
          <div className="w-full pt-2">
            <RadarContainer />
          </div>
        </section>

        {/* ==================================================================== */}
        {/* COLONNE DROITE (5 colonnes lg) : Espace utilisateur et pilote        */}
        {/* ==================================================================== */}
        <section
          aria-label="Espace utilisateur et accès pilote"
          className="lg:col-span-5 w-full lg:pl-6 lg:border-l border-ligne flex flex-col"
        >
          <VoletDroit
            ongletActif={ongletActif}
            onSelectOnglet={setOngletActif}
            firstInputRef={firstInputRef}
          />
        </section>
      </main>
    </div>
  );
};
