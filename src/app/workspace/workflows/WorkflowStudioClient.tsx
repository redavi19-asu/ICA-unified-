'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './workflows.module.css';

type Workflow = {
  id: string;
  kind: 'MEMBERSHIP' | 'EVENT';
  name: string;
  status: 'DRAFT' | 'ACTIVE';
  config: Record<string, unknown>;
  updatedAt: string;
};

type Submission = {
  id: string;
  workflowId: string;
  kind: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  notes: string | null;
  status: string;
  paymentStatus: string;
  amountCents: number;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  organizationName: string;
  role: string;
};

const initialMembership = {
  name: '',
  price: '',
  billingCadence: 'YEARLY',
  applicationRequired: true,
  approvalRequired: true,
  qualifications: '',
  benefits: '',
  renewalWindowDays: '30',
  ceCreditsRequired: '',
  ceCategory: 'GENERAL',
  confirmationSubject: 'Your membership application was received',
  confirmationMessage: 'Thank you for applying. We will review your application and contact you with next steps.',
  active: false,
};

const initialEvent = {
  name: '',
  eventType: 'WEBINAR',
  startAt: '',
  price: '',
  memberDiscount: '',
  capacity: '',
  meetingLink: '',
  ceuCredits: '',
  creditCategory: 'GENERAL',
  certificateRule: 'COMPLETE_EVENT',
  checkinMode: 'SELF_SCAN',
  confirmationSubject: 'Registration confirmed',
  confirmationMessage: 'You are registered. Your event details and access link are included below.',
  active: false,
};

