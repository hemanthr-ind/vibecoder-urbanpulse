import { Router } from 'express';
import {
  hashPassword,
  hasEnvAdminConfigured,
  signSessionToken,
  verifyEnvAdminCredentials,
  verifyPassword,
} from './auth.ts';
import { analyzeCivicReportWithGemini, isGeminiConfigured } from './geminiAnalyzer.ts';
import {
  appendAudit,
  type AuthenticatedRequest,
  parseMapFiltersFromQuery,
  pushNotification,
  recomputeIssueScoring,
  refreshOfficerCounts,
  requireRole,
  sanitizeUser,
  saveBase64Image,
} from './middleware.ts';
import { getDatabase, saveDatabase } from './store.ts';
import {
  calculateAgeScore,
  calculatePriorityAssessment,
  getSeverityLabel,
} from '../src/shared/aiEngine.ts';
import {
  aggregateSeverityHeatmap,
  buildMapFeatures,
  checkTumakuruPlausibility,
  classifyGpsPrecisionBand,
  deriveLocationValidationStatus,
  filterMapFeatures,
  getCellSizeMetersForZoom,
  validateCoordinates,
} from '../src/shared/geospatial.ts';
import { computePlatformKpis } from '../src/shared/workflows.ts';
import type {
  CivicCategory,
  CivicReport,
  EvidenceAsset,
  HumanVerificationStatus,
  LocationObservation,
  MapMode,
  OperationalIssueStatus,
  PhysicalIssue,
} from '../src/shared/types.ts';

