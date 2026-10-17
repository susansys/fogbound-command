import {test,expect} from 'vitest';
import {movement_run,play_variant,replace_owned_archive} from './play-fixtures';
import {valid_response} from '../src/dto';
import {Game} from '../src/core/game';

test('PG16 replay between actual commits processes due messages and resources without future knowledge or synthetic writes',async()=>{
  const run=await movement_run('history-due',await play_variant(()=>{}),[[50,150],[150,150]]);
  try{
    await run.advance(40000);const before=await run.store.read_committed(run.run);
    for(const [to,status,x,reports] of [[1500,'queued',50,0],[2000,'accepted',50,1],[30500,'accepted',50,1],[31499,'accepted',50,1],[31500,'arrived',150,2]] as const){
      const history=await run.game.get_replay(run.run,to),view=await history.get_view(run.run);
      expect(view).toMatchObject({sim_time:to,status,can_issue:false,finished:false,position_knowledge:{scope:{typed_geometry:{position:[x,150]}}},received_reports:expect.any(Array)});
      if(view.scenario_kind!=='play_corridor')throw Error('Expected corridor');expect(view.received_reports).toHaveLength(reports);expect(valid_response({request_id:'historical-corridor',ok:true,view})).toBe(true);
      if(to>=31500)expect(view).toMatchObject({resources:{movement_energy:19,equipment_energy:14,equipment_wear:98},position_knowledge:{observed:{value:30500},received:31500}});
      else expect(view.position_knowledge).toEqual(run.initial.position_knowledge);
      const envelope={run_id:run.run,operation_id:'historical-write',expected_revision:view.revision,intent:{kind:'save' as const}};
      await expect(history.save(envelope)).rejects.toThrow('HISTORY_READ_ONLY');await expect(history.control_clock({...envelope,intent:{kind:'continue'}})).rejects.toThrow('HISTORY_READ_ONLY');await expect(history.issue_order({...envelope,intent:{kind:'issue',command_id:'past',plan:run.plan}})).rejects.toThrow('HISTORY_READ_ONLY');
    }
    expect(await run.store.read_committed(run.run)).toEqual(before);expect(await run.game.get_view(run.run)).toMatchObject({sim_time:40000,status:'arrived'});
  }finally{await run.store.delete();}
});

test('PG15 a rehashed schema7 clone cannot replace its real readonly parent with an absent source run',async()=>{
  const run=await movement_run('clone-lineage',await play_variant(()=>{}),[[50,150],[150,150]]);
  try{
    await run.advance(10000);const parent=await run.store.read_committed(run.run),child=await run.game.restart_run(run.run,'clone-lineage');
    expect(child).toMatchObject({source_run:run.run,sim_time:0});expect(child.run_id).not.toBe(run.run);expect(await run.store.is_read_only(run.run)).toBe(true);
    const good=await run.store.read_committed(child.run_id);if(good?.schema!==7||parent?.schema!==7)throw Error('Expected corridor');expect(good.rng).toEqual(parent.rng);
    const bad=structuredClone(good);bad.source_run='absent-parent';await replace_owned_archive(run.store,bad);
    await expect(new Game(run.store).get_view(child.run_id)).rejects.toThrow('INVALID_SAVE');expect(await run.store.read_committed(child.run_id)).toEqual(bad);expect(await run.store.read_committed(run.run)).toEqual(parent);
  }finally{await run.store.delete();}
});

test('PG15 a self-signed clone cannot change the mode locked by its actual source run',async()=>{
  const run=await movement_run('clone-mode',await play_variant(()=>{}),[[50,150],[150,150]]);
  try{
    const child=await run.game.restart_run(run.run,'clone-mode'),good=await run.store.read_committed(child.run_id);if(good?.schema!==7)throw Error('Expected corridor');
    const bad=structuredClone(good);bad.mode='command';bad.paused=false;await replace_owned_archive(run.store,bad);
    await expect(new Game(run.store).get_view(child.run_id)).rejects.toThrow('INVALID_SAVE');expect(await run.store.read_committed(child.run_id)).toEqual(bad);
  }finally{await run.store.delete();}
});

