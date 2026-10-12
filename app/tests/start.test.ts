import { expect, test } from 'vitest';
import { Game } from '../src/core/game';
import { Persistence } from '../src/core/persistence';
import { engineeringDefinition } from '../src/core/scenario';

test('FB01-S01 creates a committed run with one original Report and a distinct Delivery', async () => {
  const store = new Persistence('start-test');
  const game = new Game(store);
  const view = await game.create_run(engineeringDefinition, 'research', 'create-1');
  expect(view.position).toEqual({ x: 50, y: 150, observed: 0, received: 0, evidence: 'initial-position' });
  expect(view.report.source_event_time).toEqual({ kind: 'unknown' });
  expect(view.report.id).toBe('REPORT-T');
  expect(view.delivery.report_id).toBe('REPORT-T');
  expect(view.delivery.id).toBe('DELIVERY-T');
  expect((await store.read_committed(view.run_id))?.revision).toBe(view.revision);
  await store.delete();
});
test('invalid versions, missing registry/hash and unregistered geometry do not create half runs',async()=>{
  const store=new Persistence('bad-definition'),game=new Game(store);
  for(const bad of [ {...engineeringDefinition,contract:'0.5'}, {...engineeringDefinition,hashes:{}}, {...engineeringDefinition,profile:{...engineeringDefinition.profile,registry:[]}}, {...engineeringDefinition,catalogs:{...engineeringDefinition.catalogs,geometry:{H:[-1,150]}}} ]){
    await expect(game.create_run(bad,'research',crypto.randomUUID())).rejects.toThrow('INVALID_DEFINITION');
  }
  expect(await store.list_runs()).toEqual([]);
  await store.delete();
});
test('creation retry returns the original committed run instead of creating a second one',async()=>{
  const store=new Persistence('create-retry'),game=new Game(store);
  const first=await game.create_run(engineeringDefinition,'research','same-create');
  const again=await game.create_run(engineeringDefinition,'research','same-create');
  expect(again).toEqual(first);
  expect(await store.list_runs()).toHaveLength(1);
  await expect(game.create_run(engineeringDefinition,'command','same-create')).rejects.toThrow('OPERATION_CONFLICT');
  await store.delete();
});
