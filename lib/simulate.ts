// lib/simulate.ts
import type { Actor, EngEvent, IssueFamily, ProcessModel } from "./mining";
import { clamp } from "./mining";

// Causes (nouveau référentiel)
export const ISSUE_FAMILIES: IssueFamily[] = [
  "Qualité / conformité",
  "Données / continuité numérique",
  "Organisation / flux",
  "Risque",
];

function randomIssueFamily(rnd: () => number): IssueFamily {
  const i = Math.floor(rnd() * ISSUE_FAMILIES.length);
  return ISSUE_FAMILIES[clamp(i, 0, ISSUE_FAMILIES.length - 1)];
}

// --- WF Flow-3D TO-BE model (reference) ---
export const TO_BE: ProcessModel = {
  name: "WF Flow-3D — TO-BE (controlled digital transfers)",
  start: "BE - CATPart (pièce)",
  end: "Decision - Archive/Release",
  activities: [
    "BE - CATPart (pièce)",
    "BM - Pre-process (CATPart→STL)",
    "Gate 1 - Validation STL",
    "SIMU - FLOW-3D (Verse «360»)",
    "Gate 2 - Validation CSV (débit)",

    "BE - Secteur (CATPart)",
    "SIMU - ProCast (Thermique préchauff.)",
    "BM - Pre-process (Modèle préchauff. Abaqus)",
    "SIMU - ABAQUS (Calcul préchauff.)",
    "BM - Pre-process (Transfert déformé STL/IN2)",
    "Gate 3 - Validation transfert déformé",

    "SIMU - FLOW-3D (Remplissage «zoom»)",
    "SIMU - ABAQUS (Mécanique remplissage)",
    "Decision - Archive/Release",
  ],
  allowedEdges: [
    ["BE - CATPart (pièce)", "BM - Pre-process (CATPart→STL)"],
    ["BM - Pre-process (CATPart→STL)", "Gate 1 - Validation STL"],
    ["Gate 1 - Validation STL", "SIMU - FLOW-3D (Verse «360»)"],
    ["SIMU - FLOW-3D (Verse «360»)", "Gate 2 - Validation CSV (débit)"],

    ["BE - Secteur (CATPart)", "SIMU - ProCast (Thermique préchauff.)"],
    ["SIMU - ProCast (Thermique préchauff.)", "BM - Pre-process (Modèle préchauff. Abaqus)"],
    ["BM - Pre-process (Modèle préchauff. Abaqus)", "SIMU - ABAQUS (Calcul préchauff.)"],
    ["SIMU - ABAQUS (Calcul préchauff.)", "BM - Pre-process (Transfert déformé STL/IN2)"],
    ["BM - Pre-process (Transfert déformé STL/IN2)", "Gate 3 - Validation transfert déformé"],

    ["Gate 2 - Validation CSV (débit)", "SIMU - FLOW-3D (Remplissage «zoom»)"],
    ["Gate 3 - Validation transfert déformé", "SIMU - FLOW-3D (Remplissage «zoom»)"],
    ["SIMU - FLOW-3D (Remplissage «zoom»)", "SIMU - ABAQUS (Mécanique remplissage)"],
    ["SIMU - ABAQUS (Mécanique remplissage)", "Decision - Archive/Release"],

    ["SIMU - FLOW-3D (Remplissage «zoom»)", "BM - Pre-process (Transfert déformé STL/IN2)"],
  ],
};

// Effectifs (mock)
const STAFFING: Record<Actor, number> = {
  BE: 4,
  BM: 3,
  SIMU: 3,
  IPT: 1,
  GATE: 1,
  MANUAL: 1,
};

const RESOURCE_POOLS: Record<Actor, string[]> = (Object.keys(STAFFING) as Actor[]).reduce((acc, role) => {
  acc[role] = Array.from({ length: STAFFING[role] }, (_, i) => `${role}-${String(i + 1).padStart(2, "0")}`);
  return acc;
}, {} as Record<Actor, string[]>);

export function actorFromActivity(activity: string): Actor | undefined {
  if (activity.startsWith("BE -")) return "BE";
  if (activity.startsWith("BM -")) return "BM";
  if (activity.startsWith("SIMU -")) return "SIMU";
  if (activity.startsWith("Decision")) return "IPT";
  if (activity.startsWith("Gate")) return "GATE";
  if (activity.startsWith("Manual")) return "MANUAL";
  return undefined;
}

