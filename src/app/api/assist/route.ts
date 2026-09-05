import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '../../../lib/auth';

const schema = z.object({
  question: z.string().min(2).max(1200),
});

const ICA_KNOWLEDGE = `
You are ICA Assist, the in-product help desk for ICA Unified.

ICA Unified is an association operating system combining AMS, LMS, credentials, documents, compliance, reporting, website integration, and business workflows around one organization-scoped member record.

Current navigation and behavior:
- Dashboard: organization overview and association operations metrics.
- Workflows: Workflow Studio. Use this for membership programs and events/webinars.
- Membership Program workflow: membership name/tier, price, billing cadence, application requirement, approval requirement, qualifications, member benefits, renewal reminder window, confirmation email, and draft/publish status.
- Event / Webinar workflow: event title/type, date/time, ticket price, member discount, capacity, Zoom/meeting/external link, CEU/credit value, certificate rule, confirmation email, and draft/publish status.
- Learning: courses, lessons, training and education.
- People: member/user records and organization membership.
- Credentials: credentials/certificates and verification records.
- Documents: controlled documents and acknowledgments.
- Reports: organization reporting.
- Tools: Owner/Admin area for data import/migration, website integration, API/webhooks, domain/DNS, and future export/backup.
- Platform/Super Admin: platform-level company health, diagnostics, analytics and support controls. This is not a normal organization-user area.

Help style:
1. Give the shortest useful answer first.
2. Give exact ICA navigation steps, e.g. "Workflows → Event / Webinar".
3. Do not invent buttons, screens, billing features, invoice features, Stripe features, Zoom API automation, or functionality that is not listed above.
4. If the user asks for something ICA does not yet implement, say that clearly, then explain the closest current workflow and what would need to be added.
5. Prefer 3-6 numbered steps, not long essays.
6. Never expose another organization's information or suggest bypassing permissions.
7. When helpful, distinguish between what ICA already does and what is planned.
`;

function fallbackAnswer(question: string) {
  const q = question.toLowerCase();

  if (q.includes('event') || q.includes('webinar') || q.includes('registration')) {
    return 'Go to Workflows → Event / Webinar. Enter the event title/type, date and time, ticket price, member discount, capacity, meeting or Zoom link, CEU value, certificate rule, and confirmation email. Turn on “Publish registration now” when you are ready, then choose Save + Publish.';
  }

  if (q.includes('membership') || q.includes('member level') || q.includes('associate')) {
    return 'Go to Workflows → Membership Program. Set the membership name, price and billing cadence, qualification requirements, application/approval rules, member benefits, renewal reminder window, and confirmation email. Save as a draft or publish it.';
  }

  if (q.includes('ceu') || q.includes('credit') || q.includes('certificate')) {
    return 'For an event or webinar, go to Workflows → Event / Webinar and enter the CEU / credit value plus the certificate rule. ICA will keep those education rules with that workflow. Use Credentials for credential records and Learning for course content.';
  }

  if (q.includes('import') || q.includes('migration') || q.includes('csv') || q.includes('excel')) {
    return 'Owners and admins can go to Tools → Data Import / Migration. Select the source file there. ICA currently stages the file for mapping before any database write, so the safe field-mapping/import engine is the next layer of that tool.';
  }

  if (q.includes('invoice')) {
    return 'ICA Unified does not have the registration-invoice flow wired yet, so I do not want to point you to a button that does not exist. The event price and registration setup live under Workflows → Event / Webinar. Billing/invoicing automation is a feature that still needs to be connected.';
  }

  return 'I can help with ICA Unified navigation and setup. Try asking about memberships, events/webinars, registrations, CEUs, credentials, people, learning, documents, reports, imports, website integration, or platform administration.';
}

export async function POST(request: Request) {
  try {
    await requireSession();
    const { question } = schema.parse(await request.json());
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
