import {
    Component,
    inject,
    signal,
    computed,
    HostListener,
    ElementRef,
    ViewChild,
    Pipe,
    PipeTransform,
    DestroyRef,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { trigger, transition, style, animate } from '@angular/animations';
import {
    LucideAngularModule,
    Plus, Search, Eye, Edit, MoreHorizontal, X,
    Building2, Users, Settings, Lock, Activity, FileText,
    Check, Download, Pause, Play, Trash2, ArrowRight, ArrowLeft,
    RefreshCw, Calendar, AlertCircle, Copy, Shield, History,
    Mail, Phone, Globe, MapPin, Briefcase, Upload, Image
} from 'lucide-angular';
import {
    Subject,
    debounceTime,
    distinctUntilChanged,
    switchMap,
    finalize,
    EMPTY,
    catchError
} from 'rxjs';

import { HttpErrorResponse } from '@angular/common/http';

import {
    Enterprise,
    EntrepriseAccessControl,
    EntrepriseAccessControlHistory,
    RolePermission,
} from './mock-enterprises';

import { EntrepriseService, EntrepriseRequest } from './entreprise.service';

// ─────────────────────────────────────────────────────────
// Pipe relativeTime
// ─────────────────────────────────────────────────────────

@Pipe({ name: 'relativeTime', standalone: true })
export class RelativeTimePipe implements PipeTransform {
    transform(value: Date | string | null | undefined): string {
        if (!value) return '—';
        const date = typeof value === 'string' ? new Date(value) : value;
        const diffMs = Date.now() - date.getTime();
        const diffMins = Math.floor(diffMs / 60_000);
        const diffHours = Math.floor(diffMs / 3_600_000);
        const diffDays = Math.floor(diffMs / 86_400_000);
        if (diffMins < 60) return diffMins <= 1 ? "À l'instant" : `Il y a ${diffMins} min`;
        if (diffHours < 24) return `Il y a ${diffHours} h`;
        if (diffDays === 1) return 'Hier';
        if (diffDays < 30) return `Il y a ${diffDays} j`;
        return `Il y a ${Math.floor(diffDays / 30)} mois`;
    }
}

// ─────────────────────────────────────────────────────────
// Toast Interface
// ─────────────────────────────────────────────────────────

interface Toast {
    id: number;
    message: string;
    type: 'success' | 'info' | 'warning' | 'error';
}

// ─────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────

@Component({
    selector: 'app-entreprises',
    standalone: true,
    imports: [CommonModule, FormsModule, LucideAngularModule, RelativeTimePipe],
    templateUrl: './entreprises.component.html',
    styleUrl: './entreprises.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush, // <-- Correction ici !
    animations: [
        trigger('drawerSlide', [
            transition(':enter', [
                style({ transform: window.innerWidth < 768 ? 'translateY(100%)' : 'translateX(100%)' }),
                animate('300ms cubic-bezier(0.16, 1, 0.3, 1)',
                    style({ transform: window.innerWidth < 768 ? 'translateY(0)' : 'translateX(0)' }))
            ]),
            transition(':leave', [
                animate('200ms cubic-bezier(0.7, 0, 0.84, 0)',
                    style({ transform: window.innerWidth < 768 ? 'translateY(100%)' : 'translateX(100%)' }))
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
                animate('100ms ease-in', style({ opacity: 0, transform: 'scale(0.95)' }))
            ])
        ])
    ]
})
export class EntreprisesComponent {

    @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

    protected readonly Math = Math;

    // ── Services ──────────────────────────────────────────────
    private readonly svc = inject(EntrepriseService);
    private readonly destroyRef = inject(DestroyRef);
    private readonly cdr = inject(ChangeDetectorRef);

    // ── Icons ─────────────────────────────────────────────────
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
    readonly iconShield = Shield;
    readonly iconHistory = History;
    readonly iconMail = Mail;
    readonly iconPhone = Phone;
    readonly iconGlobe = Globe;
    readonly iconMapPin = MapPin;
    readonly iconBriefcase = Briefcase;
    readonly iconUpload = Upload;
    readonly iconImage = Image;

    // ── Server-side pagination state ─────────────────────────
    enterprises = signal<Enterprise[]>([]);
    totalElements = signal(0);
    totalPages_ = signal(1);
    isLoading = signal(false);

    // Stats (single query from backend)
    statsTotal = signal(0);
    statsActive = signal(0);
    statsSuspended = signal(0);
    statsClosed = signal(0);

    // ── Filters & Signaux Réactifs ─────────────────────────────
    searchQuery = signal('');
    filterStatus = signal<'ALL' | 'ACTIVE' | 'SUSPENDED' | 'CLOSED'>('ALL');
    currentPage = signal(1);   // 1-indexed pour l'IHM
    pageSize = signal(10);

    // Flux de Debounce pour l'input de recherche
    private readonly search$ = new Subject<string>();

    // ── Selection ────────────────────────────────────────────
    selectedIds = signal<Set<string>>(new Set());

    // ── Drawer ───────────────────────────────────────────────
    selectedEnterprise = signal<Enterprise | null>(null);
    activeTab = signal<'overview' | 'users' | 'activity' | 'access-control' | 'settings'>('overview');

    // ── Access control ────────────────────────────────────────
    accessControl = signal<EntrepriseAccessControl | null>(null);
    accessControlHistory = signal<EntrepriseAccessControlHistory[]>([]);
    acLoading = signal(false);
    acEditMode = signal(false);
    acDraft = signal<RolePermission[]>([]);

    // ── Modal ─────────────────────────────────────────────────
    isCreateModalOpen = signal(false);
    isEditMode = signal(false);
    isSaving = signal(false);

    formModel: EntrepriseRequest & {
        _uiId?: string;
        adresse_rue?: string;
        adresse_code_postal?: string;
        adresse_ville?: string;
        adresse_pays?: string;
    } = {
        nom: '',
        siret: '',
        secteur: '',
        employeesCount: 10,
        status: 'ACTIVE',
        logo: '',
        email: '',
        telephone: '',
        siteWeb: '',
        adresse: '',
        adresse_rue: '',
        adresse_code_postal: '',
        adresse_ville: '',
        adresse_pays: ''
    };

    // ── Toasts ───────────────────────────────────────────────
    toasts = signal<Toast[]>([]);
    private toastId = 0;

    // ── Computed ─────────────────────────────────────────────
    totalCount = computed(() => this.statsTotal());
    activeCount = computed(() => this.statsActive());
    suspendedCount = computed(() => this.statsSuspended());
    closedCount = computed(() => this.statsClosed());

    isAllSelected = computed(() => {
        const list = this.enterprises();
        if (!list.length) return false;
        return list.every(e => this.selectedIds().has(e.id));
    });

    totalPages = computed(() => this.totalPages_());

    pageFrom = computed(() => (this.currentPage() - 1) * this.pageSize() + 1);
    pageTo = computed(() => Math.min(this.currentPage() * this.pageSize(), this.totalElements()));

    pageNumbers = computed(() => Array.from({ length: this.totalPages() }, (_, i) => i + 1));

    // ── Mock activity ────────────────────────────────────────
    recentActivity = [
        { id: 1, description: 'Connexion administrateur RH', date: new Date(Date.now() - 3_600_000) },
        { id: 2, description: 'Activation du module "Présence"', date: new Date(Date.now() - 17_200_000) },
        { id: 3, description: 'Ajout de 5 nouveaux collaborateurs', date: new Date(Date.now() - 86_400_000) },
        { id: 4, description: 'Mise à jour des règles de congés', date: new Date(Date.now() - 172_800_000) },
    ];

    // ── Init (Moteur Réactif Unifié) ─────────────────────────
    constructor() {
        // 1. Gestion Debounce de la saisie clavier
        this.search$.pipe(
            debounceTime(300),
            distinctUntilChanged(),
            takeUntilDestroyed(this.destroyRef)
        ).subscribe(query => {
            this.searchQuery.set(query);
            this.currentPage.set(1); // Retour automatique en page 1
        });

        // 2. Écoute globale et centralisée des critères (Filtres, Recherche, Pagination)
        toObservable(computed(() => ({
            status: this.filterStatus(),
            query: this.searchQuery(),
            page: this.currentPage(),
            size: this.pageSize()
        }))).pipe(
            switchMap(params => {
                this.isLoading.set(true);
                return this.svc.getAll(params.status, params.query, params.page - 1, params.size).pipe(
                    catchError((err: HttpErrorResponse) => {
                        if (err.status === 0 || err.status >= 500) {
                            this.enterprises.set([]);
                            this.totalElements.set(0);
                            this.totalPages_.set(1);
                            return EMPTY;
                        }
                        this.showToast(err.message, 'error');
                        return EMPTY;
                    }),
                    finalize(() => this.isLoading.set(false))
                );
            }),
            takeUntilDestroyed(this.destroyRef)
        ).subscribe(page => {
            this.enterprises.set(page.content);
            this.totalElements.set(page.totalElements);
            this.totalPages_.set(page.totalPages || 1);
        });

        // Chargement initial des statistiques globales
        this.loadStats();
    }

    // ── Data loading ─────────────────────────────────────────

    loadStats(): void {
        this.svc.getStats()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: s => {
                    this.statsTotal.set(s.total);
                    this.statsActive.set(s.active);
                    this.statsSuspended.set(s.suspended);
                    this.statsClosed.set(s.closed);
                },
                error: () => { } // Non-bloquant
            });
    }

    refreshData(): void {
        // Forcer un rechargement en rafraîchissant les stats et en provoquant une mise à jour d'état cyclique
        this.loadStats();
        this.currentPage.update(p => p);
        this.showToast('Données synchronisées avec succès', 'success');
    }

    // ── Search ───────────────────────────────────────────────

    onSearchInput(event: Event): void {
        this.search$.next((event.target as HTMLInputElement).value);
    }

    clearSearch(): void {
        this.searchQuery.set('');
        this.search$.next('');
        this.searchInput?.nativeElement?.focus();
    }

    // ── Filters ───────────────────────────────────────────────

    selectStatus(status: 'ALL' | 'ACTIVE' | 'SUSPENDED' | 'CLOSED'): void {
        this.filterStatus.set(status);
        this.currentPage.set(1);
    }

    // ── Pagination ────────────────────────────────────────────

    prevPage(): void {
        if (this.currentPage() > 1) {
            this.currentPage.update(p => p - 1);
        }
    }

    nextPage(): void {
        if (this.currentPage() < this.totalPages()) {
            this.currentPage.update(p => p + 1);
        }
    }

    setPage(page: number): void {
        this.currentPage.set(page);
    }

    onPageSizeChange(event: Event): void {
        this.pageSize.set(+(event.target as HTMLSelectElement).value);
        this.currentPage.set(1);
    }

    // ── Selection ────────────────────────────────────────────

    toggleSelectAll(): void {
        const list = this.enterprises();
        const sel = new Set(this.selectedIds());
        if (this.isAllSelected()) {
            list.forEach(e => sel.delete(e.id));
        } else {
            list.forEach(e => sel.add(e.id));
        }
        this.selectedIds.set(sel);
    }

    toggleSelect(id: string, event: Event): void {
        event.stopPropagation();
        const sel = new Set(this.selectedIds());
        sel.has(id) ? sel.delete(id) : sel.add(id);
        this.selectedIds.set(sel);
    }

    // ── Batch Actions & Export CSV Fonctionnel ─────────────────

    exportSelectedCSV(): void {
        const selectedSet = this.selectedIds();
        if (selectedSet.size === 0) {
            this.showToast('Aucune entreprise sélectionnée pour l\'export.', 'warning');
            return;
        }

        const dataToExport = this.enterprises().filter(e => selectedSet.has(e.id));
        if (dataToExport.length === 0) {
            this.showToast('Données indisponibles localement.', 'error');
            return;
        }

        const headers = ['ID', 'Nom', 'SIRET', 'Secteur', 'Employés', 'Statut'];
        const csvRows = [
            headers.join(','),
            ...dataToExport.map(e => [
                `"${e.id}"`,
                `"${e.nom || e.name || ''}"`,
                `"${e.siret || ''}"`,
                `"${e.secteur || e.sector || ''}"`,
                e.employeesCount,
                `"${e.status}"`
            ].join(','))
        ];

        const csvContent = '\uFEFF' + csvRows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', `export_entreprises_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        this.showToast(`Export de ${selectedSet.size} entreprise(s) effectué.`, 'success');
        this.selectedIds.set(new Set());
    }

    suspendSelected(): void {
        const ids = [...this.selectedIds()];
        this.svc.changeStatusBatch(ids, 'SUSPENDED')
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: () => {
                    this.showToast(`${ids.length} entreprises suspendues.`, 'warning');
                    this.selectedIds.set(new Set());
                    this.loadStats();
                    this.currentPage.update(p => p);
                },
                error: err => this.showToast(err.message, 'error'),
            });
    }

    deleteSelected(): void {
        const ids = [...this.selectedIds()];
        this.svc.deleteBatch(ids)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: () => {
                    this.showToast(`${ids.length} entreprises supprimées.`, 'error');
                    this.selectedIds.set(new Set());
                    this.closeDrawer();
                    this.loadStats();
                    this.currentPage.update(p => p);
                },
                error: err => this.showToast(err.message, 'error'),
            });
    }

    // ── Drawer ───────────────────────────────────────────────

    selectEnterprise(ent: Enterprise): void {
        this.selectedEnterprise.set(ent);
        this.activeTab.set('overview');
        this.accessControl.set(null);
        this.acEditMode.set(false);
    }

    closeDrawer(): void {
        this.selectedEnterprise.set(null);
        this.acEditMode.set(false);
    }

    onTabChange(tab: any): void {
        this.activeTab.set(tab);
        if (tab === 'access-control') {
            this.loadAccessControl();
        }
    }

    // ── Access Control ────────────────────────────────────────

    loadAccessControl(): void {
        const ent = this.selectedEnterprise();
        if (!ent) return;
        this.acLoading.set(true);
        this.svc.getAccessControl(ent.id)
            .pipe(
                finalize(() => this.acLoading.set(false)),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe({
                next: ac => {
                    this.accessControl.set(ac);
                    this.accessControlHistory.set([]);
                },
                error: err => this.showToast(err.message, 'error'),
            });
    }

    enterAcEditMode(): void {
        const ac = this.accessControl();
        if (!ac) return;
        this.acDraft.set(structuredClone(ac.permissions));
        this.acEditMode.set(true);
    }

    cancelAcEdit(): void {
        this.acEditMode.set(false);
        this.acDraft.set([]);
    }

    toggleModule(roleIdx: number, moduleIdx: number): void {
        const draft = structuredClone(this.acDraft());
        draft[roleIdx].modules[moduleIdx].enabled = !draft[roleIdx].modules[moduleIdx].enabled;
        this.acDraft.set(draft);
    }

    saveAccessControl(): void {
        const ent = this.selectedEnterprise();
        const ac = this.accessControl();
        if (!ent || !ac) return;

        const invalid = this.acDraft().find(r => r.modules.every(m => !m.enabled));
        if (invalid) {
            this.showToast(`Le rôle "${invalid.label}" doit avoir au moins un module activé.`, 'warning');
            return;
        }

        this.acLoading.set(true);
        const payload: typeof ac = { ...ac, permissions: this.acDraft() };
        this.svc.updateAccessControl(ent.id, payload)
            .pipe(
                finalize(() => this.acLoading.set(false)),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe({
                next: updated => {
                    this.accessControl.set(updated);
                    this.acEditMode.set(false);
                    this.showToast('Contrôle d\'accès mis à jour.', 'success');
                },
                error: err => this.showToast(err.message, 'error'),
            });
    }

    loadAcHistory(): void {
        const ent = this.selectedEnterprise();
        if (!ent) return;
        this.svc.getAccessControlHistory(ent.id)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: h => this.accessControlHistory.set(h),
                error: err => this.showToast(err.message, 'error'),
            });
    }

    // ── CRUD Modal ────────────────────────────────────────────
 
    openCreateModal(): void {
        this.isEditMode.set(false);
        this.formModel = {
            nom: '',
            siret: '',
            secteur: '',
            employeesCount: 10,
            status: 'ACTIVE',
            logo: '',
            email: '',
            telephone: '',
            siteWeb: '',
            adresse: '',
            adresse_rue: '',
            adresse_code_postal: '',
            adresse_ville: '',
            adresse_pays: ''
        };
        this.isCreateModalOpen.set(true);
    }
 
    openEditModal(ent: Enterprise, event?: Event): void {
        if (event) event.stopPropagation();
        this.isEditMode.set(true);
        this.formModel = {
            _uiId: ent.id,
            nom: ent.nom || ent.name || '',
            siret: ent.siret || '',
            secteur: ent.secteur || ent.sector || '',
            employeesCount: ent.employeesCount,
            status: ent.status,
            logo: ent.logo || '',
            email: ent.email || '',
            telephone: ent.telephone || '',
            siteWeb: ent.siteWeb || '',
            adresse: ent.adresse || '',
            adresse_rue: '',
            adresse_code_postal: '',
            adresse_ville: '',
            adresse_pays: ''
        };

        const addr = ent.adresse || '';
        let rue = '';
        let cp = '';
        let ville = '';
        let pays = '';

        const parts = addr.split(',').map(p => p.trim());
        if (parts.length >= 3) {
            rue = parts[0];
            const cpVille = parts[1].split(' ');
            if (cpVille.length >= 2) {
                cp = cpVille[0];
                ville = cpVille.slice(1).join(' ');
            } else {
                ville = parts[1];
            }
            pays = parts.slice(2).join(', ');
        } else if (parts.length === 2) {
            rue = parts[0];
            const cpVille = parts[1].split(' ');
            if (cpVille.length >= 2) {
                cp = cpVille[0];
                ville = cpVille.slice(1).join(' ');
            } else {
                ville = parts[1];
            }
        } else {
            rue = addr;
        }

        this.formModel.adresse_rue = rue;
        this.formModel.adresse_code_postal = cp;
        this.formModel.adresse_ville = ville;
        this.formModel.adresse_pays = pays;

        this.isCreateModalOpen.set(true);
    }
 
    closeCreateModal(): void {
        this.isCreateModalOpen.set(false);
    }
 
    onLogoFileSelected(event: Event): void {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (file) {
            if (file.size > 1024 * 1024) {
                this.showToast("L'image est trop volumineuse. Taille max : 1 Mo.", 'warning');
                return;
            }
            const reader = new FileReader();
            reader.onload = () => {
                this.formModel.logo = reader.result as string;
                this.cdr.markForCheck();
            };
            reader.readAsDataURL(file);
        }
    }

    removeLogo(): void {
        this.formModel.logo = '';
        this.cdr.markForCheck();
    }

    saveEnterprise(): void {
        const name = this.formModel.nom || '';
        const siret = this.formModel.siret || '';
        const sector = this.formModel.secteur || '';

        if (!name || !siret || !sector) {
            this.showToast('Veuillez remplir tous les champs obligatoires.', 'error');
            return;
        }

        // Reconstruct adresse
        const rue = this.formModel.adresse_rue || '';
        const cp = this.formModel.adresse_code_postal || '';
        const ville = this.formModel.adresse_ville || '';
        const pays = this.formModel.adresse_pays || '';

        let fullAddress = '';
        if (rue) fullAddress += rue;
        if (cp || ville) {
            if (fullAddress) fullAddress += ', ';
            fullAddress += `${cp} ${ville}`.trim();
        }
        if (pays) {
            if (fullAddress) fullAddress += ', ';
            fullAddress += pays;
        }
        this.formModel.adresse = fullAddress;

        this.isSaving.set(true);
        const payload: EntrepriseRequest = {
            nom: name,
            siret: siret,
            secteur: sector,
            employeesCount: this.formModel.employeesCount,
            status: this.formModel.status,
            logo: this.formModel.logo,
            email: this.formModel.email,
            telephone: this.formModel.telephone,
            siteWeb: this.formModel.siteWeb,
            adresse: this.formModel.adresse
        };
 
        if (this.isEditMode()) {
            const id = this.formModel._uiId as string;
            this.svc.update(id, payload)
                .pipe(
                    finalize(() => this.isSaving.set(false)),
                    takeUntilDestroyed(this.destroyRef)
                )
                .subscribe({
                    next: updated => {
                        this.showToast(`Entreprise "${updated.name || updated.nom}" mise à jour.`, 'success');
 
                        // Si l'entreprise modifiée est ouverte dans le drawer, on la met à jour
                        if (this.selectedEnterprise()?.id === id) {
                            this.selectedEnterprise.set(updated);
                        }
 
                        // MISE À JOUR INSTANTANÉE DU TABLEAU POUR ONPUSH
                        this.enterprises.update(list =>
                            list.map(e => e.id === id ? updated : e)
                        );
 
                        this.closeCreateModal();
                        this.loadStats();
                    },
                    error: err => this.showToast(err.message, 'error'),
                });
        } else {
            // Bloc de création d'une nouvelle entreprise
            this.svc.create(payload)
                .pipe(
                    finalize(() => this.isSaving.set(false)),
                    takeUntilDestroyed(this.destroyRef)
                )
                .subscribe({
                    next: created => {
                        this.showToast(`Entreprise "${created.name || created.nom}" créée.`, 'success');
                        this.closeCreateModal();
                        this.loadStats();
 
                        // Pour la création, on force le moteur réactif à recharger toute la page
                        this.currentPage.update(p => p);
                    },
                    error: err => this.showToast(err.message, 'error'),
                });
        }
    }

    // ── Status toggle ─────────────────────────────────────────

    toggleStatus(ent: Enterprise, event?: Event): void {
        if (event) event.stopPropagation();
        const next: Enterprise['status'] = ent.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';

        this.svc.changeStatus(ent.id, next)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: updated => {
                    // 1. Mettre à jour l'entreprise sélectionnée dans le Drawer si c'est elle
                    if (this.selectedEnterprise()?.id === ent.id) {
                        this.selectedEnterprise.set(updated);
                    }

                    // 2. Émettre une nouvelle référence de tableau pour notifier OnPush instantanément
                    this.enterprises.update(list =>
                        list.map(e => e.id === ent.id ? updated : e)
                    );

                    this.showToast(`Statut changé en ${next === 'ACTIVE' ? 'Actif' : 'Suspendu'}.`, 'info');
                    this.loadStats(); // Recharger les compteurs du haut
                },
                error: err => this.showToast(err.message, 'error'),
            });
    }

    deleteEnterprise(ent: Enterprise, event?: Event): void {
        if (event) event.stopPropagation();
        this.svc.delete(ent.id)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: () => {
                    this.showToast(`Entreprise supprimée définitivement.`, 'error');
                    if (this.selectedEnterprise()?.id === ent.id) this.closeDrawer();
                    this.loadStats();
                    this.currentPage.update(p => p);
                },
                error: err => this.showToast(err.message, 'error'),
            });
    }

    regenerateCode(ent: Enterprise): void {
        this.svc.regenerateCode(ent.id)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: updated => {
                    this.selectedEnterprise.set(updated);
                    this.showToast('Code d\'invitation régénéré.', 'success');
                },
                error: err => this.showToast(err.message, 'error'),
            });
    }

    // ── Clipboard ────────────────────────────────────────────

    copyToClipboard(text: string, event: Event): void {
        event.stopPropagation();
        navigator.clipboard.writeText(text)
            .then(() => this.showToast('Copié dans le presse-papiers', 'success'))
            .catch(() => this.showToast('Erreur lors de la copie', 'error'));
    }

    // ── Toasts ────────────────────────────────────────────────

    showToast(message: string, type: Toast['type'] = 'info'): void {
        const id = this.toastId++;
        this.toasts.update(list => [...list, { id, message, type }]);
        setTimeout(() => this.removeToast(id), 4000);
    }

    removeToast(id: number): void {
        this.toasts.update(list => list.filter(t => t.id !== id));
    }

    // ── Keyboard & Events ─────────────────────────────────────

    @HostListener('document:keydown', ['$event'])
    handleKeyboard(e: KeyboardEvent): void {
        const target = e.target as HTMLElement;
        const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
        if (e.key === 'Escape') {
            if (this.isCreateModalOpen()) this.closeCreateModal();
            else if (this.acEditMode()) this.cancelAcEdit();
            else if (this.selectedEnterprise()) this.closeDrawer();
        }
        if (e.key === '/' && !typing) { e.preventDefault(); this.searchInput?.nativeElement?.focus(); }
        if ((e.key === 'n' || e.key === 'N') && !typing) { e.preventDefault(); this.openCreateModal(); }
    }

    @HostListener('document:click', ['$event'])
    onDocumentClick(e: MouseEvent): void {
        if (!this.selectedEnterprise()) return;
        const el = e.target as HTMLElement;
        if (
            el.closest('.drawer-container') ||
            el.closest('tr') ||
            el.closest('.modal-container') ||
            el.closest('.toast-container') ||
            el.closest('button') // Évite la fermeture instantanée lors du clic sur le bouton d'ouverture
        ) return;
        this.closeDrawer();
    }
}