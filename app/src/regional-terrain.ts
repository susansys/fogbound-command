import release from './regional-assets/trusted-release.json';
import type {PlayerView} from './contracts';

export type RegionAsset={file:string;bytes:number;sha256:string;kind:string;width?:number;height?:number;u?:number;v?:number;extent?:number[]};
export type RegionManifest={schema:number;region_id:string;version:number;generator:string;generator_source_sha256:string;seed:string;config_hash:string;config:Record<string,unknown>;mapping:{version:string;domain:number[];axes:string[];unit:string;scale:number;basis:string};field:{width:number;height:number;step:number;encoding:string;order:string;minimum:number;maximum:number};bands:Array<{from:number;to:number;rgb:number[]}>;assets:RegionAsset[]};
export type RegionalBundle={manifest:RegionManifest;manifestHash:string;geometryDigest:string;origin:readonly[number,number];values:Float32Array;mask:Uint8Array;images:Map<string,ImageBitmap>;bytes:number;decodedBytes:number;metrics:{start:number;end:number;manifestReady:number;assets:Array<{file:string;bytes:number;start:number;read:number;verified:number;decoded:number}>};release:()=>void};
const urls=Object.fromEntries(Object.entries(import.meta.glob('./regional-assets/*',{query:'?url&no-inline',import:'default',eager:true})).map(([name,url])=>[name.split('/').at(-1)!,url as string]));
export async function digest(bytes:BufferSource){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');}
export class RegionalResourceError extends Error{}
export type SimulationField={width:number;height:number;step:number;values:Float32Array;mask:Uint8Array};
export function sampleSimulationHeight(field:SimulationField,u:number,v:number):number|null{
  const {width,height,step,values,mask}=field;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2||width>401||height>401||!Number.isFinite(step)||step<=0||values.length!==width*height||mask.length!==values.length||!Number.isFinite(u)||!Number.isFinite(v)||u<0||v<0||u>(width-1)*step||v>(height-1)*step)return null;
  const x=Math.min(width-2,Math.floor(u/step)),y=Math.min(height-2,Math.floor(v/step)),a=u/step-x,b=v/step-y;
  const indices=[y*width+x,y*width+x+1,(y+1)*width+x,(y+1)*width+x+1];
  if(indices.some(i=>mask[i]!==1||!Number.isFinite(values[i])))return null;
  const [h00,h10,h01,h11]=indices.map(i=>values[i]);
  return (h00*(1-a)+h10*a)*(1-b)+(h01*(1-a)+h11*a)*b;
}
function assert(condition:unknown,message:string):asserts condition{if(!condition)throw new RegionalResourceError(message);}
export function regionOrigin(geometry:PlayerView['geometry']):readonly[number,number]{
  const [w,h]=geometry.extent;assert(Number.isFinite(w)&&Number.isFinite(h)&&w>0&&h>0&&w<=10000&&h<=10000,'合法活动范围不能关联此区域');
  for(const point of [geometry.H,geometry.T,...(geometry.N?[geometry.N]:[])])assert(point.length===2&&point.every(Number.isFinite)&&point[0]>=0&&point[0]<=w&&point[1]>=0&&point[1]<=h,'公开几何不匹配区域');
  return[w/2-5000,h/2-5000];
}
async function read(file:string,signal:AbortSignal){
 assert(Object.hasOwn(urls,file),'资源路径不在受控发行中');const limit=file==='manifest.json'?release.manifest_bytes:release.assets.find(asset=>asset.file===file)?.bytes;
 assert(limit&&limit<=2*1024*1024,'资源长度不在受控发行中');const response=await fetch(urls[file],{signal});assert(response.ok,'区域资源缺失');
 assert(response.body&&Number(response.headers.get('content-length')??0)<=limit,'区域资源长度超出发行');
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let total=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;total+=value.length;assert(total<=limit,'区域资源长度超出发行');chunks.push(value);}}finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
 const data=new Uint8Array(total);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}return data;
}
function abortable<T>(work:Promise<T>,signal:AbortSignal):Promise<T>{
 return new Promise((resolve,reject)=>{const abort=()=>reject(new RegionalResourceError('区域加载已取消'));if(signal.aborted){abort();return;}signal.addEventListener('abort',abort,{once:true});work.then(value=>{signal.removeEventListener('abort',abort);resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});});
}
function checkManifest(manifest:RegionManifest){
  assert(manifest.schema===1&&manifest.generator===release.generator&&manifest.region_id===release.region_id&&manifest.version===release.version,'区域资料版本不一致');
  assert(manifest.config_hash===release.config_hash&&manifest.mapping.version==='local-region-1'&&manifest.mapping.scale===1&&manifest.mapping.unit==='fictional_metre'&&JSON.stringify(manifest.mapping.axes)==='["east","south"]'&&JSON.stringify(manifest.mapping.domain)==='[0,0,10000,10000]','区域映射不一致');
  assert(manifest.field.width===401&&manifest.field.height===401&&manifest.field.step===25&&manifest.field.encoding==='Float32LE'&&manifest.field.order==='v-major,u-minor','模拟高程尺寸不一致');
  assert(manifest.assets.length===release.assets.length&&new Set(manifest.assets.map(a=>a.file)).size===manifest.assets.length,'资源清单不完整');
  for(const asset of manifest.assets){const trusted=release.assets.find(a=>a.file===asset.file);assert(trusted&&asset.bytes===trusted.bytes&&asset.sha256===trusted.sha256&&asset.width===trusted.width&&asset.height===trusted.height&&asset.bytes>0&&asset.bytes<=2*1024*1024,'资源身份或长度不一致');}
}
export async function loadRegionalBundle(geometry:PlayerView['geometry'],upstream:AbortSignal):Promise<RegionalBundle>{
  const deadline=new AbortController(),signal=AbortSignal.any([upstream,deadline.signal]),timer=setTimeout(()=>deadline.abort(),15000);
  const metrics={start:performance.now(),end:0,manifestReady:0,assets:[] as Array<{file:string;bytes:number;start:number;read:number;verified:number;decoded:number}>};
  const origin=regionOrigin(geometry),images=new Map<string,ImageBitmap>();let closed=false;
  const dispose=()=>{if(closed)return;closed=true;for(const image of images.values())image.close();images.clear();};
  try{
    const raw=await read('manifest.json',signal);assert(raw.length===release.manifest_bytes,'区域清单长度不一致');
    const manifest=JSON.parse(new TextDecoder().decode(raw)) as RegionManifest;checkManifest(manifest);
    assert(await digest(raw.buffer)===release.manifest_sha256,'区域清单hash不一致');
    assert(await digest(new TextEncoder().encode(JSON.stringify(manifest.config)))===release.config_hash,'生成配置不一致');
    metrics.manifestReady=performance.now();
    let values:Float32Array|undefined,mask:Uint8Array|undefined,total=raw.length,decodedBytes=0,next=0;
    async function consume(){
      while(next<manifest.assets.length){const asset=manifest.assets[next++],start=performance.now(),data=await read(asset.file,signal),readAt=performance.now();total+=data.length;
        assert(!signal.aborted&&!closed,'区域加载已取消');assert(data.length===asset.bytes&&await digest(data.buffer)===asset.sha256,'区域资源长度或hash不一致');
        const verified=performance.now();
        if(asset.kind==='height'){
          assert(data.length===401*401*4,'模拟高程长度不一致');const view=new DataView(data.buffer);values=new Float32Array(401*401);for(let i=0;i<values.length;i++)values[i]=view.getFloat32(i*4,true);assert(values.every(Number.isFinite),'模拟高程包含无效值');
        }else if(asset.kind==='mask'){assert(data.length===401*401&&data.every(value=>value===1),'区域有效范围不完整');mask=data;
        }else if(asset.file.endsWith('.png')){
          const header=new DataView(data.buffer);assert(data.length>=33&&[137,80,78,71,13,10,26,10].every((value,index)=>data[index]===value)&&header.getUint32(16)===asset.width&&header.getUint32(20)===asset.height&&data[24]===8&&data[25]===6,'PNG尺寸或格式不一致');
          const image=await abortable(createImageBitmap(new Blob([data.buffer],{type:'image/png'})).then(image=>{if(signal.aborted||closed){image.close();throw new RegionalResourceError('区域加载已取消');}return image;}),signal);
          images.set(asset.file,image);assert(image.width===asset.width&&image.height===asset.height,'解码尺寸不一致');decodedBytes+=image.width*image.height*4;
        }
        metrics.assets.push({file:asset.file,bytes:data.length,start,read:readAt,verified,decoded:performance.now()});
      }
    }
    await Promise.all([consume(),consume()]);assert(values&&mask&&images.size===34&&total<=32*1024*1024,'完整区域资源未就绪');
    assert(decodedBytes*2+values.byteLength+mask.byteLength<=64*1024*1024,'地图可控缓存超目标');
    const geometryDigest=await digest(new TextEncoder().encode(JSON.stringify(geometry)));
    metrics.end=performance.now();return{manifest,manifestHash:release.manifest_sha256,geometryDigest,origin,values,mask,images,bytes:total,decodedBytes,metrics,release:dispose};
  }catch(error){const timedOut=deadline.signal.aborted&&!upstream.aborted;deadline.abort();dispose();throw timedOut?new RegionalResourceError('区域资源加载超时'):error;}finally{clearTimeout(timer);}
}
