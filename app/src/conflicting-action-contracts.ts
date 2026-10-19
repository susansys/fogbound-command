import type {SourceTimePlayerView} from './source-time-contracts';
import type {OutcomeEnvelope} from './outcome-contracts';

export type ActionRef<K extends string>={run_id:string;kind:K;id:string;version:number};
export type FacilityCondition='operable'|'faulted';
export type ActionTime={kind:'unknown'}|{kind:'known';value:number;basis_ref:ActionRef<'facility_basis'>};
export type FacilityClaim={ref:ActionRef<'facility_report'>;target:'B';source:string;claim:FacilityCondition;text:string;event_time:ActionTime;observed_time:ActionTime;source_reported_time:ActionTime;verification:'unverified'};
export type FacilityDelivery={ref:ActionRef<'facility_delivery'>;report_ref:ActionRef<'facility_report'>;message_ref:ActionRef<'facility_message'>;sender:'FacilityArchive';recipient:'HQ';sent:number;received:number};
export type WorkingAssessment={ref:ActionRef<'working_assessment'>;target_scope:'B';explanations:['operable','faulted'];preferred:FacilityCondition|'undecided';basis_refs:ActionRef<'facility_report'>[];reason?:string;supersedes:ActionRef<'working_assessment'>|null;recorded_at:number};
export type SaveWorkingAssessment={run_id:string;operation_id:string;expected_revision:number;intent:{kind:'save_working_assessment';base_ref:ActionRef<'working_assessment'>|null;draft:{target_scope:'B';explanations:['operable','faulted'];preferred?:FacilityCondition|'undecided';basis_refs:ActionRef<'facility_report'>[];reason?:string}}};
export type ConflictingActionEnvelope=OutcomeEnvelope|SaveWorkingAssessment;
export type ConflictingActionPlayerView=SourceTimePlayerView&{conflicting_action:{package:{id:'B32-CONFLICTING-ACTION-01';version:1};reports:FacilityClaim[];deliveries:FacilityDelivery[];independence:{kind:'unknown'};assessments:WorkingAssessment[]}};
