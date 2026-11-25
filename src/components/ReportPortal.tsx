import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Construction,
  Crosshair,
  MapPin,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { api, ApiError, formatCategoryLabel } from '../api/client';
import { checkTumakuruPlausibility, TUMAKURU_CONTEXT } from '../shared/geospatial';
import type { CivicCategory, CivicReport, PhysicalIssue } from '../shared/types';
import { PriorityBadge, SeverityBadge } from './UiBadges';

const TUMAKURU_PRESETS = [
  { label: 'B.H. Road, Town Hall Circle', lat: 13.3409, lng: 77.1014 },
  { label: 'Mandi Pete Market Lane', lat: 13.3442, lng: 77.1135 },
  { label: 'S.S. Puram Main Road', lat: 13.3328, lng: 77.1182 },
  { label: 'Ashok Nagar 3rd Cross', lat: 13.3476, lng: 77.1062 },
  { label: 'Batawadi Junction', lat: 13.3264, lng: 77.1292 },
];

export function ReportPortal({
  reporterName,
  onSubmitted,
  onTrackReport,
  onViewOnMap,
}: {
  reporterName?: string;
  onSubmitted: () => Promise<void>;
  onTrackReport: (reference: string) => void;
  onViewOnMap: (reportId: string) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [category, setCategory] = useState<CivicCategory>('POTHOLE');
  const [images, setImages] = useState<Array<{ name: string; dataUrl: string }>>([]);
  const [description, setDescription] = useState('');
  const [additionalInfo, setAdditionalInfo] = useState('');
  const [locationLabel, setLocationLabel] = useState('B.H. Road, Tumakuru');
  const [lat, setLat] = useState<number | null>(TUMAKURU_CONTEXT.defaultCenter.lat);
  const [lng, setLng] = useState<number | null>(TUMAKURU_CONTEXT.defaultCenter.lng);
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(15);
  const [locationSource, setLocationSource] = useState<string>('USER_PLACED_PIN');
  const [locationMeaning, setLocationMeaning] = useState<string>('ISSUE_LOCATION');
  const [gpsNotice, setGpsNotice] = useState<string>('Pin ready on Tumakuru map.');
  const [omitGps, setOmitGps] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedResult, setSubmittedResult] = useState<{
    report: CivicReport;
    issue: PhysicalIssue | null;
    aiError: string | null;
  } | null>(null);

  const pickerMapEl = useRef<HTMLDivElement | null>(null);
  const pickerMapRef = useRef<L.Map | null>(null);
  const pickerPinRef = useRef<L.Marker | null>(null);

  // Initialize mini Leaflet pin-picker in step 3
  useEffect(() => {
    if (step !== 3 || omitGps || !pickerMapEl.current) return;
    if (pickerMapRef.current) {
      pickerMapRef.current.invalidateSize();
      return;
    }

    const startLat = lat ?? TUMAKURU_CONTEXT.defaultCenter.lat;
    const startLng = lng ?? TUMAKURU_CONTEXT.defaultCenter.lng;

    const map = L.map(pickerMapEl.current, {
      center: [startLat, startLng],
      zoom: 14,
      zoomControl: true,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
      className: 'urbanpulse-dark-tiles',
    }).addTo(map);

    const marker = L.marker([startLat, startLng], { draggable: true }).addTo(map);

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      setLat(Number(pos.lat.toFixed(6)));
      setLng(Number(pos.lng.toFixed(6)));
      setLocationSource('USER_PLACED_PIN');
      setLocationMeaning('ISSUE_LOCATION');
      setAccuracyMeters(10);
      setGpsNotice('Issue pin adjusted manually.');
    });

    map.on('click', (e) => {
      marker.setLatLng(e.latlng);
      setLat(Number(e.latlng.lat.toFixed(6)));
      setLng(Number(e.latlng.lng.toFixed(6)));
      setLocationSource('USER_PLACED_PIN');
      setLocationMeaning('ISSUE_LOCATION');
      setAccuracyMeters(10);
      setGpsNotice('Issue pin placed on map.');
    });

    pickerMapRef.current = map;
    pickerPinRef.current = marker;

    return () => {
      map.remove();
      pickerMapRef.current = null;
      pickerPinRef.current = null;
    };
  }, [step, omitGps]);

  // Keep marker synced if coordinates change via GPS or preset
  useEffect(() => {
    if (pickerMapRef.current && pickerPinRef.current && lat !== null && lng !== null) {
      pickerPinRef.current.setLatLng([lat, lng]);
      pickerMapRef.current.panTo([lat, lng]);
    }
  }, [lat, lng]);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList) return;
    setSubmitError(null);
    const next: Array<{ name: string; dataUrl: string }> = [...images];
    for (const file of Array.from(fileList)) {
      if (next.length >= 4) break;
      if (!['image/jpeg', 'image/png'].includes(file.type)) {
        setSubmitError('Only JPG and PNG photographs are accepted.');
        continue;
      }
      if (file.size > 8 * 1024 * 1024) {
        setSubmitError('Each image must be under 8 MB.');
        continue;
      }
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.readAsDataURL(file);
      });
      if (dataUrl) next.push({ name: file.name, dataUrl });
    }
    setImages(next);
  };

  const handleCaptureGps = () => {
    if (!navigator.geolocation) {
      setGpsNotice('Geolocation unsupported; place pin manually on Tumakuru map.');
      return;
    }
    setGpsNotice('Requesting device GPS...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOmitGps(false);
        setLat(Number(pos.coords.latitude.toFixed(6)));
        setLng(Number(pos.coords.longitude.toFixed(6)));
        setAccuracyMeters(Math.round(pos.coords.accuracy));
        setLocationSource('USER_CONFIRMED_DEVICE_GPS');
        setLocationMeaning('REPORT_OBSERVATION_LOCATION');
        setGpsNotice(`Device GPS captured (±${Math.round(pos.coords.accuracy)}m). Adjust pin if standing away from the issue.`);
      },
      (err) => {
        setGpsNotice(
          err.code === 1
            ? 'GPS permission denied — please tap the map to place the issue pin.'
            : 'Device GPS unavailable — tap the map or pick a Tumakuru landmark.',
        );
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const idemp = `up-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const res = await api.submitReport(
        {
          category,
          images: images.map((i) => i.dataUrl),
          description,
          additionalInfo,
          locationLabel,
          latitude: omitGps ? null : lat,
          longitude: omitGps ? null : lng,
          accuracyMeters: omitGps ? null : accuracyMeters,
          locationSource: omitGps ? 'UNKNOWN' : locationSource,
          locationMeaning: omitGps ? 'UNKNOWN' : locationMeaning,
          confirmedByUser: !omitGps,
          reporterName,
        },
        idemp,
      );
      setSubmittedResult(res);
      await onSubmitted();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submittedResult) {
    const { report, issue, aiError } = submittedResult;
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-[#20C997]/35 bg-[#0C1929]/90 p-6 shadow-2xl space-y-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#20C997]/20 text-[#20C997]">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <p className="font-mono text-xs font-semibold text-[#20C8E8]">
              Reference: {report.report_reference}
            </p>
            <h2 className="font-display text-xl font-bold text-[#F4F7FC]">
              Civic Report Recorded
            </h2>
            <p className="text-xs text-[#9AADC1] mt-0.5">
              {report.ai_processing_status === 'COMPLETED'
                ? 'Gemini visual assessment completed and linked to Tumakuru priority queue.'
                : 'Report stored safely and queued for manual municipal review.'}
            </p>
          </div>
        </div>

        {aiError && (
          <div className="rounded-xl border border-amber-400/35 bg-amber-500/10 p-3 text-xs text-amber-200">
            AI Vision Notice: {aiError}
          </div>
        )}

        <div className="rounded-xl border border-white/10 bg-[#07111F]/70 p-4 space-y-2.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[#9AADC1]">
              Relevance: <strong className="text-[#F4F7FC]">{report.ai_analysis?.image_assessment.relevance_status}</strong>
            </span>
            {issue && (
              <div className="flex items-center gap-2">
                <SeverityBadge severity={issue.severity_label} score={issue.severity_score} />
                <PriorityBadge
                  label={issue.priority_assessment.label}
                  score={issue.priority_assessment.score}
                  provisional={issue.priority_assessment.is_provisional}
                />
              </div>
            )}
          </div>
          <p className="text-[#F4F7FC]/90">
            {report.ai_analysis?.image_assessment.relevance_reason}
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => onTrackReport(report.report_reference)}
            className="rounded-xl bg-[#20C8E8] px-4 py-2 text-xs font-semibold text-[#07111F]"
          >
            Track Report Status
          </button>
          {!omitGps && (
            <button
              type="button"
              onClick={() => onViewOnMap(report.report_id)}
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-[#F4F7FC]"
            >
              View on Live City Map
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setSubmittedResult(null);
              setStep(1);
              setImages([]);
              setDescription('');
              setAdditionalInfo('');
            }}
            className="rounded-xl border border-white/15 px-4 py-2 text-xs font-medium text-[#9AADC1]"
          >
            Submit Another Report
          </button>
        </div>
      </div>
    );
  }

  const jurisdiction = omitGps ? 'UNKNOWN' : checkTumakuruPlausibility(lat, lng);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="rounded-2xl border border-white/10 bg-[#0C1929]/85 p-5 backdrop-blur-xl shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-lg font-bold text-[#F4F7FC]">
              Citizen Issue Reporting Portal
            </h1>
            <p className="text-xs text-[#9AADC1]">
              Submit geotagged photographic evidence for AI triage & Tumakuru municipal action
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4].map((num) => (
              <div
                key={num}
                className={`flex h-7 w-7 items-center justify-center rounded-lg font-mono text-xs font-semibold border ${
                  step === num
                    ? 'border-[#20C8E8] bg-[#20C8E8]/20 text-[#20C8E8]'
                    : step > num
                      ? 'border-[#20C997]/40 bg-[#20C997]/15 text-[#20C997]'
                      : 'border-white/10 bg-[#07111F] text-[#9AADC1]'
                }`}
              >
                {num}
              </div>
            ))}
          </div>
        </div>

        {/* Step 1: Category */}
        {step === 1 && (
          <div className="mt-6 space-y-4">
            <h2 className="text-sm font-semibold text-[#F4F7FC]">
              Step 1 · Select Observed Civic Issue Category
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                {
                  id: 'POTHOLE' as CivicCategory,
                  title: 'Pothole / Road Cavity',
                  desc: 'Asphalt potholes, sunken trenches, edge collapse on roadways.',
                  icon: Construction,
                  accent: 'text-[#FF757C]',
                },
                {
                  id: 'GARBAGE_OR_WASTE' as CivicCategory,
                  title: 'Garbage / Waste',
                  desc: 'Uncollected refuse piles, illegal dumping, drain-blocking litter.',
                  icon: Trash2,
                  accent: 'text-[#20C997]',
                },
                {
                  id: 'OTHER_CIVIC_CANDIDATE' as CivicCategory,
                  title: 'Other Civic Candidate',
                  desc: 'Broken streetlights, leaking mains, damaged footpaths (manual rubric).',
                  icon: AlertTriangle,
                  accent: 'text-[#FF963D]',
                },
              ].map((opt) => {
                const Icon = opt.icon;
                const active = category === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setCategory(opt.id)}
                    className={`rounded-2xl border p-4 text-left transition ${
                      active
                        ? 'border-[#20C8E8] bg-[#20C8E8]/12 shadow-lg'
                        : 'border-white/10 bg-[#07111F]/60 hover:border-white/25'
                    }`}
                  >
                    <Icon className={`h-6 w-6 ${opt.accent}`} />
                    <div className="mt-3 text-sm font-semibold text-[#F4F7FC]">{opt.title}</div>
                    <p className="mt-1 text-xs text-[#9AADC1]">{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 2: Image Upload */}
        {step === 2 && (
          <div className="mt-6 space-y-4">
            <h2 className="text-sm font-semibold text-[#F4F7FC]">
              Step 2 · Upload Photograph Evidence (JPG / PNG, up to 4)
            </h2>
            <label className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#20C8E8]/35 bg-[#07111F]/60 p-8 text-center cursor-pointer hover:border-[#20C8E8]/70 transition">
              <UploadCloud className="h-9 w-9 text-[#20C8E8]" />
              <span className="mt-2 text-sm font-medium text-[#F4F7FC]">
                Click to select or capture site photographs
              </span>
              <span className="mt-1 text-xs text-[#9AADC1]">
                Supported formats: JPG, PNG (max 8 MB per photo)
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png"
                multiple
                onChange={(e) => handleFiles(e.target.files)}
                className="hidden"
              />
            </label>

            {images.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {images.map((img, idx) => (
                  <div
                    key={`${img.name}-${idx}`}
                    className="relative overflow-hidden rounded-xl border border-white/15 bg-[#07111F]"
                  >
                    <img
                      src={img.dataUrl}
                      alt={img.name}
                      className="h-28 w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setImages(images.filter((_, i) => i !== idx))}
                      aria-label={`Remove ${img.name}`}
                      className="absolute top-1.5 right-1.5 rounded-full bg-[#07111F]/85 p-1 text-white hover:bg-[#FF515A]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <div className="truncate px-2 py-1 text-[10px] text-[#9AADC1]">{img.name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Details & Location */}
        {step === 3 && (
          <div className="mt-6 space-y-4">
            <h2 className="text-sm font-semibold text-[#F4F7FC]">
              Step 3 · Issue Details & Tumakuru Pin Location
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#9AADC1] mb-1">
                  Landmark / Road Name
                </label>
                <input
                  type="text"
                  value={locationLabel}
                  onChange={(e) => setLocationLabel(e.target.value)}
                  placeholder="e.g., B.H. Road near Town Hall"
                  className="w-full rounded-xl border border-white/15 bg-[#07111F] px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-[#9AADC1] mb-1">
                  Quick Tumakuru Landmark Preset
                </label>
                <select
                  onChange={(e) => {
                    const preset = TUMAKURU_PRESETS.find((p) => p.label === e.target.value);
                    if (preset) {
                      setOmitGps(false);
                      setLocationLabel(preset.label);
                      setLat(preset.lat);
                      setLng(preset.lng);
                      setLocationSource('USER_PLACED_PIN');
                      setLocationMeaning('ISSUE_LOCATION');
                      setAccuracyMeters(15);
                    }
                  }}
                  defaultValue=""
                  className="w-full rounded-xl border border-white/15 bg-[#07111F] px-3 py-2 text-xs text-white"
                >
                  <option value="" disabled>
                    Choose landmark...
                  </option>
                  {TUMAKURU_PRESETS.map((p) => (
                    <option key={p.label} value={p.label}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-[#9AADC1] mb-1">
                What did you observe?
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe visible damage, drainage obstruction, or hazard to pedestrians/two-wheelers..."
                className="w-full rounded-xl border border-white/15 bg-[#07111F] px-3 py-2 text-xs text-white"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#07111F]/60 p-3">
              <div className="flex items-center gap-2 text-xs text-[#9AADC1]">
                <MapPin className="h-4 w-4 text-[#20C8E8]" />
                <span>{omitGps ? 'Submitting without GPS coordinates (Unlocated)' : gpsNotice}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCaptureGps}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#20C8E8]/40 bg-[#20C8E8]/15 px-3 py-1 text-xs font-medium text-[#20C8E8]"
                >
                  <Crosshair className="h-3.5 w-3.5" />
                  Capture Device GPS
                </button>
                <label className="inline-flex items-center gap-1.5 text-xs text-[#9AADC1] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={omitGps}
                    onChange={(e) => setOmitGps(e.target.checked)}
                    className="accent-[#20C8E8]"
                  />
                  <span>No GPS</span>
                </label>
              </div>
            </div>

            {!omitGps && (
              <div className="space-y-2">
                <div
                  ref={pickerMapEl}
                  className="h-56 w-full rounded-xl border border-white/15 overflow-hidden"
                />
                <div className="flex flex-wrap items-center justify-between text-[11px] text-[#9AADC1]">
                  <span className="font-mono">
                    Pin: {lat?.toFixed(5)}, {lng?.toFixed(5)} (±{accuracyMeters ?? 15}m ·{' '}
                    {locationMeaning === 'ISSUE_LOCATION' ? 'Issue Pin' : 'Observer GPS'})
                  </span>
                  <span>
                    {jurisdiction === 'OUTSIDE_OPERATING_EXTENT'
                      ? 'Warning: Outside Tumakuru urban extent'
                      : 'Inside Tumakuru extent (unverified ward boundary)'}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Review */}
        {step === 4 && (
          <div className="mt-6 space-y-4">
            <h2 className="text-sm font-semibold text-[#F4F7FC]">
              Step 4 · Review & Submit for Gemini AI Analysis
            </h2>
            <div className="rounded-xl border border-white/10 bg-[#07111F]/70 p-4 space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[#9AADC1]">Category</span>
                <span className="font-semibold text-[#F4F7FC]">
                  {formatCategoryLabel(category)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9AADC1]">Photographs</span>
                <span className="font-mono text-[#20C8E8]">{images.length} attached</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9AADC1]">Location</span>
                <span className="text-[#F4F7FC]">{locationLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9AADC1]">Coordinates</span>
                <span className="font-mono text-[#F4F7FC]">
                  {omitGps ? 'Not Provided (Unlocated)' : `${lat?.toFixed(5)}, ${lng?.toFixed(5)}`}
                </span>
              </div>
              {description && (
                <div className="border-t border-white/10 pt-2 text-[#9AADC1]">
                  “{description}”
                </div>
              )}
            </div>
          </div>
        )}

        {submitError && (
          <div className="mt-4 rounded-xl border border-[#FF515A]/40 bg-[#FF515A]/15 px-3 py-2 text-xs text-[#FF9DA2]">
            {submitError}
          </div>
        )}

        {/* Wizard Footer Navigation */}
        <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
          <button
            type="button"
            disabled={step === 1 || submitting}
            onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3 | 4) : s))}
            className="inline-flex items-center gap-1 rounded-xl border border-white/15 px-3.5 py-2 text-xs font-medium text-[#9AADC1] hover:text-white disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>

          {step < 4 ? (
            <button
              type="button"
              onClick={() => {
                if (step === 2 && images.length === 0) {
                  setSubmitError('Please attach at least one JPG or PNG photograph before continuing.');
                  return;
                }
                setSubmitError(null);
                setStep((s) => (s + 1) as 1 | 2 | 3 | 4);
              }}
              className="inline-flex items-center gap-1 rounded-xl bg-[#20C8E8] px-4 py-2 text-xs font-semibold text-[#07111F] hover:bg-[#49d4f0]"
            >
              Continue
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
              className="inline-flex items-center gap-2 rounded-xl bg-[#20C997] px-5 py-2 text-xs font-semibold text-[#07111F] hover:bg-[#3adca9] disabled:opacity-60"
            >
              <Camera className="h-4 w-4" />
              {submitting ? 'Analyzing & Submitting...' : 'Submit Civic Report'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
