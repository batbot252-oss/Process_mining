"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  Position,
  MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";

/** =========================
 *  Types & helpers
 *  ========================= */

type Mode = "AS_IS" | "TO_BE";
type LabelMode = "count" | "avg" | "p95" | "avg+p95" | "none";

type IssueFamily =
  | "qualite_conformite"
  | "donnees_continuite"
  | "organisation_flux"
  | "risque";

const ISSUE_LABEL: Record<IssueFamily, string> = {
  qualite_conformite: "Qualité / conformité",
  donnees_continuite: "Données / continuité numérique",
  organisation_flux: "Organisation / flux",
  risque: "Risque",
};

type ActivityId =
  | "cad_catpart"
  | "preprocess_main"
  | "flow3d_360"
  | "flow3d_fill"
  | "abaqus_fill_mech"
  | "sector_input"
  | "procast_thermal_preheat"
  | "abaqus_preheat_mech"
  | "preprocess_deformed"
  | "export_results"
  | "review_decision"
  | "rework_loop";

type Event = {
  caseId: string;
  ts: number; // epoch ms
  activity: ActivityId;
  nodeId: string;
  resource: string; // role/person
  issue?: IssueFamily; // if deviation/problem
};

type Trace = {
  caseId: string;
  events: Event[];
};

type SimParams = {
  cases: number;
  seed: number;
  skipGates: number; // 0..1
  manualTransfer: number; // 0..1
  uncontrolledLoops: number; // 0..1
};

type EdgeStat = {
  count: number;
  avgMin: number;
  p95Min: number;
};

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function quantile(sorted: number[], q: number) {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] === undefined) return sorted[base];
  return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
}

function minutesBetween(a: number, b: number) {
  return Math.max(0, Math.round((b - a) / 60000));
}

function fmtHoursFromMin(min: number) {
  const h = min / 60;
  if (h < 1) return `${min}m`;
  if (h < 48) return `${Math.round(h * 10) / 10}h`;
  const d = Math.round((h / 8) * 10) / 10; // 8h-day
  return `${d}j (8h)`;
}

/** =========================
 *  Process definition (TO-BE reference)
 *  ========================= */

type ProcNodeDef = {
  id: string; // ReactFlow node id
  activity: ActivityId;
  title: string;
  tool: string;
  team: string;
  headcount: number;
  stage: "Inputs" | "Pre-process" | "Thermal" | "CFD" | "FEA" | "Review" | "Output";
};

type ProcEdgeDef = {
  id: string;
  source: string;
  target: string;
  label: string;
};

const PROCESS_NODES: ProcNodeDef[] = [
  {
    id: "N_CAD",
    activity: "cad_catpart",
    title: "Entrée CAO",
    tool: "CATIA / 3DEXP",
    team: "BE",
    headcount: 4,
    stage: "Inputs",
  },
  {
    id: "N_PRE_A",
    activity: "preprocess_main",
    title: "Pré-process",
    tool: "Pre-process (A)",
    team: "BM / SIMU",
    headcount: 2,
    stage: "Pre-process",
  },
  {
    id: "N_FLOW_360",
    activity: "flow3d_360",
    title: "Verse « 360 »",
    tool: "Flow-3D",
    team: "SIMU CFD",
    headcount: 2,
    stage: "CFD",
  },
  {
    id: "N_FLOW_FILL",
    activity: "flow3d_fill",
    title: "Remplissage « zoom »",
    tool: "Flow-3D",
    team: "SIMU CFD",
    headcount: 2,
    stage: "CFD",
  },
  {
    id: "N_ABA_FILL",
    activity: "abaqus_fill_mech",
    title: "Mécanique remplissage",
    tool: "ABAQUS",
    team: "SIMU FEA",
    headcount: 1,
    stage: "FEA",
  },
  {
    id: "N_SECTOR",
    activity: "sector_input",
    title: "Entrée Secteur",
    tool: "Secteur",
    team: "Méthodes",
    headcount: 1,
    stage: "Inputs",
  },
  {
    id: "N_PROCAST",
    activity: "procast_thermal_preheat",
    title: "Thermique préchauffage",
    tool: "ProCast",
    team: "SIMU Procédé",
    headcount: 1,
    stage: "Thermal",
  },
  {
    id: "N_ABA_PREH",
    activity: "abaqus_preheat_mech",
    title: "Calcul préchauff. (mécanique)",
    tool: "ABAQUS",
    team: "SIMU FEA",
    headcount: 1,
    stage: "FEA",
  },
  {
    id: "N_PRE_DEF",
    activity: "preprocess_deformed",
    title: "Pré-process (déformé)",
    tool: "Pre-process (B)",
    team: "BM / SIMU",
    headcount: 1,
    stage: "Pre-process",
  },
  {
    id: "N_REVIEW",
    activity: "review_decision",
    title: "Revue / décision",
    tool: "Revue",
    team: "IPT",
    headcount: 3,
    stage: "Review",
  },
  {
    id: "N_EXPORT",
    activity: "export_results",
    title: "Sorties / Export",
    tool: "STL/CSV/INP",
    team: "SIMU",
    headcount: 1,
    stage: "Output",
  },
];

