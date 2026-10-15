import type {Coordinate,PublicMap,SpatialScope} from '../spatial';
import type {MissionTruth} from '../mission-contracts';

type Area=Extract<SpatialScope,{kind:'area'}>['typed_geometry'];
type Shape={points:Coordinate[];lines:Coordinate[][];areas:Area[]};
type Segment=[Coordinate,Coordinate];
type Membership='inside'|'outside'|'uncertain';
const cross=(a:Coordinate,b:Coordinate,p:Coordinate)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
const same=(a:Coordinate,b:Coordinate)=>a[0]===b[0]&&a[1]===b[1];
function ring_position(p:Coordinate,ring:Coordinate[]):'inside'|'outside'|'boundary'|'uncertain'{
  let inside=false;
  for(let i=1;i<ring.length;i++){
    const a=ring[i-1],b=ring[i],c=cross(a,b,p);
    if(p[0]>=Math.min(a[0],b[0])&&p[0]<=Math.max(a[0],b[0])&&p[1]>=Math.min(a[1],b[1])&&p[1]<=Math.max(a[1],b[1])){
      if(c===0)return 'boundary';
      // Never turn numerical uncertainty near a computed intersection into proof.
      if(Math.abs(c)<1e-8)return 'uncertain';
    }
    if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside?'inside':'outside';
}
function in_area(p:Coordinate,area:Area):Membership{
  const outer=ring_position(p,area.outer);
  if(outer==='outside'||outer==='uncertain')return outer;
  for(const hole of area.holes){const where=ring_position(p,hole);if(where==='uncertain')return where;if(where!=='outside')return 'outside';}
  return 'inside';
}
function shape(scope:SpatialScope,map:PublicMap):Shape|null{
  if(scope.kind==='unresolved')return null;
  if(scope.kind==='point')return {points:[scope.typed_geometry.position],lines:[],areas:[]};
  if(scope.kind==='edge')return {points:[],lines:[scope.typed_geometry.line],areas:[]};
  if(scope.kind==='area')return {points:[],lines:[],areas:[scope.typed_geometry]};
  const ids=scope.kind==='corridor'?[scope.typed_geometry.area_ref]:scope.typed_geometry.area_refs;
  const areas:Area[]=[];
  for(const id of ids){const area=map.scopes.find(s=>s.id===id);if(area?.kind!=='area')return null;areas.push(area.typed_geometry);}
  return {points:[],lines:[],areas};
}
function segments(s:Shape):Segment[]{
  return [...s.lines,...s.areas.flatMap(a=>[a.outer,...a.holes])].flatMap(line=>line.slice(1).map((p,i):Segment=>[line[i],p]));
}
function contains(s:Shape,p:Coordinate):Membership{
  if(s.points.some(q=>same(p,q)))return 'inside';
  let uncertain=false;
  for(const [a,b] of s.lines.flatMap(line=>line.slice(1).map((q,i):Segment=>[line[i],q]))){
    const c=cross(a,b,p);
    if(p[0]>=Math.min(a[0],b[0])&&p[0]<=Math.max(a[0],b[0])&&p[1]>=Math.min(a[1],b[1])&&p[1]<=Math.max(a[1],b[1])){
      if(c===0)return 'inside';if(Math.abs(c)<1e-8)uncertain=true;
    }
  }
  for(const area of s.areas){const where=in_area(p,area);if(where==='inside')return where;if(where==='uncertain')uncertain=true;}
  return uncertain?'uncertain':'outside';
}
const midpoints=(values:number[])=>{
  const sorted=[...new Set(values)].sort((a,b)=>a-b);
  return [...sorted,...sorted.slice(1).map((v,i)=>(v+sorted[i])/2)];
};
// Polygon membership is constant in each vertical arrangement cell. Include
// every vertex/intersection x, each slab, every boundary y and each open cell.
// This tests the whole set (including excluded holes), rather than a centre/bbox.
function relation(source:Shape,target:Shape):MissionTruth{
  const edges=[...segments(source),...segments(target)],points=[...source.points,...target.points,...edges.flatMap(x=>x)];
  const xs=points.map(p=>p[0]);
  for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length;j++){
    const [a,b]=edges[i],[c,d]=edges[j],rx=b[0]-a[0],ry=b[1]-a[1],sx=d[0]-c[0],sy=d[1]-c[1],den=rx*sy-ry*sx;
    if(den===0)continue;
    const t=((c[0]-a[0])*sy-(c[1]-a[1])*sx)/den,u=((c[0]-a[0])*ry-(c[1]-a[1])*rx)/den;
    if(t>=0&&t<=1&&u>=0&&u<=1)xs.push(a[0]+t*rx);
  }
  let overlap=false,outside=false,uncertain=false;
  for(const x of midpoints(xs)){
    const ys=points.filter(p=>p[0]===x).map(p=>p[1]);
    for(const [a,b] of edges){
      if(x<Math.min(a[0],b[0])||x>Math.max(a[0],b[0]))continue;
      if(a[0]===b[0])ys.push(a[1],b[1]);else ys.push(a[1]+(x-a[0])*(b[1]-a[1])/(b[0]-a[0]));
    }
    for(const y of midpoints(ys)){
      const p:Coordinate=[x,y],s=contains(source,p);if(s==='outside')continue;
      const t=contains(target,p);if(s==='uncertain'||t==='uncertain'){uncertain=true;continue;}
      if(t==='inside')overlap=true;else outside=true;
    }
  }
  return uncertain?'U':!outside&&overlap?'T':!overlap?'F':'U';
}
function point_segment_distance(p:Coordinate,[a,b]:Segment):number{
  const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
}
function distance_to_shape(p:Coordinate,s:Shape):number{
  if(contains(s,p)!=='outside')return 0;
  return Math.min(...s.points.map(q=>Math.hypot(p[0]-q[0],p[1]-q[1])),...segments(s).map(e=>point_segment_distance(p,e)));
}
function boundary_distance(a:Shape,b:Shape):number{
  const ae=segments(a),be=segments(b),ap=[...a.points,...ae.flat()],bp=[...b.points,...be.flat()];
  return Math.min(...ap.flatMap(p=>[...bp.map(q=>Math.hypot(p[0]-q[0],p[1]-q[1])),...be.map(e=>point_segment_distance(p,e))]),...bp.flatMap(p=>ae.map(e=>point_segment_distance(p,e))));
}
export function compare_mission_position(scope:SpatialScope,target:SpatialScope,operator:'eq'|'in',map:PublicMap):MissionTruth{
  if(scope.uncertainty.kind==='unknown')return 'U';
  const source=shape(scope,map),destination=shape(target,map);if(!source||!destination)return 'U';
  const radius=scope.uncertainty.value;
  if(operator==='eq'){
    if(target.kind!=='point')return 'U';
    if(scope.kind==='point'&&radius===0&&same(scope.typed_geometry.position,target.typed_geometry.position))return 'T';
    return distance_to_shape(target.typed_geometry.position,source)>radius?'F':'U';
  }
  const base=relation(source,destination);if(radius===0)return base;
  if(base==='F')return boundary_distance(source,destination)>radius?'F':'U';
  // For a positive buffer only claim containment with a strictly proved margin.
  return base==='T'&&boundary_distance(source,destination)>radius?'T':'U';
}
