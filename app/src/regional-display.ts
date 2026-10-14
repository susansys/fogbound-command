import Dexie,{type Table} from 'dexie';
import type {RegionalBundle} from './regional-terrain';
export type RegionalIdentity={region_id:string;domain:number[];unit:string;axes:string[];version:number;manifestHash:string;mapping:string;configHash:string;geometryDigest:string};
export type MapPreferences={camera:[number,number,number];mode:'surface'|'shade';background:boolean;terrain:boolean;labels:boolean};
export type RegionalDisplayRecord={id:string;run_id:string;association_revision:number;identity:RegionalIdentity;preferences:MapPreferences};
export class RegionalDisplayError extends Error{constructor(readonly code:'CONFLICT'|'WRITE_FAILED'|'READBACK_UNCONFIRMED'|'INVALID_RECORD'){super(code);}}
class DisplayDatabase extends Dexie{
 records!:Table<RegionalDisplayRecord,string>;heads!:Table<{run_id:string;id:string},string>;
 constructor(name:string){super(name);this.version(1).stores({records:'id,run_id',heads:'run_id'});}
}
export class RegionalDisplayStore{
 private db:DisplayDatabase;
 constructor(name='fogbound-map-b-display-1'){this.db=new DisplayDatabase(name);}
 close(){this.db.close();}
 async currentId(run:string):Promise<string|null>{return (await this.db.heads.get(run))?.id??null;}
 async read(run:string):Promise<RegionalDisplayRecord|null>{
  return this.db.transaction('r',this.db.heads,this.db.records,async()=>{const head=await this.db.heads.get(run);if(!head)return null;const record=await this.db.records.get(head.id);if(!record||record.id!==head.id)throw new RegionalDisplayError('INVALID_RECORD');return record;});
 }
 async write(record:RegionalDisplayRecord,expected:string|null):Promise<RegionalDisplayRecord>{
  try{await this.db.transaction('rw',this.db.heads,this.db.records,async()=>{
   const head=await this.db.heads.get(record.run_id);if((head?.id??null)!==expected)throw new RegionalDisplayError('CONFLICT');
   if(await this.db.records.get(record.id))throw new RegionalDisplayError('CONFLICT');
   await this.db.records.add(record);await this.db.heads.put({run_id:record.run_id,id:record.id});
  });}catch(error){throw error instanceof RegionalDisplayError?error:new RegionalDisplayError('WRITE_FAILED');}
  try{const readback=await this.read(record.run_id);if(JSON.stringify(readback)!==JSON.stringify(record))throw Error();return readback!;}catch{throw new RegionalDisplayError('READBACK_UNCONFIRMED');}
 }
 async reconcile(record:RegionalDisplayRecord):Promise<boolean>{return JSON.stringify(await this.read(record.run_id))===JSON.stringify(record);}
}
export function regionalIdentity(bundle:RegionalBundle):RegionalIdentity{
 const m=bundle.manifest;return{region_id:m.region_id,domain:m.mapping.domain,unit:m.mapping.unit,axes:m.mapping.axes,version:m.version,manifestHash:bundle.manifestHash,mapping:m.mapping.version,configHash:m.config_hash,geometryDigest:bundle.geometryDigest};
}
export function validMapPreferences(value:MapPreferences):boolean{
 return !!value&&Array.isArray(value.camera)&&value.camera.length===3&&value.camera.every(Number.isFinite)&&value.camera[2]>=.0001&&value.camera[2]<=100&&['surface','shade'].includes(value.mode)&&['background','terrain','labels'].every(key=>typeof value[key as keyof MapPreferences]==='boolean');
}
function nonce(){return Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');}
export class RegionalDisplaySession{
 private record:RegionalDisplayRecord|null=null;
 private pending:RegionalDisplayRecord|null=null;
 private identity:RegionalIdentity|null=null;
 private preferences:MapPreferences|null=null;
 private blocked=false;
 private connected=false;
 constructor(readonly run:string,private store:RegionalDisplayStore,readonly fresh:boolean,readonly snapshotRevision:number|null,private notify:(text:string)=>void){}
 update(preferences:MapPreferences){if(validMapPreferences(preferences))this.preferences=structuredClone(preferences);}
 private report(text:string){this.notify(`${text}${this.snapshotRevision===null?'':` · 真实恢复快照 ${this.snapshotRevision}`}`);}
 async connect(bundle:RegionalBundle,revision:number,defaults:MapPreferences,signal:AbortSignal):Promise<MapPreferences|null>{
  this.identity=regionalIdentity(bundle);this.preferences??=defaults;
  if(signal.aborted)return null;
  try{
   if(!this.record)this.record=await this.store.read(this.run);
   if(signal.aborted)return null;
   if(!this.record&&this.fresh&&!this.blocked){await this.save(revision);if(signal.aborted)return null;}
   const record=this.record;
   if(!record||record.run_id!==this.run||!Number.isSafeInteger(record.association_revision)||record.association_revision<1||record.association_revision>(this.connected?revision:this.snapshotRevision??revision)||JSON.stringify(record.identity)!==JSON.stringify(this.identity)||!validMapPreferences(record.preferences)){
    this.blocked=true;this.report('地图关联缺失或身份不匹配；合法覆盖及文字保留，请显式重新关联。');return null;
   }
   if(!this.connected)this.preferences=record.preferences;this.connected=true;this.report('地图关联已保存并读回核验');return this.preferences;
  }catch(error){this.blocked=true;this.report(error instanceof RegionalDisplayError&&error.code==='READBACK_UNCONFIRMED'?'地图关联提交结果待核查，未确认保存；保留原件。':'地图关联读取或写入失败；保留原件。');return null;}
 }
 async save(revision:number,rebind=false):Promise<boolean>{
  if(!this.identity||!this.preferences||this.pending||this.blocked&&!rebind){this.report('地图关联未保存；需要核查或显式重新关联。');return false;}
  const record:RegionalDisplayRecord={id:nonce(),run_id:this.run,association_revision:rebind||!this.record?revision:this.record.association_revision,identity:this.identity,preferences:structuredClone(this.preferences)};
  this.pending=record;
  try{const expected=rebind?await this.store.currentId(this.run):this.record?.id??null;this.record=await this.store.write(record,expected);this.pending=null;this.blocked=false;if(rebind)this.connected=true;this.report('地图关联已保存并读回核验');return true;}
  catch(error){if(error instanceof RegionalDisplayError&&error.code!=='READBACK_UNCONFIRMED')this.pending=null;this.blocked=true;this.report(error instanceof RegionalDisplayError&&error.code==='READBACK_UNCONFIRMED'?'地图关联提交结果待核查，未确认保存；保留原件。':error instanceof RegionalDisplayError&&error.code==='CONFLICT'?'地图关联写入冲突；保留最后良好原件。':'地图关联写入失败；保留最后良好原件。');return false;}
 }
 async reconcile():Promise<boolean>{
  if(!this.pending){this.report('没有待核查的地图提交。');return false;}
  try{if(await this.store.reconcile(this.pending)){this.record=this.pending;this.preferences=this.pending.preferences;this.pending=null;this.blocked=false;this.report('地图关联已核查保存');return true;}this.report('地图关联核查不匹配；不重复写入或删除原件。');return false;}catch{this.report('地图关联仍无法核查；不重复写入。');return false;}
 }
}
