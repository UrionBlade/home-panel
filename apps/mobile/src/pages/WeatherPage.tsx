import type { DailyForecast, WeatherAlert } from "@home-panel/shared";
import { ArrowUpIcon, DropIcon, ThermometerIcon, WindIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { WeatherArt } from "../components/illustrations/WeatherArt";
import { PageContainer } from "../components/layout/PageContainer";
import { PageHeader } from "../components/layout/PageHeader";
import { WeatherIcon } from "../components/weather/WeatherIcon";
import { useWeatherForecast } from "../lib/hooks/useWeather";
import { useT } from "../lib/useT";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AlertBanner({ alert }: { alert: WeatherAlert }) {
  const bgMap = {
    info: "bg-surface border-accent/30 text-text",
    warning: "bg-surface-warm border-warning/50 text-text",
    severe: "bg-surface-warm border-danger/50 text-text",
  };
  const labelMap = {
    info: "Avviso",
    warning: "Allerta",
    severe: "Allerta grave",
  };

  return (
    <div className={`flex flex-col gap-1 px-5 py-4 rounded-lg border ${bgMap[alert.severity]}`}>
      <span className="text-sm font-semibold uppercase tracking-wider">
        {labelMap[alert.severity]}
      </span>
      <p className="text-sm font-medium">{alert.title}</p>
      {alert.description && <p className="text-sm opacity-80">{alert.description}</p>}
      {alert.validUntil && (
        <p className="text-xs opacity-60 mt-1">Valido fino a {formatDate(alert.validUntil)}</p>
      )}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-surface rounded-md border border-border">
      <span className="text-accent shrink-0">{icon}</span>
      <div className="flex flex-col">
        <span className="text-xs text-text-muted uppercase tracking-wider">{label}</span>
        <span className="text-sm font-medium">{value}</span>
      </div>
    </div>
  );
}

function ForecastCard({ day }: { day: DailyForecast }) {
  return (
    <div className="flex items-center gap-4 px-5 py-4 bg-surface rounded-md border border-border">
      <div className="flex flex-col items-center gap-1 w-16 shrink-0">
        <span className="text-sm font-medium capitalize">{day.dayLabel}</span>
        <WeatherIcon iconKey={day.iconKey} size={28} />
      </div>
      <div className="flex-1 flex flex-col gap-0.5">
        <span className="text-sm">{day.condition}</span>
        <div className="flex items-center gap-3 text-xs text-text-muted">
          <span>
            <DropIcon size={12} weight="fill" className="inline mr-0.5" />
            {day.precipitationProbability}%
          </span>
          <span>
            <WindIcon size={12} weight="fill" className="inline mr-0.5" />
            {Math.round(day.windSpeedMax)} km/h
          </span>
        </div>
      </div>
      <div className="flex items-baseline gap-2 text-right shrink-0">
        <span className="text-lg font-semibold tabular-nums">
          {Math.round(day.temperatureMax)}°
        </span>
        <span className="text-sm text-text-muted tabular-nums">
          {Math.round(day.temperatureMin)}°
        </span>
      </div>
    </div>
  );
}

export function WeatherPage() {
  const { t } = useT("weather");
  const { t: tCommon } = useT("common");
  const queryClient = useQueryClient();
  const { data, isError, isLoading } = useWeatherForecast(undefined, 7);

  if (isLoading) {
    return (
      <PageContainer>
        <p className="text-text-muted">{tCommon("states.loading")}</p>
      </PageContainer>
    );
  }

  if (isError || !data) {
    return (
      <PageContainer>
        <PageHeader title={t("title")} subtitle={t("empty.title")} />
        <p className="text-text-muted">{t("empty.body")}</p>
      </PageContainer>
    );
  }

  const { current, daily } = data;

  const handleRefresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["weather"] });
  };

  return (
    <PageContainer maxWidth="wide">
      <PageHeader
        title={current.locationLabel}
        subtitle={t("subtitle")}
        artwork={<WeatherArt iconKey={current.iconKey} size={96} />}
      />

      {current.alerts.length > 0 && (
        <div className="flex flex-col gap-3">
          {current.alerts.map((alert, i) => (
            <AlertBanner key={`${alert.title}-${i}`} alert={alert} />
          ))}
        </div>
      )}

      {/* Current conditions */}
      <section className="flex flex-col gap-5">
        <h2 className="text-lg font-semibold uppercase tracking-wider text-text-muted">
          {t("now")}
        </h2>

        <div className="flex items-center gap-6">
          <WeatherIcon iconKey={current.iconKey} size={72} className="text-accent" />
          <div className="flex flex-col">
            <span className="font-display text-7xl tabular-nums leading-none">
              {Math.round(current.temperature)}°
            </span>
            <span className="text-lg text-text-muted mt-1">{current.condition}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <MetricCard
            icon={<ThermometerIcon size={20} weight="duotone" />}
            label={t("metrics.feelsLike")}
            value={`${Math.round(current.feelsLike)}°`}
          />
          <MetricCard
            icon={<DropIcon size={20} weight="duotone" />}
            label={t("metrics.humidity")}
            value={`${current.humidity}%`}
          />
          <MetricCard
            icon={<WindIcon size={20} weight="duotone" />}
            label={t("metrics.wind")}
            value={`${Math.round(current.windSpeed)} km/h`}
          />
          <MetricCard
            icon={
              <span
                className="inline-flex"
                style={{
                  transform: `rotate(${current.windDirection}deg)`,
                }}
              >
                <ArrowUpIcon size={20} weight="bold" />
              </span>
            }
            label={t("metrics.windDirection")}
            value={`${current.windDirection}°`}
          />
          <MetricCard
            icon={<span className="text-sm font-bold text-accent">hPa</span>}
            label="Pressione"
            value={`${Math.round(current.pressure)} hPa`}
          />
          <MetricCard
            icon={<DropIcon size={20} weight="duotone" />}
            label="Precipitazioni"
            value={`${current.precipitation} mm`}
          />
        </div>
      </section>

      {/* Next 7 days */}
      {daily.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold uppercase tracking-wider text-text-muted">
            Prossimi 7 giorni
          </h2>
          <div className="flex flex-col gap-2">
            {daily.map((day) => (
              <ForecastCard key={day.date} day={day} />
            ))}
          </div>
        </section>
      )}

      <footer className="flex items-center justify-between pt-4 border-t border-border">
        <span className="text-sm text-text-muted">
          Ultimo aggiornamento: {formatDate(current.fetchedAt)}
        </span>
        <button
          type="button"
          onClick={handleRefresh}
          className="px-5 py-2.5 text-sm font-medium rounded-md bg-surface-raised border border-border hover:bg-surface transition-colors cursor-pointer min-h-[2.75rem]"
        >
          Aggiorna
        </button>
      </footer>
    </PageContainer>
  );
}
