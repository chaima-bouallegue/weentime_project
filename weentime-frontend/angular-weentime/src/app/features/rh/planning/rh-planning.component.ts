import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { RhPlanningService, PlanningResponseDTO, EmployeeStatusDTO } from './rh-planning.service';
import { PlanningStore } from '../../../core/services/planning.store';
import { OrganisationService } from '../../../core/services/organisation.service';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/services/auth.service';
import { finalize } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

// ── State Machine Types ──
type PanelDepth = 'closed' | 'day' | 'employee' | 'notification' | 'sending' | 'sent';
type ViewMode = 'month' | 'week' | 'day' | 'timeline' | 'agenda' | 'capacity';
type StatusFilter = 'ALL' | 'PRESENT' | 'REMOTE' | 'LEAVE' | 'ABSENCE' | 'SCHEDULED' | 'PENDING';
type DetailTab = 'overview' | 'schedule' | 'attendance' | 'leaves' | 'tasks';

@Component({
  selector: 'app-rh-planning',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rh-planning.component.html',
  styleUrl: './rh-planning.component.scss'
})
export class RhPlanningComponent implements OnInit {
  private planningStore = inject(PlanningStore);
  private planningService = inject(RhPlanningService);
  private organisationService = inject(OrganisationService);
  private authService = inject(AuthService);
  protected toast = inject(ToastService);
  private http = inject(HttpClient);

  protected readonly Math = Math;

  // ── Calendar View State ──
  viewMode = signal<ViewMode>('month');
  currentDate = signal(new Date());
  isLoading = this.planningStore.isLoading;
  teams = this.planningStore.teams;
  selectedTeam = signal<number | null>(null);
  selectedDepartment = signal<string | null>(null);
  selectedStatusFilter = signal<string | null>(null);
  searchTerm = signal('');

  // ── Inspector Panel State Machine ──
  panelDepth = signal<PanelDepth>('closed');
  panelSelectedDate = signal<string>(new Date().toISOString().split('T')[0]);
  panelSelectedEmployee = signal<EmployeeStatusDTO | null>(null);
  panelActiveTab = signal<DetailTab>('overview');
  panelReturnScrollY = signal(0);
  panelStatusFilter = signal<StatusFilter>('ALL');
  panelSearchTerm = signal('');

  // ── Selection Model ──
  selection = signal<Set<number>>(new Set());

  // ── Notification Center State ──
  notifRecipients = signal<EmployeeStatusDTO[]>([]);
  notifChannels = signal<Record<string, boolean>>({ email: true, push: true, sms: false, teams: false, slack: false });
  notifTemplate = signal('rappel_pointage');
  notifMessage = signal('Bonjour {{prenom}}, merci de confirmer votre statut pour aujourd\'hui. Cordialement, votre service RH.');
  notifScheduled = signal(false);
  notifProgress = signal(0);
  notifDeliveryStatus = signal<{ delivered: string[]; pending: string[]; failed: { name: string; reason: string }[] }>({ delivered: [], pending: [], failed: [] });

  // ── Detail Loading ──
  detailLoading = signal(false);
  detailedStatus = signal<any>(null);

  // ── Holidays ──
  holidays = signal<Record<string, string>>({
    '2026-05-01': 'Fête du Travail', '2026-05-08': 'Victoire 1945', '2026-05-14': 'Ascension',
    '2026-07-14': 'Fête Nationale', '2026-08-15': 'Assomption', '2026-11-01': 'Toussaint',
    '2026-11-11': 'Armistice', '2026-12-25': 'Noël'
  });

  // ── Mock AI & Conflicts ──
  conflicts = signal<any[]>([
    { id: 1, employee: { prenom: 'Amal', nom: 'Ben', initials: 'AB' }, date: '2026-07-02', type: 'Conflit de Congé', desc: 'Congé validé mais plannifié en présentiel' },
    { id: 2, employee: { prenom: 'Lucas', nom: 'Martin', initials: 'LM' }, date: '2026-07-03', type: 'Sous-effectif critique', desc: 'Équipe Support < 50% de couverture' },
    { id: 3, employee: { prenom: 'Sarah', nom: 'Elise', initials: 'SE' }, date: '2026-07-05', type: 'Dépassement légal', desc: 'Durée maximale hebdomadaire dépassée (+4h)' }
  ]);

