import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import styles from './landing.module.css';
import SystemStatusGlobe from './SystemStatusGlobe';
import { resolveVerifiedCustomDomain } from '../lib/organization-ops';

const modules = [
  ['Association Operations', 'Run people, memberships, roles, events, controlled documents, reporting, and organization administration from one workspace.'],
  ['Learning + Compliance', 'Build training, track progress, award credentials, post CE credits, and measure renewal readiness against the same member record.'],
  ['Executable Workflows', 'Turn membership programs and events into live public application and registration flows instead of leaving them as back-office configuration.'],
  ['Connected Operations', 'Connect websites, APIs, webhooks, email, custom domains, payments, imports, exports, backups, mobile operations, and platform support around the same data.'],
];

const workflow = [
  ['01', 'One company', 'Each customer receives a secure organization workspace with its own tenant boundary.'],
  ['02', 'One database', 'Business, membership, learning, credential, and activity data stay connected instead of being split across tools.'],
  ['03', 'One login', 'Members, employees, managers, and administrators enter through one identity and receive the correct role-based view.'],
  ['04', 'One member record', 'Training, status, documents, credentials, and organizational activity follow the same person throughout the platform.'],
];

const capabilityGroups = [
  {
    title: 'People + Organization',
    icon: 'people',
    summary: 'The AMS side of Unified.',
    items: [
      'Role-based organization access for Owners, Admins, Managers, and Members.',
      'Member records with status, job title, invitations, activation, suspension, and organization access.',
      'One identity can belong to more than one ICA workspace; Company ID selects the correct organization when needed.',
      'Real dashboard metrics for people, learning, credentials, documents, compliance, and workflow activity.',
    ],
  },
  {
    title: 'Learning Management',
    icon: 'learning',
    summary: 'Courses and progress tied directly to the member record.',
    items: [
      'Create courses with text, video, document, live-session, and quiz content.',
      'Assign training, set due dates, track lesson/course progress, enforce passing scores, and record completion.',
      'Issue credentials automatically when configured course requirements are completed.',
      'Post configured continuing-education credit to the same member CE ledger.',
    ],
  },
  {
    title: 'Credentials + CE Compliance',
    icon: 'credential',
    summary: 'Training, attendance, renewal, and verification in one ledger.',
    items: [
      'Digital credentials and verification records tied to each member.',
      'Member CE + credential wallet with transcript, earned credits, outstanding requirements, expiration, and renewal readiness.',
      'Organization compliance rules for credit categories and renewal requirements.',
      'Event attendance can post CE credits and automatically issue attendance credentials.',
    ],
  },
  {
    title: 'Membership Workflows',
    icon: 'workflow',
    summary: 'A configured membership becomes a real public application flow.',
    items: [
      'Membership tiers with price, billing cadence, approval rules, qualifications, benefits, renewal planning windows, and CE requirements.',
      'Activate a workflow to create a live public ICA application page.',
      'Collect submissions, review applicants, approve or reject them, and preserve workflow status inside the organization.',
      'Approved members can receive secure ICA activation invitations automatically.',
    ],
  },
  {
    title: 'Events + Registration',
    icon: 'workflow',
    summary: 'Registration, payment, attendance, and credits stay connected.',
    items: [
      'Configure event/webinar type, date/time, capacity, ticket price, meeting link, CE credit, attendance-certificate rules, and confirmations.',
      'Activate a workflow to create a live public registration page.',
      'Capacity enforcement, waitlists, duplicate protection, submission review, and registration status management.',
      'Self-scan event QR and staff-scan member QR modes feed the same attendance and CE records.',
    ],
  },
  {
    title: 'Organization Payments',
    icon: 'data',
    summary: 'ICA subscription money and customer organization money stay separate.',
    items: [
      'ICA Unified Professional billing uses Stripe for the organization’s $299/month software subscription.',
      'Each customer organization can connect its own Stripe account through Stripe Connect.',
      'Paid membership and event workflows can open secure Stripe Checkout for that organization.',
      'Payment return and Stripe webhook verification update the exact workflow submission before paid access is granted.',
    ],
  },
  {
    title: 'Controlled Documents',
    icon: 'document',
    summary: 'Members can actually review what they are acknowledging.',
    items: [
      'Create versioned controlled documents with real document text and optional private file attachments.',
      'Members open a document review area before the acknowledgment action is presented.',
      'Secure organization-scoped file delivery for controlled document attachments.',
      'Acknowledgment counts feed document-control and organization reporting.',
    ],
  },
  {
    title: 'Reports + Data Tools',
    icon: 'report',
    summary: 'See the organization and move its data safely.',
    items: [
      'Organization reporting for learning, credentials, compliance, and document-control activity.',
      'Self-service CSV member importer with field mapping, preview, validation, duplicate handling, and controlled commit.',
      'Member CSV export plus organization JSON backup.',
      'Backups include workflow execution and controlled-document data as part of the organization record.',
    ],
  },
  {
    title: 'API + Webhooks',
    icon: 'api',
    summary: 'Use the portal or connect an existing website/system.',
    items: [
      'Tenant-scoped organization API keys and versioned member API access.',
      'Signed HTTPS webhooks with delivery status for outbound ICA events.',
      'Existing websites can use ICA for member registration/data without replacing the public site.',
      'Custom CRM, accounting, SSO, proprietary-system, and specialized integrations can be scoped as professional services.',
    ],
  },
  {
    title: 'Email + Custom Domains',
    icon: 'domain',
    summary: 'Customer-facing communications and branded portal entry.',
    items: [
      'Transactional email outbox for invitations, workflow confirmations, status updates, and payment messages.',
      'When the managed provider is connected, ICA sends new mail and can retry queued or failed messages.',
      'Custom-domain DNS ownership verification and verified-host organization resolution.',
      'A verified customer hostname can route visitors into the correct organization login after DNS/Worker routing is configured.',
    ],
  },
  {
    title: 'Security + Access',
    icon: 'compliance',
    summary: 'Organization boundaries and access controls are enforced throughout the product.',
    items: [
      'Tenant-scoped database access and role checks across organization operations.',
      'Turnstile and rate limiting on public authentication and workflow submission paths.',
      'Email verification when delivery is configured, secure password reset, and 12-character passwords for new registrations.',
      'Local trial-expiration fallback closes workspace/mobile/public-flow access even if Stripe is temporarily unavailable.',
    ],
  },
  {
    title: 'Mobile + Event Floor',
    icon: 'mobile',
    summary: 'The same cloud record follows staff and members away from the desk.',
    items: [
      'Native ICA Mobile app code for iPhone/iPad with production build profiles and secure token storage.',
      'Member QR, staff QR scanning, event check-in, member lookup, CE/credential wallet, and organization activity notifications.',
      'Web and mobile use the same organization, member, attendance, CE, credential, and permission data.',
      'Windows/macOS Tauri desktop wrapper is built; signed installer release remains the external release step.',
    ],
  },
  {
    title: 'Platform Operations + ICA Assist',
    icon: 'support',
    summary: 'ICA can support the companies running on the platform.',
    items: [
      'Platform/Super Admin controls for organization health, diagnostics, account state, analytics, and support actions.',
      'Live Worker/database health signaling on the public ICA system-status globe.',
      'ICA Assist provides in-product guidance using the product’s current workflows, billing, compliance, and integration model.',
      'Owner/Admin access center separates organization operations, billing, integrations, tools, and released client access.',
    ],
  },
];

