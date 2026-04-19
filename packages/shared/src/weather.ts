/**
 * Weather — tipi condivisi (Open-Meteo).
 */

export type WeatherIconKey =
  | "clear-day"
  | "clear-night"
  | "cloudy"
  | "partly-cloudy"
  | "rain"
  | "snow"
  | "thunderstorm"
  | "fog";

export interface WeatherLocation {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  isDefault: boolean;
}

export interface WeatherAlert {
  severity: "info" | "warning" | "severe";
  title: string;
  description: string;
  validUntil: string | null;
}

export interface CurrentWeather {
  locationId: string;
  locationLabel: string;
  fetchedAt: string;
  stale: boolean;
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  windDirection: number;
  pressure: number;
  precipitation: number;
  weatherCode: number;
  condition: string;
  iconKey: WeatherIconKey;
  isDay: boolean;
  sunrise: string;
  sunset: string;
  todayMax: number;
  todayMin: number;
  alerts: WeatherAlert[];
}

export interface DailyForecast {
  date: string;
  dayLabel: string;
  temperatureMax: number;
  temperatureMin: number;
  precipitationSum: number;
  precipitationProbability: number;
  weatherCode: number;
  condition: string;
  iconKey: WeatherIconKey;
  windSpeedMax: number;
  sunrise: string;
  sunset: string;
}

export interface WeatherForecastResponse {
  current: CurrentWeather;
  daily: DailyForecast[];
}

export interface VoiceWeatherResponse {
  voiceText: string;
}
