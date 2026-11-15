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
    ).replace(/"(joinedAt|createdAt|updatedAt|trialEndsAt)" DATETIME/g, '"$1" TEXT'),
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
  const { createEventCheckinToken, addComplianceRequirement, setCourseCreditRule, getMemberComplianceSummary } = await import("../src/lib/compliance");
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
    assert.ok(Number.isFinite(org.createdAt.getTime()), 'new organization creation date must parse');
    assert.ok(org.trialEndsAt && Number.isFinite(org.trialEndsAt.getTime()), 'new organization trial expiry must parse');
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
    const joinedMembership = await prisma.membership.findFirstOrThrow({ where: { userId: learner.id } });
    assert.ok(Number.isFinite(joinedMembership.joinedAt.getTime()), 'invitation join date must be readable by Prisma/D1');
    // D1 historically stored epoch values as decimal TEXT. Exports must recover them.
    const legacyJoinDate = new Date('2026-11-15T00:30:00Z');
    sqlite.prepare('UPDATE Membership SET joinedAt=? WHERE id=?').run(`${legacyJoinDate.getTime()}.0`, joinedMembership.id);
    const exportRoute = await import('../src/app/api/export/organization/route');
    const exportResponse = await call((request: Request) => exportRoute.GET(new Request(request.url + '?format=members-csv', {headers: request.headers})));
    assert.equal(exportResponse.status, 200);
    const exportedCsv = await exportResponse.text();
    assert.ok(exportedCsv.includes(legacyJoinDate.toISOString()));
    assert.ok(exportedCsv.includes('learner@qc.example'));
    // Exercise actual route authorization with each role, not just UI visibility.
    const peopleInvite = await import('../src/app/api/people/invite/route');
    const peopleUpdate = await import('../src/app/api/people/[membershipId]/route');
    const ownerMembership = await prisma.membership.findFirstOrThrow({ where: { organizationId: org.id, role: 'OWNER' } });
    for (const auditRole of ['MEMBER', 'MANAGER', 'ADMIN']) {
      await prisma.membership.update({ where: { id: joinedMembership.id }, data: { role: auditRole } });
      cookie = `ica_unified_session=${await createSession({userId: learner.id, organizationId: org.id, organizationSlug: org.slug, role: auditRole})}`;
      const keyResponse = await call(keys.POST, {name: `QC ${auditRole}`, scopes: ['members:read']});
      assert.equal(keyResponse.status, auditRole === 'ADMIN' ? 201 : 403, `${auditRole} API key authorization`);
      const courseResponse = await call(courses.POST, {title: `QC ${auditRole} authoring`});
      assert.equal(courseResponse.status, auditRole === 'MEMBER' ? 403 : 200, `${auditRole} authoring authorization`);
      const inviteResponse = await call(peopleInvite.POST, {name: 'QC Role Invite', email: `role-${auditRole.toLowerCase()}@qc.example`, role: 'MEMBER'});
      assert.equal(inviteResponse.status, auditRole === 'ADMIN' ? 201 : 403, `${auditRole} invitation authorization`);
      const update = (request: Request, params: unknown) => peopleUpdate.PATCH(request, params as {params: Promise<{membershipId: string}>});
      const ownUpdate = await call(update, {jobTitle: 'QC role authorization'}, {params: Promise.resolve({membershipId: joinedMembership.id})});
      assert.equal(ownUpdate.status, auditRole === 'ADMIN' ? 200 : 403, `${auditRole} People update authorization`);
      const selfSuspend = await call(update, {status: 'SUSPENDED'}, {params: Promise.resolve({membershipId: joinedMembership.id})});
      assert.equal(selfSuspend.status, auditRole === 'ADMIN' ? 400 : 403, `${auditRole} cannot suspend its own account`);
      const ownerUpdate = await call(update, {role: 'MEMBER'}, {params: Promise.resolve({membershipId: ownerMembership.id})});
      assert.equal(ownerUpdate.status, 403, `${auditRole} cannot demote organization owner`);
    }
    // Changing a role invalidates the old organization-scoped role claim.
    await prisma.membership.update({ where: {id: joinedMembership.id}, data: {role: 'MEMBER'} });
    await assert.rejects(call(courses.POST, {title: 'Must not use stale ADMIN role'}), /NEXT_REDIRECT/);
    cookie = `ica_unified_session=${await createSession({userId: learner.id, organizationId: org.id, organizationSlug: org.slug, role: 'MEMBER'})}`;
    await prisma.membership.update({ where: {id: joinedMembership.id}, data: {status: 'SUSPENDED'} });
    await assert.rejects(call(exportRoute.GET), /NEXT_REDIRECT/);
    await prisma.membership.update({ where: {id: joinedMembership.id}, data: {status: joinedMembership.status, jobTitle: joinedMembership.jobTitle} });
    cookie = ownerCookie;
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
    await addComplianceRequirement(org.id, {name: 'QC renewal', category: 'QA_CE', requiredCredits: 3, renewalDate: '2026-12-15'});
    await setCourseCreditRule(org.id, course.id, 'QA_CE', 2);
    const unassignedSummary = await getMemberComplianceSummary(org.id, learner.id);
    assert.equal(unassignedSummary.recommendations.length, 0, 'member must not be recommended an inaccessible unassigned course');
    response = await call(assign.POST, {
      courseId: course.id,
      userIds: [learner.id],
    });
    assert.equal(response.status, 200);
    const assignedSummary = await getMemberComplianceSummary(org.id, learner.id);
    assert.equal(assignedSummary.recommendations[0]?.courseId, course.id);
    assert.equal(assignedSummary.outstandingTotal, 3);
    assert.equal(assignedSummary.requirements[0].renewalDate, '2026-12-15');
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
    const courseCreditSummary = await getMemberComplianceSummary(org.id, learner.id);
    assert.equal(courseCreditSummary.earnedTotal, 2, 'repeated completion must not duplicate credits');
    assert.equal(courseCreditSummary.outstandingTotal, 1);
    assert.equal(courseCreditSummary.ready, false);
    assert.equal(courseCreditSummary.ledger.length, 1);
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
        creditCategory: "QA_CE",
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
    const completeCreditSummary = await getMemberComplianceSummary(org.id, learner.id);
    assert.equal(completeCreditSummary.earnedTotal, 3, 'repeated attendance must not duplicate credits');
    assert.equal(completeCreditSummary.outstandingTotal, 0);
    assert.equal(completeCreditSummary.ready, true);
    assert.equal(completeCreditSummary.ledger.length, 2);
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
