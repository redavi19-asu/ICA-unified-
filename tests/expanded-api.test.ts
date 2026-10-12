import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { AsyncLocalStorage } from "node:async_hooks";
(
  globalThis as unknown as { AsyncLocalStorage: typeof AsyncLocalStorage }
).AsyncLocalStorage = AsyncLocalStorage;
test("expanded API integrates learning, events and applications with scoped isolation, replay and rollback", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    readFileSync(
      new URL("./fixtures/application-schema.sql", import.meta.url),
      "utf8",
    ),
  );
  type Value = string | number | null;
  const wrap = (sql: string, values: Value[] = []) => ({
    sql,
    values,
    bind(...params: Value[]) {
      return wrap(sql, params);
    },
    async run() {
      return {
        success: true,
        meta: { changes: sqlite.prepare(sql).run(...values).changes },
      };
    },
    async raw(options: { columnNames?: boolean } = {}) {
      const s = sqlite.prepare(sql);
      const columns = s.columns().map((column) => column.name);
      s.setReturnArrays(true);
      const rows = s.all(...values);
      return options.columnNames ? [columns, ...rows] : rows;
    },
    async all() {
      return { success: true, results: sqlite.prepare(sql).all(...values) };
    },
    async first() {
      return sqlite.prepare(sql).get(...values) || null;
    },
  });
  const context = globalThis as unknown as Record<symbol, unknown>;
  const contextKey = Symbol.for("__cloudflare-context__");
  context[contextKey] = {
    env: {
      DB: {
        prepare: (sql: string) => wrap(sql),
        async batch(statements: Array<ReturnType<typeof wrap>>) {
          sqlite.exec("BEGIN IMMEDIATE");
          try {
            const results = statements.map((statement) => {
              const rows = sqlite
                .prepare(statement.sql)
                .all(...statement.values);
              const changes = Number(
                sqlite.prepare("SELECT changes() AS n").get()!.n,
              );
              return { success: true, results: rows, meta: { changes } };
            });
            sqlite.exec("COMMIT");
            return results;
          } catch (error) {
            sqlite.exec("ROLLBACK");
            throw error;
          }
        },
      },
    },
  };
  sqlite.exec("PRAGMA foreign_keys=ON");
  const { prisma } = await import("../src/lib/prisma");
  const { ensureUnifiedRuntimeSchema } =
    await import("../src/lib/runtime-schema");
  await ensureUnifiedRuntimeSchema();

  const require = createRequire(import.meta.url);
  let webToken = "";
  require("next/headers").cookies = async () => ({
    get: (name: string) =>
      name === "ica_unified_session" ? { value: webToken } : undefined,
  });
  const { createSession } = await import("../src/lib/auth");
  const progressRoute = await import("../src/app/api/learning/progress/route");
  const decisions =
    await import("../src/app/api/workflows/[workflowId]/submissions/route");
  const originalFetch = globalThis.fetch;
  const sentEvents: string[] = [];
  globalThis.fetch = async (_url, init) => {
    sentEvents.push(JSON.parse(String(init?.body)).event);
    return new Response("", { status: 200 });
  };
  const { expandedApi } = await import("../src/lib/expanded-api");
  const { createApiKey } = await import("../src/lib/api-keys");
  const keyRoutes = await import("../src/app/api/integrations/keys/route");
  const { API_ENDPOINTS } = await import("../src/lib/api-contract");
  const { API_SCOPES } = await import("../src/lib/api-contract");
  const org = await prisma.organization.create({
    data: {
      name: "API fixture",
      slug: "api-fixture",
      plan: "internal",
      status: "ACTIVE",
    },
  });
  const other = await prisma.organization.create({
    data: {
      name: "Other",
      slug: "api-other",
      plan: "internal",
      status: "ACTIVE",
    },
  });
  const user = await prisma.user.create({
    data: {
      name: "Learner",
      email: "learner@api.example",
      passwordHash: "fixture",
    },
  });
  const outsider = await prisma.user.create({
    data: {
      name: "Other learner",
      email: "other@api.example",
      passwordHash: "fixture",
    },
  });
  await prisma.membership.create({
    data: {
      organizationId: org.id,
      userId: user.id,
      role: "MEMBER",
      status: "ACTIVE",
    },
  });
  await prisma.membership.create({
    data: {
      organizationId: other.id,
      userId: outsider.id,
      role: "MEMBER",
      status: "ACTIVE",
    },
  });
  const key = await createApiKey({
    organizationId: org.id,
    createdById: user.id,
    name: "API fixture",
    scopes: [...API_SCOPES],
    requestsPerMinute: 1000,
  });
  const legacy = await createApiKey({
    organizationId: org.id,
    createdById: user.id,
    name: "Legacy fixture",
    requestsPerMinute: 1000,
  });
  const readOnly = await createApiKey({
    organizationId: org.id,
    createdById: user.id,
    name: "Read fixture",
    scopes: ["courses:read"],
    requestsPerMinute: 1000,
  });
  let sequence = 0;
  async function call(
    path: string,
    body?: unknown,
    token = key.raw,
    idem = "fixture-key-" + ++sequence,
  ) {
    return expandedApi(
      new Request("https://example.test/api/v1/" + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          authorization: "Bearer " + token,
          "content-type": "application/json",
          "idempotency-key": idem,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      path.split("?")[0].split("/"),
    );
  }
  const data = async (r: Response, code = 200) => {
    assert.equal(r.status, code, JSON.stringify(await r.clone().json()));
    return r.json();
  };
  try {
    assert.equal((await call("courses", undefined, "invalid")).status, 401);
    assert.equal((await call("courses", undefined, legacy.raw)).status, 403);
    for (const [endpoint] of API_ENDPOINTS) {
      const [method, url] = endpoint.split(" ");
      const path = url.replace("/api/v1/", "").replace("{id}", "other-id");
      assert.equal(
        (await call(path, method === "POST" ? {} : undefined, legacy.raw))
          .status,
        403,
        endpoint,
      );
    }
    assert.equal(
      (
        await call("courses", {
          title: "Large course",
          description: "x".repeat(70000),
        })
      ).status,
      413,
    );

    assert.equal(
      (await call("courses", { title: "Denied" }, readOnly.raw)).status,
      403,
    );
    assert.equal(
      (await call("courses", { title: "Bad", passingScore: 999 })).status,
      400,
    );
    assert.equal(
      (await call("courses", { title: "Missing idem" }, key.raw, "")).status,
      400,
    );
    await prisma.$executeRawUnsafe(
      "INSERT INTO WebhookEndpoint(id,organizationId,url,secret,eventTypesJson) VALUES ('api-hook',?,'https://receiver.example','fixture-secret',?)",
      org.id,
      JSON.stringify(["*"]),
    );
    const courseBody = { title: "Safety training", passingScore: 80 };
    const course = await data(
      await call("courses", courseBody, key.raw, "course-create-01"),
      201,
    );
    const repeated = await data(
      await call("courses", courseBody, key.raw, "course-create-01"),
    );
    assert.equal(repeated.id, course.id);
    assert.equal(
      (
        await call(
          "courses",
          { title: "Other input" },
          key.raw,
          "course-create-01",
        )
      ).status,
      409,
    );
    assert.equal(
      await prisma.course.count({ where: { organizationId: org.id } }),
      1,
    );
    assert.equal((await data(await call("courses"))).data.length, 1);
    const lesson = await data(
      await call("courses/" + course.id + "/lessons", {
        title: "Lesson",
        kind: "TEXT",
        content: "Read safety instructions.",
        order: 1,
      }),
      201,
    );
    const quiz = await data(
      await call("courses/" + course.id + "/lessons", {
        title: "Quiz",
        kind: "QUIZ",
        content: "Answer this question.",
        order: 2,
        question: "Safe?",
        options: ["Yes", "No"],
        correctAnswer: "Yes",
      }),
      201,
    );
    const lessons = await data(await call("courses/" + course.id + "/lessons"));
    assert.equal(lessons.data.length, 2);
    assert.ok(!JSON.stringify(lessons).includes("correctAnswer"));
    const foreignCourse = await prisma.course.create({
      data: { organizationId: other.id, title: "Other course" },
    });
    assert.equal(
      (await call("courses/" + foreignCourse.id + "/lessons")).status,
      404,
    );
    assert.equal(
      (await call("enrollments", { courseId: course.id, userId: outsider.id }))
        .status,
      404,
    );
    assert.equal(
      (
        await call("enrollments", {
          courseId: course.id,
          userId: user.id,
          progress: 100,
        })
      ).status,
      400,
    );
    const assignment = { courseId: course.id, userId: user.id };
    await data(await call("enrollments", assignment), 201);
    await data(await call("enrollments", assignment), 201);
    assert.equal(
      await prisma.enrollment.count({ where: { organizationId: org.id } }),
      1,
    );
    const enrollment = (await data(await call("enrollments?userId=" + user.id)))
      .data[0];
    assert.equal(enrollment.status, "NOT_STARTED");
    webToken = await createSession({
      userId: user.id,
      organizationId: org.id,
      organizationSlug: org.slug,
      role: "MEMBER",
    });
    const finish = (lessonId: string, answers?: Record<string, string>) =>
      progressRoute.POST(
        new Request("https://example.test/api/learning/progress", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ courseId: course.id, lessonId, answers }),
        }),
      );
    await data(await finish(lesson.id));
    const question = await prisma.quizQuestion.findFirstOrThrow({
      where: { lessonId: quiz.id },
    });
    const completed = await data(
      await finish(quiz.id, { [question.id]: "Yes" }),
    );
    assert.equal(completed.complete, true);
    const issued = await prisma.credential.findFirstOrThrow({
      where: { enrollmentId: enrollment.id },
    });
    await data(await finish(quiz.id, { [question.id]: "Yes" }));
    const unchanged = await prisma.credential.findUniqueOrThrow({
      where: { id: issued.id },
    });
    assert.equal(unchanged.issuedAt!.getTime(), issued.issuedAt!.getTime());
    assert.equal(sentEvents.filter((e) => e === "course.completed").length, 1);
    assert.equal(sentEvents.filter((e) => e === "credential.issued").length, 1);
    assert.equal((await data(await call("enrollments"))).data[0].progress, 100);
    assert.equal((await data(await call("credentials"))).data.length, 1);
    const event = await data(
      await call("events", {
        name: "Free event",
        status: "ACTIVE",
        startAt: "2026-12-01T12:00:00Z",
        capacity: 1,
        ceuCredits: 2,
        certificateRule: "ATTENDANCE",
      }),
      201,
    );
    const registrationPath = "events/" + event.id + "/registrations";
    const attendee = { name: "Learner", email: user.email };
    const registered = await data(
      await call(registrationPath, attendee, key.raw, "registration-01"),
      201,
    );
    assert.equal(registered.data.status, "REGISTERED");
    const duplicate = await data(
      await call(registrationPath, attendee, key.raw, "registration-01"),
    );
    assert.equal(duplicate.data.id, registered.data.id);
    const waitlist = await data(
      await call(registrationPath, {
        name: "Waiting member",
        email: "wait@api.example",
      }),
      201,
    );
    assert.equal(waitlist.data.status, "WAITLISTED");
    await data(
      await call("events/" + event.id + "/attendance", { userId: user.id }),
      201,
    );
    await data(
      await call("events/" + event.id + "/attendance", { userId: user.id }),
      201,
    );
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) n FROM EventAttendance").get()!.n,
      1,
    );
    assert.equal(
      (await data(await call("credits?userId=" + user.id))).data[0].credits,
      2,
    );
    assert.equal(
      await prisma.credential.count({
        where: { organizationId: org.id, userId: user.id },
      }),
      2,
    );
    assert.equal(
      sqlite
        .prepare(
          "SELECT COUNT(*) n FROM WebhookOutbox WHERE eventType='event.attendance.recorded'",
        )
        .get()!.n,
      1,
    );
    assert.equal(
      (
        await call("events/" + event.id + "/attendance", {
          userId: outsider.id,
        })
      ).status,
      404,
    );
    const raceEvent = await data(
      await call("events", {
        name: "Capacity race",
        status: "ACTIVE",
        startAt: "2026-12-01T12:00:00Z",
        capacity: 1,
      }),
      201,
    );
    const raceRegistrations = await Promise.all([
      call("events/" + raceEvent.id + "/registrations", {
        name: "Race one",
        email: "race-one@api.example",
      }),
      call("events/" + raceEvent.id + "/registrations", {
        name: "Race two",
        email: "race-two@api.example",
      }),
    ]);
    const raceStatuses = await Promise.all(
      raceRegistrations.map(async (r) => (await data(r, 201)).data.status),
    );
    assert.deepEqual(raceStatuses.sort(), ["REGISTERED", "WAITLISTED"]);
    const paid = await data(
      await call("events", {
        name: "Paid event",
        status: "ACTIVE",
        startAt: "2026-12-01T12:00:00Z",
        price: 10,
      }),
      201,
    );
    const pending = await data(
      await call("events/" + paid.id + "/registrations", attendee),
      201,
    );
    assert.equal(pending.data.status, "PAYMENT_PENDING");
    assert.equal(
      (await call("events/" + paid.id + "/attendance", { userId: user.id }))
        .status,
      409,
    );
    await prisma.$executeRawUnsafe(
      "UPDATE WorkflowSubmission SET paymentStatus='PAID',status='REGISTERED' WHERE id=?",
      pending.data.id,
    );
    await data(
      await call("events/" + paid.id + "/attendance", { userId: user.id }),
      201,
    );
    const foreignEvent = "foreign-event";
    await prisma.$executeRawUnsafe(
      "INSERT INTO WorkflowDefinition(id,organizationId,kind,name,status,configJson) VALUES (?,?,'EVENT','Other','ACTIVE','{}')",
      foreignEvent,
      other.id,
    );
    assert.equal(
      (await call("events/" + foreignEvent + "/registrations")).status,
      404,
    );
    assert.equal(
      (await call("events/" + foreignEvent + "/registrations", attendee))
        .status,
      404,
    );
    await prisma.$executeRawUnsafe(
      "INSERT INTO WorkflowDefinition(id,organizationId,kind,name,status,configJson) VALUES ('application-program',?,'MEMBERSHIP','Program','ACTIVE',?)",
      org.id,
      JSON.stringify({ approvalRequired: true }),
    );
    const application = await data(
      await call("applications/application-program/submissions", attendee),
      201,
    );
    assert.equal(application.data.status, "PENDING_REVIEW");
    assert.equal(
      (await data(await call("applications/application-program/submissions")))
        .data[0].status,
      "PENDING_REVIEW",
    );
    await prisma.membership.updateMany({
      where: { organizationId: org.id, userId: user.id },
      data: { role: "OWNER" },
    });
    webToken = await createSession({
      userId: user.id,
      organizationId: org.id,
      organizationSlug: org.slug,
      role: "OWNER",
    });
    await data(
      await decisions.PATCH(
        new Request(
          "https://example.test/api/workflows/application-program/submissions",
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              submissionId: application.data.id,
              status: "REJECTED",
            }),
          },
        ),
        { params: Promise.resolve({ workflowId: "application-program" }) },
      ),
    );
    assert.ok(sentEvents.includes("membership.application.decided"));
    assert.equal(
      (await data(await call("applications/application-program/submissions")))
        .data[0].status,
      "REJECTED",
    );
    assert.equal((await data(await call("applications"))).data.length, 1);
    const uiKey = await keyRoutes.POST(
      new Request("https://example.test/api/integrations/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Learning connector",
          scopes: ["courses:read", "enrollments:write"],
          expiresInDays: 30,
        }),
      }),
    );
    assert.equal(uiKey.status, 201);
    const uiKeyBody = await uiKey.json();
    assert.deepEqual(uiKeyBody.key.scopes, [
      "courses:read",
      "enrollments:write",
    ]);
    assert.equal(
      (
        await keyRoutes.POST(
          new Request("https://example.test/api/integrations/keys", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: "Invalid connector",
              scopes: ["root:all"],
            }),
          }),
        )
      ).status,
      400,
    );
    await prisma.$executeRawUnsafe(
      "UPDATE ApiCredentialPolicy SET expiresAt=0 WHERE credentialId=?",
      uiKeyBody.key.id,
    );
    assert.equal(
      (await call("courses", undefined, uiKeyBody.key.value)).status,
      401,
    );
    const list = await data(await call("courses?limit=1"));
    assert.equal(list.nextCursor, null);
    await data(await call("courses", { title: "Second course" }), 201);
    const first = await data(await call("courses?limit=1"));
    assert.ok(first.nextCursor);
    const second = await data(
      await call("courses?limit=1&after=" + first.nextCursor),
    );
    assert.notEqual(first.data[0].id, second.data[0].id);
    assert.equal((await call("courses?limit=0")).status, 400);
    sqlite.exec(
      "CREATE TRIGGER abort_api_course BEFORE INSERT ON Course WHEN NEW.title='Rollback course' BEGIN SELECT RAISE(ABORT,'fixture rollback'); END",
    );
    const before = sqlite.prepare("SELECT COUNT(*) n FROM ApiMutation").get()!
      .n;
    assert.equal(
      (
        await call(
          "courses",
          { title: "Rollback course" },
          key.raw,
          "rollback-key-01",
        )
      ).status,
      503,
    );
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) n FROM ApiMutation").get()!.n,
      before,
    );
    sqlite.exec("DROP TRIGGER abort_api_course");
    await data(
      await call(
        "courses",
        { title: "Rollback course" },
        key.raw,
        "rollback-key-01",
      ),
      201,
    );
    const simultaneous = await Promise.all([
      call(
        "courses",
        { title: "Concurrent course" },
        key.raw,
        "concurrent-key-01",
      ),
      call(
        "courses",
        { title: "Concurrent course" },
        key.raw,
        "concurrent-key-01",
      ),
    ]);
    assert.deepEqual(simultaneous.map((r) => r.status).sort(), [200, 201]);
    assert.equal(
      await prisma.course.count({ where: { title: "Concurrent course" } }),
      1,
    );
    await prisma.organization.update({
      where: { id: org.id },
      data: { status: "SUSPENDED", plan: "professional" },
    });
    assert.equal((await call("courses")).status, 402);
    await prisma.$executeRawUnsafe(
      "UPDATE ApiCredential SET active=0 WHERE id=?",
      key.id,
    );
    assert.equal((await call("courses")).status, 401);
  } finally {
    globalThis.fetch = originalFetch;
    await prisma.$disconnect();
    delete context[contextKey];
    sqlite.close();
  }
});
