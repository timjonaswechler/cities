export function ensureOriginalBundle(): Promise<void>;
export function originalAssets(): Record<string, string>;
export function originalNodeSnapshot(query: string | Record<string, string>, assets?: Record<string, string>): Record<string, unknown>;
