                      : 'PENDING',
                rubric_version: '1.0-provisional',
                dimension_scores: {},
                dimension_weights: {},
                available_dimension_coverage: sevScore !== null ? 0.8 : 0,
                evidence_summary: det.severity_evidence_summary || '',
                missing_evidence: det.missing_severity_evidence ?? [],
                assessment_uncertainty: 'Assessed via VISION_ONLY model; no dedicated object detector connected.',
                human_review_recommended: Boolean(parsed.manual_review_required || det.safety_review_recommended),
              },
              public_impact_assessment: {
                status: impScore !== null ? 'ASSESSED' : 'UNAVAILABLE',
                score: impScore,
                dimension_scores: {},
                dimension_weights: {},
                available_dimension_coverage: impScore !== null ? 0.75 : 0,
                evidence_summary: det.public_impact_summary || '',
                verified_context_used: [],
                unknown_context: ['Exact traffic and pedestrian volume'],
                assessment_uncertainty: 'Derived from visual scene cues only.',
              },
              uncertainty_flags: [
                'DETECTOR_UNAVAILABLE_VISION_ONLY',
                ...(det.safety_review_recommended ? ['SAFETY_REVIEW_RECOMMENDED'] : []),
              ],
              verification_status: 'REVIEW_REQUIRED',
            };
          });

    const detectedClasses = Array.from(
      new Set(
        normalizedDetections
          .filter((d) => d.class_id === 'POTHOLE' || d.class_id === 'GARBAGE_OR_WASTE')
          .map((d) => d.class_id as 'POTHOLE' | 'GARBAGE_OR_WASTE'),
      ),
    );

    const draft: AiAnalysisRun = {
      analysis_id: analysisId,
      report_id: params.reportId,
      schema_version: '1.0',
      analysis_status: parsed.manual_review_required ? 'REQUIRES_REVIEW' : 'SUCCESS',
      analysis_mode: 'VISION_ONLY',
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      image_assessment: {
        relevance_status: relevanceStatus,
        relevance_reason: parsed.relevance_reason,
        image_quality_status: parsed.image_quality_status || 'GOOD',
        quality_issues: parsed.quality_issues ?? [],
        screenshot_or_rephotographed_evidence: Boolean(parsed.screenshot_or_rephotographed),
        image_integrity_status: parsed.screenshot_or_rephotographed
          ? 'POSSIBLE_IMAGE_INTEGRITY_CONCERN'
          : 'NO_CONCERN_IDENTIFIED',
        user_category_match_status: parsed.user_category_match || 'NOT_APPLICABLE',
        user_description_match_status: parsed.user_description_match || 'UNVERIFIED',
        manual_review_required: Boolean(parsed.manual_review_required),
      },
      detected_classes: detectedClasses,
      detections: normalizedDetections,
      other_civic_candidates: parsed.other_civic_candidates ?? [],
      verification_recommendation: {
        recommendation: (parsed.verification_recommendation as AiAnalysisRun['verification_recommendation']['recommendation']) || 'REVIEW_RECOMMENDED',
        reason_codes: ['VISION_ONLY_MODE'],
        reason_summary: parsed.recommendation_reason || parsed.relevance_reason,
        additional_evidence_requested: [],
      },
      uncertainty_and_warnings: [
        'VISION_ONLY mode active: detector confidence and bounding boxes are null (not fabricated).',
        ...(parsed.uncertainty_warnings ?? []),
      ],
      model_metadata: {
        vision_model_name: process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct',
        vision_model_version: 'v1',
        detector_name: null,
        detector_version: null,
        calibration_status: 'NOT_APPLICABLE_VISION_ONLY',
        prompt_version: 'urbanpulse-master-v1.0',
        severity_rubric_version: '1.0-provisional',
        priority_formula_version: 'up-priority-v1.0',
      },
    };

    const validated = validateAndNormalizeAiAnalysis(draft);
    return {
      ok: true,
      analysis: {
        ...draft,
        ...(validated.normalized as Partial<AiAnalysisRun>),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Groq AI inference error';
    return {
      ok: false,
      errorMessage: message,
      analysis: {
        analysis_id: analysisId,
        report_id: params.reportId,
        schema_version: '1.0',
        analysis_status: 'FAILED',
        analysis_mode: 'VISION_ONLY',
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        image_assessment: {
          relevance_status: 'CIVIC_UNCERTAIN',
          relevance_reason: `AI inference failed: ${message}`,
          image_quality_status: 'GOOD',
          quality_issues: [],
          screenshot_or_rephotographed_evidence: false,
          image_integrity_status: 'NOT_EVALUATED',
          user_category_match_status: 'NOT_APPLICABLE',
          user_description_match_status: 'UNVERIFIED',
          manual_review_required: true,
        },
        detected_classes: [],
        detections: [],
        other_civic_candidates: [],
        verification_recommendation: {
          recommendation: 'PIPELINE_FAILURE_REQUIRES_RETRY',
          reason_codes: ['VISION_REVIEW_UNAVAILABLE'],
          reason_summary: 'AI inference encountered an upstream error; report retained safely.',
          additional_evidence_requested: [],
        },
        uncertainty_and_warnings: [`AI failure: ${message}`],
        model_metadata: {
          vision_model_name: process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct',
          vision_model_version: 'v1',
          detector_name: null,
          detector_version: null,
          calibration_status: 'NOT_APPLICABLE',
          prompt_version: 'urbanpulse-master-v1.0',
          severity_rubric_version: '1.0-provisional',
          priority_formula_version: 'up-priority-v1.0',
        },
        failure_summary: message,
      },
    };
  }
}
