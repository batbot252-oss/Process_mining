"use client";

import { useMemo, useState } from "react";

type Pillar = "PIECE" | "HP" | "GPE";
type LOD = "LOD1" | "LOD2" | "LOD3";
type Entity = "BE" | "BM" | "SIM" | "FA" | "CND" | "TRANSVERSE";

type NodeCategory =
  | "process"
  | "pillar_hub"
  | "entity_function"
  | "gate"
  | "risk"
  | "proof"
  | "decision";

type NodeStatus = "non_demarre" | "en_cours" | "bloque" | "valide";

type RelationType =
  | "structure"
  | "alimente"
  | "impacte"
  | "synchronise"
  | "construit"
  | "valide"
  | "bloque"
  | "justifie"
  | "controle"
  | "industrialise"
  | "fabrique"
  | "simule"
  | "decisionne";

type Criticality = "faible" | "moyenne" | "forte";

type FunctionItem = {
  title: string;
  detail: string;
};

type GraphNode = {
  id: string;
  label: string;
  subtitle: string;
  entity: Entity;
  pillar?: Pillar;
  lod?: LOD;
  category: NodeCategory;
  x: number;
  y: number;
  maturity: number;
  status: NodeStatus;
  description: string;
  functions: FunctionItem[];
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

const WIDTH = 1600;
const HEIGHT = 980;

const PILLARS = ["PIECE", "HP", "GPE"] as const;
const LODS = ["LOD1", "LOD2", "LOD3"] as const;
const ENTITIES = ["BE", "BM", "SIM", "FA", "CND"] as const;

const PILLAR_LABELS: Record<Pillar, string> = {
  PIECE: "Pièce",
  HP: "HP",
  GPE: "GPE",
};

const LOD_LABELS: Record<LOD, string> = {
  LOD1: "LOD1 · Cadrage",
  LOD2: "LOD2 · Convergence",
  LOD3: "LOD3 · Validation",
};

const ENTITY_LABELS: Record<Entity, string> = {
  BE: "BE",
  BM: "BM",
  SIM: "SIM",
  FA: "FA",
  CND: "CND",
  TRANSVERSE: "Transverse",
};

const ENTITY_COLORS: Record<Entity, string> = {
  BE: "#60a5fa",
  BM: "#f59e0b",
  SIM: "#a78bfa",
  FA: "#34d399",
  CND: "#f87171",
  TRANSVERSE: "#e5e7eb",
};

const PILLAR_COLORS: Record<Pillar, string> = {
  PIECE: "#38bdf8",
  HP: "#facc15",
  GPE: "#c084fc",
};

const STATUS_COLORS: Record<NodeStatus, string> = {
  non_demarre: "#64748b",
  en_cours: "#38bdf8",
  bloque: "#ef4444",
  valide: "#22c55e",
};

const RELATION_COLORS: Record<RelationType, string> = {
  structure: "#94a3b8",
  alimente: "#cbd5e1",
  impacte: "#f97316",
  synchronise: "#22d3ee",
  construit: "#60a5fa",
  valide: "#22c55e",
  bloque: "#ef4444",
  justifie: "#a78bfa",
  controle: "#f87171",
  industrialise: "#f59e0b",
  fabrique: "#34d399",
  simule: "#818cf8",
  decisionne: "#facc15",
};

const PILLAR_X: Record<Pillar, number> = {
  PIECE: 360,
  HP: 800,
  GPE: 1240,
};

const LOD_Y: Record<LOD, number> = {
  LOD1: 250,
  LOD2: 530,
  LOD3: 810,
};

const ENTITY_OFFSETS: Record<Exclude<Entity, "TRANSVERSE">, { dx: number; dy: number }> = {
  BE: { dx: -128, dy: -58 },
  BM: { dx: 0, dy: -84 },
  SIM: { dx: 128, dy: -58 },
  FA: { dx: -74, dy: 68 },
  CND: { dx: 74, dy: 68 },
};

function wrapLabel(label: string, maxLength = 15) {
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

function getNodeId(pillar: Pillar, lod: LOD, entity?: Exclude<Entity, "TRANSVERSE">) {
  if (!entity) return `${pillar}_${lod}_HUB`;
  return `${pillar}_${lod}_${entity}`;
}

function maturityByLOD(lod: LOD) {
  if (lod === "LOD1") return 90;
  if (lod === "LOD2") return 55;
  return 25;
}

function statusByLOD(lod: LOD): NodeStatus {
  if (lod === "LOD1") return "valide";
  if (lod === "LOD2") return "en_cours";
  return "non_demarre";
}

function functionsFor(entity: Exclude<Entity, "TRANSVERSE">, pillar: Pillar, lod: LOD): FunctionItem[] {
  const pillarLabel = PILLAR_LABELS[pillar];

  const base: Record<Exclude<Entity, "TRANSVERSE">, Record<LOD, FunctionItem[]>> = {
    BE: {
      LOD1: [
        { title: "Définir l’intention produit", detail: `Fonction attendue sur le pilier ${pillarLabel}.` },
        { title: "Identifier les interfaces", detail: "Interfaces fonctionnelles, géométriques et système." },
        { title: "Porter les exigences", detail: "Exigences principales, contraintes d’encombrement et hypothèses fortes." },
      ],
      LOD2: [
        { title: "Construire la géométrie paramétrée", detail: "Variantes CAO, paramètres, règles de conception." },
        { title: "Préparer la convergence", detail: "Tolérances provisoires, interfaces détaillées, compromis métier." },
        { title: "Intégrer les retours métiers", detail: "Retours BM, SIM, FA et CND dans la définition intermédiaire." },
      ],
      LOD3: [
        { title: "Libérer la définition", detail: "CAO détaillée, plans, tolérances et interfaces figées." },
        { title: "Tracer la maturité", detail: "Lien entre définition finale, preuves et décisions." },
        { title: "Supporter le dossier final", detail: "Données exploitables par méthodes, fabrication et contrôle." },
      ],
    },
    BM: {
      LOD1: [
        { title: "Définir le procédé pressenti", detail: `Première logique industrielle du pilier ${pillarLabel}.` },
        { title: "Identifier les contraintes méthodes", detail: "Fabricabilité, outillage, chaîne process, hypothèses de gamme." },
        { title: "Contribuer aux règles de conception", detail: "Contraintes process à intégrer très tôt par le BE." },
      ],
      LOD2: [
        { title: "Construire la gamme prévisionnelle", detail: "Séquences principales, paramètres process, outillages pressentis." },
        { title: "Vérifier la fabricabilité", detail: "Analyse des formes, accès, reprises, bridage, risques process." },
        { title: "Boucler avec BE et SIM", detail: "Retour sur géométrie et besoin de justification par simulation." },
      ],
      LOD3: [
        { title: "Figer la gamme détaillée", detail: "Fiches méthodes, paramètres process, outillages validés." },
        { title: "Préparer l’exécution FA", detail: "Dossier transmissible atelier." },
        { title: "Associer le plan de contrôle", detail: "Lien direct avec CND et qualité." },
      ],
    },
    SIM: {
      LOD1: [
        { title: "Identifier les phénomènes physiques", detail: `Phénomènes à vérifier sur le pilier ${pillarLabel}.` },
        { title: "Définir les critères calcul", detail: "Critères de performance, marges, zones critiques." },
        { title: "Préparer la stratégie simulation", detail: "Niveau de modèle attendu selon la maturité LOD." },
      ],
      LOD2: [
        { title: "Construire le modèle intermédiaire", detail: "Modèle simplifié ou semi-détaillé, hypothèses et maillage." },
        { title: "Comparer les variantes", detail: "Analyse de sensibilité, paramètres influents, orientation de conception." },
        { title: "Identifier les zones sensibles", detail: "Zones critiques à partager avec BE, BM et CND." },
      ],
      LOD3: [
        { title: "Produire le rapport validé", detail: "Calculs finaux, marges, justification et traçabilité." },
        { title: "Justifier la définition", detail: "Lien entre résultats, CAO libérée et décision RdC." },
        { title: "Appuyer la preuve numérique", detail: "Élément de preuve exploitable dans la validation produit." },
      ],
    },
    FA: {
      LOD1: [
        { title: "Évaluer la capacité atelier", detail: `Moyens et contraintes disponibles pour le pilier ${pillarLabel}.` },
        { title: "Identifier les risques terrain", detail: "Accès, montage, manutention, temps, moyens." },
        { title: "Remonter les contraintes réelles", detail: "Contraintes opérationnelles à intégrer dès le cadrage." },
      ],
      LOD2: [
        { title: "Tester la faisabilité atelier", detail: "Séquences de fabrication, accès, montage, moyens réels." },
        { title: "Contribuer au choix process", detail: "Retours opérationnels sur gamme prévisionnelle." },
        { title: "Qualifier les risques d’exécution", detail: "Points bloquants ou sensibles avant passage en LOD3." },
      ],
      LOD3: [
        { title: "Exécuter le dossier fabrication", detail: "Instructions atelier, moyens, temps, contrôle exécution." },
        { title: "Tracer les écarts", detail: "Écarts entre définition, gamme et fabrication réelle." },
        { title: "Boucler avec qualité et CND", detail: "Non-conformités, retours terrain, actions correctives." },
      ],
    },
    CND: {
      LOD1: [
        { title: "Définir la stratégie de contrôle", detail: `Stratégie CND initiale pour le pilier ${pillarLabel}.` },
        { title: "Identifier les zones critiques", detail: "Zones à risque, défauts potentiels, exigences qualité." },
        { title: "Évaluer la contrôlabilité", detail: "Première lecture des accès et limites de contrôle." },
      ],
      LOD2: [
        { title: "Vérifier l’accessibilité contrôle", detail: "Contrôlabilité des formes, accès, moyens et méthodes candidates." },
        { title: "Relier défauts et procédé", detail: "Défauts probables issus du process, criticité et détectabilité." },
        { title: "Alerter sur les zones non contrôlables", detail: "Blocages à remonter vers BE, BM, SIM et FA." },
      ],
      LOD3: [
        { title: "Figer la procédure CND", detail: "Procédure, critères d’acceptation, fréquence, moyen de contrôle." },
        { title: "Produire le PV contrôle", detail: "Preuve qualité rattachée au produit et au pilier." },
        { title: "Statuer sur la conformité", detail: "Décision conforme / non conforme / dérogation éventuelle." },
      ],
    },
  };

  return base[entity][lod];
}

function buildGraph() {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  let edgeIndex = 0;

  const addEdge = (
    source: string,
    target: string,
    type: RelationType,
    label: string,
    criticality: Criticality = "moyenne",
    bidirectional = false
  ) => {
    edgeIndex += 1;
    edges.push({
      id: `E_${edgeIndex}`,
      source,
      target,
      type,
      label,
      criticality,
      bidirectional,
    });
  };

  nodes.push({
    id: "PROCESS_GLOBAL",
    label: "Processus global",
    subtitle: "Pièce + HP + GPE synchronisés",
    entity: "TRANSVERSE",
    category: "process",
    x: WIDTH / 2,
    y: 76,
    maturity: 55,
    status: "en_cours",
    description:
      "Architecture globale du processus. Les trois piliers Pièce, HP et GPE sont toujours considérés ensemble, avec une lecture LOD1, LOD2 et LOD3.",
    functions: [
      {
        title: "Structurer la continuité numérique",
        detail: "Le produit est suivi par pilier, par LOD et par métier.",
      },
      {
        title: "Maintenir la synchronisation",
        detail: "Pièce, HP et GPE doivent avancer ensemble pour éviter les désalignements.",
      },
      {
        title: "Piloter les correspondances métiers",
        detail: "BE, BM, SIM, FA et CND contribuent à chaque niveau de détail.",
      },
    ],
  });

  for (const lod of LODS) {
    nodes.push({
      id: `SYNC_${lod}`,
      label: `Synchro ${lod}`,
      subtitle: "Pièce + HP + GPE",
      entity: "TRANSVERSE",
      lod,
      category: "gate",
      x: 96,
      y: LOD_Y[lod],
      maturity: maturityByLOD(lod),
      status: statusByLOD(lod),
      description:
        "Point de synchronisation transverse. Aucun pilier ne doit être traité seul : Pièce, HP et GPE doivent être alignés au même LOD.",
      functions: [
        {
          title: "Synchroniser les piliers",
          detail: "Vérifier que Pièce, HP et GPE possèdent le même niveau de maturité.",
        },
        {
          title: "Identifier les écarts",
          detail: "Détecter les piliers en retard, bloqués ou insuffisamment justifiés.",
        },
        {
          title: "Préparer le passage LOD",
          detail: "Garantir que tous les métiers ont contribué avant le changement de niveau.",
        },
      ],
    });

    addEdge("PROCESS_GLOBAL", `SYNC_${lod}`, "structure", `cadre ${lod}`, "moyenne");
  }

  for (const pillar of PILLARS) {
    nodes.push({
      id: `PILLAR_${pillar}`,
      label: PILLAR_LABELS[pillar],
      subtitle: "Pilier processus",
      entity: "TRANSVERSE",
      pillar,
      category: "pillar_hub",
      x: PILLAR_X[pillar],
      y: 76,
      maturity: 55,
      status: "en_cours",
      description: `Pilier ${PILLAR_LABELS[pillar]} du processus global. Ce pilier doit être analysé avec les deux autres piliers, jamais isolément.`,
      functions: [
        {
          title: "Porter la maturité pilier",
          detail: `Suivre les contributions LOD1, LOD2 et LOD3 du pilier ${PILLAR_LABELS[pillar]}.`,
        },
        {
          title: "Croiser les métiers",
          detail: "BE, BM, SIM, FA et CND apportent chacun leurs fonctions.",
        },
        {
          title: "Assurer la cohérence globale",
          detail: "Les décisions prises sur ce pilier peuvent impacter les autres piliers.",
        },
      ],
    });

    addEdge("PROCESS_GLOBAL", `PILLAR_${pillar}`, "structure", `pilier ${PILLAR_LABELS[pillar]}`, "forte");
  }

  addEdge("PILLAR_PIECE", "PILLAR_HP", "synchronise", "Pièce ↔ HP", "forte", true);
  addEdge("PILLAR_HP", "PILLAR_GPE", "synchronise", "HP ↔ GPE", "forte", true);
  addEdge("PILLAR_PIECE", "PILLAR_GPE", "synchronise", "Pièce ↔ GPE", "forte", true);

  for (const pillar of PILLARS) {
    for (const lod of LODS) {
      const hubId = getNodeId(pillar, lod);

      nodes.push({
        id: hubId,
        label: `${PILLAR_LABELS[pillar]} ${lod}`,
        subtitle: LOD_LABELS[lod],
        entity: "TRANSVERSE",
        pillar,
        lod,
        category: "pillar_hub",
        x: PILLAR_X[pillar],
        y: LOD_Y[lod],
        maturity: maturityByLOD(lod),
        status: statusByLOD(lod),
        description: `Nœud de synthèse du pilier ${PILLAR_LABELS[pillar]} au niveau ${lod}. Il agrège les contributions BE, BM, SIM, FA et CND.`,
        functions: [
          {
            title: "Agréger les contributions métiers",
            detail: "Centraliser les fonctions BE, BM, SIM, FA et CND du même LOD.",
          },
          {
            title: "Préparer la décision de maturité",
            detail: "Identifier si le pilier peut passer au LOD suivant.",
          },
          {
            title: "Tracer les dépendances",
            detail: "Afficher les impacts entre métiers et entre piliers.",
          },
        ],
      });

      addEdge(`PILLAR_${pillar}`, hubId, "structure", `${PILLAR_LABELS[pillar]} ${lod}`, "moyenne");
      addEdge(`SYNC_${lod}`, hubId, "synchronise", `alignement ${PILLAR_LABELS[pillar]} ${lod}`, "forte");

      for (const entity of ENTITIES) {
        const pos = ENTITY_OFFSETS[entity];
        const nodeId = getNodeId(pillar, lod, entity);

        let status = statusByLOD(lod);
        let maturity = maturityByLOD(lod);

        if (pillar === "GPE" && lod === "LOD2" && entity === "CND") {
          status = "bloque";
          maturity = 35;
        }

        if (pillar === "PIECE" && lod === "LOD2" && entity === "BE") {
          maturity = 70;
        }

        nodes.push({
          id: nodeId,
          label: `${entity}`,
          subtitle: `${PILLAR_LABELS[pillar]} · ${lod}`,
          entity,
          pillar,
          lod,
          category: "entity_function",
          x: PILLAR_X[pillar] + pos.dx,
          y: LOD_Y[lod] + pos.dy,
          maturity,
          status,
          description: `${entity} contribue au pilier ${PILLAR_LABELS[pillar]} au niveau ${lod}. Ce nœud porte les fonctions métier associées.`,
          functions: functionsFor(entity, pillar, lod),
        });

        addEdge(hubId, nodeId, "alimente", `${entity} contribue à ${PILLAR_LABELS[pillar]} ${lod}`, "moyenne");
      }

      addEdge(getNodeId(pillar, lod, "BE"), getNodeId(pillar, lod, "BM"), "impacte", "BE ↔ BM : conception fabricable", "forte", true);
      addEdge(getNodeId(pillar, lod, "BE"), getNodeId(pillar, lod, "SIM"), "simule", "BE ↔ SIM : géométrie et hypothèses", "forte", true);
      addEdge(getNodeId(pillar, lod, "BM"), getNodeId(pillar, lod, "FA"), "industrialise", "BM ↔ FA : gamme et exécution", "forte", true);
      addEdge(getNodeId(pillar, lod, "FA"), getNodeId(pillar, lod, "CND"), "controle", "FA ↔ CND : fabrication et contrôle", "forte", true);
      addEdge(getNodeId(pillar, lod, "SIM"), getNodeId(pillar, lod, "CND"), "justifie", "SIM ↔ CND : zones critiques", "forte", true);
    }

    addEdge(getNodeId(pillar, "LOD1"), getNodeId(pillar, "LOD2"), "construit", "passage LOD1 → LOD2", "forte");
    addEdge(getNodeId(pillar, "LOD2"), getNodeId(pillar, "LOD3"), "valide", "passage LOD2 → LOD3", "forte");

    for (const entity of ENTITIES) {
      addEdge(getNodeId(pillar, "LOD1", entity), getNodeId(pillar, "LOD2", entity), "construit", `${entity} LOD1 → LOD2`, "moyenne");
      addEdge(getNodeId(pillar, "LOD2", entity), getNodeId(pillar, "LOD3", entity), "valide", `${entity} LOD2 → LOD3`, "moyenne");
    }
  }

  for (const lod of LODS) {
    addEdge(getNodeId("PIECE", lod), getNodeId("HP", lod), "synchronise", `Pièce ↔ HP au ${lod}`, "forte", true);
    addEdge(getNodeId("HP", lod), getNodeId("GPE", lod), "synchronise", `HP ↔ GPE au ${lod}`, "forte", true);

    for (const entity of ENTITIES) {
      addEdge(getNodeId("PIECE", lod, entity), getNodeId("HP", lod, entity), "synchronise", `${entity} : Pièce ↔ HP`, "moyenne", true);
      addEdge(getNodeId("HP", lod, entity), getNodeId("GPE", lod, entity), "synchronise", `${entity} : HP ↔ GPE`, "moyenne", true);
    }
  }

  nodes.push(
    {
      id: "RISK_DESALIGNEMENT",
      label: "Risque désalignement",
      subtitle: "Pièce / HP / GPE",
      entity: "TRANSVERSE",
      category: "risk",
      x: 1500,
      y: 408,
      maturity: 15,
      status: "bloque",
      description:
        "Risque principal de cette architecture : un pilier ou un métier avance sans correspondance équivalente dans les autres piliers.",
      functions: [
        {
          title: "Détecter les écarts de maturité",
          detail: "Comparer les états LOD1, LOD2 et LOD3 entre Pièce, HP et GPE.",
        },
        {
          title: "Identifier les métiers bloquants",
          detail: "Exemple : CND bloqué sur GPE LOD2 à cause d’une accessibilité contrôle insuffisante.",
        },
        {
          title: "Éviter les décisions locales",
          detail: "Empêcher une validation isolée qui ne serait pas cohérente avec les autres piliers.",
        },
      ],
    },
    {
      id: "DECISION_ARBITRAGE",
      label: "Décision arbitrage",
      subtitle: "Revue de conception",
      entity: "TRANSVERSE",
      category: "decision",
      x: 1500,
      y: 560,
      maturity: 70,
      status: "en_cours",
      description:
        "Décision transverse permettant d’arbitrer entre contraintes BE, BM, SIM, FA et CND sur les trois piliers.",
      functions: [
        {
          title: "Arbitrer les conflits",
          detail: "Décider entre performance produit, fabricabilité, simulation, fabrication et contrôle.",
        },
        {
          title: "Définir les actions correctives",
          detail: "Réorienter un pilier, un métier ou un niveau LOD.",
        },
        {
          title: "Tracer la décision",
          detail: "Associer la décision aux preuves numériques et aux fonctions métier impactées.",
        },
      ],
    },
    {
      id: "PROOF_MATURITY",
      label: "Preuve maturité",
      subtitle: "LOD3 / validation",
      entity: "TRANSVERSE",
      category: "proof",
      x: 1500,
      y: 712,
      maturity: 65,
      status: "en_cours",
      description:
        "Ensemble de preuves permettant de justifier la maturité du processus : CAO libérée, gamme, calculs, fabrication et PV contrôle.",
      functions: [
        {
          title: "Rassembler les preuves",
          detail: "Plans, CAO, rapports simulation, gammes, PV CND, décisions RdC.",
        },
        {
          title: "Justifier le passage LOD3",
          detail: "Valider que chaque pilier dispose de preuves suffisantes.",
        },
        {
          title: "Alimenter la continuité numérique",
          detail: "Créer un lien exploitable entre données produit, processus et décisions.",
        },
      ],
    }
  );

  addEdge(getNodeId("GPE", "LOD2", "CND"), "RISK_DESALIGNEMENT", "bloque", "CND GPE LOD2 bloqué", "forte");
  addEdge("RISK_DESALIGNEMENT", "DECISION_ARBITRAGE", "decisionne", "arbitrage nécessaire", "forte");
  addEdge("DECISION_ARBITRAGE", getNodeId("GPE", "LOD2", "BE"), "impacte", "retour vers définition", "forte");
  addEdge("DECISION_ARBITRAGE", getNodeId("GPE", "LOD2", "BM"), "impacte", "retour vers gamme", "forte");
  addEdge(getNodeId("PIECE", "LOD3", "SIM"), "PROOF_MATURITY", "justifie", "rapport simulation", "moyenne");
  addEdge(getNodeId("HP", "LOD3", "BM"), "PROOF_MATURITY", "justifie", "gamme validée", "moyenne");
  addEdge(getNodeId("GPE", "LOD3", "CND"), "PROOF_MATURITY", "justifie", "PV contrôle", "moyenne");
  addEdge("PROOF_MATURITY", "PROCESS_GLOBAL", "valide", "preuve de maturité globale", "forte");

  return { nodes, edges };
}

function nodeRadius(node: GraphNode) {
  if (node.category === "process") return 52;
  if (node.category === "pillar_hub") return 42;
  if (node.category === "gate") return 38;
  if (node.category === "risk" || node.category === "decision" || node.category === "proof") return 40;
  return 31;
}

function nodeFill(node: GraphNode) {
  if (node.category === "pillar_hub" && node.pillar) return PILLAR_COLORS[node.pillar];
  if (node.category === "gate") return "#e5e7eb";
  if (node.category === "risk") return "#ef4444";
  if (node.category === "decision") return "#facc15";
  if (node.category === "proof") return "#a78bfa";
  return ENTITY_COLORS[node.entity];
}

export default function ViewerPage() {
  const { nodes, edges } = useMemo(() => buildGraph(), []);

  const [selectedNodeId, setSelectedNodeId] = useState<string>("PROCESS_GLOBAL");
  const [pillarFilter, setPillarFilter] = useState<Pillar | "ALL">("ALL");
  const [lodFilter, setLodFilter] = useState<LOD | "ALL">("ALL");
  const [entityFilter, setEntityFilter] = useState<Entity | "ALL">("ALL");
  const [relationFilter, setRelationFilter] = useState<RelationType | "ALL">("ALL");
  const [viewMode, setViewMode] = useState<"global" | "piliers" | "lod" | "fonctions" | "risques">("global");
  const [search, setSearch] = useState("");

  const nodeById = useMemo(() => {
    return new Map(nodes.map((node) => [node.id, node]));
  }, [nodes]);

  const selectedNode = nodeById.get(selectedNodeId);

  const visibleNodeIds = useMemo(() => {
    const ids = new Set<string>();

    for (const node of nodes) {
      const matchSearch =
        search.trim().length === 0 ||
        node.label.toLowerCase().includes(search.toLowerCase()) ||
        node.subtitle.toLowerCase().includes(search.toLowerCase()) ||
        node.description.toLowerCase().includes(search.toLowerCase()) ||
        node.functions.some(
          (item) =>
            item.title.toLowerCase().includes(search.toLowerCase()) ||
            item.detail.toLowerCase().includes(search.toLowerCase())
        );

      const matchPillar =
        pillarFilter === "ALL" ||
        node.pillar === pillarFilter ||
        node.category === "process" ||
        node.category === "gate" ||
        node.category === "risk" ||
        node.category === "decision" ||
        node.category === "proof";

      const matchLOD =
        lodFilter === "ALL" ||
        node.lod === lodFilter ||
        node.category === "process" ||
        node.category === "pillar_hub" && !node.lod ||
        node.category === "risk" ||
        node.category === "decision" ||
        node.category === "proof";

      const matchEntity =
        entityFilter === "ALL" ||
        node.entity === entityFilter ||
        node.entity === "TRANSVERSE";

      let matchView = true;

      if (viewMode === "piliers") {
        matchView =
          node.category === "process" ||
          node.category === "pillar_hub" ||
          node.category === "gate";
      }

      if (viewMode === "lod") {
        matchView =
          node.category === "process" ||
          node.category === "gate" ||
          Boolean(node.lod);
      }

      if (viewMode === "fonctions") {
        matchView =
          node.category === "process" ||
          node.category === "pillar_hub" ||
          node.category === "entity_function";
      }

      if (viewMode === "risques") {
        matchView =
          node.category === "risk" ||
          node.category === "decision" ||
          node.category === "proof" ||
          node.status === "bloque" ||
          node.id === "PROCESS_GLOBAL";
      }

      if (matchSearch && matchPillar && matchLOD && matchEntity && matchView) {
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

    return ids;
  }, [nodes, edges, search, pillarFilter, lodFilter, entityFilter, viewMode]);

  const visibleEdges = useMemo(() => {
    return edges.filter((edge) => {
      const matchRelation = relationFilter === "ALL" || edge.type === relationFilter;
      return visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target) && matchRelation;
    });
  }, [edges, visibleNodeIds, relationFilter]);

  const connectedNodeIds = useMemo(() => {
    const ids = new Set<string>();
    ids.add(selectedNodeId);

    for (const edge of edges) {
      if (edge.source === selectedNodeId) ids.add(edge.target);
      if (edge.target === selectedNodeId) ids.add(edge.source);
    }

    return ids;
  }, [edges, selectedNodeId]);

  const connectedEdges = useMemo(() => {
    return edges.filter((edge) => edge.source === selectedNodeId || edge.target === selectedNodeId);
  }, [edges, selectedNodeId]);

  const visibleNodes = nodes.filter((node) => visibleNodeIds.has(node.id));

  function nodeOpacity(node: GraphNode) {
    if (!selectedNodeId) return 1;
    if (connectedNodeIds.has(node.id)) return 1;
    return 0.18;
  }

  function edgeOpacity(edge: GraphEdge) {
    if (!selectedNodeId) return 0.68;
    if (edge.source === selectedNodeId || edge.target === selectedNodeId) return 1;
    if (connectedNodeIds.has(edge.source) && connectedNodeIds.has(edge.target)) return 0.35;
    return 0.08;
  }

  function resetFilters() {
    setPillarFilter("ALL");
    setLodFilter("ALL");
    setEntityFilter("ALL");
    setRelationFilter("ALL");
    setViewMode("global");
    setSearch("");
    setSelectedNodeId("PROCESS_GLOBAL");
  }

  return (
    <main className="viewerPage">
      <section className="topbar">
        <div>
          <p className="eyebrow">Mini-PLM · Viewer réseau V0.1</p>
          <h1>Architecture Pièce / HP / GPE × LOD × Métiers × Fonctions</h1>
        </div>

        <div className="toolbar">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher..."
          />

          <select value={viewMode} onChange={(event) => setViewMode(event.target.value as any)}>
            <option value="global">Vue globale</option>
            <option value="piliers">Vue piliers</option>
            <option value="lod">Vue LOD</option>
            <option value="fonctions">Vue fonctions</option>
            <option value="risques">Vue risques / preuves</option>
          </select>

          <select value={pillarFilter} onChange={(event) => setPillarFilter(event.target.value as any)}>
            <option value="ALL">Tous piliers</option>
            <option value="PIECE">Pièce</option>
            <option value="HP">HP</option>
            <option value="GPE">GPE</option>
          </select>

          <select value={lodFilter} onChange={(event) => setLodFilter(event.target.value as any)}>
            <option value="ALL">Tous LOD</option>
            <option value="LOD1">LOD1</option>
            <option value="LOD2">LOD2</option>
            <option value="LOD3">LOD3</option>
          </select>

          <select value={entityFilter} onChange={(event) => setEntityFilter(event.target.value as any)}>
            <option value="ALL">Tous métiers</option>
            <option value="BE">BE</option>
            <option value="BM">BM</option>
            <option value="SIM">SIM</option>
            <option value="FA">FA</option>
            <option value="CND">CND</option>
          </select>

          <select value={relationFilter} onChange={(event) => setRelationFilter(event.target.value as any)}>
            <option value="ALL">Toutes relations</option>
            <option value="structure">structure</option>
            <option value="synchronise">synchronise</option>
            <option value="alimente">alimente</option>
            <option value="impacte">impacte</option>
            <option value="construit">construit</option>
            <option value="valide">valide</option>
            <option value="bloque">bloque</option>
            <option value="justifie">justifie</option>
            <option value="controle">controle</option>
            <option value="industrialise">industrialise</option>
            <option value="simule">simule</option>
            <option value="decisionne">decisionne</option>
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
                <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {PILLARS.map((pillar) => (
              <g key={`col_${pillar}`}>
                <rect
                  x={PILLAR_X[pillar] - 190}
                  y={126}
                  width={380}
                  height={780}
                  rx={30}
                  className="pillarZone"
                  stroke={PILLAR_COLORS[pillar]}
                />
                <text x={PILLAR_X[pillar]} y={148} textAnchor="middle" className="pillarTitle">
                  {PILLAR_LABELS[pillar]}
                </text>
              </g>
            ))}

            {LODS.map((lod) => (
              <g key={`row_${lod}`}>
                <line x1={55} y1={LOD_Y[lod]} x2={1545} y2={LOD_Y[lod]} className="lodLine" />
                <text x={64} y={LOD_Y[lod] - 52} className="lodLabel">
                  {LOD_LABELS[lod]}
                </text>
              </g>
            ))}

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
                    strokeWidth={edge.criticality === "forte" ? 2.2 : 1.35}
                    strokeDasharray={edge.bidirectional ? "5 6" : undefined}
                    markerEnd={edge.bidirectional ? undefined : "url(#arrow)"}
                  />
                </g>
              );
            })}

            {visibleNodes.map((node) => {
              const radius = nodeRadius(node);
              const selected = selectedNodeId === node.id;
              const labelLines = wrapLabel(node.label, node.category === "entity_function" ? 8 : 16);

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
                    fill={nodeFill(node)}
                    stroke={selected ? "#ffffff" : STATUS_COLORS[node.status]}
                    strokeWidth={selected ? 4 : 3}
                  />

                  <circle
                    r={radius - 7}
                    fill="transparent"
                    stroke="rgba(15,23,42,0.55)"
                    strokeWidth="6"
                    strokeDasharray={`${Math.max(node.maturity, 1)} ${100 - Math.max(node.maturity, 1)}`}
                    pathLength="100"
                    transform="rotate(-90)"
                  />

                  <text className="nodeText" textAnchor="middle">
                    {labelLines.map((line, index) => (
                      <tspan
                        key={`${node.id}_${index}`}
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
                  <span className="dot" style={{ background: nodeFill(selectedNode) }} />
                  <div>
                    <h2>{selectedNode.label}</h2>
                    <p>
                      {selectedNode.subtitle}
                      {selectedNode.pillar ? ` · ${PILLAR_LABELS[selectedNode.pillar]}` : ""}
                      {selectedNode.lod ? ` · ${selectedNode.lod}` : ""}
                      {selectedNode.entity !== "TRANSVERSE" ? ` · ${ENTITY_LABELS[selectedNode.entity]}` : ""}
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
            <p className="panelLabel">Fonctions métier</p>

            {selectedNode?.functions?.length ? (
              <div className="functionList">
                {selectedNode.functions.map((item, index) => (
                  <div key={`${selectedNode.id}_function_${index}`} className="functionItem">
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty">Aucune fonction associée.</p>
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
                      <span className="relationColor" style={{ background: RELATION_COLORS[edge.type] }} />
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
            <p className="panelLabel">Lecture V0.1</p>

            <ul className="readingList">
              <li>
                <strong>Colonnes</strong> : les 3 piliers Pièce, HP et GPE.
              </li>
              <li>
                <strong>Lignes</strong> : LOD1, LOD2 et LOD3.
              </li>
              <li>
                <strong>Bulles métier</strong> : BE, BM, SIM, FA et CND.
              </li>
              <li>
                <strong>Liens cyan</strong> : synchronisation entre piliers.
              </li>
              <li>
                <strong>Liens orange / rouges</strong> : impacts et blocages critiques.
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
          max-width: 970px;
        }

        .toolbar input,
        .toolbar select,
        .toolbar button {
          border: 1px solid rgba(148, 163, 184, 0.28);
          background: rgba(15, 23, 42, 0.84);
          color: #e5e7eb;
          border-radius: 12px;
          padding: 10px 11px;
          font-size: 13px;
          outline: none;
        }

        .toolbar input {
          width: 180px;
        }

        .toolbar button {
          cursor: pointer;
          font-weight: 800;
          background: rgba(37, 99, 235, 0.34);
        }

        .layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 390px;
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
        }

        .pillarZone {
          fill: rgba(15, 23, 42, 0.2);
          stroke-width: 1.5;
          stroke-opacity: 0.32;
          stroke-dasharray: 8 8;
        }

        .pillarTitle {
          fill: rgba(248, 250, 252, 0.82);
          font-size: 18px;
          font-weight: 850;
          letter-spacing: 0.04em;
        }

        .lodLine {
          stroke: rgba(203, 213, 225, 0.1);
          stroke-width: 1.2;
          stroke-dasharray: 8 10;
        }

        .lodLabel {
          fill: rgba(226, 232, 240, 0.56);
          font-size: 13px;
          font-weight: 800;
        }

        .nodeGroup {
          cursor: pointer;
          transition: opacity 0.2s ease;
        }

        .nodeText {
          pointer-events: none;
          fill: #020617;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: -0.02em;
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

        .functionList {
          display: flex;
          flex-direction: column;
          gap: 9px;
          max-height: 245px;
          overflow: auto;
          padding-right: 4px;
        }

        .functionItem {
          border: 1px solid rgba(148, 163, 184, 0.15);
          background: rgba(2, 6, 23, 0.42);
          border-radius: 14px;
          padding: 10px;
        }

        .functionItem strong {
          display: block;
          color: #f8fafc;
          font-size: 13px;
          margin-bottom: 4px;
        }

        .functionItem p {
          margin: 0;
          color: #cbd5e1;
          font-size: 12.5px;
          line-height: 1.45;
        }

        .edgeList {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 265px;
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
        }
      `}</style>
    </main>
  );
}