const TO_BE_EDGES: ProcEdgeDef[] = [
  { id: "E1", source: "N_CAD", target: "N_PRE_A", label: "catpart → stl" },
  { id: "E2", source: "N_PRE_A", target: "N_FLOW_360", label: "stl" },
  { id: "E3", source: "N_FLOW_360", target: "N_FLOW_FILL", label: "csv (débit)" },
  { id: "E4", source: "N_FLOW_FILL", target: "N_ABA_FILL", label: "inp" },
  { id: "E5", source: "N_SECTOR", target: "N_PROCAST", label: "catpart" },
  { id: "E6", source: "N_PROCAST", target: "N_ABA_PREH", label: "t°/champs" },
  { id: "E7", source: "N_ABA_PREH", target: "N_PRE_DEF", label: "stl (déformé)" },
  { id: "E8", source: "N_PRE_DEF", target: "N_FLOW_FILL", label: "stl (déformé)" },
  { id: "E9", source: "N_ABA_FILL", target: "N_REVIEW", label: "résultats" },
  { id: "E10", source: "N_REVIEW", target: "N_EXPORT", label: "OK → export" },
  // possible rework loop via review (not always used)
  { id: "E11", source: "N_REVIEW", target: "N_PRE_A", label: "NOK → reprise" },
];

const ALLOWED_EDGE_SET = new Set(TO_BE_EDGES.map((e) => `${e.source}=>${e.target}`));

/** =========================
 *  Simulation (AS-IS vs TO-BE)
 *  ========================= */

function pickIssue(rand: () => number): IssueFamily {
  const r = rand();
  if (r < 0.25) return "qualite_conformite";
  if (r < 0.55) return "donnees_continuite";
  if (r < 0.8) return "organisation_flux";
  return "risque";
}

function simulateOneTrace(
  rand: () => number,
  caseId: string,
  mode: Mode,
  params: SimParams
): Trace {
  const baseTs = Date.now() - Math.floor(rand() * 7 * 24 * 3600 * 1000);
  let ts = baseTs;

  const ev: Event[] = [];

  const push = (nodeId: string, activity: ActivityId, resource: string, issue?: IssueFamily) => {
    ev.push({ caseId, ts, nodeId, activity, resource, issue });
  };

  // role pool (effectifs / traces)
  const R = {
    BE: ["BE_1", "BE_2", "BE_3", "BE_4"],
    BM: ["BM_1", "BM_2"],
    CFD: ["CFD_1", "CFD_2"],
    FEA: ["FEA_1"],
    PROC: ["PROC_1"],
    IPT: ["IPT_1", "IPT_2", "IPT_3"],
  };

  // TO-BE canonical path (one of two inputs can exist; AS-IS may deviate)
  const canonicalA = ["N_CAD", "N_PRE_A", "N_FLOW_360", "N_FLOW_FILL", "N_ABA_FILL", "N_REVIEW", "N_EXPORT"];
  const canonicalB = ["N_SECTOR", "N_PROCAST", "N_ABA_PREH", "N_PRE_DEF", "N_FLOW_FILL", "N_ABA_FILL", "N_REVIEW", "N_EXPORT"];

  const pickCanonical = () => (rand() < 0.65 ? canonicalA : canonicalB);
  const path = pickCanonical();

  // durations per step (minutes)
  const durMin = (nodeId: string) => {
    // TO-BE is generally smoother; AS-IS adds noise and longer tails
    const base: Record<string, [number, number]> = {
      N_CAD: [30, 240],
      N_SECTOR: [10, 60],
      N_PRE_A: [60, 300],
      N_FLOW_360: [90, 480],
      N_FLOW_FILL: [120, 720],
      N_ABA_FILL: [90, 600],
      N_PROCAST: [120, 720],
      N_ABA_PREH: [90, 480],
      N_PRE_DEF: [45, 240],
      N_REVIEW: [30, 180],
      N_EXPORT: [5, 30],
    };
    const [a, b] = base[nodeId] ?? [30, 120];
    const u = rand();
    const span = b - a;

    if (mode === "TO_BE") {
      return a + Math.floor(u * span * 0.7);
    }
    // AS-IS: heavier tail
    const tail = u < 0.85 ? u : 0.85 + (u - 0.85) * 3.0;
    return a + Math.floor(clamp01(tail) * span);
  };

  const nodeToActivity: Record<string, ActivityId> = Object.fromEntries(
    PROCESS_NODES.map((n) => [n.id, n.activity])
  ) as any;

  const nodeToRes = (nodeId: string) => {
    if (nodeId === "N_CAD") return R.BE[Math.floor(rand() * R.BE.length)];
    if (nodeId === "N_SECTOR") return R.BM[Math.floor(rand() * R.BM.length)];
    if (nodeId === "N_PRE_A" || nodeId === "N_PRE_DEF") return R.BM[Math.floor(rand() * R.BM.length)];
    if (nodeId === "N_FLOW_360" || nodeId === "N_FLOW_FILL") return R.CFD[Math.floor(rand() * R.CFD.length)];
    if (nodeId === "N_ABA_FILL" || nodeId === "N_ABA_PREH") return R.FEA[0];
    if (nodeId === "N_PROCAST") return R.PROC[0];
    if (nodeId === "N_REVIEW") return R.IPT[Math.floor(rand() * R.IPT.length)];
    return "USER";
  };

  // walk the path, inject AS-IS deviations
  for (let i = 0; i < path.length; i++) {
    const nodeId = path[i];
    const activity = nodeToActivity[nodeId] ?? "rework_loop";
    const res = nodeToRes(nodeId);

    // AS-IS deviations
    let issue: IssueFamily | undefined = undefined;

    if (mode === "AS_IS") {
      // manual transfer
      if (rand() < params.manualTransfer) {
        issue = pickIssue(rand);
        ts += (20 + Math.floor(rand() * 120)) * 60000;
      }
      // skip gates (review rushed)
      if (nodeId === "N_REVIEW" && rand() < params.skipGates) {
        issue = issue ?? pickIssue(rand);
        ts += (5 + Math.floor(rand() * 30)) * 60000;
      }
    }

    push(nodeId, activity, res, issue);

    // step duration
    ts += durMin(nodeId) * 60000;

    // uncontrolled NOK loops (AS-IS only): bounce back to preprocess and re-run some steps
    if (mode === "AS_IS" && nodeId === "N_REVIEW" && rand() < params.uncontrolledLoops) {
      const loops = 1 + Math.floor(rand() * 2);
      for (let k = 0; k < loops; k++) {
        // loop: review -> preprocess -> flow fill -> abaqus fill -> review
        const loopSeq = ["N_PRE_A", "N_FLOW_FILL", "N_ABA_FILL", "N_REVIEW"];
        for (const ln of loopSeq) {
          const a2 = nodeToActivity[ln] ?? "rework_loop";
          const r2 = nodeToRes(ln);
          const issue2 = pickIssue(rand);
          push(ln, a2, r2, issue2);
          ts += (durMin(ln) + 30 + Math.floor(rand() * 180)) * 60000;
        }
      }
      // after loops, continue (export)
    }
  }

  return { caseId, events: ev };
}

