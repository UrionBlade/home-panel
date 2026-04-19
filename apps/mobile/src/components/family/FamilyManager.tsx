import type { FamilyMember } from "@home-panel/shared";
import { PencilIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import {
  useCreateFamilyMember,
  useDeleteFamilyMember,
  useFamilyMembers,
  useUpdateFamilyMember,
} from "../../lib/hooks/useFamily";
import { useT } from "../../lib/useT";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { Modal } from "../ui/Modal";
import { MemberForm } from "./MemberForm";

export function FamilyManager() {
  const { t } = useT("family");
  const { t: tCommon } = useT("common");
  const { data: members = [], isLoading, error } = useFamilyMembers();
  const createMutation = useCreateFamilyMember();
  const updateMutation = useUpdateFamilyMember();
  const deleteMutation = useDeleteFamilyMember();

  const [editing, setEditing] = useState<FamilyMember | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<FamilyMember | null>(null);

  const closeAll = () => {
    setEditing(null);
    setCreating(false);
    setDeleting(null);
  };

  return (
    <section className="flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-3xl">{t("title")}</h2>
          <p className="text-text-muted">{t("subtitle")}</p>
        </div>
        <Button iconLeft={<PlusIcon size={20} weight="bold" />} onClick={() => setCreating(true)}>
          {t("actions.addHuman")}
        </Button>
      </header>

      {isLoading && <p className="text-text-muted">{tCommon("states.loading")}</p>}
      {error && <p className="text-danger">{(error as Error).message}</p>}
      {!isLoading && members.length === 0 && (
        <div className="rounded-lg border border-border p-8 text-center">
          <p className="font-display text-2xl">{t("empty.title")}</p>
          <p className="text-text-muted mt-2">{t("empty.body")}</p>
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {members.map((member) => (
          <li
            key={member.id}
            className="flex items-center gap-4 p-4 rounded-md bg-surface border border-border"
          >
            <Avatar
              name={member.displayName}
              imageUrl={member.avatarUrl}
              accentColor={member.accentColor}
              size="md"
            />
            <div className="flex-1 min-w-0">
              <p className="font-display text-xl truncate">{member.displayName}</p>
              <p className="text-text-muted text-sm">
                {member.kind === "human"
                  ? `${t("kindLabel.human")}${member.role ? ` · ${member.role}` : ""}`
                  : `${t("kindLabel.pet")}${member.species ? ` · ${member.species}` : ""}`}
              </p>
            </div>
            <IconButton
              icon={<PencilIcon size={20} weight="duotone" />}
              label={t("actions.edit")}
              onClick={() => setEditing(member)}
            />
            <IconButton
              icon={<TrashIcon size={20} weight="duotone" />}
              label={t("actions.delete")}
              onClick={() => setDeleting(member)}
            />
          </li>
        ))}
      </ul>

      <Modal open={creating} onClose={closeAll} title={t("actions.addHuman")}>
        <MemberForm
          onCancel={closeAll}
          isSubmitting={createMutation.isPending}
          onSubmit={(input) => createMutation.mutate(input, { onSuccess: closeAll })}
        />
      </Modal>

      <Modal open={!!editing} onClose={closeAll} title={t("actions.edit")}>
        {editing && (
          <MemberForm
            initial={editing}
            onCancel={closeAll}
            isSubmitting={updateMutation.isPending}
            onSubmit={(input) => {
              const { kind: _kind, ...rest } = input;
              updateMutation.mutate({ id: editing.id, input: rest }, { onSuccess: closeAll });
            }}
          />
        )}
      </Modal>

      <Modal
        open={!!deleting}
        onClose={closeAll}
        title={t("actions.delete")}
        footer={
          <>
            <Button variant="ghost" onClick={closeAll}>
              {tCommon("actions.cancel")}
            </Button>
            <Button
              isLoading={deleteMutation.isPending}
              onClick={() => {
                if (deleting) {
                  deleteMutation.mutate(deleting.id, { onSuccess: closeAll });
                }
              }}
            >
              {tCommon("actions.delete")}
            </Button>
          </>
        }
      >
        <p>{t("confirm.delete", { name: deleting?.displayName ?? "" })}</p>
      </Modal>
    </section>
  );
}
