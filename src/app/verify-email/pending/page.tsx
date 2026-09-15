export default function VerifyEmailPendingPage() {
  return (
    <main style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:28,background:'#f8fbfd',color:'#10202f'}}>
      <section style={{width:'min(100%,620px)',background:'#fff',border:'1px solid #d9e5ed',borderRadius:20,padding:'clamp(28px,5vw,52px)',boxShadow:'0 28px 80px rgba(36,78,105,.12)'}}>
        <a href="/" style={{color:'#147fd1',textDecoration:'none',fontSize:10,fontWeight:900,letterSpacing:'.12em'}}>← ICA UNIFIED</a>
        <p style={{margin:'30px 0 10px',color:'#14a176',fontSize:9,fontWeight:900,letterSpacing:'.18em'}}>ONE MORE SECURITY STEP</p>
        <h1 style={{margin:0,fontSize:'clamp(42px,7vw,72px)',lineHeight:.9,letterSpacing:'-.06em'}}>Check your email.</h1>
        <p style={{color:'#6c8191',lineHeight:1.7,fontSize:16}}>ICA sent a verification link to the work email used for this organization. Verify the address, then continue into billing and your 14-day trial.</p>
        <a href="/login" style={{display:'inline-block',marginTop:12,background:'#147fd1',color:'#fff',padding:'14px 18px',borderRadius:10,textDecoration:'none',fontWeight:900,fontSize:11}}>RETURN TO LOGIN →</a>
      </section>
    </main>
  );
}
