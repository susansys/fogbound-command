import {GameError} from './contracts';

export type Coordinate=[number,number];
export type GeometryIdentity={map_id:'PLAY-CORRIDOR-MAP';map_version:1;geometry_version:string;crs_id:'FIC-LOCAL-XY-01'};
export type Uncertainty={kind:'unknown'}|{kind:'known';value:number;unit:'fictional_metre';evidence:string};
type ScopeBase=GeometryIdentity&{id:string;precision:0.01;uncertainty:Uncertainty;evidence_refs:string[]};
export type SpatialScope=ScopeBase&(
  |{kind:'point';typed_geometry:{position:Coordinate}}
  |{kind:'area';typed_geometry:{outer:Coordinate[];holes:Coordinate[][]}}
  |{kind:'region_set';typed_geometry:{area_refs:string[]}}
  |{kind:'edge';typed_geometry:{line:Coordinate[]}}
  |{kind:'corridor';typed_geometry:{centerline:Coordinate[];width:number;area_ref:string}}
  |{kind:'unresolved';typed_geometry:null}
);
export type PublicMap=GeometryIdentity&{extent:[400,300];unit:'fictional_metre';scopes:SpatialScope[]};
const object=(x:unknown):x is Record<string,unknown>=>typeof x==='object'&&x!==null&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const keys=(x:Record<string,unknown>,names:string[])=>Reflect.ownKeys(x).length===names.length&&Reflect.ownKeys(x).every(key=>typeof key==='string'&&names.includes(key)&&Object.getOwnPropertyDescriptor(x,key)?.enumerable===true&&Object.hasOwn(Object.getOwnPropertyDescriptor(x,key)!,'value'));
function array(x:unknown):x is unknown[]{
  if(!Array.isArray(x))return false;
  const own=Reflect.ownKeys(x);
  return own.length===x.length+1&&own.every(key=>key==='length'||typeof key==='string'&&/^(0|[1-9][0-9]*)$/.test(key)&&Number(key)<x.length&&Object.getOwnPropertyDescriptor(x,key)?.enumerable===true&&Object.hasOwn(Object.getOwnPropertyDescriptor(x,key)!,'value'));
}
export {array as dense_array};
function invalid(field_path='catalogs.map'):never{throw new GameError('INVALID_REQUEST',field_path);}
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const text=(x:unknown):x is string=>typeof x==='string'&&x.length>0&&x.length<=128;
const texts=(x:unknown):x is string[]=>array(x)&&x.length>0&&x.every(text)&&new Set(x).size===x.length;
export function coordinate(x:unknown):x is Coordinate{
  return array(x)&&x.length===2&&x.every(finite)&&x[0]>=0&&x[0]<=400&&x[1]>=0&&x[1]<=300&&x.every(v=>Math.round(v*100)/100===v);
}
const same=(a:Coordinate,b:Coordinate)=>a[0]===b[0]&&a[1]===b[1];
// All supplied coordinates have been checked on the integer-centimetre grid.
const cross=(a:Coordinate,b:Coordinate,c:Coordinate)=>(Math.round(b[0]*100)-Math.round(a[0]*100))*(Math.round(c[1]*100)-Math.round(a[1]*100))-(Math.round(b[1]*100)-Math.round(a[1]*100))*(Math.round(c[0]*100)-Math.round(a[0]*100));
const on_segment=(p:Coordinate,a:Coordinate,b:Coordinate)=>cross(a,b,p)===0&&p[0]>=Math.min(a[0],b[0])&&p[0]<=Math.max(a[0],b[0])&&p[1]>=Math.min(a[1],b[1])&&p[1]<=Math.max(a[1],b[1]);
function intersects(a:Coordinate,b:Coordinate,c:Coordinate,d:Coordinate):boolean{
  const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
  return abC*abD<0&&cdA*cdB<0||abC===0&&on_segment(c,a,b)||abD===0&&on_segment(d,a,b)||cdA===0&&on_segment(a,c,d)||cdB===0&&on_segment(b,c,d);
}
function ring(x:unknown):x is Coordinate[]{
  if(!array(x)||x.length<4||!x.every(coordinate)||!same(x[0],x[x.length-1]))return false;
  let area=0;
  for(let i=0;i<x.length-1;i++){
    if(same(x[i],x[i+1]))return false;
    area+=Math.round(x[i][0]*100)*Math.round(x[i+1][1]*100)-Math.round(x[i+1][0]*100)*Math.round(x[i][1]*100);
    for(let j=i+1;j<x.length-1;j++){
      if(j===i+1||i===0&&j===x.length-2)continue;
      if(intersects(x[i],x[i+1],x[j],x[j+1]))return false;
    }
    const previous=x[(i+x.length-2)%(x.length-1)],current=x[i],next=x[i+1];
    if(cross(previous,current,next)===0&&(current[0]-previous[0])*(next[0]-current[0])+(current[1]-previous[1])*(next[1]-current[1])<0)return false;
  }
  return area!==0;
}
function point_inside(p:Coordinate,r:Coordinate[],boundary:boolean):boolean{
  let inside=false;
  for(let i=0;i<r.length-1;i++){
    const a=r[i],b=r[i+1];if(on_segment(p,a,b))return boundary;
    if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
function rings_touch(a:Coordinate[],b:Coordinate[]):boolean{
  for(let i=0;i<a.length-1;i++)for(let j=0;j<b.length-1;j++)if(intersects(a[i],a[i+1],b[j],b[j+1]))return true;
  return false;
}
function area_geometry(x:Record<string,unknown>,field_path:string):boolean{
  if(!keys(x,['outer','holes']))invalid(field_path);
  if(!ring(x.outer))invalid(field_path+'.outer');
  if(!array(x.holes))invalid(field_path+'.holes');
  for(let i=0;i<x.holes.length;i++)if(!ring(x.holes[i]))invalid(`${field_path}.holes[${i}]`);
  if(!x.holes.every(ring))invalid(field_path+'.holes');
  const outer=x.outer,holes=x.holes;
  for(let i=0;i<holes.length;i++){
    if(!point_inside(holes[i][0],outer,false)||rings_touch(holes[i],outer))invalid(`${field_path}.holes[${i}]`);
    for(let j=0;j<i;j++)if(rings_touch(holes[i],holes[j])||point_inside(holes[i][0],holes[j],true)||point_inside(holes[j][0],holes[i],true))invalid(`${field_path}.holes[${i}]`);
  }
  return true;
}
function line(x:unknown):x is Coordinate[]{return array(x)&&x.length>=2&&x.every(coordinate)&&x.every((p,i)=>i===0||!same(p,x[i-1]));}
function uncertainty(x:unknown,field_path:string):x is Uncertainty{
  if(!object(x))return false;
  if(x.kind==='unknown')return keys(x,['kind']);
  if(x.kind==='known'&&x.unit===undefined)throw new GameError('CONFIG_PARAMETER_MISSING',field_path+'.unit');
  if(x.kind!=='known'||!keys(x,['kind','value','unit','evidence'])||!finite(x.value)||x.value<0||!text(x.evidence))return false;
  if(x.unit!=='fictional_metre')throw new GameError('CONFIG_UNIT_MISMATCH',field_path+'.unit');
  return true;
}
export function validate_public_map(value:unknown):asserts value is PublicMap{
  if(!object(value))invalid();
  if(value.unit===undefined)throw new GameError('CONFIG_PARAMETER_MISSING','catalogs.map.unit');
  if(value.unit!=='fictional_metre')throw new GameError('CONFIG_UNIT_MISMATCH','catalogs.map.unit');
  for(const [key,expected] of Object.entries({map_id:'PLAY-CORRIDOR-MAP',map_version:1,crs_id:'FIC-LOCAL-XY-01'}))if(value[key]!==expected)invalid('catalogs.map.'+key);
  if(!keys(value,['map_id','map_version','crs_id','geometry_version','extent','unit','scopes'])||value.map_id!=='PLAY-CORRIDOR-MAP'||value.map_version!==1||value.crs_id!=='FIC-LOCAL-XY-01'||typeof value.geometry_version!=='string'||!/^[a-f0-9]{64}$/.test(value.geometry_version)||!array(value.extent)||JSON.stringify(value.extent)!=='[400,300]'||!array(value.scopes)||value.scopes.length===0)invalid();
  const ids=new Set<string>();
  for(const [index,scope] of value.scopes.entries()){
    const at=`catalogs.map.scopes[${index}]`;
    if(!object(scope)||!keys(scope,['id','kind','map_id','map_version','crs_id','geometry_version','precision','uncertainty','typed_geometry','evidence_refs'])||!text(scope.id)||ids.has(scope.id)||scope.map_id!==value.map_id||scope.map_version!==value.map_version||scope.crs_id!==value.crs_id||scope.geometry_version!==value.geometry_version||scope.precision!==0.01||!uncertainty(scope.uncertainty,at+'.uncertainty')||!texts(scope.evidence_refs))invalid(at);
    ids.add(scope.id);
    const g=scope.typed_geometry;
    if(scope.kind==='unresolved'){if(g!==null)invalid(at+'.typed_geometry');continue;}
    if(!object(g))invalid(at+'.typed_geometry');
    switch(scope.kind){
      case 'point':if(!keys(g,['position'])||!coordinate(g.position))invalid(at+'.typed_geometry.position');break;
      case 'area':if(!area_geometry(g,at+'.typed_geometry'))invalid(at+'.typed_geometry');break;
      case 'region_set':if(!keys(g,['area_refs'])||!texts(g.area_refs))invalid(at+'.typed_geometry.area_refs');break;
      case 'edge':if(!keys(g,['line'])||!line(g.line))invalid(at+'.typed_geometry.line');break;
      case 'corridor':if(!keys(g,['centerline','width','area_ref'])||!line(g.centerline)||!finite(g.width)||g.width<=0||!text(g.area_ref))invalid(at+'.typed_geometry');break;
      default:invalid(at+'.kind');
    }
  }
  // All fields above are checked before using the discriminated public representation.
  const map=value as PublicMap;
  for(const [index,scope] of map.scopes.entries()){
    const at=`catalogs.map.scopes[${index}].typed_geometry`;
    if(scope.kind==='region_set'&&scope.typed_geometry.area_refs.some(id=>map.scopes.find(x=>x.id===id)?.kind!=='area'))invalid(at+'.area_refs');
    if(scope.kind==='corridor'){
      const area=map.scopes.find(x=>x.id===scope.typed_geometry.area_ref);
      if(area?.kind!=='area'||area.typed_geometry.holes.length!==0)invalid(at+'.area_ref');
      // This registered batch has straight, flat-capped HA/AB domains, not a world editor.
      const path=scope.typed_geometry.centerline,a=path[0],b=path[path.length-1];
      if(same(a,b)||path.some(p=>cross(a,b,p)!==0||!on_segment(p,a,b)))invalid(at+'.centerline');
      const length=Math.hypot(b[0]-a[0],b[1]-a[1]),nx=-(b[1]-a[1])/length*scope.typed_geometry.width/2,ny=(b[0]-a[0])/length*scope.typed_geometry.width/2;
      const expected:Coordinate[]=[[a[0]+nx,a[1]+ny],[b[0]+nx,b[1]+ny],[b[0]-nx,b[1]-ny],[a[0]-nx,a[1]-ny]];
      if(!expected.every(coordinate)||area.typed_geometry.outer.length!==5||expected.some(p=>!area.typed_geometry.outer.slice(0,-1).some(q=>same(p,q))))invalid(at);
    }
  }
}
