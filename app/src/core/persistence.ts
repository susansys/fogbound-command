import Dexie, { type Table } from "dexie";
import type { StoredState as State } from "./state";
import { GameError } from "../contracts";
import {state_hash,validate_state,canonical} from './snapshot';
import {hash} from './scenario';
import type {PlayDefinition} from './scenario';
import type {MissionDefinition} from './mission-definition';
import type {IntelligenceDefinition} from './intelligence-definition';
import {outcome_definition_for_package} from './outcome-definition';
import {create_outcome_debrief_anchor} from './outcome-debrief';
class Database extends Dexie {
  runs!: Table<State, string>;
  snapshots!: Table<{ key: string; run_id: string; state: State }, string>;
  operations!: Table<
    {
      key: string;
      run_id: string;
      operation_id: string;
      fingerprint: string;
      revision: number;
      sim_time: number;
    },
    string
  >;
  metadata!: Table<{ key: string; value: number; inference?:{request_digest:string;request:import('../outcome-contracts').OutcomeInferenceRequest;note:import('../outcome-contracts').OutcomeInferenceNote}; debrief_template?:import('../outcome-contracts').OutcomeParticipantTemplate; debrief_transition?:{request_digest:string;session:import('../outcome-contracts').OutcomeDebriefSession}; debrief_anchor?:import('./outcome-debrief').OutcomeStoredDebriefAnchor; rejection?:import('../outcome-contracts').OutcomeRejectedDecision; debrief?:import('../outcome-contracts').OutcomeDebriefSession; truth_grant?:import('../outcome-contracts').OutcomeTruthGrant; fairness?:import('../outcome-contracts').OutcomeFairness; exposure?:{definition_hash:string;source:import('../outcome-contracts').OutcomeExposureSource} }, string>;
  constructor(name: string) {
    super(name);
    this.version(4).stores({
      runs: "run_id",
      snapshots: "key,run_id",
      operations: "key,run_id",
      metadata: "key",
    });
  }
}
export class Persistence {
  private db: Database;
  readonly play_definitions:readonly PlayDefinition[];
  readonly mission_definitions:readonly MissionDefinition[];
  readonly intelligence_definitions:readonly IntelligenceDefinition[];
  readonly outcome_definitions:readonly import('./outcome-definition').OutcomeDefinition[];
  constructor(readonly name: string,registeredPlayDefinitions:readonly PlayDefinition[]=[],registeredMissionDefinitions:readonly MissionDefinition[]=[],registeredIntelligenceDefinitions:readonly IntelligenceDefinition[]=[],registeredOutcomeDefinitions:readonly import('./outcome-definition').OutcomeDefinition[]=[]) {
    // Constructor injection is the owned registration seam. Worker uses defaults;
    // no request or production import endpoint can supply these definitions.
    this.outcome_definitions=structuredClone(registeredOutcomeDefinitions);
    this.play_definitions=structuredClone(registeredPlayDefinitions);
    this.mission_definitions=structuredClone(registeredMissionDefinitions);
    this.intelligence_definitions=structuredClone(registeredIntelligenceDefinitions);
    this.db = new Database(name);
  }
  async claim_writer(): Promise<number> {
    return this.db.transaction("rw", this.db.metadata, async () => {
      const next = ((await this.db.metadata.get("writer"))?.value ?? 0) + 1;
      await this.db.metadata.put({ key: "writer", value: next });
      return next;
    });
  }
  async commit_batch(
    state: State,
    epoch: number,
    expected: number | null,
    operation_id: string,
    fingerprint: string,
  ): Promise<void> {
    state.integrity=await state_hash(state);
    const anchor=state.schema===10&&state.finished?create_outcome_debrief_anchor(state,outcome_definition_for_package(state.definition_hash,this.outcome_definitions)):null;
    await this.db.transaction(
      "rw",
      [this.db.runs, this.db.snapshots, this.db.operations, this.db.metadata],
      async () => {
        if ((await this.db.metadata.get("writer"))?.value !== epoch)
          throw new GameError("STALE_WRITER");
        const old = await this.db.runs.get(state.run_id);
        if(await this.db.metadata.get(`readonly:${state.run_id}`))throw new GameError('HISTORY_READ_ONLY');
        if ((old?.revision ?? null) !== expected)
          throw new GameError("STALE_REVISION");
        if(anchor&&!old?.finished){
          const key='outcome-debrief-anchor:'+state.run_id;
          if(await this.db.metadata.get(key))throw new GameError('INVALID_SAVE');
          await this.db.metadata.put({key,value:1,debrief_anchor:anchor});
        }
        if (
          expected === null &&
          (await this.db.operations.get(`create:${operation_id}`))
        )
          throw new GameError("OPERATION_CONFLICT");
        await this.db.runs.put(structuredClone(state));
        await this.db.snapshots.put({
          key: `${state.run_id}:${state.revision}`,
          run_id: state.run_id,
          state: structuredClone(state),
        });
        await this.db.operations.put({
          key: `${state.run_id}:${operation_id}`,
          run_id: state.run_id,
          operation_id,
          fingerprint,
          revision: state.revision,
          sim_time: state.sim_time,
        });
        if (expected === null) {
          if(state.schema===10){
            const sources:import('../outcome-contracts').OutcomeExposureSource[]=[];
            const exposed=await this.db.metadata.where('key').startsWith('outcome-exposure:').toArray();
            for(const row of exposed){
              if(!row.exposure||row.value!==1)throw new GameError('INVALID_SAVE');
              if(row.exposure.definition_hash!==state.definition_hash)continue;
              await this.validate_exposure_source(row.exposure.source,state.definition_hash);
              sources.push(structuredClone(row.exposure.source));
            }
            sources.sort((a,b)=>a.run_id.localeCompare(b.run_id)||a.operation_id.localeCompare(b.operation_id));
            await this.db.metadata.put({key:'outcome-fairness:'+state.run_id,value:1,fairness:{run_id:state.run_id,definition_hash:state.definition_hash,truth_exposure:sources.length>0,sources}});
          }
          await this.db.operations.put({
            key: `create:${operation_id}`,
            run_id: state.run_id,
            operation_id,
            fingerprint,
            revision: state.revision,
            sim_time: state.sim_time,
          });
          const created=((await this.db.metadata.get('creation-counter'))?.value??0)+1;
          await this.db.metadata.put({key:'creation-counter',value:created});
          await this.db.metadata.put({key:`created:${state.run_id}`,value:created});
        }
        if(expected===null&&state.source_run!==null){
          const source=await this.db.runs.get(state.source_run);
          if(!source||await this.db.metadata.get(`readonly:${state.source_run}`))throw new GameError('HISTORY_READ_ONLY');
          await this.db.metadata.put({key:`readonly:${state.source_run}`,value:1});
        }
      },
    );
  }
  async read_committed(run: string): Promise<State | undefined> {
    return this.db.runs.get(run);
  }
  async is_read_only(run:string){return !!await this.db.metadata.get(`readonly:${run}`);}
  async receipt(run: string, operation: string) {
    return this.db.operations.get(`${run}:${operation}`);
  }
  async creation(operation: string) {
    return this.db.operations.get(`create:${operation}`);
  }
  async snapshot(run: string, revision: number) {
    return (await this.db.snapshots.get(`${run}:${revision}`))?.state;
  }
  async record_outcome_rejection(draft:Omit<import('../outcome-contracts').OutcomeRejectedDecision,'ref'|'attempt_seq'>,epoch:number){
    return this.db.transaction('rw',[this.db.metadata,this.db.runs],async()=>{
      if((await this.db.metadata.get('writer'))?.value!==epoch)throw new GameError('STALE_WRITER');
      const current=await this.db.runs.get(draft.request.run_id);if(current?.schema!==10||current.finished||current.revision!==draft.source_revision||current.integrity!==draft.source_digest)throw new GameError('STALE_REVISION');
      const key='outcome-rejection:'+current.run_id+':'+await Dexie.waitFor(hash(canonical({request_digest:draft.request_digest,source_digest:draft.source_digest,code:draft.code}))),prior=await this.db.metadata.get(key);
      if(prior){if(prior.value!==1||!prior.rejection)throw new GameError('INVALID_SAVE');return structuredClone(prior.rejection);}
      const counter='outcome-rejection-sequence:'+current.run_id,attempt_seq=((await this.db.metadata.get(counter))?.value??0)+1,body={...draft,attempt_seq};
      const rejection:import('../outcome-contracts').OutcomeRejectedDecision={...body,ref:{run_id:current.run_id,kind:'rejected_decision',id:'REJECT-'+await Dexie.waitFor(hash(canonical(body))),version:1}};
      await this.db.metadata.put({key:counter,value:attempt_seq});await this.db.metadata.put({key,value:1,rejection});return structuredClone(rejection);
    });
  }
  async outcome_rejections(run_id:string){
    const rows=await this.db.metadata.where('key').startsWith('outcome-rejection:'+run_id+':').toArray();
    if(rows.some(row=>row.value!==1||!row.rejection))throw new GameError('INVALID_SAVE');return rows.map(row=>structuredClone(row.rejection!)).sort((a,b)=>a.attempt_seq-b.attempt_seq);
  }
  async outcome_debrief_anchor(run_id:string){
    const row=await this.db.metadata.get('outcome-debrief-anchor:'+run_id);
    if(!row)return null;if(row.value!==1||!row.debrief_anchor)throw new GameError('INVALID_SAVE');return structuredClone(row.debrief_anchor);
  }
  async initialize_legacy_debrief_anchor(anchor:import('./outcome-debrief').OutcomeStoredDebriefAnchor,epoch:number){
    return this.db.transaction('rw',[this.db.metadata,this.db.runs,this.db.snapshots],async()=>{
      if((await this.db.metadata.get('writer'))?.value!==epoch)throw new GameError('STALE_WRITER');
      const state=await this.db.runs.get(anchor.run_id),sealed=(await this.db.snapshots.get(anchor.run_id+':'+anchor.finished_seq))?.state;
      if(state?.schema!==10||!state.finished||sealed?.schema!==10||!sealed.finished||sealed.integrity!==anchor.run_digest||anchor.origin!=='legacy_explicit_open'||anchor.evaluation_profile_ref!==null)throw new GameError('INVALID_SAVE');
      const key='outcome-debrief-anchor:'+anchor.run_id,prior=await this.db.metadata.get(key);
      if(!prior)await this.db.metadata.put({key,value:1,debrief_anchor:structuredClone(anchor)});
    });
  }
  async ensure_outcome_debrief(session:import('../outcome-contracts').OutcomeDebriefSession,template:import('../outcome-contracts').OutcomeParticipantTemplate,epoch:number){
    // Reuse the existing metadata store/version. This transaction never writes
    // runs, snapshots or operations, including when the source run is read-only.
    return this.db.transaction('rw',[this.db.metadata,this.db.runs,this.db.snapshots],async()=>{
      if((await this.db.metadata.get('writer'))?.value!==epoch)throw new GameError('STALE_WRITER');
      const state=await this.db.runs.get(session.run_id);
      const sealed=(await this.db.snapshots.get(session.run_id+':'+session.finished_seq))?.state;
      if(state?.schema!==10||!state.finished||sealed?.schema!==10||!sealed.finished||sealed.integrity!==session.run_digest)throw new GameError('DEBRIEF_NOT_AVAILABLE');
      const anchorKey='outcome-debrief-anchor:'+session.run_id,anchorRow=await this.db.metadata.get(anchorKey),anchor=anchorRow?.debrief_anchor;
      if(anchorRow?.value!==1||!anchor||anchor.run_digest!==session.run_digest||anchor.finished_seq!==session.finished_seq||anchor.template_version!==session.template_version)throw new GameError('INVALID_SAVE');
      const key='outcome-debrief:'+session.run_id,prior=await this.db.metadata.get(key);
      if(prior){if(prior.value!==1||!prior.debrief||!prior.debrief_template||JSON.stringify(canonical(prior.debrief_template))!==JSON.stringify(canonical(template))||!Number.isSafeInteger(prior.debrief.metadata_revision)||prior.debrief.metadata_revision<1||typeof prior.debrief.truth_exposure!=='boolean'||JSON.stringify({...prior.debrief,status:'ready',lifecycle_revision:1,metadata_revision:1,truth_exposure:false})!==JSON.stringify(session))throw new GameError('INVALID_SAVE');if(prior.debrief.status!==anchor.status||prior.debrief.lifecycle_revision!==anchor.lifecycle_revision)throw new GameError('INVALID_SAVE');return structuredClone(prior.debrief);}
      if(anchor.status!=='created'||anchor.lifecycle_revision!==0)throw new GameError('INVALID_SAVE');
      await this.db.metadata.put({key,value:1,debrief:structuredClone(session),debrief_template:structuredClone(template)});
      await this.db.metadata.put({...anchorRow!,debrief_anchor:{...anchor,status:'ready',lifecycle_revision:1}});
      return structuredClone(session);
    });
  }
  async outcome_debrief_template(run_id:string){
    const row=await this.db.metadata.get('outcome-debrief:'+run_id);if(row?.value!==1||!row.debrief_template)throw new GameError('INVALID_SAVE');return structuredClone(row.debrief_template);
  }
  async transition_outcome_debrief(request:import('../outcome-contracts').OutcomeDebriefTransition,request_digest:string,epoch:number){
    return this.db.transaction('rw',[this.db.metadata,this.db.runs,this.db.snapshots],async()=>{
      if((await this.db.metadata.get('writer'))?.value!==epoch)throw new GameError('STALE_WRITER');
      const key='outcome-debrief-transition:'+request.run_id+':'+request.operation_id,receipt=await this.db.metadata.get(key);
      if(receipt){if(receipt.value!==1||!receipt.debrief_transition)throw new GameError('INVALID_SAVE');if(receipt.debrief_transition.request_digest!==request_digest)throw new GameError('OPERATION_ID_REUSED');return structuredClone(receipt.debrief_transition.session);}
      const anchorKey='outcome-debrief-anchor:'+request.run_id,anchorRow=await this.db.metadata.get(anchorKey),anchor=anchorRow?.debrief_anchor;
      const sessionKey='outcome-debrief:'+request.run_id,sessionRow=await this.db.metadata.get(sessionKey),session=sessionRow?.debrief;
      const sealed=(await this.db.snapshots.get(request.run_id+':'+request.finished_seq))?.state,current=await this.db.runs.get(request.run_id);
      if(!anchor||!session||anchorRow?.value!==1||sessionRow?.value!==1||sealed?.schema!==10||!sealed.finished||sealed.integrity!==request.run_digest||current?.schema!==10||!current.finished||session.run_digest!==request.run_digest||session.finished_seq!==request.finished_seq||anchor.run_digest!==request.run_digest||anchor.finished_seq!==request.finished_seq)throw new GameError('DEBRIEF_QUERY_REJECTED');
      if(anchor.lifecycle_revision!==request.expected_lifecycle_revision||session.lifecycle_revision!==anchor.lifecycle_revision||session.status!==anchor.status)throw new GameError('OBJECT_VERSION_CONFLICT');
      if(!(request.status==='viewing'&&(anchor.status==='ready'||anchor.status==='archived')||request.status==='archived'&&anchor.status==='viewing'))throw new GameError('INVALID_REQUEST');
      const lifecycle_revision=anchor.lifecycle_revision+1,next={...session,status:request.status,lifecycle_revision};
      await this.db.metadata.put({...anchorRow!,debrief_anchor:{...anchor,status:request.status,lifecycle_revision}});
      await this.db.metadata.put({...sessionRow!,debrief:next});
      await this.db.metadata.put({key,value:1,debrief_transition:{request_digest,session:next}});return structuredClone(next);
    });
  }
  async append_outcome_inference(request:import('../outcome-contracts').OutcomeInferenceRequest,request_digest:string,target_digest:string,id:string,created_time:string,epoch:number){
    return this.db.transaction('rw',[this.db.metadata,this.db.runs,this.db.snapshots],async()=>{
      if((await this.db.metadata.get('writer'))?.value!==epoch)throw new GameError('STALE_WRITER');
      const key='outcome-inference:'+request.run_id+':'+request.operation_id,prior=await this.db.metadata.get(key);
      if(prior){if(prior.value!==1||!prior.inference)throw new GameError('INVALID_SAVE');if(prior.inference.request_digest!==request_digest)throw new GameError('OPERATION_ID_REUSED');return structuredClone(prior.inference.note);}
      const state=await this.db.runs.get(request.run_id),sealed=(await this.db.snapshots.get(request.run_id+':'+request.finished_seq))?.state;
      if(state?.schema!==10||!state.finished||sealed?.schema!==10||!sealed.finished||sealed.integrity!==request.run_digest)throw new GameError('DEBRIEF_QUERY_REJECTED');
      const versionKey='outcome-inference-version:'+request.run_id+':'+target_digest,sequenceKey='outcome-inference-sequence:'+request.run_id,version=(await this.db.metadata.get(versionKey))?.value??0,sequence=(await this.db.metadata.get(sequenceKey))?.value??0;
      if(!Number.isSafeInteger(version)||version<0||!Number.isSafeInteger(sequence)||sequence<0)throw new GameError('INVALID_SAVE');
      if(version!==request.expected_version)throw new GameError('OBJECT_VERSION_CONFLICT');
      const {expected_version,...body}=request;void expected_version;const note:import('../outcome-contracts').OutcomeInferenceNote={...body,id,version:version+1,created_sequence:sequence+1,created_time,speaker_mode:'user',layer:'retrospective_inference'};
      await this.db.metadata.put({key:versionKey,value:note.version});await this.db.metadata.put({key:sequenceKey,value:note.created_sequence});await this.db.metadata.put({key,value:1,inference:{request_digest,request:structuredClone(request),note}});return structuredClone(note);
    });
  }
  async outcome_inferences(run_id:string){
    const rows=await this.db.metadata.where('key').startsWith('outcome-inference:'+run_id+':').toArray();
    if(rows.some(row=>row.value!==1||!row.inference))throw new GameError('INVALID_SAVE');return rows.map(row=>structuredClone(row.inference!)).sort((a,b)=>a.note.created_sequence-b.note.created_sequence);
  }
  async has_outcome_truth_exposure(run_id:string,run_digest:string,finished_seq:number){
    return this.db.transaction('r',[this.db.metadata,this.db.runs,this.db.snapshots],async()=>{
      const rows=await this.db.metadata.where('key').startsWith('outcome-exposure:'+run_id+':').toArray();let found=false;
      for(const row of rows){if(row.value!==1||!row.exposure)throw new GameError('INVALID_SAVE');await this.validate_exposure_source(row.exposure.source,row.exposure.definition_hash);const source=row.exposure.source;if(source.run_id===run_id&&source.run_digest===run_digest&&source.finished_seq===finished_seq)found=true;}return found;
    });
  }
  async grant_outcome_truth(request:import('../outcome-contracts').OutcomeTruthRequest,request_digest:string,payload_digest:string,epoch:number){
    return this.db.transaction('rw',this.db.metadata,async()=>{
      if((await this.db.metadata.get('writer'))?.value!==epoch)throw new GameError('STALE_WRITER');
      const key='outcome-truth-grant:'+request.run_id+':'+request.operation_id,old=await this.db.metadata.get(key);
      if(old){const grant=old.truth_grant;if(old.value!==1||!grant||grant.run_id!==request.run_id||grant.run_digest!==request.run_digest||grant.finished_seq!==request.finished_seq||grant.payload_digest!==payload_digest)throw new GameError('INVALID_SAVE');if(grant.request_digest!==request_digest)throw new GameError('OPERATION_ID_REUSED');return structuredClone(grant);}
      const sessionKey='outcome-debrief:'+request.run_id,row=await this.db.metadata.get(sessionKey),session=row?.debrief;
      if(!session||session.run_digest!==request.run_digest||session.finished_seq!==request.finished_seq)throw new GameError('DEBRIEF_QUERY_REJECTED');
      if(session.metadata_revision!==request.expected_meta_revision)throw new GameError('OBJECT_VERSION_CONFLICT');
      const grant:import('../outcome-contracts').OutcomeTruthGrant={run_id:request.run_id,run_digest:request.run_digest,finished_seq:request.finished_seq,operation_id:request.operation_id,request_digest,payload_digest,metadata_revision:session.metadata_revision+1,ack_revision:null};
      await this.db.metadata.put({...row!,debrief:{...session,metadata_revision:grant.metadata_revision}});
      await this.db.metadata.put({key,value:1,truth_grant:grant});
      return structuredClone(grant);
    });
  }
  async confirm_outcome_truth(request:import('../outcome-contracts').OutcomeTruthAcknowledgement,epoch:number){
    return this.db.transaction('rw',[this.db.metadata,this.db.runs,this.db.snapshots],async()=>{
      if((await this.db.metadata.get('writer'))?.value!==epoch)throw new GameError('STALE_WRITER');
      const key='outcome-truth-grant:'+request.run_id+':'+request.operation_id,row=await this.db.metadata.get(key),grant=row?.truth_grant;
      if(!grant||grant.run_digest!==request.run_digest||grant.finished_seq!==request.finished_seq||grant.payload_digest!==request.payload_digest||grant.metadata_revision!==request.expected_meta_revision)throw new GameError('DEBRIEF_QUERY_REJECTED');
      if(grant.ack_revision!==null)return {truth_exposure:true as const,metadata_revision:grant.ack_revision};
      const sessionKey='outcome-debrief:'+request.run_id,sessionRow=await this.db.metadata.get(sessionKey),session=sessionRow?.debrief;
      if(!session||session.run_digest!==request.run_digest||session.finished_seq!==request.finished_seq)throw new GameError('DEBRIEF_QUERY_REJECTED');
      if(session.metadata_revision!==request.expected_meta_revision)throw new GameError('OBJECT_VERSION_CONFLICT');
      const revision=session.metadata_revision+1;
      const state=await this.db.runs.get(request.run_id),sealed=(await this.db.snapshots.get(request.run_id+':'+request.finished_seq))?.state;
      if(state?.schema!==10||!state.finished||sealed?.schema!==10||!sealed.finished||sealed.integrity!==request.run_digest)throw new GameError('DEBRIEF_QUERY_REJECTED');
      await this.db.metadata.put({...sessionRow!,debrief:{...session,metadata_revision:revision,truth_exposure:true}});
      await this.db.metadata.put({...row!,truth_grant:{...grant,ack_revision:revision}});
      await this.db.metadata.put({key:'outcome-exposure:'+request.run_id+':'+request.operation_id,value:1,exposure:{definition_hash:state.definition_hash,source:{run_id:request.run_id,run_digest:request.run_digest,finished_seq:request.finished_seq,operation_id:request.operation_id,payload_digest:request.payload_digest,ack_revision:revision}}});
      return {truth_exposure:true as const,metadata_revision:revision};
    });
  }
  private async validate_exposure_source(source:import('../outcome-contracts').OutcomeExposureSource,definition_hash:string){
    if(!source)throw new GameError('INVALID_SAVE');
    const state=await this.db.runs.get(source.run_id),sealed=(await this.db.snapshots.get(source.run_id+':'+source.finished_seq))?.state;
    const grant=(await this.db.metadata.get('outcome-truth-grant:'+source.run_id+':'+source.operation_id))?.truth_grant;
    if(state?.schema!==10||state.definition_hash!==definition_hash||!state.finished||sealed?.schema!==10||!sealed.finished||sealed.integrity!==source.run_digest||!grant||grant.ack_revision===null)throw new GameError('INVALID_SAVE');
    const expected={run_id:grant.run_id,run_digest:grant.run_digest,finished_seq:grant.finished_seq,operation_id:grant.operation_id,payload_digest:grant.payload_digest,ack_revision:grant.ack_revision};
    if(JSON.stringify(source)!==JSON.stringify(expected))throw new GameError('INVALID_SAVE');
  }
  async outcome_fairness(run_id:string,definition_hash:string):Promise<import('../outcome-contracts').OutcomeFairness>{
    return this.db.transaction('r',[this.db.metadata,this.db.runs,this.db.snapshots],async()=>{
      const row=await this.db.metadata.get('outcome-fairness:'+run_id);
      if(!row)return {run_id,definition_hash,truth_exposure:false,sources:[]};
      const fairness=row.fairness;
      if(row.value!==1||!fairness||fairness.run_id!==run_id||fairness.definition_hash!==definition_hash||!Array.isArray(fairness.sources)||fairness.truth_exposure!==(fairness.sources.length>0))throw new GameError('INVALID_SAVE');
      for(const source of fairness.sources)await this.validate_exposure_source(source,definition_hash);
      return structuredClone(fairness);
    });
  }
  async list_runs() {
    const entries=await this.db.runs.toArray();
    for(const state of entries)await validate_state(state,this.play_definitions,this.mission_definitions,this.intelligence_definitions,this.outcome_definitions);
    const ranked=await Promise.all(entries.map(async state=>({state,created:(await this.db.metadata.get(`created:${state.run_id}`))?.value??0,read_only:await this.is_read_only(state.run_id)})));
    ranked.sort((a,b)=>b.created-a.created||Number(a.read_only)-Number(b.read_only)||b.state.revision-a.state.revision);
    const latest=new Map<string,(typeof ranked)[number]>();
    for(const entry of ranked){const key=entry.state.schema===8?'B22-MISSION-01':entry.state.schema===7?'B21-CORRIDOR-01':entry.state.definition_hash;if(!latest.has(key))latest.set(key,entry);}
    return [...latest.values()].map(({state:x,read_only}) => ({
      run_id: x.run_id,
      sim_time: x.sim_time,
      revision: x.revision,
      mode: x.mode,
      finished: x.finished,
      scenario_kind: x.schema===10?'play_outcome' as const:x.schema===9?'play_intelligence' as const:x.schema===8?'play_mission' as const:x.schema===7?'play_corridor' as const:x.schema===5?'record' as const:x.schema===6?'prestart_move' as const:'move' as const,
      read_only,
    }));
  }
  async delete(): Promise<void> {
    await this.db.delete();
  }
}
