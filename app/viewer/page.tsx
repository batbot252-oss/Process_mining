"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

type Pillar = "PIECE" | "HP" | "GPE";
type LOD = "LOD1" | "LOD2" | "LOD3";

type Entity = "BE" | "BM" | "SIM" | "FA" | "CND";

type ToolName =
  | "3DEXPERIENCE"
  | "CATIA"
  | "EKL"
  | "ABAQUS"
  | "ANSA"
  | "Python"
  | "Moldflow"
  | "ProCAST"
  | "Flow-3D"
  | "Visual Mesh"
  | "Excel"
  | "Power BI"
  | "MES"
  | "ERP"
  | "CIVA";

type SimulationJob = "INJ_C" | "INJ_N" | "PRE_CHAUF" | "SDF";

type BubbleFamily = "METIER" | "OUTIL" | "SIMULATION";

type Position = {
  x: number;
  y: number;
};

type Bubble = {
  id: string;
  label: string;
  subtitle: string;
  family: BubbleFamily;
  pillar?: Pillar;
  lod?: LOD;
  x: number;
  y: number;
  color: string;
  description: string;
  visibleDefault: boolean;
  isCustom?: boolean;
};

type BubbleOverride = {
  x?: number;
  y?: number;
  visible?: boolean;
};

const WIDTH = 1600;
const HEIGHT = 980;

const LS_BUBBLE_OVERRIDES = "plm_free_bubbles_overrides_v1";
const LS_CUSTOM_BUBBLES = "plm_free_custom_bubbles_v1";

const PILLARS = ["PIECE", "HP", "GPE"] as const;
const LODS = ["LOD1", "LOD2", "LOD3"] as const;
const ENTITIES = ["BE", "BM", "SIM", "FA", "CND"] as const;

const TOOLS: ToolName[] = [
  "3DEXPERIENCE",
  "CATIA",
  "EKL",
  "ABAQUS",
  "ANSA",
  "Python",
  "Moldflow",
  "ProCAST",
  "Flow-3D",
  "Visual Mesh",
  "Excel",
  "Power BI",
  "MES",
  "ERP",
  "CIVA",
];

const SIMULATION_JOBS: SimulationJob[] = [
  "INJ_C",
  "INJ_N",
  "PRE_CHAUF",
  "SDF",
];

const PILLAR_LABELS: Record<Pillar, string> = {
  PIECE: "Pièce",
  HP: "HP",
  GPE: "GPE",
};

const LOD_LABELS: Record<LOD, string> = {
  LOD1: "LOD1",
  LOD2: "LOD2",
  LOD3: "LOD3",
};

const LOD_DETAILS: Record<LOD, string> = {
  LOD1: "Cadrage",
  LOD2: "Convergence",
  LOD3: "Validation",
};

const TOOL_LABELS: Record<ToolName, string> = {
  "3DEXPERIENCE": "3DEXPERIENCE",
  CATIA: "CATIA",
  EKL: "EKL",
  ABAQUS: "ABAQUS",
  ANSA: "ANSA",
  Python: "Python",
  Moldflow: "Moldflow",
  ProCAST: "ProCAST",
  "Flow-3D": "Flow-3D",
  "Visual Mesh": "Visual Mesh",
  Excel: "Excel",
  "Power BI": "Power BI",
  MES: "MES / Atelier",
  ERP: "ERP",
  CIVA: "CIVA / CND",
};

const SIMULATION_JOB_LABELS: Record<SimulationJob, string> = {
  INJ_C: "Inj_c",
  INJ_N: "Inj_n",
  PRE_CHAUF: "Pré_chauf",
  SDF: "SDF",
};

const ENTITY_COLORS: Record<Entity, string> = {
  BE: "#60a5fa",
  BM: "#f59e0b",
  SIM: "#a78bfa",
  FA: "#34d399",
  CND: "#f87171",
};

const FAMILY_COLORS: Record<BubbleFamily, string> = {
  METIER: "#60a5fa",
  OUTIL: "#38bdf8",
  SIMULATION: "#a78bfa",
};

const PILLAR_COLORS: Record<Pillar, string> = {
  PIECE: "#38bdf8",
  HP: "#facc15",
  GPE: "#c084fc",
};

