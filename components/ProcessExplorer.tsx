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
  MarkerType,
  Node,
  NodeChange,
  Position,
} from "reactflow";

/**
 * NOTE CSS:
 * Next.js (App Router) interdit l'import global CSS depuis un composant.
 * On injecte donc un CSS minimal (en bas dans le composant).
 */

// ------------------------------
// Types
// ------------------------------

type Variant = "AS_IS" | "TO_BE";

type Stage =
  | "BE"
  | "BM"
  | "SIMU"
  | "PROTO"
  | "QUALIF"
  | "INDUS"
  | "RELEASE";

type IssueFamily =
  | "qualite_conformite"
  | "donnees_continuite"
  | "organisation_flux"
  | "risque";

type LabelMode = "count" | "avg" | "p95" | "avg+p95" | "none";

type Tab = "events" | "traces" | "stats";

type ActivityNodeData = {
  kind: "activity";
  label: string;
  stage: Stage;
  role: string;
  tool?: string;
  headcount: number;
  // computed
  traces?: number;
  eventsCount?: number;
  issues?: Record<IssueFamily, number>; // counts in AS-IS
};

type TokenNodeData = {
  kind: "token";
};

type NodeData = ActivityNodeData | TokenNodeData;

type EventRow = {
  caseId: string;
  idx: number;
  variant: Variant;
  activityId: string;
  activity: string;
  stage: Stage;
  tsMin: number; // minutes since case start
  durationMin: number; // duration spent IN this activity
  resource: string;
  tool?: string;
  issue?: IssueFamily | null;
};

type CaseStats = {
  caseId: string;
  variant: Variant;
  startMin: number;
  endMin: number;
  leadTimeMin: number;
  deviationEdges: number;
  deviationTimeMin: number;
};

type EdgeStats = {
  from: string;
  to: string;
  count: number;
  avgDurMin: number;
  p95DurMin: number;
};

type DFG = {
  nodes: Map<
    string,
    {
      activityId: string;
      activity: string;
      stage: Stage;
      countEvents: number;
      countTraces: number;
      issues: Record<IssueFamily, number>;
    }
  >;
  edges: Map<string, EdgeStats>; // key: from->to
};

type ModelEdge = { from: string; to: string };

type ProcessModel = {
  id: string;
  title: string;
  nodes: {
    id: string;
    label: string;
    stage: Stage;
    role: string;
    tool?: string;
    headcount: number;
  }[];
  edges: ModelEdge[];
};

// ------------------------------
// Constants
// ------------------------------

export const ISSUE_FAMILIES: Record<IssueFamily, { label: string; short: string }> = {
  qualite_conformite: { label: "Qualité / conformité", short: "Q" },
  donnees_continuite: { label: "Données / continuité numérique", short: "D" },
  organisation_flux: { label: "Organisation / flux", short: "O" },
  risque: { label: "Risque", short: "R" },
};

const STAGE_COLUMNS: Stage[] = [
  "BE",
  "BM",
  "SIMU",
  "PROTO",
  "QUALIF",
  "INDUS",
  "RELEASE",
];

// ------------------------------
// Helpers (math + format)
// ------------------------------

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0;
  const arr = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (arr.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return arr[lo];
  const t = idx - lo;
  return arr[lo] * (1 - t) + arr[hi] * t;
}

function mean(values: number[]) {
  if (values.length === 0) return 0;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

function fmtHoursFromMin(min: number) {
  const h = min / 60;
  if (h < 1) return `${Math.round(min)} min`;
  if (h < 12) return `${h.toFixed(1)} h`;
  return `${Math.round(h)} h`;
}

function fmtDays8hFromMin(min: number) {
  const days = min / (60 * 8);
  if (days < 1) return `${(min / 60).toFixed(1)} h`;
  return `${days.toFixed(1)} j (8h)`;
}

function seededRand(seed: number) {
  // xorshift32
  let x = seed | 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    // [0,1)
    return ((x >>> 0) % 1_000_000) / 1_000_000;
  };
}

function pick<T>(rng: () => number, arr: T[]) {
  return arr[Math.floor(rng() * arr.length)];
}

function maybe(rng: () => number, p: number) {
  return rng() < p;
}

// ------------------------------
// Process Models (AS-IS / TO-BE)
// ------------------------------

/**
 * Process orienté Engineering (BE/BM/SIMU) inspiré d'une lecture « Celonis-like ».
 * Les noeuds représentent des "boîtes" (activités agrégées). Les events sont les actions détaillées.
 */

