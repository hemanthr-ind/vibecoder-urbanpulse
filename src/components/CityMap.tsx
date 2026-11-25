import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Crosshair,
  Filter,
  Flame,
  Layers,
  MapPin,
  Maximize2,
  Minimize2,
  Minus,
  Navigation,
  Plus,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { formatCategoryLabel, formatRelativeTime } from '../api/client';
import {
  aggregateSeverityHeatmap,
  getCategoryVisualToken,
  getCellSizeMetersForZoom,
  getSeverityVisualToken,
  haversineDistanceMeters,
  TUMAKURU_CONTEXT,
} from '../shared/geospatial';
import type {
  BasemapStyle,
  CivicCategory,
  FieldOfficer,
  HeatmapCell,
  MapColorEncoding,
  MapFilterState,
  MapMode,
  MapPointFeature,
  OperationalIssueStatus,
  SeverityLabel,
} from '../shared/types';
import { CivicImage, PriorityBadge, SeverityBadge, StatusBadge } from './UiBadges';

const TILE_URLS: Record<
  BasemapStyle,
  { url: string; attribution: string; label: string; maxZoom: number; className?: string }
> = {
  NORMAL: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    label: 'Normal',
    maxZoom: 19,
  },
  SATELLITE: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imagery &copy; Esri',
    label: 'Satellite',
    maxZoom: 18,
  },
  TERRAIN: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Topo &copy; Esri &amp; OpenStreetMap',
    label: 'Terrain',
    maxZoom: 18,
  },
  DARK: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    label: 'Dark',
    maxZoom: 19,
    className: 'urbanpulse-dark-tiles',
  },
};

const TUMAKURU_LANDMARKS: Array<{ label: string; lat: number; lng: number }> = [
  { label: 'B.H. Road & Town Hall Circle', lat: 13.3409, lng: 77.1014 },
  { label: 'Mandi Pete Market Lane', lat: 13.3442, lng: 77.1135 },
  { label: 'S.S. Puram Main Road', lat: 13.3328, lng: 77.1182 },
  { label: 'Ashok Nagar', lat: 13.3476, lng: 77.1062 },
  { label: 'Batawadi Junction', lat: 13.3264, lng: 77.1292 },
  { label: 'Siddaganga Extension', lat: 13.3212, lng: 77.1172 },
  { label: 'Tumakuru City Center', lat: 13.3392, lng: 77.114 },
];

