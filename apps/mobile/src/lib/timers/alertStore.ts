/**
 * Store globale per gestire l'overlay di alert attivo (timer/sveglia).
 * Permette al voice intent "cancel" di chiudere l'overlay senza un import diretto.
 */

type DismissCallback = () => void;

let activeDismiss: DismissCallback | null = null;

export function registerActiveAlert(dismiss: DismissCallback) {
  activeDismiss = dismiss;
}

export function unregisterActiveAlert() {
  activeDismiss = null;
}

export function hasActiveAlert(): boolean {
  return activeDismiss !== null;
}

export function dismissActiveAlert(): boolean {
  if (activeDismiss) {
    activeDismiss();
    return true;
  }
  return false;
}
