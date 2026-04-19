/**
 * Illustrazioni meteo 3D "clay/plasticine" via SVG inline.
 * Each icon is composed of multiple radial gradients + filters
 * per simulare luce da sopra-sinistra (stile claymorphism).
 */

import type { WeatherIconKey } from "@home-panel/shared";

interface WeatherArtProps {
  iconKey: WeatherIconKey;
  size?: number;
  className?: string;
}

const SunArt = ({ size }: { size: number }) => (
  <svg viewBox="0 0 200 200" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="sun-body" cx="0.35" cy="0.3">
        <stop offset="0%" stopColor="#FFF4C7" />
        <stop offset="40%" stopColor="#FFD966" />
        <stop offset="100%" stopColor="#F59E0B" />
      </radialGradient>
      <radialGradient id="sun-glow" cx="0.5" cy="0.5">
        <stop offset="0%" stopColor="#FFEAA0" stopOpacity="0.8" />
        <stop offset="100%" stopColor="#FFEAA0" stopOpacity="0" />
      </radialGradient>
      <filter id="sun-shadow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="4" />
      </filter>
    </defs>
    {/* Rays */}
    <g opacity="0.85">
      {Array.from({ length: 8 }).map((_, i) => {
        const angle = (i * 45 * Math.PI) / 180;
        const x1 = 100 + Math.cos(angle) * 72;
        const y1 = 100 + Math.sin(angle) * 72;
        const x2 = 100 + Math.cos(angle) * 92;
        const y2 = 100 + Math.sin(angle) * 92;
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#F59E0B"
            strokeWidth="8"
            strokeLinecap="round"
          />
        );
      })}
    </g>
    {/* Glow */}
    <circle cx="100" cy="100" r="80" fill="url(#sun-glow)" />
    {/* Back shadow */}
    <ellipse
      cx="108"
      cy="108"
      rx="56"
      ry="56"
      fill="#D97706"
      opacity="0.3"
      filter="url(#sun-shadow)"
    />
    {/* Sun body */}
    <circle cx="100" cy="100" r="52" fill="url(#sun-body)" />
    {/* Highlight specular */}
    <ellipse cx="82" cy="82" rx="18" ry="12" fill="#FFF9E6" opacity="0.7" />
  </svg>
);

const MoonArt = ({ size }: { size: number }) => (
  <svg viewBox="0 0 200 200" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="moon-body" cx="0.35" cy="0.35">
        <stop offset="0%" stopColor="#FFF8E7" />
        <stop offset="50%" stopColor="#F5E6A8" />
        <stop offset="100%" stopColor="#C9A96E" />
      </radialGradient>
    </defs>
    {/* Stelle */}
    <g fill="#FFF4C7" opacity="0.8">
      <circle cx="30" cy="40" r="2.5" />
      <circle cx="160" cy="30" r="2" />
      <circle cx="170" cy="90" r="2.8" />
      <circle cx="25" cy="120" r="2" />
      <circle cx="40" cy="170" r="2.3" />
    </g>
    {/* Ombra dietro */}
    <circle cx="108" cy="108" r="62" fill="#8B7355" opacity="0.25" />
    {/* Corpo luna */}
    <circle cx="100" cy="100" r="58" fill="url(#moon-body)" />
    {/* Crateri */}
    <circle cx="120" cy="85" r="8" fill="#C9A96E" opacity="0.5" />
    <circle cx="82" cy="118" r="6" fill="#C9A96E" opacity="0.5" />
    <circle cx="130" cy="125" r="4" fill="#C9A96E" opacity="0.4" />
    {/* Highlight */}
    <ellipse cx="80" cy="80" rx="20" ry="14" fill="#FFFBEE" opacity="0.6" />
  </svg>
);

const CloudBody = ({ id, colorA, colorB }: { id: string; colorA: string; colorB: string }) => (
  <>
    <defs>
      <radialGradient id={`${id}-grad`} cx="0.35" cy="0.3">
        <stop offset="0%" stopColor={colorA} />
        <stop offset="100%" stopColor={colorB} />
      </radialGradient>
    </defs>
    {/* Shadow below */}
    <ellipse cx="108" cy="130" rx="80" ry="14" fill="#000" opacity="0.15" />
    {/* Cloud puffs */}
    <circle cx="70" cy="110" r="32" fill={`url(#${id}-grad)`} />
    <circle cx="110" cy="92" r="42" fill={`url(#${id}-grad)`} />
    <circle cx="145" cy="108" r="30" fill={`url(#${id}-grad)`} />
    <ellipse cx="105" cy="125" rx="58" ry="20" fill={`url(#${id}-grad)`} />
    {/* Highlight */}
    <ellipse cx="95" cy="80" rx="22" ry="10" fill="#FFFFFF" opacity="0.6" />
  </>
);

const CloudyArt = ({ size }: { size: number }) => (
  <svg viewBox="0 0 200 200" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
    <CloudBody id="cloudy" colorA="#FFFFFF" colorB="#D6DEE5" />
  </svg>
);

