import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import QRCode from 'react-native-qrcode-svg';
import * as SecureStore from 'expo-secure-store';
import {
  checkIn,
  extractCheckinToken,
  extractMemberQrToken,
  getMe,
  getMemberQr,
  getNotifications,
  getStaffEvents,
  getWallet,
  login,
  logout,
  searchMembers,
  staffCheckIn,
} from './src/api';

type Screen = 'home' | 'scanner' | 'staffScanner' | 'myqr' | 'members' | 'wallet' | 'notifications';

type MeData = {
  user: { id: string; name: string; email: string; role: string; status: string; jobTitle?: string | null };
  organization: { id: string; name: string; slug: string };
};
type CheckinResult = { eventName: string; message: string };
type MemberQrData = { qrValue: string; member: { name: string; email: string }; organization: { name: string } };
type StaffEvent = { id: string; name: string; startAt?: string; credits?: number; category: string };
type StaffCheckinResult = { member: { name: string }; message: string };
type MemberRow = { membershipId: string; name: string; email: string; role: string; status: string; jobTitle?: string | null };
type WalletData = { summary: { earnedTotal?: number; outstandingTotal?: number }; credentials: Array<{ id: string; name: string; status: string; expiresAt?: string | null }> };
type NotificationRow = { id: string; message: string; createdAt: string };