export const TO_BE: ProcessModel = {
  id: "to-be-v1",
  title: "TO-BE — Engineering Digital Thread",
  nodes: [
    {
      id: "be_req",
      label: "BE — Besoin & exigences\n(Fonctions, contraintes)",
      stage: "BE",
      role: "Lead BE",
      tool: "PLM",
      headcount: 2,
    },
    {
      id: "be_cad",
      label: "BE — CAO paramétrée\n(Modèle + paramètres)",
      stage: "BE",
      role: "BE CAO",
      tool: "CATIA / 3DX",
      headcount: 3,
    },
    {
      id: "be_review",
      label: "BE — Revue conception\n(contrôle, standard)",
      stage: "BE",
      role: "Lead BE",
      tool: "PLM",
      headcount: 2,
    },
    {
      id: "bm_methods",
      label: "BM — Méthodes / industrialisation\n(fabricabilité, gamme)",
      stage: "BM",
      role: "BM",
      tool: "ERP / PLM",
      headcount: 2,
    },
    {
      id: "bm_pre_sim",
      label: "BM — Préparation simulation\n(données, maillage, hypothèses)",
      stage: "BM",
      role: "Ingénieur Hybride",
      tool: "ANSA / Visual Mesh",
      headcount: 1,
    },
    {
      id: "sim_setup",
      label: "SIMU — Setup\n(BC, matériaux, charge)",
      stage: "SIMU",
      role: "Simu",
      tool: "ABAQUS / ProCast",
      headcount: 2,
    },
    {
      id: "sim_run",
      label: "SIMU — Calcul\n(runs, convergence)",
      stage: "SIMU",
      role: "Simu",
      tool: "HPC",
      headcount: 1,
    },
    {
      id: "sim_post",
      label: "SIMU — Post-traitement\n(résultats, critères)",
      stage: "SIMU",
      role: "Simu",
      tool: "Post",
      headcount: 1,
    },
    {
      id: "decision",
      label: "Décision\n(OK / Rework + raison)",
      stage: "SIMU",
      role: "IPT",
      tool: "PLM",
      headcount: 4,
    },
    {
      id: "proto",
      label: "PROTO — Essai\n(proto, mesures)",
      stage: "PROTO",
      role: "Proto",
      tool: "Lab",
      headcount: 2,
    },
    {
      id: "qualif",
      label: "QUALIF — Dossier & conformité\n(validation)",
      stage: "QUALIF",
      role: "Qualité",
      tool: "PLM",
      headcount: 1,
    },
    {
      id: "release",
      label: "RELEASE\nRéférence validée", 
      stage: "RELEASE",
      role: "PLM",
      tool: "PLM",
      headcount: 1,
    },
  ],
  edges: [
    { from: "be_req", to: "be_cad" },
    { from: "be_cad", to: "be_review" },
    { from: "be_review", to: "bm_methods" },
    { from: "bm_methods", to: "bm_pre_sim" },
    { from: "bm_pre_sim", to: "sim_setup" },
    { from: "sim_setup", to: "sim_run" },
    { from: "sim_run", to: "sim_post" },
    { from: "sim_post", to: "decision" },
    { from: "decision", to: "proto" },
    { from: "proto", to: "qualif" },
    { from: "qualif", to: "release" },
    // Boucle contrôlée (rework)
    { from: "decision", to: "be_cad" },
    { from: "decision", to: "bm_pre_sim" },
  ],
};

/**
 * AS-IS = même "colonne vertébrale" mais plus de boucles et contournements (data discontinuity / org / qualité / risque).
 */
export const AS_IS_MODEL: ProcessModel = {
  id: "as-is-v1",
  title: "AS-IS — Flux réel (avec rework)",
  nodes: TO_BE.nodes,
  edges: [
    ...TO_BE.edges,
    // contournements et retours plus fréquents
    { from: "bm_methods", to: "be_cad" },
    { from: "sim_post", to: "bm_pre_sim" },
    { from: "proto", to: "be_cad" },
    { from: "proto", to: "bm_methods" },
  ],
};

function modelAllowedEdgeSet(model: ProcessModel) {
  const set = new Set<string>();
  for (const e of model.edges) set.add(`${e.from}→${e.to}`);
  return set;
}

// ------------------------------
// Simulation (event log)
// ------------------------------

type SimConfig = {
  nCases: number;
  seed: number;
};

const DEFAULT_SIM: SimConfig = { nCases: 40, seed: 42 };

function activityMetaById(model: ProcessModel) {
  const m = new Map<string, (typeof model.nodes)[number]>();
  for (const n of model.nodes) m.set(n.id, n);
  return m;
}

function genCaseId(i: number) {
  return `CASE_${String(i + 1).padStart(4, "0")}`;
}

