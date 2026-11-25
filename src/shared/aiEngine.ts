import type {
  AiAnalysisRun,
  PriorityAssessment,
  PriorityFactorScores,
  PriorityLabel,
  PriorityWeights,
  SeverityLabel,
} from './types.ts';

export const DEFAULT_PRIORITY_WEIGHTS: PriorityWeights = {
  severity: 35,
  public_impact: 25,
  geographical_importance: 15,
  independent_corroboration: 15,
  time_unresolved: 10,
};

export const DEFAULT_MIN_COVERAGE = 0.6;
export const DEFAULT_AGE_HALF_SATURATION_DAYS = 14;

export function getSeverityLabel(score: number | null | undefined): SeverityLabel {
  if (score === null || score === undefined || !Number.isFinite(score)) {
    return 'UNKNOWN';
  }
  const clamped = Math.max(0, Math.min(100, score));
  if (clamped < 25) return 'LOW';
  if (clamped < 50) return 'MODERATE';
  if (clamped < 75) return 'HIGH';
  return 'CRITICAL';
}

export function getPriorityLabel(
  score: number | null | undefined,
  isProvisional = false,
): PriorityLabel {
  if (score === null || score === undefined || !Number.isFinite(score)) {
    return isProvisional ? 'PROVISIONAL_UNDETERMINED' : 'UNDETERMINED';
  }
  const clamped = Math.max(0, Math.min(100, score));
  if (clamped < 25) return 'LOW';
  if (clamped < 50) return 'MODERATE';
  if (clamped < 75) return 'HIGH';
  return 'CRITICAL';
}

export function calculateCorroborationScore(
  confirmedAdditionalIndependentReports: number | null | undefined,
): number | null {
  if (
    confirmedAdditionalIndependentReports === null ||
    confirmedAdditionalIndependentReports === undefined ||
    !Number.isFinite(confirmedAdditionalIndependentReports) ||
    confirmedAdditionalIndependentReports < 0
  ) {
    return null;
  }
  const count = Math.floor(confirmedAdditionalIndependentReports);
  if (count === 0) return 0;
  if (count === 1) return 20;
  if (count === 2) return 40;
  if (count <= 4) return 60;
  if (count <= 9) return 80;
  return 100;
}

export function calculateAgeScore(params: {
  startTimestamp: string | null | undefined;
  evaluationTimestamp: string | null | undefined;
  isResolved: boolean;
  halfSaturationDays?: number;
}): {
  daysUnresolved: number | null;
  ageScore: number | null;
  error: string | null;
} {
  if (params.isResolved) {
    return { daysUnresolved: 0, ageScore: null, error: 'RESOLVED_STOPPED' };
  }
  if (!params.startTimestamp || !params.evaluationTimestamp) {
    return { daysUnresolved: null, ageScore: null, error: 'TIMESTAMP_MISSING' };
  }
  const startMs = Date.parse(params.startTimestamp);
  const evalMs = Date.parse(params.evaluationTimestamp);
  if (!Number.isFinite(startMs) || !Number.isFinite(evalMs)) {
    return { daysUnresolved: null, ageScore: null, error: 'TIMESTAMP_INVALID' };
  }
  if (evalMs < startMs) {
    return { daysUnresolved: null, ageScore: null, error: 'CHRONOLOGY_INVALID' };
  }
  const days = (evalMs - startMs) / (1000 * 60 * 60 * 24);
  const halfSat = params.halfSaturationDays ?? DEFAULT_AGE_HALF_SATURATION_DAYS;
  const rawScore = (100 * days) / (days + halfSat);
  return {
    daysUnresolved: Math.round(days * 10) / 10,
    ageScore: Math.round(rawScore * 10) / 10,
    error: null,
  };
}

export function validatePriorityWeights(weights: PriorityWeights): boolean {
  const sum =
    weights.severity +
    weights.public_impact +
    weights.geographical_importance +
    weights.independent_corroboration +
    weights.time_unresolved;
  return Math.abs(sum - 100) < 0.001;
}

