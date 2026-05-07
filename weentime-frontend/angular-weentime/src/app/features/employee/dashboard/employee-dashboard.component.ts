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
  ClockIcon
} from 'lucide-angular';
import { DashboardService, DashboardStats } from './dashboard.service';

interface KpiCard {
  id: string;
  label: string;
  value: string;
  icon: any;
  trend: string;
  trendUp: boolean;
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
    clockIcon: ClockIcon
  };

  /* ── state ──────────────────────────────────────────── */
  readonly loading = signal(true);
  readonly refreshing = signal(false);
  readonly now = signal(new Date());
  readonly firstName = signal('Collaborateur');
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
  readonly attendanceRate = signal<number>(100);

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

  readonly hoursTodayLabel = computed(() => {
    const active = this._sessionActive();
    if (active) {
      return this.sessionTime();
    }
    const hoursKpi = this._kpis().find((k: any) => k.label.includes('Heures')); // <-- FIXED: Added explicit type (k: any)
    return hoursKpi ? hoursKpi.value : '00h 00m';
  });

  readonly leaveBalanceLabel = computed(() => {
    const balanceKpi = this._kpis().find((k: any) => k.label.toLowerCase().includes('conge') || k.label.toLowerCase().includes('congé')); // <-- FIXED: Added explicit type (k: any)
    return balanceKpi ? balanceKpi.value.replace('j', '') : '15.5';
  });

  readonly leaveProgress = computed(() => {
    const bal = parseFloat(this.leaveBalanceLabel());
    const pct = isNaN(bal) ? 62 : Math.min(Math.round((bal / 25) * 100), 100);
    return pct;
  });

  readonly leaveStrokeOffset = computed(() => {
    const pct = this.leaveProgress();
    return 377 - (377 * pct) / 100;
  });

  readonly attendanceRateLabel = computed(() => {
    return `${this.attendanceRate()}%`;
  });

  readonly kpiCards = computed<KpiCard[]>(() => {
    const raw = this._kpis();
    const gradients: Record<string, string> = {
      '#0ea5e9': 'linear-gradient(135deg, #0ea5e9, #06b6d4)',
      '#6366f1': 'linear-gradient(135deg, #6366f1, #8b5cf6)',
      '#f59e0b': 'linear-gradient(135deg, #f59e0b, #f97316)',
      '#10b981': 'linear-gradient(135deg, #10b981, #14b8a6)',
      '#ec4899': 'linear-gradient(135deg, #ec4899, #f43f5e)',
      '#8b5cf6': 'linear-gradient(135deg, #8b5cf6, #a855f7)',
    };

    return raw.map((kpi: any, index: number) => ({ // <-- FIXED: Explicit typed parameters
      id: `kpi-${index}`,
      label: kpi.label,
      value: kpi.value,
      icon: this.mapIcon(kpi.icon),
      trend: kpi.trend,
      trendUp: kpi.trendUp,
      color: kpi.color,
      gradient: gradients[kpi.color] || gradients['#6366f1']
    }));
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

        const attendanceKpi = data.kpis?.find((k: any) => k.label.toLowerCase().includes('présence') || k.label.toLowerCase().includes('presence'));
        if (attendanceKpi) {
          const rate = parseInt(attendanceKpi.value.replace('%', ''), 10);
          this.attendanceRate.set(isNaN(rate) ? 100 : rate);
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
    try {
      const raw = localStorage.getItem('auth_user') ?? localStorage.getItem('user');
      if (raw) {
        const u = JSON.parse(raw);
        this.firstName.set(u?.prenom ?? u?.firstName ?? u?.name?.split(' ')[0] ?? 'Collaborateur');
      }
    } catch {
      /* ignore */
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
