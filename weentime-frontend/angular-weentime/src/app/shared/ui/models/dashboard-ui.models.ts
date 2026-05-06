export type DashboardRole = 'ADMIN' | 'RH' | 'MANAGER' | 'EMPLOYEE';

export type UiTone = 'primary' | 'info' | 'success' | 'warning' | 'danger' | 'neutral';

export type DashboardChartType = 'line' | 'bar' | 'donut' | 'area';

export interface DashboardStat {
  id: string;
  label: string;
  value: string;
  detail?: string;
  subLabel?: string;
  trend?: string;
  trendLabel?: string;
  trendUp?: boolean;
  trendType?: 'success' | 'warning' | 'danger' | 'neutral';
  tone?: UiTone;
  colorTone?: UiTone;
  icon?: string;
  loading?: boolean;
  error?: string | null;
}

export interface DashboardMetricTile {
  id: string;
  label: string;
  value: string;
  tone?: UiTone;
}

export interface DashboardChartSeries {
  id: string;
  title: string;
  subtitle?: string;
  type: DashboardChartType;
  labels: string[];
  values: number[];
  tone?: UiTone;
}

export interface DashboardActivity {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  tone?: UiTone;
}

export interface DashboardNotification {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  tone?: UiTone;
  unread?: boolean;
}

export interface DashboardQuickAction {
  id: string;
  label: string;
  route: string;
  icon?: string;
  tone?: UiTone;
  disabled?: boolean;
}

export interface DashboardSegment {
  id: string;
  label: string;
  value: number;
  tone?: UiTone;
}

export interface DashboardPeopleItem {
  id: string;
  fullName: string;
  subline: string;
  status: string;
  statusTone?: UiTone;
  avatar?: string;
}

export interface DashboardWidgetWarning {
  id: string;
  widget: string;
  message: string;
  tone?: UiTone;
}

export interface DashboardPayload {
  role: DashboardRole;
  heroTitle: string;
  heroSubtitle: string;
  roleBadge: string;
  stats: DashboardStat[];
  metricTiles: DashboardMetricTile[];
  charts: DashboardChartSeries[];
  activities: DashboardActivity[];
  notifications: DashboardNotification[];
  quickActions: DashboardQuickAction[];
  segments: DashboardSegment[];
  people: DashboardPeopleItem[];
  warnings?: DashboardWidgetWarning[];
}

export interface DashboardLoadState {
  loading: boolean;
  error: string | null;
}

export type AdminDashboardVm = DashboardPayload & { role: 'ADMIN' };
export type RhDashboardVm = DashboardPayload & { role: 'RH' };
export type ManagerDashboardVm = DashboardPayload & { role: 'MANAGER' };
export type EmployeeDashboardVm = DashboardPayload & { role: 'EMPLOYEE' };
