/**
 * 3D claymorphism illustrations for the home tiles.
 * Each one is an SVG with multiple radial gradients + shadows for volumetric effect.
 */

interface ArtProps {
  size?: number;
  className?: string;
}

export function GroceryBagArt({ size = 180, className }: ArtProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="bag-paper" cx="0.35" cy="0.3">
          <stop offset="0%" stopColor="#E5C88A" />
          <stop offset="60%" stopColor="#C9A35A" />
          <stop offset="100%" stopColor="#8B6B2E" />
        </radialGradient>
        <linearGradient id="bag-shadow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      {/* Shadow */}
      <ellipse cx="105" cy="185" rx="72" ry="6" fill="#000" opacity="0.2" />
      {/* Bag body */}
      <path
        d="M 50 70 L 60 180 Q 100 188 150 180 L 160 70 Q 100 60 50 70 Z"
        fill="url(#bag-paper)"
      />
      <path
        d="M 50 70 L 60 180 Q 100 188 150 180 L 160 70 Q 100 60 50 70 Z"
        fill="url(#bag-shadow)"
      />
      {/* Handles */}
      <path
        d="M 70 72 Q 75 40 100 42 Q 125 40 130 72"
        fill="none"
        stroke="#6B4E1A"
        strokeWidth="5"
        strokeLinecap="round"
      />
      {/* Lettuce */}
      <circle cx="80" cy="58" r="18" fill="#7BB866" />
      <circle cx="72" cy="50" r="12" fill="#8FC97A" />
      <circle cx="88" cy="52" r="10" fill="#6FA856" />
      {/* Bread */}
      <ellipse cx="120" cy="58" rx="22" ry="12" fill="#D4A361" />
      <ellipse cx="116" cy="54" rx="18" ry="8" fill="#E5BB7A" />
      {/* Carrot */}
      <path d="M 140 62 L 148 90 L 135 90 Z" fill="#F59E0B" />
      <path
        d="M 138 62 L 142 50 M 142 62 L 146 48 M 146 62 L 150 52"
        stroke="#6FA856"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Highlight on bag */}
      <ellipse cx="75" cy="100" rx="12" ry="35" fill="#FFF4C7" opacity="0.25" />
    </svg>
  );
}

export function PostItStackArt({ size = 180, className }: ArtProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="pi-yellow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFE76D" />
          <stop offset="100%" stopColor="#F5B800" />
        </linearGradient>
        <linearGradient id="pi-pink" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFB3A7" />
          <stop offset="100%" stopColor="#E87461" />
        </linearGradient>
        <linearGradient id="pi-green" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#C5E8B7" />
          <stop offset="100%" stopColor="#8FBF76" />
        </linearGradient>
      </defs>
      {/* Green (bottom) */}
      <g transform="rotate(-10 60 130)">
        <rect x="20" y="80" width="90" height="90" rx="4" fill="url(#pi-green)" />
        <rect x="20" y="80" width="90" height="12" fill="#000" opacity="0.08" />
      </g>
      {/* Pink (middle) */}
      <g transform="rotate(5 100 110)">
        <rect x="55" y="50" width="90" height="90" rx="4" fill="url(#pi-pink)" />
        <rect x="55" y="50" width="90" height="12" fill="#000" opacity="0.08" />
        <line
          x1="70"
          y1="80"
          x2="130"
          y2="80"
          stroke="#B85040"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.5"
        />
        <line
          x1="70"
          y1="95"
          x2="120"
          y2="95"
          stroke="#B85040"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.5"
        />
      </g>
      {/* Yellow (top) */}
      <g transform="rotate(-3 140 90)">
        <rect x="95" y="30" width="90" height="90" rx="4" fill="url(#pi-yellow)" />
        <rect x="95" y="30" width="90" height="12" fill="#000" opacity="0.1" />
        <line
          x1="110"
          y1="60"
          x2="170"
          y2="60"
          stroke="#B8860B"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.5"
        />
        <line
          x1="110"
          y1="75"
          x2="160"
          y2="75"
          stroke="#B8860B"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.5"
        />
        <line
          x1="110"
          y1="90"
          x2="155"
          y2="90"
          stroke="#B8860B"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.5"
        />
      </g>
    </svg>
  );
}