function simulatePairedLog(params: SimParams) {
  const rand = mulberry32(params.seed);
  const toBe: Trace[] = [];
  const asIs: Trace[] = [];

  for (let i = 0; i < params.cases; i++) {
    const caseId = `CASE_${String(i + 1).padStart(4, "0")}`;
    toBe.push(simulateOneTrace(rand, caseId, "TO_BE", params));
    asIs.push(simulateOneTrace(rand, caseId, "AS_IS", params));
  }
  return { toBe, asIs };
}

/** =========================
 *  Mining: DFG + conformance + lead time + traces
 *  ========================= */

type DfgEdgeKey = string; // "source=>target"
type DfgEdgeAgg = {
  source: string;
  target: string;
  count: number;
  durationsMin: number[];
};

function buildDFG(traces: Trace[]) {
  const edges = new Map<DfgEdgeKey, DfgEdgeAgg>();

  for (const t of traces) {
    const e = t.events;
    for (let i = 0; i < e.length - 1; i++) {
      const a = e[i];
      const b = e[i + 1];
      const key = `${a.nodeId}=>${b.nodeId}`;
      const dur = minutesBetween(a.ts, b.ts);

      const cur = edges.get(key);
      if (!cur) {
        edges.set(key, { source: a.nodeId, target: b.nodeId, count: 1, durationsMin: [dur] });
      } else {
        cur.count += 1;
        cur.durationsMin.push(dur);
      }
    }
  }

  const stats = new Map<DfgEdgeKey, EdgeStat>();
  edges.forEach((agg, key) => {
    const sorted = [...agg.durationsMin].sort((x, y) => x - y);
    const avg = sorted.reduce((s, x) => s + x, 0) / Math.max(1, sorted.length);
    const p95 = quantile(sorted, 0.95);
    stats.set(key, { count: agg.count, avgMin: Math.round(avg), p95Min: Math.round(p95) });
  });

  return { edges, stats };
}

function computeLeadTimes(traces: Trace[]) {
  const leadMin: number[] = [];
  for (const t of traces) {
    if (t.events.length < 2) continue;
    const start = t.events[0].ts;
    const end = t.events[t.events.length - 1].ts;
    leadMin.push(minutesBetween(start, end));
  }
  const sorted = [...leadMin].sort((a, b) => a - b);
  const avg = sorted.reduce((s, x) => s + x, 0) / Math.max(1, sorted.length);
  const p95 = quantile(sorted, 0.95);
  return { avgMin: Math.round(avg), p95Min: Math.round(p95) };
}

function computeConformance(asIs: Trace[]) {
  let total = 0;
  let nonConform = 0;

  for (const t of asIs) {
    const e = t.events;
    for (let i = 0; i < e.length - 1; i++) {
      total += 1;
      const key = `${e[i].nodeId}=>${e[i + 1].nodeId}`;
      if (!ALLOWED_EDGE_SET.has(key)) nonConform += 1;
    }
  }
  const conform = total === 0 ? 1 : (total - nonConform) / total;
  return { conformPct: Math.round(conform * 100), total, nonConform };
}

function topVariants(traces: Trace[], k = 6) {
  const m = new Map<string, { count: number; example: Trace }>();
  for (const t of traces) {
    const seq = t.events.map((e) => e.nodeId).join(" > ");
    const cur = m.get(seq);
    if (!cur) m.set(seq, { count: 1, example: t });
    else cur.count += 1;
  }
  return [...m.entries()]
    .map(([seq, v]) => ({ seq, count: v.count, example: v.example }))
    .sort((a, b) => b.count - a.count)
    .slice(0, k);
}

