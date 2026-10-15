import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import definition from './fixtures/play-corridor.json';
import {valid_response} from '../src/dto';
import {play_variant,zero_load,movement_run} from './play-fixtures';
import {load_definition} from '../src/core/scenario';
import {valid_request} from '../src/protocol';

test('PG09 registered movement causes reject conflicting same-consumer declarations before accepting a self-consistent package',async()=>{
  const value=await play_variant(v=>{v.catalogs.movement_causes.push({...v.catalogs.movement_causes[0],factor:2});});
  await expect(load_definition(value,[value])).rejects.toMatchObject({code:'INVALID_REQUEST',field_path:'catalogs.movement_causes'});
});

test('PG10 issuing the main100m route only registers a task message and does not imply actor acceptance or motion',async()=>{
  const store=new Persistence('b21-owned-movement-registration');
  try{
    const game=new Game(store),initial=await game.create_run(definition,'research','create-main-route');
    if(initial.scenario_kind!=='play_corridor')throw Error('Expected schema7 corridor branch');
    const {map_id,map_version,crs_id,geometry_version}=initial.geometry;
    const plan=await game.preview_plan(initial.run_id,initial.revision,1,{actor:'R',map_id,map_version,crs_id,geometry_version,path:[[50,150],[150,150]]});
    const result=await game.issue_order({run_id:initial.run_id,operation_id:'issue-main-route',expected_revision:initial.revision,intent:{kind:'issue',command_id:'main-route',plan}});
    expect(result.view).toMatchObject({status:'queued',sim_time:0,can_issue:false,issued_orders:[{command_id:'main-route',issued:0,plan}]});
    expect(result.view.resources).toEqual(initial.resources);
    if(result.view.scenario_kind!=='play_corridor')throw Error('Expected corridor result');
    expect(result.view.position_knowledge).toEqual(initial.position_knowledge);
    const state=await store.read_committed(initial.run_id);
    expect(state).toMatchObject({requests:[{command_id:'main-route',issued:0,status:'registered',sent_at:null,accepted_at:null,plan}],queue:expect.arrayContaining([{id:'main-route:send_command',kind:'send_command',command_id:'main-route',at:0,phase:5,generation:2}])});
    expect(await new Game(store).get_view(initial.run_id)).toEqual(result.view);
    expect(valid_response({request_id:'registered-route',ok:true,view:result.view})).toBe(true);
    expect(await game.get_receipt(initial.run_id,'issue-main-route')).toMatchObject({kind:'issue',revision:2,sim_time:0});
  }finally{await store.delete();}
});