export default function WorkflowStudioClient({ organizationName, role }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<'MEMBERSHIP' | 'EVENT'>('MEMBERSHIP');
  const [membership, setMembership] = useState(initialMembership);
  const [event, setEvent] = useState(initialEvent);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [editingWorkflowId, setEditingWorkflowId] = useState<string | null>(null);

  async function loadWorkflows() {
    try {
      const response = await fetch('/api/workflows', { cache: 'no-store' });
      const data = await response.json();
      if (response.ok) setWorkflows(data.workflows || []);
    } finally {
      setLoading(false);
    }
  }


  async function loadSubmissions(workflow: Workflow) {
    setSelectedWorkflow(workflow);
    setSubmissionsLoading(true);
    setMessage('');
    const response = await fetch(`/api/workflows/${workflow.id}/submissions`, { cache: 'no-store' });
    const data = await response.json();
    setSubmissionsLoading(false);
    if (!response.ok) {
      setMessage(data.error || 'Unable to load workflow submissions.');
      return;
    }
    setSubmissions(data.submissions || []);
  }

  async function updateSubmission(submissionId: string, status: string) {
    if (!selectedWorkflow) return;
    const response = await fetch(`/api/workflows/${selectedWorkflow.id}/submissions`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissionId, status }),
    });
    const data = await response.json();
    setMessage(data.message || data.error || 'Submission updated.');
    if (response.ok) await loadSubmissions(selectedWorkflow);
  }

  useEffect(() => {
    loadWorkflows();
  }, []);

  function editWorkflow(workflow: Workflow) {
    setMessage('');
    setEditingWorkflowId(workflow.id);
    setTab(workflow.kind);

    if (workflow.kind === 'MEMBERSHIP') {
      setMembership({
        ...initialMembership,
        ...(workflow.config as Partial<typeof initialMembership>),
        name: workflow.name,
        active: workflow.status === 'ACTIVE',
      });
    } else {
      setEvent({
        ...initialEvent,
        ...(workflow.config as Partial<typeof initialEvent>),
        name: workflow.name,
        active: workflow.status === 'ACTIVE',
      });
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function setWorkflowStatus(workflow: Workflow, status: 'DRAFT' | 'ACTIVE') {
    const response = await fetch(`/api/workflows/${workflow.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const data = await response.json();
    setMessage(data.error || `${workflow.name} is now ${status}.`);
    if (response.ok) {
      if (selectedWorkflow?.id === workflow.id) {
        setSelectedWorkflow({ ...selectedWorkflow, status });
      }
      await loadWorkflows();
    }
  }

  async function saveMembership(eventObject: FormEvent) {
    eventObject.preventDefault();
    setSaving(true);
    setMessage('');

    const response = await fetch(editingWorkflowId ? `/api/workflows/${editingWorkflowId}` : '/api/workflows', {
      method: editingWorkflowId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingWorkflowId ? {
        name: membership.name,
        status: membership.active ? 'ACTIVE' : 'DRAFT',
        config: membership,
      } : {
        kind: 'MEMBERSHIP',
        name: membership.name,
        status: membership.active ? 'ACTIVE' : 'DRAFT',
        config: membership,
      }),
    });

    const data = await response.json();
    setSaving(false);

    if (!response.ok) {
      setMessage(data.error || 'Unable to save membership workflow.');
      return;
    }

    const wasEditing = Boolean(editingWorkflowId);
    setMembership(initialMembership);
    setEditingWorkflowId(null);
    setMessage(wasEditing ? 'Membership workflow updated.' : 'Membership workflow saved.');
    await loadWorkflows();
  }

  async function saveEvent(eventObject: FormEvent) {
    eventObject.preventDefault();
    setSaving(true);
    setMessage('');

    const response = await fetch(editingWorkflowId ? `/api/workflows/${editingWorkflowId}` : '/api/workflows', {
      method: editingWorkflowId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingWorkflowId ? {
        name: event.name,
        status: event.active ? 'ACTIVE' : 'DRAFT',
        config: event,
      } : {
        kind: 'EVENT',
        name: event.name,
        status: event.active ? 'ACTIVE' : 'DRAFT',
        config: event,
      }),
    });

    const data = await response.json();
    setSaving(false);

    if (!response.ok) {
      setMessage(data.error || 'Unable to save event workflow.');
      return;
    }

    const wasEditing = Boolean(editingWorkflowId);
    setEvent(initialEvent);
    setEditingWorkflowId(null);
    setMessage(wasEditing ? 'Event / webinar workflow updated.' : 'Event / webinar workflow saved.');
    await loadWorkflows();
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <button onClick={() => router.push('/workspace')}>← Workspace</button>
        <div>
          <p>ICA UNIFIED / ASSOCIATION WORKFLOWS</p>
          <h1>Workflow Studio</h1>
          <span>{organizationName} · {role}</span>
        </div>
      </header>

      <section className={styles.intro}>
        <div>
          <p className={styles.kicker}>BUILD THE BUSINESS TASK — NOT THE MAZE</p>
          <h2>Set up the whole workflow in one place.</h2>
        </div>
        <p>
          Create a membership program or event once. ICA Unified stores the pricing,
          approvals, qualifications, communications, education credits, and execution
          rules together. When a workflow is ACTIVE, ICA gives it a live public application or registration page.
        </p>
      </section>

      <section className={styles.tabs}>
        <button className={tab === 'MEMBERSHIP' ? styles.activeTab : ''} onClick={() => setTab('MEMBERSHIP')}>
          MEMBERSHIP PROGRAM
        </button>
        <button className={tab === 'EVENT' ? styles.activeTab : ''} onClick={() => setTab('EVENT')}>
          EVENT / WEBINAR
        </button>
      </section>

      {tab === 'MEMBERSHIP' ? (
        <form className={styles.builder} onSubmit={saveMembership}>
          <section>
            <p className={styles.step}>01 / MEMBERSHIP BASICS</p>
            <label>Membership name<input value={membership.name} onChange={(e) => setMembership({...membership, name:e.target.value})} placeholder="Associate Member" required /></label>
            <div className={styles.twoCol}>
              <label>Price<input value={membership.price} onChange={(e) => setMembership({...membership, price:e.target.value})} placeholder="150.00" inputMode="decimal" /></label>
              <label>Billing<select value={membership.billingCadence} onChange={(e) => setMembership({...membership, billingCadence:e.target.value})}><option value="YEARLY">Yearly</option><option value="MONTHLY">Monthly</option><option value="ONE_TIME">One time</option></select></label>
            </div>
            <label>Required qualifications<textarea value={membership.qualifications} onChange={(e) => setMembership({...membership, qualifications:e.target.value})} placeholder="Degree, certification, years of experience, uploaded proof..." /></label>
            <label>Member benefits<textarea value={membership.benefits} onChange={(e) => setMembership({...membership, benefits:e.target.value})} placeholder="Course discounts, board access, members-only resources..." /></label>
          </section>

          <section>
            <p className={styles.step}>02 / APPLICATION + RENEWAL</p>
            <Toggle label="Application required" value={membership.applicationRequired} onChange={(value) => setMembership({...membership, applicationRequired:value})} />
            <Toggle label="Admin approval required" value={membership.approvalRequired} onChange={(value) => setMembership({...membership, approvalRequired:value})} />
            <label>Renewal reminder window (days)<input value={membership.renewalWindowDays} onChange={(e) => setMembership({...membership, renewalWindowDays:e.target.value})} inputMode="numeric" /></label>
            <div className={styles.twoCol}>
              <label>CE credits required for renewal<input value={membership.ceCreditsRequired} onChange={(e) => setMembership({...membership, ceCreditsRequired:e.target.value})} placeholder="20" inputMode="decimal" /></label>
              <label>CE category<input value={membership.ceCategory} onChange={(e) => setMembership({...membership, ceCategory:e.target.value})} placeholder="GENERAL" /></label>
            </div>
          </section>

          <section>
            <p className={styles.step}>03 / CONFIRMATION</p>
            <label>Email subject<input value={membership.confirmationSubject} onChange={(e) => setMembership({...membership, confirmationSubject:e.target.value})} /></label>
            <label>Confirmation email<textarea value={membership.confirmationMessage} onChange={(e) => setMembership({...membership, confirmationMessage:e.target.value})} /></label>
            <Toggle label="Mark this membership configuration active" value={membership.active} onChange={(value) => setMembership({...membership, active:value})} />
          </section>

          <div className={styles.saveBar}>
            <span>One save stores membership, renewal CE rules, pricing, approval flow, and member communication together. ACTIVE workflows immediately receive a public application page.</span>
            <button disabled={saving}>{saving ? 'SAVING…' : editingWorkflowId ? 'UPDATE WORKFLOW' : membership.active ? 'SAVE + ACTIVATE' : 'SAVE DRAFT'}</button>
          </div>
        </form>
      ) : (
        <form className={styles.builder} onSubmit={saveEvent}>
          <section>
            <p className={styles.step}>01 / EVENT BASICS</p>
            <label>Event title<input value={event.name} onChange={(e) => setEvent({...event, name:e.target.value})} placeholder="Fall CEU Webinar" required /></label>
            <div className={styles.twoCol}>
              <label>Type<select value={event.eventType} onChange={(e) => setEvent({...event, eventType:e.target.value})}><option value="WEBINAR">Webinar</option><option value="CONFERENCE">Conference</option><option value="COURSE">Course</option><option value="MEETING">Board / Committee Meeting</option></select></label>
              <label>Date / time<input type="datetime-local" value={event.startAt} onChange={(e) => setEvent({...event, startAt:e.target.value})} /></label>
            </div>
            <div className={styles.threeCol}>
              <label>Ticket price<input value={event.price} onChange={(e) => setEvent({...event, price:e.target.value})} placeholder="75.00" /></label>
              <label>Member discount<input value={event.memberDiscount} onChange={(e) => setEvent({...event, memberDiscount:e.target.value})} placeholder="25.00" /></label>
              <label>Capacity<input value={event.capacity} onChange={(e) => setEvent({...event, capacity:e.target.value})} placeholder="250" /></label>
            </div>
          </section>

          <section>
            <p className={styles.step}>02 / ACCESS + EDUCATION</p>
            <label>Zoom / meeting / external access link<input value={event.meetingLink} onChange={(e) => setEvent({...event, meetingLink:e.target.value})} placeholder="https://zoom.us/..." /></label>
            <div className={styles.threeCol}>
              <label>CEU / credit value<input value={event.ceuCredits} onChange={(e) => setEvent({...event, ceuCredits:e.target.value})} placeholder="1.5" inputMode="decimal" /></label>
              <label>Credit category<input value={event.creditCategory} onChange={(e) => setEvent({...event, creditCategory:e.target.value})} placeholder="GENERAL" /></label>
              <label>Certificate rule<select value={event.certificateRule} onChange={(e) => setEvent({...event, certificateRule:e.target.value})}><option value="COMPLETE_EVENT">Issue after completion</option><option value="PASS_QUIZ">Issue after passing quiz</option><option value="ATTENDANCE">Issue after attendance</option><option value="NONE">No certificate</option></select></label>
            </div>
            <label>Event check-in mode
              <select value={event.checkinMode} onChange={(e) => setEvent({...event, checkinMode:e.target.value})}>
                <option value="SELF_SCAN">Member scans event QR</option>
                <option value="STAFF_SCAN">Staff scans member QR</option>
                <option value="BOTH">Allow either direction</option>
              </select>
            </label>
            <p className={styles.empty}>
              SELF_SCAN lets attendees scan the event code. STAFF_SCAN lets event staff choose this event in ICA Mobile and scan each attendee&apos;s personal ICA QR. BOTH supports either flow.
            </p>
          </section>

          <section>
            <p className={styles.step}>03 / CONFIRMATION + ACTIVATION</p>
            <label>Email subject<input value={event.confirmationSubject} onChange={(e) => setEvent({...event, confirmationSubject:e.target.value})} /></label>
            <label>Registration email<textarea value={event.confirmationMessage} onChange={(e) => setEvent({...event, confirmationMessage:e.target.value})} /></label>
            <Toggle label="Mark this event configuration active" value={event.active} onChange={(value) => setEvent({...event, active:value})} />
          </section>

          <div className={styles.saveBar}>
            <span>One save keeps event configuration, pricing, access, CE, certificate rules, check-in direction, and confirmation email together. ACTIVE workflows immediately receive a public registration page.</span>
            <button disabled={saving}>{saving ? 'SAVING…' : editingWorkflowId ? 'UPDATE WORKFLOW' : event.active ? 'SAVE + ACTIVATE' : 'SAVE DRAFT'}</button>
          </div>
        </form>
      )}

      {message && <p className={styles.message}>{message}</p>}

      <section className={styles.saved}>
        <div className={styles.savedHead}>
          <div><p className={styles.kicker}>SAVED WORKFLOWS</p><h2>What this organization has configured</h2></div>
          <span>{loading ? 'LOADING' : workflows.length + ' TOTAL'}</span>
        </div>
        <div className={styles.workflowList}>
          {!loading && workflows.length === 0 && <p className={styles.empty}>No workflows yet. Build the first membership program or event above.</p>}
          {workflows.map((workflow) => (
            <article key={workflow.id}>
              <div><small>{workflow.kind}</small><strong>{workflow.name}</strong></div>
              <span className={workflow.status === 'ACTIVE' ? styles.live : styles.draft}>{workflow.status}</span>
              <time>{new Date(workflow.updatedAt).toLocaleString()}</time>
              <div className={styles.workflowActions}>
                {workflow.status === 'ACTIVE' && <a href={`/flow/${workflow.id}`} target="_blank" rel="noreferrer">OPEN PUBLIC FLOW ↗</a>}
                <button type="button" onClick={() => editWorkflow(workflow)}>EDIT</button>
                <button type="button" onClick={() => setWorkflowStatus(workflow, workflow.status === 'ACTIVE' ? 'DRAFT' : 'ACTIVE')}>
                  {workflow.status === 'ACTIVE' ? 'DEACTIVATE' : 'ACTIVATE'}
                </button>
                <button type="button" onClick={() => loadSubmissions(workflow)}>VIEW SUBMISSIONS</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {selectedWorkflow && (
        <section className={styles.submissions}>
          <div className={styles.savedHead}>
            <div>
              <p className={styles.kicker}>LIVE EXECUTION</p>
              <h2>{selectedWorkflow.name} submissions</h2>
            </div>
            <button type="button" onClick={() => { setSelectedWorkflow(null); setSubmissions([]); }}>CLOSE</button>
          </div>

          {submissionsLoading ? <p className={styles.empty}>Loading submissions…</p> : submissions.length === 0 ? (
            <p className={styles.empty}>No applications or registrations have been submitted yet.</p>
          ) : (
            <div className={styles.submissionList}>
              {submissions.map((submission) => (
                <article key={submission.id} className={styles.submissionRow}>
                  <div>
                    <small>{new Date(submission.createdAt).toLocaleString()}</small>
                    <strong>{submission.name}</strong>
                    <span>{submission.email}{submission.phone ? ` · ${submission.phone}` : ''}{submission.company ? ` · ${submission.company}` : ''}</span>
                    {submission.notes && <p>{submission.notes}</p>}
                  </div>
                  <div className={styles.submissionState}>
                    <b>{submission.status.replaceAll('_', ' ')}</b>
                    <span>{submission.amountCents > 0 ? `${(submission.amountCents / 100).toFixed(2)} · ${submission.paymentStatus}` : 'NO PAYMENT REQUIRED'}</span>
                  </div>
                  <div className={styles.submissionActions}>
                    {selectedWorkflow.kind === 'MEMBERSHIP' ? (
                      <>
                        {submission.status !== 'APPROVED' && <button type="button" onClick={() => updateSubmission(submission.id, 'APPROVED')}>APPROVE</button>}
                        {submission.status !== 'REJECTED' && <button type="button" onClick={() => updateSubmission(submission.id, 'REJECTED')}>REJECT</button>}
                      </>
                    ) : (
                      <>
                        {submission.status !== 'REGISTERED' && <button type="button" onClick={() => updateSubmission(submission.id, 'REGISTERED')}>REGISTER</button>}
                        {submission.status !== 'WAITLISTED' && <button type="button" onClick={() => updateSubmission(submission.id, 'WAITLISTED')}>WAITLIST</button>}
                        {submission.status !== 'REJECTED' && <button type="button" onClick={() => updateSubmission(submission.id, 'REJECTED')}>REJECT</button>}
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function Toggle({label,value,onChange}:{label:string;value:boolean;onChange:(value:boolean)=>void}) {
  return (
    <label className={styles.toggle}>
      <span>{label}</span>
      <button type="button" className={value ? styles.toggleOn : ''} onClick={() => onChange(!value)} aria-pressed={value}>
        <i />
      </button>
    </label>
  );
}
