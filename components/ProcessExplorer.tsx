"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlowInstance,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Connection,
  Edge,
  EdgeChange,
  MarkerType,
  Node,
  NodeChange,
  OnConnect,
  NodeProps,
  useReactFlow,
} from "reactflow";
import "reactflow/dist/style.css";

/**
 * ProcessExplorer.tsx
 * - Celonis-like process graph explorer (engineering-oriented)
 * - Simulates AS-IS vs TO-BE event logs
 * - Conformance (AS-IS vs TO-BE), lead times, deviations, traces
 * - Draggable nodes + overlap reduction
 * - Token animation (a moving "ball") following one case trace
 *
 * This file is self-contained on purpose (single copy/paste).
 */

// -------------------- Types --------------------

type IssueFamily = "qualite" | "donnees" | "organisation" | "risque";

const ISSUE_FAMILIES: { key: IssueFamily; label: string }[] = [
  { key: "qualite", label: "Qualité / conformité" },
  { key: "donnees", label: "Données / continuité numérique" },
  { key: "organisation", label: "Organisation / flux" },
  { key: "risque", label: "Risque" },
];

type Stage =
  | "Entrées"
  | "Pré-process"
  | "Simulation"
  | "Couplage"
  | "Résultats"
  | "Boucles";

type StepId = string;

type Step = {
  id: StepId;
  label: string;
  tool: string;
  stage: Stage;
  headcount: number;
};

type Link = {
  id: string;
  from: StepId;
  to: StepId;
  artifact?: string;
  /** Whether this transition is part of the TO-BE reference */
  allowed: boolean;
};

type Event = {
  caseId: string;
  tsMin: number; // timestamp in minutes from case start
  stepId: StepId;
  stepLabel: string;
  resource: string;
  issue?: IssueFamily; // present only on "problem" steps/transitions
};

type Trace = {
  signature: string;
  steps: StepId[];
  count: number;
  avgLeadMin: number;
  p95LeadMin: number;
};

type EdgeStats = {
  count: number;
  avgMin: number;
  p95Min: number;
};

type ConformanceSummary = {
  totalTransitions: number;
  nonConformTransitions: number;
  conformPct: number; // 0..1
};

type CaseLeadStats = {
  avgMin: number;
  p95Min: number;
};

type LabelMode = "count" | "avg" | "p95" | "avg+p95" | "none";

type Tab = "events" | "traces" | "stats";

type SimKnobs = {
  cases: number;
  seed: number;
  skipGatesPct: number; // 0..1
  manualTransferPct: number; // 0..1
  uncontrolledLoopsPct: number; // 0..1
};

type SimulationResult = {
  asIs: Event[];
  toBe: Event[];
  focusDefault: StepId;
};

type Pos = { x: number; y: number };

// -------------------- Process model (Flow-3D / ProCast / ABAQUS example) --------------------

const STEPS: Step[] = [
  { id: "cad_catpart", label: "Entrée CAO", tool: "CATIA / 3DEXP (CATPart)", stage: "Entrées", headcount: 2 },
  { id: "sector", label: "Secteur", tool: "CATIA / 3DEXP", stage: "Entrées", headcount: 1 },

  { id: "prep_mesh", label: "Pré-process", tool: "Prépa / Maillage", stage: "Pré-process", headcount: 1 },
  { id: "prep_mesh_def", label: "Pré-process (déformé)", tool: "Prépa / Maillage", stage: "Pré-process", headcount: 1 },

  { id: "flow_360", label: "Verse \"360\"", tool: "FLOW-3D", stage: "Simulation", headcount: 1 },
  { id: "flow_zoom", label: "Remplissage \"zoom\"", tool: "FLOW-3D", stage: "Simulation", headcount: 1 },
  { id: "aba_fill_mech", label: "Mécanique remplissage", tool: "ABAQUS", stage: "Couplage", headcount: 1 },

  { id: "procast_preheat", label: "Thermique préchauff.", tool: "ProCast", stage: "Simulation", headcount: 1 },
  { id: "aba_preheat", label: "Calcul préchauff.", tool: "ABAQUS", stage: "Couplage", headcount: 1 },

  { id: "export_stl", label: "Export STL", tool: "STL", stage: "Résultats", headcount: 0 },

  // Boucles / rework (engineering-oriented)
  { id: "rework_cao", label: "Rework CAO", tool: "BE", stage: "Boucles", headcount: 2 },
  { id: "rework_mesh", label: "Rework maillage", tool: "BM / Prépa", stage: "Boucles", headcount: 1 },
  { id: "rework_params", label: "Recalage paramètres", tool: "SIMU", stage: "Boucles", headcount: 1 },
  { id: "risk_review", label: "Revue risque", tool: "Qualité", stage: "Boucles", headcount: 1 },
];

const LINKS: Link[] = [
  // Main chain
  { id: "e1", from: "cad_catpart", to: "prep_mesh", artifact: "catpart", allowed: true },
  { id: "e2", from: "prep_mesh", to: "flow_360", artifact: "stl", allowed: true },
  { id: "e3", from: "flow_360", to: "flow_zoom", artifact: "csv (débit)", allowed: true },
  { id: "e4", from: "flow_zoom", to: "aba_fill_mech", artifact: "trc", allowed: true },
  { id: "e5", from: "aba_fill_mech", to: "export_stl", artifact: "stl", allowed: true },

  // Preheat branch
  { id: "e6", from: "sector", to: "procast_preheat", artifact: "catpart", allowed: true },
  { id: "e7", from: "procast_preheat", to: "aba_preheat", artifact: "fld", allowed: true },
  { id: "e8", from: "aba_preheat", to: "prep_mesh_def", artifact: "dat (coord def)", allowed: true },
  { id: "e9", from: "prep_mesh_def", to: "flow_zoom", artifact: "stl (déformé)", allowed: true },

  // Rework loops (NOT in TO-BE reference by default)
  { id: "r1", from: "flow_zoom", to: "rework_params", artifact: "NOK", allowed: false },
  { id: "r2", from: "rework_params", to: "flow_zoom", artifact: "relaunch", allowed: false },

  { id: "r3", from: "aba_fill_mech", to: "risk_review", artifact: "écart", allowed: false },
  { id: "r4", from: "risk_review", to: "aba_fill_mech", artifact: "GO", allowed: false },

  { id: "r5", from: "prep_mesh", to: "rework_mesh", artifact: "maillage NOK", allowed: false },
  { id: "r6", from: "rework_mesh", to: "prep_mesh", artifact: "corrigé", allowed: false },

  { id: "r7", from: "cad_catpart", to: "rework_cao", artifact: "modif", allowed: false },
  { id: "r8", from: "rework_cao", to: "cad_catpart", artifact: "nouvelle ver.", allowed: false },
];

