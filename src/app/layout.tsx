import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ICA Unified | AMS + LMS Business Platform',
  description: 'One company, one database, one login, one member record. ICA Unified combines AMS, LMS, credentials, documents, compliance, reporting, and website integrations in one cloud platform by I Computer Anything.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
