import type { WeatherIconKey } from "@home-panel/shared";
import {
  CloudFogIcon,
  CloudIcon,
  CloudLightningIcon,
  CloudRainIcon,
  CloudSnowIcon,
  type Icon,
  MoonIcon,
  SunIcon,
} from "@phosphor-icons/react";

const ICON_MAP: Record<WeatherIconKey, Icon> = {
  "clear-day": SunIcon,
  "clear-night": MoonIcon,
  cloudy: CloudIcon,
  "partly-cloudy": CloudIcon,
  rain: CloudRainIcon,
  snow: CloudSnowIcon,
  thunderstorm: CloudLightningIcon,
  fog: CloudFogIcon,
};

interface WeatherIconProps {
  iconKey: WeatherIconKey;
  size?: number;
  className?: string;
}

export function WeatherIcon({ iconKey, size = 48, className }: WeatherIconProps) {
  const Component = ICON_MAP[iconKey] ?? CloudIcon;
  return <Component size={size} weight="duotone" className={className} />;
}
