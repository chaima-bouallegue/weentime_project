import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { ActivityItem, ProfileService } from '../../profile.service';

export type ActivityCategory = 'ALL' | 'SECURITY' | 'AUTH' | 'PROFILE';

export interface FormattedActivity {
  id: number;
  title: string;
  category: 'SECURITY' | 'AUTH' | 'PROFILE' | 'MANAGEMENT' | 'OTHER';
  categoryLabel: string;
  badgeClass: string;
  iconBgClass: string;
  iconName: string;
  description: string;
  relativeDate: string;
  exactDate: string;
  ipDisplay: string | null;
  rawAction: string;
}

@Component({
  selector: 'app-profile-activity',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Header Summary & Filter Bar -->
    <div class="activity-header mb-6">
      <div class="filter-strip">
        <button
          type="button"
          class="filter-pill"
          [class.active]="selectedFilter() === 'ALL'"
          (click)="selectedFilter.set('ALL')"
        >
          <span>Toutes les activités</span>
          <span class="count-bubble">{{ activities().length }}</span>
        </button>

        <button
          type="button"
          class="filter-pill filter-security"
          [class.active]="selectedFilter() === 'SECURITY'"
          (click)="selectedFilter.set('SECURITY')"
        >
          <lucide-icon name="shield-check" size="14"></lucide-icon>
          <span>Sécurité</span>
          <span class="count-bubble">{{ countByCategory('SECURITY') }}</span>
        </button>

        <button
          type="button"
          class="filter-pill filter-auth"
          [class.active]="selectedFilter() === 'AUTH'"
          (click)="selectedFilter.set('AUTH')"
        >
          <lucide-icon name="log-in" size="14"></lucide-icon>
          <span>Connexions</span>
          <span class="count-bubble">{{ countByCategory('AUTH') }}</span>
        </button>

        <button
          type="button"
          class="filter-pill filter-profile"
          [class.active]="selectedFilter() === 'PROFILE'"
          (click)="selectedFilter.set('PROFILE')"
        >
          <lucide-icon name="user" size="14"></lucide-icon>
          <span>Profil</span>
          <span class="count-bubble">{{ countByCategory('PROFILE') }}</span>
        </button>
      </div>
    </div>

    <!-- Content State -->
    @if (loading()) {
      <div class="skeleton-list">
        @for (i of [1, 2, 3, 4]; track i) {
          <div class="activity-card skeleton-card animate-pulse">
            <div class="sk-icon"></div>
            <div class="sk-content">
              <div class="sk-line sk-title"></div>
              <div class="sk-line sk-desc"></div>
              <div class="sk-line sk-meta"></div>
            </div>
          </div>
        }
      </div>
    } @else if (filteredActivities().length === 0) {
      <div class="empty-state">
        <div class="empty-icon-bubble">
          <lucide-icon name="activity" size="32"></lucide-icon>
        </div>
        <h4 class="empty-title">Aucune activité enregistrée</h4>
        <p class="empty-desc">
          @if (selectedFilter() === 'ALL') {
            Vos actions de connexion, modifications de profil et événements de sécurité apparaîtront ici.
          } @else {
            Aucun événement ne correspond au filtre sélectionné pour le moment.
          }
        </p>
      </div>
    } @else {
      <div class="activity-timeline">
        @for (item of filteredActivities(); track item.id; let i = $index) {
          <article class="activity-card" [style.animation-delay]="i * 40 + 'ms'">
            <!-- Icon Container -->
            <div class="activity-icon-wrap" [class]="item.iconBgClass">
              <lucide-icon [name]="item.iconName" size="18"></lucide-icon>
            </div>

            <!-- Content -->
            <div class="activity-content">
              <div class="activity-top-row">
                <div class="title-and-badge">
                  <h4 class="activity-title">{{ item.title }}</h4>
                  <span class="category-badge" [class]="item.badgeClass">
                    {{ item.categoryLabel }}
                  </span>
                </div>
                <time class="activity-relative" [title]="item.exactDate">
                  {{ item.relativeDate }}
                </time>
              </div>

              <p class="activity-desc">{{ item.description }}</p>

              <div class="activity-meta-row">
                <span class="meta-item exact-date">
                  <lucide-icon name="calendar" size="12"></lucide-icon>
                  <span>{{ item.exactDate }}</span>
                </span>

                @if (item.ipDisplay) {
                  <span class="meta-item ip-badge">
                    <lucide-icon name="globe" size="12"></lucide-icon>
                    <span>{{ item.ipDisplay }}</span>
                  </span>
                }
              </div>
            </div>
          </article>
        }
      </div>
    }
  `,
  styles: [`
    :host {
      display: block;
    }

    /* --- Filter Bar --- */
    .activity-header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .filter-strip {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }

    .filter-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 700;
      color: #64748b;
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);

      &:hover {
        background: #e2e8f0;
        color: #334155;
      }

      &.active {
        background: #4f46e5;
        color: #ffffff;
        border-color: #4f46e5;
        box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25);

        .count-bubble {
          background: rgba(255, 255, 255, 0.25);
          color: #ffffff;
        }
      }
    }

    .count-bubble {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: 9999px;
      font-size: 0.65rem;
      font-weight: 800;
      background: #cbd5e1;
      color: #334155;
    }

    /* --- Timeline List --- */
    .activity-timeline {
      display: grid;
      gap: 12px;
    }

    .activity-card {
      display: flex;
      gap: 16px;
      padding: 16px;
      border-radius: 20px;
      background: #ffffff;
      border: 1px solid #f1f5f9;
      box-shadow: 0 4px 20px -6px rgba(0, 0, 0, 0.04);
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      animation: cardFadeIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) both;

      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 25px -8px rgba(0, 0, 0, 0.08);
        border-color: #e2e8f0;
      }
    }

    @keyframes cardFadeIn {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    /* --- Icon Bubbles --- */
    .activity-icon-wrap {
      flex-shrink: 0;
      width: 44px;
      height: 44px;
      border-radius: 14px;
      display: grid;
      place-items: center;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    }

    .icon-security {
      background: #fffbeb;
      color: #d97706;
      border: 1px solid #fef3c7;
    }

    .icon-auth {
      background: #ecfdf5;
      color: #059669;
      border: 1px solid #d1fae5;
    }

    .icon-profile {
      background: #eef2ff;
      color: #4f46e5;
      border: 1px solid #e0e7ff;
    }

    .icon-management {
      background: #faf5ff;
      color: #9333ea;
      border: 1px solid #f3e8ff;
    }

    .icon-other {
      background: #f8fafc;
      color: #64748b;
      border: 1px solid #f1f5f9;
    }

    /* --- Content Body --- */
    .activity-content {
      flex: 1;
      min-width: 0;
    }

    .activity-top-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 4px;
    }

    .title-and-badge {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }

    .activity-title {
      margin: 0;
      font-size: 0.95rem;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.01em;
    }

    .activity-relative {
      font-size: 0.75rem;
      font-weight: 700;
      color: #94a3b8;
      white-space: nowrap;
    }

    .activity-desc {
      margin: 4px 0 8px 0;
      font-size: 0.85rem;
      color: #475569;
      line-height: 1.45;
    }

    /* --- Category Badges --- */
    .category-badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 0.68rem;
      font-weight: 800;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }

    .badge-security {
      background: #fef3c7;
      color: #b45309;
    }

    .badge-auth {
      background: #d1fae5;
      color: #047857;
    }

    .badge-profile {
      background: #e0e7ff;
      color: #4338ca;
    }

    .badge-management {
      background: #f3e8ff;
      color: #7e22ce;
    }

    .badge-other {
      background: #f1f5f9;
      color: #475569;
    }

    /* --- Meta Footer --- */
    .activity-meta-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
    }

    .meta-item {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 0.72rem;
      font-weight: 600;
      color: #64748b;
    }

    .ip-badge {
      padding: 2px 8px;
      border-radius: 6px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
    }

    /* --- Empty State --- */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 48px 24px;
      background: #f8fafc;
      border-radius: 24px;
      border: 1px dashed #cbd5e1;
    }

    .empty-icon-bubble {
      width: 64px;
      height: 64px;
      border-radius: 20px;
      background: #ffffff;
      color: #94a3b8;
      display: grid;
      place-items: center;
      margin-bottom: 16px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05);
    }

    .empty-title {
      margin: 0 0 6px 0;
      font-size: 1.1rem;
      font-weight: 800;
      color: #1e293b;
    }

    .empty-desc {
      margin: 0;
      font-size: 0.85rem;
      color: #64748b;
      max-width: 360px;
    }

    /* --- Skeleton Loader --- */
    .skeleton-list {
      display: grid;
      gap: 12px;
    }

    .skeleton-card {
      pointer-events: none;
    }

    .sk-icon {
      width: 44px;
      height: 44px;
      border-radius: 14px;
      background: #e2e8f0;
    }

    .sk-content {
      flex: 1;
      display: grid;
      gap: 8px;
    }

    .sk-line {
      height: 12px;
      border-radius: 6px;
      background: #e2e8f0;
    }

    .sk-title {
      width: 40%;
      height: 16px;
    }

    .sk-desc {
      width: 70%;
    }

    .sk-meta {
      width: 25%;
      height: 10px;
    }

    /* --- Dark Mode Adaptation --- */
    :host-context(.dark) {
      .filter-pill {
        background: #1e293b;
        border-color: #334155;
        color: #94a3b8;

        &:hover {
          background: #334155;
          color: #f8fafc;
        }

        &.active {
          background: #6366f1;
          border-color: #6366f1;
          color: #ffffff;
        }
      }

      .count-bubble {
        background: #334155;
        color: #cbd5e1;
      }

      .activity-card {
        background: #0f172a;
        border-color: #1e293b;
        box-shadow: none;

        &:hover {
          border-color: #334155;
          background: #131d31;
        }
      }

      .activity-title {
        color: #f8fafc;
      }

      .activity-desc {
        color: #cbd5e1;
      }

      .activity-relative,
      .meta-item {
        color: #64748b;
      }

      .ip-badge {
        background: #1e293b;
        border-color: #334155;
        color: #94a3b8;
      }

      .icon-security {
        background: rgba(217, 119, 6, 0.15);
        color: #fbbf24;
        border-color: rgba(217, 119, 6, 0.25);
      }

      .icon-auth {
        background: rgba(5, 150, 105, 0.15);
        color: #34d399;
        border-color: rgba(5, 150, 105, 0.25);
      }

      .icon-profile {
        background: rgba(79, 70, 229, 0.15);
        color: #818cf8;
        border-color: rgba(79, 70, 229, 0.25);
      }

      .icon-management {
        background: rgba(147, 51, 234, 0.15);
        color: #c084fc;
        border-color: rgba(147, 51, 234, 0.25);
      }

      .icon-other {
        background: rgba(100, 116, 139, 0.15);
        color: #94a3b8;
        border-color: rgba(100, 116, 139, 0.25);
      }

      .badge-security {
        background: rgba(217, 119, 6, 0.2);
        color: #fcd34d;
      }

      .badge-auth {
        background: rgba(5, 150, 105, 0.2);
        color: #6ee7b7;
      }

      .badge-profile {
        background: rgba(79, 70, 229, 0.2);
        color: #a5b4fc;
      }

      .badge-management {
        background: rgba(147, 51, 234, 0.2);
        color: #d8b4fe;
      }

      .badge-other {
        background: rgba(100, 116, 139, 0.2);
        color: #cbd5e1;
      }

      .empty-state {
        background: #0f172a;
        border-color: #1e293b;
      }

      .empty-icon-bubble {
        background: #1e293b;
        color: #64748b;
      }

      .empty-title {
        color: #f8fafc;
      }

      .empty-desc {
        color: #94a3b8;
      }

      .sk-icon,
      .sk-line {
        background: #1e293b;
      }
    }
  `]
})
export class ProfileActivityComponent {
  private readonly profileService = inject(ProfileService);

  readonly rawActivities = signal<ActivityItem[]>([]);
  readonly loading = signal(true);
  readonly selectedFilter = signal<ActivityCategory>('ALL');

  readonly activities = computed<FormattedActivity[]>(() => {
    return this.rawActivities().map(item => this.formatItem(item));
  });

  readonly filteredActivities = computed<FormattedActivity[]>(() => {
    const list = this.activities();
    const filter = this.selectedFilter();
    if (filter === 'ALL') {
      return list;
    }
    return list.filter(item => item.category === filter);
  });

  constructor() {
    this.profileService.getActivityHistory().subscribe({
      next: items => {
        this.rawActivities.set(Array.isArray(items) ? items : []);
        this.loading.set(false);
      },
      error: () => {
        this.rawActivities.set([]);
        this.loading.set(false);
      }
    });
  }

  countByCategory(category: ActivityCategory): number {
    if (category === 'ALL') return this.activities().length;
    return this.activities().filter(item => item.category === category).length;
  }

  private formatItem(item: ActivityItem): FormattedActivity {
    const rawAction = (item.action || item.type || '').toUpperCase();
    const category = this.resolveCategory(rawAction);
    const meta = this.getCategoryMeta(category);

    return {
      id: item.id || Math.random(),
      title: this.resolveTitle(rawAction),
      category,
      categoryLabel: meta.label,
      badgeClass: meta.badgeClass,
      iconBgClass: meta.iconBgClass,
      iconName: this.resolveIcon(rawAction, item.icon),
      description: this.resolveHumanDescription(item, rawAction),
      relativeDate: this.formatRelativeDate(item.timestamp || item.date),
      exactDate: this.formatExactDate(item.timestamp || item.date),
      ipDisplay: this.formatIp(item.ipAddress),
      rawAction
    };
  }

  private resolveCategory(action: string): 'SECURITY' | 'AUTH' | 'PROFILE' | 'MANAGEMENT' | 'OTHER' {
    if (action.includes('PASSWORD') || action.includes('2FA') || action.includes('BACKUP_CODE')) {
      return 'SECURITY';
    }
    if (action.includes('LOGIN') || action.includes('LOGOUT') || action.includes('REGISTER')) {
      return 'AUTH';
    }
    if (action.includes('PROFILE') || action.includes('AVATAR')) {
      return 'PROFILE';
    }
    if (action.includes('USER') || action.includes('RH') || action.includes('ROLE') || action.includes('ENTREPRISE')) {
      return 'MANAGEMENT';
    }
    return 'OTHER';
  }

  private getCategoryMeta(category: 'SECURITY' | 'AUTH' | 'PROFILE' | 'MANAGEMENT' | 'OTHER') {
    switch (category) {
      case 'SECURITY':
        return { label: 'Sécurité', badgeClass: 'badge-security', iconBgClass: 'icon-security' };
      case 'AUTH':
        return { label: 'Connexion', badgeClass: 'badge-auth', iconBgClass: 'icon-auth' };
      case 'PROFILE':
        return { label: 'Profil', badgeClass: 'badge-profile', iconBgClass: 'icon-profile' };
      case 'MANAGEMENT':
        return { label: 'Gestion', badgeClass: 'badge-management', iconBgClass: 'icon-management' };
      default:
        return { label: 'Activité', badgeClass: 'badge-other', iconBgClass: 'icon-other' };
    }
  }

  private resolveTitle(action: string): string {
    switch (action) {
      case 'LOGIN': return 'Connexion au compte';
      case 'LOGOUT': return 'Déconnexion de session';
      case 'PROFILE_UPDATE': return 'Mise à jour des coordonnées';
      case 'PROFILE_AVATAR_UPDATE': return 'Photo de profil modifiée';
      case 'CHANGE_PASSWORD': return 'Mot de passe modifié';
      case 'UPDATE_2FA': return 'Sécurité à deux facteurs (2FA)';
      case 'UPDATE_BACKUP_CODES': return 'Codes de secours générés';
      case 'REGISTER_USER': return 'Création du compte';
      case 'CREATE_USER': return 'Nouveau collaborateur créé';
      case 'UPDATE_USER': return 'Collaborateur mis à jour';
      case 'DELETE_USER': return 'Compte collaborateur désactivé';
      case 'TOGGLE_USER_STATUS': return 'Statut de compte modifié';
      case 'VALIDATE_USER': return 'Validation de compte collaborateur';
      case 'REJECT_USER': return 'Rejet de demande de compte';
      case 'CREATE_RH': return 'Création de compte RH';
      case 'UPDATE_RH': return 'Mise à jour de compte RH';
      case 'DELETE_RH': return 'Suppression de compte RH';
      case 'ASSIGN_RH_ENTREPRISE': return 'Assignation d\'entreprise';
      case 'NOTIFICATION_FAILURE': return 'Alerte de notification';
      default:
        if (!action) return 'Événement système';
        return action
          .toLowerCase()
          .replace(/_/g, ' ')
          .replace(/^\w/, c => c.toUpperCase());
    }
  }

  private resolveIcon(action: string, fallbackIcon?: string): string {
    if (action === 'LOGIN') return 'log-in';
    if (action === 'LOGOUT') return 'log-out';
    if (action === 'CHANGE_PASSWORD') return 'lock';
    if (action === 'UPDATE_2FA') return 'shield-check';
    if (action === 'UPDATE_BACKUP_CODES') return 'key';
    if (action === 'PROFILE_UPDATE') return 'user';
    if (action === 'PROFILE_AVATAR_UPDATE') return 'camera';
    if (action.includes('DELETE')) return 'user-minus';
    if (action.includes('CREATE')) return 'user-plus';
    if (action.includes('VALIDATE')) return 'user-check';
    if (action.includes('REJECT')) return 'user-x';
    if (action.includes('TOGGLE')) return 'toggle-right';
    return fallbackIcon || 'activity';
  }

  private resolveHumanDescription(item: ActivityItem, action: string): string {
    const desc = item.description || '';

    if (desc.includes('enabled=true')) {
      return "L'authentification à deux facteurs (2FA) a été activée avec succès.";
    }
    if (desc.includes('enabled=false')) {
      return "L'authentification à deux facteurs (2FA) a été désactivée.";
    }
    if (desc.includes("Profil mis a jour par l'utilisateur")) {
      return "Vos coordonnées et informations de profil ont été enregistrées.";
    }
    if (desc.includes("Avatar mis a jour par l'utilisateur")) {
      return "Votre photo de profil a été mise à jour avec succès.";
    }
    if (desc.includes("Mot de passe modifie par l'utilisateur")) {
      return "Votre mot de passe d'accès a été renouvelé avec succès.";
    }
    if (desc.includes("Codes de secours mis a jour")) {
      return "Une nouvelle liste de codes de secours confidentiels a été générée.";
    }
    if (desc.includes("Statut utilisateur modifie vers : ACTIF") || desc.includes("Statut RH modifie vers : ACTIF")) {
      return "Le statut du compte est désormais Actif.";
    }
    if (desc.includes("Statut utilisateur modifie vers : INACTIF") || desc.includes("Statut RH modifie vers : INACTIF")) {
      return "Le statut du compte est désormais Inactif.";
    }
    if (desc.includes("Utilisateur cree avec succes")) {
      return "Le compte utilisateur a été créé et initialisé avec succès.";
    }
    if (desc.includes("Compte utilisateur validé")) {
      return "Le compte a été validé et configuré par le service RH.";
    }
    if (desc.includes("Compte utilisateur rejeté")) {
      return "La demande de compte utilisateur a été refusée.";
    }

    if (!desc || desc === 'Action systeme') {
      if (action === 'LOGIN') return "Session ouverte sur la plateforme WeenTime.";
      if (action === 'LOGOUT') return "Fermeture sécurisée de la session de travail.";
      if (action === 'PROFILE_UPDATE') return "Mise à jour des informations personnelles.";
      if (action === 'CHANGE_PASSWORD') return "Changement de mot de passe effectué.";
      return "Opération enregistrée avec succès dans votre journal d'activité.";
    }

    return desc;
  }

  private formatIp(ip?: string | null): string | null {
    if (!ip) return null;
    const clean = ip.trim();
    if (clean === '127.0.0.1' || clean === '0:0:0:0:0:0:0:1' || clean === '::1' || clean === 'localhost') {
      return 'Réseau local';
    }
    return `IP : ${clean}`;
  }

  private formatRelativeDate(dateStr?: string | null): string {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '-';
    const now = Date.now();
    const diffSec = Math.floor((now - date.getTime()) / 1000);
    if (diffSec < 60) return "À l'instant";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `Il y a ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `Il y a ${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    if (diffD === 1) return 'Hier';
    if (diffD < 7) return `Il y a ${diffD} jours`;
    return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
  }

  private formatExactDate(dateStr?: string | null): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }
}
