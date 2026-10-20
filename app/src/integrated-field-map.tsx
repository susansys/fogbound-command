import type {IntegratedFieldPlayerView} from './integrated-field-contracts';
export function IntegratedFieldMap({view}:{view:IntegratedFieldPlayerView}){
  const geometry=view.geometry;
  return <figure className="integrated-map"><svg viewBox="30 125 240 55" role="img" aria-label="虚构局部米坐标走廊图">
    <polyline points={(['H','A','B'] as const).map(id=>geometry.points[id].join(',')).join(' ')} fill="none" stroke="currentColor" strokeWidth="1"/>
    {Object.entries(geometry.points).map(([id,point])=><g key={id}><circle cx={point[0]} cy={point[1]} r="2" fill="currentColor"/><text x={point[0]} y={point[1]-7} textAnchor="middle" fontSize="6">{id}</text></g>)}
    {view.actors.map(actor=><g key={actor.id}><circle cx={actor.position.point[0]} cy={actor.position.point[1]+3} r="1.5" fill="#bb8243"/><text x={actor.position.point[0]} y={actor.position.point[1]+8} fontSize="4">{actor.id} · 总部最后确认</text></g>)}
    {geometry.segments.map(segment=>{const [from,to]=segment.id==='HA'?[geometry.points.H,geometry.points.A]:[geometry.points.A,geometry.points.B];return <text key={segment.id} x={(from[0]+to[0])/2} y={(from[1]+to[1])/2+13} textAnchor="middle" fontSize="5">{segment.id} · {segment.length_m} m</text>;})}
  </svg><figcaption>虚构局部坐标，1 单位 = 1 m；道路目录不代表当前路况。</figcaption></figure>;
}
