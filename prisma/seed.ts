import bcrypt from 'bcryptjs';
import { LessonKind, PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function upsertCourse(
  organizationId: string,
  data: {
    title: string;
    description: string;
    durationMin: number;
    passingScore: number;
    certificateValidDays?: number;
    required: boolean;
  },
  lessons: Array<{
    title: string;
    kind: LessonKind;
    content: string;
    mediaUrl?: string;
    questions?: Array<{ prompt: string; options: string[]; correctAnswer: string; explanation: string }>;
  }>,
) {
  const course = await prisma.course.upsert({
    where: { organizationId_title: { organizationId, title: data.title } },
    update: data,
    create: { organizationId, ...data },
  });

  await prisma.lesson.deleteMany({ where: { courseId: course.id } });

  for (const [index, lesson] of lessons.entries()) {
    await prisma.lesson.create({
      data: {
        organizationId,
        courseId: course.id,
        order: index + 1,
        title: lesson.title,
        kind: lesson.kind,
        content: lesson.content,
        mediaUrl: lesson.mediaUrl,
        questions: lesson.questions
          ? {
              create: lesson.questions.map((question, questionIndex) => ({
                order: questionIndex + 1,
                prompt: question.prompt,
                optionsJson: JSON.stringify(question.options),
                correctAnswer: question.correctAnswer,
                explanation: question.explanation,
              })),
            }
          : undefined,
      },
    });
  }

  return course;
}

async function main() {
  const passwordHash = await bcrypt.hash('Demo123!', 12);
  const memberPasswordHash = await bcrypt.hash('Learn123!', 12);

  const organization = await prisma.organization.upsert({
    where: { slug: 'ica-demo' },
    update: { name: 'ICA Demo Company' },
    create: { name: 'ICA Demo Company', slug: 'ica-demo' },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@icaunified.local' },
    update: { passwordHash, name: 'Demo Administrator' },
    create: { name: 'Demo Administrator', email: 'admin@icaunified.local', passwordHash },
  });

  const employee = await prisma.user.upsert({
    where: { email: 'employee@icaunified.local' },
    update: { passwordHash: memberPasswordHash, name: 'Jordan Brooks' },
    create: { name: 'Jordan Brooks', email: 'employee@icaunified.local', passwordHash: memberPasswordHash },
  });

  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: admin.id, organizationId: organization.id } },
    update: { role: Role.OWNER, status: 'ACTIVE', jobTitle: 'Platform Administrator' },
    create: { userId: admin.id, organizationId: organization.id, role: Role.OWNER, status: 'ACTIVE', jobTitle: 'Platform Administrator' },
  });

  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: employee.id, organizationId: organization.id } },
    update: { role: Role.MEMBER, status: 'ACTIVE', jobTitle: 'Field Specialist' },
    create: { userId: employee.id, organizationId: organization.id, role: Role.MEMBER, status: 'ACTIVE', jobTitle: 'Field Specialist' },
  });

  const safety = await upsertCourse(
    organization.id,
    {
      title: 'Workplace Safety & Incident Reporting',
      description: 'A practical safety course covering hazard recognition, emergency response, incident reporting, and a scored knowledge check.',
      durationMin: 35,
      passingScore: 80,
      certificateValidDays: 365,
      required: true,
    },
    [
      {
        title: 'Safety Starts Before the Incident',
        kind: LessonKind.TEXT,
        content: 'A safe workplace depends on noticing risk before somebody gets hurt. Scan your work area before beginning a task. Look for blocked exits, damaged equipment, trip hazards, exposed wiring, spills, missing guards, unstable loads, and any condition that differs from normal. If a hazard can be corrected safely, correct it. If it cannot, isolate the area and notify the appropriate supervisor. Never assume another person has already reported it.',
      },
      {
        title: 'Recognizing and Controlling Hazards',
        kind: LessonKind.TEXT,
        content: 'Use the hierarchy of controls when deciding how to reduce risk. Removing the hazard is stronger than relying only on personal protective equipment. When elimination is not possible, use engineering controls, administrative procedures, training, and PPE as appropriate. Stop work when conditions create an immediate danger and escalate the issue instead of improvising around it.',
      },
      {
        title: 'Emergency Response',
        kind: LessonKind.VIDEO,
        content: 'During an emergency, protect life first. Follow posted evacuation or shelter procedures, call emergency services when needed, and use designated assembly areas. Do not re-enter an evacuated area until authorized. This demo lesson supports an external training-video URL so a company can attach its own media.',
        mediaUrl: 'https://www.osha.gov/emergency-preparedness',
      },
      {
        title: 'How to Report an Incident',
        kind: LessonKind.DOCUMENT,
        content: 'Report injuries, near misses, property damage, unsafe conditions, and security events as soon as possible. Record what happened, where and when it happened, who was involved, immediate actions taken, and any witnesses. Describe facts rather than assigning blame. Prompt reporting helps the organization protect employees, preserve evidence, identify patterns, and correct hazards.',
        mediaUrl: 'https://www.osha.gov/recordkeeping',
      },
      {
        title: 'Safety Knowledge Check',
        kind: LessonKind.QUIZ,
        content: 'Score at least 80% to complete this course and receive a one-year training credential.',
        questions: [
          {
            prompt: 'What should you do first when you notice a serious hazard that cannot be corrected safely?',
            options: ['Ignore it if nobody is nearby', 'Isolate the area and notify the appropriate person', 'Wait until the end of the shift', 'Take a photo and continue working'],
            correctAnswer: 'Isolate the area and notify the appropriate person',
            explanation: 'Unsafe conditions should be controlled and escalated rather than worked around.',
          },
          {
            prompt: 'Which control is generally stronger than relying only on PPE?',
            options: ['Eliminating the hazard', 'Working faster', 'Posting a reminder', 'Signing a waiver'],
            correctAnswer: 'Eliminating the hazard',
            explanation: 'Removing a hazard reduces exposure at the source.',
          },
          {
            prompt: 'Which event should be reported?',
            options: ['Only injuries requiring hospitalization', 'Only property damage', 'Injuries, near misses, hazards, and security events', 'Nothing unless a manager witnessed it'],
            correctAnswer: 'Injuries, near misses, hazards, and security events',
            explanation: 'Near misses and unsafe conditions can reveal problems before a more serious event occurs.',
          },
          {
            prompt: 'Incident reports should primarily contain what?',
            options: ['Facts about what happened', 'Who deserves blame', 'Rumors from coworkers', 'Only the final cost'],
            correctAnswer: 'Facts about what happened',
            explanation: 'Factual reporting supports a useful investigation and corrective action.',
          },
          {
            prompt: 'After an evacuation, when should you re-enter the area?',
            options: ['When you think it is safe', 'After five minutes', 'Only when authorized', 'When a coworker returns'],
            correctAnswer: 'Only when authorized',
            explanation: 'Re-entry should happen only after the responsible authority gives clearance.',
          },
        ],
      },
    ],
  );

  const orientation = await upsertCourse(
    organization.id,
    {
      title: 'New Employee Orientation',
      description: 'A clean onboarding path for expectations, communication, records, and first-week responsibilities.',
      durationMin: 22,
      passingScore: 80,
      required: true,
    },
    [
      { title: 'Welcome to the Organization', kind: LessonKind.TEXT, content: 'Your first week is about understanding how work moves through the organization, who owns decisions, where to get help, and what standards apply to your role. Keep your profile, emergency contact information, credentials, and required documents current.' },
      { title: 'Communication & Escalation', kind: LessonKind.TEXT, content: 'Use the normal team channel for routine work and the designated escalation path for urgent issues, safety concerns, customer-impacting incidents, or anything that requires management approval. Document important decisions so the next person can understand what happened.' },
      { title: 'Your ICA Unified Workspace', kind: LessonKind.TEXT, content: 'ICA Unified shows assignments, due dates, documents, credentials, and actions that need attention. Complete required items from your Learning field and keep credentials current before they expire.' },
      { title: 'Orientation Check', kind: LessonKind.QUIZ, content: 'Confirm the basics before completing orientation.', questions: [
        { prompt: 'Where should required training and due dates appear?', options: ['The Learning field', 'A private spreadsheet', 'A paper-only binder', 'Nowhere'], correctAnswer: 'The Learning field', explanation: 'The Learning field is designed to centralize required work.' },
        { prompt: 'What should happen with an urgent safety concern?', options: ['Follow the designated escalation path', 'Wait for the weekly meeting', 'Post it anonymously and leave', 'Ignore it'], correctAnswer: 'Follow the designated escalation path', explanation: 'Urgent risks should be escalated through the organization’s defined process.' },
      ] },
    ],
  );

  const cyber = await upsertCourse(
    organization.id,
    {
      title: 'Cybersecurity & Phishing Awareness',
      description: 'A short practical course on phishing, passwords, MFA, suspicious links, and reporting security events.',
      durationMin: 25,
      passingScore: 80,
      certificateValidDays: 365,
      required: true,
    },
    [
      { title: 'Phishing Signals', kind: LessonKind.TEXT, content: 'Be suspicious of unexpected urgency, requests to bypass normal process, mismatched sender domains, unusual attachments, login links, gift-card or payment requests, and messages asking for credentials. Verify sensitive requests through a trusted second channel.' },
      { title: 'Passwords and MFA', kind: LessonKind.TEXT, content: 'Use unique passwords or passphrases and a password manager when permitted. Never approve an MFA prompt you did not initiate. Repeated unexpected MFA prompts may indicate that somebody already knows your password.' },
      { title: 'Security Check', kind: LessonKind.QUIZ, content: 'Pass the check to complete the course.', questions: [
        { prompt: 'What should you do with an unexpected MFA approval request?', options: ['Approve it quickly', 'Deny it and report suspicious activity', 'Send the code to the requester', 'Disable MFA'], correctAnswer: 'Deny it and report suspicious activity', explanation: 'Unexpected MFA prompts can indicate attempted account access.' },
        { prompt: 'What is a good way to verify a suspicious payment request?', options: ['Reply to the same email', 'Use a trusted second communication channel', 'Click the included link', 'Forward your password'], correctAnswer: 'Use a trusted second communication channel', explanation: 'Independent verification helps defeat impersonation and compromised-email scams.' },
      ] },
    ],
  );

  for (const course of [safety, orientation, cyber]) {
    await prisma.enrollment.upsert({
      where: { userId_courseId: { userId: employee.id, courseId: course.id } },
      update: {},
      create: {
        organizationId: organization.id,
        userId: employee.id,
        courseId: course.id,
        dueAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });
  }

  await prisma.activity.create({
    data: { organizationId: organization.id, actorId: admin.id, type: 'system', message: 'ICA Unified demo learning catalog synchronized.' },
  });
}

main().finally(async () => prisma.$disconnect());
