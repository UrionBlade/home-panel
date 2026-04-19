import { motion } from "framer-motion";
import { BoardTile } from "../components/home-tiles/BoardTile";
import { CamerasTile } from "../components/home-tiles/CamerasTile";
import { LaundryTile } from "../components/home-tiles/LaundryTile";
import { ShoppingTile } from "../components/home-tiles/ShoppingTile";
import { TimerTile } from "../components/home-tiles/TimerTile";
import { TodayEventsTile } from "../components/home-tiles/TodayEventsTile";
import { WasteTile } from "../components/home-tiles/WasteTile";
import { WeatherTile } from "../components/home-tiles/WeatherTile";
import { Clock } from "../components/layout/Clock";
import { useReducedMotion } from "../lib/motion/useReducedMotion";

/**
 * Layout mosaico iPad-first portrait 1024×1366.
 *
 * - Small (< 768px, iPhone): 1 col, tile wide
 * - Medium (≥ 768px, iPad portrait e up): 2 col
 *   - Weather: 1 col × 2 row (alta, hero)
 *   - Altre 6 tile: 1 col × 1 row ciascuna
 */
const tiles = [
  {
    key: "weather",
    Component: WeatherTile,
    span: "md:row-span-2",
  },
  { key: "events", Component: TodayEventsTile, span: "" },
  { key: "timer", Component: TimerTile, span: "" },
  { key: "shopping", Component: ShoppingTile, span: "" },
  { key: "waste", Component: WasteTile, span: "" },
  { key: "board", Component: BoardTile, span: "" },
  { key: "cameras", Component: CamerasTile, span: "" },
  { key: "laundry", Component: LaundryTile, span: "" },
];

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.065,
      delayChildren: 0.15,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring" as const,
      stiffness: 280,
      damping: 22,
      mass: 0.6,
    },
  },
};

export function HomePage() {
  const reduced = useReducedMotion();

  return (
    <div className="h-full flex flex-col overflow-auto">
      <motion.section
        initial={reduced ? false : { opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.2, 0, 0, 1] }}
        className="px-6 pt-6 pb-5 md:px-10 md:pt-10 md:pb-8"
      >
        <Clock variant="hero" />
      </motion.section>

      <motion.section
        variants={reduced ? undefined : containerVariants}
        initial="hidden"
        animate="show"
        className="
          px-6 pb-8 md:px-10 md:pb-10
          grid gap-4 md:gap-5
          grid-cols-1 md:grid-cols-2
          auto-rows-[9rem] md:auto-rows-[10rem]
        "
      >
        {tiles.map(({ key, Component, span }) => (
          <motion.div key={key} variants={reduced ? undefined : itemVariants} className={span}>
            <Component />
          </motion.div>
        ))}
      </motion.section>
    </div>
  );
}