const PartlyCloudyArt = ({ size }: { size: number }) => (
  <svg viewBox="0 0 200 200" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="pc-sun" cx="0.35" cy="0.3">
        <stop offset="0%" stopColor="#FFF4C7" />
        <stop offset="100%" stopColor="#F59E0B" />
      </radialGradient>
      <radialGradient id="pc-cloud" cx="0.35" cy="0.3">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="100%" stopColor="#DCE3EB" />
      </radialGradient>
    </defs>
    {/* Sole dietro */}
    <circle cx="65" cy="65" r="34" fill="url(#pc-sun)" />
    <ellipse cx="55" cy="55" rx="12" ry="8" fill="#FFF9E6" opacity="0.7" />
    {/* Cloud shadow */}
    <ellipse cx="120" cy="140" rx="68" ry="12" fill="#000" opacity="0.15" />
    {/* Cloud puffs davanti */}
    <circle cx="85" cy="120" r="28" fill="url(#pc-cloud)" />
    <circle cx="125" cy="105" r="36" fill="url(#pc-cloud)" />
    <circle cx="155" cy="120" r="26" fill="url(#pc-cloud)" />
    <ellipse cx="120" cy="133" rx="48" ry="17" fill="url(#pc-cloud)" />
    <ellipse cx="110" cy="95" rx="18" ry="8" fill="#FFFFFF" opacity="0.7" />
  </svg>
);

const RainArt = ({ size }: { size: number }) => (
  <svg viewBox="0 0 200 200" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
    <CloudBody id="rain" colorA="#E8EEF4" colorB="#8FA3B8" />
    {/* Drops */}
    <g>
      {[
        { x: 70, y: 150, delay: "0s" },
        { x: 95, y: 160, delay: "0.3s" },
        { x: 120, y: 150, delay: "0.6s" },
        { x: 145, y: 158, delay: "0.2s" },
      ].map((d, i) => (
        <g key={i}>
          <path
            d={`M ${d.x} ${d.y} Q ${d.x + 4} ${d.y + 10} ${d.x} ${d.y + 16} Q ${d.x - 4} ${d.y + 10} ${d.x} ${d.y}`}
            fill="#5B9BD5"
          />
          <ellipse cx={d.x - 1} cy={d.y + 4} rx="1.2" ry="2.5" fill="#B8D4EC" opacity="0.8" />
        </g>
      ))}
    </g>
  </svg>
);

const SnowArt = ({ size }: { size: number }) => (
  <svg viewBox="0 0 200 200" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
    <CloudBody id="snow" colorA="#FFFFFF" colorB="#D4DCE6" />
    {/* Snowflakes */}
    <g fill="#FFFFFF" stroke="#A3B5C8" strokeWidth="1">
      {[
        [70, 155],
        [100, 165],
        [130, 155],
        [155, 165],
      ].map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <circle r="4" />
          <line x1="-6" y1="0" x2="6" y2="0" strokeLinecap="round" />
          <line x1="0" y1="-6" x2="0" y2="6" strokeLinecap="round" />
          <line x1="-4" y1="-4" x2="4" y2="4" strokeLinecap="round" />
          <line x1="-4" y1="4" x2="4" y2="-4" strokeLinecap="round" />
        </g>
      ))}
    </g>
  </svg>
);

const ThunderstormArt = ({ size }: { size: number }) => (
  <svg viewBox="0 0 200 200" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
    <CloudBody id="thunder" colorA="#8A95A3" colorB="#3F4A5C" />
    {/* Bolt */}
    <path
      d="M 105 130 L 85 175 L 102 175 L 92 200 L 130 155 L 110 155 L 120 130 Z"
      fill="#FFD600"
      stroke="#F59E0B"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path
      d="M 108 135 L 95 165 L 105 165 L 100 185"
      stroke="#FFF4A0"
      strokeWidth="3"
      fill="none"
      strokeLinecap="round"
    />
  </svg>
);

const FogArt = ({ size }: { size: number }) => (
  <svg viewBox="0 0 200 200" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="fog-band" x1="0" x2="1">
        <stop offset="0%" stopColor="#E8EEF4" stopOpacity="0.3" />
        <stop offset="50%" stopColor="#D4DCE6" stopOpacity="1" />
        <stop offset="100%" stopColor="#E8EEF4" stopOpacity="0.3" />
      </linearGradient>
    </defs>
    {/* Sun ghosted */}
    <circle cx="100" cy="90" r="38" fill="#F5E6A8" opacity="0.4" />
    {/* Fog bands */}
    <rect x="20" y="80" width="160" height="10" rx="5" fill="url(#fog-band)" />
    <rect x="10" y="105" width="180" height="12" rx="6" fill="url(#fog-band)" />
    <rect x="25" y="130" width="150" height="10" rx="5" fill="url(#fog-band)" />
    <rect x="15" y="150" width="170" height="11" rx="5.5" fill="url(#fog-band)" />
  </svg>
);

const MAP: Record<WeatherIconKey, React.FC<{ size: number }>> = {
  "clear-day": SunArt,
  "clear-night": MoonArt,
  cloudy: CloudyArt,
  "partly-cloudy": PartlyCloudyArt,
  rain: RainArt,
  snow: SnowArt,
  thunderstorm: ThunderstormArt,
  fog: FogArt,
};

export function WeatherArt({ iconKey, size = 160, className }: WeatherArtProps) {
  const Component = MAP[iconKey] ?? CloudyArt;
  return (
    <div className={className} style={{ width: size, height: size }}>
      <Component size={size} />
    </div>
  );
}
