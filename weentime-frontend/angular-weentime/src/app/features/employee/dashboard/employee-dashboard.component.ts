import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  OnDestroy,
  computed,
  inject,
  signal
} from '@angular/core'; // <-- FIXED: Core features must be imported from @angular/core
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { interval, Subscription } from 'rxjs';
import {
  LucideAngularModule,
  RefreshCw,
  Calendar,
  Clock,
  Play,
  Pause,
  Timer,
  TrendingUp,
  TrendingDown,
  Users,
  FileText,
  Activity,
  Home,
  Plane,
  FileCheck,
  Bell,
  Zap,
  Coffee,
  Sun,
  Moon,
  ChevronRight,
  MapPin,
  Sparkles,
  Trophy,
  Target,
  Heart,
  Star,
  Briefcase,
  CalendarDays,
  CircleDot,
  CheckCircle2,
  XCircle,
  Smile,
  ShieldCheck,
  Gauge,
  Brain,
  ClockIcon
} from 'lucide-angular';
import { DashboardService, DashboardStats } from './dashboard.service';
import { AuthService } from '../../../core/services/auth.service';

interface KpiCard {
  id: string;
  label: string;
  value: string;
  subValue?: string;       // e.g. "/8h" or "jours"
  icon: any;
  trend: string;           // e.g. "+12 min" or "-2 jours"
  trendUp: boolean;
  trendNeutral?: boolean;  // for "= Stable"
  comparison?: string;     // e.g. "vs hier" or "depuis la semaine dernière"
  sparkline: number[];     // 7 data points for mini chart
  color: string;
  gradient: string;
}

interface ActivityItem {
  id: string;
  initials: string;
  color: string;
  description: string;
  date: string;
  icon: any;
}

interface QuickAction {
  id: string;
  label: string;
  sub: string;
  route: string;
  icon: any;
  gradient: string;
}

export type EmployeeTimePeriod = 'today' | 'week' | 'month' | 'year';