export function TrashBinArt({ size = 180, className }: ArtProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="bin-body" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#9ACB87" />
          <stop offset="50%" stopColor="#7BB866" />
          <stop offset="100%" stopColor="#4E8039" />
        </linearGradient>
        <linearGradient id="bin-lid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8FBF76" />
          <stop offset="100%" stopColor="#5A9245" />
        </linearGradient>
      </defs>
      {/* Shadow */}
      <ellipse cx="105" cy="185" rx="62" ry="5" fill="#000" opacity="0.2" />
      {/* Body */}
      <path d="M 55 70 L 65 180 Q 100 186 145 180 L 155 70 Z" fill="url(#bin-body)" />
      {/* Stripes */}
      <line
        x1="75"
        y1="95"
        x2="78"
        y2="175"
        stroke="#4E8039"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.6"
      />
      <line
        x1="100"
        y1="92"
        x2="100"
        y2="178"
        stroke="#4E8039"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.6"
      />
      <line
        x1="125"
        y1="95"
        x2="122"
        y2="175"
        stroke="#4E8039"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.6"
      />
      {/* Recycle symbol */}
      <g
        transform="translate(100 128)"
        stroke="#FFF8E7"
        strokeWidth="3.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M -18 -8 L -10 -22 L 2 -22 M 4 -22 L -6 -16" />
        <path d="M 18 -6 L 20 10 L 10 18 M 8 18 L 18 16" />
        <path d="M -4 22 L -18 18 L -20 4 M -20 2 L -14 12" />
      </g>
      {/* Lid */}
      <ellipse cx="105" cy="70" rx="55" ry="10" fill="url(#bin-lid)" />
      <ellipse cx="105" cy="67" rx="55" ry="7" fill="#A3D08F" />
      {/* Highlight */}
      <ellipse cx="75" cy="110" rx="6" ry="30" fill="#FFF" opacity="0.2" />
    </svg>
  );
}

export function CalendarArt({ size = 180, className }: ArtProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="cal-base" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E8E2D5" />
        </linearGradient>
        <linearGradient id="cal-header" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E87461" />
          <stop offset="100%" stopColor="#C94E3C" />
        </linearGradient>
      </defs>
      {/* Shadow */}
      <rect x="35" y="175" width="135" height="10" rx="5" fill="#000" opacity="0.18" />
      {/* Body */}
      <rect x="30" y="40" width="140" height="140" rx="14" fill="url(#cal-base)" />
      {/* Header red */}
      <path
        d="M 30 54 Q 30 40 44 40 L 156 40 Q 170 40 170 54 L 170 70 L 30 70 Z"
        fill="url(#cal-header)"
      />
      {/* Rings */}
      <rect x="60" y="25" width="6" height="30" rx="3" fill="#8B7355" />
      <rect x="134" y="25" width="6" height="30" rx="3" fill="#8B7355" />
      <rect x="60" y="25" width="6" height="6" rx="3" fill="#A8927A" />
      <rect x="134" y="25" width="6" height="6" rx="3" fill="#A8927A" />
      {/* Big number */}
      <text
        x="100"
        y="145"
        textAnchor="middle"
        fontFamily="Fraunces, serif"
        fontSize="68"
        fontWeight="700"
        fill="#2A2420"
      >
        15
      </text>
      {/* Dots day marker */}
      <circle cx="70" cy="165" r="3" fill="#7BB866" />
      <circle cx="85" cy="165" r="3" fill="#E87461" />
      <circle cx="100" cy="165" r="3" fill="#F5B800" />
    </svg>
  );
}

export function CameraArt({ size = 180, className }: ArtProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="cam-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F5F1EC" />
          <stop offset="100%" stopColor="#C9BFA8" />
        </linearGradient>
        <radialGradient id="cam-lens" cx="0.3" cy="0.3">
          <stop offset="0%" stopColor="#5B9BD5" />
          <stop offset="50%" stopColor="#2E5A8A" />
          <stop offset="100%" stopColor="#0D1B2E" />
        </radialGradient>
      </defs>
      <ellipse cx="105" cy="185" rx="65" ry="5" fill="#000" opacity="0.18" />
      {/* Mount arm */}
      <rect x="90" y="40" width="20" height="30" fill="#8B7355" rx="3" />
      <circle cx="100" cy="40" r="8" fill="#6B4E1A" />
      {/* Body */}
      <rect x="35" y="65" width="130" height="85" rx="16" fill="url(#cam-body)" />
      {/* Lens outer */}
      <circle cx="100" cy="107" r="38" fill="#2A2420" />
      <circle cx="100" cy="107" r="32" fill="url(#cam-lens)" />
      {/* Lens highlight */}
      <ellipse cx="88" cy="92" rx="10" ry="6" fill="#FFFFFF" opacity="0.5" />
      <circle cx="100" cy="107" r="8" fill="#0D1B2E" />
      {/* LED */}
      <circle cx="150" cy="80" r="5" fill="#E87461" />
      <circle cx="150" cy="80" r="2.5" fill="#FFE5DE" />
    </svg>
  );
}

