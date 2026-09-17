import Link from 'next/link';

export default function LegalFooter() {
  return (
    <footer style={{borderTop:'1px solid #dce8ef',background:'#f8fbfd',padding:'16px 22px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,flexWrap:'wrap',color:'#718595',fontSize:11}}>
      <span>© {new Date().getFullYear()} I Computer Anything · ICA Unified</span>
      <nav style={{display:'flex',gap:16,flexWrap:'wrap'}} aria-label="Legal">
        <Link href="/privacy" style={{color:'#147fd1',textDecoration:'none',fontWeight:800}}>Privacy</Link>
        <Link href="/terms" style={{color:'#147fd1',textDecoration:'none',fontWeight:800}}>Terms</Link>
        <Link href="/cancellation" style={{color:'#147fd1',textDecoration:'none',fontWeight:800}}>Cancellation & Billing</Link>
      </nav>
    </footer>
  );
}
