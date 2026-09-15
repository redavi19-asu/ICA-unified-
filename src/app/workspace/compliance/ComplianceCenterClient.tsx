'use client';

import { FormEvent, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';

type Course = {
  id: string;
  title: string;
  published: boolean;
  category: string;
  credits: number;
};

type Requirement = {
  id: string;
  name: string;
  category: string;
  requiredCredits: number;
  renewalDate: string | null;
};

type EventItem = {
  id: string;
  name: string;
  status: string;
  startAt: string;
  credits: number;
  category: string;
};

export default function ComplianceCenterClient({
  organizationName,
  courses,
  requirements,
  events,
}: {
  organizationName: string;
  courses: Course[];
  requirements: Requirement[];
  events: EventItem[];
}) {
  const router = useRouter();
  const [requirement, setRequirement] = useState({ name: '', category: 'GENERAL', requiredCredits: '', renewalDate: '' });
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [checkins, setCheckins] = useState<Record<string, { url: string; expiresAt: string }>>({});

  async function addRequirement(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    const response = await fetch('/api/compliance/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'ADD_REQUIREMENT',
        ...requirement,
        requiredCredits: Number(requirement.requiredCredits),
      }),
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) return setMessage(data.error || 'Unable to add requirement.');
    setRequirement({ name: '', category: 'GENERAL', requiredCredits: '', renewalDate: '' });
    setMessage('Compliance requirement added.');
    router.refresh();
  }

  async function createCheckin(workflowId: string) {
    setMessage('');
    const response = await fetch('/api/compliance/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'CREATE_CHECKIN', workflowId }),
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || 'Unable to create check-in.');
    const url = `${window.location.origin}/checkin/${data.token}`;
    setCheckins((current) => ({ ...current, [workflowId]: { url, expiresAt: data.expiresAt } }));
    setMessage('Event check-in QR created.');
  }

  return (
    <main style={{minHeight:'100vh',background:'#0f1113',color:'#f0eee8',padding:'clamp(24px,5vw,72px)',fontFamily:'Arial,sans-serif'}}>
      <button onClick={() => router.push('/workspace')} style={ghostButton}>← WORKSPACE</button>
      <header style={{display:'grid',gridTemplateColumns:'minmax(0,1.5fr) minmax(280px,.7fr)',gap:30,alignItems:'end',borderBottom:'1px solid #303438',padding:'28px 0 34px'}}>
        <div>
          <p style={eyebrow}>{organizationName.toUpperCase()} / AMS + LMS</p>
          <h1 style={{fontSize:'clamp(54px,8vw,108px)',lineHeight:.77,letterSpacing:'-.065em',margin:'14px 0 0'}}>COMPLIANCE<br/>CENTER</h1>
        </div>
        <p style={{color:'#989fa4',lineHeight:1.6}}>One credit ledger for courses, conferences, QR attendance, credentials, and renewal readiness. No AMS-to-LMS reconciliation step.</p>
      </header>

      <section style={metricGrid}>
        <Metric label="COURSES" value={courses.length} />
        <Metric label="CREDIT RULES" value={courses.filter((c) => c.credits > 0).length} />
        <Metric label="REQUIREMENTS" value={requirements.length} />
        <Metric label="EVENTS" value={events.length} />
      </section>

      <section style={sectionStyle}>
        <div style={sectionHead}>
          <div><p style={eyebrow}>01 / RENEWAL + LICENSE RULES</p><h2 style={sectionTitle}>Define what members must earn.</h2></div>
          <p style={sectionCopy}>Use categories such as GENERAL, ETHICS, SAFETY, CLINICAL, or any organization-specific CE bucket.</p>
        </div>

        <form onSubmit={addRequirement} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr auto',gap:10,alignItems:'end'}}>
          <Field label="Requirement name"><input value={requirement.name} onChange={(e) => setRequirement({...requirement,name:e.target.value})} placeholder="Maryland License" required style={inputStyle}/></Field>
          <Field label="Category"><input value={requirement.category} onChange={(e) => setRequirement({...requirement,category:e.target.value})} style={inputStyle}/></Field>
          <Field label="Credits"><input value={requirement.requiredCredits} onChange={(e) => setRequirement({...requirement,requiredCredits:e.target.value})} inputMode="decimal" placeholder="24" required style={inputStyle}/></Field>
          <Field label="Renewal date"><input type="date" value={requirement.renewalDate} onChange={(e) => setRequirement({...requirement,renewalDate:e.target.value})} style={inputStyle}/></Field>
          <button disabled={saving} style={primaryButton}>{saving ? 'SAVING…' : 'ADD RULE'}</button>
        </form>

        <div style={{marginTop:20,borderTop:'1px solid #2b3034'}}>
          {requirements.length === 0 ? <p style={emptyStyle}>No license or certification CE requirements yet.</p> : requirements.map((item) => (
            <article key={item.id} style={rowStyle}>
              <strong>{item.name}</strong>
              <span>{item.category}</span>
              <span>{item.requiredCredits} credits</span>
              <span>{item.renewalDate ? new Date(item.renewalDate).toLocaleDateString() : 'No fixed date'}</span>
            </article>
          ))}
        </div>
      </section>

      <section style={sectionStyle}>
        <div style={sectionHead}>
          <div><p style={eyebrow}>02 / COURSE CREDIT ENGINE</p><h2 style={sectionTitle}>Tell ICA what each course is worth.</h2></div>
          <p style={sectionCopy}>When a learner completes the course, ICA posts the credit automatically to the same member record that holds membership and credentials.</p>
        </div>
        <div style={{borderTop:'1px solid #2b3034'}}>
          {courses.map((course) => <CourseRuleRow key={course.id} course={course} onSaved={(text) => setMessage(text)} />)}
        </div>
      </section>

      <section style={sectionStyle}>
        <div style={sectionHead}>
          <div><p style={eyebrow}>03 / QR EVENT ATTENDANCE</p><h2 style={sectionTitle}>Scan → check in → award credit.</h2></div>
          <p style={sectionCopy}>Generate a reusable event QR. Logged-in members scan it, confirm attendance, receive configured CE credit, and can receive an attendance certificate automatically.</p>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(290px,1fr))',gap:14}}>
          {events.length === 0 ? <p style={emptyStyle}>Create an Event / Webinar workflow first.</p> : events.map((item) => {
            const checkin = checkins[item.id];
            return (
              <article key={item.id} style={{border:'1px solid #2e3337',padding:20,background:'#141719'}}>
                <p style={eyebrow}>{item.status} · {item.category}</p>
                <h3 style={{fontSize:24,margin:'8px 0'}}>{item.name}</h3>
                <p style={{color:'#8d9499',minHeight:40}}>{item.startAt ? new Date(item.startAt).toLocaleString() : 'Date not set'} · {item.credits || 0} credits</p>
                {!checkin ? (
                  <button onClick={() => createCheckin(item.id)} style={primaryButton}>CREATE CHECK-IN QR</button>
                ) : (
                  <div style={{marginTop:18}}>
                    <div style={{background:'#fff',padding:14,width:'fit-content'}}><QRCodeSVG value={checkin.url} size={190} /></div>
                    <code style={{display:'block',color:'#aeb4b8',fontSize:10,wordBreak:'break-all',marginTop:12}}>{checkin.url}</code>
                    <small style={{display:'block',color:'#747b80',marginTop:8}}>Valid until {new Date(checkin.expiresAt).toLocaleString()}</small>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {message && <div style={{position:'fixed',right:22,bottom:22,maxWidth:420,padding:'15px 18px',background:'#efede7',color:'#111',fontWeight:700,boxShadow:'0 20px 50px rgba(0,0,0,.35)'}}>{message}</div>}
    </main>
  );
}

function CourseRuleRow({ course, onSaved }: { course: Course; onSaved: (message: string) => void }) {
  const [category, setCategory] = useState(course.category);
  const [credits, setCredits] = useState(String(course.credits || ''));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const response = await fetch('/api/compliance/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'SET_COURSE_CREDITS',
        courseId: course.id,
        category,
        credits: Number(credits || 0),
      }),
    });
    const data = await response.json();
    setSaving(false);
    onSaved(response.ok ? data.message : data.error || 'Unable to save course credits.');
  }

  return (
    <article style={{display:'grid',gridTemplateColumns:'minmax(220px,2fr) 1fr .6fr auto',gap:12,alignItems:'end',padding:'16px 0',borderBottom:'1px solid #252a2d'}}>
      <div><strong>{course.title}</strong><small style={{display:'block',color:'#747b80',marginTop:5}}>{course.published ? 'Published' : 'Draft'}</small></div>
      <Field label="Category"><input value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}/></Field>
      <Field label="Credits"><input value={credits} onChange={(e) => setCredits(e.target.value)} inputMode="decimal" style={inputStyle}/></Field>
      <button onClick={save} disabled={saving} style={ghostButton}>{saving ? 'SAVING…' : 'SAVE'}</button>
    </article>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{display:'grid',gap:7,fontSize:10,letterSpacing:'.12em',color:'#7d858a'}}>{label.toUpperCase()}{children}</label>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div style={{background:'#15181a',padding:20}}><span style={eyebrow}>{label}</span><strong style={{display:'block',fontSize:42,marginTop:8}}>{String(value).padStart(2,'0')}</strong></div>;
}

