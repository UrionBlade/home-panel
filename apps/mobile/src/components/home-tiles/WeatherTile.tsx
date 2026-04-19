import type { WeatherIconKey } from "@home-panel/shared";
import { useNavigate } from "react-router-dom";
import { useWeatherForecast } from "../../lib/hooks/useWeather";
import { WeatherArt } from "../illustrations/WeatherArt";
import { Tile } from "../ui/Tile";

/**
 * Tinted accent sfumato in base alla condizione meteo.
 * Sempre su base bianca/crema → testo sempre leggibile.
 */
function accentForWeather(iconKey: WeatherIconKey): string {
  switch (iconKey) {
    case "clear-day":
      return "oklch(85% 0.14 80)";
    case "clear-night":
      return "oklch(72% 0.08 260)";
    case "cloudy":
    case "partly-cloudy":
      return "oklch(82% 0.03 240)";
    case "rain":
      return "oklch(72% 0.11 240)";
    case "snow":
      return "oklch(90% 0.02 220)";
    case "thunderstorm":
      return "oklch(60% 0.1 280)";
    case "fog":
      return "oklch(82% 0.02 80)";
    default:
      return "oklch(80% 0.07 220)";
  }
}

/* ─────────────────────── Particles ─────────────────────── */

function RainParticles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {Array.from({ length: 28 }).map((_, i) => {
        const left = ((i * 3.7 + i * i * 0.5) % 110) - 5;
        const delay = (i * 0.11 + (i % 3) * 0.07) % 1.2;
        const duration = 0.5 + ((i * 0.06) % 0.35);
        const height = 8 + (i % 5) * 3;
        const opacity = 0.25 + (i % 4) * 0.1;
        return (
          <span
            key={i}
            className="absolute rounded-full"
            style={{
              left: `${left}%`,
              top: 0,
              width: "1.5px",
              height: `${height}%`,
              background: `linear-gradient(to bottom, transparent, rgba(140, 180, 220, ${opacity}))`,
              animation: `rain ${duration}s linear ${delay}s infinite`,
            }}
          />
        );
      })}
    </div>
  );
}

function SnowParticles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {Array.from({ length: 16 }).map((_, i) => {
        const left = (i * 6.4) % 100;
        const delay = (i * 0.3) % 3;
        const duration = 3.5 + ((i * 0.2) % 2);
        return (
          <span
            key={i}
            className="absolute w-1.5 h-1.5 bg-white rounded-full opacity-90 shadow"
            style={{
              left: `${left}%`,
              top: 0,
              animation: `snow ${duration}s linear ${delay}s infinite`,
            }}
          />
        );
      })}
    </div>
  );
}

function ParticleLayer({ iconKey }: { iconKey: WeatherIconKey }) {
  if (iconKey === "rain" || iconKey === "thunderstorm") return <RainParticles />;
  if (iconKey === "snow") return <SnowParticles />;
  return null;
}

/* ─────────────────────── Tile ─────────────────────── */

export function WeatherTile() {
  const navigate = useNavigate();
  const { data, isError } = useWeatherForecast(undefined, 7);

  if (isError || !data) {
    return (
      <Tile size="md" ariaLabel="Meteo">
        <div className="flex flex-col justify-between h-full gap-4">
          <span className="label-mono text-text-muted">Meteo</span>
          <p className="font-display text-7xl text-text-muted font-black">—°</p>
          <p className="text-sm text-text-subtle">Connessione in corso…</p>
        </div>
      </Tile>
    );
  }

  const { current, daily } = data;
  const accent = accentForWeather(current.iconKey);

  return (
    <Tile size="md" onClick={() => navigate("/weather")} ariaLabel="Meteo Besozzo">
      {/* Tinted background */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 85% 15%, ${accent} 0%, transparent 65%)`,
          opacity: 0.5,
        }}
      />

      <ParticleLayer iconKey={current.iconKey} />

      {/* Illustrazione 3D in alto a destra */}
      <WeatherArt
        iconKey={current.iconKey}
        size={140}
        className="absolute right-2 top-2 pointer-events-none select-none z-0"
      />

      <div className="relative flex flex-col h-full z-10">
        <header>
          <span className="label-mono text-text-muted">{current.locationLabel}</span>
        </header>

        {/* Main temp — max 55% width per non overlappare l'illustrazione */}
        <div className="flex flex-col gap-0.5 mt-4 max-w-[55%]">
          <span className="font-display text-7xl font-black tabular-nums leading-[0.82] text-text">
            {Math.round(current.temperature)}°
          </span>
          <div className="text-sm label-italic capitalize text-text-muted mt-1">
            {current.condition}
          </div>
          <div className="text-xs text-text-subtle tabular-nums font-medium">
            max {Math.round(current.todayMax)}° · min {Math.round(current.todayMin)}°
          </div>
        </div>

        {/* Forecast 4 giorni in fondo, linea orizzontale */}
        {daily.length > 1 && (
          <div className="mt-auto pt-4 flex items-end justify-between gap-2 border-t border-border/60">
            {daily.slice(1, 5).map((d) => (
              <div key={d.date} className="flex flex-col items-center gap-0.5 flex-1">
                <span className="text-[10px] capitalize text-text-muted font-semibold">
                  {d.dayLabel.slice(0, 3)}
                </span>
                <span className="font-display text-sm tabular-nums font-bold text-text">
                  {Math.round(d.temperatureMax)}°
                </span>
                <span className="text-[10px] tabular-nums text-text-subtle">
                  {Math.round(d.temperatureMin)}°
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Tile>
  );
}
