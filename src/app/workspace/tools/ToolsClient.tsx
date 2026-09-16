'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './tools.module.css';

type Props = {
  organizationName: string;
  role: string;
};

type FieldKey = 'name' | 'firstName' | 'lastName' | 'email' | 'jobTitle' | 'role' | 'status';
type Mapping = Record<FieldKey, string>;

type ImportRow = {
  rowNumber: number;
  name: string;
  email: string;
  jobTitle: string;
  role: 'ADMIN' | 'MANAGER' | 'MEMBER';
  status: 'ONBOARDING' | 'ACTIVE' | 'SUSPENDED';
};

type PreviewRow = ImportRow & {
  classification: 'UPDATE_EXISTING' | 'SKIP_EXISTING' | 'INVITE_EXISTING_ICA_USER' | 'INVITE_NEW_USER';
  currentRole: string | null;
  currentStatus: string | null;
};

type PreviewResponse = {
  summary: {
    totalReceived: number;
    valid: number;
    invalid: number;
    newInvites: number;
    existingUserInvites: number;
    updates: number;
    skipped: number;
  };
  invalid: Array<{ rowNumber: number; error: string }>;
  rows: PreviewRow[];
  truncatedPreview: boolean;
};

type CommitResponse = {
  result: {
    updated: number;
    invited: number;
    skipped: number;
    failed: number;
    activationLinks: Array<{ name: string; email: string; inviteUrl: string }>;
    errors: Array<{ rowNumber: number; error: string }>;
  };
};

const emptyMapping: Mapping = {
  name: '',
  firstName: '',
  lastName: '',
  email: '',
  jobTitle: '',
  role: '',
  status: '',
};

