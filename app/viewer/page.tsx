"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";

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
  | "OUTIL"
  | "LIBRE";

type PanelKey =
  | "ACTIVE_LOD"
  | "FRAME_RESIZE"
  | "LINK_EDITOR"
  | "SELECTED_BUBBLE"
  | "LINKS"
  | "ADD_BUBBLE"
  | "BUBBLE_LIBRARY"
  | "READING";

type Position = {
  x: number;
  y: number;
};

type PillarFrame = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type PillarFrameSize = {
  w: number;
  h: number;
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

type BubbleView = Bubble & {
  visible: boolean;
  deleted: boolean;
};

type BubbleOverride = {
  x?: number;
  y?: number;
  visible?: boolean;
  deleted?: boolean;
};

type BubbleLink = {
  id: string;
  lod: LOD;
  sourceId: string;
  targetId: string;
  label: string;
  color: string;
};

type ResolvedBubbleLink = BubbleLink & {
  source: BubbleView;
  target: BubbleView;
};

const WIDTH = 2700;
const HEIGHT = 1400;

const LS_BUBBLE_OVERRIDES = "plm_free_bubbles_lod_tabs_subtrades_overrides_v5";
const LS_CUSTOM_BUBBLES = "plm_free_custom_bubbles_lod_tabs_subtrades_v5";
const LS_BUBBLE_LINKS = "plm_free_bubble_links_v3";
const LS_PILLAR_FRAME_SIZES = "plm_pillar_frame_sizes_v1";
const LS_COLLAPSED_PANELS = "plm_sidebar_collapsed_panels_v2";

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
  LIBRE: "#facc15",
};

const PILLAR_COLORS: Record<Pillar, string> = {
  PIECE: "#38bdf8",
  HP: "#facc15",
  GPE: "#c084fc",
};

const PANEL_ICONS: Record<PanelKey, string> = {
  ACTIVE_LOD: "◉",
  FRAME_RESIZE: "□",
  LINK_EDITOR: "↔",
  SELECTED_BUBBLE: "●",
  LINKS: "⛓",
  ADD_BUBBLE: "+",
  BUBBLE_LIBRARY: "▤",
  READING: "ⓘ",
};

const DEFAULT_COLLAPSED_PANELS: Record<PanelKey, boolean> = {
  ACTIVE_LOD: false,
  FRAME_RESIZE: false,
  LINK_EDITOR: false,
  SELECTED_BUBBLE: false,
  LINKS: false,
  ADD_BUBBLE: false,
  BUBBLE_LIBRARY: false,
  READING: false,
};

const BASE_PILLAR_FRAMES: Record<Pillar, PillarFrame> = {
  PIECE: { x: 180, y: 210, w: 660, h: 950 },
  HP: { x: 890, y: 210, w: 660, h: 950 },
  GPE: { x: 1600, y: 210, w: 660, h: 950 },
};

const DEFAULT_PILLAR_FRAME_SIZES: Record<Pillar, PillarFrameSize> = {
  PIECE: { w: 660, h: 950 },
  HP: { w: 660, h: 950 },
  GPE: { w: 660, h: 950 },
};

const MIN_FRAME_WIDTH = 420;
const MAX_FRAME_WIDTH = 980;
const MIN_FRAME_HEIGHT = 600;
const MAX_FRAME_HEIGHT = 1120;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function labelForFamilyValue(family: BubbleFamily, value: string) {
  if (family === "METIER") return value;
  if (family === "OUTIL") return TOOL_LABELS[value as ToolName];
  if (family === "BE_SUB") return BE_SUB_TRADE_LABELS[value as BeSubTrade];
  if (family === "BM_SUB") return BM_SUB_TRADE_LABELS[value as BmSubTrade];
  if (family === "SIMULATION") return SIM_SUB_TRADE_LABELS[value as SimSubTrade];
  return value;
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
  if (family === "SIMULATION") return `${lod} · Sous-métier SIM`;
  return `${lod} · Bulle libre`;
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

  if (family === "SIMULATION") {
    return `Sous-métier SIM : ${label}. Cette bulle appartient à l’onglet ${lod} et peut être positionnée dans Pièce, HP ou GPE selon son rôle simulation.`;
  }

  return `Bulle libre : ${label}. Cette bulle appartient à l’onglet ${lod}, avec un texte et une couleur personnalisés.`;
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

  if (family === "SIMULATION") {
    return SIM_SUB_TRADES.map((subTrade) => ({
      value: subTrade,
      label: SIM_SUB_TRADE_LABELS[subTrade],
    }));
  }

  return [];
}

function bubbleWidth(label: string) {
  return clamp(label.length * 8 + 42, 70, 220);
}

function getToolInitialBubblePosition(index: number): Position {
  const col = index % 5;
  const row = Math.floor(index / 5);

  return {
    x: 1800 + col * 96,
    y: 340 + row * 60,
  };
}

