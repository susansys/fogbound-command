import {initial_outcome_state} from './outcome-state';
import {project_outcome_view} from './outcome-knowledge';
import {apply_outcome_control} from './outcome-game';
import {parse_return_and_deliver,parse_outcome_envelope} from '../outcome-protocol';
import {outcome_definition_for_package,is_outcome_definition,type OutcomeDefinition} from './outcome-definition';
import type {ReturnAndDeliver,OutcomePlayerView,OutcomeEnvelope} from '../outcome-contracts';
import {is_record_plan,is_task_intent} from '../contracts';
import type {
  Mode,
  OriginalReport,
  Plan,
  Envelope,
  Receipt,
} from "../contracts";
import type {GamePlayerView as PlayerView} from '../play-contracts';
import { GameError } from "../contracts";
import { Persistence } from "./persistence";
import { load_definition,definition_for_package,record_definition_for_package,is_play_definition,play_definition_for_package } from "./scenario";
import type { State,StoredState } from "./state";
import { project_player_view as project_legacy_view } from "./knowledge";
import {project_play_view} from './play-knowledge';
import {project_mission_view} from './mission-knowledge';
import {project_intelligence_view} from './intelligence-knowledge';
import {initial_intelligence_state} from './intelligence-state';
import {is_intelligence_definition,intelligence_definition_for_package} from './intelligence-definition';
import {apply_intelligence_control} from './intelligence-game';
import {parse_intelligence_source_request,parse_intelligence_plan,parse_intelligence_preparation,parse_intelligence_activity} from '../intelligence-protocol';
import type {IntelligenceSourceRequest} from '../intelligence-protocol';
import type {SaveIntelligencePlan,IntelligencePreparationRequest,IntelligenceActivityRequest,IntelligencePlayerView} from '../intelligence-contracts';
import {initial_mission_state} from './mission-state';
import {is_mission_definition,mission_definition_for_package,type MissionDefinition} from './mission-definition';
import type {MissionDraft,MissionPreview,IssueMissionEnvelope,MissionPlayerView} from '../mission-contracts';
import {record} from '../protocol';
import {apply_recorded_issue,evaluate_mission_decision,apply_mission_explanation} from './mission-records';
import {preview_mission} from './mission-preview';
import {apply_save_plan,apply_mission_control} from './mission-game';
import {parse_save_plan,parse_issue_mission,parse_evaluate_mission,parse_append_mission} from '../mission-protocol';
import {initial_play_state} from './play-state';
import {apply_play_control,replay_play_state,validate_play_task} from './play-game';
import { valid_id, valid_envelope } from "../protocol";
import { hash } from "./scenario";
import { advance_move, register_move, register_record } from "./movement";
import {initial_record_accounts} from './record-accounting';
import {canonical,json_data,state_hash,validate_state} from './snapshot';
import {replay_state} from './replay';
import {preview_corridor} from './play-preview';
import type {RouteDraft,RoutePlan,PreviewPlan} from '../route-contracts';
import {preview_prestart,register_prestart,initial_prestart_data} from './prestart-move';
import {prestart_parameters,prestart_case} from './scenario';
function project_player_view(state:StoredState,registered:readonly import("./scenario").PlayDefinition[]=[],missions:readonly MissionDefinition[]=[],intelligence:readonly import('./intelligence-definition').IntelligenceDefinition[]=[],outcomes:readonly OutcomeDefinition[]=[]):PlayerView{return state.schema===10?project_outcome_view(state,outcomes):state.schema===9?project_intelligence_view(state,intelligence):state.schema===8?project_mission_view(state,missions):state.schema===7?project_play_view(state,registered):project_legacy_view(state);}
export class Game {
  private epoch: number | null = null;
  private faulted=false;
  private history:StoredState|null=null;
  private readonly verified_replay_states=new Set<string>();
  constructor(readonly store: Persistence) {}
  private remember_replay_state(integrity:string){
    this.verified_replay_states.add(integrity);
    if(this.verified_replay_states.size>64)this.verified_replay_states.delete(this.verified_replay_states.values().next().value!);
  }
  private async validate_package(state:StoredState|undefined){
    if(state?.schema!==7&&state?.schema!==9){await validate_state(state,this.store.play_definitions,this.store.mission_definitions,this.store.intelligence_definitions,this.store.outcome_definitions);return;}
    try{
      if(!json_data(state)||typeof state.integrity!=='string'||await state_hash(state)!==state.integrity)throw new GameError('INVALID_SAVE');
      await load_definition(state.schema===9?intelligence_definition_for_package(state.definition_hash,this.store.intelligence_definitions):play_definition_for_package(state.definition_hash,this.store.play_definitions),this.store.play_definitions,this.store.mission_definitions,this.store.intelligence_definitions,this.store.outcome_definitions);
      if(!this.verified_replay_states.has(state.integrity)){
        await validate_state(state,this.store.play_definitions,this.store.mission_definitions,this.store.intelligence_definitions,this.store.outcome_definitions);
        this.remember_replay_state(state.integrity);
      }
    }catch{throw new GameError('INVALID_SAVE');}
  }
  private async validate_stored_state(state:StoredState){
    await this.validate_package(state);
    if(state.schema!==6&&state.schema!==7&&state.schema!==8&&state.schema!==9&&state.schema!==10)return;
    const identity=(value:StoredState)=>JSON.stringify(canonical({run_id:value.run_id,schema:value.schema,contract:value.contract,definition_hash:value.definition_hash,hashes:value.hashes,mode:value.mode,source_run:value.source_run,rng:value.rng,case_ref:value.schema===6?value.prestart?.case_ref:undefined}));
    const seen=new Set<string>();let current=state;
    while(true){
      if(seen.has(current.run_id))throw new GameError('INVALID_SAVE');seen.add(current.run_id);
      const initial=await this.store.snapshot(current.run_id,1);
      await this.validate_package(initial);
      if(!initial||initial.schema!==current.schema||initial.revision!==1||identity(current)!==identity(initial))throw new GameError('INVALID_SAVE');
      if(current.source_run===null)return;
      const parent=await this.store.read_committed(current.source_run);
      await this.validate_package(parent);
      if(!parent||parent.schema!==current.schema||parent.definition_hash!==current.definition_hash||((current.schema===7||current.schema===8||current.schema===9||current.schema===10)&&parent.mode!==current.mode)||(current.schema===6&&(parent.schema!==6||parent.prestart?.case_ref!==current.prestart?.case_ref))||parent.rng.origin!==current.rng.origin||!await this.store.is_read_only(parent.run_id))throw new GameError('INVALID_SAVE');
      if(parent.schema!==6&&parent.schema!==7&&parent.schema!==8&&parent.schema!==9&&parent.schema!==10)throw new GameError('INVALID_SAVE');current=parent;
    }
  }
  private assert_current(){if(this.history)throw new GameError('HISTORY_READ_ONLY');}
  private async assert_writable(run:string){this.assert_current();if(await this.store.is_read_only(run))throw new GameError('HISTORY_READ_ONLY');}
  async restart_run(run:string,operation:string):Promise<PlayerView>{
    this.assert_current();if(!valid_id(run)||!valid_id(operation))throw new GameError('INVALID_INPUT');
    const source=await this.store.read_committed(run);if(!source)throw new GameError('RUN_NOT_FOUND');await this.validate_stored_state(source);
    return this.create(source.schema===10?outcome_definition_for_package(source.definition_hash,this.store.outcome_definitions):source.schema===9?intelligence_definition_for_package(source.definition_hash,this.store.intelligence_definitions):source.schema===8?mission_definition_for_package(source.definition_hash,this.store.mission_definitions):source.schema===7?play_definition_for_package(source.definition_hash,this.store.play_definitions):definition_for_package(source.schema,source.definition_hash),source.mode,operation,source,source.schema===6?source.prestart?.case_ref??'normal':'normal');
  }
  async get_replay(run:string,to:number,nodeRevision?:number):Promise<Game>{
    if(!valid_id(run)||!Number.isSafeInteger(to)||to<0)throw new GameError('INVALID_INPUT');
    const latest=await this.store.read_committed(run),initial=await this.store.snapshot(run,1);
    if(!latest||!initial)throw new GameError('RUN_NOT_FOUND');
    await this.validate_stored_state(latest);await validate_state(initial,this.store.play_definitions,this.store.mission_definitions,this.store.intelligence_definitions,this.store.outcome_definitions);
    if(to>latest.sim_time)throw new GameError('INVALID_INPUT');
    const context=new Game(this.store);
    if((latest.schema===8||latest.schema===9)&&initial.schema===latest.schema&&nodeRevision===undefined&&to===latest.sim_time){context.history=latest;return context;}
    if(nodeRevision!==undefined){
      if(!Number.isSafeInteger(nodeRevision)||nodeRevision<1||nodeRevision>latest.revision)throw new GameError('INVALID_INPUT');
      const node=await this.store.snapshot(run,nodeRevision);
      await this.validate_stored_state(node!);
      if(node?.run_id!==run||node.revision!==nodeRevision)throw new GameError('INVALID_SAVE');
      context.history=node;return context;
    }
    if(latest.schema>=5){
      // A real same-time commit takes precedence over effects of a later advance.
      const candidates=latest.inputs.filter(input=>input.at===to&&!['advance','tick'].includes(input.envelope.intent.kind)).reverse();
      for(const input of candidates){
        const node=await this.store.snapshot(run,input.revision);
        await this.validate_stored_state(node!);
        if(node?.sim_time===to){context.history=node;return context;}
      }
    }
    if(initial.schema===8||initial.schema===9||initial.schema===10)throw new GameError('INVALID_INPUT');
    if(latest.schema===8||latest.schema===9||latest.schema===10)throw new GameError('INVALID_SAVE');
    context.history=initial.schema===7?replay_play_state(initial,latest.inputs,to,this.store.play_definitions):replay_state(initial,latest.inputs,to);return context;
  }
  private async writer() {
    if (this.epoch === null) this.epoch = await this.store.claim_writer();
    return this.epoch;
  }
  private async commit(state:StoredState,expected:number|null,operation_id:string,fingerprint:string){
    try{
      await this.store.commit_batch(state,await this.writer(),expected,operation_id,fingerprint);
      // Only successful private Game transitions may seed the bounded cache.
      // Every later read still hashes the actual body and checks its lineage.
      if(state.schema===7||state.schema===9)this.remember_replay_state(state.integrity!);
    }
    catch(error){
      if(error instanceof GameError&&['STALE_REVISION','HISTORY_READ_ONLY'].includes(error.code))throw error;
      this.faulted=true;
      throw new GameError(error instanceof GameError&&error.code==='STALE_WRITER'?'STALE_WRITER':'STORAGE_UNCONFIRMED');
    }
  }
  async create_run(
    input: unknown,
    mode: Mode,
    operation: string,
    case_ref='normal',
  ): Promise<PlayerView> {
    return this.create(input,mode,operation,null,case_ref);
  }
  private async create(input:unknown,mode:Mode,operation:string,source:StoredState|null=null,case_ref='normal'):Promise<PlayerView>{
    this.assert_current();
    const definition = await load_definition(input,this.store.play_definitions,this.store.mission_definitions,this.store.intelligence_definitions,this.store.outcome_definitions);
    if(definition.schema===6)prestart_case({schema:definition.schema,definition_hash:definition.definition_hash},case_ref);
    else if(case_ref!=='normal')throw new GameError('INVALID_INPUT');
    if (!["command", "research"].includes(mode) || !valid_id(operation))
      throw new GameError("INVALID_INPUT");
    const creationFingerprint=(source
      ? `clone:${source.run_id}:${definition.id}:${definition.definition_hash}:${mode}`
      : `create:${definition.id}:${definition.definition_hash}:${mode}`)+(definition.schema===6?`:${case_ref}`:'');
    const previous = await this.store.creation(operation);
    if (previous) {
      const snapshot = await this.store.snapshot(
        previous.run_id,
        previous.revision,
      );
      if (!snapshot) throw new GameError("STORAGE_UNCONFIRMED");
      await validate_state(snapshot,this.store.play_definitions,this.store.mission_definitions,this.store.intelligence_definitions,this.store.outcome_definitions);
      const legacyFingerprint=source?`clone:${source.run_id}:${mode}`:`create:${mode}`;
      if(snapshot.definition_hash!==definition.definition_hash||snapshot.mode!==mode||snapshot.source_run!==(source?.run_id??null)||
        previous.fingerprint!==creationFingerprint&&!(snapshot.schema===4&&previous.fingerprint===legacyFingerprint))
        throw new GameError('OPERATION_CONFLICT');
      return project_player_view(snapshot,this.store.play_definitions,this.store.mission_definitions,this.store.intelligence_definitions,this.store.outcome_definitions);
    }
    if(this.faulted)throw new GameError('STORAGE_UNCONFIRMED');
    if(source)await this.assert_writable(source.run_id);
    const epoch = await this.writer(),
      run_id = crypto.randomUUID();
    if(is_outcome_definition(definition)){const state=initial_outcome_state(definition,run_id,mode,epoch,source?.run_id??null,source?.rng.origin??run_id);await this.commit(state,null,operation,creationFingerprint);return project_outcome_view(state,this.store.outcome_definitions);}
    if(is_intelligence_definition(definition)){
      const state=initial_intelligence_state(definition,run_id,mode,epoch,source?.run_id??null,source?.rng.origin??run_id);
      await this.commit(state,null,operation,creationFingerprint);return project_intelligence_view(state,this.store.intelligence_definitions);
    }
    if(is_mission_definition(definition)){
      const state=initial_mission_state(definition,run_id,mode,epoch,source?.run_id??null,source?.rng.origin??run_id);
      await this.commit(state,null,operation,creationFingerprint);return project_mission_view(state,this.store.mission_definitions);
    }
    if(is_play_definition(definition)){
      const state=initial_play_state(definition,run_id,mode,epoch,source?.run_id??null,source?.rng.origin??run_id);
      await this.commit(state,null,operation,creationFingerprint);return project_play_view(state,this.store.play_definitions);
    }
    const recordParameters=definition.schema===5?record_definition_for_package(definition.schema,definition.definition_hash).profile.parameters:null;
    const state: State = {
      run_id,
      revision: 1,
      sim_time: 0,
      mode,
      rate: 1,
      paused: mode === "research",
      finished: false,
      ended: false,
      status: "ready",
      order: null,
      world: {
        position: {
          xn: definition.catalogs.position.x,
          yn: definition.catalogs.position.y,
          d: 1,
        },
        equipment_energy: definition.profile.parameters.equipment_energy,
        equipment_wear: definition.profile.parameters.equipment_wear,
        movement_energy: definition.profile.parameters.movement_energy,
        ...(recordParameters?initial_record_accounts(recordParameters):{}),
        sends: 0,
        completed: false,
        stopped: false,
      },
      schedule: [
        {
          id: "objective-deadline",
          at: definition.profile.parameters.deadline,
          phase: 30,
          generation: epoch,
          kind: "deadline",
        },
      ],
      inputs: [],
      movement_rules: {fix_ms:definition.profile.parameters.fix_ms,task_expiry_ms:definition.profile.parameters.task_expiry_ms},
      source_run: source?.run_id??null,
      schema: definition.schema as 4 | 5 | 6,
      ...(definition.schema === 5 ? {scenario_kind:'record' as const} : {}),
      ...(definition.schema === 6 ? {scenario_kind:'prestart_move' as const} : {}),
      contract: "0.5.1",
      definition_hash: definition.definition_hash,
      hashes: definition.hashes,
      rng: {
        algorithm: "xorshift32-v1",
        version: 1,
        seed: 1,
        state: 1,
        origin: source?.rng.origin??run_id,
        used: false,
      },
      generation: epoch,
      phase: "committed",
      public_rules: {
        geometry: {
          H: definition.catalogs.geometry.H as [number, number],
          T: definition.catalogs.geometry.T as [number, number],
          extent: definition.profile.parameters.extent as [number, number],
          corridor_width: definition.profile.parameters.corridor_width,
          plain: definition.catalogs.geometry.plain as [
            number,
            number,
            number,
            number,
          ],
          rough: definition.catalogs.geometry.rough as [
            number,
            number,
            number,
            number,
          ],
        },
        authority: {
          from: definition.catalogs.authority.from,
          to: definition.catalogs.authority.to,
        },
        preview: {
          distance: (definition.schema===5?0:Math.hypot(
            definition.catalogs.geometry.T[0] -
              definition.catalogs.geometry.H[0],
            definition.catalogs.geometry.T[1] -
              definition.catalogs.geometry.H[1],
          )) as 120,
          estimated_move_ms: definition.profile.parameters.move_ms as 31800,
          link_ms: definition.profile.parameters.link_ms as 1000,
        },
      },
      known: {
        position: definition.catalogs.position,
        report: definition.catalogs.report as OriginalReport,
        delivery: definition.catalogs.delivery,
        resources: {
          equipment_energy: definition.profile.parameters.equipment_energy,
          equipment_wear: definition.profile.parameters.equipment_wear,
          movement_energy: definition.profile.parameters.movement_energy,
          ...(recordParameters?{
            record_energy: recordParameters.record_energy,
            record_wear: recordParameters.record_wear,
            record_packs: recordParameters.record_packs,
            record_energy_reserved:0,
            record_packs_reserved:0,
            hq_energy: recordParameters.hq_energy,
            hq_wear: recordParameters.hq_wear,
          }:{}),
          confirmed_at: 0,
        },
        ...(definition.schema===5?{artifacts: []}:{}),
      },
      log: [
        {
          id: "initial-report",
          at: 0,
          kind: "report",
          text: definition.schema === 5 ? "档案任务简报已递交；R最后确认在工位H。" : "原始工位报告已递交；R最后确认在H。",
          evidence: definition.catalogs.delivery.id,
        },
      ],
    };
    if(definition.schema===6){
      const geometry=definition.catalogs.geometry;
      const prestartParameters=prestart_parameters(state);
      if(!('N' in geometry))throw new GameError('INVALID_DEFINITION');
      state.public_rules.geometry.N=geometry.N as [number,number];
      state.public_rules.preview={distance:prestartParameters.target[0]-prestartParameters.origin[0],estimated_move_ms:prestartParameters.move_ms,link_ms:prestartParameters.link_ms} as State['public_rules']['preview'];
      state.world.hq_energy=prestartParameters.hq_energy;state.world.hq_wear=prestartParameters.hq_wear;
      state.known.resources.hq_energy=prestartParameters.hq_energy;state.known.resources.hq_wear=prestartParameters.hq_wear;
      state.world.movement_energy_reserved=0;state.known.resources.movement_energy_reserved=0;
      state.known.prestart={report_sequence:0};
      state.prestart=initial_prestart_data(state.public_rules.authority.to,case_ref);state.schedule=[];
    }
    await this.commit(
      state,
      null,
      operation,
      creationFingerprint,
    );
    return project_player_view(state,this.store.play_definitions,this.store.mission_definitions,this.store.intelligence_definitions,this.store.outcome_definitions);
  }
  async get_view(run: string): Promise<PlayerView> {
    if(this.history){if(run!==this.history.run_id)throw new GameError('RUN_NOT_FOUND');const view=project_player_view(this.history,this.store.play_definitions,this.store.mission_definitions,this.store.intelligence_definitions,this.store.outcome_definitions);return this.history.schema>=5?{...view,can_issue:false,next_action:'历史记录只能查看，请返回当前行动后安排任务'}:view;}
    const state = await this.store.read_committed(run);
    if (!state) throw new GameError("RUN_NOT_FOUND");
    await this.validate_stored_state(state);
    const view=project_player_view(state,this.store.play_definitions,this.store.mission_definitions,this.store.intelligence_definitions,this.store.outcome_definitions);
    if(await this.store.is_read_only(run)){view.can_issue=false;view.next_action='查看保留的行动记录';view.gap='这场行动已保留为只读记录';}
    return view;
  }
  async get_actor_view(run:string,actor:string){
    if(!valid_id(run)||!valid_id(actor))throw new GameError('INVALID_INPUT');
    const state=this.history?.run_id===run?this.history:await this.store.read_committed(run);
    if(!state)throw new GameError('RUN_NOT_FOUND');await this.validate_stored_state(state);
    if(state.schema===10){
      if(actor==='INTEL')return {run_id:run,actor:'INTEL',sim_time:state.sim_time,work:structuredClone(state.prefix.processing.items),verification_batches:structuredClone(state.verification_batches),received_manifests:structuredClone(state.reception_manifests.filter(m=>state.reception_deliveries.some(d=>d.target==='INTEL'&&d.received<=state.sim_time&&state.reception_reports.some(r=>r.ref.id===d.report_ref.id&&r.phase==='completed'&&r.batch_ref.id===m.batch_ref.id)))),resources:{energy:state.prefix.processing.energy,energy_reserved:state.prefix.processing.energy_reserved},known_reports:structuredClone(state.reception_deliveries.filter(d=>d.target==='INTEL'&&d.received<=state.sim_time).map(delivery=>({delivery,report:state.reception_reports.find(r=>r.ref.id===delivery.report_ref.id)!}))),published_reports:structuredClone(state.verification_reports),published_status_reports:structuredClone(state.verification_status_reports)};
      const sourceActor=outcome_definition_for_package(state.definition_hash,this.store.outcome_definitions).catalogs.source.actor;
      if(actor===sourceActor)return {run_id:run,actor,sim_time:state.sim_time,work:structuredClone(state.prefix.source.work),resources:structuredClone(state.prefix.source.resources),published_reports:structuredClone(state.prefix.reports.filter(r=>r.id===state.prefix.source.published_report_ref))};
      if(actor==='H'){
return {run_id:run,actor:'H',sim_time:state.sim_time,reception:{reserved_personnel:state.reception_batches.filter(b=>b.status==='running').reduce((n,b)=>n+b.people_ids.length,0),received_personnel:state.person_receipts.length,batches:structuredClone(state.reception_batches)},published_reports:structuredClone(state.reception_reports),handover_confirmations:structuredClone(state.handover_confirmations),person_receipts:structuredClone(state.person_receipts),custody_events:structuredClone(state.custody_events)};}const local=state.prefix.field.actors.find(a=>a.actor===actor);if(!local)throw new GameError('UNSUPPORTED');return {run_id:run,sim_time:state.sim_time,...structuredClone(local),position_scope:local.position.site,activities:structuredClone(state.prefix.field.orders.filter(o=>o.payload.actor_ref.id===actor&&o.arrives_at<=state.sim_time)),artifacts:structuredClone(state.prefix.field.artifacts.filter(a=>a.custody_holder===actor&&!state.custody_events.some(e=>e.artifact_ref.id===a.ref.id))),record_materials:structuredClone(state.prefix.field.materials.filter(m=>state.prefix.field.artifacts.some(a=>a.custody_holder===actor&&a.material_refs.some(ref=>ref.id===m.ref.id)))),known_reports:[],message_facts:structuredClone(state.prefix.field.messages.filter(m=>m.actor===actor)),published_reports:structuredClone(state.prefix.field.reports.filter(r=>r.actor===actor))};}
    if(state.schema!==9)throw new GameError('INVALID_REQUEST');
    const definition=intelligence_definition_for_package(state.definition_hash,this.store.intelligence_definitions);
    const local=definition.catalogs.actors.find(candidate=>candidate.id===actor);
    if(local){const own=state.field.actors.find(a=>a.actor===actor)!;return {run_id:run,sim_time:state.sim_time,...structuredClone(own),position_scope:own.position.site,activities:structuredClone(state.field.orders.filter(o=>o.payload.actor_ref.id===actor&&o.arrives_at<=state.sim_time)),artifacts:structuredClone(state.field.artifacts.filter(a=>a.custody_holder===actor)),record_materials:structuredClone(state.field.materials.filter(m=>state.field.artifacts.some(a=>a.custody_holder===actor&&a.material_refs.some(ref=>ref.id===m.ref.id)))),known_reports:[],message_facts:structuredClone(state.field.messages.filter(m=>m.actor===actor)),published_reports:structuredClone(state.field.reports.filter(r=>r.actor===actor))};}
    if(actor!==definition.catalogs.source.actor)throw new GameError('UNSUPPORTED');
    return {run_id:run,actor,sim_time:state.sim_time,work:structuredClone(state.source.work),resources:structuredClone(state.source.resources),published_reports:structuredClone(state.reports.filter(r=>r.id===state.source.published_report_ref))};
  }
  async apply_outcome_intent(input:unknown,clock_to?:number):Promise<{receipt:Receipt;view:OutcomePlayerView}>{return this.commit_outcome_request(parse_outcome_envelope(input),clock_to);}
  async return_and_deliver(input:unknown):Promise<{receipt:Receipt;view:OutcomePlayerView}>{return this.commit_outcome_request(parse_return_and_deliver(input));}
  private async commit_outcome_request(request:OutcomeEnvelope,clock_to?:number):Promise<{receipt:Receipt;view:OutcomePlayerView}>{
    this.assert_current();await this.assert_writable(request.run_id);const state=await this.store.read_committed(request.run_id);if(!state)throw new GameError('RUN_NOT_FOUND');await this.validate_stored_state(state);if(state.schema!==10)throw new GameError('INVALID_REQUEST');
    const fingerprint=await hash(canonical(request)),prior=await this.store.receipt(state.run_id,request.operation_id);if(prior){if(prior.fingerprint!==fingerprint)throw new GameError('OPERATION_ID_REUSED');return {receipt:{run_id:state.run_id,operation_id:request.operation_id,revision:prior.revision,sim_time:prior.sim_time,fingerprint,result:'committed',kind:request.intent.kind},view:project_outcome_view(state,this.store.outcome_definitions)};}
    if(this.faulted)throw new GameError('STORAGE_UNCONFIRMED');const candidate=await apply_outcome_control(state,request,clock_to,this.store.outcome_definitions);await this.commit(candidate,state.revision,request.operation_id,fingerprint);return {receipt:{run_id:state.run_id,operation_id:request.operation_id,revision:candidate.revision,sim_time:candidate.sim_time,fingerprint,result:'committed',kind:request.intent.kind,...(request.intent.kind==='restore'?{snapshot_revision:request.intent.snapshot_revision}:{})},view:project_outcome_view(candidate,this.store.outcome_definitions)};
  }
  private async commit_intelligence_request(request:SaveIntelligencePlan|IntelligenceSourceRequest|IntelligencePreparationRequest|IntelligenceActivityRequest):Promise<{receipt:Receipt;view:IntelligencePlayerView}>{
    await this.assert_writable(request.run_id);
    const state=await this.store.read_committed(request.run_id);if(!state)throw new GameError('RUN_NOT_FOUND');
    await this.validate_stored_state(state);if(state.schema!==9)throw new GameError('INVALID_REQUEST');
    const fingerprint=await hash(canonical(request)),prior=await this.store.receipt(state.run_id,request.operation_id);
    if(prior){if(prior.fingerprint!==fingerprint)throw new GameError('OPERATION_ID_REUSED');return{receipt:{run_id:state.run_id,operation_id:request.operation_id,revision:prior.revision,sim_time:prior.sim_time,fingerprint,result:'committed',kind:request.intent.kind},view:project_intelligence_view(state,this.store.intelligence_definitions)};}
    if(this.faulted)throw new GameError('STORAGE_UNCONFIRMED');
    const candidate=apply_intelligence_control(state,request,undefined,this.store.intelligence_definitions);await this.commit(candidate,state.revision,request.operation_id,fingerprint);
    return{receipt:{run_id:state.run_id,operation_id:request.operation_id,revision:candidate.revision,sim_time:candidate.sim_time,fingerprint,result:'committed',kind:request.intent.kind},view:project_intelligence_view(candidate,this.store.intelligence_definitions)};
  }
  async request_source_validation(input:unknown):Promise<{receipt:Receipt;view:IntelligencePlayerView}>{
    return this.commit_intelligence_request(parse_intelligence_source_request(input));
  }
  async request_preparation(input:unknown):Promise<{receipt:Receipt;view:import('../intelligence-contracts').IntelligencePlayerView}>{
    return this.commit_intelligence_request(parse_intelligence_preparation(input));
  }
  async issue_activity(input:unknown):Promise<{receipt:Receipt;view:import('../intelligence-contracts').IntelligencePlayerView}>{
    return this.commit_intelligence_request(parse_intelligence_activity(input));
  }
  async restore(run:string,operation_id:string):Promise<{receipt:Receipt;view:PlayerView}>{
    this.assert_current();
    if(!valid_id(run)||!valid_id(operation_id))throw new GameError('INVALID_INPUT');
    await this.assert_writable(run);
    const state=await this.store.read_committed(run);
    if(!state)throw new GameError('RUN_NOT_FOUND');
    const snapshot=await this.store.snapshot(run,state.revision);
    await this.validate_stored_state(state);await validate_state(snapshot,this.store.play_definitions,this.store.mission_definitions,this.store.intelligence_definitions,this.store.outcome_definitions);
    if(snapshot?.integrity!==state.integrity)throw new GameError('INVALID_SAVE');
    const prior=await this.store.receipt(run,operation_id);
    if(prior){const snapshot=await this.store.snapshot(run,prior.revision);const input=snapshot?.inputs.find(x=>x.envelope.operation_id===operation_id)?.envelope;
      if(!input||!valid_envelope(input,910000,true)||input.intent.kind!=='restore')throw new GameError('OPERATION_CONFLICT');return this.operate(input);
    }
    this.faulted=false;
    return this.operate({run_id:run,operation_id,expected_revision:state.revision,intent:{kind:'restore',snapshot_revision:state.revision}});
  }
  async save(envelope:Envelope,clock_to?:number){
    this.assert_current();
    if(envelope?.intent?.kind!=='save')throw new GameError('INVALID_INPUT');
    return this.operate(envelope,clock_to);
  }
  async save_plan(input:import('../mission-contracts').SavePlanEnvelope):Promise<{receipt:Receipt;view:import('../mission-contracts').MissionPlayerView}>;
  async save_plan(input:import('../intelligence-contracts').SaveIntelligencePlan):Promise<{receipt:Receipt;view:import('../intelligence-contracts').IntelligencePlayerView}>;
  async save_plan(input:unknown):Promise<{receipt:Receipt;view:import('../mission-contracts').MissionPlayerView|import('../intelligence-contracts').IntelligencePlayerView}>;
  async save_plan(input:unknown):Promise<{receipt:Receipt;view:import('../mission-contracts').MissionPlayerView|import('../intelligence-contracts').IntelligencePlayerView}>{
    this.assert_current();
    const intelligence=record(input)&&valid_id(input.run_id)?await this.store.read_committed(input.run_id):null;
    if(intelligence?.schema===9){
      return this.commit_intelligence_request(parse_intelligence_plan(input));
    }
    this.assert_current();const envelope=parse_save_plan(input);
    await this.assert_writable(envelope.run_id);
    const state=await this.store.read_committed(envelope.run_id);
    if(!state)throw new GameError('RUN_NOT_FOUND');
    if(state.schema!==8)throw new GameError('INVALID_REQUEST');
    await this.validate_stored_state(state);
    const fingerprint=await hash(canonical(envelope)),prior=await this.store.receipt(state.run_id,envelope.operation_id);
    if(prior){
      if(prior.fingerprint!==fingerprint)throw new GameError('OPERATION_ID_REUSED');
      return {receipt:{run_id:state.run_id,operation_id:envelope.operation_id,revision:prior.revision,sim_time:prior.sim_time,fingerprint,result:'committed',kind:'save_plan'},view:project_mission_view(state,this.store.mission_definitions)};
    }
    if(this.faulted)throw new GameError('STORAGE_UNCONFIRMED');
    const candidate=await apply_save_plan(state,envelope,this.store.mission_definitions);
    await this.commit(candidate,state.revision,envelope.operation_id,fingerprint);
    return {receipt:{run_id:state.run_id,operation_id:envelope.operation_id,revision:candidate.revision,sim_time:candidate.sim_time,fingerprint,result:'committed',kind:'save_plan'},view:project_mission_view(candidate,this.store.mission_definitions)};
  }
  async evaluate_decision(input:unknown):Promise<import('../mission-contracts').MissionDecisionEvaluation>{
    const request=parse_evaluate_mission(input),state=this.history??await this.store.read_committed(request.run_id);
    if(!state||state.run_id!==request.run_id)throw new GameError('RUN_NOT_FOUND');
    if(state.schema!==8)throw new GameError('INVALID_REQUEST');
    await this.validate_stored_state(state);
    if(state.revision!==request.view_revision)throw new GameError('STALE_REVISION');
    const definition=mission_definition_for_package(state.definition_hash,this.store.mission_definitions),catalog=definition.catalogs.decision_history;
    const decision=request.decision_ref.run_id===state.run_id?state.decision_records.find(r=>r.id===request.decision_ref.id&&r.version===request.decision_ref.version):undefined;
    const historical=catalog?.records.find(({record:r})=>r.run_id===request.decision_ref.run_id&&r.id===request.decision_ref.id&&r.version===request.decision_ref.version);
    const selected=decision??historical?.record;if(!selected)throw new GameError('INVALID_REQUEST');
    const result=evaluate_mission_decision(selected,definition,state.revision);
    return {...result,run_id:state.run_id,record_source:decision?{kind:'current_run'}:{kind:'registered_history',catalog_ref:catalog!.id,source_ref:catalog!.source_ref}};
  }
  async append_explanation(input:unknown):Promise<{receipt:Receipt;view:MissionPlayerView}>{
    this.assert_current();const envelope=parse_append_mission(input);await this.assert_writable(envelope.run_id);
    const state=await this.store.read_committed(envelope.run_id);if(!state)throw new GameError('RUN_NOT_FOUND');if(state.schema!==8)throw new GameError('INVALID_REQUEST');
    await this.validate_stored_state(state);
    const fingerprint=await hash(canonical(envelope)),prior=await this.store.receipt(state.run_id,envelope.operation_id);
    if(prior){if(prior.fingerprint!==fingerprint)throw new GameError('OPERATION_ID_REUSED');return {receipt:{run_id:state.run_id,operation_id:envelope.operation_id,revision:prior.revision,sim_time:prior.sim_time,fingerprint,result:'committed',kind:'append_explanation'},view:project_mission_view(state,this.store.mission_definitions)};}
    if(this.faulted)throw new GameError('STORAGE_UNCONFIRMED');
    const candidate=apply_mission_explanation(state,envelope);await this.commit(candidate,state.revision,envelope.operation_id,fingerprint);
    return {receipt:{run_id:state.run_id,operation_id:envelope.operation_id,revision:candidate.revision,sim_time:candidate.sim_time,fingerprint,result:'committed',kind:'append_explanation'},view:project_mission_view(candidate,this.store.mission_definitions)};
  }
  async preview_plan(run:string,revision:number,editing_seq:number):Promise<Plan>;
  async preview_plan(run:string,revision:number,editing_seq:number,route_draft:RouteDraft):Promise<RoutePlan>;
  async preview_plan(run:string,revision:number,editing_seq:number,draft:MissionDraft):Promise<MissionPreview>;
  async preview_plan(
    run: string,
    revision: number,
    editing_seq: number,
    route_draft?:RouteDraft|MissionDraft|unknown,
  ): Promise<PreviewPlan|MissionPreview> {
    if (
      !valid_id(run) ||
      !Number.isSafeInteger(revision) ||
      !Number.isSafeInteger(editing_seq) ||
      editing_seq < 0
    )
      throw new GameError("INVALID_INPUT");
    const state = this.history?.run_id===run?this.history:await this.store.read_committed(run);
    if (!state) throw new GameError("RUN_NOT_FOUND");
    await this.validate_stored_state(state);
    if(state.schema===9||state.schema===10)throw new GameError('INVALID_REQUEST');
    if(state.schema===8){
      if(revision!==state.revision)throw new GameError('STALE_REVISION');
      return preview_mission(state,editing_seq,route_draft,this.store.mission_definitions);
    }
    if(state.schema===7){
      if(!route_draft)throw new GameError('INVALID_INPUT');
      const view=await this.get_view(run);
      if(view.scenario_kind!=='play_corridor')throw new GameError('INVALID_INPUT');
      if(view.revision!==revision)throw new GameError('STALE_REVISION');
      return preview_corridor(view,editing_seq,route_draft as RouteDraft);
    }
    if(route_draft)throw new GameError('INVALID_INPUT');
    const view = project_legacy_view(state);
    if (view.revision !== revision) throw new GameError("STALE_REVISION");
    if(state.schema===6)return preview_prestart(state,editing_seq,view.can_issue,view.gap);
    if(state.schema===5){
      const definition=record_definition_for_package(state.schema,state.definition_hash),p=definition.profile.parameters;
      return {kind:'record',run_id:run,revision,editing_seq,version:1,actor:'R',target:'A',station:'H',definition_hash:state.definition_hash,
        report_id:view.report.id,delivery_id:view.delivery.id,setup_ms:p.setup_ms,work:p.record_work,
        estimated_record_ms:p.record_work*p.record_ms_per_work,estimated_total_ms:p.setup_ms+p.record_work*p.record_ms_per_work+2*p.link_ms,
        link_ms:1000,record_energy:p.record_energy_cost,record_wear:p.record_first_wear,record_packs:p.record_pack_cost,allowed:view.can_issue,gap:view.can_issue?'':view.gap};
    }
    return {
      run_id: run,
      revision,
      editing_seq,
      version: 1,
      actor: "R",
      target: "T",
      path: "H-T",
      ...state.public_rules.preview,
      allowed: view.can_issue,
      gap: view.can_issue ? "" : view.gap,
    };
  }
  async issue_order(envelope:IssueMissionEnvelope):Promise<{receipt:Receipt;view:MissionPlayerView}>;
  async issue_order(envelope:Envelope):Promise<{receipt:Receipt;view:PlayerView}>;
  async issue_order(envelope:Envelope|IssueMissionEnvelope):Promise<{receipt:Receipt;view:PlayerView}>{
    this.assert_current();
    if(record(envelope?.intent)&&envelope.intent.kind==='issue_mission'){
      const input=parse_issue_mission(envelope);await this.assert_writable(input.run_id);
      const state=await this.store.read_committed(input.run_id);
      if(!state)throw new GameError('RUN_NOT_FOUND');if(state.schema!==8)throw new GameError('INVALID_REQUEST');
      await this.validate_stored_state(state);
      const fingerprint=await hash(canonical(input)),prior=await this.store.receipt(state.run_id,input.operation_id);
      if(prior){if(prior.fingerprint!==fingerprint)throw new GameError('OPERATION_ID_REUSED');return {receipt:{run_id:state.run_id,operation_id:input.operation_id,revision:prior.revision,sim_time:prior.sim_time,fingerprint,result:'committed',kind:'issue_mission'},view:project_mission_view(state,this.store.mission_definitions)};}
      if(this.faulted)throw new GameError('STORAGE_UNCONFIRMED');
      const candidate=await apply_recorded_issue(state,input,this.store.mission_definitions);
      await this.commit(candidate,state.revision,input.operation_id,fingerprint);
      return {receipt:{run_id:state.run_id,operation_id:input.operation_id,revision:candidate.revision,sim_time:candidate.sim_time,fingerprint,result:'committed',kind:'issue_mission'},view:project_mission_view(candidate,this.store.mission_definitions)};
    }
    if (!valid_envelope(envelope,910000,true)||!is_task_intent(envelope.intent))
      throw new GameError("INVALID_INPUT");
    return this.operate(envelope);
  }
  async get_receipt(
    run: string,
    operation_id: string,
  ): Promise<Receipt | null> {
    if(!valid_id(run)||!valid_id(operation_id))throw new GameError('INVALID_INPUT');
    if(this.history&&run!==this.history.run_id)throw new GameError('RUN_NOT_FOUND');
    if(this.history&&!this.history.inputs.some(x=>x.envelope.operation_id===operation_id))return null;
    const row = await this.store.receipt(run, operation_id);
    if (!row) return null;
    const state = await this.store.snapshot(run, row.revision),
      input = state?.inputs.find(
        (x) => x.envelope.operation_id === operation_id,
      );
    if (!input) throw new GameError("INVALID_INPUT");
    return {
      run_id: row.run_id,
      operation_id: row.operation_id,
      revision: row.revision,
      sim_time: row.sim_time,
      fingerprint: row.fingerprint,
      result: "committed",
      kind: input.envelope.intent.kind,
      ...(input.envelope.intent.kind==='restore'?{snapshot_revision:input.envelope.intent.snapshot_revision}:{}),
    };
  }
  async control_clock(
    envelope: Envelope,
    clock_to?:number,
  ): Promise<{ receipt: Receipt; view: PlayerView }> {
    this.assert_current();
    if (!['advance','pause','continue','rate','mode'].includes(envelope?.intent?.kind))
      throw new GameError("INVALID_INPUT");
    return this.operate(envelope,clock_to);
  }
  async tick(run:string,to:number,operation_id:string):Promise<{receipt:Receipt;view:PlayerView}> {
    this.assert_current();
    const prior=await this.store.receipt(run,operation_id);
    if(prior){
      const snapshot=await this.store.snapshot(run,prior.revision);
      const input=snapshot?.inputs.find(x=>x.envelope.operation_id===operation_id)?.envelope;
      if(!input||!valid_envelope(input,910000,true)||input.intent.kind!=='tick'||input.intent.to!==to)throw new GameError('OPERATION_CONFLICT');
      return this.operate(input);
    }
    const view=await this.get_view(run);
    return this.operate({run_id:run,operation_id,expected_revision:view.revision,intent:{kind:'tick',to}});
  }
  private async operate(
    envelope: Envelope,
    clock_to?:number,
  ): Promise<{ receipt: Receipt; view: PlayerView }> {
    this.assert_current();
    if (!valid_envelope(envelope,910000,true)) throw new GameError("INVALID_INPUT");
    await this.assert_writable(envelope.run_id);
    const state = await this.store.read_committed(envelope.run_id);
    if(!state)throw new GameError('RUN_NOT_FOUND');
    if(state.schema===10)return this.commit_outcome_request(envelope,clock_to);
    if(state.schema===9){
      await this.validate_stored_state(state);
      const fingerprint=await hash(canonical(envelope)),prior=await this.store.receipt(state.run_id,envelope.operation_id);
      if(prior){if(prior.fingerprint!==fingerprint)throw new GameError('OPERATION_ID_REUSED');return {receipt:{run_id:state.run_id,operation_id:envelope.operation_id,revision:prior.revision,sim_time:prior.sim_time,fingerprint,result:'committed',kind:envelope.intent.kind,...(envelope.intent.kind==='restore'?{snapshot_revision:envelope.intent.snapshot_revision}:{})},view:project_intelligence_view(state,this.store.intelligence_definitions)};}
      if(this.faulted)throw new GameError('STORAGE_UNCONFIRMED');
      const candidate=apply_intelligence_control(state,envelope,clock_to,this.store.intelligence_definitions);await this.commit(candidate,state.revision,envelope.operation_id,fingerprint);
      return {receipt:{run_id:state.run_id,operation_id:envelope.operation_id,revision:candidate.revision,sim_time:candidate.sim_time,fingerprint,result:'committed',kind:envelope.intent.kind,...(envelope.intent.kind==='restore'?{snapshot_revision:envelope.intent.snapshot_revision}:{})},view:project_intelligence_view(candidate,this.store.intelligence_definitions)};
    }
    if(state.schema===8){
      await this.validate_stored_state(state);
      const fingerprint=await hash(canonical(envelope)),prior=await this.store.receipt(state.run_id,envelope.operation_id);
      if(prior){if(prior.fingerprint!==fingerprint)throw new GameError('OPERATION_ID_REUSED');return {receipt:{run_id:state.run_id,operation_id:envelope.operation_id,revision:prior.revision,sim_time:prior.sim_time,fingerprint,result:'committed',kind:envelope.intent.kind,...(envelope.intent.kind==='restore'?{snapshot_revision:envelope.intent.snapshot_revision}:{})},view:project_mission_view(state,this.store.mission_definitions)};}
      if(this.faulted)throw new GameError('STORAGE_UNCONFIRMED');
      const candidate=apply_mission_control(state,envelope,clock_to,this.store.mission_definitions);
      await this.commit(candidate,state.revision,envelope.operation_id,fingerprint);
      return {receipt:{run_id:state.run_id,operation_id:envelope.operation_id,revision:candidate.revision,sim_time:candidate.sim_time,fingerprint,result:'committed',kind:envelope.intent.kind,...(envelope.intent.kind==='restore'?{snapshot_revision:envelope.intent.snapshot_revision}:{})},view:project_mission_view(candidate,this.store.mission_definitions)};
    }
    const playParameters=state.schema===7?play_definition_for_package(state.definition_hash,this.store.play_definitions).profile.parameters:null;
    if(!valid_envelope(envelope,playParameters?playParameters.deadline+playParameters.receipt_grace:610000,state.schema===7))throw new GameError('INVALID_INPUT');
    const fingerprint = await hash(canonical(envelope));
    const previous = await this.store.receipt(
      envelope.run_id,
      envelope.operation_id,
    );
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw new GameError("OPERATION_CONFLICT");
      return {
        receipt: {
          run_id: previous.run_id,
          operation_id: previous.operation_id,
          revision: previous.revision,
          sim_time: previous.sim_time,
          fingerprint: previous.fingerprint,
          result: "committed",
          kind: envelope.intent.kind,
          ...(envelope.intent.kind==='restore'?{snapshot_revision:envelope.intent.snapshot_revision}:{}),
        },
        view: await this.get_view(envelope.run_id),
      };
    }
    if(this.faulted)throw new GameError('STORAGE_UNCONFIRMED');
    if (state.revision !== envelope.expected_revision)
      throw new GameError("STALE_REVISION");
    await this.validate_stored_state(state);
    if(state.schema===7){
      await validate_play_task(state,envelope,this.store.play_definitions);
      const candidate=apply_play_control(state,envelope,clock_to,this.store.play_definitions);
      await this.commit(candidate,state.revision,envelope.operation_id,fingerprint);
      return {receipt:{run_id:state.run_id,operation_id:envelope.operation_id,revision:candidate.revision,sim_time:candidate.sim_time,fingerprint,result:'committed',kind:envelope.intent.kind,...(envelope.intent.kind==='restore'?{snapshot_revision:envelope.intent.snapshot_revision}:{})},view:project_play_view(candidate,this.store.play_definitions)};
    }
    const candidate = structuredClone(state);
    if(clock_to!==undefined){
      if(state.mode!=='command'||state.paused||!Number.isSafeInteger(clock_to)||clock_to<state.sim_time||clock_to>610000)throw new GameError('INVALID_INPUT');
      if(clock_to>state.sim_time&&!state.ended)advance_move(candidate,clock_to);
    }
    if (is_task_intent(envelope.intent)) {
      const intent = envelope.intent;
      if(intent.kind==='replace_task'&&state.schema!==6)throw new GameError('INVALID_INPUT');
      if(intent.kind==='replace_task'&&state.inputs.some(input=>input.envelope.intent.kind==='replace_task'))throw new GameError('REPLACEMENT_LIMIT');
      if (state.order&&state.schema!==6) throw new GameError("ORDER_EXISTS");
      const expected = await this.preview_plan(
        state.run_id,
        state.revision,
        intent.plan.editing_seq,
      );
      if (
        JSON.stringify(canonical(expected)) !==
        JSON.stringify(canonical(intent.plan))
      )
        throw new GameError("STALE_PLAN");
      if (!expected.allowed) throw new GameError("AUTHORITY_EXPIRED");
      if(state.schema===6)register_prestart(candidate,intent);
      else if(intent.kind==='issue'&&is_record_plan(intent.plan))register_record(candidate,intent);
      else if(intent.kind==='issue')register_move(candidate, intent);
    } else if (envelope.intent.kind === "advance" || envelope.intent.kind==='tick') {
      if (state.mode !== (envelope.intent.kind==='tick'?'command':'research')) throw new GameError("MODE_LOCKED");
      if(envelope.intent.kind==='tick'&&state.paused)throw new GameError('CLOCK_PAUSED');
      if (envelope.intent.to < state.sim_time)
        throw new GameError("TIME_REVERSED");
      if(envelope.intent.to===state.sim_time)throw new GameError('TIME_NOT_ADVANCED');
      if (state.ended) throw new GameError("RUN_ENDED");
      advance_move(candidate, envelope.intent.to);
    } else if(envelope.intent.kind==='pause'||envelope.intent.kind==='restore') candidate.paused=true;
    else if(envelope.intent.kind==='continue') {
      if(state.mode!=='command')throw new GameError('MODE_LOCKED');
      if(candidate.ended)throw new GameError('RUN_ENDED');
      candidate.paused=false;
    } else if(envelope.intent.kind==='rate') candidate.rate=envelope.intent.rate;
    else if(envelope.intent.kind==='save'){/* the committed snapshot is the save point */}
    else if(envelope.intent.kind==='mode')throw new GameError('MODE_LOCKED');
    else throw new GameError("INVALID_INPUT");
    candidate.revision = state.revision + 1;
    candidate.inputs.push({
      envelope: structuredClone(envelope),
      at: clock_to===undefined?state.sim_time:candidate.sim_time,
      revision: candidate.revision,
      ...(clock_to===undefined?{}:{clock_to}),
    });
    await this.commit(
      candidate,
      state.revision,
      envelope.operation_id,
      fingerprint,
    );
    return {
      receipt: {
        run_id: state.run_id,
        operation_id: envelope.operation_id,
        revision: candidate.revision,
        sim_time: candidate.sim_time,
        fingerprint,
        result: "committed",
        kind: envelope.intent.kind,
        ...(envelope.intent.kind==='restore'?{snapshot_revision:envelope.intent.snapshot_revision}:{}),
      },
      view: project_player_view(candidate),
    };
  }
}
