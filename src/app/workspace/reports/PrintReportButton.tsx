'use client';

export default function PrintReportButton() {
  return <button type="button" onClick={() => window.print()}>PRINT / SAVE PDF</button>;
}