  aiRecommendations = signal<any[]>([
    { id: 1, text: 'Passer Amal en télétravail ce vendredi — évite le conflit de congé et optimise la couverture de +12%', applied: false, impact: '+12% de couverture' },
    { id: 2, text: 'Fusionner le shift de Lucas avec le shift du matin le mercredi', applied: false, impact: 'Résout 1 conflit' },
    { id: 3, text: 'Valider automatiquement le congé de Sarah — couverture disponible >80%', applied: false, impact: 'Réduit 2 jours de traitement' }
  ]);

  pendingRequests = signal<any[]>([
    { id: 1, employee: 'Amal Ben', type: 'Congé Payé', date: '2026-07-10', duration: '3 jours', status: 'En attente' },
    { id: 2, employee: 'Lucas Martin', type: 'Télétravail', date: '2026-07-08', duration: '1 jour', status: 'En attente' },
    { id: 3, employee: 'Sarah Elise', type: 'Formation', date: '2026-07-15', duration: '2 jours', status: 'En attente' }
  ]);

  auditLogs = signal<any[]>([
    { time: '14:23', action: 'Shift modifié', user: 'Admin RH', details: 'Lucas Martin → Télétravail' },
    { time: '11:05', action: 'Congé approuvé', user: 'Système IA', details: 'Sarah Elise — auto-validé' },
    { time: 'Hier', action: 'Alerte générée', user: 'Moteur de règles', details: 'Couverture critique 03/07' }
  ]);

  // Saved views
  savedViews = ['Défaut', 'Operations', 'Mon Équipe', 'Executive'];
  activeSavedView = signal('Défaut');

  // ── Computed: Planning Data ──
  calendarDays = computed(() => {
    const date = this.currentDate();
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return this.planningStore.getPlanning(monthKey, this.selectedTeam() || undefined);
  });

  paddingDays = computed(() => {
    const start = new Date(this.currentDate().getFullYear(), this.currentDate().getMonth(), 1);
    let firstDayIdx = start.getDay();
    firstDayIdx = (firstDayIdx === 0) ? 6 : firstDayIdx - 1;
    return Array(firstDayIdx).fill(0);
  });

  uniqueEmployees = computed(() => {
    const map = new Map<number, EmployeeStatusDTO>();
    this.calendarDays().forEach(day => day.employees.forEach(emp => { if (!map.has(emp.id)) map.set(emp.id, emp); }));
    return Array.from(map.values());
  });

