import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ICA Unified',
  description: 'Unified LMS + AMS business management platform by I Computer Anything.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
