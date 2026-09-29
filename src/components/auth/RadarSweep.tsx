import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Globe,
  Building2,
  Calendar,
  MapPin,
  ArrowRight,
  X,
  PhoneCall,
  CheckCircle2,
  ExternalLink,
  MessageSquare,
  Radio,
  RefreshCw
} from 'lucide-react';
import { api } from '../../services/api';
import { PublicRadarData, RadarBlipItem } from '../../types';

export const RadarSweep: React.FC = () => {
  const [radarData, setRadarData] = useState<PublicRadarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'ALL' | 'NATIONAL' | 'INTERNATIONAL'>('ALL');
  
  // Auto-cycling state
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [hoveredBlip, setHoveredBlip] = useState<RadarBlipItem | null>(null);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [showContactModal, setShowContactModal] = useState<boolean>(false);

  // Background polling every 3 minutes for live Google Sheets updates
  useEffect(() => {
    let isMounted = true;
    const fetchRadar = async () => {
      try {
        setLoading(true);
        const res = await api.getPublicRadarTicker();
        if (isMounted && res.donnees) {
          setRadarData(res.donnees);
        }
      } catch (err: any) {
        if (isMounted) {
          console.warn('Erreur chargement radar:', err);
          setError('Impossible de connecter le radar live');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchRadar();
    const interval = setInterval(fetchRadar, 3 * 60 * 1000); // 3 minutes polling
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Filter blips by tab
  const filteredBlips = (radarData?.blips || []).filter((item) => {
    if (activeTab === 'NATIONAL') return item.sourceType === 'NATIONAL';
    if (activeTab === 'INTERNATIONAL') return item.sourceType === 'INTERNATIONAL_BAILLEURS';
    return true;
  });

  // Cycle automatically through blips every 5 seconds if not paused
  useEffect(() => {
    if (isPaused || filteredBlips.length === 0) return;
    const cycleTimer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % filteredBlips.length);
    }, 5000); // 5s interval

    return () => clearInterval(cycleTimer);
  }, [isPaused, filteredBlips.length]);

  // Keep active index in bounds when tab changes
  useEffect(() => {
    setActiveIndex(0);
  }, [activeTab]);

  const activeBlip = hoveredBlip || (filteredBlips.length > 0 ? filteredBlips[activeIndex % filteredBlips.length] : null);

  const formatFcfa = (val: number) => {
    if (val >= 1000000000) {
      return (val / 1000000000).toFixed(2) + ' Mds FCFA';
    }
    if (val >= 1000000) {
      return (val / 1000000).toFixed(0) + ' M FCFA';
    }
    return new Intl.NumberFormat('fr-FR').format(val) + ' FCFA';
  };

  return (
    <div
      className="h-full w-full bg-page text-slate-900 flex flex-col justify-between p-4 sm:p-6 lg:p-7 font-sans relative overflow-hidden"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => {
        setIsPaused(false);
        setHoveredBlip(null);
      }}
    >
      {/* 1. HEADER BAR & TITLE HIERARCHY (Section 4) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2 z-20 shrink-0">
        <div>
          {/* Over-title uppercase */}
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-[10px] font-black tracking-wider uppercase text-teal-800">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-600"></span>
              </span>
              <span>RADAR EN DIRECT · 850+ SOURCES NATIONALES & INTERNATIONALES</span>
            </span>
          </div>

          {/* Main H2 Title */}
          <h2 className="text-xl lg:text-2xl font-black tracking-tight text-slate-900 font-titre">
            Flux d'opportunités en détection active
          </h2>

          {/* Dynamic Counter from DASHBOARD */}
          <p className="text-xs text-slate-600 font-medium mt-0.5">
            <span className="font-bold text-teal-700 font-mono">
              {radarData?.totalAvisAnalysesPeriode || 87} avis
            </span>{' '}
            analysés cette semaine par IA · ARMP, COLEPS, ONU & Bailleurs
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 p-1 bg-slate-200/80 rounded-xl text-xs font-medium self-start sm:self-auto border border-slate-200/80 shrink-0">
          <button
            onClick={() => setActiveTab('ALL')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'ALL'
                ? 'bg-white text-teal-800 font-bold shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tous ({radarData?.blips.length || 8})
          </button>
          <button
            onClick={() => setActiveTab('NATIONAL')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'NATIONAL'
                ? 'bg-white text-teal-800 font-bold shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ARMP / National
          </button>
          <button
            onClick={() => setActiveTab('INTERNATIONAL')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'INTERNATIONAL'
                ? 'bg-white text-sky-700 font-bold shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Bailleurs
          </button>
        </div>
      </div>

      {/* 2. MAIN RADAR CONTAINER WITH DECOUPLED HUD OVERLAY */}
      <div className="flex-1 flex flex-col items-center justify-center relative my-1 min-h-[380px] sm:min-h-[460px] lg:min-h-[500px]">
        
        {/* CIRCULAR RADAR GRAPHIC WRAPPER */}
        <div className="relative w-[300px] h-[320px] sm:w-[420px] sm:h-[420px] lg:w-[480px] lg:h-[480px] xl:w-[520px] xl:h-[520px]">
          
          <div className="w-full h-full rounded-full bg-white border border-slate-200 shadow-xl flex items-center justify-center overflow-hidden relative">
            
            {/* SVG Grid & Dotted Axes */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100">
              {/* Concentric Circles */}
              <circle cx="50" cy="50" r="12" fill="none" stroke="rgba(0, 105, 92, 0.12)" strokeWidth="0.4" strokeDasharray="1 1" />
              <circle cx="50" cy="50" r="24" fill="none" stroke="rgba(0, 105, 92, 0.15)" strokeWidth="0.4" />
              <circle cx="50" cy="50" r="36" fill="none" stroke="rgba(0, 105, 92, 0.20)" strokeWidth="0.4" strokeDasharray="2 2" />
              <circle cx="50" cy="50" r="47" fill="none" stroke="rgba(0, 105, 92, 0.25)" strokeWidth="0.5" />

              {/* Crosshair Axes */}
              <line x1="50" y1="3" x2="50" y2="97" stroke="rgba(0, 105, 92, 0.18)" strokeWidth="0.35" strokeDasharray="1.5 1.5" />
              <line x1="3" y1="50" x2="97" y2="50" stroke="rgba(0, 105, 92, 0.18)" strokeWidth="0.35" strokeDasharray="1.5 1.5" />
              
              {/* Range Ticks */}
              <text x="51.2" y="14" fill="rgba(0, 105, 92, 0.5)" fontSize="2.5" fontWeight="600">1B FCFA</text>
              <text x="51.2" y="26" fill="rgba(0, 105, 92, 0.5)" fontSize="2.5" fontWeight="600">500M FCFA</text>
              <text x="51.2" y="38" fill="rgba(0, 105, 92, 0.5)" fontSize="2.5" fontWeight="600">50M FCFA</text>
              <text x="51.2" y="48.5" fill="rgba(0, 105, 92, 0.5)" fontSize="2.5" fontWeight="600">10M</text>
            </svg>

            {/* ROTATING 360° RADAR SWEEP CONE */}
            <motion.div
              className="absolute inset-0 rounded-full pointer-events-none z-10"
              animate={{ rotate: 360 }}
              transition={{
                repeat: Infinity,
                duration: 8,
                ease: 'linear'
              }}
              style={{ transformOrigin: 'center center' }}
            >
              <div
                className="w-full h-full rounded-full"
                style={{
                  background: 'conic-gradient(from 0deg at 50% 50%, rgba(0, 105, 92, 0.22) 0deg, rgba(0, 105, 92, 0.06) 35deg, transparent 75deg, transparent 360deg)'
                }}
              />
              <div
                className="absolute top-0 left-1/2 w-0.5 h-1/2 bg-gradient-to-t from-teal-600 to-teal-400 origin-bottom shadow-[0_0_8px_rgba(0,105,92,0.8)]"
                style={{ transform: 'translateX(-50%)' }}
              />
            </motion.div>

            {/* Central Origin Hub */}
            <div className="absolute w-3.5 h-3.5 rounded-full bg-teal-700 border-2 border-white shadow-md z-20 flex items-center justify-center">
              <div className="w-1 h-1 rounded-full bg-white animate-ping" />
            </div>

            {/* RADAR BLIP DOT MARKS */}
            {filteredBlips.map((blip, idx) => {
              const rad = (blip.angle - 90) * (Math.PI / 180);
              const radiusFrac = (blip.radiusPercent / 100) * 44;
              const xPercent = 50 + radiusFrac * Math.cos(rad);
              const yPercent = 50 + radiusFrac * Math.sin(rad);

              const isNational = blip.sourceType === 'NATIONAL';
              const isActive = activeBlip?.idAO === blip.idAO;

              return (
                <div
                  key={blip.idAO}
                  className="absolute z-30 cursor-pointer transform -translate-x-1/2 -translate-y-1/2 group"
                  style={{ left: `${xPercent}%`, top: `${yPercent}%` }}
                  onMouseEnter={() => setHoveredBlip(blip)}
                  onClick={() => {
                    setActiveIndex(idx);
                    setHoveredBlip(blip);
                  }}
                >
                  {/* Ping ripple effect for active blip */}
                  {isActive && (
                    <span className={`absolute -inset-2 rounded-full animate-ping opacity-80 ${
                      isNational ? 'bg-teal-500' : 'bg-sky-500'
                    }`} />
                  )}

                  {/* Dot Marker */}
                  <div
                    className={`rounded-full flex items-center justify-center transition-all duration-300 ${
                      isActive
                        ? 'w-4 h-4 scale-125 ring-4 ring-teal-500/40 shadow-lg'
                        : 'w-3 h-3 opacity-60 hover:opacity-100 hover:scale-110 shadow-xs'
                    } ${
                      isNational
                        ? 'bg-teal-600 text-white'
                        : 'bg-sky-600 text-white'
                    }`}
                  >
                    <div className="w-1 h-1 rounded-full bg-white" />
                  </div>

                  {/* Micro floating amount tag ONLY when active */}
                  {isActive && (
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 whitespace-nowrap text-[9px] font-black px-2 py-0.5 rounded-full bg-slate-900 text-white shadow-md border border-slate-700/80 z-40 animate-in fade-in zoom-in-95">
                      {formatFcfa(blip.montantEstime)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* 3. DECOUPLED HUD TENDER CARD OVERLAY */}
          {activeBlip && (
            <div className="absolute -bottom-2 left-0 right-0 sm:-bottom-4 z-40 px-2 sm:px-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeBlip.idAO}
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.98 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="w-full bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-xl shadow-slate-900/10 rounded-2xl p-3 sm:p-4 text-left transition-all"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                          activeBlip.sourceType === 'NATIONAL'
                            ? 'bg-teal-50 text-teal-800 border border-teal-200/80'
                            : 'bg-sky-50 text-sky-800 border border-sky-200/80'
                        }`}
                      >
                        {activeBlip.sourceNom}
                      </span>

                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold">
                        {activeBlip.typeProcedure}
                      </span>
                    </div>

                    {/* AI Score Badge */}
                    <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg text-xs font-black text-amber-700">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      <span>{activeBlip.scoreIA.toFixed(1)}/5</span>
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 leading-snug mb-2 line-clamp-2">
                    {activeBlip.titreAO}
                  </h3>

                  {/* Metadata Row */}
                  <div className="flex items-center justify-between gap-2 text-xs pt-2 border-t border-slate-200/60">
                    <div className="flex items-center gap-1.5 truncate text-slate-600 text-[11px]">
                      <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate max-w-[140px] sm:max-w-[220px]">{activeBlip.maitreOuvrage}</span>
                      <span className="text-slate-300">·</span>
                      <span className="text-teal-700 font-semibold">{activeBlip.region}</span>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-extrabold text-teal-800 font-mono text-xs sm:text-sm">
                        {formatFcfa(activeBlip.montantEstime)}
                      </span>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* 4. SOFT SINGLE-LINE CTA AT BOTTOM */}
      <div className="mt-3 pt-3 border-t border-slate-200/60 text-center shrink-0 z-20">
        <p className="text-xs text-slate-600 font-medium">
          Vous souhaitez calibrer ce radar pour votre entreprise ?{' '}
          <button
            onClick={() => setShowContactModal(true)}
            className="text-teal-700 font-bold hover:underline inline-flex items-center gap-1 cursor-pointer transition-colors"
          >
            <span>Demander un accès pilote</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </p>
      </div>

      {/* CONTACT & PILOT ACCESS MODAL */}
      {showContactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 text-slate-900 shadow-2xl relative">
            <button
              onClick={() => setShowContactModal(false)}
              className="absolute top-4 right-4 p-2 rounded-lg bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-teal-50 text-teal-700">
                <PhoneCall className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Accès Pilote & Calibration Radar</h3>
                <p className="text-xs text-slate-500">Market Advisor CM · Service Entreprises</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              Consultez nos experts pour calibrer vos règles de ciblage automatique sur l'ensemble des marchés nationaux (ARMP, Ministères, FEICOM) et internationaux (World Bank, BAD, agences ONU).
            </p>

            <div className="space-y-3 mb-6">
              <a
                href="https://wa.me/237699887766?text=Bonjour,%20je%20souhaite%20demander%20un%20acc%C3%A8s%20pilote%20et%20calibrer%20mon%20radar%20Market%20Advisor%20CM."
                target="_blank"
                rel="noreferrer"
                className="w-full py-3 px-4 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-black font-extrabold text-xs flex items-center justify-center gap-2.5 transition-colors shadow-xs cursor-pointer"
              >
                <MessageSquare className="w-4 h-4 fill-black" />
                <span>Échanger instantanément sur WhatsApp (+237 699 88 77 66)</span>
              </a>

              <a
                href="mailto:contact@marketadvisor.cm?subject=Demande%20d%27acc%C3%A8s%20pilote%20Market%20Advisor%20CM"
                className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-2.5 transition-colors border border-slate-200 cursor-pointer"
              >
                <ExternalLink className="w-4 h-4 text-teal-600" />
                <span>Envoyer un email d'accès pilote</span>
              </a>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-500 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
              <span>
                Activation sous 24h ouvrées avec paramétrage sur-mesure et essais gratuits.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
