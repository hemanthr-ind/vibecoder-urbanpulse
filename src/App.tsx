import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bell,
  Brain,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Compass,
  FileText,
  HelpCircle,
  History,
  Home,
  ListOrdered,
  LogOut,
  Map as MapIcon,
  Megaphone,
  Menu,
  PlusCircle,
  Search,
  Settings,
  ShieldCheck,
  User,
  Users,
  Wifi,
  WifiOff,
  Wrench,
  X,
} from 'lucide-react';
import {
  api,
  ApiError,
  setAuthToken,
  type AnalyticsPayload,
  type AuthStatusResponse,
  type DashboardPayload,
} from './api/client';
import { CityMap } from './components/CityMap';
import { ReportDetailDrawer } from './components/ReportDetailDrawer';
import { ReportPortal } from './components/ReportPortal';
import { RoleAuthModal } from './components/RoleAuthModal';
import {
  AdminOfficersPage,
  AdminAuditLogsPage,
  AdminResolvedIssuesPage,
  AdminSystemConfigPage,
  AdminUsersPage,
} from './pages/AdminOpsAndConfigPages';
import {
  AdminAiAnalysisPage,
  AdminAnalyticsPage,
  AdminPriorityManagementPage,
  AdminVerificationQueuePage,
} from './pages/AdminWorkflowPages';
import { AllReportsPage } from './pages/AllReportsPage';
import {
  FieldOfficerPerformancePage,
  FieldOfficerTasksPage,
} from './pages/FieldOfficerPages';
import { HomeOverview } from './pages/HomeOverview';
import {
  CommunityUpdatesPage,
  HelpCentrePage,
  NotificationsPage,
  ProfilePage,
} from './pages/SharedSupportPages';
import {
  createDefaultMapFilters,
  filterMapFeatures,
} from './shared/geospatial';
import type {
  CivicReport,
  MapFilterState,
  MapMode,
  MapPointFeature,
  PhysicalIssue,
  UserAccount,
  UserRole,
} from './shared/types';

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

