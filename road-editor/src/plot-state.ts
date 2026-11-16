import { validateContour } from "./blockers";
import type { PlannedPlot } from "./plot-types";

export function validatePlots(
  value: unknown,
): asserts value is PlannedPlot[] | undefined {
  if (value === undefined) return;
  if (!Array.isArray(value))
    throw new Error("Bauplätze müssen eine Liste sein");
  const ids = new Set<string>();
  for (const item of value) {
    validateContour(item);
    const plot = item as PlannedPlot;
    if (
      plot.kind !== "plot" ||
      ids.has(plot.id) ||
      !Number.isInteger(plot.seed) ||
      plot.seed < 0 ||
      plot.seed > 0xffffffff
    )
      throw new Error("Ungültiger oder doppelter Bauplatz / Seed");
    ids.add(plot.id);
  }
}
