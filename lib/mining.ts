// lib/mining.ts

export type Actor = "BE" | "BM" | "SIMU" | "IPT" | "GATE" | "MANUAL";
export type Outcome = "OK" | "ISSUE" | "REWORK";

export type IssueFamily =
  | "Qualité / conformité"
  | "Données / continuité numérique"
  | "Organisation / flux"
  | "Risque";

export type EngEvent = {
  case_id: string;
  activity: string;
  timestamp: string;
  actor?: Actor;
  tool?: string;
  resource?: string;
  outcome?: Outcome;
  issue_family?: IssueFamily;
};

export type DFGNode = { id: string; count: number };
export type DFGEdge = { source: string; target: string; count: number };

export type ProcessModel = {
  name: string;
  start: string;
  end: string;
  activities: string[];
  allowedEdges: Array<[string, string]>;
};

export type EdgeStats = {
  count: number;
  totalMin: number;
  meanMin: number;
  p95Min: number;
  medianMin: number;
};

export type LabelMode = "count" | "avg" | "p95" | "avg+p95" | "none";
export type Tab = "events" | "traces" | "stats";
export type Pos = { x: number; y: number };

export function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function percentile(sortedAsc: number[], p: number) {
  if (sortedAsc.length === 0) return 0;
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  const w = idx - lo;
  return sortedAsc[lo] * (1 - w) + sortedAsc[hi] * w;
}

export function formatHoursFromMin(min: number) {
  if (!Number.isFinite(min)) return "—";
  const h = min / 60;
  if (h < 1) return `${Math.max(0, Math.round(min))}m`;
  return `${h.toFixed(h < 10 ? 1 : 0)}h`;
}

export function formatDays8hFromMin(min: number) {
  const d = (min / 60) / 8;
  return `${d.toFixed(d < 10 ? 1 : 0)}j`;
}

export function buildAllowedEdgeSet(model: ProcessModel) {
  const s = new Set<string>();
  for (const [a, b] of model.allowedEdges) s.add(`${a} -> ${b}`);
  return s;
}

export function groupByCase(events: EngEvent[]) {
  const m = new Map<string, EngEvent[]>();
  for (const e of events) {
    const arr = m.get(e.case_id) ?? [];
    arr.push(e);
    m.set(e.case_id, arr);
  }
  for (const [, arr] of m) {
    arr.sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp));
  }
  return m;
}

export function buildDFG(events: EngEvent[]) {
  const byCase = groupByCase(events);
  const nodeCount = new Map<string, number>();
  const edgeCount = new Map<string, number>();

  for (const [, trace] of byCase) {
    for (const ev of trace) nodeCount.set(ev.activity, (nodeCount.get(ev.activity) ?? 0) + 1);
    for (let i = 0; i < trace.length - 1; i++) {
      const k = `${trace[i].activity} -> ${trace[i + 1].activity}`;
      edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1);
    }
  }

  const nodes: DFGNode[] = [...nodeCount.entries()].map(([id, count]) => ({ id, count }));
  const edges: DFGEdge[] = [...edgeCount.entries()].map(([k, count]) => {
    const [source, target] = k.split(" -> ");
    return { source, target, count };
  });

  return { nodes, edges };
}

export function computeEdgeStats(events: EngEvent[]) {
  const byCase = groupByCase(events);
  const durations = new Map<string, number[]>();

  for (const [, trace] of byCase) {
    for (let i = 0; i < trace.length - 1; i++) {
      const a = trace[i];
      const b = trace[i + 1];
      const dtMin = (+new Date(b.timestamp) - +new Date(a.timestamp)) / (1000 * 60);
      const key = `${a.activity} -> ${b.activity}`;
      const arr = durations.get(key) ?? [];
      if (Number.isFinite(dtMin) && dtMin >= 0) arr.push(dtMin);
      durations.set(key, arr);
    }
  }

  const stats = new Map<string, EdgeStats>();
  for (const [key, arr] of durations) {
    const s = [...arr].sort((x, y) => x - y);
    const totalMin = s.reduce((acc, v) => acc + v, 0);
    const count = s.length;
    const meanMin = count ? totalMin / count : 0;
    const p95Min = percentile(s, 0.95);
    const medianMin = percentile(s, 0.5);
    stats.set(key, { count, totalMin, meanMin, p95Min, medianMin });
  }

  return stats;
}

export function computeCaseLeadTimes(events: EngEvent[]) {
  const byCase = groupByCase(events);
  const leadTimes: number[] = [];

  for (const [, trace] of byCase) {
    if (trace.length < 2) continue;
    const first = +new Date(trace[0].timestamp);
    const last = +new Date(trace[trace.length - 1].timestamp);
    const dtMin = (last - first) / (1000 * 60);
    if (Number.isFinite(dtMin) && dtMin >= 0) leadTimes.push(dtMin);
  }

  const s = leadTimes.sort((a, b) => a - b);
  const totalMin = s.reduce((acc, v) => acc + v, 0);
  const count = s.length;
  return {
    count,
    meanMin: count ? totalMin / count : 0,
    medianMin: percentile(s, 0.5),
    p95Min: percentile(s, 0.95),
  };
}

