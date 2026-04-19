/**
 * Post-it board — tipi condivisi tra mobile e api.
 * Bacheca con note adesive trascinabili.
 */

export const POSTIT_COLORS = ["amber", "terracotta", "sage", "sand", "mauve", "ochre"] as const;
export type PostitColor = (typeof POSTIT_COLORS)[number];

export interface Postit {
  id: string;
  title: string | null;
  body: string | null;
  color: PostitColor;
  posX: number;
  posY: number;
  rotation: number;
  zIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePostitInput {
  title?: string | null;
  body?: string | null;
  color?: PostitColor;
}

export interface UpdatePostitInput {
  title?: string | null;
  body?: string | null;
  color?: PostitColor;
  posX?: number;
  posY?: number;
}