const plans = [
  {
    name: 'Professional',
    tag: '$299 / MONTH',
    description: 'The complete ICA Unified association + learning platform with standard support included.',
    features: ['AMS + LMS workspace', 'CE/compliance + credential wallet', 'Safe self-service member importer', 'API keys + signed webhooks', 'Custom-domain verification', 'Standard support included', '14-day trial'],
    cta: 'START PROFESSIONAL TRIAL',
    href: '/register',
    featured: true,
  },
  {
    name: 'Professional + Setup',
    tag: '$299 / MONTH + ONE-TIME SETUP',
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
  ['Complete Core Platform', 'People, learning, workflows, compliance, credentials, documents, reports, and member workspace access under one organization subscription.'],
  ['Self-Service Operations', 'Customer-run setup tools including invitations, workflow creation, course management, imports, exports, backups, API keys, webhooks, and domain verification.'],
  ['Organization Payment Layer', 'Stripe Connect architecture for the customer organization’s own membership dues and event fees, kept separate from ICA SaaS billing.'],
  ['Standard Product Support', 'Help using and troubleshooting existing ICA Unified features during the published support window.'],
  ['Cloud Access', 'The live web workspace plus access to released ICA native clients using the same organization identity and cloud data.'],
  ['14-Day Trial', 'A new organization can evaluate the Professional workspace before recurring software billing begins.'],
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
  if (key.includes('member') || key.includes('people') || key.includes('ams') || key.includes('association')) return 'people';
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
  if (key.includes('data') || key.includes('platform') || key.includes('payment')) return 'data';
  return 'web';
}

export default async function Home() {
  const host = (await headers()).get('host') || '';
  const customOrganization = await resolveVerifiedCustomDomain(host);
  if (customOrganization) {
    redirect(`/login?company=${encodeURIComponent(customOrganization.slug)}&portal=1`);
  }

  return (
    <main className={styles.page}>
      <header className={styles.nav}>
        <Link className={styles.brand} href="/">
          <span className={styles.icaMark} aria-label="ICA">
            <em className={styles.icaI}>I</em><em className={styles.icaC}>C</em><em className={styles.icaA}>A</em>
          </span>
          <strong>UNIFIED</strong>
        </Link>
        <nav>
          <a href="#platform">Platform</a>
          <a href="#capabilities">Capabilities</a>
          <a href="#integrations">Integrations</a>
          <a href="#mobile">Mobile</a>
          <a href="#plans">Plans</a>
          <a href="/downloads">Apps</a>
          <a href="/login">Customer Login</a>
        </nav>
        <a className={styles.navCta} href="/register">Start Free Trial</a>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>I COMPUTER ANYTHING / BUSINESS SYSTEMS</p>
          <h1 className="ica-hero-brand-font">One company.<br />One database.<br />One login.<br />One member record.</h1>
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
            <span><i><PlatformIcon type="windows" /></i><b>WINDOWS</b><small>SIGNING PENDING</small></span>
            <span><i><PlatformIcon type="mac" /></i><b>MAC</b><small>NOTARIZATION PENDING</small></span>
            <span className={styles.mobilePair}><i><PlatformIcon type="iphone" /><PlatformIcon type="ipad" /></i><b>IPHONE + IPAD</b><small>STORE RELEASE PENDING</small></span>
          </div>
          <div className={styles.heroTrinkets} aria-hidden="true">
            <span className={styles.trinketOne}>QR CHECK-IN</span>
            <span className={styles.trinketTwo}>CE WALLET</span>
            <span className={styles.trinketThree}>LIVE MEMBER DATA</span>
          </div>
        </div>

        <SystemStatusGlobe />
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

      <section id="capabilities" className={styles.capabilitySection}>
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>COMPLETE CAPABILITY MAP</p>
          <h2>What ICA Unified actually does.</h2>
          <p>
            This is the customer-facing feature map of the platform today. Each area below is tied to
            the same organization and member record, so operations do not break apart as the organization grows.
          </p>
        </div>

        <div className={styles.capabilityGrid}>
          {capabilityGroups.map((group) => (
            <article key={group.title} className={styles.capabilityCard}>
              <div className={styles.capabilityTop}>
                <i><MiniIcon type={group.icon} /></i>
                <div>
                  <span>{group.summary}</span>
                  <h3>{group.title}</h3>
                </div>
              </div>
              <ul>
                {group.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.workflowSection}>
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>HOW THE DATA MODEL WORKS</p>
          <h2>Every feature above follows the organization and the person.</h2>
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
              Keep the website your organization already uses. The current ICA API connects member registration
              and member data, while signed webhooks push ICA member events outward. Learning, workflow, CRM,
              accounting, SSO, and other custom connections are scoped separately when needed.
            </p>
            <div>YOUR WEBSITE → API → ICA UNIFIED → ORGANIZATION DATA</div>
          </article>
        </div>
      </section>

      <section id="mobile" className={styles.mobileSection}>
        <div className={styles.mobileIntro}>
          <div>
            <p className={styles.eyebrow}>ICA UNIFIED MOBILE</p>
            <h2>Built for the people standing at the event.</h2>
            <p>
              The desktop workspace runs the organization. ICA Unified Mobile is built as a native Expo app for the staff member
              checking people in, walking a conference floor, helping a member, or verifying credentials in real time.
              Production build profiles are in place; signing and store submission are the remaining release steps.
              One app. Same organization. Same member record. Same ICA Unified cloud data.
            </p>
          </div>
          <div className={styles.mobileStatusCard}>
            <span>APP AVAILABILITY</span>
            <strong>iPhone + iPad</strong>
            <b>STORE RELEASE PENDING</b>
            <small>Native app code + production build profiles are ready; signing/submission remains.</small>
          </div>
        </div>

        <div className={styles.mobileFeatureGrid}>
          <article><span>01</span><i><MiniIcon type="mobile" /></i><h3>Scan QR</h3><p>Use the device camera to scan ICA event check-in codes and move directly into the attendance workflow.</p></article>
          <article><span>02</span><i><MiniIcon type="people" /></i><h3>Member Lookup</h3><p>Find a member quickly and view their current membership status, role, and organization record.</p></article>
          <article><span>03</span><i><MiniIcon type="workflow" /></i><h3>Attendance</h3><p>Confirm event attendance against the existing ICA event workflow and preserve the activity in the same organization record.</p></article>
          <article><span>04</span><i><MiniIcon type="credential" /></i><h3>CE + Wallet</h3><p>Show earned CE, remaining requirements, credentials, verification status, and attendance certificates from the same ledger.</p></article>
          <article><span>05</span><i><MiniIcon type="support" /></i><h3>Notifications</h3><p>Surface organization activity and event, credential, and learning updates without requiring the full desktop dashboard.</p></article>
          <article><span>06</span><i><MiniIcon type="data" /></i><h3>Same Cloud Account</h3><p>No second member database and no separate mobile account. Mobile, web, and future desktop clients use the same ICA Unified organization data.</p></article>
        </div>

        <div className={styles.platformAvailability}>
          <div><span>WEB</span><strong>LIVE</strong></div>
          <div><span>IPHONE + IPAD</span><strong>STORE RELEASE PENDING</strong></div>
          <div><span>ANDROID</span><strong>BUILD CONFIG READY</strong></div>
          <div><span>WINDOWS + MAC</span><strong>SIGNING / RELEASE</strong></div>
        </div>
      </section>

      <section id="plans" className={styles.section}>
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>PLANS & ONBOARDING</p>
          <h2>$299/month for the platform. Add implementation only when the organization needs it.</h2>
          <p>ICA Unified Professional is $299 per month. Data migration, custom integrations, and larger implementation work are scoped separately. Every new organization can begin with the 14-day trial workspace.</p>
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

      <section id="included" className={styles.transparencySection}>
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>WHAT THE SUBSCRIPTION COVERS</p>
          <h2>The capability map is the product. This section explains the commercial boundary.</h2>
          <p>
            Professional includes the current ICA Unified platform and Standard Support. Hands-on implementation,
            managed migration, custom development, dedicated training, and new third-party integrations are separate
            professional services quoted before work begins.
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
          <strong>$299/month.</strong>
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
