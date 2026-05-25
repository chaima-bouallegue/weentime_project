import { Component, inject, signal, computed, ChangeDetectionStrategy, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, User, Lock, Activity, Building, Calendar, ShieldCheck, Camera, Mail, Phone, MoreHorizontal, Briefcase, MapPin, Check, AlertCircle, ExternalLink, Sparkles, ChevronRight } from 'lucide-angular';
import { ProfileService, UserProfile } from './profile.service';
import { AuthService } from '../../core/services/auth.service';
import { ProfileAvatarComponent } from './components/profile-avatar/profile-avatar.component';
import { ProfileInfoComponent } from './components/profile-info/profile-info.component';
import { ProfilePasswordComponent } from './components/profile-password/profile-password.component';
import { ProfileTwoFactorComponent } from './components/profile-two-factor/profile-two-factor.component';
import { ProfileActivityComponent } from './components/profile-activity/profile-activity.component';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrateur',
  RH: 'Ressources Humaines',
  MANAGER: 'Manager',
  EMPLOYEE: 'Collaborateur'
};

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    CommonModule,
    LucideAngularModule,
    ProfileAvatarComponent,
    ProfileInfoComponent,
    ProfilePasswordComponent,
    ProfileTwoFactorComponent,
    ProfileActivityComponent
  ],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class ProfileComponent {
  private profileService = inject(ProfileService);
  private authService = inject(AuthService);

  // Icons
  readonly iconUser = User;
  readonly iconLock = Lock;
  readonly iconActivity = Activity;
  readonly iconBuilding = Building;
  readonly iconCalendar = Calendar;
  readonly iconShield = ShieldCheck;
  readonly iconCamera = Camera;
  readonly iconMail = Mail;
  readonly iconPhone = Phone;
  readonly iconMoreHorizontal = MoreHorizontal;
  readonly iconBriefcase = Briefcase;
  readonly iconMapPin = MapPin;
  readonly iconCheck = Check;
  readonly iconAlertCircle = AlertCircle;
  readonly iconExternalLink = ExternalLink;
  readonly iconSparkles = Sparkles;
  readonly iconChevronRight = ChevronRight;

  profile = signal<UserProfile | null>(null);
  loading = signal(true);
  activeTab = signal<'info' | 'security' | 'activity'>('info');

  readonly tabs = [
    { key: 'info' as const, label: 'Informations', icon: 'user' },
    { key: 'security' as const, label: 'Sécurité', icon: 'lock' },
    { key: 'activity' as const, label: 'Activité', icon: 'activity' }
  ];

  fullName = computed(() => {
    const p = this.profile();
    return p ? `${p.prenom} ${p.nom}` : '';
  });

  roleLabel = computed(() => {
    const rawRole = this.authService.currentUser()?.roles?.[0] ?? '';
    const role = String(rawRole).toUpperCase().startsWith('ROLE_')
      ? String(rawRole).toUpperCase().substring('ROLE_'.length)
      : String(rawRole).toUpperCase();
    return ROLE_LABELS[role] ?? 'Utilisateur';
  });

  statusLabel = computed(() => {
    const s = this.profile()?.statut;
    if (s === 'ACTIF') return 'Actif';
    if (s === 'INACTIF') return 'Inactif';
    if (s === 'SUSPENDU') return 'Suspendu';
    return 'Actif';
  });

  memberSince = computed(() => {
    const d = this.profile()?.dateCreation;
    if (!d) return '';
    try {
      return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(d));
    } catch {
      return '';
    }
  });

  constructor() {
    this.refreshProfile();
  }

  onAvatarChanged(url: string): void {
    const p = this.profile();
    if (p) {
      this.profile.set({ ...p, photo: url });
    }
  }

  onProfileUpdated(profile: UserProfile): void {
    this.profile.set(profile);
  }

  refreshProfile(): void {
    this.loading.set(true);
    this.profileService.getProfile().subscribe({
      next: (p) => {
        this.profile.set(p);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }
}
