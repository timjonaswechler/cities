import type {
  Neighbors,
  Point,
  Polygon,
  Scenario,
  ScenarioSpec,
  Surface,
  SurfaceKind,
} from "./model";
import { add, circle, rect, ribbon, separated } from "./geometry";

export interface Motif {
  id: string;
  label: string;
}
export interface ScenarioGroup {
  id: string;
  label: string;
  short: string;
  description: string;
  motifs: Motif[];
  widths: string[];
  sides: number[];
  drops: number[];
  sizes: number[];
  accesses: string[];
  neighbors: Neighbors[];
}
const motifs = (items: [string, string][]): Motif[] =>
  items.map(([id, label]) => ({ id, label }));
const roadWidths = ["r3", "r6", "r10", "r3-9"];
const pathWidths = ["p1.5", "p2.5", "p4", "p1.5-4"];
const waterWidths = ["w3", "w7", "w12", "w3-10"];
const pairs = (a: string[], b: string[]) =>
  a.flatMap((x) => b.map((y) => `${x}/${y}`));
const lineMotifs = motifs([
  ["straight", "Gerade"],
  ["curve-left-wide", "Weiter Linksbogen"],
  ["curve-right-wide", "Weiter Rechtsbogen"],
  ["curve-left-tight", "Enger Linksbogen"],
  ["curve-right-tight", "Enger Rechtsbogen"],
  ["s-left", "S-Kurve links"],
  ["s-right", "S-Kurve rechts"],
  ["corner-left-45", "Linksknick 45°"],
  ["corner-right-45", "Rechtsknick 45°"],
  ["corner-left-90", "Linksknick 90°"],
  ["corner-right-90", "Rechtsknick 90°"],
  ["hairpin-left", "Kehre links"],
  ["hairpin-right", "Kehre rechts"],
]);
const comboMotifs = motifs([
  ["parallel", "Parallel am Ufer"],
  ["converging", "Zwischen Ufer und Trasse"],
  ["bridge", "Gerade Brücke"],
  ["skew-bridge", "Schräge Brücke"],
  ["bend-bridge", "Brücke im Bogen"],
  ["bridgehead", "Knoten am Brückenkopf"],
  ["quay-end", "Sackgasse am Kai"],
  ["tributary", "An der Flussmündung"],
]);
const common = {
  sides: [0, 1],
  drops: [0],
  sizes: [1],
  accesses: ["none"],
  neighbors: ["none", "one", "dense"] as Neighbors[],
};
export const GROUPS: ScenarioGroup[] = [
  {
    ...common,
    id: "streets",
    label: "Straßenverläufe",
    short: "Straßen",
    description:
      "Geraden, Bögen, S-Kurven, Knicke und Kehren; jede Breite, beide Spiegelungen und alle Nachbarschaften.",
    motifs: lineMotifs,
    widths: roadWidths,
  },
  {
    ...common,
    id: "paths",
    label: "Wege & Gassen",
    short: "Wege",
    description:
      "Dieselben Verlaufstypen mit schmalen Wegen, Gassen und veränderlichen Querschnitten.",
    motifs: lineMotifs,
    widths: pathWidths,
  },
  {
    ...common,
    id: "junctions",
    label: "Kreuzungen & Knoten",
    short: "Kreuzungen",
    description:
      "Drei bis sechs Arme, spitze und stumpfe Winkel, versetzte Knoten und unabhängige Armbreiten.",
    motifs: motifs([
      ["t", "T-Kreuzung"],
      ["t-skew", "Schräges T"],
      ["y", "Symmetrisches Y"],
      ["y-skew", "Asymmetrisches Y"],
      ["cross", "Rechtwinkliges Kreuz"],
      ["cross-skew", "Schräges Kreuz"],
      ["offset", "Versetzte Kreuzung"],
      ["five", "Fünfarmiger Knoten"],
      ["six", "Sechsarmiger Knoten"],
      ["roundabout", "Kleiner Kreisplatz"],
    ]),
    widths: roadWidths,
    sides: [0, 1, 2, 3],
  },
  {
    ...common,
    id: "deadends",
    label: "Sackgassen & Zufahrten",
    short: "Sackgassen",
    description:
      "Offenes Ende, Wendeplatz, Wendehammer, geknickte Einfahrt und erschlossene Höfe.",
    motifs: motifs([
      ["plain", "Gerades Ende"],
      ["bulb", "Runder Wendeplatz"],
      ["hammer", "Wendehammer"],
      ["bent", "Geknickte Zufahrt"],
      ["driveway", "Schmale Hofeinfahrt"],
      ["court", "Hof mit Zufahrt"],
    ]),
    widths: [...roadWidths, "p1.5", "p3"],
  },
  {
    ...common,
    id: "spaces",
    label: "Plätze & Freiflächen",
    short: "Freiflächen",
    description:
      "Geschützte freie Flächen: Haus am Rand statt Haus auf dem Platz. Drei Größen und drei Erschließungsarten.",
    motifs: motifs([
      ["square", "Quadratischer Platz"],
      ["long", "Langer Marktstreifen"],
      ["triangle", "Dreieckiger Platz"],
      ["round", "Runder Anger"],
      ["court", "Offener Hof"],
      ["l-space", "L-förmige Freifläche"],
    ]),
    widths: ["r6"],
    sizes: [0.75, 1, 1.3],
    accesses: ["none", "road", "path"],
  },
  {
    ...common,
    id: "waterways",
    label: "Bäche, Flüsse & Kanäle",
    short: "Fließwasser",
    description:
      "Gerade und gekrümmte Ufer, Kanalwinkel, Verzweigungen und mehrere Wasserarme. Drei sichtbare Uferhöhen.",
    motifs: motifs([
      ["straight", "Gerader Wasserlauf"],
      ["curve-left-wide", "Weiter Flussbogen links"],
      ["curve-right-wide", "Weiter Flussbogen rechts"],
      ["curve-left-tight", "Enger Flussbogen links"],
      ["curve-right-tight", "Enger Flussbogen rechts"],
      ["s-left", "Mäander links"],
      ["s-right", "Mäander rechts"],
      ["canal", "Rechtwinkliger Kanal"],
      ["fork", "Flussgabelung"],
      ["channels", "Zwei Wasserarme"],
    ]),
    widths: waterWidths,
    drops: [0.6, 1.4, 2.4],
  },
  {
    ...common,
    id: "shores",
    label: "Teiche, Seen & Küsten",
    short: "Ufer & Inseln",
    description:
      "Geschlossene Gewässer und offene Küsten, Buchten, Halbinseln und Inseln. Das Wasser liegt stets unter dem Baugrund.",
    motifs: motifs([
      ["pond", "Runder Teich"],
      ["long-pond", "Langer Teich"],
      ["lake", "Seeufer"],
      ["coast", "Gerade Küste"],
      ["bay", "Bucht"],
      ["peninsula", "Halbinsel"],
      ["island", "Insel"],
      ["corner-shore", "Ufer an zwei Seiten"],
    ]),
    widths: ["w7"],
    sizes: [0.75, 1, 1.3],
    drops: [0.6, 1.4, 2.4],
  },
  {
    ...common,
    id: "road-water",
    label: "Straße × Wasser",
    short: "Straße + Wasser",
    description:
      "Jede Straßenbreite mit jeder Wasserbreite: parallel, zusammenlaufend, querend, schräg, gekrümmt und am Brückenkopf.",
    motifs: comboMotifs,
    widths: pairs(roadWidths, waterWidths),
    drops: [0.6, 1.4, 2.4],
  },
  {
    ...common,
    id: "path-water",
    label: "Weg × Wasser",
    short: "Weg + Wasser",
    description:
      "Alle Ufer- und Querungssituationen auch mit schmalen Wegen, Fußbrücken und Hofzufahrten.",
    motifs: comboMotifs,
    widths: pairs(pathWidths, waterWidths),
    drops: [0.6, 1.4, 2.4],
  },
  {
    ...common,
    id: "mixed",
    label: "Straße × Weg × Wasser",
    short: "Kombinationen",
    description:
      "Drei Systeme gemeinsam: Straßenknoten, schmaler Weg, Wasser und Nachbarn. Straßen- und Wasserbreiten werden unabhängig kombiniert.",
    motifs: motifs([
      ["t-bridge", "T-Knoten mit Uferweg"],
      ["cross-bridge", "Kreuzung und Fußbrücke"],
      ["island-access", "Insel mit zwei Zugängen"],
      ["court-water", "Hofzufahrt am Wasser"],
      ["market-water", "Marktrand mit Uferweg"],
      ["canal-corner", "Kanalwinkel mit Eckweg"],
    ]),
    widths: pairs(roadWidths, waterWidths),
    drops: [0.6, 1.4, 2.4],
  },
  {
    ...common,
    id: "limits",
    label: "Bewusste Grenzfälle",
    short: "Grenzfälle",
    description:
      "Vier absichtlich unbebaubare Fälle. Ablehnung ist hier das richtige Ergebnis, nicht versteckte Verkleinerung.",
    motifs: motifs([
      ["blocked", "Vollständig verbaut"],
      ["flooded", "Vollständig im Wasser"],
      ["reserved", "Vollständig freizuhalten"],
      ["tiny", "Zu kleiner Bauraum"],
    ]),
    widths: ["r6"],
    sides: [0],
    neighbors: ["none"],
  },
];

