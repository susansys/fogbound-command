import type {Map as GeographicMap,ImageSource} from 'maplibre-gl';
import manifest from './map-assets/manifest.json';
import manifestUrl from './map-assets/manifest.json?url&no-inline';
import gridUrl from './map-assets/grid.png?url&no-inline';
import colourUrl from './map-assets/colour.png?url&no-inline';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type {PlayerView} from './contracts';
import type {PublicMap} from './spatial';
import {backgroundExtent,bytesDigest,fromDisplayLngLat,publicGeometryDigest,toDisplayLngLat,type MapPoint} from './map-binding';

export type MapSurface={
  public_geometry_digest:string;
  project:(point:MapPoint)=>{x:number;y:number};
  unproject:(point:MapPoint)=>[number,number];
  fit:(background?:boolean)=>void;
  focus:(point:MapPoint)=>void;
  pan:(x:number,y:number)=>void;
  zoom:(factor:number,point?:MapPoint)=>void;
  scale:()=>number;
  fitScale:()=>number;
  terrain:(visible:boolean)=>void;
  variant:(id:'grid'|'colour')=>void;
  remove:()=>void;
};

async function verifiedImages(signal:AbortSignal):Promise<string[]>{
  const response=await fetch(manifestUrl,{signal});
  if(!response.ok)throw Error('Synthetic map data unavailable');
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.length>16384||JSON.stringify(JSON.parse(new TextDecoder().decode(bytes)))!==JSON.stringify(manifest))throw Error('Synthetic map binding unavailable');
  const images=await Promise.all([gridUrl,colourUrl].map(async(url,index)=>{
    const response=await fetch(url,{signal});if(!response.ok)throw Error('Synthetic map image unavailable');
    const bytes=new Uint8Array(await response.arrayBuffer()),asset=manifest.assets[index];
    if(bytes.length!==asset.bytes||bytes.length>1048576||await bytesDigest(bytes)!==asset.sha256)throw Error('Synthetic map image unavailable');
    const blob=new Blob([bytes],{type:'image/png'}),image=await createImageBitmap(blob);
    try{if(image.width!==512||image.height!==384)throw Error('Synthetic map dimensions unavailable');}finally{image.close();}
    return blob;
  }));
  if(images.reduce((total,image)=>total+image.size,bytes.length)>2097152)throw Error('Synthetic map budget unavailable');
  if(signal.aborted)throw new DOMException('Map removed','AbortError');
  return images.map(image=>URL.createObjectURL(image));
}

export async function createMapSurface(host:HTMLElement,geometry:PlayerView['geometry']|PublicMap,signal:AbortSignal,onChange:()=>void,onFailure:()=>void):Promise<MapSurface>{
  const public_geometry_digest=await publicGeometryDigest(geometry);
  const urls=await verifiedImages(signal);
  let map:GeographicMap|undefined,removed=false,observer:ResizeObserver|undefined,fitScale=1;
  function remove(){if(removed)return;removed=true;observer?.disconnect();signal.removeEventListener('abort',remove);map?.remove();urls.forEach(url=>URL.revokeObjectURL(url));}
  signal.addEventListener('abort',remove,{once:true});
  try{
    const {Map,setWorkerUrl}=await import('maplibre-gl');
    setWorkerUrl(workerUrl);
    await import('maplibre-gl/dist/maplibre-gl.css');
    if(signal.aborted)throw new DOMException('Map removed','AbortError');
    map=new Map({container:host,interactive:false,attributionControl:false,bearing:0,pitch:0,renderWorldCopies:false,style:{version:8,sources:{synthetic:{type:'image',url:urls[0],coordinates:manifest.mapping.image_corners as [[number,number],[number,number],[number,number],[number,number]]}},layers:[{id:'synthetic',type:'raster',source:'synthetic',paint:{'raster-fade-duration':0}}]}});
    const active=map;
    const scale=()=>active.project(toDisplayLngLat([1,0])).x-active.project(toDisplayLngLat([0,0])).x;
    function fit(background=false){const [x1,y1,x2,y2]=background?backgroundExtent:[0,0,...geometry.extent];active.fitBounds([toDisplayLngLat([x1,y2]),toDisplayLngLat([x2,y1])],{padding:{top:60,bottom:50,left:70,right:70},duration:0});if(!background)fitScale=scale();}
    const surface:MapSurface={public_geometry_digest,project:p=>active.project(toDisplayLngLat(p)),unproject:p=>{const ll=active.unproject([p[0],p[1]]);return fromDisplayLngLat([ll.lng,ll.lat]);},fit,focus:p=>active.jumpTo({center:toDisplayLngLat(p)}),pan:(x,y)=>active.panBy([-x,-y],{duration:0}),zoom:(factor,point)=>{const around=point?active.unproject([point[0],point[1]]):active.getCenter(),desired=Math.max(fitScale*0.6,Math.min(fitScale*6,scale()*factor));active.easeTo({zoom:Math.max(0,Math.min(22,active.getZoom()+Math.log2(desired/scale()))),around,duration:0});},scale,fitScale:()=>fitScale,terrain:visible=>active.setLayoutProperty('synthetic','visibility',visible?'visible':'none'),variant:id=>(active.getSource('synthetic') as ImageSource).updateImage({url:urls[id==='grid'?0:1]}),remove};
    await new Promise<void>((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error('Synthetic map readiness unavailable')),15000);
      const abort=()=>{clearTimeout(timeout);reject(new DOMException('Map removed','AbortError'));};
      signal.addEventListener('abort',abort,{once:true});
      active.once('load',()=>{if(removed)return;fit();active.once('idle',()=>{clearTimeout(timeout);signal.removeEventListener('abort',abort);resolve();});});
      active.on('error',()=>{clearTimeout(timeout);signal.removeEventListener('abort',abort);reject(Error('Synthetic map rendering unavailable'));onFailure();});
      active.on('webglcontextlost',()=>{reject(Error('Synthetic map graphics unavailable'));onFailure();});
    });
    if(removed)throw new DOMException('Map removed','AbortError');
    active.on('move',()=>{if(!removed)onChange();});
    observer=new ResizeObserver(()=>{if(!removed){active.resize();onChange();}});observer.observe(host);
    return surface;
  }catch(error){remove();throw error;}
}