  processedDays = computed(() => {
    const days = this.calendarDays();
    const search = this.searchTerm().toLowerCase();
    
    return days.map(day => {
      const dateParts = day.date.split('-');
      const dayNum = parseInt(dateParts[2] || '1', 10);
      const dateObj = new Date(day.date);
      const isRestDay = day.isRestDay || (dateObj.getDay() === 0 || dateObj.getDay() === 6);
      const hasConflict = !isRestDay && (dayNum === 4 || dayNum === 12 || dayNum === 22);
      // Compute dateType locally if backend doesn't provide it (robust against old API)
      const todayStr = this.formatToLocalISO(new Date());
      const dateType = day.dateType || (day.date < todayStr ? 'PAST' : day.date === todayStr ? 'TODAY' : 'FUTURE');
      const isHoliday = !!this.holidays()[day.date];

      const updatedEmployees = day.employees.map(e => {
        let status = e.status;
        let detail = e.detail;

        // Ensure rest days display rest status on the client-side
        if (isRestDay) {
          status = 'LEAVE';
          detail = 'Weekend / Repos';
        }

        const isMatch = search ? (e.prenom + ' ' + e.name).toLowerCase().includes(search) : true;

        return {
          ...e,
          status,
          detail,
          isMatch
        };
      });

      // Apply reactive smart filters (Department & Status)
      const filteredEmployees = updatedEmployees.filter(e => {
        if (!e.isMatch) return false;
        
        if (this.selectedDepartment() && e.departementName !== this.selectedDepartment()) {
          return false;
        }
        
        if (this.selectedStatusFilter() && this.selectedStatusFilter() !== 'Tous') {
          const label = this.getStatusLabel(e.status);
          if (label !== this.selectedStatusFilter()) {
            return false;
          }
        }
        
        return true;
      });

      const totalEmp = filteredEmployees.length;
      let presents = 0;
      let remotes = 0;
      let scheduled = 0;
      let pending = 0;
      let leaves = 0;
      let absents = 0;

      filteredEmployees.forEach(e => {
        if (e.status === 'PRESENT') presents++;
        else if (e.status === 'REMOTE') remotes++;
        else if (e.status === 'SCHEDULED') scheduled++;
        else if (e.status === 'PENDING') pending++;
        else if (e.status === 'LEAVE') leaves++;
        else if (e.status === 'ABSENCE') absents++;
      });

      // Use backend presenceRate directly (unified formula: PRESENT + REMOTE + SCHEDULED / total)
      const presenceRate = day.presenceRate;

      // TODAY / FUTURE / HOLIDAY: pas d'alerte pour éviter faux positifs (donnée incomplète ou chômée)
      let aiWarning = null;
      if (!isRestDay && !isHoliday && dateType !== 'FUTURE' && dateType !== 'TODAY') {
        if (presenceRate < 0.6) {
          aiWarning = 'Couverture critique';
        } else if (presenceRate < 0.75) {
          aiWarning = 'Couverture faible';
        } else if (hasConflict) {
          aiWarning = 'Alerte conflit';
        }
      }

      return {
        ...day,
        dateType,
        isRestDay,
        employees: filteredEmployees,
        presenceRate,
        presentsCount: presents,
        remotesCount: remotes,
        scheduledCount: scheduled,
        pendingCount: pending,
        leavesCount: leaves,
        absentsCount: absents,
        conflictsCount: hasConflict ? 1 : 0,
        aiWarning,
        isHoliday: !!this.holidays()[day.date],
        holidayName: this.holidays()[day.date] || ''
      };
    });
  });

