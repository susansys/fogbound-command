import type { Mode, Envelope, Receipt,DefinitionRef,PrestartCaseRef } from "./contracts";
import type {GamePlayerView as PlayerView} from './play-contracts';
import {valid_response} from './dto';
import {verify_integrated_truth_digest} from './integrated-field-dto';
import {verify_outcome_participant_receipt,verify_outcome_inference_receipt,verify_outcome_truth_digest,verify_outcome_debrief_digest} from './outcome-dto';
import {correlation} from './protocol';
import type {RouteDraft,PreviewPlan} from './route-contracts';
import type {MissionPreview,MissionPlayerView,MissionDecisionEvaluation,MissionRef} from './mission-contracts';
export type RunSummary = {
  run_id: string;
  revision: number;
  sim_time: number;
  mode: Mode;
  finished: boolean;
  scenario_kind?: 'move'|'record'|'prestart_move'|'play_corridor'|'play_mission'|'play_intelligence'|'play_outcome'|'play_integrated_field';
  read_only?:boolean;
  source_package?:{id:'B31-SOURCE-TIME-01';version:1};
  conflicting_package?:{id:'B32-CONFLICTING-ACTION-01';version:1};
};
export type Request =
  |{kind:'open_integrated_debrief';run_id:string}
  |{kind:'get_integrated_fairness';run_id:string}
  |{kind:'request_integrated_truth';envelope:import('./integrated-field-contracts').IntegratedTruthRequest}
  |{kind:'confirm_integrated_truth';envelope:import('./integrated-field-contracts').IntegratedTruthAcknowledgement}
  |{kind:'operate_integrated_field';envelope:import('./integrated-field-contracts').IntegratedFieldEnvelope}
  |{kind:'get_outcome_participants';query:import('./outcome-contracts').OutcomeParticipantQuery}
  |{kind:'append_outcome_inference';envelope:import('./outcome-contracts').OutcomeInferenceRequest}
  |{kind:'transition_outcome_debrief';envelope:import('./outcome-contracts').OutcomeDebriefTransition}
  |{kind:'evaluate_outcome_decision';query:import('./outcome-contracts').OutcomeDecisionEvaluationRequest}
  |{kind:'query_outcome_debrief';query:import('./outcome-contracts').OutcomeDebriefQuery}
  |{kind:'resolve_outcome_evidence';query:import('./outcome-contracts').OutcomeEvidenceRequest}
  |{kind:'get_outcome_fairness';run_id:string}
  |{kind:'open_outcome_debrief';run_id:string}
  |{kind:'request_outcome_truth';envelope:import('./outcome-contracts').OutcomeTruthRequest}
  |{kind:'confirm_outcome_truth';envelope:import('./outcome-contracts').OutcomeTruthAcknowledgement}
  |{kind:'operate_knowledge_collection';envelope:import('./knowledge-collection-contracts').KnowledgeCollectionEnvelope}
  |{kind:'operate_conflicting_action';envelope:import('./conflicting-action-contracts').ConflictingActionEnvelope}
  |{kind:'operate_outcome';envelope:import('./outcome-contracts').OutcomeEnvelope}
  |{kind:'request_source_validation';envelope:unknown}
  |{kind:'request_preparation';envelope:unknown}
  |{kind:'issue_activity';envelope:unknown}
  |{kind:'preview_mission';run_id:string;revision:number;editing_seq:number;draft:unknown}
  |{kind:'save_plan';envelope:unknown}
  |{kind:'issue_mission';envelope:unknown}
  |{kind:'append_explanation';envelope:unknown}
  |{kind:'evaluate_decision';run_id:string;view_revision:number;decision_ref:MissionRef<'decision'>}
  |{kind:'operate_mission';envelope:Envelope}
  |{kind:'operate_intelligence';envelope:Envelope}
  | { kind: "create"; mode: Mode; operation_id: string;definition_ref?:DefinitionRef;case_ref?:PrestartCaseRef }
  | { kind: "list" }
  | { kind: "view"; run_id: string }
  | { kind: "preview"; run_id: string; revision: number; editing_seq: number }
  | {kind:'preview';run_id:string;revision:number;editing_seq:number;route_draft:RouteDraft}
  | { kind: "operate"; envelope: Envelope }
  | {kind:'operate_corridor';envelope:Envelope}
  | { kind: "receipt"; run_id: string; operation_id: string }
  | { kind:'takeover';run_id:string;operation_id:string }
  | {kind:'restart';run_id:string;operation_id:string}
  | {kind:'replay';run_id:string;to:number;node_revision?:number}
  | {kind:'current';run_id:string}
  | {kind:'previous';run_id:string}
  | {kind:'management_pause';reason:'manual'|'focus_lost'|'application_hidden'};
