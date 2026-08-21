/**
 * ============================================================================
 * REPORT ENGINE — Pure utility functions for the report creation pipeline.
 * ============================================================================
 * Shared by both client-side preview (Step 4) and server-side generation (API).
 * Pipeline: filter → expressions → sort → compute metrics
 * ============================================================================
 */

/**
 * toCamelKey — Converts a display name to the camelCase key used in table data.
 * "Interest Level" → "interestLevel", "Grade" → "grade"
 */
export function toCamelKey(displayName) {
  const words = displayName.trim().split(/\s+/);
  return words
    .map((w, i) =>
      i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1)
    )
    .join('');
}

/**
 * applyFilters — Equality filters matching the data-service.js pattern.
 * filters is an object like { Grade: "7th", School: "Lincoln MS" }.
 */
export function applyFilters(tableData, filters) {
  if (!filters || Object.keys(filters).length === 0) return [...tableData];

  let filtered = [...tableData];
  Object.entries(filters).forEach(([key, value]) => {
    if (value && value !== 'All') {
      const camelKey = toCamelKey(key);
      filtered = filtered.filter(row => {
        const rowKey = Object.keys(row).find(k => k.toLowerCase() === camelKey.toLowerCase());
        if (!rowKey) return true;
        return String(row[rowKey]).toLowerCase().includes(String(value).toLowerCase());
      });
    }
  });
  return filtered;
}

/**
 * evaluateExpression — Evaluates a single boolean expression against a row.
 * expression: { attribute, operator, value }
 * Operators: =, !=, >, <, >=, <=, contains
 */
export function evaluateExpression(row, expression) {
  const { attribute, operator, value } = expression;
  const camelKey = toCamelKey(attribute);
  const rowKey = Object.keys(row).find(k => k.toLowerCase() === camelKey.toLowerCase());
  if (!rowKey) return true;

  const rowVal = row[rowKey];
  const numRow = Number(rowVal);
  const numTarget = Number(value);
  const isNumeric = !isNaN(numRow) && !isNaN(numTarget) && String(value).trim() !== '';

  switch (operator) {
    case '=':
      return isNumeric ? numRow === numTarget : String(rowVal).toLowerCase() === String(value).toLowerCase();
    case '!=':
      return isNumeric ? numRow !== numTarget : String(rowVal).toLowerCase() !== String(value).toLowerCase();
    case '>':
      return isNumeric ? numRow > numTarget : String(rowVal) > String(value);
    case '<':
      return isNumeric ? numRow < numTarget : String(rowVal) < String(value);
    case '>=':
      return isNumeric ? numRow >= numTarget : String(rowVal) >= String(value);
    case '<=':
      return isNumeric ? numRow <= numTarget : String(rowVal) <= String(value);
    case 'contains':
      return String(rowVal).toLowerCase().includes(String(value).toLowerCase());
    default:
      return true;
  }
}

/**
 * applyExpressionFilter — Filters rows by a list of boolean expressions.
 * Connectors (AND/OR) are evaluated left-to-right with no precedence.
 * expressions: [{ attribute, operator, value, connector? }]
 */
export function applyExpressionFilter(tableData, expressions) {
  if (!expressions || expressions.length === 0) return [...tableData];

  return tableData.filter(row => {
    let result = evaluateExpression(row, expressions[0]);

    for (let i = 1; i < expressions.length; i++) {
      const expr = expressions[i];
      const exprResult = evaluateExpression(row, expr);

      if (expr.connector === 'OR') {
        result = result || exprResult;
      } else {
        // Default to AND
        result = result && exprResult;
      }
    }

    return result;
  });
}

/**
 * applySorting — Multi-level sort matching data-service.js getSortedReportData.
 * sortConfig: [{ attribute, direction }]
 */
