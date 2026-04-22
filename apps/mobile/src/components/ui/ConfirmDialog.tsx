import { useT } from "../../lib/useT";
import { Button } from "./Button";
import { Modal } from "./Modal";

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  /** Label for the confirm button. Defaults to `common.actions.confirm`. */
  confirmLabel?: string;
  /** Label for the cancel button. Defaults to `common.actions.cancel`. */
  cancelLabel?: string;
  /** When true, the confirm button renders in a danger style. */
  destructive?: boolean;
  /** When true, the confirm button renders a spinner. */
  isLoading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Drop-in replacement for `window.confirm`. Native `confirm()` is silently
 * suppressed by iOS WKWebView (Tauri), leaving destructive actions with no
 * visible feedback. This dialog uses the same `Modal` primitive as the rest
 * of the app so it renders reliably everywhere.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive,
  isLoading,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const { t } = useT("common");
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isLoading}>
            {cancelLabel ?? t("actions.cancel")}
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            isLoading={isLoading}
            className={destructive ? "bg-danger hover:bg-danger/80" : undefined}
          >
            {confirmLabel ?? t("actions.confirm")}
          </Button>
        </>
      }
    >
      <p className="text-text-muted">{message}</p>
    </Modal>
  );
}
