export type DiffLine = {
  kind: "add" | "del" | "ctx";
  text: string;
};

/** Lines of context kept around each change. */
const CONTEXT = 3;

/**
 * Line diff, used to review an agent's proposed file write before it lands.
 *
 * Plain LCS over lines: a file the agent rewrites whole is the case that
 * matters, and pulling in a diff library to render a review panel is a
 * dependency for something the standard algorithm does in thirty lines.
 * Falls back to "replace everything" on very large files, where the O(n·m)
 * table is the wrong trade.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before === "" ? [] : before.split("\n");
  const b = after === "" ? [] : after.split("\n");

  if (a.length * b.length > 4_000_000) {
    return [
      ...a.map<DiffLine>((text) => ({ kind: "del", text })),
      ...b.map<DiffLine>((text) => ({ kind: "add", text })),
    ];
  }

  // lcs[i][j] = length of the longest common subsequence of a[i:] and b[j:]
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] =
        a[i] === b[j]
          ? lcs[i + 1]![j + 1]! + 1
          : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: "ctx", text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ kind: "del", text: a[i]! });
      i++;
    } else {
      out.push({ kind: "add", text: b[j]! });
      j++;
    }
  }
  while (i < a.length) out.push({ kind: "del", text: a[i++]! });
  while (j < b.length) out.push({ kind: "add", text: b[j++]! });

  return collapse(out);
}

/** Drop runs of untouched lines so a one-line change does not render a whole file. */
function collapse(lines: DiffLine[]): DiffLine[] {
  const keep = new Set<number>();
  lines.forEach((line, idx) => {
    if (line.kind === "ctx") return;
    for (let k = idx - CONTEXT; k <= idx + CONTEXT; k++) {
      if (k >= 0 && k < lines.length) keep.add(k);
    }
  });

  const out: DiffLine[] = [];
  let skipping = false;
  lines.forEach((line, idx) => {
    if (keep.has(idx)) {
      out.push(line);
      skipping = false;
    } else if (!skipping) {
      out.push({ kind: "ctx", text: "…" });
      skipping = true;
    }
  });
  return out;
}

export function diffStat(before: string, after: string) {
  const lines = diffLines(before, after);
  return {
    added: lines.filter((l) => l.kind === "add").length,
    removed: lines.filter((l) => l.kind === "del").length,
  };
}
