import React from 'react';

interface LogoMarketAdvisorProps {
  taille?: 'md' | 'sm';
  className?: string;
}

export const LogoMarketAdvisor: React.FC<LogoMarketAdvisorProps> = ({
  taille = 'md',
  className = ''
}) => {
  const isSm = taille === 'sm';

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* Official SVG Logo */}
      <svg
        viewBox="0 0 40 40"
        fill="none"
        aria-hidden="true"
        className={`${isSm ? 'w-7 h-7' : 'w-8 h-8'} text-teal shrink-0`}
      >
        <circle cx="20" cy="20" r="17" stroke="currentColor" strokeWidth="2.5" />
        <circle cx="20" cy="20" r="9" stroke="currentColor" strokeWidth="2" opacity=".55" />
        <path d="M20 20 L36 24 A17 17 0 0 1 20 37 Z" fill="currentColor" opacity=".28" />
        <path d="M20 20 L36 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="26" cy="12" r="3" fill="currentColor" />
      </svg>

      {/* Wordmark & Country Badge */}
      <div className="flex items-center gap-1.5">
        <span
          className={`font-titre font-extrabold ${
            isSm ? 'text-[1.05rem]' : 'text-[1.2rem]'
          } text-encre tracking-tight leading-none`}
        >
          Market Advisor
        </span>
        <span className="bg-teal text-white font-bold text-[0.8125rem] rounded-[6px] px-1.5 py-0.5 leading-none">
          CM
        </span>
      </div>
    </div>
  );
};
