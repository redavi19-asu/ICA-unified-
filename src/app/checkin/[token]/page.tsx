import { requireSession } from '../../../lib/auth';
import { getEventForToken } from '../../../lib/compliance';
import CheckinClient from './CheckinClient';

export default async function CheckinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { membership } = await requireSession();
  const { token } = await params;
  const event = await getEventForToken(token);

  if (!event || event.organizationId !== membership.organizationId) {
    return (
      <main style={{minHeight:'100vh',background:'#0e1012',color:'#f4f1e9',display:'grid',placeItems:'center',padding:24,fontFamily:'Arial,sans-serif'}}>
        <section style={{maxWidth:620,border:'1px solid #34383c',padding:40}}>
          <p style={{letterSpacing:'.16em',fontSize:11,color:'#8b9297'}}>ICA UNIFIED</p>
          <h1>Check-in unavailable</h1>
          <p style={{color:'#a9afb3'}}>This QR code is expired, invalid, or belongs to another organization.</p>
        </section>
      </main>
    );
  }

  const credits = Number(event.config.ceuCredits || 0);
  return (
    <CheckinClient
      token={token}
      eventName={event.eventName}
      credits={Number.isFinite(credits) ? credits : 0}
      category={String(event.config.creditCategory || 'GENERAL').toUpperCase()}
    />
  );
}
