import { randomUUID } from "node:crypto";
import type {
  CreateFamilyMemberInput,
  FamilyMember,
  Person,
  Pet,
  UpdateFamilyMemberInput,
  VoiceEnrollInput,
  VoiceEnrollResponse,
  VoiceIdentifyInput,
  VoiceIdentifyResponse,
} from "@home-panel/shared";
import { eq, isNotNull } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client.js";
import { type FamilyMemberRow, familyMembers } from "../db/schema.js";

/* Speaker recognition.
 *
 * Each enrolled member stores a JSON blob shaped like
 *   { samples: number[][]; centroid: number[] }
 * — `samples` is the raw set of 192-d ECAPA-TDNN vectors received from
 * iOS, `centroid` is their mean (recomputed on every enrol/delete).
 * Identify cosine-matches the candidate vector against every member
 * centroid and accepts the best one when it clears `IDENTIFY_THRESHOLD`. */
const EMBEDDING_DIM = 192;
const MAX_SAMPLES_PER_MEMBER = 32;
const IDENTIFY_THRESHOLD = 0.55;

interface VoiceProfile {
  samples: number[][];
  centroid: number[];
}

function parseVoiceProfile(json: string | null): VoiceProfile | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Partial<VoiceProfile>;
    if (
      !parsed ||
      !Array.isArray(parsed.samples) ||
      !Array.isArray(parsed.centroid) ||
      parsed.centroid.length !== EMBEDDING_DIM
    ) {
      return null;
    }
    return { samples: parsed.samples, centroid: parsed.centroid };
  } catch {
    return null;
  }
}

function computeCentroid(samples: number[][]): number[] {
  if (samples.length === 0) return new Array(EMBEDDING_DIM).fill(0);
  const out = new Array<number>(EMBEDDING_DIM).fill(0);
  for (const s of samples) {
    for (let i = 0; i < EMBEDDING_DIM; i += 1) {
      out[i] = (out[i] ?? 0) + (s[i] ?? 0);
    }
  }
  const n = samples.length;
  for (let i = 0; i < EMBEDDING_DIM; i += 1) {
    out[i] = (out[i] ?? 0) / n;
  }
  return out;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < EMBEDDING_DIM; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom < 1e-12) return 0;
  return dot / denom;
}

function isValidEmbedding(input: unknown): input is number[] {
  return (
    Array.isArray(input) &&
    input.length === EMBEDDING_DIM &&
    input.every((v) => typeof v === "number" && Number.isFinite(v))
  );
}

/**
 * Mappatura DB row → DTO discriminato.
 * Le colonne specifiche di una variante sono `null` per l'altra.
 */
function rowToMember(row: FamilyMemberRow): FamilyMember {
  const profile = parseVoiceProfile(row.voiceEmbedding);
  const base = {
    id: row.id,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    accentColor: row.accentColor,
    birthDate: row.birthDate,
    voiceSampleCount: profile?.samples.length ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };

  if (row.kind === "human") {
    const person: Person = {
      ...base,
      kind: "human",
      role: row.role,
      species: null,
      breed: null,
      weightKg: null,
      veterinaryNotes: null,
    };
    return person;
  }

  const pet: Pet = {
    ...base,
    kind: "pet",
    role: null,
    species: row.species,
    breed: row.breed,
    weightKg: row.weightKg,
    veterinaryNotes: row.veterinaryNotes,
  };
  return pet;
}

function validateCreateInput(
  input: unknown,
): { ok: true; value: CreateFamilyMemberInput } | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Body JSON obbligatorio" };
  }
  const obj = input as Record<string, unknown>;
  if (obj.kind !== "human" && obj.kind !== "pet") {
    return { ok: false, error: "kind deve essere 'human' o 'pet'" };
  }
  if (typeof obj.displayName !== "string" || obj.displayName.trim().length === 0) {
    return { ok: false, error: "displayName è obbligatorio" };
  }
  return { ok: true, value: obj as unknown as CreateFamilyMemberInput };
}

