import Link from 'next/link';
import styles from './landing.module.css';
import SystemStatusGlobe from './SystemStatusGlobe';

const modules = [
  ['AMS', 'People, membership, roles, documents, compliance, administration, and reporting in one operational layer.'],
  ['LMS', 'Courses, lessons, progress, quizzes, credentials, certificates, and continuing education tied to the same member record.'],
  ['Website Integration', 'Keep your existing website and connect registration, member access, enrollment, and business workflows to ICA Unified.'],
  ['Unified Data', 'One organization record connects people, learning, credentials, documents, activity, and permissions without duplicate accounts.'],
];

const workflow = [
  ['01', 'One company', 'Each customer receives a secure organization workspace with its own tenant boundary.'],
  ['02', 'One database', 'Business, membership, learning, credential, and activity data stay connected instead of being split across tools.'],
  ['03', 'One login', 'Members, employees, managers, and administrators enter through one identity and receive the correct role-based view.'],
  ['04', 'One member record', 'Training, status, documents, credentials, and organizational activity follow the same person throughout the platform.'],
];

const plans = [
  {
    name: 'Professional',
    tag: '$249 / MONTH',
    description: 'The complete ICA Unified association + learning platform with standard support included.',
    features: ['AMS + LMS workspace', 'CE/compliance + credential wallet', 'Safe self-service member importer', 'API keys + signed webhooks', 'Custom-domain verification', 'Standard support included', '14-day trial'],
    cta: 'START PROFESSIONAL TRIAL',
    href: '/register',
    featured: true,
  },
  {
    name: 'Professional + Setup',
    tag: '$249 / MONTH + ONE-TIME SETUP',
    description: 'For organizations that want ICA help configuring the platform or connecting an existing website.',
    features: ['Everything in Professional', 'Guided onboarding from $499', 'Website/API connection planning', 'Branded portal/domain setup', 'Registration & enrollment integration', 'Scope approved before work begins'],
    cta: 'START SETUP TRIAL',
    href: '/register',
  },
  {
    name: 'Enterprise / Custom',
    tag: 'CUSTOM IMPLEMENTATION',
    description: 'For larger organizations with deeper migration, identity, workflow, infrastructure, or volume requirements.',
    features: ['Everything in Professional', 'Managed migration from $1,500', 'SSO planning', 'Custom integrations', 'Custom workflow/report development', 'Written implementation quote'],
    cta: 'TALK TO I COMPUTER ANYTHING',
    href: 'https://icomputeranything.com/#contact',
    external: true,
  },
];

const includedWithProfessional = [
  ['Platform', 'AMS + LMS access in one organization workspace.'],
  ['Members', 'Member records, roles, status, job titles, invitations, activation, and organization access.'],
  ['Learning', 'Courses, lessons, quizzes, assignments, progress, completion, and automatic credentials.'],
  ['CE + Compliance', 'Credit rules, requirements, transcripts, renewal readiness, QR event attendance, and credential wallet.'],
  ['Workflows', 'Membership programs, events/webinars, pricing fields, approvals, CE rules, certificates, and confirmations.'],
  ['Documents + Reports', 'Controlled documents, acknowledgments, organization reporting, and compliance snapshots.'],
  ['Data Import', 'Self-service CSV importer with field mapping, preview, duplicate detection, validation, and controlled commit.'],
  ['API + Webhooks', 'Organization API keys, standard ICA API endpoints, and signed HTTPS webhooks.'],
  ['Domains + Export', 'Custom-domain ownership verification, member CSV export, and full organization backup export.'],
  ['Product Support', 'Standard support for using and operating existing ICA Unified features.'],
  ['Mobile Access', 'ICA Unified Mobile for iPhone and iPad is included with Professional when released, using the same organization login and cloud data.'],
];

const standardSupport = [
  'Login, account, invitation, and member-access issues.',
  'Help using existing ICA Unified features, workflows, courses, events, credentials, reports, and compliance tools.',
  'Troubleshooting ICA Unified behavior and confirmed product bugs.',
  'Basic configuration questions and guidance using existing API endpoints.',
  'Email/ticket support Monday–Friday, 9 AM–6 PM Eastern, excluding major holidays.',
  'Normal requests target a response within 1 business day; major organization-wide platform issues target same-business-day response.',
];

