import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { ActivityItem, ProfileService } from '../../profile.service';

@Component({
  selector: 'app-profile-activity',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <div class="loading">
        <lucide-icon name="loader-2" size="20" class="spin"></lucide-icon>
        <span>Chargement...</span>
      </div>
    } @else if (activities().length === 0) {
      <div class="empty">
        <lucide-icon name="activity" size="36"></lucide-icon>
        <p>Aucune activite pour le moment.</p>
      </div>
    } @else {
      <div class="timeline">
        @for (item of activities(); track item.id) {
          <article class="row">
            <div class="icon">
              <lucide-icon [name]="item.icon || 'activity'" size="16"></lucide-icon>
            </div>
            <div class="content">
              <div class="head">
                <strong>{{ item.action || item.type }}</strong>
                <span>{{ formatRelativeDate(item.timestamp || item.date) }}</span>
              </div>
              <p>{{ item.description || 'Action systeme' }}</p>
              @if (item.ipAddress) {
                <small>IP: {{ item.ipAddress }}</small>
              }
            </div>
          </article>
        }
      </div>
    }
  `,
  styles: [`
    .loading, .empty {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 28px;
      color: #64748b;
    }
    .timeline { display: grid; gap: 10px; }
    .row {
      display: flex;
      gap: 12px;
      padding: 12px;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: #fff;
    }
    .icon {
      width: 32px;
      height: 32px;
      border-radius: 10px;
      display: grid;
      place-items: center;
      color: #2563eb;
      background: rgba(37, 99, 235, 0.12);
    }
    .content { flex: 1; min-width: 0; }
    .head {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      align-items: baseline;
    }
    .head strong { color: #0f172a; font-size: 0.9rem; }
    .head span { color: #64748b; font-size: 0.75rem; }
    p {
      margin: 4px 0;
      color: #334155;
      font-size: 0.85rem;
    }
    small { color: #64748b; font-size: 0.75rem; }
    .spin { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    :host-context(.dark) .row {
      background: #0f172a;
      border-color: #1e293b;
    }
    :host-context(.dark) .head strong { color: #e2e8f0; }
    :host-context(.dark) p { color: #cbd5e1; }
    :host-context(.dark) .head span,
    :host-context(.dark) small,
    :host-context(.dark) .loading,
    :host-context(.dark) .empty { color: #94a3b8; }
  `]
})
export class ProfileActivityComponent {
  private readonly profileService = inject(ProfileService);

  readonly activities = signal<ActivityItem[]>([]);
  readonly loading = signal(true);

  constructor() {
    this.profileService.getActivityHistory().subscribe({
      next: items => {
        this.activities.set(Array.isArray(items) ? items : []);
        this.loading.set(false);
      },
      error: () => {
        this.activities.set([]);
        this.loading.set(false);
      }
    });
  }

  formatRelativeDate(dateStr: string): string {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) {
      return '-';
    }

    const now = Date.now();
    const diffMin = Math.floor((now - date.getTime()) / 60000);
    if (diffMin < 1) return "A l'instant";
    if (diffMin < 60) return `Il y a ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `Il y a ${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    if (diffD === 1) return 'Hier';
    return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
  }
}