const PILLAR_FRAMES: Record<Pillar, { x: number; y: number; w: number; h: number }> = {
  PIECE: { x: 170, y: 145, w: 400, h: 755 },
  HP: { x: 600, y: 145, w: 400, h: 755 },
  GPE: { x: 1030, y: 145, w: 400, h: 755 },
};

const LOD_ROWS: Record<LOD, { y: number; h: number }> = {
  LOD1: { y: 185, h: 205 },
  LOD2: { y: 430, h: 205 },
  LOD3: { y: 675, h: 205 },
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function labelForFamilyValue(family: BubbleFamily, value: string) {
  if (family === "METIER") return value;
  if (family === "OUTIL") return TOOL_LABELS[value as ToolName];
  return SIMULATION_JOB_LABELS[value as SimulationJob];
}

function colorForFamilyValue(family: BubbleFamily, value: string) {
  if (family === "METIER") return ENTITY_COLORS[value as Entity];
  return FAMILY_COLORS[family];
}

function subtitleForFamilyValue(family: BubbleFamily) {
  if (family === "METIER") return "Métier";
  if (family === "OUTIL") return "Outil";
  return "Métier simulation";
}

function descriptionForFamilyValue(family: BubbleFamily, value: string) {
  const label = labelForFamilyValue(family, value);

  if (family === "METIER") {
    return `Bulle métier libre : ${label}. Elle peut être placée manuellement dans le cadre Pièce, HP ou GPE, au niveau LOD souhaité.`;
  }

  if (family === "OUTIL") {
    return `Bulle outil libre : ${label}. Elle peut être placée dans la zone où l’outil intervient dans ton architecture.`;
  }

  return `Bulle métier simulation libre : ${label}. Elle peut être positionnée dans la zone simulation ou dans tout autre emplacement utile.`;
}

function getOptionsForFamily(family: BubbleFamily) {
  if (family === "METIER") {
    return ENTITIES.map((entity) => ({
      value: entity,
      label: entity,
    }));
  }

  if (family === "OUTIL") {
    return TOOLS.map((tool) => ({
      value: tool,
      label: TOOL_LABELS[tool],
    }));
  }

  return SIMULATION_JOBS.map((job) => ({
    value: job,
    label: SIMULATION_JOB_LABELS[job],
  }));
}

function bubbleWidth(label: string) {
  return clamp(label.length * 8 + 42, 70, 172);
}

function getInitialBubblePosition(index: number): Position {
  const col = index % 5;
  const row = Math.floor(index / 5);

  return {
    x: 1180 + col * 68,
    y: 205 + row * 46,
  };
}

function buildDefaultBubbles(): Bubble[] {
  const bubbles: Bubble[] = [];

  for (const pillar of PILLARS) {
    const frame = PILLAR_FRAMES[pillar];

    for (const lod of LODS) {
      const row = LOD_ROWS[lod];

      ENTITIES.forEach((entity, index) => {
        bubbles.push({
          id: `${pillar}_${lod}_${entity}`,
          label: entity,
          subtitle: `${PILLAR_LABELS[pillar]} · ${lod}`,
          family: "METIER",
          pillar,
          lod,
          x: frame.x + 65 + index * 68,
          y: row.y + 72,
          color: ENTITY_COLORS[entity],
          description: `${entity} associé par défaut au pilier ${PILLAR_LABELS[pillar]} et au niveau ${lod}. Cette bulle reste librement déplaçable.`,
          visibleDefault: true,
        });
      });

      SIMULATION_JOBS.forEach((job, index) => {
        bubbles.push({
          id: `${pillar}_${lod}_SIM_${job}`,
          label: SIMULATION_JOB_LABELS[job],
          subtitle: `${PILLAR_LABELS[pillar]} · ${lod}`,
          family: "SIMULATION",
          pillar,
          lod,
          x: frame.x + 82 + index * 78,
          y: row.y + 132,
          color: FAMILY_COLORS.SIMULATION,
          description: `Métier simulation ${SIMULATION_JOB_LABELS[job]} disponible pour ${PILLAR_LABELS[pillar]} au niveau ${lod}.`,
          visibleDefault: false,
        });
      });
    }
  }

  TOOLS.forEach((tool, index) => {
    const position = getInitialBubblePosition(index);

    bubbles.push({
      id: `TOOL_${tool}`,
      label: TOOL_LABELS[tool],
      subtitle: "Outil libre",
      family: "OUTIL",
      x: position.x,
      y: position.y,
      color: FAMILY_COLORS.OUTIL,
      description: `Outil ${TOOL_LABELS[tool]} disponible comme bulle libre. Tu peux l’afficher, le déplacer et le placer dans la zone souhaitée.`,
      visibleDefault: false,
    });
  });

  return bubbles;
}

export default function ViewerPage() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const draggingBubbleIdRef = useRef<string | null>(null);
  const dragOffsetRef = useRef<Position>({ x: 0, y: 0 });
  const storageLoadedRef = useRef(false);

  const defaultBubbles = useMemo(() => buildDefaultBubbles(), []);

  const [customBubbles, setCustomBubbles] = useState<Bubble[]>([]);
  const [bubbleOverrides, setBubbleOverrides] = useState<
    Record<string, BubbleOverride>
  >({});

  const [selectedBubbleId, setSelectedBubbleId] = useState<string>("PIECE_LOD1_BE");

  const [moveEnabled, setMoveEnabled] = useState(true);
  const [search, setSearch] = useState("");
  const [familyFilter, setFamilyFilter] = useState<BubbleFamily | "ALL">("ALL");
  const [pillarFilter, setPillarFilter] = useState<Pillar | "ALL">("ALL");
  const [lodFilter, setLodFilter] = useState<LOD | "ALL">("ALL");

  const [newBubbleFamily, setNewBubbleFamily] = useState<BubbleFamily>("METIER");
  const [newBubbleValue, setNewBubbleValue] = useState<string>("BE");

  useEffect(() => {
    try {
      const rawOverrides = window.localStorage.getItem(LS_BUBBLE_OVERRIDES);
      const rawCustomBubbles = window.localStorage.getItem(LS_CUSTOM_BUBBLES);

      if (rawOverrides) {
        setBubbleOverrides(JSON.parse(rawOverrides) as Record<string, BubbleOverride>);
      }

      if (rawCustomBubbles) {
        setCustomBubbles(JSON.parse(rawCustomBubbles) as Bubble[]);
      }
    } catch {
      setBubbleOverrides({});
      setCustomBubbles([]);
    } finally {
      storageLoadedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!storageLoadedRef.current) return;

    window.localStorage.setItem(
      LS_BUBBLE_OVERRIDES,
      JSON.stringify(bubbleOverrides)
    );
  }, [bubbleOverrides]);

  useEffect(() => {
    if (!storageLoadedRef.current) return;

    window.localStorage.setItem(
      LS_CUSTOM_BUBBLES,
      JSON.stringify(customBubbles)
    );
  }, [customBubbles]);

  useEffect(() => {
    const firstOption = getOptionsForFamily(newBubbleFamily)[0];

    if (firstOption) {
      setNewBubbleValue(firstOption.value);
    }
  }, [newBubbleFamily]);

  const allBaseBubbles = useMemo(() => {
    return [...defaultBubbles, ...customBubbles];
  }, [defaultBubbles, customBubbles]);

  const bubbles = useMemo(() => {
    return allBaseBubbles.map((bubble) => {
      const override = bubbleOverrides[bubble.id];

      return {
        ...bubble,
        x: override?.x ?? bubble.x,
        y: override?.y ?? bubble.y,
        visible: override?.visible ?? bubble.visibleDefault,
      };
    });
  }, [allBaseBubbles, bubbleOverrides]);

  const selectedBubble = useMemo(() => {
    return bubbles.find((bubble) => bubble.id === selectedBubbleId);
  }, [bubbles, selectedBubbleId]);

  const filteredBubbles = useMemo(() => {
    const searchValue = search.toLowerCase().trim();

    return bubbles.filter((bubble) => {
      const matchSearch =
        searchValue.length === 0 ||
        bubble.label.toLowerCase().includes(searchValue) ||
        bubble.subtitle.toLowerCase().includes(searchValue) ||
        bubble.description.toLowerCase().includes(searchValue) ||
        bubble.family.toLowerCase().includes(searchValue);

      const matchFamily = familyFilter === "ALL" || bubble.family === familyFilter;

      const matchPillar =
        pillarFilter === "ALL" || bubble.pillar === pillarFilter || !bubble.pillar;

      const matchLOD = lodFilter === "ALL" || bubble.lod === lodFilter || !bubble.lod;

      return matchSearch && matchFamily && matchPillar && matchLOD;
    });
  }, [bubbles, search, familyFilter, pillarFilter, lodFilter]);

  const visibleBubbles = useMemo(() => {
    return filteredBubbles.filter((bubble) => bubble.visible);
  }, [filteredBubbles]);

  function getSvgPoint(event: ReactPointerEvent<SVGElement>): Position {
    const svg = svgRef.current;

    if (!svg) {
      return { x: 0, y: 0 };
    }

    const rect = svg.getBoundingClientRect();

    return {
      x: ((event.clientX - rect.left) / rect.width) * WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
    };
  }

  function startDragBubble(
    event: ReactPointerEvent<SVGGElement>,
    bubble: Bubble & { visible: boolean }
  ) {
    setSelectedBubbleId(bubble.id);

    if (!moveEnabled) return;

    event.preventDefault();
    event.stopPropagation();

    const point = getSvgPoint(event);

    draggingBubbleIdRef.current = bubble.id;
    dragOffsetRef.current = {
      x: point.x - bubble.x,
      y: point.y - bubble.y,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDraggedBubble(event: ReactPointerEvent<SVGSVGElement>) {
    const draggingBubbleId = draggingBubbleIdRef.current;

    if (!draggingBubbleId || !moveEnabled) return;

    const point = getSvgPoint(event);

    const nextX = clamp(point.x - dragOffsetRef.current.x, 35, WIDTH - 35);
    const nextY = clamp(point.y - dragOffsetRef.current.y, 35, HEIGHT - 35);

    setBubbleOverrides((previous) => ({
      ...previous,
      [draggingBubbleId]: {
        ...previous[draggingBubbleId],
        x: nextX,
        y: nextY,
      },
    }));
  }

  function stopDraggingBubble() {
    draggingBubbleIdRef.current = null;
  }

  function setBubbleVisible(bubbleId: string, visible: boolean) {
    setBubbleOverrides((previous) => ({
      ...previous,
      [bubbleId]: {
        ...previous[bubbleId],
        visible,
      },
    }));
  }

  function showFilteredBubbles() {
    setBubbleOverrides((previous) => {
      const next = { ...previous };

      for (const bubble of filteredBubbles) {
        next[bubble.id] = {
          ...next[bubble.id],
          visible: true,
        };
      }

      return next;
    });
  }

  function hideFilteredBubbles() {
    setBubbleOverrides((previous) => {
      const next = { ...previous };

      for (const bubble of filteredBubbles) {
        next[bubble.id] = {
          ...next[bubble.id],
          visible: false,
        };
      }

      return next;
    });
  }

  function addCustomBubble() {
    const label = labelForFamilyValue(newBubbleFamily, newBubbleValue);
    const color = colorForFamilyValue(newBubbleFamily, newBubbleValue);
    const index = customBubbles.length;
    const position = {
      x: 1460,
      y: 190 + (index % 12) * 48,
    };

    const id = `CUSTOM_${Date.now()}_${Math.round(Math.random() * 100000)}`;

    const bubble: Bubble = {
      id,
      label,
      subtitle: subtitleForFamilyValue(newBubbleFamily),
      family: newBubbleFamily,
      x: position.x,
      y: position.y,
      color,
      description: descriptionForFamilyValue(newBubbleFamily, newBubbleValue),
      visibleDefault: true,
      isCustom: true,
    };

    setCustomBubbles((previous) => [...previous, bubble]);
    setSelectedBubbleId(id);
  }

  function deleteCustomBubble(bubbleId: string) {
    setCustomBubbles((previous) => previous.filter((bubble) => bubble.id !== bubbleId));

    setBubbleOverrides((previous) => {
      const next = { ...previous };
      delete next[bubbleId];
      return next;
    });

    if (selectedBubbleId === bubbleId) {
      setSelectedBubbleId("PIECE_LOD1_BE");
    }
  }

  function resetPositions() {
    setBubbleOverrides((previous) => {
      const next: Record<string, BubbleOverride> = {};

      for (const [bubbleId, override] of Object.entries(previous)) {
        if (override.visible !== undefined) {
          next[bubbleId] = { visible: override.visible };
        }
      }

      return next;
    });
  }

  function resetEverything() {
    setBubbleOverrides({});
    setCustomBubbles([]);
    setSearch("");
    setFamilyFilter("ALL");
    setPillarFilter("ALL");
    setLodFilter("ALL");
    setSelectedBubbleId("PIECE_LOD1_BE");

    window.localStorage.removeItem(LS_BUBBLE_OVERRIDES);
    window.localStorage.removeItem(LS_CUSTOM_BUBBLES);
  }

  const newBubbleOptions = getOptionsForFamily(newBubbleFamily);

  return (
    <main className="viewerPage">
      <section className="topbar">
        <div>
          <p className="eyebrow">Mini-PLM · Viewer libre V0.3</p>
          <h1>Placement libre des bulles dans Pièce / HP / GPE</h1>
        </div>

        <div className="toolbar">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher une bulle..."
          />

          <select
            value={familyFilter}
            onChange={(event) =>
              setFamilyFilter(event.target.value as BubbleFamily | "ALL")
            }
          >
            <option value="ALL">Toutes bulles</option>
            <option value="METIER">Métiers</option>
            <option value="OUTIL">Outils</option>
            <option value="SIMULATION">Métiers SIM</option>
          </select>

          <select
            value={pillarFilter}
            onChange={(event) =>
              setPillarFilter(event.target.value as Pillar | "ALL")
            }
          >
            <option value="ALL">Tous piliers</option>
            <option value="PIECE">Pièce</option>
            <option value="HP">HP</option>
            <option value="GPE">GPE</option>
          </select>

          <select
            value={lodFilter}
            onChange={(event) => setLodFilter(event.target.value as LOD | "ALL")}
          >
            <option value="ALL">Tous LOD</option>
            <option value="LOD1">LOD1</option>
            <option value="LOD2">LOD2</option>
            <option value="LOD3">LOD3</option>
          </select>

          <button
            className={moveEnabled ? "activeButton" : ""}
            onClick={() => setMoveEnabled((current) => !current)}
          >
            {moveEnabled ? "Déplacement actif" : "Déplacement verrouillé"}
          </button>

          <button onClick={showFilteredBubbles}>Afficher sélection</button>
          <button onClick={hideFilteredBubbles}>Masquer sélection</button>
          <button onClick={resetPositions}>Réinit. positions</button>
          <button onClick={resetEverything}>Réinit. total</button>
        </div>
      </section>

      <section className="layout">
        <div className="graphCard">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className={moveEnabled ? "graphSvg graphSvgMove" : "graphSvg"}
            role="img"
            onPointerMove={moveDraggedBubble}
            onPointerUp={stopDraggingBubble}
            onPointerLeave={stopDraggingBubble}
          >
            <defs>
              <filter id="bubbleGlow" x="-60%" y="-80%" width="220%" height="260%">
                <feGaussianBlur stdDeviation="3.8" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {PILLARS.map((pillar) => {
              const frame = PILLAR_FRAMES[pillar];

              return (
                <g key={pillar}>
                  <rect
                    x={frame.x}
                    y={frame.y}
                    width={frame.w}
                    height={frame.h}
                    rx={28}
                    className="pillarFrame"
                    stroke={PILLAR_COLORS[pillar]}
                  />

                  <text
                    x={frame.x + frame.w / 2}
                    y={frame.y - 20}
                    textAnchor="middle"
                    className="pillarTitle"
                  >
                    {PILLAR_LABELS[pillar]}
                  </text>
                </g>
              );
            })}

            {LODS.map((lod) => {
              const row = LOD_ROWS[lod];

              return (
                <g key={lod}>
                  <rect
                    x={120}
                    y={row.y}
                    width={1350}
                    height={row.h}
                    rx={22}
                    className="lodBand"
                  />

                  <line
                    x1={145}
                    y1={row.y}
                    x2={1450}
                    y2={row.y}
                    className="lodSeparator"
                  />

                  <text x={55} y={row.y + 92} className="lodMainLabel">
                    {LOD_LABELS[lod]}
                  </text>

                  <text x={55} y={row.y + 118} className="lodSubLabel">
                    {LOD_DETAILS[lod]}
                  </text>
                </g>
              );
            })}

            {visibleBubbles.map((bubble) => {
              const width = bubbleWidth(bubble.label);
              const selected = selectedBubbleId === bubble.id;
              const hasCustomPosition =
                bubbleOverrides[bubble.id]?.x !== undefined ||
                bubbleOverrides[bubble.id]?.y !== undefined;

              return (
                <g
                  key={bubble.id}
                  transform={`translate(${bubble.x}, ${bubble.y})`}
                  className={moveEnabled ? "bubbleGroup bubbleGroupMove" : "bubbleGroup"}
                  onPointerDown={(event) => startDragBubble(event, bubble)}
                  filter={selected ? "url(#bubbleGlow)" : undefined}
                >
                  <rect
                    x={-width / 2}
                    y={-18}
                    width={width}
                    height={36}
                    rx={18}
                    fill={bubble.color}
                    stroke={
                      selected ? "#ffffff" : hasCustomPosition ? "#facc15" : "rgba(255,255,255,0.28)"
                    }
                    strokeWidth={selected ? 3.2 : hasCustomPosition ? 2.6 : 1.6}
                  />

                  <circle
                    cx={-width / 2 + 18}
                    cy={0}
                    r={5.5}
                    fill="rgba(15,23,42,0.72)"
                  />

                  <text
                    x={-width / 2 + 32}
                    y={4.5}
                    className="bubbleText"
                  >
                    {bubble.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <aside className="sidePanel">
          <div className="panelBlock">
            <p className="panelLabel">Bulle sélectionnée</p>

            {selectedBubble ? (
              <>
                <div className="selectedHeader">
                  <span
                    className="dot"
                    style={{ background: selectedBubble.color }}
                  />
                  <div>
                    <h2>{selectedBubble.label}</h2>
                    <p>
                      {selectedBubble.subtitle} · {selectedBubble.family}
                      {selectedBubble.pillar
                        ? ` · ${PILLAR_LABELS[selectedBubble.pillar]}`
                        : ""}
                      {selectedBubble.lod ? ` · ${selectedBubble.lod}` : ""}
                    </p>
                  </div>
                </div>

                <p className="description">{selectedBubble.description}</p>

                <div className="positionGrid">
                  <div>
                    <span>Position X</span>
                    <strong>{Math.round(selectedBubble.x)}</strong>
                  </div>
                  <div>
                    <span>Position Y</span>
                    <strong>{Math.round(selectedBubble.y)}</strong>
                  </div>
                </div>

                <div className="selectedActions">
                  <button onClick={() => setBubbleVisible(selectedBubble.id, true)}>
                    Afficher
                  </button>
                  <button onClick={() => setBubbleVisible(selectedBubble.id, false)}>
                    Masquer
                  </button>

                  {selectedBubble.isCustom ? (
                    <button
                      className="dangerButton"
                      onClick={() => deleteCustomBubble(selectedBubble.id)}
                    >
                      Supprimer
                    </button>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="empty">Aucune bulle sélectionnée.</p>
            )}
          </div>

          <div className="panelBlock">
            <p className="panelLabel">Ajouter une bulle libre</p>

            <div className="addBubbleGrid">
              <select
                value={newBubbleFamily}
                onChange={(event) =>
                  setNewBubbleFamily(event.target.value as BubbleFamily)
                }
              >
                <option value="METIER">Métier</option>
                <option value="OUTIL">Outil</option>
                <option value="SIMULATION">Métier SIM</option>
              </select>

              <select
                value={newBubbleValue}
                onChange={(event) => setNewBubbleValue(event.target.value)}
              >
                {newBubbleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <button onClick={addCustomBubble}>Ajouter</button>
            </div>

            <p className="hint">
              Les bulles ajoutées sont indépendantes. Tu peux donc ajouter plusieurs
              fois CATIA, BE, ANSA, Inj_c, etc.
            </p>
          </div>

          <div className="panelBlock">
            <p className="panelLabel">Bibliothèque des bulles</p>

            <div className="bubbleList">
              {filteredBubbles.length === 0 ? (
                <p className="empty">Aucune bulle ne correspond aux filtres.</p>
              ) : (
                filteredBubbles.map((bubble) => (
                  <div
                    key={bubble.id}
                    className={
                      bubble.id === selectedBubbleId
                        ? "bubbleListItem bubbleListItemSelected"
                        : "bubbleListItem"
                    }
                  >
                    <button
                      className="bubbleListMain"
                      onClick={() => setSelectedBubbleId(bubble.id)}
                    >
                      <span
                        className="bubbleListDot"
                        style={{ background: bubble.color }}
                      />
                      <span>
                        <strong>{bubble.label}</strong>
                        <small>{bubble.subtitle}</small>
                      </span>
                    </button>

                    <label className="visibilityToggle">
                      <input
                        type="checkbox"
                        checked={bubble.visible}
                        onChange={(event) =>
                          setBubbleVisible(bubble.id, event.target.checked)
                        }
                      />
                      <span>{bubble.visible ? "Visible" : "Masquée"}</span>
                    </label>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="panelBlock">
            <p className="panelLabel">Lecture V0.3</p>

            <ul className="readingList">
              <li>
                <strong>Cadres fixes</strong> : Pièce, HP et GPE.
              </li>
              <li>
                <strong>Repères fixes</strong> : LOD1, LOD2, LOD3 sur la gauche.
              </li>
              <li>
                <strong>Bulles libres</strong> : métiers, outils et métiers simulation.
              </li>
              <li>
                <strong>Affichage libre</strong> : chaque bulle peut être visible ou masquée.
              </li>
              <li>
                <strong>Placement libre</strong> : chaque bulle peut être déplacée où tu veux.
              </li>
              <li>
                <strong>Contour jaune</strong> : bulle repositionnée manuellement.
              </li>
            </ul>
          </div>
        </aside>
      </section>

      <style jsx>{`
        .viewerPage {
          min-height: 100vh;
          background:
            radial-gradient(circle at 20% 18%, rgba(14, 165, 233, 0.16), transparent 30%),
            radial-gradient(circle at 78% 12%, rgba(168, 85, 247, 0.14), transparent 28%),
            #020617;
          color: #e5e7eb;
          padding: 22px;
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
        }

        .topbar {
          display: flex;
          justify-content: space-between;
          gap: 18px;
          align-items: flex-start;
          margin-bottom: 18px;
        }

        .eyebrow {
          margin: 0 0 6px 0;
          color: #93c5fd;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          font-weight: 800;
        }

        h1 {
          margin: 0;
          font-size: 25px;
          line-height: 1.2;
          font-weight: 780;
          color: #f8fafc;
        }

        .toolbar {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 8px;
          max-width: 1220px;
        }

        .toolbar input,
        .toolbar select,
        .toolbar button,
        .addBubbleGrid select,
        .addBubbleGrid button,
        .selectedActions button {
          border: 1px solid rgba(148, 163, 184, 0.28);
          background: rgba(15, 23, 42, 0.84);
          color: #e5e7eb;
          border-radius: 12px;
          padding: 10px 11px;
          font-size: 13px;
          outline: none;
        }

        .toolbar input {
          width: 210px;
        }

        .toolbar button,
        .addBubbleGrid button,
        .selectedActions button {
          cursor: pointer;
          font-weight: 800;
          background: rgba(37, 99, 235, 0.34);
        }

        .toolbar .activeButton {
          background: rgba(250, 204, 21, 0.28);
          border-color: rgba(250, 204, 21, 0.55);
          color: #fef9c3;
        }

        .layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 410px;
          gap: 18px;
          align-items: stretch;
        }

        .graphCard {
          min-height: 790px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 24px;
          overflow: hidden;
          background:
            linear-gradient(rgba(148, 163, 184, 0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(148, 163, 184, 0.04) 1px, transparent 1px),
            rgba(2, 6, 23, 0.76);
          background-size: 34px 34px;
          box-shadow: 0 18px 60px rgba(0, 0, 0, 0.28);
        }

        .graphSvg {
          width: 100%;
          height: 100%;
          min-height: 790px;
          display: block;
          touch-action: none;
        }

        .graphSvgMove {
          cursor: grab;
        }

        .pillarFrame {
          fill: rgba(15, 23, 42, 0.22);
          stroke-width: 1.8;
          stroke-opacity: 0.48;
          stroke-dasharray: 10 8;
        }

        .pillarTitle {
          fill: rgba(248, 250, 252, 0.88);
          font-size: 21px;
          font-weight: 900;
          letter-spacing: 0.05em;
        }

        .lodBand {
          fill: rgba(15, 23, 42, 0.16);
          stroke: rgba(148, 163, 184, 0.08);
          stroke-width: 1;
        }

        .lodSeparator {
          stroke: rgba(226, 232, 240, 0.1);
          stroke-width: 1.2;
          stroke-dasharray: 8 10;
        }

        .lodMainLabel {
          fill: #f8fafc;
          font-size: 22px;
          font-weight: 900;
        }

        .lodSubLabel {
          fill: #94a3b8;
          font-size: 13px;
          font-weight: 700;
        }

        .bubbleGroup {
          cursor: pointer;
          transition: opacity 0.16s ease;
        }

        .bubbleGroupMove {
          cursor: grab;
        }

        .bubbleGroupMove:active {
          cursor: grabbing;
        }

        .bubbleText {
          fill: #020617;
          font-size: 12px;
          font-weight: 900;
          pointer-events: none;
          letter-spacing: -0.01em;
        }

        .sidePanel {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .panelBlock {
          border: 1px solid rgba(148, 163, 184, 0.2);
          background: rgba(15, 23, 42, 0.84);
          border-radius: 22px;
          padding: 16px;
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.25);
        }

        .panelLabel {
          margin: 0 0 12px 0;
          font-size: 11px;
          font-weight: 850;
          color: #93c5fd;
          text-transform: uppercase;
          letter-spacing: 0.13em;
        }

        .selectedHeader {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          margin-bottom: 12px;
        }

        .dot {
          width: 13px;
          height: 13px;
          border-radius: 999px;
          margin-top: 6px;
          box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.06);
        }

        .selectedHeader h2 {
          margin: 0;
          font-size: 18px;
          line-height: 1.25;
          color: #f8fafc;
        }

        .selectedHeader p {
          margin: 4px 0 0 0;
          color: #94a3b8;
          font-size: 13px;
        }

        .description {
          color: #cbd5e1;
          font-size: 13px;
          line-height: 1.55;
          margin: 0 0 14px 0;
        }

        .positionGrid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-bottom: 10px;
        }

        .positionGrid div {
          border: 1px solid rgba(148, 163, 184, 0.16);
          border-radius: 14px;
          padding: 11px;
          background: rgba(2, 6, 23, 0.45);
        }

        .positionGrid span {
          display: block;
          color: #94a3b8;
          font-size: 11px;
          margin-bottom: 4px;
        }

        .positionGrid strong {
          font-size: 15px;
          color: #f8fafc;
        }

        .selectedActions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .selectedActions .dangerButton {
          background: rgba(220, 38, 38, 0.32);
          border-color: rgba(248, 113, 113, 0.42);
        }

        .addBubbleGrid {
          display: grid;
          grid-template-columns: 1fr 1fr auto;
          gap: 8px;
        }

        .hint {
          color: #94a3b8;
          margin: 10px 0 0 0;
          font-size: 12.5px;
          line-height: 1.45;
        }

        .bubbleList {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 340px;
          overflow: auto;
          padding-right: 4px;
        }

        .bubbleListItem {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px;
          align-items: center;
          border: 1px solid rgba(148, 163, 184, 0.16);
          background: rgba(2, 6, 23, 0.42);
          border-radius: 14px;
          padding: 9px;
        }

        .bubbleListItemSelected {
          border-color: rgba(250, 204, 21, 0.55);
          background: rgba(113, 63, 18, 0.22);
        }

        .bubbleListMain {
          display: flex;
          align-items: center;
          gap: 9px;
          border: 0;
          background: transparent;
          color: #e5e7eb;
          padding: 0;
          text-align: left;
          cursor: pointer;
        }

        .bubbleListDot {
          width: 12px;
          height: 12px;
          border-radius: 999px;
          flex: 0 0 auto;
        }

        .bubbleListMain strong {
          display: block;
          font-size: 13px;
          color: #f8fafc;
        }

        .bubbleListMain small {
          display: block;
          color: #94a3b8;
          font-size: 12px;
        }

        .visibilityToggle {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #cbd5e1;
          font-size: 12px;
          white-space: nowrap;
        }

        .visibilityToggle input {
          accent-color: #38bdf8;
        }

        .empty {
          color: #94a3b8;
          margin: 0;
          font-size: 13px;
        }

        .readingList {
          margin: 0;
          padding-left: 18px;
          color: #cbd5e1;
          font-size: 13px;
          line-height: 1.55;
        }

        .readingList strong {
          color: #f8fafc;
        }

        @media (max-width: 1240px) {
          .topbar {
            flex-direction: column;
          }

          .toolbar {
            justify-content: flex-start;
          }

          .layout {
            grid-template-columns: 1fr;
          }

          .addBubbleGrid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}
