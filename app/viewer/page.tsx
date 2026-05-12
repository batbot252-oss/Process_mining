"use client";

import { useMemo, useState } from "react";

type Entity = "BE" | "BM" | "SIM" | "FA" | "CND" | "TRANSVERSE";
type LOD = "L1" | "L2" | "L3";

type NodeType =
  | "produit"
  | "entite_lod"
  | "zone"
  | "interface"
  | "parametre"
  | "risque"
  | "decision"
  | "preuve"
  | "validation";

type NodeStatus = "non_demarre" | "en_cours" | "bloque" | "valide";

type RelationType =
  | "alimente"
  | "impacte"
  | "valide"
  | "bloque"
  | "justifie"
  | "controle"
  | "industrialise"
  | "fabrique"
  | "simule"
  | "corrige"
  | "correspond";

type Criticality = "faible" | "moyenne" | "forte";

type GraphNode = {
  id: string;
  label: string;
  entity: Entity;
  lod?: LOD;
  type: NodeType;
  x: number;
  y: number;
  maturity: number;
  status: NodeStatus;
  description: string;
};

type GraphEdge = {
  id: string;
  source: string;
  target: string;
  type: RelationType;
  label: string;
  criticality: Criticality;
  bidirectional?: boolean;
};

const ENTITY_COLORS: Record<Entity, string> = {
  BE: "#60a5fa",
  BM: "#f59e0b",
  SIM: "#a78bfa",
  FA: "#34d399",
  CND: "#f87171",
  TRANSVERSE: "#e5e7eb",
};

const STATUS_COLORS: Record<NodeStatus, string> = {
  non_demarre: "#6b7280",
  en_cours: "#38bdf8",
  bloque: "#ef4444",
  valide: "#22c55e",
};

const RELATION_COLORS: Record<RelationType, string> = {
  alimente: "#94a3b8",
  impacte: "#f97316",
  valide: "#22c55e",
  bloque: "#ef4444",
  justifie: "#a78bfa",
  controle: "#f87171",
  industrialise: "#f59e0b",
  fabrique: "#34d399",
  simule: "#818cf8",
  corrige: "#facc15",
  correspond: "#cbd5e1",
};

const WIDTH = 1400;
const HEIGHT = 880;
const CX = WIDTH / 2;
const CY = HEIGHT / 2;

function polar(cx: number, cy: number, radius: number, angleDeg: number) {
  const angle = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

function wrapLabel(label: string, maxLength = 18) {
  const words = label.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (`${current} ${word}`.trim().length > maxLength) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  }

  if (current) lines.push(current);
  return lines.slice(0, 4);
}

