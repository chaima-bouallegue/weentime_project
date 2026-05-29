import {
  Component,
  inject,
  signal,
  computed,
  effect,
  ChangeDetectionStrategy,
  HostListener,
  ElementRef,
  ViewChild,
  Pipe,
  PipeTransform
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { trigger, transition, style, animate } from '@angular/animations';
import {
  LucideAngularModule,
  Plus,
  Search,
  Eye,
  Edit,
  MoreHorizontal,
  X,
  Building2,
  Users,
  Settings,
  Lock,
  Activity,
  FileText,
  Check,
  Download,
  Pause,
  Play,
  Trash2,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Calendar,
  AlertCircle,
  Copy
} from 'lucide-angular';
import { MOCK_ENTERPRISES, Enterprise, TableFilters } from './mock-enterprises';

@Pipe({
  name: 'relativeTime',
  standalone: true
})
export class RelativeTimePipe implements PipeTransform {
  transform(value: Date | string | null | undefined): string {
    if (!value) return '';
    const date = typeof value === 'string' ? new Date(value) : value;
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
      return diffMins <= 1 ? "À l'instant" : `Il y a ${diffMins} min`;
    } else if (diffHours < 24) {
      return `Il y a ${diffHours} h`;
    } else if (diffDays === 1) {
      return 'Hier';
    } else if (diffDays < 30) {
      return `Il y a ${diffDays} j`;
    } else {
      const months = Math.floor(diffDays / 30);
      return `Il y a ${months} mois`;
    }
  }
}

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'info' | 'warning' | 'error';
}

@Component({
  selector: 'app-entreprises',
  standalone: true,
  imports: [
    CommonModule,   // ← garde pour NgClass, DatePipe, NgStyle
    FormsModule,
    LucideAngularModule,
    RelativeTimePipe
    // ✅ NgIf et NgFor SUPPRIMÉS : on utilise @if/@for natif Angular 17
  ],
  templateUrl: './entreprises.component.html',
  styleUrl: './entreprises.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('drawerSlide', [
      transition(':enter', [
        style({ transform: window.innerWidth < 768 ? 'translateY(100%)' : 'translateX(100%)' }),
        animate('300ms cubic-bezier(0.16, 1, 0.3, 1)', style({ transform: window.innerWidth < 768 ? 'translateY(0)' : 'translateX(0)' }))
      ]),
      transition(':leave', [
        animate('200ms cubic-bezier(0.7, 0, 0.84, 0)', style({ transform: window.innerWidth < 768 ? 'translateY(100%)' : 'translateX(100%)' }))
      ])
    ]),
    trigger('bannerFade', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-10px)' }),
        animate('200ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('150ms ease-in', style({ opacity: 0, transform: 'translateY(-10px)' }))
      ])
    ]),
    trigger('toastFade', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(20px) scale(0.95)' }),
        animate('150ms ease-out', style({ opacity: 1, transform: 'translateY(0) scale(1)' }))
      ]),
      transition(':leave', [
        animate('100ms ease-in', style({ opacity: 0, scale: 0.95 }))
      ])
    ])
  ]
})
export class EntreprisesComponent {
  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  // ✅ FIX : Expose Math au template Angular
  protected readonly Math = Math;

  // Lucide Icons
  readonly iconPlus = Plus;
  readonly iconSearch = Search;
  readonly iconEye = Eye;
  readonly iconEdit = Edit;
  readonly iconMore = MoreHorizontal;
  readonly iconX = X;
  readonly iconBuilding = Building2;
  readonly iconUsers = Users;
  readonly iconSettings = Settings;
  readonly iconLock = Lock;
  readonly iconActivity = Activity;
  readonly iconFileText = FileText;
  readonly iconCheck = Check;
  readonly iconDownload = Download;
  readonly iconPause = Pause;
  readonly iconPlay = Play;
  readonly iconTrash = Trash2;
  readonly iconArrowLeft = ArrowLeft;
  readonly iconArrowRight = ArrowRight;
  readonly iconRefresh = RefreshCw;
  readonly iconCalendar = Calendar;
  readonly iconAlert = AlertCircle;
  readonly iconCopy = Copy;

