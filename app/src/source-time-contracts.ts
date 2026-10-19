import type {OutcomePlayerView} from './outcome-contracts';
export type SourceRef<K extends string=string>={run_id:string;kind:K;id:string;version:1};
export type SourceKnowledgeTime={kind:'unknown'}|{kind:'known';value:number;basis_ref:SourceRef<'source_basis'>};
export type SourceNote={ref:SourceRef<'source_report'>;kind:'context_note';subject:string;text:string;source:string;event_time:SourceKnowledgeTime;observed_time:SourceKnowledgeTime;source_reported_time:SourceKnowledgeTime};
export type SourceDelivery={ref:SourceRef<'source_delivery'>;report_ref:SourceRef<'source_report'>;message_ref:SourceRef<'source_message'>;sender:string;recipient:string;sent:number;received:number;knowledge_seq:number};
export type SourceTimeBasis={ref:SourceRef<'source_basis'>;report_ref:SourceRef<'source_report'>;delivery_ref:SourceRef<'source_delivery'>;kind:'event'|'observation'|'source_reported';value:number;description:string};
export type SourceReading={reports:SourceNote[];deliveries:SourceDelivery[];bases:SourceTimeBasis[];similarity_hint:null|{kind:'suspected';report_refs:SourceRef<'source_report'>[];text:string};groups:Array<{report_refs:SourceRef<'source_report'>[];basis_refs:SourceRef<'source_report'>[]}>;independence:{kind:'unknown'}};
export type SourceTimePlayerView=OutcomePlayerView&{source_package:{id:'B31-SOURCE-TIME-01';version:1};source_reading:SourceReading};
