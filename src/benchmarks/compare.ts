export interface DiffEntry {
  path: string;
  expected: unknown;
  actual: unknown;
}

export interface CompareResult {
  match: boolean;
  diffs: DiffEntry[];
}

/**
 * Recursively compare two JSON-serializable values and collect all differences.
 */
export function compareObjects(
  expected: unknown,
  actual: unknown,
  path = "",
): CompareResult {
  const diffs: DiffEntry[] = [];

  if (typeof expected !== typeof actual) {
    diffs.push({ path: path || "root", expected, actual });
    return { match: false, diffs };
  }

  if (expected === null || actual === null) {
    if (expected !== actual) {
      diffs.push({ path: path || "root", expected, actual });
    }
    return { match: diffs.length === 0, diffs };
  }

  if (typeof expected !== "object") {
    if (expected !== actual) {
      diffs.push({ path: path || "root", expected, actual });
    }
    return { match: diffs.length === 0, diffs };
  }

  if (Array.isArray(expected) !== Array.isArray(actual)) {
    diffs.push({ path: path || "root", expected, actual });
    return { match: false, diffs };
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    const maxLen = Math.max(expected.length, actual.length);
    for (let i = 0; i < maxLen; i++) {
      const itemPath = `${path}[${i}]`;
      if (i >= expected.length) {
        diffs.push({
          path: itemPath,
          expected: undefined,
          actual: actual[i],
        });
      } else if (i >= actual.length) {
        diffs.push({
          path: itemPath,
          expected: expected[i],
          actual: undefined,
        });
      } else {
        const itemResult = compareObjects(expected[i], actual[i], itemPath);
        diffs.push(...itemResult.diffs);
      }
    }
    return { match: diffs.length === 0, diffs };
  }

  // Both are plain objects
  const expectedObj = expected as Record<string, unknown>;
  const actualObj = actual as Record<string, unknown>;
  const allKeys = new Set([
    ...Object.keys(expectedObj),
    ...Object.keys(actualObj),
  ]);

  for (const key of allKeys) {
    const keyPath = path ? `${path}.${key}` : key;
    if (!(key in expectedObj)) {
      diffs.push({
        path: keyPath,
        expected: undefined,
        actual: actualObj[key],
      });
    } else if (!(key in actualObj)) {
      diffs.push({
        path: keyPath,
        expected: expectedObj[key],
        actual: undefined,
      });
    } else {
      const keyResult = compareObjects(
        expectedObj[key],
        actualObj[key],
        keyPath,
      );
      diffs.push(...keyResult.diffs);
    }
  }

  return { match: diffs.length === 0, diffs };
}

/**
 * Format a single diff entry as an actionable string.
 */
export function formatDiff(diff: DiffEntry): string {
  return `  at ${diff.path}:\n    expected: ${JSON.stringify(diff.expected)}\n    actual:   ${JSON.stringify(diff.actual)}`;
}

/**
 * Format a full compare result as an actionable multi-line string.
 */
export function formatCompareResult(result: CompareResult): string {
  if (result.match) {
    return "outputs match";
  }
  return result.diffs.map(formatDiff).join("\n");
}
