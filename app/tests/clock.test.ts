import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {engineeringDefinition} from '../src/core/scenario';
import type {Intent} from '../src/contracts';
test('clock controls commit pause, explicit continue and public rates without changing opening mode',async()=>{
  const store=new Persistence('clock-control'),game=new Game(store);
  let view=await game.create_run(engineeringDefinition,'command','create');
  async function control(operation_id:string,intent:Intent){return game.control_clock({run_id:view.run_id,operation_id,expected_revision:view.revision,intent});}
  const pauseEnvelope={run_id:view.run_id,operation_id:'pause',expected_revision:view.revision,intent:{kind:'pause',reason:'focus_lost'} as const};
  const paused=await game.control_clock(pauseEnvelope);view=paused.view;
  expect(view.paused).toBe(true);expect(view.sim_time).toBe(0);
  expect((await game.control_clock(pauseEnvelope)).receipt).toEqual(paused.receipt);
  view=(await control('rate',{kind:'rate',rate:4})).view;
  expect(view.rate).toBe(4);expect(view.paused).toBe(true);
  view=(await control('continue',{kind:'continue'})).view;
  expect(view.paused).toBe(false);
  await expect(control('illegal-advance',{kind:'advance',to:1000})).rejects.toThrow('MODE_LOCKED');
  await expect(control('change-mode',{kind:'mode',mode:'research'})).rejects.toThrow('MODE_LOCKED');
  expect(await game.get_view(view.run_id)).toEqual(view);
  await store.delete();
});
test('research remains paused and refuses zero or reversed advancement without a commit',async()=>{
  const store=new Persistence('research-clock'),game=new Game(store);
  const view=await game.create_run(engineeringDefinition,'research','create');
  for(const intent of [{kind:'advance',to:0},{kind:'continue'}] as const){
    await expect(game.control_clock({run_id:view.run_id,operation_id:intent.kind,expected_revision:view.revision,intent})).rejects.toThrow(intent.kind==='advance'?'TIME_NOT_ADVANCED':'MODE_LOCKED');
  }
  expect(await game.get_view(view.run_id)).toEqual(view);await store.delete();
});
test('worker-adopted control time preserves elapsed fractions between clock ticks',async()=>{
  const store=new Persistence('adopted-clock'),game=new Game(store);
  let view=await game.create_run(engineeringDefinition,'command','create');
  view=(await game.tick(view.run_id,7000,'tick')).view;
  const envelope={run_id:view.run_id,operation_id:'pause',expected_revision:view.revision,intent:{kind:'pause',reason:'manual'} as const};
  const paused=await game.control_clock(envelope,7250);
  expect(paused.view.sim_time).toBe(7250);expect(paused.view.paused).toBe(true);
  expect((await game.control_clock(envelope,9999)).receipt).toEqual(paused.receipt);
  await store.delete();
});
test('worker clock targets advance command time only while running, and pause excludes off-clock elapsed time',async()=>{
  const store=new Persistence('clock-ticks'),game=new Game(store);
  let view=await game.create_run(engineeringDefinition,'command','create');
  const plan=await game.preview_plan(view.run_id,view.revision,1);
  view=(await game.issue_order({run_id:view.run_id,operation_id:'issue',expected_revision:view.revision,intent:{kind:'issue',command_id:'move',plan}})).view;
  view=(await game.tick(view.run_id,7000,'tick-1')).view;
  expect(view.position.x).toBe(68.87);
  view=(await game.control_clock({run_id:view.run_id,operation_id:'pause',expected_revision:view.revision,intent:{kind:'pause',reason:'manual'}})).view;
  await expect(game.tick(view.run_id,17000,'tick-paused')).rejects.toThrow('CLOCK_PAUSED');
  expect(await game.get_view(view.run_id)).toEqual(view);
  view=(await game.control_clock({run_id:view.run_id,operation_id:'continue',expected_revision:view.revision,intent:{kind:'continue'}})).view;
  view=(await game.tick(view.run_id,33800,'tick-2')).view;
  expect(view.finished).toBe(true);expect(view.resources.movement_energy).toBe(18);
  await store.delete();
});
