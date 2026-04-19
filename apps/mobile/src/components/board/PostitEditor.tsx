import type { Postit, PostitColor } from "@home-panel/shared";
import { useState } from "react";
import { useDeletePostit, useUpdatePostit } from "../../lib/hooks/usePostits";
import { useT } from "../../lib/useT";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { ColorPicker } from "./ColorPicker";

interface PostitEditorProps {
  postit: Postit;
  open: boolean;
  onClose: () => void;
}

export function PostitEditor({ postit, open, onClose }: PostitEditorProps) {
  const { t } = useT("board");
  const updateMutation = useUpdatePostit();
  const deleteMutation = useDeletePostit();

  const [title, setTitle] = useState(postit.title ?? "");
  const [body, setBody] = useState(postit.body ?? "");
  const [color, setColor] = useState<PostitColor>(postit.color);

  function handleSave() {
    updateMutation.mutate(
      {
        id: postit.id,
        input: {
          title: title.trim() || null,
          body: body.trim() || null,
          color,
        },
      },
      { onSuccess: onClose },
    );
  }

  function handleDelete() {
    if (!window.confirm(t("confirm.delete"))) return;
    deleteMutation.mutate(postit.id, { onSuccess: onClose });
  }

  const isValid = title.trim().length > 0 || body.trim().length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("actions.edit")}
      footer={
        <>
          <Button variant="ghost" onClick={handleDelete}>
            {t("actions.delete")}
          </Button>
          <Button onClick={handleSave} disabled={!isValid}>
            {t("actions.done")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Input
          label={t("fields.title")}
          placeholder={t("fields.titlePlaceholder")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="flex flex-col gap-2">
          <label htmlFor="postit-body" className="text-sm font-medium text-text-muted">
            {t("fields.body")}
          </label>
          <textarea
            id="postit-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("fields.bodyPlaceholder")}
            rows={4}
            className="rounded-md bg-surface px-4 py-3 text-base text-text border border-border focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent placeholder:text-text-subtle resize-none"
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-muted">{t("fields.color")}</span>
          <ColorPicker value={color} onChange={setColor} />
        </div>
      </div>
    </Modal>
  );
}