export default function ToolsClient({ organizationName, role }: Props) {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [records, setRecords] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Mapping>(emptyMapping);
  const [duplicateMode, setDuplicateMode] = useState<'UPDATE' | 'SKIP'>('UPDATE');
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResponse['result'] | null>(null);
  const [message, setMessage] = useState('Choose a CSV export to start a safe member migration.');
  const [working, setWorking] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const saved = window.localStorage.getItem('ica_workspace_theme');
    if (saved === 'dark' || saved === 'light') setTheme(saved);
  }, []);

  function chooseTheme(next: 'light' | 'dark') {
    setTheme(next);
    window.localStorage.setItem('ica_workspace_theme', next);
    window.dispatchEvent(new CustomEvent('ica-workspace-theme', { detail: next }));
  }

  const mappedRows = useMemo<ImportRow[]>(() => {
    if (!headers.length || !records.length) return [];

    const headerIndex = new Map(headers.map((header, index) => [header, index]));
    const read = (record: string[], field: FieldKey) => {
      const header = mapping[field];
      if (!header) return '';
      const index = headerIndex.get(header);
      return index === undefined ? '' : String(record[index] || '').trim();
    };

    return records.map((record, index) => {
      const fullName = read(record, 'name');
      const composedName = [read(record, 'firstName'), read(record, 'lastName')].filter(Boolean).join(' ').trim();
      return {
        rowNumber: index + 2,
        name: fullName || composedName,
        email: read(record, 'email').toLowerCase(),
        jobTitle: read(record, 'jobTitle'),
        role: normalizeRole(read(record, 'role')),
        status: normalizeStatus(read(record, 'status')),
      };
    });
  }, [headers, mapping, records]);

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPreview(null);
    setCommitResult(null);

    if (!file) {
      setSelectedFile('');
      setHeaders([]);
      setRecords([]);
      setMapping(emptyMapping);
      return;
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setSelectedFile(file.name);
      setHeaders([]);
      setRecords([]);
      setMapping(emptyMapping);
      setMessage('For this first production importer, export the old AMS/LMS file as CSV. Excel files can be saved as CSV without changing the member data.');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setMessage('This file is larger than 8 MB. Split it into smaller CSV batches before importing.');
      return;
    }

    const text = await file.text();
    const matrix = parseCsv(text);
    if (matrix.length < 2) {
      setMessage('The CSV needs a header row plus at least one member record.');
      return;
    }

    const nextHeaders = matrix[0].map((header, index) => {
      const clean = header.replace(/^\uFEFF/, '').trim();
      return clean || `Column ${index + 1}`;
    });
    const nextRecords = matrix.slice(1).filter((row) => row.some((cell) => String(cell).trim() !== ''));

    setSelectedFile(file.name);
    setHeaders(nextHeaders);
    setRecords(nextRecords);
    setMapping(autoMap(nextHeaders));
    setMessage(`${nextRecords.length} row(s) loaded locally. Map the columns, then run Preview. Nothing has been written to ICA yet.`);
  }

  async function runPreview() {
    if (!mapping.email || (!mapping.name && !mapping.firstName && !mapping.lastName)) {
      setMessage('Map Email and either Full Name or First/Last Name before previewing.');
      return;
    }

    setWorking(true);
    setPreview(null);
    setCommitResult(null);

    const response = await fetch('/api/import/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'PREVIEW',
        duplicateMode,
        rows: mappedRows,
      }),
    });
    const data = await response.json();
    setWorking(false);

    if (!response.ok) {
      setMessage(data.error || 'Unable to preview this migration.');
      return;
    }

    setPreview(data);
    setMessage('Preview complete. Review the counts and bad rows before confirming the import.');
  }

  async function commitImport() {
    if (!preview) return;
    setWorking(true);

    const response = await fetch('/api/import/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'COMMIT',
        duplicateMode,
        rows: mappedRows,
      }),
    });
    const data = await response.json();
    setWorking(false);

    if (!response.ok) {
      setMessage(data.error || 'Unable to complete this migration.');
      return;
    }

    setCommitResult(data.result);
    setMessage(`Migration complete: ${data.result.updated} updated, ${data.result.invited} activation record(s) created, ${data.result.skipped} skipped, ${data.result.failed} failed.`);
  }

  function downloadTemplate() {
    downloadCsv('ica-member-import-template.csv', [
      ['Full Name', 'Email', 'Job Title', 'Role', 'Status'],
      ['Jordan Brooks', 'jordan@example.org', 'Field Specialist', 'MEMBER', 'ACTIVE'],
      ['Avery Morgan', 'avery@example.org', 'Program Manager', 'MANAGER', 'ACTIVE'],
    ]);
  }

  function downloadActivationLinks() {
    if (!commitResult?.activationLinks.length) return;
    downloadCsv('ica-member-activation-links.csv', [
      ['Name', 'Email', 'Activation Link'],
      ...commitResult.activationLinks.map((item) => [item.name, item.email, item.inviteUrl]),
    ]);
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <button onClick={() => router.push('/workspace')}>← Back to workspace</button>
        <div>
          <p>COMPANY SETTINGS / ADMIN TOOLS</p>
          <h1>Tools</h1>
          <span>{organizationName} · {role}</span>
        </div>
      </header>

      <section className={styles.appearance}>
        <div>
          <p className={styles.kicker}>APPEARANCE</p>
          <h2>Choose how ICA looks while you work.</h2>
          <p>Light is the default ICA Unified workspace. Switch to Dark anytime; the choice stays on this device.</p>
        </div>
        <div className={styles.themePicker} role="group" aria-label="Workspace theme">
          <button className={theme === 'light' ? styles.themeActive : ''} onClick={() => chooseTheme('light')}>
            <span className={styles.lightPreview}><i/><i/><i/></span>
            <strong>LIGHT</strong>
            <small>ICA DEFAULT</small>
          </button>
          <button className={theme === 'dark' ? styles.themeActive : ''} onClick={() => chooseTheme('dark')}>
            <span className={styles.darkPreview}><i/><i/><i/></span>
            <strong>DARK</strong>
            <small>OPTIONAL</small>
          </button>
        </div>
      </section>

      <section className={styles.intro}>
        <div>
          <p className={styles.kicker}>ONBOARDING + INTEGRATION</p>
          <h2>Move company data in. Connect the systems around it.</h2>
        </div>
        <p>
          Owners and admins can stage migrations safely before records are written.
          ICA previews duplicates, bad rows, role/status changes, and activation records first.
        </p>
      </section>

      <section className={styles.importer}>
        <div className={styles.cardTop}>
          <span>01</span>
          <b>SAFE MEMBER DATA MIGRATION</b>
        </div>

        <div className={styles.importHero}>
          <div>
            <p className={styles.kicker}>CSV → MAP → PREVIEW → CONFIRM</p>
            <h3>Bring an existing member database into ICA without guessing.</h3>
            <p>
              Export members from the old AMS/LMS as CSV. ICA detects common headers,
              lets you map fields manually, validates the rows, identifies existing accounts,
              and shows exactly what will happen before the final import.
            </p>
          </div>
          <button className={styles.secondaryButton} onClick={downloadTemplate}>DOWNLOAD ICA TEMPLATE</button>
        </div>

        <label className={styles.upload}>
          <input type="file" accept=".csv,text/csv" onChange={onFileChange} />
          <strong>CHOOSE MEMBER CSV</strong>
          <span>{selectedFile || 'CSV export from the old AMS, LMS, CRM, or spreadsheet'}</span>
        </label>

        {headers.length > 0 && (
          <>
            <div className={styles.mappingHead}>
              <div>
                <p className={styles.kicker}>FIELD MAPPING</p>
                <h3>Tell ICA which old columns mean what.</h3>
              </div>
              <span>{records.length} DATA ROWS</span>
            </div>

            <div className={styles.mappingGrid}>
              <MapSelect label="Full name" field="name" value={mapping.name} headers={headers} onChange={(value) => setMapping({...mapping, name:value})} />
              <MapSelect label="First name" field="firstName" value={mapping.firstName} headers={headers} onChange={(value) => setMapping({...mapping, firstName:value})} />
              <MapSelect label="Last name" field="lastName" value={mapping.lastName} headers={headers} onChange={(value) => setMapping({...mapping, lastName:value})} />
              <MapSelect label="Email *" field="email" value={mapping.email} headers={headers} onChange={(value) => setMapping({...mapping, email:value})} />
              <MapSelect label="Job title" field="jobTitle" value={mapping.jobTitle} headers={headers} onChange={(value) => setMapping({...mapping, jobTitle:value})} />
              <MapSelect label="Role" field="role" value={mapping.role} headers={headers} onChange={(value) => setMapping({...mapping, role:value})} />
              <MapSelect label="Membership status" field="status" value={mapping.status} headers={headers} onChange={(value) => setMapping({...mapping, status:value})} />
            </div>

            <div className={styles.duplicateBar}>
              <div>
                <strong>IF THIS MEMBER ALREADY EXISTS IN THIS ORGANIZATION</strong>
                <span>Choose whether the imported role/status/title should update ICA or leave the existing record alone.</span>
              </div>
              <select value={duplicateMode} onChange={(event) => setDuplicateMode(event.target.value as 'UPDATE' | 'SKIP')}>
                <option value="UPDATE">Update existing record</option>
                <option value="SKIP">Skip existing record</option>
              </select>
            </div>

            <div className={styles.dataPreview}>
              <div className={styles.previewHeader}>
                <span>ROW</span><span>NAME</span><span>EMAIL</span><span>ROLE / STATUS</span>
              </div>
              {mappedRows.slice(0, 6).map((row) => (
                <div className={styles.previewRow} key={row.rowNumber}>
                  <span>{row.rowNumber}</span>
                  <strong>{row.name || 'MISSING NAME'}</strong>
                  <span>{row.email || 'MISSING EMAIL'}</span>
                  <span>{row.role} · {row.status}</span>
                </div>
              ))}
              {mappedRows.length > 6 && <small>+ {mappedRows.length - 6} more row(s) in this file</small>}
            </div>

            <div className={styles.actionBar}>
              <div>
                <span>DATABASE WRITE</span>
                <strong>{preview ? 'PREVIEW READY — NO CHANGES YET' : 'LOCKED UNTIL PREVIEW'}</strong>
              </div>
              <button disabled={working} onClick={runPreview}>{working ? 'CHECKING…' : 'PREVIEW MIGRATION'}</button>
            </div>
          </>
        )}

        {preview && (
          <section className={styles.previewPanel}>
            <div className={styles.mappingHead}>
              <div><p className={styles.kicker}>MIGRATION REPORT</p><h3>Here is exactly what ICA will do.</h3></div>
              <span>NO DATABASE CHANGE YET</span>
            </div>

            <div className={styles.summaryGrid}>
              <ImportMetric label="VALID" value={preview.summary.valid} />
              <ImportMetric label="NEW PEOPLE" value={preview.summary.newInvites + preview.summary.existingUserInvites} />
              <ImportMetric label="UPDATES" value={preview.summary.updates} />
              <ImportMetric label="SKIPPED" value={preview.summary.skipped} />
              <ImportMetric label="BAD ROWS" value={preview.summary.invalid} />
            </div>

            {preview.invalid.length > 0 && (
              <div className={styles.errorBox}>
                <strong>ROWS THAT WILL NOT IMPORT</strong>
                {preview.invalid.slice(0, 25).map((item) => <span key={item.rowNumber}>Row {item.rowNumber}: {item.error}</span>)}
                {preview.invalid.length > 25 && <small>+ {preview.invalid.length - 25} more error(s)</small>}
              </div>
            )}

            <div className={styles.classificationList}>
              {preview.rows.slice(0, 20).map((row) => (
                <div key={row.rowNumber}>
                  <span>ROW {row.rowNumber}</span>
                  <strong>{row.name}</strong>
                  <span>{row.email}</span>
                  <b>{classificationLabel(row.classification)}</b>
                </div>
              ))}
            </div>

            <div className={styles.confirmBar}>
              <p>
                New people receive secure activation records. Existing organization members
                are only changed when “Update existing record” is selected.
              </p>
              <button disabled={working || preview.summary.valid === 0} onClick={commitImport}>
                {working ? 'IMPORTING…' : 'CONFIRM + IMPORT'}
              </button>
            </div>
          </section>
        )}

        {commitResult && (
          <section className={styles.completePanel}>
            <p className={styles.kicker}>IMPORT COMPLETE</p>
            <h3>Member migration has been processed.</h3>
            <div className={styles.summaryGrid}>
              <ImportMetric label="UPDATED" value={commitResult.updated} />
              <ImportMetric label="ACTIVATIONS" value={commitResult.invited} />
              <ImportMetric label="SKIPPED" value={commitResult.skipped} />
              <ImportMetric label="FAILED" value={commitResult.failed} />
            </div>
            {commitResult.activationLinks.length > 0 && (
              <button className={styles.secondaryButton} onClick={downloadActivationLinks}>DOWNLOAD ACTIVATION LINKS</button>
            )}
          </section>
        )}

        <p className={styles.importMessage} aria-live="polite">{message}</p>
      </section>

      <section className={styles.grid}>
        <article>
          <div className={styles.cardTop}><span>02</span><b>WEBSITE INTEGRATION</b></div>
          <h3>Connect the company&apos;s existing website.</h3>
          <p>Use the current member API for member registration and member data, plus signed webhooks for ICA member events. Additional external-system connections can be scoped as custom integrations.</p>
          <button onClick={() => router.push('/workspace/integrations#api-access')}>OPEN INTEGRATION AREA →</button>
        </article>

        <article>
          <div className={styles.cardTop}><span>03</span><b>API + WEBHOOKS</b></div>
          <h3>Connect external systems without duplicating data.</h3>
          <p>Use API and webhook connections for forms, payments, enrollment events, updates, and future third-party integrations.</p>
          <button onClick={() => router.push('/workspace/integrations#webhooks')}>VIEW INTEGRATIONS →</button>
        </article>

        <article>
          <div className={styles.cardTop}><span>04</span><b>DOMAIN / DNS</b></div>
          <h3>Verify a company portal domain for ICA Unified.</h3>
          <p>Claim a member, training, or portal hostname and verify DNS ownership. Final custom-host routing is activated when the hosting connection is configured.</p>
          <div className={styles.example}>portal.company.com → ICA Unified</div>
          <button onClick={() => router.push('/workspace/integrations#custom-domain')}>OPEN DOMAIN SETTINGS →</button>
        </article>

        <article>
          <div className={styles.cardTop}><span>05</span><b>EXPORT / BACKUP</b></div>
          <h3>Keep organization data portable.</h3>
          <p>Download a clean member CSV or a full organization backup for portability, recovery planning, and controlled data handoff.</p>
          <button onClick={() => router.push('/workspace/integrations#export-backup')}>OPEN EXPORT + BACKUP →</button>
        </article>
      </section>
    </main>
  );
}