test('PG10 main R100m accepts by message, arrives at30500 and reaches HQ only at31500 with two paid reports',async()=>{
  const store=new Persistence('b21-owned-movement-main-timeline');
  try{
    const game=new Game(store),initial=await game.create_run(definition,'research','create-main-timeline');
    if(initial.scenario_kind!=='play_corridor')throw Error('Expected corridor branch');
    const {map_id,map_version,crs_id,geometry_version}=initial.geometry;
    const plan=await game.preview_plan(initial.run_id,1,1,{actor:'R',map_id,map_version,crs_id,geometry_version,path:[[50,150],[150,150]]});
    await game.issue_order({run_id:initial.run_id,operation_id:'issue-timeline',expected_revision:1,intent:{kind:'issue',command_id:'main-timeline',plan}});
    async function advance(to:number){const view=await game.get_view(initial.run_id);return (await game.control_clock({run_id:initial.run_id,operation_id:'advance-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;}
    const at1000=await advance(1000);
    expect(at1000).toMatchObject({status:'queued',resources:{equipment_energy:16,movement_energy:20}});
    let state=await store.read_committed(initial.run_id);
    expect(state).toMatchObject({requests:[{status:'accepted',sent_at:0,accepted_at:1000}],activities:[{status:'moving',starts:1000,duration_ms:{n:'29500',d:'1'}}],reports:[{kind:'accepted',position_scope:null,observed:{kind:'known',value:1000},reported:{kind:'known',value:1000}}]});
    const at2000=await advance(2000);
    expect(at2000).toMatchObject({status:'accepted',resources:{equipment_energy:15,equipment_wear:99,movement_energy:20,movement_energy_reserved:1}});
    expect(at2000).toMatchObject({position_knowledge:initial.position_knowledge});
    const at30500=await advance(30500);
    expect(at30500).toMatchObject({status:'accepted',position_knowledge:initial.position_knowledge});
    state=await store.read_committed(initial.run_id);
    expect(state).toMatchObject({world:{resources:{movement_energy:19,movement_energy_reserved:0,equipment_energy:14,equipment_wear:98}},activities:[{status:'arrived',terminal_at:30500,settled:true}]});
    const delivered=await advance(31500);
    expect(delivered).toMatchObject({status:'arrived',finished:false,position_knowledge:{status:'known_scope',scope:{kind:'point',typed_geometry:{position:[150,150]}},observed:{kind:'known',value:30500},reported:{kind:'known',value:30500},received:31500},resources:{movement_energy:19,movement_energy_reserved:0,equipment_energy:14,equipment_wear:98}});
    state=await store.read_committed(initial.run_id);
    expect(state).toMatchObject({reports:[{kind:'accepted'},{kind:'arrived'}],deliveries:[{received:{value:2000}},{received:{value:31500}}]});
    expect(valid_response({request_id:'delivered-main',ok:true,view:delivered})).toBe(true);
    expect(await new Game(store).get_view(initial.run_id)).toEqual(delivered);
  }finally{await store.delete();}
});

test('PG09 literal120m diagonal checkpoints and big/small advances retain exact positions, messages and one settlement',async()=>{
  const value=await play_variant(zero_load),path:[number,number][]=[[50,150],[56,158],[140,158],[146,150],[162,150]];
  const small=await movement_run('diagonal-small',value,path),large=await movement_run('diagonal-large',value,path),ticks=await movement_run('diagonal-thirty',value,path);
  try{
    expect(small.plan).toMatchObject({distance:120,estimated_move_ms:30000});
    for(const [to,x,y] of [[2500,{n:'268',d:'5'},{n:'774',d:'5'}],[3500,{n:'56',d:'1'},{n:'158',d:'1'}],[24500,{n:'140',d:'1'},{n:'158',d:'1'}],[27000,{n:'146',d:'1'},{n:'150',d:'1'}],[31000,{n:'162',d:'1'},{n:'150',d:'1'}]] as const){
      await small.advance(to);expect(await small.store.read_committed(small.run)).toMatchObject({world:{position:{x,y}}});
    }
    const delivered=await small.advance(32000);await large.advance(32000);
    expect(delivered).toMatchObject({status:'arrived',resources:{movement_energy:18,equipment_energy:14,equipment_wear:98}});
    const a=await small.store.read_committed(small.run),b=await large.store.read_committed(large.run);
    if(a?.schema!==7||b?.schema!==7)throw Error('Expected corridor state');
    expect(a.world).toEqual(b.world);expect(a.activities.map(({command_id,...activity})=>activity)).toEqual(b.activities.map(({command_id,...activity})=>activity));
    expect(a.activities).toMatchObject([{length_units:['10000000','84000000','10000000','16000000'],duration_ms:{n:'30000',d:'1'},settlement:{distance:{n:'120',d:'1'},energy:2,released:0,at:31000}}]);
    expect(a.reports.map(({command_id,...report})=>report)).toEqual(b.reports.map(({command_id,...report})=>report));expect(a.deliveries).toEqual(b.deliveries);
    await ticks.advance(1000);for(let i=1;i<=30;i++)await ticks.advance(1000+i*1000);await ticks.advance(32000);
    const c=await ticks.store.read_committed(ticks.run);if(c?.schema!==7)throw Error('Expected corridor');expect(c.world).toEqual(b.world);expect(c.known).toEqual(b.known);expect(c.activities.map(({command_id,...activity})=>activity)).toEqual(b.activities.map(({command_id,...activity})=>activity));
  }finally{await small.store.delete();await large.store.delete();await ticks.store.delete();}
});

test('PG09 trusted speed2, independent load10/environment and repeated same slope use the registered literal durations',async()=>{
  const slow=await play_variant(v=>{zero_load(v);v.profile.parameters.base_speed=2;v.capabilities[0].id='R-MOVE-2';v.capabilities[0].speed=2;v.catalogs.actor.qualification_refs=['R-MOVE-2'];});
  const loaded=await play_variant(v=>{v.catalogs.items.push({id:'extra-load',count:1,load:1,space:0});v.catalogs.actor.load=10;v.profile.parameters.environment_factor=1.25;v.catalogs.movement_causes[1].factor=1.25;});
  const slope=await play_variant(v=>{zero_load(v);v.profile.parameters.terrain_factor=1.5;v.profile.parameters.environment_factor=1.5;v.catalogs.movement_causes=[{cause_id:'S',rule_ref:'slope',consumer:'R:move',slot:'terrain',factor:1.5,evidence_ref:'slope-initial'},{cause_id:'S',rule_ref:'slope',consumer:'R:move',slot:'environment',factor:1.5,evidence_ref:'same-slope-environment'}];});
  for(const [name,value,path,duration] of [
    ['slow',slow,[[50,150],[56,158],[140,158],[146,150],[162,150]],60000],
    ['load10',loaded,[[50,150],[150,150]],37500],
    ['same-slope',slope,[[50,150],[150,150]],37500]
  ] as const){
    const run=await movement_run(name,value,path.map(p=>[p[0],p[1]]));
    try{
      expect(run.plan).toMatchObject({estimated_move_ms:duration});
      const view=await run.advance(duration+2000);expect(view).toMatchObject({status:'arrived'});
      expect(await run.store.read_committed(run.run)).toMatchObject({activities:[{duration_ms:{n:String(duration),d:'1'},terminal_at:duration+1000,settled:true}]});
    }finally{await run.store.delete();}
  }
});

test('PG11 inclusive900000 arrival wins cutoff, one millisecond later stops actual progress and grace cannot extend movement',async()=>{
  const value=await play_variant(zero_load);
  const arrived=await movement_run('deadline-equal',value,[[50,150],[150,150]],874000),cutoff=await movement_run('deadline-late',value,[[50,150],[150,150]],874001);
  try{
    for(const run of [arrived,cutoff]){
      const pending=await run.advance(900000);expect(pending).toMatchObject({status:'window_ended_unconfirmed',position_knowledge:run.initial.position_knowledge});
    }
    expect(await arrived.store.read_committed(arrived.run)).toMatchObject({activities:[{status:'arrived',terminal_at:900000,settled:true}],reports:[{kind:'accepted'},{kind:'arrived',observed:{value:900000}}]});
    expect(await cutoff.store.read_committed(cutoff.run)).toMatchObject({world:{position:{x:{n:'37499',d:'250'},y:{n:'150',d:'1'}},resources:{movement_energy:19,movement_energy_reserved:0}},activities:[{status:'cutoff',terminal_at:900000,settlement:{distance:{n:'24999',d:'250'},energy:1}}],reports:[{kind:'accepted'},{kind:'cutoff',observed:{value:900000}}]});
    expect(await arrived.advance(901000)).toMatchObject({status:'arrived',finished:false});expect(await cutoff.advance(901000)).toMatchObject({status:'cutoff_confirmed',finished:false});
    const a=await arrived.advance(910000),c=await cutoff.advance(910000);expect(a).toMatchObject({status:'arrived',paused:true});expect(c).toMatchObject({status:'cutoff_confirmed',paused:true});
    expect(await cutoff.store.read_committed(cutoff.run)).toMatchObject({reports:[{kind:'accepted'},{kind:'cutoff'}],activities:[{status:'cutoff',settled:true}]});
    await expect(cutoff.advance(910001)).rejects.toThrow('INVALID_INPUT');
  }finally{await arrived.store.delete();await cutoff.store.delete();}
});

test('PG12 hiddenx160 stops at33450 but paired HQ views stay equal until real34450 delivery and no third cutoff report is formed',async()=>{
  const closed=await play_variant(v=>{v.catalogs.engine_conditions.closed_at_x=160;});
  const normal=await movement_run('normal-private',await play_variant(()=>{}),[[50,150],[250,150]]),blocked=await movement_run('closed-private',closed,[[50,150],[250,150]]);
  const comparable=(value:unknown,run:string,name:string)=>JSON.parse(JSON.stringify(value).replaceAll(run,'same-run').replaceAll(name,'same-case'));
  try{
    expect(blocked.plan).toMatchObject({distance:200,estimated_move_ms:59000});
    for(const to of [1000,2000,33449,33450,34449]){
      const a=await normal.advance(to),b=await blocked.advance(to);
      expect(comparable(b,blocked.run,'closed-private')).toEqual(comparable(a,normal.run,'normal-private'));
    }
    expect(await blocked.store.read_committed(blocked.run)).toMatchObject({world:{position:{x:{n:'160',d:'1'},y:{n:'150',d:'1'}},resources:{movement_energy:18,equipment_energy:14,equipment_wear:98}},activities:[{status:'blocked',terminal_at:33450,settlement:{distance:{n:'110',d:'1'},energy:2,released:0}}],reports:[{kind:'accepted'},{kind:'blocked',observed:{value:33450}}]});
    const view=await blocked.advance(34450);expect(view).toMatchObject({status:'blocked',finished:false,position_knowledge:{scope:{typed_geometry:{position:[160,150]}},observed:{value:33450},reported:{value:33450},received:34450},resources:{movement_energy:18,equipment_energy:14,equipment_wear:98}});
    expect(valid_response({request_id:'blocked',ok:true,view})).toBe(true);
    await blocked.advance(910000);expect(await blocked.store.read_committed(blocked.run)).toMatchObject({reports:[{kind:'accepted'},{kind:'blocked'}]});
  }finally{await normal.store.delete();await blocked.store.delete();}
});

test('PG10 corridor Worker requests require an explicit schema7 context, preserving the old control bound and strict fields',async()=>{
  const run=await movement_run('worker-context',await play_variant(()=>{}),[[50,150],[150,150]]);
  try{
    const base={request_id:'corridor-task',kind:'operate_corridor',envelope:{run_id:run.run,operation_id:'context',expected_revision:1,intent:{kind:'issue',command_id:'context-route',plan:run.plan}}};
    expect(valid_request(base)).toBe(true);expect(valid_request({...base,kind:'operate'})).toBe(false);
    const advance={...base,envelope:{...base.envelope,intent:{kind:'advance',to:910000}}};
    expect(valid_request(advance)).toBe(true);expect(valid_request({...advance,kind:'operate'})).toBe(false);
    expect(valid_request({...advance,private_case_ref:'closed'})).toBe(false);
    expect(valid_request({...advance,envelope:{...advance.envelope,intent:{kind:'advance',to:910001}}})).toBe(false);
  }finally{await run.store.delete();}
});

test('PG11 low LINK retains unsent terminal evidence, never invents a delivered fix or failure, and seals at public grace bound',async()=>{
  const value=await play_variant(v=>{v.profile.parameters.equipment_energy=1;v.catalogs.equipment.find(e=>e.id==='EQ-LINK')!.energy=1;}),run=await movement_run('low-link',value,[[50,150],[150,150]]);
  try{
    await run.advance(31500);
    expect(await run.game.get_view(run.run)).toMatchObject({status:'accepted',position_knowledge:run.initial.position_knowledge,resources:{equipment_energy:0,equipment_wear:99,movement_energy:20}});
    expect(await run.store.read_committed(run.run)).toMatchObject({activities:[{status:'arrived',settled:true}],local_reports:[{kind:'accepted',status:'sent'},{kind:'arrived',status:'unsent',report_id:null}],reports:[{kind:'accepted'}],deliveries:[{received:{value:2000}}],world:{resources:{movement_energy:19,equipment_energy:0,equipment_wear:99}}});
    const sealed=await run.advance(910000);expect(sealed).toMatchObject({status:'window_sealed_unconfirmed',paused:true,finished:false,position_knowledge:run.initial.position_knowledge});expect(valid_response({request_id:'sealed-low-link',ok:true,view:sealed})).toBe(true);
    expect(await run.store.read_committed(run.run)).toMatchObject({local_reports:[{kind:'accepted'},{kind:'arrived'}],reports:[{kind:'accepted'}]});
  }finally{await run.store.delete();}
});

test('PG11 a sent terminal payload arriving beyond grace remains immutable in transit and cannot confirm or reopen the sealed window',async()=>{
  const value=await play_variant(v=>{zero_load(v);Reflect.set(v.catalogs.engine_conditions,'report_delivery_delay_ms',12000);}),run=await movement_run('late-grace',value,[[50,150],[150,150]],874000);
  try{
    const sealed=await run.advance(910000);expect(sealed).toMatchObject({status:'window_sealed_unconfirmed',finished:false,paused:true,position_knowledge:run.initial.position_knowledge});
    expect(await run.store.read_committed(run.run)).toMatchObject({activities:[{status:'arrived',terminal_at:900000}],reports:[{kind:'accepted'},{kind:'arrived',observed:{value:900000},reported:{value:900000}}],deliveries:[{received:{value:888000}}],queue:expect.arrayContaining([expect.objectContaining({kind:'receive_report',report_id:'b21-report-2',at:913000})])});
    const restored=await new Game(run.store).restore(run.run,'late-grace-restore');expect(restored.view).toMatchObject({status:'window_sealed_unconfirmed',sim_time:910000,position_knowledge:run.initial.position_knowledge});
  }finally{await run.store.delete();}
});

test('PG10 a later move starts only from the received A fix and retains nine-load record equipment and both packs',async()=>{
  const run=await movement_run('second-move',await play_variant(()=>{}),[[50,150],[150,150]]);
  try{
    const a=await run.advance(31500);if(a.scenario_kind!=='play_corridor')throw Error('Expected corridor');
    expect(a.can_issue).toBe(true);
    const {map_id,map_version,crs_id,geometry_version}=a.geometry,plan=await run.game.preview_plan(run.run,a.revision,2,{actor:'R',map_id,map_version,crs_id,geometry_version,path:[[150,150],[250,150]]});
    expect(plan).toMatchObject({allowed:true,estimated_move_ms:29500});
    await run.game.issue_order({run_id:run.run,operation_id:'second-task',expected_revision:a.revision,intent:{kind:'issue',command_id:'second-task',plan}});
    expect(await run.advance(63000)).toMatchObject({status:'arrived',movement_basis:{load:9},resources:{record_packs:2,record_energy:20,record_wear:100,movement_energy:18,equipment_energy:12,equipment_wear:96},position_knowledge:{scope:{typed_geometry:{position:[250,150]}}}});
  }finally{await run.store.delete();}
});
