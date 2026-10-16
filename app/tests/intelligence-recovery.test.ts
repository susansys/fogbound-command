import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {intelligence_definition} from './intelligence-fixtures';
import {state_hash} from '../src/core/snapshot';

test.each([0,31000])('B23 retained-history entry reads the latest committed schema9 view at %i without an explicit node',async at=>{
  const store=new Persistence('b23-owned-t01-retained-'+at);
  try{
    const game=new Game(store);let view=await game.create_run(await intelligence_definition(),'research','create');
    if(at)({view}=await game.control_clock({run_id:view.run_id,operation_id:'advance',expected_revision:view.revision,intent:{kind:'advance',to:at}}));
    const reopened=new Game(store),history=await reopened.get_replay(view.run_id,at);
    expect(await history.get_view(view.run_id)).toEqual({...view,can_issue:false,next_action:'历史记录只能查看，请返回当前行动后安排任务'});
    await expect(history.save({run_id:view.run_id,operation_id:'history-write',expected_revision:view.revision,intent:{kind:'save'}})).rejects.toThrow('HISTORY_READ_ONLY');
    expect(await reopened.get_view(view.run_id)).toEqual(view);
  }finally{await store.delete();}
});

test('B23 E09 an acknowledged-unknown commit retries the same receipt without another publication or delivery',async()=>{
  const store=new Persistence('b23-owned-t01-e09');
  try{
    const game=new Game(store),initial=await game.create_run(await intelligence_definition(),'research','create');
    const commit=store.commit_batch.bind(store);let dropped=false;
    store.commit_batch=async(...args)=>{await commit(...args);if(!dropped){dropped=true;throw Error('owned committed response loss');}};
    const envelope={run_id:initial.run_id,operation_id:'lost-advance',expected_revision:1,intent:{kind:'advance' as const,to:86000}};
    await expect(game.control_clock(envelope)).rejects.toThrow('STORAGE_UNCONFIRMED');
    const receipt=await game.get_receipt(initial.run_id,envelope.operation_id),before=await game.get_view(initial.run_id),source=await game.get_actor_view(initial.run_id,'ArchiveSource');
    expect(receipt).toMatchObject({revision:2,sim_time:86000});
    const retry=await game.control_clock(envelope);expect(retry.receipt).toEqual(receipt);expect(retry.view).toEqual(before);expect(await game.get_actor_view(initial.run_id,'ArchiveSource')).toEqual(source);
    expect(Reflect.get(retry.view,'received_reports')).toHaveLength(4);expect(source.resources).toMatchObject({energy:16,durability:97,packs:0});
    await expect(game.control_clock({...envelope,intent:{kind:'advance',to:86001}})).rejects.toThrow('OPERATION_ID_REUSED');
    expect(await game.get_view(initial.run_id)).toEqual(before);
  }finally{await store.delete();}
});

test.each(['fake_parent','wrong_rng_origin'] as const)('B23 schema9 rejects a self-hashed %s through the owned storage fault seam',async variant=>{
  const store=new Persistence('b23-owned-t01-invalid-'+variant);
  try{
    const game=new Game(store),initial=await game.create_run(await intelligence_definition(),'research','create');
    const realRead=store.read_committed.bind(store),committed=await realRead(initial.run_id);if(!committed)throw Error('Owned committed run absent');
    const forged=structuredClone(committed);if(variant==='fake_parent')forged.source_run='missing-parent';else forged.rng.origin='wrong-origin';forged.integrity=await state_hash(forged);
    store.read_committed=async run=>run===initial.run_id?structuredClone(forged):realRead(run);
    await expect(game.get_view(initial.run_id)).rejects.toThrow('INVALID_SAVE');
    expect(await realRead(initial.run_id)).toEqual(committed);
  }finally{await store.delete();}
});

test.each([64000,75000])('B23 E10 restore at %i keeps source work in the same paused run and requires explicit continue',async at=>{
  const store=new Persistence('b23-owned-t01-e10-'+at);
  try{
    const game=new Game(store),initial=await game.create_run(await intelligence_definition(),'command','create');
    const {view}=await game.tick(initial.run_id,at,'before-close');
    const saved=await game.save({run_id:view.run_id,operation_id:'save',expected_revision:view.revision,intent:{kind:'save'}});
    const local=await game.get_actor_view(view.run_id,'ArchiveSource'),restoredGame=new Game(store),restored=await restoredGame.restore(view.run_id,'restore');
    expect(restored.view).toMatchObject({run_id:view.run_id,sim_time:at,paused:true});expect(await restoredGame.get_actor_view(view.run_id,'ArchiveSource')).toEqual(local);
    await expect(restoredGame.tick(view.run_id,86000,'blocked-tick')).rejects.toThrow('CLOCK_PAUSED');
    const continued=await restoredGame.control_clock({run_id:view.run_id,operation_id:'continue',expected_revision:restored.view.revision,intent:{kind:'continue'}});
    expect(continued.view.sim_time).toBe(saved.view.sim_time);
    const final=await restoredGame.tick(view.run_id,86000,'after-continue');expect(Reflect.get(final.view,'received_reports')).toHaveLength(4);
    expect(await restoredGame.get_actor_view(view.run_id,'ArchiveSource')).toMatchObject({work:{status:'completed',done_ms:20000},resources:{energy:16,durability:97,packs:0},published_reports:[{id:'R3'}]});
    const repeated=await restoredGame.tick(view.run_id,86000,'after-continue');expect(repeated.receipt).toEqual(final.receipt);
  }finally{await store.delete();}
});