function buildGraph() {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const entityAngles: Record<Exclude<Entity, "TRANSVERSE">, number> = {
    BE: 0,
    BM: 72,
    SIM: 144,
    FA: 216,
    CND: 288,
  };

  const lodRadius: Record<LOD, number> = {
    L1: 160,
    L2: 295,
    L3: 430,
  };

  const lodLabels: Record<Exclude<Entity, "TRANSVERSE">, Record<LOD, string>> = {
    BE: {
      L1: "BE L1 - Fonction produit",
      L2: "BE L2 - Géométrie paramétrée",
      L3: "BE L3 - Définition libérée",
    },
    BM: {
      L1: "BM L1 - Procédé pressenti",
      L2: "BM L2 - Gamme prévisionnelle",
      L3: "BM L3 - Gamme détaillée",
    },
    SIM: {
      L1: "SIM L1 - Besoin simulation",
      L2: "SIM L2 - Modèle intermédiaire",
      L3: "SIM L3 - Rapport validé",
    },
    FA: {
      L1: "FA L1 - Capacité atelier",
      L2: "FA L2 - Faisabilité fabrication",
      L3: "FA L3 - Dossier fabrication",
    },
    CND: {
      L1: "CND L1 - Stratégie contrôle",
      L2: "CND L2 - Accessibilité contrôle",
      L3: "CND L3 - PV contrôle",
    },
  };

  const descriptions: Record<Exclude<Entity, "TRANSVERSE">, Record<LOD, string>> = {
    BE: {
      L1: "Définit la fonction produit, les exigences principales et l’architecture générale.",
      L2: "Construit les variantes, la géométrie paramétrée, les interfaces et les premières tolérances.",
      L3: "Fige la définition CAO, les plans, les interfaces et les tolérances validées.",
    },
    BM: {
      L1: "Identifie le procédé pressenti, les contraintes industrielles majeures et les hypothèses méthodes.",
      L2: "Construit la gamme prévisionnelle, les règles de fabricabilité et les besoins outillage.",
      L3: "Fige la gamme détaillée, les fiches méthodes, les paramètres process et les outillages validés.",
    },
    SIM: {
      L1: "Identifie les phénomènes physiques à vérifier et les critères de performance.",
      L2: "Produit les modèles simplifiés ou semi-détaillés, les maillages et les premiers résultats.",
      L3: "Fournit les calculs validés, les marges, les rapports et les justifications techniques.",
    },
    FA: {
      L1: "Évalue les moyens disponibles, les contraintes atelier et la capacité de fabrication.",
      L2: "Teste la faisabilité réelle, les séquences de fabrication et les risques atelier.",
      L3: "Exécute ou prépare le dossier de fabrication avec les instructions et les retours production.",
    },
    CND: {
      L1: "Définit les zones critiques, les méthodes de contrôle candidates et les exigences qualité.",
      L2: "Vérifie l’accessibilité contrôle, les zones non contrôlables et la criticité défauts.",
      L3: "Fige les procédures de contrôle, les critères d’acceptation et les PV qualité.",
    },
  };

  const statusByLOD: Record<LOD, NodeStatus> = {
    L1: "valide",
    L2: "en_cours",
    L3: "non_demarre",
  };

  nodes.push({
    id: "produit",
    label: "Produit / Sous-produit",
    entity: "TRANSVERSE",
    type: "produit",
    x: CX,
    y: CY,
    maturity: 45,
    status: "en_cours",
    description:
      "Objet pivot partagé par toutes les entités. Le produit porte la maturité globale, les décisions, les preuves et les risques.",
  });

  nodes.push(
    {
      id: "zone_critique",
      label: "Zone critique",
      entity: "TRANSVERSE",
      type: "zone",
      x: CX,
      y: CY - 90,
      maturity: 55,
      status: "en_cours",
      description:
        "Zone du produit à surveiller car elle concentre des enjeux de conception, simulation, fabrication ou contrôle.",
    },
    {
      id: "interface",
      label: "Interface produit",
      entity: "TRANSVERSE",
      type: "interface",
      x: CX + 155,
      y: CY - 10,
      maturity: 50,
      status: "en_cours",
      description:
        "Interface fonctionnelle ou physique impactant plusieurs métiers.",
    },
    {
      id: "parametre",
      label: "Paramètre clé",
      entity: "TRANSVERSE",
      type: "parametre",
      x: CX - 150,
      y: CY - 10,
      maturity: 60,
      status: "en_cours",
      description:
        "Paramètre de conception partagé entre CAO, méthodes, simulation, fabrication ou contrôle.",
    },
    {
      id: "risque_cnd",
      label: "Risque accessibilité CND",
      entity: "TRANSVERSE",
      type: "risque",
      x: CX - 250,
      y: CY + 175,
      maturity: 10,
      status: "bloque",
      description:
        "Risque identifié : une zone produit pourrait être difficile ou impossible à contrôler.",
    },
    {
      id: "decision_rdc",
      label: "Décision RdC",
      entity: "TRANSVERSE",
      type: "decision",
      x: CX,
      y: CY + 230,
      maturity: 100,
      status: "valide",
      description:
        "Décision de revue de conception permettant de corriger, valider ou bloquer une orientation technique.",
    },
    {
      id: "preuve_numerique",
      label: "Preuve numérique",
      entity: "TRANSVERSE",
      type: "preuve",
      x: CX + 250,
      y: CY + 175,
      maturity: 75,
      status: "en_cours",
      description:
        "Preuve issue d’un rapport simulation, d’une gamme validée, d’un PV contrôle ou d’un fichier technique.",
    },
    {
      id: "validation_lod",
      label: "Validation LOD",
      entity: "TRANSVERSE",
      type: "validation",
      x: CX + 315,
      y: CY + 30,
      maturity: 70,
      status: "en_cours",
      description:
        "Point de passage entre L1, L2 et L3. La validation dépend des preuves et des correspondances métiers.",
    }
  );

  for (const entity of Object.keys(entityAngles) as Exclude<Entity, "TRANSVERSE">[]) {
    for (const lod of ["L1", "L2", "L3"] as LOD[]) {
      const pos = polar(CX, CY, lodRadius[lod], entityAngles[entity]);

      let status = statusByLOD[lod];
      let maturity = lod === "L1" ? 100 : lod === "L2" ? 55 : 20;

      if (entity === "CND" && lod === "L2") {
        status = "bloque";
        maturity = 35;
      }

      if (entity === "BE" && lod === "L2") {
        maturity = 70;
      }

      nodes.push({
        id: `${entity}_${lod}`,
        label: lodLabels[entity][lod],
        entity,
        lod,
        type: "entite_lod",
        x: pos.x,
        y: pos.y,
        maturity,
        status,
        description: descriptions[entity][lod],
      });
    }
  }

  let edgeCount = 0;
  const addEdge = (
    source: string,
    target: string,
    type: RelationType,
    label: string,
    criticality: Criticality = "moyenne",
    bidirectional = false
  ) => {
    edgeCount += 1;
    edges.push({
      id: `e_${edgeCount}`,
      source,
      target,
      type,
      label,
      criticality,
      bidirectional,
    });
  };

  for (const entity of Object.keys(entityAngles) as Exclude<Entity, "TRANSVERSE">[]) {
    addEdge("produit", `${entity}_L1`, "alimente", "cadrage métier", "moyenne");
    addEdge(`${entity}_L1`, `${entity}_L2`, "alimente", "passage L1 → L2", "moyenne");
    addEdge(`${entity}_L2`, `${entity}_L3`, "valide", "passage L2 → L3", "forte");
  }

  addEdge("produit", "zone_critique", "alimente", "porte la zone critique", "forte");
  addEdge("produit", "interface", "alimente", "porte les interfaces", "moyenne");
  addEdge("produit", "parametre", "alimente", "porte les paramètres", "moyenne");

  addEdge("BE_L1", "BM_L1", "correspond", "fonction ↔ procédé", "moyenne", true);
  addEdge("BE_L1", "SIM_L1", "correspond", "fonction ↔ phénomène", "moyenne", true);
  addEdge("BE_L1", "CND_L1", "correspond", "fonction ↔ zones critiques", "moyenne", true);

  addEdge("BE_L2", "BM_L2", "impacte", "géométrie fabricable", "forte", true);
  addEdge("BE_L2", "SIM_L2", "simule", "géométrie simulable", "forte", true);
  addEdge("BE_L2", "CND_L2", "controle", "forme contrôlable", "forte", true);

  addEdge("BM_L2", "FA_L2", "industrialise", "gamme prévisionnelle", "forte", true);
  addEdge("FA_L2", "CND_L2", "controle", "accessibilité contrôle", "forte", true);
  addEdge("SIM_L2", "CND_L2", "justifie", "zone sensible calculée", "forte", true);

  addEdge("BE_L3", "BM_L3", "industrialise", "définition → gamme", "forte");
  addEdge("BM_L3", "FA_L3", "fabrique", "gamme → fabrication", "forte");
  addEdge("FA_L3", "CND_L3", "controle", "fabrication → contrôle", "forte");
  addEdge("SIM_L3", "BE_L3", "justifie", "rapport → définition", "forte");
  addEdge("SIM_L3", "CND_L3", "justifie", "justification zones critiques", "forte");
  addEdge("BM_L3", "CND_L3", "controle", "plan de contrôle", "forte");

  addEdge("zone_critique", "SIM_L2", "simule", "zone à vérifier", "forte");
  addEdge("zone_critique", "CND_L2", "controle", "zone à inspecter", "forte");
  addEdge("interface", "BE_L2", "impacte", "interface CAO", "moyenne");
  addEdge("interface", "BM_L2", "impacte", "interface process", "moyenne");
  addEdge("parametre", "BE_L2", "alimente", "paramètre CAO", "forte");
  addEdge("parametre", "SIM_L2", "alimente", "paramètre calcul", "forte");
  addEdge("parametre", "BM_L2", "impacte", "paramètre méthodes", "forte");

  addEdge("CND_L2", "risque_cnd", "bloque", "zone non contrôlable", "forte");
  addEdge("risque_cnd", "decision_rdc", "justifie", "décision corrective", "forte");
  addEdge("decision_rdc", "BE_L2", "corrige", "modifier géométrie", "forte");
  addEdge("decision_rdc", "BM_L2", "corrige", "adapter gamme", "moyenne");
  addEdge("SIM_L3", "preuve_numerique", "justifie", "rapport simulation", "forte");
  addEdge("CND_L3", "preuve_numerique", "justifie", "PV contrôle", "forte");
  addEdge("preuve_numerique", "validation_lod", "valide", "preuve de maturité", "forte");
  addEdge("validation_lod", "produit", "valide", "maturité produit", "forte");

  return { nodes, edges };
}