export function applySorting(tableData, sortConfig) {
  if (!sortConfig || sortConfig.length === 0) return [...tableData];

  const sorted = [...tableData];
  sorted.sort((a, b) => {
    for (const { attribute, direction } of sortConfig) {
      const key = toCamelKey(attribute);
      const rowKeyA = Object.keys(a).find(k => k.toLowerCase() === key.toLowerCase());
      const rowKeyB = Object.keys(b).find(k => k.toLowerCase() === key.toLowerCase());
      const valA = rowKeyA ? a[rowKeyA] : undefined;
      const valB = rowKeyB ? b[rowKeyB] : undefined;

      let comparison = 0;
      if (typeof valA === 'number' && typeof valB === 'number') {
        comparison = valA - valB;
      } else {
        comparison = String(valA ?? '').localeCompare(String(valB ?? ''));
      }

      if (comparison !== 0) {
        return direction === 'desc' ? -comparison : comparison;
      }
    }
    return 0;
  });
  return sorted;
}

/**
 * computeMetrics — Calculates summary metrics from filtered data.
 * Returns: { totalRows, totalRowsUnfiltered, filterMatchRate,
 *            numericAverages, categoryCounts }
 */
export function computeMetrics(filteredData, unfilteredData, attributes) {
  const totalRows = filteredData.length;
  const totalRowsUnfiltered = unfilteredData.length;
  const filterMatchRate = totalRowsUnfiltered > 0
    ? Math.round((totalRows / totalRowsUnfiltered) * 1000) / 10
    : 0;

  const numericAverages = {};
  const categoryCounts = {};

  attributes.forEach(attr => {
    const camelKey = toCamelKey(attr);
    const matchingKey = filteredData.length > 0
      ? Object.keys(filteredData[0]).find(k => k.toLowerCase() === camelKey.toLowerCase())
      : null;

    if (!matchingKey) return;

    // Determine if this attribute is numeric by checking the first non-null value
    const sampleValues = filteredData
      .map(row => row[matchingKey])
      .filter(v => v !== undefined && v !== null);

    if (sampleValues.length === 0) return;

    const isNumeric = sampleValues.every(v => !isNaN(Number(v)));

    if (isNumeric) {
      const nums = sampleValues.map(Number);
      const avg = nums.reduce((sum, n) => sum + n, 0) / nums.length;
      numericAverages[attr] = Math.round(avg * 100) / 100;
    } else {
      const counts = {};
      sampleValues.forEach(v => {
        const s = String(v);
        counts[s] = (counts[s] || 0) + 1;
      });
      categoryCounts[attr] = counts;
    }
  });

  return { totalRows, totalRowsUnfiltered, filterMatchRate, numericAverages, categoryCounts };
}

/**
 * processReportData — Full pipeline: filter → expressions → sort → metrics.
 * Returns { filteredData, metrics }.
 */
export function processReportData(tableData, filters, expressions, sortConfig, attributes) {
  const unfilteredData = [...tableData];

  // Step 1: Apply equality filters
  let data = applyFilters(tableData, filters);
  const afterFilterCount = data.length;

  // Step 2: Apply boolean expressions
  data = applyExpressionFilter(data, expressions);
  const afterExpressionCount = data.length;

  // Step 3: Apply sorting
  data = applySorting(data, sortConfig);

  // Step 4: Compute metrics
  const metrics = computeMetrics(data, unfilteredData, attributes);

  return {
    filteredData: data,
    metrics,
    explainability: {
      inputRowCount: unfilteredData.length,
      afterFilterCount,
      afterExpressionCount,
      outputRowCount: data.length,
      droppedByStep: {
        filters: Math.max(0, unfilteredData.length - afterFilterCount),
        expressions: Math.max(0, afterFilterCount - afterExpressionCount),
        sorting: 0,
      },
    },
  };
}

function getRowKeyByAttribute(row, attribute) {
  if (Object.prototype.hasOwnProperty.call(row, attribute)) return attribute;
  const key = toCamelKey(attribute);
  const normalizedAttribute = String(attribute).replace(/[^a-z0-9]/gi, '').toLowerCase();
  return Object.keys(row).find((k) =>
    k.toLowerCase() === key.toLowerCase()
    || k.replace(/[^a-z0-9]/gi, '').toLowerCase() === normalizedAttribute
  ) || null;
}

