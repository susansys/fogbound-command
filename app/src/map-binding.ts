import type {PlayerView} from './contracts';

export type MapPoint=readonly [number,number];
export const backgroundExtent=[-200,-150,600,450] as const;
const radius=6378137;

// A synthetic rendering convention, not a geographic measurement or Game rule.
export function toDisplayLngLat([x,y]:MapPoint):[number,number]{
  if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('Display coordinate unavailable');
  return [x/radius*180/Math.PI,(2*Math.atan(Math.exp(-y/radius))-Math.PI/2)*180/Math.PI];
}
export function fromDisplayLngLat([longitude,latitude]:MapPoint):[number,number]{
  if(!Number.isFinite(longitude)||!Number.isFinite(latitude)||Math.abs(latitude)>=85)throw Error('Display coordinate unavailable');
  return [radius*longitude*Math.PI/180,-radius*Math.log(Math.tan(Math.PI/4+latitude*Math.PI/360))];
}
export function withinExtent(point:MapPoint,extent:readonly number[]):boolean{
  return point.every(Number.isFinite)&&point[0]>=extent[0]&&point[0]<=extent[2]&&point[1]>=extent[1]&&point[1]<=extent[3];
}
export async function publicGeometryDigest(geometry:PlayerView['geometry']):Promise<string>{
  const {H,T,N,extent,corridor_width,plain,rough}=geometry;
  const points=[H,T,...(N?[N]:[])];
  const rectangles=[plain,rough];
  if(extent.length!==2||extent[0]!==400||extent[1]!==300||points.some(p=>p.length!==2||!withinExtent(p,[0,0,400,300]))||!Number.isFinite(corridor_width)||corridor_width<=0||corridor_width>300||rectangles.some(r=>r.length!==4||!withinExtent([r[0],r[1]],[0,0,400,300])||!withinExtent([r[2],r[3]],[0,0,400,300])||r[0]>r[2]||r[1]>r[3]))throw Error('Public map geometry unavailable');
  const canonical=JSON.stringify({H,T,...(N?{N}:{}),extent,corridor_width,plain,rough});
  return bytesDigest(new TextEncoder().encode(canonical));
}
export async function bytesDigest(bytes:Uint8Array):Promise<string>{
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer)),byte=>byte.toString(16).padStart(2,'0')).join('');
}