test('PG15 moving command save restores the newer current snapshot paused, fences the old writer and continues one original activity',async()=>{
  const run=await movement_run('restore-active',await play_variant(()=>{}),[[50,150],[150,150]],0,'command');
  try{
    const at10000=await run.advance(10000),saved=await run.game.save({run_id:run.run,operation_id:'manual-moving-save',expected_revision:at10000.revision,intent:{kind:'save'}});
    await run.advance(11000);const before=await run.store.read_committed(run.run);if(before?.schema!==7)throw Error('Expected corridor');expect(before.revision).toBeGreaterThan(saved.receipt.revision);
    const recovered=new Game(run.store),restored=await recovered.restore(run.run,'takeover-active');
    expect(restored.receipt).toMatchObject({snapshot_revision:before.revision,revision:before.revision+1,sim_time:11000});
    const after=await run.store.read_committed(run.run);if(after?.schema!==7)throw Error('Expected corridor');
    for(const key of ['run_id','mode','rate','sim_time','rng','generation','phase','world','known','activities','queue','reports','deliveries','transmissions','requests'] as const)expect(after[key]).toEqual(before[key]);expect(after.paused).toBe(true);
    await expect(recovered.tick(run.run,12000,'tick-paused')).rejects.toThrow('CLOCK_PAUSED');
    await expect(run.game.control_clock({run_id:run.run,operation_id:'stale-original',expected_revision:after.revision,intent:{kind:'continue'}})).rejects.toThrow('STALE_WRITER');
    const continued=await recovered.control_clock({run_id:run.run,operation_id:'explicit-continue',expected_revision:after.revision,intent:{kind:'continue'}});
    const finished=await recovered.tick(run.run,31500,'finish-original');expect(finished.view).toMatchObject({run_id:run.run,status:'arrived',finished:false,resources:{movement_energy:19,movement_energy_reserved:0,equipment_energy:14,equipment_wear:98}});
    const final=await run.store.read_committed(run.run);expect(final).toMatchObject({activities:[{settled:true,terminal_at:30500}],reports:[{kind:'accepted'},{kind:'arrived'}],deliveries:[{received:{value:2000}},{received:{value:31500}}],rng:before.rng});
    expect(continued.receipt.kind).toBe('continue');expect((await recovered.tick(run.run,31500,'finish-original')).receipt).toEqual(finished.receipt);
  }finally{await run.store.delete();}
});

test('PG14 forged and stale public Plans reject atomically before any task, queue or resource write',async()=>{
  const run=await movement_run('forged-origin',await play_variant(()=>{}),[[50,150],[150,150]]);
  try{
    // A separate fresh owned run supplies a genuine unsigned public proposal.
    const initial=await run.game.create_run(await play_variant(()=>{}),'research','create-forged-fresh');if(initial.scenario_kind!=='play_corridor')throw Error('Expected corridor');
    const {map_id,map_version,crs_id,geometry_version}=initial.geometry,plan=await run.game.preview_plan(initial.run_id,1,1,{actor:'R',map_id,map_version,crs_id,geometry_version,path:[[50,150],[150,150]]});
    if(!('kind' in plan)||plan.kind!=='corridor_move')throw Error('Expected corridor plan');
    const before=await run.store.read_committed(initial.run_id);
    for(const [index,change] of [
      (p:typeof plan)=>{p.path[1]=[160,150];},
      (p:typeof plan)=>{p.estimated_move_ms=29999;p.estimate_kind='known';p.estimate_range={min_ms:29999,max_ms:29999,basis:'registered_rule_time'};},
      (p:typeof plan)=>{p.path_digest='f'.repeat(64);},
      (p:typeof plan)=>{p.rules_hash='f'.repeat(64);},
      (p:typeof plan)=>{p.capability_ref='unqualified-speed';},
      (p:typeof plan)=>{p.run_id='different-run';}
    ].entries()){
      const forged=structuredClone(plan);change(forged);const operation_id='forged-'+index;
      await expect(run.game.issue_order({run_id:initial.run_id,operation_id,expected_revision:1,intent:{kind:'issue',command_id:operation_id,plan:forged}})).rejects.toThrow('STALE_PLAN');
      expect(await run.store.read_committed(initial.run_id)).toEqual(before);expect(await run.store.receipt(initial.run_id,operation_id)).toBeUndefined();
    }
    await run.game.save({run_id:initial.run_id,operation_id:'invalidate-original',expected_revision:1,intent:{kind:'save'}});
    const stale={run_id:initial.run_id,operation_id:'stale-plan',expected_revision:2,intent:{kind:'issue' as const,command_id:'stale-plan',plan}};
    await expect(run.game.issue_order(stale)).rejects.toThrow('STALE_PLAN');await expect(run.game.issue_order({...stale,expected_revision:1})).rejects.toThrow('STALE_REVISION');
    expect(await run.store.read_committed(initial.run_id)).toMatchObject({requests:[],activities:[],reports:[]});
  }finally{await run.store.delete();}
});

