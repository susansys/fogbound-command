import { useEffect, useRef, useState } from "react";
import { Application, Container, Graphics } from "pixi.js";
import ms from "milsymbol";
import { Plus, Minus, Crosshair, Stack, Compass } from "@phosphor-icons/react";
import type { PlayerView } from "./contracts";
import { clock } from "./player-copy";
type Props = {
  view: PlayerView;
  selected: string;
  onSelect: (id: string) => void;
  planned: boolean;
};
const symbol = new ms.Symbol("SFGPU-----*****", {
  size: 30,
  standard: "APP6",
  fill: true,
  fillColor: "#91becb",
  outlineColor: "#e4eee2",
  outlineWidth: 2,
}).asSVG();
export function MapView({ view, selected, onSelect, planned }: Props) {
  const host = useRef<HTMLDivElement>(null),
    app = useRef<Application | null>(null),
    scene = useRef<Container | null>(null);
  const camera = useRef({ x: 0, y: 0, s: 1, fit: 1 });
  const [cameraVersion, setCameraVersion] = useState(0),
    [legend, setLegend] = useState(false),
    [layers, setLayers] = useState(false),
    [terrain, setTerrain] = useState(true),
    [labels, setLabels] = useState(true),
    [error, setError] = useState(false);
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
    if (scene.current) {
      scene.current.position.set(c.x, c.y);
      scene.current.scale.set(c.s);
    }
    setCameraVersion((x) => x + 1);
  }
  function fit() {
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
    const el = host.current;
    if (!el) return;
    const c = camera.current,
      x = px ?? el.clientWidth / 2,
      y = py ?? el.clientHeight / 2,
      wx = (x - c.x) / c.s,
      wy = (y - c.y) / c.s;
    c.s = Math.max(c.fit * 0.6, Math.min(c.fit * 6, c.s * factor));
    c.x = x - wx * c.s;
    c.y = y - wy * c.s;
    apply();
  }
  useEffect(() => {
    const el = host.current!;
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
      .then(() => {
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
          .fill("#283a33")
          .rect(rough[0], rough[1], rough[2] - rough[0], rough[3] - rough[1])
          .fill("#384139");
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
      })
      .catch(() => {
        if (!disposed) setError(true);
      });
    return () => {
      disposed = true;
      observer?.disconnect();
      app.current = null;
      scene.current = null;
      if (ready) instance.destroy(true, { children: true });
    };
  }, []);
  useEffect(() => {
    if (scene.current) scene.current.visible = terrain;
  }, [terrain]);
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
      left: c.x + x * c.s,
      top: c.y + y * c.s,
    });
  return (
    <section
      className="map map-canvas"
      ref={host}
      tabIndex={0}
      aria-label="公开态势地图"
      data-camera={`${c.x},${c.y},${c.s}`}
      data-camera-version={cameraVersion}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "+" || e.key === "=") {
          magnify(1.15);
          e.preventDefault();
        } else if (e.key === "-") {
          magnify(1 / 1.15);
          e.preventDefault();
        } else if (e.key === "t" || e.key === "T") {
          onSelect("T");
          e.preventDefault();
        } else if (
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
        ) {
          c.x += e.key === "ArrowLeft" ? 30 : e.key === "ArrowRight" ? -30 : 0;
          c.y += e.key === "ArrowUp" ? 30 : e.key === "ArrowDown" ? -30 : 0;
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
        if (!d || d.id !== e.pointerId) return;
        if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) d.moved = true;
        if (d.moved) {
          c.x = d.cx + e.clientX - d.x;
          c.y = d.cy + e.clientY - d.y;
          apply();
        }
      }}
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
      {error && (
        <div className="fault" role="alert">
          地图渲染不可用；请用右侧文本选择固定目标。
        </div>
      )}
      <div className="map-caption" data-ui>
        <span className="outline-tag">演练地图 / 虚构区域</span>
        <span>最后确认 · 不是现场实时位置</span>
      </div>
      {planned && (
        <svg className="plan-route" aria-hidden="true">
          <path
            d={`M${c.x + view.geometry.H[0] * c.s} ${c.y + view.geometry.H[1] * c.s} L${c.x + view.geometry.T[0] * c.s} ${c.y + view.geometry.T[1] * c.s}`}
            stroke="#d2b87e"
            strokeWidth="3"
            strokeDasharray="8 6"
            fill="none"
          />
        </svg>
      )}
      <svg className="plan-route" aria-hidden="true">
        {(["H", "T"] as const).map((id) => {
          const [x, y] = view.geometry[id];
          return (
            <path
              key={id}
              d={`M${c.x + x * c.s} ${c.y + y * c.s} v-44`}
              stroke="#aabbb6"
              strokeWidth="1"
              fill="none"
            />
          );
        })}
      </svg>
      <div className="world-overlay">
        {(["H", "T"] as const).map((id) => {
          const [x, y] = view.geometry[id];
          return (
            <button
              key={id}
              aria-label={id === "T" ? "联络点T" : "起点H"}
              data-marker={id}
              className={`site-marker ${selected === id ? "selected" : ""}`}
              style={{ ...point(x, y), marginTop: -44 }}
              onClick={(e) => {
                if (e.detail === 0) onSelect(id);
              }}
            >
              <span className="site-shape">{id}</span>
              {labels && <b>{id === "T" ? "目标联络点" : "总部起点"}</b>}
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
      <div className="map-tools" data-ui>
        <button aria-label="放大地图" onClick={() => magnify(1.15)}>
          <Plus />
        </button>
        <button aria-label="缩小地图" onClick={() => magnify(1 / 1.15)}>
          <Minus />
        </button>
        <button aria-label="适应地图" onClick={fit}>
          <Crosshair />
        </button>
        <button aria-label="地图图层" onClick={() => setLayers((x) => !x)}>
          <Stack />
        </button>
      </div>
      {layers && (
        <div className="map-layers" data-ui>
          <label>
            <input
              type="checkbox"
              checked={terrain}
              onChange={(e) => setTerrain(e.target.checked)}
            />
            公开地形及走廊
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
            右侧条纹：崎岖地带
          </p>
        )}
      </div>
      <div className="map-scale" data-ui>
        <Compass size={20} /> N · {Math.round((c.s / c.fit) * 100)}% · 50米{" "}
        <span style={{ width: 50 * c.s }} />
      </div>
    </section>
  );
}
