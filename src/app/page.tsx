import styles from './landing.module.css';

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
    name: 'Core',
    tag: 'ICA UNIFIED HOSTED',
    description: 'For organizations that want ICA Unified to serve as their primary member and learning portal.',
    features: ['AMS + LMS workspace', 'People & member records', 'Learning & credentials', 'Documents & compliance', 'Reporting', '14-day trial'],
    cta: 'START CORE TRIAL',
    href: '/register',
  },
  {
    name: 'Business',
    tag: 'CONNECTED WEBSITE',
    description: 'For organizations that already have a website and want it connected to the ICA Unified backend.',
    features: ['Everything in Core', 'Existing website integration', 'API & webhook workflows', 'Branded organization experience', 'Connected registration & enrollment', 'Integration onboarding'],
    cta: 'START BUSINESS TRIAL',
    href: '/register',
    featured: true,
  },
  {
    name: 'Enterprise',
    tag: 'CUSTOM INTEGRATION',
    description: 'For larger organizations that need deeper data migration, identity, workflow, or infrastructure requirements.',
    features: ['Everything in Business', 'Custom integrations', 'SSO planning', 'Data migration support', 'Advanced onboarding', 'Dedicated implementation scope'],
    cta: 'TALK TO I COMPUTER ANYTHING',
    href: 'https://icomputeranything.com/#contact',
    external: true,
  },
];

export default function Home() {
  return (
    <main className={styles.page}>
      <header className={styles.nav}>
        <a className={styles.brand} href="/">
          <span>ICA</span>
          <strong>UNIFIED</strong>
        </a>
        <nav>
          <a href="#platform">Platform</a>
          <a href="#integrations">Integrations</a>
          <a href="#plans">Plans</a>
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
        </div>

        <div className={styles.systemCard} aria-label="ICA Unified system map">
          <div className={styles.systemTop}>
            <span>ICA UNIFIED</span>
            <i>CONNECTED</i>
          </div>
          <div className={styles.core}>
            <small>ONE SHARED PLATFORM</small>
            <strong>AMS + LMS</strong>
            <span>BUSINESS DATA CORE</span>
          </div>
          <div className={styles.nodes}>
            <span>PEOPLE</span>
            <span>LEARNING</span>
            <span>CREDENTIALS</span>
            <span>DOCUMENTS</span>
            <span>COMPLIANCE</span>
            <span>REPORTING</span>
          </div>
          <div className={styles.systemBottom}>WEBSITE ↔ API ↔ ICA UNIFIED ↔ ORGANIZATION WORKSPACE</div>
        </div>
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
              <span>{number}</span>
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
          <h2>Start with the platform. Add the integration your organization needs.</h2>
          <p>Final subscription pricing will be shown before paid activation. Every new organization can begin with the 14-day trial workspace.</p>
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