function buildDefaultBubbles(): Bubble[] {
  const bubbles: Bubble[] = [];

  for (const lod of LODS) {
    for (const pillar of PILLARS) {
      const frame = BASE_PILLAR_FRAMES[pillar];

      ENTITIES.forEach((entity, index) => {
        bubbles.push({
          id: `${lod}_${pillar}_${entity}`,
          label: entity,
          subtitle: `${LOD_LABELS[lod]} · ${PILLAR_LABELS[pillar]}`,
          family: "METIER",
          pillar,
          lod,
          x: frame.x + 95 + index * 110,
          y: frame.y + 110,
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
          x: frame.x + 80 + index * 115,
          y: frame.y + 190,
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
          x: frame.x + 130 + index * 125,
          y: frame.y + 270,
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
          x: frame.x + 95 + index * 125,
          y: frame.y + 350,
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
  const [bubbleLinks, setBubbleLinks] = useState<BubbleLink[]>([]);

  const [pillarFrameSizes, setPillarFrameSizes] = useState<
    Record<Pillar, PillarFrameSize>
  >(DEFAULT_PILLAR_FRAME_SIZES);

  const [selectedFramePillar, setSelectedFramePillar] =
    useState<Pillar>("PIECE");

  const [showLodTabs, setShowLodTabs] = useState(true);
  const [showSidePanel, setShowSidePanel] = useState(true);

  const [collapsedPanels, setCollapsedPanels] = useState<
    Record<PanelKey, boolean>
  >(DEFAULT_COLLAPSED_PANELS);

  const [selectedBubbleId, setSelectedBubbleId] = useState<string>(
    "LOD1_PIECE_BE"
  );

  const [linkMode, setLinkMode] = useState(false);
  const [linkSelectionIds, setLinkSelectionIds] = useState<string[]>([]);

  const [moveEnabled, setMoveEnabled] = useState(true);
  const [search, setSearch] = useState("");
  const [familyFilter, setFamilyFilter] = useState<BubbleFamily | "ALL">("ALL");
  const [pillarFilter, setPillarFilter] = useState<Pillar | "ALL">("ALL");

  const [newBubbleFamily, setNewBubbleFamily] =
    useState<BubbleFamily>("METIER");
  const [newBubbleValue, setNewBubbleValue] = useState<string>("BE");
  const [freeBubbleText, setFreeBubbleText] = useState<string>("Nouvelle bulle");
  const [freeBubbleColor, setFreeBubbleColor] = useState<string>("#facc15");

  const [linkLabel, setLinkLabel] = useState<string>("Lien");
  const [linkColor, setLinkColor] = useState<string>("#cbd5e1");

  const computedPillarFrames = useMemo(() => {
    const frames = {} as Record<Pillar, PillarFrame>;

    for (const pillar of PILLARS) {
      frames[pillar] = {
        ...BASE_PILLAR_FRAMES[pillar],
        w: pillarFrameSizes[pillar].w,
        h: pillarFrameSizes[pillar].h,
      };
    }

    return frames;
  }, [pillarFrameSizes]);

  const allBaseBubbles = useMemo(() => {
    return [...defaultBubbles, ...customBubbles];
  }, [defaultBubbles, customBubbles]);

  const bubbles = useMemo<BubbleView[]>(() => {
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

  const bubbleById = useMemo(() => {
    return new Map(bubbles.map((bubble) => [bubble.id, bubble]));
  }, [bubbles]);

  useEffect(() => {
    try {
      const rawOverrides = window.localStorage.getItem(LS_BUBBLE_OVERRIDES);
      const rawCustomBubbles = window.localStorage.getItem(LS_CUSTOM_BUBBLES);
      const rawLinks = window.localStorage.getItem(LS_BUBBLE_LINKS);
      const rawFrameSizes = window.localStorage.getItem(LS_PILLAR_FRAME_SIZES);
      const rawCollapsedPanels = window.localStorage.getItem(LS_COLLAPSED_PANELS);

      if (rawOverrides) {
        setBubbleOverrides(
          JSON.parse(rawOverrides) as Record<string, BubbleOverride>
        );
      }

      if (rawCustomBubbles) {
        setCustomBubbles(JSON.parse(rawCustomBubbles) as Bubble[]);
      }

      if (rawLinks) {
        setBubbleLinks(JSON.parse(rawLinks) as BubbleLink[]);
      }

      if (rawFrameSizes) {
        setPillarFrameSizes(
          JSON.parse(rawFrameSizes) as Record<Pillar, PillarFrameSize>
        );
      }

      if (rawCollapsedPanels) {
        setCollapsedPanels({
          ...DEFAULT_COLLAPSED_PANELS,
          ...(JSON.parse(rawCollapsedPanels) as Record<PanelKey, boolean>),
        });
      }
    } catch {
      setBubbleOverrides({});
      setCustomBubbles([]);
      setBubbleLinks([]);
      setPillarFrameSizes(DEFAULT_PILLAR_FRAME_SIZES);
      setCollapsedPanels(DEFAULT_COLLAPSED_PANELS);
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
    if (!storageLoadedRef.current) return;
    window.localStorage.setItem(LS_BUBBLE_LINKS, JSON.stringify(bubbleLinks));
  }, [bubbleLinks]);

  useEffect(() => {
    if (!storageLoadedRef.current) return;
    window.localStorage.setItem(
      LS_PILLAR_FRAME_SIZES,
      JSON.stringify(pillarFrameSizes)
    );
  }, [pillarFrameSizes]);

  useEffect(() => {
    if (!storageLoadedRef.current) return;
    window.localStorage.setItem(
      LS_COLLAPSED_PANELS,
      JSON.stringify(collapsedPanels)
    );
  }, [collapsedPanels]);

  useEffect(() => {
    if (newBubbleFamily === "LIBRE") return;

    const firstOption = getOptionsForFamily(newBubbleFamily)[0];

    if (firstOption) {
      setNewBubbleValue(firstOption.value);
    }
  }, [newBubbleFamily]);

  function PanelShell({
    panelKey,
    title,
    children,
  }: {
    panelKey: PanelKey;
    title: string;
    children: ReactNode;
  }) {
    const collapsed = collapsedPanels[panelKey];

    return (
      <section className={collapsed ? "panelBlock panelBlockCollapsed" : "panelBlock"}>
        <button
          type="button"
          className="panelTitleBar"
          onClick={() =>
            setCollapsedPanels((previous) => ({
              ...previous,
              [panelKey]: !previous[panelKey],
            }))
          }
        >
          <span className="panelTitleLeft">
            <span className="panelIcon">{PANEL_ICONS[panelKey]}</span>
            <span className="panelTitleText">{title}</span>
          </span>

          <span className="windowControls">
            <span className="windowControlDot windowControlRed" />
            <span className="windowControlDot windowControlYellow" />
            <span className="windowControlDot windowControlGreen" />
            <span className="windowMinimizeButton">
              {collapsed ? "▢" : "—"}
            </span>
          </span>
        </button>

        {!collapsed ? <div className="panelBody">{children}</div> : null}
      </section>
    );
  }

  function changeActiveLod(nextLod: LOD) {
    setActiveLod(nextLod);
    setLinkSelectionIds([]);

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
    return bubbles.filter(
      (bubble) => bubble.lod === activeLod && !bubble.deleted
    );
  }, [bubbles, activeLod]);

  const selectedBubble = useMemo(() => {
    return bubbles.find(
      (bubble) => bubble.id === selectedBubbleId && !bubble.deleted
    );
  }, [bubbles, selectedBubbleId]);

  const selectedLinkBubbles = useMemo(() => {
    return linkSelectionIds
      .map((id) => bubbleById.get(id))
      .filter((bubble): bubble is BubbleView => {
        return Boolean(bubble && !bubble.deleted && bubble.lod === activeLod);
      });
  }, [linkSelectionIds, bubbleById, activeLod]);

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

  const activeLodLinks = useMemo<ResolvedBubbleLink[]>(() => {
    const resolvedLinks: ResolvedBubbleLink[] = [];

    for (const link of bubbleLinks) {
      if (link.lod !== activeLod) continue;

      const source = bubbleById.get(link.sourceId);
      const target = bubbleById.get(link.targetId);

      if (!source || !target) continue;
      if (source.deleted || target.deleted) continue;

      resolvedLinks.push({
        ...link,
        source,
        target,
      });
    }

    return resolvedLinks;
  }, [bubbleLinks, bubbleById, activeLod]);

  const visibleLinks = useMemo(() => {
    return activeLodLinks.filter(
      (link) => link.source.visible && link.target.visible
    );
  }, [activeLodLinks]);

  const selectedPairExistingLinks = useMemo(() => {
    if (selectedLinkBubbles.length !== 2) return [];

    const [first, second] = selectedLinkBubbles;

    return activeLodLinks.filter((link) => {
      const sameDirection =
        link.sourceId === first.id && link.targetId === second.id;
      const reverseDirection =
        link.sourceId === second.id && link.targetId === first.id;

      return sameDirection || reverseDirection;
    });
  }, [selectedLinkBubbles, activeLodLinks]);

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

  function addBubbleToLinkSelection(bubbleId: string) {
    const bubble = bubbleById.get(bubbleId);

    if (!bubble || bubble.deleted || bubble.lod !== activeLod) return;

    setLinkSelectionIds((previous) => {
      if (previous.includes(bubbleId)) {
        return previous;
      }

      if (previous.length === 0) {
        return [bubbleId];
      }

      if (previous.length === 1) {
        return [previous[0], bubbleId];
      }

      return [previous[1], bubbleId];
    });
  }

  function handleBubbleClick(
    event: ReactMouseEvent<SVGGElement>,
    bubble: BubbleView
  ) {
    event.preventDefault();
    event.stopPropagation();

    setSelectedBubbleId(bubble.id);
    addBubbleToLinkSelection(bubble.id);
  }

  function handleLibraryBubbleClick(bubbleId: string) {
    setSelectedBubbleId(bubbleId);
    addBubbleToLinkSelection(bubbleId);
  }

  function startDragBubble(
    event: ReactPointerEvent<SVGGElement>,
    bubble: BubbleView
  ) {
    setSelectedBubbleId(bubble.id);
    addBubbleToLinkSelection(bubble.id);

    if (linkMode) return;
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

    if (!draggingBubbleId || !moveEnabled || linkMode) return;

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

  function updatePillarFrameSize(
    pillar: Pillar,
    key: keyof PillarFrameSize,
    value: number
  ) {
    setPillarFrameSizes((previous) => ({
      ...previous,
      [pillar]: {
        ...previous[pillar],
        [key]:
          key === "w"
            ? clamp(value, MIN_FRAME_WIDTH, MAX_FRAME_WIDTH)
            : clamp(value, MIN_FRAME_HEIGHT, MAX_FRAME_HEIGHT),
      },
    }));
  }

  function adjustSelectedPillarFrame(deltaW: number, deltaH: number) {
    setPillarFrameSizes((previous) => ({
      ...previous,
      [selectedFramePillar]: {
        w: clamp(
          previous[selectedFramePillar].w + deltaW,
          MIN_FRAME_WIDTH,
          MAX_FRAME_WIDTH
        ),
        h: clamp(
          previous[selectedFramePillar].h + deltaH,
          MIN_FRAME_HEIGHT,
          MAX_FRAME_HEIGHT
        ),
      },
    }));
  }

  function resetSelectedPillarFrame() {
    setPillarFrameSizes((previous) => ({
      ...previous,
      [selectedFramePillar]: DEFAULT_PILLAR_FRAME_SIZES[selectedFramePillar],
    }));
  }

  function resetAllPillarFrames() {
    setPillarFrameSizes(DEFAULT_PILLAR_FRAME_SIZES);
  }

  function addCustomBubble() {
    const isFreeBubble = newBubbleFamily === "LIBRE";
    const rawLabel = isFreeBubble ? freeBubbleText.trim() : newBubbleValue;
    const label = isFreeBubble
      ? rawLabel || "Bulle libre"
      : labelForFamilyValue(newBubbleFamily, newBubbleValue);
    const color = isFreeBubble
      ? freeBubbleColor
      : colorForFamilyValue(newBubbleFamily, newBubbleValue);

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
      x: 2265,
      y: 260 + (index % 14) * 56,
      color,
      description: isFreeBubble
        ? descriptionForFamilyValue("LIBRE", label, activeLod)
        : descriptionForFamilyValue(newBubbleFamily, newBubbleValue, activeLod),
      visibleDefault: true,
      isCustom: true,
    };

    setCustomBubbles((previous) => [...previous, bubble]);
    setSelectedBubbleId(id);
    setLinkSelectionIds((previous) => {
      if (previous.length === 0) return [id];
      if (previous.length === 1) return [previous[0], id];
      return [previous[1], id];
    });
  }

  function createLinkBetweenSelectedBubbles() {
    if (selectedLinkBubbles.length !== 2) return;

    const [source, target] = selectedLinkBubbles;

    const id = `LINK_${activeLod}_${Date.now()}_${Math.round(
      Math.random() * 100000
    )}`;

    const nextLink: BubbleLink = {
      id,
      lod: activeLod,
      sourceId: source.id,
      targetId: target.id,
      label: linkLabel.trim() || "Lien",
      color: linkColor,
    };

    setBubbleLinks((previous) => [...previous, nextLink]);
  }

  function breakLinkBetweenSelectedBubbles() {
    if (selectedLinkBubbles.length !== 2) return;

    const [first, second] = selectedLinkBubbles;

    setBubbleLinks((previous) =>
      previous.filter((link) => {
        if (link.lod !== activeLod) return true;

        const sameDirection =
          link.sourceId === first.id && link.targetId === second.id;
        const reverseDirection =
          link.sourceId === second.id && link.targetId === first.id;

        return !(sameDirection || reverseDirection);
      })
    );
  }

  function clearLinkSelection() {
    setLinkSelectionIds([]);
  }

  function deleteLink(linkId: string) {
    setBubbleLinks((previous) => previous.filter((link) => link.id !== linkId));
  }

  function deleteAllActiveLodLinks() {
    setBubbleLinks((previous) => previous.filter((link) => link.lod !== activeLod));
    setLinkSelectionIds([]);
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

    setBubbleLinks((previous) =>
      previous.filter(
        (link) => link.sourceId !== bubbleId && link.targetId !== bubbleId
      )
    );

    setLinkSelectionIds((previous) => previous.filter((id) => id !== bubbleId));

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

    setBubbleLinks((previous) =>
      previous.filter(
        (link) =>
          !idsToDeleteSet.has(link.sourceId) && !idsToDeleteSet.has(link.targetId)
      )
    );

    setLinkSelectionIds((previous) =>
      previous.filter((id) => !idsToDeleteSet.has(id))
    );

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
    setBubbleLinks([]);
    setPillarFrameSizes(DEFAULT_PILLAR_FRAME_SIZES);
    setCollapsedPanels(DEFAULT_COLLAPSED_PANELS);
    setSearch("");
    setFamilyFilter("ALL");
    setPillarFilter("ALL");
    setActiveLod("LOD1");
    setSelectedBubbleId("LOD1_PIECE_BE");
    setLinkSelectionIds([]);
    setLinkMode(false);
    setFreeBubbleText("Nouvelle bulle");
    setFreeBubbleColor("#facc15");
    setLinkLabel("Lien");
    setLinkColor("#cbd5e1");
    setShowLodTabs(true);
    setShowSidePanel(true);

    window.localStorage.removeItem(LS_BUBBLE_OVERRIDES);
    window.localStorage.removeItem(LS_CUSTOM_BUBBLES);
    window.localStorage.removeItem(LS_BUBBLE_LINKS);
    window.localStorage.removeItem(LS_PILLAR_FRAME_SIZES);
    window.localStorage.removeItem(LS_COLLAPSED_PANELS);
  }

  const newBubbleOptions = getOptionsForFamily(newBubbleFamily);

  const activeLodVisibleCount = activeLodBubbles.filter(
    (bubble) => bubble.visible
  ).length;
  const activeLodTotalCount = activeLodBubbles.length;
  const selectedFrame = pillarFrameSizes[selectedFramePillar];

  return (
    <main className="viewerPage">
      <section className="topbar">
        <div>
          <p className="eyebrow">Mini-PLM · Viewer libre V1.4</p>
          <h1>Placement libre par LOD avec sidebar harmonisée</h1>
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
            <option value="LIBRE">Bulles libres</option>
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
            className={moveEnabled && !linkMode ? "activeButton" : ""}
            onClick={() => setMoveEnabled((current) => !current)}
          >
            {moveEnabled ? "Déplacement actif" : "Déplacement verrouillé"}
          </button>

          <button
            className={linkMode ? "linkModeButtonActive" : ""}
            onClick={() => {
              setLinkMode((current) => !current);
            }}
          >
            {linkMode ? "Mode lien actif" : "Mode lien"}
          </button>

          <button onClick={() => setShowLodTabs((current) => !current)}>
            {showLodTabs ? "Masquer onglets LOD" : "Afficher onglets LOD"}
          </button>

          <button onClick={() => setShowSidePanel((current) => !current)}>
            {showSidePanel ? "Masquer panneau" : "Afficher panneau"}
          </button>

          <button onClick={showFilteredBubbles}>Afficher sélection</button>
          <button onClick={hideFilteredBubbles}>Masquer sélection</button>
          <button onClick={resetPositionsForActiveLod}>Réinit. positions LOD</button>
          <button onClick={resetEverything}>Réinit. total</button>
        </div>
      </section>

      {showLodTabs ? (
        <section className="lodTabs">
          {LODS.map((lod) => {
            const lodBubbles = bubbles.filter(
              (bubble) => bubble.lod === lod && !bubble.deleted
            );
            const visibleCount = lodBubbles.filter((bubble) => bubble.visible).length;
            const linkCount = bubbleLinks.filter((link) => link.lod === lod).length;

            return (
              <button
                key={lod}
                className={activeLod === lod ? "lodTab lodTabActive" : "lodTab"}
                onClick={() => changeActiveLod(lod)}
              >
                <strong>{LOD_LABELS[lod]}</strong>
                <span>{LOD_DETAILS[lod]}</span>
                <em>
                  {visibleCount}/{lodBubbles.length} visibles · {linkCount} lien(s)
                </em>
              </button>
            );
          })}
        </section>
      ) : (
        <section className="lodTabsCollapsed">
          <span>
            Onglets LOD repliés · Onglet actif : <strong>{activeLod}</strong>
          </span>

          <div className="compactLodButtons">
            {LODS.map((lod) => (
              <button
                key={lod}
                className={activeLod === lod ? "compactLodActive" : ""}
                onClick={() => changeActiveLod(lod)}
              >
                {lod}
              </button>
            ))}
          </div>

          <button onClick={() => setShowLodTabs(true)}>Redéployer</button>
        </section>
      )}

      {linkMode ? (
        <section className="linkModeBanner">
          Mode lien actif : clique sur deux bulles dans le viewer ou dans la
          bibliothèque, puis utilise “Créer lien” ou “Casser lien”.
        </section>
      ) : null}

      <section className={showSidePanel ? "layout" : "layout layoutNoSide"}>
        <div className="graphCard">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className={
              linkMode
                ? "graphSvg graphSvgLinkMode"
                : moveEnabled
                  ? "graphSvg graphSvgMove"
                  : "graphSvg"
            }
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

              <marker
                id="linkArrow"
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L0,6 L9,3 z" fill="#cbd5e1" />
              </marker>
            </defs>

            <rect
              x={120}
              y={170}
              width={2520}
              height={1160}
              rx={36}
              className="activeLodBand"
            />

            <text x={55} y={735} className="lodMainLabel">
              {LOD_LABELS[activeLod]}
            </text>

            <text x={55} y={765} className="lodSubLabel">
              {LOD_DETAILS[activeLod]}
            </text>

            {PILLARS.map((pillar) => {
              const frame = computedPillarFrames[pillar];

              return (
                <g key={pillar}>
                  <rect
                    x={frame.x}
                    y={frame.y}
                    width={frame.w}
                    height={frame.h}
                    rx={34}
                    className="pillarFrame"
                    stroke={PILLAR_COLORS[pillar]}
                  />

                  <text
                    x={frame.x + frame.w / 2}
                    y={frame.y - 26}
                    textAnchor="middle"
                    className="pillarTitle"
                  >
                    {PILLAR_LABELS[pillar]}
                  </text>

                  <text
                    x={frame.x + frame.w - 28}
                    y={frame.y + frame.h - 22}
                    textAnchor="end"
                    className="pillarSizeLabel"
                  >
                    {Math.round(frame.w)} × {Math.round(frame.h)}
                  </text>
                </g>
              );
            })}

            {visibleLinks.map((link) => {
              const midX = (link.source.x + link.target.x) / 2;
              const midY = (link.source.y + link.target.y) / 2;

              return (
                <g key={link.id} className="linkGroup">
                  <line
                    x1={link.source.x}
                    y1={link.source.y}
                    x2={link.target.x}
                    y2={link.target.y}
                    stroke={link.color}
                    strokeWidth={2}
                    strokeDasharray="6 5"
                    markerEnd="url(#linkArrow)"
                  />

                  <rect
                    x={midX - Math.max(link.label.length * 3.8 + 14, 28)}
                    y={midY - 13}
                    width={Math.max(link.label.length * 7.6 + 28, 56)}
                    height={24}
                    rx={12}
                    className="linkLabelBackground"
                  />

                  <text
                    x={midX}
                    y={midY + 4}
                    textAnchor="middle"
                    className="linkLabel"
                  >
                    {link.label}
                  </text>
                </g>
              );
            })}

            {visibleBubbles.map((bubble) => {
              const width = bubbleWidth(bubble.label);
              const selected = selectedBubbleId === bubble.id;
              const isLinkSelected = linkSelectionIds.includes(bubble.id);
              const hasCustomPosition =
                bubbleOverrides[bubble.id]?.x !== undefined ||
                bubbleOverrides[bubble.id]?.y !== undefined;

              return (
                <g
                  key={bubble.id}
                  transform={`translate(${bubble.x}, ${bubble.y})`}
                  className={
                    linkMode
                      ? "bubbleGroup bubbleGroupLinkMode"
                      : moveEnabled
                        ? "bubbleGroup bubbleGroupMove"
                        : "bubbleGroup"
                  }
                  onPointerDown={(event) => startDragBubble(event, bubble)}
                  onClick={(event) => handleBubbleClick(event, bubble)}
                  filter={selected || isLinkSelected ? "url(#bubbleGlow)" : undefined}
                >
                  <rect
                    x={-width / 2}
                    y={-18}
                    width={width}
                    height={36}
                    rx={18}
                    fill={bubble.color}
                    stroke={
                      isLinkSelected
                        ? "#22d3ee"
                        : selected
                          ? "#ffffff"
                          : hasCustomPosition
                            ? "#facc15"
                            : "rgba(255,255,255,0.28)"
                    }
                    strokeWidth={
                      isLinkSelected
                        ? 4
                        : selected
                          ? 3.2
                          : hasCustomPosition
                            ? 2.6
                            : 1.6
                    }
                  />

                  {isLinkSelected ? (
                    <circle
                      cx={width / 2 - 11}
                      cy={-13}
                      r={10}
                      fill="#22d3ee"
                      stroke="#020617"
                      strokeWidth={2}
                    />
                  ) : null}

                  {isLinkSelected ? (
                    <text
                      x={width / 2 - 11}
                      y={-9}
                      textAnchor="middle"
                      className="linkOrderText"
                    >
                      {linkSelectionIds.indexOf(bubble.id) + 1}
                    </text>
                  ) : null}

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

        {showSidePanel ? (
          <aside className="sidePanel">
            <div className="panelHeaderRow">
              <span>Panneau fonctionnalités</span>
              <button onClick={() => setShowSidePanel(false)}>Replier</button>
            </div>

            <PanelShell panelKey="ACTIVE_LOD" title="Onglet actif">
              <div className="lodStatusCard">
                <strong>{LOD_LABELS[activeLod]}</strong>
                <span>{LOD_DETAILS[activeLod]}</span>
                <em>
                  {activeLodVisibleCount}/{activeLodTotalCount} bulles visibles ·{" "}
                  {activeLodLinks.length} lien(s)
                </em>
              </div>
            </PanelShell>

            <PanelShell panelKey="FRAME_RESIZE" title="Ajuster les cadres des piliers">
              <div className="frameResizeGrid">
                <label>
                  Pilier
                  <select
                    value={selectedFramePillar}
                    onChange={(event) =>
                      setSelectedFramePillar(event.target.value as Pillar)
                    }
                  >
                    <option value="PIECE">Pièce</option>
                    <option value="HP">HP</option>
                    <option value="GPE">GPE</option>
                  </select>
                </label>

                <div className="rangeRow">
                  <span>Largeur</span>
                  <input
                    type="range"
                    min={MIN_FRAME_WIDTH}
                    max={MAX_FRAME_WIDTH}
                    step={20}
                    value={selectedFrame.w}
                    onChange={(event) =>
                      updatePillarFrameSize(
                        selectedFramePillar,
                        "w",
                        Number(event.target.value)
                      )
                    }
                  />
                  <strong>{selectedFrame.w}</strong>
                </div>

                <div className="rangeRow">
                  <span>Hauteur</span>
                  <input
                    type="range"
                    min={MIN_FRAME_HEIGHT}
                    max={MAX_FRAME_HEIGHT}
                    step={20}
                    value={selectedFrame.h}
                    onChange={(event) =>
                      updatePillarFrameSize(
                        selectedFramePillar,
                        "h",
                        Number(event.target.value)
                      )
                    }
                  />
                  <strong>{selectedFrame.h}</strong>
                </div>

                <div className="quickFrameButtons">
                  <button onClick={() => adjustSelectedPillarFrame(80, 80)}>
                    Agrandir
                  </button>
                  <button onClick={() => adjustSelectedPillarFrame(-80, -80)}>
                    Rétrécir
                  </button>
                  <button onClick={resetSelectedPillarFrame}>
                    Reset pilier
                  </button>
                  <button onClick={resetAllPillarFrames}>
                    Reset tous
                  </button>
                </div>
              </div>

              <p className="hint">
                Les dimensions sont sauvegardées dans le navigateur. Les bulles
                restent déplaçables librement dans les cadres.
              </p>
            </PanelShell>

            <PanelShell panelKey="LINK_EDITOR" title="Créer / casser un lien">
              <div className="linkSelectionBox">
                <div>
                  <span>Bulle 1</span>
                  <strong>{selectedLinkBubbles[0]?.label ?? "Non sélectionnée"}</strong>
                  <small>{selectedLinkBubbles[0]?.subtitle ?? "Clique une bulle"}</small>
                </div>

                <div>
                  <span>Bulle 2</span>
                  <strong>{selectedLinkBubbles[1]?.label ?? "Non sélectionnée"}</strong>
                  <small>{selectedLinkBubbles[1]?.subtitle ?? "Clique une deuxième bulle"}</small>
                </div>
              </div>

              <div className="linkCreator">
                <input
                  value={linkLabel}
                  onChange={(event) => setLinkLabel(event.target.value)}
                  placeholder="Nom du lien..."
                />

                <input
                  type="color"
                  value={linkColor}
                  onChange={(event) => setLinkColor(event.target.value)}
                  title="Couleur du lien"
                />

                <button
                  onClick={createLinkBetweenSelectedBubbles}
                  disabled={selectedLinkBubbles.length !== 2}
                >
                  Créer lien
                </button>

                <button
                  className="dangerButton"
                  onClick={breakLinkBetweenSelectedBubbles}
                  disabled={selectedLinkBubbles.length !== 2}
                >
                  Casser lien
                </button>

                <button onClick={clearLinkSelection}>Vider sélection</button>
              </div>

              <p className="hint">
                Sélection actuelle : <strong>{selectedLinkBubbles.length}/2</strong>.{" "}
                Liens existants entre les deux bulles sélectionnées :{" "}
                <strong>{selectedPairExistingLinks.length}</strong>.
              </p>
            </PanelShell>

            <PanelShell panelKey="SELECTED_BUBBLE" title="Bulle sélectionnée">
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
            </PanelShell>

            <PanelShell panelKey="LINKS" title={`Liens · ${activeLod}`}>
              <div className="libraryHeader">
                <p className="libraryCount">
                  {activeLodLinks.length} lien(s) dans l’onglet actif
                </p>

                <div className="libraryActions">
                  <button className="dangerButton" onClick={deleteAllActiveLodLinks}>
                    Supprimer liens LOD
                  </button>
                </div>
              </div>

              <div className="linkList">
                {activeLodLinks.length === 0 ? (
                  <p className="empty">Aucun lien dans cet onglet.</p>
                ) : (
                  activeLodLinks.map((link) => (
                    <div key={link.id} className="linkItem">
                      <span
                        className="linkDot"
                        style={{ background: link.color }}
                      />

                      <div className="linkItemContent">
                        <strong>{link.label}</strong>
                        <small>
                          {link.source.label} → {link.target.label}
                        </small>
                        <em>
                          {link.source.visible && link.target.visible
                            ? "Affiché"
                            : "Masqué : source ou cible non visible"}
                        </em>
                      </div>

                      <button
                        className="miniDeleteButton"
                        onClick={() => deleteLink(link.id)}
                      >
                        Suppr.
                      </button>
                    </div>
                  ))
                )}
              </div>
            </PanelShell>

            <PanelShell panelKey="ADD_BUBBLE" title={`Ajouter une bulle libre dans ${activeLod}`}>
              <div
                className={
                  newBubbleFamily === "LIBRE"
                    ? "addBubbleGrid addBubbleGridFree"
                    : "addBubbleGrid"
                }
              >
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
                  <option value="LIBRE">Texte libre</option>
                </select>

                {newBubbleFamily === "LIBRE" ? (
                  <>
                    <input
                      value={freeBubbleText}
                      onChange={(event) => setFreeBubbleText(event.target.value)}
                      placeholder="Texte de la bulle..."
                    />

                    <input
                      type="color"
                      value={freeBubbleColor}
                      onChange={(event) => setFreeBubbleColor(event.target.value)}
                      title="Couleur de la bulle"
                    />
                  </>
                ) : (
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
                )}

                <button onClick={addCustomBubble}>Ajouter</button>
              </div>

              <p className="hint">
                Tu peux ajouter une bulle standard ou une bulle texte libre avec
                sa propre couleur. Elle sera créée uniquement dans l’onglet {activeLod}.
              </p>
            </PanelShell>

            <PanelShell panelKey="BUBBLE_LIBRARY" title={`Bibliothèque des bulles · ${activeLod}`}>
              <div className="libraryHeader">
                <p className="libraryCount">
                  {filteredBubbles.length} bulle(s) dans la sélection
                </p>

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
                        onClick={() => handleLibraryBubbleClick(bubble.id)}
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
            </PanelShell>

            <PanelShell panelKey="READING" title="Lecture V1.4">
              <ul className="readingList">
                <li>
                  <strong>Style corrigé</strong> : les mini-fenêtres sont maintenant cohérentes avec le thème global.
                </li>
                <li>
                  <strong>Correction technique</strong> : le style est appliqué globalement pour couvrir le composant interne PanelShell.
                </li>
                <li>
                  <strong>Réduction</strong> : le bouton “—” replie la fenêtre.
                </li>
                <li>
                  <strong>Réouverture</strong> : le bouton “▢” redéploie le contenu.
                </li>
                <li>
                  <strong>Sauvegarde</strong> : l’état replié/déplié est conservé dans le navigateur.
                </li>
              </ul>
            </PanelShell>
          </aside>
        ) : (
          <button
            className="sidePanelDock"
            onClick={() => setShowSidePanel(true)}
          >
            Afficher panneau
          </button>
        )}
      </section>

      <style jsx global>{`
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

        .viewerPage * {
          box-sizing: border-box;
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
          max-width: 1440px;
        }

        .toolbar input,
        .toolbar select,
        .toolbar button,
        .addBubbleGrid input,
        .addBubbleGrid select,
        .addBubbleGrid button,
        .selectedActions button,
        .libraryActions button,
        .miniDeleteButton,
        .linkCreator input,
        .linkCreator button,
        .panelHeaderRow button,
        .frameResizeGrid select,
        .quickFrameButtons button,
        .lodTabsCollapsed button,
        .compactLodButtons button {
          border: 1px solid rgba(148, 163, 184, 0.28);
          background: rgba(15, 23, 42, 0.84);
          color: #e5e7eb;
          border-radius: 12px;
          padding: 10px 11px;
          font-size: 13px;
          outline: none;
        }

        .toolbar button,
        .addBubbleGrid button,
        .selectedActions button,
        .libraryActions button,
        .miniDeleteButton,
        .linkCreator button,
        .panelHeaderRow button,
        .quickFrameButtons button,
        .lodTabsCollapsed button,
        .compactLodButtons button {
          cursor: pointer;
          font-weight: 800;
          background: rgba(37, 99, 235, 0.34);
        }

        .toolbar button:hover,
        .addBubbleGrid button:hover,
        .selectedActions button:hover,
        .libraryActions button:hover,
        .linkCreator button:hover,
        .quickFrameButtons button:hover,
        .panelHeaderRow button:hover {
          border-color: rgba(96, 165, 250, 0.58);
          background: rgba(37, 99, 235, 0.48);
        }

        .toolbar button:disabled,
        .linkCreator button:disabled {
          cursor: not-allowed;
          opacity: 0.45;
        }

        .toolbar input {
          width: 210px;
        }

        .addBubbleGrid input[type="color"],
        .linkCreator input[type="color"] {
          width: 58px;
          min-width: 58px;
          height: 40px;
          padding: 4px;
          cursor: pointer;
        }

        .toolbar .activeButton {
          background: rgba(250, 204, 21, 0.28);
          border-color: rgba(250, 204, 21, 0.55);
          color: #fef9c3;
        }

        .linkModeButtonActive {
          background: rgba(34, 211, 238, 0.26) !important;
          border-color: rgba(34, 211, 238, 0.58) !important;
          color: #cffafe !important;
        }

        .dangerButton,
        .selectedActions .dangerButton,
        .libraryActions .dangerButton {
          background: rgba(220, 38, 38, 0.32);
          border-color: rgba(248, 113, 113, 0.42);
        }

        .linkModeBanner {
          border: 1px solid rgba(34, 211, 238, 0.38);
          background: rgba(8, 47, 73, 0.5);
          color: #cffafe;
          border-radius: 16px;
          padding: 11px 14px;
          font-size: 13px;
          font-weight: 800;
          margin-bottom: 14px;
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

        .lodTabsCollapsed {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          background: rgba(15, 23, 42, 0.72);
          border-radius: 18px;
          padding: 10px 12px;
          margin-bottom: 14px;
          color: #cbd5e1;
          font-size: 13px;
        }

        .lodTabsCollapsed strong {
          color: #f8fafc;
        }

        .compactLodButtons {
          display: flex;
          gap: 6px;
          margin-left: auto;
        }

        .compactLodButtons button {
          padding: 8px 10px;
        }

        .compactLodActive {
          background: rgba(14, 165, 233, 0.34) !important;
          border-color: rgba(56, 189, 248, 0.58) !important;
          color: #e0f2fe !important;
        }

        .layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 430px;
          gap: 18px;
          align-items: stretch;
          position: relative;
        }

        .layoutNoSide {
          grid-template-columns: minmax(0, 1fr);
        }

        .graphCard {
          min-height: 860px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 24px;
          overflow: auto;
          background:
            linear-gradient(rgba(148, 163, 184, 0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(148, 163, 184, 0.04) 1px, transparent 1px),
            rgba(2, 6, 23, 0.76);
          background-size: 34px 34px;
          box-shadow: 0 18px 60px rgba(0, 0, 0, 0.28);
        }

        .graphSvg {
          width: max(100%, 2100px);
          min-width: 2100px;
          height: 900px;
          min-height: 900px;
          display: block;
          touch-action: none;
        }

        .layoutNoSide .graphSvg {
          width: max(100%, 2400px);
          min-width: 2400px;
          height: 940px;
          min-height: 940px;
        }

        .graphSvgMove {
          cursor: grab;
        }

        .graphSvgLinkMode {
          cursor: crosshair;
        }

        .activeLodBand {
          fill: rgba(15, 23, 42, 0.16);
          stroke: rgba(148, 163, 184, 0.08);
          stroke-width: 1;
        }

        .pillarFrame {
          fill: rgba(15, 23, 42, 0.22);
          stroke-width: 1.9;
          stroke-opacity: 0.5;
          stroke-dasharray: 12 9;
        }

        .pillarTitle {
          fill: rgba(248, 250, 252, 0.92);
          font-size: 23px;
          font-weight: 900;
          letter-spacing: 0.05em;
        }

        .pillarSizeLabel {
          fill: rgba(226, 232, 240, 0.48);
          font-size: 12px;
          font-weight: 800;
        }

        .lodMainLabel {
          fill: #f8fafc;
          font-size: 24px;
          font-weight: 900;
        }

        .lodSubLabel {
          fill: #94a3b8;
          font-size: 14px;
          font-weight: 700;
        }

        .linkGroup {
          pointer-events: none;
        }

        .linkLabelBackground {
          fill: rgba(2, 6, 23, 0.82);
          stroke: rgba(203, 213, 225, 0.18);
          stroke-width: 1;
        }

        .linkLabel {
          fill: #e5e7eb;
          font-size: 11px;
          font-weight: 800;
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

        .bubbleGroupLinkMode {
          cursor: crosshair;
        }

        .bubbleText {
          fill: #020617;
          font-size: 12px;
          font-weight: 900;
          pointer-events: none;
          letter-spacing: -0.01em;
        }

        .linkOrderText {
          fill: #020617;
          font-size: 10px;
          font-weight: 950;
          pointer-events: none;
        }

        .sidePanel {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .sidePanelDock {
          position: fixed;
          right: 18px;
          top: 50%;
          z-index: 20;
          transform: translateY(-50%);
          border: 1px solid rgba(56, 189, 248, 0.45);
          background: rgba(14, 165, 233, 0.28);
          color: #e0f2fe;
          border-radius: 999px;
          padding: 12px 16px;
          cursor: pointer;
          font-weight: 900;
          box-shadow: 0 18px 45px rgba(0, 0, 0, 0.34);
        }

        .panelHeaderRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          background:
            linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.82));
          border-radius: 18px;
          padding: 12px 14px;
          box-shadow: 0 16px 34px rgba(0, 0, 0, 0.22);
        }

        .panelHeaderRow span {
          font-size: 12px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: #93c5fd;
        }

        .panelHeaderRow button {
          padding: 8px 12px;
        }

        .panelBlock {
          border: 1px solid rgba(148, 163, 184, 0.22);
          background:
            linear-gradient(135deg, rgba(15, 23, 42, 0.94), rgba(2, 6, 23, 0.88));
          border-radius: 18px;
          overflow: hidden;
          box-shadow:
            0 18px 40px rgba(0, 0, 0, 0.24),
            inset 0 1px 0 rgba(255, 255, 255, 0.03);
        }

        .panelBlockCollapsed {
          background:
            linear-gradient(135deg, rgba(15, 23, 42, 0.82), rgba(2, 6, 23, 0.72));
        }

        .panelTitleBar {
          appearance: none;
          -webkit-appearance: none;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          border: 0;
          border-bottom: 1px solid rgba(148, 163, 184, 0.16);
          background:
            linear-gradient(90deg, rgba(30, 64, 175, 0.42), rgba(15, 23, 42, 0.96));
          color: #e5e7eb;
          padding: 10px 12px;
          cursor: pointer;
          text-align: left;
          font-family: inherit;
        }

        .panelTitleBar:hover {
          background:
            linear-gradient(90deg, rgba(37, 99, 235, 0.5), rgba(15, 23, 42, 0.98));
        }

        .panelBlockCollapsed .panelTitleBar {
          border-bottom: 0;
        }

        .panelTitleLeft {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }

        .panelIcon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border-radius: 8px;
          background: rgba(56, 189, 248, 0.15);
          border: 1px solid rgba(56, 189, 248, 0.3);
          color: #93c5fd;
          font-size: 13px;
          font-weight: 950;
          flex: 0 0 auto;
        }

        .panelTitleText {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #dbeafe;
          font-size: 11px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.12em;
        }

        .windowControls {
          display: flex;
          align-items: center;
          gap: 6px;
          flex: 0 0 auto;
        }

        .windowControlDot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          opacity: 0.78;
          box-shadow: 0 0 0 1px rgba(2, 6, 23, 0.45);
        }

        .windowControlRed {
          background: #f87171;
        }

        .windowControlYellow {
          background: #facc15;
        }

        .windowControlGreen {
          background: #34d399;
        }

        .windowMinimizeButton {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 22px;
          border-radius: 7px;
          margin-left: 3px;
          background: rgba(15, 23, 42, 0.78);
          border: 1px solid rgba(148, 163, 184, 0.28);
          color: #f8fafc;
          font-size: 12px;
          font-weight: 950;
          line-height: 1;
        }

        .panelBody {
          padding: 14px;
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

        .frameResizeGrid {
          display: grid;
          gap: 10px;
        }

        .frameResizeGrid label {
          display: grid;
          gap: 6px;
          color: #cbd5e1;
          font-size: 12px;
          font-weight: 800;
        }

        .frameResizeGrid select {
          width: 100%;
        }

        .rangeRow {
          display: grid;
          grid-template-columns: 72px 1fr 54px;
          align-items: center;
          gap: 10px;
          color: #cbd5e1;
          font-size: 12px;
        }

        .rangeRow input[type="range"] {
          width: 100%;
          accent-color: #38bdf8;
        }

        .rangeRow strong {
          color: #f8fafc;
          text-align: right;
        }

        .quickFrameButtons {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .quickFrameButtons button {
          padding: 9px 10px;
        }

        .libraryHeader {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 12px;
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

        .addBubbleGridFree {
          grid-template-columns: 1fr 1.3fr 64px auto;
        }

        .linkSelectionBox {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-bottom: 10px;
        }

        .linkSelectionBox div {
          border: 1px solid rgba(34, 211, 238, 0.22);
          background: rgba(8, 47, 73, 0.25);
          border-radius: 14px;
          padding: 10px;
          display: grid;
          gap: 3px;
        }

        .linkSelectionBox span {
          color: #67e8f9;
          font-size: 11px;
          font-weight: 850;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .linkSelectionBox strong {
          color: #f8fafc;
          font-size: 14px;
        }

        .linkSelectionBox small {
          color: #94a3b8;
          font-size: 12px;
        }

        .linkCreator {
          display: grid;
          grid-template-columns: 1fr 58px 1fr 1fr 1fr;
          gap: 8px;
          align-items: center;
        }

        .linkList {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 220px;
          overflow: auto;
          padding-right: 4px;
        }

        .linkItem {
          display: grid;
          grid-template-columns: 10px 1fr auto;
          gap: 9px;
          align-items: center;
          border: 1px solid rgba(148, 163, 184, 0.16);
          background: rgba(2, 6, 23, 0.42);
          border-radius: 14px;
          padding: 9px;
        }

        .linkDot {
          width: 10px;
          height: 100%;
          min-height: 42px;
          border-radius: 999px;
        }

        .linkItemContent {
          display: grid;
          gap: 3px;
        }

        .linkItemContent strong {
          font-size: 13px;
          color: #f8fafc;
        }

        .linkItemContent small,
        .linkItemContent em {
          color: #94a3b8;
          font-size: 12px;
          font-style: normal;
        }

        .hint {
          color: #94a3b8;
          margin: 10px 0 0 0;
          font-size: 12.5px;
          line-height: 1.45;
        }

        .hint strong {
          color: #e5e7eb;
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

          .addBubbleGrid,
          .addBubbleGridFree,
          .linkCreator,
          .linkSelectionBox,
          .quickFrameButtons {
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

          .lodTabsCollapsed {
            flex-direction: column;
            align-items: stretch;
          }

          .compactLodButtons {
            margin-left: 0;
          }

          .graphSvg {
            width: 2200px;
            min-width: 2200px;
          }
        }
      `}</style>
    </main>
  );
}