const eyebrow: CSSProperties = {fontSize:10,letterSpacing:'.16em',color:'#7d858a',margin:0};
const sectionStyle: CSSProperties = {marginTop:56,paddingTop:28,borderTop:'1px solid #303438'};
const sectionHead: CSSProperties = {display:'grid',gridTemplateColumns:'1.25fr .75fr',gap:24,alignItems:'end',marginBottom:24};
const sectionTitle: CSSProperties = {fontSize:'clamp(30px,4vw,52px)',letterSpacing:'-.04em',margin:'8px 0 0'};
const sectionCopy: CSSProperties = {color:'#8f969b',lineHeight:1.55,margin:0};
const metricGrid: CSSProperties = {display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:1,background:'#2a2f32',marginTop:28};
const inputStyle: CSSProperties = {width:'100%',boxSizing:'border-box' as const,background:'#101214',border:'1px solid #343a3e',color:'#f0eee8',padding:'12px 13px',outline:'none'};
const primaryButton: CSSProperties = {background:'#efede7',color:'#111',border:0,padding:'13px 16px',fontWeight:800,letterSpacing:'.08em',cursor:'pointer'};
const ghostButton: CSSProperties = {background:'transparent',color:'#d9d7d1',border:'1px solid #363b3f',padding:'10px 13px',fontWeight:700,letterSpacing:'.08em',cursor:'pointer'};
const rowStyle: CSSProperties = {display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr',gap:12,padding:'15px 0',borderBottom:'1px solid #252a2d',color:'#a9afb3'};
const emptyStyle: CSSProperties = {color:'#777f84',padding:'18px 0'};
