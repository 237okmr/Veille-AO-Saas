import React from 'react';
import { AvisRadar } from '../../types/radar';
import {
  calculerPositionAvis,
  categoriePourSource
} from '../../utils/radarUtils';
import { useLangue } from '../../context/LangueContext';
import { formatterMontant } from '../../i18n/accueil';

interface RadarSvgProps {
  avisList: AvisRadar[];
  selectedId?: string | null;
  onSelectAvis?: (avis: AvisRadar) => void;
  estFiltre?: (avis: AvisRadar) => boolean;
}

export const RadarSvg: React.FC<RadarSvgProps> = ({
  avisList,
  selectedId,
  onSelectAvis,
  estFiltre
}) => {
  const { langue, t } = useLangue();

  return (
    <div className="w-full flex items-center justify-center">
      {/* Conteneur carré responsive */}
      <div
        className="relative select-none flex items-center justify-center max-w-full"
        style={{
          width: 'clamp(260px, 26vw, 400px)',
          aspectRatio: '1 / 1'
        }}
      >
        {/* ================================================================== */}
        {/* FOND BLANC DU RADAR (Marge de 4,63% épousant le rayon 245 / 540)   */}
        {/* ================================================================== */}
        <div className="absolute inset-[4.63%] rounded-full bg-surface shadow-xs" />

        {/* ================================================================== */}
        {/* 1. COUCHE DE BALAYAGE ROTATIF (Faisceau 45°, rotation 8s)           */}
        {/* ================================================================== */}
        <div
          className="absolute inset-[4.63%] rounded-full overflow-hidden pointer-events-none animate-radar-sweep"
          aria-hidden="true"
          style={{
            background:
              'conic-gradient(from 0deg, transparent 0deg, transparent 315deg, rgba(16, 185, 129, 0.20) 360deg)'
          }}
        />

        {/* ================================================================== */}
        {/* 2. SVG DU RADAR (Axes, anneaux, libellés et points d'avis)         */}
        {/* ================================================================== */}
        <svg
          viewBox="0 0 540 540"
          className="relative z-10 block select-none overflow-visible w-full h-full"
          aria-label="Radar des avis de marchés publics"
          role="region"
        >
          {/* ================================================================ */}
          {/* ANNEAU EXTÉRIEUR & ANNEAUX INTÉRIEURS                            */}
          {/* ================================================================ */}
          {/* Grand cercle extérieur de rayon 245, sans fond (laisse voir le balayage) */}
          <circle
            cx="270"
            cy="270"
            r="245"
            fill="none"
            stroke="rgba(13, 148, 136, 0.22)"
            strokeWidth="1.5"
          />

          {/* Deux anneaux intérieurs sans fond (rayons 163.33 et 81.67) */}
          <circle
            cx="270"
            cy="270"
            r="163.33"
            fill="none"
            stroke="rgba(13, 148, 136, 0.22)"
            strokeWidth="1.5"
          />
          <circle
            cx="270"
            cy="270"
            r="81.67"
            fill="none"
            stroke="rgba(13, 148, 136, 0.22)"
            strokeWidth="1.5"
          />

          {/* ================================================================ */}
          {/* AXES EN POINTILLÉS (4 6) PASSANT PAR LE CENTRE                   */}
          {/* ================================================================ */}
          {/* Axe vertical (x = 270, y de 25 à 515) */}
          <line
            x1="270"
            y1="25"
            x2="270"
            y2="515"
            stroke="rgba(13, 148, 136, 0.22)"
            strokeWidth="1.5"
            strokeDasharray="4 6"
          />
          {/* Axe horizontal (y = 270, x de 25 à 515) */}
          <line
            x1="25"
            y1="270"
            x2="515"
            y2="270"
            stroke="rgba(13, 148, 136, 0.22)"
            strokeWidth="1.5"
            strokeDasharray="4 6"
          />

          {/* ================================================================ */}
          {/* LIBELLÉS D'ÉCHELLE & DE DÉLAIS (Inter 15px, #64748B, contour)     */}
          {/* ================================================================ */}
          <g
            fontFamily="Inter, -apple-system, sans-serif"
            fontSize="15"
            fontWeight="500"
            fill="#64748B"
            stroke="#FFFFFF"
            strokeWidth="4"
            strokeLinejoin="round"
            strokeLinecap="round"
            style={{ paintOrder: 'stroke fill' }}
          >
            {/* Montants sur l'axe vertical haut (x = 277) */}
            <text x="277" y="21" textAnchor="start">
              {`1 ${t('uniteMilliard')}`}
            </text>
            <text x="277" y="103" textAnchor="start">
              {`100 ${t('uniteMillion')}`}
            </text>
            <text x="277" y="185" textAnchor="start">
              {`10 ${t('uniteMillion')}`}
            </text>

            {/* Délais en jours */}
            {/* 7 jours à droite (x = 508, y = 262, ancré à droite) */}
            <text x="508" y="262" textAnchor="end">
              {t('jours7')}
            </text>
            {/* 15 jours en bas (x = 277, y = 506) */}
            <text x="277" y="506" textAnchor="start">
              {t('jours15')}
            </text>
            {/* 22 jours à gauche (x = 32, y = 262, ancré à gauche) */}
            <text x="32" y="262" textAnchor="start">
              {t('jours22')}
            </text>
          </g>

          {/* ================================================================ */}
          {/* POINT CENTRAL PLEIN TEAL (#00695C, Rayon 4)                       */}
          {/* ================================================================ */}
          <circle cx="270" cy="270" r="4" fill="#00695C" />

          {/* ================================================================ */}
          {/* ÉTATS DES POINTS D'AVIS & ONDES ACTIVES                          */}
          {/* ================================================================ */}
          <g aria-label="Liste des avis positionnés sur le radar">
            {avisList.map((avis) => {
              const { x, y } = calculerPositionAvis(avis);
              const isNational = categoriePourSource(avis.source) === 'national';
              const isSelected = selectedId === avis.id;
              const isFiltre = estFiltre ? estFiltre(avis) : true;
              const sansMontant = avis.montantFcfa === null || avis.montantFcfa <= 0;

              // Couleurs selon la catégorie (national: #0D9488, international: #0EA5E9)
              const couleurBaseHex = isNational ? '#0D9488' : '#0EA5E9';
              const couleurRemplissage = isSelected
                ? couleurBaseHex
                : isNational
                ? 'rgba(13, 148, 136, 0.4)'
                : 'rgba(14, 165, 233, 0.5)';
              const couleurContour = isSelected
                ? couleurBaseHex
                : isNational
                ? 'rgba(13, 148, 136, 0.7)'
                : 'rgba(14, 165, 233, 0.7)';

              const montantAffiche = sansMontant
                ? t('montantNonCommunique')
                : formatterMontant(
                    avis.montantFcfa! >= 1_000_000_000
                      ? Number((avis.montantFcfa! / 1_000_000_000).toFixed(1))
                      : Math.round(avis.montantFcfa! / 1_000_000),
                    avis.montantFcfa! >= 1_000_000_000 ? 'Md' : 'M',
                    langue
                  );

              const handleKeyDown = (e: React.KeyboardEvent) => {
                if (!isFiltre) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectAvis?.(avis);
                }
              };

              return (
                <g
                  key={avis.id}
                  role="button"
                  tabIndex={isFiltre ? 0 : -1}
                  aria-label={`${avis.titre}, ${montantAffiche}`}
                  aria-pressed={isSelected}
                  onClick={() => isFiltre && onSelectAvis?.(avis)}
                  onKeyDown={handleKeyDown}
                  className={`group outline-none select-none ${
                    isFiltre ? 'cursor-pointer' : 'pointer-events-none opacity-10'
                  }`}
                  style={{
                    opacity: isFiltre ? 1 : 0.1
                  }}
                >
                  {/* Zone de clic transparente généreuse de rayon 17 */}
                  <circle cx={x} cy={y} r="17" fill="transparent" />

                  {/* Anneau de focus visible (accessibilité clavier) */}
                  <circle
                    cx={x}
                    cy={y}
                    r="13"
                    fill="none"
                    stroke="#1D6FE0"
                    strokeWidth="2"
                    className="opacity-0 group-focus-visible:opacity-100 transition-opacity pointer-events-none"
                  />

                  {/* ======================================================== */}
                  {/* ONDES DU POINT ACTIF (Deux anneaux rayon 9, animés)      */}
                  {/* ======================================================== */}
                  {isSelected && isFiltre && (
                    <>
                      {/* Onde 1 (départ immédiat) */}
                      <circle
                        cx={x}
                        cy={y}
                        r="9"
                        fill="none"
                        stroke={couleurBaseHex}
                        strokeWidth="2"
                        className="animate-radar-onde-1 pointer-events-none"
                      />

                      {/* Onde 2 (décalée de 0.8s) */}
                      <circle
                        cx={x}
                        cy={y}
                        r="9"
                        fill="none"
                        stroke={couleurBaseHex}
                        strokeWidth="2"
                        className="animate-radar-onde-2 pointer-events-none"
                      />
                    </>
                  )}

                  {/* ======================================================== */}
                  {/* POINT DE L'AVIS (Rayon 4.2 repos, échelle 1.35 actif)     */}
                  {/* ======================================================== */}
                  {sansMontant ? (
                    /* Point CREUX : fond blanc, contour 1.5px couleur catégorie, pointillés courts '2 2' */
                    <circle
                      cx={x}
                      cy={y}
                      r="4.2"
                      fill="#FFFFFF"
                      stroke={couleurBaseHex}
                      strokeWidth="1.5"
                      strokeDasharray="2 2"
                      style={{
                        transformOrigin: `${x}px ${y}px`,
                        transform: isSelected ? 'scale(1.35)' : 'scale(1)',
                        transformBox: 'fill-box',
                        transition: 'transform 250ms ease-out',
                        opacity: 1
                      }}
                    />
                  ) : (
                    /* Point PLEIN standard */
                    <>
                      <circle
                        cx={x}
                        cy={y}
                        r="4.2"
                        fill={couleurRemplissage}
                        stroke={couleurContour}
                        strokeWidth="1"
                        style={{
                          transformOrigin: `${x}px ${y}px`,
                          transform: isSelected ? 'scale(1.35)' : 'scale(1)',
                          transformBox: 'fill-box',
                          transition: 'transform 250ms ease-out',
                          opacity: isSelected ? 1 : undefined
                        }}
                      />

                      {/* Noyau central net */}
                      <circle
                        cx={x}
                        cy={y}
                        r={isSelected ? 2 : 1.5}
                        fill={couleurBaseHex}
                        className="pointer-events-none"
                      />
                    </>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
};