@Component({
  selector: 'app-employee-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule],
  templateUrl: './employee-dashboard.component.html',
  styleUrl: './employee-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EmployeeDashboardComponent implements OnInit, OnDestroy {
  private readonly dashboardService = inject(DashboardService);
  private readonly authService = inject(AuthService);

  /* ── icons ─────────────────────────────────────────── */
  protected readonly ic = {
    refresh: RefreshCw,
    calendar: Calendar,
    clock: Clock,
    play: Play,
    pause: Pause,
    timer: Timer,
    trendUp: TrendingUp,
    trendDown: TrendingDown,
    users: Users,
    file: FileText,
    activity: Activity,
    home: Home,
    plane: Plane,
    fileCheck: FileCheck,
    bell: Bell,
    zap: Zap,
    coffee: Coffee,
    sun: Sun,
    moon: Moon,
    chevron: ChevronRight,
    pin: MapPin,
    sparkles: Sparkles,
    trophy: Trophy,
    target: Target,
    heart: Heart,
    star: Star,
    briefcase: Briefcase,
    calendarDays: CalendarDays,
    dot: CircleDot,
    check: CheckCircle2,
    x: XCircle,
    clockIcon: ClockIcon,
    smile: Smile,
    shield: ShieldCheck,
    gauge: Gauge,
    brain: Brain
  };

  /* ── state ──────────────────────────────────────────── */
  readonly loading = signal(true);
  readonly refreshing = signal(false);
  readonly now = signal(new Date());
  readonly firstName = signal('Collaborateur');
  readonly selectedPeriod = signal<EmployeeTimePeriod>('month');

  readonly skeletons = Array.from({ length: 4 }, (_, i) => i);

  private clockSub?: Subscription;
  private timerSub?: Subscription;

  /* ── raw data signals ────────────────────────────────── */
  private readonly _kpis = signal<any[]>([]);
  private readonly _activities = signal<any[]>([]);
  readonly _sessionActive = signal(false);
  private readonly _sessionStart = signal<Date | null>(null);
  readonly sessionDuration = signal(0); // in seconds

  /* ── template bind properties ────────────────────────── */
  readonly warningMessage = signal<string | null>(null);
  readonly quickDescription = signal<string>('Planifiez vos congés, déclarez vos heures ou planifiez votre télétravail.');

  readonly pendingRequests = signal<number>(2);
  readonly approvedRequests = signal<number>(8);
  readonly rejectedRequests = signal<number>(0);
  readonly attendanceRate = signal<number>(98);

  /* ── computed getters ────────────────────────────────── */
  readonly sessionActive = computed(() => this._sessionActive());

  readonly greeting = computed(() => {
    const h = this.now().getHours();
    if (h < 12) return 'Bonjour';
    if (h < 18) return 'Bon après-midi';
    return 'Bonsoir';
  });

  readonly greetingIcon = computed(() => {
    const h = this.now().getHours();
    if (h < 12) return this.ic.sun;
    if (h < 18) return this.ic.coffee;
    return this.ic.moon;
  });

  readonly dateLabel = computed(() =>
    this.now().toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  );

  readonly timeLabel = computed(() =>
    this.now().toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    })
  );

  readonly sessionTime = computed(() => {
    const s = this.sessionDuration();
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  });

  /* Personal Work-Life Balance Score (0 - 100) */
  readonly personalBalanceScore = computed(() => {
    const attRate = this.attendanceRate();
    const bal = parseFloat(this.leaveBalanceLabel());
    const score = Math.round(attRate * 0.6 + Math.min(bal, 25) * 1.6);
    return Math.min(100, Math.max(0, score));
  });

  /* Météo RH & Climat de Travail (IA) */
  readonly meteoRh = computed(() => {
    const score = this.personalBalanceScore();
    const attRate = this.attendanceRate();
    const bal = parseFloat(this.leaveBalanceLabel());

    let wellbeingLabel = '😊 Excellent';
    let wellbeingStatus = 'Énergie & Sérénité optimales';
    let wellbeingColor = '#10b981';

    let stressLabel = 'Faible';
    let stressLevel = 15;
    let stressColor = '#10b981';

    let workloadLabel = 'Normale';
    let workloadHours = '38h / semaine';
    let workloadColor = '#6366f1';

    if (score < 60) {
      wellbeingLabel = '😐 Moyen';
      wellbeingStatus = 'Légère fatigue constatée';
      wellbeingColor = '#f59e0b';
      stressLabel = 'Modéré';
      stressLevel = 45;
      stressColor = '#f59e0b';
    } else if (score < 40) {
      wellbeingLabel = '⚠️ À surveiller';
      wellbeingStatus = 'Risque de surmenage';
      wellbeingColor = '#ef4444';
      stressLabel = 'Élevé';
      stressLevel = 75;
      stressColor = '#ef4444';
      workloadLabel = 'Surchargé';
      workloadHours = '> 45h / semaine';
      workloadColor = '#ef4444';
    }

    const aiRecommendation = attRate >= 95 && bal > 10
      ? `Analyse IA : Votre régularité de présence (${attRate}%) et votre solde de congés (${bal.toFixed(1)}j) indiquent un équilibre de travail très sain. Aucun risque de surmenage détecté.`
      : `Analyse IA : Pensez à planifier une journée de repos prochainement pour maintenir votre niveau d'énergie.`;

    return {
      wellbeing: { label: wellbeingLabel, status: wellbeingStatus, color: wellbeingColor },
      stress: { label: stressLabel, level: stressLevel, color: stressColor },
      workload: { label: workloadLabel, hours: workloadHours, color: workloadColor },
      aiRecommendation
    };
  });

  readonly hoursTodayLabel = computed(() => {
    const active = this._sessionActive();
    if (active) {
      return this.sessionTime();
    }
    const hoursKpi = this._kpis().find((k: any) => k.label.includes('Heures'));
    return hoursKpi ? hoursKpi.value : '00h 00m';
  });

  readonly leaveBalanceLabel = computed(() => {
    const balanceKpi = this._kpis().find((k: any) => k.label.toLowerCase().includes('conge') || k.label.toLowerCase().includes('congé'));
    return balanceKpi ? balanceKpi.value.replace('j', '') : '18.5';
  });

  readonly leaveProgress = computed(() => {
    const bal = parseFloat(this.leaveBalanceLabel());
    const pct = isNaN(bal) ? 74 : Math.min(Math.round((bal / 25) * 100), 100);
    return pct;
  });

  readonly leaveStrokeOffset = computed(() => {
    const pct = this.leaveProgress();
    return 377 - (377 * pct) / 100;
  });

  readonly attendanceRateLabel = computed(() => {
    return `${this.attendanceRate()}%`;
  });

  setPeriod(period: EmployeeTimePeriod): void {
    this.selectedPeriod.set(period);
  }

  readonly kpiCards = computed<KpiCard[]>(() => {
    const raw = this._kpis();
    const gradients: Record<string, string> = {
      cyan: 'linear-gradient(135deg, #0ea5e9, #06b6d4)',
      indigo: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
      amber: 'linear-gradient(135deg, #f59e0b, #f97316)',
      emerald: 'linear-gradient(135deg, #10b981, #14b8a6)',
      purple: 'linear-gradient(135deg, #8b5cf6, #a855f7)',
    };

    // Extract real values from backend KPIs
    const hoursKpi = raw.find((k: any) => k.label?.includes('Heures'));
    const leaveKpi = raw.find((k: any) => k.label?.toLowerCase().includes('cong'));
    const authKpi = raw.find((k: any) => k.label?.toLowerCase().includes('autoris'));
    const presenceKpi = raw.find((k: any) => k.label?.toLowerCase().includes('présence') || k.label?.toLowerCase().includes('presence'));

    // Parse hours from backend (returns format like "07h 42m" or minutes as number)
    const rawHoursValue = hoursKpi?.value || '00h 00m';
    const hoursMatch = rawHoursValue.match(/(\d+)h\s*(\d+)/);
    const totalMinutes = hoursMatch ? (parseInt(hoursMatch[1], 10) * 60 + parseInt(hoursMatch[2], 10)) : 0;
    const displayHours = hoursMatch ? `${hoursMatch[1]}h${hoursMatch[2]}` : rawHoursValue;
    const hoursPercent = totalMinutes > 0 ? Math.round((totalMinutes / 480) * 100) : 0; // 480 = 8h

    // Parse leave balance
    const leaveVal = leaveKpi?.value || this.leaveBalanceLabel() + 'j';
    const leaveNum = parseFloat(leaveVal.replace(/[^\d.]/g, '')) || 0;

    // Parse presence
    const presenceVal = presenceKpi?.value || `${this.attendanceRate()}%`;
    const presenceNum = parseInt(presenceVal.replace('%', ''), 10) || this.attendanceRate();

    // Parse authorizations
    const authTotal = authKpi ? parseInt(authKpi.value, 10) || 0 : 0;
    const authPendingMatch = authKpi?.trend?.match(/(\d+)\s*en attente/);
    const authPending = authPendingMatch ? parseInt(authPendingMatch[1], 10) : 0;

    return [
      {
        id: 'kpi-hours',
        label: 'Temps travaillé',
        value: displayHours,
        subValue: '/8h',
        icon: this.ic.timer,
        trend: hoursPercent >= 100 ? '= Objectif atteint' : `${hoursPercent}%`,
        trendUp: hoursPercent >= 95,
        trendNeutral: hoursPercent >= 90 && hoursPercent < 100,
        comparison: hoursKpi?.trend?.includes('Session en cours') ? '🟢 Session en cours' : 'vs objectif journalier',
        sparkline: [65, 78, 92, 88, 95, 100, hoursPercent],
        color: '#0ea5e9',
        gradient: gradients['cyan']
      },
      {
        id: 'kpi-leave',
        label: 'Solde congés',
        value: `${leaveNum.toFixed(1)}`,
        subValue: 'jours',
        icon: this.ic.calendarDays,
        trend: leaveNum > 15 ? '= Stable' : leaveNum > 5 ? '↓ À surveiller' : '↓ Critique',
        trendUp: leaveNum > 15,
        trendNeutral: leaveNum > 5 && leaveNum <= 15,
        comparison: 'sur 25 jours annuels',
        sparkline: [25, 24, 22, 20, 18, 16, leaveNum],
        color: '#6366f1',
        gradient: gradients['indigo']
      },
      {
        id: 'kpi-presence',
        label: 'Taux de présence',
        value: `${presenceNum}`,
        subValue: '%',
        icon: this.ic.activity,
        trend: presenceNum >= 95 ? '↑ Excellent' : presenceNum >= 80 ? '= Correct' : '↓ À améliorer',
        trendUp: presenceNum >= 95,
        trendNeutral: presenceNum >= 80 && presenceNum < 95,
        comparison: 'ce mois',
        sparkline: [88, 92, 90, 95, 93, 96, presenceNum],
        color: '#10b981',
        gradient: gradients['emerald']
      },
      {
        id: 'kpi-auth',
        label: 'Demandes',
        value: `${authTotal}`,
        subValue: authPending > 0 ? `(${authPending} en attente)` : 'traitées',
        icon: this.ic.fileCheck,
        trend: authPending === 0 ? '= Tout validé' : `${authPending} en attente`,
        trendUp: authPending === 0,
        trendNeutral: false,
        comparison: authPending > 0 ? 'à traiter' : 'aucune action requise',
        sparkline: [2, 3, 1, 4, 2, 1, authTotal],
        color: '#f59e0b',
        gradient: gradients['amber']
      }
    ];
  });

  readonly activityItems = computed<ActivityItem[]>(() => {
    const raw = this._activities();
    return raw.map((act: any, index: number) => ({ // <-- FIXED: Explicit typed parameters
      id: `activity-${index}`,
      initials: act.initials,
      color: act.color,
      description: act.description,
      date: act.date,
      icon: this.mapActivityIcon(act.initials)
    }));
  });

  readonly quickActions: QuickAction[] = [
    {
      id: 'qa-leave',
      label: 'Poser un congé',
      sub: 'Planifier vos absences',
      route: '/app/employee/conges',
      icon: this.ic.plane,
      gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6)'
    },
    {
      id: 'qa-telework',
      label: 'Télétravail',
      sub: 'Demander un télétravail',
      route: '/app/employee/teletravail',
      icon: this.ic.home,
      gradient: 'linear-gradient(135deg, #0ea5e9, #06b6d4)'
    },
    {
      id: 'qa-authorization',
      label: 'Autorisation',
      sub: 'Demande ponctuelle',
      route: '/app/employee/autorisations',
      icon: this.ic.fileCheck,
      gradient: 'linear-gradient(135deg, #f59e0b, #f97316)'
    },
    {
      id: 'qa-documents',
      label: 'Documents',
      sub: 'Attestations & certificats',
      route: '/app/employee/documents',
      icon: this.ic.file,
      gradient: 'linear-gradient(135deg, #10b981, #14b8a6)'
    },
    {
      id: 'qa-presence',
      label: 'Historique',
      sub: 'Consulter mes pointages',
      route: '/app/employee/presence',
      icon: this.ic.clock,
      gradient: 'linear-gradient(135deg, #ec4899, #f43f5e)'
    },
    {
      id: 'qa-profile',
      label: 'Mon profil',
      sub: 'Informations personnelles',
      route: '/app/employee/profil',
      icon: this.ic.users,
      gradient: 'linear-gradient(135deg, #8b5cf6, #a855f7)'
    },
  ];

  readonly motivationalQuote = computed(() => {
    const quotes = [
      { text: 'Chaque jour est une nouvelle opportunité', icon: this.ic.sparkles },
      { text: 'Le succès est la somme de petits efforts répétés', icon: this.ic.trophy },
      { text: 'Restez concentré et tout devient possible', icon: this.ic.target },
      { text: 'Votre meilleur travail vous attend', icon: this.ic.star },
      { text: 'Excellence et persévérance font la différence', icon: this.ic.heart },
    ];
    const dayOfYear = Math.floor((this.now().getTime() - new Date(this.now().getFullYear(), 0, 0).getTime()) / 86400000);
    return quotes[dayOfYear % quotes.length];
  });

  /* ── lifecycle ──────────────────────────────────────── */
  ngOnInit(): void {
    this.loadFirstName();
    this.loadDashboard();
    this.clockSub = interval(1000).subscribe(() => this.now.set(new Date()));
  }

  ngOnDestroy(): void {
    this.clockSub?.unsubscribe();
    this.timerSub?.unsubscribe();
  }

  /* ── data loading ───────────────────────────────────── */
  loadDashboard(): void {
    const isRefresh = !this.loading();
    if (isRefresh) this.refreshing.set(true);
    else this.loading.set(true);

    this.dashboardService.getEmployeeDashboardStats().subscribe({
      next: (data: DashboardStats) => {
        this._kpis.set(data.kpis || []);
        this._activities.set(data.activities || []);
        this.warningMessage.set(data.warningMessage || null);
        this.quickDescription.set(data.quickActionDescription || 'Planifiez vos congés, déclarez vos heures ou planifiez votre télétravail.');

        // Extract attendance rate from real KPIs
        const attendanceKpi = data.kpis?.find((k: any) => k.label.toLowerCase().includes('présence') || k.label.toLowerCase().includes('presence'));
        if (attendanceKpi) {
          const rate = parseInt(attendanceKpi.value.replace('%', ''), 10);
          this.attendanceRate.set(isNaN(rate) ? 98 : rate);
        }

        // Extract request counts from authorization KPI
        const authKpi = data.kpis?.find((k: any) => k.label.toLowerCase().includes('autoris'));
        if (authKpi) {
          const total = parseInt(authKpi.value, 10) || 0;
          const pendingMatch = authKpi.trend?.match(/(\d+)\s*en attente/);
          const pending = pendingMatch ? parseInt(pendingMatch[1], 10) : 0;
          this.pendingRequests.set(pending);
          this.approvedRequests.set(Math.max(0, total - pending));
          this.rejectedRequests.set(0);
        }

        this.detectActiveSession(data);
        this.loading.set(false);
        this.refreshing.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.refreshing.set(false);
      }
    });
  }

  private detectActiveSession(data: DashboardStats): void {
    const hasSession = data.kpis?.some((kpi) =>
      kpi.trend?.toLowerCase().includes('session en cours')
    );

    this._sessionActive.set(!!hasSession);

    if (hasSession) {
      this._sessionStart.set(new Date());
      this.startTimer();
    } else {
      this.stopTimer();
    }
  }

  private startTimer(): void {
    this.timerSub?.unsubscribe();
    this.timerSub = interval(1000).subscribe(() => {
      this.sessionDuration.update((v: number) => v + 1); // <-- FIXED: Added explicit type (v: number)
    });
  }

  private stopTimer(): void {
    this.timerSub?.unsubscribe();
    this.sessionDuration.set(0);
  }

  toggleSession(): void {
    this._sessionActive.update((v: boolean) => !v); // <-- FIXED: Added explicit type (v: boolean)
    if (this._sessionActive()) {
      this._sessionStart.set(new Date());
      this.startTimer();
    } else {
      this.stopTimer();
    }
  }

  /* ── helpers ────────────────────────────────────────── */
  private loadFirstName(): void {
    const user = this.authService.currentUser();
    if (user?.prenom) {
      this.firstName.set(user.prenom);
    }
  }

  private mapIcon(name: string): any {
    const map: Record<string, any> = {
      timer: this.ic.timer,
      'calendar-days': this.ic.calendarDays,
      'file-text': this.ic.file,
      activity: this.ic.activity,
      clock: this.ic.clock,
      briefcase: this.ic.briefcase,
    };
    return map[name] || this.ic.zap;
  }

  private mapActivityIcon(initials: string): any {
    const map: Record<string, any> = {
      CG: this.ic.plane,
      TT: this.ic.home,
      PR: this.ic.dot,
      AU: this.ic.fileCheck,
      WT: this.ic.bell,
    };
    return map[initials] || this.ic.bell;
  }

  trackById(_: number, item: any): any {
    return item?.id ?? _;
  }
}
