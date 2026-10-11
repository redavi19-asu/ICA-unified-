import { createHash, randomUUID } from "crypto";
import { applicationDatabase } from "../../../../lib/application-database";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../../lib/prisma";
import { createSession, sessionCookie } from "../../../../lib/auth";
import { emitOrganizationEvent } from "../../../../lib/organization-ops";
import { ensureUserSecurityState } from "../../../../lib/security";

const acceptSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(12).max(128),
});

export async function POST(request: Request) {
  const parsed = acceptSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Use a password with at least 12 characters." },
      { status: 400 },
    );
  }

  const tokenHash = createHash("sha256")
    .update(parsed.data.token)
    .digest("hex");
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash },
    include: { organization: true },
  });

  if (!invitation || invitation.status !== "PENDING") {
    return NextResponse.json(
      { error: "This invitation is no longer valid." },
      { status: 400 },
    );
  }
  if (invitation.expiresAt.getTime() < Date.now()) {
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: "EXPIRED" },
    });
    return NextResponse.json(
      { error: "This invitation has expired." },
      { status: 400 },
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: invitation.email },
  });
  if (existingUser) {
    const passwordMatches = await bcrypt.compare(
      parsed.data.password,
      existingUser.passwordHash,
    );
    if (!passwordMatches) {
      return NextResponse.json(
        {
          error:
            "Use your existing ICA Unified password to accept this invitation.",
        },
        { status: 401 },
      );
    }
  }

  const passwordHash = existingUser
    ? null
    : await bcrypt.hash(parsed.data.password, 12);

  let importedState: {
    desiredRole: string;
    desiredStatus: string;
    jobTitle: string | null;
  } | null = null;
  try {
    const importedRows = await prisma.$queryRawUnsafe<
      Array<{
        desiredRole: string;
        desiredStatus: string;
        jobTitle: string | null;
      }>
    >(
      `SELECT desiredRole, desiredStatus, jobTitle
       FROM MigrationMemberState
       WHERE organizationId = ? AND email = ?
       LIMIT 1`,
      invitation.organizationId,
      invitation.email,
    );
    importedState = importedRows[0] || null;
  } catch {
    // Migration table may not exist for organizations that have never imported members.
  }

  const targetRole = importedState?.desiredRole || invitation.role;
  const targetStatus = importedState?.desiredStatus || "ONBOARDING";
  const targetJobTitle = importedState?.jobTitle ?? invitation.jobTitle;

  // D1 batch is atomic; Prisma's interactive transactions are unsupported on D1.
  const db = applicationDatabase();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS InvitationAcceptance (
    invitationId TEXT PRIMARY KEY NOT NULL REFERENCES Invitation(id) ON DELETE CASCADE,
    claimId TEXT NOT NULL, userId TEXT NOT NULL
  )`,
    )
    .run();
  const claimId = randomUUID();
  const userId = existingUser?.id || randomUUID();
  const expectedHash = existingUser?.passwordHash || passwordHash!;
  const now = Date.now();
  await db.batch([
    db
      .prepare(
        `INSERT INTO User (id,email,name,passwordHash,createdAt,updatedAt)
      SELECT ?,?,?,?, ?,? WHERE EXISTS (SELECT 1 FROM Invitation WHERE id=? AND status='PENDING' AND expiresAt>?)
      ON CONFLICT(email) DO NOTHING`,
      )
      .bind(
        userId,
        invitation.email,
        invitation.name,
        expectedHash,
        now,
        now,
        invitation.id,
        now,
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO InvitationAcceptance(invitationId,claimId,userId)
      SELECT i.id,?,u.id FROM Invitation i JOIN User u ON u.email=i.email
      WHERE i.id=? AND i.status='PENDING' AND i.expiresAt>? AND u.passwordHash=?`,
      )
      .bind(claimId, invitation.id, now, expectedHash),
    db
      .prepare(
        `INSERT INTO Membership(id,userId,organizationId,role,status,jobTitle,joinedAt)
      SELECT ?,a.userId,?,?,?,?,? FROM InvitationAcceptance a WHERE a.invitationId=? AND a.claimId=?
      ON CONFLICT(userId,organizationId) DO UPDATE SET role=excluded.role,status=excluded.status,jobTitle=excluded.jobTitle`,
      )
      .bind(
        randomUUID(),
        invitation.organizationId,
        targetRole,
        targetStatus,
        targetJobTitle,
        now,
        invitation.id,
        claimId,
      ),
    db
      .prepare(
        `INSERT INTO Activity(id,organizationId,actorId,type,message,createdAt)
      SELECT ?,?,userId,'PEOPLE_INVITE_ACCEPTED',?,? FROM InvitationAcceptance WHERE invitationId=? AND claimId=?`,
      )
      .bind(
        randomUUID(),
        invitation.organizationId,
        invitation.name + " joined " + invitation.organization.name + ".",
        now,
        invitation.id,
        claimId,
      ),
    db
      .prepare(
        `UPDATE Invitation SET status='ACCEPTED',acceptedAt=? WHERE id=? AND EXISTS
      (SELECT 1 FROM InvitationAcceptance WHERE invitationId=? AND claimId=?)`,
      )
      .bind(now, invitation.id, invitation.id, claimId),
  ]);
  const claim = await db
    .prepare(
      "SELECT userId FROM InvitationAcceptance WHERE invitationId=? AND claimId=?",
    )
    .bind(invitation.id, claimId)
    .first<{ userId: string }>();
  if (!claim)
    return NextResponse.json(
      {
        error:
          "This invitation was already accepted or changed. Sign in or request a new invitation.",
      },
      { status: 409 },
    );
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: claim.userId },
  });
  const membership = await prisma.membership.findUniqueOrThrow({
    where: {
      userId_organizationId: {
        userId: user.id,
        organizationId: invitation.organizationId,
      },
    },
  });
  const result = { user, membership };

  await ensureUserSecurityState(result.user.id, true);

  try {
    await emitOrganizationEvent(invitation.organizationId, "member.activated", {
      membershipId: result.membership.id,
      userId: result.user.id,
      name: result.user.name,
      email: result.user.email,
      role: result.membership.role,
      status: result.membership.status,
    });
  } catch (error) {
    console.error("ICA_MEMBER_ACTIVATED_WEBHOOK_ERROR", error);
  }

  const token = await createSession({
    userId: result.user.id,
    organizationId: invitation.organizationId,
    organizationSlug: invitation.organization.slug,
    role: result.membership.role,
  });

  const response = NextResponse.json({ ok: true, redirectTo: "/workspace" });
  response.cookies.set(sessionCookie.name, token, sessionCookie.options);
  return response;
}
