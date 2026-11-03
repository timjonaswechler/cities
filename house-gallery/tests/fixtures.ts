import { CATALOG, GROUPS } from "../src/scenarios";

export const SEEDS = [0, 42, 91, 4294967295] as const;
export const EXPECTED_COUNTS: Record<string, number> = {
  streets: 312,
  paths: 312,
  junctions: 480,
  deadends: 216,
  spaces: 324,
  waterways: 720,
  shores: 432,
  "road-water": 2304,
  "path-water": 2304,
  mixed: 1728,
  limits: 4,
};
/** Fixed first non-neighbor, unmirrored representative of EVERY motif, not just successes. */
export const REPRESENTATIVES = GROUPS.flatMap((group) =>
  group.motifs.map((motif) =>
    CATALOG.find(
      (s) =>
        s.group === group.id &&
        s.motif === motif.id &&
        s.side === 0 &&
        s.neighbors === "none",
    )!,
  ),
);
export const VISUAL_CASES = [
  ["streets", "curve-left-tight"],
  ["paths", "s-left"],
  ["junctions", "cross-skew"],
  ["deadends", "court"],
  ["spaces", "triangle"],
  ["waterways", "fork"],
  ["shores", "bay"],
  ["shores", "island"],
  ["road-water", "skew-bridge"],
  ["path-water", "quay-end"],
  ["mixed", "market-water"],
  ["limits", "tiny"],
].map(([group, motif]) =>
  CATALOG.find(
    (s) =>
      s.group === group &&
      s.motif === motif &&
      s.side === 0 &&
      s.neighbors === (group === "limits" ? "none" : "dense") &&
      (s.waterDrop === 0 || s.waterDrop === 1.4),
  )!,
);
