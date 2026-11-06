import { computeSurface } from "./geometry";
import type { Network } from "./network";
import { planPlots } from "./plots";

// Adapter from editable sources to separate ground blockers and plot plans.
// Evaluate before committing edits/imports so clipping failures retain the
// previous valid project, just like failures in the road/water geometry.
export function evaluateProject(n: Network) {
  const surface = computeSurface(n);
  const plots = planPlots(n.plots ?? [], [
    { kind: "road", areas: surface.roadAreas ?? [] },
    { kind: "water", areas: surface.water?.areas ?? [] },
  ]);
  return { surface, plots };
}
