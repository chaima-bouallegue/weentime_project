export type EmployeeStatus = 'ACTIVE' | 'ABSENT' | 'ON_LEAVE';
export type PresenceStatus = 'PRESENT' | 'ABSENT' | 'LATE';
export type LeaveRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface Employee {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  department: string;
  status: EmployeeStatus;
}

export interface Presence {
  id: number;
  userId: number;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  totalHours: number;
  status: PresenceStatus;
}

export interface LeaveRequest {
  id: number;
  userId: number;
  type: string;
  startDate: string | null;
  endDate: string | null;
  status: LeaveRequestStatus;
  validatedBy: number | null;
}

export interface Activity {
  id: string;
  title: string;
  description: string;
  date: string | null;
  type: string | null;
  route: string | null;
}

export interface AttendanceBarItem {
  label: string;
  value: number;
  percent: number;
  color: string;
}

export interface RequestMixItem {
  label: string;
  value: number;
  percent: number;
}

export interface HighlightedMember {
  id: number;
  fullName: string;
  team: string;
  timeLabel: string;
  status: EmployeeStatus;
}

export interface ActivityFeedItem {
  id: string;
  title: string;
  description: string;
  date: string;
}

export interface DashboardAttendanceStats {
  present: number;
  absent: number;
  remote: number;
}

export interface DashboardRequestStats {
  leave: number;
  autorisation: number;
  teletravail: number;
}

export interface DashboardLeaveRequest extends LeaveRequest {
  employeeName: string;
  employeeEmail: string;
  department: string;
}

export interface DashboardEmployee extends Employee {
  team: string;
}

export interface DashboardApiResponse {
  totalEmployees: number;
  presentCount: number;
  absentCount: number;
  hoursWorked: number;
  attendanceRate: number;
  pendingRequests: DashboardLeaveRequest[];
  attendanceStats: DashboardAttendanceStats;
  requestStats: DashboardRequestStats;
  highlightedEmployees: DashboardEmployee[];
  recentActivities: Activity[];
}

export interface DashboardViewModel {
  totalEmployees: number;
  presentCount: number;
  absentCount: number;
  pendingRequests: DashboardLeaveRequest[];
  hoursWorked: number;
  attendanceRate: number;
  attendanceBars: AttendanceBarItem[];
  requestMix: RequestMixItem[];
  highlightedMembers: HighlightedMember[];
  activityFeed: ActivityFeedItem[];
}
