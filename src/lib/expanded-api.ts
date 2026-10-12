import {apiRevenueDatabase} from './api-revenue-database';
import {apiRevenueRequired,withApiUsage} from './api-revenue';
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "./prisma";
import { authenticateApiRequest } from "./api-keys";
import { organizationHasUnifiedAccess } from "./auth";
import { ensureUnifiedRuntimeSchema } from "./runtime-schema";
import { apiMutation, ApiProblem, Sql } from "./api-mutation";

const id = z.string().min(1).max(128);
const courseSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().max(2000).nullable().default(null),
    durationMin: z.number().int().min(0).max(10000).default(0),
    passingScore: z.number().int().min(1).max(100).default(80),
    certificateValidDays: z
      .number()
      .int()
      .min(1)
      .max(3650)
      .nullable()
      .default(null),
    required: z.boolean().default(false),
    published: z.boolean().default(true),
  })
  .strict();
const lessonSchema = z
  .object({
    title: z.string().trim().min(2).max(140),
    kind: z.enum(["TEXT", "VIDEO", "DOCUMENT", "QUIZ", "LIVE"]),
    content: z.string().trim().min(1).max(12000),
    mediaUrl: z
      .string()
      .url()
      .refine((v) => v.startsWith("https://"))
      .nullable()
      .default(null),
    order: z.number().int().min(1).max(10000),
    question: z.string().trim().min(1).max(2000).optional(),
    options: z.array(z.string().min(1).max(500)).min(2).max(6).optional(),
    correctAnswer: z.string().max(500).optional(),
  })
  .strict();
const enrollmentSchema = z
  .object({
    courseId: id,
    userId: id,
    dueAt: z.string().datetime().nullable().default(null),
  })
  .strict();
const eventSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    status: z.enum(["DRAFT", "ACTIVE"]).default("DRAFT"),
    startAt: z.string().datetime(),
    endAt: z.string().datetime().optional(),
    capacity: z.number().int().min(0).max(100000).default(0),
    price: z.number().min(0).max(100000).default(0),
    ceuCredits: z.number().min(0).max(1000).default(0),
    creditCategory: z.string().trim().min(1).max(60).default("GENERAL"),
    checkinMode: z.enum(["SELF_SCAN", "STAFF_SCAN", "BOTH"]).default("BOTH"),
    certificateRule: z
      .enum(["NONE", "ATTENDANCE", "COMPLETE_EVENT"])
      .default("NONE"),
    meetingLink: z
      .string()
      .url()
      .refine((v) => v.startsWith("https://"))
      .optional(),
  })
  .strict();
const submissionSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().toLowerCase(),
    phone: z.string().trim().max(40).nullable().default(null),
    company: z.string().trim().max(140).nullable().default(null),
    notes: z.string().trim().max(3000).nullable().default(null),
  })
  .strict();
