import {expect,test} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import recordDefinition from '../src/core/record-engineering.json';
import {engineeringDefinition} from '../src/core/scenario';
import legacy from './fixtures/legacy-move.json';
import type {State} from '../src/core/state';

test('FB02-S01 opens a distinct fixed-station record run while the original Move run remains unchanged',async()=>{
  const store=new Persistence('fb02-record-start'),game=new Game(store);
  try {
    const move=await game.create_run(engineeringDefinition,'research','move-create');
    const record=await game.create_run(recordDefinition,'research','record-create');
    expect(record.run_id).not.toBe(move.run_id);
    expect(record.position).toEqual({x:50,y:150,observed:0,received:0,evidence:'initial-position'});
    expect(record.report.target).toBe('A');
    expect(record.report.source_event_time).toEqual({kind:'unknown'});
    expect(record.delivery.report_id).toBe('REPORT-A');
    expect(record.paused).toBe(true);
    expect(await game.get_view(move.run_id)).toEqual(move);
  } finally {await store.delete();}
});

test('FB02-S02 does not offer a package whose registry hash is corrupted even if its outer checksum is valid',async()=>{
  const source=new Persistence('fb02-corrupt-hash-source'),store=new Persistence('fb02-corrupt-hash-entry');
  try {
    const view=await new Game(source).create_run(recordDefinition,'research','source');
    const corrupt=structuredClone((await source.snapshot(view.run_id,1))!);
    corrupt.hashes.profile='0'.repeat(64);
    await store.commit_batch(corrupt,await store.claim_writer(),null,'corrupt-package','fixture');
    await expect(store.list_runs()).rejects.toThrow('INVALID_SAVE');
    expect((await store.snapshot(view.run_id,1))?.hashes.profile).toBe('0'.repeat(64));
  } finally {await source.delete();await store.delete();}
});

test('FB02-S01 safely refuses an old Move plan in Record without faulting subsequent saves',async()=>{
  const store=new Persistence('fb02-safe-preview'),game=new Game(store);
  try {
    const record=await game.create_run(recordDefinition,'research','record');
    const move=await game.create_run(engineeringDefinition,'research','move');
    const oldPlan=await game.preview_plan(move.run_id,move.revision,1);
    await expect(game.issue_order({run_id:record.run_id,operation_id:'old-plan',expected_revision:record.revision,intent:{kind:'issue',command_id:'old-command',plan:oldPlan}})).rejects.toThrow('STALE_PLAN');
    const saved=await game.save({run_id:record.run_id,operation_id:'save-after-preview',expected_revision:record.revision,intent:{kind:'save'}});
    expect(saved.receipt.result).toBe('committed');
    expect(saved.view.report.target).toBe('A');
  } finally {await store.delete();}
});

test('FB02-S02 recognizes the real FB01 mode-only creation receipt without rewriting it or the original snapshot',async()=>{
  const store=new Persistence('fb02-real-legacy-receipt'),game=new Game(store);
  try {
    const initial=legacy.snapshots.find(x=>x.state.revision===1)!.state as unknown as State;
    const creation=legacy.operations.find(x=>x.key.startsWith('create:'))!;
    await store.commit_batch(structuredClone(initial),await store.claim_writer(),null,creation.operation_id,creation.fingerprint);
    const view=await game.create_run(engineeringDefinition,'research',creation.operation_id);
    expect(view.run_id).toBe(initial.run_id);
    expect((await store.creation(creation.operation_id))?.fingerprint).toBe('create:research');
    expect(await store.snapshot(initial.run_id,1)).toEqual(initial);
    await expect(game.create_run(recordDefinition,'research',creation.operation_id)).rejects.toThrow('OPERATION_CONFLICT');
  } finally {await store.delete();}
});

test('FB02-S02 refuses an unknown stored schema rather than labelling it as Move, and retains the package',async()=>{
  const original=new Persistence('fb02-schema-source'),sourceGame=new Game(original),store=new Persistence('fb02-unknown-schema');
  try {
    const view=await sourceGame.create_run(engineeringDefinition,'research','source');
    const unknown=structuredClone((await original.snapshot(view.run_id,1))!);
    unknown.schema=99 as 4;
    await store.commit_batch(unknown,await store.claim_writer(),null,'unknown-package','create:research');
    await expect(store.list_runs()).rejects.toThrow('INVALID_SAVE');
    await expect(new Game(store).get_view(view.run_id)).rejects.toThrow('INVALID_SAVE');
    expect((await store.snapshot(view.run_id,1))?.schema).toBe(99);
  } finally {await original.delete();await store.delete();}
});

test('FB02-S01 lists at most the latest committed entry per scenario while retaining older runs',async()=>{
  const store=new Persistence('fb02-latest-scenes'),game=new Game(store);
  try {
    const older=await game.create_run(engineeringDefinition,'research','older-move');
    const record=await game.create_run(recordDefinition,'research','record');
    const latest=await game.create_run(engineeringDefinition,'research','latest-move');
    const summaries=await store.list_runs();
    expect(summaries.map(x=>x.run_id).sort()).toEqual([record.run_id,latest.run_id].sort());
    expect(await game.get_view(older.run_id)).toEqual(older);
  } finally {await store.delete();}
});

test('FB02-S01 rejects reuse of one creation operation for a different definition and keeps the first receipt',async()=>{
  const store=new Persistence('fb02-create-identity'),game=new Game(store);
  try {
    const move=await game.create_run(engineeringDefinition,'research','same-create');
    await expect(game.create_run(recordDefinition,'research','same-create')).rejects.toThrow('OPERATION_CONFLICT');
    expect(await game.create_run(engineeringDefinition,'research','same-create')).toEqual(move);
    expect(await store.list_runs()).toHaveLength(1);
  } finally {await store.delete();}
});

test('FB02-S02 saves Record as schema5 and restores it paused without changing the schema4 Move package',async()=>{
  const store=new Persistence('fb02-record-schema'),game=new Game(store);
  try {
    const move=await game.create_run(engineeringDefinition,'research','old-move');
    const oldPackage=await store.snapshot(move.run_id,1);
    const record=await game.create_run(recordDefinition,'command','new-record');
    expect((await store.snapshot(record.run_id,1))?.schema).toBe(5);
    expect(await game.get_view(record.run_id)).toEqual(record);
    const restored=await new Game(store).restore(record.run_id,'restore-record');
    expect(restored.view.paused).toBe(true);
    expect(restored.view.report.target).toBe('A');
    expect(await store.snapshot(move.run_id,1)).toEqual(oldPackage);
    expect(oldPackage?.schema).toBe(4);
    expect(oldPackage?.definition_hash).toBe(engineeringDefinition.definition_hash);
  } finally {await store.delete();}
});