function simulateCase(
  rng: () => number,
  variant: Variant,
  caseId: string,
  baseModel: ProcessModel
): EventRow[] {
  const meta = activityMetaById(baseModel);

  // Paramètres "réalistes" (minutes)
  const dur = {
    be_req: [60, 180],
    be_cad: [240, 1200],
    be_review: [30, 180],
    bm_methods: [120, 480],
    bm_pre_sim: [120, 600],
    sim_setup: [60, 240],
    sim_run: [120, 720],
    sim_post: [60, 240],
    decision: [15, 90],
    proto: [240, 1440],
    qualif: [120, 480],
    release: [1, 5],
  } as Record<string, [number, number]>;

  const resources = {
    BE: ["BE_A", "BE_B", "BE_C"],
    BM: ["BM_A", "BM_B"],
    SIMU: ["SIMU_A", "SIMU_B"],
    PROTO: ["PROTO_A"],
    QUALIF: ["QUAL_A"],
    INDUS: ["INDUS_A"],
    RELEASE: ["PLM_BOT"],
  } as Record<Stage, string[]>;

  const seqCore = [
    "be_req",
    "be_cad",
    "be_review",
    "bm_methods",
    "bm_pre_sim",
    "sim_setup",
    "sim_run",
    "sim_post",
    "decision",
    "proto",
    "qualif",
    "release",
  ];

  // AS-IS = plus de boucles (rework) et plus de problèmes de continuité/orga
  const pRework = variant === "AS_IS" ? 0.55 : 0.25;
  const pDataIssue = variant === "AS_IS" ? 0.30 : 0.12;
  const pQualityIssue = variant === "AS_IS" ? 0.25 : 0.12;
  const pOrgIssue = variant === "AS_IS" ? 0.22 : 0.08;
  const pRiskIssue = variant === "AS_IS" ? 0.12 : 0.06;

  let idx = 0;
  let t = 0;
  const rows: EventRow[] = [];

  const pushAct = (activityId: string, issue: IssueFamily | null) => {
    const metaN = meta.get(activityId);
    if (!metaN) return;
    const [a, b] = dur[activityId] ?? [30, 120];
    // bruit
    const d = a + Math.round((b - a) * rng());
    const resource = pick(rng, resources[metaN.stage]);
    rows.push({
      caseId,
      idx: idx++,
      variant,
      activityId,
      activity: metaN.label.replace(/\n/g, " — "),
      stage: metaN.stage,
      tsMin: t,
      durationMin: d,
      resource,
      tool: metaN.tool,
      issue,
    });
    t += d;
  };

  // passe principale
  for (const act of seqCore) {
    let issue: IssueFamily | null = null;
    if (act !== "release") {
      if (maybe(rng, pDataIssue)) issue = "donnees_continuite";
      else if (maybe(rng, pQualityIssue)) issue = "qualite_conformite";
      else if (maybe(rng, pOrgIssue)) issue = "organisation_flux";
      else if (maybe(rng, pRiskIssue)) issue = "risque";
    }
    pushAct(act, issue);

    // décision : boucle si NOK
    if (act === "decision" && maybe(rng, pRework)) {
      // raison dominante = issue du dernier segment (sim_post) ou donnée
      const r = rng();
      const reason: IssueFamily =
        r < 0.35
          ? "qualite_conformite"
          : r < 0.65
          ? "donnees_continuite"
          : r < 0.90
          ? "organisation_flux"
          : "risque";

      // routes de rework
      if (reason === "qualite_conformite") {
        // retour BE CAO
        pushAct("be_cad", reason);
        pushAct("be_review", null);
      } else if (reason === "donnees_continuite") {
        // retour préparation simulation
        pushAct("bm_pre_sim", reason);
      } else if (reason === "organisation_flux") {
        // retour méthodes ou BE
        if (maybe(rng, 0.5)) pushAct("bm_methods", reason);
        else pushAct("be_cad", reason);
      } else {
        // risque : passage par méthodes
        pushAct("bm_methods", reason);
      }

      // boucle courte vers simu
      pushAct("sim_setup", null);
      pushAct("sim_run", null);
      pushAct("sim_post", null);
      pushAct("decision", null);

      // si encore NOK, une boucle max supplémentaire
      if (maybe(rng, variant === "AS_IS" ? 0.25 : 0.10)) {
        pushAct("be_cad", "qualite_conformite");
        pushAct("bm_pre_sim", "donnees_continuite");
        pushAct("sim_run", null);
        pushAct("sim_post", null);
        pushAct("decision", null);
      }
    }
  }

  return rows;
}

export function simulatePairedLog(cfg: Partial<SimConfig> = {}) {
  const c = { ...DEFAULT_SIM, ...cfg };
  const rngA = seededRand(c.seed);
  const rngB = seededRand(c.seed + 999);

  const asIs: EventRow[] = [];
  const toBe: EventRow[] = [];

  for (let i = 0; i < c.nCases; i++) {
    const caseId = genCaseId(i);
    // volontairement deux RNG distincts => trajectoires différentes mais corrélées
    asIs.push(...simulateCase(rngA, "AS_IS", caseId, AS_IS_MODEL));
    toBe.push(...simulateCase(rngB, "TO_BE", caseId, TO_BE));
  }

  return { asIs, toBe };
}

// ------------------------------
// Mining (DFG + stats + conformance)
// ------------------------------

export function buildDFG(log: EventRow[], variant: Variant): DFG {
  const nodes = new Map<
    string,
    {
      activityId: string;
      activity: string;
      stage: Stage;
      countEvents: number;
      countTraces: number;
      issues: Record<IssueFamily, number>;
    }
  >();

  const edgeAgg = new Map<
    string,
    {
      from: string;
      to: string;
      durs: number[];
      count: number;
    }
  >();

  // group by case
  const byCase = new Map<string, EventRow[]>();
  for (const e of log) {
    if (e.variant !== variant) continue;
    const arr = byCase.get(e.caseId) ?? [];
    arr.push(e);
    byCase.set(e.caseId, arr);
  }

  for (const [caseId, events] of byCase.entries()) {
    events.sort((a, b) => a.idx - b.idx);

    // traces per node
    const seenInCase = new Set<string>();

    for (let i = 0; i < events.length; i++) {
      const cur = events[i];

      const n = nodes.get(cur.activityId) ?? {
        activityId: cur.activityId,
        activity: cur.activity,
        stage: cur.stage,
        countEvents: 0,
        countTraces: 0,
        issues: {
          qualite_conformite: 0,
          donnees_continuite: 0,
          organisation_flux: 0,
          risque: 0,
        },
      };

      n.countEvents += 1;
      if (cur.issue) n.issues[cur.issue] += 1;

      nodes.set(cur.activityId, n);

      if (!seenInCase.has(cur.activityId)) {
        seenInCase.add(cur.activityId);
      }

      // edges
      if (i < events.length - 1) {
        const nxt = events[i + 1];
        const key = `${cur.activityId}→${nxt.activityId}`;
        const a = edgeAgg.get(key) ?? {
          from: cur.activityId,
          to: nxt.activityId,
          durs: [],
          count: 0,
        };
        // duration between activities: take next start - current start (approx)
        const dt = Math.max(1, nxt.tsMin - cur.tsMin);
        a.count += 1;
        a.durs.push(dt);
        edgeAgg.set(key, a);
      }
    }

    // finalize traces per node
    for (const actId of seenInCase) {
      const n = nodes.get(actId);
      if (n) n.countTraces += 1;
    }
  }

  const edges = new Map<string, EdgeStats>();
  for (const [k, a] of edgeAgg.entries()) {
    const avg = mean(a.durs);
    const p95 = percentile(a.durs, 95);
    edges.set(k, {
      from: a.from,
      to: a.to,
      count: a.count,
      avgDurMin: avg,
      p95DurMin: p95,
    });
  }

  return { nodes, edges };
}