export function calculatePriorityAssessment(params: {
  factors: PriorityFactorScores;
  weights?: PriorityWeights;
  minCoverage?: number;
  formulaVersion?: string;
  safetyReviewFlag?: boolean;
}): PriorityAssessment {
  const weights = params.weights ?? DEFAULT_PRIORITY_WEIGHTS;
  const minCoverage = params.minCoverage ?? DEFAULT_MIN_COVERAGE;
  const formulaVersion = params.formulaVersion ?? 'up-priority-v1.0';
  const safetyFlag = Boolean(params.safetyReviewFlag);

  if (!validatePriorityWeights(weights)) {
    return {
      status: 'UNAVAILABLE',
      score: null,
      label: 'UNDETERMINED',
      is_provisional: false,
      formula_id: 'URBANPULSE_PRIORITY_5FACTOR',
      formula_version: formulaVersion,
      factor_scores: params.factors,
      factor_weights: weights,
      available_weight_coverage: 0,
      missing_factors: ['INVALID_WEIGHT_CONFIGURATION'],
      calculation_expression: 'Configuration error: factor weights do not sum to 100%',
      calculation_explanation: 'Priority weights must sum to 100 before scoring.',
      safety_review_flag: safetyFlag,
      ranking_eligibility: 'NOT_ELIGIBLE',
      comparability_warnings: ['WEIGHT_CONFIGURATION_INVALID'],
    };
  }

  const entries: Array<{
    key: keyof PriorityFactorScores;
    label: string;
    score: number | null;
    weight: number;
  }> = [
    { key: 'severity', label: 'Visual Severity', score: params.factors.severity, weight: weights.severity },
    { key: 'public_impact', label: 'Public Impact', score: params.factors.public_impact, weight: weights.public_impact },
    {
      key: 'geographical_importance',
      label: 'Geographical Importance',
      score: params.factors.geographical_importance,
      weight: weights.geographical_importance,
    },
    {
      key: 'independent_corroboration',
      label: 'Corroboration',
      score: params.factors.independent_corroboration,
      weight: weights.independent_corroboration,
    },
    { key: 'time_unresolved', label: 'Age Score', score: params.factors.time_unresolved, weight: weights.time_unresolved },
  ];

  const available = entries.filter(
    (e) => e.score !== null && e.score !== undefined && Number.isFinite(e.score) && e.score >= 0 && e.score <= 100,
  );
  const missing = entries
    .filter((e) => !available.some((a) => a.key === e.key))
    .map((e) => e.key);

  const availableWeightSum = available.reduce((acc, item) => acc + item.weight, 0);
  const coverage = Math.round((availableWeightSum / 100) * 1000) / 1000;

  if (coverage < minCoverage || availableWeightSum <= 0) {
    return {
      status: 'INSUFFICIENT_FACTOR_COVERAGE',
      score: null,
      label: 'UNDETERMINED',
      is_provisional: false,
      formula_id: 'URBANPULSE_PRIORITY_5FACTOR',
      formula_version: formulaVersion,
      factor_scores: params.factors,
      factor_weights: weights,
      available_weight_coverage: coverage,
      missing_factors: missing,
      calculation_expression: `Coverage ${(coverage * 100).toFixed(0)}% < ${(minCoverage * 100).toFixed(0)}% minimum threshold`,
      calculation_explanation:
        'Available factor weight coverage is below the 60% minimum threshold. Missing values are never replaced with zero.',
      safety_review_flag: safetyFlag,
      ranking_eligibility: 'NOT_ELIGIBLE',
      comparability_warnings: ['INSUFFICIENT_FACTOR_COVERAGE'],
    };
  }

  const weightedSum = available.reduce((acc, item) => acc + (item.score as number) * item.weight, 0);
  const isProvisional = missing.length > 0;
  const rawScore = isProvisional ? weightedSum / availableWeightSum : weightedSum / 100;
  const roundedScore = Math.round(rawScore * 10) / 10;

  const expressionParts = available.map(
    (item) => `(${(item.score as number).toFixed(1)} × ${(item.weight / 100).toFixed(2)})`,
  );
  const expression = isProvisional
    ? `[${expressionParts.join(' + ')}] / ${(availableWeightSum / 100).toFixed(2)} = ${roundedScore}`
    : `${expressionParts.join(' + ')} = ${roundedScore}`;

  return {
    status: isProvisional ? 'PROVISIONAL' : 'COMPLETE',
    score: roundedScore,
    label: getPriorityLabel(roundedScore, isProvisional),
    is_provisional: isProvisional,
    formula_id: 'URBANPULSE_PRIORITY_5FACTOR',
    formula_version: formulaVersion,
    factor_scores: params.factors,
    factor_weights: weights,
    available_weight_coverage: coverage,
    missing_factors: missing,
    calculation_expression: expression,
    calculation_explanation: isProvisional
      ? `Provisional normalized score computed across ${(coverage * 100).toFixed(0)}% available factor weight (missing: ${missing.join(', ')}).`
      : 'Complete weighted priority score across all 5 configured factors.',
    safety_review_flag: safetyFlag,
    ranking_eligibility: isProvisional ? 'PROVISIONAL_ELIGIBLE' : 'ELIGIBLE',
    comparability_warnings: isProvisional ? ['PROVISIONAL_SCORE_MISSING_FACTORS'] : [],
  };
}

