import type { Postit } from "@home-panel/shared";
import { type RefObject, useRef, useState } from "react";
import { useBringToFront, useUpdatePostit } from "../../lib/hooks/usePostits";
import { PostitCard } from "./PostitCard";

interface PostitDraggableProps {
  postit: Postit;
  constraintsRef: RefObject<HTMLElement | null>;
  onTap: (postit: Postit) => void;
}

export function PostitDraggable({ postit, constraintsRef, onTap }: PostitDraggableProps) {
  const updateMutation = useUpdatePostit();
  const bringToFrontMutation = useBringToFront();
  const draggingRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  function handlePointerDown(e: React.PointerEvent) {
    if (!constraintsRef.current) return;
    draggingRef.current = false;
    const rect = constraintsRef.current.getBoundingClientRect();
    startRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: postit.posX * rect.width,
      posY: postit.posY * rect.height,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (!draggingRef.current && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      draggingRef.current = true;
      setIsDragging(true);
    }
    if (draggingRef.current) {
      setOffset({ x: dx, y: dy });
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (draggingRef.current && constraintsRef.current) {
      const rect = constraintsRef.current.getBoundingClientRect();
      const newPx = startRef.current.posX + offset.x;
      const newPy = startRef.current.posY + offset.y;
      const clamp = (v: number) => Math.min(0.88, Math.max(0.02, v));
      updateMutation.mutate({
        id: postit.id,
        input: {
          posX: clamp(newPx / rect.width),
          posY: clamp(newPy / rect.height),
        },
      });
    } else {
      bringToFrontMutation.mutate(postit.id);
      onTap(postit);
    }
    setOffset({ x: 0, y: 0 });
    setIsDragging(false);
  }

  const leftPct = Math.min(88, Math.max(2, postit.posX * 100));
  const topPct = Math.min(88, Math.max(2, postit.posY * 100));

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        position: "absolute",
        left: `${leftPct}%`,
        top: `${topPct}%`,
        transform: `translate(${offset.x}px, ${offset.y}px) rotate(${postit.rotation}deg) ${isDragging ? "scale(1.05)" : ""}`,
        zIndex: isDragging ? 9999 : postit.zIndex,
        cursor: isDragging ? "grabbing" : "grab",
        touchAction: "none",
      }}
    >
      <PostitCard title={postit.title} body={postit.body} color={postit.color} />
    </div>
  );
}