  // Signals
  enterprises = signal<Enterprise[]>(MOCK_ENTERPRISES);
  isLoading = signal(false);
  selectedEnterprise = signal<Enterprise | null>(null);
  isMobile = signal(window.innerWidth < 768);

  // Filters and Pagination Signals
  searchQuery = signal('');
  filterStatus = signal<'ALL' | 'ACTIVE' | 'CLOSED' | 'SUSPENDED'>('ALL');
  currentPage = signal(1);
  pageSize = signal(10);

  // Selection
  selectedIds = signal<Set<string>>(new Set());

  // UI state
  activeTab = signal<string>('overview');
  isCreateModalOpen = signal(false);
  isEditMode = signal(false);

  // Toast notifications
  toasts = signal<Toast[]>([]);
  private toastIdCounter = 0;

  // Create / Edit Form Model
  formModel = {
    id: '',
    name: '',
    sector: '',
    siret: '',
    employeesCount: 10,
    status: 'ACTIVE' as 'ACTIVE' | 'CLOSED' | 'SUSPENDED'
  };

  private searchTimeout: any;

  // Computeds
  filteredEnterprises = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const status = this.filterStatus();

    return this.enterprises().filter(e => {
      const matchesSearch = !query ||
        e.name.toLowerCase().includes(query) ||
        e.siret.includes(query) ||
        e.sector.toLowerCase().includes(query);

      const matchesStatus = status === 'ALL' || e.status === status;

      return matchesSearch && matchesStatus;
    });
  });

  paginatedEnterprises = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    const end = start + this.pageSize();
    return this.filteredEnterprises().slice(start, end);
  });

  totalPages = computed(() =>
    Math.ceil(this.filteredEnterprises().length / this.pageSize()) || 1
  );

  isAllSelected = computed(() => {
    const paginated = this.paginatedEnterprises();
    if (paginated.length === 0) return false;
    return paginated.every(e => this.selectedIds().has(e.id));
  });

  totalCount = computed(() => this.enterprises().length);
  activeCount = computed(() => this.enterprises().filter(e => e.status === 'ACTIVE').length);
  closedCount = computed(() => this.enterprises().filter(e => e.status === 'CLOSED').length);
  suspendedCount = computed(() => this.enterprises().filter(e => e.status === 'SUSPENDED').length);

  // Mock activity feed
  recentActivity = [
    { id: 1, type: 'login', description: 'Connexion administrateur RH', date: new Date(Date.now() - 3600000) },
    { id: 2, type: 'module', description: 'Activation du module "Présence"', date: new Date(Date.now() - 17200000) },
    { id: 3, type: 'user', description: 'Ajout de 5 nouveaux collaborateurs', date: new Date(Date.now() - 86400000) },
    { id: 4, type: 'settings', description: 'Mise à jour des règles de congés', date: new Date(Date.now() - 172800000) }
  ];

  constructor() {
    // ✅ Reset page when search or filters change
    effect(() => {
      this.searchQuery();
      this.filterStatus();
      this.currentPage.set(1);
    }, { allowSignalWrites: true });
  }

  // Keyboard listeners
  @HostListener('document:keydown', ['$event'])
  handleKeyboard(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (this.isCreateModalOpen()) {
        this.closeCreateModal();
      } else if (this.selectedEnterprise()) {
        this.closeDrawer();
      }
    }
    if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
      e.preventDefault();
      this.searchInput?.nativeElement?.focus();
    }
    if ((e.key === 'n' || e.key === 'N') && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
      e.preventDefault();
      this.openCreateModal();
    }
  }

  @HostListener('window:resize', [])
  onResize() {
    this.isMobile.set(window.innerWidth < 768);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent) {
    if (!this.selectedEnterprise()) return;
    const clickedElement = e.target as HTMLElement;
    if (
      clickedElement.closest('.drawer-container') ||
      clickedElement.closest('tr') ||
      clickedElement.closest('.modal-container') ||
      clickedElement.closest('.hero-btn') ||
      clickedElement.closest('.toast-container')
    ) {
      return;
    }
    this.closeDrawer();
  }

  // Actions
  refreshData(): void {
    this.isLoading.set(true);
    setTimeout(() => {
      this.isLoading.set(false);
      this.showToast('Données synchronisées avec succès', 'success');
    }, 800);
  }

  onSearchInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      this.searchQuery.set(val);
    }, 300);
  }

  selectStatus(status: 'ALL' | 'ACTIVE' | 'CLOSED' | 'SUSPENDED'): void {
    this.filterStatus.set(status);
  }

  selectEnterprise(ent: Enterprise): void {
    this.selectedEnterprise.set(ent);
    this.activeTab.set('overview');
  }

  closeDrawer(): void {
    this.selectedEnterprise.set(null);
  }

  // Pagination
  prevPage(): void {
    if (this.currentPage() > 1) {
      this.currentPage.update(p => p - 1);
      this.scrollToTableHeader();
    }
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update(p => p + 1);
      this.scrollToTableHeader();
    }
  }

  setPage(page: number): void {
    this.currentPage.set(page);
    this.scrollToTableHeader();
  }

  onPageSizeChange(event: Event): void {
    const size = +(event.target as HTMLSelectElement).value;
    this.pageSize.set(size);
    this.currentPage.set(1);
    this.scrollToTableHeader();
  }

  private scrollToTableHeader(): void {
    const element = document.querySelector('table');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // Selection
  toggleSelectAll(): void {
    const currentIds = this.selectedIds();
    const paginated = this.paginatedEnterprises();
    const newSelection = new Set(currentIds);
    if (this.isAllSelected()) {
      paginated.forEach(e => newSelection.delete(e.id));
    } else {
      paginated.forEach(e => newSelection.add(e.id));
    }
    this.selectedIds.set(newSelection);
  }

  toggleSelect(id: string, event: Event): void {
    event.stopPropagation();
    const currentIds = this.selectedIds();
    const newSelection = new Set(currentIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    this.selectedIds.set(newSelection);
  }

  // Mass Actions
  exportSelectedCSV(): void {
    const count = this.selectedIds().size;
    this.showToast(`Export de ${count} entreprises au format CSV initié.`, 'info');
    this.selectedIds.set(new Set());
  }

  suspendSelected(): void {
    const count = this.selectedIds().size;
    const ids = this.selectedIds();
    // ✅ FIX : 'as const' pour préserver le type union littéral
    this.enterprises.update(list =>
      list.map(e => ids.has(e.id) ? { ...e, status: 'SUSPENDED' as const } : e)
    );
    this.showToast(`${count} entreprises ont été suspendues.`, 'warning');
    this.selectedIds.set(new Set());
    this.closeDrawer();
  }

  deleteSelected(): void {
    const count = this.selectedIds().size;
    const ids = this.selectedIds();
    this.enterprises.update(list => list.filter(e => !ids.has(e.id)));
    this.showToast(`${count} entreprises ont été supprimées définitivement.`, 'error');
    this.selectedIds.set(new Set());
    this.closeDrawer();
  }

  // Modal
  openCreateModal(): void {
    this.isEditMode.set(false);
    this.formModel = { id: '', name: '', sector: '', siret: '', employeesCount: 10, status: 'ACTIVE' };
    this.isCreateModalOpen.set(true);
  }

  openEditModal(ent: Enterprise, event?: Event): void {
    if (event) event.stopPropagation();
    this.isEditMode.set(true);
    this.formModel = {
      id: ent.id,
      name: ent.name,
      sector: ent.sector,
      siret: ent.siret,
      employeesCount: ent.employeesCount,
      status: ent.status
    };
    this.isCreateModalOpen.set(true);
  }

  closeCreateModal(): void {
    this.isCreateModalOpen.set(false);
  }

  saveEnterprise(): void {
    if (!this.formModel.name || !this.formModel.sector || !this.formModel.siret) {
      this.showToast('Veuillez remplir tous les champs obligatoires.', 'error');
      return;
    }

    if (this.isEditMode()) {
      this.enterprises.update(list =>
        list.map(e => e.id === this.formModel.id ? {
          ...e,
          name: this.formModel.name,
          sector: this.formModel.sector,
          siret: this.formModel.siret,
          employeesCount: this.formModel.employeesCount,
          status: this.formModel.status,
          initials: this.formModel.name.substring(0, 2).toUpperCase()
        } : e)
      );
      this.showToast(`Entreprise "${this.formModel.name}" mise à jour.`, 'success');

      const currentSelected = this.selectedEnterprise();
      if (currentSelected && currentSelected.id === this.formModel.id) {
        // ✅ FIX : cast explicite pour préserver le type Enterprise
        const updatedEnterprise: Enterprise = {
          ...currentSelected,
          name: this.formModel.name,
          sector: this.formModel.sector,
          siret: this.formModel.siret,
          employeesCount: this.formModel.employeesCount,
          status: this.formModel.status
        };
        this.selectedEnterprise.set(updatedEnterprise);
      }
    } else {
      const colors = ['#6366F1', '#8B5CF6', '#EC4899', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#06B6D4'];
      const newEnt: Enterprise = {
        id: `WEEN-${Math.random().toString(16).substring(2, 14).toUpperCase()}`,
        name: this.formModel.name,
        initials: this.formModel.name.substring(0, 2).toUpperCase(),
        avatarColor: colors[Math.floor(Math.random() * colors.length)],
        sector: this.formModel.sector,
        employeesCount: this.formModel.employeesCount,
        status: this.formModel.status,
        lastActivity: new Date(),
        siret: this.formModel.siret,
        createdAt: new Date(),
        activeUsers: Math.min(this.formModel.employeesCount, Math.floor(this.formModel.employeesCount * 0.8)),
        hrManagers: 1,
        modulesEnabled: 3,
        lastLogin: new Date()
      };
      this.enterprises.update(list => [newEnt, ...list]);
      this.showToast(`Nouvelle entreprise "${newEnt.name}" créée.`, 'success');
    }
    this.closeCreateModal();
  }

  toggleStatus(ent: Enterprise, event?: Event): void {
    if (event) event.stopPropagation();
    // ✅ FIX : type union explicite pour nextStatus
    const nextStatus: Enterprise['status'] = ent.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    const updated: Enterprise = { ...ent, status: nextStatus };

    this.enterprises.update(list =>
      list.map(e => e.id === ent.id ? updated : e)
    );

    // Mise à jour du drawer si l'entreprise est sélectionnée
    if (this.selectedEnterprise()?.id === ent.id) {
      this.selectedEnterprise.set(updated);
    }

    this.showToast(`Statut de ${ent.name} changé en ${nextStatus === 'ACTIVE' ? 'Actif' : 'Suspendu'}.`, 'info');
  }

  deleteEnterprise(ent: Enterprise, event?: Event): void {
    if (event) event.stopPropagation();
    this.enterprises.update(list => list.filter(e => e.id !== ent.id));
    if (this.selectedEnterprise()?.id === ent.id) {
      this.closeDrawer();
    }
    this.showToast(`Entreprise "${ent.name}" supprimée définitivement.`, 'error');
  }

  // Toast Helpers
  showToast(message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info'): void {
    const id = this.toastIdCounter++;
    this.toasts.update(list => [...list, { id, message, type }]);
    setTimeout(() => this.removeToast(id), 4000);
  }

  removeToast(id: number): void {
    this.toasts.update(list => list.filter(t => t.id !== id));
  }
  clearSearch(): void {
    this.searchQuery.set('');
    this.searchInput?.nativeElement?.focus();
  }
  copyToClipboard(text: string, event: Event): void {
    event.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      this.showToast('Identifiant copié dans le presse-papiers', 'success');
    }).catch(() => {
      this.showToast("Erreur lors de la copie de l'identifiant", 'error');
    });
  }
}