function createCategoryGlyphSvg(category: CivicCategory): string {
  if (category === 'POTHOLE') {
    return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#F4F7FC" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18h16"/><path d="M7 18c1.2-3 2.7-4.5 5-4.5s3.8 1.5 5 4.5"/><path d="M12 5v5"/><path d="M9.5 7.5 12 10l2.5-2.5"/></svg>`;
  }
  if (category === 'GARBAGE_OR_WASTE') {
    return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#F4F7FC" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#F4F7FC" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 3 19h18L12 4z"/><path d="M12 10v4"/><circle cx="12" cy="17" r="0.6" fill="#F4F7FC"/></svg>`;
}

function buildMarkerIcon(
  feature: MapPointFeature,
  colorEncoding: MapColorEncoding,
  isSelected: boolean,
): L.DivIcon {
  const sevToken = getSeverityVisualToken(feature.severity_label);
  const catToken = getCategoryVisualToken(feature.category);
  const fill = colorEncoding === 'SEVERITY' ? sevToken.hex : catToken.accentHex;
  const border = isSelected
    ? '#20C8E8'
    : colorEncoding === 'SEVERITY'
      ? sevToken.borderHex
      : '#F4F7FC';
  const size = isSelected ? 36 : feature.severity_label === 'CRITICAL' ? 32 : 28;
  const isApprox = feature.feature_type !== 'PHYSICAL_ISSUE_POINT';
  const pulse =
    feature.is_new_pulse || feature.severity_label === 'CRITICAL'
      ? `<span class="urbanpulse-marker-pulse" style="position:absolute;inset:-4px;border-radius:9999px;border:2px solid ${fill};pointer-events:none;"></span>`
      : '';

  const html = `
    <div style="position:relative;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;">
      ${pulse}
      <div style="
        width:${size}px;height:${size}px;border-radius:9999px;
        background:${fill};
        border:${isSelected ? '3px' : '2px'} ${isApprox ? 'dashed' : 'solid'} ${border};
        box-shadow:0 4px 14px rgba(0,0,0,0.55);
        display:flex;align-items:center;justify-content:center;
      ">
        ${createCategoryGlyphSvg(feature.category)}
      </div>
    </div>`;

  return L.divIcon({
    html,
    className: 'urbanpulse-div-icon',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function buildClusterIcon(count: number, worstTier: SeverityLabel): L.DivIcon {
  const sev = getSeverityVisualToken(worstTier);
  return L.divIcon({
    html: `<div style="
      width:38px;height:38px;border-radius:9999px;
      background:rgba(12,25,41,0.92);
      border:2.5px solid ${sev.hex};
      color:#F4F7FC;font-weight:700;font-size:12px;
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 6px 18px rgba(0,0,0,0.6);
    ">${count}</div>`,
    className: 'urbanpulse-cluster-icon',
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  });
}

export interface CityMapProps {
  features: MapPointFeature[];
  unlocatedCount: number;
  filters: MapFilterState;
  onFiltersChange: (next: MapFilterState) => void;
  officers: FieldOfficer[];
  selectedFeatureId: string | null;
  onSelectFeature: (feature: MapPointFeature | null) => void;
  onViewFullReport: (reportId: string, issueId: string | null) => void;
  allowHeatmap?: boolean;
  initialMode?: MapMode;
  onModeChange?: (mode: MapMode) => void;
  className?: string;
}

export function CityMap({
  features,
  unlocatedCount,
  filters,
  onFiltersChange,
  officers,
  selectedFeatureId,
  onSelectFeature,
  onViewFullReport,
  allowHeatmap = false,
  initialMode = 'PINPOINT_REPORT_MAP',
  onModeChange,
  className = '',
}: CityMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const accuracyLayerRef = useRef<L.LayerGroup | null>(null);
  const heatmapLayerRef = useRef<L.LayerGroup | null>(null);
  const userLocationLayerRef = useRef<L.LayerGroup | null>(null);

  const [basemap, setBasemap] = useState<BasemapStyle>('DARK');
  const [mapMode, setMapMode] = useState<MapMode>(allowHeatmap ? initialMode : 'PINPOINT_REPORT_MAP');
  const [colorEncoding, setColorEncoding] = useState<MapColorEncoding>('SEVERITY');
  const [clusterEnabled, setClusterEnabled] = useState(false);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [layerDrawerOpen, setLayerDrawerOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(TUMAKURU_CONTEXT.defaultZoom);
  const [mapBounds, setMapBounds] = useState<{
    north: number;
    south: number;
    east: number;
    west: number;
  }>({
    north: 13.36,
    south: 13.315,
    east: 77.14,
    west: 77.088,
  });
  const [tileWarning, setTileWarning] = useState(false);
  const [userGps, setUserGps] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
  } | null>(null);
  const [gpsStatusMsg, setGpsStatusMsg] = useState<string | null>(null);
  const [selectedHeatCell, setSelectedHeatCell] = useState<HeatmapCell | null>(null);

  const effectiveMode: MapMode = allowHeatmap ? mapMode : 'PINPOINT_REPORT_MAP';

  const selectedFeature = useMemo(
    () => features.find((f) => f.feature_id === selectedFeatureId || f.primary_report_id === selectedFeatureId) ?? null,
    [features, selectedFeatureId],
  );

  // Initialize Leaflet map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [TUMAKURU_CONTEXT.defaultCenter.lat, TUMAKURU_CONTEXT.defaultCenter.lng],
      zoom: TUMAKURU_CONTEXT.defaultZoom,
      zoomControl: false,
      attributionControl: true,
    });

    const markersGroup = L.layerGroup().addTo(map);
    const accuracyGroup = L.layerGroup().addTo(map);
    const heatGroup = L.layerGroup().addTo(map);
    const userGroup = L.layerGroup().addTo(map);

    mapRef.current = map;
    markersLayerRef.current = markersGroup;
    accuracyLayerRef.current = accuracyGroup;
    heatmapLayerRef.current = heatGroup;
    userLocationLayerRef.current = userGroup;

    const syncViewport = () => {
      setZoomLevel(map.getZoom());
      const b = map.getBounds();
      setMapBounds({
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      });
    };

    map.on('zoomend moveend', syncViewport);
    map.on('click', () => {
      onSelectFeature(null);
      setSelectedHeatCell(null);
    });

    syncViewport();

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Re-invalidate size on fullscreen toggle
  useEffect(() => {
    const timer = window.setTimeout(() => {
      mapRef.current?.invalidateSize();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [isFullscreen]);

  // Swap Basemap TileLayer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }

    setTileWarning(false);
    const cfg = TILE_URLS[basemap];
    const layer = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: cfg.maxZoom,
      className: cfg.className ?? '',
    });

    let errCount = 0;
    layer.on('tileerror', () => {
      errCount += 1;
      if (errCount >= 3) {
        setTileWarning(true);
      }
    });
    layer.on('tileload', () => {
      setTileWarning(false);
    });

    layer.addTo(map);
    tileLayerRef.current = layer;
  }, [basemap]);

  // Center on selected feature when chosen from outside (e.g. recent reports list)
  useEffect(() => {
    if (!selectedFeature || !mapRef.current) return;
    mapRef.current.panTo([selectedFeature.latitude, selectedFeature.longitude], {
      animate: true,
      duration: 0.45,
    });
  }, [selectedFeatureId]);

  const heatmapCells = useMemo(() => {
    if (effectiveMode !== 'SEVERITY_HEATMAP') return [];
    const cellMeters = getCellSizeMetersForZoom(zoomLevel);
    return aggregateSeverityHeatmap(features, cellMeters);
  }, [effectiveMode, features, zoomLevel]);

  // Render Markers / Clusters / Accuracy circles / Heatmap Cells
  useEffect(() => {
    const markersGroup = markersLayerRef.current;
    const accuracyGroup = accuracyLayerRef.current;
    const heatGroup = heatmapLayerRef.current;
    if (!markersGroup || !accuracyGroup || !heatGroup) return;

    markersGroup.clearLayers();
    accuracyGroup.clearLayers();
    heatGroup.clearLayers();

    if (effectiveMode === 'SEVERITY_HEATMAP') {
      for (const cell of heatmapCells) {
        const token = getSeverityVisualToken(cell.cell_severity_tier);
        const rect = L.rectangle(
          [
            [cell.bounds.south, cell.bounds.west],
            [cell.bounds.north, cell.bounds.east],
          ],
          {
            color: token.borderHex,
            weight: selectedHeatCell?.cell_id === cell.cell_id ? 3 : 2,
            fillColor: token.hex,
            fillOpacity: cell.cell_severity_tier === 'CRITICAL' ? 0.56 : 0.42,
          },
        );

        rect.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          setSelectedHeatCell(cell);
          onSelectFeature(null);
        });
        rect.addTo(heatGroup);

        const badge = L.marker([cell.center_lat, cell.center_lng], {
          icon: L.divIcon({
            html: `<div style="background:rgba(7,17,31,0.92);border:1.5px solid ${token.hex};color:#F4F7FC;border-radius:6px;padding:2px 6px;font-size:10px;font-weight:700;white-space:nowrap;box-shadow:0 3px 10px rgba(0,0,0,0.55);text-align:center;">${cell.unique_physical_issue_count} · ${cell.cell_severity_tier}</div>`,
            className: 'urbanpulse-heat-badge',
            iconSize: [84, 22],
            iconAnchor: [42, 11],
          }),
        });
        badge.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          setSelectedHeatCell(cell);
          onSelectFeature(null);
        });
        badge.addTo(heatGroup);
      }
      return;
    }

    // PINPOINT_REPORT_MAP mode
    if (clusterEnabled && zoomLevel < 15) {
      const gridDeg = zoomLevel <= 12 ? 0.012 : 0.0055;
      const buckets = new Map<string, MapPointFeature[]>();
      for (const feat of features) {
        const r = Math.floor(feat.latitude / gridDeg);
        const c = Math.floor(feat.longitude / gridDeg);
        const k = `${r}_${c}`;
        const list = buckets.get(k);
        if (list) list.push(feat);
        else buckets.set(k, [feat]);
      }

      const rank: Record<SeverityLabel, number> = {
        UNKNOWN: 0,
        LOW: 1,
        MODERATE: 2,
        HIGH: 3,
        CRITICAL: 4,
      };

      for (const items of buckets.values()) {
        if (items.length === 1) {
          const feat = items[0];
          const isSel = selectedFeature?.feature_id === feat.feature_id;
          const marker = L.marker([feat.latitude, feat.longitude], {
            icon: buildMarkerIcon(feat, colorEncoding, isSel),
          });
          marker.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            setSelectedHeatCell(null);
            onSelectFeature(feat);
          });
          marker.addTo(markersGroup);
        } else {
          const avgLat = items.reduce((a, b) => a + b.latitude, 0) / items.length;
          const avgLng = items.reduce((a, b) => a + b.longitude, 0) / items.length;
          let worst: SeverityLabel = 'UNKNOWN';
          for (const it of items) {
            if (rank[it.severity_label] > rank[worst]) worst = it.severity_label;
          }
          const clusterMarker = L.marker([avgLat, avgLng], {
            icon: buildClusterIcon(items.length, worst),
          });
          clusterMarker.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            mapRef.current?.setView([avgLat, avgLng], Math.min(17, zoomLevel + 2));
          });
          clusterMarker.addTo(markersGroup);
        }
      }
    } else {
      for (const feat of features) {
        const isSel = selectedFeature?.feature_id === feat.feature_id;
        const sevToken = getSeverityVisualToken(feat.severity_label);

        if (
          (isSel || feat.feature_type !== 'PHYSICAL_ISSUE_POINT') &&
          feat.horizontal_accuracy_meters &&
          feat.horizontal_accuracy_meters > 0
        ) {
          L.circle([feat.latitude, feat.longitude], {
            radius: Math.min(feat.horizontal_accuracy_meters, 250),
            color: sevToken.hex,
            weight: 1,
            dashArray: '4 4',
            fillColor: sevToken.hex,
            fillOpacity: isSel ? 0.16 : 0.08,
          }).addTo(accuracyGroup);
        }

        const marker = L.marker([feat.latitude, feat.longitude], {
          icon: buildMarkerIcon(feat, colorEncoding, isSel),
          zIndexOffset: isSel ? 900 : feat.severity_label === 'CRITICAL' ? 400 : 100,
        });
        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          setSelectedHeatCell(null);
          onSelectFeature(feat);
        });
        marker.addTo(markersGroup);
      }
    }
  }, [
    features,
    effectiveMode,
    heatmapCells,
    colorEncoding,
    clusterEnabled,
    zoomLevel,
    selectedFeature?.feature_id,
    selectedHeatCell?.cell_id,
  ]);

  // Draw Viewer GPS location dot separately from civic issues
  useEffect(() => {
    const userGroup = userLocationLayerRef.current;
    if (!userGroup) return;
    userGroup.clearLayers();
    if (!userGps) return;

    L.circle([userGps.lat, userGps.lng], {
      radius: Math.min(userGps.accuracy, 200),
      color: '#20C8E8',
      weight: 1,
      fillColor: '#20C8E8',
      fillOpacity: 0.12,
    }).addTo(userGroup);

    L.marker([userGps.lat, userGps.lng], {
      icon: L.divIcon({
        html: `<div style="width:14px;height:14px;border-radius:9999px;background:#20C8E8;border:2.5px solid #F4F7FC;box-shadow:0 0 12px rgba(32,200,232,0.8);"></div>`,
        className: 'urbanpulse-user-dot',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      }),
    }).addTo(userGroup);
  }, [userGps]);

  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      setGpsStatusMsg('Geolocation unavailable in this browser.');
      return;
    }
    setGpsStatusMsg('Acquiring GPS fix...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        };
        setUserGps(next);
        setGpsStatusMsg(`Device GPS: ±${next.accuracy}m`);
        mapRef.current?.setView([next.lat, next.lng], 15);
      },
      (err) => {
        setGpsStatusMsg(
          err.code === 1
            ? 'Location permission denied. Tumakuru extent remains active.'
            : 'Device GPS fix unavailable.',
        );
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = filters.searchQuery.trim().toLowerCase();
    if (!q) return;

    const matchedFeature = features.find(
      (f) =>
        f.report_reference.toLowerCase().includes(q) ||
        (f.physical_issue_id ?? '').toLowerCase().includes(q) ||
        f.location_label.toLowerCase().includes(q),
    );
    if (matchedFeature) {
      mapRef.current?.setView([matchedFeature.latitude, matchedFeature.longitude], 16);
      onSelectFeature(matchedFeature);
      return;
    }

    const landmark = TUMAKURU_LANDMARKS.find((l) => l.label.toLowerCase().includes(q));
    if (landmark) {
      mapRef.current?.setView([landmark.lat, landmark.lng], 15);
    }
  };

  const toggleCategory = (cat: CivicCategory) => {
    const exists = filters.categories.includes(cat);
    onFiltersChange({
      ...filters,
      categories: exists
        ? filters.categories.filter((c) => c !== cat)
        : [...filters.categories, cat],
    });
  };

  const toggleSeverity = (sev: SeverityLabel) => {
    const exists = filters.severities.includes(sev);
    onFiltersChange({
      ...filters,
      severities: exists
        ? filters.severities.filter((s) => s !== sev)
        : [...filters.severities, sev],
    });
  };

  const toggleOpStatus = (st: OperationalIssueStatus) => {
    const exists = filters.operationalStatuses.includes(st);
    onFiltersChange({
      ...filters,
      operationalStatuses: exists
        ? filters.operationalStatuses.filter((s) => s !== st)
        : [...filters.operationalStatuses, st],
    });
  };

  const activeFilterCount =
    filters.categories.length +
    filters.severities.length +
    filters.operationalStatuses.length +
    (filters.unresolvedOnly ? 1 : 0) +
    (filters.assignedOfficerId ? 1 : 0);

  const cellContributors = useMemo(() => {
    if (!selectedHeatCell) return [];
    return features.filter((f) =>
      selectedHeatCell.contributing_issue_ids.includes(f.physical_issue_id ?? f.primary_report_id),
    );
  }, [selectedHeatCell, features]);

  // Overview minimap projection inside Tumakuru bounding area
  const miniExt = {
    minLat: 13.305,
    maxLat: 13.368,
    minLng: 77.082,
    maxLng: 77.145,
  };
  const projectMini = (lat: number, lng: number) => {
    const x = ((lng - miniExt.minLng) / (miniExt.maxLng - miniExt.minLng)) * 100;
    const y = (1 - (lat - miniExt.minLat) / (miniExt.maxLat - miniExt.minLat)) * 100;
    return {
      left: `${Math.max(4, Math.min(96, x))}%`,
      top: `${Math.max(4, Math.min(96, y))}%`,
    };
  };

  return (
    <div
      className={`${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none' : 'relative rounded-2xl'
      } overflow-hidden border border-white/10 bg-[#07111F] shadow-2xl ${className}`}
    >
      {/* Leaflet Canvas + Subtle Vector Graticule Fallback behind tiles */}
      <div
        className="absolute inset-0 pointer-events-none opacity-25"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(32,200,232,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(32,200,232,0.12) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
      <div ref={mapContainerRef} className="h-full w-full min-h-[420px]" data-testid="urbanpulse-city-map" />

      {/* Top-Left: Floating Location & ID Search + Filter Toggle */}
      <div className="absolute top-3 left-3 z-[450] flex flex-wrap items-center gap-2 max-w-[calc(100%-260px)]">
        <form
          onSubmit={handleSearchSubmit}
          className="flex items-center gap-2 rounded-xl border border-white/15 bg-[#07111F]/85 px-3 py-1.5 backdrop-blur-md shadow-lg"
        >
          <Search className="h-4 w-4 text-[#20C8E8] shrink-0" />
          <input
            type="text"
            value={filters.searchQuery}
            onChange={(e) => onFiltersChange({ ...filters, searchQuery: e.target.value })}
            placeholder="Search ID, B.H. Road, S.S. Puram..."
            aria-label="Search map by report ID or Tumakuru location"
            className="w-44 sm:w-56 bg-transparent text-xs text-[#F4F7FC] placeholder-[#9AADC1]/70 focus:outline-none"
          />
          {filters.searchQuery && (
            <button
              type="button"
              onClick={() => onFiltersChange({ ...filters, searchQuery: '' })}
              className="text-[#9AADC1] hover:text-white"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </form>

        <button
          type="button"
          onClick={() => {
            setFilterDrawerOpen((v) => !v);
            setLayerDrawerOpen(false);
          }}
          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium backdrop-blur-md shadow-lg transition whitespace-nowrap shrink-0 ${
            filterDrawerOpen || activeFilterCount > 0
              ? 'border-[#20C8E8]/60 bg-[#20C8E8]/20 text-[#F4F7FC]'
              : 'border-white/15 bg-[#07111F]/85 text-[#9AADC1] hover:text-white'
          }`}
        >
          <Filter className="h-3.5 w-3.5 text-[#20C8E8]" />
          <span>Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
        </button>

        {allowHeatmap && (
          <div className="inline-flex items-center rounded-xl border border-white/15 bg-[#07111F]/85 p-0.5 backdrop-blur-md shadow-lg">
            <button
              type="button"
              onClick={() => {
                setMapMode('PINPOINT_REPORT_MAP');
                setSelectedHeatCell(null);
                onModeChange?.('PINPOINT_REPORT_MAP');
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition whitespace-nowrap ${
                effectiveMode === 'PINPOINT_REPORT_MAP'
                  ? 'bg-[#20C8E8] text-[#07111F]'
                  : 'text-[#9AADC1] hover:text-white'
              }`}
            >
              <MapPin className="h-3.5 w-3.5" />
              <span>Pinpoint Map</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMapMode('SEVERITY_HEATMAP');
                onSelectFeature(null);
                onModeChange?.('SEVERITY_HEATMAP');
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition whitespace-nowrap ${
                effectiveMode === 'SEVERITY_HEATMAP'
                  ? 'bg-[#FF515A] text-white'
                  : 'text-[#9AADC1] hover:text-white'
              }`}
            >
              <Flame className="h-3.5 w-3.5" />
              <span>Severity Heatmap</span>
            </button>
          </div>
        )}
      </div>

      {/* Top-Right: Map View Selector (NORMAL | SATELLITE | TERRAIN | DARK) + Layer + Fullscreen */}
      <div className="absolute top-3 right-3 z-[450] flex items-center gap-2">
        <div
          className="hidden sm:inline-flex items-center rounded-xl border border-white/15 bg-[#07111F]/85 p-0.5 backdrop-blur-md shadow-lg"
          role="group"
          aria-label="Map basemap style"
        >
          {(Object.keys(TILE_URLS) as BasemapStyle[]).map((styleKey) => (
            <button
              key={styleKey}
              type="button"
              onClick={() => setBasemap(styleKey)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition whitespace-nowrap ${
                basemap === styleKey
                  ? 'bg-[#13273B] text-[#20C8E8] border border-[#20C8E8]/40'
                  : 'text-[#9AADC1] hover:text-white border border-transparent'
              }`}
            >
              {TILE_URLS[styleKey].label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            setLayerDrawerOpen((v) => !v);
            setFilterDrawerOpen(false);
          }}
          title="Layer & color encoding options"
          className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/15 bg-[#07111F]/85 text-[#9AADC1] hover:text-white backdrop-blur-md shadow-lg"
        >
          <Layers className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => setIsFullscreen((f) => !f)}
          title={isFullscreen ? 'Exit fullscreen' : 'Expand map fullscreen'}
          className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/15 bg-[#07111F]/85 text-[#9AADC1] hover:text-white backdrop-blur-md shadow-lg"
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>

      {/* Layer Options Popover */}
      {layerDrawerOpen && (
        <div className="absolute top-14 right-3 z-[460] w-64 rounded-2xl border border-white/15 bg-[#0C1929]/95 p-3.5 backdrop-blur-xl shadow-2xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#F4F7FC]">Map Encoding & Style</span>
            <button
              type="button"
              onClick={() => setLayerDrawerOpen(false)}
              className="text-[#9AADC1] hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div>
            <p className="text-[11px] text-[#9AADC1] mb-1.5">Color markers by</p>
            <div className="grid grid-cols-2 gap-1.5">
              {(['SEVERITY', 'CATEGORY'] as MapColorEncoding[]).map((enc) => (
                <button
                  key={enc}
                  type="button"
                  onClick={() => setColorEncoding(enc)}
                  className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
                    colorEncoding === enc
                      ? 'border-[#20C8E8]/60 bg-[#20C8E8]/20 text-[#F4F7FC]'
                      : 'border-white/10 bg-white/5 text-[#9AADC1]'
                  }`}
                >
                  {enc === 'SEVERITY' ? 'Severity' : 'Category'}
                </button>
              ))}
            </div>
          </div>
          <div className="sm:hidden">
            <p className="text-[11px] text-[#9AADC1] mb-1.5">Basemap</p>
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.keys(TILE_URLS) as BasemapStyle[]).map((styleKey) => (
                <button
                  key={styleKey}
                  type="button"
                  onClick={() => setBasemap(styleKey)}
                  className={`rounded-lg border px-2 py-1 text-xs ${
                    basemap === styleKey
                      ? 'border-[#20C8E8] bg-[#20C8E8]/20 text-white'
                      : 'border-white/10 text-[#9AADC1]'
                  }`}
                >
                  {TILE_URLS[styleKey].label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filter Drawer */}
      {filterDrawerOpen && (
        <div className="absolute top-14 left-3 z-[460] w-80 max-h-[70%] overflow-y-auto rounded-2xl border border-white/15 bg-[#0C1929]/95 p-4 backdrop-blur-xl shadow-2xl space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#F4F7FC]">Filter Civic Issues</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  onFiltersChange({
                    ...filters,
                    categories: [],
                    severities: [],
                    priorities: [],
                    verificationStatuses: [],
                    operationalStatuses: [],
                    assignedOfficerId: '',
                    unresolvedOnly: false,
                  })
                }
                className="text-[11px] text-[#20C8E8] hover:underline"
              >
                Clear All
              </button>
              <button
                type="button"
                onClick={() => setFilterDrawerOpen(false)}
                className="text-[#9AADC1] hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div>
            <p className="text-[11px] text-[#9AADC1] mb-1.5">Issue Category</p>
            <div className="flex flex-wrap gap-1.5">
              {(['POTHOLE', 'GARBAGE_OR_WASTE', 'OTHER_CIVIC_CANDIDATE'] as CivicCategory[]).map(
                (cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
                      filters.categories.includes(cat)
                        ? 'border-[#20C8E8] bg-[#20C8E8]/20 text-white'
                        : 'border-white/10 bg-white/5 text-[#9AADC1]'
                    }`}
                  >
                    {formatCategoryLabel(cat)}
                  </button>
                ),
              )}
            </div>
          </div>

          <div>
            <p className="text-[11px] text-[#9AADC1] mb-1.5">Severity Band</p>
            <div className="flex flex-wrap gap-1.5">
              {(['CRITICAL', 'HIGH', 'MODERATE', 'LOW', 'UNKNOWN'] as SeverityLabel[]).map(
                (sev) => (
                  <button
                    key={sev}
                    type="button"
                    onClick={() => toggleSeverity(sev)}
                    className={`rounded-lg border px-2 py-1 text-[11px] font-medium transition ${
                      filters.severities.includes(sev)
                        ? 'border-[#20C8E8] bg-[#20C8E8]/20 text-white'
                        : 'border-white/10 bg-white/5 text-[#9AADC1]'
                    }`}
                  >
                    {sev}
                  </button>
                ),
              )}
            </div>
          </div>

          <div>
            <p className="text-[11px] text-[#9AADC1] mb-1.5">Operational Status</p>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  'PENDING_VERIFICATION',
                  'VERIFIED',
                  'ASSIGNED',
                  'IN_PROGRESS',
                  'RESOLVED',
                ] as OperationalIssueStatus[]
              ).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => toggleOpStatus(st)}
                  className={`rounded-lg border px-2 py-1 text-[11px] font-medium transition ${
                    filters.operationalStatuses.includes(st)
                      ? 'border-[#20C8E8] bg-[#20C8E8]/20 text-white'
                      : 'border-white/10 bg-white/5 text-[#9AADC1]'
                  }`}
                >
                  {st.replaceAll('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {officers.length > 0 && (
            <div>
              <label className="block text-[11px] text-[#9AADC1] mb-1">Assigned Officer</label>
              <select
                value={filters.assignedOfficerId}
                onChange={(e) =>
                  onFiltersChange({ ...filters, assignedOfficerId: e.target.value })
                }
                className="w-full rounded-lg border border-white/15 bg-[#07111F] px-2.5 py-1.5 text-xs text-[#F4F7FC]"
              >
                <option value="">All Officers</option>
                {officers.map((o) => (
                  <option key={o.officer_id} value={o.officer_id}>
                    {o.name} ({o.zone})
                  </option>
                ))}
              </select>
            </div>
          )}

          <label className="flex items-center gap-2 text-xs text-[#F4F7FC] cursor-pointer">
            <input
              type="checkbox"
              checked={filters.unresolvedOnly}
              onChange={(e) =>
                onFiltersChange({ ...filters, unresolvedOnly: e.target.checked })
              }
              className="rounded border-white/20 bg-[#07111F] accent-[#20C8E8]"
            />
            <span>Unresolved issues only</span>
          </label>
        </div>
      )}

      {/* Right-Edge Vertical Map Controls */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 z-[450] flex flex-col gap-1.5 rounded-2xl border border-white/15 bg-[#07111F]/85 p-1.5 backdrop-blur-md shadow-xl">
        <button
          type="button"
          onClick={() => mapRef.current?.zoomIn()}
          title="Zoom in"
          aria-label="Zoom in"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#F4F7FC] hover:bg-white/10"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => mapRef.current?.zoomOut()}
          title="Zoom out"
          aria-label="Zoom out"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#F4F7FC] hover:bg-white/10"
        >
          <Minus className="h-4 w-4" />
        </button>
        <div className="my-0.5 h-px bg-white/10" />
        <button
          type="button"
          onClick={handleLocateMe}
          title="Center on my current GPS location"
          aria-label="Center on my current GPS location"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#20C8E8] hover:bg-white/10"
        >
          <Crosshair className="h-4 w-4" />
        </button>
        {effectiveMode === 'PINPOINT_REPORT_MAP' && (
          <button
            type="button"
            onClick={() => setClusterEnabled((c) => !c)}
            title={clusterEnabled ? 'Disable marker clustering' : 'Enable marker clustering'}
            aria-label="Toggle marker clustering"
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold transition ${
              clusterEnabled ? 'bg-[#20C8E8] text-[#07111F]' : 'text-[#9AADC1] hover:bg-white/10'
            }`}
          >
            CL
          </button>
        )}
        <button
          type="button"
          onClick={() =>
            mapRef.current?.setView(
              [TUMAKURU_CONTEXT.defaultCenter.lat, TUMAKURU_CONTEXT.defaultCenter.lng],
              TUMAKURU_CONTEXT.defaultZoom,
            )
          }
          title="Reset extent to Tumakuru"
          aria-label="Reset map view to Tumakuru"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#9AADC1] hover:text-white hover:bg-white/10"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      {/* Non-blocking notices (Tile status / Device GPS status) */}
      {(tileWarning || gpsStatusMsg) && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[450] flex items-center gap-2 rounded-full border border-white/15 bg-[#07111F]/90 px-3 py-1 text-[11px] text-[#9AADC1] backdrop-blur-md">
          <span>
            {tileWarning
              ? 'External map tiles unreachable in current network; coordinate overlay active.'
              : gpsStatusMsg}
          </span>
          {gpsStatusMsg && (
            <button type="button" onClick={() => setGpsStatusMsg(null)} className="text-white/70">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {/* Floating Glassmorphism Marker Popup */}
      {selectedFeature && effectiveMode === 'PINPOINT_REPORT_MAP' && (
        <div
          className="absolute bottom-20 left-3 right-3 sm:right-auto sm:w-[360px] z-[470] rounded-2xl border border-white/15 bg-[#0C1929]/95 p-3.5 backdrop-blur-xl shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-3">
            <CivicImage
              src={selectedFeature.thumbnail_url}
              alt={selectedFeature.summary}
              className="h-16 w-16 rounded-xl shrink-0 border border-white/10"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] font-semibold text-[#20C8E8]">
                  {selectedFeature.report_reference}
                </span>
                <button
                  type="button"
                  onClick={() => onSelectFeature(null)}
                  className="text-[#9AADC1] hover:text-white"
                  aria-label="Close popup"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-xs font-semibold text-[#F4F7FC] truncate mt-0.5">
                {formatCategoryLabel(selectedFeature.category)}
              </p>
              <p className="text-[11px] text-[#9AADC1] truncate">
                {selectedFeature.location_label}
              </p>
              <p className="text-[10px] text-[#9AADC1]/80 mt-0.5">
                {formatRelativeTime(selectedFeature.submitted_at)} ·{' '}
                {selectedFeature.horizontal_accuracy_meters
                  ? `GPS ±${selectedFeature.horizontal_accuracy_meters}m (${selectedFeature.precision_band})`
                  : 'Approximate pin'}
              </p>
            </div>
          </div>

          <p className="mt-2.5 text-xs text-[#F4F7FC]/90 line-clamp-2">
            {selectedFeature.summary}
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <SeverityBadge
              severity={selectedFeature.severity_label}
              score={selectedFeature.severity_score}
            />
            <PriorityBadge
              label={selectedFeature.priority_label}
              score={selectedFeature.priority_score}
              provisional={selectedFeature.priority_is_provisional}
            />
            <StatusBadge status={selectedFeature.issue_status} />
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                onViewFullReport(
                  selectedFeature.primary_report_id,
                  selectedFeature.physical_issue_id,
                )
              }
              className="flex-1 rounded-xl bg-[#20C8E8] px-3 py-1.5 text-xs font-semibold text-[#07111F] hover:bg-[#49d4f0] transition"
            >
              View Full Report
            </button>
            <a
              href={`https://www.openstreetmap.org/directions?to=${selectedFeature.latitude},${selectedFeature.longitude}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-[#F4F7FC] hover:bg-white/10 transition"
            >
              <Navigation className="h-3.5 w-3.5 text-[#20C997]" />
              <span>
                {userGps
                  ? `${(
                      haversineDistanceMeters(
                        userGps.lat,
                        userGps.lng,
                        selectedFeature.latitude,
                        selectedFeature.longitude,
                      ) / 1000
                    ).toFixed(1)} km`
                  : 'Directions'}
              </span>
            </a>
          </div>
        </div>
      )}

      {/* Heatmap Cell Drill-Down Popup */}
      {selectedHeatCell && effectiveMode === 'SEVERITY_HEATMAP' && (
        <div
          className="absolute bottom-20 left-3 right-3 sm:right-auto sm:w-[370px] z-[470] rounded-2xl border border-white/15 bg-[#0C1929]/95 p-4 backdrop-blur-xl shadow-2xl space-y-2.5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#F4F7FC]">
                Grid Cell ({selectedHeatCell.resolution_meters_approx}m)
              </p>
              <p className="text-[11px] text-[#9AADC1]">
                {selectedHeatCell.unique_physical_issue_count} unique issue(s) ·{' '}
                {selectedHeatCell.report_submission_count} submissions
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedHeatCell(null)}
              className="text-[#9AADC1] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-white/5 p-2">
              <div className="text-[10px] text-[#9AADC1]">Max Severity</div>
              <div className="font-mono text-sm font-bold text-[#F4F7FC]">
                {selectedHeatCell.maximum_severity_score ?? 'N/A'}
              </div>
            </div>
            <div className="rounded-lg bg-white/5 p-2">
              <div className="text-[10px] text-[#9AADC1]">Max Priority</div>
              <div className="font-mono text-sm font-bold text-[#20C8E8]">
                {selectedHeatCell.maximum_priority_score ?? 'N/A'}
              </div>
            </div>
            <div className="rounded-lg bg-white/5 p-2">
              <div className="text-[10px] text-[#9AADC1]">Unresolved</div>
              <div className="font-mono text-sm font-bold text-[#FF963D]">
                {selectedHeatCell.unresolved_issue_count}
              </div>
            </div>
          </div>

          <div className="max-h-32 overflow-y-auto space-y-1.5">
            {cellContributors.map((item) => (
              <button
                key={item.feature_id}
                type="button"
                onClick={() => {
                  setMapMode('PINPOINT_REPORT_MAP');
                  setSelectedHeatCell(null);
                  onSelectFeature(item);
                  mapRef.current?.setView([item.latitude, item.longitude], 16);
                }}
                className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-[#07111F]/70 px-2.5 py-1.5 text-left hover:border-[#20C8E8]/50"
              >
                <div className="min-w-0 pr-2">
                  <span className="font-mono text-[10px] text-[#20C8E8]">
                    {item.report_reference}
                  </span>
                  <p className="text-xs text-[#F4F7FC] truncate">{item.location_label}</p>
                </div>
                <SeverityBadge severity={item.severity_label} score={item.severity_score} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom-Left: Dynamic Legend + Coverage Count */}
      <div className="absolute bottom-3 left-3 z-[450] flex flex-wrap items-center gap-2 rounded-xl border border-white/15 bg-[#07111F]/88 px-3 py-1.5 text-[11px] backdrop-blur-md shadow-lg max-w-[calc(100%-150px)]">
        {colorEncoding === 'SEVERITY' || effectiveMode === 'SEVERITY_HEATMAP' ? (
          <>
            <span className="inline-flex items-center gap-1 text-[#9AADC1]">
              <span className="h-2.5 w-2.5 rounded-full bg-[#FF3B47] ring-1 ring-[#FF963D]" />
              Critical
            </span>
            <span className="inline-flex items-center gap-1 text-[#9AADC1]">
              <span className="h-2.5 w-2.5 rounded-full bg-[#FF515A]" />
              High
            </span>
            <span className="inline-flex items-center gap-1 text-[#9AADC1]">
              <span className="h-2.5 w-2.5 rounded-full bg-[#377DFF]" />
              Moderate
            </span>
            <span className="inline-flex items-center gap-1 text-[#9AADC1]">
              <span className="h-2.5 w-2.5 rounded-full bg-[#20C997]" />
              Low
            </span>
            <span className="inline-flex items-center gap-1 text-[#9AADC1]">
              <span className="h-2.5 w-2.5 rounded-full bg-[#7E93AA]" />
              Unknown
            </span>
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-1 text-[#9AADC1]">
              <span className="h-2.5 w-2.5 rounded-full bg-[#FF515A]" />
              Pothole
            </span>
            <span className="inline-flex items-center gap-1 text-[#9AADC1]">
              <span className="h-2.5 w-2.5 rounded-full bg-[#20C997]" />
              Garbage / Waste
            </span>
            <span className="inline-flex items-center gap-1 text-[#9AADC1]">
              <span className="h-2.5 w-2.5 rounded-full bg-[#FF963D]" />
              Other Civic
            </span>
          </>
        )}
        <span className="h-3 w-px bg-white/15 hidden sm:inline-block" />
        <span className="font-mono text-[10px] text-[#9AADC1]">
          {features.length} mapped{unlocatedCount > 0 ? ` · ${unlocatedCount} unlocated` : ''}
        </span>
      </div>

      {/* Bottom-Right: Compact Interactive Tumakuru Overview Minimap */}
      <div
        className="hidden md:block absolute bottom-7 right-3 z-[450] h-20 w-28 rounded-xl border border-white/15 bg-[#07111F]/90 backdrop-blur-md shadow-xl overflow-hidden cursor-pointer"
        title="Overview minimap — click to center Tumakuru"
        onClick={() =>
          mapRef.current?.setView(
            [TUMAKURU_CONTEXT.defaultCenter.lat, TUMAKURU_CONTEXT.defaultCenter.lng],
            TUMAKURU_CONTEXT.defaultZoom,
          )
        }
      >
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(154,173,193,0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(154,173,193,0.2) 1px, transparent 1px)',
            backgroundSize: '14px 14px',
          }}
        />
        {features.map((f) => {
          const pos = projectMini(f.latitude, f.longitude);
          const col = getSeverityVisualToken(f.severity_label).hex;
          return (
            <span
              key={`mini-${f.feature_id}`}
              style={{ ...pos, backgroundColor: col }}
              className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            />
          );
        })}
        {/* Current viewport indicator */}
        <div
          className="absolute border border-[#20C8E8] bg-[#20C8E8]/10 pointer-events-none"
          style={{
            left: projectMini(mapBounds.north, mapBounds.west).left,
            top: projectMini(mapBounds.north, mapBounds.west).top,
            width: '38%',
            height: '38%',
          }}
        />
        <span className="absolute bottom-1 left-1.5 text-[9px] font-mono text-[#9AADC1]">
          TMK z{Math.round(zoomLevel)}
        </span>
      </div>
    </div>
  );
}
