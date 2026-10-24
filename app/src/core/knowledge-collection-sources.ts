import type {KnowledgeCollectionReport,CollectionDelivery,CollectionSourceSummary,CollectionCredentialDelivery,CollectionNoticeDelivery} from '../knowledge-collection-contracts';
import {valid_collection_ref} from '../knowledge-collection-protocol';

// Report identity groups exact copies. It provides no independence proof.
export function project_collection_sources(reports:readonly KnowledgeCollectionReport[],deliveries:readonly CollectionDelivery[],credentials:readonly CollectionCredentialDelivery[]=[],notices:readonly CollectionNoticeDelivery[]=[]):CollectionSourceSummary{
  const content=new Set(reports.filter(report=>report.body.field==='B.condition'&&report.body.quality!=='failed').map(report=>report.ref.id));
  const confirmed_pairs:CollectionSourceSummary['confirmed_pairs']=[];
  for(const delivery of credentials){
    const credential=delivery.credential,run=delivery.ref.run_id;
    if(credential.issuer!=='scenario-source-registrar'||credential.issued_at!==-65000||credential.scope.id!=='B'||credential.scope.version!==1||credential.roots.length!==2||new Set(credential.roots).size!==2||credential.registrations.length!==2)continue;
    const roots=[];
    for(const root of credential.roots){
      const registration=credential.registrations.find(item=>item.root_id===root);
      const report=reports.find(item=>content.has(item.ref.id)&&item.root_registration?.root_ref.id===root);
      const own=report?.root_registration;
      if(!registration||!report||!own||!valid_collection_ref(own.root_ref,run,'source-root')||!valid_collection_ref(own.method_ref,run,'method')||own.actor!==report.source_actor||own.actor!==registration.actor||own.method_ref.id!==report.method||own.method_ref.id!==registration.method||own.scope.id!==credential.scope.id||own.scope.version!==credential.scope.version||own.issuer!==credential.issuer||own.issued_at!==credential.issued_at||own.qualification.id!==registration.qualification.id||own.qualification.version!==registration.qualification.version)break;
      roots.push(structuredClone(own.root_ref));
    }
    const invalidation=notices.find(item=>item.notice.credential_id===credential.id&&item.notice.issuer===credential.issuer&&item.notice.issued_at>=credential.issued_at&&item.notice.scope.id===credential.scope.id&&item.notice.scope.version===credential.scope.version);
    if(roots.length===2&&!confirmed_pairs.some(item=>item.credential_ref.id===credential.id))confirmed_pairs.push({credential_ref:{run_id:run,kind:'source-credential',id:credential.id,version:1},roots,scope:{id:'B',version:1},status:invalidation?'invalidated':'valid',invalidation_ref:invalidation?.ref??null});
  }
  const pairs=new Set(confirmed_pairs.filter(pair=>pair.status==='valid').map(pair=>pair.roots.map(root=>root.id).sort().join('/')));
  const full=['root-R/root-W','root-R/root-S','root-S/root-W'].every(pair=>pairs.has(pair));
  return {field_scope:'B.condition',content_delivery_count:deliveries.filter(delivery=>content.has(delivery.report_ref.id)).length,report_identity_count:content.size,global_independence:full?{kind:'confirmed',count:3,scope:{id:'B',version:1}}:{kind:'unknown'},confirmed_pairs};
}
