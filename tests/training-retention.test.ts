import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { saveTrainingArchive, purgeExpiredTrainingArchives, serializeTrainingSnapshot, type TrainingSnapshot } from '../src/lib/training-retention';
const NOW = Date.parse('2026-10-12T12:00:00Z');
const snapshot: TrainingSnapshot = {
  courses: [{courseId:'course-1',status:'COMPLETE',progress:100,score:90,completedAt:'2026-10-01T12:00:00Z'}],
  credentials: [{courseId:'course-1',status:'active',issuedAt:'2026-10-01T12:00:00Z',expiresAt:null}],
  credits: [{sourceType:'COURSE',sourceId:'course-1',credits:2,awardedAt:'2026-10-01T12:00:00Z'}],
};
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec("CREATE TABLE User(id TEXT PRIMARY KEY,email TEXT); INSERT INTO User VALUES ('active-user','active@example.test');");
  const db = { async run(sql: string, ...values: (string|number|null)[]) { return Number(sqlite.prepare(sql).run(...values).changes); } };
  return {sqlite,db};
}
test('archive only includes allowed training facts, not extra profile fields or free text',()=>{
  const contaminated = {...snapshot, name:'Private person', email:'private@example.test', userId:'original-user',requestId:'original-request',
    courses:snapshot.courses.map(row=>({...row,answersJson:'private quiz text',name:'Private person'})),
    credentials:snapshot.credentials.map(row=>({...row,code:'private-certificate-code'}))};
  const encoded=serializeTrainingSnapshot(contaminated);
  for(const privateText of ['Private person','private@example.test','original-user','original-request','private quiz text','private-certificate-code']) assert.ok(!encoded.includes(privateText));
  assert.equal(JSON.parse(encoded).courses[0].score,90);
});
test('archives expire at the selected boundary and cleanup leaves active users and unexpired records alone',async()=>{
  const f=fixture();
  const first=await saveTrainingArchive(f.db,{organizationId:'org-1',records:snapshot,retentionDays:2},NOW);
  const second=await saveTrainingArchive(f.db,{organizationId:'org-2',records:snapshot,retentionDays:3},NOW);
  assert.equal((await purgeExpiredTrainingArchives(f.db,first.expiresAt-1)).removed,0);
  assert.equal((await purgeExpiredTrainingArchives(f.db,first.expiresAt)).removed,1);
  assert.equal(f.sqlite.prepare('SELECT id FROM AccountTrainingArchive').get()!.id,second.id);
  assert.equal(f.sqlite.prepare('SELECT email FROM User').get()!.email,'active@example.test');
  assert.equal((await purgeExpiredTrainingArchives(f.db,first.expiresAt)).removed,0);
  f.sqlite.close();
});
test('missing, zero and indefinite retention cannot silently create an archive',async()=>{
  const f=fixture();
  for(const retentionDays of [0,-1,Infinity,NaN,3651,1.5]) await assert.rejects(saveTrainingArchive(f.db,{organizationId:'org-1',records:snapshot,retentionDays},NOW));
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='AccountTrainingArchive'").get()!.n,0);
  f.sqlite.close();
});
test('expiry processing is bounded and invalid free-form identifiers or dates are rejected',async()=>{
  const f=fixture();
  await saveTrainingArchive(f.db,{organizationId:'org-1',records:snapshot,retentionDays:1},NOW);
  await saveTrainingArchive(f.db,{organizationId:'org-2',records:snapshot,retentionDays:1},NOW);
  assert.equal((await purgeExpiredTrainingArchives(f.db,NOW+86400000,1)).removed,1);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM AccountTrainingArchive').get()!.n,1);
  assert.throws(()=>serializeTrainingSnapshot({...snapshot,courses:[{...snapshot.courses[0],courseId:'private@example.test'}]}));
  assert.throws(()=>serializeTrainingSnapshot({...snapshot,courses:[{...snapshot.courses[0],completedAt:'private free text'}]}));
  f.sqlite.close();
});
