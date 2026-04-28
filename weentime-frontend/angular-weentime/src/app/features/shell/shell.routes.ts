import { Routes } from '@angular/router';
import { adminGuard } from '../../core/guards/admin.guard';
import {
  LUCIDE_ICONS,
  LucideIconProvider,
  Building,
  GitBranch,
  Users,
  UserCog,
  Building2,
  AlertCircle,
  Plus,
  Edit2,
  Trash2,
  AlertTriangle,
  Loader2,
  ShieldOff,
  ShieldCheck,
  Search,
  Filter,
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  Settings,
  Tent,
  PiggyBank,
  UserX,
  Clock,
  FileText,
  Pencil,
  FolderOpen,
  UserPlus,
  UserCheck,
  Calendar,
  BarChart,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  Info,
  User,
  Mail,
  Activity,
  Timer,
  Network,
  Inbox,
  Phone,
  Briefcase,
  ArrowRight,
  ArrowLeft,
  Shield,
  KeyRound,
  Copy,
  Zap,
  ExternalLink,
  Wallet,
  History,
  Database,
  Award,
  Download,
  CheckCircle,
  XCircle,
  ClipboardList,
  FilePlus,
  FileCheck,
  Bell,
  CheckCheck
} from 'lucide-angular';

export const shellRoutes: Routes = [
  {
    path: 'notifications',
    title: 'WeenTime — Notifications',
    data: { title: 'Notifications' },
    loadComponent: () => import('../notifications/notification-page.component').then(m => m.NotificationPageComponent)
  },
  // ── Vocal ──
  {
    path: 'vocal',
    loadChildren: () => import('../vocal/vocal.routes').then(m => m.vocalRoutes)
  },

  // ── Employee ──
  { path: 'employee', redirectTo: 'employee/dashboard', pathMatch: 'full' },
  {
    path: 'employee/dashboard',
    title: 'WeenTime - Tableau de bord',
    data: { title: 'Tableau de bord' },
    loadComponent: () => import('../employee/dashboard/employee-dashboard.component').then(m => m.EmployeeDashboardComponent)
  },
  {
    path: 'employee/conges',
    title: 'WeenTime - Mes conges',
    data: { title: 'Mes conges' },
    loadComponent: () => import('../employee/conges/employee-conges.component').then(m => m.EmployeeCongesComponent)
  },
  {
    path: 'employee/documents',
    title: 'WeenTime - Mes documents',
    data: { title: 'Mes documents' },
    loadComponent: () => import('../employee/documents/employee-documents.component').then(m => m.EmployeeDocumentsComponent)
  },
  {
    path: 'employee/teletravail',
    title: 'WeenTime - Mon teletravail',
    data: { title: 'Mon teletravail' },
    loadComponent: () => import('../employee/teletravail/employee-teletravail.component').then(m => m.EmployeeTeletravailComponent)
  },
  {
    path: 'employee/absences',
    title: 'WeenTime — Mes absences',
    data: { title: 'Mes absences' },
    loadComponent: () => import('../employee/absences/employee-absences.component').then(m => m.EmployeeAbsencesComponent)
  },
  {
    path: 'employee/pointage',
    title: 'WeenTime — Pointage',
    data: { title: 'Pointage' },
    loadComponent: () => import('../employee/pointage/employee-pointage.component').then(m => m.EmployeePointageComponent)
  },
  {
    path: 'employee/autorisations',
    title: 'WeenTime — Mes autorisations',
    data: { title: 'Mes autorisations' },
    loadComponent: () => import('../employee/autorisation/employee-autorisation.component').then(m => m.EmployeeAutorisationComponent)
  },
  {
    path: 'employee/autorisations/nouvelle',
    title: 'WeenTime — Nouvelle demande',
    data: { title: 'Nouvelle demande' },
    loadComponent: () => import('../employee/autorisation/employee-autorisation.component').then(m => m.EmployeeAutorisationComponent)
  },
  {
    path: 'employee/profil',
    title: 'WeenTime - Mon profil',
    data: { title: 'Mon profil' },
    loadComponent: () => import('../shared-profile/profile.component').then(m => m.ProfileComponent)
  },
  {
    path: 'employee/horaires',
    title: 'WeenTime — Mon planning',
    data: { title: 'Mon planning' },
    loadComponent: () => import('../employee/horaires/employee-horaires.component').then(m => m.EmployeeHorairesComponent)
  },

  { path: 'manager', redirectTo: 'manager/dashboard', pathMatch: 'full' },
  {
    path: 'manager/dashboard',
    title: 'WeenTime - Tableau de bord',
    data: { title: 'Tableau de bord' },
    loadComponent: () => import('../manager/dashboard/manager-dashboard.component').then(m => m.ManagerDashboardComponent)
  },
  {
    path: 'manager/pointage',
    title: 'WeenTime — Pointage',
    data: { title: 'Pointage' },
    loadComponent: () => import('../employee/pointage/employee-pointage.component').then(m => m.EmployeePointageComponent)
  },
  {
    path: 'manager/equipe',
    title: 'WeenTime - Mon equipe',
    data: { title: 'Mon equipe' },
    loadComponent: () => import('../manager/equipe/manager-equipe.component').then(m => m.ManagerEquipeComponent)
  },
  {
    path: 'manager/approbations',
    title: 'WeenTime - Approbations',
    data: { title: 'Approbations' },
    loadComponent: () => import('../manager/approbations/manager-approbations.component').then(m => m.ManagerApprobationsComponent)
  },
  {
    path: 'manager/teletravail',
    title: 'WeenTime - Teletravail equipe',
    data: { title: 'Teletravail equipe' },
    loadComponent: () => import('../manager/teletravail/manager-teletravail.component').then(m => m.ManagerTeletravailComponent)
  },
  {
    path: 'manager/absences',
    title: 'WeenTime — Absences équipe',
    data: { title: 'Absences équipe' },
    loadComponent: () => import('../manager/absences/manager-absences.component').then(m => m.ManagerAbsencesComponent)
  },
  {
    path: 'manager/autorisations',
    title: 'WeenTime — Autorisations équipe',
    data: { title: 'Autorisations équipe' },
    loadComponent: () => import('../manager/autorisation/manager-autorisation.component').then(m => m.ManagerAutorisationComponent)
  },
  {
    path: 'manager/profil',
    title: 'WeenTime - Mon profil',
    data: { title: 'Mon profil' },
    loadComponent: () => import('../shared-profile/profile.component').then(m => m.ProfileComponent)
  },
  {
    path: 'manager/horaires',
    title: 'WeenTime — Horaires équipe',
    data: { title: 'Horaires équipe' },
    loadComponent: () => import('../manager/horaires/manager-horaires.component').then(m => m.ManagerHorairesComponent)
  },
  {
    path: 'manager/presence',
    title: 'WeenTime — Présence équipe',
    data: { title: 'Présence équipe' },
    loadComponent: () => import('../manager/presence/manager-presence.component').then(m => m.ManagerPresenceComponent)
  },

  { path: 'rh', redirectTo: 'rh/dashboard', pathMatch: 'full' },
  {
    path: 'rh/dashboard',
    title: 'WeenTime - Tableau de bord',
    data: { title: 'Tableau de bord' },
    loadComponent: () => import('../rh/dashboard/rh-dashboard.component').then(m => m.RhDashboardComponent),
    providers: [
      {
        provide: LUCIDE_ICONS,
        multi: true,
        useValue: new LucideIconProvider({
          UserPlus,
          ChevronRight,
          Users,
          UserCheck,
          Calendar,
          BarChart,
          TrendingUp,
          TrendingDown
        })
      }
    ]
  },
  {
    path: 'rh/analytics',
    title: 'WeenTime — Analytics',
    data: { title: 'Analytics' },
    loadComponent: () => import('../rh/analytics/rh-analytics.component').then(m => m.RhAnalyticsComponent),
    providers: [
      {
        provide: LUCIDE_ICONS,
        multi: true,
        useValue: new LucideIconProvider({
          Activity,
          UserX,
          Timer,
          Inbox,
          Network,
          Briefcase,
          BarChart
        })
      }
    ]
  },
  {
    path: 'rh/requests',
    title: 'WeenTime - Demandes RH',
    data: { title: 'Demandes RH' },
    loadComponent: () => import('../rh/requests/rh-requests.component').then(m => m.RhRequestsComponent)
  },
  {
    path: 'rh/analytics',
    title: 'WeenTime - Analytics RH',
    data: { title: 'Analytics RH' },
    loadComponent: () => import('../rh/analytics/rh-analytics.component').then(m => m.RhAnalyticsComponent)
  },
  {
    path: 'rh/leave-balances',
    title: 'WeenTime - Soldes conges',
    data: { title: 'Soldes conges' },
    loadComponent: () => import('../rh/leave-balances/rh-leave-balances.component').then(m => m.RhLeaveBalancesComponent)
  },
  {
    path: 'rh/structure',
    title: 'WeenTime - Structure',
    data: { title: 'Structure' },
    loadComponent: () => import('../rh/structure/rh-structure.component').then(m => m.RhStructureComponent),
    providers: [
      {
        provide: LUCIDE_ICONS,
        multi: true,
        useValue: new LucideIconProvider({
          Building,
          GitBranch,
          Users,
          UserCog,
          Building2,
          AlertCircle,
          Plus,
          Edit2,
          Trash2,
          AlertTriangle,
          Loader2,
          ShieldOff,
          ShieldCheck,
          Search,
          X,
          Check,
          ChevronLeft,
          ChevronRight,
          FileText,
          Info,
          User,
          Mail,
          Phone,
          Briefcase,
          ArrowRight,
          ArrowLeft,
          Shield,
          KeyRound,
          Copy,
          Zap,
          UserCheck,
          ExternalLink,
          UserPlus,
          ChevronDown,
          Calendar
        })
      }
    ],
    children: [
      { path: '', redirectTo: 'departements', pathMatch: 'full' },
      {
        path: 'departements',
        loadComponent: () => import('../rh/structure/components/departements/departements.component').then(m => m.DepartementsComponent)
      },
      {
        path: 'equipes',
        loadComponent: () => import('../rh/structure/components/equipes/equipes.component').then(m => m.EquipesComponent)
      },
      {
        path: 'employes',
        loadComponent: () => import('../rh/structure/components/employes/employes.component').then(m => m.EmployesComponent)
      },
      {
        path: 'managers',
        loadComponent: () => import('../rh/structure/components/managers/managers.component').then(m => m.ManagersComponent)
      }
    ]
  },
  { path: 'rh/employes', redirectTo: 'rh/structure/employes', pathMatch: 'full' },
  {
    path: 'rh/conges',
    title: 'WeenTime — Gestion des congés',
    data: { title: 'Gestion des congés' },
    loadComponent: () => import('../rh/conges/rh-conges.component').then(m => m.RhCongesComponent),
    providers: [
      {
        provide: LUCIDE_ICONS,
        multi: true,
        useValue: new LucideIconProvider({
          ChevronDown, ChevronLeft, ChevronRight, Filter,
          Calendar, Clock, Check, X, Search, Plus,
          CheckCircle, XCircle, AlertCircle, FileText
        })
      }
    ]
  },
  {
    path: 'rh/teletravail',
    title: 'WeenTime — Télétravail',
    data: { title: 'Télétravail' },
    loadComponent: () => import('../rh/teletravail/rh-teletravail.component').then(m => m.RhTeletravailComponent),
    providers: [
      {
        provide: LUCIDE_ICONS,
        multi: true,
        useValue: new LucideIconProvider({
          Clock,
          CheckCircle,
          XCircle,
          TrendingUp,
          BarChart,
          Award,
          Search,
          Download,
          ChevronLeft,
          ChevronRight,
          Calendar,
          Check,
          X
        })
      }
    ]
  },
  {
    path: 'rh/documents',
    title: 'WeenTime — Gestion des documents',
    data: { title: 'Gestion des documents' },
    loadComponent: () => import('../rh/documents/rh-documents.component').then(m => m.RhDocumentsComponent)
  },
  {
    path: 'rh/absences',
    title: 'WeenTime — Absences',
    data: { title: 'Absences' },
    loadComponent: () => import('../rh/absences/rh-absences.component').then(m => m.RhAbsencesComponent),
    providers: [
      {
        provide: LUCIDE_ICONS,
        multi: true,
        useValue: new LucideIconProvider({
          Calendar,
          Clock,
          CheckCircle,
          XCircle,
          Search,
          Filter,
          Plus,
          FileText,
          AlertCircle,
          Check,
          X,
          ChevronLeft,
          ChevronRight
        })
      }
    ]
  },
  {
    path: 'rh/autorisations',
    title: 'WeenTime — Gestion autorisations',
    data: { title: 'Gestion autorisations' },
    loadComponent: () => import('../rh/autorisation/rh-autorisation.component').then(m => m.RhAutorisationComponent)
  },
  {
    path: 'rh/parametres',
    title: 'WeenTime — Paramètres RH',
    data: { title: 'Paramètres RH' },
    loadComponent: () => import('../rh/parametres/rh-parametres.component').then(m => m.RhParametresComponent),
    providers: [
      {
        provide: LUCIDE_ICONS,
        multi: true,
        useValue: new LucideIconProvider({
          Settings,
          Tent,
          PiggyBank,
          UserX,
          Clock,
          FileText,
          Plus,
          Pencil,
          Trash2,
          Check,
          X,
          AlertCircle,
          FolderOpen,
          ChevronDown,
          Loader2,
          Wallet,
          History,
          Database,
          UserPlus,
          AlertTriangle,
          Search,
          ChevronLeft,
          ChevronRight
        })
      }
    ]
  },
  {
    path: 'rh/horaires',
    title: 'WeenTime — Horaires de travail',
    data: { title: 'Horaires de travail' },
    loadComponent: () => import('../rh/horaires/rh-horaires.component').then(m => m.RhHorairesComponent),
    providers: [
      {
        provide: LUCIDE_ICONS,
        multi: true,
        useValue: new LucideIconProvider({
          ChevronDown, ChevronLeft, ChevronRight, Filter,
          Clock, Plus, Edit2, Trash2, Check, X,
          Search, Settings, Calendar, AlertCircle
        })
      }
    ]
  },
  {
    path: 'rh/horaires/nouveau',
    title: 'WeenTime — Nouvel horaire',
    data: { title: 'Nouvel horaire' },
    loadComponent: () => import('../rh/horaires/rh-horaire-form/rh-horaire-form.component').then(m => m.RhHoraireFormComponent)
  },
  {
    path: 'rh/horaires/:id/modifier',
    title: 'WeenTime — Modifier horaire',
    data: { title: 'Modifier horaire' },
    loadComponent: () => import('../rh/horaires/rh-horaire-form/rh-horaire-form.component').then(m => m.RhHoraireFormComponent)
  },
  {
    path: 'rh/horaires/affecter',
    title: 'WeenTime — Affectation horaire',
    data: { title: 'Affectation horaire' },
    loadComponent: () => import('../rh/horaires/rh-horaire-assign/rh-horaire-assign.component').then(m => m.RhHoraireAssignComponent)
  },
  {
    path: 'rh/presence',
    title: 'WeenTime - Pointage',
    data: { title: 'Pointage' },
    loadComponent: () => import('../employee/presence/presence.component').then(m => m.PresenceComponent)
  },
  {
    path: 'rh/conges-validation',
    title: 'WeenTime - Validation conges',
    data: { title: 'Validation conges' },
    redirectTo: 'rh/requests',
    pathMatch: 'full'
  },
  {
    path: 'rh/absences-validation',
    title: 'WeenTime - Validation absences',
    data: { title: 'Validation absences' },
    redirectTo: 'rh/requests',
    pathMatch: 'full'
  },
  {
    path: 'rh/profil',
    title: 'WeenTime - Mon profil',
    data: { title: 'Mon profil' },
    loadComponent: () => import('../shared-profile/profile.component').then(m => m.ProfileComponent)
  },

  { path: 'admin', redirectTo: 'admin/dashboard', pathMatch: 'full' },
  {
    path: 'admin/dashboard',
    title: 'WeenTime - Tableau de bord',
    data: { title: 'Tableau de bord' },
    canActivate: [adminGuard],
    loadComponent: () => import('../admin/dashboard/admin-dashboard.component').then(m => m.AdminDashboardComponent)
  },
  {
    path: 'admin/users',
    title: 'WeenTime - Utilisateurs',
    data: { title: 'Utilisateurs' },
    canActivate: [adminGuard],
    loadComponent: () => import('../admin/users/admin-users.component').then(m => m.AdminUsersComponent)
  },
  {
    path: 'admin/entreprises',
    title: 'WeenTime - Entreprises',
    data: { title: 'Entreprises' },
    canActivate: [adminGuard],
    loadComponent: () => import('../admin/entreprises/entreprises.component').then(m => m.EntreprisesComponent)
  },
  {
    path: 'admin/roles',
    title: 'WeenTime - Roles',
    data: { title: 'Roles' },
    canActivate: [adminGuard],
    loadComponent: () => import('../admin/roles/admin-roles.component').then(m => m.AdminRolesComponent)
  },
  {
    path: 'admin/parametres',
    title: 'WeenTime - Parametres',
    data: { title: 'Parametres' },
    canActivate: [adminGuard],
    loadComponent: () => import('../admin/parametres/admin-parametres.component').then(m => m.AdminParametresComponent)
  },
  {
    path: 'admin/analytics',
    title: 'WeenTime - Analytics',
    data: { title: 'Analytics' },
    canActivate: [adminGuard],
    loadComponent: () => import('../admin/analytics/admin-analytics.component').then(m => m.AdminAnalyticsComponent)
  },
  {
    path: 'admin/departements',
    title: 'WeenTime - Departements',
    data: { title: 'Departements' },
    canActivate: [adminGuard],
    loadComponent: () => import('../admin/departements/admin-departements.component').then(m => m.AdminDepartementsComponent)
  },
  {
    path: 'admin/equipes',
    title: 'WeenTime - Equipes',
    data: { title: 'Equipes' },
    canActivate: [adminGuard],
    loadComponent: () => import('../admin/equipes/admin-equipes.component').then(m => m.AdminEquipesComponent)
  },
  {
    path: 'admin/settings',
    title: 'WeenTime - Parametres',
    data: { title: 'Parametres' },
    canActivate: [adminGuard],
    loadComponent: () => import('../admin/settings/admin-settings.component').then(m => m.AdminSettingsComponent)
  },
  {
    path: 'admin/presence',
    title: 'WeenTime - Pointage',
    data: { title: 'Pointage' },
    canActivate: [adminGuard],
    loadComponent: () => import('../employee/presence/presence.component').then(m => m.PresenceComponent)
  },
  {
    path: 'admin/rh-owners',
    title: 'WeenTime - Gestionnaires RH',
    data: { title: 'Gestionnaires RH' },
    canActivate: [adminGuard],
    loadComponent: () => import('../admin/rh-owner/admin-rh-owner.component').then(m => m.AdminRhOwnerComponent)
  },
  {
    path: 'admin/profil',
    title: 'WeenTime - Mon profil',
    data: { title: 'Mon profil' },
    canActivate: [adminGuard],
    loadComponent: () => import('../shared-profile/profile.component').then(m => m.ProfileComponent)
  }
];