export function validateBoundingBoxNormalized(
  box: unknown,
): [number, number, number, number] | null {
  if (!Array.isArray(box) || box.length !== 4) return null;
  const nums = box.map((v) => Number(v));
  if (nums.some((n) => !Number.isFinite(n) || n < 0 || n > 1)) return null;
  const [xMin, yMin, xMax, yMax] = nums;
  if (xMin >= xMax || yMin >= yMax) return null;
  return [xMin, yMin, xMax, yMax];
}

export function validateAndNormalizeAiAnalysis(raw: Partial<AiAnalysisRun>): {
  valid: boolean;
  warnings: string[];
  normalized: Partial<AiAnalysisRun>;
} {
  const warnings: string[] = [];
  const detections = Array.isArray(raw.detections) ? raw.detections : [];

  const sanitizedDetections = detections.map((det) => {
    const rawConf =
      det.raw_confidence !== null &&
      det.raw_confidence !== undefined &&
      Number.isFinite(det.raw_confidence) &&
      det.raw_confidence >= 0 &&
      det.raw_confidence <= 1
        ? det.raw_confidence
        : null;

    if (det.raw_confidence !== null && det.raw_confidence !== undefined && rawConf === null) {
      warnings.push(`Invalid detector confidence ignored for ${det.detection_id}`);
    }

    const validBox = validateBoundingBoxNormalized(det.bounding_box_normalized);
    if (det.bounding_box_normalized && !validBox) {
      warnings.push(`Out-of-range bounding box discarded for ${det.detection_id}`);
    }

    const sevScore =
      det.severity_assessment?.score !== null &&
      det.severity_assessment?.score !== undefined &&
      Number.isFinite(det.severity_assessment.score) &&
      det.severity_assessment.score >= 0 &&
      det.severity_assessment.score <= 100
        ? Math.round(det.severity_assessment.score)
        : null;

    return {
      ...det,
      raw_confidence: rawConf,
      normalized_confidence: rawConf,
      confidence_percent: rawConf !== null ? Math.round(rawConf * 1000) / 10 : null,
      bounding_box_normalized: validBox,
      localization_status: validBox ? det.localization_status : 'NOT_PROVIDED_BY_DETECTOR',
      severity_assessment: {
        ...det.severity_assessment,
        score: sevScore,
        label: getSeverityLabel(sevScore),
      },
    };
  });

  return {
    valid: Boolean(raw.image_assessment?.relevance_status),
    warnings,
    normalized: {
      ...raw,
      detections: sanitizedDetections,
      uncertainty_and_warnings: [...(raw.uncertainty_and_warnings ?? []), ...warnings],
    },
  };
}
