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

type BeSubTrade =
  | "BE_AERO"
  | "BE_MECA"
  | "BE_THER"
  | "BE_SIM_DIM"
  | "BE_SIM_METAL";

type BmSubTrade = "BM_OUT" | "BM_CAO";

type SimSubTrade =
  | "SIM_INJ_C"
  | "SIM_INJ_N"
  | "SIM_PRE_CHAU"
  | "SIM_SDF";

type BubbleFamily =
  | "METIER"
  | "BE_SUB"
  | "BM_SUB"
  | "SIMULATION"
  | "OUTIL";

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
  lod: LOD;
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
  deleted?: boolean;
};

const WIDTH = 1600;
const HEIGHT = 980;

const LS_BUBBLE_OVERRIDES = "plm_free_bubbles_lod_tabs_subtrades_overrides_v1";
const LS_CUSTOM_BUBBLES = "plm_free_custom_bubbles_lod_tabs_subtrades_v1";

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

const BE_SUB_TRADES: BeSubTrade[] = [
  "BE_AERO",
  "BE_MECA",
  "BE_THER",
  "BE_SIM_DIM",
  "BE_SIM_METAL",
];

const BM_SUB_TRADES: BmSubTrade[] = ["BM_OUT", "BM_CAO"];

const SIM_SUB_TRADES: SimSubTrade[] = [
  "SIM_INJ_C",
  "SIM_INJ_N",
  "SIM_PRE_CHAU",
  "SIM_SDF",
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

const BE_SUB_TRADE_LABELS: Record<BeSubTrade, string> = {
  BE_AERO: "Aéro",
  BE_MECA: "Méca",
  BE_THER: "Ther",
  BE_SIM_DIM: "Sim_dim",
  BE_SIM_METAL: "Sim_métal",
};

const BM_SUB_TRADE_LABELS: Record<BmSubTrade, string> = {
  BM_OUT: "Out",
  BM_CAO: "CAO",
};

const SIM_SUB_TRADE_LABELS: Record<SimSubTrade, string> = {
  SIM_INJ_C: "Inj_C",
  SIM_INJ_N: "Inj_N",
  SIM_PRE_CHAU: "Pré_chau",
  SIM_SDF: "Sdf",
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
  BE_SUB: "#60a5fa",
  BM_SUB: "#f59e0b",
  SIMULATION: "#a78bfa",
  OUTIL: "#38bdf8",
};

const PILLAR_COLORS: Record<Pillar, string> = {
  PIECE: "#38bdf8",
  HP: "#facc15",
  GPE: "#c084fc",
};

const PILLAR_FRAMES: Record<
  Pillar,
  { x: number; y: number; w: number; h: number }
> = {
  PIECE: { x: 170, y: 185, w: 400, h: 690 },
  HP: { x: 600, y: 185, w: 400, h: 690 },
  GPE: { x: 1030, y: 185, w: 400, h: 690 },
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function labelForFamilyValue(family: BubbleFamily, value: string) {
  if (family === "METIER") return value;
  if (family === "OUTIL") return TOOL_LABELS[value as ToolName];
  if (family === "BE_SUB") return BE_SUB_TRADE_LABELS[value as BeSubTrade];
  if (family === "BM_SUB") return BM_SUB_TRADE_LABELS[value as BmSubTrade];
  return SIM_SUB_TRADE_LABELS[value as SimSubTrade];
}

function colorForFamilyValue(family: BubbleFamily, value: string) {
  if (family === "METIER") return ENTITY_COLORS[value as Entity];
  return FAMILY_COLORS[family];
}

function subtitleForFamilyValue(family: BubbleFamily, lod: LOD) {
  if (family === "METIER") return `${lod} · Métier`;
  if (family === "OUTIL") return `${lod} · Outil`;
  if (family === "BE_SUB") return `${lod} · Sous-métier BE`;
  if (family === "BM_SUB") return `${lod} · Sous-métier BM`;
  return `${lod} · Sous-métier SIM`;
}

function descriptionForFamilyValue(
  family: BubbleFamily,
  value: string,
  lod: LOD
) {
  const label = labelForFamilyValue(family, value);

  if (family === "METIER") {
    return `Bulle métier libre : ${label}. Elle appartient à l’onglet ${lod} et peut être placée manuellement dans le cadre Pièce, HP ou GPE.`;
  }

  if (family === "OUTIL") {
    return `Bulle outil libre : ${label}. Elle appartient à l’onglet ${lod} et peut être placée dans la zone où l’outil intervient dans ton architecture.`;
  }

  if (family === "BE_SUB") {
    return `Sous-métier BE : ${label}. Cette bulle appartient à l’onglet ${lod} et peut être positionnée dans Pièce, HP ou GPE selon son rôle dans le processus.`;
  }

  if (family === "BM_SUB") {
    return `Sous-métier BM : ${label}. Cette bulle appartient à l’onglet ${lod} et peut être positionnée dans Pièce, HP ou GPE selon son rôle méthodes.`;
  }

  return `Sous-métier SIM : ${label}. Cette bulle appartient à l’onglet ${lod} et peut être positionnée dans Pièce, HP ou GPE selon son rôle simulation.`;
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

  if (family === "BE_SUB") {
    return BE_SUB_TRADES.map((subTrade) => ({
      value: subTrade,
      label: BE_SUB_TRADE_LABELS[subTrade],
    }));
  }

  if (family === "BM_SUB") {
    return BM_SUB_TRADES.map((subTrade) => ({
      value: subTrade,
      label: BM_SUB_TRADE_LABELS[subTrade],
    }));
  }

  return SIM_SUB_TRADES.map((subTrade) => ({
    value: subTrade,
    label: SIM_SUB_TRADE_LABELS[subTrade],
  }));
}

function bubbleWidth(label: string) {
  return clamp(label.length * 8 + 42, 70, 172);
}

function getToolInitialBubblePosition(index: number): Position {
  const col = index % 5;
  const row = Math.floor(index / 5);

  return {
    x: 1130 + col * 72,
    y: 260 + row * 48,
  };
}

function buildDefaultBubbles(): Bubble[] {
  const bubbles: Bubble[] = [];

  for (const lod of LODS) {
    for (const pillar of PILLARS) {
      const frame = PILLAR_FRAMES[pillar];

      ENTITIES.forEach((entity, index) => {
        bubbles.push({
          id: `${lod}_${pillar}_${entity}`,
          label: entity,
          subtitle: `${LOD_LABELS[lod]} · ${PILLAR_LABELS[pillar]}`,
          family: "METIER",
          pillar,
          lod,
          x: frame.x + 65 + index * 68,
          y: frame.y + 95,
          color: ENTITY_COLORS[entity],
          description: `${entity} associé par défaut au pilier ${PILLAR_LABELS[pillar]} dans l’onglet ${lod}. Cette bulle reste librement déplaçable.`,
          visibleDefault: true,
        });
      });

      BE_SUB_TRADES.forEach((subTrade, index) => {
        bubbles.push({
          id: `${lod}_${pillar}_BE_SUB_${subTrade}`,
          label: BE_SUB_TRADE_LABELS[subTrade],
          subtitle: `${LOD_LABELS[lod]} · ${PILLAR_LABELS[pillar]} · BE`,
          family: "BE_SUB",
          pillar,
          lod,
          x: frame.x + 58 + index * 78,
          y: frame.y + 165,
          color: FAMILY_COLORS.BE_SUB,
          description: `Sous-métier BE ${BE_SUB_TRADE_LABELS[subTrade]} disponible pour ${PILLAR_LABELS[pillar]} dans l’onglet ${lod}.`,
          visibleDefault: false,
        });
      });

      BM_SUB_TRADES.forEach((subTrade, index) => {
        bubbles.push({
          id: `${lod}_${pillar}_BM_SUB_${subTrade}`,
          label: BM_SUB_TRADE_LABELS[subTrade],
          subtitle: `${LOD_LABELS[lod]} · ${PILLAR_LABELS[pillar]} · BM`,
          family: "BM_SUB",
          pillar,
          lod,
          x: frame.x + 110 + index * 95,
          y: frame.y + 225,
          color: FAMILY_COLORS.BM_SUB,
          description: `Sous-métier BM ${BM_SUB_TRADE_LABELS[subTrade]} disponible pour ${PILLAR_LABELS[pillar]} dans l’onglet ${lod}.`,
          visibleDefault: false,
        });
      });

      SIM_SUB_TRADES.forEach((subTrade, index) => {
        bubbles.push({
          id: `${lod}_${pillar}_SIM_SUB_${subTrade}`,
          label: SIM_SUB_TRADE_LABELS[subTrade],
          subtitle: `${LOD_LABELS[lod]} · ${PILLAR_LABELS[pillar]} · SIM`,
          family: "SIMULATION",
          pillar,
          lod,
          x: frame.x + 74 + index * 82,
          y: frame.y + 285,
          color: FAMILY_COLORS.SIMULATION,
          description: `Sous-métier SIM ${SIM_SUB_TRADE_LABELS[subTrade]} disponible pour ${PILLAR_LABELS[pillar]} dans l’onglet ${lod}.`,
          visibleDefault: false,
        });
      });
    }

    TOOLS.forEach((tool, index) => {
      const position = getToolInitialBubblePosition(index);

      bubbles.push({
        id: `${lod}_TOOL_${tool}`,
        label: TOOL_LABELS[tool],
        subtitle: `${LOD_LABELS[lod]} · Outil libre`,
        family: "OUTIL",
        lod,
        x: position.x,
        y: position.y,
        color: FAMILY_COLORS.OUTIL,
        description: `Outil ${TOOL_LABELS[tool]} disponible comme bulle libre dans l’onglet ${lod}. Tu peux l’afficher, le déplacer et le placer dans la zone souhaitée.`,
        visibleDefault: false,
      });
    });
  }

  return bubbles;
}

export default function ViewerPage() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const draggingBubbleIdRef = useRef<string | null>(null);
  const dragOffsetRef = useRef<Position>({ x: 0, y: 0 });
  const storageLoadedRef = useRef(false);

  const defaultBubbles = useMemo(() => buildDefaultBubbles(), []);

  const [activeLod, setActiveLod] = useState<LOD>("LOD1");

  const [customBubbles, setCustomBubbles] = useState<Bubble[]>([]);
  const [bubbleOverrides, setBubbleOverrides] = useState<
    Record<string, BubbleOverride>
  >({});

  const [selectedBubbleId, setSelectedBubbleId] = useState<string>(
    "LOD1_PIECE_BE"
  );

  const [moveEnabled, setMoveEnabled] = useState(true);
  const [search, setSearch] = useState("");
  const [familyFilter, setFamilyFilter] = useState<BubbleFamily | "ALL">("ALL");
  const [pillarFilter, setPillarFilter] = useState<Pillar | "ALL">("ALL");

  const [newBubbleFamily, setNewBubbleFamily] =
    useState<BubbleFamily>("METIER");
  const [newBubbleValue, setNewBubbleValue] = useState<string>("BE");

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
        deleted: override?.deleted ?? false,
      };
    });
  }, [allBaseBubbles, bubbleOverrides]);

  useEffect(() => {
    try {
      const rawOverrides = window.localStorage.getItem(LS_BUBBLE_OVERRIDES);
      const rawCustomBubbles = window.localStorage.getItem(LS_CUSTOM_BUBBLES);

      if (rawOverrides) {
        setBubbleOverrides(
          JSON.parse(rawOverrides) as Record<string, BubbleOverride>
        );
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

  function changeActiveLod(nextLod: LOD) {
    setActiveLod(nextLod);

    const firstVisibleBubbleForLod = bubbles.find(
      (bubble) => bubble.lod === nextLod && !bubble.deleted && bubble.visible
    );

    const firstAvailableBubbleForLod = bubbles.find(
      (bubble) => bubble.lod === nextLod && !bubble.deleted
    );

    setSelectedBubbleId(
      firstVisibleBubbleForLod?.id ??
        firstAvailableBubbleForLod?.id ??
        `${nextLod}_PIECE_BE`
    );
  }

  const activeLodBubbles = useMemo(() => {
    return bubbles.filter((bubble) => bubble.lod === activeLod && !bubble.deleted);
  }, [bubbles, activeLod]);

  const selectedBubble = useMemo(() => {
    return bubbles.find(
      (bubble) => bubble.id === selectedBubbleId && !bubble.deleted
    );
  }, [bubbles, selectedBubbleId]);

  const filteredBubbles = useMemo(() => {
    const searchValue = search.toLowerCase().trim();

    return activeLodBubbles.filter((bubble) => {
      const matchSearch =
        searchValue.length === 0 ||
        bubble.label.toLowerCase().includes(searchValue) ||
        bubble.subtitle.toLowerCase().includes(searchValue) ||
        bubble.description.toLowerCase().includes(searchValue) ||
        bubble.family.toLowerCase().includes(searchValue);

      const matchFamily =
        familyFilter === "ALL" || bubble.family === familyFilter;

      const matchPillar =
        pillarFilter === "ALL" || bubble.pillar === pillarFilter || !bubble.pillar;

      return matchSearch && matchFamily && matchPillar;
    });
  }, [activeLodBubbles, search, familyFilter, pillarFilter]);

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
    bubble: Bubble & { visible: boolean; deleted: boolean }
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

  function setFilteredBubblesVisibility(visible: boolean) {
    setBubbleOverrides((previous) => {
      const next = { ...previous };

      for (const bubble of filteredBubbles) {
        next[bubble.id] = {
          ...next[bubble.id],
          visible,
        };
      }

      return next;
    });
  }

  function showFilteredBubbles() {
    setFilteredBubblesVisibility(true);
  }

  function hideFilteredBubbles() {
    setFilteredBubblesVisibility(false);
  }

  function addCustomBubble() {
    const label = labelForFamilyValue(newBubbleFamily, newBubbleValue);
    const color = colorForFamilyValue(newBubbleFamily, newBubbleValue);
    const index = customBubbles.filter((bubble) => bubble.lod === activeLod).length;

    const id = `CUSTOM_${activeLod}_${Date.now()}_${Math.round(
      Math.random() * 100000
    )}`;

    const bubble: Bubble = {
      id,
      label,
      subtitle: subtitleForFamilyValue(newBubbleFamily, activeLod),
      family: newBubbleFamily,
      lod: activeLod,
      x: 1460,
      y: 205 + (index % 12) * 48,
      color,
      description: descriptionForFamilyValue(
        newBubbleFamily,
        newBubbleValue,
        activeLod
      ),
      visibleDefault: true,
      isCustom: true,
    };

    setCustomBubbles((previous) => [...previous, bubble]);
    setSelectedBubbleId(id);
  }

  function deleteBubble(bubbleId: string) {
    const bubble = bubbles.find((item) => item.id === bubbleId);

    if (!bubble) return;

    if (bubble.isCustom) {
      setCustomBubbles((previous) =>
        previous.filter((item) => item.id !== bubbleId)
      );

      setBubbleOverrides((previous) => {
        const next = { ...previous };
        delete next[bubbleId];
        return next;
      });
    } else {
      setBubbleOverrides((previous) => ({
        ...previous,
        [bubbleId]: {
          ...previous[bubbleId],
          visible: false,
          deleted: true,
        },
      }));
    }

    if (selectedBubbleId === bubbleId) {
      setSelectedBubbleId("");
    }
  }

  function deleteFilteredBubbles() {
    const idsToDelete = filteredBubbles.map((bubble) => bubble.id);
    const idsToDeleteSet = new Set(idsToDelete);

    setCustomBubbles((previous) =>
      previous.filter((bubble) => !idsToDeleteSet.has(bubble.id))
    );

    setBubbleOverrides((previous) => {
      const next = { ...previous };

      for (const bubble of filteredBubbles) {
        if (bubble.isCustom) {
          delete next[bubble.id];
        } else {
          next[bubble.id] = {
            ...next[bubble.id],
            visible: false,
            deleted: true,
          };
        }
      }

      return next;
    });

    if (idsToDeleteSet.has(selectedBubbleId)) {
      setSelectedBubbleId("");
    }
  }

  function resetPositionsForActiveLod() {
    setBubbleOverrides((previous) => {
      const next: Record<string, BubbleOverride> = {};

      for (const [bubbleId, override] of Object.entries(previous)) {
        const bubble = bubbles.find((item) => item.id === bubbleId);

        if (!bubble) {
          next[bubbleId] = override;
          continue;
        }

        if (bubble.lod !== activeLod) {
          next[bubbleId] = override;
          continue;
        }

        if (override.visible !== undefined || override.deleted !== undefined) {
          next[bubbleId] = {
            visible: override.visible,
            deleted: override.deleted,
          };
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
    setActiveLod("LOD1");
    setSelectedBubbleId("LOD1_PIECE_BE");

    window.localStorage.removeItem(LS_BUBBLE_OVERRIDES);
    window.localStorage.removeItem(LS_CUSTOM_BUBBLES);
  }

  const newBubbleOptions = getOptionsForFamily(newBubbleFamily);

  const activeLodVisibleCount = activeLodBubbles.filter(
    (bubble) => bubble.visible
  ).length;
  const activeLodTotalCount = activeLodBubbles.length;

  return (
    <main className="viewerPage">
      <section className="topbar">
        <div>
          <p className="eyebrow">Mini-PLM · Viewer libre V0.5</p>
          <h1>Placement libre par LOD avec sous-métiers BE / BM / SIM</h1>
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
            <option value="BE_SUB">Sous-métiers BE</option>
            <option value="BM_SUB">Sous-métiers BM</option>
            <option value="SIMULATION">Sous-métiers SIM</option>
            <option value="OUTIL">Outils</option>
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

          <button
            className={moveEnabled ? "activeButton" : ""}
            onClick={() => setMoveEnabled((current) => !current)}
          >
            {moveEnabled ? "Déplacement actif" : "Déplacement verrouillé"}
          </button>

          <button onClick={showFilteredBubbles}>Afficher sélection</button>
          <button onClick={hideFilteredBubbles}>Masquer sélection</button>
          <button onClick={resetPositionsForActiveLod}>Réinit. positions LOD</button>
          <button onClick={resetEverything}>Réinit. total</button>
        </div>
      </section>

      <section className="lodTabs">
        {LODS.map((lod) => {
          const lodBubbles = bubbles.filter(
            (bubble) => bubble.lod === lod && !bubble.deleted
          );
          const visibleCount = lodBubbles.filter((bubble) => bubble.visible).length;

          return (
            <button
              key={lod}
              className={activeLod === lod ? "lodTab lodTabActive" : "lodTab"}
              onClick={() => changeActiveLod(lod)}
            >
              <strong>{LOD_LABELS[lod]}</strong>
              <span>{LOD_DETAILS[lod]}</span>
              <em>
                {visibleCount}/{lodBubbles.length} visibles
              </em>
            </button>
          );
        })}
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
              <filter
                id="bubbleGlow"
                x="-60%"
                y="-80%"
                width="220%"
                height="260%"
              >
                <feGaussianBlur stdDeviation="3.8" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <rect
              x={120}
              y={145}
              width={1350}
              height={755}
              rx={28}
              className="activeLodBand"
            />

            <text x={55} y={478} className="lodMainLabel">
              {LOD_LABELS[activeLod]}
            </text>

            <text x={55} y={506} className="lodSubLabel">
              {LOD_DETAILS[activeLod]}
            </text>

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
                  className={
                    moveEnabled ? "bubbleGroup bubbleGroupMove" : "bubbleGroup"
                  }
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
                      selected
                        ? "#ffffff"
                        : hasCustomPosition
                          ? "#facc15"
                          : "rgba(255,255,255,0.28)"
                    }
                    strokeWidth={selected ? 3.2 : hasCustomPosition ? 2.6 : 1.6}
                  />

                  <circle
                    cx={-width / 2 + 18}
                    cy={0}
                    r={5.5}
                    fill="rgba(15,23,42,0.72)"
                  />

                  <text x={-width / 2 + 32} y={4.5} className="bubbleText">
                    {bubble.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <aside className="sidePanel">
          <div className="panelBlock">
            <p className="panelLabel">Onglet actif</p>

            <div className="lodStatusCard">
              <strong>{LOD_LABELS[activeLod]}</strong>
              <span>{LOD_DETAILS[activeLod]}</span>
              <em>
                {activeLodVisibleCount}/{activeLodTotalCount} bulles visibles
              </em>
            </div>
          </div>

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
                  <button
                    className="dangerButton"
                    onClick={() => deleteBubble(selectedBubble.id)}
                  >
                    Supprimer
                  </button>
                </div>
              </>
            ) : (
              <p className="empty">Aucune bulle sélectionnée.</p>
            )}
          </div>

          <div className="panelBlock">
            <p className="panelLabel">Ajouter une bulle libre dans {activeLod}</p>

            <div className="addBubbleGrid">
              <select
                value={newBubbleFamily}
                onChange={(event) =>
                  setNewBubbleFamily(event.target.value as BubbleFamily)
                }
              >
                <option value="METIER">Métier</option>
                <option value="BE_SUB">Sous-métier BE</option>
                <option value="BM_SUB">Sous-métier BM</option>
                <option value="SIMULATION">Sous-métier SIM</option>
                <option value="OUTIL">Outil</option>
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
              La bulle ajoutée est créée uniquement dans l’onglet {activeLod}.
              Tu peux ajouter plusieurs fois Aéro, Méca, Out, CAO, Inj_C, etc.
            </p>
          </div>

          <div className="panelBlock">
            <div className="libraryHeader">
              <div>
                <p className="panelLabel">Bibliothèque des bulles · {activeLod}</p>
                <p className="libraryCount">
                  {filteredBubbles.length} bulle(s) dans la sélection
                </p>
              </div>

              <div className="libraryActions">
                <button onClick={showFilteredBubbles}>Tout cocher</button>
                <button onClick={hideFilteredBubbles}>Tout décocher</button>
                <button className="dangerButton" onClick={deleteFilteredBubbles}>
                  Supprimer sélection
                </button>
              </div>
            </div>

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

                    <div className="bubbleListControls">
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

                      <button
                        className="miniDeleteButton"
                        onClick={() => deleteBubble(bubble.id)}
                        title="Supprimer la bulle"
                      >
                        Suppr.
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="panelBlock">
            <p className="panelLabel">Lecture V0.5</p>

            <ul className="readingList">
              <li>
                <strong>Onglets</strong> : LOD1, LOD2 et LOD3 séparés.
              </li>
              <li>
                <strong>Cadres fixes</strong> : Pièce, HP et GPE conservés dans chaque onglet.
              </li>
              <li>
                <strong>Sous-métiers BE</strong> : Aéro, Méca, Ther, Sim_dim, Sim_métal.
              </li>
              <li>
                <strong>Sous-métiers BM</strong> : Out, CAO.
              </li>
              <li>
                <strong>Sous-métiers SIM</strong> : Inj_C, Inj_N, Pré_chau, Sdf.
              </li>
              <li>
                <strong>Placement</strong> : positions sauvegardées séparément pour chaque LOD.
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
          margin-bottom: 16px;
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
        .selectedActions button,
        .libraryActions button,
        .miniDeleteButton {
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
        .selectedActions button,
        .libraryActions button,
        .miniDeleteButton {
          cursor: pointer;
          font-weight: 800;
          background: rgba(37, 99, 235, 0.34);
        }

        .toolbar .activeButton {
          background: rgba(250, 204, 21, 0.28);
          border-color: rgba(250, 204, 21, 0.55);
          color: #fef9c3;
        }

        .dangerButton,
        .selectedActions .dangerButton,
        .libraryActions .dangerButton {
          background: rgba(220, 38, 38, 0.32);
          border-color: rgba(248, 113, 113, 0.42);
        }

        .lodTabs {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 16px;
        }

        .lodTab {
          border: 1px solid rgba(148, 163, 184, 0.22);
          background: rgba(15, 23, 42, 0.74);
          color: #e5e7eb;
          border-radius: 18px;
          padding: 13px 15px;
          text-align: left;
          cursor: pointer;
          display: grid;
          gap: 3px;
        }

        .lodTab strong {
          font-size: 17px;
          color: #f8fafc;
        }

        .lodTab span {
          color: #94a3b8;
          font-size: 13px;
        }

        .lodTab em {
          color: #cbd5e1;
          font-size: 12px;
          font-style: normal;
          margin-top: 2px;
        }

        .lodTabActive {
          border-color: rgba(56, 189, 248, 0.58);
          background: rgba(14, 165, 233, 0.18);
          box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.16) inset;
        }

        .layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 430px;
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

        .activeLodBand {
          fill: rgba(15, 23, 42, 0.16);
          stroke: rgba(148, 163, 184, 0.08);
          stroke-width: 1;
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

        .lodStatusCard {
          display: grid;
          gap: 3px;
          border: 1px solid rgba(56, 189, 248, 0.22);
          background: rgba(14, 165, 233, 0.12);
          border-radius: 16px;
          padding: 12px;
        }

        .lodStatusCard strong {
          font-size: 18px;
          color: #f8fafc;
        }

        .lodStatusCard span,
        .lodStatusCard em {
          color: #cbd5e1;
          font-size: 13px;
          font-style: normal;
        }

        .libraryHeader {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 12px;
        }

        .libraryHeader .panelLabel {
          margin-bottom: 4px;
        }

        .libraryCount {
          margin: 0;
          font-size: 12px;
          color: #94a3b8;
        }

        .libraryActions {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 7px;
        }

        .libraryActions button {
          padding: 8px 9px;
          font-size: 12px;
          border-radius: 10px;
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
          max-height: 360px;
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

        .bubbleListControls {
          display: flex;
          align-items: center;
          gap: 8px;
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

        .miniDeleteButton {
          padding: 7px 8px;
          font-size: 11.5px;
          border-radius: 10px;
          background: rgba(220, 38, 38, 0.28);
          border-color: rgba(248, 113, 113, 0.35);
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

          .libraryHeader {
            flex-direction: column;
          }

          .libraryActions {
            justify-content: flex-start;
          }

          .lodTabs {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}