const professionalServices = [
  ['Guided onboarding + configuration', 'Starting at $499 one time', 'Hands-on setup assistance, configuration review, and launch preparation.'],
  ['Managed data migration', 'Starting at $1,500 one time', 'ICA cleans, maps, validates, and imports customer data instead of the customer using the included importer themselves.'],
  ['Custom integrations', 'Custom quote', 'New third-party integrations, proprietary systems, new API endpoints, accounting/CRM connections, or specialized automation.'],
  ['Custom development', 'Custom quote', 'Customer-specific workflows, reports, software features, website work, or special infrastructure requirements.'],
  ['Training + live consulting', 'Custom quote', 'Dedicated staff training, live implementation sessions, after-hours help, or on-site work.'],
];


function MiniIcon({ type }: { type: string }) {
  const common = { width: 26, height: 26, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (type === 'people') return <svg {...common}><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.8-3.1 2.6-4.7 5.5-4.7s4.7 1.6 5.5 4.7"/><circle cx="17" cy="9" r="2.3"/><path d="M15.5 14.7c2.8-.3 4.6 1.1 5.2 4.3"/></svg>;
  if (type === 'learning') return <svg {...common}><path d="M3 6.5 12 3l9 3.5-9 3.5-9-3.5Z"/><path d="M6 9v5.2c2.5 2.4 9.5 2.4 12 0V9"/><path d="M21 7v6"/></svg>;
  if (type === 'credential') return <svg {...common}><circle cx="12" cy="8" r="4"/><path d="m9.4 12-1 8 3.6-2 3.6 2-1-8"/><path d="m10.4 8 1 1 2-2"/></svg>;
  if (type === 'document') return <svg {...common}><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/></svg>;
  if (type === 'compliance') return <svg {...common}><path d="M12 3 4.5 6v5c0 5 3 8.2 7.5 10 4.5-1.8 7.5-5 7.5-10V6z"/><path d="m8.5 12 2.1 2.1 4.9-5"/></svg>;
  if (type === 'report') return <svg {...common}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>;
  if (type === 'workflow') return <svg {...common}><rect x="3" y="4" width="6" height="5" rx="1"/><rect x="15" y="15" width="6" height="5" rx="1"/><path d="M9 6.5h3a3 3 0 0 1 3 3V15M15 17.5h-3a3 3 0 0 1-3-3V9"/></svg>;
  if (type === 'api') return <svg {...common}><path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 4l-4 16"/></svg>;
  if (type === 'domain') return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>;
  if (type === 'support') return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M8 15v-3a4 4 0 0 1 8 0v3M7.5 15h2v3h-2zM14.5 15h2v3h-2z"/></svg>;
  if (type === 'mobile') return <svg {...common}><rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M10 5h4M11 18.5h2"/></svg>;
  if (type === 'data') return <svg {...common}><ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>;
}

function PlatformIcon({ type }: { type: 'web' | 'windows' | 'mac' | 'iphone' | 'ipad' }) {
  if (type === 'windows') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 4.4 10.8 3v8.2H2.5V4.4Zm9.6-1.6L21.5 1.3v9.9h-9.4V2.8ZM2.5 12.5h8.3V21l-8.3-1.4v-7.1Zm9.6 0h9.4v10.2l-9.4-1.6v-8.6Z" fill="currentColor"/></svg>;
  if (type === 'mac') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="11" rx="1.7" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M2.5 18.5h19M9 15.5h6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
  if (type === 'iphone') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7.2" y="2" width="9.6" height="20" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M10 4.5h4M11.2 19h1.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
  if (type === 'ipad') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5.2" y="2.7" width="13.6" height="18.6" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.7"/><circle cx="12" cy="18.7" r=".8" fill="currentColor"/></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" fill="none" stroke="currentColor" strokeWidth="1.7"/></svg>;
}

function iconFor(title: string) {
  const key = title.toLowerCase();
  if (key.includes('member') || key.includes('people') || key.includes('ams')) return 'people';
  if (key.includes('learn') || key.includes('lms')) return 'learning';
  if (key.includes('credential') || key.includes('ce')) return 'credential';
  if (key.includes('document')) return 'document';
  if (key.includes('compliance')) return 'compliance';
  if (key.includes('report')) return 'report';
  if (key.includes('workflow')) return 'workflow';
  if (key.includes('api') || key.includes('webhook') || key.includes('website')) return 'api';
  if (key.includes('domain') || key.includes('export')) return 'domain';
  if (key.includes('support')) return 'support';
  if (key.includes('mobile')) return 'mobile';
  if (key.includes('data') || key.includes('platform')) return 'data';
  return 'web';
}

export default function Home() {
  return (
    <main className={styles.page}>
      <header className={styles.nav}>
        <Link className={styles.brand} href="/">
          <span>ICA</span>
          <strong>UNIFIED</strong>
        </Link>
        <nav>
          <a href="#platform">Platform</a>
          <a href="#integrations">Integrations</a>
          <a href="#plans">Plans</a>
          <a href="#included">What&apos;s Included</a>
          <a href="#mobile">Mobile</a>
          <a href="/downloads">Apps</a>
          <a href="/login">Customer Login</a>
        </nav>
        <a className={styles.navCta} href="/register">Start Free Trial</a>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>I COMPUTER ANYTHING / BUSINESS SYSTEMS</p>
          <h1>One company.<br />One database.<br />One login.<br />One member record.</h1>
          <p className={styles.lede}>
            ICA Unified brings association management, learning management, credentials,
            documents, compliance, reporting, and website integrations into the same cloud platform.
          </p>
          <div className={styles.actions}>
            <a className={styles.primary} href="/register">START 14-DAY TRIAL →</a>
            <a className={styles.secondary} href="/login">CUSTOMER LOGIN</a>
          </div>
          <p className={styles.microcopy}>No separate LMS account. No duplicate member database. No disconnected admin stack.</p>
          <div className={styles.platformStrip} aria-label="ICA Unified platform availability">
            <span><i><PlatformIcon type="web" /></i><b>WEB</b><small>LIVE</small></span>
            <span><i><PlatformIcon type="windows" /></i><b>WINDOWS</b><small>PLANNED</small></span>
            <span><i><PlatformIcon type="mac" /></i><b>MAC</b><small>PLANNED</small></span>
            <span className={styles.mobilePair}><i><PlatformIcon type="iphone" /><PlatformIcon type="ipad" /></i><b>IPHONE + IPAD</b><small>IN DEVELOPMENT</small></span>
          </div>
          <div className={styles.heroTrinkets} aria-hidden="true">
            <span className={styles.trinketOne}>QR CHECK-IN</span>
            <span className={styles.trinketTwo}>CE WALLET</span>
            <span className={styles.trinketThree}>LIVE MEMBER DATA</span>
          </div>
        </div>

        <SystemStatusGlobe />
      </section>

      <section className={styles.mantra}>
        <span>ONE COMPANY</span><b>+</b><span>ONE DATABASE</span><b>+</b><span>ONE LOGIN</span><b>+</b><span>ONE MEMBER RECORD</span>
      </section>

      <section id="platform" className={styles.section}>
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>THE PLATFORM</p>
          <h2>Stop stitching business systems together.</h2>
          <p>
            ICA Unified is designed so membership and administration do not live in one product while
            education and credentials live in another. The same organization, user, membership, and activity
            data power both sides.
          </p>
        </div>
        <div className={styles.moduleGrid}>
          {modules.map(([title, copy]) => (
            <article key={title} className={styles.moduleCard}>
              <div className={styles.moduleIcon}><MiniIcon type={iconFor(title)} /></div>
              <span>{title}</span>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.workflowSection}>
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>THE ICA UNIFIED RULE</p>
          <h2>Everything follows the organization and the person.</h2>
        </div>
        <div className={styles.workflowGrid}>
          {workflow.map(([number, title, copy]) => (
            <article key={number}>
              <div className={styles.workflowTop}><span>{number}</span><i><MiniIcon type={number === '01' ? 'people' : number === '02' ? 'data' : number === '03' ? 'support' : 'credential'} /></i></div>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="integrations" className={styles.integration}>
        <div>
          <p className={styles.eyebrow}>TWO WAYS TO RUN IT</p>
          <h2>Use ICA Unified as the portal — or connect the website you already have.</h2>
        </div>
        <div className={styles.integrationChoices}>
          <article>
            <small>OPTION A</small>
            <h3>ICA Unified Portal</h3>
            <p>
              Use ICA Unified as the member-facing workspace for sign-in, learning, credentials,
              documents, administration, and organization operations.
            </p>
            <div>MEMBER → ICA UNIFIED → ORGANIZATION DATA</div>
          </article>
          <article>
            <small>OPTION B</small>
            <h3>Existing Website + ICA Unified</h3>
            <p>
              Keep the website your organization already uses. ICA Unified becomes the connected backend
              for member registration, learning, business workflows, permissions, and data.
            </p>
            <div>YOUR WEBSITE → API → ICA UNIFIED → ORGANIZATION DATA</div>
          </article>
        </div>
      </section>

      <section id="plans" className={styles.section}>
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>PLANS & ONBOARDING</p>
          <h2>$249/month for the platform. Add implementation only when the organization needs it.</h2>
          <p>ICA Unified Professional is $249 per month. Data migration, custom integrations, and larger implementation work are scoped separately. Every new organization can begin with the 14-day trial workspace.</p>
        </div>
        <div className={styles.planGrid}>
          {plans.map((plan) => (
            <article key={plan.name} className={plan.featured ? styles.planFeatured : styles.planCard}>
              <small>{plan.tag}</small>
              <h3>{plan.name}</h3>
              <p>{plan.description}</p>
              <ul>
                {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
              </ul>
              <a href={plan.href} {...(plan.external ? { target: '_blank', rel: 'noreferrer' } : {})}>{plan.cta} →</a>
            </article>
          ))}
        </div>
      </section>

      <section id="mobile" className={styles.mobileSection}>
        <div className={styles.mobileIntro}>
          <div>
            <p className={styles.eyebrow}>ICA UNIFIED MOBILE</p>
            <h2>Built for the people standing at the event.</h2>
            <p>
              The desktop workspace runs the organization. ICA Unified Mobile is being built for the staff member
              checking people in, walking a conference floor, helping a member, or verifying credentials in real time.
              One iPhone/iPad app. Same organization. Same member record. Same ICA Unified cloud data.
            </p>
          </div>
          <div className={styles.mobileStatusCard}>
            <span>APP AVAILABILITY</span>
            <strong>iPhone + iPad</strong>
            <b>IN DEVELOPMENT</b>
            <small>One App Store download for both devices.</small>
          </div>
        </div>

        <div className={styles.mobileFeatureGrid}>
          <article><span>01</span><i><MiniIcon type="mobile" /></i><h3>Scan QR</h3><p>Use the device camera to scan ICA event check-in codes and move directly into the attendance workflow.</p></article>
          <article><span>02</span><i><MiniIcon type="people" /></i><h3>Member Lookup</h3><p>Find a member quickly and view their current membership status, role, and organization record.</p></article>
          <article><span>03</span><i><MiniIcon type="workflow" /></i><h3>Attendance</h3><p>Confirm event attendance against the existing ICA event workflow and preserve the activity in the same organization record.</p></article>
          <article><span>04</span><i><MiniIcon type="credential" /></i><h3>CE + Wallet</h3><p>Show earned CE, remaining requirements, credentials, verification status, and attendance certificates from the same ledger.</p></article>
          <article><span>05</span><i><MiniIcon type="support" /></i><h3>Notifications</h3><p>Surface event, credential, renewal, learning, and organization alerts without requiring the full desktop dashboard.</p></article>
          <article><span>06</span><i><MiniIcon type="data" /></i><h3>Same Cloud Account</h3><p>No second member database and no separate mobile account. Mobile, web, and future desktop clients use the same ICA Unified organization data.</p></article>
        </div>

        <div className={styles.platformAvailability}>
          <div><span>WEB</span><strong>LIVE</strong></div>
          <div><span>IPHONE + IPAD</span><strong>IN DEVELOPMENT</strong></div>
          <div><span>ANDROID</span><strong>PLANNED</strong></div>
          <div><span>WINDOWS + MAC</span><strong>PLANNED</strong></div>
        </div>
      </section>

      <section id="included" className={styles.transparencySection}>
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>CLEAR PRICING / CLEAR SUPPORT</p>
          <h2>Know exactly what the $249/month subscription includes.</h2>
          <p>
            Standard Support covers the use and operation of existing ICA Unified features.
            Custom development, implementation, migration, training, and third-party integration
            work are professional services and are quoted separately.
          </p>
        </div>

        <div className={styles.includedGrid}>
          {includedWithProfessional.map(([title, copy]) => (
            <article key={title}>
              <div className={styles.includedIcon}><MiniIcon type={iconFor(title)} /></div>
              <span>INCLUDED</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>

        <div className={styles.supportSplit}>
          <article className={styles.supportCard}>
            <p className={styles.eyebrow}>STANDARD SUPPORT / INCLUDED</p>
            <h3>Normal product support is part of the subscription.</h3>
            <ul>
              {standardSupport.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <div className={styles.supportNote}>
              Response targets describe when ICA will respond and begin triage. They are not a guaranteed resolution time.
            </div>
          </article>

          <article className={styles.boundaryCard}>
            <p className={styles.eyebrow}>THE IMPORTANT LINE</p>
            <h3>Software access is included. Hands-on project work is separate.</h3>
            <div className={styles.boundaryExample}>
              <strong>INCLUDED</strong>
              <span>Customer uploads a CSV, maps fields, previews it, and runs the ICA migration tool.</span>
            </div>
            <div className={styles.boundaryExample}>
              <strong>PROFESSIONAL SERVICE</strong>
              <span>Customer sends ICA old spreadsheets/databases and asks ICA to clean, reconstruct, map, and migrate everything for them.</span>
            </div>
            <div className={styles.boundaryExample}>
              <strong>INCLUDED</strong>
              <span>Customer uses ICA&apos;s existing API keys, endpoints, and webhook system.</span>
            </div>
            <div className={styles.boundaryExample}>
              <strong>PROFESSIONAL SERVICE</strong>
              <span>Customer asks ICA to build a new Salesforce, accounting, proprietary database, SSO, or custom-system integration.</span>
            </div>
          </article>
        </div>

        <div className={styles.servicesHead}>
          <div>
            <p className={styles.eyebrow}>OPTIONAL PROFESSIONAL SERVICES</p>
            <h3>Extra work is priced before the work starts.</h3>
          </div>
          <p>No surprise implementation bill. If a request falls outside Standard Support, ICA defines the scope and price before beginning the paid work.</p>
        </div>

        <div className={styles.servicesTable}>
          {professionalServices.map(([service, price, description]) => (
            <article key={service}>
              <div><span>SERVICE</span><strong>{service}</strong></div>
              <div><span>PRICE</span><strong>{price}</strong></div>
              <p>{description}</p>
            </article>
          ))}
        </div>

        <div className={styles.pricingPromise}>
          <strong>$249/month.</strong>
          <span>Standard support included. Optional project work is disclosed and approved separately.</span>
          <a href="/register">START 14-DAY TRIAL →</a>
        </div>
      </section>

      <section className={styles.finalCta}>
        <p className={styles.eyebrow}>ICA UNIFIED</p>
        <h2>Your organization should not need five disconnected systems to know one member.</h2>
        <p>Create the company workspace, bring the team in, and keep the business and learning layers connected from day one.</p>
        <div className={styles.actions}>
          <a className={styles.primary} href="/register">CREATE COMPANY WORKSPACE →</a>
          <a className={styles.secondary} href="/login">SIGN IN</a>
        </div>
      </section>

      <footer className={styles.footer}>
        <span>ICA Unified</span>
        <span>Built by I Computer Anything</span>
        <a href="https://icomputeranything.com/" target="_blank" rel="noreferrer">IComputerAnything.com ↗</a>
      </footer>
    </main>
  );
}