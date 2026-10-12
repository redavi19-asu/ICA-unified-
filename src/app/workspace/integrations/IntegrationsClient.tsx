'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_SCOPES } from '../../../lib/api-contract';
import styles from './integrations.module.css';

type ApiPlan = {mode:string;entitled:boolean;subscriptionStatus:string;periodStart:number;periodEnd:number;used:number;allowance:number|null;pricing:{ready:boolean;amount:number|null;allowance:number|null}};

type ApiKey = {
  id: string;
  name: string;
  displayKey: string;
  active: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  scopes: string[];
  expiresAt: string;
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
  pendingDeliveries: number;
  failedDeliveries: number;
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
  const [apiPlan,setApiPlan] = useState<ApiPlan|null>(null);
  const [apiBillingBusy,setApiBillingBusy] = useState(false);
  const [apiCancelConfirmed,setApiCancelConfirmed] = useState(false);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [domain, setDomain] = useState<DomainData | null>(null);
  const [email, setEmail] = useState<EmailState | null>(null);
  const [newKey, setNewKey] = useState('');
  const [newSecret, setNewSecret] = useState('');
  const [message, setMessage] = useState('Integration controls are organization-scoped. Secrets are shown only when created.');

  const refresh = useCallback(async () => {
    const [keyRes, hookRes, domainRes, emailRes,planRes] = await Promise.all([
      fetch('/api/integrations/keys', { cache: 'no-store' }),
      fetch('/api/integrations/webhooks', { cache: 'no-store' }),
      fetch('/api/integrations/domain', { cache: 'no-store' }),
      fetch('/api/integrations/email', { cache: 'no-store' }),
      fetch('/api/integrations/api-plan', { cache: 'no-store' }),
    ]);

    if (planRes.ok) setApiPlan(await planRes.json());
    if (keyRes.ok) setKeys((await keyRes.json()).keys || []);
    if (hookRes.ok) setWebhooks((await hookRes.json()).webhooks || []);
    if (domainRes.ok) setDomain(await domainRes.json());
    if (emailRes.ok) setEmail(await emailRes.json());
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function manageApiPlan(cancel=false) {
    setApiBillingBusy(true);
    try{const response=await fetch('/api/integrations/api-plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(cancel?{action:'CANCEL_API_RENEWAL',confirmation:'CANCEL API'}:{action:'CHECKOUT'})});const data=await response.json();if(!response.ok)throw new Error(data.error||'API billing is unavailable.');if(data.checkoutUrl)window.location.assign(data.checkoutUrl);else setMessage(`API renewal cancelled. Access ends ${new Date(data.endsAt).toLocaleDateString()}. Your software subscription is unchanged.`);await refresh();}
    catch(error){setMessage(error instanceof Error?error.message:'API billing is unavailable.');}
    finally{setApiBillingBusy(false);}
  }

  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const response = await fetch('/api/integrations/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: String(form.get('name') || ''), scopes: form.getAll('scope'), expiresInDays: Number(form.get('days')) }),
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || 'Unable to create API key.');
    setNewKey(data.key.value);
    setMessage('API key created. Copy it now — ICA will not show the full value again.');
    formElement.reset();
    await refresh();
  }

  async function revokeKey(id: string) {
    const response = await fetch(`/api/integrations/keys?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setMessage(data.error || 'Unable to revoke this API key.');
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
    const response = await fetch(`/api/integrations/webhooks?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setMessage(data.error || 'Unable to remove this webhook.');
    setMessage('Webhook removed.');
    await refresh();
  }

  async function testWebhooks() {
    const response = await fetch('/api/integrations/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'TEST' }),
    });
    const data = await response.json().catch(() => ({}));
    setMessage(response.ok
      ? `${data.sent || 0} delivered, ${data.queued || 0} queued for retry, ${data.failed || 0} failed.`
      : (data.error || 'Webhook test could not be sent.'));
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
    setMessage(data.verified ? 'Domain ownership verified. Route the verified hostname to the ICA Unified Worker to activate the branded portal.' : (data.error || 'DNS record is not visible yet.'));
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
    setMessage(data.status === 'DELIVERY_ATTEMPTED'
      ? 'Test email delivery attempted through the connected provider. Check the outbox counters for the result.'
      : 'Test email queued. Connect the managed email provider, then use Retry Queued / Failed Email to deliver it.');
    event.currentTarget.reset();
    await refresh();
  }

  async function retryQueuedEmail() {
    const response = await fetch('/api/integrations/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'RETRY' }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || 'Unable to retry queued email.');
      return;
    }
    setMessage(`Email retry complete: ${data.result?.sent || 0} sent, ${data.result?.failed || 0} failed.`);
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
          <strong>CORE INTEGRATIONS BUILT</strong>
          <span>API keys, signed webhooks, DNS verification, email outbox, and exports are built. External delivery and routing still require the applicable provider/DNS configuration.</span>
        </div>
      </header>

      <p className={styles.message} aria-live="polite">{message}</p>

      <section className={styles.grid}>
        <article id="api-access" className={styles.wide}>
          <div className={styles.cardHead}><span>01</span><b>API ACCESS</b></div>
          <h2>Connect websites and external systems.</h2>
          {apiPlan && <section aria-label="API plan and monthly usage">
            <h3>API plan and usage</h3><a href="/api-billing">Open separate API billing →</a>
            <p>{apiPlan.mode==='PREPARATION'?'Separate API billing is being prepared. No separate API fee is active yet.':`API plan: ${apiPlan.subscriptionStatus.replaceAll('_',' ')}. A paid API plan is required in addition to software access.`}</p>
            <p>{apiPlan.used.toLocaleString()} requests across all company keys this period{apiPlan.allowance!==null?` / ${apiPlan.allowance.toLocaleString()} included`:''}. Period ends {new Date(apiPlan.periodEnd).toLocaleDateString()}.</p>
            <p>Authenticated requests that pass permissions, subscription and rate checks count toward usage, including retries and invalid payloads. Server failures are released. No automatic overage charges are enabled.</p>
            {apiPlan.pricing.ready && <p>${((apiPlan.pricing.amount||0)/100).toFixed(2)}/month for {apiPlan.pricing.allowance?.toLocaleString()} requests, billed separately from your software subscription.</p>}
            <button className={styles.secondary} disabled={apiBillingBusy||!apiPlan.pricing.ready||apiPlan.entitled} onClick={()=>void manageApiPlan()}>Start separate API subscription</button>
            {apiPlan.entitled && <div><label><input type="checkbox" checked={apiCancelConfirmed} onChange={event=>setApiCancelConfirmed(event.target.checked)} /> Cancel only API renewal; software billing continues.</label><button className={styles.secondary} disabled={apiBillingBusy||!apiCancelConfirmed} onClick={()=>void manageApiPlan(true)}>Cancel API renewal</button></div>}
          </section>}
          <p>ICA API keys are tenant-scoped and stored as one-way hashes. Use them as Bearer tokens with the versioned API.</p>
          <p>Connect members, courses, assignments, progress, credentials, CE records, events and applications. Existing keys keep their original permissions.</p>
          <form className={styles.stackForm} onSubmit={createKey}>
            <input name="name" placeholder="Key name — Website production" minLength={2} required />
            <label>Expires in days <input name="days" type="number" min="1" max="365" defaultValue="90" required /></label>
            <fieldset><legend>Permissions — choose only what this connection needs</legend>{API_SCOPES.map(scope => <label key={scope} style={{ display: 'inline-block', margin: 8 }}><input type="checkbox" name="scope" value={scope} defaultChecked={scope === 'members:read'} /> {scope}</label>)}</fieldset>
            <button disabled={apiPlan?.mode==='PAID_API_REQUIRED'&&!apiPlan.entitled}>CREATE API KEY</button>
          </form>
          {newKey && <SecretBox label="COPY THIS API KEY NOW" value={newKey} onClear={() => setNewKey('')} />}
          <div className={styles.list}>
            {keys.length === 0 ? <span>No API keys yet.</span> : keys.map((key) => (
              <div key={key.id}>
                <div><strong>{key.name}</strong><code>{key.displayKey}</code><small>{key.scopes.join(', ')} · Expires {new Date(key.expiresAt).toLocaleDateString()}</small></div>
                <span>{key.lastUsedAt ? `Last used ${new Date(key.lastUsedAt).toLocaleString()}` : 'Never used'}</span>
                <button onClick={() => revokeKey(key.id)}>REVOKE</button>
              </div>
            ))}
          </div>
        </article>

        <a href="/developers">Read the developer guide →</a>
        <article id="webhooks" className={styles.wide}>
          <div className={styles.cardHead}><span>02</span><b>WEBHOOKS</b></div>
          <h2>Push ICA events to another system.</h2>
          <p>Each delivery is HMAC-SHA256 signed. Subscribe to “*” or comma-separated events such as course.completed, credential.issued, event.attendance.recorded, membership.application.decided, or integration.test.</p>
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
                <span>{hook.lastDeliveryAt ? `Last: ${hook.lastStatus ?? 'ERR'} · ${new Date(hook.lastDeliveryAt).toLocaleString()}` : 'No delivery yet'} · {hook.pendingDeliveries || 0} awaiting delivery · {hook.failedDeliveries || 0} failed</span>
                <button onClick={() => deleteWebhook(hook.id)}>REMOVE</button>
              </div>
            ))}
          </div>
        </article>

        <article>
          <div className={styles.cardHead}><span>03</span><b>EMAIL OUTBOX</b></div>
          <h2>{email?.readyToSend ? 'Transactional email is connected.' : 'Email outbox is ready for a provider.'}</h2>
          <p>{email?.readyToSend ? 'ICA sends new transactional messages through the configured provider and keeps delivery status in the organization outbox.' : 'ICA stores transactional messages safely until the managed email provider is connected.'}</p>
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
            <button>{email?.readyToSend ? 'SEND TEST EMAIL' : 'QUEUE TEST EMAIL'}</button>
          </form>
          <button className={styles.secondary} onClick={retryQueuedEmail} disabled={!email?.readyToSend || ((email?.counts.queued || 0) + (email?.counts.failed || 0) === 0)}>RETRY QUEUED / FAILED EMAIL</button>
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
          <div className={styles.statusLine}>
            <span>ICA HOST RESOLUTION</span>
            <strong>{domain?.routingReady ? 'READY' : 'WAITING FOR VERIFIED DOMAIN'}</strong>
          </div>
          <small className={styles.note}>{domain?.routingNote || 'Verify DNS ownership first.'}</small>
        </article>

        <article id="export-backup" className={styles.wide}>
          <div className={styles.cardHead}><span>05</span><b>EXPORT + BACKUP</b></div>
          <h2>The customer’s data stays portable.</h2>
          <p>Download a clean member CSV for handoff or an organization JSON backup containing member data, learning, credentials, documents, workflows, CE records, and activity history. Password hashes and private credentials/secrets are not exported.</p>
          <div className={styles.downloads}>
            <a href="/api/export/organization?format=members-csv">DOWNLOAD MEMBER CSV</a>
            <a href="/api/export/organization?format=json">DOWNLOAD ICA BACKUP</a>
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
