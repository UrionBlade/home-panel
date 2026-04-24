import {
  ArmchairIcon,
  CalendarBlankIcon,
  CookingPotIcon,
  GearSixIcon,
  HouseLineIcon,
  type Icon,
  LightningIcon,
  MusicNoteIcon,
  NoteIcon,
  ShoppingCartIcon,
  TimerIcon,
  XIcon,
} from "@phosphor-icons/react";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { NavLink } from "react-router-dom";
import { useT } from "../../lib/useT";

interface NavEntry {
  to: string;
  labelKey: `tabs.${string}`;
  Icon: Icon;
}

/* Navigation is place-first: Casa (the map of the house) sits right
 * after Home and is where every device lives. Device-type pages
 * (/lights, /cameras, /laundry) remain reachable as deep links and
 * through Settings, but are removed from the main sidebar — their
 * controls are now available inline from each device tile's sheet. */
const ENTRIES: NavEntry[] = [
  { to: "/", labelKey: "tabs.home", Icon: HouseLineIcon },
  { to: "/casa", labelKey: "tabs.casa", Icon: ArmchairIcon },
  { to: "/calendar", labelKey: "tabs.calendar", Icon: CalendarBlankIcon },
  { to: "/shopping", labelKey: "tabs.shopping", Icon: ShoppingCartIcon },
  { to: "/recipes", labelKey: "tabs.recipes", Icon: CookingPotIcon },
  { to: "/music", labelKey: "tabs.music", Icon: MusicNoteIcon },
  { to: "/board", labelKey: "tabs.board", Icon: NoteIcon },
  { to: "/timers", labelKey: "tabs.timers", Icon: TimerIcon },
  { to: "/routines", labelKey: "tabs.routines", Icon: LightningIcon },
  { to: "/settings", labelKey: "tabs.settings", Icon: GearSixIcon },
];

interface SideNavProps {
  /** Controls the mobile drawer visibility (< md breakpoint). */
  isMobileOpen: boolean;
  onMobileClose: () => void;
}

/**
 * Responsive main navigation.
 *
 * - Below md (< 768px): hidden; opened as a slide-in drawer via the
 *   header's burger button. Dismissed on backdrop click, Escape, or route
 *   change.
 * - md → lg (768-1024px): compact icon-only sidebar (88px).
 * - lg and up (≥ 1024px): expanded with labels (224px).
 */
export function SideNav({ isMobileOpen, onMobileClose }: SideNavProps) {
  const { t } = useT("common");

  /* Global Escape to close. */
  useEffect(() => {
    if (!isMobileOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onMobileClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isMobileOpen, onMobileClose]);

  return (
    <>
      {/* Desktop / tablet: inline sidebar */}
      <nav
        aria-label={t("aria.mainNav")}
        className="hidden md:flex flex-col gap-1.5 py-6 border-r border-border/60 bg-surface w-[5.5rem] lg:w-[14rem] px-2 lg:px-3 shrink-0"
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

      {/* Mobile: slide-in drawer + backdrop */}
      <AnimatePresence>
        {isMobileOpen && (
          <div className="md:hidden">
            <motion.button
              type="button"
              aria-label={t("aria.closeNav")}
              onClick={onMobileClose}
              className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            />
            <motion.nav
              aria-label={t("aria.mainNav")}
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.22, ease: [0.2, 0, 0, 1] }}
              className="fixed top-0 bottom-0 left-0 z-40 w-[17rem] max-w-[80vw] bg-surface border-r border-border flex flex-col gap-1.5 py-6 px-3 overflow-y-auto"
            >
              <div className="flex justify-end pb-2">
                <button
                  type="button"
                  onClick={onMobileClose}
                  aria-label={t("aria.closeNav")}
                  className="p-2 -mr-1 rounded-md text-text-muted hover:text-text hover:bg-surface-warm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <XIcon size={22} weight="bold" />
                </button>
              </div>
              {ENTRIES.map(({ to, labelKey, Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  onClick={onMobileClose}
                  className={({ isActive }) =>
                    clsx(
                      "flex items-center gap-3 px-4 py-3 rounded-md min-h-[3.25rem] font-medium transition-[background-color,color] duration-200",
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
                      <span className="truncate">{t(labelKey as never)}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </motion.nav>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
