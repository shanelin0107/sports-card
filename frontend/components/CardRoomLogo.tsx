interface CardRoomLogoProps {
  className?: string;
  /** Size of the icon in px (default 28) */
  iconSize?: number;
  /** Text size Tailwind class (default "text-lg") */
  textSize?: string;
}

export function CardRoomLogo({
  className = "",
  iconSize = 28,
  textSize = "text-lg",
}: CardRoomLogoProps) {
  return (
    <div className={`flex items-center gap-2 select-none ${className}`}>
      {/* SVG icon — house with a card-shaped door */}
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="cr-grad-accent" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#60a5fa" />
          </linearGradient>
          <linearGradient id="cr-grad-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3730a3" />
            <stop offset="100%" stopColor="#1e3a8a" />
          </linearGradient>
        </defs>

        {/* House walls */}
        <rect
          x="4" y="20" width="32" height="17"
          rx="2"
          fill="url(#cr-grad-bg)"
          stroke="url(#cr-grad-accent)"
          strokeWidth="1.2"
        />

        {/* Roof — overhangs walls slightly for depth */}
        <polygon
          points="20,3 39,21 1,21"
          fill="url(#cr-grad-accent)"
        />

        {/* Subtle highlight along left roof edge */}
        <line
          x1="20" y1="3" x2="1" y2="21"
          stroke="white" strokeWidth="0.8" opacity="0.25"
          strokeLinecap="round"
        />

        {/* Door — playing-card proportions (8 × 11), bottom-flush with walls */}
        <rect
          x="16" y="26" width="8" height="11"
          rx="1.5"
          fill="#1e1b4b"
          stroke="#818cf8"
          strokeWidth="1"
        />

        {/* Diamond suit on door */}
        <path
          d="M20 28 L22.5 30.5 L20 33 L17.5 30.5 Z"
          fill="url(#cr-grad-accent)"
        />
      </svg>

      {/* Wordmark */}
      <span
        className={`font-bold tracking-tight bg-gradient-to-r from-indigo-400 to-blue-400 bg-clip-text text-transparent ${textSize}`}
      >
        Card Room
      </span>
    </div>
  );
}
