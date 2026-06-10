// End-to-end feature test — exercises the REAL service/repo code paths against a
// temp DB and the REAL filesystem (no network). Run: node scripts/feature-test.cjs
const path = require('path');
const fs = require('fs');
const os = require('os');

const D = 'dist/electron/src';
const { initDatabase, saveDatabase } = require(path.resolve(D, 'database/connection.js'));
const { runMigrations } = require(path.resolve(D, 'database/migrations/index.js'));
const { RenameRuleRepository } = require(path.resolve(D, 'database/repositories/RenameRuleRepository.js'));
const { RecordingRepository } = require(path.resolve(D, 'database/repositories/RecordingRepository.js'));
const { DownloadRepository } = require(path.resolve(D, 'database/repositories/DownloadRepository.js'));
const { RecordingService } = require(path.resolve(D, 'services/RecordingService.js'));
const { DownloadService } = require(path.resolve(D, 'services/DownloadService.js'));

let pass = 0, fail = 0;
const eq = (n, got, want) => { const ok = got === want; ok ? pass++ : fail++; console.log(`  ${ok ? '✓' : '✗ FAIL'} ${n}` + (ok ? '' : `  (got: ${JSON.stringify(got)}, want: ${JSON.stringify(want)})`)); };
const ok = (n, cond, extra='') => { cond ? pass++ : fail++; console.log(`  ${cond ? '✓' : '✗ FAIL'} ${n}${cond ? '' : '  ' + extra}`); };

function recFile(db, id, recId, type) {
  db.run(`INSERT INTO recording_files (id, recording_id, file_type, file_extension, file_size, download_url, play_url)
          VALUES (?, ?, ?, 'mp4', 1000, 'http://x/${id}', null)`, [id, recId, type]);
}

