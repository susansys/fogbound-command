import {initial_knowledge_collection_state} from './knowledge-collection-state';
import {is_knowledge_collection_definition} from './knowledge-collection-definition';
import {project_knowledge_collection_view,apply_knowledge_collection_control} from './knowledge-collection-engine';
import {valid_knowledge_collection_envelope} from '../knowledge-collection-protocol';
import type {KnowledgeCollectionEnvelope} from '../knowledge-collection-contracts';
import {valid_integrated_field_envelope} from '../integrated-field-protocol';
import type {IntegratedFieldEnvelope} from '../integrated-field-contracts';
import {initial_integrated_field_state} from './integrated-field-state';
import {create_integrated_debrief,integrated_truth_facts} from './integrated-field-debrief';
import {parse_integrated_truth_request} from '../integrated-field-protocol';
import {integrated_work_configuration} from '../integrated-field-contracts';
import {is_integrated_field_definition} from './integrated-field-definition';
import {project_integrated_field_view,apply_integrated_field_control} from './integrated-field-engine';
import {conflicting_definition_for_package,is_conflicting_action_definition,is_conflicting_task_hash} from './conflicting-action-definition';
import {parse_working_assessment} from '../conflicting-action-protocol';
import {initial_conflicting_state} from './conflicting-action-state';
import {project_conflicting_action_view,apply_conflicting_action_control} from './conflicting-action';
import {source_time_definition_for_package,is_source_time_definition} from './source-time-definition';
import {initial_source_time_state,compose_source_time_state} from './source-time-state';
import {project_source_time_view,project_source_reading} from './source-time';
import {outcome_rejection_codes} from '../outcome-contracts';
import {initial_outcome_state} from './outcome-state';
import {create_outcome_participant_template,create_outcome_debrief,create_outcome_debrief_anchor,outcome_truth_facts} from './outcome-debrief';
import {evaluate_outcome_decision_record,evaluate_outcome_rejection} from './outcome-evaluation';
import {hq_outcome_evidence,local_outcome_evidence,engine_outcome_evidence,declared_outcome_evidence,retrospective_outcome_evidence,outcome_topic} from './outcome-evidence';
import {project_outcome_view} from './outcome-knowledge';
import {apply_outcome_control,create_outcome_rejection} from './outcome-game';
import {parse_outcome_participant_query,parse_outcome_inference_request,parse_outcome_debrief_transition,parse_outcome_decision_query,parse_return_and_deliver,parse_outcome_envelope,parse_outcome_debrief_query,parse_outcome_truth_request,parse_outcome_evidence_request} from '../outcome-protocol';
import {outcome_definition_for_package,load_outcome_definition,outcome_decision_profile_for,is_outcome_definition,type OutcomeDefinition} from './outcome-definition';
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
import {record,fields} from '../protocol';
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
function project_player_view(state:StoredState,registered:readonly import("./scenario").PlayDefinition[]=[],missions:readonly MissionDefinition[]=[],intelligence:readonly import('./intelligence-definition').IntelligenceDefinition[]=[],outcomes:readonly OutcomeDefinition[]=[],sources:readonly import('./source-time-definition').SourceTimeDefinition[]=[]):PlayerView{return state.schema===14?project_knowledge_collection_view(state):state.schema===13?project_integrated_field_view(state):state.schema===12?project_conflicting_action_view(state):state.schema===11?project_source_time_view(state,sources):state.schema===10?project_outcome_view(state,outcomes):state.schema===9?project_intelligence_view(state,intelligence):state.schema===8?project_mission_view(state,missions):state.schema===7?project_play_view(state,registered):project_legacy_view(state);}
export class Game {
  private writer_owner:Game|null=null;
  private epoch: number | null = null;
  private faulted=false;
  private history:StoredState|null=null;
  private readonly validated_source_tasks=new WeakSet<object>();
  private readonly verified_replay_states=new Set<string>();
  constructor(readonly store: Persistence,private readonly fixture:{knowledge_collection_surface?:'default'|'empty';knowledge_collection_gate_profile?:import('./knowledge-collection-definition').KnowledgeCollectionGateProfile;conflicting_facility?:'operable'|'faulted';integrated_guidance_loss_at?:number|null;integrated_spares?:0|1;integrated_environment?:import('./integrated-field-environment').IntegratedEnvironmentProfile;integrated_protection_loss?:import('./integrated-field-work').IntegratedProtectionLoss|null;integrated_repeat_terminal_delivery?:boolean;integrated_functional_failure?:boolean;integrated_wet_all_time?:boolean;integrated_sensitivity?:import('../integrated-field-contracts').IntegratedSensitivity}={}) {}
  private remember_replay_state(integrity:string){
    this.verified_replay_states.add(integrity);
    if(this.verified_replay_states.size>64)this.verified_replay_states.delete(this.verified_replay_states.values().next().value!);
  }
  private async validate_package(state:StoredState|undefined){
    if(state?.schema===13){
      if(!json_data(state)||typeof state.integrity!=='string'||await state_hash(state)!==state.integrity)throw new GameError('INVALID_SAVE');
      await load_definition(state.definition);
      if(!this.verified_replay_states.has(state.integrity)){await validate_state(state);this.remember_replay_state(state.integrity);}return;
    }
    if(state?.schema!==7&&state?.schema!==9&&state?.schema!==10){await validate_state(state,this.store.play_definitions,this.store.mission_definitions,this.store.intelligence_definitions,this.store.outcome_definitions,this.store.source_definitions);return;}
    try{
      if(!json_data(state)||typeof state.integrity!=='string'||await state_hash(state)!==state.integrity)throw new GameError('INVALID_SAVE');
      await load_definition(state.schema===10?outcome_definition_for_package(state.definition_hash,this.store.outcome_definitions):state.schema===9?intelligence_definition_for_package(state.definition_hash,this.store.intelligence_definitions):play_definition_for_package(state.definition_hash,this.store.play_definitions),this.store.play_definitions,this.store.mission_definitions,this.store.intelligence_definitions,this.store.outcome_definitions,this.store.source_definitions);
      if(!this.verified_replay_states.has(state.integrity)){
        await validate_state(state,this.store.play_definitions,this.store.mission_definitions,this.store.intelligence_definitions,this.store.outcome_definitions,this.store.source_definitions);
        this.remember_replay_state(state.integrity);
      }
    }catch{throw new GameError('INVALID_SAVE');}
  }
  private async validate_stored_state(state:StoredState){
    if(this.validated_source_tasks.has(state)&&state.schema===10&&is_conflicting_task_hash(state.definition_hash)){
      // Only a task obtained from an already validated schema12 snapshot may
      // reach metadata readers. The public standalone-schema gate stays shut.
      if(!json_data(state)||typeof state.integrity!=='string'||await state_hash(state)!==state.integrity)throw new GameError('INVALID_SAVE');
      await load_outcome_definition(outcome_definition_for_package(state.definition_hash));return;
    }
    if(this.validated_source_tasks.has(state)){await this.validate_package(state);return;}

    await this.validate_package(state);
    if(state.schema!==6&&state.schema!==7&&state.schema!==8&&state.schema!==9&&state.schema!==10&&state.schema!==11&&state.schema!==12&&state.schema!==13&&state.schema!==14)return;
    const identity=(value:StoredState)=>JSON.stringify(canonical({run_id:value.run_id,schema:value.schema,contract:value.contract,definition_hash:value.definition_hash,hashes:value.hashes,mode:value.mode,initial_conditions:value.schema===14?value.initial_conditions:undefined,source_run:value.source_run,rng:value.rng,case_ref:value.schema===6?value.prestart?.case_ref:undefined,facility_initial:value.schema===12?value.facility.initial:undefined,origin_generation:value.schema===13?value.origin_generation:undefined,guidance_loss_at:value.schema===13?value.guidance_loss_at:undefined,initial_spares:value.schema===13?value.work.initial_spares:undefined,environment_profile:value.schema===13?value.environment.profile:undefined,sensitivity:value.schema===13?value.sensitivity:undefined,wet_all_time:value.schema===13?value.wet_all_time:undefined,functional_failure:value.schema===13?value.work.functional_failure:undefined,protection_loss:value.schema===13?value.work.protection_loss:undefined,repeat_terminal_delivery:value.schema===13?value.work.repeat_terminal_delivery:undefined}));
    const seen=new Set<string>();let current=state;
    while(true){
      if(seen.has(current.run_id))throw new GameError('INVALID_SAVE');seen.add(current.run_id);
      const initial=await this.store.snapshot(current.run_id,1);
      await this.validate_package(initial);
      if(!initial||initial.schema!==current.schema||initial.revision!==1||identity(current)!==identity(initial))throw new GameError('INVALID_SAVE');
      if(current.source_run===null)return;
      const parent=await this.store.read_committed(current.source_run);
      await this.validate_package(parent);
      if(!parent||parent.schema!==current.schema||parent.definition_hash!==current.definition_hash||((current.schema===7||current.schema===8||current.schema===9||current.schema===10||current.schema===11||current.schema===12||current.schema===13||current.schema===14)&&parent.mode!==current.mode)||(current.schema===6&&(parent.schema!==6||parent.prestart?.case_ref!==current.prestart?.case_ref))||parent.rng.origin!==current.rng.origin||!await this.store.is_read_only(parent.run_id))throw new GameError('INVALID_SAVE');
      if(parent.schema!==6&&parent.schema!==7&&parent.schema!==8&&parent.schema!==9&&parent.schema!==10&&parent.schema!==11&&parent.schema!==12&&parent.schema!==13&&parent.schema!==14)throw new GameError('INVALID_SAVE');current=parent;
    }
  }
  private assert_current(){if(this.history)throw new GameError('HISTORY_READ_ONLY');}
  private async assert_writable(run:string){this.assert_current();if(await this.store.is_read_only(run))throw new GameError('HISTORY_READ_ONLY');}
  async restart_run(run:string,operation:string):Promise<PlayerView>{
    this.assert_current();if(!valid_id(run)||!valid_id(operation))throw new GameError('INVALID_INPUT');
    const source=await this.store.read_committed(run);if(!source)throw new GameError('RUN_NOT_FOUND');await this.validate_stored_state(source);
    return this.create(source.schema===13?{schema:13,contract:'0.5.1',package_ref:{id:'INTEGRATED-FIELD-PACK-3',version:1}}:source.schema===12?conflicting_definition_for_package(source.definition_hash):source.schema===11?source_time_definition_for_package(source.definition_hash,this.store.source_definitions):source.schema===10?outcome_definition_for_package(source.definition_hash,this.store.outcome_definitions):source.schema===9?intelligence_definition_for_package(source.definition_hash,this.store.intelligence_definitions):source.schema===8?mission_definition_for_package(source.definition_hash,this.store.mission_definitions):source.schema===7?play_definition_for_package(source.definition_hash,this.store.play_definitions):definition_for_package(source.schema,source.definition_hash),source.mode,operation,source,source.schema===6?source.prestart?.case_ref??'normal':'normal');
  }
  async get_replay(run:string,to:number,nodeRevision?:number):Promise<Game>{
    if(!valid_id(run)||!Number.isSafeInteger(to)||to<0)throw new GameError('INVALID_INPUT');
    const latest=await this.store.read_committed(run),initial=await this.store.snapshot(run,1);
    if(!latest||!initial)throw new GameError('RUN_NOT_FOUND');
    await this.validate_stored_state(latest);await validate_state(initial,this.store.play_definitions,this.store.mission_definitions,this.store.intelligence_definitions,this.store.outcome_definitions,this.store.source_definitions);
    if(to>latest.sim_time)throw new GameError('INVALID_INPUT');
    const context=new Game(this.store);
    // A history context is a reader owned by this same Game/Worker. Its
    // debrief metadata must use that owner lease, never claim a second writer.
    context.writer_owner=this.writer_owner??this;
    if((latest.schema===8||latest.schema===9||latest.schema===10||latest.schema===11||latest.schema===12||latest.schema===13)&&initial.schema===latest.schema&&nodeRevision===undefined&&to===latest.sim_time){context.history=latest;return context;}
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
    if(initial.schema===8||initial.schema===9||initial.schema===10||initial.schema===11||initial.schema===12||initial.schema===13||initial.schema===14)throw new GameError('INVALID_INPUT');
    if(latest.schema===8||latest.schema===9||latest.schema===10||latest.schema===11||latest.schema===12||latest.schema===13||latest.schema===14)throw new GameError('INVALID_SAVE');
    context.history=initial.schema===7?replay_play_state(initial,latest.inputs,to,this.store.play_definitions):replay_state(initial,latest.inputs,to);return context;
  }
  private async writer():Promise<number> {
    if(this.writer_owner)return this.writer_owner.writer();
    if (this.epoch === null) this.epoch = await this.store.claim_writer();
    return this.epoch;
  }
  private async commit(state:StoredState,expected:number|null,operation_id:string,fingerprint:string){
    try{
      await this.store.commit_batch(state,await this.writer(),expected,operation_id,fingerprint);
      // Only successful private Game transitions may seed the bounded cache.
      // Every later read still hashes the actual body and checks its lineage.
      if(state.schema===7||state.schema===9||state.schema===13)this.remember_replay_state(state.integrity!);
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
    const definition = await load_definition(input,this.store.play_definitions,this.store.mission_definitions,this.store.intelligence_definitions,this.store.outcome_definitions,this.store.source_definitions);
    if(definition.schema===6)prestart_case({schema:definition.schema,definition_hash:definition.definition_hash},case_ref);
    else if(case_ref!=='normal')throw new GameError('INVALID_INPUT');
    if (!["command", "research"].includes(mode) || !valid_id(operation))
      throw new GameError("INVALID_INPUT");
    const creationFingerprint=(source
      ? `clone:${source.run_id}:${definition.id}:${definition.definition_hash}:${mode}`
      : `create:${definition.id}:${definition.definition_hash}:${mode}`)+(definition.schema===6?`:${case_ref}`:'')+(definition.schema===13?':'+integrated_work_configuration(source?.schema===13?source.sensitivity:this.fixture.integrated_sensitivity??'nominal'):'');
    const previous = await this.store.creation(operation);
    if (previous) {
      const snapshot = await this.store.snapshot(
        previous.run_id,
        previous.revision,
      );
      if (!snapshot) throw new GameError("STORAGE_UNCONFIRMED");
      await validate_state(snapshot,this.store.play_definitions,this.store.mission_definitions,this.store.intelligence_definitions,this.store.outcome_definitions,this.store.source_definitions);
      const legacyFingerprint=source?`clone:${source.run_id}:${mode}`:`create:${mode}`;
      if(snapshot.definition_hash!==definition.definition_hash||snapshot.mode!==mode||snapshot.source_run!==(source?.run_id??null)||
        previous.fingerprint!==creationFingerprint&&!(snapshot.schema===4&&previous.fingerprint===legacyFingerprint))
        throw new GameError('OPERATION_CONFLICT');
      return project_player_view(snapshot,this.store.play_definitions,this.store.mission_definitions,this.store.intelligence_definitions,this.store.outcome_definitions,this.store.source_definitions);
    }
    if(this.faulted)throw new GameError('STORAGE_UNCONFIRMED');
    if(source)await this.assert_writable(source.run_id);
    const epoch = await this.writer(),
      run_id = crypto.randomUUID();
    if(is_knowledge_collection_definition(definition)){
      const surface=source?.schema===14?source.initial_conditions.surface:this.fixture.knowledge_collection_surface??'default';
      const gateProfile=source?.schema===14?source.initial_conditions.gate_profile:this.fixture.knowledge_collection_gate_profile??'normal';
      const state=initial_knowledge_collection_state(definition,run_id,mode,epoch,source?.run_id??null,source?.rng.origin??run_id,surface,gateProfile);
      await this.commit(state,null,operation,creationFingerprint);return project_knowledge_collection_view(state);
    }
    if(is_integrated_field_definition(definition)){
      const origin=source?.schema===13?source:null,state=initial_integrated_field_state(definition,run_id,mode,epoch,origin?.run_id??null,origin?.rng.origin??run_id,{guidance_loss_at:origin?origin.guidance_loss_at:this.fixture.integrated_guidance_loss_at??null,initial_spares:origin?.work.initial_spares??this.fixture.integrated_spares??1,environment_profile:origin?.environment.profile??this.fixture.integrated_environment??'nominal',report_fixture:{protection_loss:origin?origin.work.protection_loss:this.fixture.integrated_protection_loss,repeat_terminal_delivery:origin?origin.work.repeat_terminal_delivery:this.fixture.integrated_repeat_terminal_delivery,functional_failure:origin?origin.work.functional_failure:this.fixture.integrated_functional_failure},sensitivity:origin?.sensitivity??this.fixture.integrated_sensitivity??'nominal',wet_all_time:origin?origin.wet_all_time:this.fixture.integrated_wet_all_time});
      await this.commit(state,null,operation,creationFingerprint);return project_integrated_field_view(state);
    }
    if(is_conflicting_action_definition(definition)){const state=await initial_conflicting_state(definition,run_id,mode,epoch,source?.run_id??null,source?.rng.origin??run_id,source?.schema===12?source.facility.initial:this.fixture.conflicting_facility);await this.commit(state,null,operation,creationFingerprint);return project_conflicting_action_view(state);}
    if(is_source_time_definition(definition)){const state=await initial_source_time_state(definition,run_id,mode,epoch,source?.run_id??null,source?.rng.origin??run_id);await this.commit(state,null,operation,creationFingerprint);return project_source_time_view(state,this.store.source_definitions);}
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
    return project_player_view(state,this.store.play_definitions,this.store.mission_definitions,this.store.intelligence_definitions,this.store.outcome_definitions,this.store.source_definitions);
  }
  async get_view(run: string): Promise<PlayerView> {
    if(this.history){if(run!==this.history.run_id)throw new GameError('RUN_NOT_FOUND');const view=project_player_view(this.history,this.store.play_definitions,this.store.mission_definitions,this.store.intelligence_definitions,this.store.outcome_definitions,this.store.source_definitions);return this.history.schema>=5?{...view,can_issue:false,next_action:'历史记录只能查看，请返回当前行动后安排任务'}:view;}
    const state = await this.store.read_committed(run);
    if (!state) throw new GameError("RUN_NOT_FOUND");
    await this.validate_stored_state(state);
    const view=project_player_view(state,this.store.play_definitions,this.store.mission_definitions,this.store.intelligence_definitions,this.store.outcome_definitions,this.store.source_definitions);
    if(await this.store.is_read_only(run)){view.can_issue=false;view.next_action='查看保留的行动记录';view.gap='这场行动已保留为只读记录';}
    return view;
  }
  private async outcome_current(run:string){const outer=this.history?.run_id===run?this.history:await this.store.read_committed(run);if(outer?.schema===11||outer?.schema===12){await this.validate_stored_state(outer);this.validated_source_tasks.add(outer.task);return outer.task;}return outer;}
  private async outcome_snapshot(run:string,revision:number){const outer=await this.store.snapshot(run,revision);if(outer?.schema===11||outer?.schema===12){await this.validate_stored_state(outer);this.validated_source_tasks.add(outer.task);return outer.task;}return outer;}
  async get_outcome_fairness(run:string){
    if(!valid_id(run))throw new GameError('INVALID_REQUEST');
    const state=await this.outcome_current(run);
    if(this.history&&this.history.run_id!==run||state?.schema!==10)throw new GameError('INVALID_REQUEST');
    await this.validate_stored_state(state);
    return this.store.outcome_fairness(run,state.definition_hash);
  }
  async get_outcome_debrief_state(run:string){
    if(!valid_id(run))throw new GameError('INVALID_REQUEST');
    const state=await this.outcome_current(run);
    if(this.history&&this.history.run_id!==run||state?.schema!==10||!state.finished)throw new GameError('DEBRIEF_NOT_AVAILABLE');
    await this.validate_stored_state(state);const anchor=await this.store.outcome_debrief_anchor(run);if(!anchor)return null;
    if(!['created','ready','viewing','archived'].includes(anchor.status)||!Number.isSafeInteger(anchor.lifecycle_revision)||anchor.lifecycle_revision<0||!['terminal_commit','legacy_explicit_open'].includes(anchor.origin)||anchor.finished_seq>state.revision)throw new GameError('INVALID_SAVE');
    const sealed=await this.outcome_snapshot(run,anchor.finished_seq);if(sealed?.schema!==10||!sealed.finished)throw new GameError('INVALID_SAVE');await this.validate_stored_state(sealed);
    const expected=create_outcome_debrief_anchor(sealed,outcome_definition_for_package(sealed.definition_hash,this.store.outcome_definitions),anchor.origin);
    if(JSON.stringify(canonical({...anchor,status:'created',lifecycle_revision:0}))!==JSON.stringify(canonical(expected)))throw new GameError('INVALID_SAVE');
    // The private participation index is sealed metadata, not a default HQ
    // view. Project every public binding explicitly instead of spreading it.
    const publicAnchor:import('../outcome-contracts').OutcomeDebriefAnchor={run_id:anchor.run_id,run_digest:anchor.run_digest,finished_seq:anchor.finished_seq,template_version:anchor.template_version,policy_ref:anchor.policy_ref,evaluation_profile_ref:anchor.evaluation_profile_ref,origin:anchor.origin,status:anchor.status,lifecycle_revision:anchor.lifecycle_revision};
    return structuredClone(publicAnchor);
  }
  async open_outcome_debrief(run:string){
    if(!valid_id(run))throw new GameError('INVALID_REQUEST');
    const state=await this.outcome_current(run);
    if(this.history&&this.history.run_id!==run||state?.schema!==10||!state.finished||!state.integrity)throw new GameError('DEBRIEF_NOT_AVAILABLE');
    await this.validate_stored_state(state);
    // A later save/restore receipt is not a new terminal event. Bind the
    // session to the first actually committed finished snapshot, never to a
    // later administrative revision or reconstructed hypothetical history.
    let low=1,high=state.revision;
    while(low<high){const middle=Math.floor((low+high)/2),node=await this.outcome_snapshot(run,middle);if(node?.schema!==10)throw new GameError('INVALID_SAVE');if(node.finished)high=middle;else low=middle+1;}
    const sealed=await this.outcome_snapshot(run,low);
    if(sealed?.schema!==10||!sealed.finished||!sealed.integrity)throw new GameError('INVALID_SAVE');
    await this.validate_stored_state(sealed);
    const definition=outcome_definition_for_package(sealed.definition_hash,this.store.outcome_definitions);
    if(!await this.store.outcome_debrief_anchor(run)&&outcome_decision_profile_for(definition)===null)await this.store.initialize_legacy_debrief_anchor(create_outcome_debrief_anchor(sealed,definition,'legacy_explicit_open'),await this.writer());
    const anchor=await this.get_outcome_debrief_state(run);if(!anchor||anchor.run_digest!==sealed.integrity||anchor.finished_seq!==sealed.revision)throw new GameError('INVALID_SAVE');
    const session=create_outcome_debrief(project_outcome_view(sealed,this.store.outcome_definitions),sealed.integrity);
    try{
      const stored=await this.store.outcome_debrief_anchor(run);if(!stored)throw new GameError('INVALID_SAVE');
      const sources=new Map<string,import('../outcome-contracts').OutcomeDebriefAnswer['entries']>();
      for(const participant of stored.participant_index)sources.set(participant.actor,await this.outcome_evidence_at(sealed,participant.actor));
      const template=create_outcome_participant_template(stored,sources);
      return await this.store.ensure_outcome_debrief(session,template,await this.writer());
    }catch(error){if(error instanceof GameError)throw error;throw new GameError('DEBRIEF_BUILD_FAILED');}
  }
  async get_outcome_participants(input:unknown){
    const query=parse_outcome_participant_query(input),anchor=await this.get_outcome_debrief_state(query.run_id);
    if(!anchor||anchor.run_digest!==query.run_digest||anchor.finished_seq!==query.finished_seq)throw new GameError('DEBRIEF_QUERY_REJECTED');
    await this.open_outcome_debrief(query.run_id);
    return this.store.outcome_debrief_template(query.run_id);
  }
  async transition_outcome_debrief(input:unknown){
    const request=parse_outcome_debrief_transition(input),anchor=await this.get_outcome_debrief_state(request.run_id);
    if(!anchor||anchor.run_digest!==request.run_digest||anchor.finished_seq!==request.finished_seq)throw new GameError('DEBRIEF_QUERY_REJECTED');
    if(anchor.status==='created')throw new GameError('DEBRIEF_NOT_AVAILABLE');
    await this.open_outcome_debrief(request.run_id);
    const digest=await hash(canonical(request));
    try{return await this.store.transition_outcome_debrief(request,digest,await this.writer());}catch(error){if(error instanceof GameError)throw error;throw new GameError('DEBRIEF_BUILD_FAILED');}
  }
  async get_outcome_rejections(run_id:string){
    if(!valid_id(run_id)||this.history&&this.history.run_id!==run_id)throw new GameError('INVALID_REQUEST');
    const state=await this.outcome_current(run_id);if(state?.schema!==10)throw new GameError('INVALID_REQUEST');await this.validate_stored_state(state);
    const rejections=await this.store.outcome_rejections(run_id);
    for(const rejection of rejections){
      const {ref,...body}=rejection,source=await this.outcome_snapshot(run_id,rejection.source_revision);
      if(source?.schema!==10||source.finished||source.integrity!==rejection.source_digest||ref.run_id!==run_id||ref.kind!=='rejected_decision'||ref.version!==1||ref.id!=='REJECT-'+await hash(canonical(body))||!outcome_rejection_codes.some(code=>code===rejection.code)||rejection.request.run_id!==run_id||rejection.code==='STALE_REVISION'&&rejection.request.expected_revision===source.revision||!Number.isSafeInteger(rejection.attempt_seq)||rejection.attempt_seq<1)throw new GameError('INVALID_SAVE');
      await this.validate_stored_state(source);const expected=await create_outcome_rejection(source,rejection.request,rejection.code,this.store.outcome_definitions),{attempt_seq,...draft}=body;void attempt_seq;
      if(JSON.stringify(canonical(expected))!==JSON.stringify(canonical(draft)))throw new GameError('INVALID_SAVE');
    }
    if(new Set(rejections.map(rejection=>rejection.attempt_seq)).size!==rejections.length)throw new GameError('INVALID_SAVE');
    return rejections.filter(rejection=>this.history?rejection.source_revision<state.revision:rejection.source_revision<=state.revision);
  }
  async evaluate_outcome_decision(raw:unknown){
    const input=parse_outcome_decision_query(raw);
    const session=await this.open_outcome_debrief(input.run_id);if(input.run_digest!==session.run_digest||input.finished_seq!==session.finished_seq)throw new GameError('DEBRIEF_QUERY_REJECTED');
    const sealed=await this.outcome_snapshot(input.run_id,session.finished_seq);if(sealed?.schema!==10)throw new GameError('INVALID_SAVE');
    const decisionRef=input.decision_ref;
    if(decisionRef.kind==='rejected_decision'){
      const rejection=(await this.get_outcome_rejections(input.run_id)).find(rejection=>rejection.ref.id===decisionRef.id);if(!rejection||rejection.source_revision>=session.finished_seq)throw new GameError('DEBRIEF_QUERY_REJECTED');
      const source=await this.outcome_snapshot(input.run_id,rejection.source_revision);return evaluate_outcome_rejection(rejection,outcome_definition_for_package(sealed.definition_hash,this.store.outcome_definitions),{run_id:session.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq},{record:rejection,source_digest:source?.integrity});
    }
    const decision=sealed.decision_records.find(decision=>JSON.stringify(canonical(decision.ref))===JSON.stringify(canonical(input.decision_ref)));if(!decision)throw new GameError('DEBRIEF_QUERY_REJECTED');
    const original=await this.outcome_snapshot(input.run_id,decision.knowledge_revision+1);if(original?.schema!==10)throw new GameError('INVALID_SAVE');await this.validate_stored_state(original);
    const receipt=await this.store.receipt(input.run_id,decision.operation_id),evidence=await hq_outcome_evidence(project_outcome_view(original,this.store.outcome_definitions));
    return evaluate_outcome_decision_record(decision,outcome_definition_for_package(sealed.definition_hash,this.store.outcome_definitions),{run_id:session.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq},{receipt,evidence});
  }
  private async validate_outcome_inference_sources(request:import('../outcome-contracts').OutcomeInferenceRequest,node:import('./outcome-state').OutcomeState){
    // A historical ref may legitimately change later. Validate the exact
    // supplied committed node; never infer its revision from an ID or time.
    const nodes=new Map<number,import('./outcome-state').OutcomeState>([[node.revision,node]]),indices=new Map<string,import('../outcome-contracts').OutcomeDebriefAnswer['entries']>();
    for(const source of [request.target,...request.basis_refs]){
      const ref=source.ref;if(ref.layer==='retrospective_inference'||ref.layer==='engine_event'&&!await this.store.has_outcome_truth_exposure(request.run_id,request.run_digest,request.finished_seq))throw new GameError('DEBRIEF_QUERY_REJECTED');
      let selected=nodes.get(source.as_of_revision);
      if(!selected){const saved=await this.outcome_snapshot(request.run_id,source.as_of_revision);if(saved?.schema!==10||saved.run_id!==node.run_id||saved.revision!==source.as_of_revision||saved.definition_hash!==node.definition_hash)throw new GameError('DEBRIEF_QUERY_REJECTED');await this.validate_stored_state(saved);selected=saved;nodes.set(source.as_of_revision,selected);}
      const key=source.as_of_revision+':'+ref.actor_scope+':'+ref.layer;let entries=indices.get(key);if(!entries){entries=await this.outcome_evidence_at(selected,ref.actor_scope,ref.layer);indices.set(key,entries);}
      const identity=JSON.stringify(canonical(ref));if(!entries.some(entry=>JSON.stringify(canonical(entry.ref))===identity))throw new GameError('DEBRIEF_QUERY_REJECTED');
    }
  }
  async append_outcome_inference(input:unknown){
    const request=parse_outcome_inference_request(input),anchor=await this.get_outcome_debrief_state(request.run_id);
    if(!anchor||anchor.run_digest!==request.run_digest||anchor.finished_seq!==request.finished_seq)throw new GameError('DEBRIEF_QUERY_REJECTED');if(anchor.status==='created')throw new GameError('DEBRIEF_NOT_AVAILABLE');
    const node=await this.outcome_snapshot(request.run_id,request.finished_seq);if(node?.schema!==10||!node.finished||node.integrity!==request.run_digest)throw new GameError('INVALID_SAVE');await this.validate_stored_state(node);
    await this.validate_outcome_inference_sources(request,node);await this.open_outcome_debrief(request.run_id);
    const digest=await hash(canonical(request)),target=await hash(canonical(request.target.ref)),id='NOTE-'+await hash(canonical({run_id:request.run_id,operation_id:request.operation_id}));
    try{return await this.store.append_outcome_inference(request,digest,target,id,new Date().toISOString(),await this.writer());}catch(error){if(error instanceof GameError)throw error;throw new GameError('DEBRIEF_BUILD_FAILED');}
  }
  private async saved_outcome_inferences(node:import('./outcome-state').OutcomeState){
    const rows=await this.store.outcome_inferences(node.run_id),versions=new Map<string,number>();
    for(const [index,row] of rows.entries()){
      const request=parse_outcome_inference_request(row.request),note=row.note;
      if(request.run_id!==node.run_id||request.run_digest!==node.integrity||request.finished_seq!==node.revision||row.request_digest!==await hash(canonical(request))||!Number.isSafeInteger(note.created_sequence)||note.created_sequence!==index+1||typeof note.created_time!=='string'||!Number.isFinite(Date.parse(note.created_time))||new Date(note.created_time).toISOString()!==note.created_time)throw new GameError('INVALID_SAVE');
      const target=await hash(canonical(request.target.ref)),version=(versions.get(target)??0)+1;if(request.expected_version!==version-1)throw new GameError('INVALID_SAVE');versions.set(target,version);
      const {expected_version,...body}=request;void expected_version;const expected={...body,id:'NOTE-'+await hash(canonical({run_id:request.run_id,operation_id:request.operation_id})),version,created_sequence:index+1,created_time:note.created_time,speaker_mode:'user',layer:'retrospective_inference'};
      if(JSON.stringify(canonical(note))!==JSON.stringify(canonical(expected)))throw new GameError('INVALID_SAVE');await this.validate_outcome_inference_sources(request,node);
    }
    return rows.map(row=>row.note);
  }
  private async outcome_evidence_at(node:import('./outcome-state').OutcomeState,actor:string,layer='known_then'){
    if(layer==='engine_event')return engine_outcome_evidence(node,actor);
    if(layer==='declared_reason')return declared_outcome_evidence(node,actor);
    if(layer==='retrospective_inference')return actor==='HQ'&&node.finished?retrospective_outcome_evidence(await this.saved_outcome_inferences(node)):[];
    if(actor!=='HQ')return local_outcome_evidence(node,actor);
    const receipts=await Promise.all(node.inputs.map(async input=>{const receipt=await this.store.receipt(node.run_id,input.envelope.operation_id);if(!receipt||receipt.revision>node.revision)throw new GameError('INVALID_SAVE');return {...receipt};}));
    return hq_outcome_evidence(project_outcome_view(node,this.store.outcome_definitions),receipts,(await this.get_outcome_rejections(node.run_id)).filter(rejection=>rejection.source_revision<node.revision));
  }
  async query_outcome_debrief(input:unknown):Promise<import('../outcome-contracts').OutcomeDebriefAnswer>{
    const query=parse_outcome_debrief_query(input);
    const session=await this.open_outcome_debrief(query.run_id);
    const answer:import('../outcome-contracts').OutcomeDebriefAnswer={run_id:query.run_id,run_digest:query.run_digest,finished_seq:query.finished_seq,topic:query.topic,notes:[],status:'rejected',actor:query.actor,layer:query.layer,as_of_revision:query.as_of_revision,entries:[],missing:['当前查询没有合法记录权限']};
    if(query.run_digest!==session.run_digest||query.finished_seq!==session.finished_seq||query.as_of_revision>session.finished_seq||query.layer!=='known_then'&&query.layer!=='declared_reason'&&query.layer!=='retrospective_inference'&&!(query.layer==='engine_event'&&session.truth_exposure)||!['HQ','R','W','INTEL','H','ArchiveSource'].includes(query.actor))return answer;
    const node=await this.outcome_snapshot(query.run_id,query.as_of_revision);
    if(node?.schema!==10)throw new GameError('INVALID_SAVE');await this.validate_stored_state(node);
    const selected=outcome_topic(query.topic,await this.outcome_evidence_at(node,query.actor,query.layer));
    if(!selected)return {...answer,status:'unsupported',missing:['请选择已提供的八个结构化主题；自由解析、导出和反事实当前未提供。']};
    return {...answer,...selected,status:selected.entries.length?'answered':'insufficient_record'};
  }
  async resolve_outcome_evidence(input:unknown):Promise<import('../outcome-contracts').OutcomeEvidenceResolution>{
    const {ref,...query}=parse_outcome_evidence_request(input),answer=await this.query_outcome_debrief(query);
    const rejected:import('../outcome-contracts').OutcomeEvidenceResolution={status:'rejected',missing:['所选主体、层或提交节点没有可核验的引用']};
    // Validate against an index derived from this actor's lawful as-of view.
    // Looking up a hidden record first would leak its existence via errors.
    if(answer.status!=='answered')return rejected;
    const entry=answer.entries.find(e=>JSON.stringify(canonical(e.ref))===JSON.stringify(canonical(ref)));
    if(!entry)return rejected;
    // Find the first real commit where this very reference was lawful for
    // this actor. The caller's later query node is not the record's origin.
    const identity=JSON.stringify(canonical(entry.ref));let first=1,last=query.as_of_revision as number;
    while(first<last){
      const middle=Math.floor((first+last)/2),candidate=await this.outcome_snapshot(query.run_id as string,middle);
      if(candidate?.schema!==10)throw new GameError('INVALID_SAVE');await this.validate_stored_state(candidate);
      const lawful=await this.outcome_evidence_at(candidate,answer.actor,answer.layer);
      if(lawful.some(e=>JSON.stringify(canonical(e.ref))===identity))last=middle;else first=middle+1;
    }
    const node=await this.outcome_snapshot(query.run_id as string,first);
    if(node?.schema!==10)throw new GameError('INVALID_SAVE');
    return {status:'answered',entry,history:{run_id:node.run_id,revision:node.revision,at:node.sim_time,actor:answer.actor,layer:answer.layer,read_only:true}};
  }
  private async integrated_terminal(run:string){
    if(!valid_id(run))throw new GameError('INVALID_INPUT');const current=this.history?.run_id===run?this.history:await this.store.read_committed(run);
    if(current?.schema!==13||!current.finished||!current.dag.result)throw new GameError('DEBRIEF_NOT_AVAILABLE');await this.validate_stored_state(current);
    const sealed=await this.store.snapshot(run,current.dag.result.finished_seq);if(sealed?.schema!==13||!sealed.finished||sealed.dag.result?.finished_seq!==sealed.revision||sealed.definition_hash!==current.definition_hash)throw new GameError('INVALID_SAVE');await this.validate_stored_state(sealed);return sealed;
  }
  async open_integrated_debrief(run:string){const sealed=await this.integrated_terminal(run);return this.store.ensure_integrated_debrief(create_integrated_debrief(sealed),await this.writer());}
  async request_integrated_truth(input:unknown):Promise<import('../integrated-field-contracts').IntegratedTruthPayload>{
    const request=parse_integrated_truth_request(input),sealed=await this.integrated_terminal(request.run_id),session=await this.open_integrated_debrief(request.run_id);if(request.run_digest!==session.run_digest||request.finished_seq!==session.finished_seq)throw new GameError('DEBRIEF_QUERY_REJECTED');
    const facts=integrated_truth_facts(sealed),payload_digest=await hash(facts),grant=await this.store.grant_integrated_truth(request,await hash(canonical(request)),payload_digest,await this.writer());return{run_id:session.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,layer:'engine_event',grant:{operation_id:grant.operation_id,metadata_revision:grant.metadata_revision,payload_digest:grant.payload_digest},facts};
  }
  async confirm_integrated_truth(input:unknown){const request=parse_integrated_truth_request(input,true) as import('../integrated-field-contracts').IntegratedTruthAcknowledgement,session=await this.open_integrated_debrief(request.run_id);if(request.run_digest!==session.run_digest||request.finished_seq!==session.finished_seq)throw new GameError('DEBRIEF_QUERY_REJECTED');return this.store.confirm_integrated_truth(request,await this.writer());}
  async get_integrated_fairness(run:string){if(!valid_id(run))throw new GameError('INVALID_INPUT');const state=await this.store.read_committed(run);if(state?.schema!==13)throw new GameError('INVALID_INPUT');await this.validate_stored_state(state);return this.store.integrated_fairness(run,state.definition_hash);}
  async request_outcome_truth(input:unknown):Promise<import('../outcome-contracts').OutcomeTruthPayload>{
    const request=parse_outcome_truth_request(input),session=await this.open_outcome_debrief(request.run_id);
    if(request.run_digest!==session.run_digest||request.finished_seq!==session.finished_seq)throw new GameError('DEBRIEF_QUERY_REJECTED');
    const sealed=await this.outcome_snapshot(request.run_id,session.finished_seq);
    if(sealed?.schema!==10)throw new GameError('INVALID_SAVE');
    const facts=outcome_truth_facts(sealed),payload_digest=await hash(facts),request_digest=await hash(canonical(request));
    const grant=await this.store.grant_outcome_truth(request,request_digest,payload_digest,await this.writer());
    return {run_id:session.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,layer:'engine_event',grant:{operation_id:grant.operation_id,metadata_revision:grant.metadata_revision,payload_digest:grant.payload_digest},facts};
  }
  async confirm_outcome_truth(input:unknown){
    const request=parse_outcome_truth_request(input,true) as import('../outcome-contracts').OutcomeTruthAcknowledgement,session=await this.open_outcome_debrief(request.run_id);
    if(request.run_digest!==session.run_digest||request.finished_seq!==session.finished_seq)throw new GameError('DEBRIEF_QUERY_REJECTED');
    const confirmation=await this.store.confirm_outcome_truth(request,await this.writer());
    return {run_id:request.run_id,run_digest:request.run_digest,finished_seq:request.finished_seq,operation_id:request.operation_id,payload_digest:request.payload_digest,...confirmation};
  }
  async get_actor_view(run:string,actor:string){
    if(!valid_id(run)||!valid_id(actor))throw new GameError('INVALID_INPUT');
    const outer=this.history?.run_id===run?this.history:await this.store.read_committed(run);
    if(!outer)throw new GameError('RUN_NOT_FOUND');await this.validate_stored_state(outer);const state=(outer.schema===11||outer.schema===12)?outer.task:outer;
    if(state.schema===10){
      const abort = state.abort_notifications.find(n=>n.target===actor&&n.received!==null);const termination = abort&&state.termination?{received_at:abort.received,cleanup_deadline:state.termination.cleanup_deadline}:null;
      if(actor==='INTEL')return {run_id:run,actor:'INTEL',termination,sim_time:state.sim_time,work:structuredClone(state.prefix.processing.items),verification_batches:structuredClone(state.verification_batches),received_manifests:structuredClone(state.reception_manifests.filter(m=>state.reception_deliveries.some(d=>d.target==='INTEL'&&d.received<=state.sim_time&&state.reception_reports.some(r=>r.ref.id===d.report_ref.id&&r.phase==='completed'&&r.batch_ref.id===m.batch_ref.id)))),resources:{energy:state.prefix.processing.energy,energy_reserved:state.prefix.processing.energy_reserved},known_reports:structuredClone(state.reception_deliveries.filter(d=>d.target==='INTEL'&&d.received<=state.sim_time).map(delivery=>({delivery,report:state.reception_reports.find(r=>r.ref.id===delivery.report_ref.id)!}))),published_reports:structuredClone(state.verification_reports),published_status_reports:structuredClone(state.verification_status_reports)};
      const sourceActor=outcome_definition_for_package(state.definition_hash,this.store.outcome_definitions).catalogs.source.actor;
      if(actor===sourceActor)return {run_id:run,actor,sim_time:state.sim_time,work:structuredClone(state.prefix.source.work),resources:structuredClone(state.prefix.source.resources),published_reports:structuredClone(state.prefix.reports.filter(r=>r.id===state.prefix.source.published_report_ref))};
      if(actor==='H'){
return {run_id:run,actor:'H',termination,sim_time:state.sim_time,reception:{reserved_personnel:state.reception_batches.filter(b=>b.status==='running').reduce((n,b)=>n+b.people_ids.length,0),received_personnel:state.person_receipts.length,batches:structuredClone(state.reception_batches)},published_reports:structuredClone(state.reception_reports),handover_confirmations:structuredClone(state.handover_confirmations),person_receipts:structuredClone(state.person_receipts),custody_events:structuredClone(state.custody_events)};}const local=state.prefix.field.actors.find(a=>a.actor===actor);if(!local)throw new GameError('UNSUPPORTED');return {run_id:run,termination,sim_time:state.sim_time,...structuredClone(local),position_scope:local.position.site,activities:structuredClone(state.prefix.field.orders.filter(o=>o.payload.actor_ref.id===actor&&o.arrives_at<=state.sim_time)),artifacts:structuredClone(state.prefix.field.artifacts.filter(a=>a.custody_holder===actor&&!state.custody_events.some(e=>e.artifact_ref.id===a.ref.id))),record_materials:structuredClone(state.prefix.field.materials.filter(m=>state.prefix.field.artifacts.some(a=>a.custody_holder===actor&&a.material_refs.some(ref=>ref.id===m.ref.id)))),known_reports:[],...(outer.schema===11&&actor==='R'&&outer.source_events.some(delivery=>delivery.recipient===actor)?{source_reading:project_source_reading(outer,actor,this.store.source_definitions)}:{}),message_facts:structuredClone(state.prefix.field.messages.filter(m=>m.actor===actor)),published_reports:structuredClone(state.prefix.field.reports.filter(r=>r.actor===actor))};}
    if(state.schema!==9)throw new GameError('INVALID_REQUEST');
    const definition=intelligence_definition_for_package(state.definition_hash,this.store.intelligence_definitions);
    const local=definition.catalogs.actors.find(candidate=>candidate.id===actor);
    if(local){const own=state.field.actors.find(a=>a.actor===actor)!;return {run_id:run,sim_time:state.sim_time,...structuredClone(own),position_scope:own.position.site,activities:structuredClone(state.field.orders.filter(o=>o.payload.actor_ref.id===actor&&o.arrives_at<=state.sim_time)),artifacts:structuredClone(state.field.artifacts.filter(a=>a.custody_holder===actor)),record_materials:structuredClone(state.field.materials.filter(m=>state.field.artifacts.some(a=>a.custody_holder===actor&&a.material_refs.some(ref=>ref.id===m.ref.id)))),known_reports:[],message_facts:structuredClone(state.field.messages.filter(m=>m.actor===actor)),published_reports:structuredClone(state.field.reports.filter(r=>r.actor===actor))};}
    if(actor!==definition.catalogs.source.actor)throw new GameError('UNSUPPORTED');
    return {run_id:run,actor,sim_time:state.sim_time,work:structuredClone(state.source.work),resources:structuredClone(state.source.resources),published_reports:structuredClone(state.reports.filter(r=>r.id===state.source.published_report_ref))};
  }
  async apply_outcome_intent(input:unknown,clock_to?:number):Promise<{receipt:Receipt;view:OutcomePlayerView}>{return record(input)&&record(input.intent)&&input.intent.kind==='save_working_assessment'?this.commit_conflicting_request(parse_working_assessment(input),clock_to):this.commit_outcome_request(parse_outcome_envelope(input),clock_to);}
  async return_and_deliver(input:unknown):Promise<{receipt:Receipt;view:OutcomePlayerView}>{return this.commit_outcome_request(parse_return_and_deliver(input));}
  private async commit_conflicting_request(request:import('../conflicting-action-contracts').ConflictingActionEnvelope,clock_to?:number):Promise<{receipt:Receipt;view:import('../conflicting-action-contracts').ConflictingActionPlayerView}>{
    this.assert_current();await this.assert_writable(request.run_id);const state=await this.store.read_committed(request.run_id);if(state?.schema!==12)throw new GameError('INVALID_REQUEST');await this.validate_stored_state(state);
    const fingerprint=await hash(canonical(request)),prior=await this.store.receipt(state.run_id,request.operation_id);
    if(prior){if(prior.fingerprint!==fingerprint)throw new GameError('OPERATION_ID_REUSED');return {receipt:{run_id:state.run_id,operation_id:request.operation_id,revision:prior.revision,sim_time:prior.sim_time,fingerprint,result:'committed',kind:request.intent.kind,...(request.intent.kind==='restore'?{snapshot_revision:request.intent.snapshot_revision}:{})},view:project_conflicting_action_view(state)};}
    if(this.faulted)throw new GameError('STORAGE_UNCONFIRMED');
    const candidate=await apply_conflicting_action_control(state,request,clock_to);await this.commit(candidate,state.revision,request.operation_id,fingerprint);
    return {receipt:{run_id:state.run_id,operation_id:request.operation_id,revision:candidate.revision,sim_time:candidate.sim_time,fingerprint,result:'committed',kind:request.intent.kind,...(request.intent.kind==='restore'?{snapshot_revision:request.intent.snapshot_revision}:{})},view:project_conflicting_action_view(candidate)};
  }
  private async commit_outcome_request(request:OutcomeEnvelope,clock_to?:number):Promise<{receipt:Receipt;view:OutcomePlayerView}>{
    if((await this.store.read_committed(request.run_id))?.schema===12)return this.commit_conflicting_request(request,clock_to);
    this.assert_current();await this.assert_writable(request.run_id);const outer=await this.store.read_committed(request.run_id);if(!outer)throw new GameError('RUN_NOT_FOUND');await this.validate_stored_state(outer);const state=(outer.schema===11||outer.schema===12)?outer.task:outer;if(state.schema!==10)throw new GameError('INVALID_REQUEST');
    const fingerprint=await hash(canonical(request)),prior=await this.store.receipt(state.run_id,request.operation_id);if(prior){if(prior.fingerprint!==fingerprint)throw new GameError('OPERATION_ID_REUSED');return {receipt:{run_id:state.run_id,operation_id:request.operation_id,revision:prior.revision,sim_time:prior.sim_time,fingerprint,result:'committed',kind:request.intent.kind},view:outer.schema===11?project_source_time_view(outer,this.store.source_definitions):project_outcome_view(state,this.store.outcome_definitions)};}
    if(this.faulted)throw new GameError('STORAGE_UNCONFIRMED');let candidate:import('./outcome-state').OutcomeState;
    try{candidate=await apply_outcome_control(state,request,clock_to,this.store.outcome_definitions);}catch(error){
      const code=error instanceof GameError?outcome_rejection_codes.find(code=>code===error.code):undefined;
      if(!state.finished&&code&&['save_plan','request_source_validation','request_preparation','issue_activity','return_and_deliver','abort_outcome'].includes(request.intent.kind))await this.store.record_outcome_rejection(await create_outcome_rejection(state,request,code,this.store.outcome_definitions),await this.writer());
      throw error;
    }
    const committed=outer.schema===11?await compose_source_time_state(candidate,source_time_definition_for_package(outer.definition_hash,this.store.source_definitions)):candidate;await this.commit(committed,state.revision,request.operation_id,fingerprint);return {receipt:{run_id:state.run_id,operation_id:request.operation_id,revision:candidate.revision,sim_time:candidate.sim_time,fingerprint,result:'committed',kind:request.intent.kind,...(request.intent.kind==='restore'?{snapshot_revision:request.intent.snapshot_revision}:{})},view:committed.schema===11?project_source_time_view(committed,this.store.source_definitions):project_outcome_view(committed,this.store.outcome_definitions)};
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
    await this.validate_stored_state(state);await validate_state(snapshot,this.store.play_definitions,this.store.mission_definitions,this.store.intelligence_definitions,this.store.outcome_definitions,this.store.source_definitions);
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
    if(state.schema===9||state.schema===10||state.schema===11||state.schema===12||state.schema===13||state.schema===14)throw new GameError('INVALID_REQUEST');
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
  async issue_integrated_order(envelope:IntegratedFieldEnvelope,clock_to?:number):Promise<{receipt:Receipt;view:PlayerView}>{
    if(envelope?.intent?.kind!=='integrated_move'||(await this.store.read_committed(envelope.run_id))?.schema!==13)throw new GameError('INVALID_INPUT');
    return this.operate(envelope,clock_to);
  }
  async apply_integrated_intent(envelope:IntegratedFieldEnvelope,clock_to?:number):Promise<{receipt:Receipt;view:PlayerView}>{
    if(!valid_integrated_field_envelope(envelope)||(await this.store.read_committed(envelope.run_id))?.schema!==13)throw new GameError('INVALID_INPUT');
    return this.operate(envelope,clock_to);
  }
  async apply_collection_intent(input:unknown):Promise<{receipt:Receipt;view:PlayerView}>{
    if(!valid_knowledge_collection_envelope(input)||(await this.store.read_committed(input.run_id))?.schema!==14)throw new GameError('INVALID_INPUT');
    return this.operate(input);
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
    envelope: Envelope|IntegratedFieldEnvelope|KnowledgeCollectionEnvelope,
    clock_to?:number,
  ): Promise<{ receipt: Receipt; view: PlayerView }> {
    this.assert_current();
    if (!valid_envelope(envelope,910000,true)&&!valid_integrated_field_envelope(envelope)&&!valid_knowledge_collection_envelope(envelope)) throw new GameError("INVALID_INPUT");
    await this.assert_writable(envelope.run_id);
    const state = await this.store.read_committed(envelope.run_id);
    if(!state)throw new GameError('RUN_NOT_FOUND');
    if(state.schema===14){
      if(!valid_knowledge_collection_envelope(envelope))throw new GameError('INVALID_INPUT');
      await this.validate_stored_state(state);
      const fingerprint=await hash(canonical(envelope)),prior=await this.store.receipt(state.run_id,envelope.operation_id);
      if(prior){if(prior.fingerprint!==fingerprint)throw new GameError('OPERATION_CONFLICT');return {receipt:{run_id:state.run_id,operation_id:envelope.operation_id,revision:prior.revision,sim_time:prior.sim_time,fingerprint,result:'committed',kind:envelope.intent.kind},view:project_knowledge_collection_view(state)};}
      if(this.faulted)throw new GameError('STORAGE_UNCONFIRMED');
      const candidate=await apply_knowledge_collection_control(state,envelope,clock_to);await this.commit(candidate,state.revision,envelope.operation_id,fingerprint);
      return {receipt:{run_id:state.run_id,operation_id:envelope.operation_id,revision:candidate.revision,sim_time:candidate.sim_time,fingerprint,result:'committed',kind:envelope.intent.kind},view:project_knowledge_collection_view(candidate)};
    }
    if(state.schema===13){
      if(!valid_integrated_field_envelope(envelope))throw new GameError('INVALID_INPUT');
      await this.validate_stored_state(state);
      const fingerprint=await hash(canonical(envelope)),prior=await this.store.receipt(state.run_id,envelope.operation_id);
      if(prior){if(prior.fingerprint!==fingerprint)throw new GameError('OPERATION_CONFLICT');return {receipt:{run_id:state.run_id,operation_id:envelope.operation_id,revision:prior.revision,sim_time:prior.sim_time,fingerprint,result:'committed',kind:envelope.intent.kind,...(envelope.intent.kind==='restore'?{snapshot_revision:envelope.intent.snapshot_revision}:{})},view:project_integrated_field_view(state)};}
      if(this.faulted)throw new GameError('STORAGE_UNCONFIRMED');
      const candidate=apply_integrated_field_control(state,envelope,clock_to);await this.commit(candidate,state.revision,envelope.operation_id,fingerprint);
      return {receipt:{run_id:state.run_id,operation_id:envelope.operation_id,revision:candidate.revision,sim_time:candidate.sim_time,fingerprint,result:'committed',kind:envelope.intent.kind,...(envelope.intent.kind==='restore'?{snapshot_revision:envelope.intent.snapshot_revision}:{})},view:project_integrated_field_view(candidate)};
    }
    if(!valid_envelope(envelope,910000,true))throw new GameError('INVALID_INPUT');
    if(state.schema===10||state.schema===11||state.schema===12)return this.commit_outcome_request(envelope,clock_to);
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
