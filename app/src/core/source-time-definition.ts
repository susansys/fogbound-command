import registered from './source-time-definition.json';
import {GameError} from '../contracts';
import {record,fields,valid_id} from '../protocol';
import {hash} from './scenario';
import {load_outcome_definition,type OutcomeDefinition} from './outcome-definition';
export type SourceTimeDefinition=Omit<typeof registered,'schema'|'scenario_kind'|'task_definition'|'catalogs'>&{schema:11;scenario_kind:'play_source_time';task_definition:OutcomeDefinition;catalogs:Omit<typeof registered.catalogs,'time_bases'>&{time_bases:Array<{id:string;report:string;kind:'event'|'observation'|'source_reported';value:number;description:string}>}};
export const source_time_definition=registered as SourceTimeDefinition;
export function is_source_time_definition(value:{schema:number}):value is SourceTimeDefinition{return value.schema===11;}
export function source_time_definition_for_package(digest:unknown,owned:readonly SourceTimeDefinition[]=[]):SourceTimeDefinition{
 const found=[source_time_definition,...owned].find(value=>value.definition_hash===digest);if(!found)throw new GameError('INVALID_SAVE');return structuredClone(found);
}
export async function load_source_time_definition(input:unknown,owned:readonly SourceTimeDefinition[]=[]):Promise<SourceTimeDefinition>{
 if(!record(input))throw new GameError('INVALID_DEFINITION');let selected:SourceTimeDefinition;try{selected=source_time_definition_for_package(input.definition_hash,owned);}catch{throw new GameError('INVALID_DEFINITION');}
 if(JSON.stringify(selected)!==JSON.stringify(input)||selected.schema!==11||selected.scenario_kind!=='play_source_time'||selected.id!=='B31-SOURCE-TIME-01'||selected.version!==1||selected.contract!=='0.5.1')throw new GameError('INVALID_DEFINITION');
 const {definition_hash,...body}=selected;if(await hash(body)!==definition_hash||await hash(selected.profile)!==selected.hashes.profile||await hash(selected.catalogs)!==selected.hashes.catalogs||await hash(selected.rules)!==selected.hashes.rules||selected.hashes.task!==selected.task_definition.definition_hash)throw new GameError('INVALID_DEFINITION');
 const invalid=()=>{throw new GameError('INVALID_DEFINITION');},natural=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
 const {reports,evidence,messages}=selected.catalogs;
 if(!Array.isArray(reports)||reports.length!==3||!Array.isArray(evidence)||evidence.length>9||!Array.isArray(messages)||messages.length>12||selected.profile.parameters.extra_messages!==messages.length||selected.rules.metadata_issuer!=='ArchiveSource'||selected.rules.metadata_authority!=='source_metadata')invalid();
 const items=[...reports,...evidence];if(new Set(items.map(x=>x.id)).size!==items.length||new Set(messages.map(x=>x.id)).size!==messages.length)invalid();
 if(reports.some(r=>!valid_id(r.id)||r.version!==1||r.kind!=='context_note'||r.source!=='ArchiveSource'||typeof r.subject!=='string'||r.subject.length>2000||typeof r.text!=='string'||r.text.length>2000))invalid();
 for(const message of messages){if(!fields(message,['id','report','sender','recipient','sent','received'])||!valid_id(message.id)||!items.some(item=>item.id===message.report)||message.sender!=='ArchiveSource'||!['HQ','R'].includes(message.recipient)||!natural(message.sent)||!natural(message.received)||message.sent>message.received)invalid();}
 const knownReport=(id:unknown)=>typeof id==='string'&&reports.some(r=>r.id===id);
 const deliveredBefore=(recipient:string,id:string,received:number)=>messages.some(m=>m.recipient===recipient&&m.report===id&&m.received<=received);
 const common=['id','version','issuer','authority','kind','basis'];
 for(const item of evidence){
  if(!valid_id(item.id)||item.version!==1||item.issuer!=='ArchiveSource'||item.authority!=='source_metadata'||!valid_id(item.basis))invalid();
  let targets:string[]=[];
  if(item.kind==='confirmed_forward_claim'){
   if(!fields(item,[...common,'from','to','relation_id','claim'])||!knownReport(item.from)||!knownReport(item.to)||item.from===item.to||!valid_id(item.relation_id)||typeof item.claim!=='string'||item.claim.length>2000)invalid();targets=[item.from!,item.to!];
  }else if(item.kind==='explicit_independent_acquisition_evidence'){
   if(!fields(item,[...common,'covered_reports','visible_acquisition_records','claim'])||!Array.isArray(item.covered_reports)||item.covered_reports.length!==2||!item.covered_reports.every(knownReport)||new Set(item.covered_reports).size!==2||!Array.isArray(item.visible_acquisition_records)||item.visible_acquisition_records.length!==2||!item.visible_acquisition_records.every(valid_id)||new Set(item.visible_acquisition_records).size!==2||typeof item.claim!=='string'||item.claim.length>2000)invalid();targets=item.covered_reports!;
  }else if(item.kind==='lineage_retraction'){
   const target=evidence.find(e=>e.id===item.target_basis&&e.kind==='confirmed_forward_claim'&&e.relation_id===item.target_relation&&e.issuer===item.issuer);
   if(!fields(item,[...common,'target_relation','target_basis','reason'])||!target||typeof item.reason!=='string'||item.reason.length>2000)invalid();targets=[item.target_basis!];
  }else invalid();
  for(const message of messages.filter(m=>m.report===item.id))for(const target of targets)if(!deliveredBefore(message.recipient,target,message.received)||item.kind==='lineage_retraction'&&!messages.some(m=>m.report===target&&m.recipient===message.recipient&&m.received<message.received))invalid();
 }
 if(new Set(evidence.map(e=>e.basis)).size!==evidence.length||new Set(evidence.filter(e=>e.kind==='confirmed_forward_claim').map(e=>e.relation_id)).size!==evidence.filter(e=>e.kind==='confirmed_forward_claim').length)invalid();
 const bases=selected.catalogs.time_bases,used=new Set<string>();if(!Array.isArray(bases)||new Set(bases.map(b=>b.id)).size!==bases.length)throw new GameError('INVALID_DEFINITION');
 for(const report of selected.catalogs.reports){
  const deliveries=selected.catalogs.messages.filter(message=>message.report===report.id);if(!deliveries.length)throw new GameError('INVALID_DEFINITION');
  for(const [field,kind]of [['event_time','event'],['observed_time','observation'],['source_reported_time','source_reported']] as const){
   const time=report[field];if(!record(time))throw new GameError('INVALID_DEFINITION');if(time.kind==='unknown'){if(!fields(time,['kind']))throw new GameError('INVALID_DEFINITION');continue;}
   const basis=bases.find(basis=>basis.id===time.basis_ref);if(time.kind!=='known'||!fields(time,['kind','value','basis_ref'])||!Number.isSafeInteger(time.value)||Number(time.value)<0||deliveries.some(delivery=>Number(time.value)>delivery.received)||!basis||!fields(basis,['id','report','kind','value','description'])||!valid_id(basis.id)||basis.report!==report.id||basis.kind!==kind||basis.value!==time.value||typeof basis.description!=='string'||basis.description.length>2000)throw new GameError('INVALID_DEFINITION');used.add(basis.id);
  }
 }
 if(used.size!==bases.length)throw new GameError('INVALID_DEFINITION');
 await load_outcome_definition(selected.task_definition);return selected;
}
