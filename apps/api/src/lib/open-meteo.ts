import type {
  CurrentWeather,
  DailyForecast,
  WeatherAlert,
  WeatherIconKey,
  WeatherLocation,
} from "@home-panel/shared";

const BASE = "https://api.open-meteo.com/v1/forecast";

interface OpenMeteoResponse {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    weather_code: number;
    is_day: number;
    precipitation: number;
    surface_pressure: number;
  };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weather_code: number[];
    precipitation_sum: number[];
    precipitation_probability_max: number[];
    wind_speed_10m_max: number[];
    sunrise: string[];
    sunset: string[];
  };
}

export async function fetchOpenMeteo(lat: number, lng: number): Promise<OpenMeteoResponse> {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lng.toString(),
    current:
      "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code,is_day,precipitation,surface_pressure",
    daily:
      "temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset",
    timezone: "Europe/Rome",
    forecast_days: "7",
  });
  const url = `${BASE}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo HTTP ${res.status}`);
  }
  return (await res.json()) as OpenMeteoResponse;
}

const DAY_LABELS = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];

/**
 * Mapping WMO codes → italiano + iconKey.
 * https://open-meteo.com/en/docs#weather_variable_documentation
 */
function describeCode(
  code: number,
  isDay: boolean,
): { condition: string; iconKey: WeatherIconKey } {
  // Clear
  if (code === 0)
    return {
      condition: isDay ? "Soleggiato" : "Sereno",
      iconKey: isDay ? "clear-day" : "clear-night",
    };
  if (code === 1 || code === 2)
    return {
      condition: "Parzialmente nuvoloso",
      iconKey: "partly-cloudy",
    };
  if (code === 3) return { condition: "Nuvoloso", iconKey: "cloudy" };
  if (code === 45 || code === 48) return { condition: "Nebbia", iconKey: "fog" };
  if ([51, 53, 55, 56, 57].includes(code)) return { condition: "Pioggia leggera", iconKey: "rain" };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code))
    return { condition: "Pioggia", iconKey: "rain" };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { condition: "Neve", iconKey: "snow" };
  if ([95, 96, 99].includes(code)) return { condition: "Temporale", iconKey: "thunderstorm" };
  return { condition: "Variabile", iconKey: "cloudy" };
}

function deriveAlerts(
  current: OpenMeteoResponse["current"],
  daily: OpenMeteoResponse["daily"],
): WeatherAlert[] {
  const alerts: WeatherAlert[] = [];
  if (current.wind_speed_10m > 50) {
    alerts.push({
      severity: "warning",
      title: "Vento forte",
      description: `Raffiche fino a ${Math.round(current.wind_speed_10m)} km/h`,
      validUntil: null,
    });
  }
  const todayPrecip = daily.precipitation_sum[0] ?? 0;
  if (todayPrecip > 20) {
    alerts.push({
      severity: "warning",
      title: "Pioggia intensa",
      description: `Previsti ${Math.round(todayPrecip)} mm oggi`,
      validUntil: null,
    });
  }
  if (current.temperature_2m < 0) {
    alerts.push({
      severity: "info",
      title: "Gelo",
      description: "Temperature sotto lo zero",
      validUntil: null,
    });
  }
  if (current.temperature_2m > 35) {
    alerts.push({
      severity: "warning",
      title: "Caldo intenso",
      description: "Temperature oltre i 35°C",
      validUntil: null,
    });
  }
  return alerts;
}

export function normalizeOpenMeteoResponse(
  raw: OpenMeteoResponse,
  location: WeatherLocation,
  fetchedAt: Date,
): { current: CurrentWeather; daily: DailyForecast[] } {
  const isDay = raw.current.is_day === 1;
  const desc = describeCode(raw.current.weather_code, isDay);

  const current: CurrentWeather = {
    locationId: location.id,
    locationLabel: location.label,
    fetchedAt: fetchedAt.toISOString(),
    stale: false,
    temperature: raw.current.temperature_2m,
    feelsLike: raw.current.apparent_temperature,
    humidity: raw.current.relative_humidity_2m,
    windSpeed: raw.current.wind_speed_10m,
    windDirection: raw.current.wind_direction_10m,
    pressure: raw.current.surface_pressure,
    precipitation: raw.current.precipitation,
    weatherCode: raw.current.weather_code,
    condition: desc.condition,
    iconKey: desc.iconKey,
    isDay,
    sunrise: raw.daily.sunrise[0] ?? "",
    sunset: raw.daily.sunset[0] ?? "",
    todayMax: raw.daily.temperature_2m_max[0] ?? 0,
    todayMin: raw.daily.temperature_2m_min[0] ?? 0,
    alerts: deriveAlerts(raw.current, raw.daily),
  };

  const daily: DailyForecast[] = raw.daily.time.map((dateStr, i) => {
    const code = raw.daily.weather_code[i] ?? 0;
    const d = describeCode(code, true);
    const date = new Date(`${dateStr}T12:00:00`);
    return {
      date: dateStr,
      dayLabel: DAY_LABELS[date.getDay()] ?? "",
      temperatureMax: raw.daily.temperature_2m_max[i] ?? 0,
      temperatureMin: raw.daily.temperature_2m_min[i] ?? 0,
      precipitationSum: raw.daily.precipitation_sum[i] ?? 0,
      precipitationProbability: raw.daily.precipitation_probability_max[i] ?? 0,
      weatherCode: code,
      condition: d.condition,
      iconKey: d.iconKey,
      windSpeedMax: raw.daily.wind_speed_10m_max[i] ?? 0,
      sunrise: raw.daily.sunrise[i] ?? "",
      sunset: raw.daily.sunset[i] ?? "",
    };
  });

  return { current, daily };
}
