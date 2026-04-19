import type { Postit } from "@home-panel/shared";
import { useRef } from "react";
import { PostitDraggable } from "./PostitDraggable";

interface BoardCanvasProps {
  postits: Postit[];
  onSelectPostit: (postit: Postit) => void;
}

export function BoardCanvas({ postits, onSelectPostit }: BoardCanvasProps) {
  const constraintsRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={constraintsRef}
      className="relative w-full h-full overflow-hidden bg-surface"
      style={{ touchAction: "none" }}
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
