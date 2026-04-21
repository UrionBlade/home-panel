import {
  CalendarBlankIcon,
  CookingPotIcon,
  GearSixIcon,
  HouseLineIcon,
  type Icon,
  MusicNoteIcon,
  NoteIcon,
  ShoppingCartIcon,
  TimerIcon,
  VideoCameraIcon,
  WashingMachineIcon,
} from "@phosphor-icons/react";
import clsx from "clsx";
import { NavLink } from "react-router-dom";
import { useT } from "../../lib/useT";

interface NavEntry {
  to: string;
  labelKey: `tabs.${string}`;
  Icon: Icon;
}

const ENTRIES: NavEntry[] = [
  { to: "/", labelKey: "tabs.home", Icon: HouseLineIcon },
  { to: "/calendar", labelKey: "tabs.calendar", Icon: CalendarBlankIcon },
  { to: "/shopping", labelKey: "tabs.shopping", Icon: ShoppingCartIcon },
  { to: "/recipes", labelKey: "tabs.recipes", Icon: CookingPotIcon },
  { to: "/music", labelKey: "tabs.music", Icon: MusicNoteIcon },
  { to: "/board", labelKey: "tabs.board", Icon: NoteIcon },
  { to: "/timers", labelKey: "tabs.timers", Icon: TimerIcon },
  { to: "/laundry", labelKey: "tabs.laundry", Icon: WashingMachineIcon },
  { to: "/cameras", labelKey: "tabs.cameras", Icon: VideoCameraIcon },
  { to: "/settings", labelKey: "tabs.settings", Icon: GearSixIcon },
];

/**
 * Sidebar adattiva.
 * - Portrait / schermi stretti (< 1280px): compact, solo icone (88px)
 * - Landscape / wide (≥ 1280px): espansa con label (14rem)
 */
export function SideNav() {
  const { t } = useT("common");

  return (
    <nav
      aria-label={t("aria.mainNav")}
      className="flex flex-col gap-1.5 py-6 border-r border-border/60 bg-surface w-[5.5rem] lg:w-[14rem] px-2 lg:px-3 shrink-0"
    >
      {ENTRIES.map(({ to, labelKey, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          title={t(labelKey as never)}
          className={({ isActive }) =>
            clsx(
              "flex items-center justify-center lg:justify-start gap-3 px-3 py-3 lg:px-4 rounded-md min-h-[3.25rem] font-medium transition-[background-color,color] duration-200",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              isActive
                ? "bg-surface-warm text-accent"
                : "text-text-muted hover:bg-surface-warm hover:text-text",
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon size={24} weight={isActive ? "fill" : "duotone"} className="shrink-0" />
              <span className="hidden lg:inline truncate">{t(labelKey as never)}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
