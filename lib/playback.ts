// lib/playback.ts
import type { EngEvent, Pos } from "./mining";
import { clamp } from "./mining";
import type { Node } from "reactflow";

export type Segment = { from: Pos; to: Pos; ctrl: Pos; durMs: number };

export function easeInOutQuad(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function bezier2(p0: Pos, p1: Pos, p2: Pos, t: number): Pos {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

export function nodeCenter(nodes: Node[], id: string): Pos | null {
  const n = nodes.find((x) => x.id === id);
  if (!n) return null;
  const w = (n as any).width ?? (n as any).measured?.width ?? 310;
  const h = (n as any).height ?? (n as any).measured?.height ?? 84;
  return { x: n.position.x + w / 2, y: n.position.y + h / 2 };
}

export function curveCtrl(from: Pos, to: Pos): Pos {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const offset = clamp(len * 0.15, 22, 70);
  return {
    x: (from.x + to.x) / 2 + nx * offset,
    y: (from.y + to.y) / 2 + ny * offset,
  };
}

export function computePlaybackTrace(events: EngEvent[], caseId: string) {
  return events
    .filter((e) => e.case_id === caseId)
    .slice()
    .sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp));
}

export function computePlaybackSegments(trace: EngEvent[], nodes: Node[], playSpeed: number) {
  if (trace.length < 2) return [] as Segment[];
  const segs: Segment[] = [];

  for (let i = 0; i < trace.length - 1; i++) {
    const a = trace[i];
    const b = trace[i + 1];
    const from = nodeCenter(nodes, a.activity);
    const to = nodeCenter(nodes, b.activity);
    if (!from || !to) continue;

    const dtMin = (+new Date(b.timestamp) - +new Date(a.timestamp)) / (1000 * 60);
    const durMs = clamp(220, 1600, (260 + Math.max(0, dtMin) * 8) / Math.max(0.4, playSpeed));
    segs.push({ from, to, ctrl: curveCtrl(from, to), durMs });
  }

  return segs;
}

export function posOnSegment(seg: Segment, t01: number): Pos {
  return bezier2(seg.from, seg.ctrl, seg.to, easeInOutQuad(t01));
}