export function TimerArt({ size = 180, className }: ArtProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="tm-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FF8C7A" />
          <stop offset="100%" stopColor="#C94E3C" />
        </linearGradient>
        <radialGradient id="tm-face" cx="0.4" cy="0.35">
          <stop offset="0%" stopColor="#FFF8E7" />
          <stop offset="100%" stopColor="#E5DCC4" />
        </radialGradient>
      </defs>
      <ellipse cx="105" cy="188" rx="65" ry="5" fill="#000" opacity="0.2" />
      {/* Top dial */}
      <rect x="88" y="25" width="24" height="18" rx="4" fill="#8B7355" />
      <rect x="95" y="20" width="10" height="10" rx="2" fill="#C9A35A" />
      {/* Body */}
      <circle cx="100" cy="115" r="70" fill="url(#tm-body)" />
      {/* Face */}
      <circle cx="100" cy="115" r="55" fill="url(#tm-face)" />
      {/* Ticks */}
      <g stroke="#2A2420" strokeWidth="3" strokeLinecap="round">
        <line x1="100" y1="68" x2="100" y2="76" />
        <line x1="100" y1="154" x2="100" y2="162" />
        <line x1="53" y1="115" x2="61" y2="115" />
        <line x1="139" y1="115" x2="147" y2="115" />
      </g>
      {/* Minute numbers */}
      <text
        x="100"
        y="82"
        textAnchor="middle"
        fontFamily="Fraunces, serif"
        fontSize="12"
        fontWeight="700"
        fill="#2A2420"
      >
        60
      </text>
      <text
        x="152"
        y="120"
        textAnchor="middle"
        fontFamily="Fraunces, serif"
        fontSize="12"
        fontWeight="700"
        fill="#2A2420"
      >
        15
      </text>
      <text
        x="100"
        y="160"
        textAnchor="middle"
        fontFamily="Fraunces, serif"
        fontSize="12"
        fontWeight="700"
        fill="#2A2420"
      >
        30
      </text>
      <text
        x="48"
        y="120"
        textAnchor="middle"
        fontFamily="Fraunces, serif"
        fontSize="12"
        fontWeight="700"
        fill="#2A2420"
      >
        45
      </text>
      {/* Hands */}
      <line
        x1="100"
        y1="115"
        x2="100"
        y2="80"
        stroke="#C94E3C"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <line
        x1="100"
        y1="115"
        x2="130"
        y2="100"
        stroke="#2A2420"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="100" cy="115" r="5" fill="#2A2420" />
      {/* Highlight */}
      <ellipse cx="75" cy="85" rx="14" ry="25" fill="#FFFFFF" opacity="0.25" />
    </svg>
  );
}

export function LaundryArt({ size = 180, className }: ArtProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="washer-body" cx="0.35" cy="0.3">
          <stop offset="0%" stopColor="#E8EEF4" />
          <stop offset="60%" stopColor="#B0BEC5" />
          <stop offset="100%" stopColor="#78909C" />
        </radialGradient>
        <radialGradient id="washer-door" cx="0.4" cy="0.35">
          <stop offset="0%" stopColor="#90CAF9" />
          <stop offset="50%" stopColor="#42A5F5" />
          <stop offset="100%" stopColor="#1565C0" />
        </radialGradient>
      </defs>
      {/* Shadow */}
      <ellipse cx="100" cy="190" rx="72" ry="5" fill="#000" opacity="0.2" />
      {/* Body */}
      <rect x="30" y="25" width="140" height="165" rx="14" fill="url(#washer-body)" />
      {/* Control panel top */}
      <rect x="30" y="25" width="140" height="35" rx="14" fill="#546E7A" />
      <rect x="30" y="42" width="140" height="18" fill="#546E7A" />
      {/* Knobs */}
      <circle cx="60" cy="42" r="8" fill="#37474F" />
      <circle cx="60" cy="42" r="5" fill="#455A64" />
      <circle cx="140" cy="42" r="8" fill="#37474F" />
      <circle cx="140" cy="42" r="5" fill="#455A64" />
      {/* Display */}
      <rect x="85" y="34" width="30" height="14" rx="3" fill="#263238" />
      <text x="100" y="45" textAnchor="middle" fill="#4FC3F7" fontSize="9" fontFamily="monospace">
        0:42
      </text>
      {/* Door circle */}
      <circle cx="100" cy="125" r="52" fill="#455A64" />
      <circle cx="100" cy="125" r="46" fill="url(#washer-door)" />
      {/* Clothes visible through glass */}
      <circle cx="90" cy="118" r="14" fill="#EF5350" opacity="0.6" />
      <circle cx="112" cy="130" r="12" fill="#FFF176" opacity="0.5" />
      <circle cx="95" cy="138" r="10" fill="#81C784" opacity="0.5" />
      {/* Glass highlight */}
      <ellipse
        cx="82"
        cy="108"
        rx="14"
        ry="20"
        fill="#FFFFFF"
        opacity="0.25"
        transform="rotate(-20 82 108)"
      />
      {/* Door handle */}
      <rect x="140" y="120" width="12" height="6" rx="3" fill="#37474F" />
    </svg>
  );
}

