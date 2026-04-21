import type { Postit } from "@home-panel/shared";
import { useRef } from "react";
import { PostitDraggable } from "./PostitDraggable";

interface BoardCanvasProps {
  postits: Postit[];
  onSelectPostit: (postit: Postit) => void;
}

export function BoardCanvas({ postits, onSelectPostit }: BoardCanvasProps) {
  const constraintsRef = useRef<HTMLDivElement>(null);

  /*
   * Corkboard affordance: two soft radial glows + a sparse warm dot grid.
   * Very low-contrast — signals "pinned notes" without turning the canvas
   * into a stock photo of a cork surface.
   */
  const corkBackground =
    "radial-gradient(ellipse 80% 60% at 15% 10%, color-mix(in oklch, var(--color-accent) 6%, transparent) 0%, transparent 60%)," +
    "radial-gradient(ellipse 60% 50% at 85% 90%, color-mix(in oklch, var(--tile-ochre-b) 10%, transparent) 0%, transparent 70%)," +
    "radial-gradient(circle at 1px 1px, color-mix(in oklch, var(--color-text) 8%, transparent) 1px, transparent 1px)";

  return (
    <div
      ref={constraintsRef}
      className="relative w-full h-full overflow-hidden bg-surface"
      style={{
        touchAction: "none",
        backgroundImage: corkBackground,
        backgroundSize: "auto, auto, 28px 28px",
      }}
    >
      {postits.map((postit) => (
        <PostitDraggable
          key={postit.id}
          postit={postit}
          constraintsRef={constraintsRef}
          onTap={onSelectPostit}
        />
      ))}
    </div>
  );
}