function MapSelect({
  label,
  value,
  headers,
  onChange,
}: {
  label: string;
  field: FieldKey;
  value: string;
  headers: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className={styles.mapField}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Not mapped</option>
        {headers.map((header) => <option key={header} value={header}>{header}</option>)}
      </select>
    </label>
  );
}

function ImportMetric({ label, value }: { label: string; value: number }) {
  return <div><span>{label}</span><strong>{String(value).padStart(2, '0')}</strong></div>;
}

function normalizeRole(value: string): ImportRow['role'] {
  const normalized = value.trim().toUpperCase();
  if (normalized.includes('ADMIN')) return 'ADMIN';
  if (normalized.includes('MANAGER') || normalized.includes('DIRECTOR') || normalized.includes('SUPERVISOR')) return 'MANAGER';
  return 'MEMBER';
}

function normalizeStatus(value: string): ImportRow['status'] {
  const normalized = value.trim().toUpperCase();
  if (normalized.includes('SUSPEND') || normalized.includes('INACTIVE') || normalized.includes('LAPSED') || normalized.includes('EXPIRED')) return 'SUSPENDED';
  if (normalized.includes('ONBOARD') || normalized.includes('PENDING') || normalized.includes('APPLICANT')) return 'ONBOARDING';
  return 'ACTIVE';
}

