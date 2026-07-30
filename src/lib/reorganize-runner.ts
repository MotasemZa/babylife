import { supabase } from "@/integrations/supabase/client";

// ─── Types ──────────────────────────────────────
export interface RunnerState {
  status: "idle" | "running" | "done" | "error" | "cancelled";
  batch: number;
  total: number;
  message: string;
  familiesFound: number;
  results: any[];
  error?: string;
  // Carry context so the component can use it after remount
  parsedRows?: Record<string, string>[];
  fileName?: string;
  context?: string;
}

type Subscriber = (state: RunnerState) => void;

// ─── Module-scoped state ────────────────────────
let state: RunnerState = {
  status: "idle",
  batch: 0,
  total: 0,
  message: "",
  familiesFound: 0,
  results: [],
};

let cancelled = false;
const subs = new Set<Subscriber>();

function emit() {
  const snapshot = { ...state };
  subs.forEach((fn) => fn(snapshot));
}

// ─── Helpers ────────────────────────────────────
function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

async function callWithTimeout(body: any, timeoutMs = 45_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await supabase.functions.invoke("bulk-listing-prepare", {
      body,
    });
    clearTimeout(timer);
    return result;
  } catch (err: any) {
    clearTimeout(timer);
    throw err;
  }
}

async function callWithRetry(body: any, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { data, error } = await callWithTimeout(body);
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    } catch (err) {
      if (attempt === retries) throw err;
      console.warn(`Batch retry (attempt ${attempt + 1})`, err);
      // brief pause before retry
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

// ─── Public API ─────────────────────────────────
export const reorganizeRunner = {
  getState(): RunnerState {
    return { ...state };
  },

  subscribe(fn: Subscriber): () => void {
    subs.add(fn);
    fn({ ...state });
    return () => subs.delete(fn);
  },

  cancel() {
    cancelled = true;
    state = { ...state, status: "cancelled", message: "Cancelled by user" };
    emit();
  },

  reset() {
    cancelled = false;
    state = {
      status: "idle",
      batch: 0,
      total: 0,
      message: "",
      familiesFound: 0,
      results: [],
    };
    emit();
  },

  async start(
    rows: Record<string, string>[],
    titleCol: string,
    contextText: string,
    brandHints: string[],
    fileName: string
  ) {
    cancelled = false;

    // Build compact data
    const compact = rows.map((row, i) => ({
      i,
      t: (row[titleCol] || Object.values(row)[0] || "")
        .toString()
        .substring(0, 160),
    }));

    const BATCH_SIZE = 25;
    const batches = chunks(compact, BATCH_SIZE);

    state = {
      status: "running",
      batch: 0,
      total: batches.length,
      message: "Starting...",
      familiesFound: 0,
      results: [],
      parsedRows: rows,
      fileName,
      context: contextText,
    };
    emit();

    const allResults: any[] = [];
    let totalFamilies = 0;

    for (let c = 0; c < batches.length; c++) {
      if (cancelled) return;

      state = {
        ...state,
        batch: c + 1,
        message: `Organizing batch ${c + 1} of ${batches.length}...`,
        familiesFound: totalFamilies,
      };
      emit();

      try {
        const data = await callWithRetry({
          action: "reorganize-batch",
          rows: batches[c],
          context: contextText,
          brandHints,
          batchOffset: c * BATCH_SIZE,
        });

        const batchResults = data.results || [];
        totalFamilies += data.familiesFound || 0;
        allResults.push(...batchResults);
      } catch (err: any) {
        state = {
          ...state,
          status: "error",
          error: err?.message || String(err),
          message: `Failed on batch ${c + 1}`,
        };
        emit();
        return;
      }
    }

    // Enrich results with original titles
    const enriched = allResults.map((r: any) => ({
      ...r,
      originalTitle:
        rows[r.originalIndex]?.[titleCol] ||
        (Object.values(rows[r.originalIndex] || {})[0] as string) ||
        "Untitled",
      rawData: rows[r.originalIndex],
    }));

    // Fill missing rows
    const covered = new Set(allResults.map((r: any) => r.originalIndex));
    for (let i = 0; i < rows.length; i++) {
      if (!covered.has(i)) {
        enriched.push({
          originalIndex: i,
          groupKey: rows[i][titleCol] || `Product ${i + 1}`,
          familyKey: null,
          variantLabel: "",
          isParent: false,
          status: "process",
          skipReason: "",
          originalTitle: rows[i][titleCol] || "Untitled",
          rawData: rows[i],
        });
      }
    }

    state = {
      ...state,
      status: "done",
      batch: batches.length,
      message: "Complete",
      familiesFound: totalFamilies,
      results: enriched,
    };
    emit();
  },
};
