import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '../../../lib/auth';
import { prisma } from '../../../lib/prisma';
import { getMemberComplianceSummary } from '../../../lib/compliance';

const schema = z.object({
  question: z.string().min(2).max(1200),
});

const ICA_KNOWLEDGE = `
You are ICA Assist, the in-product help desk for ICA Unified.

ICA Unified is an association operating system combining AMS, LMS, credentials, CE/compliance, documents, reporting, website integration, and business workflows around one organization-scoped member record.

Current navigation and behavior:
- Dashboard: organization overview and association operations metrics.
- Workflows: Workflow Studio for membership programs and events/webinars, including live public application/registration pages, submissions, review states, capacity/waitlist behavior, and organization payment handoff.
- Membership Program workflow: membership name/tier, price, billing cadence, application requirement, approval requirement, qualifications, member benefits, renewal reminder window, CE credits/category required for renewal, confirmation email, draft/active status, live public application URL, staff review, and secure ICA activation after approval. Paid memberships use the organization Stripe Connect account when it is ready.
- Event / Webinar workflow: event title/type, date/time, ticket price, member discount, capacity, meeting link, CE credit value/category, certificate rule, confirmation email, draft/active status, live public registration URL, capacity/waitlist handling, and Stripe Connect payment when the organization account is ready.
- Learning: course creation, text/video/document/live lessons, quizzes, assignments, due dates, completion progress, passing scores, and automatic credentials. Course completion can also post configured CE credits.
- People: member/user records and organization membership.
- Credentials: organization credential/certificate records and verification.
- Compliance: license/certification CE requirements, course credit rules, QR event check-in generation, and renewal/compliance controls.
- My Credential + CE Wallet: a member view combining digital membership identity, credentials, CE transcript, renewal readiness, and recommended courses.
- QR attendance: members scan an event QR, sign in, confirm attendance, and configured event credits are posted to the same CE ledger. Attendance certificate rules can issue a credential automatically.
- Documents: controlled document text/file content, secure member review, version tracking, and acknowledgments.
- Reports: organization reporting.
- Tools: Owner/Admin safe member CSV migration with field mapping, preview, duplicate handling, activation records, and confirmation before database write.
- Integrations: Owner/Admin center for tenant-scoped API keys, signed HTTPS webhooks, transactional email delivery/outbox retry, custom-domain DNS ownership verification and host resolution, member CSV export, and full organization JSON backup. The versioned member API supports GET/POST at /api/v1/members.
- Billing: Owner/Admin subscription flow for ICA Unified Professional at $249/month. Company SaaS billing stays separate from member money. Stripe Connect Express onboarding lets each organization receive paid membership/event workflow transactions through its own connected account.
- Platform/Super Admin: platform-level company health, diagnostics, analytics and support controls.

Help style:
1. Give the shortest useful answer first.
2. Give exact ICA navigation steps.
3. Do not invent buttons, screens, billing features, invoice features, Stripe features, or functionality not listed above.
4. If something is not implemented, say so clearly.
5. Prefer 3-6 numbered steps, not long essays.
6. Never expose another organization's information or suggest bypassing permissions.
`;

function fallbackAnswer(question: string) {
  const q = question.toLowerCase();

  if (q.includes('event') || q.includes('webinar') || q.includes('registration')) {
    return 'Go to Workflows → Event / Webinar. Enter the event details, CE credit value and category, certificate rule, and confirmation settings. After saving the event, admins can go to Compliance → QR Event Attendance to generate its check-in QR.';
  }

  if (q.includes('membership') || q.includes('member level') || q.includes('associate')) {
    return 'Go to Workflows → Membership Program. Configure pricing, qualifications, application/approval rules, renewal reminder window, and the CE credits/category required for renewal. Save it as a draft or mark it active. ACTIVE workflows get a public ICA application page and appear in Workflow Studio with submission review controls.';
  }

  if (q.includes('course') || q.includes('lesson') || q.includes('training') || q.includes('video') || q.includes('quiz')) {
    return 'Go to Learning. Build or open a course, manage its lessons and quiz, then use Compliance → Course Credit Engine to define how many CE credits the completed course awards.';
  }

  if (q.includes('ceu') || q.includes('credit') || q.includes('certificate') || q.includes('compliance')) {
    return 'Admins use Compliance to set CE requirements, course credit rules, and event QR check-ins. Members use My Credential + CE Wallet to see credits earned, credits still needed, certificates, transcript history, and recommended courses.';
  }

  if (q.includes('import') || q.includes('migration') || q.includes('csv') || q.includes('excel')) {
    return 'Owners and admins can go to Tools. Upload a member CSV, map the old columns to ICA fields, preview new/update/skip/bad rows, then confirm the import. New members receive secure activation records and imported status is preserved.';
  }

  if (q.includes('api') || q.includes('webhook') || q.includes('integration')) {
    return 'Owners and admins can go to Integrations. Create a tenant-scoped API key, use Bearer authentication with /api/v1/members, or add an HTTPS webhook. ICA signs webhook bodies with HMAC-SHA256 and shows each signing secret only when it is created.';
  }

  if (q.includes('domain') || q.includes('dns')) {
    return 'Go to Integrations → Custom Domain. Save the hostname, add the TXT verification record ICA gives you, then press Verify DNS Ownership. Final custom-host routing is activated later when Cloudflare account credentials are connected.';
  }

  if (q.includes('email')) {
    return 'ICA uses a transactional Email Outbox for invitations and other system messages. Delivery occurs through the managed email provider when that provider is configured; the Integrations screen shows the current provider/outbox status.';
  }

  if (q.includes('billing') || q.includes('stripe') || q.includes('249') || q.includes('subscription')) {
    return 'Go to Billing. ICA Unified Professional is $249/month for the company subscription. Member dues and event payments stay separate and use the organization Stripe Connect account. Complete Connect onboarding there to activate paid public workflows.';
  }

  if (q.includes('backup') || q.includes('export')) {
    return 'Go to Integrations → Export + Backup. Owners/admins can download a clean member CSV or a full organization JSON backup. Password hashes are not included.';
  }

  if (q.includes('invoice')) {
    return 'Event and membership workflow payments use the organization Stripe Connect account. Go to Billing to complete Connect onboarding, then ACTIVE paid workflows can open Stripe Checkout from their public registration/application page.';
  }

  return 'I can help with memberships, events, QR attendance, CE/compliance, learning, credentials, people, documents, reports, migration, API/webhooks, domain verification, email staging, billing, exports, or platform administration.';
}

