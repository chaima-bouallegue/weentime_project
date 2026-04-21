import {
  ChangeDetectionStrategy, Component, DestroyRef,
  computed, inject, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  LucideAngularModule,
  // ── icônes utilisées dans le template ──────────────────────────────────────
  User,           // db-role-badge
  TriangleAlert,  // warning banner
  Timer,          // KPI heures aujourd'hui
  CalendarDays,   // KPI solde congés
  FileText,       // KPI autorisations
  Activity,       // KPI taux de présence  +  activity feed header
  TrendingUp,     // kpi trend up
  TrendingDown,   // kpi trend down
  ArrowRight,     // liens "Tout voir" et bouton QA
  Bell,           // empty state activity
  CalendarPlus,   // quick-action card   ← était manquant
  // icônes manager (dashboard service les passe dynamiquement via kpi.icon)
  FileCheck,
  Users,
  CheckCircle,
  // icônes RH
  BarChart2,
  ChevronDown,    // ← était manquant (utilisé dans d'autres vues via le même module)
} from 'lucide-angular';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import {
  DashboardActivity, DashboardKpi,
  DashboardService, DashboardStats
} from './dashboard.service';

@Component({
  selector: 'app-employee-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="db-root">

      <!-- ── Header ── -->
      <div class="db-header">
        <div class="db-header-text">
          <p class="db-label">Tableau de bord</p>
          <h1 class="db-title">Bonjour, <span class="db-name">{{ firstName() }}</span> 👋</h1>
          <p class="db-date">{{ todayFormatted }}</p>
        </div>
        <!-- ✅ lucide-angular [img] au lieu de lucide-icon name="..." -->
        <span class="db-role-badge">
          <lucide-angular [img]="iconUser" size="13"></lucide-angular>
          Collaborateur
        </span>
      </div>

      <!-- ── Warning ── -->
      @if (warningMessage()) {
        <div class="db-warning">
          <lucide-angular [img]="iconTriangleAlert" size="16"></lucide-angular>
          <span>{{ warningMessage() }}</span>
        </div>
      }

      <!-- ── KPI Grid ── -->
      <div class="kpi-grid">
        @if (isLoading()) {
          @for (item of [1,2,3,4]; track item) {
            <div class="kpi-card kpi-skeleton">
              <div class="sk-icon"></div>
              <div class="sk-lines">
                <div class="sk sk-val"></div>
                <div class="sk sk-lbl"></div>
              </div>
            </div>
          }
        } @else {
          @for (kpi of kpis(); track kpi.label) {
            <div class="kpi-card" [style.--accent]="kpi.color">
              <div class="kpi-icon-wrap">
                <!-- ✅ résolution dynamique de l'icône depuis le registre -->
                <lucide-angular [img]="resolveIcon(kpi.icon)" size="20"></lucide-angular>
              </div>
              <div class="kpi-body">
                <span class="kpi-value">{{ kpi.value }}</span>
                <span class="kpi-label">{{ kpi.label }}</span>
              </div>
              <div class="kpi-trend" [class.trend-up]="kpi.trendUp" [class.trend-down]="!kpi.trendUp">
                <lucide-angular [img]="kpi.trendUp ? iconTrendingUp : iconTrendingDown" size="12"></lucide-angular>
                <span>{{ kpi.trend }}</span>
              </div>
              <div class="kpi-bar"></div>
            </div>
          }
        }
      </div>

      <!-- ── Bottom Grid ── -->
      <div class="db-grid">

        <!-- Activity Feed -->
        <div class="db-card">
          <div class="db-card-header">
            <div class="db-card-title-group">
              <div class="db-card-icon-wrap">
                <lucide-angular [img]="iconActivity" size="15"></lucide-angular>
              </div>
              <h2 class="db-card-title">Activité récente</h2>
            </div>
            <a routerLink="/app/notifications" class="db-link">
              Tout voir
              <lucide-angular [img]="iconArrowRight" size="13"></lucide-angular>
            </a>
          </div>

          @if (isLoading()) {
            <div class="activity-list">
              @for (item of [1,2,3]; track item) {
                <div class="activity-item">
                  <div class="sk-avatar"></div>
                  <div class="sk-lines">
                    <div class="sk sk-line-long"></div>
                    <div class="sk sk-line-short"></div>
                  </div>
                </div>
              }
            </div>
          } @else if (activities().length === 0) {
            <div class="empty-state">
              <div class="empty-icon-wrap">
                <lucide-angular [img]="iconBell" size="22"></lucide-angular>
              </div>
              <p>Aucune activité récente.</p>
            </div>
          } @else {
            <div class="activity-list">
              @for (item of activities(); track item.description + item.date) {
                <div class="activity-item">
                  <div class="activity-avatar"
                       [style.background]="item.color + '22'"
                       [style.color]="item.color">
                    {{ item.initials }}
                  </div>
                  <div class="activity-content">
                    <p class="activity-desc">{{ item.description }}</p>
                    <p class="activity-date">{{ item.date }}</p>
                  </div>
                  <div class="activity-dot" [style.background]="item.color"></div>
                </div>
              }
            </div>
          }
        </div>

        <!-- Quick Action -->
        <div class="db-card quick-card">
          <div class="qa-glow"></div>
          <div class="qa-body">
            <div class="qa-icon-ring">
              <!-- ✅ CalendarPlus importé et utilisé correctement -->
              <lucide-angular [img]="iconCalendarPlus" size="26"></lucide-angular>
            </div>
            <h3 class="qa-title">Demander un congé</h3>
            <p class="qa-desc">{{ quickActionDescription() }}</p>
            <a routerLink="/app/employee/conges" class="qa-btn">
              Nouvelle demande
              <lucide-angular [img]="iconArrowRight" size="14"></lucide-angular>
            </a>
          </div>
        </div>

      </div>
    </div>
  `,
  styles: [`
    /* ── Root ── */
    .db-root {
      display: flex;
      flex-direction: column;
      gap: 20px;
      font-family: 'Geist', 'Inter', system-ui, sans-serif;
    }

    /* ── Header ── */
    .db-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      padding: 28px 32px;
      background: linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #4c1d95 100%);
      border-radius: 20px;
      position: relative;
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(99, 102, 241, 0.18);
    }

    .db-header::before {
      content: '';
      position: absolute;
      top: -40px; right: -40px;
      width: 200px; height: 200px;
      border-radius: 50%;
      background: rgba(255,255,255,0.04);
    }

    .db-header::after {
      content: '';
      position: absolute;
      bottom: -60px; left: 30%;
      width: 260px; height: 260px;
      border-radius: 50%;
      background: rgba(139,92,246,0.12);
    }

    .db-label {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.5);
      margin: 0 0 6px;
    }

    .db-title {
      font-size: 28px;
      font-weight: 800;
      color: #fff;
      margin: 0 0 4px;
      line-height: 1.15;
    }

    .db-name { color: #a5b4fc; }

    .db-date {
      font-size: 13px;
      color: rgba(255,255,255,0.5);
      margin: 0;
      font-weight: 500;
    }

    .db-role-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 999px;
      color: rgba(255,255,255,0.8);
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
      backdrop-filter: blur(8px);
      z-index: 1;
    }

    /* ── Warning ── */
    .db-warning {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      background: #fff7ed;
      border: 1px solid #fed7aa;
      border-radius: 12px;
      color: #9a3412;
      font-size: 13px;
      font-weight: 600;
    }

    :host-context(.dark) .db-warning {
      background: rgba(251,191,36,0.08);
      border-color: rgba(251,191,36,0.2);
      color: #fbbf24;
    }

    /* ── KPI Grid ── */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
    }

    .kpi-card {
      position: relative;
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 20px 20px 22px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      overflow: hidden;
      transition: transform 0.18s ease, box-shadow 0.18s ease;
    }

    .kpi-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0,0,0,0.07);
    }

    :host-context(.dark) .kpi-card {
      background: #141821;
      border-color: #1e293b;
    }

    .kpi-card::after {
      content: '';
      position: absolute;
      bottom: 0; left: 0; right: 0;
      height: 3px;
      background: var(--accent, #6366f1);
      border-radius: 0 0 16px 16px;
      opacity: 0.6;
    }

    .kpi-icon-wrap {
      width: 40px; height: 40px;
      border-radius: 10px;
      background: color-mix(in srgb, var(--accent, #6366f1) 12%, transparent);
      display: flex; align-items: center; justify-content: center;
      color: var(--accent, #6366f1);
    }

    .kpi-body {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .kpi-value {
      font-size: 26px;
      font-weight: 800;
      color: #0f172a;
      line-height: 1.1;
    }

    :host-context(.dark) .kpi-value { color: #f1f5f9; }

    .kpi-label {
      font-size: 12px;
      font-weight: 600;
      color: #64748b;
    }

    .kpi-trend {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 999px;
      width: fit-content;
    }

    .trend-up   { background: #f0fdf4; color: #16a34a; }
    .trend-down { background: #fff1f2; color: #e11d48; }

    :host-context(.dark) .trend-up   { background: rgba(22,163,74,0.15);  color: #4ade80; }
    :host-context(.dark) .trend-down { background: rgba(225,29,72,0.15);   color: #fb7185; }

    .kpi-bar { display: none; }

    /* ── Bottom Grid ── */
    .db-grid {
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 16px;
      align-items: start;
    }

    @media (max-width: 1024px) {
      .db-grid { grid-template-columns: 1fr; }
    }

    /* ── Card Base ── */
    .db-card {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 20px;
      padding: 24px;
    }

    :host-context(.dark) .db-card {
      background: #141821;
      border-color: #1e293b;
    }

    .db-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }

    .db-card-title-group {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .db-card-icon-wrap {
      width: 32px; height: 32px;
      border-radius: 8px;
      background: #f1f5f9;
      display: flex; align-items: center; justify-content: center;
      color: #6366f1;
    }

    :host-context(.dark) .db-card-icon-wrap {
      background: #1e293b;
    }

    .db-card-title {
      font-size: 15px;
      font-weight: 800;
      color: #0f172a;
      margin: 0;
    }

    :host-context(.dark) .db-card-title { color: #f1f5f9; }

    .db-link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      font-weight: 700;
      color: #6366f1;
      text-decoration: none;
      opacity: 0.85;
      transition: opacity 0.15s;
    }

    .db-link:hover { opacity: 1; }

    /* ── Activity ── */
    .activity-list { display: flex; flex-direction: column; gap: 2px; }

    .activity-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 8px;
      border-radius: 10px;
      transition: background 0.15s;
      position: relative;
    }

    .activity-item:hover { background: #f8fafc; }
    :host-context(.dark) .activity-item:hover { background: #1e293b; }

    .activity-avatar {
      width: 36px; height: 36px;
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 800;
      flex-shrink: 0;
      letter-spacing: 0.03em;
    }

    .activity-content { flex: 1; min-width: 0; }

    .activity-desc {
      font-size: 13px;
      font-weight: 600;
      color: #334155;
      margin: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    :host-context(.dark) .activity-desc { color: #cbd5e1; }

    .activity-date {
      font-size: 11px;
      color: #94a3b8;
      margin: 3px 0 0;
      font-weight: 500;
    }

    .activity-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
      opacity: 0.6;
    }

    /* ── Quick Action Card ── */
    .quick-card {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: center;
      position: relative;
      overflow: hidden;
      background: linear-gradient(160deg, #1e1b4b, #312e81 70%);
      border-color: transparent;
    }

    .qa-glow {
      position: absolute;
      bottom: -40px; right: -40px;
      width: 180px; height: 180px;
      background: radial-gradient(circle, rgba(139,92,246,0.3) 0%, transparent 70%);
      pointer-events: none;
    }

    .qa-body {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 12px;
      z-index: 1;
    }

    .qa-icon-ring {
      width: 60px; height: 60px;
      border-radius: 18px;
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.15);
      display: flex; align-items: center; justify-content: center;
      color: #a5b4fc;
      backdrop-filter: blur(6px);
    }

    .qa-title {
      font-size: 17px;
      font-weight: 800;
      color: #fff;
      margin: 0;
    }

    .qa-desc {
      font-size: 13px;
      color: rgba(255,255,255,0.55);
      margin: 0;
      line-height: 1.5;
    }

    .qa-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 11px 22px;
      border-radius: 12px;
      background: rgba(255,255,255,0.12);
      border: 1px solid rgba(255,255,255,0.2);
      color: #fff;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
      text-decoration: none;
      transition: background 0.18s, transform 0.18s;
      backdrop-filter: blur(6px);
    }

    .qa-btn:hover {
      background: rgba(255,255,255,0.2);
      transform: translateY(-1px);
    }

    /* ── Empty State ── */
    .empty-state {
      min-height: 200px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      color: #94a3b8;
      text-align: center;
      font-size: 13px;
      font-weight: 600;
    }

    .empty-icon-wrap {
      width: 48px; height: 48px;
      border-radius: 14px;
      background: #f1f5f9;
      display: flex; align-items: center; justify-content: center;
      color: #cbd5e1;
    }

    :host-context(.dark) .empty-icon-wrap { background: #1e293b; }

    /* ── Skeletons ── */
    .kpi-skeleton { pointer-events: none; }

    .sk,
    .sk-icon,
    .sk-avatar {
      background: linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%);
      background-size: 200% 100%;
      animation: shimmer 1.4s infinite;
      border-radius: 8px;
    }

    :host-context(.dark) .sk,
    :host-context(.dark) .sk-icon,
    :host-context(.dark) .sk-avatar {
      background: linear-gradient(90deg, #1e293b 25%, #334155 50%, #1e293b 75%);
      background-size: 200% 100%;
    }

    .sk-icon { width: 40px; height: 40px; border-radius: 10px; flex-shrink: 0; }
    .sk-avatar { width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0; }
    .sk-val { width: 80px; height: 26px; margin-bottom: 8px; }
    .sk-lbl { width: 110px; height: 12px; border-radius: 999px; }
    .sk-lines { display: flex; flex-direction: column; }
    .sk-line-long { width: 200px; max-width: 100%; height: 13px; border-radius: 999px; margin-bottom: 7px; }
    .sk-line-short { width: 70px; height: 10px; border-radius: 999px; }

    @keyframes shimmer {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `]
})
export class EmployeeDashboardComponent {
  private readonly authService        = inject(AuthService);
  private readonly dashboardService   = inject(DashboardService);
  private readonly notificationService = inject(NotificationService);
  private readonly destroyRef         = inject(DestroyRef);

  // ── Icônes exposées au template ─────────────────────────────────────────────
  readonly iconUser          = User;
  readonly iconTriangleAlert = TriangleAlert;
  readonly iconTrendingUp    = TrendingUp;
  readonly iconTrendingDown  = TrendingDown;
  readonly iconActivity      = Activity;
  readonly iconArrowRight    = ArrowRight;
  readonly iconBell          = Bell;
  readonly iconCalendarPlus  = CalendarPlus;   // ← était manquant
  readonly iconChevronDown   = ChevronDown;    // ← était manquant

  /**
   * ✅ Registre d'icônes pour la résolution dynamique depuis kpi.icon (string)
   * Le DashboardService retourne des noms kebab-case → on les mappe ici.
   */
  private readonly iconRegistry: Record<string, any> = {
    'timer':         Timer,
    'calendar-days': CalendarDays,
    'file-text':     FileText,
    'activity':      Activity,
    'file-check':    FileCheck,
    'users':         Users,
    'check-circle':  CheckCircle,
    'bar-chart-2':   BarChart2,
    'trending-up':   TrendingUp,
    'trending-down': TrendingDown,
    'chevron-down':  ChevronDown,
    'calendar-plus': CalendarPlus,
    'arrow-right':   ArrowRight,
    'bell':          Bell,
    'user':          User,
  };

  /** Résout un nom d'icône string vers l'objet Lucide correspondant. */
  resolveIcon(name: string): any {
    return this.iconRegistry[name] ?? Activity; // Activity comme fallback visible
  }

  // ── Signaux / computed ───────────────────────────────────────────────────────
  readonly isLoading  = signal(true);
  readonly stats      = signal<DashboardStats | null>(null);

  readonly warningMessage = computed(() => this.stats()?.warningMessage ?? null);
  readonly firstName      = computed(() =>
    this.authService.currentUser()?.prenom ?? 'Collaborateur'
  );
  readonly kpis = computed<DashboardKpi[]>(() => this.stats()?.kpis ?? []);
  readonly quickActionDescription = computed(() =>
    this.stats()?.quickActionDescription ?? 'Soumettez une demande de congé en quelques clics.'
  );
  readonly activities = computed<DashboardActivity[]>(() => {
    const live = this.notificationService.notifications();
    if (live.length > 0) {
      return this.dashboardService.mapRealtimeNotifications(live);
    }
    return this.stats()?.activities ?? [];
  });

  readonly todayFormatted = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  }).format(new Date());

  constructor() {
    this.loadDashboard();
  }

  private loadDashboard(): void {
    this.isLoading.set(true);

    this.dashboardService.getEmployeeDashboardStats()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next:  stats => { this.stats.set(stats); this.isLoading.set(false); },
        error: ()    => { this.isLoading.set(false); }
      });

    this.notificationService.getNotifications()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }
}