function catalog(): ScenarioSpec[] {
  const result: ScenarioSpec[] = [];
  for (const group of GROUPS)
    for (const motif of group.motifs)
      for (const widths of group.widths)
        for (const side of group.sides)
          for (const waterDrop of group.drops)
            for (const size of group.sizes)
              for (const access of group.accesses)
                for (const neighbors of group.neighbors) {
                  result.push({
                    id: [
                      group.id,
                      motif.id,
                      widths.replaceAll("/", "+"),
                      side,
                      waterDrop,
                      size,
                      access,
                      neighbors,
                    ].join("~"),
                    group: group.id,
                    motif: motif.id,
                    label: motif.label,
                    widths,
                    side,
                    waterDrop,
                    size,
                    access,
                    neighbors,
                  });
                }
  return result;
}
export const CATALOG = catalog();

export function widthLabel(profile: string): string {
  return profile
    .split("/")
    .map((part) => {
      const kind =
        part[0] === "w" ? "Wasser" : part[0] === "p" ? "Weg" : "Straße";
      return `${kind} ${part.slice(1).replace("-", "–")} m`;
    })
    .join(" · ");
}

function widthValues(profile: string, prefix: string): [number, number] {
  const token = profile.split("/").find((p) => p.startsWith(prefix));
  if (!token) return prefix === "w" ? [7, 7] : [3, 3];
  const values = token.slice(1).split("-").map(Number);
  return [values[0], values[1] ?? values[0]];
}
const p = (x: number, z: number): Point => ({ x, z });
function arc(
  center: Point,
  radius: number,
  start: number,
  end: number,
  count = 20,
): Point[] {
  return Array.from({ length: count + 1 }, (_, i) => {
    const a = ((start + ((end - start) * i) / count) * Math.PI) / 180;
    return add(center, p(Math.cos(a) * radius, Math.sin(a) * radius));
  });
}
function lineShape(motif: string): Point[] {
  if (motif === "straight") return [p(-26, -7), p(26, -7)];
  const right = motif.includes("right");
  if (motif.startsWith("curve")) {
    const r = motif.includes("tight") ? 10 : 20;
    const points = arc(p(0, r - 7), r, 205, 335, 24);
    return right ? points.map((v) => p(v.x, -14 - v.z)) : points;
  }
  if (motif.startsWith("s-"))
    return Array.from({ length: 33 }, (_, i) => {
      const x = -26 + (i * 52) / 32;
      return p(x, -7 + Math.sin(x / 8) * (right ? -5 : 5));
    });
  if (motif.startsWith("hairpin"))
    return arc(p(right ? 6 : -6, -4), 9, 90, right ? -110 : 290, 28);
  const sign = right ? -1 : 1;
  return motif.includes("45")
    ? [p(-26, -7), p(-5, -7), p(22, -7 + sign * 27)]
    : [p(-26, -7), p(-5, -7), p(-5, sign * 26)];
}