function toNumberIfPossible(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const normalized = value.replace(/[%,$\s]/g, '');
    const num = Number(normalized);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

function splitHalves(values) {
  const midpoint = Math.floor(values.length / 2);
  const first = values.slice(0, midpoint);
  const second = values.slice(midpoint);
  return { first, second };
}

function average(nums) {
  if (nums.length === 0) return null;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function computeNumericTrend(values) {
  const nums = values.map(toNumberIfPossible).filter((n) => n !== null);
  if (nums.length < 4) return null;

  const { first, second } = splitHalves(nums);
  if (first.length === 0 || second.length === 0) return null;

  const firstMean = average(first);
  const secondMean = average(second);
  if (firstMean === null || secondMean === null) return null;

  const denom = Math.max(Math.abs(firstMean), 1);
  const signedChangePct = ((secondMean - firstMean) / denom) * 100;

  return {
    signedChangePct,
    magnitudePct: Math.abs(signedChangePct),
    method: 'numeric',
  };
}

function computeDominantShare(values, dominantCategory) {
  if (values.length === 0) return 0;
  const matches = values.filter((v) => String(v) === dominantCategory).length;
  return matches / values.length;
}

function computeCategoricalTrend(values) {
  const cleaned = values
    .map((v) => (v === null || v === undefined ? null : String(v).trim()))
    .filter((v) => v);
  if (cleaned.length < 4) return null;

  const counts = {};
  cleaned.forEach((v) => {
    counts[v] = (counts[v] || 0) + 1;
  });
  const dominantCategory = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!dominantCategory) return null;

  const { first, second } = splitHalves(cleaned);
  if (first.length === 0 || second.length === 0) return null;

  const firstShare = computeDominantShare(first, dominantCategory);
  const secondShare = computeDominantShare(second, dominantCategory);
  const signedChangePct = (secondShare - firstShare) * 100;

  return {
    signedChangePct,
    magnitudePct: Math.abs(signedChangePct),
    method: 'categorical',
    dominantCategory,
  };
}

function stableHash(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(36).toUpperCase();
}

function createDeterministicTrendId(context, attributes, method, rows) {
  const seed = JSON.stringify({
    initiativeId: context?.initiativeId || null,
    reportName: context?.reportName || '',
    attributes,
    method,
    rows,
  });
  return `TRD-${stableHash(seed)}`;
}

function buildTrendDescription(attributes, direction, magnitude, rowsEvaluated, skippedAttributes) {
  if (rowsEvaluated < 4) {
    return `Insufficient data for trend calculation. At least 4 rows are required; received ${rowsEvaluated}.`;
  }

  const joinedAttrs = attributes.join(', ');
  const directionText = direction === 'up'
    ? 'shows an upward pattern'
    : direction === 'down'
      ? 'shows a downward pattern'
      : 'is stable';

  if (skippedAttributes > 0) {
    return `Trend across ${joinedAttrs} ${directionText} (${magnitude}%). ${skippedAttributes} selected variable(s) were skipped due to insufficient usable values.`;
  }

  return `Trend across ${joinedAttrs} ${directionText} (${magnitude}%).`;
}

export function validateTrendConfig(trendConfig, availableAttributes = []) {
  const source = trendConfig || {};
  const enabledCalc = source.enabledCalc !== false;
  const enabledDisplay = source.enabledDisplay !== false;
  const supportedMethods = ['delta_halves', 'linear_slope', 'most_popular', 'average', 'least_common'];
  const method = supportedMethods.includes(source.method) ? source.method : 'delta_halves';
  const thresholdPct = Number.isFinite(Number(source.thresholdPct))
    ? Math.max(0, Math.min(100, Number(source.thresholdPct)))
    : 2;
  const rawVariables = Array.isArray(source.variables) ? source.variables : [];
  const cleanedVariables = [];
  rawVariables.forEach((v) => {
    if (typeof v !== 'string') return;
    const trimmed = v.trim();
    if (!trimmed) return;
    if (!cleanedVariables.includes(trimmed)) cleanedVariables.push(trimmed);
  });

  if (cleanedVariables.length > 5) {
    return { valid: false, error: 'Trend configuration supports up to 5 variables.' };
  }

  const canonicalMap = {};
  availableAttributes.forEach((attr) => {
    canonicalMap[String(attr).toLowerCase()] = attr;
  });

  const normalizedVariables = cleanedVariables.map((v) => {
    const canonical = canonicalMap[v.toLowerCase()];
    return canonical || v;
  });

  if (availableAttributes.length > 0) {
    const availableLower = new Set(availableAttributes.map((a) => String(a).toLowerCase()));
    const invalid = normalizedVariables.find((v) => !availableLower.has(String(v).toLowerCase()));
    if (invalid) {
      return { valid: false, error: `Invalid trend variable: ${invalid}` };
    }
  }

  if (enabledCalc && normalizedVariables.length < 1) {
    return { valid: false, error: 'At least one trend variable is required when calculation is enabled.' };
  }

  return {
    valid: true,
    normalized: {
      variables: normalizedVariables,
      enabledCalc,
      enabledDisplay,
      method,
      thresholdPct,
    },
  };
}

function computeLinearSlopeTrend(values) {
  const nums = values.map(toNumberIfPossible).filter((n) => n !== null);
  if (nums.length < 4) return null;

  const n = nums.length;
  const xMean = (n - 1) / 2;
  const yMean = average(nums);
  if (yMean === null) return null;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    const xDiff = i - xMean;
    numerator += xDiff * (nums[i] - yMean);
    denominator += xDiff * xDiff;
  }
  if (denominator === 0) return null;

  const slope = numerator / denominator;
  const denom = Math.max(Math.abs(yMean), 1);
  const signedChangePct = (slope / denom) * 100 * n;
  return {
    signedChangePct,
    magnitudePct: Math.abs(signedChangePct),
    method: 'linear_slope',
  };
}

