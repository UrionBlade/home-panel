/**
 * Family member: persona o animale della famiglia.
 * Single-table polymorphic discriminated union su `kind`.
 */

export type FamilyMemberKind = "human" | "pet";

interface FamilyMemberBase {
  id: string;
  kind: FamilyMemberKind;
  displayName: string;
  avatarUrl: string | null;
  accentColor: string | null;
  birthDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Person extends FamilyMemberBase {
  kind: "human";
  role: string | null;
  // pet fields are null for humans
  species: null;
  breed: null;
  weightKg: null;
  veterinaryNotes: null;
}

export interface Pet extends FamilyMemberBase {
  kind: "pet";
  // human fields are null for pets
  role: null;
  species: string | null;
  breed: string | null;
  weightKg: number | null;
  veterinaryNotes: string | null;
}

export type FamilyMember = Person | Pet;

export interface CreatePersonInput {
  kind: "human";
  displayName: string;
  avatarUrl?: string | null;
  accentColor?: string | null;
  birthDate?: string | null;
  role?: string | null;
}

export interface CreatePetInput {
  kind: "pet";
  displayName: string;
  avatarUrl?: string | null;
  accentColor?: string | null;
  birthDate?: string | null;
  species?: string | null;
  breed?: string | null;
  weightKg?: number | null;
  veterinaryNotes?: string | null;
}

export type CreateFamilyMemberInput = CreatePersonInput | CreatePetInput;

/**
 * Update payload "loose": tutti i campi sono opzionali e nullable.
 * Il backend ignora i campi non pertinenti al `kind` esistente.
 * Il `kind` non si può cambiare via update.
 */
export interface UpdateFamilyMemberInput {
  displayName?: string;
  avatarUrl?: string | null;
  accentColor?: string | null;
  birthDate?: string | null;
  role?: string | null;
  species?: string | null;
  breed?: string | null;
  weightKg?: number | null;
  veterinaryNotes?: string | null;
}
