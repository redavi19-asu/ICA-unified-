import { createHash, randomUUID } from "node:crypto";
import { applicationDatabase } from "./application-database";
import { ensureUnifiedRuntimeSchema } from "./runtime-schema";
import { API_MUTATION_SCHEMA } from "./api-mutation-schema";
export class ApiProblem extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type Sql = { sql: string; values: (string | number | null)[] };
/** Mutation, idempotency receipt and webhook fan-out commit in one D1 batch. */
export async function apiMutation(input: {
  request: Request;
  organizationId: string;
  credentialId: string;
  body: unknown;
  response: Record<string, unknown>;
  statements: (guard: string, guardValues: (string | number | null)[]) => Sql[];
  events?: { type: string; data: Record<string, unknown>; condition?: Sql }[];
  eligibility?: Sql;
}) {
  const token = input.request.headers.get("idempotency-key") || "";
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(token))
    throw new ApiProblem(
      400,
      "Supply an Idempotency-Key containing 8–100 letters, digits, underscores or hyphens.",
    );
  await ensureUnifiedRuntimeSchema();
  const db = applicationDatabase();
  await db.prepare(API_MUTATION_SCHEMA).run();
  const operation = new URL(input.request.url).pathname;
  const hash = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  const tokenHash = hash(token),
    bodyHash = hash(JSON.stringify(input.body)),
    now = Date.now();
  const find = () =>
    db
      .prepare(
        "SELECT bodyHash,responseJson FROM ApiMutation WHERE organizationId=? AND credentialId=? AND operation=? AND tokenHash=? AND expiresAt>?",
      )
      .bind(input.organizationId, input.credentialId, operation, tokenHash, now)
      .first<{ bodyHash: string; responseJson: string }>();
  const replay = (row: { bodyHash: string; responseJson: string }) => {
    if (row.bodyHash !== bodyHash)
      throw new ApiProblem(
        409,
        "This Idempotency-Key was already used with different input.",
      );
    return { data: JSON.parse(row.responseJson), replayed: true };
  };
  const prior = await find();
  if (prior) return replay(prior);
  const id = randomUUID(),
    guard = "EXISTS (SELECT 1 FROM ApiMutation WHERE id=?)",
    guardValues = [id];
  const eligibility = input.eligibility || { sql: "1=1", values: [] };
  const statements = [
    db
      .prepare(
        "DELETE FROM ApiMutation WHERE expiresAt<=? AND (id IN (SELECT id FROM ApiMutation WHERE expiresAt<=? LIMIT 100) OR (organizationId=? AND credentialId=? AND operation=? AND tokenHash=?))",
      )
      .bind(
        now,
        now,
        input.organizationId,
        input.credentialId,
        operation,
        tokenHash,
      ),
    db
      .prepare(
        `INSERT INTO ApiMutation(id,organizationId,credentialId,operation,tokenHash,bodyHash,responseJson,expiresAt)
 SELECT ?,?,?,?,?,?,?,? WHERE ${eligibility.sql} AND EXISTS (SELECT 1 FROM ApiCredential c JOIN ApiCredentialPolicy p ON p.credentialId=c.id WHERE c.id=? AND c.organizationId=? AND c.active=1 AND p.expiresAt>?) ON CONFLICT(organizationId,credentialId,operation,tokenHash) DO NOTHING`,
      )
      .bind(
        id,
        input.organizationId,
        input.credentialId,
        operation,
        tokenHash,
        bodyHash,
        JSON.stringify(input.response),
        now + 86400000,
        ...eligibility.values,
        input.credentialId,
        input.organizationId,
        now,
      ),
  ];
  for (const s of input.statements(guard, guardValues))
    statements.push(db.prepare(s.sql).bind(...s.values));
  statements.push(db.prepare(`INSERT INTO Activity(id,organizationId,actorId,type,message)
    SELECT ?,organizationId,createdById,'API_MUTATION',? FROM ApiCredential WHERE id=? AND ${guard}`).bind(randomUUID(),`API connection performed POST ${operation}`,input.credentialId,id));
  for (const event of input.events || []) {
    const eventId = randomUUID();
    const payload = JSON.stringify({
      id: eventId,
      event: event.type,
      createdAt: new Date(now).toISOString(),
      data: event.data,
    });
    statements.push(
      db
        .prepare(
          `INSERT INTO WebhookOutbox(id,organizationId,endpointId,eventId,eventType,payloadJson,nextAttemptAt,expiresAt,createdAt)
 SELECT ?||':'||id,organizationId,id,?,?,?,?,?,? FROM WebhookEndpoint WHERE organizationId=? AND active=1
 AND EXISTS (SELECT 1 FROM json_each(eventTypesJson) WHERE value IN ('*',?)) AND ${guard} AND ${event.condition?.sql || "1=1"}`,
        )
        .bind(
          eventId,
          eventId,
          event.type,
          payload,
          now,
          now + 86400000,
          now,
          input.organizationId,
          event.type,
          id,
          ...(event.condition?.values || []),
        ),
    );
  }
  const results = await db.batch(statements);
  if (!results[1].meta.changes) {
    const row = await find();
    if (row) return replay(row);
    throw new ApiProblem(
      409,
      "The course, member or workflow changed. Refresh its state before retrying.",
    );
  }
  return { data: input.response, replayed: false };
}
