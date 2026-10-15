import {legacy_view,legacy_result,legacy_state} from './legacy-branch';
import {expect,test} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {recordEngineeringDefinition} from '../src/core/scenario';

test('FB02-S05/S06 record order accepts, starts, completes and reveals resources only by receipts',async()=>{
  const store=new Persistence('fb02-record-execution'),game=new Game(store);
  try{
    let view=legacy_view(await game.create_run(recordEngineeringDefinition,'research','start'));
    const plan=await game.preview_plan(view.run_id,view.revision,1);
    view=(legacy_result(await game.issue_order({run_id:view.run_id,operation_id:'issue',expected_revision:view.revision,intent:{kind:'issue',command_id:'record',plan}}))).view;
    expect(view.status).toBe('queued');
    expect(view.sim_time).toBe(0);
    expect(view.resources).toMatchObject({hq_energy:16,hq_wear:100,record_energy:20,record_wear:100,record_packs:2,equipment_energy:16,equipment_wear:100});
    const advance=async(to:number)=>{view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:`advance-${to}`,expected_revision:view.revision,intent:{kind:'advance',to}}))).view;return view;};
    expect((await advance(1000)).status).toBe('queued');
    expect(view.log.some(x=>x.kind==='accepted_receipt')).toBe(false);
    expect((await advance(2000)).status).toBe('executing');
    expect(view.resources).toMatchObject({equipment_energy:15,equipment_wear:99,record_energy:20,record_wear:100,record_packs:2});
    expect((await advance(6000)).log.some(x=>x.kind==='fix_receipt')).toBe(false);
    expect((await advance(7000)).resources).toMatchObject({equipment_energy:14,equipment_wear:98,record_energy:20,record_wear:97,record_packs:2});
    expect((await advance(17001)).resources.record_energy).toBe(20);
    expect((legacy_state(await store.read_committed(view.run_id)))?.world.record_work).toEqual({numerator:11001,denominator:10000,unit:'record_work'});
    expect((await advance(26000)).resources.record_energy).toBe(20);
    expect((legacy_state(await store.read_committed(view.run_id)))?.world.record_work).toEqual({numerator:2,denominator:1,unit:'record_work'});
    expect((await advance(46000)).finished).toBe(false);
    expect(view.log.some(x=>x.kind==='complete_receipt')).toBe(false);
    expect(view.artifacts).toEqual([]);
    expect((await advance(47000)).finished).toBe(true);
    expect(view.status).toBe('finished');
    expect(view.resources).toMatchObject({equipment_energy:13,equipment_wear:97,record_energy:16,record_wear:97,record_packs:1,hq_energy:15,hq_wear:99});
    expect(view.log.filter(x=>x.kind==='complete_receipt')).toHaveLength(1);
    expect(view.log.filter(x=>['accepted_receipt','fix_receipt','complete_receipt'].includes(x.kind)).map(x=>[x.sender,x.activity_id])).toEqual([
      ['记录组 R','record.accept.0'],
      ['记录组 R','record.record.0'],
      ['记录组 R','record.complete.0'],
    ]);
    expect(view.artifacts).toEqual([{id:'artifact-record',report_id:'REPORT-A',delivery_id:'DELIVERY-A',completed:46000,verified:false,activity_id:'record.complete.0'}]);
  }finally{await store.delete();}
});

test('FB02-S08 record completion must be strictly before deadline and grace never adds work',async()=>{
  async function run(issuedAt:number,name:string){
    const store=new Persistence(name),game=new Game(store);
    try{
      let view=legacy_view(await game.create_run(recordEngineeringDefinition,'research','start'));
      view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'pre-issue',expected_revision:view.revision,intent:{kind:'advance',to:issuedAt}}))).view;
      const plan=await game.preview_plan(view.run_id,view.revision,1);
      view=(legacy_result(await game.issue_order({run_id:view.run_id,operation_id:'issue',expected_revision:view.revision,intent:{kind:'issue',command_id:'record',plan}}))).view;
      view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'finish',expected_revision:view.revision,intent:{kind:'advance',to:610000}}))).view;
      return view;
    }finally{await store.delete();}
  }
  const legal=await run(553999,'record-deadline-legal');
  expect(legal.finished).toBe(true);
  expect(legal.log.find(x=>x.kind==='complete_receipt')?.observed).toBe(599999);
  const exact=await run(554000,'record-deadline-exact');
  expect(exact.finished).toBe(false);
  expect(exact.status).toBe('deadline');
  expect(exact.log.some(x=>x.kind==='complete_receipt')).toBe(false);
  const partial=await run(574999,'record-deadline-partial');
  expect(partial.status).toBe('deadline');
  expect(partial.resources.record_energy).toBe(18);
  expect(partial.resources.record_packs).toBe(1);
  expect(partial.resources.record_wear).toBe(97);
});
