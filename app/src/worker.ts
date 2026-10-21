/// <reference lib="webworker" />
import {source_time_definition} from './core/source-time-definition';
import {conflicting_action_definition} from './core/conflicting-action-definition';
import {parse_conflicting_action_envelope} from './conflicting-action-protocol';
import { Game } from "./core/game";
import { Persistence } from "./core/persistence";
import { engineeringDefinition,recordEngineeringDefinition,prestartEngineeringDefinition,playCorridorDefinition,load_definition,prestart_case,hash } from "./core/scenario";
import { GameError,is_task_intent } from "./contracts";
import type {GamePlayerView as PlayerView} from './play-contracts';
import type { Request, Response } from "./transport";
import { valid_request, correlation,valid_public_field_path } from "./protocol";
import {valid_response} from './dto';
import {outcome_definition_by_ref} from './core/outcome-definition';
import {parse_outcome_envelope} from './outcome-protocol';
import missionDefinition from './core/mission-definition.json';
import intelligenceDefinition from './core/intelligence-definition.json';
import {parse_mission_draft,parse_issue_mission} from './mission-protocol';
const scope = self as unknown as DedicatedWorkerGlobalScope;
const store = new Persistence("fogbound-map-b-game-1");
const game = new Game(store);
let locked = false;
let blocked=false;
async function acquire_writer(): Promise<boolean> {
  if (locked) return true;
  if (!navigator.locks) throw new GameError("LOCK_UNSUPPORTED");
  return new Promise<boolean>((resolve, reject) => {
    void navigator.locks
      .request("fogbound-map-b-writer-1", { ifAvailable: true }, async (lock) => {
        if (!lock) {
          resolve(false);
          return;
        }
        locked = true;
        resolve(true);
        await new Promise<void>(() => {}); // Web Lock lifetime equals this Worker lifetime.
      })
      .catch(reject);
  });
}
let queue = Promise.resolve();
let active:PlayerView|null=null;
let history:Game|null=null;
let anchor={wall:0,sim:0};
let clockQueued=false;
let pendingPauses=0;
function clockTarget(view:PlayerView){const bound=view.scenario_kind==='play_mission'?910000:view.scenario_kind==='play_integrated_field'||view.scenario_kind==='play_corridor'||view.scenario_kind==='play_intelligence'||view.scenario_kind==='play_outcome'?view.public_rules.deadline+view.public_rules.receipt_grace:610000;return Math.min(bound,anchor.sim+Math.floor((performance.now()-anchor.wall)*view.rate));}
function publish(response:Response){if(!valid_response(response))throw new GameError('STORAGE_UNCONFIRMED');scope.postMessage(response);}
function remember(view:PlayerView){
  if(active?.run_id===view.run_id&&view.revision<active.revision)return;
  if(!active||active.run_id!==view.run_id||active.paused!==view.paused||active.rate!==view.rate)anchor={wall:performance.now(),sim:view.sim_time};
  active=view;
}
async function pauseActiveRun(){
  if(!active||active.paused)return;
  const current=await game.get_view(active.run_id);
  if(current.paused){remember(current);return;}
  const result=await game.control_clock({run_id:current.run_id,operation_id:crypto.randomUUID(),expected_revision:current.revision,intent:{kind:'pause',reason:'manual'}},current.mode==='command'?clockTarget(current):undefined);
  if(!result.view.paused)throw new GameError('STORAGE_UNCONFIRMED');
  remember(result.view);
}
setInterval(()=>{
  if(clockQueued||pendingPauses||!locked||!active||active.mode!=='command'||active.paused)return;
  clockQueued=true;
  queue=queue.then(async()=>{
    try{
      if(pendingPauses||!active||active.mode!=='command'||active.paused)return;
      const to=clockTarget(active);
      if(to<=active.sim_time)return;
      const result=await game.tick(active.run_id,to,crypto.randomUUID());
      remember(result.view);
      publish({request_id:`clock-${crypto.randomUUID()}`,ok:true,view:result.view});
    }catch{
      blocked=true;
      active=null;
      scope.postMessage({request_id:'clock-fault',ok:false,code:'STORAGE_UNCONFIRMED'} satisfies Response);
    }finally{clockQueued=false;}
  });
},250);
scope.onmessage = (event: MessageEvent<unknown>) => {
  // Give an already received pause its turn before another automatic tick.
  // Other requests do not suppress clock scheduling. Game still checks
  // revisions and derives actual elapsed time when it commits the operation.
  const kind=event.data&&typeof event.data==='object'?Reflect.get(event.data,'kind'):null;
  const envelope=event.data&&typeof event.data==='object'?Reflect.get(event.data,'envelope'):null;
  const intent=envelope&&typeof envelope==='object'?Reflect.get(envelope,'intent'):null;
  const pause=kind==='management_pause'||['operate','operate_corridor','operate_mission','operate_intelligence','operate_outcome','operate_conflicting_action'].includes(kind)&&intent&&typeof intent==='object'&&Reflect.get(intent,'kind')==='pause';
  if(pause)pendingPauses++;
  queue = queue.then(async () => {
    let stalePauseView:import('./mission-contracts').MissionPlayerView|undefined;
    const raw: unknown = event.data,
      request_id = correlation(raw);
    try {
      if (!valid_request(raw)) throw new GameError("INVALID_INPUT");
      const input = raw;
      if(input.kind==='operate_mission'&&input.envelope.intent.kind==='pause'&&active?.scenario_kind==='play_mission'&&active.run_id===input.envelope.run_id)stalePauseView=active;
      if(history&&['create','takeover','restart','operate','operate_corridor','operate_mission','operate_intelligence','operate_outcome','operate_conflicting_action','operate_integrated_field','save_plan','issue_mission','append_explanation','request_source_validation','request_preparation','issue_activity'].includes(input.kind))throw new GameError('HISTORY_READ_ONLY');
      if(blocked&&['create','operate','operate_corridor','operate_mission','operate_intelligence','operate_outcome','operate_conflicting_action','operate_integrated_field','save_plan','issue_mission','append_explanation','request_source_validation','request_preparation','issue_activity'].includes(input.kind))throw new GameError('STORAGE_UNCONFIRMED');
      let response: Response;
      let rememberResult=true;
      if (
        input.kind === "list" &&
        Object.keys(input).sort().join(",") === "kind,request_id"
      )
        response = {
          request_id: input.request_id,
          ok: true,
          runs: await store.list_runs(),
        };
      else if(input.kind==='evaluate_outcome_decision'){
        if(blocked)throw new GameError('STORAGE_UNCONFIRMED');if(!(await acquire_writer()))throw new GameError('WRITER_BUSY');
        response={request_id,ok:true,decision_evaluation:await (history??game).evaluate_outcome_decision(input.query)};
      }
      else if(input.kind==='query_outcome_debrief'||input.kind==='resolve_outcome_evidence'){
        if(blocked)throw new GameError('STORAGE_UNCONFIRMED');
        if(!(await acquire_writer()))throw new GameError('WRITER_BUSY');
        response=input.kind==='query_outcome_debrief'?{request_id,ok:true,debrief_answer:await (history??game).query_outcome_debrief(input.query)}:{request_id,ok:true,evidence_resolution:await (history??game).resolve_outcome_evidence(input.query)};
      }
      else if(input.kind==='get_integrated_fairness'){
        if(blocked)throw new GameError('STORAGE_UNCONFIRMED');response={request_id,ok:true,integrated_fairness:await (history??game).get_integrated_fairness(input.run_id)};
      }
      else if(input.kind==='open_integrated_debrief'||input.kind==='request_integrated_truth'||input.kind==='confirm_integrated_truth'){
        if(blocked)throw new GameError('STORAGE_UNCONFIRMED');if(!(await acquire_writer()))throw new GameError('WRITER_BUSY');
        response=input.kind==='open_integrated_debrief'?{request_id,ok:true,integrated_debrief:await (history??game).open_integrated_debrief(input.run_id)}:input.kind==='request_integrated_truth'?{request_id,ok:true,integrated_truth:await (history??game).request_integrated_truth(input.envelope)}:{request_id,ok:true,integrated_truth_confirmation:await (history??game).confirm_integrated_truth(input.envelope)};
      }
      else if(input.kind==='get_outcome_fairness'){
        if(blocked)throw new GameError('STORAGE_UNCONFIRMED');
        response={request_id,ok:true,outcome_fairness:await (history??game).get_outcome_fairness(input.run_id)};
      }
      else if(input.kind==='get_outcome_participants'){
        if(blocked)throw new GameError('STORAGE_UNCONFIRMED');if(!(await acquire_writer()))throw new GameError('WRITER_BUSY');
        const template=await (history??game).get_outcome_participants(input.query);
        response={request_id,ok:true,debrief_participants:{template,source_digest:await hash(template)}};
      }
      else if(input.kind==='append_outcome_inference'){
        if(blocked)throw new GameError('STORAGE_UNCONFIRMED');if(!(await acquire_writer()))throw new GameError('WRITER_BUSY');
        const note=await (history??game).append_outcome_inference(input.envelope);
        response={request_id,ok:true,debrief_inference:{note,source_digest:await hash(note)}};
      }
      else if(input.kind==='transition_outcome_debrief'){
        if(blocked)throw new GameError('STORAGE_UNCONFIRMED');if(!(await acquire_writer()))throw new GameError('WRITER_BUSY');
        response={request_id,ok:true,debrief:await (history??game).transition_outcome_debrief(input.envelope)};
      }
      else if(input.kind==='open_outcome_debrief'){
        if(blocked)throw new GameError('STORAGE_UNCONFIRMED');
        if(!(await acquire_writer()))throw new GameError('WRITER_BUSY');
        response={request_id,ok:true,debrief:await (history??game).open_outcome_debrief(input.run_id)};
      }
      else if(input.kind==='request_outcome_truth'||input.kind==='confirm_outcome_truth'){
        if(blocked)throw new GameError('STORAGE_UNCONFIRMED');
        if(!(await acquire_writer()))throw new GameError('WRITER_BUSY');
        response=input.kind==='request_outcome_truth'?{request_id,ok:true,outcome_truth:await (history??game).request_outcome_truth(input.envelope)}:{request_id,ok:true,truth_confirmation:await (history??game).confirm_outcome_truth(input.envelope)};
      }
      else if (
        input.kind === "create"
      ) {
        if (!(await acquire_writer())) throw new GameError("WRITER_BUSY");
        const definition=await load_definition(input.definition_ref==='INTEGRATED-FIELD-PACK-3'?{schema:13,contract:'0.5.1',package_ref:{id:'INTEGRATED-FIELD-PACK-3',version:1}}:input.definition_ref==='B32-CONFLICTING-ACTION-01'?conflicting_action_definition:input.definition_ref==='B31-SOURCE-TIME-01'?source_time_definition:input.definition_ref?.startsWith('B24-OUTCOME-')?outcome_definition_by_ref(input.definition_ref):input.definition_ref==='B23-INTELLIGENCE-01'?intelligenceDefinition:input.definition_ref==='B22-MISSION-01'?missionDefinition:input.definition_ref==='B21-CORRIDOR-01'?playCorridorDefinition:input.definition_ref==='FB02-ENG-RECORD'?recordEngineeringDefinition:input.definition_ref==='ENG-PRESTART-REPLACE'?prestartEngineeringDefinition:engineeringDefinition);
        if(definition.schema===6)prestart_case({schema:definition.schema,definition_hash:definition.definition_hash},input.case_ref??'normal');
        const original=await store.creation(input.operation_id);
        if(!original)await pauseActiveRun();
        const created=await game.create_run(definition,input.mode,input.operation_id,input.case_ref);
        const view=original?await game.get_view(created.run_id):created;
        if(original)rememberResult=active?.run_id===view.run_id;
        response={request_id:input.request_id,ok:true,view};
      } else if(input.kind==='management_pause'&&locked&&active){
        if(input.reason==='manual'&&active.scenario_kind!=='play_intelligence'&&active.scenario_kind!=='play_outcome'&&active.scenario_kind!=='play_integrated_field')throw new GameError('INVALID_INPUT');
        const view=await game.get_view(active.run_id);
        if(view.mode==='command'&&!view.paused){
          const to=clockTarget(view);
          const result=await game.control_clock({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'pause',reason:input.reason}},to);
          remember(result.view);response={request_id:input.request_id,ok:true,...result};
        }else response={request_id:input.request_id,ok:true,view};
      } else if(input.kind==='previous'&&locked){
        const current=await game.get_view(input.run_id);if(!current.source_run)throw new GameError('RUN_NOT_FOUND');
        const source=await game.get_view(current.source_run);history=await game.get_replay(source.run_id,source.sim_time);
        response={request_id:input.request_id,ok:true,view:await history.get_view(source.run_id)};
      } else if(input.kind==='replay'){
        history=await game.get_replay(input.run_id,input.to,input.node_revision);
        response={request_id:input.request_id,ok:true,view:await history.get_view(input.run_id)};
      } else if(input.kind==='current'){
        const view=await game.get_view(input.run_id);history=null;
        response={request_id:input.request_id,ok:true,view};
      } else if(input.kind==='restart'&&locked){
        response={request_id:input.request_id,ok:true,view:await game.restart_run(input.run_id,input.operation_id)};
      } else if(input.kind==='takeover'){
        if(!(await acquire_writer()))throw new GameError('WRITER_BUSY');
        await pauseActiveRun();
        response={request_id:input.request_id,ok:true,...await game.restore(input.run_id,input.operation_id)};
        blocked=false;
      } else if (input.kind === "view" && locked)
        response = {
          request_id: input.request_id,
          ok: true,
          view: await (history??game).get_view(input.run_id),
        };
      else if(input.kind==='request_source_validation'&&locked){
        response={request_id,ok:true,...await game.request_source_validation(input.envelope)};
      }else if(input.kind==='request_preparation'&&locked){
        response={request_id,ok:true,...await game.request_preparation(input.envelope)};
      }else if(input.kind==='issue_activity'&&locked){
        response={request_id,ok:true,...await game.issue_activity(input.envelope)};
      }else if(input.kind==='preview_mission'&&locked){
        response={request_id,ok:true,mission_preview:await (history??game).preview_plan(input.run_id,input.revision,input.editing_seq,parse_mission_draft(input.draft,input.run_id))};rememberResult=false;
      }else if(input.kind==='save_plan'&&locked){
        response={request_id,ok:true,...await game.save_plan(input.envelope)};
      }else if(input.kind==='issue_mission'&&locked){
        response={request_id,ok:true,...await game.issue_order(parse_issue_mission(input.envelope))};
      }else if(input.kind==='evaluate_decision'&&locked){
        response={request_id,ok:true,mission_evaluation:await (history??game).evaluate_decision({run_id:input.run_id,view_revision:input.view_revision,decision_ref:input.decision_ref})};rememberResult=false;
      }else if(input.kind==='append_explanation'&&locked){
        response={request_id,ok:true,...await game.append_explanation(input.envelope)};
      }
      else if (input.kind === "preview" && locked)
        response = {
          request_id: input.request_id,
          ok: true,
          plan: 'route_draft' in input?await (history??game).preview_plan(input.run_id,input.revision,input.editing_seq,input.route_draft):await (history??game).preview_plan(
            input.run_id,
            input.revision,
            input.editing_seq,
          ),
        };
      else if(input.kind==='operate_conflicting_action'&&locked){
        const envelope=parse_conflicting_action_envelope(input.envelope),view=await game.get_view(envelope.run_id);
        if(!('conflicting_action' in view))throw new GameError('INVALID_INPUT');
        const clock_to=envelope.intent.kind!=='save_working_assessment'&&active?.run_id===envelope.run_id&&active.mode==='command'&&!active.paused?clockTarget(active):undefined;
        response={request_id,ok:true,...await game.apply_outcome_intent(envelope,clock_to)};
      }
      else if(input.kind==='operate_outcome'&&locked){
        const envelope=parse_outcome_envelope(input.envelope),view=await game.get_view(envelope.run_id);if(view.scenario_kind!=='play_outcome')throw new GameError('INVALID_INPUT');
        const clock_to=active?.run_id===envelope.run_id&&active.mode==='command'&&!active.paused?clockTarget(active):undefined;response={request_id,ok:true,...await game.apply_outcome_intent(envelope,clock_to)};
      }
      else if(input.kind==='operate_integrated_field'&&locked){
        const context=await game.get_view(input.envelope.run_id);if(context.scenario_kind!=='play_integrated_field')throw new GameError('INVALID_INPUT');
        const clock_to=active?.run_id===input.envelope.run_id&&active.mode==='command'&&!active.paused?clockTarget(active):undefined;
        const result=await game.apply_integrated_intent(input.envelope,clock_to);
        response={request_id,ok:true,...result};
      }
      else if ((input.kind === "operate"||input.kind==='operate_corridor'||input.kind==='operate_mission'||input.kind==='operate_intelligence') && locked) {
        const context=await game.get_view(input.envelope.run_id);
        if((input.kind==='operate_corridor')!==(context.scenario_kind==='play_corridor'))throw new GameError('INVALID_INPUT');
        if((input.kind==='operate_mission')!==(context.scenario_kind==='play_mission'))throw new GameError('INVALID_INPUT');
        if((input.kind==='operate_intelligence')!==(context.scenario_kind==='play_intelligence'))throw new GameError('INVALID_INPUT');
        const clock_to=active?.run_id===input.envelope.run_id&&active.mode==='command'&&!active.paused?clockTarget(active):undefined;
        const result =
          is_task_intent(input.envelope.intent)
            ? await game.issue_order(input.envelope)
            : input.envelope.intent.kind==='save'?await game.save(input.envelope,clock_to)
            : await game.control_clock(input.envelope,clock_to);
        response = { request_id: input.request_id, ok: true, ...result };
      } else if (input.kind === "receipt" && locked)
        response = {
          request_id: input.request_id,
          ok: true,
          receipt: await (history??game).get_receipt(input.run_id, input.operation_id),
        };
      else throw new GameError("INVALID_INPUT");
      if(rememberResult&&response.ok&&response.view&&!history&&locked&&!await store.is_read_only(response.view.run_id))remember(response.view);
      publish(response);
    } catch (error) {
      const code =
        error instanceof GameError ? error.code : "STORAGE_UNCONFIRMED";
      if(['STORAGE_UNCONFIRMED','ENGINE_UNCONFIRMED','STALE_WRITER'].includes(code)){blocked=true;active=null;}
      scope.postMessage({ request_id, ok: false, code,...(code==='STALE_REVISION'&&stalePauseView?{mission_view:stalePauseView}:{}),...(error instanceof GameError&&['INVALID_REQUEST','CONFIG_PARAMETER_MISSING','CONFIG_UNIT_MISMATCH'].includes(code)&&valid_public_field_path(error.field_path)?{field_path:error.field_path}:{}) } satisfies Response);
    } finally {if(pause)pendingPauses--;}
  });
};
