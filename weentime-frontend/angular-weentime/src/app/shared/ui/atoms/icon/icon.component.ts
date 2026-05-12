import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Bell,
  Building2,
  Calendar,
  CalendarCheck,
  CalendarRange,
  CalendarX2,
  CalendarPlus,
  CheckCircle,
  ChevronRight,
  CircleDashed,
  ClipboardCheck,
  Clock3,
  FileText,
  Hourglass,
  House,
  Inbox,
  LayoutGrid,
  LineChart,
  LucideAngularModule,
  Network,
  PieChart,
  RefreshCw,
  ShieldCheck,
  Timer,
  TrendingDown,
  TrendingUp,
  UserX,
  Users,
  Wallet,
  Pencil,
  X,
  Plus,
  Search
} from 'lucide-angular';

const ICON_REGISTRY: Record<string, any> = {
  activity: Activity,
  'alert-triangle': AlertTriangle,
  'arrow-right': ArrowRight,
  'badge-check': BadgeCheck,
  'bar-chart': BarChart3,
  'bar-chart-2': BarChart3,
  bell: Bell,
  'building-2': Building2,
  calendar: Calendar,
  'calendar-plus': CalendarPlus,
  'check-circle': CheckCircle,
  'chevron-right': ChevronRight,
  'circle-dashed': CircleDashed,
  'clipboard-check': ClipboardCheck,
  clock: Clock3,
  'clock-3': Clock3,
  'file-text': FileText,
  house: House,
  inbox: Inbox,
  layout: LayoutGrid,
  line: LineChart,
  network: Network,
  pie: PieChart,
  refresh: RefreshCw,
  'shield-check': ShieldCheck,
  timer: Timer,
  'trending-up': TrendingUp,
  'trending-down': TrendingDown,
  'user-x': UserX,
  users: Users,
  wallet: Wallet,
  'calendar-check': CalendarCheck,
  'calendar-range': CalendarRange,
  hourglass: Hourglass,
  'calendar-x-2': CalendarX2,
  pencil: Pencil,
  x: X,
  plus: Plus,
  search: Search,
  'refresh-cw': RefreshCw
};

@Component({
  selector: 'ui-icon',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    <span class="ui-icon" [attr.tabindex]="focusable ? 0 : null" [attr.aria-label]="ariaLabel || null" [attr.aria-hidden]="ariaLabel ? null : true">
      <lucide-angular [img]="iconRef()" [size]="size"></lucide-angular>
    </span>
  `,
  styles: [`
    .ui-icon {
      display: inline-grid;
      place-items: center;
      line-height: 0;
      outline: none;
    }

    .ui-icon:focus-visible {
      border-radius: 8px;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, .28);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UiIconComponent {
  private readonly rawIcon = signal<string | any>('activity');

  @Input()
  set icon(value: string | any) {
    this.rawIcon.set(value ?? 'activity');
  }

  @Input() size = 18;
  @Input() focusable = false;
  @Input() ariaLabel = '';

  readonly iconRef = computed(() => {
    const value = this.rawIcon();
    if (typeof value === 'string') {
      return ICON_REGISTRY[value] ?? Activity;
    }
    return value ?? Activity;
  });
}