export function computeCaseLeadTimes(log: EventRow[], variant: Variant): CaseStats[] {
  const byCase = new Map<string, EventRow[]>();
  for (const e of log) {
    if (e.variant !== variant) continue;
    const arr = byCase.get(e.caseId) ?? [];
    arr.push(e);
    byCase.set(e.caseId, arr);
  }

  const allowed = modelAllowedEdgeSet(TO_BE);
  const out: CaseStats[] = [];

  for (const [caseId, events] of byCase.entries()) {
    events.sort((a, b) => a.idx - b.idx);
    const start = events[0]?.tsMin ?? 0;
    const last = events[events.length - 1];
    const end = (last?.tsMin ?? 0) + (last?.durationMin ?? 0);

    let devEdges = 0;
    let devTime = 0;

    for (let i = 0; i < events.length - 1; i++) {
      const a = events[i];
      const b = events[i + 1];
      const key = `${a.activityId}→${b.activityId}`;
      if (!allowed.has(key)) {
        devEdges += 1;
        devTime += Math.max(1, b.tsMin - a.tsMin);
      }
    }

    out.push({
      caseId,
      variant,
      startMin: start,
      endMin: end,
      leadTimeMin: end - start,
      deviationEdges: devEdges,
      deviationTimeMin: devTime,
    });
  }

  out.sort((a, b) => b.leadTimeMin - a.leadTimeMin);
  return out;
}

export function computeEdgeStats(dfg: DFG): EdgeStats[] {
  const arr = Array.from(dfg.edges.values());
  arr.sort((a, b) => b.count - a.count);
  return arr;
}

export function computeResourcesAndCases(log: EventRow[], variant: Variant) {
  const cases = new Set<string>();
  const resources = new Map<string, number>();
  for (const e of log) {
    if (e.variant !== variant) continue;
    cases.add(e.caseId);
    resources.set(e.resource, (resources.get(e.resource) ?? 0) + 1);
  }
  const resList = Array.from(resources.entries()).sort((a, b) => b[1] - a[1]);
  return { caseCount: cases.size, resources: resList };
}

export function pickDefaultFocus(cases: CaseStats[]) {
  // pick worst lead time case
  return cases[0]?.caseId ?? "";
}

// ------------------------------
// Layout (simple columns + manual)
// ------------------------------

type ManualPos = Record<string, { x: number; y: number }>;

export function buildStageColumns(width = 320) {
  const xByStage = new Map<Stage, number>();
  for (let i = 0; i < STAGE_COLUMNS.length; i++) {
    xByStage.set(STAGE_COLUMNS[i], i * width);
  }
  return xByStage;
}

export function buildFullProcessGraph(model: ProcessModel, dfg?: DFG) {
  const xByStage = buildStageColumns(320);
  const nodes: Node<NodeData>[] = [];

  // base nodes
  const stageBuckets = new Map<Stage, typeof model.nodes>();
  for (const n of model.nodes) {
    const arr = stageBuckets.get(n.stage) ?? [];
    arr.push(n);
    stageBuckets.set(n.stage, arr);
  }

  for (const stage of STAGE_COLUMNS) {
    const arr = stageBuckets.get(stage) ?? [];
    for (let i = 0; i < arr.length; i++) {
      const n = arr[i];
      const stats = dfg?.nodes.get(n.id);
      nodes.push({
        id: n.id,
        type: "activity",
        position: {
          x: xByStage.get(n.stage) ?? 0,
          y: i * 140,
        },
        data: {
          kind: "activity",
          label: n.label,
          stage: n.stage,
          role: n.role,
          tool: n.tool,
          headcount: n.headcount,
          traces: stats?.countTraces ?? 0,
          eventsCount: stats?.countEvents ?? 0,
          issues: stats?.issues ?? {
            qualite_conformite: 0,
            donnees_continuite: 0,
            organisation_flux: 0,
            risque: 0,
          },
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      });
    }
  }

  // edges
  const edges: Edge[] = model.edges.map((e) => {
    const key = `${e.from}→${e.to}`;
    const stats = dfg?.edges.get(key);
    return {
      id: key,
      source: e.from,
      target: e.to,
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed },
      data: { stats },
    };
  });

  return { nodes, edges };
}

export function applyManualPositions(nodes: Node<NodeData>[], manual: ManualPos) {
  return nodes.map((n) => {
    const m = manual[n.id];
    if (!m) return n;
    return { ...n, position: { x: m.x, y: m.y } };
  });
}

export function nearestStageX(stage: Stage) {
  return buildStageColumns(320).get(stage) ?? 0;
}

// ------------------------------
// Playback (token animation)
// ------------------------------

type Segment = { a: { x: number; y: number }; b: { x: number; y: number }; len: number };

