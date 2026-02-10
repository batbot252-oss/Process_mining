// lib/layout.ts
import type { DFGEdge, DFGNode, EdgeStats, LabelMode, Pos, ProcessModel } from "./mining";
import { buildAdjacency, formatHoursFromMin } from "./mining";
import { actorFromActivity } from "./simulate";
import type { Edge, Node } from "reactflow";

export function buildStageColumns(model: ProcessModel, originX = 180, stepX = 280) {
  const cols = model.activities.map((_, i) => originX + i * stepX);
  cols.push(originX + 4.5 * stepX); // fallback col
  return cols;
}

export function nearestStageX(stageCols: number[], x: number) {
  let best = stageCols[0];
  let bestD = Math.abs(x - best);
  for (const c of stageCols) {
    const d = Math.abs(x - c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

function stageIndex(model: ProcessModel, activity: string) {
  const i = model.activities.indexOf(activity);
  return i >= 0 ? i : -1;
}

function actorLaneBase(actor?: string) {
  switch (actor) {
    case "BE":
      return 90;
    case "GATE":
      return 260;
    case "BM":
      return 430;
    case "MANUAL":
      return 520;
    case "SIMU":
      return 650;
    case "IPT":
      return 900;
    default:
      return 520;
  }
}

export function resolveOverlaps(nodes: Node[], stageCols: number[], minGap = 120) {
  const byCol = new Map<number, Node[]>();
  for (const n of nodes) {
    const cx = nearestStageX(stageCols, n.position.x);
    const arr = byCol.get(cx) ?? [];
    arr.push({ ...n, position: { ...n.position } });
    byCol.set(cx, arr);
  }

  const out: Node[] = [];
  for (const [, arr] of byCol) {
    arr.sort((a, b) => a.position.y - b.position.y);
    for (let i = 1; i < arr.length; i++) {
      const prev = arr[i - 1];
      const cur = arr[i];
      if (cur.position.y < prev.position.y + minGap) cur.position.y = prev.position.y + minGap;
    }
    out.push(...arr);
  }

  return out;
}

export function buildFullProcessGraph(args: {
  model: ProcessModel;
  stageCols: number[];
  dfg: { nodes: DFGNode[]; edges: DFGEdge[] };
  allowedEdges?: Set<string>;
  edgeStats?: Map<string, EdgeStats>;
  labelMode: LabelMode;
  lockColumns: boolean;
  autoSeparate: boolean;
  manualPos: Record<string, Pos>;
  minEdgeCount: number;
  selectedNodeId?: string;
  highlightK: number;
  stats: {
    resByAct: Map<string, Set<string>>;
    casesByAct: Map<string, Set<string>>;
  };
}) {
  const {
    model,
    stageCols,
    dfg,
    allowedEdges,
    edgeStats,
    labelMode,
    lockColumns,
    autoSeparate,
    manualPos,
    minEdgeCount,
    selectedNodeId,
    highlightK,
    stats,
  } = args;

  const { inMap, outMap } = buildAdjacency(dfg);

  const byActor = new Map<string, string[]>();
  for (const n of dfg.nodes) {
    const actor = actorFromActivity(n.id) ?? "UNKNOWN";
    const arr = byActor.get(actor) ?? [];
    arr.push(n.id);
    byActor.set(actor, arr);
  }

  for (const [actor, arr] of byActor) {
    arr.sort((a, b) => {
      const ia = stageIndex(model, a);
      const ib = stageIndex(model, b);
      if (ia !== ib) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      return a.localeCompare(b);
    });
    byActor.set(actor, arr);
  }

  const rfNodes: Node[] = dfg.nodes.map((n) => {
    const actor = actorFromActivity(n.id);
    const sIdx = stageIndex(model, n.id);

    const laneArr = byActor.get(actor ?? "UNKNOWN") ?? [];
    const lanePos = Math.max(0, laneArr.indexOf(n.id));

    const baseX = stageCols[Math.max(0, sIdx)] ?? stageCols[stageCols.length - 1];
    const baseY = actorLaneBase(actor) + lanePos * 120;

    const mp = manualPos[n.id];
    const pos = mp ? { x: mp.x, y: mp.y } : { x: baseX, y: baseY };
    const snapped = lockColumns ? { x: nearestStageX(stageCols, pos.x), y: pos.y } : pos;

    const eff = stats.resByAct.get(n.id)?.size ?? 0;
    const cases = stats.casesByAct.get(n.id)?.size ?? 0;

    return {
      id: n.id,
      type: "celonisNode",
      position: snapped,
      data: {
        label: n.id,
        count: n.count,
        actor,
        eff,
        cases,
        inDeg: (inMap.get(n.id) ?? []).length,
        outDeg: (outMap.get(n.id) ?? []).length,
        isFocus: n.id === selectedNodeId,
      },
    };
  });

  const nodes = autoSeparate && Object.keys(manualPos).length === 0 ? resolveOverlaps(rfNodes, stageCols) : rfNodes;

  const thickness = (c: number) => {
    if (c <= 1) return 1.4;
    if (c <= 3) return 2.2;
    if (c <= 8) return 3.0;
    return 4.0;
  };

  const edgeLabel = (src: string, tgt: string, c: number) => {
    if (labelMode === "none") return "";
    if (labelMode === "count") return String(c);
    const st = edgeStats?.get(`${src} -> ${tgt}`);
    if (!st) return "—";
    if (labelMode === "avg") return `avg ${formatHoursFromMin(st.meanMin)}`;
    if (labelMode === "p95") return `p95 ${formatHoursFromMin(st.p95Min)}`;
    return `avg ${formatHoursFromMin(st.meanMin)} | p95 ${formatHoursFromMin(st.p95Min)}`;
  };

  const edgeColor = (src: string, tgt: string) => {
    if (!allowedEdges) return "#9CA3AF";
    const ok = allowedEdges.has(`${src} -> ${tgt}`);
    return ok ? "#9CA3AF" : "#EF4444";
  };

  const highlightEdges = new Set<string>();
  if (selectedNodeId) {
    const inE = (inMap.get(selectedNodeId) ?? []).slice(0, highlightK);
    const outE = (outMap.get(selectedNodeId) ?? []).slice(0, highlightK);
    for (const e of [...inE, ...outE]) highlightEdges.add(`${e.source} -> ${e.target}`);
  }

  const edges: Edge[] = dfg.edges
    .filter((e) => e.count >= minEdgeCount)
    .map((e) => {
      const k = `${e.source} -> ${e.target}`;
      const isHi = selectedNodeId ? highlightEdges.has(k) : true;
      const faded = selectedNodeId ? !isHi : false;
      const label = edgeLabel(e.source, e.target, e.count);

      return {
        id: k,
        source: e.source,
        target: e.target,
        type: "smoothstep",
        animated: false,
        label,
        labelBgPadding: [6, 3],
        labelBgBorderRadius: 9,
        labelBgStyle: { fill: "rgba(255,255,255,0.9)", stroke: "rgba(228,228,231,1)", strokeWidth: 1 },
        labelStyle: { fill: "#111827", fontSize: 11, opacity: faded ? 0.25 : 1 },
        style: {
          strokeWidth: thickness(e.count),
          stroke: edgeColor(e.source, e.target),
          opacity: faded ? 0.18 : 1,
        },
      } as Edge;
    });

  return { nodes, edges };
}
