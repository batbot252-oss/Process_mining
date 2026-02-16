"use client";

import React, { useCallback, useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  Edge,
  EdgeChange,
  Handle,
  Node,
  NodeChange,
  Position,
  ReactFlowProvider,
  NodeProps,
  applyEdgeChanges,
  applyNodeChanges,
  useEdgesState,
  useNodesState,
} from "reactflow";
import "reactflow/dist/style.css";

import { TO_BE, ISSUE_FAMILIES, simulatePairedLog } from "../lib/simulate";
import {
  buildAllowedEdgeSet,
  buildDFG,
  computeEdgeStats,
  computeConformanceSummary,
  computeDeviationTime,
  computeCaseLeadTimes,
  computeLeadTimeDelta,
  computeResourcesAndCases,
  computeTraces,
  pickDefaultFocus,
  formatHoursFromMin,
  formatDays8hFromMin,
} from "../lib/mining";
import { buildStageColumns, nearestStageX, buildFullProcessGraph } from "../lib/layout";
import { computePlaybackTrace, computePlaybackSegments, posOnSegment, Segment } from "../lib/playback";

type LabelMode = "count" | "avg" | "p95" | "avg+p95" | "none";
type Tab = "events" | "traces" | "stats";
type Pos = { x: number; y: number };

function CelonisNode(props: NodeProps) {
  const { data, selected } = props as any;
  const isFocus = !!data?.isFocus;
  const label = String(data?.label ?? "");
  const count = Number(data?.count ?? 0);
  const actor = data?.actor as string | undefined;
  const eff = Number(data?.eff ?? 0);
  const cases = Number(data?.cases ?? 0);

  const inDeg = Number(data?.inDeg ?? 0);
  const outDeg = Number(data?.outDeg ?? 0);
  const showTwoDots = inDeg > 0 && outDeg > 0;

  const dotCls = selected || isFocus ? "bg-zinc-900" : "bg-zinc-500";
  const borderCls = selected || isFocus ? "border-zinc-900" : "border-zinc-300";
  const shadowCls = selected || isFocus ? "shadow-[0_10px_30px_rgba(0,0,0,0.12)]" : "shadow-[0_8px_18px_rgba(0,0,0,0.06)]";

  const chip = (text: string) => (
    <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] text-zinc-600">
      {text}
    </span>
  );

  return (
    <div className={`relative w-[310px] rounded-2xl border ${borderCls} bg-white ${shadowCls} px-4 py-3`}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />

      <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
        <div className={`h-3.5 w-3.5 rounded-full ${dotCls}`} />
        {showTwoDots && <div className={`h-3.5 w-3.5 rounded-full ${dotCls}`} />}
      </div>

      <div className="pl-10">
        <div className="text-[13px] font-medium text-zinc-900 leading-4 line-clamp-2">{label}</div>
        <div className="mt-1 flex flex-wrap gap-2">
          {chip(`${count} events`)}
          {chip(`${cases} cases`)}
          {chip(`${eff} ressources`)}
          {actor && chip(actor)}
        </div>
      </div>

      <div className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] text-zinc-600">
        {Math.max(inDeg, 0)}↓ {Math.max(outDeg, 0)}↑
      </div>
    </div>
  );
}

function TokenNode() {
  return (
    <div style={{ pointerEvents: "none" }} className="relative">
      <div className="absolute -inset-2 rounded-full bg-zinc-900/10 animate-ping" />
      <div className="h-3.5 w-3.5 rounded-full bg-zinc-900 shadow-[0_10px_24px_rgba(0,0,0,0.22)]" />
    </div>
  );
}

const nodeTypes = { celonisNode: CelonisNode, tokenNode: TokenNode };

