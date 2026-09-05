'use client';

import { ChangeEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './tools.module.css';

type Props = {
  organizationName: string;
  role: string;
};

export default function ToolsClient({ organizationName, role }: Props) {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<string>('');

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setSelectedFile(file ? file.name : '');
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

      <section className={styles.intro}>
        <div>
          <p className={styles.kicker}>ONBOARDING + INTEGRATION</p>
          <h2>Move company data in. Connect the systems around it.</h2>
        </div>
        <p>
          This area is reserved for owners and admins. Use it for migration,
          website connections, integrations, and organization-level data work.
        </p>
      </section>

      <section className={styles.grid}>
        <article className={styles.featured}>
          <div className={styles.cardTop}>
            <span>01</span>
            <b>DATA IMPORT / MIGRATION</b>
          </div>
          <h3>Bring existing company data into ICA Unified.</h3>
          <p>
            Start an onboarding file for members, employees, courses, credentials,
            or records exported from an older AMS/LMS.
          </p>
          <label className={styles.upload}>
            <input
              type="file"
              accept=".csv,.xlsx,.xls,.json,.sql"
              onChange={onFileChange}
            />
            <strong>CHOOSE MIGRATION FILE</strong>
            <span>{selectedFile || 'CSV · Excel · JSON · SQL export'}</span>
          </label>
          <div className={styles.status}>
            <span>FILE INTAKE</span>
            <strong>{selectedFile ? 'READY FOR FIELD MAPPING' : 'WAITING FOR FILE'}</strong>
          </div>
          <small>
            File selection is wired now. The safe import/mapping step comes before
            any records are written to the company database.
          </small>
        </article>

        <article>
          <div className={styles.cardTop}><span>02</span><b>WEBSITE INTEGRATION</b></div>
          <h3>Connect the company&apos;s existing website.</h3>
          <p>Registration, member access, enrollment, and other workflows can feed ICA Unified through the platform API.</p>
          <button onClick={() => router.push('/workspace/reports')}>OPEN INTEGRATION AREA →</button>
        </article>

        <article>
          <div className={styles.cardTop}><span>03</span><b>API + WEBHOOKS</b></div>
          <h3>Connect external systems without duplicating data.</h3>
          <p>Use API and webhook connections for forms, payments, enrollment events, updates, and future third-party integrations.</p>
          <button onClick={() => router.push('/workspace/reports')}>VIEW INTEGRATIONS →</button>
        </article>

        <article>
          <div className={styles.cardTop}><span>04</span><b>DOMAIN / DNS</b></div>
          <h3>Point a company portal at ICA Unified.</h3>
          <p>Prepare member, training, or portal subdomains for a branded ICA Unified entry point.</p>
          <div className={styles.example}>portal.company.com → ICA Unified</div>
        </article>

        <article>
          <div className={styles.cardTop}><span>05</span><b>EXPORT / BACKUP</b></div>
          <h3>Keep organization data portable.</h3>
          <p>Reserved for company-level exports, migration backups, and controlled data handoff.</p>
          <div className={styles.badge}>COMING NEXT</div>
        </article>
      </section>
    </main>
  );
}
