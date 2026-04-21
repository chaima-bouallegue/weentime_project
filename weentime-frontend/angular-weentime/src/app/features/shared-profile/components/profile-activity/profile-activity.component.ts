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
        <lucide-icon name="loader-2" size="20" class="animate-spin"></lucide-icon>
        <span>Chargementâ€¦</span>
      </div>
    } @else if (activities().length === 0) {
      <div class="empty-state">
        <lucide-icon name="activity" size="40"></lucide-icon>
        <p class="empty-title">Aucune activitÃ©</p>
        <p class="empty-desc">Votre historique d'activitÃ© apparaÃ®tra ici.</p>
      </div>
    } @else {
      <div class="activity-timeline">
        @for (item of activities(); track item.id) {
          <div class="timeline-item">
            <div class="timeline-icon" [class]="'icon-' + item.type">
              <lucide-icon [name]="item.icon" size="16"></lucide-icon>
            </div>
            <div class="timeline-content">
              <p class="timeline-desc">{{ item.description }}</p>
              <p class="timeline-date">{{ formatRelativeDate(item.date) }}</p>
            </div>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .loading {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      padding: 40px; color: #6366f1; font-size: 14px; font-weight: 600;
    }

    .empty-state {
      text-align: center; padding: 48px 24px; color: #94a3b8;
    }
    .empty-title { font-size: 16px; font-weight: 800; color: #64748b; margin: 12px 0 4px; }
    :host-context(.dark) .empty-title { color: #94a3b8; }
    .empty-desc { font-size: 13px; margin: 0; }

    .activity-timeline {
      display: flex; flex-direction: column; gap: 0;
      position: relative;
    }

    .timeline-item {
      display: flex; align-items: flex-start; gap: 14px;
      padding: 14px 0;
      border-bottom: 1px solid #f1f5f9;
    }
    .timeline-item:last-child { border-bottom: none; }
    :host-context(.dark) .timeline-item { border-color: #1e293b; }

    .timeline-icon {
      width: 34px; height: 34px; border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }

    .icon-login, .icon-LOGIN { background: #eef2ff; color: #6366f1; }
    :host-context(.dark) .icon-login, :host-context(.dark) .icon-LOGIN { background: rgba(99,102,241,0.15); color: #818cf8; }
    
    .icon-profile, .icon-PROFILE_UPDATE, .icon-PHOTO_UPDATE { background: #f0fdf4; color: #16a34a; }
    :host-context(.dark) .icon-profile, :host-context(.dark) .icon-PROFILE_UPDATE, :host-context(.dark) .icon-PHOTO_UPDATE { background: rgba(22,163,74,0.15); color: #4ade80; }
    
    .icon-password, .icon-CHANGE_PASSWORD { background: #fef3c7; color: #d97706; }
    :host-context(.dark) .icon-password, :host-context(.dark) .icon-CHANGE_PASSWORD { background: rgba(217,119,6,0.15); color: #fbbf24; }
    
    .icon-conge { background: #fce7f3; color: #db2777; }
    :host-context(.dark) .icon-conge { background: rgba(219,39,119,0.15); color: #f472b6; }

    .icon-USER_CREATE, .icon-CREATE_USER, .icon-VALIDATE_USER { background: #ecfeff; color: #0891b2; }
    :host-context(.dark) .icon-USER_CREATE, :host-context(.dark) .icon-CREATE_USER, :host-context(.dark) .icon-VALIDATE_USER { background: rgba(8,145,178,0.15); color: #22d3ee; }

    .icon-STATUS_UPDATE, .icon-TOGGLE_USER_STATUS, .icon-TOGGLE_RH_STATUS { background: #f5f3ff; color: #7c3aed; }
    :host-context(.dark) .icon-STATUS_UPDATE, :host-context(.dark) .icon-TOGGLE_USER_STATUS, :host-context(.dark) .icon-TOGGLE_RH_STATUS { background: rgba(124,58,237,0.15); color: #a78bfa; }

    .icon-REJECT_USER, .icon-DELETE_USER { background: #fff1f2; color: #e11d48; }
    :host-context(.dark) .icon-REJECT_USER, :host-context(.dark) .icon-DELETE_USER { background: rgba(225,29,72,0.15); color: #fb7185; }
    
    /* Fallback for any other type */
    .timeline-icon:not([class*="icon-"]) {
      background: #f1f5f9; color: #64748b;
    }
    :host-context(.dark) .timeline-icon:not([class*="icon-"]) {
      background: #1e293b; color: #94a3b8;
    }

    .timeline-desc { font-size: 13px; font-weight: 600; color: #334155; margin: 0; }
    :host-context(.dark) .timeline-desc { color: #e2e8f0; }
    .timeline-date { font-size: 11px; font-weight: 500; color: #94a3b8; margin: 3px 0 0; }

    .animate-spin { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `]
})
export class ProfileActivityComponent {
  private profileService = inject(ProfileService);

  activities = signal<ActivityItem[]>([]);
  loading = signal(true);

  constructor() {
    this.profileService.getActivityHistory().subscribe({
      next: (items) => {
        this.activities.set(items);
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
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMin / 60);
    const diffD = Math.floor(diffH / 24);

    if (diffMin < 1) return 'Ã€ l\'instant';
    if (diffMin < 60) return `Il y a ${diffMin} min`;
    if (diffH < 24) return `Il y a ${diffH}h`;
    if (diffD === 1) return 'Hier';
    if (diffD < 7) {
      return new Intl.DateTimeFormat('fr-FR', { weekday: 'long' }).format(date) + ' dernier';
    }
    return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  }
}