export default function ViewerPage() {
  const { nodes, edges } = useMemo(() => buildGraph(), []);

  const [selectedNodeId, setSelectedNodeId] = useState<string>("produit");
  const [lodFilter, setLodFilter] = useState<LOD | "ALL">("ALL");
  const [entityFilter, setEntityFilter] = useState<Entity | "ALL">("ALL");
  const [relationFilter, setRelationFilter] = useState<RelationType | "ALL">("ALL");
  const [viewMode, setViewMode] = useState<"global" | "risques" | "preuves" | "lod">("global");
  const [search, setSearch] = useState("");

  const nodeById = useMemo(() => {
    return new Map(nodes.map((node) => [node.id, node]));
  }, [nodes]);

  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) : undefined;

  const visibleNodeIds = useMemo(() => {
    const ids = new Set<string>();

    for (const node of nodes) {
      const matchSearch =
        search.trim().length === 0 ||
        node.label.toLowerCase().includes(search.toLowerCase()) ||
        node.description.toLowerCase().includes(search.toLowerCase());

      const matchLOD =
        lodFilter === "ALL" ||
        node.lod === lodFilter ||
        node.type === "produit" ||
        node.entity === "TRANSVERSE";

      const matchEntity =
        entityFilter === "ALL" ||
        node.entity === entityFilter ||
        node.type === "produit" ||
        node.entity === "TRANSVERSE";

      let matchView = true;

      if (viewMode === "risques") {
        matchView =
          node.type === "risque" ||
          node.type === "decision" ||
          node.status === "bloque" ||
          node.id === "produit" ||
          node.id === "validation_lod";
      }

      if (viewMode === "preuves") {
        matchView =
          node.type === "preuve" ||
          node.type === "validation" ||
          node.type === "decision" ||
          node.lod === "L3" ||
          node.id === "produit";
      }

      if (viewMode === "lod") {
        matchView =
          node.type === "produit" ||
          node.entity === "TRANSVERSE" ||
          node.type === "entite_lod";
      }

      if (matchSearch && matchLOD && matchEntity && matchView) {
        ids.add(node.id);
      }
    }

    if (viewMode === "risques") {
      for (const edge of edges) {
        if (ids.has(edge.source) || ids.has(edge.target)) {
          ids.add(edge.source);
          ids.add(edge.target);
        }
      }
    }

    if (viewMode === "preuves") {
      for (const edge of edges) {
        if (ids.has(edge.source) || ids.has(edge.target)) {
          ids.add(edge.source);
          ids.add(edge.target);
        }
      }
    }

    return ids;
  }, [nodes, edges, search, lodFilter, entityFilter, viewMode]);

  const visibleEdges = useMemo(() => {
    return edges.filter((edge) => {
      const matchRelation = relationFilter === "ALL" || edge.type === relationFilter;
      return (
        visibleNodeIds.has(edge.source) &&
        visibleNodeIds.has(edge.target) &&
        matchRelation
      );
    });
  }, [edges, visibleNodeIds, relationFilter]);

  const connectedNodeIds = useMemo(() => {
    const set = new Set<string>();

    if (!selectedNodeId) return set;

    set.add(selectedNodeId);

    for (const edge of edges) {
      if (edge.source === selectedNodeId) {
        set.add(edge.target);
      }
      if (edge.target === selectedNodeId) {
        set.add(edge.source);
      }
    }

    return set;
  }, [edges, selectedNodeId]);

  const connectedEdges = useMemo(() => {
    if (!selectedNodeId) return [];
    return edges.filter(
      (edge) => edge.source === selectedNodeId || edge.target === selectedNodeId
    );
  }, [edges, selectedNodeId]);

  const visibleNodes = nodes.filter((node) => visibleNodeIds.has(node.id));

  function nodeRadius(node: GraphNode) {
    if (node.type === "produit") return 44;
    if (node.entity === "TRANSVERSE") return 34;
    return 38;
  }

  function nodeOpacity(node: GraphNode) {
    if (!selectedNodeId) return 1;
    if (connectedNodeIds.has(node.id)) return 1;
    return 0.18;
  }

  function edgeOpacity(edge: GraphEdge) {
    if (!selectedNodeId) return 0.7;
    if (edge.source === selectedNodeId || edge.target === selectedNodeId) return 1;
    if (connectedNodeIds.has(edge.source) && connectedNodeIds.has(edge.target)) return 0.35;
    return 0.08;
  }

  function resetFilters() {
    setLodFilter("ALL");
    setEntityFilter("ALL");
    setRelationFilter("ALL");
    setViewMode("global");
    setSearch("");
    setSelectedNodeId("produit");
  }

  return (
    <main className="viewerPage">
      <section className="topbar">
        <div>
          <p className="eyebrow">Mini-PLM · Architecture réseau V0</p>
          <h1>Correspondances BE / BM / SIM / FA / CND par LOD</h1>
        </div>

        <div className="toolbar">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher un nœud..."
          />

          <select value={viewMode} onChange={(event) => setViewMode(event.target.value as any)}>
            <option value="global">Vue globale</option>
            <option value="lod">Vue LOD</option>
            <option value="risques">Vue risques</option>
            <option value="preuves">Vue preuves</option>
          </select>

          <select value={lodFilter} onChange={(event) => setLodFilter(event.target.value as any)}>
            <option value="ALL">Tous LOD</option>
            <option value="L1">LOD L1</option>
            <option value="L2">LOD L2</option>
            <option value="L3">LOD L3</option>
          </select>

          <select
            value={entityFilter}
            onChange={(event) => setEntityFilter(event.target.value as any)}
          >
            <option value="ALL">Toutes entités</option>
            <option value="BE">BE</option>
            <option value="BM">BM</option>
            <option value="SIM">SIM</option>
            <option value="FA">FA</option>
            <option value="CND">CND</option>
            <option value="TRANSVERSE">Transverse</option>
          </select>

          <select
            value={relationFilter}
            onChange={(event) => setRelationFilter(event.target.value as any)}
          >
            <option value="ALL">Toutes relations</option>
            <option value="alimente">alimente</option>
            <option value="impacte">impacte</option>
            <option value="correspond">correspond</option>
            <option value="simule">simule</option>
            <option value="industrialise">industrialise</option>
            <option value="controle">controle</option>
            <option value="bloque">bloque</option>
            <option value="justifie">justifie</option>
            <option value="corrige">corrige</option>
            <option value="valide">valide</option>
          </select>

          <button onClick={resetFilters}>Réinitialiser</button>
        </div>
      </section>

      <section className="layout">
        <div className="graphCard">
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="graphSvg" role="img">
            <defs>
              <marker
                id="arrow"
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L0,6 L9,3 z" fill="#cbd5e1" />
              </marker>

              <filter id="nodeGlow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <circle cx={CX} cy={CY} r="160" className="lodRing" />
            <circle cx={CX} cy={CY} r="295" className="lodRing" />
            <circle cx={CX} cy={CY} r="430" className="lodRing" />

            <text x={CX + 15} y={CY - 165} className="ringLabel">
              L1 · Cadrage
            </text>
            <text x={CX + 15} y={CY - 300} className="ringLabel">
              L2 · Convergence
            </text>
            <text x={CX + 15} y={CY - 435} className="ringLabel">
              L3 · Validation
            </text>

            {visibleEdges.map((edge) => {
              const source = nodeById.get(edge.source);
              const target = nodeById.get(edge.target);

              if (!source || !target) return null;

              const color = RELATION_COLORS[edge.type];

              return (
                <g key={edge.id} opacity={edgeOpacity(edge)}>
                  <line
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    stroke={color}
                    strokeWidth={edge.criticality === "forte" ? 2.3 : 1.4}
                    strokeDasharray={edge.bidirectional ? "5 6" : undefined}
                    markerEnd={edge.bidirectional ? undefined : "url(#arrow)"}
                  />
                </g>
              );
            })}

            {visibleNodes.map((node) => {
              const radius = nodeRadius(node);
              const selected = selectedNodeId === node.id;
              const labelLines = wrapLabel(node.label, node.type === "produit" ? 22 : 17);

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={() => setSelectedNodeId(node.id)}
                  className="nodeGroup"
                  opacity={nodeOpacity(node)}
                  filter={selected ? "url(#nodeGlow)" : undefined}
                >
                  <circle
                    r={radius}
                    fill={ENTITY_COLORS[node.entity]}
                    stroke={selected ? "#ffffff" : STATUS_COLORS[node.status]}
                    strokeWidth={selected ? 4 : 3}
                  />

                  <circle
                    r={radius - 8}
                    fill="transparent"
                    stroke="rgba(15,23,42,0.55)"
                    strokeWidth="7"
                    strokeDasharray={`${Math.max(node.maturity, 1)} ${100 - Math.max(node.maturity, 1)}`}
                    pathLength="100"
                    transform="rotate(-90)"
                  />

                  <text className="nodeText" textAnchor="middle">
                    {labelLines.map((line, index) => (
                      <tspan
                        key={`${node.id}_${line}_${index}`}
                        x="0"
                        y={(index - (labelLines.length - 1) / 2) * 12}
                      >
                        {line}
                      </tspan>
                    ))}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <aside className="sidePanel">
          <div className="panelBlock">
            <p className="panelLabel">Nœud sélectionné</p>

            {selectedNode ? (
              <>
                <div className="selectedHeader">
                  <span
                    className="dot"
                    style={{ background: ENTITY_COLORS[selectedNode.entity] }}
                  />
                  <div>
                    <h2>{selectedNode.label}</h2>
                    <p>
                      {selectedNode.entity}
                      {selectedNode.lod ? ` · ${selectedNode.lod}` : ""} ·{" "}
                      {selectedNode.type}
                    </p>
                  </div>
                </div>

                <p className="description">{selectedNode.description}</p>

                <div className="metricGrid">
                  <div>
                    <span>Maturité</span>
                    <strong>{selectedNode.maturity}%</strong>
                  </div>
                  <div>
                    <span>Statut</span>
                    <strong>{selectedNode.status}</strong>
                  </div>
                </div>

                <div className="progressTrack">
                  <div
                    className="progressFill"
                    style={{
                      width: `${selectedNode.maturity}%`,
                      background: STATUS_COLORS[selectedNode.status],
                    }}
                  />
                </div>
              </>
            ) : (
              <p>Aucun nœud sélectionné.</p>
            )}
          </div>

          <div className="panelBlock">
            <p className="panelLabel">Relations directes</p>

            <div className="edgeList">
              {connectedEdges.length === 0 ? (
                <p className="empty">Aucune relation directe.</p>
              ) : (
                connectedEdges.map((edge) => {
                  const source = nodeById.get(edge.source);
                  const target = nodeById.get(edge.target);

                  return (
                    <button
                      key={edge.id}
                      className="edgeItem"
                      onClick={() =>
                        setSelectedNodeId(edge.source === selectedNodeId ? edge.target : edge.source)
                      }
                    >
                      <span
                        className="relationColor"
                        style={{ background: RELATION_COLORS[edge.type] }}
                      />
                      <span>
                        <strong>{edge.type}</strong>
                        <small>
                          {source?.label} → {target?.label}
                        </small>
                        <em>{edge.label}</em>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="panelBlock">
            <p className="panelLabel">Lecture du modèle</p>

            <ul className="readingList">
              <li>
                <strong>L1</strong> : cadrage métier et hypothèses fortes.
              </li>
              <li>
                <strong>L2</strong> : convergence entre conception, méthodes,
                simulation, fabrication et contrôle.
              </li>
              <li>
                <strong>L3</strong> : définition validée, preuves, dossier et PV.
              </li>
              <li>
                Les liens orange/rouge montrent les impacts ou blocages critiques.
              </li>
            </ul>
          </div>
        </aside>
      </section>

      <style jsx>{`
        .viewerPage {
          min-height: 100vh;
          background:
            radial-gradient(circle at 20% 20%, rgba(59, 130, 246, 0.16), transparent 30%),
            radial-gradient(circle at 80% 10%, rgba(168, 85, 247, 0.14), transparent 28%),
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
          font-weight: 700;
        }

        h1 {
          margin: 0;
          font-size: 25px;
          line-height: 1.2;
          font-weight: 750;
          color: #f8fafc;
        }

        .toolbar {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 8px;
          max-width: 860px;
        }

        .toolbar input,
        .toolbar select,
        .toolbar button {
          border: 1px solid rgba(148, 163, 184, 0.28);
          background: rgba(15, 23, 42, 0.82);
          color: #e5e7eb;
          border-radius: 12px;
          padding: 10px 11px;
          font-size: 13px;
          outline: none;
        }

        .toolbar input {
          width: 210px;
        }

        .toolbar button {
          cursor: pointer;
          font-weight: 700;
          background: rgba(37, 99, 235, 0.35);
        }

        .layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 370px;
          gap: 18px;
          align-items: stretch;
        }

        .graphCard {
          min-height: 760px;
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
          min-height: 760px;
          display: block;
        }

        .lodRing {
          fill: none;
          stroke: rgba(203, 213, 225, 0.12);
          stroke-width: 1.3;
          stroke-dasharray: 8 8;
        }

        .ringLabel {
          fill: rgba(226, 232, 240, 0.52);
          font-size: 13px;
          font-weight: 700;
        }

        .nodeGroup {
          cursor: pointer;
          transition: opacity 0.2s ease;
        }

        .nodeText {
          pointer-events: none;
          fill: #020617;
          font-size: 10px;
          font-weight: 850;
          letter-spacing: -0.02em;
        }

        .sidePanel {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .panelBlock {
          border: 1px solid rgba(148, 163, 184, 0.2);
          background: rgba(15, 23, 42, 0.82);
          border-radius: 22px;
          padding: 16px;
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.25);
        }

        .panelLabel {
          margin: 0 0 12px 0;
          font-size: 11px;
          font-weight: 800;
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

        .metricGrid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-bottom: 10px;
        }

        .metricGrid div {
          border: 1px solid rgba(148, 163, 184, 0.16);
          border-radius: 14px;
          padding: 11px;
          background: rgba(2, 6, 23, 0.45);
        }

        .metricGrid span {
          display: block;
          color: #94a3b8;
          font-size: 11px;
          margin-bottom: 4px;
        }

        .metricGrid strong {
          font-size: 15px;
          color: #f8fafc;
        }

        .progressTrack {
          height: 8px;
          border-radius: 999px;
          background: rgba(148, 163, 184, 0.14);
          overflow: hidden;
        }

        .progressFill {
          height: 100%;
          border-radius: 999px;
        }

        .edgeList {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 315px;
          overflow: auto;
          padding-right: 4px;
        }

        .edgeItem {
          width: 100%;
          display: grid;
          grid-template-columns: 9px 1fr;
          gap: 10px;
          border: 1px solid rgba(148, 163, 184, 0.16);
          background: rgba(2, 6, 23, 0.42);
          color: #e5e7eb;
          border-radius: 14px;
          padding: 10px;
          text-align: left;
          cursor: pointer;
        }

        .edgeItem:hover {
          border-color: rgba(147, 197, 253, 0.45);
          background: rgba(30, 41, 59, 0.62);
        }

        .relationColor {
          width: 9px;
          height: 100%;
          min-height: 46px;
          border-radius: 999px;
        }

        .edgeItem strong {
          display: block;
          font-size: 13px;
          margin-bottom: 3px;
        }

        .edgeItem small {
          display: block;
          color: #94a3b8;
          line-height: 1.35;
        }

        .edgeItem em {
          display: block;
          color: #cbd5e1;
          font-style: normal;
          margin-top: 5px;
          font-size: 12px;
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

        @media (max-width: 1180px) {
          .topbar {
            flex-direction: column;
          }

          .toolbar {
            justify-content: flex-start;
          }

          .layout {
            grid-template-columns: 1fr;
          }

          .sidePanel {
            grid-row: 2;
          }
        }
      `}</style>
    </main>
  );
}