(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zrd-feat-'));
  const dbPath = path.join(tmpDir, 'data.db');
  const dlDir = path.join(tmpDir, 'downloads');
  const db = await initDatabase(dbPath);
  runMigrations(db);
  db.run("INSERT INTO accounts (id,name,email,client_id,client_secret,account_id) VALUES ('acc1','VITANGON','v@x','c','s','a')");

  const recRepo = new RecordingRepository(db);
  const ruleRepo = new RenameRuleRepository(db);
  const dlRepo = new DownloadRepository(db);

  // ============ #4 — Folder template Account/Topic uses CUSTOM NAME ============
  console.log('\n[#4] Folder template "{account}/{topic}" + custom name → folder path');
  db.run(`INSERT INTO recordings (id,account_id,meeting_id,uuid,meeting_topic,host_email,start_time,duration,total_size)
          VALUES ('rA','acc1','82077378037','uA','Topic Goc Zoom','h','2026-06-08T05:08:00',60,1000)`);
  recFile(db, 'fA', 'rA', 'shared_screen');
  recRepo.updateCustomName('rA', 'Thau Hieu Con Tre - Ca Sang');
  saveDatabase();
  const taskAcctTopic = dlRepo.createTask('fA', { destinationDir: dlDir }, '{account}/{topic}');
  ok('path uses Account/CustomName (not original topic)',
     taskAcctTopic.destinationPath.includes(path.join('VITANGON', 'Thau Hieu Con Tre - Ca Sang').replace(/\\/g, '/')) ||
     taskAcctTopic.destinationPath.includes('VITANGON/Thau Hieu Con Tre - Ca Sang'),
     taskAcctTopic.destinationPath);
  ok('does NOT use original Zoom topic', !taskAcctTopic.destinationPath.includes('Topic Goc Zoom'));
  // Default template still produces a different (date-time) structure
  const taskDefault = dlRepo.createTask('fA', { destinationDir: dlDir }, '{account}/{year}-{month}/{date} {time} - {topic}');
  ok('default template includes year-month folder', /2026-06/.test(taskDefault.destinationPath), taskDefault.destinationPath);

  // ============ Re-sync preserves custom name ============
  console.log('\n[Re-sync] custom name survives a re-sync of the same recording');
  const before = recRepo.findById('rA').customName;
  recRepo.createFromZoomData('acc1', { id: '82077378037', uuid: 'uA', topic: 'Topic Goc Zoom', host_email: 'h', start_time: '2026-06-08T05:08:00', duration: 60, recording_files: [{ recording_start: '2026-06-08T05:08:00', recording_type: 'shared_screen', file_size: 1000, download_url: 'http://x' }] });
  eq('custom name unchanged after re-sync', recRepo.findById('rA').customName, before);

  // ============ Rules: priority + date-range disambiguation ============
  console.log('\n[Rules] same meeting + time, different date ranges → correct rule wins');
  db.run(`INSERT INTO recordings (id,account_id,meeting_id,uuid,meeting_topic,host_email,start_time,duration,total_size)
          VALUES ('rJun','acc1','83006328928','uJun','x','h','2026-06-03T05:07:00',60,1)`);
  db.run(`INSERT INTO recordings (id,account_id,meeting_id,uuid,meeting_topic,host_email,start_time,duration,total_size)
          VALUES ('rMay','acc1','83006328928','uMay','x','h','2026-05-20T05:07:00',60,1)`);
  ruleRepo.create({ meetingId: '83006328928', startFrom: '04:00', startTo: '06:00', dateFrom: '2026-06-01', dateTo: '2026-06-30', targetName: 'Khoa Thang 6', color: '#10b981', priority: 0, enabled: true });
  ruleRepo.create({ meetingId: '83006328928', startFrom: '04:00', startTo: '06:00', dateFrom: '2026-05-01', dateTo: '2026-05-31', targetName: 'Khoa Thang 5', color: '#ec4899', priority: 1, enabled: true });
  const svc = new RecordingService(recRepo, {}, ruleRepo);
  svc.applyRenameRules();
  eq('June recording → "Khoa Thang 6"', recRepo.findById('rJun').customName, 'Khoa Thang 6');
  eq('June recording → green color', recRepo.findById('rJun').customColor, '#10b981');
  eq('May recording → "Khoa Thang 5"', recRepo.findById('rMay').customName, 'Khoa Thang 5');
  eq('May recording → pink color', recRepo.findById('rMay').customColor, '#ec4899');

  // ============ #2 — Download status transitions (resume/retry data) ============
  console.log('\n[#2] Download task status transitions (resume/retry)');
  db.run(`INSERT INTO recordings (id,account_id,meeting_id,uuid,meeting_topic,host_email,start_time,duration,total_size)
          VALUES ('rD','acc1','111','uD','d','h','2026-06-08T05:08:00',60,1)`);
  recFile(db, 'fD', 'rD', 'shared_screen');
  const tD = dlRepo.createTask('fD', { destinationDir: dlDir }, '{topic}');
  dlRepo.updateStatus(tD.id, 'failed');
  eq('task marked failed', dlRepo.findById(tD.id).status, 'failed');
  dlRepo.updateStatus(tD.id, 'queued'); dlRepo.resetProgress(tD.id);
  eq('retry → status queued', dlRepo.findById(tD.id).status, 'queued');
  eq('retry → progress reset to 0', dlRepo.findById(tD.id).progress, 0);

  // ============ #3 — verifyOnDisk: full / partial / missing (REAL files) ============
  console.log('\n[#3] verifyOnDisk against REAL files on disk');
  // recFull: 1 file present | recPart: 2 files, 1 present | recMiss: 1 file, none present
  function setup(recId, uuid, files) {
    db.run(`INSERT INTO recordings (id,account_id,meeting_id,uuid,meeting_topic,host_email,start_time,duration,total_size)
            VALUES (?,?,?,?,?,'h','2026-06-08T05:08:00',60,1)`, [recId, 'acc1', '222', uuid, recId]);
    const types = ['shared_screen', 'audio_only', 'chat_file'];
    return files.map((createOnDisk, i) => {
      const fid = `${recId}_f${i}`;
      recFile(db, fid, recId, types[i]);
      const t = dlRepo.createTask(fid, { destinationDir: dlDir }, '{topic}');
      dlRepo.updateStatus(t.id, 'completed');
      if (createOnDisk) { fs.mkdirSync(path.dirname(t.destinationPath), { recursive: true }); fs.writeFileSync(t.destinationPath, Buffer.alloc(1000)); }
      return t;
    });
  }
  setup('recFull', 'uFull', [true]);
  setup('recPart', 'uPart', [true, false]);
  setup('recMiss', 'uMiss', [false]);
  const dlSvc = new DownloadService(dlRepo, recRepo, {});
  const v = dlSvc.verifyOnDisk();
  ok('recFull → present === total (fully on disk)', v['recFull'] && v['recFull'].present === v['recFull'].total && v['recFull'].present === 1, JSON.stringify(v['recFull']));
  ok('recPart → present 1 / total 2 (partial)', v['recPart'] && v['recPart'].present === 1 && v['recPart'].total === 2, JSON.stringify(v['recPart']));
  ok('recMiss → present 0 (missing on disk)', v['recMiss'] && v['recMiss'].present === 0 && v['recMiss'].total === 1, JSON.stringify(v['recMiss']));

  // ============ Download robustness fixes (deep audit) ============
  console.log('\n[Download] dedup / partial cleanup / verify size-check / restart recovery');
  const robSvc = new DownloadService(dlRepo, recRepo, {});

  // #5 Dedup — enqueue same file twice → only one task row
  db.run(`INSERT INTO recordings (id,account_id,meeting_id,uuid,meeting_topic,host_email,start_time,duration,total_size)
          VALUES ('rDup','acc1','333','uDup','dup','h','2026-06-08T05:08:00',60,1)`);
  recFile(db, 'fDup', 'rDup', 'shared_screen');
  await robSvc.enqueue(['fDup'], { destinationDir: dlDir }, '{topic}');
  await robSvc.enqueue(['fDup'], { destinationDir: dlDir }, '{topic}');
  eq('enqueue same file twice → NO duplicate row', dlRepo.findAll().filter(t => t.recordingFileId === 'fDup').length, 1);

  // #4 Verify size-check — a completed task whose file is partial must NOT count as present
  db.run(`INSERT INTO recordings (id,account_id,meeting_id,uuid,meeting_topic,host_email,start_time,duration,total_size)
          VALUES ('rSz','acc1','444','uSz','sz','h','2026-06-08T05:08:00',60,1)`);
  recFile(db, 'fSz', 'rSz', 'shared_screen');
  const tSz = dlRepo.createTask('fSz', { destinationDir: dlDir }, '{topic}');
  dlRepo.updateStatus(tSz.id, 'completed');
  fs.mkdirSync(path.dirname(tSz.destinationPath), { recursive: true });
  fs.writeFileSync(tSz.destinationPath, 'x'); // 1 byte but expected 1000
  ok('partial-size file NOT counted as downloaded', robSvc.verifyOnDisk()['rSz'].present === 0, JSON.stringify(robSvc.verifyOnDisk()['rSz']));
  fs.writeFileSync(tSz.destinationPath, Buffer.alloc(1000)); // full size
  ok('full-size file IS counted as downloaded', robSvc.verifyOnDisk()['rSz'].present === 1, JSON.stringify(robSvc.verifyOnDisk()['rSz']));

  // #3 Cancel cleans up the partial file on disk
  ok('partial file exists before cancel', fs.existsSync(tSz.destinationPath));
  await robSvc.cancel(tSz.id);
  ok('cancel removes the leftover file', !fs.existsSync(tSz.destinationPath));

  // #1 Restart recovery — a task stuck as "downloading" gets recovered
  db.run(`INSERT INTO recordings (id,account_id,meeting_id,uuid,meeting_topic,host_email,start_time,duration,total_size)
          VALUES ('rStuck','acc1','555','uStuck','stuck','h','2026-06-08T05:08:00',60,1)`);
  recFile(db, 'fStuck', 'rStuck', 'shared_screen');
  const tStuck = dlRepo.createTask('fStuck', { destinationDir: dlDir }, '{topic}');
  dlRepo.updateStatus(tStuck.id, 'downloading'); // simulate app closed mid-download
  ok('recoverInterrupted picks up the stuck download', robSvc.recoverInterrupted() >= 1);

  // ============ Multi-delete (local) ============
  console.log('\n[Multi-delete] deleteMany removes recordings + their files/tasks');
  const delCount = recRepo.deleteMany(['recFull', 'recPart', 'recMiss']);
  eq('deleteMany count', delCount, 3);
  ok('recordings gone', recRepo.findById('recFull') === null && recRepo.findById('recPart') === null);

  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR:', e); process.exit(2); });
