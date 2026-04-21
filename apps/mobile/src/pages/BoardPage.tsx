import type { Postit } from "@home-panel/shared";
import { useState } from "react";
import { AddPostitFAB } from "../components/board/AddPostitFAB";
import { BoardCanvas } from "../components/board/BoardCanvas";
import { EmptyBoardState } from "../components/board/EmptyBoardState";
import { PostitEditor } from "../components/board/PostitEditor";
import { PostItStackArt } from "../components/illustrations/TileArt";
import { useCreatePostit, usePostits } from "../lib/hooks/usePostits";
import { useT } from "../lib/useT";

export function BoardPage() {
  const { t } = useT("board");
  const { data: postits = [] } = usePostits();
  const createMutation = useCreatePostit();
  const [selectedPostit, setSelectedPostit] = useState<Postit | null>(null);

  function handleAdd() {
    createMutation.mutate(
      { title: t("actions.add") },
      {
        onSuccess: (created) => setSelectedPostit(created),
      },
    );
  }

  function handleSelect(postit: Postit) {
    setSelectedPostit(postit);
  }

  function handleCloseEditor() {
    setSelectedPostit(null);
  }

  /* Mirror the freshest version from the query cache (post-it colors/body edit
   * in real time while the editor is open). */
  const currentPostit = selectedPostit
    ? (postits.find((p) => p.id === selectedPostit.id) ?? selectedPostit)
    : null;

  const count = postits.length;

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 shrink-0">
        <div className="flex items-start gap-4 min-w-0">
          <div className="shrink-0">
            <PostItStackArt size={72} />
          </div>
          <div className="min-w-0 flex flex-col gap-1">
            <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-black tracking-[-0.02em] text-text leading-[0.95]">
              {t("title")}
            </h1>
            <p className="label-italic text-lg text-text-muted">{t("subtitle")}</p>
          </div>
        </div>
        {count > 0 ? (
          <span className="label-mono text-text-muted shrink-0 mt-2">
            {t("header.counter", { count })}
          </span>
        ) : null}
      </header>

      <div className="relative flex-1 min-h-0">
        {postits.length === 0 ? (
          <EmptyBoardState />
        ) : (
          <BoardCanvas postits={postits} onSelectPostit={handleSelect} />
        )}
        <AddPostitFAB onClick={handleAdd} />
        {currentPostit && (
          <PostitEditor
            key={currentPostit.id}
            postit={currentPostit}
            open={!!currentPostit}
            onClose={handleCloseEditor}
          />
        )}
      </div>
    </div>
  );
}
