import { randomUUID } from "node:crypto";
import type {
  CreateFamilyMemberInput,
  FamilyMember,
  Person,
  Pet,
  UpdateFamilyMemberInput,
} from "@home-panel/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client.js";
import { type FamilyMemberRow, familyMembers } from "../db/schema.js";

/**
 * Mappatura DB row → DTO discriminato.
 * Le colonne specifiche di una variante sono `null` per l'altra.
 */
function rowToMember(row: FamilyMemberRow): FamilyMember {
  const base = {
    id: row.id,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    accentColor: row.accentColor,
    birthDate: row.birthDate,
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
  });
