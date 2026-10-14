import { useEffect, useRef, useState } from "react";
import { Application, Container, Graphics,Sprite,Texture } from "pixi.js";
import ms from "milsymbol";
import { Plus, Minus, Crosshair, Stack, Compass } from "@phosphor-icons/react";
import type { PlayerView } from "./contracts";
import { clock } from "./player-copy";
import {createMapSurface,type MapSurface} from './map-surface';
import mapManifest from './map-assets/manifest.json';
import {loadRegionalBundle,RegionalResourceError,type RegionalBundle} from './regional-terrain';
import runtimeNotices from '../THIRD_PARTY_LICENSES/current-runtime-notices.txt?url&no-inline';
type Props = {
  view: PlayerView;
  selected: string;
  onSelect: (id: string) => void;
  planned: boolean;
  plannedTarget?:'N'|'T';
};
const symbol = new ms.Symbol("SFGPU-----*****", {
  size: 30,
  standard: "APP6",
  fill: true,
  fillColor: "#91becb",
  outlineColor: "#e4eee2",
  outlineWidth: 2,
}).asSVG();
export function MapView({ view, selected, onSelect, planned,plannedTarget='T' }: Props) {
  const recording=view.scenario_kind==='record';
  const sites=recording?(['H'] as const):view.geometry.N?(['H','N','T'] as const):(['H','T'] as const);
  const site=(id:'H'|'N'|'T')=>view.geometry[id]??view.geometry.H;
  const routeTarget=site(plannedTarget);
  const host = useRef<HTMLDivElement>(null),
    app = useRef<Application | null>(null),
    scene = useRef<Container | null>(null);
  const geographicHost=useRef<HTMLDivElement>(null),surface=useRef<MapSurface|null>(null);
  const regional=useRef<RegionalBundle|null>(null),background=useRef<Container|null>(null);
  const [regionState,setRegionState]=useState('loading');
  const [pointerPoint,setPointerPoint]=useState<readonly[number,number]|null>(null);
  const [regionalVisible,setRegionalVisible]=useState(true);
  const regionalVisibleRef=useRef(regionalVisible);regionalVisibleRef.current=regionalVisible;
  const [synthetic,setSynthetic]=useState(false),[sourceInfo,setSourceInfo]=useState(false),[variant,setVariant]=useState<'grid'|'colour'>('grid');
  const [renderer,setRenderer]=useState('pixi'),[mapFault,setMapFault]=useState('');
  const [displayChecks,setDisplayChecks]=useState<Array<{point:readonly [number,number];returned:readonly [number,number];error:number}>>([]);
  const camera = useRef({ x: 0, y: 0, s: 1, fit: 1 });
  const [cameraVersion, setCameraVersion] = useState(0),
    [legend, setLegend] = useState(false),
    [layers, setLayers] = useState(false),
    [terrain, setTerrain] = useState(true),
    [labels, setLabels] = useState(true),
    [error, setError] = useState(false);
  const terrainRef=useRef(terrain);terrainRef.current=terrain;
  const geometryKey=JSON.stringify(view.geometry);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    cx: number;
    cy: number;
    moved: boolean;
  } | null>(null);
  function apply() {
    const c = camera.current;
    if(surface.current){const origin=surface.current.project([0,0]);c.x=origin.x;c.y=origin.y;c.s=surface.current.scale();c.fit=surface.current.fitScale();}
    if (scene.current) {
      scene.current.position.set(c.x, c.y);
      scene.current.scale.set(c.s);
    }
    setCameraVersion((x) => x + 1);
  }
  function fit() {
    if(surface.current){surface.current.fit();apply();return;}
    const el = host.current;
    if (!el) return;
    const c = camera.current;
    c.fit = Math.min(
      (el.clientWidth - 140) / view.geometry.extent[0],
      (el.clientHeight - 110) / view.geometry.extent[1],
    );
    c.s = Math.max(0.3, c.fit);
    c.x = (el.clientWidth - view.geometry.extent[0] * c.s) / 2;
    c.y = (el.clientHeight - view.geometry.extent[1] * c.s) / 2;
    apply();
  }
  function magnify(factor: number, px?: number, py?: number) {
    if(surface.current){surface.current.zoom(factor,px===undefined||py===undefined?undefined:[px,py]);apply();return;}
    const el = host.current;
    if (!el) return;
    const c = camera.current,
      x = px ?? el.clientWidth / 2,
      y = py ?? el.clientHeight / 2,
      wx = (x - c.x) / c.s,
      wy = (y - c.y) / c.s;
    const regionFit=Math.max(.0001,Math.min((el.clientWidth-100)/10000,(el.clientHeight-100)/10000));
    const minimum=regional.current?Math.min(c.fit*.6,regionFit*.5):c.fit*.6;
    c.s = Math.max(minimum, Math.min(c.fit * 6, c.s * factor));
    c.x = x - wx * c.s;
    c.y = y - wy * c.s;
    apply();
  }
  function focusSelection(){
    const el=host.current;if(!el)return;
    const position=selected==='R'?[view.position.x,view.position.y]:site(selected==='N'?'N':selected==='T'?'T':'H');
    if(surface.current){surface.current.focus([position[0],position[1]]);apply();return;}
    camera.current.x=el.clientWidth/2-position[0]*camera.current.s;camera.current.y=el.clientHeight/2-position[1]*camera.current.s;apply();
  }
  function panorama(){const el=host.current;if(!el||!regional.current)return;const c=camera.current,origin=regional.current.origin;c.s=Math.min((el.clientWidth-100)/10000,(el.clientHeight-100)/10000);c.x=(el.clientWidth-10000*c.s)/2-origin[0]*c.s;c.y=(el.clientHeight-10000*c.s)/2-origin[1]*c.s;apply();}
  function checkDisplay(){
    const active=surface.current;if(!active)return;
    const controls=[[0,0],[400,0],[0,300],[400,300],[200,150]] as const;
    setDisplayChecks(controls.map(point=>{const screen=active.project(point),returned=active.unproject([screen.x,screen.y]);return {point,returned,error:Math.hypot(returned[0]-point[0],returned[1]-point[1])};}));
  }
  useEffect(() => {
    const el = host.current!;
    setError(false);
    setDisplayChecks([]);
    if(synthetic){
      const controller=new AbortController();
      let disposed=false;
      setRenderer('synthetic-loading');
      const failure=()=>{if(!disposed){setMapFault('合成底图不可用，已返回原示意图；仍可从文字列表选择对象。');setSynthetic(false);}};
      void createMapSurface(geographicHost.current!,view.geometry,controller.signal,apply,failure).then(instance=>{
        if(disposed){instance.remove();return;}
        surface.current=instance;instance.terrain(terrainRef.current);setRenderer('synthetic-ready');apply();
      }).catch(()=>{if(!disposed)failure();});
      return()=>{disposed=true;controller.abort();surface.current?.remove();surface.current=null;};
    }
    setRenderer('pixi');
    const controller=new AbortController();
    let disposed = false,
      ready = false;
    const instance = new Application();
    let observer: ResizeObserver | undefined;
    void instance
      .init({
        resizeTo: el,
        background: "#1c2929",
        antialias: true,
        resolution: devicePixelRatio,
        autoDensity: true,
      })
      .then(async() => {
        ready = true;
        if (disposed) {
          instance.destroy(true, { children: true });
          return;
        }
        el.prepend(instance.canvas);
        app.current = instance;
        const world = new Container(),
          graphics = new Graphics();
        scene.current = world;
        instance.stage.addChild(world);
        world.addChild(graphics);
        const { plain, rough, H, T, corridor_width } = view.geometry;
        graphics
          .rect(plain[0], plain[1], plain[2] - plain[0], plain[3] - plain[1])
          .fill({color:0x283a33,alpha:.12})
          .rect(rough[0], rough[1], rough[2] - rough[0], rough[3] - rough[1])
          .fill({color:0x384139,alpha:.12});
        for (let x = rough[0] + 20; x < rough[2]; x += 20)
          graphics
            .moveTo(x, rough[1])
            .lineTo(x - 20, rough[3])
            .stroke({ color: "#66705c", alpha: 0.2, width: 1 });
        graphics
          .rect(H[0], H[1] - corridor_width / 2, T[0] - H[0], corridor_width)
          .fill({ color: "#8fa8a0", alpha: 0.18 })
          .rect(H[0], H[1] - corridor_width / 2, T[0] - H[0], corridor_width)
          .stroke({ color: "#85968a", width: 1 });
        graphics
          .moveTo(H[0], H[1])
          .lineTo(T[0], T[1])
          .stroke({ color: "#9baf9a", width: 2 });
        fit();
        observer = new ResizeObserver(() => {
          if (!drag.current) apply();
        });
        observer.observe(el);
        try{
          setRegionState('loading');
          const bundle=await loadRegionalBundle(view.geometry,controller.signal);
          if(disposed){bundle.release();return;}
          regional.current=bundle;const layer=new Container();layer.visible=regionalVisibleRef.current;background.current=layer;world.addChildAt(layer,0);
          for(const asset of bundle.manifest.assets.filter(asset=>asset.kind==='surface')){
            const image=bundle.images.get(asset.file)!;const sprite=new Sprite(Texture.from(image));
            sprite.position.set(bundle.origin[0]+asset.u!,bundle.origin[1]+asset.v!);sprite.width=asset.extent![0];sprite.height=asset.extent![1];layer.addChild(sprite);
          }
          instance.renderer.render(instance.stage);
          await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
          if(!disposed){setRegionState('ready');setMapFault('');apply();}
        }catch(error){
          controller.abort();if(!disposed){setRegionState('unavailable');setMapFault(`虚构区域资源不可用：${error instanceof RegionalResourceError?error.message:'解码或图形初始化失败'}；合法地点、通道及文字选择仍保留。`);}
        }
      })
      .catch(() => {
        if (!disposed) setError(true);
      });
    return () => {
      disposed = true;
      controller.abort();regional.current?.release();regional.current=null;background.current=null;
      observer?.disconnect();
      app.current = null;
      scene.current = null;
      if (ready) instance.destroy(true, { children: true,texture:true,textureSource:true });
    };
  }, [synthetic,view.run_id,geometryKey]);
  useEffect(() => {
    if (scene.current) scene.current.visible = terrain;
    surface.current?.terrain(terrain);
  }, [terrain]);
  useEffect(()=>{if(background.current)background.current.visible=regionalVisible;},[regionalVisible]);
  useEffect(() => {
    const el = host.current!;
    const wheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest("[data-ui]")) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      magnify(
        e.deltaY < 0 ? 1.15 : 1 / 1.15,
        e.clientX - rect.left,
        e.clientY - rect.top,
      );
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  const c = camera.current,
    point = (x: number, y: number) => ({
      left: surface.current?.project([x,y]).x??c.x + x * c.s,
      top: surface.current?.project([x,y]).y??c.y + y * c.s,
    });
  const start=point(...view.geometry.H),end=point(...routeTarget);
  const scaleTarget=100/c.s,scalePower=10**Math.floor(Math.log10(scaleTarget));
  const scaleMetres=([1,2,5,10].filter(value=>value<=scaleTarget/scalePower).at(-1)??1)*scalePower;
  const regionPoint=pointerPoint&&regional.current?pointerPoint.map((value,index)=>value-regional.current!.origin[index]):null;
  const insideRegion=regionPoint?.every(value=>value>=0&&value<=10000);
  return (
    <div className="map-wrapper" onKeyDown={e=>{if(e.key==='Escape'){setLayers(false);setSourceInfo(false);setLegend(false);host.current?.focus();e.preventDefault();e.stopPropagation();}}}>
    <section
      className="map map-canvas"
      ref={host}
      tabIndex={0}
      aria-label="公开态势地图"
      data-camera={`${c.x},${c.y},${c.s}`}
      data-camera-version={cameraVersion}
      data-renderer={renderer}
      data-region-state={regionState}
      data-background-visible={regionalVisible}
      data-public-geometry-digest={surface.current?.public_geometry_digest}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "+" || e.key === "=") {
          magnify(1.15);
          e.preventDefault();
        } else if (e.key === "-") {
          magnify(1 / 1.15);
          e.preventDefault();
        } else if (e.key === "t" || e.key === "T") {
          onSelect(recording?'H':'T');
          e.preventDefault();
        } else if (
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
        ) {
          const dx=e.key === "ArrowLeft" ? 30 : e.key === "ArrowRight" ? -30 : 0,dy=e.key === "ArrowUp" ? 30 : e.key === "ArrowDown" ? -30 : 0;
          if(surface.current)surface.current.pan(dx,dy);else{c.x+=dx;c.y+=dy;}
          apply();
          e.preventDefault();
        }
      }}
      onPointerDown={(e) => {
        if (e.button !== 0 || (e.target as HTMLElement).closest("[data-ui]"))
          return;
        drag.current = {
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          cx: c.x,
          cy: c.y,
          moved: false,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (d && d.id === e.pointerId) {
          if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) d.moved = true;
          if (d.moved) {
          if(surface.current){surface.current.pan(e.clientX-d.x,e.clientY-d.y);d.x=e.clientX;d.y=e.clientY;}else{c.x = d.cx + e.clientX - d.x;c.y = d.cy + e.clientY - d.y;}
          apply();
          }
        }
        if(!(e.target as HTMLElement).closest('[data-ui]')){const box=e.currentTarget.getBoundingClientRect(),active=camera.current;setPointerPoint([(e.clientX-box.left-active.x)/active.s,(e.clientY-box.top-active.y)/active.s]);}
      }}
      onPointerLeave={()=>{if(!drag.current)setPointerPoint(null);}}
      onPointerUp={(e) => {
        const d = drag.current;
        if (d && d.id === e.pointerId && !d.moved) {
          const marker = document
            .elementFromPoint(e.clientX, e.clientY)
            ?.closest<HTMLElement>("[data-marker]");
          if (marker) onSelect(marker.dataset.marker!);
        }
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      {synthetic&&<div className="geographic-surface" ref={geographicHost} aria-hidden="true"/>}
      {mapFault&&<div className="map-fallback" role="alert" data-ui>{mapFault}</div>}
      {error && (
        <div className="fault" role="alert">
          地图渲染不可用；请用右侧文本选择固定目标。
        </div>
      )}
      <div className="map-caption" data-ui>
        <span className="outline-tag">程序生成的虚构区域；不代表任何现实地点</span>
        <span>最后确认 · 不是现场实时位置</span>
      </div>
      {pointerPoint&&<div className="map-coordinate" data-ui>图上{pointerPoint.map(value=>value.toFixed(2)).join(', ')} · {regionPoint?insideRegion?`区域${regionPoint.map(value=>value.toFixed(2)).join(', ')} 图上米（仅背景阅读）`:'区域界外：无地形资料':'区域资料未就绪'}</div>}
      {planned && !recording && (
        <svg className="plan-route" aria-hidden="true">
          <path
            d={`M${start.left} ${start.top} L${end.left} ${end.top}`}
            stroke="#d2b87e"
            strokeWidth="3"
            strokeDasharray="8 6"
            fill="none"
          />
        </svg>
      )}
      {!recording&&<svg className="plan-route" aria-hidden="true">
        {sites.map((id) => {
          const [x, y] = site(id);
          return (
            <path
              key={id}
              d={`M${point(x,y).left} ${point(x,y).top} v${id==='N'?-90:-44}`}
              stroke="#aabbb6"
              strokeWidth="1"
              fill="none"
            />
          );
        })}
      </svg>}
      <div className="world-overlay">
        {sites.map(id=><i key={id} className="map-anchor" data-anchor={id} aria-hidden="true" style={point(...site(id))}/>)}
        {recording&&<span className="record-leader" style={point(...view.geometry.H)} aria-hidden="true"/>}
        {sites.map((id) => {
          const [x, y] = site(id);
          return (
            <button
              key={id}
              aria-label={recording?'工位H':id==='N'?'近联络点N':id === "T" ? "联络点T" : "起点H"}
              data-marker={id}
              className={`site-marker ${view.geometry.N?'prestart-site':''} ${selected === id ? "selected" : ""}`}
              style={{ ...point(x, y), marginTop: recording?'-3.2em':id==='N'?-90:-44 }}
              onClick={(e) => {
                if (e.detail === 0) onSelect(id);
              }}
            >
              <span className="site-shape">{id}</span>
              {labels && <b>{recording?'工位H · 档案A':id==='N'?'近联络点':id === "T" ? view.geometry.N?'远联络点':'目标联络点' : "总部起点"}</b>}
            </button>
          );
        })}
        <button
          aria-label="编组R最后确认位置"
          data-marker="R"
          className={`unit-marker ${selected === "R" ? "selected" : ""}`}
          style={point(view.position.x, view.position.y)}
          onClick={(e) => {
            if (e.detail === 0) onSelect("R");
          }}
        >
          <img
            className="mil-symbol"
            alt="虚构编组R"
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(symbol)}`}
          />
          {labels && (
            <b>
              R<small>最后确认 · {clock(view.position.observed)}</small>
            </b>
          )}
        </button>
      </div>
      <div className="map-tools map-controls" data-ui>
        <button aria-label="放大地图" onClick={() => magnify(1.2)}>
          <Plus />
        </button>
        <span>{Math.round((c.s/c.fit)*100)}%</span>
        <button aria-label="缩小地图" onClick={() => magnify(1 / 1.2)}>
          <Minus />
        </button>
        <button aria-label="定位选中" onClick={focusSelection}>
          <Crosshair />
        </button>
        <button onClick={fit}>全图</button>
      </div>
      <button className="map-layer-toggle" data-ui aria-label="地图图层" onClick={()=>setLayers(x=>!x)}><Stack/> 图层</button>
      {layers && (
        <div className="map-layers" data-ui>
          <label><input type="checkbox" checked={regionalVisible} onChange={e=>setRegionalVisible(e.target.checked)}/>虚构区域背景</label>
          <button onClick={()=>setSourceInfo(value=>!value)} aria-expanded={sourceInfo}>区域资料与来源</button>
          <button disabled={regionState!=='ready'} onClick={panorama}>区域全景（仅背景阅读）</button>
          <button onClick={fit}>回到行动范围</button>
          {synthetic&&<button onClick={()=>setSourceInfo(value=>!value)} aria-expanded={sourceInfo}>合成资料与范围</button>}
          <label>
            <input
              type="checkbox"
              checked={terrain}
              onChange={(e) => setTerrain(e.target.checked)}
            />
            {recording?'公开地形及工位':'公开地形及走廊'}
          </label>
          <label>
            <input
              type="checkbox"
              checked={labels}
              onChange={(e) => setLabels(e.target.checked)}
            />
            标记文字
          </label>
        </div>
      )}
      {!synthetic&&sourceInfo&&<div className="map-source" data-ui><strong>原创虚构乡村丘陵 · synthetic-rural-1</strong><p>固定区域：10 × 10 图上公里；地表采样5图上米，非遥感精度。</p>{regional.current?<p>资源版本{regional.current.manifest.version} · 坐标映射{regional.current.manifest.mapping.version}；u向东、v向南；图上北在上。基准0为人为模拟参照。</p>:<p>资源身份尚未完成核验。</p>}<p>背景范围仅供阅读；合法活动范围仍为{view.geometry.extent.join(' × ')}图上米。</p><p>资料状态：{regionState==='ready'?'完整固定资源已核验':regionState==='loading'?'正在核验资源':'资源不可用'}；{regional.current?.bytes??0} 字节。</p><p>模拟数值相对虚构基准，不是现实海拔；素材由程序原创生成。系统字体未复制。</p><a href={runtimeNotices} target="_blank" rel="noopener">运行库许可与版权原文</a></div>}
      {synthetic&&sourceInfo&&<div className="map-source" data-ui><strong>原创合成网格 · 版本1</strong><p>仅验证显示配准，不是遥感影像。背景范围不是可执行区域。</p><p>当前操作范围：400 × 300 图上米；合成背景：800 × 600。</p><button disabled={renderer!=='synthetic-ready'} onClick={()=>{surface.current?.fit(true);apply();}}>区域全景</button><button disabled={renderer!=='synthetic-ready'} onClick={fit}>返回操作范围</button><button disabled={renderer!=='synthetic-ready'} onClick={()=>{const next=variant==='grid'?'colour':'grid';surface.current?.variant(next);setVariant(next);}}>切换颜色变体</button><button disabled={renderer!=='synthetic-ready'} onClick={checkDisplay}>检验显示配准</button>{displayChecks.length>0&&<table className="map-coordinate-check"><caption>本次浮点显示往返 · 仅阅读</caption><thead><tr><th>图上坐标</th><th>回算坐标</th></tr></thead><tbody>{displayChecks.map(check=><tr key={check.point.join(',')} data-return-x={check.returned[0]} data-return-y={check.returned[1]} data-error={check.error}><td>{check.point.join(', ')}</td><td>{check.returned.map(value=>value.toFixed(2)).join(', ')}</td></tr>)}</tbody></table>}<small>来源：项目原创；{mapManifest.assets.reduce((sum,asset)=>sum+asset.bytes,0)} 字节PNG，另有小型清单。</small></div>}
      <div className="map-legend" data-ui>
        <button aria-expanded={legend} onClick={() => setLegend((x) => !x)}>
          图例 {legend ? "收起" : "展开"}
        </button>
        {legend && (
          <p>
            蓝色框：最后确认编组
            <br />
            方形：登记地点
            <br />
            虚线：预案或已下达的计划
            <br />
            {synthetic?'网格与四角：原创合成显示资料':'右侧条纹：崎岖地带'}
          </p>
        )}
      </div>
      <div className="map-north" data-ui><Compass size={20}/>图上北</div>
    </section>
    <div className="map-objects" aria-label="地图对象选择">{(recording?(['R','H'] as const):view.geometry.N?(['R','H','N','T'] as const):(['R','H','T'] as const)).map(id=><button key={id} aria-pressed={selected===id} onClick={()=>onSelect(id)}>{id} · {id==='R'?(recording?'记录组':'联络组'):id==='H'?(recording?'工位':'总部'):'联络点'}</button>)}<span className="scale"><i style={{width:scaleMetres*c.s,maxWidth:'none'}}/>{scaleMetres} 图上米</span></div>
    </div>
  );
}
