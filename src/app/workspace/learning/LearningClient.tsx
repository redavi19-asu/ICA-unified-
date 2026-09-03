'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './learning.module.css';

type Course = {
  id: string;
  title: string;
  description: string | null;
  durationMin: number;
  required: boolean;
  passingScore: number;
  published: boolean;
  lessonCount: number;
  assignedCount: number;
  enrollment: null | {
    id: string;
    status: string;
    progress: number;
    score: number | null;
    dueAt: string | null;
    credential: { id: string } | null;
  };
};

export default function LearningClient({ organizationName, currentRole, courses }: { organizationName: string; currentRole: string; courses: Course[] }) {
  const router = useRouter();
  const [showBuilder, setShowBuilder] = useState(false);
  const [message, setMessage] = useState('Choose a course, continue assigned training, or build a new learning path.');
  const canBuild = ['OWNER', 'ADMIN', 'MANAGER'].includes(currentRole);

  const stats = useMemo(() => ({
    published: courses.filter((c) => c.published).length,
    required: courses.filter((c) => c.required).length,
    assigned: courses.reduce((sum, c) => sum + c.assignedCount, 0),
    complete: courses.filter((c) => c.enrollment?.status === 'COMPLETE').length,
  }), [courses]);

  async function createCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/learning/courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.get('title'),
        description: form.get('description'),
        durationMin: Number(form.get('durationMin') || 0),
        passingScore: Number(form.get('passingScore') || 80),
        certificateValidDays: Number(form.get('certificateValidDays') || 0) || null,
        required: form.get('required') === 'on',
      }),
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || 'Unable to create course.');
    router.push(`/workspace/learning/${data.course.id}`);
    router.refresh();
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <a className={styles.back} href="/workspace">← WORKSPACE</a>
          <p className={styles.eyebrow}>{organizationName.toUpperCase()} / LEARNING FIELD</p>
          <h1>LEARNING<br />ENGINE</h1>
          <p className={styles.intro}>Courses, assignments, progress, quizzes, and credentials live in one continuous path.</p>
        </div>
        {canBuild && <button className={styles.primary} onClick={() => setShowBuilder((v) => !v)}>{showBuilder ? 'CLOSE BUILDER' : '+ BUILD COURSE'}</button>}
      </header>

      <section className={styles.metrics}>
        <div><span>PUBLISHED</span><strong>{stats.published}</strong></div>
        <div><span>REQUIRED</span><strong>{stats.required}</strong></div>
        <div><span>ASSIGNMENTS</span><strong>{stats.assigned}</strong></div>
        <div><span>MY COMPLETE</span><strong>{stats.complete}</strong></div>
      </section>

      {showBuilder && canBuild && (
        <section className={styles.builder}>
          <div><p className={styles.eyebrow}>COURSE SEED</p><h2>Start with the outcome.</h2><p>Create the course shell here, then add text, video, document, and quiz lessons inside it.</p></div>
          <form onSubmit={createCourse} className={styles.form}>
            <input name="title" required minLength={3} placeholder="Course title" />
            <textarea name="description" placeholder="What should employees know or be able to do?" rows={3} />
            <div className={styles.formGrid}>
              <input name="durationMin" type="number" min="0" defaultValue="30" aria-label="Duration in minutes" />
              <input name="passingScore" type="number" min="1" max="100" defaultValue="80" aria-label="Passing score" />
              <input name="certificateValidDays" type="number" min="0" defaultValue="365" aria-label="Certificate valid days" />
            </div>
            <label className={styles.check}><input name="required" type="checkbox" defaultChecked /> Required training</label>
            <button className={styles.primary} type="submit">CREATE + OPEN →</button>
          </form>
        </section>
      )}

      <section className={styles.catalog}>
        {courses.map((course, index) => {
          const enrollment = course.enrollment;
          return (
            <article className={styles.course} key={course.id}>
              <div className={styles.index}>{String(index + 1).padStart(2, '0')}</div>
              <div className={styles.courseBody}>
                <div className={styles.tags}><span>{course.required ? 'REQUIRED' : 'OPTIONAL'}</span><span>{course.lessonCount} LESSONS</span><span>{course.durationMin} MIN</span></div>
                <h2>{course.title}</h2>
                <p>{course.description || 'No description yet.'}</p>
                {enrollment && <div className={styles.progressLine}><i style={{ width: `${enrollment.progress}%` }} /><span>{enrollment.status.replaceAll('_', ' ')} · {enrollment.progress}%{enrollment.score !== null ? ` · ${enrollment.score}% score` : ''}</span></div>}
              </div>
              <div className={styles.courseAction}>
                <a href={`/workspace/learning/${course.id}`}>{enrollment?.status === 'COMPLETE' ? 'REVIEW' : enrollment ? 'CONTINUE' : canBuild ? 'MANAGE' : 'VIEW'} →</a>
                {enrollment?.credential && <a className={styles.credential} href={`/workspace/certificates/${enrollment.credential.id}`}>CREDENTIAL</a>}
              </div>
            </article>
          );
        })}
      </section>
      <p className={styles.message}>{message}</p>
    </main>
  );
}
