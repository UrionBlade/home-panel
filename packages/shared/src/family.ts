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
  /** Number of voice samples that contributed to the speaker centroid.
   * `0` means the member has not enrolled yet. The actual embeddings are
   * never returned to the client. */
  voiceSampleCount: number;
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

// ---------- Speaker recognition ----------

/** Body of `POST /api/v1/family/:id/voice/enroll`. */
export interface VoiceEnrollInput {
  /** A 192-d ECAPA-TDNN embedding, raw float32 values. */
  embedding: number[];
}

/** Returned by both enrol and delete so the client can refresh its
 * "voice registered" badge without re-fetching the whole member list. */
export interface VoiceEnrollResponse {
  familyMemberId: string;
  voiceSampleCount: number;
}

/** Body of `POST /api/v1/family/voice/identify`. */
export interface VoiceIdentifyInput {
  embedding: number[];
}

export interface VoiceIdentifyResponse {
  /** Best-matching family member id, or `null` when no centroid passes
   * the decision threshold (treat as "unknown speaker / probably TV"). */
  familyMemberId: string | null;
  /** Cosine similarity against the winning centroid. Useful for UI
   * debugging and for the caller to decide whether the match is
   * "confident enough" beyond what the server already filters. */
  score: number;
}