export function TvArt({ size = 180, className }: ArtProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="tv-body" cx="0.35" cy="0.3">
          <stop offset="0%" stopColor="#4A4A52" />
          <stop offset="60%" stopColor="#2B2B30" />
          <stop offset="100%" stopColor="#141418" />
        </radialGradient>
        <linearGradient id="tv-screen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2A3B5B" />
          <stop offset="55%" stopColor="#14223E" />
          <stop offset="100%" stopColor="#0A1428" />
        </linearGradient>
        <radialGradient id="tv-glow" cx="0.3" cy="0.35">
          <stop offset="0%" stopColor="#F5B800" stopOpacity="0.5" />
          <stop offset="60%" stopColor="#E87461" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#E87461" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="tv-stand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2B2B30" />
          <stop offset="100%" stopColor="#0E0E12" />
        </linearGradient>
      </defs>
      {/* Ground shadow */}
      <ellipse cx="100" cy="190" rx="78" ry="5" fill="#000" opacity="0.22" />
      {/* Stand */}
      <path
        d="M 75 175 L 125 175 L 140 185 Q 140 188 136 188 L 64 188 Q 60 188 60 185 Z"
        fill="url(#tv-stand)"
      />
      <rect x="92" y="150" width="16" height="28" rx="3" fill="url(#tv-stand)" />
      {/* Chassis */}
      <rect x="20" y="42" width="160" height="110" rx="10" fill="url(#tv-body)" />
      {/* Screen bezel */}
      <rect x="26" y="48" width="148" height="98" rx="4" fill="#0A0A0E" />
      {/* Screen */}
      <rect x="30" y="52" width="140" height="90" rx="3" fill="url(#tv-screen)" />
      {/* Warm content glow */}
      <rect x="30" y="52" width="140" height="90" rx="3" fill="url(#tv-glow)" />
      {/* Abstract picture shapes — a sunset-ish silhouette */}
      <circle cx="72" cy="96" r="16" fill="#F5B800" opacity="0.85" />
      <path
        d="M 30 142 L 30 122 Q 52 108 80 120 Q 108 132 140 116 Q 160 108 170 118 L 170 142 Z"
        fill="#0D1B2E"
        opacity="0.8"
      />
      {/* Screen glass highlight */}
      <path d="M 34 54 L 70 54 L 44 120 L 34 120 Z" fill="#FFFFFF" opacity="0.08" />
      {/* Brand speck */}
      <circle cx="100" cy="160" r="1.5" fill="#E87461" opacity="0.85" />
    </svg>
  );
}

export function RecipeArt({ size = 180, className }: ArtProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="pot-body" cx="0.35" cy="0.4">
          <stop offset="0%" stopColor="#7090A8" />
          <stop offset="60%" stopColor="#3A5A76" />
          <stop offset="100%" stopColor="#1A2E44" />
        </radialGradient>
        <linearGradient id="soup" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F5B800" />
          <stop offset="100%" stopColor="#E87461" />
        </linearGradient>
      </defs>
      <ellipse cx="105" cy="188" rx="78" ry="5" fill="#000" opacity="0.22" />
      {/* Steam */}
      <g fill="none" stroke="#E8EEF4" strokeWidth="5" strokeLinecap="round" opacity="0.75">
        <path d="M 75 55 Q 80 40 75 25 Q 70 10 78 0" />
        <path d="M 100 50 Q 105 35 100 20 Q 95 5 103 -5" />
        <path d="M 125 55 Q 130 40 125 25 Q 120 10 128 0" />
      </g>
      {/* Pot body */}
      <path
        d="M 35 90 Q 35 85 40 85 L 160 85 Q 165 85 165 90 L 160 175 Q 158 182 150 182 L 50 182 Q 42 182 40 175 Z"
        fill="url(#pot-body)"
      />
      {/* Soup visible rim */}
      <ellipse cx="100" cy="90" rx="65" ry="8" fill="url(#soup)" />
      <ellipse cx="100" cy="89" rx="60" ry="5" fill="#FFD966" />
      {/* Handles */}
      <circle cx="30" cy="115" r="8" fill="#5A7490" />
      <circle cx="170" cy="115" r="8" fill="#5A7490" />
      {/* Highlight */}
      <ellipse cx="65" cy="125" rx="8" ry="35" fill="#FFFFFF" opacity="0.2" />
    </svg>
  );
}