export default function App() {
  const [activeRole, setActiveRole] = useState<UserRole>('CITIZEN');
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatusResponse | null>(null);
  const [authModalRole, setAuthModalRole] = useState<UserRole | null>(null);

  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [online, setOnline] = useState(true);
  const [loading, setLoading] = useState(true);

  const [activePage, setActivePage] = useState<string>('home');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [trackRefHint, setTrackRefHint] = useState('');

  const [mapFilters, setMapFilters] = useState<MapFilterState>(createDefaultMapFilters);
  const [mapIntelligenceMode, setMapIntelligenceMode] = useState<MapMode>('PINPOINT_REPORT_MAP');
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);

  const [drawerData, setDrawerData] = useState<{
    report: CivicReport | null;
    issue: PhysicalIssue | null;
  } | null>(null);

  const [toast, setToast] = useState<{
    msg: string;
    tone: 'success' | 'error' | 'info';
  } | null>(null);

  const notify = useCallback(
    (msg: string, tone: 'success' | 'error' | 'info' = 'info') => {
      setToast({ msg, tone });
      window.setTimeout(() => {
        setToast((cur) => (cur?.msg === msg ? null : cur));
      }, 4200);
    },
    [],
  );

  const refreshAll = useCallback(async () => {
    try {
      const [dash, status] = await Promise.all([
        api.getDashboard(),
        api.getAuthStatus(),
      ]);
      setDashboard(dash);
      setAuthStatus(status);
      setOnline(true);

      // Keep open drawer synchronized with fresh backend state
      setDrawerData((prev) => {
        if (!prev) return null;
        const freshReport = prev.report
          ? dash.recentReports.find((r) => r.report_id === prev.report!.report_id) ?? prev.report
          : null;
        const freshIssue = prev.issue
          ? dash.issues.find((i) => i.physical_issue_id === prev.issue!.physical_issue_id) ??
            prev.issue
          : null;
        return { report: freshReport, issue: freshIssue };
      });
    } catch (err) {
      setOnline(false);
      if (err instanceof ApiError) {
        notify(err.message, 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (activePage === 'analytics') {
      api
        .getAnalytics()
        .then(setAnalytics)
        .catch(() => {});
    }
  }, [activePage, dashboard]);

  const handleRoleSwitch = (target: UserRole) => {
    if (target === 'CITIZEN') {
      if (currentUser && currentUser.role !== 'CITIZEN') {
        setAuthToken(null);
        setCurrentUser(null);
      }
      setActiveRole('CITIZEN');
      setActivePage('home');
      refreshAll();
      return;
    }

    if (currentUser && currentUser.role === target) {
      setActiveRole(target);
      setActivePage('home');
      return;
    }

    // Privileged role requires server authentication — never escalate silently
    setAuthModalRole(target);
  };

  const handleAuthenticated = async (token: string, user: UserAccount) => {
    setAuthToken(token);
    setCurrentUser(user);
    setActiveRole(user.role);
    setAuthModalRole(null);
    setActivePage('home');
    await refreshAll();
    notify(`Authenticated as ${user.name} (${user.role.replaceAll('_', ' ')}).`, 'success');
  };

  const handleLogout = async () => {
    setAuthToken(null);
    setCurrentUser(null);
    setActiveRole('CITIZEN');
    setActivePage('home');
    await refreshAll();
    notify('Signed out to public citizen view.', 'info');
  };

  const navItems: NavItem[] = useMemo(() => {
    const unreadCount = dashboard?.notifications.filter((n) => !n.read).length ?? 0;
    const pendingReviewCount = dashboard?.kpis.pendingVerification ?? 0;
    const assignedCount = dashboard?.issues.filter(
      (i) => i.current_issue_status === 'ASSIGNED' || i.current_issue_status === 'IN_PROGRESS',
    ).length ?? 0;

    if (activeRole === 'ADMIN') {
      return [
        { id: 'home', label: 'Home Overview', icon: Home },
        { id: 'reports', label: 'All Reports', icon: FileText },
        { id: 'map', label: 'Live City Map', icon: MapIcon },
        { id: 'ai', label: 'AI Analysis', icon: Brain },
        { id: 'verification', label: 'Verification Queue', icon: ClipboardCheck, badge: pendingReviewCount },
        { id: 'priority', label: 'Priority Management', icon: ListOrdered },
        { id: 'analytics', label: 'Analytics & Insights', icon: BarChart3 },
        { id: 'officers', label: 'Field Officers', icon: Wrench },
        { id: 'users', label: 'User Management', icon: Users },
        { id: 'resolved', label: 'Resolved Issues', icon: CheckCircle2 },
        { id: 'notifications', label: 'Notifications', icon: Bell, badge: unreadCount },
        { id: 'config', label: 'System Config', icon: Settings },
        { id: 'audit', label: 'Audit Logs', icon: History },
        { id: 'help', label: 'Help Centre', icon: HelpCircle },
      ];
    }

    if (activeRole === 'FIELD_OFFICER') {
      return [
        { id: 'home', label: 'Home Overview', icon: Home },
        { id: 'tasks', label: 'Assigned Tasks', icon: ClipboardList, badge: assignedCount },
        { id: 'map', label: 'Live City Map', icon: MapIcon },
        { id: 'history', label: 'Task History', icon: History },
        { id: 'notifications', label: 'Notifications', icon: Bell, badge: unreadCount },
        { id: 'performance', label: 'My Performance', icon: Activity },
        { id: 'help', label: 'Help Centre', icon: HelpCircle },
        { id: 'profile', label: 'My Profile', icon: User },
      ];
    }

    return [
      { id: 'home', label: 'Home Overview', icon: Home },
      { id: 'report', label: 'Report Portal', icon: PlusCircle },
      { id: 'my-reports', label: 'My Reports', icon: FileText },
      { id: 'track', label: 'Track My Report', icon: Compass },
      { id: 'map', label: 'Live City Map', icon: MapIcon },
      { id: 'updates', label: 'Community Updates', icon: Megaphone },
      { id: 'help', label: 'Help Centre', icon: HelpCircle },
      { id: 'profile', label: 'My Profile', icon: User },
    ];
  }, [activeRole, dashboard]);

  const handleGlobalSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = globalSearch.trim();
    if (!q) return;
    if (q.toUpperCase().startsWith('UP-') || q.toUpperCase().startsWith('REP-')) {
      setTrackRefHint(q);
      setActivePage('track');
      return;
    }
    setMapFilters((prev) => ({ ...prev, searchQuery: q }));
    setActivePage('map');
  };

  const unreadNotifications = dashboard?.notifications.filter((n) => !n.read).length ?? 0;

  const filteredMapFeatures = useMemo(
    () => (dashboard ? filterMapFeatures(dashboard.mapSummary.features, mapFilters) : []),
    [dashboard, mapFilters],
  );

  return (
    <div className="min-h-screen bg-[#07111F] text-[#F4F7FC] flex flex-col">
      {/* Subtle Ambient Top Radial Highlight */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-72 opacity-40"
        style={{
          background:
            'radial-gradient(ellipse 65% 50% at 50% -10%, rgba(32, 200, 232, 0.16), rgba(32, 201, 151, 0.08), transparent)',
        }}
      />

      {/* TOP NAVIGATION BAR */}
      <header className="sticky top-0 z-[500] h-16 border-b border-white/10 bg-[#07111F]/90 px-3 sm:px-5 backdrop-blur-xl flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="lg:hidden rounded-xl border border-white/10 bg-white/5 p-2 text-[#9AADC1]"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={() => setActivePage('home')}
            className="flex items-center gap-2 text-left shrink-0"
            aria-label="UrbanPulse AI Home"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#20C8E8]/40 bg-gradient-to-br from-[#20C8E8]/25 to-[#20C997]/20 shadow-md">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#20C8E8]" fill="none" stroke="currentColor" strokeWidth="2.1">
                <path d="M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10z" />
                <path d="M8 11h2l1.2-2.5 1.8 5 1.2-2.5H16" stroke="#20C997" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="hidden sm:block leading-tight">
              <div className="font-display text-sm sm:text-base font-bold tracking-tight text-[#F4F7FC]">
                URBANPULSE AI
              </div>
              <div className="hidden xl:block text-[10px] text-[#9AADC1]">
                Tumakuru, Karnataka · See the Issue. Understand the Impact.
              </div>
            </div>
          </button>
        </div>

        {/* Center Global Search */}
        <form
          onSubmit={handleGlobalSearch}
          className="hidden md:flex items-center gap-2 rounded-xl border border-white/10 bg-[#0C1929]/90 px-3 py-1.5 w-64 xl:w-80"
        >
          <Search className="h-3.5 w-3.5 text-[#9AADC1] shrink-0" />
          <input
            type="text"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            placeholder="Search Report ID or location..."
            aria-label="Global search"
            className="w-full bg-transparent text-xs text-[#F4F7FC] placeholder-[#9AADC1]/70 focus:outline-none"
          />
        </form>

        {/* Right: Role Switcher + Notifications + Connectivity + Profile */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Visible Segmented Role Switcher */}
          <div
            className="inline-flex items-center rounded-xl border border-white/15 bg-[#0C1929] p-0.5 shadow-inner"
            role="group"
            aria-label="Role selector"
          >
            {(
              [
                { role: 'CITIZEN' as UserRole, label: 'USER', icon: User, activeCls: 'bg-[#20C997] text-[#07111F]' },
                { role: 'ADMIN' as UserRole, label: 'ADMINISTRATOR', icon: ShieldCheck, activeCls: 'bg-[#20C8E8] text-[#07111F]' },
                { role: 'FIELD_OFFICER' as UserRole, label: 'FIELD OFFICER', icon: Wrench, activeCls: 'bg-[#377DFF] text-white' },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const isActive = activeRole === item.role;
              return (
                <button
                  key={item.role}
                  type="button"
                  onClick={() => handleRoleSwitch(item.role)}
                  className={`inline-flex items-center gap-1 rounded-lg px-2 sm:px-2.5 py-1.5 text-[10px] sm:text-[11px] font-semibold transition whitespace-nowrap shrink-0 ${
                    isActive ? item.activeCls : 'text-[#9AADC1] hover:text-white'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">{item.label}</span>
                  <span className="sm:hidden">
                    {item.role === 'CITIZEN' ? 'USER' : item.role === 'ADMIN' ? 'ADMIN' : 'FIELD'}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setActivePage('notifications')}
            aria-label="Notifications"
            className="relative rounded-xl border border-white/10 bg-[#0C1929] p-2 text-[#9AADC1] hover:text-white"
          >
            <Bell className="h-4 w-4" />
            {unreadNotifications > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF515A] px-1 font-mono text-[9px] font-bold text-white">
                {unreadNotifications}
              </span>
            )}
          </button>

          <span
            title={online ? 'Connected to UrbanPulse API' : 'Connection degraded'}
            className={`hidden sm:inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap ${
              online
                ? 'border-[#20C997]/30 bg-[#20C997]/10 text-[#68E7BE]'
                : 'border-[#FF515A]/40 bg-[#FF515A]/15 text-[#FF9DA2]'
            }`}
          >
            {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            <span>{online ? 'Connected' : 'Offline'}</span>
          </span>

          {currentUser ? (
            <button
              type="button"
              onClick={handleLogout}
              title={`Signed in as ${currentUser.name} — Click to sign out`}
              className="hidden md:inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-[#0C1929] px-2.5 py-1.5 text-xs text-[#F4F7FC] hover:border-[#FF515A]/50"
            >
              <span className="max-w-[96px] truncate">{currentUser.name}</span>
              <LogOut className="h-3.5 w-3.5 text-[#9AADC1]" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setAuthModalRole('CITIZEN')}
              className="hidden md:inline-flex items-center gap-1 rounded-xl border border-white/15 bg-[#0C1929] px-2.5 py-1.5 text-xs text-[#9AADC1] hover:text-white whitespace-nowrap"
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      {/* BODY SHELL: Collapsible Left Sidebar + Main Workspace */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Left Sidebar (Desktop + Mobile Slide-over) */}
        <aside
          className={`${
            mobileMenuOpen ? 'fixed inset-y-16 left-0 z-[480] flex' : 'hidden lg:flex'
          } flex-col border-r border-white/10 bg-[#0C1929]/90 backdrop-blur-xl transition-all duration-200 ${
            sidebarCollapsed ? 'w-16' : 'w-60'
          } shrink-0`}
        >
          <div className="flex items-center justify-between px-3 py-3 border-b border-white/10">
            {!sidebarCollapsed && (
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#9AADC1]">
                {activeRole.replaceAll('_', ' ')} MENU
              </span>
            )}
            <button
              type="button"
              onClick={() => setSidebarCollapsed((c) => !c)}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="hidden lg:flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[#9AADC1] hover:text-white ml-auto"
            >
              {sidebarCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <ChevronLeft className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto p-2.5 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activePage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActivePage(item.id);
                    setMobileMenuOpen(false);
                  }}
                  title={sidebarCollapsed ? item.label : undefined}
                  className={`flex w-full items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-xs font-medium transition ${
                    active
                      ? 'border border-[#20C8E8]/40 bg-[#20C8E8]/15 text-[#F4F7FC]'
                      : 'border border-transparent text-[#9AADC1] hover:bg-white/5 hover:text-[#F4F7FC]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        active ? 'text-[#20C8E8]' : 'text-[#9AADC1]'
                      }`}
                    />
                    {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                  </div>
                  {!sidebarCollapsed && item.badge !== undefined && item.badge > 0 && (
                    <span className="rounded-md bg-[#20C8E8]/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#20C8E8]">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {!sidebarCollapsed && (
            <div className="border-t border-white/10 p-3 text-[11px] text-[#9AADC1]">
              <div className="font-semibold text-[#F4F7FC]">Tumakuru Jurisdiction</div>
              <div className="mt-0.5">
                {authStatus?.geminiConfigured
                  ? 'Gemini Vision Active'
                  : 'Manual Review Mode (API Key Unset)'}
              </div>
            </div>
          )}
        </aside>

        {/* Main Content Workspace */}
        <main className="flex-1 min-w-0 p-3 sm:p-4 overflow-y-auto">
          {loading || !dashboard ? (
            <div className="flex h-96 items-center justify-center rounded-2xl border border-white/10 bg-[#0C1929]/70 text-sm text-[#9AADC1]">
              Loading UrbanPulse AI Tumakuru Workspace...
            </div>
          ) : activePage === 'home' ? (
            <HomeOverview
              dashboard={dashboard}
              activeRole={activeRole}
              currentUser={currentUser}
              filters={mapFilters}
              onFiltersChange={setMapFilters}
              selectedFeatureId={selectedFeatureId}
              onSelectFeature={(feat) => setSelectedFeatureId(feat?.feature_id ?? null)}
              onOpenReport={(report, issue) => setDrawerData({ report, issue })}
              onNavigate={(page) => setActivePage(page)}
            />
          ) : activePage === 'map' ? (
            <div className="h-[calc(100vh-100px)] min-h-[540px]">
              <CityMap
                features={filteredMapFeatures}
                unlocatedCount={dashboard.mapSummary.unlocatedCount}
                filters={mapFilters}
                onFiltersChange={setMapFilters}
                officers={dashboard.officers}
                selectedFeatureId={selectedFeatureId}
                onSelectFeature={(feat) => setSelectedFeatureId(feat?.feature_id ?? null)}
                onViewFullReport={(reportId, issueId) => {
                  const rep =
                    dashboard.recentReports.find((r) => r.report_id === reportId) ?? null;
                  const iss = issueId
                    ? dashboard.issues.find((i) => i.physical_issue_id === issueId) ?? null
                    : null;
                  setDrawerData({ report: rep, issue: iss });
                }}
                allowHeatmap={true}
                initialMode={mapIntelligenceMode}
                onModeChange={setMapIntelligenceMode}
                className="h-full w-full"
              />
            </div>
          ) : activePage === 'report' ? (
            <ReportPortal
              reporterName={currentUser?.name}
              onSubmitted={refreshAll}
              onTrackReport={(ref) => {
                setTrackRefHint(ref);
                setActivePage('track');
              }}
              onViewOnMap={(repId) => {
                setSelectedFeatureId(`feat_${repId}`);
                setActivePage('map');
              }}
            />
          ) : activePage === 'reports' || activePage === 'my-reports' || activePage === 'track' ? (
            <AllReportsPage
              reports={dashboard.recentReports}
              issues={dashboard.issues}
              mode={
                activePage === 'track'
                  ? 'TRACK'
                  : activePage === 'my-reports'
                    ? 'MINE'
                    : 'ALL'
              }
              currentUserId={currentUser?.user_id}
              initialTrackRef={trackRefHint}
              onOpenReport={(report, issue) => setDrawerData({ report, issue })}
            />
          ) : activePage === 'ai' && activeRole === 'ADMIN' ? (
            <AdminAiAnalysisPage
              reports={dashboard.recentReports}
              issues={dashboard.issues}
              onRefresh={refreshAll}
              onOpenReport={(report, issue) => setDrawerData({ report, issue })}
              onNotify={notify}
            />
          ) : activePage === 'verification' && activeRole === 'ADMIN' ? (
            <AdminVerificationQueuePage
              issues={dashboard.issues}
              reports={dashboard.recentReports}
              onRefresh={refreshAll}
              onOpenReport={(report, issue) => setDrawerData({ report, issue })}
              onNotify={notify}
            />
          ) : activePage === 'priority' && activeRole === 'ADMIN' ? (
            <AdminPriorityManagementPage
              issues={dashboard.issues}
              reports={dashboard.recentReports}
              onOpenReport={(report, issue) => setDrawerData({ report, issue })}
            />
          ) : activePage === 'analytics' && activeRole === 'ADMIN' ? (
            <AdminAnalyticsPage analytics={analytics} />
          ) : activePage === 'officers' && activeRole === 'ADMIN' ? (
            <AdminOfficersPage
              officers={dashboard.officers}
              issues={dashboard.issues}
              onRefresh={refreshAll}
              onNotify={notify}
            />
          ) : activePage === 'users' && activeRole === 'ADMIN' ? (
            <AdminUsersPage onNotify={notify} />
          ) : activePage === 'resolved' && activeRole === 'ADMIN' ? (
            <AdminResolvedIssuesPage
              issues={dashboard.issues}
              reports={dashboard.recentReports}
              onRefresh={refreshAll}
              onOpenReport={(report, issue) => setDrawerData({ report, issue })}
              onNotify={notify}
            />
          ) : activePage === 'config' && activeRole === 'ADMIN' ? (
            <AdminSystemConfigPage
              config={dashboard.config}
              onRefresh={refreshAll}
              onNotify={notify}
            />
          ) : activePage === 'audit' && activeRole === 'ADMIN' ? (
            <AdminAuditLogsPage onNotify={notify} />
          ) : (activePage === 'tasks' || activePage === 'history') &&
            activeRole === 'FIELD_OFFICER' ? (
            <FieldOfficerTasksPage
              mode={activePage === 'history' ? 'HISTORY' : 'ACTIVE'}
              issues={dashboard.issues}
              reports={dashboard.recentReports}
              officers={dashboard.officers}
              currentUser={currentUser}
              onOpenReport={(report, issue) => setDrawerData({ report, issue })}
            />
          ) : activePage === 'performance' && activeRole === 'FIELD_OFFICER' ? (
            <FieldOfficerPerformancePage
              officers={dashboard.officers}
              currentUser={currentUser}
              issues={dashboard.issues}
            />
          ) : activePage === 'updates' ? (
            <CommunityUpdatesPage
              reports={dashboard.recentReports}
              issues={dashboard.issues}
              onOpenReport={(report, issue) => setDrawerData({ report, issue })}
            />
          ) : activePage === 'notifications' ? (
            <NotificationsPage
              notifications={dashboard.notifications}
              onRefresh={refreshAll}
            />
          ) : activePage === 'help' ? (
            <HelpCentrePage activeRole={activeRole} />
          ) : activePage === 'profile' ? (
            <ProfilePage
              activeRole={activeRole}
              currentUser={currentUser}
              onOpenAuth={(role) => setAuthModalRole(role)}
              onLogout={handleLogout}
            />
          ) : (
            <div className="rounded-2xl border border-[#FF515A]/40 bg-[#FF515A]/15 p-6 text-center text-sm text-[#FF9DA2]">
              Access denied: Your active session does not have permission for this page.
            </div>
          )}
        </main>
      </div>

      {/* Report / Issue Detail Drawer */}
      {drawerData && (
        <ReportDetailDrawer
          report={drawerData.report}
          issue={drawerData.issue}
          activeRole={activeRole}
          officers={dashboard?.officers ?? []}
          onClose={() => setDrawerData(null)}
          onUpdated={refreshAll}
          onNotify={notify}
        />
      )}

      {/* Authentication / First-Run Claim Modal */}
      {authModalRole && (
        <RoleAuthModal
          targetRole={authModalRole}
          authStatus={authStatus}
          onClose={() => setAuthModalRole(null)}
          onAuthenticated={handleAuthenticated}
        />
      )}

      {/* Global Toast */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-[950] rounded-xl border px-4 py-2.5 text-xs font-medium shadow-2xl backdrop-blur-xl ${
            toast.tone === 'error'
              ? 'border-[#FF515A]/50 bg-[#0C1929]/95 text-[#FF9DA2]'
              : toast.tone === 'success'
                ? 'border-[#20C997]/50 bg-[#0C1929]/95 text-[#68E7BE]'
                : 'border-[#20C8E8]/50 bg-[#0C1929]/95 text-[#F4F7FC]'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