function computeConfidenceScore(rowCount, skipped, totalVars) {
  const coverage = totalVars > 0 ? (totalVars - skipped) / totalVars : 0;
  const sampleFactor = Math.min(1, rowCount / 40);
  return Math.round((coverage * 70 + sampleFactor * 30) * 100) / 100;
}

const AGGREGATE_METHOD_LABELS = {
  most_popular: 'Most Popular Answer',
  average: 'Average Answer',
  least_common: 'Least Common Answer',
};

function computeAggregateAnalysis(rows, attributes, trendConfig, context) {
  return attributes.map((attribute) => {
    const values = rows.map((row) => {
      const key = getRowKeyByAttribute(row, attribute);
      return key ? row[key] : null;
    });
    const base = {
      trendId: createDeterministicTrendId(context, [attribute], trendConfig.method, rows),
      analysisType: trendConfig.method,
      analysisLabel: AGGREGATE_METHOD_LABELS[trendConfig.method],
      attributes: [attribute],
      enabledDisplay: trendConfig.enabledDisplay !== false,
      enabledCalc: true,
    };

    if (trendConfig.method === 'average') {
      const numericValues = values.map(toNumberIfPossible).filter((value) => value !== null);
      const rawAverage = average(numericValues);
      const result = rawAverage === null ? null : Math.round(rawAverage * 100) / 100;
      return {
        ...base,
        result,
        responsesEvaluated: numericValues.length,
        description: result === null
          ? 'No numeric answers are available to calculate an average.'
          : `Average answer: ${result} across ${numericValues.length} numeric response${numericValues.length === 1 ? '' : 's'}.`,
      };
    }

    const counts = new Map();
    values.forEach((value) => {
      if (value === null || value === undefined || String(value).trim() === '') return;
      const displayValue = String(value).trim();
      const normalizedValue = displayValue.toLowerCase();
      const existing = counts.get(normalizedValue);
      counts.set(normalizedValue, existing
        ? { ...existing, count: existing.count + 1 }
        : { displayValue, count: 1 });
    });
    const responsesEvaluated = [...counts.values()].reduce((sum, item) => sum + item.count, 0);
    const ranked = [...counts.values()].sort((a, b) =>
      trendConfig.method === 'most_popular' ? b.count - a.count : a.count - b.count
    );
    const selected = ranked[0] || null;
    const resultLabel = trendConfig.method === 'most_popular' ? 'Most popular answer' : 'Least common answer';

    return {
      ...base,
      result: selected?.displayValue ?? null,
      answerCount: selected?.count ?? 0,
      responsesEvaluated,
      description: selected
        ? `${resultLabel}: ${selected.displayValue} (${selected.count} of ${responsesEvaluated} responses).`
        : `No answers are available to determine the ${resultLabel.toLowerCase()}.`,
    };
  });
}

