// Backend smoke test — runs the full migration chain + rule engine on a temp DB.
// No Electron / GUI needed. Run: node scripts/smoke-test.cjs
const path = require('path');
const fs = require('fs');
const os = require('os');

const D = 'dist/electron/src';
const { initDatabase, getDatabase, saveDatabase } = require(path.resolve(D, 'database/connection.js'));
const { runMigrations } = require(path.resolve(D, 'database/migrations/index.js'));
const { RenameRuleRepository } = require(path.resolve(D, 'database/repositories/RenameRuleRepository.js'));
const { RecordingRepository } = require(path.resolve(D, 'database/repositories/RecordingRepository.js'));
const { RecordingService } = require(path.resolve(D, 'services/RecordingService.js'));

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗ FAIL:', name); }
}

(async () => {
  const tmp = path.join(os.tmpdir(), `zrd-smoke-${process.pid}.db`);
  try { fs.unlinkSync(tmp); } catch {}

  const db = await initDatabase(tmp);
  runMigrations(db);
  console.log('\n[1] Migrations 001→006 applied');

  // Verify new columns/tables exist
  const recCols = db.exec('PRAGMA table_info(recordings)')[0].values.map(r => r[1]);
  check('recordings.custom_name column', recCols.includes('custom_name'));
  check('recordings.custom_color column', recCols.includes('custom_color'));
  const ruleCols = db.exec('PRAGMA table_info(rename_rules)')[0].values.map(r => r[1]);
  check('rename_rules table + color column', ruleCols.includes('color'));
  check('rename_rules date_from/date_to columns', ruleCols.includes('date_from') && ruleCols.includes('date_to'));

  // Seed an account + two recordings (same meeting id, different dates)
  db.run("INSERT INTO accounts (id, name, email, client_id, client_secret, account_id) VALUES ('acc1','VITANGON','v@x.com','c','s','a')");
  db.run(`INSERT INTO recordings (id, account_id, meeting_id, uuid, meeting_topic, host_email, start_time, duration, total_size)
          VALUES ('r1','acc1','82077378037','u1','Phien goc 1','h','2026-06-08T05:08:00',60,1000)`);
  db.run(`INSERT INTO recordings (id, account_id, meeting_id, uuid, meeting_topic, host_email, start_time, duration, total_size)
          VALUES ('r2','acc1','82077378037','u2','Phien goc 2','h','2026-05-08T05:08:00',60,1000)`);
  saveDatabase();

  const ruleRepo = new RenameRuleRepository(db);
  const recRepo = new RecordingRepository(db);

  console.log('\n[2] RenameRuleRepository CRUD');
  const rule = ruleRepo.create({
    meetingId: '820 7737 8037', // spaces -> normalized
    startFrom: '04:00', startTo: '06:00',
    dateFrom: '2026-06-01', dateTo: '2026-06-09',
    targetName: 'Thau Hieu Con Tre', color: '#10b981', priority: 0, enabled: true,
  });
  check('create normalizes meetingId (no spaces)', rule.meetingId === '82077378037');
  check('create stores color', rule.color === '#10b981');
  check('create stores date range', rule.dateFrom === '2026-06-01' && rule.dateTo === '2026-06-09');
  check('findAll returns 1 rule', ruleRepo.findAll().length === 1);
  const upd = ruleRepo.update(rule.id, { targetName: 'Doi Ten' });
  check('update changes targetName', upd.targetName === 'Doi Ten' && upd.color === '#10b981');
  ruleRepo.update(rule.id, { targetName: 'Thau Hieu Con Tre' }); // restore

  console.log('\n[3] Rule engine (RecordingService.applyRenameRules)');
  const svc = new RecordingService(recRepo, {}, ruleRepo);
  const changed = svc.applyRenameRules();
  check('applyRenameRules changed exactly 1 recording', changed === 1);
  const r1 = recRepo.findById('r1');
  const r2 = recRepo.findById('r2');
  check('r1 matched -> customName set', r1.customName === 'Thau Hieu Con Tre');
  check('r1 matched -> customColor set', r1.customColor === '#10b981');
  check('r2 (date out of range) -> NOT renamed', !r2.customName);

  console.log('\n[4] Custom name + multi-delete');
  recRepo.updateCustomName('r2', 'Ten tu dat');
  check('updateCustomName works', recRepo.findById('r2').customName === 'Ten tu dat');
  recRepo.updateCustomName('r2', null);
  check('clear custom name (null) reverts', !recRepo.findById('r2').customName);
  const del = recRepo.deleteMany(['r1', 'r2']);
  check('deleteMany returns count', del === 2);
  check('recordings gone after deleteMany', recRepo.findById('r1') === null && recRepo.findById('r2') === null);

  ruleRepo.delete(rule.id);
  check('rule delete works', ruleRepo.findAll().length === 0);

  try { fs.unlinkSync(tmp); } catch {}
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR:', e); process.exit(2); });