export function createAuthAndReportsRouter(): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'UrbanPulse AI',
      geminiConfigured: isGeminiConfigured(),
      timestamp: new Date().toISOString(),
    });
  });

  router.get('/auth/status', (_req, res) => {
    const db = getDatabase();
    const dbHasAdmin = db.users.some((u) => u.role === 'ADMIN' && u.passwordHash !== null);
    const unclaimedOfficers = db.officers
      .filter((o) => {
        const usr = db.users.find((u) => u.user_id === o.user_id);
        return usr && usr.passwordHash === null;
      })
      .map((o) => ({
        officer_id: o.officer_id,
        name: o.name,
        email: o.email,
        zone: o.zone,
        badge_code: o.badge_code,
      }));

    res.json({
      adminClaimed: dbHasAdmin || hasEnvAdminConfigured(),
      envAdminConfigured: hasEnvAdminConfigured(),
      unclaimedOfficers,
      geminiConfigured: isGeminiConfigured(),
    });
  });

  router.post('/auth/claim-admin', async (req, res) => {
    const db = getDatabase();
    const alreadyHasAdmin =
      hasEnvAdminConfigured() ||
      db.users.some((u) => u.role === 'ADMIN' && u.passwordHash !== null);
    if (alreadyHasAdmin) {
      res.status(409).json({
        error: 'An administrator account is already configured. Please sign in.',
      });
      return;
    }

    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!name || !email || !email.includes('@') || password.length < 6) {
      res.status(400).json({
        error: 'Provide a valid name, email address, and a password of at least 6 characters.',
      });
      return;
    }

    const existingEmail = db.users.find((u) => u.email.toLowerCase() === email);
    if (existingEmail) {
      res.status(409).json({ error: 'This email is already registered to another account.' });
      return;
    }

    const newAdmin = {
      user_id: `usr-admin-${Date.now()}`,
      name,
      email,
      role: 'ADMIN' as const,
      status: 'ACTIVE' as const,
      created_at: new Date().toISOString(),
      passwordHash: hashPassword(password),
    };
    db.users.push(newAdmin);

    appendAudit(db, {
      actor_id: newAdmin.user_id,
      actor_role: 'ADMIN',
      actor_name: newAdmin.name,
      action: 'ADMIN_ACCOUNT_CLAIMED',
      entity_type: 'AUTH',
      entity_id: newAdmin.user_id,
      summary: `Primary administrator account initialized for ${newAdmin.email}.`,
    });
    await saveDatabase(db);

    const token = signSessionToken({
      userId: newAdmin.user_id,
      email: newAdmin.email,
      name: newAdmin.name,
      role: 'ADMIN',
    });

    res.status(201).json({
      token,
      user: sanitizeUser(newAdmin),
    });
  });

  router.post('/auth/claim-officer', async (req, res) => {
    const db = getDatabase();
    const officerId = typeof req.body?.officerId === 'string' ? req.body.officerId.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!officerId || password.length < 6) {
      res.status(400).json({
        error: 'Select an officer profile and set a password of at least 6 characters.',
      });
      return;
    }

    const officer = db.officers.find((o) => o.officer_id === officerId);
    const user = officer ? db.users.find((u) => u.user_id === officer.user_id) : undefined;

    if (!officer || !user || user.role !== 'FIELD_OFFICER') {
      res.status(404).json({ error: 'Field officer profile not found.' });
      return;
    }

    if (user.passwordHash !== null) {
      res.status(409).json({
        error: 'This officer account is already claimed. Please sign in with your password.',
      });
      return;
    }

    user.passwordHash = hashPassword(password);
    appendAudit(db, {
      actor_id: user.user_id,
      actor_role: 'FIELD_OFFICER',
      actor_name: user.name,
      action: 'OFFICER_ACCOUNT_CLAIMED',
      entity_type: 'AUTH',
      entity_id: officer.officer_id,
      summary: `Field officer ${user.name} activated credentials.`,
    });
    await saveDatabase(db);

    const token = signSessionToken({
      userId: user.user_id,
      email: user.email,
      name: user.name,
      role: 'FIELD_OFFICER',
    });

    res.json({ token, user: sanitizeUser(user) });
  });

  router.post('/auth/login', (req, res) => {
    const db = getDatabase();
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const expectedRole = typeof req.body?.expectedRole === 'string' ? req.body.expectedRole : '';

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    if (verifyEnvAdminCredentials(email, password)) {
      if (expectedRole && expectedRole !== 'ADMIN') {
        res.status(403).json({
          error: 'Account role does not match the selected login role.',
        });
        return;
      }
      const token = signSessionToken({
        userId: 'usr-env-admin',
        email,
        name: 'Municipal Administrator',
        role: 'ADMIN',
      });
      res.json({
        token,
        user: {
          user_id: 'usr-env-admin',
          name: 'Municipal Administrator',
          email,
          role: 'ADMIN',
          status: 'ACTIVE',
          created_at: new Date().toISOString(),
        },
      });
      return;
    }

    const user = db.users.find((u) => u.email.toLowerCase() === email);
    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    if (user.status === 'SUSPENDED') {
      res.status(403).json({ error: 'This account is suspended. Contact an administrator.' });
      return;
    }

    if (expectedRole && user.role !== expectedRole) {
      res.status(403).json({
        error: `This account is registered as ${user.role}, not ${expectedRole}.`,
      });
      return;
    }

    const token = signSessionToken({
      userId: user.user_id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    res.json({
      token,
      user: sanitizeUser(user),
    });
  });

  router.post('/auth/citizen-register', async (req, res) => {
    const db = getDatabase();
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!name || !email || !email.includes('@') || password.length < 6) {
      res.status(400).json({
        error: 'Provide a valid name, email, and password (minimum 6 characters).',
      });
      return;
    }

    const existing = db.users.find((u) => u.email.toLowerCase() === email);
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
      return;
    }

    const newUser = {
      user_id: `usr-cit-${Date.now()}`,
      name,
      email,
      role: 'CITIZEN' as const,
      status: 'ACTIVE' as const,
      created_at: new Date().toISOString(),
      passwordHash: hashPassword(password),
    };
    db.users.push(newUser);
    await saveDatabase(db);

    const token = signSessionToken({
      userId: newUser.user_id,
      email: newUser.email,
      name: newUser.name,
      role: 'CITIZEN',
    });

    res.status(201).json({ token, user: sanitizeUser(newUser) });
  });

  router.get('/auth/me', (req: AuthenticatedRequest, res) => {
    if (!req.sessionUser) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }
    const db = getDatabase();
    const user = db.users.find((u) => u.user_id === req.sessionUser!.userId);
    if (user) {
      res.json({ user: sanitizeUser(user) });
      return;
    }
    res.json({
      user: {
        user_id: req.sessionUser.userId,
        name: req.sessionUser.name,
        email: req.sessionUser.email,
        role: req.sessionUser.role,
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
      },
    });
  });

  router.get('/dashboard', (req: AuthenticatedRequest, res) => {
    const db = getDatabase();
    for (const issue of db.issues) {
      recomputeIssueScoring(issue, db.config);
    }
    refreshOfficerCounts(db);

    const kpis = computePlatformKpis(db.reports, db.issues);
    const mapResult = buildMapFeatures(db.issues, db.reports);
    const activeRole = req.sessionUser?.role ?? 'CITIZEN';
    const userId = req.sessionUser?.userId ?? null;

    const visibleNotifications = db.notifications.filter(
      (n) =>
        n.target_role === 'ALL' ||
        n.target_role === activeRole ||
        (userId && n.recipient_user_id === userId),
    );

    const sortedReports = [...db.reports].sort(
      (a, b) => Date.parse(b.submitted_at) - Date.parse(a.submitted_at),
    );

    const sortedIssues = [...db.issues].sort(
      (a, b) => (b.priority_assessment.score ?? -1) - (a.priority_assessment.score ?? -1),
    );

    res.json({
      kpis,
      recentReports: sortedReports,
      issues: sortedIssues,
      officers: db.officers,
      config: db.config,
      notifications: visibleNotifications.slice(0, 40),
      mapSummary: {
        features: mapResult.features,
        unlocatedCount: mapResult.unlocatedCount,
        invalidCount: mapResult.invalidCount,
      },
      hasDemoSeedData: db.reports.some((r) => r.is_demo_seed),
    });
  });

  router.get('/map/data', (req, res) => {
    const db = getDatabase();
    const mode: MapMode =
      req.query.mode === 'SEVERITY_HEATMAP' ? 'SEVERITY_HEATMAP' : 'PINPOINT_REPORT_MAP';
    const zoom = Number(req.query.zoom ?? 13);
    const filters = parseMapFiltersFromQuery(req.query);

    const built = buildMapFeatures(db.issues, db.reports);
    const filteredFeatures = filterMapFeatures(built.features, filters);
    const cellSizeMeters = getCellSizeMetersForZoom(Number.isFinite(zoom) ? zoom : 13);
    const heatmapCells = aggregateSeverityHeatmap(filteredFeatures, cellSizeMeters);

    res.json({
      mode,
      features: filteredFeatures,
      filteredCount: filteredFeatures.length,
      totalLocatedCount: built.features.length,
      unlocatedCount: built.unlocatedCount,
      invalidCount: built.invalidCount,
      heatmapCells,
      cellSizeMeters,
      appliedFilters: filters,
    });
  });

  router.get('/analytics', (_req, res) => {
    const db = getDatabase();
    const kpis = computePlatformKpis(db.reports, db.issues);

    const severityDistribution = {
      CRITICAL: db.issues.filter((i) => i.severity_label === 'CRITICAL').length,
      HIGH: db.issues.filter((i) => i.severity_label === 'HIGH').length,
      MODERATE: db.issues.filter((i) => i.severity_label === 'MODERATE').length,
      LOW: db.issues.filter((i) => i.severity_label === 'LOW').length,
      UNKNOWN: db.issues.filter((i) => i.severity_label === 'UNKNOWN').length,
    };

    const priorityDistribution = {
      CRITICAL: db.issues.filter((i) => i.priority_assessment.label === 'CRITICAL').length,
      HIGH: db.issues.filter((i) => i.priority_assessment.label === 'HIGH').length,
      MODERATE: db.issues.filter((i) => i.priority_assessment.label === 'MODERATE').length,
      LOW: db.issues.filter((i) => i.priority_assessment.label === 'LOW').length,
      UNDETERMINED: db.issues.filter(
        (i) =>
          i.priority_assessment.label === 'UNDETERMINED' ||
          i.priority_assessment.label === 'PROVISIONAL_UNDETERMINED',
      ).length,
    };

    const statusCounts: Record<string, number> = {};
    for (const iss of db.issues) {
      statusCounts[iss.current_issue_status] = (statusCounts[iss.current_issue_status] ?? 0) + 1;
    }

    const totalIssues = db.issues.length;
    const resolutionRatePercent =
      totalIssues > 0 ? Math.round((kpis.resolvedIssues / totalIssues) * 1000) / 10 : 0;

    res.json({
      kpis,
      severityDistribution,
      priorityDistribution,
      statusCounts,
      resolutionRatePercent,
      officerWorkload: db.officers.map((o) => ({
        officer_id: o.officer_id,
        name: o.name,
        zone: o.zone,
        availability: o.availability,
        active_task_count: o.active_task_count,
        completed_task_count: o.completed_task_count,
        avg_resolution_hours: o.avg_resolution_hours,
      })),
      hasDemoSeedData: db.reports.some((r) => r.is_demo_seed),
    });
  });

  router.get('/reports', (req, res) => {
    const db = getDatabase();
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const category = typeof req.query.category === 'string' ? req.query.category : '';
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const mine = typeof req.query.userId === 'string' ? req.query.userId : '';

    const items = db.reports
      .filter((r) => {
        if (mine && r.submitted_by_user_id !== mine) return false;
        if (category && r.user_selected_category !== category) return false;
        if (status && r.operational_status !== status) return false;
        if (q) {
          const text = [
            r.report_reference,
            r.report_id,
            r.description,
            r.location_label,
            r.user_selected_category,
          ]
            .join(' ')
            .toLowerCase();
          if (!text.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => Date.parse(b.submitted_at) - Date.parse(a.submitted_at));

    res.json({ reports: items });
  });

  router.get('/reports/track/:reference', (req, res) => {
    const db = getDatabase();
    const ref = req.params.reference.trim().toLowerCase();
    const report = db.reports.find(
      (r) =>
        r.report_reference.toLowerCase() === ref ||
        r.report_id.toLowerCase() === ref,
    );
    if (!report) {
      res.status(404).json({ error: 'No civic report found matching that Reference ID.' });
      return;
    }
    const issue = report.physical_issue_id
      ? db.issues.find((i) => i.physical_issue_id === report.physical_issue_id) ?? null
      : null;
    res.json({ report, issue });
  });

  router.get('/reports/:id', (req, res) => {
    const db = getDatabase();
    const report = db.reports.find(
      (r) => r.report_id === req.params.id || r.report_reference === req.params.id,
    );
    if (!report) {
      res.status(404).json({ error: 'Report not found.' });
      return;
    }
    const issue = report.physical_issue_id
      ? db.issues.find((i) => i.physical_issue_id === report.physical_issue_id) ?? null
      : null;
    res.json({ report, issue });
  });

  router.post('/reports', async (req: AuthenticatedRequest, res) => {
    const db = getDatabase();
    const idempotencyKey =
      typeof req.headers['idempotency-key'] === 'string'
        ? req.headers['idempotency-key'].trim()
        : '';

    if (idempotencyKey && db.idempotencyKeys[idempotencyKey]) {
      const existingReport = db.reports.find(
        (r) => r.report_id === db.idempotencyKeys[idempotencyKey],
      );
      if (existingReport) {
        const existingIssue = existingReport.physical_issue_id
          ? db.issues.find((i) => i.physical_issue_id === existingReport.physical_issue_id) ?? null
          : null;
        res.status(200).json({ report: existingReport, issue: existingIssue, deduplicated: true });
        return;
      }
    }

    const rawCategory = req.body?.category;
    const allowedCategories: CivicCategory[] = [
      'POTHOLE',
      'GARBAGE_OR_WASTE',
      'OTHER_CIVIC_CANDIDATE',
    ];
    if (!allowedCategories.includes(rawCategory)) {
      res.status(400).json({ error: 'Invalid civic category.' });
      return;
    }

    const rawImages: string[] = Array.isArray(req.body?.images)
      ? req.body.images.filter((s: unknown): s is string => typeof s === 'string')
      : typeof req.body?.imageDataUrl === 'string'
        ? [req.body.imageDataUrl]
        : [];

    if (rawImages.length === 0) {
      res.status(400).json({ error: 'At least one JPG or PNG photograph is required.' });
      return;
    }

    const nowIso = new Date().toISOString();
    const seq = 1001 + db.reports.length;
    const reportId = `REP-TMK-${seq}`;
    const reportRef = `UP-TMK-${seq}`;

    const savedAssets: EvidenceAsset[] = [];
    for (let idx = 0; idx < rawImages.slice(0, 4).length; idx++) {
      const stored = saveBase64Image(rawImages[idx], `rep_${seq}_${idx + 1}`);
      if (!stored) {
        res.status(400).json({
          error: 'Each uploaded photograph must be a valid JPG or PNG under 8 MB.',
        });
        return;
      }
      savedAssets.push({
        evidence_id: `ev-${seq}-${idx + 1}`,
        report_id: reportId,
        url: stored.url,
        mime_type: stored.mimeType,
        file_name_safe: stored.fileNameSafe,
        width: null,
        height: null,
        captured_at: nowIso,
        uploaded_at: nowIso,
        kind: 'CITIZEN_REPORT',
      });
    }

    const description =
      typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    const additionalInfo =
      typeof req.body?.additionalInfo === 'string' ? req.body.additionalInfo.trim() : '';
    const locationLabel =
      typeof req.body?.locationLabel === 'string' && req.body.locationLabel.trim()
        ? req.body.locationLabel.trim()
        : 'Tumakuru, Karnataka';

    const coordCheck = validateCoordinates(req.body?.latitude, req.body?.longitude);
    const accuracyMeters =
      typeof req.body?.accuracyMeters === 'number' && Number.isFinite(req.body.accuracyMeters)
        ? Math.round(req.body.accuracyMeters)
        : null;
    const locationSource =
      typeof req.body?.locationSource === 'string'
        ? (req.body.locationSource as LocationObservation['location_source'])
        : coordCheck.valid
          ? 'USER_PLACED_PIN'
          : 'UNKNOWN';
    const locationMeaning =
      typeof req.body?.locationMeaning === 'string'
        ? (req.body.locationMeaning as LocationObservation['location_meaning'])
        : coordCheck.valid
          ? 'ISSUE_LOCATION'
          : 'UNKNOWN';

    const jurisdiction = checkTumakuruPlausibility(coordCheck.latitude, coordCheck.longitude);
    const locObs: LocationObservation = {
      location_observation_id: `loc-${seq}`,
      report_id: reportId,
      physical_issue_id: null,
      latitude: coordCheck.latitude,
      longitude: coordCheck.longitude,
      horizontal_accuracy_meters: accuracyMeters,
      coordinate_reference_system: 'EPSG:4326',
      location_source: locationSource,
      location_meaning: locationMeaning,
      human_readable_label: locationLabel,
      captured_at: nowIso,
      recorded_at: nowIso,
      confirmed_by_user: Boolean(req.body?.confirmedByUser ?? coordCheck.valid),
      verified_by_authorized_reviewer: false,
      validation_status: deriveLocationValidationStatus({
        latitude: coordCheck.latitude,
        longitude: coordCheck.longitude,
        accuracyMeters,
        jurisdictionStatus: jurisdiction,
      }),
      precision_band: classifyGpsPrecisionBand(accuracyMeters),
      jurisdiction_status: jurisdiction,
      supersedes_location_observation_id: null,
    };

    const submitterId = req.sessionUser?.userId ?? 'usr-public-guest';
    const submitterLabel =
      (typeof req.body?.reporterName === 'string' && req.body.reporterName.trim()) ||
      req.sessionUser?.name ||
      'Public Citizen';

    const aiResult = await analyzeCivicReportWithGemini({
      reportId,
      imageId: savedAssets[0].evidence_id,
      imageUrl: savedAssets[0].url,
      userSelectedCategory: rawCategory,
      description,
      locationLabel,
    });

    const aiRun = aiResult.analysis;
    const relevance = aiRun.image_assessment.relevance_status;
    const isIrrelevant = relevance === 'CIVIC_IRRELEVANT';
    const isUnusable = relevance === 'CIVIC_UNUSABLE';

    let aiProcessingStatus: CivicReport['ai_processing_status'] = aiResult.ok
      ? 'COMPLETED'
      : 'FAILED';
    let verificationStatus: HumanVerificationStatus = 'REVIEW_REQUIRED';
    let operationalStatus: OperationalIssueStatus = 'PENDING_VERIFICATION';
    let createdIssue: PhysicalIssue | null = null;

    if (isIrrelevant) {
      verificationStatus = 'REJECTED';
      operationalStatus = 'REJECTED';
    } else if (isUnusable) {
      verificationStatus = 'NEEDS_MORE_EVIDENCE';
      operationalStatus = 'NEEDS_ADDITIONAL_EVIDENCE';
    } else if (aiResult.ok) {
      verificationStatus = aiRun.image_assessment.manual_review_required
        ? 'REVIEW_REQUIRED'
        : 'REVIEW_RECOMMENDED';
    }

    if (!isIrrelevant) {
      const issueId = `ISS-TMK-2026-${String(db.issues.length + 1).padStart(3, '0')}`;
      locObs.physical_issue_id = issueId;
      const primaryDet = aiRun.detections[0];

      const canonicalCategory: CivicCategory =
        primaryDet?.class_id === 'POTHOLE' || primaryDet?.class_id === 'GARBAGE_OR_WASTE'
          ? primaryDet.class_id
          : relevance === 'CIVIC_OTHER_CANDIDATE'
            ? 'OTHER_CIVIC_CANDIDATE'
            : rawCategory;

      const severityScore =
        primaryDet?.severity_assessment?.score !== undefined
          ? primaryDet.severity_assessment.score
          : null;
      const publicImpactScore =
        primaryDet?.public_impact_assessment?.score !== undefined
          ? primaryDet.public_impact_assessment.score
          : null;

      const ageRes = calculateAgeScore({
        startTimestamp: nowIso,
        evaluationTimestamp: nowIso,
        isResolved: false,
        halfSaturationDays: db.config.age_half_saturation_days,
      });

      const safetyFlag =
        Boolean(primaryDet?.uncertainty_flags.includes('SAFETY_REVIEW_RECOMMENDED')) ||
        (severityScore !== null && severityScore >= 75);

      const priority = calculatePriorityAssessment({
        factors: {
          severity: severityScore,
          public_impact: publicImpactScore,
          geographical_importance: null,
          independent_corroboration: 0,
          time_unresolved: ageRes.ageScore,
        },
        weights: db.config.priority_weights,
        minCoverage: db.config.minimum_priority_factor_coverage,
        formulaVersion: db.config.formula_version,
        safetyReviewFlag: safetyFlag,
      });

      createdIssue = {
        physical_issue_id: issueId,
        canonical_category: canonicalCategory,
        canonical_summary:
          primaryDet?.visible_description ||
          aiRun.other_civic_candidates[0]?.visible_description ||
          description ||
          `${canonicalCategory} civic issue at ${locationLabel}`,
        current_issue_status: operationalStatus,
        human_verification_status: verificationStatus,
        severity_score: severityScore,
        severity_label: getSeverityLabel(severityScore),
        public_impact_score: publicImpactScore,
        geographical_importance_score: null,
        geographical_importance_status: 'UNAVAILABLE',
        corroboration_score: 0,
        confirmed_independent_report_count: 1,
        related_submission_count: 1,
        age_score: ageRes.ageScore,
        days_unresolved: ageRes.daysUnresolved,
        priority_assessment: priority,
        authoritative_location: coordCheck.valid ? locObs : null,
        location_history: [],
        human_override: null,
        assigned_officer_id: null,
        assigned_officer_name: null,
        assigned_at: null,
        due_at: null,
        field_notes: [],
        field_evidence: [],
        first_reported_at: nowIso,
        last_updated_at: nowIso,
        resolved_at: null,
        reopened_at: null,
        associated_report_ids: [reportId],
        safety_review_flag: safetyFlag,
        is_demo_seed: false,
      };
      db.issues.unshift(createdIssue);
    }

    const report: CivicReport = {
      report_id: reportId,
      report_reference: reportRef,
      submitted_by_user_id: submitterId,
      submitted_by_label: submitterLabel,
      user_selected_category: rawCategory,
      description,
      additional_info: additionalInfo,
      location_label: locationLabel,
      submitted_at: nowIso,
      updated_at: nowIso,
      ai_processing_status: aiProcessingStatus,
      human_verification_status: verificationStatus,
      operational_status: operationalStatus,
      physical_issue_id: createdIssue?.physical_issue_id ?? null,
      evidence_assets: savedAssets,
      location_observation: locObs,
      ai_analysis: aiRun,
      timeline: [
        {
          event_id: `tl-${seq}-1`,
          step: 'Submitted',
          status: 'SUBMITTED',
          actor_label: submitterLabel,
          occurred_at: nowIso,
          detail: coordCheck.valid
            ? `Report submitted with coordinates (${coordCheck.latitude?.toFixed(4)}, ${coordCheck.longitude?.toFixed(4)}).`
            : 'Report submitted without GPS coordinates (flagged as unlocated).',
        },
        {
          event_id: `tl-${seq}-2`,
          step: aiResult.ok ? 'Analysis Complete' : 'AI Processing Deferred',
          status: aiProcessingStatus,
          actor_label: 'UrbanPulse AI',
          occurred_at: new Date().toISOString(),
          detail: aiResult.ok
            ? `${aiRun.image_assessment.relevance_status} (${aiRun.verification_recommendation.recommendation})`
            : aiResult.errorMessage || 'AI vision unavailable; retained for manual review.',
        },
      ],
      is_demo_seed: false,
    };

    db.reports.unshift(report);
    if (idempotencyKey) {
      db.idempotencyKeys[idempotencyKey] = report.report_id;
    }

    pushNotification(db, {
      target_role: 'ADMIN',
      recipient_user_id: null,
      type: 'NEW_REPORT',
      title: `New Report ${reportRef}`,
      message: `${submitterLabel} submitted a ${rawCategory.replaceAll('_', ' ').toLowerCase()} report at ${locationLabel}.`,
      related_report_id: reportId,
      related_issue_id: createdIssue?.physical_issue_id ?? null,
    });

    appendAudit(db, {
      actor_id: submitterId,
      actor_role: req.sessionUser?.role ?? 'CITIZEN',
      actor_name: submitterLabel,
      action: 'REPORT_SUBMITTED',
      entity_type: 'REPORT',
      entity_id: reportId,
      summary: `Submitted ${reportRef} (${aiProcessingStatus}, ${relevance}).`,
    });

    await saveDatabase(db);

    res.status(201).json({
      report,
      issue: createdIssue,
      aiError: aiResult.ok ? null : aiResult.errorMessage,
    });
  });

  router.post(
    '/reports/:id/analyze',
    requireRole(['ADMIN', 'FIELD_OFFICER']),
    async (req: AuthenticatedRequest, res) => {
      const db = getDatabase();
      const report = db.reports.find(
        (r) => r.report_id === req.params.id || r.report_reference === req.params.id,
      );
      if (!report) {
        res.status(404).json({ error: 'Report not found.' });
        return;
      }
      if (report.evidence_assets.length === 0) {
        res.status(400).json({ error: 'Report has no attached image evidence.' });
        return;
      }

      const aiResult = await analyzeCivicReportWithGemini({
        reportId: report.report_id,
        imageId: report.evidence_assets[0].evidence_id,
        imageUrl: report.evidence_assets[0].url,
        userSelectedCategory: report.user_selected_category,
        description: report.description,
        locationLabel: report.location_label,
      });

      report.ai_analysis = aiResult.analysis;
      report.ai_processing_status = aiResult.ok ? 'COMPLETED' : 'FAILED';
      report.updated_at = new Date().toISOString();
      report.timeline.push({
        event_id: `tl-re-${Date.now()}`,
        step: 'AI Re-analysis',
        status: report.ai_processing_status,
        actor_label: req.sessionUser!.name,
        occurred_at: report.updated_at,
        detail: aiResult.ok
          ? `Re-evaluated: ${aiResult.analysis.image_assessment.relevance_status}`
          : aiResult.errorMessage || 'Re-analysis failed.',
      });

      const issue = report.physical_issue_id
        ? db.issues.find((i) => i.physical_issue_id === report.physical_issue_id)
        : undefined;
      if (issue && aiResult.ok && !issue.human_override) {
        const det = aiResult.analysis.detections[0];
        if (det) {
          issue.severity_score = det.severity_assessment.score;
          issue.public_impact_score = det.public_impact_assessment.score;
          issue.canonical_summary = det.visible_description;
        }
        recomputeIssueScoring(issue, db.config);
      }

      appendAudit(db, {
        actor_id: req.sessionUser!.userId,
        actor_role: req.sessionUser!.role,
        actor_name: req.sessionUser!.name,
        action: 'AI_ANALYSIS_RERUN',
        entity_type: 'REPORT',
        entity_id: report.report_id,
        summary: `Re-ran Gemini vision analysis on ${report.report_reference} (${report.ai_processing_status}).`,
      });
      await saveDatabase(db);

      res.json({ report, issue: issue ?? null, aiError: aiResult.ok ? null : aiResult.errorMessage });
    },
  );

  return router;
}
