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
  certificateRule: 'COMPLETE_EVENT',
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

  async function loadWorkflows() {
    try {
      const response = await fetch('/api/workflows', { cache: 'no-store' });
      const data = await response.json();
      if (response.ok) setWorkflows(data.workflows || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadWorkflows();
  }, []);

  async function saveMembership(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage('');

    const response = await fetch('/api/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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

    setMembership(initialMembership);
    setMessage('Membership workflow saved.');
    await loadWorkflows();
  }

  async function saveEvent(eventObject: FormEvent) {
    eventObject.preventDefault();
    setSaving(true);
    setMessage('');

    const response = await fetch('/api/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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

    setEvent(initialEvent);
    setMessage('Event / webinar workflow saved.');
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
          approvals, qualifications, communications, education credits, and publishing
          rules together instead of sending you through separate modules.
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
            <p className={styles.step}>02 / APPLICATION + APPROVAL</p>
            <Toggle label="Application required" value={membership.applicationRequired} onChange={(value) => setMembership({...membership, applicationRequired:value})} />
            <Toggle label="Admin approval required" value={membership.approvalRequired} onChange={(value) => setMembership({...membership, approvalRequired:value})} />
            <label>Renewal reminder window (days)<input value={membership.renewalWindowDays} onChange={(e) => setMembership({...membership, renewalWindowDays:e.target.value})} inputMode="numeric" /></label>
          </section>

          <section>
            <p className={styles.step}>03 / CONFIRMATION</p>
            <label>Email subject<input value={membership.confirmationSubject} onChange={(e) => setMembership({...membership, confirmationSubject:e.target.value})} /></label>
            <label>Confirmation email<textarea value={membership.confirmationMessage} onChange={(e) => setMembership({...membership, confirmationMessage:e.target.value})} /></label>
            <Toggle label="Publish this membership now" value={membership.active} onChange={(value) => setMembership({...membership, active:value})} />
          </section>

          <div className={styles.saveBar}>
            <span>One save stores the membership rules, application requirements, pricing, approval flow, and member communication together.</span>
            <button disabled={saving}>{saving ? 'SAVING…' : membership.active ? 'SAVE + PUBLISH' : 'SAVE DRAFT'}</button>
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
            <div className={styles.twoCol}>
              <label>CEU / credit value<input value={event.ceuCredits} onChange={(e) => setEvent({...event, ceuCredits:e.target.value})} placeholder="1.5" inputMode="decimal" /></label>
              <label>Certificate rule<select value={event.certificateRule} onChange={(e) => setEvent({...event, certificateRule:e.target.value})}><option value="COMPLETE_EVENT">Issue after completion</option><option value="PASS_QUIZ">Issue after passing quiz</option><option value="ATTENDANCE">Issue after attendance</option><option value="NONE">No certificate</option></select></label>
            </div>
          </section>

          <section>
            <p className={styles.step}>03 / CONFIRMATION + PUBLISHING</p>
            <label>Email subject<input value={event.confirmationSubject} onChange={(e) => setEvent({...event, confirmationSubject:e.target.value})} /></label>
            <label>Registration email<textarea value={event.confirmationMessage} onChange={(e) => setEvent({...event, confirmationMessage:e.target.value})} /></label>
            <Toggle label="Publish registration now" value={event.active} onChange={(value) => setEvent({...event, active:value})} />
          </section>

          <div className={styles.saveBar}>
            <span>One save keeps registration, pricing, access link, CEU value, certificate rule, and confirmation email together.</span>
            <button disabled={saving}>{saving ? 'SAVING…' : event.active ? 'SAVE + PUBLISH' : 'SAVE DRAFT'}</button>
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
            </article>
          ))}
        </div>
      </section>
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