const STAGE_ORDER: Stage[] = ["Entrées", "Pré-process", "Simulation", "Couplage", "Résultats", "Boucles"]; 

// -------------------- Utilities --------------------

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function formatPct(v01: number): string {
  return `${Math.round(clamp01(v01) * 100)}%`;
}

function formatHoursFromMin(min: number): string {
  const h = min / 60;
  if (h < 1) return `${Math.round(min)}m`;
  if (h < 24) return `${h.toFixed(1)}h`;
  const d = h / 8;
  return `${d.toFixed(1)}j (8h)`;
}

function p95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil(0.95 * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// Deterministic RNG
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: T[]): T {
  return items[Math.floor(rng() * items.length)];
}

function jitter(rng: () => number, base: number, spread: number): number {
  return Math.max(1, base + (rng() - 0.5) * spread);
}

// -------------------- Layout --------------------

function buildStageColumns(): Record<Stage, number> {
  const gap = 300;
  const startX = 0;
  const map = {} as Record<Stage, number>;
  STAGE_ORDER.forEach((s, i) => {
    map[s] = startX + i * gap;
  });
  return map;
}

function nearestStageX(x: number, stageXs: number[]): number {
  if (stageXs.length === 0) return x;
  let best = stageXs[0];
  let bestD = Math.abs(x - best);
  for (const sx of stageXs) {
    const d = Math.abs(x - sx);
    if (d < bestD) {
      bestD = d;
      best = sx;
    }
  }
  return best;
}

function buildInitialPositions(manual: Record<string, Pos> | null): Record<string, Pos> {
  const stageX = buildStageColumns();
  const byStage = new Map<Stage, Step[]>();
  for (const s of STAGE_ORDER) byStage.set(s, []);
  for (const step of STEPS) byStage.get(step.stage)?.push(step);

  const pos: Record<string, Pos> = {};

  for (const stage of STAGE_ORDER) {
    const steps = byStage.get(stage) ?? [];
    steps.sort((a, b) => a.label.localeCompare(b.label));

    const x = stageX[stage];
    const y0 = 30;
    const dy = 110;

    steps.forEach((st, idx) => {
      const base = { x, y: y0 + idx * dy };
      pos[st.id] = manual?.[st.id] ?? base;
    });
  }

  return pos;
}