/** =========================
 *  Layout (simple stage columns)
 *  ========================= */

const STAGE_ORDER: ProcNodeDef["stage"][] = [
  "Inputs",
  "Pre-process",
  "Thermal",
  "CFD",
  "FEA",
  "Review",
  "Output",
];

function buildInitialLayout() {
  const colX: Record<string, number> = {};
  STAGE_ORDER.forEach((s, i) => (colX[s] = 40 + i * 260));

  // vertical stacking per stage
  const stageY: Record<string, number> = {};
  STAGE_ORDER.forEach((s) => (stageY[s] = 60));

  const nodes: Node[] = PROCESS_NODES.map((n) => {
    const x = colX[n.stage];
    const y = stageY[n.stage];
    stageY[n.stage] += 120;

    return {
      id: n.id,
      type: "default",
      position: { x, y },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: {
        title: n.title,
        tool: n.tool,
        team: n.team,
        headcount: n.headcount,
      },
      style: {
        width: 220,
        borderRadius: 12,
        border: "1px solid rgba(0,0,0,0.15)",
        background: "white",
        padding: 10,
        fontSize: 12,
      },
    };
  });

  const edges: Edge[] = TO_BE_EDGES.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: "smoothstep",
    animated: false,
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
    data: { baseLabel: e.label },
    style: { strokeWidth: 2 },
  }));

  return { nodes, edges };
}

/** Token animation helpers */
type Segment = { x1: number; y1: number; x2: number; y2: number; len: number };

function centerOfNode(n: Node) {
  const w = (n.style as any)?.width ?? 220;
  const h = 70;
  return { x: n.position.x + w / 2, y: n.position.y + h / 2 };
}

function computeSegmentsForTrace(nodesById: Map<string, Node>, trace: Trace): Segment[] {
  const segs: Segment[] = [];
  const seq = trace.events.map((e) => e.nodeId);
  for (let i = 0; i < seq.length - 1; i++) {
    const a = nodesById.get(seq[i]);
    const b = nodesById.get(seq[i + 1]);
    if (!a || !b) continue;
    const ca = centerOfNode(a);
    const cb = centerOfNode(b);
    const dx = cb.x - ca.x;
    const dy = cb.y - ca.y;
    const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    segs.push({ x1: ca.x, y1: ca.y, x2: cb.x, y2: cb.y, len });
  }
  return segs;
}

function posOnSegments(segs: Segment[], dist: number) {
  let d = dist;
  for (const s of segs) {
    if (d <= s.len) {
      const t = s.len === 0 ? 0 : d / s.len;
      return { x: s.x1 + (s.x2 - s.x1) * t, y: s.y1 + (s.y2 - s.y1) * t };
    }
    d -= s.len;
  }
  const last = segs[segs.length - 1];
  return last ? { x: last.x2, y: last.y2 } : { x: 0, y: 0 };
}

/** Safe type-guard for NodeChange with id */
function hasId(change: NodeChange): change is NodeChange & { id: string } {
  return typeof (change as any).id === "string";
}
export default function ProcessExplorer() {
  return (
    <ReactFlowProvider>
      <ProcessExplorerInner />
    </ReactFlowProvider>
  );
}

