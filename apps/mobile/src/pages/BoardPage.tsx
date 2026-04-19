import type { Postit } from "@home-panel/shared";
import { useState } from "react";
import { AddPostitFAB } from "../components/board/AddPostitFAB";
import { BoardCanvas } from "../components/board/BoardCanvas";
import { EmptyBoardState } from "../components/board/EmptyBoardState";
import { PostitEditor } from "../components/board/PostitEditor";
import { useCreatePostit, usePostits } from "../lib/hooks/usePostits";

export function BoardPage() {
  const { data: postits = [] } = usePostits();
  const createMutation = useCreatePostit();
  const [selectedPostit, setSelectedPostit] = useState<Postit | null>(null);

  function handleAdd() {
    createMutation.mutate(
      { title: "Nuovo post-it" },
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

  // Find the latest version of the selected postit from the query data
  const currentPostit = selectedPostit
    ? (postits.find((p) => p.id === selectedPostit.id) ?? selectedPostit)
    : null;

  return (
    <div className="h-full relative">
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
  );
}