type PlaybackTrace = {
  caseId: string;
  activities: string[]; // activityIds in order
};

export function computePlaybackTrace(log: EventRow[], variant: Variant, caseId: string): PlaybackTrace {
  const ev = log
    .filter((e) => e.variant === variant && e.caseId === caseId)
    .sort((a, b) => a.idx - b.idx);
  return { caseId, activities: ev.map((e) => e.activityId) };
}

export function computePlaybackSegments(trace: PlaybackTrace, nodes: Node<NodeData>[]) {
  const pos = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    // centers (approx)
    pos.set(n.id, { x: n.position.x + 140, y: n.position.y + 36 });
  }

  const pts: { x: number; y: number }[] = [];
  for (const id of trace.activities) {
    const p = pos.get(id);
    if (p) pts.push(p);
  }

  const segs: Segment[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    segs.push({ a, b, len });
  }

  return { pts, segs };
}

export function posOnSegment(seg: Segment, t: number) {
  const u = clamp(t, 0, 1);
  return {
    x: seg.a.x + (seg.b.x - seg.a.x) * u,
    y: seg.a.y + (seg.b.y - seg.a.y) * u,
  };
}
// ------------------------------
// UI Components (nodes, panels)
// ------------------------------

function badgeText(k: IssueFamily) {
  return ISSUE_FAMILIES[k].short;
}

function issueTitle(k: IssueFamily) {
  return ISSUE_FAMILIES[k].label;
}

function sumIssues(issues?: Record<IssueFamily, number>) {
  if (!issues) return 0;
  return (
    (issues.qualite_conformite ?? 0) +
    (issues.donnees_continuite ?? 0) +
    (issues.organisation_flux ?? 0) +
    (issues.risque ?? 0)
  );
}

function ActivityNode({ data, selected }: { data: ActivityNodeData; selected: boolean }) {
  const issuesTotal = sumIssues(data.issues);

  return (
    <div
      style={{
        width: 280,
        borderRadius: 14,
        border: selected ? "2px solid #111" : "1px solid #cfcfcf",
        background: "#fff",
        boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
        overflow: "hidden",
        userSelect: "none",
      }}
    >
      <div
        style={{
          padding: "10px 12px",
          background: selected ? "#111" : "#f6f6f6",
          color: selected ? "#fff" : "#111",
          fontSize: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div style={{ fontWeight: 700, letterSpacing: 0.2 }}>{data.stage}</div>
        <div style={{ opacity: selected ? 0.9 : 0.7, fontWeight: 600 }}>{data.role}</div>
      </div>

      <div style={{ padding: "10px 12px" }}>
        <div style={{ fontWeight: 800, fontSize: 13, lineHeight: 1.25, marginBottom: 6 }}>
          {data.label}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {data.tool ? (
            <span
              style={{
                fontSize: 11,
                padding: "3px 8px",
                borderRadius: 999,
                border: "1px solid #e3e3e3",
                background: "#fafafa",
              }}
            >
              {data.tool}
            </span>
          ) : null}

          <span
            style={{
              fontSize: 11,
              padding: "3px 8px",
              borderRadius: 999,
              border: "1px solid #e3e3e3",
              background: "#fafafa",
            }}
            title="Effectif estimé sur l'activité"
          >
            👥 {data.headcount}
          </span>

          <span
            style={{
              fontSize: 11,
              padding: "3px 8px",
              borderRadius: 999,
              border: "1px solid #e3e3e3",
              background: "#fafafa",
            }}
            title="Nombre de traces qui passent par cette activité"
          >
            🧾 {data.traces ?? 0}
          </span>

          <span
            style={{
              fontSize: 11,
              padding: "3px 8px",
              borderRadius: 999,
              border: "1px solid #e3e3e3",
              background: "#fafafa",
            }}
            title="Nombre d'events (actions) agrégés"
          >
            ⚡ {data.eventsCount ?? 0}
          </span>
        </div>

        {issuesTotal > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(Object.keys(ISSUE_FAMILIES) as IssueFamily[]).map((k) => {
              const v = data.issues?.[k] ?? 0;
              if (!v) return null;
              return (
                <span
                  key={k}
                  title={`${issueTitle(k)}: ${v}`}
                  style={{
                    fontSize: 11,
                    padding: "3px 8px",
                    borderRadius: 999,
                    border: "1px solid #ddd",
                    background: "#fff",
                  }}
                >
                  {badgeText(k)} {v}
                </span>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: 11, opacity: 0.6 }}>
            Aucun incident détecté sur cette activité.
          </div>
        )}
      </div>
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
        boxShadow: "0 8px 20px rgba(0,0,0,0.25)",
        border: "2px solid #fff",
      }}
    />
  );
}

const nodeTypes = {
  activity: ({ data, selected }: any) => <ActivityNode data={data as ActivityNodeData} selected={selected} />,
  token: () => <TokenNode />,
};

function edgeLabelFromStats(stats?: EdgeStats, mode: LabelMode = "avg+p95") {
  if (!stats || mode === "none") return "";
  if (mode === "count") return `${stats.count}`;
  if (mode === "avg") return `moy ${fmtHoursFromMin(stats.avgDurMin)}`;
  if (mode === "p95") return `p95 ${fmtHoursFromMin(stats.p95DurMin)}`;
  return `${stats.count} • moy ${fmtHoursFromMin(stats.avgDurMin)} • p95 ${fmtHoursFromMin(stats.p95DurMin)}`;
}

