import {expect, test} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {state_hash,validate_state} from '../src/core/snapshot';

test('KA-E09 rejects a coercible private initial-condition value even when the corrupted body has a matching hash',async()=>{
  const store=new Persistence('ka-owned-initial-condition-type-'+crypto.randomUUID()),game=new Game(store);
  try{
    const view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}},'research','create');
    const state=await store.read_committed(view.run_id);if(state?.schema!==14)throw Error('Wrong collection branch');
    Reflect.set(state.initial_conditions,'surface',['default']);state.integrity=await state_hash(state);
    await expect(validate_state(state)).rejects.toThrow('INVALID_SAVE');
    expect(await game.get_view(view.run_id)).toEqual(view);
  }finally{await store.delete();}
});

test('KA-E01 creates the independent collection package with both teams lawfully known at B', async () => {
  const store = new Persistence('ka-owned-definition-' + crypto.randomUUID());
  try {
    const game = new Game(store);
    const view = await game.create_run({
      schema: 14,
      contract: '0.5.1',
      package_ref: {id: 'KA-TEXT-KNOWLEDGE-01', version: 1},
    }, 'research', crypto.randomUUID());
    expect(view).toMatchObject({
      scenario_kind: 'play_knowledge_collection',
      revision: 1,
      sim_time: 0,
      mode: 'research',
      paused: true,
      status: 'ready',
      actors: [
        {id: 'R', position: {point: [250, 150], observed_at: 0, received_at: 0}},
        {id: 'W', position: {point: [250, 150], observed_at: 0, received_at: 0}},
      ],
      public_rules: {deadline: 900000, receipt_grace: 10000, cleanup_duration: 322000},
      reports: [],
      coverage: [],
      facility_knowledge: null,
    });
    expect(await game.get_view(view.run_id)).toEqual(view);
  } finally {
    await store.delete();
  }
});

test('KA-E01 rejects altered selectors atomically without admitting an old package or unsupported payload', async () => {
  const store = new Persistence('ka-owned-invalid-definition-' + crypto.randomUUID());
  const game = new Game(store);
  try {
    const selector = {schema:14, contract:'0.5.1', package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}};
    for (const input of [
      {...selector, package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:2}},
      {...selector, package_ref:{id:'INTEGRATED-FIELD-PACK-3',version:1}},
      {...selector, schema:13},
      {...selector, attachment:{kind:'image',storage_ref:'unapproved'}},
      {...selector, initial_positions:{R:'H',W:'B'}},
    ]) {
      await expect(game.create_run(input,'research',crypto.randomUUID())).rejects.toThrow('INVALID_DEFINITION');
    }
    expect(await store.list_runs()).toEqual([]);
  } finally {
    await store.delete();
  }
});

test('KA-E01 repeats the same creation once and preserves its initial run on an operation conflict', async () => {
  const store = new Persistence('ka-owned-idempotent-definition-' + crypto.randomUUID());
  const game = new Game(store), operation = crypto.randomUUID();
  const selector = {schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}};
  try {
    const first = await game.create_run(selector,'research',operation);
    expect(await game.create_run(selector,'research',operation)).toEqual(first);
    await expect(game.create_run(selector,'command',operation)).rejects.toThrow('OPERATION_CONFLICT');
    expect(await game.get_view(first.run_id)).toEqual(first);
  } finally {
    await store.delete();
  }
});