async function personalRecordAnswer(question: string, organizationId: string, userId: string) {
  const q = question.toLowerCase();
  const asksCredits = q.includes('how many credit') || q.includes('credits do i') || q.includes('my credit') || q.includes('my ceu') || q.includes('my compliance') || q.includes('renewal');
  const asksCredential = (q.includes('my credential') || q.includes('my certificate') || q.includes('expire')) && !q.includes('create');

  if (asksCredits) {
    const summary = await getMemberComplianceSummary(organizationId, userId);
    if (!summary.requirements.length) {
      return 'Your organization has not configured a CE or renewal requirement yet. Open My Credential + CE Wallet to see any credits already posted to your record.';
    }

    const remaining = summary.requirements
      .filter((item) => !item.met)
      .map((item) => `${item.name}: ${item.gap.toFixed(1)} ${item.category} credit(s) still needed`);

    if (!remaining.length) {
      return `You currently have ${summary.earnedTotal.toFixed(1)} total CE credits posted, and every configured requirement is satisfied. Your renewal status is READY.`;
    }

    return `You have ${summary.earnedTotal.toFixed(1)} total CE credits posted. ${remaining.join('; ')}. Open My Credential + CE Wallet for the full transcript and recommended courses.`;
  }

  if (asksCredential) {
    const credentials = await prisma.credential.findMany({
      where: { organizationId, userId },
      orderBy: [{ expiresAt: 'asc' }, { issuedAt: 'desc' }],
      select: { name: true, status: true, expiresAt: true },
    });
    if (!credentials.length) return 'You do not have any issued credentials in this organization yet.';

    const now = Date.now();
    const expiring = credentials.filter((item) => item.expiresAt && item.expiresAt.getTime() > now && item.expiresAt.getTime() - now <= 60 * 86400000);
    const expired = credentials.filter((item) => item.expiresAt && item.expiresAt.getTime() <= now);

    return `You have ${credentials.length} credential(s). ${expired.length} expired and ${expiring.length} expire within 60 days. Open My Credential + CE Wallet to view and verify each record.`;
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const { membership } = await requireSession();
    const { question } = schema.parse(await request.json());

    const personal = await personalRecordAnswer(question, membership.organizationId, membership.userId);
    if (personal) {
      return NextResponse.json({ ok: true, mode: 'member-record', answer: personal });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: true, mode: 'guided', answer: fallbackAnswer(question) });
    }

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5.6-luna',
        instructions: ICA_KNOWLEDGE,
        input: question,
        max_output_tokens: 500,
      }),
    });

    if (!response.ok) {
      console.error('ICA_ASSIST_OPENAI_ERROR', response.status, await response.text());
      return NextResponse.json({ ok: true, mode: 'guided', answer: fallbackAnswer(question) });
    }

    const data = await response.json() as {
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    };

    const answer = data.output
      ?.flatMap((item) => item.content || [])
      .filter((item) => item.type === 'output_text' && item.text)
      .map((item) => item.text)
      .join('\n')
      .trim();

    return NextResponse.json({
      ok: true,
      mode: 'ai',
      answer: answer || fallbackAnswer(question),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Ask a short ICA Unified help question.' }, { status: 400 });
    }

    console.error('ICA_ASSIST_ERROR', error);
    return NextResponse.json({ error: 'ICA Assist is temporarily unavailable.' }, { status: 500 });
  }
}