function safeLocalStorageGet(key: string) {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

// ------------------------------
// Main Component
// ------------------------------

export default function ProcessExplorer() {
  const [mounted, setMounted] = useState(false);

  // UI state
  const [variant, setVariant] = useState<Variant>("AS_IS");
  const [tab, setTab] = useState<Tab>("events");
  const [labelMode, setLabelMode] = useState<LabelMode>("avg+p95");
  const [showIssues, setShowIssues] = useState(true);

  // Simulation
  const [simCfg, setSimCfg] = useState<SimConfig>({ nCases: 40, seed: 42 });
  const [{ asIs, toBe }, setLog] = useState(() => simulatePairedLog(simCfg));

  // Mining
  const dfgAsIs = useMemo(() => buildDFG(asIs, "AS_IS"), [asIs]);
  const dfgToBe = useMemo(() => buildDFG(toBe, "TO_BE"), [toBe]);

  const dfg = variant === "AS_IS" ? dfgAsIs : dfgToBe;
  const model = variant === "AS_IS" ? AS_IS_MODEL : TO_BE;

  const caseStats = useMemo(() => {
    return computeCaseLeadTimes(variant === "AS_IS" ? asIs : toBe, variant);
  }, [asIs, toBe, variant]);

  const { caseCount, resources } = useMemo(() => {
    return computeResourcesAndCases(variant === "AS_IS" ? asIs : toBe, variant);
  }, [asIs, toBe, variant]);

  const defaultFocus = useMemo(() => pickDefaultFocus(caseStats), [caseStats]);

  // Selected
  const [focusCaseId, setFocusCaseId] = useState<string>(defaultFocus);
  const [selectedNodeId, setSelectedNodeId] = useState<string>("be_cad");

  // Manual layout persistence
  const LS_KEY = "pm_manual_pos_v1";
  const [manualPos, setManualPos] = useState<ManualPos>(() => {
    const raw = safeLocalStorageGet(LS_KEY);
    if (!raw) return {};
    try {
      return JSON.parse(raw) as ManualPos;
    } catch {
      return {};
    }
  });

  // Build graph
  const baseGraph = useMemo(() => {
    return buildFullProcessGraph(model, dfg);
  }, [model, dfg]);

  const [rfNodes, setRfNodes] = useState<Node<NodeData>[]>(() => {
    const n = applyManualPositions(baseGraph.nodes, manualPos);
    // token node off-screen initial
    return [
      ...n,
      {
        id: "__token__",
        type: "token",
        position: { x: -10_000, y: -10_000 },
        data: { kind: "token" },
        draggable: false,
        selectable: false,
      },
    ];
  });

  const [rfEdges, setRfEdges] = useState<Edge[]>(() => {
    return baseGraph.edges.map((e) => ({
      ...e,
      label: edgeLabelFromStats((e.data as any)?.stats, labelMode),
      labelStyle: { fontSize: 11, fontWeight: 700 },
      style: { strokeWidth: 2 },
    }));
  });

  // Refresh when model/dfg changes
  useEffect(() => {
    const built = buildFullProcessGraph(model, dfg);
    const nodes = applyManualPositions(built.nodes, manualPos);

    setRfNodes((prev) => {
      const token = prev.find((n) => n.id === "__token__");
      const tokenNode: Node<NodeData> =
        token ??
        ({
          id: "__token__",
          type: "token",
          position: { x: -10_000, y: -10_000 },
          data: { kind: "token" },
          draggable: false,
          selectable: false,
        } as any);

      return [...nodes, tokenNode];
    });

    setRfEdges(
      built.edges.map((e) => ({
        ...e,
        label: edgeLabelFromStats((e.data as any)?.stats, labelMode),
        labelStyle: { fontSize: 11, fontWeight: 700 },
        style: { strokeWidth: 2 },
      }))
    );
  }, [model, dfg, manualPos, labelMode]);

  // Mount guard (avoid SSR/prerender issues)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Persist manual positions
  useEffect(() => {
    safeLocalStorageSet(LS_KEY, JSON.stringify(manualPos));
  }, [manualPos]);

  // Sync focus case
  useEffect(() => {
    if (!focusCaseId) setFocusCaseId(defaultFocus);
  }, [defaultFocus, focusCaseId]);

  // Changes handlers
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Filter out token changes (NodeChange union doesn't always have id)
      const useful = changes.filter((c) => !("id" in c && c.id === "__token__"));

      setRfNodes((nds) => applyNodeChanges(useful, nds));

      // Persist drag positions
      setManualPos((prev) => {
        let next = prev;
        for (const c of useful) {
          if (!("id" in c)) continue;
          if (c.type === "position" && (c as any).position) {
            const pos = (c as any).position as { x: number; y: number };
            if (!next) next = {};
            next = { ...next, [c.id]: { x: pos.x, y: pos.y } };
          }
        }
        return next;
      });
    },
    [setRfNodes]
  );

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setRfEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  const onNodeClick = useCallback((_evt: any, node: Node<NodeData>) => {
    if (node.id === "__token__") return;
    setSelectedNodeId(node.id);
    setTab("events");
  }, []);

  // ------------------------------
  // Token animation
  // ------------------------------

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1.0); // 0.25..3

  const rafRef = useRef<number | null>(null);
  const progRef = useRef<{ segIdx: number; segT: number }>({ segIdx: 0, segT: 0 });

  const replay = useCallback(() => {
    progRef.current = { segIdx: 0, segT: 0 };
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!playing) {
      // hide token
      setRfNodes((prev) =>
        prev.map((n) =>
          n.id === "__token__" ? { ...n, position: { x: -10_000, y: -10_000 } } : n
        )
      );
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }

    const trace = computePlaybackTrace(variant === "AS_IS" ? asIs : toBe, variant, focusCaseId);
    const { segs } = computePlaybackSegments(trace, rfNodes);

    if (segs.length === 0) return;

    const step = () => {
      const st = progRef.current;
      const seg = segs[clamp(st.segIdx, 0, segs.length - 1)];

      // advance by approx pixels per frame
      const pxPerFrame = 6 * speed;
      const dt = pxPerFrame / seg.len;
      let t = st.segT + dt;
      let i = st.segIdx;

      while (t >= 1 && i < segs.length - 1) {
        t = t - 1;
        i += 1;
      }

      if (i === segs.length - 1 && t >= 1) {
        // loop
        i = 0;
        t = 0;
      }

      progRef.current = { segIdx: i, segT: t };
      const segNow = segs[i];
      const p = posOnSegment(segNow, t);

      setRfNodes((prev) =>
        prev.map((n) =>
          n.id === "__token__"
            ? {
                ...n,
                position: { x: p.x - 8, y: p.y - 8 },
              }
            : n
        )
      );

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [mounted, playing, speed, rfNodes, variant, focusCaseId, asIs, toBe]);

  // ------------------------------
  // Panels data
  // ------------------------------

  const selectedNode = useMemo(() => {
    return rfNodes.find((n) => n.id === selectedNodeId) as Node<ActivityNodeData> | undefined;
  }, [rfNodes, selectedNodeId]);

  const nodeEvents = useMemo(() => {
    const log = variant === "AS_IS" ? asIs : toBe;
    const events = log
      .filter((e) => e.variant === variant && e.activityId === selectedNodeId)
      .sort((a, b) => a.tsMin - b.tsMin);

    // optional: focus case highlight
    return events;
  }, [variant, asIs, toBe, selectedNodeId]);

  const focusTraceEvents = useMemo(() => {
    const log = variant === "AS_IS" ? asIs : toBe;
    return log
      .filter((e) => e.variant === variant && e.caseId === focusCaseId)
      .sort((a, b) => a.idx - b.idx);
  }, [variant, asIs, toBe, focusCaseId]);

  const edgeStatsTop = useMemo(() => computeEdgeStats(dfg).slice(0, 12), [dfg]);

  const allowed = useMemo(() => modelAllowedEdgeSet(TO_BE), []);

  // Decorate edges with deviation (AS-IS vs TO-BE)
  const decoratedEdges = useMemo(() => {
    return rfEdges.map((e) => {
      const key = `${e.source}→${e.target}`;
      const dev = variant === "AS_IS" ? !allowed.has(key) : false;
      return {
        ...e,
        animated: dev,
        style: {
          ...(e.style ?? {}),
          stroke: dev ? "#c1121f" : "#111",
          strokeDasharray: dev ? "6 4" : undefined,
          opacity: dev ? 0.95 : 0.75,
        },
        label: edgeLabelFromStats((e.data as any)?.stats, labelMode),
      } as Edge;
    });
  }, [rfEdges, allowed, variant, labelMode]);

  // Run simulation
  const runSim = useCallback(() => {
    const next = simulatePairedLog(simCfg);
    setLog(next);
    setFocusCaseId("");
    setSelectedNodeId("be_cad");
    setPlaying(false);
    replay();
  }, [simCfg, replay]);

  // Reset layout
  const resetLayout = useCallback(() => {
    setManualPos({});
  }, []);

  // ------------------------------
  // Render
  // ------------------------------

  // Placeholder during prerender to avoid ReactFlow SSR issues.
  if (!mounted) {
    return (
      <div style={{ padding: 16, fontFamily: "system-ui, Arial" }}>
        Chargement du Process Explorer…
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <div
        style={{
          height: "calc(100vh - 24px)",
          minHeight: 720,
          display: "grid",
          gridTemplateColumns: "1fr 360px",
          gap: 12,
          padding: 12,
          background: "#f4f4f4",
          fontFamily: "system-ui, Arial",
        }}
      >
        {/* MAIN */}
        <div
          style={{
            borderRadius: 18,
            overflow: "hidden",
            border: "1px solid #e5e5e5",
            background: "#fff",
            boxShadow: "0 12px 40px rgba(0,0,0,0.06)",
            position: "relative",
          }}
        >
          {/* Top bar */}
          <div
            style={{
              position: "absolute",
              top: 10,
              left: 10,
              right: 10,
              zIndex: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                padding: 10,
                borderRadius: 14,
                background: "rgba(255,255,255,0.92)",
                border: "1px solid #e8e8e8",
                boxShadow: "0 10px 28px rgba(0,0,0,0.08)",
                pointerEvents: "auto",
              }}
            >
              <strong style={{ fontSize: 12 }}>Process Graph</strong>

              <select
                value={variant}
                onChange={(e) => {
                  setVariant(e.target.value as Variant);
                  setPlaying(false);
                  replay();
                }}
                style={{ fontSize: 12, padding: "6px 8px", borderRadius: 10, border: "1px solid #ddd" }}
                title="Variante"
              >
                <option value="AS_IS">AS-IS</option>
                <option value="TO_BE">TO-BE</option>
              </select>

              <select
                value={labelMode}
                onChange={(e) => setLabelMode(e.target.value as LabelMode)}
                style={{ fontSize: 12, padding: "6px 8px", borderRadius: 10, border: "1px solid #ddd" }}
                title="Etiquettes des transitions"
              >
                <option value="avg+p95">count + moy + p95</option>
                <option value="count">count</option>
                <option value="avg">moy</option>
                <option value="p95">p95</option>
                <option value="none">none</option>
              </select>

              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={showIssues}
                  onChange={(e) => setShowIssues(e.target.checked)}
                />
                Incidents
              </label>

              <button
                onClick={() => {
                  setPlaying((p) => !p);
                  if (!playing) replay();
                }}
                style={{
                  fontSize: 12,
                  padding: "6px 10px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "#111",
                  color: "#fff",
                  cursor: "pointer",
                }}
                title="Token animation"
              >
                {playing ? "Pause" : "Play"}
              </button>

              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                Vitesse
                <input
                  type="range"
                  min={0.25}
                  max={3}
                  step={0.25}
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                />
                <span style={{ width: 32, textAlign: "right" }}>{speed.toFixed(2)}×</span>
              </label>

              <button
                onClick={resetLayout}
                style={{
                  fontSize: 12,
                  padding: "6px 10px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "#fff",
                  cursor: "pointer",
                }}
                title="Revenir au layout automatique (positions sauvegardées supprimées)"
              >
                Reset layout
              </button>
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                padding: 10,
                borderRadius: 14,
                background: "rgba(255,255,255,0.92)",
                border: "1px solid #e8e8e8",
                boxShadow: "0 10px 28px rgba(0,0,0,0.08)",
                pointerEvents: "auto",
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700 }}>Simulation</span>
              <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                Cas
                <input
                  type="number"
                  value={simCfg.nCases}
                  min={5}
                  max={500}
                  onChange={(e) => setSimCfg((p) => ({ ...p, nCases: Number(e.target.value) }))}
                  style={{ width: 80, padding: "6px 8px", borderRadius: 10, border: "1px solid #ddd" }}
                />
              </label>
              <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                Seed
                <input
                  type="number"
                  value={simCfg.seed}
                  onChange={(e) => setSimCfg((p) => ({ ...p, seed: Number(e.target.value) }))}
                  style={{ width: 90, padding: "6px 8px", borderRadius: 10, border: "1px solid #ddd" }}
                />
              </label>
              <button
                onClick={runSim}
                style={{
                  fontSize: 12,
                  padding: "6px 10px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                Re-simuler
              </button>
            </div>
          </div>

          <div style={{ height: "100%" }}>
            <ReactFlow
              nodes={rfNodes.map((n) => {
                if (n.id === "__token__") return n;
                const d = n.data as ActivityNodeData;
                if (!showIssues) {
                  return {
                    ...n,
                    data: { ...d, issues: { qualite_conformite: 0, donnees_continuite: 0, organisation_flux: 0, risque: 0 } },
                  };
                }
                return n;
              })}
              edges={decoratedEdges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              fitView
              minZoom={0.2}
              maxZoom={1.5}
              defaultViewport={{ x: 30, y: 40, zoom: 0.85 }}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={20} size={1} />
              <MiniMap pannable zoomable />
              <Controls />
            </ReactFlow>
          </div>
        </div>

        {/* SIDE PANEL */}
        <div
          style={{
            borderRadius: 18,
            overflow: "hidden",
            border: "1px solid #e5e5e5",
            background: "#fff",
            boxShadow: "0 12px 40px rgba(0,0,0,0.06)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ padding: 12, borderBottom: "1px solid #eee" }}>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Variante</div>
            <div style={{ fontSize: 14, fontWeight: 900 }}>{model.title}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                onClick={() => setTab("events")}
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  background: tab === "events" ? "#111" : "#fff",
                  color: tab === "events" ? "#fff" : "#111",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                Events
              </button>
              <button
                onClick={() => setTab("traces")}
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  background: tab === "traces" ? "#111" : "#fff",
                  color: tab === "traces" ? "#fff" : "#111",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                Traces
              </button>
              <button
                onClick={() => setTab("stats")}
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  background: tab === "stats" ? "#111" : "#fff",
                  color: tab === "stats" ? "#fff" : "#111",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                Stats
              </button>
            </div>
          </div>

          <div style={{ padding: 12, overflow: "auto" }}>
            {tab === "events" ? (
              <>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Activité sélectionnée</div>
                <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 8 }}>
                  {selectedNode?.data?.label ?? selectedNodeId}
                </div>

                <div style={{ fontSize: 12, opacity: 0.7 }}>Focus trace</div>
                <select
                  value={focusCaseId}
                  onChange={(e) => {
                    setFocusCaseId(e.target.value);
                    replay();
                  }}
                  style={{ width: "100%", padding: "10px 10px", borderRadius: 12, border: "1px solid #ddd" }}
                >
                  {caseStats.map((c) => (
                    <option key={c.caseId} value={c.caseId}>
                      {c.caseId} — {fmtDays8hFromMin(c.leadTimeMin)} — dev {c.deviationEdges}
                    </option>
                  ))}
                </select>

                <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>Trace (ordre des boîtes)</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                  {focusTraceEvents.slice(0, 30).map((e) => (
                    <div
                      key={`${e.caseId}-${e.idx}`}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 12,
                        border: "1px solid #eee",
                        background: e.activityId === selectedNodeId ? "#f1f1f1" : "#fff",
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 900 }}>
                        {e.activityId} <span style={{ fontWeight: 600, opacity: 0.7 }}>({e.stage})</span>
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>
