import {expect,test} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {settle_collection_outcome} from '../src/core/knowledge-collection-outcome';
import {valid_response} from '../src/dto';

async function normalCase(checkpoint:number|null,inspect:(store:Persistence,run:string)=>Promise<void>){
  const store=new Persistence('ka-owned-stage-recovery-'+crypto.randomUUID());let game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1},case_ref:'KA-NORMAL-01'},'research','create');
    const ref=(kind:string,id:string)=>({run_id:view.run_id,kind,id,version:1});
    const at=async(to:number)=>{view=(await game.control_clock({run_id:view.run_id,operation_id:'at-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
    const apply=async(operation_id:string,intent:unknown)=>{view=(await game.apply_collection_intent({run_id:view.run_id,operation_id,expected_revision:view.revision,intent})).view;};
    const collect=(actor:'R'|'W')=>apply('collect-'+actor,{kind:'request_collection',actor,question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope',actor==='R'?'B-LIMITED':'B-QUALIFIED'),method_ref:ref('method',actor==='R'?'limited-text-collection':'qualified-facility-inspection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-'+actor)],collection_window:actor==='R'?{from:1000,to:31000}:{from:60000,to:91000},needed_by:900000});
    const steps=[{at:0,run:()=>collect('R')},{at:32000,run:()=>apply('return-R',{kind:'return_to_headquarters',actor:'R',authority_ref:ref('authority','KA-INITIAL')})},{at:59000,run:()=>collect('W')},{at:93000,run:()=>apply('return-W',{kind:'return_to_headquarters',actor:'W',authority_ref:ref('authority','KA-INITIAL')})}];
    let recovered=false;
    const recover=async()=>{
      await at(checkpoint!);
      view=(await game.save({run_id:view.run_id,operation_id:'save-stage',expected_revision:view.revision,intent:{kind:'save'}})).view;
      const before=await store.read_committed(view.run_id);if(before?.schema!==14)throw Error('Wrong state');
      const moduleURL=new URL('../verification/native-knowledge-collection-recovery.mjs',import.meta.url).href;
      const {assertRecoveryStage}=await import(/* @vite-ignore */moduleURL);
      const stages:Record<number,string>={10000:'collecting',30500:'registering',100000:'returning',260000:'H-receiving',280000:'INTEL-verifying',297000:'R-verification-report-in-flight',344000:'W-handover-report-in-flight',365000:'W-verification-report-in-flight'};
      const stage=stages[checkpoint!];assertRecoveryStage(stage,before,view);
      const wrong=structuredClone(before);
      if(checkpoint===10000||checkpoint===30500)wrong.requests.find(task=>task.intent.actor==='R')!.status='completed';
      else if(checkpoint===100000)wrong.returns.find(task=>task.intent.actor==='R')!.stage='arrived';
      else if(checkpoint===260000)wrong.handovers.find(task=>task.actor==='R')!.status='completed';
      else if(checkpoint===280000)wrong.intel.jobs.find(job=>job.status==='processing')!.status='completed';
      else wrong.source_messages.find(message=>message.status==='sending')!.status='delivered';
      expect(()=>assertRecoveryStage(stage,wrong,view)).toThrow();
      game=new Game(new Persistence(store.name));view=(await game.restore(view.run_id,'restore-stage')).view;
      const after=await store.read_committed(view.run_id);if(after?.schema!==14)throw Error('Wrong state');
      assertRecoveryStage(stage,after,view);
      for(const key of ['sim_time','actors','records','H_inventory','H_receiver','handovers','intel','verification_jobs','verifications','source_messages','commands','returns','requests','observations','reports','deliveries','process_reports','process_deliveries','schedule','result','termination'] as const)expect(after[key]).toEqual(before[key]);
      recovered=true;
    };
    for(const step of steps){if(checkpoint!==null&&!recovered&&checkpoint<step.at)await recover();if(step.at>view.sim_time)await at(step.at);await step.run();}
    if(checkpoint!==null&&!recovered)await recover();
    await at(1222000);expect(view).toMatchObject({finished:true,sim_time:365429,result:{outcome:'success',safe_people:6}});
    await inspect(store,view.run_id);
  }finally{await store.delete();}
}

test.each([10000,30500,100000,260000,280000,297000,344000,365000])('KA-E30 fake-IDB mechanism: reopen at%s preserves real stage/tickets/custody/messages and resumes without repeated work',async checkpoint=>{
  await normalCase(checkpoint,async(store,run)=>{
    const state=await store.read_committed(run);if(state?.schema!==14)throw Error('Wrong state');
    expect(state.actors.R.energy_used_uj).toBe(790858000);expect(state.actors.W.energy_used_uj).toBe(204214500);
    expect(state.H_inventory.mass_kg).toBe(.02);expect(state.records.every(record=>record.holder==='H'&&record.custody.length===2)).toBe(true);
    expect(state.intel.jobs.map(job=>({ticket:job.ticket,used:job.used_ms}))).toEqual([{ticket:1,used:20000},{ticket:2,used:20000}]);
    expect((await new Game(new Persistence(store.name)).get_view(run))).toMatchObject({finished:true,sim_time:365429,result:state.result});
  });
});

test('KA-E27 receipt-grace policy seam accepts910000 exactly and excludes910001; this is not a late-transport production trajectory',async()=>{
  await normalCase(null,async(store,run)=>{
    const original=await store.read_committed(run);if(original?.schema!==14)throw Error('Wrong state');
    const report=original.process_reports.find(report=>report.method==='INTEL-record-verification'&&report.body.actor==='W')!;
    for(const delta of [-1,0,1]){
      // Isolated policy input: the actual finite profile has no natural nine-second
      // INTEL sender backlog. Never persist this vector or label it a Game chain.
      const candidate=structuredClone(original);candidate.result=null;candidate.finished=false;candidate.ended=false;candidate.status='ready';candidate.sim_time=910000+delta;
      candidate.process_deliveries.find(delivery=>delivery.report_ref.id===report.ref.id)!.received_at=candidate.sim_time;
      settle_collection_outcome(candidate);
      if(delta<=0)expect(candidate.result).toMatchObject({outcome:'success',known_at:910000+delta});else expect(candidate.result).toBeNull();
    }
    expect(await store.read_committed(run)).toEqual(original);
  });
});

test('KA-E29 command clock reaches the new cleanup horizon, pauses explicitly and reopens without wall-time catchup',async()=>{
  const store=new Persistence('ka-owned-command-cleanup-'+crypto.randomUUID());let game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}},'command','create');
    view=(await game.tick(view.run_id,910000,'tick910')).view;
    expect(view).toMatchObject({sim_time:910000,paused:false,finished:false,status:'terminating'});
    view=(await game.control_clock({run_id:view.run_id,operation_id:'hidden',expected_revision:view.revision,intent:{kind:'pause',reason:'application_hidden'}},911000)).view;
    expect(view).toMatchObject({sim_time:911000,paused:true});
    await expect(game.tick(view.run_id,912000,'paused-tick')).rejects.toThrow('CLOCK_PAUSED');
    game=new Game(new Persistence(store.name));view=(await game.restore(view.run_id,'reopen')).view;
    expect(view).toMatchObject({sim_time:911000,paused:true,status:'terminating'});
    view=(await game.control_clock({run_id:view.run_id,operation_id:'resume',expected_revision:view.revision,intent:{kind:'continue'}})).view;
    const final=await game.tick(view.run_id,1222000,'finish-cleanup');view=final.view;
    expect(view).toMatchObject({sim_time:1120648,finished:true,result:{outcome:'failure',safe_people:6}});
    expect(valid_response({request_id:'command-cleanup',ok:true,...final})).toBe(true);
    const repeated=await game.tick(view.run_id,1222000,'finish-cleanup');expect(repeated.receipt).toEqual(final.receipt);expect(repeated.view).toEqual(view);
  }finally{await store.delete();}
});

test('KA-E30 native budget seam rejects suspended IDB/request promises, enters finally, and never starts work after its deadline',async()=>{
  const moduleURL=new URL('../verification/native-knowledge-collection-recovery.mjs',import.meta.url).href;
  const {withinNativeDeadline}=await import(/* @vite-ignore */moduleURL);
  let enteredFinally=false,started=false;
  await expect((async()=>{try{await withinNativeDeadline('suspended-IDB',()=>new Promise(()=>{}),Date.now()+20);}finally{enteredFinally=true;}})()).rejects.toThrow('KA_NATIVE_OPERATION_TIMEOUT:suspended-IDB');
  expect(enteredFinally).toBe(true);
  await expect(withinNativeDeadline('already-expired',()=>{started=true;},Date.now()-1)).rejects.toThrow('KA_NATIVE_OPERATION_TIMEOUT:already-expired');
  expect(started).toBe(false);
});