function autoMap(headers: string[]): Mapping {
  const find = (...terms: string[]) => {
    const hit = headers.find((header) => {
      const clean = normalizeHeader(header);
      return terms.some((term) => clean === term || clean.includes(term));
    });
    return hit || '';
  };

  return {
    name: find('fullname', 'membername', 'contactname', 'displayname'),
    firstName: find('firstname', 'givenname', 'fname'),
    lastName: find('lastname', 'surname', 'familyname', 'lname'),
    email: find('emailaddress', 'email', 'memberemail'),
    jobTitle: find('jobtitle', 'position', 'title', 'occupation'),
    role: find('role', 'accesslevel', 'permission', 'usertype'),
    status: find('membershipstatus', 'memberstatus', 'status', 'accountstatus'),
  };
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function classificationLabel(value: PreviewRow['classification']) {
  if (value === 'UPDATE_EXISTING') return 'UPDATE EXISTING';
  if (value === 'SKIP_EXISTING') return 'SKIP EXISTING';
  if (value === 'INVITE_EXISTING_ICA_USER') return 'ADD TO ORGANIZATION';
  return 'NEW ACTIVATION';
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map((value) => {
    const safe = String(value ?? '').replaceAll('"', '""');
    return /[",\n\r]/.test(safe) ? `"${safe}"` : safe;
  }).join(',')).join('\r\n');

  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