export const familyRouter = new Hono()
  .get("/", (c) => {
    const rows = db.select().from(familyMembers).orderBy(familyMembers.createdAt).all();
    return c.json(rows.map(rowToMember));
  })
  .get("/:id", (c) => {
    const id = c.req.param("id");
    const row = db.select().from(familyMembers).where(eq(familyMembers.id, id)).get();
    if (!row) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.json(rowToMember(row));
  })
  .post("/", async (c) => {
    const body = await c.req.json().catch(() => null);
    const validated = validateCreateInput(body);
    if (!validated.ok) {
      return c.json({ error: validated.error }, 400);
    }
    const input = validated.value;
    const now = new Date().toISOString();
    const newRow: FamilyMemberRow = {
      id: randomUUID(),
      kind: input.kind,
      displayName: input.displayName.trim(),
      avatarUrl: input.avatarUrl ?? null,
      accentColor: input.accentColor ?? null,
      birthDate: input.birthDate ?? null,
      role: input.kind === "human" ? (input.role ?? null) : null,
      species: input.kind === "pet" ? (input.species ?? null) : null,
      breed: input.kind === "pet" ? (input.breed ?? null) : null,
      weightKg: input.kind === "pet" ? (input.weightKg ?? null) : null,
      veterinaryNotes: input.kind === "pet" ? (input.veterinaryNotes ?? null) : null,
      voiceEmbedding: null,
      createdAt: now,
      updatedAt: now,
    };
    db.insert(familyMembers).values(newRow).run();
    return c.json(rowToMember(newRow), 201);
  })
  .patch("/:id", async (c) => {
    const id = c.req.param("id");
    const existing = db.select().from(familyMembers).where(eq(familyMembers.id, id)).get();
    if (!existing) {
      return c.json({ error: "not_found" }, 404);
    }
    const body = (await c.req.json().catch(() => null)) as UpdateFamilyMemberInput | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "Body JSON obbligatorio" }, 400);
    }
    const updates: Partial<FamilyMemberRow> = {
      updatedAt: new Date().toISOString(),
    };
    if (body.displayName !== undefined) {
      if (body.displayName.trim().length === 0) {
        return c.json({ error: "displayName non può essere vuoto" }, 400);
      }
      updates.displayName = body.displayName.trim();
    }
    if (body.avatarUrl !== undefined) updates.avatarUrl = body.avatarUrl;
    if (body.accentColor !== undefined) updates.accentColor = body.accentColor;
    if (body.birthDate !== undefined) updates.birthDate = body.birthDate;
    if (existing.kind === "human" && "role" in body && body.role !== undefined) {
      updates.role = body.role;
    }
    if (existing.kind === "pet") {
      if ("species" in body && body.species !== undefined) updates.species = body.species;
      if ("breed" in body && body.breed !== undefined) updates.breed = body.breed;
      if ("weightKg" in body && body.weightKg !== undefined) updates.weightKg = body.weightKg;
      if ("veterinaryNotes" in body && body.veterinaryNotes !== undefined)
        updates.veterinaryNotes = body.veterinaryNotes;
    }

    db.update(familyMembers).set(updates).where(eq(familyMembers.id, id)).run();
    const updatedRow = db.select().from(familyMembers).where(eq(familyMembers.id, id)).get();
    if (!updatedRow) return c.json({ error: "not_found" }, 404);
    return c.json(rowToMember(updatedRow));
  })
  .delete("/:id", (c) => {
    const id = c.req.param("id");
    const result = db.delete(familyMembers).where(eq(familyMembers.id, id)).run();
    if (result.changes === 0) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.body(null, 204);
  })

  /* ----- Voice enrolment ----- */
  .post("/:id/voice/enroll", async (c) => {
    const id = c.req.param("id");
    const row = db.select().from(familyMembers).where(eq(familyMembers.id, id)).get();
    if (!row) return c.json({ error: "not_found" }, 404);

    const body = (await c.req.json().catch(() => null)) as VoiceEnrollInput | null;
    if (!body || !isValidEmbedding(body.embedding)) {
      return c.json(
        { error: `embedding deve essere un array di ${EMBEDDING_DIM} numeri finiti` },
        400,
      );
    }

    const existing = parseVoiceProfile(row.voiceEmbedding);
    const samples = existing ? [...existing.samples, body.embedding] : [body.embedding];
    /* Cap how many samples we keep — 32 is plenty for a stable centroid
     * and prevents the JSON blob from drifting unbounded if the user
     * insists on enrolling for ten minutes straight. */
    if (samples.length > MAX_SAMPLES_PER_MEMBER) {
      samples.splice(0, samples.length - MAX_SAMPLES_PER_MEMBER);
    }
    const profile: VoiceProfile = {
      samples,
      centroid: computeCentroid(samples),
    };

    db.update(familyMembers)
      .set({
        voiceEmbedding: JSON.stringify(profile),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(familyMembers.id, id))
      .run();

    const response: VoiceEnrollResponse = {
      familyMemberId: id,
      voiceSampleCount: samples.length,
    };
    return c.json(response);
  })

  .delete("/:id/voice/enroll", (c) => {
    const id = c.req.param("id");
    const row = db.select().from(familyMembers).where(eq(familyMembers.id, id)).get();
    if (!row) return c.json({ error: "not_found" }, 404);

    db.update(familyMembers)
      .set({
        voiceEmbedding: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(familyMembers.id, id))
      .run();

    const response: VoiceEnrollResponse = {
      familyMemberId: id,
      voiceSampleCount: 0,
    };
    return c.json(response);
  })

  /* ----- Voice identification -----
   * Stateless: client sends an embedding, server returns the best
   * matching member id (or null). The voice plugin already filters
   * obviously-bad audio with VAD so we don't second-guess a non-match
   * here — we just expose the raw cosine for caller-side debugging. */
  .post("/voice/identify", async (c) => {
    const body = (await c.req.json().catch(() => null)) as VoiceIdentifyInput | null;
    if (!body || !isValidEmbedding(body.embedding)) {
      return c.json(
        { error: `embedding deve essere un array di ${EMBEDDING_DIM} numeri finiti` },
        400,
      );
    }

    const enrolled = db
      .select()
      .from(familyMembers)
      .where(isNotNull(familyMembers.voiceEmbedding))
      .all();

    let bestId: string | null = null;
    let bestScore = -1;
    for (const row of enrolled) {
      const profile = parseVoiceProfile(row.voiceEmbedding);
      if (!profile) continue;
      const score = cosineSimilarity(body.embedding, profile.centroid);
      if (score > bestScore) {
        bestScore = score;
        bestId = row.id;
      }
    }

    const response: VoiceIdentifyResponse = {
      familyMemberId: bestScore >= IDENTIFY_THRESHOLD ? bestId : null,
      score: bestScore,
    };
    return c.json(response);
  });
