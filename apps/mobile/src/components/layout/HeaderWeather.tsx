import { useNavigate } from "react-router-dom";
import { useCurrentWeather } from "../../lib/hooks/useWeather";
import { useT } from "../../lib/useT";
import { WeatherArt } from "../illustrations/WeatherArt";

export function HeaderWeather() {
  const navigate = useNavigate();
  const { t } = useT("weather");
  const { data, isError, isLoading } = useCurrentWeather();

  const showFallback = isError || isLoading || !data;

  return (
    <button
      type="button"
      onClick={() => navigate("/weather")}
      className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-lg hover:bg-surface-warm transition-colors min-h-[3rem] cursor-pointer"
      aria-label={t("aria.openDetail")}
    >
      {showFallback ? (
        <span className="font-display text-lg font-bold text-text-muted px-2">—°</span>
      ) : (
        <>
          <WeatherArt iconKey={data.iconKey} size={44} />
          <span className="font-display text-2xl font-black tabular-nums tracking-tight">
            {Math.round(data.temperature)}°
          </span>
        </>
      )}
    </button>
  );
}