function ProcessExplorerInner() {
  const initial = useMemo(() => buildInitialLayout(), []);

  const [mode, setMode] = useState<Mode>("AS_IS");
  const [labelMode, setLabelMode] = useState<LabelMode>("avg+p95");

  const [cases, setCases] = useState(200);
  const [seed, setSeed] = useState(7);

  const [skipGates, setSkipGates] = useState(0.35);
  const [manualTransfer, setManualTransfer] = useState(0.25);
  const [uncontrolledLoops, setUncontrolledLoops] = useState(0.35);

  const [focusNode, setFocusNode] = useState<string>("N_FLOW_FILL");
  const [neighborsDepth, setNeighborsDepth] = useState<number>(99); // 99 = full graph (default)

  const [nodes, setNodes] = useState<Node[]>(initial.nodes);
  const [edges, setEdges] = useState<Edge[]>(initial.edges);

  // keep manual positions when dragging
  const manualPosRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Simulation results
  const sim = useMemo(() => {
    const params: SimParams = {
      cases,
      seed,
      skipGates: clamp01(skipGates),
      manualTransfer: clamp01(manualTransfer),
      uncontrolledLoops: clamp01(uncontrolledLoops),
    };
    return simulatePairedLog(params);
  }, [cases, seed, skipGates, manualTransfer, uncontrolledLoops]);

  const traces = mode === "AS_IS" ? sim.asIs : sim.toBe;

  const dfg = useMemo(() => buildDFG(traces), [traces]);
  const lead = useMemo(() => computeLeadTimes(sim.asIs), [sim.asIs]);
  const conf = useMemo(() => computeConformance(sim.asIs), [sim.asIs]);
  const variants = useMemo(() => topVariants(traces, 6), [traces]);

  // Derived: node stats (events, resources)
  const nodeStats = useMemo(() => {
    const m = new Map<string, { events: number; resources: Set<string>; issues: Map<IssueFamily, number> }>();
    for (const t of traces) {
      for (const e of t.events) {
        const cur = m.get(e.nodeId) ?? {
          events: 0,
          resources: new Set<string>(),
          issues: new Map<IssueFamily, number>(),
        };
        cur.events += 1;
        cur.resources.add(e.resource);
        if (e.issue) cur.issues.set(e.issue, (cur.issues.get(e.issue) ?? 0) + 1);
        m.set(e.nodeId, cur);
      }
    }
    return m;
  }, [traces]);

  // Apply stats to node labels and keep manual positions
  useEffect(() => {
    setNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]));
      return initial.nodes.map((n0) => {
        const prevN = prevById.get(n0.id);
        const manual = manualPosRef.current.get(n0.id);
        const st = nodeStats.get(n0.id);
        const eventsCount = st?.events ?? 0;
        const resCount = st?.resources.size ?? 0;

        // build compact “celonis-like” card
        const title = (n0.data as any).title as string;
        const tool = (n0.data as any).tool as string;
        const team = (n0.data as any).team as string;
        const head = (n0.data as any).headcount as number;

        const issuesLine =
          st && st.issues.size > 0
            ? [...st.issues.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 2)
                .map(([k, v]) => `${ISSUE_LABEL[k]}: ${v}`)
                .join(" • ")
            : "—";

        return {
          ...n0,
          position: manual ?? prevN?.position ?? n0.position,
          data: {
            ...n0.data,
            __render: (
              <div style={{ lineHeight: 1.2 }}>
                <div style={{ fontWeight: 700, fontSize: 12 }}>{title}</div>
                <div style={{ opacity: 0.85 }}>{tool}</div>
                <div style={{ opacity: 0.7, marginTop: 6 }}>
                  {team} • effectif {head}
                </div>
                <div style={{ marginTop: 8, display: "flex", gap: 10 }}>
                  <span style={{ fontWeight: 600 }}>{eventsCount} events</span>
                  <span style={{ opacity: 0.75 }}>{resCount} ressources</span>
                </div>
                <div style={{ marginTop: 6, fontSize: 11, opacity: 0.75 }}>Problèmes: {issuesLine}</div>
              </div>
            ),
          },
        };
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeStats]);

  // Edge styles/labels for current mode + conformance (AS-IS vs TO-BE)
  useEffect(() => {
    setEdges((prev) => {
      const byId = new Map(prev.map((e) => [e.id, e]));
      // start from TO-BE edges baseline
      const base = initial.edges.map((e0) => {
        const prevE = byId.get(e0.id);
        return { ...e0, ...prevE };
      });

      // add observed edges in AS-IS DFG if not present in TO-BE (optional, to show deviations)
      const extra: Edge[] = [];
      if (mode === "AS_IS") {
        dfg.edges.forEach((agg, key) => {
          const inToBe = ALLOWED_EDGE_SET.has(key);
          if (inToBe) return;
          // show a dashed “deviation” edge
          extra.push({
            id: `DEV_${key}`,
            source: agg.source,
            target: agg.target,
            type: "smoothstep",
            markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
            style: { strokeWidth: 2, strokeDasharray: "6 4", opacity: 0.85 },
            data: { baseLabel: "déviation" },
          });
        });
      }

      const all = [...base, ...extra];

      // label based on current labelMode (use AS-IS stats for AS-IS; TO-BE is reference, still show counts from its traces)
      const stats = dfg.stats;

      return all.map((e) => {
        const key = `${e.source}=>${e.target}`;
        const st = stats.get(key);

        let lbl = (e.data as any)?.baseLabel ?? "";
        if (labelMode !== "none" && st) {
          if (labelMode === "count") lbl = `${st.count}`;
          else if (labelMode === "avg") lbl = `avg ${fmtHoursFromMin(st.avgMin)}`;
          else if (labelMode === "p95") lbl = `p95 ${fmtHoursFromMin(st.p95Min)}`;
          else lbl = `avg ${fmtHoursFromMin(st.avgMin)} • p95 ${fmtHoursFromMin(st.p95Min)}`;
        }

        const isAllowed = ALLOWED_EDGE_SET.has(key);
        const isDeviation = mode === "AS_IS" && !isAllowed;

        return {
          ...e,
          label: lbl,
          animated: false,
          style: {
            ...(e.style ?? {}),
            stroke: isDeviation ? "#d33" : "#222",
            opacity: isDeviation ? 0.95 : 0.85,
          },
          labelStyle: {
            fontSize: 11,
            fill: isDeviation ? "#d33" : "#222",
            fontWeight: 600,
          },
          labelBgStyle: {
            fill: "rgba(255,255,255,0.9)",
          },
          labelBgPadding: [6, 3],
          labelBgBorderRadius: 8,
        };
      });
    });
  }, [mode, labelMode, dfg, initial.edges]);

  /** =========================
   *  Local view (neighbors) filter
   *  ========================= */
  const filtered = useMemo(() => {
    if (neighborsDepth >= 50) return { nodes, edges }; // full
    const adj = new Map<string, string[]>();
    for (const e of edges) {
      const a = adj.get(e.source) ?? [];
      a.push(e.target);
      adj.set(e.source, a);
      const b = adj.get(e.target) ?? [];
      b.push(e.source);
      adj.set(e.target, b);
    }
    const keep = new Set<string>();
    const q: Array<{ id: string; d: number }> = [{ id: focusNode, d: 0 }];
    keep.add(focusNode);
    while (q.length) {
      const cur = q.shift()!;
      if (cur.d >= neighborsDepth) continue;
      const neigh = adj.get(cur.id) ?? [];
      for (const n of neigh) {
        if (keep.has(n)) continue;
        keep.add(n);
        q.push({ id: n, d: cur.d + 1 });
      }
    }
    const nn = nodes.filter((n) => keep.has(n.id) || n.id === "__token__");
    const ee = edges.filter((e) => keep.has(e.source) && keep.has(e.target));
    return { nodes: nn, edges: ee };
  }, [nodes, edges, focusNode, neighborsDepth]);

  /** =========================
   *  Node click -> show events
   *  ========================= */
  const [tab, setTab] = useState<"events" | "traces" | "stats">("events");

  const focusedEvents = useMemo(() => {
    const all: Event[] = [];
    for (const t of traces) for (const e of t.events) if (e.nodeId === focusNode) all.push(e);
    // show latest first
    return all.sort((a, b) => b.ts - a.ts).slice(0, 200);
  }, [traces, focusNode]);

  /** =========================
   *  Token playback (one case)
   *  ========================= */
  const [play, setPlay] = useState(false);
  const [playCaseIndex, setPlayCaseIndex] = useState(0);

  const nodesById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const playTrace = useMemo(() => {
    const t = traces[Math.max(0, Math.min(traces.length - 1, playCaseIndex))];
    return t;
  }, [traces, playCaseIndex]);

  const playSegments = useMemo(() => {
    if (!playTrace) return [];
    return computeSegmentsForTrace(nodesById, playTrace);
  }, [nodesById, playTrace]);

  const totalLen = useMemo(() => playSegments.reduce((s, x) => s + x.len, 0), [playSegments]);
  const rafRef = useRef<number | null>(null);
  const distRef = useRef(0);
  const lastTRef = useRef<number | null>(null);

  // create/update token node
  useEffect(() => {
    setNodes((prev) => {
      const has = prev.some((n) => n.id === "__token__");
      if (!has) {
        return [
          ...prev,
          {
            id: "__token__",
            type: "default",
            position: { x: 0, y: 0 },
            data: { __render: <div /> },
            draggable: false,
            selectable: false,
            style: {
              width: 16,
              height: 16,
              borderRadius: 999,
              background: "#111",
              border: "2px solid white",
              boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
              padding: 0,
            },
          },
        ];
      }
      return prev;
    });
  }, []);

  useEffect(() => {
    if (!play || playSegments.length === 0 || totalLen <= 1) return;

    const tick = (t: number) => {
      if (lastTRef.current == null) lastTRef.current = t;
      const dt = Math.min(80, t - lastTRef.current); // ms
      lastTRef.current = t;

      // speed: pixels per second
      const speed = 220; // tweak
      distRef.current += (speed * dt) / 1000;

      // loop
      if (distRef.current > totalLen) distRef.current = 0;

      const p = posOnSegments(playSegments, distRef.current);

      setNodes((prev) =>
        prev.map((n) => (n.id === "__token__" ? { ...n, position: { x: p.x - 8, y: p.y - 8 } } : n))
      );

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTRef.current = null;
    };
  }, [play, playSegments, totalLen]);

  /** =========================
   *  ReactFlow callbacks
   *  ========================= */
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    // ignore token changes safely (some NodeChange variants do not have id)
    const filtered = changes.filter((c) => !(hasId(c) && c.id === "__token__"));
    setNodes((nds) => applyNodeChanges(filtered, nds));

    // record manual positions for dragged nodes
    for (const c of filtered) {
      if (!hasId(c)) continue;
      if ((c as any).type === "position" && (c as any).position) {
        const p = (c as any).position as { x: number; y: number };
        manualPosRef.current.set(c.id, p);
      }
    }
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  const onNodeClick = useCallback((_evt: any, node: Node) => {
    if (node.id === "__token__") return;
    setFocusNode(node.id);
    setTab("events");
  }, []);

  /** =========================
   *  UI
   *  ========================= */
  const regenerate = () => {
    // change seed quickly
    setSeed((s) => (s + 1) % 10000);
  };

  return (
    <div style={{ height: "100vh", width: "100vw", background: "#f6f7f9" }}>
      {/* Top bar */}
      <div
        style={{
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid rgba(0,0,0,0.08)",
          background: "white",
        }}
      >
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Process Explorer</div>
          <div style={{ opacity: 0.7, fontSize: 12 }}>
            Mode AS-IS : rouge = transition non conforme au TO-BE. Clique un nœud pour voir les events.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={() => setMode("AS_IS")}
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: "1px solid rgba(0,0,0,0.15)",
              background: mode === "AS_IS" ? "#111" : "white",
              color: mode === "AS_IS" ? "white" : "#111",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            AS-IS (simulé)
          </button>
          <button
            onClick={() => setMode("TO_BE")}
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: "1px solid rgba(0,0,0,0.15)",
              background: mode === "TO_BE" ? "#111" : "white",
              color: mode === "TO_BE" ? "white" : "#111",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            TO-BE (référence)
          </button>
          <button
            onClick={regenerate}
            style={{
              padding: "8px 12px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.15)",
              background: "white",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Régénérer
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <KpiCard title="Focus" value={nodeLabel(focusNode)} sub="Clique un nœud pour recentrer" />
        <KpiCard title="Conformance (AS-IS vs TO-BE)" value={`${conf.conformPct}%`} sub={`${conf.nonConform}/${conf.total} transitions hors modèle`} />
        <KpiCard title="Lead time (AS-IS)" value={`${fmtHoursFromMin(lead.avgMin)} avg`} sub={`p95 ${fmtHoursFromMin(lead.p95Min)}`} />
        <KpiCard
          title="Impact vs TO-BE"
          value={`${fmtHoursFromMin(Math.max(0, lead.avgMin - computeLeadTimes(sim.toBe).avgMin))} avg/case`}
          sub="delta lead time (simulé)"
        />
      </div>

      {/* Controls row */}
      <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <PanelCard title="Cas simulés">
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.8 }}>
            <span>Nombre</span>
            <b>{cases}</b>
          </div>
          <input
            type="range"
            min={50}
            max={500}
            value={cases}
            onChange={(e) => setCases(parseInt(e.target.value, 10))}
            style={{ width: "100%" }}
          />
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>Seed: {seed}</div>
        </PanelCard>

        <PanelCard title="Vue (arborescence)">
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.8 }}>
            <span>Profondeur voisins</span>
            <b>{neighborsDepth >= 50 ? "complet" : neighborsDepth}</b>
          </div>
          <input
            type="range"
            min={1}
            max={50}
            value={Math.min(neighborsDepth, 50)}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              setNeighborsDepth(v >= 50 ? 99 : v);
            }}
            style={{ width: "100%" }}
          />
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>Recommandé : “complet” pour comprendre l’arborescence.</div>
        </PanelCard>

        <PanelCard title="Edge labels">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {(["avg+p95", "p95", "avg", "count", "none"] as LabelMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setLabelMode(m)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(0,0,0,0.15)",
                  background: labelMode === m ? "#111" : "white",
                  color: labelMode === m ? "white" : "#111",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 12,
                }}
              >
                {m}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>Temps calculés via timestamps (transition time)</div>
        </PanelCard>
      </div>

      {/* Deviation sliders */}
      <div style={{ padding: "0 14px 14px 14px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <PanelCard title="Skip gates">
          <SliderRow value={skipGates} setValue={setSkipGates} />
        </PanelCard>
        <PanelCard title="Manual transfer step">
          <SliderRow value={manualTransfer} setValue={setManualTransfer} />
        </PanelCard>
        <PanelCard title="Uncontrolled NOK loops">
          <SliderRow value={uncontrolledLoops} setValue={setUncontrolledLoops} />
        </PanelCard>
      </div>

      {/* Main area */}
      <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 12, height: "calc(100vh - 360px)" }}>
        <div style={{ background: "white", borderRadius: 16, border: "1px solid rgba(0,0,0,0.08)", overflow: "hidden" }}>
          <div style={{ height: "100%" }}>
            <ReactFlow
              nodes={filtered.nodes.map((n) =>
                n.data?.__render
                  ? {
                      ...n,
                      data: { label: n.data.__render },
                    }
                  : n
              )}
              edges={filtered.edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              fitView
              nodesDraggable
              nodesConnectable={false}
              elementsSelectable
            >
              <Background />
              <Controls />
              <MiniMap pannable zoomable />
            </ReactFlow>
          </div>
        </div>

        <div style={{ background: "white", borderRadius: 16, border: "1px solid rgba(0,0,0,0.08)", overflow: "hidden" }}>
          <div style={{ padding: 12, borderBottom: "1px solid rgba(0,0,0,0.08)", display: "flex", gap: 8 }}>
            <TabBtn active={tab === "events"} onClick={() => setTab("events")} label="Events" />
            <TabBtn active={tab === "traces"} onClick={() => setTab("traces")} label="Traces" />
            <TabBtn active={tab === "stats"} onClick={() => setTab("stats")} label="Stats" />
          </div>

          {tab === "events" && (
            <div style={{ padding: 12, overflow: "auto", height: "100%" }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>{nodeLabel(focusNode)}</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
                Affiche les 200 derniers events pour ce nœud (mode {mode}).
              </div>

              {focusedEvents.length === 0 ? (
                <div style={{ opacity: 0.7 }}>Aucun event sur ce nœud.</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {focusedEvents.map((e, idx) => (
                    <div
                      key={`${e.caseId}_${e.ts}_${idx}`}
                      style={{
                        border: "1px solid rgba(0,0,0,0.08)",
                        borderRadius: 12,
                        padding: 10,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <b style={{ fontSize: 12 }}>{e.caseId}</b>
                        <span style={{ fontSize: 12, opacity: 0.7 }}>{new Date(e.ts).toLocaleString()}</span>
                      </div>
                      <div style={{ marginTop: 6, fontSize: 12 }}>
                        <span style={{ fontWeight: 700 }}>{e.resource}</span>
                        <span style={{ opacity: 0.7 }}> • {e.activity}</span>
                      </div>
                      {e.issue && (
                        <div style={{ marginTop: 6, fontSize: 12, color: "#b11" }}>
                          Problème: {ISSUE_LABEL[e.issue]}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "traces" && (
            <div style={{ padding: 12, overflow: "auto", height: "100%" }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Top variants</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
                Variantes les plus fréquentes (mode {mode}).
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                {variants.map((v, i) => (
                  <div key={i} style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <b>{v.count} cas</b>
                      <button
                        onClick={() => {
                          const idx = traces.findIndex((t) => t.caseId === v.example.caseId);
                          setPlayCaseIndex(idx >= 0 ? idx : 0);
                          setPlay(true);
                        }}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 10,
                          border: "1px solid rgba(0,0,0,0.15)",
                          background: "white",
                          cursor: "pointer",
                          fontWeight: 800,
                          fontSize: 12,
                        }}
                      >
                        Lire (token)
                      </button>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85, whiteSpace: "pre-wrap" }}>
                      {prettySeq(v.seq)}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 14, borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: 12 }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>Playback</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    onClick={() => setPlay((p) => !p)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid rgba(0,0,0,0.15)",
                      background: play ? "#111" : "white",
                      color: play ? "white" : "#111",
                      cursor: "pointer",
                      fontWeight: 900,
                      fontSize: 12,
                    }}
                  >
                    {play ? "Pause" : "Play"}
                  </button>

                  <span style={{ fontSize: 12, opacity: 0.75 }}>Case:</span>
                  <input
                    type="number"
                    min={0}
                    max={Math.max(0, traces.length - 1)}
                    value={playCaseIndex}
                    onChange={(e) => setPlayCaseIndex(parseInt(e.target.value || "0", 10))}
                    style={{ width: 90, padding: "6px 8px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)" }}
                  />
                </div>

                {playTrace && (
                  <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}>
                    <b>{playTrace.caseId}</b>
                    <div style={{ marginTop: 6 }}>{prettySeq(playTrace.events.map((e) => e.nodeId).join(" > "))}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "stats" && (
            <div style={{ padding: 12, overflow: "auto", height: "100%" }}>
              <div style={{ fontWeight: 800, marginBottom: 10 }}>Résumé</div>

              <div style={{ display: "grid", gap: 10 }}>
                <StatLine label="Mode" value={mode} />
                <StatLine label="Cas simulés" value={String(cases)} />
                <StatLine label="Conformance (AS-IS vs TO-BE)" value={`${conf.conformPct}%`} />
                <StatLine label="Lead time (AS-IS avg)" value={fmtHoursFromMin(lead.avgMin)} />
                <StatLine label="Lead time (AS-IS p95)" value={fmtHoursFromMin(lead.p95Min)} />
              </div>

              <div style={{ marginTop: 16, fontWeight: 800, marginBottom: 8 }}>Paramètres déviation</div>
              <div style={{ display: "grid", gap: 10 }}>
                <StatLine label="Skip gates" value={`${Math.round(skipGates * 100)}%`} />
                <StatLine label="Manual transfer" value={`${Math.round(manualTransfer * 100)}%`} />
                <StatLine label="Uncontrolled NOK loops" value={`${Math.round(uncontrolledLoops * 100)}%`} />
              </div>

              <div style={{ marginTop: 16, fontSize: 12, opacity: 0.75 }}>
                Remarque : en mode AS-IS, les transitions non prévues par le TO-BE sont tracées en rouge / pointillées.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** =========================
 *  Small UI components
 *  ========================= */

function KpiCard(props: { title: string; value: string; sub: string }) {
  return (
    <div style={{ background: "white", borderRadius: 16, border: "1px solid rgba(0,0,0,0.08)", padding: 14 }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{props.title}</div>
      <div style={{ fontSize: 18, fontWeight: 900, marginTop: 6 }}>{props.value}</div>
      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{props.sub}</div>
    </div>
  );
}

function PanelCard(props: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "white", borderRadius: 16, border: "1px solid rgba(0,0,0,0.08)", padding: 14 }}>
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 10 }}>{props.title}</div>
      {props.children}
    </div>
  );
}

function SliderRow(props: { value: number; setValue: (v: number) => void }) {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.8 }}>
        <span>Probabilité</span>
        <b>{Math.round(props.value * 100)}%</b>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(props.value * 100)}
        onChange={(e) => props.setValue(parseInt(e.target.value, 10) / 100)}
        style={{ width: "100%" }}
      />
    </>
  );
}

function TabBtn(props: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={props.onClick}
      style={{
        padding: "8px 10px",
        borderRadius: 999,
        border: "1px solid rgba(0,0,0,0.15)",
        background: props.active ? "#111" : "white",
        color: props.active ? "white" : "#111",
        cursor: "pointer",
        fontWeight: 900,
        fontSize: 12,
      }}
    >
      {props.label}
    </button>
  );
}

function StatLine(props: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: 10 }}>
      <span style={{ fontSize: 12, opacity: 0.75 }}>{props.label}</span>
      <b style={{ fontSize: 12 }}>{props.value}</b>
    </div>
  );
}

function nodeLabel(nodeId: string) {
  const n = PROCESS_NODES.find((x) => x.id === nodeId);
  if (!n) return nodeId;
  return `${n.title} (${n.tool})`;
}

function prettySeq(seq: string) {
  // replace node ids by titles for readability
  return seq
    .split(" > ")
    .map((id) => {
      const n = PROCESS_NODES.find((x) => x.id === id);
      return n ? n.title : id;
    })
    .join("  →  ");
}
