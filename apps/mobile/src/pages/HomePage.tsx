import { motion } from "framer-motion";
import { BoardTile } from "../components/home-tiles/BoardTile";
import { CamerasTile } from "../components/home-tiles/CamerasTile";
import { ClimateTile } from "../components/home-tiles/ClimateTile";
import { LaundryTile } from "../components/home-tiles/LaundryTile";
import { LightsTile } from "../components/home-tiles/LightsTile";
import { ShoppingTile } from "../components/home-tiles/ShoppingTile";
import { TimerTile } from "../components/home-tiles/TimerTile";
import { TodayEventsTile } from "../components/home-tiles/TodayEventsTile";
import { TvTile } from "../components/home-tiles/TvTile";
import { WasteTile } from "../components/home-tiles/WasteTile";
import { WeatherTile } from "../components/home-tiles/WeatherTile";
import { Clock } from "../components/layout/Clock";
import { useReducedMotion } from "../lib/motion/useReducedMotion";

/**
 * Mosaico asimmetrico iPad landscape (6 colonne) / stack 1 col su iPhone.
 *
 * Scale della griglia: Weather 4×2 hero (largo e alto), Events/Laundry 2×1
 * accanto al meteo, resto 3×1 per respiro orizzontale. Niente 1×1 — tutte le
 * tile hanno contenuto denso che richiede almeno 2 colonne.
 *
 * DOM order = ordine dello stack mobile e ordine di flow su iPad. La priorità
 * dall'alto verso il basso è: contesto ambientale (Weather) → urgenze oggi
 * (Events, Laundry) → casa (Shopping, TV) → passivi (Cameras, Board) →
 * monitoraggio (Timer, Waste).
 */
const tiles = [
  {
    key: "weather",
    Component: WeatherTile,
    span: "md:col-span-4 md:row-span-2",
  },
  {
    key: "tv",
    Component: TvTile,
    /* TV promoted to a 2×2 square hero beside the weather, with room for the
     * full on-state controls (volume, mute, power, 4 preset apps). */
    span: "md:col-span-2 md:row-span-2",
  },
  { key: "events", Component: TodayEventsTile, span: "md:col-span-3" },
  { key: "laundry", Component: LaundryTile, span: "md:col-span-3" },
  /* Climate: 3×2 so the tile has room for power + 5-mode selector + fan
   * speeds + temperature stepper. It sits right under the 4×2 weather
   * hero so the two "environment" tiles share the top of the mosaic. */
  { key: "climate", Component: ClimateTile, span: "md:col-span-3 md:row-span-2" },
  { key: "shopping", Component: ShoppingTile, span: "md:col-span-3" },
  { key: "cameras", Component: CamerasTile, span: "md:col-span-3" },
  { key: "lights", Component: LightsTile, span: "md:col-span-3" },
  { key: "timer", Component: TimerTile, span: "md:col-span-3" },
  { key: "board", Component: BoardTile, span: "md:col-span-3" },
  { key: "waste", Component: WasteTile, span: "md:col-span-3" },
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
          grid-cols-1 md:grid-cols-6
          auto-rows-[minmax(10rem,auto)] md:auto-rows-[10rem]
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
