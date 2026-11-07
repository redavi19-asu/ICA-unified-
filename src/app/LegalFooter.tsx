"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./LegalFooter.module.css";

const sections = [
  { title: "Platform", links: [["Platform overview", "/#platform"], ["Capabilities", "/#capabilities"], ["Integrations", "/#integrations"], ["Mobile & apps", "/#mobile"], ["Plans & included support", "/#plans"]] },
  { title: "Developers", links: [["Developer guide", "/developers"], ["API keys & webhooks", "/workspace/integrations"], ["App downloads", "/downloads"], ["Organization workspace", "/workspace"]] },
  { title: "Company & support", links: [["I Computer Anything ↗", "https://icomputeranything.com/"], ["Contact support", "mailto:ryanedavis@gmail.com?subject=ICA%20Unified%20Support"], ["Customer login", "/login"], ["Create a workspace", "/register"]] },
];

export default function LegalFooter() {
  const pathname = usePathname();
  const compact = /^\/(workspace|platform|my|flow|checkin)(\/|$)/.test(pathname);
  return <footer className={styles.footer}>
    {!compact && <div className={styles.grid}>
      <div className={styles.identity}>
        <Link href="/" className={styles.brand}>ICA <span>UNIFIED</span></Link>
        <p>One company. One database. One login. One member record.</p>
        <a href="https://icomputeranything.com/">Built by I Computer Anything ↗</a>
      </div>
      {sections.map(section => <nav key={section.title} aria-label={`Footer ${section.title}`}>
        <h2>{section.title}</h2>
        <ul>{section.links.map(([label, href]) => <li key={label}><Link href={href}>{label}</Link></li>)}</ul>
      </nav>)}
    </div>}
    <div className={styles.legal}>
      <span>© {new Date().getFullYear()} I Computer Anything · ICA Unified</span>
      <nav aria-label="Legal">
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/cancellation">Cancellation & billing</Link>
        <Link href="/acceptable-use">Acceptable use</Link>
        <Link href="/account-deletion">Account deletion</Link>
        <button type="button" onClick={() => window.dispatchEvent(new Event("ica:cookie-notice"))}>Cookies</button>
        {compact && <a href="mailto:ryanedavis@gmail.com?subject=ICA%20Unified%20Support">Support</a>}
      </nav>
    </div>
  </footer>;
}