const TOKEN_KEY = 'ica_unified_mobile_token';

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<MeData | null>(null);
  const [booting, setBooting] = useState(true);
  const [screen, setScreen] = useState<Screen>('home');

  useEffect(() => {
    (async () => {
      const saved = await SecureStore.getItemAsync(TOKEN_KEY);
      if (saved) {
        try {
          const profile = await getMe(saved);
          setToken(saved);
          setMe(profile);
        } catch {
          await SecureStore.deleteItemAsync(TOKEN_KEY);
        }
      }
      setBooting(false);
    })();
  }, []);

  async function onLogin(email: string, password: string, slug: string) {
    const data = await login(email, password, slug);
    await SecureStore.setItemAsync(TOKEN_KEY, data.token);
    setToken(data.token);
    setMe(await getMe(data.token));
  }

  async function signOut() {
    if (token) {
      try {
        await logout(token);
      } catch {
        // Local sign-out still completes if the network is unavailable.
      }
    }
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setToken(null);
    setMe(null);
    setScreen('home');
  }

  if (booting) return <Loading />;
  if (!token || !me) return <LoginScreen onLogin={onLogin} />;

  if (screen === 'scanner') return <ScannerScreen token={token} onBack={() => setScreen('home')} />;
  if (screen === 'staffScanner') return <StaffCheckinScreen token={token} onBack={() => setScreen('home')} />;
  if (screen === 'myqr') return <MyQrScreen token={token} onBack={() => setScreen('home')} />;
  if (screen === 'members') return <MembersScreen token={token} onBack={() => setScreen('home')} />;
  if (screen === 'wallet') return <WalletScreen token={token} onBack={() => setScreen('home')} />;
  if (screen === 'notifications') return <NotificationsScreen token={token} onBack={() => setScreen('home')} />;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.kicker}>ICA UNIFIED MOBILE</Text>
        <Text style={styles.hero}>EVENT MODE</Text>
        <Text style={styles.sub}>{me.organization.name}</Text>
        <View style={styles.identity}>
          <View><Text style={styles.identityName}>{me.user.name}</Text><Text style={styles.muted}>{me.user.role} · {me.user.status}</Text></View>
          <Pressable onPress={signOut}><Text style={styles.link}>SIGN OUT</Text></Pressable>
        </View>

        {['OWNER','ADMIN','MANAGER'].includes(me.user.role) ? (
          <>
            <Action title="STAFF CHECK-IN" copy="Choose an event, then scan each attendee's personal ICA QR." primary onPress={() => setScreen('staffScanner')} />
            <Action title="MEMBER LOOKUP" copy="Find a member quickly while working an event or conference floor." onPress={() => setScreen('members')} />
          </>
        ) : (
          <>
            <Action title="MY ICA QR" copy="Show this code to event staff when the event uses staff-scanned check-in." primary onPress={() => setScreen('myqr')} />
            <Action title="SCAN EVENT QR" copy="Scan the event code when the event uses member self-check-in." onPress={() => setScreen('scanner')} />
          </>
        )}
        <Action title="CE + CREDENTIAL WALLET" copy="View earned credits, renewal progress, certificates, and credentials." onPress={() => setScreen('wallet')} />
        <Action title="NOTIFICATIONS" copy="See recent ICA activity and event-related updates." onPress={() => setScreen('notifications')} />

        <View style={styles.cloudNote}>
          <Text style={styles.cloudTitle}>ONE CLOUD RECORD</Text>
          <Text style={styles.muted}>Web, iPhone, and iPad use the same organization, membership, attendance, CE, and credential data.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function LoginScreen({ onLogin }: { onLogin: (email: string, password: string, slug: string) => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  async function submit() {
    setWorking(true); setError('');
    try { await onLogin(email, password, slug); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to sign in.'); }
    finally { setWorking(false); }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.loginPage}>
        <Text style={styles.kicker}>I COMPUTER ANYTHING</Text>
        <Text style={styles.loginTitle}>ICA{"\n"}UNIFIED</Text>
        <Text style={styles.sub}>Mobile event operations</Text>
        <TextInput style={styles.input} autoCapitalize="none" keyboardType="email-address" placeholder="Email" placeholderTextColor="#7890a1" value={email} onChangeText={setEmail} />
        <TextInput style={styles.input} secureTextEntry placeholder="Password" placeholderTextColor="#7890a1" value={password} onChangeText={setPassword} />
        <TextInput style={styles.input} autoCapitalize="none" placeholder="Company ID / slug" placeholderTextColor="#7890a1" value={slug} onChangeText={setSlug} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={styles.primaryButton} onPress={submit} disabled={working}>
          {working ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>SIGN IN →</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function ScannerScreen({ token, onBack }: { token: string; onBack: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [error, setError] = useState('');

  async function scanned(data: string) {
    if (locked) return;
    setLocked(true); setError('');
    try { setResult(await checkIn(token, extractCheckinToken(data))); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to check in.'); }
  }

  if (!permission) return <Loading />;
  if (!permission.granted) {
    return <Shell title="CAMERA ACCESS" onBack={onBack}>
      <Text style={styles.body}>ICA Unified needs camera permission to scan event QR codes.</Text>
      <Pressable style={styles.primaryButton} onPress={requestPermission}><Text style={styles.primaryButtonText}>ALLOW CAMERA</Text></Pressable>
    </Shell>;
  }

  return (
    <Shell title="SCAN QR" onBack={onBack}>
      <View style={styles.cameraFrame}>
        <CameraView style={StyleSheet.absoluteFill} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={locked ? undefined : ({ data }) => scanned(data)} />
        <View style={styles.scanBox} />
      </View>
      {result ? <View style={styles.result}><Text style={styles.success}>CHECKED IN</Text><Text style={styles.resultTitle}>{result.eventName}</Text><Text style={styles.body}>{result.message}</Text></View> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {locked ? <Pressable style={styles.secondaryButton} onPress={() => { setLocked(false); setResult(null); setError(''); }}><Text style={styles.secondaryButtonText}>SCAN ANOTHER</Text></Pressable> : null}
    </Shell>
  );
}


function MyQrScreen({ token, onBack }: { token: string; onBack: () => void }) {
  const [data, setData] = useState<MemberQrData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function refreshQr() {
      try {
        const next = await getMemberQr(token);
        if (active) { setData(next); setError(''); }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Unable to load member QR.');
      }
    }
    refreshQr();
    const timer = setInterval(refreshQr, 8 * 60 * 1000);
    return () => { active = false; clearInterval(timer); };
  }, [token]);

  return <Shell title="MY ICA QR" onBack={onBack}>
    {!data && !error ? <ActivityIndicator color="#5eb8ff" /> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {data ? (
      <View style={styles.qrCard}>
        <View style={styles.qrWhite}><QRCode value={data.qrValue} size={230} /></View>
        <Text style={styles.qrName}>{data.member.name}</Text>
        <Text style={styles.body}>{data.organization.name}</Text>
        <Text style={styles.muted}>{data.member.email}</Text>
        <Text style={styles.qrHelp}>Hold this screen up for ICA event staff. For security, this signed QR refreshes automatically and expires quickly.</Text>
      </View>
    ) : null}
  </Shell>;
}

function StaffCheckinScreen({ token, onBack }: { token: string; onBack: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [events, setEvents] = useState<StaffEvent[]>([]);
  const [selected, setSelected] = useState<StaffEvent | null>(null);
  const [locked, setLocked] = useState(false);
  const [result, setResult] = useState<StaffCheckinResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getStaffEvents(token)
      .then((data) => setEvents(data.events || []))
      .catch((e) => setError(e instanceof Error ? e.message : 'Unable to load staff-scan events.'));
  }, [token]);

  async function scanned(data: string) {
    if (locked || !selected) return;
    setLocked(true);
    setError('');
    try {
      setResult(await staffCheckIn(token, selected.id, extractMemberQrToken(data)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to check in member.');
    }
  }

  if (!permission) return <Loading />;

  if (!selected) {
    return <Shell title="STAFF CHECK-IN" onBack={onBack}>
      <Text style={styles.body}>Choose the active event. Only events configured for Staff scans member QR appear here.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {events.length === 0 ? <Text style={[styles.muted,{marginTop:18}]}>No active staff-scan events are configured.</Text> : null}
      {events.map((item) => (
        <Pressable key={item.id} style={styles.eventCard} onPress={() => { setSelected(item); setResult(null); setError(''); }}>
          <View>
            <Text style={styles.cardTitle}>{item.name}</Text>
            <Text style={styles.muted}>{item.startAt ? new Date(item.startAt).toLocaleString() : 'Date not set'} · {Number(item.credits || 0)} {item.category} credit(s)</Text>
          </View>
          <Text style={styles.arrow}>→</Text>
        </Pressable>
      ))}
    </Shell>;
  }

  if (!permission.granted) {
    return <Shell title="STAFF CHECK-IN" onBack={() => setSelected(null)}>
      <Text style={styles.body}>ICA Unified needs camera permission so staff can scan member QR codes.</Text>
      <Pressable style={styles.primaryButton} onPress={requestPermission}><Text style={styles.primaryButtonText}>ALLOW CAMERA</Text></Pressable>
    </Shell>;
  }

  return <Shell title="SCAN MEMBER QR" onBack={() => setSelected(null)}>
    <View style={styles.selectedEvent}>
      <Text style={styles.kicker}>CHECKING INTO</Text>
      <Text style={styles.cardTitle}>{selected.name}</Text>
    </View>
    <View style={styles.cameraFrame}>
      <CameraView style={StyleSheet.absoluteFill} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={locked ? undefined : ({ data }) => scanned(data)} />
      <View style={styles.scanBox} />
    </View>
    {result ? <View style={styles.result}><Text style={styles.success}>MEMBER CHECKED IN</Text><Text style={styles.resultTitle}>{result.member.name}</Text><Text style={styles.body}>{result.message}</Text></View> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {locked ? <Pressable style={styles.secondaryButton} onPress={() => { setLocked(false); setResult(null); setError(''); }}><Text style={styles.secondaryButtonText}>SCAN NEXT MEMBER</Text></Pressable> : null}
  </Shell>;
}

function MembersScreen({ token, onBack }: { token: string; onBack: () => void }) {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [error, setError] = useState('');

  async function run() {
    setError('');
    try { setRows((await searchMembers(token, query)).members || []); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to search.'); }
  }

  return <Shell title="MEMBER LOOKUP" onBack={onBack}>
    <View style={styles.searchRow}><TextInput style={[styles.input,{flex:1,marginTop:0}]} placeholder="Name, email, or title" placeholderTextColor="#7890a1" value={query} onChangeText={setQuery} /><Pressable style={styles.searchButton} onPress={run}><Text style={styles.primaryButtonText}>SEARCH</Text></Pressable></View>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <FlatList data={rows} keyExtractor={(item) => item.membershipId} renderItem={({item}) => <View style={styles.listCard}><Text style={styles.cardTitle}>{item.name}</Text><Text style={styles.body}>{item.email}</Text><Text style={styles.muted}>{item.role} · {item.status}{item.jobTitle ? ` · ${item.jobTitle}` : ''}</Text></View>} />
  </Shell>;
}

function WalletScreen({ token, onBack }: { token: string; onBack: () => void }) {
  const [data, setData] = useState<WalletData | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { getWallet(token).then(setData).catch((e) => setError(e.message)); }, [token]);
  return <Shell title="CE + WALLET" onBack={onBack}>
    {!data && !error ? <ActivityIndicator color="#5eb8ff" /> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {data ? <>
      <View style={styles.metrics}><Metric label="CE EARNED" value={Number(data.summary.earnedTotal || 0).toFixed(1)} /><Metric label="STILL NEEDED" value={Number(data.summary.outstandingTotal || 0).toFixed(1)} /></View>
      <Text style={styles.sectionLabel}>CREDENTIALS</Text>
      {(data.credentials || []).map((item) => <View key={item.id} style={styles.listCard}><Text style={styles.cardTitle}>{item.name}</Text><Text style={styles.muted}>{String(item.status).toUpperCase()}{item.expiresAt ? ` · Expires ${new Date(item.expiresAt).toLocaleDateString()}` : ''}</Text></View>)}
    </> : null}
  </Shell>;
}

function NotificationsScreen({ token, onBack }: { token: string; onBack: () => void }) {
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { getNotifications(token).then((d) => setRows(d.notifications || [])).catch((e) => setError(e.message)); }, [token]);
  return <Shell title="NOTIFICATIONS" onBack={onBack}>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {rows.map((item) => <View key={item.id} style={styles.listCard}><Text style={styles.cardTitle}>{item.message}</Text><Text style={styles.muted}>{new Date(item.createdAt).toLocaleString()}</Text></View>)}
  </Shell>;
}

function Shell({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return <SafeAreaView style={styles.safe}><View style={styles.shell}><Pressable onPress={onBack}><Text style={styles.link}>← EVENT MODE</Text></Pressable><Text style={styles.screenTitle}>{title}</Text><View style={{flex:1}}>{children}</View></View></SafeAreaView>;
}
function Action({ title, copy, onPress, primary=false }: { title: string; copy: string; onPress: () => void; primary?: boolean }) {
  return <Pressable style={[styles.action, primary && styles.actionPrimary]} onPress={onPress}><View><Text style={styles.actionTitle}>{title}</Text><Text style={styles.body}>{copy}</Text></View><Text style={styles.arrow}>→</Text></Pressable>;
}
function Metric({label,value}:{label:string;value:string}) {
  return <View style={styles.metric}><Text style={styles.kicker}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}
function Loading() { return <SafeAreaView style={styles.safe}><View style={styles.loading}><ActivityIndicator size="large" color="#5eb8ff" /><Text style={styles.muted}>ICA UNIFIED</Text></View></SafeAreaView>; }

const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:'#f8fbfd'},page:{padding:22,paddingBottom:50},loginPage:{flex:1,padding:28,justifyContent:'center',backgroundColor:'#f8fbfd'},shell:{flex:1,padding:22,backgroundColor:'#f8fbfd'},loading:{flex:1,alignItems:'center',justifyContent:'center',gap:16},
  kicker:{color:'#147fd1',fontSize:10,fontWeight:'800',letterSpacing:2},hero:{color:'#10202f',fontSize:58,fontWeight:'900',letterSpacing:-4,marginTop:8},loginTitle:{color:'#10202f',fontSize:72,fontWeight:'900',lineHeight:64,letterSpacing:-5,marginTop:12},sub:{color:'#6c8191',fontSize:16,marginTop:8,marginBottom:24},
  identity:{borderTopWidth:1,borderBottomWidth:1,borderColor:'#d9e5ed',paddingVertical:18,marginBottom:18,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},identityName:{color:'#10202f',fontSize:20,fontWeight:'800'},muted:{color:'#6c8191',fontSize:12,marginTop:5},link:{color:'#147fd1',fontSize:11,fontWeight:'800',letterSpacing:1},
  action:{minHeight:112,borderWidth:1,borderColor:'#d9e5ed',backgroundColor:'#ffffff',padding:19,marginBottom:10,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:18,borderRadius:14},actionPrimary:{borderColor:'#96c9eb',backgroundColor:'#eef8ff'},actionTitle:{color:'#10202f',fontSize:21,fontWeight:'900',marginBottom:7},body:{color:'#6c8191',fontSize:13,lineHeight:19},arrow:{color:'#147fd1',fontSize:28},
  cloudNote:{marginTop:18,padding:18,borderWidth:1,borderColor:'#d9e5ed',backgroundColor:'#ffffff',borderRadius:14},cloudTitle:{color:'#10202f',fontSize:11,fontWeight:'900',letterSpacing:1.3},
  input:{height:52,borderWidth:1,borderColor:'#d7e4ec',backgroundColor:'#ffffff',color:'#173247',paddingHorizontal:14,marginTop:10,fontSize:15,borderRadius:10},primaryButton:{height:52,backgroundColor:'#147fd1',alignItems:'center',justifyContent:'center',marginTop:14,paddingHorizontal:18,borderRadius:10},primaryButtonText:{color:'#fff',fontSize:11,fontWeight:'900',letterSpacing:1},secondaryButton:{height:48,borderWidth:1,borderColor:'#bfd8e8',backgroundColor:'#ffffff',alignItems:'center',justifyContent:'center',marginTop:14,borderRadius:10},secondaryButtonText:{color:'#147fd1',fontSize:11,fontWeight:'900',letterSpacing:1},error:{color:'#c23f4a',marginTop:12,fontSize:13},
  screenTitle:{color:'#10202f',fontSize:42,fontWeight:'900',letterSpacing:-2.5,marginTop:16,marginBottom:20},cameraFrame:{height:420,borderWidth:1,borderColor:'#8fc4e4',overflow:'hidden',position:'relative',borderRadius:16,backgroundColor:'#07101a'},scanBox:{position:'absolute',left:'18%',right:'18%',top:'25%',bottom:'25%',borderWidth:2,borderColor:'#62c5ff'},result:{padding:18,borderWidth:1,borderColor:'#cfe3ef',marginTop:14,backgroundColor:'#ffffff',borderRadius:12},success:{color:'#14845f',fontSize:10,fontWeight:'900',letterSpacing:1.5},resultTitle:{color:'#10202f',fontSize:21,fontWeight:'900',marginVertical:8},
  qrCard:{alignItems:'center',padding:22,borderWidth:1,borderColor:'#d9e5ed',backgroundColor:'#ffffff',borderRadius:16},qrWhite:{padding:16,backgroundColor:'#fff',borderRadius:12},qrName:{color:'#10202f',fontSize:24,fontWeight:'900',marginTop:18},qrHelp:{color:'#6c8191',fontSize:12,lineHeight:18,textAlign:'center',marginTop:18,maxWidth:310},
  eventCard:{minHeight:92,borderWidth:1,borderColor:'#d9e5ed',backgroundColor:'#ffffff',padding:17,marginTop:10,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:14,borderRadius:14},selectedEvent:{padding:14,borderWidth:1,borderColor:'#c9e0ee',backgroundColor:'#eef8ff',marginBottom:12,borderRadius:12},
  searchRow:{flexDirection:'row',gap:8,marginBottom:12},searchButton:{backgroundColor:'#147fd1',paddingHorizontal:16,alignItems:'center',justifyContent:'center',borderRadius:10},listCard:{paddingVertical:16,borderBottomWidth:1,borderBottomColor:'#dfe9ef'},cardTitle:{color:'#10202f',fontSize:17,fontWeight:'800'},metrics:{flexDirection:'row',gap:10,marginBottom:26},metric:{flex:1,borderWidth:1,borderColor:'#d9e5ed',padding:16,backgroundColor:'#ffffff',borderRadius:12},metricValue:{color:'#10202f',fontSize:36,fontWeight:'900',marginTop:8},sectionLabel:{color:'#147fd1',fontSize:10,fontWeight:'900',letterSpacing:1.5,marginTop:8}
});