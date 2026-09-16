'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './integrations.module.css';

type ApiKey = {
  id: string;
  name: string;
  displayKey: string;
  active: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

type Webhook = {
  id: string;
  url: string;
  eventTypes: string[];
  active: boolean;
  secret: string;
  lastDeliveryAt: string | null;
  lastStatus: number | null;
  lastError: string | null;
};

type DomainData = {
  domain: null | {
    hostname: string;
    status: string;
    verifiedAt: string | null;
  };
  dnsRecord: null | { type: string; name: string; value: string };
  routingReady?: boolean;
  routingNote?: string;
};

type EmailState = {
  provider: string | null;
  readyToSend: boolean;
  counts: { queued: number; sent: number; failed: number };
  templates: string[];
};

export default function IntegrationsClient({
  organizationName,
  organizationSlug,
}: {
  organizationName: string;
  organizationSlug: string;
}) {
  const router = useRouter();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [domain, setDomain] = useState<DomainData | null>(null);
  const [email, setEmail] = useState<EmailState | null>(null);
  const [newKey, setNewKey] = useState('');
  const [newSecret, setNewSecret] = useState('');
  const [message, setMessage] = useState('Integration controls are organization-scoped. Secrets are shown only when created.');

  const refresh = useCallback(async () => {
    const [keyRes, hookRes, domainRes, emailRes] = await Promise.all([
      fetch('/api/integrations/keys', { cache: 'no-store' }),
      fetch('/api/integrations/webhooks', { cache: 'no-store' }),
      fetch('/api/integrations/domain', { cache: 'no-store' }),
      fetch('/api/integrations/email', { cache: 'no-store' }),
    ]);

    if (keyRes.ok) setKeys((await keyRes.json()).keys || []);
    if (hookRes.ok) setWebhooks((await hookRes.json()).webhooks || []);
    if (domainRes.ok) setDomain(await domainRes.json());
    if (emailRes.ok) setEmail(await emailRes.json());
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/integrations/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: String(form.get('name') || '') }),
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || 'Unable to create API key.');
    setNewKey(data.key.value);
    setMessage('API key created. Copy it now — ICA will not show the full value again.');
    event.currentTarget.reset();
    await refresh();
  }

  async function revokeKey(id: string) {
    await fetch(`/api/integrations/keys?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    setMessage('API key revoked.');
    await refresh();
  }

  async function createWebhook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const eventTypes = String(form.get('events') || '*').split(',').map((value) => value.trim()).filter(Boolean);
    const response = await fetch('/api/integrations/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: String(form.get('url') || ''), eventTypes }),
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || 'Unable to create webhook.');
    setNewSecret(data.webhook.secret);
    setMessage('Webhook created. Copy the signing secret now.');
    event.currentTarget.reset();
    await refresh();
  }

  async function deleteWebhook(id: string) {
    await fetch(`/api/integrations/webhooks?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    setMessage('Webhook removed.');
    await refresh();
  }

  async function testWebhooks() {
    const response = await fetch('/api/integrations/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'TEST' }),
    });
    setMessage(response.ok ? 'Webhook test sent. Refreshing delivery status.' : 'Webhook test could not be sent.');
    await refresh();
  }

  async function saveDomain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/integrations/domain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostname: String(form.get('hostname') || '') }),
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || 'Unable to save this hostname.');
    setMessage('Domain claim created. Add the TXT record shown below, then verify it.');
    await refresh();
  }

  async function verifyDomain() {
    const response = await fetch('/api/integrations/domain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'VERIFY' }),
    });
    const data = await response.json();
    setMessage(data.verified ? 'Domain ownership verified.' : (data.error || 'DNS record is not visible yet.'));
    await refresh();
  }

  async function queueTestEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/integrations/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: String(form.get('recipient') || '') }),
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || 'Unable to queue the email.');
    setMessage('Test email queued. It will be ready for delivery when the email provider is connected.');
    event.currentTarget.reset();
    await refresh();
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <button onClick={() => router.push('/workspace')}>← WORKSPACE</button>
          <p>ICA UNIFIED / CONNECTION LAYER</p>
          <h1>INTEGRATIONS<br />CENTER</h1>
          <span>{organizationName} · {organizationSlug}</span>
        </div>
        <div className={styles.state}>
          <small>FOUNDATION STATUS</small>
          <strong>READY FOR CREDENTIALS</strong>
          <span>API, webhooks, domain verification, email queue, and data export are built.</span>
        </div>
      </header>

      <p className={styles.message} aria-live="polite">{message}</p>

      <section className={styles.grid}>
        <article id="api-access" className={styles.wide}>
          <div className={styles.cardHead}><span>01</span><b>API ACCESS</b></div>
          <h2>Connect websites and external systems.</h2>
          <p>ICA API keys are tenant-scoped and stored as one-way hashes. Use them as Bearer tokens with the versioned API.</p>
          <div className={styles.endpoint}><code>GET /api/v1/members</code><code>POST /api/v1/members</code></div>
          <form className={styles.inlineForm} onSubmit={createKey}>
            <input name="name" placeholder="Key name — Website production" minLength={2} required />
            <button>CREATE API KEY</button>
          </form>
          {newKey && <SecretBox label="COPY THIS API KEY NOW" value={newKey} onClear={() => setNewKey('')} />}
          <div className={styles.list}>
            {keys.length === 0 ? <span>No API keys yet.</span> : keys.map((key) => (
              <div key={key.id}>
                <div><strong>{key.name}</strong><code>{key.displayKey}</code></div>
                <span>{key.lastUsedAt ? `Last used ${new Date(key.lastUsedAt).toLocaleString()}` : 'Never used'}</span>
                <button onClick={() => revokeKey(key.id)}>REVOKE</button>
              </div>
            ))}
          </div>
        </article>

        <article id="webhooks" className={styles.wide}>
          <div className={styles.cardHead}><span>02</span><b>WEBHOOKS</b></div>
          <h2>Push ICA events to another system.</h2>
          <p>Each delivery is HMAC-SHA256 signed. Subscribe to “*” or comma-separated events such as member.invited, member.activated, integration.test.</p>
          <form className={styles.stackForm} onSubmit={createWebhook}>
            <input name="url" type="url" placeholder="https://company.com/api/ica-webhook" required />
            <input name="events" placeholder="member.invited, member.activated" defaultValue="*" />
            <button>ADD WEBHOOK</button>
          </form>
          {newSecret && <SecretBox label="COPY SIGNING SECRET NOW" value={newSecret} onClear={() => setNewSecret('')} />}
          <button className={styles.secondary} onClick={testWebhooks} disabled={!webhooks.length}>SEND TEST EVENT</button>
          <div className={styles.list}>
            {webhooks.length === 0 ? <span>No webhooks yet.</span> : webhooks.map((hook) => (
              <div key={hook.id}>
                <div><strong>{hook.url}</strong><code>{hook.eventTypes.join(', ')}</code></div>
                <span>{hook.lastDeliveryAt ? `Last: ${hook.lastStatus ?? 'ERR'} · ${new Date(hook.lastDeliveryAt).toLocaleString()}` : 'No delivery yet'}</span>
                <button onClick={() => deleteWebhook(hook.id)}>REMOVE</button>
              </div>
            ))}
          </div>
        </article>

        <article>
          <div className={styles.cardHead}><span>03</span><b>EMAIL OUTBOX</b></div>
          <h2>Email system is staged, not self-hosted.</h2>
          <p>ICA stores transactional messages in its outbox now. A managed provider can be connected later without changing invitations, renewals, courses, events, or credentials.</p>
          <div className={styles.metrics}>
            <span><b>{email?.counts.queued ?? 0}</b>QUEUED</span>
            <span><b>{email?.counts.sent ?? 0}</b>SENT</span>
            <span><b>{email?.counts.failed ?? 0}</b>FAILED</span>
          </div>
          <div className={styles.statusLine}>
            <span>PROVIDER</span>
            <strong>{email?.readyToSend ? email.provider : 'NOT CONNECTED YET'}</strong>
          </div>
          <form className={styles.stackForm} onSubmit={queueTestEmail}>
            <input name="recipient" type="email" placeholder="test@example.org" required />
            <button>QUEUE TEST EMAIL</button>
          </form>
        </article>

        <article id="custom-domain">
          <div className={styles.cardHead}><span>04</span><b>CUSTOM DOMAIN</b></div>
          <h2>Verify ownership before routing.</h2>
          <form className={styles.stackForm} onSubmit={saveDomain}>
            <input name="hostname" placeholder="members.company.org" defaultValue={domain?.domain?.hostname || ''} required />
            <button>SAVE DOMAIN CLAIM</button>
          </form>
          {domain?.dnsRecord && (
            <div className={styles.dnsBox}>
              <span>ADD THIS DNS RECORD</span>
              <code>{domain.dnsRecord.type} · {domain.dnsRecord.name}</code>
              <code>{domain.dnsRecord.value}</code>
              <button onClick={verifyDomain}>VERIFY DNS OWNERSHIP</button>
            </div>
          )}
          <div className={styles.statusLine}>
            <span>OWNERSHIP</span>
            <strong>{domain?.domain?.status || 'NOT CONFIGURED'}</strong>
          </div>
          <small className={styles.note}>Verification needs no Cloudflare account credentials. Final custom-host routing is the later account-connected step.</small>
        </article>

        <article id="export-backup" className={styles.wide}>
          <div className={styles.cardHead}><span>05</span><b>EXPORT + BACKUP</b></div>
          <h2>The customer’s data stays portable.</h2>
          <p>Download a clean member CSV for handoff or a full organization JSON backup containing member data, learning, credentials, documents, workflows, CE records, and activity history. Password hashes are never exported.</p>
          <div className={styles.downloads}>
            <a href="/api/export/organization?format=members-csv">DOWNLOAD MEMBER CSV</a>
            <a href="/api/export/organization?format=json">DOWNLOAD FULL ICA BACKUP</a>
          </div>
        </article>
      </section>
    </main>
  );
}

function SecretBox({ label, value, onClear }: { label: string; value: string; onClear: () => void }) {
  async function copy() {
    await navigator.clipboard.writeText(value);
  }
  return (
    <div className={styles.secretBox}>
      <span>{label}</span>
      <code>{value}</code>
      <div><button onClick={copy}>COPY</button><button onClick={onClear}>HIDE</button></div>
    </div>
  );
}