export function computeTrendData(filteredData, trendConfig, context = {}) {
  if (!trendConfig || trendConfig.enabledCalc === false) return [];

  const rows = Array.isArray(filteredData) ? filteredData : [];
  const attributes = trendConfig.variables || [];
  if (attributes.length === 0) return [];

  if (AGGREGATE_METHOD_LABELS[trendConfig.method]) {
    return computeAggregateAnalysis(rows, attributes, trendConfig, context);
  }

  if (rows.length < 4) {
    return [{
      trendId: createDeterministicTrendId(context, attributes, trendConfig.method, rows),
      attributes,
      direction: 'stable',
      magnitude: 0,
      confidenceScore: 0,
      timePeriod: 'Current dataset',
      enabledDisplay: trendConfig.enabledDisplay !== false,
      enabledCalc: true,
      description: buildTrendDescription(attributes, 'stable', 0, rows.length, 0),
    }];
  }

  const variableScores = [];
  let skipped = 0;

  attributes.forEach((attribute) => {
    const values = rows.map((row) => {
      const key = getRowKeyByAttribute(row, attribute);
      return key ? row[key] : null;
    });
    const numeric = trendConfig.method === 'linear_slope'
      ? computeLinearSlopeTrend(values)
      : computeNumericTrend(values);
    if (numeric) {
      variableScores.push(numeric);
      return;
    }
    const categorical = computeCategoricalTrend(values);
    if (categorical) {
      variableScores.push(categorical);
      return;
    }
    skipped += 1;
  });

  if (variableScores.length === 0) {
    return [{
      trendId: createDeterministicTrendId(context, attributes, trendConfig.method, rows),
      attributes,
      direction: 'stable',
      magnitude: 0,
      confidenceScore: 0,
      timePeriod: 'Current dataset',
      enabledDisplay: trendConfig.enabledDisplay !== false,
      enabledCalc: true,
      description: buildTrendDescription(attributes, 'stable', 0, rows.length, skipped),
    }];
  }

  const avgSigned = average(variableScores.map((v) => v.signedChangePct)) || 0;
  const avgMagnitude = average(variableScores.map((v) => v.magnitudePct)) || 0;
  const threshold = Number.isFinite(trendConfig.thresholdPct) ? trendConfig.thresholdPct : 2;
  const direction = avgSigned > threshold ? 'up' : avgSigned < -threshold ? 'down' : 'stable';
  const magnitude = Math.min(100, Math.round(avgMagnitude * 10) / 10);
  const confidenceScore = computeConfidenceScore(rows.length, skipped, attributes.length);

  return [{
    trendId: createDeterministicTrendId(context, attributes, trendConfig.method, rows),
    attributes,
    direction,
    magnitude,
    confidenceScore,
    timePeriod: 'Current dataset',
    enabledDisplay: trendConfig.enabledDisplay !== false,
    enabledCalc: true,
    description: buildTrendDescription(attributes, direction, magnitude, rows.length, skipped),
  }];
}
