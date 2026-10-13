import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {engineeringDefinition} from '../src/core/scenario';
test('isolated recorded-input replay preserves delayed knowledge and refuses historical writes without changing the source',async()=>{
  const store=new Persistence('replay'),game=new Game(store);let view=await game.create_run(engineeringDefinition,'research','create');
  const plan=await game.preview_plan(view.run_id,view.revision,1);
  view=(await game.issue_order({run_id:view.run_id,operation_id:'issue',expected_revision:view.revision,intent:{kind:'issue',command_id:'move',plan}})).view;
  view=(await game.control_clock({run_id:view.run_id,operation_id:'finish',expected_revision:view.revision,intent:{kind:'advance',to:33800}})).view;
  const before=await store.read_committed(view.run_id),initial=await store.snapshot(view.run_id,1);
  for(const [at,x,finished] of [[6000,50,false],[7000,68.87,false],[32800,163.21,false],[33800,170,true]] as const){
    const history=await game.get_replay(view.run_id,at);const known=await history.get_view(view.run_id);
    expect(known.sim_time).toBe(at);expect(known.position.x).toBe(x);expect(known.finished).toBe(finished);
    const envelope={run_id:view.run_id,operation_id:'history-write',expected_revision:known.revision,intent:{kind:'save'} as const};
    await expect(history.save(envelope)).rejects.toThrow('HISTORY_READ_ONLY');
    await expect(history.control_clock({...envelope,intent:{kind:'pause',reason:'manual'}})).rejects.toThrow('HISTORY_READ_ONLY');
    await expect(history.issue_order({...envelope,intent:{kind:'issue',command_id:'second',plan}})).rejects.toThrow('HISTORY_READ_ONLY');
    await expect(history.restore(view.run_id,'restore')).rejects.toThrow('HISTORY_READ_ONLY');
    await expect(history.tick(view.run_id,at+1,'tick')).rejects.toThrow('HISTORY_READ_ONLY');
    await expect(history.create_run(engineeringDefinition,'research','new')).rejects.toThrow('HISTORY_READ_ONLY');
  }
  expect(await store.read_committed(view.run_id)).toEqual(before);expect(await store.snapshot(view.run_id,1)).toEqual(initial);
  expect(await(await game.get_replay(view.run_id,33800)).get_view(view.run_id)).toEqual(view);await store.delete();
});
test('same-scenario restart uses a new run and inherited RNG origin, atomically makes the source read-only, and retries the original creation',async()=>{
  const store=new Persistence('restart'),game=new Game(store);const original=await game.create_run(engineeringDefinition,'research','create');
  const before=await store.read_committed(original.run_id),snapshot=await store.snapshot(original.run_id,1);
  const fresh=await game.restart_run(original.run_id,'restart');expect(fresh.run_id).not.toBe(original.run_id);expect(fresh.source_run).toBe(original.run_id);
  expect(fresh.sim_time).toBe(0);expect(fresh.position).toEqual(original.position);expect(fresh.resources).toEqual(original.resources);
  const state=await store.read_committed(fresh.run_id);expect(state?.rng).toEqual(before?.rng);expect(state?.order).toBeNull();expect(state?.inputs).toEqual([]);
  expect(await game.restart_run(original.run_id,'restart')).toEqual(fresh);
  await expect(game.save({run_id:original.run_id,operation_id:'save',expected_revision:original.revision,intent:{kind:'save'}})).rejects.toThrow('HISTORY_READ_ONLY');
  await expect(game.restore(original.run_id,'restore')).rejects.toThrow('HISTORY_READ_ONLY');
  expect((await game.get_view(original.run_id)).can_issue).toBe(false);expect(await store.read_committed(original.run_id)).toEqual(before);expect(await store.snapshot(original.run_id,1)).toEqual(snapshot);await store.delete();
});
test('replay reproduces recorded wall-clock adoption, rate and pause controls while the current run remains writable',async()=>{
  const store=new Persistence('replay-clock'),game=new Game(store);let view=await game.create_run(engineeringDefinition,'command','create');
  const plan=await game.preview_plan(view.run_id,view.revision,1);view=(await game.issue_order({run_id:view.run_id,operation_id:'issue',expected_revision:view.revision,intent:{kind:'issue',command_id:'move',plan}})).view;
  view=(await game.tick(view.run_id,7000,'tick')).view;
  view=(await game.control_clock({run_id:view.run_id,operation_id:'pause',expected_revision:view.revision,intent:{kind:'pause',reason:'manual'}},7250)).view;
  expect(await(await game.get_replay(view.run_id,7250)).get_view(view.run_id)).toEqual(view);
  const history=await game.get_replay(view.run_id,6000);expect(await history.get_receipt(view.run_id,'pause')).toBeNull();
  view=(await game.control_clock({run_id:view.run_id,operation_id:'rate',expected_revision:view.revision,intent:{kind:'rate',rate:4}})).view;
  view=(await game.control_clock({run_id:view.run_id,operation_id:'continue',expected_revision:view.revision,intent:{kind:'continue'}})).view;
  view=(await game.tick(view.run_id,33800,'finish')).view;
  expect(await(await game.get_replay(view.run_id,33800)).get_view(view.run_id)).toEqual(view);
  expect((await history.get_view(view.run_id)).position.x).toBe(50);await store.delete();
});
test('a history selector cannot query another run even when both runs use the same operation ID',async()=>{
  const store=new Persistence('history-run-boundary'),game=new Game(store);const runs=[];
  for(const creation of ['create-a','create-b']){
    let view=await game.create_run(engineeringDefinition,'research',creation);const plan=await game.preview_plan(view.run_id,view.revision,1);
    view=(await game.issue_order({run_id:view.run_id,operation_id:'issue',expected_revision:view.revision,intent:{kind:'issue',command_id:'move',plan}})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:'advance',expected_revision:view.revision,intent:{kind:'advance',to:7000}})).view;runs.push(view.run_id);
  }
  const history=await game.get_replay(runs[0],6000);expect((await history.get_receipt(runs[0],'issue'))?.run_id).toBe(runs[0]);await expect(history.get_receipt(runs[1],'issue')).rejects.toThrow('RUN_NOT_FOUND');await store.delete();
});
