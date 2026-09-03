'use client';

import { FormEvent, useMemo, useState } from 'react';

type Role = 'OWNER' | 'ADMIN' | 'MANAGER' | 'MEMBER';
type MemberStatus = 'ONBOARDING' | 'ACTIVE' | 'SUSPENDED';

type Person = {
  id: string;
  name: string;
  email: string;
  jobTitle: string | null;
  role: Role;
  status: MemberStatus;
  joinedAt: string;
};

type PendingInvite = {
  id: string;
  name: string;
  email: string;
  role: Role;
  jobTitle: string | null;
  expiresAt: string;
};

export default function PeopleClient({
  organizationName,
  currentRole,
  people: initialPeople,
  invitations: initialInvitations,
}: {
  organizationName: string;
  currentRole: Role;
  people: Person[];
  invitations: PendingInvite[];
}) {
  const [people, setPeople] = useState(initialPeople);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [showInvite, setShowInvite] = useState(false);
  const [message, setMessage] = useState('Select a person to adjust their access or onboarding state.');
  const [inviteUrl, setInviteUrl] = useState('');
  const canManage = currentRole === 'OWNER' || currentRole === 'ADMIN';

  const counts = useMemo(() => ({
    active: people.filter((person) => person.status === 'ACTIVE').length,
    onboarding: people.filter((person) => person.status === 'ONBOARDING').length,
    managers: people.filter((person) => person.role === 'MANAGER' || person.role === 'ADMIN' || person.role === 'OWNER').length,
  }), [people]);

  async function updatePerson(id: string, patch: Partial<Pick<Person, 'role' | 'status' | 'jobTitle'>>) {
    const response = await fetch(`/api/people/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || 'Unable to update this person.');
      return;
    }
    setPeople((current) => current.map((person) => person.id === id ? { ...person, ...data.member } : person));
    setMessage(`${data.member.name} updated.`);
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get('name') || ''),
      email: String(form.get('email') || ''),
      jobTitle: String(form.get('jobTitle') || ''),
      role: String(form.get('role') || 'MEMBER'),
    };
    const response = await fetch('/api/people/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || 'Unable to create invitation.');
      return;
    }
    setInviteUrl(data.inviteUrl);
    setInvitations((current) => [{
      id: `temp-${Date.now()}`,
      name: payload.name,
      email: payload.email,
      role: payload.role as Role,
      jobTitle: payload.jobTitle || null,
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    }, ...current]);
    event.currentTarget.reset();
    setMessage(`Invitation ready for ${payload.name}.`);
  }

  return (
    <main className="people-shell">
      <header className="people-header">
        <div>
          <a href="/workspace" className="people-back">← WORKSPACE</a>
          <p className="eyebrow">{organizationName.toUpperCase()} / PEOPLE FIELD</p>
          <h1>PEOPLE<br />CONTROL</h1>
          <p className="people-intro">Roles, onboarding, invitations, and workforce access without a buried administration menu.</p>
        </div>
        {canManage && <button className="people-invite-trigger" onClick={() => setShowInvite((value) => !value)}>{showInvite ? 'CLOSE INVITE' : '+ INVITE PERSON'}</button>}
      </header>

      <section className="people-pulse" aria-label="People metrics">
        <div><span>ACTIVE</span><strong>{counts.active}</strong></div>
        <div><span>ONBOARDING</span><strong>{counts.onboarding}</strong></div>
        <div><span>LEADERS</span><strong>{counts.managers}</strong></div>
        <div><span>PENDING INVITES</span><strong>{invitations.length}</strong></div>
      </section>

      {showInvite && canManage && (
        <section className="people-invite-panel">
          <div><p className="eyebrow">ACCESS HANDOFF</p><h2>Invite someone in.</h2><p>The link expires in 72 hours. Their account remains tied to this company workspace.</p></div>
          <form onSubmit={invite} className="people-invite-form">
            <input name="name" placeholder="Full name" required minLength={2} />
            <input name="email" type="email" placeholder="Email address" required />
            <input name="jobTitle" placeholder="Job title (optional)" />
            <select name="role" defaultValue="MEMBER"><option value="MEMBER">Member</option><option value="MANAGER">Manager</option><option value="ADMIN">Admin</option></select>
            <button type="submit">CREATE INVITE →</button>
          </form>
          {inviteUrl && <div className="people-invite-link"><span>Invite link</span><code>{inviteUrl}</code></div>}
        </section>
      )}

      <section className="people-list">
        <div className="people-list-head"><span>IDENTITY</span><span>ACCESS</span><span>STATE</span></div>
        {people.map((person) => (
          <article className="people-row" key={person.id}>
            <div className="people-identity"><div className="people-glyph">{person.name.split(' ').map((piece) => piece[0]).join('').slice(0, 2).toUpperCase()}</div><div><strong>{person.name}</strong><span>{person.jobTitle || 'Team member'} · {person.email}</span></div></div>
            <div>
              {canManage && person.role !== 'OWNER' ? (
                <select value={person.role} onChange={(event) => updatePerson(person.id, { role: event.target.value as Person['role'] })}><option value="MEMBER">Member</option><option value="MANAGER">Manager</option><option value="ADMIN">Admin</option></select>
              ) : <span className="people-chip">{person.role}</span>}
            </div>
            <div>
              {canManage && person.role !== 'OWNER' ? (
                <select value={person.status} onChange={(event) => updatePerson(person.id, { status: event.target.value as MemberStatus })}><option value="ONBOARDING">Onboarding</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option></select>
              ) : <span className="people-chip">{person.status}</span>}
            </div>
          </article>
        ))}
      </section>

      {invitations.length > 0 && <section className="people-pending"><p className="eyebrow">PENDING ACCESS</p>{invitations.map((invite) => <div key={invite.id}><strong>{invite.name}</strong><span>{invite.email} · {invite.role} · expires {new Date(invite.expiresAt).toLocaleDateString()}</span></div>)}</section>}

      <p className="system-message" aria-live="polite">{message}</p>
    </main>
  );
}
