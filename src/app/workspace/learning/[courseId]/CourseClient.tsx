'use client';

import { ChangeEvent, FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../learning.module.css';
import StreamVideoPlayer from './StreamVideoPlayer';
import StreamVideoUploader from './StreamVideoUploader';

type LessonKind = 'TEXT' | 'VIDEO' | 'DOCUMENT' | 'QUIZ' | 'LIVE';

type Lesson = {
  id: string;
  order: number;
  title: string;
  kind: LessonKind;
  content: string;
  mediaUrl: string | null;
  completed: boolean;
  questions: Array<{ id: string; prompt: string; options: string[] }>;
};

type Course = {
  id: string;
  title: string;
  description: string | null;
  durationMin: number;
  required: boolean;
  passingScore: number;
  certificateValidDays: number | null;
  lessons: Lesson[];
};

type Enrollment = null | {
  id: string;
  status: string;
  progress: number;
  score: number | null;
  dueAt: string | null;
  credentialId: string | null;
};

type Member = { id: string; name: string; email: string; role: string };

function getVideoSource(url: string | null) {
  if (!url || url.startsWith('stream:')) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace('www.', '');
    if (host === 'youtu.be') return { type: 'embed' as const, url: `https://www.youtube.com/embed/${parsed.pathname.slice(1)}` };
    if (host.includes('youtube.com')) {
      const id = parsed.searchParams.get('v');
      if (id) return { type: 'embed' as const, url: `https://www.youtube.com/embed/${id}` };
      if (parsed.pathname.startsWith('/embed/')) return { type: 'embed' as const, url };
    }
    if (host.includes('vimeo.com')) {
      const id = parsed.pathname.split('/').filter(Boolean).pop();
      if (id) return { type: 'embed' as const, url: `https://player.vimeo.com/video/${id}` };
    }
    if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(url)) return { type: 'video' as const, url };
  } catch {
    return null;
  }
  return null;
}