function resolveOverlaps(nodes: Node[], minDist = 60): Node[] {
  // Simple repulsion in Y for nodes sharing close X range.
  const out = nodes.map((n) => ({ ...n, position: { ...n.position } }));
  const maxIter = 12;

  for (let it = 0; it < maxIter; it++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i];
        const b = out[j];
        if (a.id === "__token__" || b.id === "__token__") continue;

        const dx = Math.abs(a.position.x - b.position.x);
        if (dx > 40) continue;
        const dy = b.position.y - a.position.y;
        if (Math.abs(dy) < minDist) {
          const push = (minDist - Math.abs(dy)) / 2;
          a.position.y -= Math.sign(dy || 1) * push;
          b.position.y += Math.sign(dy || 1) * push;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  return out;
}

// -------------------- Simulation + Mining --------------------

function buildAllowedEdgeSet(): Set<string> {
  const allowed = new Set<string>();
  for (const e of LINKS) {
    if (e.allowed) allowed.add(`${e.from}=>${e.to}`);
  }
  return allowed;
}

function simulatePairedLog(knobs: SimKnobs): SimulationResult {
  const cases = Math.max(1, Math.floor(knobs.cases));
  const rng = mulberry32(knobs.seed);

  const asIs: Event[] = [];
  const toBe: Event[] = [];

  const allowed = buildAllowedEdgeSet();

  // Baseline durations per step (minutes)
  const baseDur: Record<StepId, { base: number; spread: number }> = {
    cad_catpart: { base: 120, spread: 80 },
    sector: { base: 60, spread: 40 },
    prep_mesh: { base: 90, spread: 60 },
    prep_mesh_def: { base: 70, spread: 50 },
    procast_preheat: { base: 180, spread: 120 },
    aba_preheat: { base: 150, spread: 90 },
    flow_360: { base: 120, spread: 90 },
    flow_zoom: { base: 240, spread: 180 },
    aba_fill_mech: { base: 200, spread: 140 },
    export_stl: { base: 20, spread: 10 },
    rework_cao: { base: 160, spread: 120 },
    rework_mesh: { base: 90, spread: 70 },
    rework_params: { base: 120, spread: 90 },
    risk_review: { base: 60, spread: 40 },
  };

  // Resources pool (effectifs)
  const RES: Record<StepId, string[]> = {
    cad_catpart: ["BE-01", "BE-02", "BE-03"],
    sector: ["BE-04", "BE-02"],
    prep_mesh: ["BM-01", "BM-02"],
    prep_mesh_def: ["BM-01", "BM-03"],
    procast_preheat: ["SIMU-01", "SIMU-02"],
    aba_preheat: ["SIMU-02", "SIMU-03"],
    flow_360: ["SIMU-01", "SIMU-04"],
    flow_zoom: ["SIMU-01", "SIMU-04", "SIMU-05"],
    aba_fill_mech: ["SIMU-03", "SIMU-06"],
    export_stl: ["AUTO"],
    rework_cao: ["BE-01", "BE-02"],
    rework_mesh: ["BM-01", "BM-02"],
    rework_params: ["SIMU-01", "SIMU-05"],
    risk_review: ["Q-01", "Q-02"],
  };

  function emit(target: Event[], caseId: string, tsMin: number, stepId: StepId, issue?: IssueFamily): number {
    const step = STEPS.find((s) => s.id === stepId);
    const label = step?.label ?? stepId;
    const pool = RES[stepId] ?? ["UNK"];
    target.push({
      caseId,
      tsMin,
      stepId,
      stepLabel: label,
      resource: pick(rng, pool),
      ...(issue ? { issue } : {}),
    });
    const dur = baseDur[stepId] ? jitter(rng, baseDur[stepId].base, baseDur[stepId].spread) : jitter(rng, 60, 30);
    return tsMin + dur;
  }

  // A simple case generator: always runs preheat branch + main branch; AS-IS can introduce deviations.
  function runCase(caseIdx: number, mode: "asIs" | "toBe"): Event[] {
    const out: Event[] = [];
    const cid = `C${String(caseIdx + 1).padStart(4, "0")}`;

    // knobs only apply to AS-IS
    const skip = mode === "asIs" ? clamp01(knobs.skipGatesPct) : 0;
    const manual = mode === "asIs" ? clamp01(knobs.manualTransferPct) : 0;
    const loops = mode === "asIs" ? clamp01(knobs.uncontrolledLoopsPct) : 0;

    let t = 0;

    // Entry CAO
    t = emit(out, cid, t, "cad_catpart");

    // Occasional CAO rework (organisation / données)
    if (mode === "asIs" && rng() < loops * 0.25) {
      const issue = rng() < 0.5 ? "organisation" : "donnees";
      t = emit(out, cid, t, "rework_cao", issue);
      t = emit(out, cid, t, "cad_catpart");
    }

    // Pre-process mesh
    if (!(mode === "asIs" && rng() < skip * 0.2)) {
      t = emit(out, cid, t, "prep_mesh");
    }

    // Mesh rework
    if (mode === "asIs" && rng() < loops * 0.2) {
      t = emit(out, cid, t, "rework_mesh", "donnees");
      t = emit(out, cid, t, "prep_mesh");
    }

    // Preheat branch
    if (!(mode === "asIs" && rng() < skip * 0.35)) {
      t = emit(out, cid, t, "sector");
      t = emit(out, cid, t, "procast_preheat");
      // Potential manual handoff
      if (mode === "asIs" && rng() < manual * 0.4) {
        // simulate waiting (organisation)
        t += jitter(rng, 240, 180);
      }
      t = emit(out, cid, t, "aba_preheat");
      t = emit(out, cid, t, "prep_mesh_def");
    }

    // Main flow
    t = emit(out, cid, t, "flow_360");
    t = emit(out, cid, t, "flow_zoom");

    // Simulation loop due to quality/conformance
    if (mode === "asIs" && rng() < loops * 0.35) {
      t = emit(out, cid, t, "rework_params", "qualite");
      t = emit(out, cid, t, "flow_zoom");
    }

    t = emit(out, cid, t, "aba_fill_mech");

    // Risk loop
    if (mode === "asIs" && rng() < loops * 0.2) {
      t = emit(out, cid, t, "risk_review", "risque");
      t = emit(out, cid, t, "aba_fill_mech");
    }

    t = emit(out, cid, t, "export_stl");

    // Extra waiting time (organisation) on AS-IS
    if (mode === "asIs" && rng() < 0.25) {
      // add idle time by shifting all events after a random cut
      const cut = Math.floor(rng() * out.length);
      const extra = jitter(rng, 180, 240) * clamp01(0.2 + loops);
      for (let i = cut; i < out.length; i++) out[i] = { ...out[i], tsMin: out[i].tsMin + extra };
    }

    // Sort just in case
    out.sort((a, b) => a.tsMin - b.tsMin);
    return out;
  }

  for (let i = 0; i < cases; i++) {
    asIs.push(...runCase(i, "asIs"));
    toBe.push(...runCase(i, "toBe"));
  }

  // Default focus: choose most frequent step in AS-IS
  const freq = new Map<StepId, number>();
  for (const ev of asIs) freq.set(ev.stepId, (freq.get(ev.stepId) ?? 0) + 1);
  let best: StepId = "flow_zoom";
  let bestN = -1;
  for (const [k, v] of freq.entries()) {
    if (v > bestN) {
      best = k;
      bestN = v;
    }
  }

  // Keep a quick sanity: ensure TO-BE transitions are allowed; AS-IS can contain rework transitions.
  // (We don't enforce allowed edges here; conformance is measured later.)
  void allowed;

  return { asIs, toBe, focusDefault: best };
}

function groupByCase(events: Event[]): Map<string, Event[]> {
  const m = new Map<string, Event[]>();
  for (const ev of events) {
    const arr = m.get(ev.caseId) ?? [];
    arr.push(ev);
    m.set(ev.caseId, arr);
  }
  for (const [cid, arr] of m.entries()) {
    arr.sort((a, b) => a.tsMin - b.tsMin);
    m.set(cid, arr);
  }
  return m;
}

function buildDFG(events: Event[]): Map<string, { durations: number[]; count: number }> {
  const byCase = groupByCase(events);
  const dfg = new Map<string, { durations: number[]; count: number }>();

  for (const arr of byCase.values()) {
    for (let i = 0; i < arr.length - 1; i++) {
      const a = arr[i];
      const b = arr[i + 1];
      const key = `${a.stepId}=>${b.stepId}`;
      const dur = Math.max(0, b.tsMin - a.tsMin);
      const cur = dfg.get(key) ?? { durations: [], count: 0 };
      cur.durations.push(dur);
      cur.count += 1;
      dfg.set(key, cur);
    }
  }
  return dfg;
}

function computeEdgeStats(dfg: Map<string, { durations: number[]; count: number }>): Map<string, EdgeStats> {
  const out = new Map<string, EdgeStats>();
  for (const [k, v] of dfg.entries()) {
    out.set(k, {
      count: v.count,
      avgMin: mean(v.durations),
      p95Min: p95(v.durations),
    });
  }
  return out;
}

function computeConformanceSummary(dfg: Map<string, { durations: number[]; count: number }>, allowed: Set<string>): ConformanceSummary {
  let total = 0;
  let non = 0;
  for (const [k, v] of dfg.entries()) {
    total += v.count;
    if (!allowed.has(k)) non += v.count;
  }
  const conformPct = total === 0 ? 1 : (total - non) / total;
  return { totalTransitions: total, nonConformTransitions: non, conformPct };
}

function computeDeviationTime(dfg: Map<string, { durations: number[]; count: number }>, allowed: Set<string>): number {
  let sum = 0;
  for (const [k, v] of dfg.entries()) {
    if (!allowed.has(k)) sum += v.durations.reduce((a, b) => a + b, 0);
  }
  return sum;
}

function computeCaseLeadTimes(events: Event[]): CaseLeadStats {
  const byCase = groupByCase(events);
  const leads: number[] = [];
  for (const arr of byCase.values()) {
    if (arr.length < 2) continue;
    const lead = arr[arr.length - 1].tsMin - arr[0].tsMin;
    leads.push(Math.max(0, lead));
  }
  return { avgMin: mean(leads), p95Min: p95(leads) };
}

function computeLeadTimeDelta(asIs: Event[], toBe: Event[]): { avgDeltaMin: number; totalDays8h: number } {
  const a = computeCaseLeadTimes(asIs);
  const b = computeCaseLeadTimes(toBe);
  const avgDeltaMin = Math.max(0, a.avgMin - b.avgMin);
  const byCase = groupByCase(asIs);
  const totalDays8h = (avgDeltaMin * byCase.size) / (60 * 8);
  return { avgDeltaMin, totalDays8h };
}

function computeResourcesAndCases(events: Event[]): {
  byStep: Record<StepId, { events: number; uniqueResources: number; cases: number }>;
  totalCases: number;
} {
  const byCase = groupByCase(events);
  const byStep: Record<StepId, { events: number; res: Set<string>; cases: Set<string> }> = {};

  for (const [cid, arr] of byCase.entries()) {
    const seenInCase = new Set<StepId>();
    for (const ev of arr) {
      const cur = byStep[ev.stepId] ?? { events: 0, res: new Set<string>(), cases: new Set<string>() };
      cur.events += 1;
      cur.res.add(ev.resource);
      if (!seenInCase.has(ev.stepId)) cur.cases.add(cid);
      byStep[ev.stepId] = cur;
      seenInCase.add(ev.stepId);
    }
  }

  const out: Record<StepId, { events: number; uniqueResources: number; cases: number }> = {};
  for (const k of Object.keys(byStep)) {
    out[k] = {
      events: byStep[k].events,
      uniqueResources: byStep[k].res.size,
      cases: byStep[k].cases.size,
    };
  }

  return { byStep: out, totalCases: byCase.size };
}

function computeTraces(events: Event[], maxTraces = 8): Trace[] {
  const byCase = groupByCase(events);
  const map = new Map<string, { steps: StepId[]; count: number; leads: number[] }>();

  for (const arr of byCase.values()) {
    const steps = arr.map((e) => e.stepId);
    const sig = steps.join("→");
    const lead = arr.length < 2 ? 0 : Math.max(0, arr[arr.length - 1].tsMin - arr[0].tsMin);
    const cur = map.get(sig) ?? { steps, count: 0, leads: [] };
    cur.count += 1;
    cur.leads.push(lead);
    map.set(sig, cur);
  }

  const traces: Trace[] = [];
  for (const [sig, v] of map.entries()) {
    traces.push({
      signature: sig,
      steps: v.steps,
      count: v.count,
      avgLeadMin: mean(v.leads),
      p95LeadMin: p95(v.leads),
    });
  }

  traces.sort((a, b) => b.count - a.count);
  return traces.slice(0, maxTraces);
}

function pickDefaultFocus(events: Event[]): StepId {
  const freq = new Map<StepId, number>();
  for (const ev of events) freq.set(ev.stepId, (freq.get(ev.stepId) ?? 0) + 1);
  let best: StepId = "flow_zoom";
  let bestN = -1;
  for (const [k, v] of freq.entries()) {
    if (v > bestN) {
      best = k;
      bestN = v;
    }
  }
  return best;
}

// -------------------- Playback (token animation) --------------------

type Segment = { a: Pos; b: Pos; len: number; from: StepId; to: StepId };

function computePlaybackSegments(traceSteps: StepId[], pos: Record<string, Pos>): Segment[] {
  const segs: Segment[] = [];
  for (let i = 0; i < traceSteps.length - 1; i++) {
    const from = traceSteps[i];
    const to = traceSteps[i + 1];
    const pa = pos[from] ?? { x: 0, y: 0 };
    const pb = pos[to] ?? { x: 0, y: 0 };
    const a = { x: pa.x + 110, y: pa.y + 30 };
    const b = { x: pb.x + 110, y: pb.y + 30 };
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segs.push({ a, b, len: Math.max(1, len), from, to });
  }
  return segs;
}

function posOnSegment(seg: Segment, t01: number): Pos {
  const t = clamp01(t01);
  return {
    x: seg.a.x + (seg.b.x - seg.a.x) * t,
    y: seg.a.y + (seg.b.y - seg.a.y) * t,
  };
}

function computePlaybackTrace(events: Event[], preferredCaseId?: string): { caseId: string; steps: StepId[] } | null {
  const byCase = groupByCase(events);
  let cid = preferredCaseId;
  if (!cid || !byCase.has(cid)) {
    // pick a random-ish but deterministic first case
    const keys = [...byCase.keys()].sort();
    cid = keys[0];
  }
  const arr = byCase.get(cid!);
  if (!arr || arr.length < 2) return null;
  return { caseId: cid!, steps: arr.map((e) => e.stepId) };
}

// -------------------- ReactFlow Nodes --------------------

function ActivityNode(props: NodeProps<{ step: Step; stats?: { events: number; cases: number; uniqueResources: number } }>) {
  const { data, selected } = props;
  const st = data.step;
  const stats = data.stats;

  return (
    <div
      style={{
        width: 220,
        borderRadius: 10,
        border: selected ? "2px solid #111" : "1px solid #d0d0d0",
        background: "#fff",
        boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
        padding: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div style={{ fontWeight: 650, fontSize: 13, lineHeight: 1.15 }}>{st.label}</div>
        <div
          title="Effectif (référence)"
          style={{
            fontSize: 12,
            padding: "2px 8px",
            borderRadius: 999,
            background: "#f3f3f3",
            border: "1px solid #e6e6e6",
            whiteSpace: "nowrap",
          }}
        >
          {st.headcount} pers.
        </div>
      </div>

      <div style={{ marginTop: 6, fontSize: 12, color: "#444" }}>{st.tool}</div>

      {stats ? (
        <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          <div style={{ fontSize: 11, color: "#333" }}>
            <div style={{ color: "#777" }}>events</div>
            <div style={{ fontWeight: 650 }}>{stats.events}</div>
          </div>
          <div style={{ fontSize: 11, color: "#333" }}>
            <div style={{ color: "#777" }}>cas</div>
            <div style={{ fontWeight: 650 }}>{stats.cases}</div>
          </div>
          <div style={{ fontSize: 11, color: "#333" }}>
            <div style={{ color: "#777" }}>ressources</div>
            <div style={{ fontWeight: 650 }}>{stats.uniqueResources}</div>
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 8, fontSize: 11, color: "#777" }}>{st.stage}</div>
    </div>
  );
}

function TokenNode() {
  return (
    <div
      style={{
        width: 16,
        height: 16,
        borderRadius: 999,
        background: "#111",
        border: "2px solid #fff",
        boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
      }}
    />
  );
}

const nodeTypes = { activity: ActivityNode, token: TokenNode };

// -------------------- Main Component --------------------

export default function ProcessExplorer() {
  const rf = useReactFlow();
  const rfInstanceRef = useRef<ReactFlowInstance | null>(null);

  const [tab, setTab] = useState<Tab>("events");
  const [labelMode, setLabelMode] = useState<LabelMode>("avg+p95");
  const [mode, setMode] = useState<"asIs" | "toBe">("asIs");

  const [knobs, setKnobs] = useState<SimKnobs>({
    cases: 200,
    seed: 7,
    skipGatesPct: 0.35,
    manualTransferPct: 0.25,
    uncontrolledLoopsPct: 0.35,
  });

  // Manual positions remembered (drag)
  const [manualPos, setManualPos] = useState<Record<string, Pos>>({});
  const [lockColumns, setLockColumns] = useState<boolean>(true);

  // Focus (selected node)
  const [focus, setFocus] = useState<StepId>("flow_zoom");

  // Simulation data (AS-IS / TO-BE)
  const sim = useMemo(() => simulatePairedLog(knobs), [knobs]);
  useEffect(() => {
    // reset default focus when simulation changes
    setFocus(sim.focusDefault ?? pickDefaultFocus(sim.asIs));
  }, [sim.focusDefault]);

  const activeEvents = mode === "asIs" ? sim.asIs : sim.toBe;

  const allowedSet = useMemo(() => buildAllowedEdgeSet(), []);
  const dfg = useMemo(() => buildDFG(activeEvents), [activeEvents]);
  const edgeStats = useMemo(() => computeEdgeStats(dfg), [dfg]);

  const conf = useMemo(() => computeConformanceSummary(dfg, allowedSet), [dfg, allowedSet]);
  const lead = useMemo(() => computeCaseLeadTimes(activeEvents), [activeEvents]);
  const impact = useMemo(() => computeLeadTimeDelta(sim.asIs, sim.toBe), [sim.asIs, sim.toBe]);
  const deviationTimeMin = useMemo(() => computeDeviationTime(dfg, allowedSet), [dfg, allowedSet]);

  const resources = useMemo(() => computeResourcesAndCases(activeEvents), [activeEvents]);
  const traces = useMemo(() => computeTraces(activeEvents, 10), [activeEvents]);

  // Stage columns
  const stageX = useMemo(() => buildStageColumns(), []);
  const stageXs = useMemo(() => STAGE_ORDER.map((s) => stageX[s]), [stageX]);

  // Build flow nodes/edges
  const basePos = useMemo(() => buildInitialPositions(manualPos), [manualPos]);

  const baseNodes = useMemo(() => {
    const nodes: Node[] = STEPS.map((st) => {
      const stats = resources.byStep[st.id];
      return {
        id: st.id,
        type: "activity",
        position: basePos[st.id] ?? { x: 0, y: 0 },
        data: { step: st, stats },
        draggable: true,
      } as Node;
    });

    // token node (animated)
    nodes.push({
      id: "__token__",
      type: "token",
      position: { x: stageX["Simulation"] + 110, y: 20 },
      data: {},
      draggable: false,
      selectable: false,
      connectable: false,
      hidden: false,
    } as Node);

    return resolveOverlaps(nodes);
  }, [basePos, resources.byStep, stageX]);

  const baseEdges = useMemo(() => {
    const edges: Edge[] = LINKS.map((e) => {
      const key = `${e.from}=>${e.to}`;
      const st = edgeStats.get(key);

      const label = (() => {
        if (labelMode === "none") return e.artifact ?? "";
        const parts: string[] = [];
        if (e.artifact) parts.push(e.artifact);
        if (st) {
          if (labelMode === "count") parts.push(`${st.count}`);
          if (labelMode === "avg") parts.push(`avg ${formatHoursFromMin(st.avgMin)}`);
          if (labelMode === "p95") parts.push(`p95 ${formatHoursFromMin(st.p95Min)}`);
          if (labelMode === "avg+p95") parts.push(`avg ${formatHoursFromMin(st.avgMin)} · p95 ${formatHoursFromMin(st.p95Min)}`);
        }
        return parts.join(" · ");
      })();

      const isNonConform = mode === "asIs" && !allowedSet.has(key);

      return {
        id: e.id,
        source: e.from,
        target: e.to,
        type: "smoothstep",
        label,
        labelStyle: { fontSize: 11, fill: "#333" },
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
        style: {
          stroke: isNonConform ? "#d11" : "#999",
          strokeWidth: isNonConform ? 2.2 : 1.4,
        },
        data: {
          allowed: e.allowed,
          nonConform: isNonConform,
          key,
        },
      } as Edge;
    });

    return edges;
  }, [edgeStats, labelMode, allowedSet, mode]);

  const [rfNodes, setRfNodes] = useState<Node[]>(baseNodes);
  const [rfEdges, setRfEdges] = useState<Edge[]>(baseEdges);

  // When base changes (simulation/layout), refresh nodes/edges but keep manualPos
  useEffect(() => {
    setRfNodes(baseNodes);
  }, [baseNodes]);
  useEffect(() => {
    setRfEdges(baseEdges);
  }, [baseEdges]);

  // NodeChange is a union; not all variants have `id`.
  const getChangeId = useCallback((c: NodeChange): string | undefined => {
    const anyC = c as any;
    if (typeof anyC?.id === "string") return anyC.id;
    if (c.type === "add" && typeof anyC?.item?.id === "string") return anyC.item.id;
    return undefined;
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Ignore token changes in user interactions
      const useful = changes.filter((c) => getChangeId(c) !== "__token__");
      setRfNodes((nds) => applyNodeChanges(useful, nds));

      setManualPos((prev) => {
        let next = prev;
        for (const ch of useful) {
          const id = getChangeId(ch);
          if (!id) continue;

          if (ch.type === "position" && (ch as any).position) {
            const p = (ch as any).position as Pos;
            const px = lockColumns ? nearestStageX(p.x, stageXs) : p.x;
            if (next === prev) next = { ...prev };
            next[id] = { x: px, y: p.y };
          }

          if (ch.type === "remove") {
            if (next === prev) next = { ...prev };
            delete next[id];
          }
        }
        return next;
      });
    },
    [getChangeId, lockColumns, stageXs]
  );

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setRfEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      // not used (graph is reference-based) but keep safe
      setRfEdges((eds) =>
        addEdge(
          {
            ...connection,
            type: "smoothstep",
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: "#999" },
          },
          eds
        )
      );
    },
    []
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.id === "__token__") return;
    setFocus(node.id);
  }, []);

  // Center on focus
  useEffect(() => {
    const inst = rfInstanceRef.current;
    if (!inst) return;
    const n = rfNodes.find((x) => x.id === focus);
    if (!n) return;
    inst.setCenter(n.position.x + 110, n.position.y + 30, { zoom: 0.9, duration: 300 });
  }, [focus]);

  // Playback selection
  const [playCaseId, setPlayCaseId] = useState<string | undefined>(undefined);
  const [playing, setPlaying] = useState<boolean>(true);

  // Build playback segments based on current node positions
  const playback = useMemo(() => {
    const trace = computePlaybackTrace(activeEvents, playCaseId);
    if (!trace) return null;

    const pos: Record<string, Pos> = {};
    for (const n of rfNodes) {
      pos[n.id] = { x: n.position.x, y: n.position.y };
    }

    const segments = computePlaybackSegments(trace.steps, pos);
    const totalLen = segments.reduce((a, s) => a + s.len, 0);
    return { trace, segments, totalLen };
  }, [activeEvents, playCaseId, rfNodes]);

  // Animate token node along segments
  const animRef = useRef<number | null>(null);
  const tRef = useRef<number>(0);

  useEffect(() => {
    if (!playback || !playing) return;

    const speed = 220; // px per second (visual)

    const tick = (ts: number) => {
      if (!playback) return;

      // Convert ts to progression using delta-time
      if (!tRef.current) tRef.current = ts;
      const dt = Math.min(60, ts - tRef.current);
      tRef.current = ts;

      const dist = (dt / 1000) * speed;

      // Store progress as cumulative distance in a ref
      const progKey = "__prog__" as const;
      const anyObj = (tick as any);
      const prevDist = typeof anyObj[progKey] === "number" ? (anyObj[progKey] as number) : 0;
      let nextDist = prevDist + dist;
      if (playback.totalLen > 0) nextDist = nextDist % playback.totalLen;
      anyObj[progKey] = nextDist;

      // Find segment
      let remain = nextDist;
      let seg = playback.segments[0];
      for (const s of playback.segments) {
        if (remain <= s.len) {
          seg = s;
          break;
        }
        remain -= s.len;
      }
      const t01 = seg.len <= 0 ? 0 : remain / seg.len;
      const p = posOnSegment(seg, t01);

      setRfNodes((nds) =>
        nds.map((n) => (n.id === "__token__" ? { ...n, position: { x: p.x - 8, y: p.y - 8 } } : n))
      );

      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      animRef.current = null;
    };
  }, [playback, playing]);

  const focusEvents = useMemo(() => {
    return activeEvents
      .filter((e) => e.stepId === focus)
      .sort((a, b) => a.tsMin - b.tsMin)
      .slice(0, 250);
  }, [activeEvents, focus]);

  const focusLabel = useMemo(() => {
    const st = STEPS.find((s) => s.id === focus);
    return st ? `${st.label} — ${st.tool}` : focus;
  }, [focus]);

  // -------------------- UI --------------------

  const Card = ({ title, value, sub }: { title: string; value: React.ReactNode; sub?: React.ReactNode }) => (
    <div
      style={{
        border: "1px solid #e6e6e6",
        borderRadius: 14,
        padding: 14,
        background: "#fff",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        minHeight: 74,
      }}
    >
      <div style={{ fontSize: 12, color: "#666" }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 750, marginTop: 6, lineHeight: 1.1 }}>{value}</div>
      {sub ? <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>{sub}</div> : null}
    </div>
  );

  const Pill = ({ active, children, onClick }: { active?: boolean; children: React.ReactNode; onClick: () => void }) => (
    <button
      onClick={onClick}
      style={{
        borderRadius: 999,
        padding: "7px 12px",
        border: active ? "1px solid #111" : "1px solid #e0e0e0",
        background: active ? "#111" : "#fff",
        color: active ? "#fff" : "#111",
        fontSize: 12,
        fontWeight: 650,
        cursor: "pointer",
      }}
      type="button"
    >
      {children}
    </button>
  );

  const Slider = ({
    label,
    value,
    min,
    max,
    step,
    onChange,
    right,
  }: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (v: number) => void;
    right?: React.ReactNode;
  }) => (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ fontSize: 12, color: "#666" }}>{label}</div>
        <div style={{ fontSize: 12, color: "#666" }}>{right}</div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%" }}
      />
    </div>
  );

  const TopBar = (
    <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Process Explorer</div>
        <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
          Mode AS-IS — rouge = transition non conforme au TO-BE.
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Pill active={mode === "asIs"} onClick={() => setMode("asIs")}>AS-IS (simulé)</Pill>
        <Pill active={mode === "toBe"} onClick={() => setMode("toBe")}>TO-BE (référence)</Pill>
        <button
          type="button"
          onClick={() => setKnobs((k) => ({ ...k, seed: k.seed + 1 }))}
          style={{
            borderRadius: 10,
            padding: "8px 12px",
            border: "1px solid #e0e0e0",
            background: "#fff",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 650,
          }}
        >
          Régénérer
        </button>
      </div>
    </div>
  );

  const leftControls = (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 12 }}>
      <Card title="Focus" value={STEPS.find((s) => s.id === focus)?.label ?? focus} sub={<span>Cliquez un nœud pour recentrer</span>} />
      <Card
        title="Conformance (AS-IS vs TO-BE)"
        value={formatPct(conf.conformPct)}
        sub={
          <span>
            {conf.nonConformTransitions}/{conf.totalTransitions} transitions hors modèle
          </span>
        }
      />
      <Card title="Lead time" value={`${formatHoursFromMin(lead.avgMin)} avg`} sub={<span>p95 {formatHoursFromMin(lead.p95Min)}</span>} />
      <Card
        title="Impact vs TO-BE"
        value={`${formatHoursFromMin(impact.avgDeltaMin)} avg/case`}
        sub={<span>total {impact.totalDays8h.toFixed(1)} j (8h)</span>}
      />
      <Card title="Déviations (temps cumulé)" value={formatHoursFromMin(deviationTimeMin)} sub={<span>sur transitions hors TO-BE</span>} />
      <Card
        title="Playback"
        value={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              style={{
                borderRadius: 10,
                padding: "7px 10px",
                border: "1px solid #e0e0e0",
                background: "#fff",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 650,
              }}
            >
              {playing ? "Pause" : "Play"}
            </button>
            <button
              type="button"
              onClick={() => setPlayCaseId(undefined)}
              style={{
                borderRadius: 10,
                padding: "7px 10px",
                border: "1px solid #e0e0e0",
                background: "#fff",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 650,
              }}
            >
              Reset
            </button>
          </div>
        }
        sub={<span>boule = suivi d’un cas</span>}
      />
    </div>
  );

  const knobsPanel = (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 12 }}>
      <div style={{ border: "1px solid #e6e6e6", borderRadius: 14, padding: 14, background: "#fff" }}>
        <div style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>Cas simulés</div>
        <Slider
          label=""
          value={knobs.cases}
          min={20}
          max={500}
          step={10}
          right={<span>{knobs.cases}</span>}
          onChange={(v) => setKnobs((k) => ({ ...k, cases: v }))}
        />
        <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>Seed: {knobs.seed}</div>
      </div>

      <div style={{ border: "1px solid #e6e6e6", borderRadius: 14, padding: 14, background: "#fff" }}>
        <div style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>Déviations</div>
        <Slider
          label="Skip gates"
          value={Math.round(knobs.skipGatesPct * 100)}
          min={0}
          max={80}
          step={5}
          right={formatPct(knobs.skipGatesPct)}
          onChange={(v) => setKnobs((k) => ({ ...k, skipGatesPct: v / 100 }))}
        />
        <div style={{ height: 8 }} />
        <Slider
          label="Manual transfer"
          value={Math.round(knobs.manualTransferPct * 100)}
          min={0}
          max={80}
          step={5}
          right={formatPct(knobs.manualTransferPct)}
          onChange={(v) => setKnobs((k) => ({ ...k, manualTransferPct: v / 100 }))}
        />
        <div style={{ height: 8 }} />
        <Slider
          label="Uncontrolled loops"
          value={Math.round(knobs.uncontrolledLoopsPct * 100)}
          min={0}
          max={80}
          step={5}
          right={formatPct(knobs.uncontrolledLoopsPct)}
          onChange={(v) => setKnobs((k) => ({ ...k, uncontrolledLoopsPct: v / 100 }))}
        />
      </div>

      <div style={{ border: "1px solid #e6e6e6", borderRadius: 14, padding: 14, background: "#fff" }}>
        <div style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>Affichage</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(["avg+p95", "p95", "avg", "count", "none"] as LabelMode[]).map((m) => (
            <Pill key={m} active={labelMode === m} onClick={() => setLabelMode(m)}>
              {m}
            </Pill>
          ))}
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
          <input
            id="lock"
            type="checkbox"
            checked={lockColumns}
            onChange={(e) => setLockColumns(e.target.checked)}
          />
          <label htmlFor="lock" style={{ fontSize: 12, color: "#555" }}>
            Verrouiller les colonnes
          </label>
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
          Raisons d’écarts :
          <ul style={{ margin: "6px 0 0 16px" }}>
            {ISSUE_FAMILIES.map((f) => (
              <li key={f.key}>{f.label}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );

  const rightPanel = (
    <div style={{ border: "1px solid #e6e6e6", borderRadius: 14, background: "#fff", overflow: "hidden" }}>
      <div style={{ padding: 14, borderBottom: "1px solid #eee" }}>
        <div style={{ fontSize: 13, fontWeight: 750 }}>{focusLabel}</div>
        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
          <Pill active={tab === "events"} onClick={() => setTab("events")}>Events</Pill>
          <Pill active={tab === "traces"} onClick={() => setTab("traces")}>Traces</Pill>
          <Pill active={tab === "stats"} onClick={() => setTab("stats")}>Stats</Pill>
        </div>
      </div>

      <div style={{ padding: 14, maxHeight: 460, overflow: "auto" }}>
        {tab === "events" ? (
          <div>
            <div style={{ fontSize: 12, color: "#666" }}>
              {focusEvents.length} events (limit 250)
            </div>
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {focusEvents.map((e, idx) => (
                <div
                  key={`${e.caseId}-${idx}`}
                  style={{
                    border: "1px solid #eee",
                    borderRadius: 12,
                    padding: 10,
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 10,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{e.caseId}</div>
                    <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                      t={formatHoursFromMin(e.tsMin)} · {e.resource}
                    </div>
                    {e.issue ? (
                      <div style={{ fontSize: 12, color: "#b11", marginTop: 6, fontWeight: 650 }}>
                        {ISSUE_FAMILIES.find((f) => f.key === e.issue)?.label ?? e.issue}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPlayCaseId(e.caseId)}
                    style={{
                      borderRadius: 10,
                      padding: "7px 10px",
                      border: "1px solid #e0e0e0",
                      background: "#fff",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 650,
                      height: 34,
                      alignSelf: "center",
                    }}
                  >
                    Suivre
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {tab === "traces" ? (
          <div>
            <div style={{ fontSize: 12, color: "#666" }}>Top traces (séquences de nœuds)</div>
            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
              {traces.map((tr) => (
                <div key={tr.signature} style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 750 }}>{tr.count} cas</div>
                    <div style={{ fontSize: 12, color: "#666" }}>avg {formatHoursFromMin(tr.avgLeadMin)} · p95 {formatHoursFromMin(tr.p95LeadMin)}</div>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: "#333", lineHeight: 1.35 }}>
                    {tr.steps
                      .map((id) => STEPS.find((s) => s.id === id)?.label ?? id)
                      .join(" → ")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {tab === "stats" ? (
          <div>
            <div style={{ fontSize: 12, color: "#666" }}>Résumé</div>
            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
              <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 12, color: "#666" }}>Cas</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{resources.totalCases}</div>
              </div>
              <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 12, color: "#666" }}>Conformance</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{formatPct(conf.conformPct)}</div>
                <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
                  transitions non conformes: {conf.nonConformTransitions}
                </div>
              </div>
              <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 12, color: "#666" }}>Lead time</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{formatHoursFromMin(lead.avgMin)} (avg)</div>
                <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>p95 {formatHoursFromMin(lead.p95Min)}</div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <div style={{ padding: 18, background: "#fafafa", minHeight: "100vh" }}>
      {TopBar}
      {leftControls}
      {knobsPanel}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 12, marginTop: 12, alignItems: "start" }}>
        <div style={{ border: "1px solid #e6e6e6", borderRadius: 14, background: "#fff", overflow: "hidden" }}>
          <div style={{ height: 640 }}>
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              nodesConnectable={false}
              nodesDraggable={true}
              fitView
              fitViewOptions={{ padding: 0.22 }}
              defaultViewport={{ x: 60, y: 40, zoom: 0.8 }}
              onInit={(inst) => {
                rfInstanceRef.current = inst;
                // initial focus center
                const n = baseNodes.find((x) => x.id === focus);
                if (n) inst.setCenter(n.position.x + 110, n.position.y + 30, { zoom: 0.85, duration: 1 });
              }}
            >
              <Background gap={16} size={1} color="#eee" />
              <Controls />
              <MiniMap
                nodeColor={(n) => (n.type === "token" ? "#111" : "#ddd")}
                nodeStrokeWidth={2}
                maskColor="rgba(0,0,0,0.05)"
              />

              <Panel position="top-left">
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={() => {
                      const inst = rfInstanceRef.current;
                      if (!inst) return;
                      inst.fitView({ padding: 0.25, duration: 250 });
                    }}
                    style={{
                      borderRadius: 10,
                      padding: "8px 10px",
                      border: "1px solid #e0e0e0",
                      background: "#fff",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 650,
                    }}
                  >
                    Fit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setManualPos({});
                    }}
                    style={{
                      borderRadius: 10,
                      padding: "8px 10px",
                      border: "1px solid #e0e0e0",
                      background: "#fff",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 650,
                    }}
                  >
                    Reset layout
                  </button>
                </div>
              </Panel>

              <Panel position="bottom-left">
                <div style={{ fontSize: 12, color: "#666" }}>
                  Cas: {resources.totalCases} · Mode: {mode.toUpperCase()} · Conformance: {formatPct(conf.conformPct)}
                </div>
              </Panel>
            </ReactFlow>
          </div>
        </div>

        {rightPanel}
      </div>
    </div>
  );
}
