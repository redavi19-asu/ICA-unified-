import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";

// Run real routes and Prisma against an isolated SQLite/D1-compatible adapter.
// Next requires this global before its request context modules are imported.
(globalThis as any).AsyncLocalStorage = AsyncLocalStorage;

test("customer signs in, integrates members, completes learning, and stays isolated", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    readFileSync(
      new URL("./fixtures/application-schema.sql", import.meta.url),
      "utf8",
    ),
  );

  const wrap = (sql: string, values: any[] = []): any => ({
    sql,
    values,
    bind: (...args: any[]) => wrap(sql, args),
    async run() {
      return {
        success: true,
        meta: { changes: sqlite.prepare(sql).run(...values).changes },
      };
    },
    async raw(options: any = {}) {
      const s = sqlite.prepare(sql);
      const columns = s.columns().map((c) => c.name);
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
  const db = {
    prepare: (sql: string) => wrap(sql),
    async batch(statements: any[]) {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((statement) => ({
          success: true,
          results: sqlite.prepare(statement.sql).all(...statement.values),
        }));
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  const contextKey = Symbol.for("__cloudflare-context__");
  (globalThis as any)[contextKey] = { env: { DB: db } };
  const { prisma } = await import("../src/lib/prisma");
  const { ensureUnifiedRuntimeSchema } = await import(
    "../src/lib/runtime-schema"
  );
  await ensureUnifiedRuntimeSchema();
  const require = createRequire(import.meta.url);
  const workUnitAsyncStorage = new AsyncLocalStorage<any>();
  require("next/headers").cookies = async () =>
    workUnitAsyncStorage.getStore().cookies;
  const {
    RequestCookies,
  } = require("next/dist/server/web/spec-extension/cookies");
  const { NextRequest } = await import("next/server");
  const register = await import("../src/app/api/auth/register/route");
  const login = await import("../src/app/api/auth/login/route");
  const keys = await import("../src/app/api/integrations/keys/route");
  const webhookRoutes = await import("../src/app/api/integrations/webhooks/route");
  const members = await import("../src/app/api/v1/members/route");
  const accept = await import("../src/app/api/invitations/accept/route");
  const courses = await import("../src/app/api/learning/courses/route");
  const lessons = await import(
    "../src/app/api/learning/courses/[courseId]/lessons/route"
  );
  const assign = await import("../src/app/api/learning/assign/route");
  const progress = await import("../src/app/api/learning/progress/route");
  const workflows = await import("../src/app/api/workflows/route");
  const submitEvent = await import(
    "../src/app/api/public/workflows/[workflowId]/submit/route"
  );
  const checkin = await import("../src/app/api/checkin/[token]/route");
  const { createEventCheckinToken } = await import("../src/lib/compliance");
  const { createSession } = await import("../src/lib/auth");
  const { createWebhook, emitOrganizationEvent } = await import(
    "../src/lib/organization-ops"
  );
  const { createHmac, createHash } = await import("node:crypto");
  const social = await import("../src/lib/social-auth");
  const mobileLogin = await import("../src/app/api/mobile/auth/login/route");
  const mobileWallet = await import("../src/app/api/mobile/wallet/route");
  let cookie = "";
  async function call(
    handler: any,
    body?: unknown,
    extra?: any,
    bearer?: string,
  ) {
    const request = new NextRequest("http://localhost/api/qc", {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "content-type": "application/json",
        cookie,
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return workUnitAsyncStorage.run(
      { cookies: new RequestCookies(request.headers) },
      () => handler(request, extra),
    );
  }
  const password = "QC-isolated-password-9284";
  try {
    let response = await call(register.POST, {
      organizationName: "QC Association",
      name: "QC Owner",
      email: "owner@qc.example",
      password,
      termsAccepted: true,
    });
    assert.equal(
      response.status,
      200,
      JSON.stringify(await response.clone().json()),
    );
    cookie = response.headers.get("set-cookie")!.split(";")[0];
    const ownerCookie = cookie;
    const org = await prisma.organization.findFirstOrThrow({
      where: { name: "QC Association" },
    });
    response = await call(login.POST, {
      email: "owner@qc.example",
      password,
      organizationSlug: org.slug,
    });
    assert.equal(response.status, 200);
    cookie = response.headers.get("set-cookie")!.split(";")[0];
    response = await call(keys.POST, {
      name: "QC Connector",
      scopes: ["members:read", "members:write"],
      expiresInDays: 1,
      requestsPerMinute: 10,
    });
    assert.equal(response.status, 201);
    const key = (await response.json()).key;
    response = await call(
      members.POST,
      { name: "QC Learner", email: "learner@qc.example" },
      undefined,
      key.value,
    );
    assert.equal(response.status, 201);
    const invitation = (await response.json()).data;
    response = await call(accept.POST, {
      token: invitation.activationUrl.split("/").pop(),
      password,
    });
    assert.equal(
      response.status,
      200,
      JSON.stringify(await response.clone().json()),
    );
    assert.equal(
      (
        await call(accept.POST, {
          token: invitation.activationUrl.split("/").pop(),
          password,
        })
      ).status,
      400,
    );
    const secondInvitationResponse = await call(
      members.POST,
      { name: "QC Second Learner", email: "second@qc.example" },
      undefined,
      key.value,
    );
    assert.equal(secondInvitationResponse.status, 201);
    const secondInvitation = (await secondInvitationResponse.json()).data;
    const acceptances = await Promise.all([
      call(accept.POST, {
        token: secondInvitation.activationUrl.split("/").pop(),
        password,
      }),
      call(accept.POST, {
        token: secondInvitation.activationUrl.split("/").pop(),
        password,
      }),
    ]);
    assert.deepEqual(
      acceptances.map((response) => response.status).sort(),
      [200, 409],
    );
    const learner = await prisma.user.findUniqueOrThrow({
      where: { email: "learner@qc.example" },
    });
    response = await call(courses.POST, { title: "QC Safety Course" });
    assert.equal(response.status, 200);
    const course = (await response.json()).course;
    response = await call(
      lessons.POST,
      { title: "QC Lesson", kind: "TEXT", content: "Read this material." },
      { params: Promise.resolve({ courseId: course.id }) },
    );
    assert.equal(response.status, 200);
    const lesson = (await response.json()).lesson;
    response = await call(assign.POST, {
      courseId: course.id,
      userIds: [learner.id],
    });
    assert.equal(response.status, 200);
    cookie = `ica_unified_session=${await createSession({ userId: learner.id, organizationId: org.id, organizationSlug: org.slug, role: "MEMBER" })}`;
    assert.equal((await call(keys.POST, { name: "Forbidden" })).status, 403);
    assert.equal(
      (await call(courses.POST, { title: "Forbidden Course" })).status,
      403,
    );
    response = await call(progress.POST, {
      courseId: course.id,
      lessonId: lesson.id,
    });
    assert.equal(
      response.status,
      200,
      JSON.stringify(await response.clone().json()),
    );
    assert.equal(
      (
        await prisma.enrollment.findUniqueOrThrow({
          where: {
            userId_courseId: { userId: learner.id, courseId: course.id },
          },
        })
      ).status,
      "COMPLETE",
    );
    assert.equal(
      await prisma.credential.count({ where: { userId: learner.id } }),
      1,
    );
    const mobileResponse = await call(mobileLogin.POST, {
      email: "learner@qc.example",
      password,
      organizationSlug: org.slug,
    });
    assert.equal(mobileResponse.status, 200);
    const mobileToken = (await mobileResponse.json()).token;
    assert.equal(
      (await call(mobileWallet.GET, undefined, undefined, mobileToken)).status,
      200,
    );
    await call(progress.POST, { courseId: course.id, lessonId: lesson.id });
    assert.equal(
      await prisma.credential.count({ where: { userId: learner.id } }),
      1,
    );
    cookie = ownerCookie;
    response = await call(workflows.POST, {
      kind: "EVENT",
      name: "QC Conference",
      status: "ACTIVE",
      config: {
        price: 0,
        capacity: 10,
        checkinMode: "SELF_SCAN",
        ceuCredits: 1,
        creditCategory: "GENERAL",
        certificateRule: "ATTENDANCE",
      },
    });
    assert.equal(response.status, 201);
    const workflowId = (await response.json()).id;
    response = await call(
      submitEvent.POST,
      { name: "QC Learner", email: "learner@qc.example" },
      { params: Promise.resolve({ workflowId }) },
    );
    assert.equal(
      response.status,
      201,
      JSON.stringify(await response.clone().json()),
    );
    const eventToken = await createEventCheckinToken(org.id, workflowId);
    assert.ok(eventToken);
    await prisma.membership.update({
      where: {
        userId_organizationId: { userId: learner.id, organizationId: org.id },
      },
      data: { status: "ACTIVE" },
    });
    cookie = `ica_unified_session=${await createSession({ userId: learner.id, organizationId: org.id, organizationSlug: org.slug, role: "MEMBER" })}`;
    response = await call(
      checkin.POST,
      {},
      { params: Promise.resolve({ token: eventToken!.token }) },
    );
    assert.equal(
      response.status,
      200,
      JSON.stringify(await response.clone().json()),
    );
    const credentialsAfterCheckin = await prisma.credential.count({
      where: { userId: learner.id },
    });
    assert.equal(credentialsAfterCheckin, 2);
    await call(
      checkin.POST,
      {},
      { params: Promise.resolve({ token: eventToken!.token }) },
    );
    assert.equal(
      await prisma.credential.count({ where: { userId: learner.id } }),
      credentialsAfterCheckin,
    );
    const other = await prisma.organization.create({
      data: {
        name: "Other QC",
        slug: "other-qc",
        status: "ACTIVE",
        plan: "professional",
      },
    });
    cookie = `ica_unified_session=${await createSession({ userId: learner.id, organizationId: other.id, organizationSlug: other.slug, role: "MEMBER" })}`;
    await prisma.membership.create({
      data: {
        userId: learner.id,
        organizationId: other.id,
        role: "MEMBER",
        status: "ACTIVE",
      },
    });
    assert.equal(
      (await call(progress.POST, { courseId: course.id, lessonId: lesson.id }))
        .status,
      404,
    );
    assert.equal(
      (
        await call(
          checkin.POST,
          {},
          { params: Promise.resolve({ token: eventToken!.token }) },
        )
      ).status,
      403,
    );
    response = await call(members.GET, undefined, undefined, key.value);
    assert.equal(response.status, 200);
    const list = (await response.json()).data;
    assert.equal(list.length, 3);
    const hook = await createWebhook({
      organizationId: org.id,
      url: "https://receiver.example/hooks",
      eventTypes: ["integration.test"],
    });
    const originalFetch = globalThis.fetch;
    let deliveries = 0;
    globalThis.fetch = async (_url, init) => {
      deliveries++;
      assert.equal(
        new Headers(init?.headers).get("X-ICA-Signature"),
        `sha256=${createHmac("sha256", hook.secret).update(String(init?.body)).digest("hex")}`,
      );
      return new Response("", { status: 200 });
    };
    try {
      await emitOrganizationEvent(org.id, "integration.test", { qc: true });
      await emitOrganizationEvent(other.id, "integration.test", { qc: true });
      assert.equal(deliveries, 1);
      assert.equal((await call(webhookRoutes.GET)).status, 403);
      const beforeHookCookie = cookie;
      cookie = ownerCookie;
      globalThis.fetch = async () => new Response('', { status: 503 });
      response = await call(webhookRoutes.POST, { action: 'TEST' });
      assert.equal(response.status, 200);
      const outcome = await response.json();
      assert.deepEqual({ sent: outcome.sent, queued: outcome.queued, failed: outcome.failed }, { sent: 0, queued: 1, failed: 0 });
      response = await call(webhookRoutes.GET);
      assert.equal(response.status, 200);
      const hookState = (await response.json()).webhooks;
      assert.equal(hookState.length, 1);
      assert.equal(hookState[0].pendingDeliveries, 1);
      assert.equal(hookState[0].failedDeliveries, 0);
      assert.notEqual(hookState[0].secret, hook.secret);
      cookie = beforeHookCookie;
    } finally {
      globalThis.fetch = originalFetch;
    }
    await social.readSocialRegistrationTicket("missing");
    const ticket = "qc-social-ticket-private";
    sqlite
      .prepare(
        "INSERT INTO SocialOnboardingTicket(ticketHash,provider,providerSubject,email,displayName,expiresAt) VALUES (?,?,?,?,?,?)",
      )
      .run(
        createHash("sha256").update(ticket).digest("hex"),
        "google",
        "qc-provider-subject",
        "social@qc.example",
        "QC Social Owner",
        Date.now() + 60000,
      );
    const onboarded = await social.completeSocialRegistration(
      ticket,
      "QC Social Association",
    );
    assert.ok(onboarded.token);
    assert.equal(
      await prisma.membership.count({
        where: {
          organization: { name: "QC Social Association" },
          role: "OWNER",
        },
      }),
      1,
    );
    await assert.rejects(() =>
      social.completeSocialRegistration(ticket, "Duplicate Social Association"),
    );
    sqlite
      .prepare(
        "UPDATE ApiCredentialPolicy SET scopesJson=? WHERE credentialId=?",
      )
      .run("corrupted-policy", key.id);
    assert.equal(
      (await call(members.GET, undefined, undefined, key.value)).status,
      403,
    );
    sqlite
      .prepare(
        "UPDATE ApiCredentialPolicy SET scopesJson=? WHERE credentialId=?",
      )
      .run(JSON.stringify(["members:read", "members:write"]), key.id);
    sqlite
      .prepare(
        "UPDATE ApiCredentialPolicy SET expiresAt=0 WHERE credentialId=?",
      )
      .run(key.id);
    assert.equal(
      (await call(members.GET, undefined, undefined, key.value)).status,
      401,
    );
    sqlite
      .prepare(
        "UPDATE ApiCredentialPolicy SET expiresAt=? WHERE credentialId=?",
      )
      .run(Date.now() + 60000, key.id);
    sqlite.prepare("UPDATE ApiCredential SET active=0 WHERE id=?").run(key.id);
    assert.equal(
      (await call(members.GET, undefined, undefined, key.value)).status,
      401,
    );
  } finally {
    delete (globalThis as any)[contextKey];
    sqlite.close();
  }
});