export type Response =
  | {
      request_id: string;
      ok: true;
      view?: PlayerView;
      integrated_debrief?:import('./integrated-field-contracts').IntegratedDebriefSession;
      integrated_truth?:import('./integrated-field-contracts').IntegratedTruthPayload;
      integrated_truth_confirmation?:import('./integrated-field-contracts').IntegratedTruthConfirmation;
      integrated_fairness?:import('./integrated-field-contracts').IntegratedFairness;
      runs?: RunSummary[];
      plan?: PreviewPlan;
      mission_preview?:MissionPreview;
      mission_evaluation?:MissionDecisionEvaluation;
      debrief?:import('./outcome-contracts').OutcomeDebriefSession;
      debrief_inference?:import('./outcome-contracts').OutcomeInferenceReceipt;
      debrief_participants?:import('./outcome-contracts').OutcomeParticipantReceipt;
      outcome_truth?:import('./outcome-contracts').OutcomeTruthPayload;
      truth_confirmation?:import('./outcome-contracts').OutcomeTruthConfirmation;
      outcome_fairness?:import('./outcome-contracts').OutcomeFairness;
      decision_evaluation?:import('./outcome-contracts').OutcomeDecisionEvaluation;
      debrief_answer?:import('./outcome-contracts').OutcomeDebriefAnswer;
      evidence_resolution?:import('./outcome-contracts').OutcomeEvidenceResolution;
      receipt?: Receipt | null;
    }
  | { request_id: string; ok: false; code: string;field_path?:string;mission_view?:MissionPlayerView };
export class Transport {
  private listeners=new Set<(response:Response)=>void>();
  subscribe(listener:(response:Response)=>void){this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};}
  private worker: Worker;
  private pending = new Map<
    string,
    { resolve: (value: Response) => void; reject: (error: Error) => void;timer:ReturnType<typeof setTimeout> }
  >();
  constructor() {
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = async(event: MessageEvent<unknown>) => {
      let response:Response = valid_response(event.data)?event.data:{request_id:correlation(event.data),ok:false,code:'CHANNEL_UNCERTAIN'};
      if(response.ok&&response.debrief_participants){try{if(!await verify_outcome_participant_receipt(response.debrief_participants))response={request_id:response.request_id,ok:false,code:'CHANNEL_UNCERTAIN'};}catch{response={request_id:response.request_id,ok:false,code:'CHANNEL_UNCERTAIN'};}}
      if(response.ok&&response.debrief_inference){try{if(!await verify_outcome_inference_receipt(response.debrief_inference))response={request_id:response.request_id,ok:false,code:'CHANNEL_UNCERTAIN'};}catch{response={request_id:response.request_id,ok:false,code:'CHANNEL_UNCERTAIN'};}}
      if(response.ok&&response.integrated_truth){try{if(!await verify_integrated_truth_digest(response.integrated_truth))response={request_id:response.request_id,ok:false,code:'CHANNEL_UNCERTAIN'};}catch{response={request_id:response.request_id,ok:false,code:'CHANNEL_UNCERTAIN'};}}
      if(response.ok&&response.outcome_truth){try{if(!await verify_outcome_truth_digest(response.outcome_truth))response={request_id:response.request_id,ok:false,code:'CHANNEL_UNCERTAIN'};}catch{response={request_id:response.request_id,ok:false,code:'CHANNEL_UNCERTAIN'};}}
      if(response.ok&&(response.debrief_answer||response.evidence_resolution)){try{if(!await verify_outcome_debrief_digest(response.debrief_answer??response.evidence_resolution))response={request_id:response.request_id,ok:false,code:'CHANNEL_UNCERTAIN'};}catch{response={request_id:response.request_id,ok:false,code:'CHANNEL_UNCERTAIN'};}}
      const waiting = this.pending.get(response.request_id);
      for(const listener of this.listeners)listener(response);
      if (!waiting) return;
      clearTimeout(waiting.timer);
      this.pending.delete(response.request_id);
      waiting.resolve(response);
    };
    this.worker.onerror = () => {
      for (const waiting of this.pending.values())
        {clearTimeout(waiting.timer);waiting.reject(Error("CHANNEL_UNCERTAIN"));}
      this.pending.clear();
    };
  }
  request(request: Request): Promise<Response> {
    const request_id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer=setTimeout(()=>{this.pending.delete(request_id);reject(Error('CHANNEL_UNCERTAIN'));},10000);
      this.pending.set(request_id, { resolve, reject,timer });
      this.worker.postMessage({ ...request, request_id });
    });
  }
  close() {
    this.worker.terminate();
    for (const p of this.pending.values()) {clearTimeout(p.timer);p.reject(Error("CHANNEL_UNCERTAIN"));}
    this.pending.clear();
  }
}
