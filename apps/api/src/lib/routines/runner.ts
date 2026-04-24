/**
 * Routine runner — shared between the `POST /:id/run` endpoint and the
 * time/cron scheduler.
 *
 * Executes steps sequentially (mirroring user-visible order) and collects
 * per-step outcomes. Steps run in order because home-automation sequences
 * often imply causality ("arm cameras, then turn off lights, then speak
 * goodnight"). A failed step aborts the routine unless it sets
 * `continueOnError: true`.
 *
 * When the caller opts in (`emitSse: true`), `clientActions` accumulated
 * during the run are pushed to the panel via SSE so time-based routines can
 * still speak a voice response on the kiosk. Voice-triggered runs set
 * `emitSse: false` because the voice client renders them locally.
 */

import type { RoutineRunResult, RoutineStep, RoutineStepResult } from "@home-panel/shared";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { routines } from "../../db/schema.js";
import { sseEmitter } from "../../routes/sse.js";
import { type RoutineRunContext, runStep } from "./actions.js";
import { parseSteps } from "./validation.js";

export interface RunOptions {
  emitSse?: boolean;
}

export async function runRoutineById(
  id: string,
  { emitSse = false }: RunOptions = {},
): Promise<RoutineRunResult> {
  const row = db.select().from(routines).where(eq(routines.id, id)).get();
  if (!row) throw new Error("not_found");

  const steps = parseSteps(row.steps);
  return runSteps(id, steps, emitSse, row.voiceResponse);
}

export async function runSteps(
  routineId: string,
  steps: RoutineStep[],
  emitSse: boolean,
  /** Server-side speak prepended as a synthetic first client action. Lets the
   * routine have a greeting without forcing the user to add a voice.speak
   * step by hand. */
  voiceResponse: string | null,
): Promise<RoutineRunResult> {
  const startedAt = new Date().toISOString();
  const ctx: RoutineRunContext = { clientActions: [] };
  if (voiceResponse?.trim()) {
    ctx.clientActions.push({ action: "voice.speak", text: voiceResponse.trim() });
  }

  const stepResults: RoutineStepResult[] = [];
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i] as RoutineStep;
    const result = await runStep(i, step, ctx);
    stepResults.push(result);
    if (!result.ok && step.continueOnError !== true) break;
  }

  const finishedAt = new Date().toISOString();
  const overallOk = stepResults.every((s) => s.ok);

  /* Persist last-run metadata. Error message from the first failing step, or
   * null on success. */
  const firstError = stepResults.find((s) => !s.ok);
  db.update(routines)
    .set({
      lastRunAt: finishedAt,
      lastRunStatus: overallOk ? "success" : "error",
      lastRunError: firstError?.error ?? null,
      updatedAt: finishedAt,
    })
    .where(eq(routines.id, routineId))
    .run();

  if (emitSse && ctx.clientActions.length > 0) {
    sseEmitter.emit("push", {
      event: "routine:client-actions",
      payload: { routineId, actions: ctx.clientActions },
    });
  }

  return {
    routineId,
    startedAt,
    finishedAt,
    steps: stepResults,
    clientActions: ctx.clientActions,
    overallOk,
  };
}