  weekDays = computed(() => {
    const current = new Date(this.currentDate());
    const dow = current.getDay();
    const diff = current.getDate() - dow + (dow === 0 ? -6 : 1);
    const startOfWeek = new Date(current);
    startOfWeek.setDate(diff);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      const dateStr = this.formatToLocalISO(date);
      const found = this.processedDays().find(d => d.date === dateStr);
      days.push({
        date: dateStr,
        label: new Intl.DateTimeFormat('fr-FR', { weekday: 'short' }).format(date),
        dayNum: date.getDate(),
        dayObj: found || { date: dateStr, employees: [], presenceRate: 0, presenceText: '-', isRestDay: date.getDay() === 0 || date.getDay() === 6, isHoliday: false, holidayName: '' }
      });
    }
    return days;
  });

  monthlyStats = computed(() => {
    const days = this.processedDays();
    if (days.length === 0) return null;
    const workingDays = days.filter(d => !d.isRestDay);
    if (workingDays.length === 0) return null;
    const avgPresence = workingDays.reduce((acc, d) => acc + d.presenceRate, 0) / workingDays.length;
    let totalAbsences = 0, totalRemote = 0, criticalDays = 0;
    workingDays.forEach(d => {
      d.employees.forEach(e => { if (e.status === 'ABSENCE' || e.status === 'LEAVE') totalAbsences++; if (e.status === 'REMOTE') totalRemote++; }); // SCHEDULED/PENDING ne sont pas des absences
      if (d.presenceRate < 0.5) criticalDays++;
    });
    return { avgPresence: Math.round(avgPresence * 100), totalAbsences, totalRemote, criticalDays };
  });

  // ── Computed: Inspector Panel — Day Employees (filtered) ──
  panelDayData = computed(() => {
    const date = this.panelSelectedDate();
    return this.processedDays().find(d => d.date === date) || null;
  });

  panelFilteredEmployees = computed(() => {
    const day = this.panelDayData();
    if (!day) return [];
    const search = this.panelSearchTerm().toLowerCase();
    const filter = this.panelStatusFilter();
    return day.employees.filter(e => {
      const matchesSearch = !search || (e.prenom + ' ' + e.name).toLowerCase().includes(search);
      const matchesFilter = filter === 'ALL' || e.status === filter;
      return matchesSearch && matchesFilter;
    });
  });

  panelTeamCoverage = computed(() => {
    const day = this.panelDayData();
    if (!day) return [];
    const teamMap = new Map<string, { total: number; present: number }>();
    day.employees.forEach(e => {
      const team = e.teamName || 'Non assigné';
      const entry = teamMap.get(team) || { total: 0, present: 0 };
      entry.total++;
      if (e.status === 'PRESENT' || e.status === 'REMOTE' || e.status === 'SCHEDULED') entry.present++;
      teamMap.set(team, entry);
    });
    return Array.from(teamMap.entries()).map(([name, data]) => ({
      name,
      total: data.total,
      present: data.present,
      rate: data.total > 0 ? Math.round((data.present / data.total) * 100) : 0
    }));
  });

  // Is panel open?
  isPanelOpen = computed(() => this.panelDepth() !== 'closed');

  // ── Lifecycle ──
  ngOnInit() { this.loadPlanning(); }

  loadPlanning() {
    const date = this.currentDate();
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    this.planningStore.loadPlanning(this.formatToLocalISO(firstDay), this.formatToLocalISO(lastDay), this.selectedTeam() || undefined).subscribe();
  }

  private formatToLocalISO(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // ── Calendar Navigation ──
  previousPeriod() {
    const d = new Date(this.currentDate());
    if (this.viewMode() === 'week' || this.viewMode() === 'day') d.setDate(d.getDate() - 7);
    else d.setMonth(d.getMonth() - 1);
    this.currentDate.set(d);
    this.loadPlanning();
  }

  nextPeriod() {
    const d = new Date(this.currentDate());
    if (this.viewMode() === 'week' || this.viewMode() === 'day') d.setDate(d.getDate() + 7);
    else d.setMonth(d.getMonth() + 1);
    this.currentDate.set(d);
    this.loadPlanning();
  }

  goToToday() { this.currentDate.set(new Date()); this.loadPlanning(); }

  currentMonthName() { return new Intl.DateTimeFormat('fr-FR', { month: 'long' }).format(this.currentDate()); }
  currentYear() { return this.currentDate().getFullYear(); }
  getDateNum(dateStr: string) { return new Date(dateStr).getDate(); }
  isToday(dateStr: string) { return dateStr === new Date().toISOString().split('T')[0]; }
  formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  formatDateShort(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  getInitials(prenom?: string, nom?: string) {
    return ((prenom?.charAt(0) || '') + (nom?.charAt(0) || '')).toUpperCase() || '?';
  }

  // ════════════════════════════════════════════════════════════
  // INSPECTOR PANEL — STATE MACHINE TRANSITIONS
  // ════════════════════════════════════════════════════════════

  /** Click a day cell → open Day Overview */
  openDay(day: PlanningResponseDTO) {
    this.panelSelectedDate.set(day.date);
    this.panelSelectedEmployee.set(null);
    this.panelStatusFilter.set('ALL');
    this.panelSearchTerm.set('');
    this.selection.set(new Set());
    this.panelDepth.set('day');
  }

  /** Click a day cell that's already open → close */
  toggleDay(day: PlanningResponseDTO) {
    if (this.panelDepth() !== 'closed' && this.panelSelectedDate() === day.date) {
      this.closePanel();
    } else {
      this.openDay(day);
    }
  }

  /** Click an employee card → open Employee Detail (in-place) */
  openEmployeeDetail(emp: EmployeeStatusDTO) {
    this.panelReturnScrollY.set(0); // would capture real scrollY in production with @ViewChild
    this.panelSelectedEmployee.set(emp);
    this.panelActiveTab.set('overview');
    this.panelDepth.set('employee');
    this.fetchEmployeeDetails(emp.id, this.panelSelectedDate());
  }

  /** Back from Employee Detail → Day Overview (restore scroll) */
  backToDay() {
    this.panelSelectedEmployee.set(null);
    this.panelDepth.set('day');
  }

  /** Open Notification Center */
  openNotificationCenter(recipients?: EmployeeStatusDTO[]) {
    if (recipients && recipients.length > 0) {
      this.notifRecipients.set(recipients);
    } else {
      // Use current selection
      const day = this.panelDayData();
      if (day) {
        const selected = day.employees.filter(e => this.selection().has(e.id));
        this.notifRecipients.set(selected.length > 0 ? selected : []);
      }
    }
    this.notifMessage.set('Bonjour {{prenom}}, merci de confirmer votre statut pour aujourd\'hui. Cordialement, votre service RH.');
    this.notifTemplate.set('rappel_pointage');
    this.notifProgress.set(0);
    this.notifDeliveryStatus.set({ delivered: [], pending: [], failed: [] });
    this.panelDepth.set('notification');
  }

  /** Back from Notification Center → previous state */
  backFromNotification() {
    if (this.panelSelectedEmployee()) {
      this.panelDepth.set('employee');
    } else {
      this.panelDepth.set('day');
    }
  }

  /** Send notification (simulated async) */
  sendNotification() {
    this.panelDepth.set('sending');
    this.notifProgress.set(0);

    const recipients = this.notifRecipients();
    const total = recipients.length;
    let delivered = 0;

    const interval = setInterval(() => {
      delivered++;
      this.notifProgress.set(Math.round((delivered / total) * 100));

      if (delivered >= total) {
        clearInterval(interval);
        // Simulate one failure for demo
        const failed = total > 2 ? [{ name: recipients[total - 1].prenom + ' ' + recipients[total - 1].name, reason: 'Adresse email invalide' }] : [];
        const deliveredNames = recipients.slice(0, total - (failed.length > 0 ? 1 : 0)).map(r => r.prenom + ' ' + r.name);
        this.notifDeliveryStatus.set({ delivered: deliveredNames, pending: [], failed });
        this.panelDepth.set('sent');
        this.toast.success(`${deliveredNames.length} notification(s) envoyée(s)`);
      }
    }, 400);
  }

  /** Retry failed notifications */
  retryFailed() {
    const failed = this.notifDeliveryStatus().failed;
    if (failed.length === 0) return;
    this.notifDeliveryStatus.update(s => ({
      ...s,
      delivered: [...s.delivered, ...s.failed.map(f => f.name)],
      failed: []
    }));
    this.toast.success('Réessai réussi');
  }

  /** Close panel entirely */
  closePanel() {
    this.panelDepth.set('closed');
    this.panelSelectedEmployee.set(null);
    this.selection.set(new Set());
  }

  /** Keyboard: Escape closes panel */
  @HostListener('document:keydown.escape')
  onEscapeKey() {
    if (this.panelDepth() !== 'closed') {
      this.closePanel();
    }
  }

  // ════════════════════════════════════════════════════════════
  // SELECTION MODEL
  // ════════════════════════════════════════════════════════════

  toggleSelection(id: number) {
    const current = new Set(this.selection());
    current.has(id) ? current.delete(id) : current.add(id);
    this.selection.set(current);
  }

  isSelected(id: number): boolean {
    return this.selection().has(id);
  }

  selectAllVisible() {
    const emps = this.panelFilteredEmployees();
    const allSelected = emps.every(e => this.selection().has(e.id));
    if (allSelected) {
      this.selection.set(new Set());
    } else {
      this.selection.set(new Set(emps.map(e => e.id)));
    }
  }

  selectByStatus(status: string) {
    const day = this.panelDayData();
    if (!day) return;
    const matching = day.employees.filter(e => e.status === status);
    this.selection.set(new Set(matching.map(e => e.id)));
    this.toast.info(`${matching.length} collaborateur(s) sélectionné(s)`);
  }

  allVisibleSelected(): boolean {
    const emps = this.panelFilteredEmployees();
    return emps.length > 0 && emps.every(e => this.selection().has(e.id));
  }

  // ════════════════════════════════════════════════════════════
  // EMPLOYEE DETAIL HELPERS
  // ════════════════════════════════════════════════════════════

  fetchEmployeeDetails(userId: number, date: string) {
    this.detailLoading.set(true);
    this.detailedStatus.set(null);
    this.planningService.isExcused(userId, date).pipe(
      finalize(() => this.detailLoading.set(false))
    ).subscribe({
      next: () => {
        this.detailedStatus.set({
          arrivalTime: '08:45', departureTime: '17:30', totalMinutes: 480,
          overtimeMinutes: 15, lastActivity: 'Pointage Mobile'
        });
      }
    });
  }

  // Mock recent requests for employee detail
  getEmployeeRequests(empId: number) {
    return [
      { type: 'Congé', range: '14–16 juil.', status: 'En attente' },
      { type: 'Télétravail', range: '10 juil.', status: 'Approuvé' }
    ];
  }

  // Mock notes for employee detail
  getEmployeeNotes(empId: number) {
    return [
      { author: 'Sarah B.', text: 'Retard récurrent signalé en mai', date: '28 mai 2026' }
    ];
  }

  // ════════════════════════════════════════════════════════════
  // UTILITY / STATUS HELPERS
  // ════════════════════════════════════════════════════════════

  getStatusIcon(status: string | undefined): string {
    switch (status) {
      case 'PRESENT': return 'check-circle'; case 'REMOTE': return 'home';
      case 'SCHEDULED': return 'calendar'; case 'PENDING': return 'clock';
      case 'ABSENCE': return 'alert-circle'; case 'LEAVE': return 'calendar';
      default: return 'help-circle';
    }
  }

  getStatusLabel(status: string | undefined): string {
    switch (status) {
      case 'PRESENT': return 'Présent'; case 'REMOTE': return 'Télétravail';
      case 'SCHEDULED': return 'Planifié'; case 'PENDING': return 'En attente';
      case 'ABSENCE': return 'Absence'; case 'LEAVE': return 'Congé';
      default: return 'Non défini';
    }
  }

  getStatusColor(status: string | undefined): string {
    switch (status) {
      case 'PRESENT': return '#10b981'; case 'REMOTE': return '#8b5cf6';
      case 'SCHEDULED': return '#94a3b8'; case 'PENDING': return '#60a5fa';
      case 'ABSENCE': return '#ef4444'; case 'LEAVE': return '#3b82f6';
      default: return '#94a3b8';
    }
  }

  getHeatmapColorSolid(rate: number, dateType?: string): string {
    if (dateType === 'FUTURE') return '#94a3b8';
    if (dateType === 'TODAY') return rate < 1.0 ? '#60a5fa' : '#10b981';
    if (rate < 0.4) return '#ef4444'; if (rate < 0.7) return '#f59e0b'; return '#10b981';
  }

  getHeatmapColorBg(rate: number, dateType?: string): string {
    if (dateType === 'FUTURE') return 'rgba(148,163,184,0.08)';
    if (dateType === 'TODAY') return rate < 1.0 ? 'rgba(96,165,250,0.08)' : 'rgba(16,185,129,0.08)';
    if (rate < 0.4) return 'rgba(239,68,68,0.08)'; if (rate < 0.7) return 'rgba(245,158,11,0.08)'; return 'rgba(16,185,129,0.08)';
  }

  getEmployeeStatusOnDay(employeeId: number, dayDate: string): string {
    const day = this.processedDays().find(d => d.date === dayDate);
    if (!day) return 'UNKNOWN';
    const emp = day.employees.find(e => e.id === employeeId);
    return emp ? emp.status : 'UNKNOWN';
  }

  getEmployeeCapacity(empId: number) {
    const hash = empId % 3;
    if (hash === 0) return { workload: 92, status: 'Surchargé', color: '#EF4444', remaining: '-8%' };
    if (hash === 1) return { workload: 76, status: 'Optimal', color: '#10B981', remaining: '24%' };
    return { workload: 45, status: 'Sous-chargé', color: '#3B82F6', remaining: '55%' };
  }

  // ════════════════════════════════════════════════════════════
  // ACTIONS
  // ════════════════════════════════════════════════════════════

  exportCsv() {
    const data = this.calendarDays();
    if (!data || data.length === 0) {
      this.toast.error("Aucune donnée à exporter");
      return;
    }

    // Header row with UTF-8 BOM for Excel compatibility
    let csvContent = "\ufeffDate,Nom,Prénom,Email,Poste,Équipe,Statut\n";

    // Determine if we should only export selected employees
    const selectedIds = this.selection();

    data.forEach(day => {
      day.employees.forEach(emp => {
        // If selection is not empty, only export selected employees
        if (selectedIds.size > 0 && !selectedIds.has(emp.id)) {
          return;
        }

        const row = [
          day.date,
          `"${(emp.name || '').replace(/"/g, '""')}"`,
          `"${(emp.prenom || '').replace(/"/g, '""')}"`,
          `"${(emp.email || '').replace(/"/g, '""')}"`,
          `"${(emp.poste || '').replace(/"/g, '""')}"`,
          `"${(emp.teamName || '').replace(/"/g, '""')}"`,
          emp.status || ''
        ].join(",");
        csvContent += row + "\n";
      });
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);

    const date = this.currentDate();
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const teamLabel = this.selectedTeam() ? `equipe-${this.selectedTeam()}` : 'toutes-equipes';
    link.setAttribute("download", `planning-${monthKey}-${teamLabel}.csv`);

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    this.toast.success("Export CSV complété");
  }

  onSearch(event: Event) { this.searchTerm.set((event.target as HTMLInputElement).value); }
  onPanelSearch(event: Event) { this.panelSearchTerm.set((event.target as HTMLInputElement).value); }

  applyAIRecommendations() {
    this.aiRecommendations.update(recs => recs.map(r => ({ ...r, applied: true })));
    this.conflicts.set([]);
    this.toast.success('Recommandations IA appliquées ✨');
  }

  applySingleRecommendation(recId: number) {
    this.aiRecommendations.update(recs => recs.map(r => r.id === recId ? { ...r, applied: true } : r));
    this.toast.success('Recommandation appliquée');
  }

  dismissRecommendation(recId: number) {
    this.aiRecommendations.update(recs => recs.filter(r => r.id !== recId));
  }

  resolveConflict(conflictId: number) {
    this.conflicts.update(c => c.filter(item => item.id !== conflictId));
    this.toast.success('Conflit résolu');
  }

  applySavedView(view: string) {
    this.activeSavedView.set(view);
    this.toast.info(`Vue "${view}" chargée`);
  }

  toggleNotifChannel(channel: string) {
    this.notifChannels.update(c => ({ ...c, [channel]: !c[channel] }));
  }

  getActiveChannels(): string[] {
    return Object.entries(this.notifChannels()).filter(([, v]) => v).map(([k]) => k);
  }

  /** Notification interpolation preview */
  getNotifPreview(): string {
    const firstRecipient = this.notifRecipients()[0];
    if (!firstRecipient) return this.notifMessage();
    return this.notifMessage().replace('{{prenom}}', firstRecipient.prenom).replace('{{nom}}', firstRecipient.name);
  }

  /** Toggle legend filter — clicking the same item again deactivates the filter */
  toggleLegendFilter(status: string) {
    if (this.selectedStatusFilter() === status) {
      this.selectedStatusFilter.set(null);
    } else {
      this.selectedStatusFilter.set(status);
    }
  }
}
