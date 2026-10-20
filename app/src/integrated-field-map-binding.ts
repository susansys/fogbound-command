import {regionOrigin,type RegionalBundle} from './regional-terrain';
import {integratedDisplayMapping,publicGeometryDigest,type IntegratedDisplayGeometry,type MapPoint} from './map-binding';
export {integratedDisplayMapping};
export function toIntegratedRegion(geometry:IntegratedDisplayGeometry,point:MapPoint):[number,number]{
 const origin=regionOrigin(geometry);if(!point.every(Number.isFinite))throw Error('Display point unavailable');return[point[0]-origin[0],point[1]-origin[1]];
}
export function fromIntegratedRegion(geometry:IntegratedDisplayGeometry,point:MapPoint):[number,number]{
 const origin=regionOrigin(geometry);if(!point.every(Number.isFinite))throw Error('Display point unavailable');return[point[0]+origin[0],point[1]+origin[1]];
}
export async function verifyIntegratedRegionBinding(bundle:RegionalBundle,geometry:IntegratedDisplayGeometry):Promise<void>{
 const origin=regionOrigin(geometry);if(bundle.origin.some((value,index)=>value!==origin[index])||bundle.geometryDigest!==await publicGeometryDigest(geometry))throw Error('Integrated display binding unavailable');
 // The derived geometry digest explicitly includes integratedDisplayMapping;
 // the original regional asset mapping/manifest and its unit are unchanged.
}
