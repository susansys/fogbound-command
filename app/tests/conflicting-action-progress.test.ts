import {test,expect} from 'vitest';
import {Game} from '../src/core/game';import {Persistence} from '../src/core/persistence';
import {conflicting_action_definition} from '../src/core/conflicting-action-definition';
import type {ConflictingActionPlayerView} from '../src/conflicting-action-contracts';
import {action_events,action_progress,action_baseline,action_request_result,type CurrentAction,type ActionRequest} from '../src/conflicting-action-progress';

async function fixture(){const store=new Persistence('b32-owned-progress-'+crypto.randomUUID()),game=new Game(store);let n=0,view=await game.create_run(conflicting_action_definition,'research','create') as ConflictingActionPlayerView;
const advance=async(to:number)=>{view=(await game.control_clock({run_id:view.run_id,operation_id:'progress-clock-'+(++n),expected_revision:view.revision,intent:{kind:'advance',to}})).view as ConflictingActionPlayerView;};
return {store,game,get view(){return view;},advance,async issue(id:string){const envelope={run_id:view.run_id,operation_id:'progress-issue-'+(++n),expected_revision:view.revision,intent:view.field_options.find(o=>o.intent.activity_ref.id===id)!.intent};const r=await game.apply_outcome_intent(envelope);view=r.view as ConflictingActionPlayerView;return {envelope,...r};}};}
const work=(actor:string,activity:string|null=null):CurrentAction=>({actor,activity,order:null,refs:[],epoch:0});

test('E13/E14 real issued and delivered accepted survive an unrelated request unknown, with no locally completed diagnosis',async()=>{
const f=await fixture();try{await f.advance(240000);const r=await f.issue('W-inspect'),w={...work('W','W-inspect'),order:f.view.field_activities.at(-1)!.ref};
expect(action_progress(f.view,w).text).toBe('已签发，等待接令回报');expect(action_events(f.view,w)).toEqual([]);
await f.advance(242000);expect(action_progress(f.view,w)).toEqual({text:'已收到接令回报，等待后续',received:242000});expect(action_events(f.view,w)).toHaveLength(1);
const req:ActionRequest={run_id:f.view.run_id,operation_id:'second-operation',label:'保存工作研判',status:'submitting'};
expect(action_request_result(req,{request_id:'unknown',ok:false,code:'STORAGE_UNCONFIRMED'}).status).toBe('unknown');expect(action_progress(f.view,w).received).toBe(242000);
await f.advance(256999);expect(action_progress(f.view,w).text).toBe('已收到接令回报，等待后续');expect(action_events(f.view,w)).toHaveLength(1);
await f.advance(257000);expect(action_progress(f.view,w)).toEqual({text:'检查结果已收到：故障',received:257000});expect(action_events(f.view,w)).toHaveLength(2);
expect(action_request_result({...req,operation_id:r.envelope.operation_id},{request_id:'real',ok:true,receipt:r.receipt,view:r.view}).status).toBe('registered');
}finally{await f.store.delete();}});

test('E13 receipt identity and explicit rejection determine request status, never a view alone',()=>{
const r:ActionRequest={run_id:'run',operation_id:'op',label:'检查B点',status:'submitting'};
expect(action_request_result(r,{request_id:'r',ok:true}).status).toBe('unknown');
expect(action_request_result(r,{request_id:'r',ok:false,code:'STALE_REVISION'})).toMatchObject({status:'rejected',code:'STALE_REVISION'});
expect(action_request_result(r,{request_id:'r',ok:false,code:'CHANNEL_UNCERTAIN'}).status).toBe('unknown');
});

test('E14/E16 only a new stable event changes the current baseline; ticks, repeats, history and explicit context switches do not',()=>{
const a={key:'delivery:a:v1',received:100,text:'接令'},b={key:'delivery:b:v1',received:200,text:'完成'};
let state=action_baseline(null,'run:W',[a],false);expect(state.pending).toEqual([]);
state=action_baseline(state,'run:W',[a],false);expect(state.pending).toEqual([]);
state=action_baseline(state,'run:W',[a,b],false);expect(state.pending).toEqual([b]);
state=action_baseline({...state,pending:[]},'run:W',[a,b],false);expect(state.pending).toEqual([]);
expect(action_baseline(state,'run:R',[a,b],false).pending).toEqual([]);
state=action_baseline(state,'history:run:W',[a],true);expect(state.pending).toEqual([]);
expect(action_baseline(state,'run:W',[a,b],false).pending).toEqual([]);
expect(action_baseline(state,'run:W:changed-ref',[a,b],false).pending).toEqual([]);
});

test('E14/E16 explicit report references admit only their legally delivered originals and lineage, never unrelated actor receipts',async()=>{
const f=await fixture();try{await f.advance(22000);const refs=[{run_id:f.view.run_id,kind:'facility_report',id:'FC1',version:1}],w={...work('W'),refs};
expect(action_events(f.view,w).map(e=>e.text)).toEqual(['设施原文 FC1 已收到，仍未核实']);
await f.issue('R-to-A');await f.advance(32000);expect(action_events(f.view,w)).toHaveLength(1);
const r={...work('R'),refs:[{run_id:f.view.run_id,kind:'report',id:'R1',version:1}]};
const before=action_events(f.view,r);await f.advance(80000);const after=action_events(f.view,r);expect(after.length).toBeGreaterThan(before.length);expect(after.some(e=>e.text.includes('来源关系凭证'))).toBe(true);
expect(action_events(f.view,{...w,refs:[{...refs[0],run_id:'other-run'}]})).toEqual([]);
}finally{await f.store.delete();}});