function formatDueDate(value: string | null) {
  if (!value) return 'No due date';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

export default function CourseClient({ organizationName, currentRole, course, enrollment, members }: { organizationName: string; currentRole: string; course: Course; enrollment: Enrollment; members: Member[] }) {
  const router = useRouter();
  const [activeId, setActiveId] = useState(course.lessons.find((l) => !l.completed)?.id || course.lessons[0]?.id || '');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [message, setMessage] = useState(enrollment ? `Progress ${enrollment.progress}% · ${enrollment.status.replaceAll('_', ' ')}` : 'This course is not assigned to you yet.');
  const [showAdmin, setShowAdmin] = useState(false);
  const [mediaUrl, setMediaUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const canManage = ['OWNER', 'ADMIN', 'MANAGER'].includes(currentRole);
  const lesson = useMemo(() => course.lessons.find((item) => item.id === activeId) || course.lessons[0], [activeId, course.lessons]);
  const videoSource = useMemo(() => lesson?.kind === 'VIDEO' ? getVideoSource(lesson.mediaUrl) : null, [lesson]);
  const isStreamVideo = lesson?.kind === 'VIDEO' && Boolean(lesson.mediaUrl?.startsWith('stream:'));

  async function completeLesson() {
    if (!lesson) return;
    const response = await fetch('/api/learning/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId: course.id, lessonId: lesson.id }),
    });
    const data = await response.json();
    setMessage(data.message || data.error || 'Progress updated.');
    if (response.ok) router.refresh();
  }

  async function submitQuiz() {
    if (!lesson) return;
    const response = await fetch('/api/learning/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId: course.id, lessonId: lesson.id, answers }),
    });
    const data = await response.json();
    setMessage(data.message || data.error || `Quiz score: ${data.score ?? 0}%`);
    if (response.ok && data.passed) router.refresh();
  }

  async function uploadCourseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setMessage(`Uploading ${file.name} to private course storage...`);
    const payload = new FormData();
    payload.append('file', file);
    payload.append('courseId', course.id);

    try {
      const response = await fetch('/api/storage/upload', { method: 'POST', body: payload });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error || 'Unable to upload course file.');
        return;
      }
      setMediaUrl(data.url);
      setMessage(`${data.name} uploaded securely. Add the lesson to attach it.`);
    } catch {
      setMessage('Unable to upload course file.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  async function addLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const options = [1, 2, 3, 4].map((n) => String(form.get(`option${n}`) || '')).filter(Boolean);
    const response = await fetch(`/api/learning/courses/${course.id}/lessons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.get('title'),
        kind: form.get('kind'),
        content: form.get('content'),
        mediaUrl: mediaUrl || null,
        question: form.get('question') || null,
        options,
        correctAnswer: form.get('correctAnswer') || null,
      }),
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || 'Unable to add lesson.');
    setMessage('Lesson added.');
    event.currentTarget.reset();
    setMediaUrl('');
    router.refresh();
  }

  async function assignCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const userIds = form.getAll('userId').map(String);
    const response = await fetch('/api/learning/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId: course.id, userIds, dueAt: form.get('dueAt') || null }),
    });
    const data = await response.json();
    setMessage(data.message || data.error || 'Assignments updated.');
    if (response.ok) router.refresh();
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <a className={styles.back} href="/workspace/learning">← LEARNING ENGINE</a>
          <p className={styles.eyebrow}>{organizationName.toUpperCase()} / COURSE</p>
          <h1>{course.title}</h1>
          <p className={styles.intro}>{course.description}</p>
        </div>
        <div className={styles.courseAction}>
          {enrollment?.credentialId && <a href={`/workspace/certificates/${enrollment.credentialId}`}>VIEW CREDENTIAL →</a>}
          {canManage && <button className={styles.secondary} onClick={() => setShowAdmin((v) => !v)}>{showAdmin ? 'CLOSE TOOLS' : 'MANAGE COURSE'}</button>}
        </div>
      </header>

      <section className={styles.metrics}>
        <div><span>LESSONS</span><strong>{course.lessons.length}</strong></div>
        <div><span>DURATION</span><strong>{course.durationMin}m</strong></div>
        <div><span>PASS</span><strong>{course.passingScore}%</strong></div>
        <div><span>MY PROGRESS</span><strong>{enrollment?.progress ?? 0}%</strong></div>
      </section>

      {enrollment && <section className={styles.courseStatus}>
        <div><span>STATUS</span><strong>{enrollment.status.replaceAll('_', ' ')}</strong></div>
        <div><span>DUE</span><strong>{formatDueDate(enrollment.dueAt)}</strong></div>
        <div><span>CERTIFICATE</span><strong>{course.certificateValidDays ? `${course.certificateValidDays} days` : 'No expiration'}</strong></div>
      </section>}

      <section className={styles.lessonLayout}>
        <aside className={styles.lessonRail}>
          {course.lessons.map((item) => (
            <button key={item.id} className={`${styles.lessonButton} ${item.id === lesson?.id ? styles.lessonButtonActive : ''}`} onClick={() => { setActiveId(item.id); setMessage(item.completed ? 'Lesson already complete.' : `Lesson ${item.order} ready.`); }}>
              <span className={styles.lessonNumber}>{item.completed ? '✓' : String(item.order).padStart(2, '0')}</span>
              <span><span className={styles.lessonType}>{item.kind}</span><span className={styles.lessonTitle}>{item.title}</span></span>
            </button>
          ))}
        </aside>

        <article className={styles.lessonStage}>
          {lesson ? <>
            <p className={styles.eyebrow}>LESSON {String(lesson.order).padStart(2, '0')} / {lesson.kind}</p>
            <h2>{lesson.title}</h2>

            {isStreamVideo && <StreamVideoPlayer lessonId={lesson.id} title={lesson.title} />}
            {lesson.kind === 'VIDEO' && videoSource?.type === 'embed' && (
              <div className={styles.mediaFrame}><iframe src={videoSource.url} title={lesson.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div>
            )}
            {lesson.kind === 'VIDEO' && videoSource?.type === 'video' && (
              <div className={styles.mediaFrame}><video controls preload="metadata" src={videoSource.url}>Your browser does not support embedded video.</video></div>
            )}
            {lesson.kind === 'LIVE' && lesson.mediaUrl && (
              <div className={styles.liveSession}>
                <span>LIVE INSTRUCTOR SESSION</span>
                <strong>Join the scheduled class when your instructor is ready.</strong>
                <a href={lesson.mediaUrl} target="_blank" rel="noreferrer">JOIN ZOOM / TEAMS / MEET ↗</a>
              </div>
            )}

            <div className={styles.lessonCopy}>{lesson.content}</div>

            {lesson.mediaUrl && lesson.kind !== 'LIVE' && !lesson.mediaUrl.startsWith('stream:') && (
              <a className={styles.mediaLink} href={lesson.mediaUrl} target="_blank" rel="noreferrer">{lesson.kind === 'VIDEO' ? 'OPEN VIDEO IN NEW TAB' : 'OPEN COURSE RESOURCE'} ↗</a>
            )}

            {lesson.kind === 'QUIZ' ? (
              <div className={styles.quiz}>
                {lesson.questions.map((question, index) => (
                  <div className={styles.question} key={question.id}>
                    <strong>{index + 1}. {question.prompt}</strong>
                    {question.options.map((option) => <label className={styles.option} key={option}><input type="radio" name={question.id} value={option} checked={answers[question.id] === option} onChange={() => setAnswers((current) => ({ ...current, [question.id]: option }))} />{option}</label>)}
                  </div>
                ))}
                <button className={styles.primary} onClick={submitQuiz}>SUBMIT KNOWLEDGE CHECK →</button>
              </div>
            ) : <div className={styles.toolbar}><button className={styles.primary} onClick={completeLesson}>{lesson.completed ? 'RECORD AGAIN' : lesson.kind === 'LIVE' ? 'MARK ATTENDED' : 'MARK COMPLETE'} →</button></div>}
          </> : <p>No lessons have been added yet.</p>}
        </article>
      </section>

      {showAdmin && canManage && <section className={styles.adminGrid}>
        <div className={styles.adminPanel}>
          <p className={styles.eyebrow}>COURSE BUILDER</p><h3>Add a lesson</h3>
          <p className={styles.adminHint}>Build text lessons, attach private course files from R2, upload training video directly to Cloudflare Stream, embed external video, schedule live Zoom/Teams/Meet sessions, or create knowledge checks.</p>
          <form className={styles.form} onSubmit={addLesson}>
            <input name="title" required placeholder="Lesson title" />
            <select name="kind" defaultValue="TEXT"><option value="TEXT">Text lesson</option><option value="VIDEO">Video lesson</option><option value="DOCUMENT">Document / resource</option><option value="LIVE">Live instructor session</option><option value="QUIZ">Quiz</option></select>
            <textarea name="content" required rows={5} placeholder="Lesson instructions, learning objective, or quiz directions" />
            <input name="mediaUrl" value={mediaUrl} onChange={(event) => setMediaUrl(event.target.value)} placeholder="Video, document, Zoom, Teams, or Meet URL" />
            <StreamVideoUploader courseId={course.id} onUploaded={setMediaUrl} onMessage={setMessage} />
            <label className={styles.uploadBox}>
              <span>{uploading ? 'UPLOADING TO PRIVATE STORAGE...' : 'UPLOAD PDF / POWERPOINT / IMAGE / COURSE FILE'}</span>
              <input type="file" disabled={uploading} onChange={uploadCourseFile} accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.webp,.gif,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/*" />
              <small>Files are stored privately under this company and course in R2. Video uses the separate Cloudflare Stream path above.</small>
            </label>
            <input name="question" placeholder="Quiz question (for quiz lessons)" />
            <input name="option1" placeholder="Option 1" /><input name="option2" placeholder="Option 2" /><input name="option3" placeholder="Option 3" /><input name="option4" placeholder="Option 4" />
            <input name="correctAnswer" placeholder="Correct answer exactly as written above" />
            <button className={styles.primary}>ADD LESSON →</button>
          </form>
        </div>
        <div className={styles.adminPanel}>
          <p className={styles.eyebrow}>ASSIGNMENT CONTROL</p><h3>Send this course</h3>
          <p className={styles.adminHint}>Assign required training to selected people and set a due date. Completion and credentials stay tied to the same organization record.</p>
          <form className={styles.form} onSubmit={assignCourse}>
            <div className={styles.memberChecks}>{members.map((member) => <label key={member.id}><input name="userId" value={member.id} type="checkbox" /> <span><strong>{member.name}</strong><br />{member.email} · {member.role}</span></label>)}</div>
            <label>Due date <input name="dueAt" type="date" /></label>
            <button className={styles.primary}>ASSIGN SELECTED →</button>
          </form>
        </div>
      </section>}

      <p className={styles.message} aria-live="polite">{message}</p>
    </main>
  );
}
