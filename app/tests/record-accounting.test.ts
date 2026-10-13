import {expect,test} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {recordEngineeringDefinition} from '../src/core/scenario';

test('FB02-S05 registering while paused spends no HQ energy until the send event is processed',async()=>{
  const store=new Persistence('record-send-phase'),game=new Game(store);
  try{
    let view=await game.create_run(recordEngineeringDefinition,'research','start');
    const plan=await game.preview_plan(view.run_id,view.revision,1);
    view=(await game.issue_order({run_id:view.run_id,operation_id:'issue',expected_revision:view.revision,intent:{kind:'issue',command_id:'record',plan}})).view;
    expect(view.resources).toMatchObject({hq_energy:16,hq_wear:100});
    expect(view.log.some(entry=>entry.kind==='sent')).toBe(false);
    view=(await game.control_clock({run_id:view.run_id,operation_id:'advance',expected_revision:view.revision,intent:{kind:'advance',to:999}})).view;
    expect(view.resources).toMatchObject({hq_energy:15,hq_wear:99});
    expect(view.log.filter(entry=>entry.kind==='sent')).toHaveLength(1);
    expect(view.status).toBe('queued');
  }finally{await store.delete();}
});

test.each([
  {issued:553999,finished:true,work:{numerator:4,denominator:1,unit:'record_work'},energy:16,packs:1,wear:97},
  {issued:554000,finished:false,work:{numerator:4,denominator:1,unit:'record_work'},energy:16,packs:1,wear:97},
  {issued:574999,finished:false,work:{numerator:19001,denominator:10000,unit:'record_work'},energy:18,packs:1,wear:97},
  {issued:595000,finished:false,work:{numerator:0,denominator:1,unit:'record_work'},energy:20,packs:2,wear:100},
])('FB02-S08 settles only actual work at the strict deadline for issue $issued',async(expected)=>{
  const store=new Persistence(`record-settle-${expected.issued}`),game=new Game(store);
  try{
    let view=await game.create_run(recordEngineeringDefinition,'research','start');
    view=(await game.control_clock({run_id:view.run_id,operation_id:'pre',expected_revision:view.revision,intent:{kind:'advance',to:expected.issued}})).view;
    const plan=await game.preview_plan(view.run_id,view.revision,1);
    view=(await game.issue_order({run_id:view.run_id,operation_id:'issue',expected_revision:view.revision,intent:{kind:'issue',command_id:'record',plan}})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:'finish',expected_revision:view.revision,intent:{kind:'advance',to:610000}})).view;
    expect(view.finished).toBe(expected.finished);
    expect(view.resources).toMatchObject({record_energy:expected.energy,record_packs:expected.packs,record_wear:expected.wear,record_energy_reserved:0,record_packs_reserved:0});
    expect((await store.read_committed(view.run_id))?.world.record_work).toEqual(expected.work);
    expect(view.artifacts).toHaveLength(expected.finished?1:0);
  }finally{await store.delete();}
});

test('FB02-S07 one advance and fractional segmented advances preserve the complete causal record and ledger',async()=>{
  async function run(points:number[],name:string){
    const store=new Persistence(name),game=new Game(store);
    try{
      let view=await game.create_run(recordEngineeringDefinition,'research','start');
      const plan=await game.preview_plan(view.run_id,view.revision,1);
      view=(await game.issue_order({run_id:view.run_id,operation_id:'issue',expected_revision:view.revision,intent:{kind:'issue',command_id:'record',plan}})).view;
      for(const to of points)view=(await game.control_clock({run_id:view.run_id,operation_id:`to-${to}`,expected_revision:view.revision,intent:{kind:'advance',to}})).view;
      const state=(await store.read_committed(view.run_id))!;
      return {world:state.world,known:state.known,log:state.log,schedule:state.schedule,status:state.status};
    }finally{await store.delete();}
  }
  expect(await run([999,1000,2000,6000,7000,17001,26000,46000,47000],'record-split')).toEqual(await run([47000],'record-whole'));
});

test('FB02-S06/S07 reserves at acceptance and persists exact work, energy spent and remaining reservation',async()=>{
  const store=new Persistence('record-exact-ledger'),game=new Game(store);
  try{
    let view=await game.create_run(recordEngineeringDefinition,'research','start');
    const plan=await game.preview_plan(view.run_id,view.revision,1);
    view=(await game.issue_order({run_id:view.run_id,operation_id:'issue',expected_revision:view.revision,intent:{kind:'issue',command_id:'record',plan}})).view;
    const advance=async(to:number)=>{view=(await game.control_clock({run_id:view.run_id,operation_id:`to-${to}`,expected_revision:view.revision,intent:{kind:'advance',to}})).view;return (await store.read_committed(view.run_id))!;};
    const accepted=await advance(1000);
    expect(accepted.world).toMatchObject({record_work:{numerator:0,denominator:1,unit:'record_work'},record_energy_reserved:{numerator:4,denominator:1,unit:'record_energy'},record_packs_reserved:1});
    await advance(7000);
    expect(view.resources).toMatchObject({record_energy:20,record_energy_reserved:4,record_packs_reserved:1});
    const fractional=await advance(17001);
    expect(fractional.world).toMatchObject({record_work:{numerator:11001,denominator:10000,unit:'record_work'},record_energy_used:{numerator:11001,denominator:10000,unit:'record_energy'},record_energy:{numerator:188999,denominator:10000,unit:'record_energy'},record_energy_reserved:{numerator:28999,denominator:10000,unit:'record_energy'},record_packs_accrued:{numerator:11001,denominator:40000,unit:'record_pack'}});
    const halfway=await advance(26000);
    expect(halfway.world).toMatchObject({record_work:{numerator:2,denominator:1,unit:'record_work'},record_energy:{numerator:18,denominator:1,unit:'record_energy'},record_energy_reserved:{numerator:2,denominator:1,unit:'record_energy'}});
    expect(view.resources.record_energy).toBe(20);
    await advance(47000);
    expect(view.resources).toMatchObject({record_energy:16,record_packs:1,record_energy_reserved:0,record_packs_reserved:0});
  }finally{await store.delete();}
});