export function LightbulbArt({ size = 180, className }: ArtProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Warm glass bulb — amber glow from within */}
        <radialGradient id="lb-glass" cx="0.4" cy="0.35">
          <stop offset="0%" stopColor="#FFF8D6" />
          <stop offset="45%" stopColor="#FFD37A" />
          <stop offset="85%" stopColor="#E89A2E" />
          <stop offset="100%" stopColor="#9E5E14" />
        </radialGradient>
        {/* Soft halo of light spilling outside the glass */}
        <radialGradient id="lb-halo" cx="0.5" cy="0.42">
          <stop offset="0%" stopColor="#FFE9A8" stopOpacity="0.75" />
          <stop offset="60%" stopColor="#FFD37A" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#FFD37A" stopOpacity="0" />
        </radialGradient>
        {/* Screw-in base — brushed brass */}
        <linearGradient id="lb-base" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#D7B070" />
          <stop offset="45%" stopColor="#9E7D44" />
          <stop offset="100%" stopColor="#5E4823" />
        </linearGradient>
        {/* Filament glow */}
        <radialGradient id="lb-filament" cx="0.5" cy="0.5">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="55%" stopColor="#FFB347" />
          <stop offset="100%" stopColor="#FF7A18" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Ground shadow */}
      <ellipse cx="105" cy="188" rx="56" ry="5" fill="#000" opacity="0.22" />

      {/* Outer halo — the "it's glowing" cue */}
      <circle cx="100" cy="82" r="78" fill="url(#lb-halo)" />

      {/* Glass envelope — classic pear shape */}
      <path
        d="M 100 22
           C 62 22 42 52 42 80
           C 42 102 56 118 68 130
           C 74 136 76 142 76 150
           L 124 150
           C 124 142 126 136 132 130
           C 144 118 158 102 158 80
           C 158 52 138 22 100 22 Z"
        fill="url(#lb-glass)"
      />

      {/* Inner filament halo */}
      <circle cx="100" cy="82" r="24" fill="url(#lb-filament)" opacity="0.9" />

      {/* Tungsten filament — looped wire */}
      <path
        d="M 86 92 L 90 70 L 94 90 L 98 70 L 102 90 L 106 70 L 110 90 L 114 70"
        fill="none"
        stroke="#FFE08A"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 86 92 L 90 70 L 94 90 L 98 70 L 102 90 L 106 70 L 110 90 L 114 70"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
      {/* Support wires from filament down to the stem */}
      <line
        x1="92"
        y1="92"
        x2="96"
        y2="120"
        stroke="#7A5B22"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="108"
        y1="92"
        x2="104"
        y2="120"
        stroke="#7A5B22"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Glass highlight — upper-left sheen */}
      <ellipse cx="72" cy="55" rx="9" ry="22" fill="#FFFFFF" opacity="0.55" />
      <ellipse cx="80" cy="75" rx="3" ry="8" fill="#FFFFFF" opacity="0.35" />

      {/* Collar between glass and base (dark gasket) */}
      <rect x="74" y="148" width="52" height="6" rx="2" fill="#2A2420" opacity="0.85" />

      {/* Screw base with thread rings */}
      <path
        d="M 76 154 L 124 154 L 120 176 Q 118 180 114 180 L 86 180 Q 82 180 80 176 Z"
        fill="url(#lb-base)"
      />
      <g stroke="#5E4823" strokeWidth="1.5" opacity="0.7">
        <line x1="78" y1="162" x2="122" y2="162" />
        <line x1="79" y1="168" x2="121" y2="168" />
        <line x1="80" y1="174" x2="120" y2="174" />
      </g>
      {/* Tiny contact tip at the bottom */}
      <rect x="94" y="180" width="12" height="4" rx="1" fill="#2A2420" />
    </svg>
  );
}