async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new ApiProblem(400, "JSON body required.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 65536) {
        await reader.cancel();
        throw new ApiProblem(413, "JSON body exceeds 64 KiB.");
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiProblem(400, "Valid JSON required.");
  }
}
function routeScope(path: string[], method: string) {
  const [resource, , action] = path;
  if (path.length === 1 && resource === "courses")
    return method === "GET"
      ? "courses:read"
      : method === "POST"
        ? "courses:write"
        : null;
  if (path.length === 3 && resource === "courses" && action === "lessons")
    return method === "GET"
      ? "courses:read"
      : method === "POST"
        ? "courses:write"
        : null;
  if (path.length === 1 && resource === "enrollments")
    return method === "GET"
      ? "enrollments:read"
      : method === "POST"
        ? "enrollments:write"
        : null;
  if (
    path.length === 1 &&
    ["credentials", "credits", "events", "applications"].includes(resource)
  )
    return method === "GET"
      ? `${resource}:read`
      : method === "POST" && resource === "events"
        ? "events:write"
        : null;
  if (path.length === 3 && resource === "events" && action === "registrations")
    return method === "GET"
      ? "registrations:read"
      : method === "POST"
        ? "registrations:write"
        : null;
  if (
    path.length === 3 &&
    resource === "events" &&
    action === "attendance" &&
    method === "POST"
  )
    return "attendance:write";
  if (
    path.length === 3 &&
    resource === "applications" &&
    action === "submissions"
  )
    return method === "GET"
      ? "applications:read"
      : method === "POST"
        ? "applications:write"
        : null;
  return null;
}
function page(request: Request) {
  const q = new URL(request.url).searchParams;
  const after = q.get("after") || "";
  const limit = Number(q.get("limit") || 100);
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    after.length > 128
  )
    throw new ApiProblem(400, "Use limit 1–100 and a valid after cursor.");
  return { after, limit, userId: q.get("userId"), courseId: q.get("courseId") };
}
function listing(rows: Record<string, unknown>[], limit: number) {
  return {
    data: rows.slice(0, limit),
    nextCursor: rows.length > limit ? rows[limit - 1].id : null,
  };
}
type Workflow = {
  id: string;
  kind: string;
  name: string;
  status: string;
  configJson: string;
};
async function ownedWorkflow(org: string, workflowId: string, kind: string) {
  const rows = await prisma.$queryRawUnsafe<Workflow[]>(
    "SELECT id,kind,name,status,configJson FROM WorkflowDefinition WHERE id=? AND organizationId=? AND kind=?",
    workflowId,
    org,
    kind,
  );
  if (!rows[0]) throw new ApiProblem(404, "Workflow not found.");
  return rows[0];
}
export async function expandedApi(request: Request, path: string[]) {
  try {
    const scope = routeScope(path, request.method);
    if (!scope)
      return NextResponse.json(
        { error: "Endpoint not found." },
        { status: 404 },
      );
    const auth = await authenticateApiRequest(request, scope);
    if (!auth.ok)
      return NextResponse.json(
        { error: auth.error },
        {
          status: auth.status,
          headers: auth.retryAfterSeconds
            ? { "Retry-After": String(auth.retryAfterSeconds) }
            : undefined,
        },
      );
    const org = await prisma.organization.findUnique({
      where: { id: auth.organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        plan: true,
        trialEndsAt: true,
      },
    });
    if (!org)
      return NextResponse.json(
        { error: "Invalid API organization." },
        { status: 401 },
      );
    if (!(await organizationHasUnifiedAccess(org)))
      return NextResponse.json(
        {
          error: "Active Unified access required.",
          code: "SUBSCRIPTION_REQUIRED",
        },
        { status: 402 },
      );
    return await withApiUsage(apiRevenueDatabase(),org.id,apiRevenueRequired(process.env.API_PAID_ACCESS_REQUIRED),async()=>{
    await ensureUnifiedRuntimeSchema();
    const organizationId = org.id,
      [resource, resourceId, action] = path;
    const json = (data: unknown, status = 200) =>
      NextResponse.json(data, {
        status,
        headers: {
          "Cache-Control": "no-store",
          "X-RateLimit-Remaining": String(auth.remaining),
        },
      });
    if (request.method === "GET") {
      const p = page(request),
        base = { organizationId, id: { gt: p.after } },
        take = p.limit + 1;
      if (resource === "courses" && !action) {
        const rows = await prisma.course.findMany({
          where: base,
          orderBy: { id: "asc" },
          take,
          select: {
            id: true,
            title: true,
            description: true,
            required: true,
            durationMin: true,
            passingScore: true,
            certificateValidDays: true,
            published: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        return json(listing(rows, p.limit));
      }
      if (resource === "courses" && action === "lessons") {
        if (
          !(await prisma.course.findFirst({
            where: { organizationId, id: resourceId },
          }))
        )
          throw new ApiProblem(404, "Course not found.");
        const rows = await prisma.lesson.findMany({
          where: { ...base, courseId: resourceId },
          orderBy: { id: "asc" },
          take,
          select: {
            id: true,
            courseId: true,
            order: true,
            title: true,
            kind: true,
            content: true,
            mediaUrl: true,
            questions: {
              select: {
                id: true,
                order: true,
                prompt: true,
                optionsJson: true,
              },
            },
          },
        });
        return json(listing(rows, p.limit));
      }
      if (resource === "enrollments") {
        const rows = await prisma.enrollment.findMany({
          where: {
            ...base,
            ...(p.userId ? { userId: p.userId } : {}),
            ...(p.courseId ? { courseId: p.courseId } : {}),
          },
          orderBy: { id: "asc" },
          take,
          select: {
            id: true,
            userId: true,
            courseId: true,
            status: true,
            progress: true,
            score: true,
            attempts: true,
            dueAt: true,
            completedAt: true,
          },
        });
        return json(listing(rows, p.limit));
      }
      if (resource === "credentials") {
        const rows = await prisma.credential.findMany({
          where: { ...base, ...(p.userId ? { userId: p.userId } : {}) },
          orderBy: { id: "asc" },
          take,
          select: {
            id: true,
            userId: true,
            enrollmentId: true,
            code: true,
            name: true,
            status: true,
            issuedAt: true,
            expiresAt: true,
          },
        });
        return json(listing(rows, p.limit));
      }
      if (resource === "credits") {
        const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
          "SELECT id,userId,sourceType,sourceId,category,credits,description,awardedAt FROM CreditLedger WHERE organizationId=? AND id>? AND (? IS NULL OR userId=?) ORDER BY id LIMIT ?",
          organizationId,
          p.after,
          p.userId,
          p.userId,
          take,
        );
        return json(listing(rows, p.limit));
      }
      if ((resource === "events" || resource === "applications") && !action) {
        const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
          "SELECT id,name,status,configJson,createdAt,updatedAt FROM WorkflowDefinition WHERE organizationId=? AND kind=? AND id>? ORDER BY id LIMIT ?",
          organizationId,
          resource === "events" ? "EVENT" : "MEMBERSHIP",
          p.after,
          take,
        );
        return json(
          listing(
            rows.map((row) => {
              const { configJson, ...rest } = row;
              return { ...rest, config: JSON.parse(String(configJson)) };
            }),
            p.limit,
          ),
        );
      }
      await ownedWorkflow(
        organizationId,
        resourceId,
        resource === "events" ? "EVENT" : "MEMBERSHIP",
      );
      const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
        "SELECT id,workflowId,name,email,status,paymentStatus,amountCents,createdAt,updatedAt FROM WorkflowSubmission WHERE organizationId=? AND workflowId=? AND id>? ORDER BY id LIMIT ?",
        organizationId,
        resourceId,
        p.after,
        take,
      );
      return json(listing(rows, p.limit));
    }
    const raw = await readBody(request);
    const newId = randomUUID(),
      now = Date.now();
    const mutation = (
      body: unknown,
      response: Record<string, unknown>,
      statements: (guard: string, v: (string | number | null)[]) => Sql[],
      events: {
        type: string;
        data: Record<string, unknown>;
        condition?: Sql;
      }[] = [],
      eligibility?: Sql,
    ) =>
      apiMutation({
        request,
        organizationId,
        credentialId: auth.credentialId,
        body,
        response,
        statements,
        events,
        eligibility,
      });
    const result = async (value: ReturnType<typeof mutation>) => {
      const r = await value;
      return json({ ...r.data, replayed: r.replayed }, r.replayed ? 200 : 201);
    };
    if (resource === "courses" && !action) {
      const b = courseSchema.parse(raw);
      return await result(
        mutation(
          b,
          { id: newId },
          (g, v) => [
            {
              sql: `INSERT INTO Course(id,organizationId,title,description,required,durationMin,passingScore,certificateValidDays,published,createdAt,updatedAt) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${g}`,
              values: [
                newId,
                organizationId,
                b.title,
                b.description,
                +b.required,
                b.durationMin,
                b.passingScore,
                b.certificateValidDays,
                +b.published,
                now,
                now,
                ...v,
              ],
            },
          ],
          [{ type: "course.created", data: { courseId: newId } }],
        ),
      );
    }
    if (resource === "courses" && action === "lessons") {
      const b = lessonSchema.parse(raw);
      if (
        b.kind === "QUIZ" &&
        (!b.question ||
          !b.options ||
          !b.correctAnswer ||
          !b.options.includes(b.correctAnswer))
      )
        throw new ApiProblem(
          400,
          "Quiz requires a question, choices and a matching correct answer.",
        );
      if (b.kind === "LIVE" && !b.mediaUrl)
        throw new ApiProblem(400, "Live lessons require a meeting URL.");
      if (
        !(await prisma.course.findFirst({
          where: { id: resourceId, organizationId },
        }))
      )
        throw new ApiProblem(404, "Course not found.");
      return await result(
        mutation(
          b,
          { id: newId },
          (g, v) => [
            {
              sql: `INSERT INTO Lesson(id,organizationId,courseId,"order",title,kind,content,mediaUrl,createdAt,updatedAt) SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${g}`,
              values: [
                newId,
                organizationId,
                resourceId,
                b.order,
                b.title,
                b.kind,
                b.content,
                b.mediaUrl,
                now,
                now,
                ...v,
              ],
            },
            ...(b.kind === "QUIZ"
              ? [
                  {
                    sql: `INSERT INTO QuizQuestion(id,lessonId,"order",prompt,optionsJson,correctAnswer) SELECT ?,?,1,?,?,? WHERE ${g}`,
                    values: [
                      randomUUID(),
                      newId,
                      b.question!,
                      JSON.stringify(b.options),
                      b.correctAnswer!,
                      ...v,
                    ],
                  },
                ]
              : []),
          ],
          [],
          {
            sql: "EXISTS (SELECT 1 FROM Course WHERE id=? AND organizationId=?)",
            values: [resourceId, organizationId],
          },
        ),
      );
    }
    if (resource === "enrollments") {
      const b = enrollmentSchema.parse(raw);
      const member = await prisma.membership.findFirst({
        where: { userId: b.userId, organizationId, status: "ACTIVE" },
      });
      const course = await prisma.course.findFirst({
        where: { id: b.courseId, organizationId },
      });
      if (!member || !course)
        throw new ApiProblem(404, "Active member or course not found.");
      const existing = await prisma.enrollment.findUnique({
        where: { userId_courseId: { userId: b.userId, courseId: b.courseId } },
      });
      const enrollmentId = existing?.id || newId;
      const r = await mutation(
        b,
        { id: enrollmentId },
        (g, v) => [
          {
            sql: `INSERT INTO Enrollment(id,organizationId,userId,courseId,status,progress,attempts,dueAt) SELECT ?,?,?,?,'NOT_STARTED',0,0,? WHERE ${g} ON CONFLICT(userId,courseId) DO UPDATE SET dueAt=excluded.dueAt`,
            values: [
              enrollmentId,
              organizationId,
              b.userId,
              b.courseId,
              b.dueAt ? Date.parse(b.dueAt) : null,
              ...v,
            ],
          },
        ],
        [
          {
            type: "course.assigned",
            data: { courseId: b.courseId, userId: b.userId },
          },
        ],
        {
          sql: "EXISTS (SELECT 1 FROM Membership WHERE userId=? AND organizationId=? AND status='ACTIVE') AND EXISTS (SELECT 1 FROM Course WHERE id=? AND organizationId=?)",
          values: [b.userId, organizationId, b.courseId, organizationId],
        },
      );
      const enrolled = await prisma.enrollment.findUnique({
        where: { userId_courseId: { userId: b.userId, courseId: b.courseId } },
        select: {
          id: true,
          userId: true,
          courseId: true,
          dueAt: true,
          status: true,
        },
      });
      return json(
        { data: enrolled, replayed: r.replayed },
        r.replayed ? 200 : 201,
      );
    }
    if (resource === "events" && !action) {
      const b = eventSchema.parse(raw);
      if (b.endAt && Date.parse(b.endAt) < Date.parse(b.startAt))
        throw new ApiProblem(400, "Event end must follow start.");
      const { name, status, ...config } = b;
      return await result(
        mutation(
          b,
          { id: newId },
          (g, v) => [
            {
              sql: `INSERT INTO WorkflowDefinition(id,organizationId,kind,name,status,configJson) SELECT ?,?,'EVENT',?,?,? WHERE ${g}`,
              values: [
                newId,
                organizationId,
                name,
                status,
                JSON.stringify(config),
                ...v,
              ],
            },
          ],
          [{ type: "event.created", data: { workflowId: newId } }],
        ),
      );
    }
    const kind = resource === "events" ? "EVENT" : "MEMBERSHIP";
    const workflow = await ownedWorkflow(organizationId, resourceId, kind);
    if (workflow.status !== "ACTIVE")
      throw new ApiProblem(409, "Workflow is not active.");
    const workflowConfig = JSON.parse(workflow.configJson) as Record<
      string,
      unknown
    >;
    const configuredPrice = Number(workflowConfig.price || 0),
      configuredCapacity = Number(workflowConfig.capacity || 0);
    if (
      !Number.isFinite(configuredPrice) ||
      configuredPrice < 0 ||
      configuredPrice > 100000 ||
      !Number.isInteger(configuredCapacity) ||
      configuredCapacity < 0 ||
      configuredCapacity > 100000 ||
      (workflowConfig.approvalRequired !== undefined &&
        typeof workflowConfig.approvalRequired !== "boolean")
    ) {
      throw new ApiProblem(
        409,
        "Review the workflow pricing, capacity and approval configuration first.",
      );
    }
    if (action === "registrations" || action === "submissions") {
      const b = submissionSchema.parse(raw);
      const r = await mutation(
        b,
        { id: newId },
        (g, v) => [
          {
            sql: `INSERT INTO WorkflowSubmission(id,organizationId,workflowId,kind,name,email,phone,company,notes,status,paymentStatus,amountCents)
 SELECT ?,?,?,?,?,?,?,?,?,CASE WHEN kind='MEMBERSHIP' AND json_extract(configJson,'$.approvalRequired')=1 THEN 'PENDING_REVIEW'
 WHEN kind='EVENT' AND CAST(COALESCE(json_extract(configJson,'$.capacity'),0) AS INTEGER)>0 AND (SELECT COUNT(*) FROM WorkflowSubmission WHERE workflowId=? AND status NOT IN ('REJECTED','CANCELLED','WAITLISTED'))>=CAST(json_extract(configJson,'$.capacity') AS INTEGER) THEN 'WAITLISTED'
 WHEN CAST(COALESCE(json_extract(configJson,'$.price'),0) AS REAL)>0 THEN 'PAYMENT_PENDING' WHEN kind='MEMBERSHIP' THEN 'APPROVED' ELSE 'REGISTERED' END,
 CASE WHEN CAST(COALESCE(json_extract(configJson,'$.price'),0) AS REAL)>0 THEN 'PENDING' ELSE 'NOT_REQUIRED' END,
 CAST(ROUND(MAX(0,CAST(COALESCE(json_extract(configJson,'$.price'),0) AS REAL))*100) AS INTEGER)
 FROM WorkflowDefinition WHERE id=? AND organizationId=? AND status='ACTIVE' AND ${g}`,
            values: [
              newId,
              organizationId,
              resourceId,
              kind,
              b.name,
              b.email,
              b.phone,
              b.company,
              b.notes,
              resourceId,
              resourceId,
              organizationId,
              ...v,
            ],
          },
        ],
        [
          {
            type:
              kind === "EVENT"
                ? "event.registration.received"
                : "membership.application.received",
            data: { workflowId: resourceId, submissionId: newId },
          },
        ],
        {
          sql: "EXISTS (SELECT 1 FROM WorkflowDefinition WHERE id=? AND organizationId=? AND kind=? AND status='ACTIVE' AND configJson=?)",
          values: [resourceId, organizationId, kind, workflow.configJson],
        },
      );
      const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
        "SELECT id,status,paymentStatus,amountCents FROM WorkflowSubmission WHERE id=? AND organizationId=?",
        r.data.id,
        organizationId,
      );
      return json(
        {
          data: rows[0],
          replayed: r.replayed,
          reviewUrl: `/workspace/workflows`,
        },
        r.replayed ? 200 : 201,
      );
    }
    if (action === "attendance") {
      const b = z.object({ userId: id }).strict().parse(raw);
      const member = await prisma.membership.findFirst({
        where: { organizationId, userId: b.userId, status: "ACTIVE" },
        include: { user: { select: { email: true } } },
      });
      if (!member) throw new ApiProblem(404, "Active member not found.");
      const c = JSON.parse(workflow.configJson) as Record<string, unknown>;
      const credits = Number(c.ceuCredits || 0),
        category = String(c.creditCategory || "GENERAL");
      if (!Number.isFinite(credits) || credits < 0 || credits > 1000)
        throw new ApiProblem(
          409,
          "Review the event credit configuration first.",
        );
      const credentialCode = `ICA-${randomUUID().split("-")[0].toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
      const issueCertificate = ["ATTENDANCE", "COMPLETE_EVENT"].includes(
        String(c.certificateRule),
      );
      const credentialId = randomUUID();
      const eligibility: Sql = {
        sql: `EXISTS (SELECT 1 FROM Membership WHERE organizationId=? AND userId=? AND status='ACTIVE') AND EXISTS (SELECT 1 FROM WorkflowDefinition w JOIN WorkflowSubmission s ON s.workflowId=w.id AND s.organizationId=w.organizationId JOIN User u ON lower(u.email)=lower(s.email)
 WHERE w.id=? AND w.organizationId=? AND w.status='ACTIVE' AND w.kind='EVENT' AND u.id=? AND s.status='REGISTERED'
 AND (CAST(COALESCE(json_extract(w.configJson,'$.price'),0) AS REAL)<=0 OR s.paymentStatus='PAID') AND w.configJson=?)`,
        values: [
          organizationId,
          b.userId,
          resourceId,
          organizationId,
          b.userId,
          workflow.configJson,
        ],
      };
      return await result(
        mutation(
          b,
          { workflowId: resourceId, userId: b.userId },
          (g, v) => [
            {
              sql: `INSERT INTO EventAttendance(id,organizationId,workflowId,userId) SELECT ?,?,?,? WHERE ${g} ON CONFLICT(organizationId,workflowId,userId) DO NOTHING`,
              values: [newId, organizationId, resourceId, b.userId, ...v],
            },
            ...(credits > 0
              ? [
                  {
                    sql: `INSERT INTO CreditLedger(id,organizationId,userId,sourceType,sourceId,category,credits,description) SELECT ?,?,?,'EVENT',?,?,?,? WHERE ${g} ON CONFLICT(organizationId,userId,sourceType,sourceId) DO NOTHING`,
                    values: [
                      randomUUID(),
                      organizationId,
                      b.userId,
                      resourceId,
                      category,
                      credits,
                      workflow.name,
                      ...v,
                    ],
                  },
                ]
              : []),
            ...(issueCertificate
              ? [
                  {
                    sql: `INSERT INTO Credential(id,organizationId,userId,code,name,issuedAt,status) SELECT ?,?,?,?,?,?,'active' WHERE ${g} AND NOT EXISTS (SELECT 1 FROM Credential WHERE organizationId=? AND userId=? AND name=?)`,
                    values: [
                      credentialId,
                      organizationId,
                      b.userId,
                      credentialCode,
                      `${workflow.name} Attendance Certificate`,
                      now,
                      ...v,
                      organizationId,
                      b.userId,
                      `${workflow.name} Attendance Certificate`,
                    ],
                  },
                ]
              : []),
          ],
          [
            {
              type: "event.attendance.recorded",
              data: { workflowId: resourceId, userId: b.userId },
              condition: {
                sql: "EXISTS (SELECT 1 FROM EventAttendance WHERE id=?)",
                values: [newId],
              },
            },
            ...(issueCertificate
              ? [
                  {
                    type: "credential.issued",
                    data: {
                      credentialId,
                      userId: b.userId,
                      workflowId: resourceId,
                    },
                    condition: {
                      sql: "EXISTS (SELECT 1 FROM Credential WHERE id=?)",
                      values: [credentialId],
                    },
                  },
                ]
              : []),
          ],
          eligibility,
        ),
      );
    }
    throw new ApiProblem(404, "Endpoint not found.");
    });
  } catch (error) {
    if (error instanceof ApiProblem)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    if (error instanceof z.ZodError)
      return NextResponse.json(
        {
          error: "Invalid request fields.",
          fields: error.issues.map((i) => i.path.join(".")),
        },
        { status: 400 },
      );
    if (error instanceof Error && /UNIQUE constraint|P2002/.test(error.message))
      return NextResponse.json(
        {
          error:
            "This record already exists. Use its existing ID or the original Idempotency-Key.",
        },
        { status: 409 },
      );
    console.error(
      "ICA_EXPANDED_API_FAILURE",
      error instanceof Error ? error.name : "unknown",
    );
    return NextResponse.json(
      {
        error:
          "Unable to complete API request. Retry with the same Idempotency-Key.",
      },
      { status: 503 },
    );
  }
}