export default function ProcessExplorer() {
  const allowed = useMemo(() => buildAllowedEdgeSet(TO_BE), []);
  const stageCols = useMemo(() => buildStageColumns(TO_BE), []);

  const [mode, setMode] = useState<"as-is" | "to-be">("as-is");
  const [nCases, setNCases] = useState<number>(40);
  const [seed, setSeed] = useState<number>(7);

  const [pSkipGate, setPSkipGate] = useState<number>(0.35);
  const [pManual, setPManual] = useState<number>(0.25);
  const [pLoop, setPLoop] = useState<number>(0.35);

  const [labelMode, setLabelMode] = useState<LabelMode>("avg+p95");
  const [minEdgeCount, setMinEdgeCount] = useState<number>(1);
  const [highlightK, setHighlightK] = useState<number>(4);

  const [autoSeparate, setAutoSeparate] = useState<boolean>(true);
  const [lockColumns, setLockColumns] = useState<boolean>(true);

  const [manualPos, setManualPos] = useState<Record<string, Pos>>({});
  const [selectedNodeId, setSelectedNodeId] = useState<string>(TO_BE.start);
  const [panelOpen, setPanelOpen] = useState<boolean>(true);
  const [tab, setTab] = useState<Tab>("events");

  const [caseFilter, setCaseFilter] = useState<string>("");
  const [casePick, setCasePick] = useState<string>("");
  const [variantsOnlyContainingSelected, setVariantsOnlyContainingSelected] = useState<boolean>(false);

  const [playTrace, setPlayTrace] = useState<boolean>(false);
  const [playSpeed, setPlaySpeed] = useState<number>(1.2);
  const [tokenPos, setTokenPos] = useState<Pos>({ x: 0, y: 0 });

  const { toBeEvents, asIsEvents } = useMemo(() => {
    return simulatePairedLog({ nCases, seed, pSkipGate, pManual, pUncontrolledLoop: pLoop });
  }, [nCases, seed, pSkipGate, pManual, pLoop]);

  const events = mode === "to-be" ? toBeEvents : asIsEvents;

  const dfg = useMemo(() => buildDFG(events), [events]);
  const edgeStats = useMemo(() => computeEdgeStats(events), [events]);
  const defaultFocus = useMemo(() => pickDefaultFocus(dfg.nodes, TO_BE.start), [dfg.nodes]);

  React.useEffect(() => {
    const ids = new Set(dfg.nodes.map((n) => n.id));
    if (!ids.has(selectedNodeId)) setSelectedNodeId(defaultFocus);
  }, [dfg.nodes, selectedNodeId, defaultFocus]);

  const conf = useMemo(() => computeConformanceSummary(asIsEvents, allowed), [asIsEvents, allowed]);
  const deviationTime = useMemo(() => computeDeviationTime(asIsEvents, allowed), [asIsEvents, allowed]);

  const leadToBe = useMemo(() => computeCaseLeadTimes(toBeEvents), [toBeEvents]);
  const leadAsIs = useMemo(() => computeCaseLeadTimes(asIsEvents), [asIsEvents]);
  const leadDelta = useMemo(() => computeLeadTimeDelta(toBeEvents, asIsEvents), [toBeEvents, asIsEvents]);

  const resStats = useMemo(() => computeResourcesAndCases(events), [events]);
  const traces = useMemo(() => computeTraces(events), [events]);

  React.useEffect(() => {
    if (casePick) return;
    const first = [...traces.caseTrace.keys()][0];
    if (first) setCasePick(first);
  }, [traces.caseTrace, casePick]);

  const allCaseIds = useMemo(() => [...traces.caseTrace.keys()].sort(), [traces.caseTrace]);

  const selectedEvents = useMemo(() => {
    if (!selectedNodeId) return [];
    const filtered = events.filter((e) => e.activity === selectedNodeId);
    const cf = caseFilter.trim();
    const f2 = cf ? filtered.filter((e) => e.case_id.toLowerCase().includes(cf.toLowerCase())) : filtered;
    return f2.sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp)).slice(0, 160);
  }, [events, selectedNodeId, caseFilter]);

  const variantsShown = useMemo(() => {
    const base = traces.variants;
    if (!variantsOnlyContainingSelected || !selectedNodeId) return base.slice(0, 10);
    return base.filter((v) => v.variant.includes(selectedNodeId)).slice(0, 10);
  }, [traces.variants, variantsOnlyContainingSelected, selectedNodeId]);

  const caseTraceSeq = useMemo(() => {
    if (!casePick) return [] as string[];
    return traces.caseTrace.get(casePick) ?? [];
  }, [casePick, traces.caseTrace]);

  const [rfNodes, setRfNodes, onNodesChangeRF] = useNodesState<Node>([]);
  const [rfEdges, setRfEdges, onEdgesChangeRF] = useEdgesState<Edge>([]);

  const tokenNode = useMemo(() => {
    return {
      id: "__token__",
      type: "tokenNode",
      position: tokenPos,
      data: {},
      draggable: false,
      selectable: false,
      connectable: false,
      zIndex: 10000,
    } as Node;
  }, [tokenPos]);

  const flowNodes = useMemo(() => (playTrace ? [...rfNodes, tokenNode] : rfNodes), [rfNodes, playTrace, tokenNode]);

  const buildGraphForView = useCallback(() => {
    return buildFullProcessGraph({
      model: TO_BE,
      stageCols,
      dfg,
      allowedEdges: mode === "to-be" ? undefined : allowed,
      edgeStats,
      labelMode,
      lockColumns,
      autoSeparate,
      manualPos,
      minEdgeCount,
      selectedNodeId,
      highlightK,
      stats: { resByAct: resStats.resByAct, casesByAct: resStats.casesByAct },
    });
  }, [
    stageCols,
    dfg,
    mode,
    allowed,
    edgeStats,
    labelMode,
    lockColumns,
    autoSeparate,
    manualPos,
    minEdgeCount,
    selectedNodeId,
    highlightK,
    resStats.resByAct,
    resStats.casesByAct,
  ]);

  React.useEffect(() => {
    const g = buildGraphForView();
    setRfNodes(g.nodes);
    setRfEdges(g.edges);
  }, [buildGraphForView, setRfNodes, setRfEdges]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const useful = changes.filter((c) => c.id !== "__token__");
      setRfNodes((nds) => applyNodeChanges(useful, nds));

      setManualPos((prev) => {
        let next = prev;
        for (const ch of useful) {
          if (ch.type === "position" && (ch as any).position) {
            const p = (ch as any).position as Pos;
            const px = lockColumns ? nearestStageX(stageCols, p.x) : p.x;
            if (next === prev) next = { ...prev };
            next[ch.id] = { x: px, y: p.y };
          }
          if (ch.type === "remove") {
            if (next === prev) next = { ...prev };
            delete next[ch.id];
          }
        }
        return next;
      });
    },
    [setRfNodes, lockColumns, stageCols]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setRfEdges((eds) => applyEdgeChanges(changes, eds));
    },
    [setRfEdges]
  );

  const onNodeDragStop = useCallback(
    (_: any, node: Node) => {
      if (node.id === "__token__") return;
      setManualPos((prev) => {
        const px = lockColumns ? nearestStageX(stageCols, node.position.x) : node.position.x;
        return { ...prev, [node.id]: { x: px, y: node.position.y } };
      });
    },
    [lockColumns, stageCols]
  );

  // --- Playback (token) ---
  const playbackTrace = useMemo(() => (casePick ? computePlaybackTrace(events, casePick) : []), [events, casePick]);
  const playbackSegments = useMemo(
    () => computePlaybackSegments(playbackTrace, rfNodes, playSpeed),
    [playbackTrace, rfNodes, playSpeed]
  );

  React.useEffect(() => {
    if (!playTrace) return;
    if (playbackSegments.length === 0) return;

    let raf = 0;
    let segIndex = 0;
    let segStart = 0;

    setTokenPos({ x: playbackSegments[0].from.x - 7, y: playbackSegments[0].from.y - 7 });

    const loop = (ts: number) => {
      if (!segStart) segStart = ts;
      const seg = playbackSegments[segIndex];

      const t01 = Math.max(0, Math.min(1, (ts - segStart) / seg.durMs));
      const p = posOnSegment(seg as Segment, t01);
      setTokenPos({ x: p.x - 7, y: p.y - 7 });

      if (t01 >= 1) {
        segIndex = (segIndex + 1) % playbackSegments.length;
        segStart = ts;
      }
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playTrace, playbackSegments]);

  const pill = (active: boolean) =>
    active ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50";

  const toggle = (label: string, value: boolean, onChange: (v: boolean) => void) => (
    <button className={`rounded-full border px-3 py-1 text-sm ${value ? pill(true) : pill(false)}`} onClick={() => onChange(!value)} type="button">
      {label}
    </button>
  );

  const small = (title: string, value: string, sub?: string) => (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
      <div className="text-[11px] text-zinc-500">{title}</div>
      <div className="mt-1 text-[14px] font-semibold text-zinc-900">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-zinc-500">{sub}</div>}
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-7xl p-5">
        <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-[0_8px_22px_rgba(0,0,0,0.05)]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold text-zinc-900">WF Flow-3D — Process Explorer</div>
              <div className="text-xs text-zinc-500">Graphe complet — rouge = transition non conforme au TO-BE (en mode AS-IS).</div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button className={`rounded-full border px-3 py-1 text-sm ${pill(mode === "as-is")}`} onClick={() => setMode("as-is")} type="button">
                AS-IS (simulé)
              </button>
              <button className={`rounded-full border px-3 py-1 text-sm ${pill(mode === "to-be")}`} onClick={() => setMode("to-be")} type="button">
                TO-BE (référence)
              </button>
              <button className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-sm text-zinc-700 hover:bg-zinc-50" onClick={() => setSeed((s) => s + 1)} type="button">
                Regénérer
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            {small("Sélection", selectedNodeId, "Cliquez un nœud pour ouvrir le panel")}
            {small("Conformance (AS-IS vs TO-BE)", `${conf.conformance}%`, `${conf.badEdges}/${conf.totalEdges} transitions hors modèle`)}
            {small("Lead time (AS-IS)", `${formatHoursFromMin(leadAsIs.meanMin)} avg`, `p95 ${formatHoursFromMin(leadAsIs.p95Min)}`)}
            {small("Impact vs TO-BE", `${formatHoursFromMin(leadDelta.meanMin)} avg/case`, `total ${formatDays8hFromMin(leadDelta.totalMin)}`)}
            {small("Effectifs", `${resStats.allResources.size} ressources`, `${resStats.allCases.size} cases`)}
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="text-[11px] text-zinc-500">Cas simulés</div>
              <div className="mt-2 flex items-center gap-2">
                <input type="range" min={10} max={200} value={nCases} onChange={(e) => setNCases(Number(e.target.value))} className="w-full" />
                <span className="w-10 text-right text-[12px] font-medium text-zinc-900">{nCases}</span>
              </div>
              <div className="mt-2 text-[11px] text-zinc-500">Seed: {seed}</div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="text-[11px] text-zinc-500">Neighbors (top-K)</div>
              <div className="mt-2 flex items-center gap-2">
                <input type="range" min={1} max={10} value={highlightK} onChange={(e) => setHighlightK(Number(e.target.value))} className="w-full" />
                <span className="w-10 text-right text-[12px] font-medium text-zinc-900">{highlightK}</span>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="text-[11px] text-zinc-500">Edges</div>
              <div className="mt-2 flex items-center gap-2">
                <input type="range" min={1} max={10} value={minEdgeCount} onChange={(e) => setMinEdgeCount(Number(e.target.value))} className="w-full" />
                <span className="w-10 text-right text-[12px] font-medium text-zinc-900">≥{minEdgeCount}</span>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="text-[11px] text-zinc-500">Edge labels</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["avg+p95", "p95", "avg", "count", "none"] as LabelMode[]).map((m) => (
                  <button key={m} className={`rounded-full border px-3 py-1 text-sm ${pill(labelMode === m)}`} onClick={() => setLabelMode(m)} type="button">
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {toggle("Auto-separate", autoSeparate, setAutoSeparate)}
            {toggle("Lock columns", lockColumns, setLockColumns)}
            <button className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-sm text-zinc-700 hover:bg-zinc-50" onClick={() => setManualPos({})} type="button">
              Reset layout
            </button>
            {toggle("Panel", panelOpen, setPanelOpen)}

            <div className="mx-2 hidden h-6 w-px bg-zinc-200 md:block" />

            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm text-zinc-600">Trace</div>
              <select className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-sm text-zinc-700" value={casePick} onChange={(e) => setCasePick(e.target.value)}>
                {allCaseIds.slice(0, 200).map((cid) => (
                  <option key={cid} value={cid}>
                    {cid}
                  </option>
                ))}
              </select>

              <button
                className={`rounded-full border px-3 py-1 text-sm ${playTrace ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50"}`}
                onClick={() => setPlayTrace((p) => !p)}
                type="button"
                disabled={!casePick || playbackTrace.length < 2}
              >
                {playTrace ? "Stop" : "Play"}
              </button>

              <div className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1">
                <div className="text-sm text-zinc-600">Speed</div>
                <input type="range" min={0.5} max={2.5} step={0.1} value={playSpeed} onChange={(e) => setPlaySpeed(Number(e.target.value))} className="w-24" />
                <div className="w-10 text-right text-sm text-zinc-700">{playSpeed.toFixed(1)}x</div>
              </div>
            </div>
          </div>

          {mode === "as-is" && (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                <div className="text-[11px] text-zinc-500">Skip gates</div>
                <div className="mt-2 flex items-center gap-2">
                  <input type="range" min={0} max={0.8} step={0.05} value={pSkipGate} onChange={(e) => setPSkipGate(Number(e.target.value))} className="w-full" />
                  <span className="w-10 text-right text-[12px] font-medium text-zinc-900">{Math.round(pSkipGate * 100)}%</span>
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                <div className="text-[11px] text-zinc-500">Manual transfers</div>
                <div className="mt-2 flex items-center gap-2">
                  <input type="range" min={0} max={0.8} step={0.05} value={pManual} onChange={(e) => setPManual(Number(e.target.value))} className="w-full" />
                  <span className="w-10 text-right text-[12px] font-medium text-zinc-900">{Math.round(pManual * 100)}%</span>
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                <div className="text-[11px] text-zinc-500">Uncontrolled loops</div>
                <div className="mt-2 flex items-center gap-2">
                  <input type="range" min={0} max={0.8} step={0.05} value={pLoop} onChange={(e) => setPLoop(Number(e.target.value))} className="w-full" />
                  <span className="w-10 text-right text-[12px] font-medium text-zinc-900">{Math.round(pLoop * 100)}%</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_440px]">
          <div className="rounded-2xl border border-zinc-200 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.06)]">
            <div className="h-[820px]">
              <ReactFlowProvider>
                <ReactFlow
                  nodes={flowNodes}
                  edges={rfEdges}
                  nodeTypes={nodeTypes}
                  fitView
                  fitViewOptions={{ padding: 0.15 }}
                  proOptions={{ hideAttribution: true }}
                  nodesDraggable
                  nodesConnectable={false}
                  elementsSelectable
                  panOnScroll
                  zoomOnScroll
                  zoomOnDoubleClick={false}
                  snapToGrid
                  snapGrid={[10, 10]}
                  onNodesChange={(chs) => {
                    onNodesChangeRF(chs);
                    onNodesChange(chs);
                  }}
                  onEdgesChange={(chs) => {
                    onEdgesChangeRF(chs);
                    onEdgesChange(chs);
                  }}
                  onNodeClick={(_, n) => {
                    if (n.id === "__token__") return;
                    setSelectedNodeId(n.id);
                    setPanelOpen(true);
                  }}
                  onNodeDragStop={onNodeDragStop}
                  defaultEdgeOptions={{ type: "smoothstep", style: { stroke: "#9CA3AF", strokeWidth: 2 } }}
                >
                  <Background color="#E5E7EB" gap={26} size={1} />
                  <Controls />
                </ReactFlow>
              </ReactFlowProvider>
            </div>
          </div>

          {panelOpen && (
            <div className="rounded-2xl border border-zinc-200 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.06)]">
              <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">{selectedNodeId}</div>
                  <div className="text-xs text-zinc-500">Cliquez un nœud pour changer • events + traces</div>
                </div>
                <button className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-sm text-zinc-700 hover:bg-zinc-50" onClick={() => setPanelOpen(false)} type="button">
                  Fermer
                </button>
              </div>

              <div className="flex gap-2 border-b border-zinc-200 px-4 py-3">
                <button className={`rounded-full border px-3 py-1 text-sm ${pill(tab === "events")}`} onClick={() => setTab("events")} type="button">
                  Events
                </button>
                <button className={`rounded-full border px-3 py-1 text-sm ${pill(tab === "traces")}`} onClick={() => setTab("traces")} type="button">
                  Traces
                </button>
                <button className={`rounded-full border px-3 py-1 text-sm ${pill(tab === "stats")}`} onClick={() => setTab("stats")} type="button">
                  Stats
                </button>
              </div>

              {tab === "events" && (
                <div className="p-4">
                  <div className="text-[11px] text-zinc-500">Filtrer par case_id (optionnel)</div>
                  <input
                    value={caseFilter}
                    onChange={(e) => setCaseFilter(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                    placeholder="ex: WF-00042"
                  />

                  <div className="mt-3 text-[11px] text-zinc-500">Derniers events (max 160)</div>
                  <div className="mt-2 max-h-[640px] overflow-auto rounded-2xl border border-zinc-200">
                    <table className="w-full border-collapse text-left text-[12px]">
                      <thead className="sticky top-0 bg-zinc-50">
                        <tr>
                          <th className="border-b border-zinc-200 px-3 py-2 font-medium text-zinc-700">Time</th>
                          <th className="border-b border-zinc-200 px-3 py-2 font-medium text-zinc-700">Case</th>
                          <th className="border-b border-zinc-200 px-3 py-2 font-medium text-zinc-700">Outcome</th>
                          <th className="border-b border-zinc-200 px-3 py-2 font-medium text-zinc-700">Cause</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedEvents.map((e, idx) => (
                          <tr key={`${e.case_id}-${e.timestamp}-${idx}`} className="hover:bg-zinc-50">
                            <td className="border-b border-zinc-100 px-3 py-2 text-zinc-800 whitespace-nowrap">{new Date(e.timestamp).toLocaleString()}</td>
                            <td className="border-b border-zinc-100 px-3 py-2 text-zinc-800 whitespace-nowrap">{e.case_id}</td>
                            <td className="border-b border-zinc-100 px-3 py-2 text-zinc-700 whitespace-nowrap">{e.outcome ?? "—"}</td>
                            <td className="border-b border-zinc-100 px-3 py-2 text-zinc-700 whitespace-nowrap">{e.outcome === "OK" ? "—" : e.issue_family ?? "—"}</td>
                          </tr>
                        ))}
                        {selectedEvents.length === 0 && (
                          <tr>
                            <td className="px-3 py-3 text-zinc-500" colSpan={4}>
                              Aucun event (ou filtre trop strict).
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {tab === "traces" && (
                <div className="p-4">
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                    <div className="text-[11px] text-zinc-500">Trace d’un case</div>
                    <div className="mt-3 text-[12px] text-zinc-800 leading-5">
                      {caseTraceSeq.length === 0 ? (
                        <span className="text-zinc-500">—</span>
                      ) : (
                        caseTraceSeq.map((a, i) => (
                          <span key={`${a}-${i}`} className={`inline-flex items-center ${a === selectedNodeId ? "font-semibold text-zinc-900" : "text-zinc-700"}`}>
                            {a}
                            {i < caseTraceSeq.length - 1 && <span className="mx-2 text-zinc-400">→</span>}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] text-zinc-500">Top variants</div>
                      <button className={`rounded-full border px-3 py-1 text-sm ${pill(variantsOnlyContainingSelected)}`} onClick={() => setVariantsOnlyContainingSelected((v) => !v)} type="button">
                        contains selected
                      </button>
                    </div>

                    <div className="mt-2 flex flex-col gap-2">
                      {variantsShown.map((v, i) => (
                        <div key={i} className="rounded-2xl border border-zinc-200 bg-white p-3">
                          <div className="flex items-center justify-between">
                            <div className="text-[12px] font-medium text-zinc-900">x{v.count}</div>
                            <div className="text-[11px] text-zinc-500">sample {v.sampleCase}</div>
                          </div>
                          <div className="mt-2 text-[12px] text-zinc-700 leading-5 line-clamp-3">{v.variant}</div>
                        </div>
                      ))}
                      {variantsShown.length === 0 && <div className="text-[12px] text-zinc-500">Aucun variant.</div>}
                    </div>
                  </div>
                </div>
              )}

              {tab === "stats" && (
                <div className="p-4">
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                    <div className="text-[11px] text-zinc-500">Causes (référentiel)</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {ISSUE_FAMILIES.map((c) => (
                        <span key={c} className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[12px] text-zinc-700">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-3">
                    <div className="text-[11px] text-zinc-500">TO-BE</div>
                    <div className="mt-2 text-[12px] text-zinc-700">{TO_BE.name}</div>
                    <div className="mt-2 text-[11px] text-zinc-500">
                      Lead time TO-BE (avg): {formatHoursFromMin(leadToBe.meanMin)} — p95: {formatHoursFromMin(leadToBe.p95Min)}
                    </div>
                    <div className="mt-2 text-[11px] text-zinc-500">
                      Déviation AS-IS hors TO-BE: {formatDays8hFromMin(deviationTime.totalMin)} ({formatHoursFromMin(deviationTime.totalMin)})
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
