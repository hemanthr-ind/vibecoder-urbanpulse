import { Router } from 'express';
import { hashPassword } from './auth.ts';
import {
  appendAudit,
  type AuthenticatedRequest,
  pushNotification,
  recomputeIssueScoring,
  refreshOfficerCounts,
  requireRole,
  sanitizeUser,
  saveBase64Image,
} from './middleware.ts';
import { getDatabase, saveDatabase } from './store.ts';
import { getSeverityLabel, validatePriorityWeights } from '../src/shared/aiEngine.ts';
import {
  checkTumakuruPlausibility,
  classifyGpsPrecisionBand,
  deriveLocationValidationStatus,
  validateCoordinates,
} from '../src/shared/geospatial.ts';
import { validateIssueTransition } from '../src/shared/workflows.ts';
import type {
  CivicCategory,
  HumanOverrideRecord,
  LocationObservation,
  OperationalIssueStatus,
} from '../src/shared/types.ts';

export function createIssuesAndAdminRouter(): Router {
  const router = Router();

  router.post(
    '/issues/:id/verify',
    requireRole(['ADMIN']),
    async (req: AuthenticatedRequest, res) => {
      const db = getDatabase();
      const issue = db.issues.find((i) => i.physical_issue_id === req.params.id);
      if (!issue) {
        res.status(404).json({ error: 'Physical issue not found.' });
        return;
      }

      const action = req.body?.action as HumanOverrideRecord['action'] | undefined;
      const validActions: HumanOverrideRecord['action'][] = [
        'CONFIRM',
        'CORRECT_CLASSIFICATION',
        'REJECT',
        'REQUEST_EVIDENCE',
        'MARK_UNCERTAIN',
        'ESCALATE',
      ];
      if (!action || !validActions.includes(action)) {
        res.status(400).json({ error: 'Invalid verification action.' });
        return;
      }

      const reason =
        typeof req.body?.reason === 'string' && req.body.reason.trim()
          ? req.body.reason.trim()
          : `Action ${action} applied by ${req.sessionUser!.name}`;
      const nowIso = new Date().toISOString();

      let targetStatus: OperationalIssueStatus = issue.current_issue_status;
      if (action === 'CONFIRM' || action === 'CORRECT_CLASSIFICATION') {
        targetStatus = issue.assigned_officer_id ? 'ASSIGNED' : 'VERIFIED';
        issue.human_verification_status =
          action === 'CORRECT_CLASSIFICATION' ? 'CORRECTED' : 'VERIFIED';
      } else if (action === 'REJECT') {
        targetStatus = 'REJECTED';
        issue.human_verification_status = 'REJECTED';
      } else if (action === 'REQUEST_EVIDENCE') {
        targetStatus = 'NEEDS_ADDITIONAL_EVIDENCE';
        issue.human_verification_status = 'NEEDS_MORE_EVIDENCE';
      } else if (action === 'MARK_UNCERTAIN') {
        targetStatus = 'PENDING_VERIFICATION';
        issue.human_verification_status = 'UNCERTAIN';
      } else if (action === 'ESCALATE') {
        targetStatus = 'VERIFIED';
        issue.human_verification_status = 'VERIFIED';
        issue.safety_review_flag = true;
      }

      const transition = validateIssueTransition({
        from: issue.current_issue_status,
        to: targetStatus,
        actorRole: req.sessionUser!.role,
      });
      if (!transition.allowed) {
        res.status(400).json({ error: transition.reason });
        return;
      }

      const prevCategory = issue.canonical_category;
      const prevSeverity = issue.severity_score;

      if (action === 'CORRECT_CLASSIFICATION') {
        const nextCat = req.body?.newCategory as CivicCategory | undefined;
        if (
          nextCat === 'POTHOLE' ||
          nextCat === 'GARBAGE_OR_WASTE' ||
          nextCat === 'OTHER_CIVIC_CANDIDATE'
        ) {
          issue.canonical_category = nextCat;
        }
        if (
          typeof req.body?.newSeverityScore === 'number' &&
          Number.isFinite(req.body.newSeverityScore)
        ) {
          const clamped = Math.max(0, Math.min(100, Math.round(req.body.newSeverityScore)));
          issue.severity_score = clamped;
          issue.severity_label = getSeverityLabel(clamped);
        }
      }

      if (typeof req.body?.geographicalImportanceScore === 'number') {
        const geo = Math.max(
          0,
          Math.min(100, Math.round(req.body.geographicalImportanceScore)),
        );
        issue.geographical_importance_score = geo;
        issue.geographical_importance_status = 'VERIFIED_CONTEXT';
      }

      if (action === 'ESCALATE' && (issue.severity_score === null || issue.severity_score < 80)) {
        issue.severity_score = 82;
        issue.severity_label = getSeverityLabel(82);
      }

      // Preserve original AI analysis untouched and log explicit human override record
      issue.human_override = {
        override_id: `ovr-${Date.now()}`,
        reviewer_id: req.sessionUser!.userId,
        reviewer_name: req.sessionUser!.name,
        decided_at: nowIso,
        action,
        previous_category: prevCategory,
        new_category: issue.canonical_category,
        previous_severity_score: prevSeverity,
        new_severity_score: issue.severity_score,
        reason,
      };

      issue.current_issue_status = targetStatus;
      issue.last_updated_at = nowIso;
      recomputeIssueScoring(issue, db.config);

      for (const repId of issue.associated_report_ids) {
        const report = db.reports.find((r) => r.report_id === repId);
        if (report) {
          report.human_verification_status = issue.human_verification_status;
          report.operational_status = issue.current_issue_status;
          report.updated_at = nowIso;
          report.timeline.push({
            event_id: `tl-ver-${Date.now()}`,
            step: `Verification (${action})`,
            status: issue.current_issue_status,
            actor_label: req.sessionUser!.name,
            occurred_at: nowIso,
            detail: reason,
          });
        }
      }

      pushNotification(db, {
        target_role: 'CITIZEN',
        recipient_user_id: null,
        type: 'ISSUE_VERIFIED',
        title: `Update on ${issue.physical_issue_id}`,
        message: `Status updated to ${issue.current_issue_status.replaceAll('_', ' ')}.`,
        related_report_id: issue.associated_report_ids[0] ?? null,
        related_issue_id: issue.physical_issue_id,
      });

      appendAudit(db, {
        actor_id: req.sessionUser!.userId,
        actor_role: req.sessionUser!.role,
        actor_name: req.sessionUser!.name,
        action: `ISSUE_VERIFY_${action}`,
        entity_type: 'ISSUE',
        entity_id: issue.physical_issue_id,
        summary: `${action} on ${issue.physical_issue_id}: ${reason}`,
      });
      await saveDatabase(db);

      res.json({ issue });
    },
  );

  router.post(
    '/issues/:id/location',
    requireRole(['ADMIN', 'FIELD_OFFICER']),
    async (req: AuthenticatedRequest, res) => {
      const db = getDatabase();
      const issue = db.issues.find((i) => i.physical_issue_id === req.params.id);
      if (!issue) {
        res.status(404).json({ error: 'Physical issue not found.' });
        return;
      }

      const coordCheck = validateCoordinates(req.body?.latitude, req.body?.longitude);
      if (!coordCheck.valid || coordCheck.latitude === null || coordCheck.longitude === null) {
        res.status(400).json({ error: 'Valid WGS84 latitude and longitude are required.' });
        return;
      }

      const nowIso = new Date().toISOString();
      const previous = issue.authoritative_location;
      if (previous) {
        issue.location_history.push(previous);
      }

      const accuracy =
        typeof req.body?.accuracyMeters === 'number' && Number.isFinite(req.body.accuracyMeters)
          ? Math.round(req.body.accuracyMeters)
          : 8;
      const label =
        typeof req.body?.locationLabel === 'string' && req.body.locationLabel.trim()
          ? req.body.locationLabel.trim()
          : previous?.human_readable_label || 'Tumakuru, Karnataka';

      const jurisdiction = checkTumakuruPlausibility(coordCheck.latitude, coordCheck.longitude);
      const nextLoc: LocationObservation = {
        location_observation_id: `loc-${Date.now()}`,
        report_id: issue.associated_report_ids[0] ?? issue.physical_issue_id,
        physical_issue_id: issue.physical_issue_id,
        latitude: coordCheck.latitude,
        longitude: coordCheck.longitude,
        horizontal_accuracy_meters: accuracy,
        coordinate_reference_system: 'EPSG:4326',
        location_source: 'VERIFIED_REVIEWER_CORRECTION',
        location_meaning: 'ISSUE_LOCATION',
        human_readable_label: label,
        captured_at: nowIso,
        recorded_at: nowIso,
        confirmed_by_user: true,
        verified_by_authorized_reviewer: true,
        validation_status: deriveLocationValidationStatus({
          latitude: coordCheck.latitude,
          longitude: coordCheck.longitude,
          accuracyMeters: accuracy,
          jurisdictionStatus: jurisdiction,
        }),
        precision_band: classifyGpsPrecisionBand(accuracy),
        jurisdiction_status: jurisdiction,
        supersedes_location_observation_id: previous?.location_observation_id ?? null,
      };

      issue.authoritative_location = nextLoc;
      issue.last_updated_at = nowIso;

      for (const repId of issue.associated_report_ids) {
        const rep = db.reports.find((r) => r.report_id === repId);
        if (rep) {
          rep.location_label = label;
          rep.updated_at = nowIso;
          rep.timeline.push({
            event_id: `tl-loc-${Date.now()}`,
            step: 'Location Verified',
            status: issue.current_issue_status,
            actor_label: req.sessionUser!.name,
            occurred_at: nowIso,
            detail: `Authoritative pin verified at (${coordCheck.latitude.toFixed(5)}, ${coordCheck.longitude.toFixed(5)}).`,
          });
        }
      }

      appendAudit(db, {
        actor_id: req.sessionUser!.userId,
        actor_role: req.sessionUser!.role,
        actor_name: req.sessionUser!.name,
        action: 'LOCATION_VERIFIED',
        entity_type: 'ISSUE',
        entity_id: issue.physical_issue_id,
        summary: `Updated authoritative location for ${issue.physical_issue_id} (${label}).`,
      });
      await saveDatabase(db);

      res.json({ issue });
    },
  );

  router.post(
    '/issues/:id/assign',
    requireRole(['ADMIN']),
    async (req: AuthenticatedRequest, res) => {
      const db = getDatabase();
      const issue = db.issues.find((i) => i.physical_issue_id === req.params.id);
      if (!issue) {
        res.status(404).json({ error: 'Physical issue not found.' });
        return;
      }

      const officerId = typeof req.body?.officerId === 'string' ? req.body.officerId.trim() : '';
      const officer = db.officers.find((o) => o.officer_id === officerId);
      if (!officer) {
        res.status(404).json({ error: 'Selected field officer was not found.' });
        return;
      }

      const transition = validateIssueTransition({
        from: issue.current_issue_status,
        to: 'ASSIGNED',
        actorRole: req.sessionUser!.role,
      });
      if (!transition.allowed) {
        res.status(400).json({ error: transition.reason });
        return;
      }

      const nowIso = new Date().toISOString();
      issue.assigned_officer_id = officer.officer_id;
      issue.assigned_officer_name = officer.name;
      issue.assigned_at = nowIso;
      issue.due_at =
        typeof req.body?.dueAt === 'string' && req.body.dueAt
          ? req.body.dueAt
          : new Date(Date.now() + 48 * 3600000).toISOString();
      issue.current_issue_status = 'ASSIGNED';
      if (issue.human_verification_status === 'NOT_REVIEWED' || issue.human_verification_status === 'REVIEW_RECOMMENDED' || issue.human_verification_status === 'REVIEW_REQUIRED') {
        issue.human_verification_status = 'VERIFIED';
      }
      issue.last_updated_at = nowIso;

      for (const repId of issue.associated_report_ids) {
        const rep = db.reports.find((r) => r.report_id === repId);
        if (rep) {
          rep.operational_status = 'ASSIGNED';
          rep.human_verification_status = issue.human_verification_status;
          rep.updated_at = nowIso;
          rep.timeline.push({
            event_id: `tl-asg-${Date.now()}`,
            step: 'Assigned to Field Officer',
            status: 'ASSIGNED',
            actor_label: req.sessionUser!.name,
            occurred_at: nowIso,
            detail: `Dispatched to ${officer.name} (${officer.zone}).`,
          });
        }
      }

      refreshOfficerCounts(db);
      pushNotification(db, {
        target_role: 'FIELD_OFFICER',
        recipient_user_id: officer.user_id,
        type: 'TASK_ASSIGNED',
        title: `New Field Assignment: ${issue.physical_issue_id}`,
        message: `${issue.canonical_summary} (${issue.authoritative_location?.human_readable_label ?? 'Location pending'})`,
        related_report_id: issue.associated_report_ids[0] ?? null,
        related_issue_id: issue.physical_issue_id,
      });

      appendAudit(db, {
        actor_id: req.sessionUser!.userId,
        actor_role: req.sessionUser!.role,
        actor_name: req.sessionUser!.name,
        action: 'ISSUE_ASSIGNED',
        entity_type: 'ISSUE',
        entity_id: issue.physical_issue_id,
        summary: `Assigned ${issue.physical_issue_id} to ${officer.name}.`,
      });
      await saveDatabase(db);

      res.json({ issue, officers: db.officers });
    },
  );

  router.post(
    '/issues/:id/field-update',
    requireRole(['FIELD_OFFICER', 'ADMIN']),
    async (req: AuthenticatedRequest, res) => {
      const db = getDatabase();
      const issue = db.issues.find((i) => i.physical_issue_id === req.params.id);
      if (!issue) {
        res.status(404).json({ error: 'Physical issue not found.' });
        return;
      }

      const officer = db.officers.find((o) => o.user_id === req.sessionUser!.userId);
      if (
        req.sessionUser!.role === 'FIELD_OFFICER' &&
        issue.assigned_officer_id &&
        officer &&
        issue.assigned_officer_id !== officer.officer_id
      ) {
        res.status(403).json({
          error: 'This task is assigned to another field officer.',
        });
        return;
      }

      const stage = String(req.body?.stage ?? 'IN_PROGRESS');
      const noteText = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
      const nowIso = new Date().toISOString();

      let nextStatus: OperationalIssueStatus = issue.current_issue_status;
      if (stage === 'ACCEPT' || stage === 'START_INSPECTION' || stage === 'IN_PROGRESS') {
        nextStatus = 'IN_PROGRESS';
      } else if (stage === 'SUBMIT_RESOLUTION') {
        nextStatus = db.config.auto_resolve_on_field_submission
          ? 'RESOLVED'
          : 'RESOLUTION_SUBMITTED';
      } else if (stage === 'REQUEST_REASSESSMENT') {
        nextStatus = 'NEEDS_ADDITIONAL_EVIDENCE';
      }

      const transition = validateIssueTransition({
        from: issue.current_issue_status,
        to: nextStatus,
        actorRole: req.sessionUser!.role,
      });
      if (!transition.allowed) {
        res.status(400).json({ error: transition.reason });
        return;
      }

      if (typeof req.body?.evidenceDataUrl === 'string' && req.body.evidenceDataUrl.trim()) {
        const stored = saveBase64Image(req.body.evidenceDataUrl, `fld_${issue.physical_issue_id}`);
        if (!stored) {
          res.status(400).json({ error: 'Uploaded field evidence must be a valid JPG/PNG image.' });
          return;
        }
        issue.field_evidence.push({
          evidence_id: `fev-${Date.now()}`,
          report_id: issue.associated_report_ids[0] ?? issue.physical_issue_id,
          url: stored.url,
          mime_type: stored.mimeType,
          file_name_safe: stored.fileNameSafe,
          width: null,
          height: null,
          captured_at: nowIso,
          uploaded_at: nowIso,
          kind: stage === 'SUBMIT_RESOLUTION' ? 'FIELD_RESOLUTION' : 'FIELD_INSPECTION',
        });
      }

      if (noteText) {
        issue.field_notes.push({
          note_id: `fn-${Date.now()}`,
          officer_id: officer?.officer_id ?? req.sessionUser!.userId,
          officer_name: req.sessionUser!.name,
          created_at: nowIso,
          note: noteText,
          stage: nextStatus,
        });
      }

      issue.current_issue_status = nextStatus;
      issue.last_updated_at = nowIso;
      if (nextStatus === 'RESOLVED') {
        issue.resolved_at = nowIso;
        if (officer) officer.completed_task_count += 1;
      }
      recomputeIssueScoring(issue, db.config);

      for (const repId of issue.associated_report_ids) {
        const rep = db.reports.find((r) => r.report_id === repId);
        if (rep) {
          rep.operational_status = nextStatus;
          rep.updated_at = nowIso;
          rep.timeline.push({
            event_id: `tl-fld-${Date.now()}`,
            step: nextStatus.replaceAll('_', ' '),
            status: nextStatus,
            actor_label: req.sessionUser!.name,
            occurred_at: nowIso,
            detail: noteText || `Field team moved task to ${nextStatus}.`,
          });
        }
      }

      refreshOfficerCounts(db);
      pushNotification(db, {
        target_role: 'ADMIN',
        recipient_user_id: null,
        type: 'FIELD_UPDATE',
        title: `${issue.physical_issue_id}: ${nextStatus.replaceAll('_', ' ')}`,
        message: `${req.sessionUser!.name} updated field status${noteText ? `: ${noteText}` : '.'}`,
        related_report_id: issue.associated_report_ids[0] ?? null,
        related_issue_id: issue.physical_issue_id,
      });

      appendAudit(db, {
        actor_id: req.sessionUser!.userId,
        actor_role: req.sessionUser!.role,
        actor_name: req.sessionUser!.name,
        action: `FIELD_UPDATE_${stage}`,
        entity_type: 'ISSUE',
        entity_id: issue.physical_issue_id,
        summary: `${req.sessionUser!.name} updated ${issue.physical_issue_id} -> ${nextStatus}.`,
      });
      await saveDatabase(db);

      res.json({ issue });
    },
  );

  router.post(
    '/issues/:id/resolve',
    requireRole(['ADMIN']),
    async (req: AuthenticatedRequest, res) => {
      const db = getDatabase();
      const issue = db.issues.find((i) => i.physical_issue_id === req.params.id);
      if (!issue) {
        res.status(404).json({ error: 'Physical issue not found.' });
        return;
      }

      const transition = validateIssueTransition({
        from: issue.current_issue_status,
        to: 'RESOLVED',
        actorRole: req.sessionUser!.role,
      });
      if (!transition.allowed) {
        res.status(400).json({ error: transition.reason });
        return;
      }

      const nowIso = new Date().toISOString();
      const note =
        typeof req.body?.note === 'string' && req.body.note.trim()
          ? req.body.note.trim()
          : 'Resolution verified and closed by administrator.';

      issue.current_issue_status = 'RESOLVED';
      issue.resolved_at = nowIso;
      issue.last_updated_at = nowIso;
      issue.field_notes.push({
        note_id: `fn-res-${Date.now()}`,
        officer_id: req.sessionUser!.userId,
        officer_name: req.sessionUser!.name,
        created_at: nowIso,
        note,
        stage: 'RESOLVED',
      });

      if (issue.assigned_officer_id) {
        const officer = db.officers.find((o) => o.officer_id === issue.assigned_officer_id);
        if (officer) officer.completed_task_count += 1;
      }
      recomputeIssueScoring(issue, db.config);

      for (const repId of issue.associated_report_ids) {
        const rep = db.reports.find((r) => r.report_id === repId);
        if (rep) {
          rep.operational_status = 'RESOLVED';
          rep.updated_at = nowIso;
          rep.timeline.push({
            event_id: `tl-res-${Date.now()}`,
            step: 'Resolved',
            status: 'RESOLVED',
            actor_label: req.sessionUser!.name,
            occurred_at: nowIso,
            detail: note,
          });
        }
      }

      refreshOfficerCounts(db);
      pushNotification(db, {
        target_role: 'CITIZEN',
        recipient_user_id: null,
        type: 'ISSUE_RESOLVED',
        title: `Issue Resolved: ${issue.physical_issue_id}`,
        message: note,
        related_report_id: issue.associated_report_ids[0] ?? null,
        related_issue_id: issue.physical_issue_id,
      });

      appendAudit(db, {
        actor_id: req.sessionUser!.userId,
        actor_role: req.sessionUser!.role,
        actor_name: req.sessionUser!.name,
        action: 'ISSUE_RESOLVED',
        entity_type: 'ISSUE',
        entity_id: issue.physical_issue_id,
        summary: `Closed ${issue.physical_issue_id} as RESOLVED.`,
      });
      await saveDatabase(db);

      res.json({ issue });
    },
  );

  router.post(
    '/issues/:id/reopen',
    requireRole(['ADMIN']),
    async (req: AuthenticatedRequest, res) => {
      const db = getDatabase();
      const issue = db.issues.find((i) => i.physical_issue_id === req.params.id);
      if (!issue) {
        res.status(404).json({ error: 'Physical issue not found.' });
        return;
      }

      const transition = validateIssueTransition({
        from: issue.current_issue_status,
        to: 'REOPENED',
        actorRole: req.sessionUser!.role,
      });
      if (!transition.allowed) {
        res.status(400).json({ error: transition.reason });
        return;
      }

      const nowIso = new Date().toISOString();
      const reason =
        typeof req.body?.reason === 'string' && req.body.reason.trim()
          ? req.body.reason.trim()
          : 'Reopened for follow-up inspection.';

      issue.current_issue_status = 'REOPENED';
      issue.resolved_at = null;
      issue.reopened_at = nowIso;
      issue.last_updated_at = nowIso;
      recomputeIssueScoring(issue, db.config);

      for (const repId of issue.associated_report_ids) {
        const rep = db.reports.find((r) => r.report_id === repId);
        if (rep) {
          rep.operational_status = 'REOPENED';
          rep.updated_at = nowIso;
          rep.timeline.push({
            event_id: `tl-reo-${Date.now()}`,
            step: 'Reopened',
            status: 'REOPENED',
            actor_label: req.sessionUser!.name,
            occurred_at: nowIso,
            detail: reason,
          });
        }
      }

      refreshOfficerCounts(db);
      appendAudit(db, {
        actor_id: req.sessionUser!.userId,
        actor_role: req.sessionUser!.role,
        actor_name: req.sessionUser!.name,
        action: 'ISSUE_REOPENED',
        entity_type: 'ISSUE',
        entity_id: issue.physical_issue_id,
        summary: `Reopened ${issue.physical_issue_id}: ${reason}`,
      });
      await saveDatabase(db);

      res.json({ issue });
    },
  );

  router.get('/officers', (_req, res) => {
    const db = getDatabase();
    refreshOfficerCounts(db);
    res.json({ officers: db.officers });
  });

  router.post(
    '/officers',
    requireRole(['ADMIN']),
    async (req: AuthenticatedRequest, res) => {
      const db = getDatabase();
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const zone = typeof req.body?.zone === 'string' ? req.body.zone.trim() : 'Tumakuru Central';
      const badgeCode =
        typeof req.body?.badgeCode === 'string' && req.body.badgeCode.trim()
          ? req.body.badgeCode.trim()
          : `TMK-FO-${120 + db.officers.length}`;

      if (!name || !email || !email.includes('@') || password.length < 6) {
        res.status(400).json({ error: 'Name, valid email, and password (6+ chars) are required.' });
        return;
      }
      if (db.users.some((u) => u.email.toLowerCase() === email)) {
        res.status(409).json({ error: 'Email already registered.' });
        return;
      }

      const userId = `usr-officer-${Date.now()}`;
      const officerId = `off-${db.officers.length + 1}`;
      const newUser = {
        user_id: userId,
        name,
        email,
        role: 'FIELD_OFFICER' as const,
        status: 'ACTIVE' as const,
        created_at: new Date().toISOString(),
        zone,
        passwordHash: hashPassword(password),
      };
      const newOfficer = {
        officer_id: officerId,
        user_id: userId,
        name,
        email,
        badge_code: badgeCode,
        zone,
        availability: 'AVAILABLE' as const,
        active_task_count: 0,
        completed_task_count: 0,
        avg_resolution_hours: null,
      };
      db.users.push(newUser);
      db.officers.push(newOfficer);

      appendAudit(db, {
        actor_id: req.sessionUser!.userId,
        actor_role: req.sessionUser!.role,
        actor_name: req.sessionUser!.name,
        action: 'OFFICER_CREATED',
        entity_type: 'OFFICER',
        entity_id: officerId,
        summary: `Added field officer ${name} (${badgeCode}).`,
      });
      await saveDatabase(db);

      res.status(201).json({ officer: newOfficer });
    },
  );

  router.patch(
    '/officers/:id',
    requireRole(['ADMIN', 'FIELD_OFFICER']),
    async (req: AuthenticatedRequest, res) => {
      const db = getDatabase();
      const officer = db.officers.find((o) => o.officer_id === req.params.id);
      if (!officer) {
        res.status(404).json({ error: 'Officer not found.' });
        return;
      }
      if (req.sessionUser!.role === 'FIELD_OFFICER' && officer.user_id !== req.sessionUser!.userId) {
        res.status(403).json({ error: 'Cannot modify another officer profile.' });
        return;
      }
      if (
        req.body?.availability === 'AVAILABLE' ||
        req.body?.availability === 'ON_FIELD_DUTY' ||
        req.body?.availability === 'BUSY' ||
        req.body?.availability === 'OFF_DUTY'
      ) {
        officer.availability = req.body.availability;
      }
      if (req.sessionUser!.role === 'ADMIN' && typeof req.body?.zone === 'string' && req.body.zone.trim()) {
        officer.zone = req.body.zone.trim();
      }
      await saveDatabase(db);
      res.json({ officer });
    },
  );

  router.get('/users', requireRole(['ADMIN']), (_req, res) => {
    const db = getDatabase();
    res.json({ users: db.users.map(sanitizeUser) });
  });

  router.patch(
    '/users/:id',
    requireRole(['ADMIN']),
    async (req: AuthenticatedRequest, res) => {
      const db = getDatabase();
      const user = db.users.find((u) => u.user_id === req.params.id);
      if (!user) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }
      if (req.body?.status === 'ACTIVE' || req.body?.status === 'SUSPENDED') {
        user.status = req.body.status;
      }
      if (
        req.body?.role === 'CITIZEN' ||
        req.body?.role === 'FIELD_OFFICER' ||
        req.body?.role === 'ADMIN'
      ) {
        user.role = req.body.role;
      }
      appendAudit(db, {
        actor_id: req.sessionUser!.userId,
        actor_role: req.sessionUser!.role,
        actor_name: req.sessionUser!.name,
        action: 'USER_UPDATED',
        entity_type: 'USER',
        entity_id: user.user_id,
        summary: `Updated account ${user.email} (${user.role} / ${user.status}).`,
      });
      await saveDatabase(db);
      res.json({ user: sanitizeUser(user) });
    },
  );

  router.get('/notifications', (req: AuthenticatedRequest, res) => {
    const db = getDatabase();
    const role = req.sessionUser?.role ?? 'CITIZEN';
    const userId = req.sessionUser?.userId ?? null;
    const notifications = db.notifications.filter(
      (n) =>
        n.target_role === 'ALL' ||
        n.target_role === role ||
        (userId && n.recipient_user_id === userId),
    );
    res.json({ notifications });
  });

  router.post('/notifications/:id/read', async (req, res) => {
    const db = getDatabase();
    if (req.params.id === 'all') {
      db.notifications.forEach((n) => {
        n.read = true;
      });
    } else {
      const ntf = db.notifications.find((n) => n.notification_id === req.params.id);
      if (ntf) ntf.read = true;
    }
    await saveDatabase(db);
    res.json({ ok: true });
  });

  router.get('/audit-logs', requireRole(['ADMIN']), (_req, res) => {
    const db = getDatabase();
    res.json({ auditLogs: db.auditLogs });
  });

  router.get('/config', (_req, res) => {
    const db = getDatabase();
    res.json({ config: db.config });
  });

  router.patch(
    '/config',
    requireRole(['ADMIN']),
    async (req: AuthenticatedRequest, res) => {
      const db = getDatabase();
      const nextConfig = { ...db.config };

      if (req.body?.priority_weights) {
        if (!validatePriorityWeights(req.body.priority_weights)) {
          res.status(400).json({ error: 'Priority factor weights must sum to exactly 100%.' });
          return;
        }
        nextConfig.priority_weights = req.body.priority_weights;
      }
      if (
        typeof req.body?.minimum_priority_factor_coverage === 'number' &&
        req.body.minimum_priority_factor_coverage >= 0.4 &&
        req.body.minimum_priority_factor_coverage <= 1
      ) {
        nextConfig.minimum_priority_factor_coverage = req.body.minimum_priority_factor_coverage;
      }
      if (typeof req.body?.auto_resolve_on_field_submission === 'boolean') {
        nextConfig.auto_resolve_on_field_submission = req.body.auto_resolve_on_field_submission;
      }
      if (
        typeof req.body?.confidence_review_threshold === 'number' &&
        req.body.confidence_review_threshold >= 0.3 &&
        req.body.confidence_review_threshold <= 0.99
      ) {
        nextConfig.confidence_review_threshold = req.body.confidence_review_threshold;
      }

      db.config = nextConfig;
      for (const issue of db.issues) {
        recomputeIssueScoring(issue, db.config);
      }

      appendAudit(db, {
        actor_id: req.sessionUser!.userId,
        actor_role: req.sessionUser!.role,
        actor_name: req.sessionUser!.name,
        action: 'SYSTEM_CONFIG_UPDATED',
        entity_type: 'CONFIG',
        entity_id: 'system-config',
        summary: 'Updated UrbanPulse scoring weights and workflow rules.',
      });
      await saveDatabase(db);
      res.json({ config: db.config });
    },
  );

  return router;
}
