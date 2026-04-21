import { useT } from "../../lib/useT";
import { Modal } from "../ui/Modal";
import { VoiceCommandsList } from "./VoiceCommandsList";

interface VoiceCommandsModalProps {
  open: boolean;
  onClose: () => void;
}

/** Full "what you can say" catalog, reachable in one tap from the header pill. */
export function VoiceCommandsModal({ open, onClose }: VoiceCommandsModalProps) {
  const { t } = useT("voice");

  return (
    <Modal open={open} onClose={onClose} title={t("commands.title")}>
      <VoiceCommandsList />
    </Modal>
  );
}