export function toolFromActivity(activity: string): string {
  if (activity.includes("FLOW-3D")) return "FLOW-3D";
  if (activity.includes("ABAQUS")) return "ABAQUS";
  if (activity.includes("ProCast")) return "ProCast";
  if (activity.includes("Pre-process")) return "Pre-process";
  if (activity.startsWith("Gate") || activity.startsWith("Decision")) return "PLM";
  if (activity.startsWith("Manual")) return "Local/Script";
  return "CATIA/3DEXP";
}

function pickResource(actor: Actor | undefined, rnd: () => number): string | undefined {
  if (!actor) return undefined;
  const pool = RESOURCE_POOLS[actor] ?? [];
  if (pool.length === 0) return `${actor}-01`;
  return pool[Math.floor(rnd() * pool.length)];
}

// deterministic RNG
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function addMinutes(iso: string, minutes: number) {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

// --- Event log generation (TO-BE) ---
function genToBeCase(caseId: string, startISO: string, rnd: () => number) {
  const dur = {
    cad: 60 + Math.round(rnd() * 120),
    stl: 20 + Math.round(rnd() * 60),
    gate1: 8 + Math.round(rnd() * 20),
    flow360: 45 + Math.round(rnd() * 120),
    gate2: 8 + Math.round(rnd() * 20),

    sector: 20 + Math.round(rnd() * 40),
    procast: 90 + Math.round(rnd() * 240),
    prepPreheat: 25 + Math.round(rnd() * 60),
    abqPreheat: 60 + Math.round(rnd() * 180),
    transferDef: 25 + Math.round(rnd() * 60),
    gate3: 8 + Math.round(rnd() * 20),

    fillZoom: 70 + Math.round(rnd() * 180),
    abqFill: 80 + Math.round(rnd() * 220),
    release: 15 + Math.round(rnd() * 45),
  };

  const seq: Array<{ activity: string; deltaMin: number }> = [
    { activity: "BE - CATPart (pièce)", deltaMin: dur.cad },
    { activity: "BM - Pre-process (CATPart→STL)", deltaMin: dur.stl },
    { activity: "Gate 1 - Validation STL", deltaMin: dur.gate1 },
    { activity: "SIMU - FLOW-3D (Verse «360»)", deltaMin: dur.flow360 },
    { activity: "Gate 2 - Validation CSV (débit)", deltaMin: dur.gate2 },

    { activity: "BE - Secteur (CATPart)", deltaMin: dur.sector },
    { activity: "SIMU - ProCast (Thermique préchauff.)", deltaMin: dur.procast },
    { activity: "BM - Pre-process (Modèle préchauff. Abaqus)", deltaMin: dur.prepPreheat },
    { activity: "SIMU - ABAQUS (Calcul préchauff.)", deltaMin: dur.abqPreheat },
    { activity: "BM - Pre-process (Transfert déformé STL/IN2)", deltaMin: dur.transferDef },
    { activity: "Gate 3 - Validation transfert déformé", deltaMin: dur.gate3 },

    { activity: "SIMU - FLOW-3D (Remplissage «zoom»)", deltaMin: dur.fillZoom },
    { activity: "SIMU - ABAQUS (Mécanique remplissage)", deltaMin: dur.abqFill },
    { activity: "Decision - Archive/Release", deltaMin: dur.release },
  ];

  let t = startISO;
  const events: EngEvent[] = [];
  for (const step of seq) {
    t = addMinutes(t, step.deltaMin);
    const actor = actorFromActivity(step.activity);
    events.push({
      case_id: caseId,
      activity: step.activity,
      timestamp: t,
      actor,
      tool: toolFromActivity(step.activity),
      resource: pickResource(actor, rnd),
      outcome: "OK",
    });
  }
  return events;
}

// --- AS-IS noise injection ---
function injectAsIsNoise(args: {
  base: EngEvent[];
  rnd: () => number;
  pSkipGate: number;
  pManual: number;
  pUncontrolledLoop: number;
  maxLoops: number;
}) {
  const { base, rnd, pSkipGate, pManual, pUncontrolledLoop, maxLoops } = args;
  let trace = [...base];

  const maybeRemove = (activity: string) => {
    if (rnd() < pSkipGate) trace = trace.filter((e) => e.activity !== activity);
  };
  maybeRemove("Gate 1 - Validation STL");
  maybeRemove("Gate 2 - Validation CSV (débit)");
  maybeRemove("Gate 3 - Validation transfert déformé");

  if (rnd() < pManual) {
    const idx = trace.findIndex((e) => e.activity === "SIMU - FLOW-3D (Verse «360»)");
    if (idx > 0) {
      const at = trace[idx - 1];
      const t = addMinutes(at.timestamp, 10 + Math.round(rnd() * 35));
      trace.splice(idx, 0, {
        case_id: at.case_id,
        activity: "Manual - Export/Convert (format)",
        timestamp: t,
        actor: "MANUAL",
        tool: toolFromActivity("Manual - Export/Convert (format)"),
        resource: pickResource("MANUAL", rnd),
        outcome: "REWORK",
        issue_family: "Données / continuité numérique",
      });
    }
  }

  if (rnd() < pManual * 0.8) {
    const idx = trace.findIndex((e) => e.activity === "SIMU - FLOW-3D (Remplissage «zoom»)");
    if (idx > 0) {
      const at = trace[idx - 1];
      const t = addMinutes(at.timestamp, 12 + Math.round(rnd() * 40));
      trace.splice(idx, 0, {
        case_id: at.case_id,
        activity: "Manual - Sync deformation (STL/IN2)",
        timestamp: t,
        actor: "MANUAL",
        tool: toolFromActivity("Manual - Sync deformation (STL/IN2)"),
        resource: pickResource("MANUAL", rnd),
        outcome: "REWORK",
        issue_family: "Données / continuité numérique",
      });
    }
  }

  if (rnd() < pUncontrolledLoop) {
    const zoomIdx = trace.findIndex((e) => e.activity === "SIMU - FLOW-3D (Remplissage «zoom»)");
    const transferIdx = trace.findIndex((e) => e.activity === "BM - Pre-process (Transfert déformé STL/IN2)");
    if (zoomIdx >= 0 && transferIdx >= 0 && transferIdx < zoomIdx) {
      const cause = randomIssueFamily(rnd);
      trace[zoomIdx] = { ...trace[zoomIdx], outcome: "ISSUE", issue_family: cause };

      let insertAt = zoomIdx + 1;
      const loops = 1 + Math.floor(rnd() * clamp(maxLoops, 1, 3));

      for (let i = 0; i < loops; i++) {
        const prev = trace[insertAt - 1];
        const t1 = addMinutes(prev.timestamp, 20 + Math.round(rnd() * 50));
        const t2 = addMinutes(t1, 60 + Math.round(rnd() * 150));

        trace.splice(
          insertAt,
          0,
          {
            case_id: prev.case_id,
            activity: "BM - Pre-process (Transfert déformé STL/IN2)",
            timestamp: t1,
            actor: "BM",
            tool: toolFromActivity("BM - Pre-process (Transfert déformé STL/IN2)"),
            resource: pickResource("BM", rnd),
            outcome: "REWORK",
            issue_family: cause,
          },
          {
            case_id: prev.case_id,
            activity: "SIMU - FLOW-3D (Remplissage «zoom»)",
            timestamp: t2,
            actor: "SIMU",
            tool: toolFromActivity("SIMU - FLOW-3D (Remplissage «zoom»)"),
            resource: pickResource("SIMU", rnd),
            outcome: i === loops - 1 ? "OK" : "ISSUE",
            issue_family: i === loops - 1 ? undefined : cause,
          }
        );
        insertAt += 2;
      }
    }
  }

  trace.sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp));
  return trace;
}

export function simulatePairedLog(args: {
  nCases: number;
  seed: number;
  pSkipGate: number;
  pManual: number;
  pUncontrolledLoop: number;
}) {
  const { nCases, seed, pSkipGate, pManual, pUncontrolledLoop } = args;
  const rnd = mulberry32(seed);

  const baseStart = new Date("2026-02-01T08:00:00Z").toISOString();
  const toBeEvents: EngEvent[] = [];
  const asIsEvents: EngEvent[] = [];

  for (let i = 1; i <= nCases; i++) {
    const caseId = `WF-${String(i).padStart(5, "0")}`;
    const start = addMinutes(baseStart, Math.round(rnd() * 60 * 24 * 5));

    const toBe = genToBeCase(caseId, start, rnd);
    const asIs = injectAsIsNoise({
      base: toBe,
      rnd,
      pSkipGate,
      pManual,
      pUncontrolledLoop,
      maxLoops: 3,
    });

    toBeEvents.push(...toBe);
    asIsEvents.push(...asIs);
  }

  return { toBeEvents, asIsEvents };
}
