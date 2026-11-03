import type { Network, Path, Node } from "../src/network";
export function graph(nodes: Node[], paths: Path[]): Network {
  return { version: 1, nodes, paths, junctions: [] };
}
export const line = (
  id: string,
  from: string,
  to: string,
  width = 6,
  end = width,
): Path => ({
  id,
  segments: [{ kind: "line", from, to }],
  startWidth: width,
  endWidth: end,
});
export const straight = (): Network =>
  graph(
    [
      { id: "a", x: -20, y: 0 },
      { id: "b", x: 20, y: 0 },
    ],
    [line("L", "a", "b")],
  );
export const quadratic = (): Network =>
  graph(
    [
      { id: "a", x: -20, y: 0 },
      { id: "b", x: 20, y: 0 },
    ],
    [
      {
        id: "Q",
        segments: [
          { kind: "quadratic", from: "a", to: "b", control: { x: 0, y: 20 } },
        ],
        startWidth: 4,
        endWidth: 4,
      },
    ],
  );
export const cubic = (): Network =>
  graph(
    [
      { id: "a", x: -30, y: 0 },
      { id: "b", x: 20, y: 0 },
      { id: "c", x: 35, y: 15 },
    ],
    [
      {
        id: "S",
        segments: [
          {
            kind: "cubic",
            from: "a",
            to: "b",
            c1: { x: -10, y: 30 },
            c2: { x: 0, y: -30 },
          },
          { kind: "line", from: "b", to: "c" },
        ],
        startWidth: 3,
        endWidth: 9,
      },
    ],
  );
export function junction(kind: "T" | "Y" | "X" = "X", radius = 0): Network {
  const nodes: Node[] = [
    { id: "o", x: 0, y: 0 },
    { id: "e", x: 30, y: 0 },
    { id: "n", x: 0, y: 30 },
    { id: "w", x: -30, y: 0 },
    { id: "s", x: 0, y: -30 },
  ];
  if (kind === "Y") {
    nodes[2] = { id: "n", x: 15, y: 26 };
    nodes[3] = { id: "w", x: -26, y: -15 };
  }
  const n = graph(nodes, [
    line("E", "o", "e", 6),
    line("N", "o", "n", 4),
    line("W", "o", "w", 8),
    ...(kind === "X" ? [line("S", "o", "s", 3)] : []),
  ]);
  n.junctions = [{ node: "o", a: "E:0:start", b: "N:0:start", radius }];
  return n;
}
export const loop = (): Network =>
  graph(
    [
      { id: "a", x: -20, y: -20 },
      { id: "b", x: 20, y: -20 },
      { id: "c", x: 20, y: 20 },
      { id: "d", x: -20, y: 20 },
    ],
    [
      {
        id: "ring",
        startWidth: 4,
        endWidth: 4,
        segments: [
          { kind: "line", from: "a", to: "b" },
          { kind: "line", from: "b", to: "c" },
          { kind: "line", from: "c", to: "d" },
          { kind: "line", from: "d", to: "a" },
        ],
      },
    ],
  );
export const crossing = (): Network =>
  graph(
    [
      { id: "a", x: -20, y: 0 },
      { id: "b", x: 20, y: 0 },
      { id: "c", x: 0, y: -20 },
      { id: "d", x: 0, y: 20 },
    ],
    [line("L", "a", "b", 4), line("U", "c", "d", 4)],
  );
