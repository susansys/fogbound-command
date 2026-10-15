import {GameError} from './contracts';
import {coordinate,dense_array,same_coordinate as same,grid_cross as cross,segments_intersect as intersects,type Coordinate,type PublicMap} from './spatial';
import type {RouteDraft,RoutePlan} from './route-contracts';
function invalid(index?:number):never{throw new GameError('INVALID_REQUEST','route_draft.path'+(index===undefined?'':`[${index}]`));}
function exact(input:unknown,names:string[]):input is Record<string,unknown>{
  return typeof input==='object'&&input!==null&&Object.getPrototypeOf(input)===Object.prototype&&Reflect.ownKeys(input).length===names.length&&Reflect.ownKeys(input).every(key=>typeof key==='string'&&names.includes(key)&&Object.getOwnPropertyDescriptor(input,key)?.enumerable===true&&Object.hasOwn(Object.getOwnPropertyDescriptor(input,key)!,'value'));
}
export function valid_route_draft(input:unknown):input is RouteDraft{
  if(!exact(input,['actor','map_id','map_version','crs_id','geometry_version','path']))return false;
  return input.actor==='R'&&input.map_id==='PLAY-CORRIDOR-MAP'&&input.map_version===1&&input.crs_id==='FIC-LOCAL-XY-01'&&typeof input.geometry_version==='string'&&/^[a-f0-9]{64}$/.test(input.geometry_version)&&dense_array(input.path)&&input.path.length>=2&&input.path.length<=64&&input.path.every(coordinate);
}
export function valid_route_plan(input:unknown):input is RoutePlan{
  if(!exact(input,['map_id','map_version','crs_id','geometry_version','kind','run_id','revision','editing_seq','version','actor','path','path_digest','distance','unit','capability_ref','rules_hash','evidence_refs','allowed','gap','estimate_kind','estimated_move_ms','estimate_range','link_ms','assumptions']))return false;
  const id=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9_.-]{1,128}$/.test(v),digest=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),time=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
  if(!valid_route_draft({actor:input.actor,map_id:input.map_id,map_version:input.map_version,crs_id:input.crs_id,geometry_version:input.geometry_version,path:input.path})||input.kind!=='corridor_move'||!id(input.run_id)||!time(input.revision)||input.revision===0||!time(input.editing_seq)||input.version!==1||!digest(input.path_digest)||typeof input.distance!=='number'||!Number.isFinite(input.distance)||input.distance<=0||input.distance>32000||input.unit!=='fictional_metre'||!id(input.capability_ref)||!digest(input.rules_hash)||!dense_array(input.evidence_refs)||!input.evidence_refs.length||input.evidence_refs.length>32||!input.evidence_refs.every(id)||typeof input.allowed!=='boolean'||typeof input.gap!=='string'||input.gap.length>300||input.link_ms!==1000||!dense_array(input.assumptions)||input.assumptions.length>8||!input.assumptions.every(v=>typeof v==='string'&&v.length<=2000))return false;
  if(input.estimate_kind==='unknown'){
    if(input.estimated_move_ms!==null||input.estimate_range!==null||input.allowed!==false)return false;
  }else if(input.estimate_kind!=='known'||!time(input.estimated_move_ms)||!exact(input.estimate_range,['min_ms','max_ms','basis'])||input.estimate_range.min_ms!==input.estimated_move_ms||input.estimate_range.max_ms!==input.estimated_move_ms||input.estimate_range.basis!=='registered_rule_time')return false;
  try{return JSON.stringify(canonical_route(input.path))===JSON.stringify(input.path);}catch{return false;}
}
export function canonical_route(input:unknown):Coordinate[]{
  if(!dense_array(input)||input.length<2||input.length>64)invalid();
  const path:Coordinate[]=[];
  for(let i=0;i<input.length;i++){
    const p=input[i];if(!Object.hasOwn(input,i)||!coordinate(p))invalid(i);
    if(!path.length||!same(path[path.length-1],p))path.push([p[0],p[1]]);
  }
  if(path.length<2)invalid();
  // Reject reverse collinear travel before removing any same-direction point.
  for(let i=2;i<path.length;i++){
    const a=path[i-2],b=path[i-1],c=path[i];
    if(cross(a,b,c)===0&&(b[0]-a[0])*(c[0]-b[0])+(b[1]-a[1])*(c[1]-b[1])<0)invalid(i);
  }
  for(let i=1;i<path.length;i++)for(let j=i+2;j<path.length;j++)if(intersects(path[i-1],path[i],path[j-1],path[j]))invalid(j);
  const canonical:Coordinate[]=[];
  for(const p of path){
    while(canonical.length>=2&&cross(canonical[canonical.length-2],canonical[canonical.length-1],p)===0)canonical.pop();
    canonical.push(p);
  }
  return canonical;
}

// Validated corridor domains in this batch are straight flat-capped rectangles.
// Clip the whole segment against each domain, then cover [0,1] with their union.
export function public_route_gap(map:PublicMap,path:Coordinate[]):string{
  const domains=map.scopes.filter(scope=>scope.kind==='corridor').map(corridor=>{
    const area=map.scopes.find(scope=>scope.id===corridor.typed_geometry.area_ref);
    if(area?.kind!=='area')throw new GameError('INVALID_REQUEST');return area.typed_geometry.outer;
  });
  for(let segment=1;segment<path.length;segment++){
    const a=path[segment-1],b=path[segment],intervals:Array<[number,number]>=[];
    for(const ring of domains){
      const orientation=Math.sign(ring.slice(1).reduce((sum,p,i)=>sum+ring[i][0]*p[1]-p[0]*ring[i][1],0));
      let from=0,to=1;
      for(let i=1;i<ring.length&&from<=to;i++){
        const p=ring[i-1],q=ring[i],side=(r:Coordinate)=>orientation*((q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]));
        const initial=side(a),delta=side(b)-initial;
        if(delta===0){if(initial<0){from=1;to=0;}}
        else if(delta>0)from=Math.max(from,-initial/delta);
        else to=Math.min(to,-initial/delta);
      }
      if(from<=to)intervals.push([from,to]);
    }
    let covered=0;
    for(const [from,to] of intervals.sort((a,b)=>a[0]-b[0])){if(from>covered+1e-10)break;covered=Math.max(covered,to);}
    if(covered<1-1e-10)return `第 ${segment} 段离开已知走廊`;
  }
  return '';
}