/** Synthetic fixtures only. No Rust, archived city data, or inferred city parcels. */
export function buildScenario(spec: ScenarioSpec): Scenario {
  const surfaces: Surface[] = [];
  const notes: string[] = [];
  const group = spec.group,
    motif = spec.motif;
  const roadKind: SurfaceKind = spec.widths.startsWith("p") ? "path" : "road";
  const [rw, re] = widthValues(spec.widths, roadKind === "path" ? "p" : "r");
  const [ww, we] = widthValues(spec.widths, "w");
  function area(kind: SurfaceKind, polygons: Polygon[]) {
    surfaces.push({
      id: `${kind}-${surfaces.length}`,
      kind,
      polygons,
      ...(kind === "water" ? { drop: spec.waterDrop || 1.4 } : {}),
    });
  }
  function line(kind: SurfaceKind, points: Point[], start = rw, end = re) {
    const widths = points.map(
      (_, i) => start + ((end - start) * i) / (points.length - 1),
    );
    surfaces.push({
      id: `${kind}-${surfaces.length}`,
      kind,
      polygons: ribbon(points, widths),
      centerline: points,
      widths,
      ...(kind === "water" ? { drop: spec.waterDrop || 1.4 } : {}),
    });
  }
  function water(points: Point[]) {
    line("water", points, ww, we);
  }
  function road(points: Point[]) {
    line(roadKind, points);
  }
  function path(points: Point[]) {
    line("path", points, 1.8, 2.8);
  }
  if (group === "streets" || group === "paths") road(lineShape(motif));
  if (group === "junctions") {
    const center = p(-5, -6);
    const angles: Record<string, number[]> = {
      t: [0, 180, 90],
      "t-skew": [0, 180, 55],
      y: [90, 210, 330],
      "y-skew": [70, 190, 315],
      cross: [0, 90, 180, 270],
      "cross-skew": [0, 60, 180, 240],
      five: [0, 72, 144, 216, 288],
      six: [0, 60, 120, 180, 240, 300],
    };
    if (motif === "offset") {
      road([p(-26, -6), p(26, -6)]);
      road([p(-10, -26), p(-10, -6)]);
      road([p(4, -6), p(4, 26)]);
    } else if (motif === "roundabout") {
      road(arc(center, 7, 0, 360, 40));
      road([p(-26, -6), p(-12, -6)]);
      road([p(2, -6), p(26, -6)]);
      road([p(-5, 1), p(-5, 26)]);
      area("square", [
        circle(center, Math.max(1, 7 - Math.max(rw, re) / 2 - 0.5)),
      ]);
    } else {
      for (const [i, degrees] of angles[motif].entries()) {
        const a = (degrees * Math.PI) / 180;
        // In the tapered profile, individual arms have genuinely different widths.
        const width = rw === re ? rw : i % 2 ? re : rw;
        line(
          "road",
          [center, add(center, p(Math.cos(a) * 40, Math.sin(a) * 40))],
          width,
          rw === re ? width : re,
        );
      }
    }
  }
  if (group === "deadends") {
    if (motif === "bent" || motif === "driveway" || motif === "court") {
      road([p(-26, -11), p(-8, -11), p(-8, 2)]);
      if (motif === "driveway") path([p(-8, 2), p(-1, 2)]);
      if (motif === "court") {
        path([p(-8, 2), p(-4, 2)]);
        area("square", [rect(p(0, 3), 10, 8)]);
      }
    } else {
      road([p(-26, -7), p(0, -7)]);
      if (motif === "bulb")
        area(roadKind, [circle(p(0, -7), Math.max(rw, re) * 1.05)]);
      if (motif === "hammer") road([p(0, -14), p(0, 0)]);
    }
  }
  if (group === "spaces") {
    const s = spec.size;
    const center = p(-4, -3);
    if (motif === "square") area("square", [rect(center, 12 * s, 12 * s)]);
    if (motif === "long") area("square", [rect(center, 22 * s, 7 * s)]);
    if (motif === "triangle")
      area("square", [
        [p(-14 * s, -8 * s), p(7 * s, -8 * s), p(-5 * s, 9 * s)],
      ]);
    if (motif === "round") area("square", [circle(center, 8 * s)]);
    if (motif === "court") area("square", [rect(center, 10 * s, 8 * s)]);
    if (motif === "l-space")
      area("square", [
        rect(p(-8, -2), 7 * s, 17 * s),
        rect(p(-1, -7), 14 * s, 7 * s),
      ]);
    if (spec.access === "road") line("road", [p(-26, -15), p(26, -15)], 6, 6);
    if (spec.access === "path") path([p(-26, -12), p(-14, -12), p(-14, 5)]);
    notes.push(
      "Die markierte Freifläche bleibt frei; eine spätere Nutzung ist nicht festgelegt.",
    );
  }
  if (group === "waterways") {
    if (motif === "canal") water([p(-26, -8), p(-8, -8), p(-8, 26)]);
    else if (motif === "fork") {
      water([p(-26, -8), p(-6, -8), p(22, -21)]);
      water([p(-6, -8), p(26, 5)]);
    } else if (motif === "channels") {
      water([p(-26, -10), p(26, -10)]);
      water([p(-15, -26), p(-15, 26)]);
    } else water(lineShape(motif));
  }
  if (group === "shores") {
    const s = spec.size;
    if (motif === "pond") area("water", [circle(p(-8, -6), 7 * s, 40)]);
    if (motif === "long-pond")
      area("water", [
        circle(p(-6, -6), 1, 40).map((v) =>
          p(-6 + (v.x + 6) * 14 * s, -6 + (v.z + 6) * 5 * s),
        ),
      ]);
    if (motif === "lake") area("water", [circle(p(-5, -22), 17 * s, 48)]);
    if (motif === "coast") area("water", [rect(p(0, -25), 70, 36 * s)]);
    if (motif === "bay")
      area("water", [rect(p(0, -28), 70, 30), circle(p(-8, -13), 10 * s, 40)]);
    if (motif === "peninsula")
      area("water", [
        rect(p(-22, -2), 24, 65),
        rect(p(22, -2), 24, 65),
        rect(p(0, -25), 70, 20 * s),
      ]);
    if (motif === "island") {
      const half = 9 / s;
      area("water", [
        rect(p(-30 - half, 0), 60, 80),
        rect(p(30 + half, 0), 60, 80),
        rect(p(0, -30 - half), 80, 60),
        rect(p(0, 30 + half), 80, 60),
      ]);
    }
    if (motif === "corner-shore")
      area("water", [rect(p(-25, 0), 30 * s, 70), rect(p(0, -25), 70, 30 * s)]);
  }
  if (group === "road-water" || group === "path-water") {
    if (motif === "parallel") {
      water([p(-26, -10), p(26, -10)]);
      road([p(-26, 8), p(26, 8)]);
    }
    if (motif === "converging") {
      water([p(-26, -15), p(26, -5)]);
      road([p(-26, 12), p(26, 2)]);
    }
    if (
      motif === "bridge" ||
      motif === "skew-bridge" ||
      motif === "bend-bridge"
    ) {
      water([p(-9, -26), p(-9, 26)]);
      road(
        motif === "bridge"
          ? [p(-26, -7), p(26, -7)]
          : motif === "skew-bridge"
            ? [p(-26, -20), p(26, 9)]
            : [p(-26, -12), p(-12, -7), p(-5, -7), p(22, -18)],
      );
      notes.push(
        "Querung als einfacher Brücken-Blockout auf Bodenniveau, keine Brückenkonstruktion.",
      );
    }
    if (motif === "bridgehead") {
      water([p(-13, -26), p(-13, 26)]);
      road([p(-26, -7), p(26, -7)]);
      road([p(-4, -7), p(-4, 26)]);
    }
    if (motif === "quay-end") {
      water([p(-26, -11), p(26, -11)]);
      // The whole rounded terminal must stop on land, not merely its centerline.
      const terminal = -11 + Math.max(ww, we) / 2 + Math.max(rw, re) / 2 + 0.6;
      road([p(-7, 26), p(-7, terminal)]);
    }
    if (motif === "tributary") {
      water([p(-26, -12), p(26, -12)]);
      water([p(-12, 26), p(-12, -12)]);
      road([p(-26, 5), p(26, 5)]);
    }
  }
  if (group === "mixed") {
    if (motif === "t-bridge") {
      water([p(-14, -26), p(-14, 26)]);
      road([p(-26, -9), p(26, -9)]);
      road([p(-4, -9), p(-4, 26)]);
      path([p(-8, -26), p(-8, 26)]);
    }
    if (motif === "cross-bridge") {
      water([p(-26, -13), p(26, -13)]);
      road([p(-8, -26), p(-8, 26)]);
      road([p(-26, -4), p(26, -4)]);
      path([p(8, -26), p(8, 26)]);
    }
    if (motif === "island-access") {
      // A real surrounding channel: its width (including taper) is not an island-scale proxy.
      // Keep a 22 m land core so all requested neighbor combinations can be represented.
      const edge = 11 + Math.max(ww, we) / 2;
      water([
        p(-edge, -edge),
        p(edge, -edge),
        p(edge, edge),
        p(-edge, edge),
        p(-edge, -edge),
      ]);
      road([p(-26, -6), p(3, -6)]);
      path([p(6, -3), p(26, -3)]);
    }
    if (motif === "court-water") {
      water([p(-26, -13), p(26, -13)]);
      road([p(-26, 12), p(26, 12)]);
      path([p(-8, 12), p(-8, 0), p(-1, 0)]);
      area("square", [rect(p(-1, 0), 7, 6)]);
    }
    if (motif === "market-water") {
      water([p(-26, -14), p(26, -14)]);
      road([p(-26, 11), p(26, 11)]);
      path([p(-26, -5), p(26, -5)]);
      area("square", [rect(p(-9, 1), 9, 9)]);
    }
    if (motif === "canal-corner") {
      water([p(-26, -13), p(-13, -13), p(-13, 26)]);
      road([p(-26, 11), p(26, 11)]);
      path([p(-6, 26), p(-6, -5), p(26, -5)]);
    }
  }
  let buildArea = rect(p(0, 1), 27, 27);
  if (group === "limits") {
    if (motif === "flooded") area("water", [rect(p(0, 0), 60, 60)]);
    if (motif === "reserved") area("square", [rect(p(0, 0), 60, 60)]);
    if (motif === "tiny") buildArea = rect(p(0, 0), 2, 2);
    notes.push("Bewusst unbebaubar: eine begründete Ablehnung wird erwartet.");
  }
  const mirror = (v: Point): Point =>
    p(spec.side & 1 ? -v.x : v.x, spec.side & 2 ? -v.z : v.z);
  for (const surface of surfaces) {
    surface.polygons = surface.polygons.map((poly) => poly.map(mirror));
    surface.centerline = surface.centerline?.map(mirror);
  }
  buildArea = buildArea.map(mirror);
  const blockers: Scenario["blockers"] = [];
  const target =
    spec.neighbors === "dense" ? 4 : spec.neighbors === "one" ? 1 : 0;
  const candidates = [
    p(-4, 3),
    p(6, 5),
    p(1, 11),
    p(-10, 9),
    p(11, -1),
    p(12, 12),
    p(-14, -14),
    p(17, 15),
    p(-17, 15),
    p(17, -17),
    p(-17, -17),
    p(0, 18),
    p(18, 0),
    p(-18, 0),
    p(0, -18),
  ];
  // Sparse preferred positions are not a complete placement search (notably on islands).
  // Only use the deterministic fallback lattice when the preferred layout cannot supply the requested count.
  const fallback: Point[] = [];
  for (let z = -18; z <= 18; z += 2)
    for (let x = -18; x <= 18; x += 2) fallback.push(p(x, z));
  fallback.sort((a, b) => Math.hypot(a.x, a.z - 1) - Math.hypot(b.x, b.z - 1));
  function populate(positions: Point[]): void {
    for (const candidate of positions) {
      if (blockers.length >= target) break;
      const center = mirror(candidate),
        polygon = rect(center, 4.2, 4.8);
      if (
        surfaces.some((s) =>
          s.polygons.some((poly) => !separated(polygon, poly, 0.45)),
        )
      )
        continue;
      if (
        blockers.some(
          (b) => !separated(polygon, rect(b.center, b.width, b.depth), 0.6),
        )
      )
        continue;
      blockers.push({
        center,
        width: 4.2,
        depth: 4.8,
        height: 4.5 + blockers.length * 1.3,
        angle: 0,
      });
    }
  }
  populate([...candidates, ...fallback]);
  if (blockers.length < target) {
    // Retry the layout, not the requested count or blocker dimensions. Greedy preferred
    // positions can prevent a perfectly valid regular packing in a small land core.
    blockers.length = 0;
    const packed: Point[] = [];
    for (let z = -18; z <= 18; z += 5.5)
      for (let x = -18; x <= 18; x += 4.9) packed.push(p(x, z));
    populate(packed);
  }
  if (group === "limits" && motif === "blocked")
    blockers.push({
      center: p(0, 1),
      width: 30,
      depth: 30,
      height: 6,
      angle: 0,
    });
  if (spec.waterDrop)
    notes.push(
      `Wasseroberfläche ${spec.waterDrop.toFixed(1)} m unter Baugrund; senkrechte Ufer als Blockout.`,
    );
  if (surfaces.some((s) => s.widths && s.widths[0] !== s.widths.at(-1)))
    notes.push(
      "Veränderliche Breite entlang der Trasse, nicht nur ein anderer Maßstab.",
    );
  if (!surfaces.some((s) => s.kind === "road" || s.kind === "path"))
    notes.push(
      "Keine Erschließung vorgegeben: Formstudie, kein nachgewiesener Straßenzugang.",
    );
  return { spec, surfaces, blockers, buildArea, maxHeight: 14, notes };
}
