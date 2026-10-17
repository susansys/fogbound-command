import type {ReceptionBatch,ReceptionManifest,VerificationReport} from '../outcome-contracts';
import type {OutcomeState} from './outcome-state';
import type {OutcomeDefinition} from './outcome-definition';
import {hash} from './scenario';

const sameRef=(a:{run_id:string;kind:string;id:string;version:number},b:{run_id:string;kind:string;id:string;version:number})=>a.run_id===b.run_id&&a.kind===b.kind&&a.id===b.id&&a.version===b.version;

// H captures the items actually handed over. INTEL receives this immutable
// manifest through the existing real completion delivery, never the field world.
export async function create_reception_manifest(state:OutcomeState,batch:ReceptionBatch,definition:OutcomeDefinition):Promise<ReceptionManifest>{
  const artifacts=state.prefix.field.artifacts.filter(a=>batch.artifact_refs.some(ref=>sameRef(ref,a.ref)));
  const materials=state.prefix.field.materials.filter(m=>artifacts.some(a=>a.material_refs.some(ref=>sameRef(ref,m.ref))));
  const manifest:ReceptionManifest={ref:{run_id:state.run_id,kind:'reception_manifest',id:'M-'+batch.ref.id,version:1},batch_ref:structuredClone(batch.ref),actor:batch.actor,confirmations:structuredClone(state.handover_confirmations.filter(c=>sameRef(c.batch_ref,batch.ref))),artifacts:structuredClone(artifacts),materials:await Promise.all(materials.map(async material=>({material:structuredClone(material),digest:await hash(material)}))),person_receipts:structuredClone(state.person_receipts.filter(r=>sameRef(r.batch_ref,batch.ref))),custody_events:structuredClone(state.custody_events.filter(c=>sameRef(c.batch_ref,batch.ref)))};
  // Only constructor-registered owned definitions can select a bounded transport
  // evidence fault. No player request or source-state patch reaches this seam.
  const fault=definition.catalogs.handover_faults?.find(f=>f.actor===batch.actor);
  if(fault?.kind==='missing_material')manifest.materials=[];
  if(fault?.kind==='broken_custody')manifest.custody_events=[];
  if(fault?.kind==='wrong_manifest')manifest.batch_ref={...manifest.batch_ref,id:manifest.batch_ref.id+'-wrong'};
  if(fault?.kind==='damaged_content'&&manifest.materials[0])manifest.materials[0].material.body='收到的材料内容已损坏。';
  return manifest;
}

export async function verify_reception_manifest(manifest:ReceptionManifest|undefined,batch:ReceptionBatch):Promise<Pick<VerificationReport,'personnel'|'artifacts'>>{
  const bound=manifest!==undefined&&sameRef(manifest.batch_ref,batch.ref)&&manifest.actor===batch.actor&&manifest.ref.run_id===batch.ref.run_id&&manifest.ref.kind==='reception_manifest'&&manifest.ref.version===1;
  const joint=bound&&manifest.confirmations.length===2&&[batch.actor,'H'].every(actor=>manifest.confirmations.filter(c=>c.actor===actor&&sameRef(c.batch_ref,batch.ref)&&c.at===batch.completed_at&&JSON.stringify(c.people_ids)===JSON.stringify(batch.people_ids)&&JSON.stringify(c.artifact_refs)===JSON.stringify(batch.artifact_refs)).length===1);
  const confirmationsValid=(refs:ReceptionManifest['confirmations'][number]['ref'][])=>joint&&refs.length===2&&refs.every(ref=>manifest!.confirmations.some(c=>sameRef(c.ref,ref)));
  const personnel=batch.people_ids.map(person_id=>({person_id,status:bound&&manifest.person_receipts.filter(p=>p.person_id===person_id&&sameRef(p.batch_ref,batch.ref)&&p.ref.run_id===batch.ref.run_id&&p.received_at===batch.completed_at&&confirmationsValid(p.confirmation_refs)).length===1?'verified' as const:'inconclusive' as const}));
  const artifacts=await Promise.all(batch.artifact_refs.map(async artifact_ref=>{
    const artifact=bound?manifest.artifacts.find(a=>sameRef(a.ref,artifact_ref)):undefined;
    let valid=!!artifact&&artifact.condition==='intact'&&artifact.material_refs.length>0&&artifact.custody_holder===batch.actor&&manifest!.custody_events.filter(c=>sameRef(c.artifact_ref,artifact_ref)&&sameRef(c.batch_ref,batch.ref)&&c.from===batch.actor&&c.to==='H'&&c.at===batch.completed_at&&c.lifecycle==='delivered'&&confirmationsValid(c.confirmation_refs)).length===1;
    if(valid&&artifact)for(const ref of artifact.material_refs){
      const rows=manifest!.materials.filter(m=>sameRef(m.material.ref,ref)),row=rows[0],m=row?.material;
      if(rows.length!==1||!m||m.ref.run_id!==batch.ref.run_id||m.ref.version!==1||m.ref.kind!=='record_material'||m.site!==artifact.site||m.captured_at!==artifact.created_at||m.work_ref.run_id!==batch.ref.run_id||m.work_ref.kind!=='field_order'||m.work_ref.version!==1||m.work_ref.id+'-complete'!==artifact.origin_event||m.typed_payload.kind!=='site_record'||m.typed_payload.site!==artifact.site||!m.body.trim()||await hash(m)!==row.digest)valid=false;
    }
    return {artifact_ref:structuredClone(artifact_ref),status:valid?'verified' as const:'inconclusive' as const,reason:valid?null:'接收清单、原件内容或保管凭证不完整'};
  }));
  return {personnel,artifacts};
}