test('PG14 strict received-report DTO refuses cross-kind null identities, new positions in acceptance and unmatched delivery references',async()=>{
  const run=await movement_run('strict-report-dto',await play_variant(()=>{}),[[50,150],[150,150]]);
  try{
    const delivered=await run.advance(31500);if(delivered.scenario_kind!=='play_corridor')throw Error('Expected corridor');expect(valid_response({request_id:'report-good',ok:true,view:delivered})).toBe(true);
    for(const change of [
      (v:typeof delivered)=>{v.received_reports[1].report.command_id=null;},
      (v:typeof delivered)=>{v.received_reports[1].report.activity_id=null;},
      (v:typeof delivered)=>{v.received_reports[0].report.position_scope=structuredClone(v.received_reports[1].report.position_scope);},
      (v:typeof delivered)=>{v.received_reports[1].delivery.report_id='different-original';}
    ]){const bad=structuredClone(delivered);change(bad);expect(valid_response({request_id:'bad-report-shape',ok:true,view:bad})).toBe(false);}
  }finally{await run.store.delete();}
});

test('PG15 repeated committed reads keep their view and still reject rehashed corruption on the same live Game',async()=>{
  const run=await movement_run('repeated-read-integrity',await play_variant(()=>{}),[[50,150],[150,150]],0,'command');
  try{
    const stepping=performance.now();for(let i=1;i<=120;i++)await run.advance(i*1000);const step_ms=performance.now()-stepping;
    const good=await run.game.get_view(run.run),reading=performance.now();for(let i=0;i<10;i++)expect(await run.game.get_view(run.run)).toEqual(good);
    console.info(JSON.stringify({owned_observation:'120 clock commits then10 exact repeated public views',step_ms,read_ms:performance.now()-reading,gate:'No new timing threshold; functional integrity assertions only'}));
    const before=await run.store.read_committed(run.run);if(before?.schema!==7)throw Error('Expected corridor');
    for(const change of [
      (bad:typeof before)=>{bad.world.position.x.n='999';},
      (bad:typeof before)=>{Object.assign(bad,{extra:undefined});},
    ]){
      const bad=structuredClone(before);change(bad);await replace_owned_archive(run.store,bad);
      await expect(run.game.get_view(run.run)).rejects.toThrow('INVALID_SAVE');expect(await run.store.read_committed(run.run)).toEqual(bad);
    }
  }finally{await run.store.delete();}
},30000);

test('PG16 same-time committed nodes remain distinct and every history write leaves the source unchanged',async()=>{
  const run=await movement_run('same-time-history',await play_variant(()=>{}),[[50,150],[150,150]]);
  try{
    const issued=await run.game.get_view(run.run);await run.game.save({run_id:run.run,operation_id:'same-time-save',expected_revision:issued.revision,intent:{kind:'save'}});const before=await run.store.read_committed(run.run);
    const selected=await run.game.get_replay(run.run,0),latest=await selected.get_view(run.run);expect(latest.revision).toBe(3);expect(latest.sim_time).toBe(0);
    const initial=await (await run.game.get_replay(run.run,0,1)).get_view(run.run),issueNode=await (await run.game.get_replay(run.run,0,2)).get_view(run.run);expect(Reflect.get(initial,'issued_orders')).toHaveLength(0);expect(Reflect.get(issueNode,'issued_orders')).toHaveLength(1);expect(issueNode.revision).toBe(2);
    for(const intent of [{kind:'save' as const},{kind:'continue' as const},{kind:'advance' as const,to:31500},{kind:'issue' as const,command_id:'history-command',plan:run.plan}]){
      const envelope={run_id:run.run,operation_id:'history-'+intent.kind,expected_revision:latest.revision,intent};
      await expect(intent.kind==='save'?selected.save(envelope):intent.kind==='issue'?selected.issue_order(envelope):selected.control_clock(envelope)).rejects.toThrow('HISTORY_READ_ONLY');
    }
    expect(await run.store.read_committed(run.run)).toEqual(before);expect(await run.game.get_view(run.run)).toMatchObject({revision:3,sim_time:0});
  }finally{await run.store.delete();}
});