export function buildAdjacency(dfg: { nodes: DFGNode[]; edges: DFGEdge[] }) {
  const inMap = new Map<string, DFGEdge[]>();
  const outMap = new Map<string, DFGEdge[]>();

  for (const e of dfg.edges) {
    const ins = inMap.get(e.target) ?? [];
    ins.push(e);
    inMap.set(e.target, ins);

    const outs = outMap.get(e.source) ?? [];
    outs.push(e);
    outMap.set(e.source, outs);
  }

  for (const [k, arr] of inMap) inMap.set(k, arr.sort((a, b) => b.count - a.count));
  for (const [k, arr] of outMap) outMap.set(k, arr.sort((a, b) => b.count - a.count));

  return { inMap, outMap };
}

export function pickDefaultFocus(nodes: DFGNode[], fallback = "") {
  if (nodes.length === 0) return fallback;
  return [...nodes].sort((a, b) => b.count - a.count)[0].id;
}

export function computeConformanceSummary(events: EngEvent[], allowed: Set<string>) {
  const byCase = groupByCase(events);
  let totalEdges = 0;
  let badEdges = 0;

  for (const [, trace] of byCase) {
    for (let i = 0; i < trace.length - 1; i++) {
      const k = `${trace[i].activity} -> ${trace[i + 1].activity}`;
      totalEdges++;
      if (!allowed.has(k)) badEdges++;
    }
  }

  const conformance = totalEdges === 0 ? 100 : Math.round(((totalEdges - badEdges) / totalEdges) * 100);
  return { conformance, totalEdges, badEdges };
}

export function computeDeviationTime(events: EngEvent[], allowed: Set<string>) {
  const byCase = groupByCase(events);
  let totalMin = 0;

  for (const [, trace] of byCase) {
    for (let i = 0; i < trace.length - 1; i++) {
      const a = trace[i];
      const b = trace[i + 1];
      const k = `${a.activity} -> ${b.activity}`;
      const dtMin = (+new Date(b.timestamp) - +new Date(a.timestamp)) / (1000 * 60);
      if (!Number.isFinite(dtMin) || dtMin < 0) continue;
      if (!allowed.has(k)) totalMin += dtMin;
    }
  }

  return { totalMin };
}

export function computeLeadTimeDelta(toBeEvents: EngEvent[], asIsEvents: EngEvent[]) {
  const toBeByCase = groupByCase(toBeEvents);
  const asIsByCase = groupByCase(asIsEvents);
  const deltas: number[] = [];

  for (const [caseId, toBeTrace] of toBeByCase) {
    const asIsTrace = asIsByCase.get(caseId);
    if (!asIsTrace || toBeTrace.length < 2 || asIsTrace.length < 2) continue;

    const toBeMin = (+new Date(toBeTrace[toBeTrace.length - 1].timestamp) - +new Date(toBeTrace[0].timestamp)) / (1000 * 60);
    const asIsMin = (+new Date(asIsTrace[asIsTrace.length - 1].timestamp) - +new Date(asIsTrace[0].timestamp)) / (1000 * 60);

    if (!Number.isFinite(toBeMin) || !Number.isFinite(asIsMin)) continue;
    deltas.push(Math.max(0, asIsMin - toBeMin));
  }

  const s = deltas.sort((a, b) => a - b);
  const totalMin = s.reduce((acc, v) => acc + v, 0);
  const count = s.length;

  return {
    count,
    totalMin,
    meanMin: count ? totalMin / count : 0,
    p95Min: percentile(s, 0.95),
  };
}

export function computeResourcesAndCases(events: EngEvent[]) {
  const resByAct = new Map<string, Set<string>>();
  const casesByAct = new Map<string, Set<string>>();
  const allResources = new Set<string>();
  const allCases = new Set<string>();

  for (const e of events) {
    allCases.add(e.case_id);
    if (e.resource) allResources.add(e.resource);

    const s1 = resByAct.get(e.activity) ?? new Set<string>();
    if (e.resource) s1.add(e.resource);
    resByAct.set(e.activity, s1);

    const s2 = casesByAct.get(e.activity) ?? new Set<string>();
    s2.add(e.case_id);
    casesByAct.set(e.activity, s2);
  }

  return { resByAct, casesByAct, allResources, allCases };
}

export function computeTraces(events: EngEvent[]) {
  const byCase = groupByCase(events);
  const caseTrace = new Map<string, string[]>();
  const variantCount = new Map<string, { count: number; sampleCase: string }>();

  for (const [cid, trace] of byCase) {
    const seq = trace.map((e) => e.activity);
    caseTrace.set(cid, seq);
    const key = seq.join(" → ");
    const cur = variantCount.get(key);
    if (cur) cur.count += 1;
    else variantCount.set(key, { count: 1, sampleCase: cid });
  }

  const variants = [...variantCount.entries()]
    .map(([variant, v]) => ({ variant, count: v.count, sampleCase: v.sampleCase }))
    .sort((a, b) => b.count - a.count);

  return { caseTrace, variants };
}
