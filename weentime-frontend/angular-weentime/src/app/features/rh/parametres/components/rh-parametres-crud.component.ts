import { Component, Input, OnInit, OnChanges, SimpleChanges, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import {
  LucideAngularModule,
  Check,
  AlertCircle,
  X,
  Plus,
  FolderOpen,
  Pencil,
  Trash2,
  ChevronDown,
  Loader2
} from 'lucide-angular';
import { environment } from '../../../../../environments/environment';

export interface CrudColumn {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'enum';
  options?: { value: string, label: string }[]; // For enum
  required?: boolean;
}

@Component({
  selector: 'app-rh-parametres-crud',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    LucideAngularModule
  ],
  template: `
    <div class="flex flex-col gap-8 animate-in fade-in duration-700">

      <!-- Toolbar Premium -->
      <div class="flex flex-col gap-4">
        <!-- Global Feedback Message -->
        @if (status()) {
          <div class="animate-in slide-in-from-top-4 duration-500 px-8 py-5 rounded-[2rem] flex items-center justify-between gap-4 border shadow-2xl backdrop-blur-xl"
               [ngClass]="status()?.type === 'success'
                ? 'bg-emerald-50/90 border-emerald-100 text-emerald-800'
                : 'bg-rose-50/90 border-rose-100 text-rose-800'">
            <div class="flex items-center gap-4">
              <div class="p-2 rounded-xl" [ngClass]="status()?.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'">
                <lucide-icon [img]="status()?.type === 'success' ? CheckIcon : AlertIcon" size="20"></lucide-icon>
              </div>
              <span class="text-sm font-black tracking-tight">{{ status()?.message }}</span>
            </div>
            <button (click)="status.set(null)" class="p-2 hover:bg-black/5 rounded-xl transition-colors">
              <lucide-icon [img]="XIcon" size="18"></lucide-icon>
            </button>
          </div>
        }

        <div class="flex flex-col sm:flex-row items-center justify-between bg-white dark:bg-slate-800 p-8 rounded-[2rem] border border-slate-200/60 dark:border-slate-700/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-none gap-6 transition-all duration-300">
          <div class="flex items-center gap-4">
            <div class="w-1.5 h-10 bg-indigo-600 rounded-full"></div>
            <div>
              <h3 class="text-2xl font-black text-slate-800 dark:text-white tracking-tighter">
                Liste des <span class="text-indigo-600 dark:text-indigo-400">{{ title }}</span>
              </h3>
              <p class="text-xs font-bold text-slate-400 mt-0.5 tracking-tight uppercase">Interface de gestion administrative</p>
            </div>
          </div>
          <button (click)="openModal()" class="group flex items-center gap-3 px-8 py-4 bg-indigo-600 hover:bg-slate-900 dark:hover:bg-white dark:hover:text-slate-900 text-white rounded-2xl text-sm font-black transition-all shadow-xl shadow-indigo-200/50 dark:shadow-none active:scale-95 hover:-translate-y-0.5">
            <lucide-icon [img]="PlusIcon" size="20" class="group-hover:rotate-90 transition-transform duration-500"></lucide-icon>
            NOUVEL ÉLÉMENT
          </button>
        </div>
      </div>

      <!-- Table Container Premium -->
      <div class="bg-white dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 rounded-[2rem] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.03)] dark:shadow-none">
        <div class="overflow-x-auto custom-scrollbar">
          <table class="w-full text-sm text-left border-collapse">
            <thead>
            <tr class="bg-slate-50/50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700/60">
              @for (col of columns; track col.key) {
                <th class="px-8 py-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">{{ col.label }}</th>
              }
              <th class="px-8 py-6 text-right text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Actions</th>
            </tr>
            </thead>
            <tbody class="divide-y divide-slate-50 dark:divide-slate-700/30">
              @if (loading()) {
                <tr>
                  <td [colSpan]="columns.length + 1" class="px-8 py-24 text-center">
                    <div class="flex flex-col items-center gap-4">
                      <div class="relative w-16 h-16">
                        <div class="absolute inset-0 border-4 border-indigo-100 dark:border-slate-700 rounded-full"></div>
                        <div class="absolute inset-0 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                      </div>
                      <span class="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.3em] animate-pulse">Synchronisation...</span>
                    </div>
                  </td>
                </tr>
              } @else if (data().length === 0) {
                <tr>
                  <td [colSpan]="columns.length + 1" class="px-8 py-24 text-center">
                    <div class="flex flex-col items-center gap-4 group">
                      <div class="w-20 h-20 bg-slate-50 dark:bg-slate-800/50 rounded-full flex items-center justify-center text-slate-200 dark:text-slate-700 group-hover:scale-110 transition-transform duration-500">
                        <lucide-icon [img]="FolderIcon" size="40"></lucide-icon>
                      </div>
                      <span class="text-xs font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest italic">Aucun enregistrement trouvé</span>
                    </div>
                  </td>
                </tr>
              } @else {
                @for (item of data(); track item.id) {
                  <tr class="hover:bg-slate-50/50 dark:hover:bg-indigo-500/5 transition-all duration-300 group">
                    @for (col of columns; track col.key) {
                      <td class="px-8 py-6 whitespace-nowrap">
                        @if (col.type === 'boolean') {
                          <div class="flex items-center">
                            @if (item[col.key]) {
                              <span class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-600 border border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 shadow-sm">
                                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                                ACTIF
                              </span>
                            } @else {
                              <span class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-50 text-slate-400 border border-slate-100 dark:bg-slate-700/50 dark:text-slate-500 dark:border-slate-600 shadow-sm">
                                <span class="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600"></span>
                                INACTIF
                              </span>
                            }
                          </div>
                        } @else if (col.type === 'enum' && col.options) {
                          <span class="font-extrabold text-slate-700 dark:text-slate-200 tracking-tight">{{ getEnumLabel(col, item[col.key]) }}</span>
                        } @else if (col.type === 'number') {
                          <div class="inline-flex items-center justify-center min-w-[2.5rem] h-8 px-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg text-indigo-600 dark:text-indigo-400 font-black font-mono border border-indigo-100 dark:border-indigo-500/20">
                            {{ item[col.key] || '0' }}
                          </div>
                        } @else {
                          <span class="font-bold text-slate-600 dark:text-slate-300 tracking-tight">{{ item[col.key] || '-' }}</span>
                        }
                      </td>
                    }
                    <td class="px-8 py-6 text-right">
                      <div class="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all duration-500 translate-x-4 group-hover:translate-x-0">
                        <button (click)="openModal(item)" class="p-3 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-700 rounded-2xl transition-all shadow-sm border border-transparent hover:border-slate-100 dark:hover:border-slate-600 active:scale-90" title="Modifier">
                          <lucide-icon [img]="EditIcon" size="18"></lucide-icon>
                        </button>
                        <button (click)="confirmDelete(item.id)" class="p-3 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-white dark:hover:bg-slate-700 rounded-2xl transition-all shadow-sm border border-transparent hover:border-slate-100 dark:hover:border-slate-600 active:scale-90" title="Supprimer">
                          <lucide-icon [img]="TrashIcon" size="18"></lucide-icon>
                        </button>
                      </div>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
      </div>

    </div>

    <!-- Modal Premium -->
    @if (isModalOpen()) {
      <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-8 animate-in fade-in duration-300">
        <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-md" (click)="closeModal()"></div>

        <div class="relative bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl shadow-black/30 w-full max-w-lg overflow-hidden border border-white/20 scale-100 animate-in zoom-in-95 duration-300">

          <!-- Modal Header -->
          <div class="relative px-10 py-8 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-2xl font-extrabold text-slate-800 dark:text-white tracking-tight">
                  {{ isEditMode() ? 'Modifier' : 'Ajouter' }} <span class="text-indigo-600 dark:text-indigo-400">un élément</span>
                </h3>
                <p class="text-xs font-medium text-slate-400 mt-1">Remplissez les informations ci-dessous</p>
              </div>
              <button (click)="closeModal()" class="w-10 h-10 flex items-center justify-center rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all border border-slate-100 dark:border-slate-700">
                <lucide-icon [img]="XIcon" size="20"></lucide-icon>
              </button>
            </div>
          </div>

          <!-- Modal Body -->
          <form [formGroup]="form" (ngSubmit)="save()" class="p-8 flex flex-col gap-6 max-h-[70vh] overflow-y-auto custom-scrollbar">

            @for (col of columns; track col.key) {
              <div class="space-y-2">
                <label class="flex items-center gap-2 text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">
                  {{ col.label }}
                  @if (col.required) { <span class="text-red-500">*</span> }
                </label>

                <div class="relative group">
                  @if (col.type === 'boolean') {
                    <label class="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" [formControlName]="col.key" class="sr-only peer">
                      <div class="w-14 h-7 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                      <span class="ml-3 text-sm font-bold text-slate-600 dark:text-slate-300">{{ form.get(col.key)?.value ? 'Activé' : 'Désactivé' }}</span>
                    </label>
                  } @else if (col.type === 'enum' && col.options) {
                    <select [formControlName]="col.key" class="w-full px-5 py-3.5 bg-slate-100 dark:bg-slate-800 border-2 border-transparent dark:border-slate-800 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 text-slate-700 dark:text-slate-200 outline-none transition-all appearance-none cursor-pointer">
                      <option [ngValue]="null">--- SÉLECTIONNER ---</option>
                      @for (opt of col.options; track opt.value) {
                        <option [value]="opt.value">{{ opt.label }}</option>
                      }
                    </select>
                    <div class="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                      <lucide-icon [img]="ChevronDownIcon" size="18"></lucide-icon>
                    </div>
                  } @else {
                    <input [type]="col.type === 'number' ? 'number' : 'text'" [formControlName]="col.key" class="w-full px-5 py-3.5 bg-slate-100 dark:bg-slate-800 border-2 border-transparent dark:border-slate-800 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 text-slate-700 dark:text-slate-200 outline-none placeholder-slate-400 transition-all" [placeholder]="'Saisie de ' + col.label.toLowerCase() + '...'">
                  }
                </div>
              </div>
            }
          </form>

          <!-- Modal Footer -->
          <div class="p-8 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-end gap-4">
            <button type="button" (click)="closeModal()" class="px-6 py-3 text-sm font-black text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 uppercase tracking-widest transition-colors">
              Annuler
            </button>
            <button type="submit" [disabled]="form.invalid || saving()" (click)="save()" class="flex items-center gap-3 px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black rounded-2xl shadow-xl shadow-indigo-200/50 dark:shadow-none transition-all disabled:opacity-50 disabled:grayscale">
              @if (saving()) {
                <lucide-icon [img]="LoaderIcon" size="18" class="animate-spin"></lucide-icon>
              }
              ENREGISTRER
            </button>
          </div>

        </div>
      </div>
    }

    <!-- Custom Delete Modal Premium -->
    @if (isDeleteModalOpen()) {
      <div class="fixed inset-0 z-[110] flex items-center justify-center p-4 animate-in fade-in duration-300">
        <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" (click)="closeDeleteModal()"></div>

        <div class="relative bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden border border-slate-100 dark:border-slate-800 scale-100 animate-in zoom-in-95 duration-300">
          <div class="p-8 text-center mt-4">
            <div class="w-16 h-16 bg-red-50 dark:bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <lucide-icon [img]="TrashIcon" size="32"></lucide-icon>
            </div>
            <h3 class="text-xl font-extrabold text-slate-800 dark:text-white tracking-tight mb-2">Confirmer la suppression</h3>
            <p class="text-sm font-medium text-slate-400">Cette action est irréversible. Voulez-vous vraiment continuer ?</p>
          </div>

          <div class="p-6 bg-slate-50 dark:bg-slate-800/50 flex flex-col gap-3">
            <button (click)="deleteItem()" class="w-full py-3.5 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-red-200 dark:shadow-none active:scale-95">
              OUI, SUPPRIMER
            </button>
            <button (click)="closeDeleteModal()" class="w-full py-3 text-sm font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
              Annuler
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .custom-scrollbar::-webkit-scrollbar {
      width: 6px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
      background: transparent;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: #e2e8f0;
      border-radius: 10px;
    }
    .dark .custom-scrollbar::-webkit-scrollbar-thumb {
      background: #1e293b;
    }
  `]
})
export class RhParametresCrudComponent implements OnInit, OnChanges {
  @Input() title = '';
  @Input() endpoint = '';
  @Input() columns: CrudColumn[] = [];

  // Icon symbols for direct binding
  readonly CheckIcon = Check;
  readonly AlertIcon = AlertCircle;
  readonly XIcon = X;
  readonly PlusIcon = Plus;
  readonly FolderIcon = FolderOpen;
  readonly EditIcon = Pencil;
  readonly TrashIcon = Trash2;
  readonly ChevronDownIcon = ChevronDown;
  readonly LoaderIcon = Loader2;

  private http = inject(HttpClient);
  private fb = inject(FormBuilder);

  data = signal<any[]>([]);
  loading = signal(true);
  saving = signal(false);
  status = signal<{ type: 'success' | 'error', message: string } | null>(null);

  isModalOpen = signal(false);
  isDeleteModalOpen = signal(false);
  isEditMode = signal(false);
  currentId = signal<number | null>(null);

  form: FormGroup;

  constructor() {
    this.form = this.fb.group({});
  }

  ngOnInit() {
    this.buildForm();
    this.loadData();
  }

  ngOnChanges(changes: SimpleChanges) {
    if ((changes['columns'] && !changes['columns'].firstChange) ||
      (changes['endpoint'] && !changes['endpoint'].firstChange)) {
      this.buildForm();
      this.loadData();
    }
  }

  buildForm() {
    const group: any = {};
    this.columns.forEach(col => {
      group[col.key] = ['', col.required ? Validators.required : null];
    });
    this.form = this.fb.group(group);
  }

  loadData() {
    this.loading.set(true);
    this.http.get<any[]>(`${environment.apiUrl}/${this.endpoint}`).subscribe({
      next: (res) => {
        this.data.set(res);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  getEnumLabel(col: CrudColumn, value: string) {
    return col.options?.find(o => o.value === value)?.label || value;
  }

  openModal(item?: any) {
    this.isEditMode.set(!!item);
    this.currentId.set(item?.id || null);

    if (item) {
      this.form.patchValue(item);
    } else {
      this.form.reset();
    }

    this.isModalOpen.set(true);
  }

  closeModal() {
    this.isModalOpen.set(false);
    this.form.reset();
  }

  save() {
    if (this.form.invalid) return;

    this.saving.set(true);
    const payload = this.form.value;
    const url = `${environment.apiUrl}/${this.endpoint}`;
    const request = this.isEditMode()
      ? this.http.put(`${url}/${this.currentId()}`, payload)
      : this.http.post(url, payload);

    request.subscribe({
      next: () => {
        this.status.set({ type: 'success', message: `Élément ${this.isEditMode() ? 'modifié' : 'ajouté'} avec succès` });
        this.loadData();
        this.closeModal();
        this.saving.set(false);
        setTimeout(() => this.status.set(null), 3000);
      },
      error: () => {
        this.status.set({ type: 'error', message: 'Une erreur est survenue lors de l\'enregistrement' });
        this.saving.set(false);
        setTimeout(() => this.status.set(null), 3000);
      }
    });
  }

  confirmDelete(id: number) {
    this.currentId.set(id);
    this.isDeleteModalOpen.set(true);
  }

  closeDeleteModal() {
    this.isDeleteModalOpen.set(false);
    this.currentId.set(null);
  }

  deleteItem() {
    if (!this.currentId()) return;

    this.http.delete(`${environment.apiUrl}/${this.endpoint}/${this.currentId()}`).subscribe({
      next: () => {
        this.status.set({ type: 'success', message: 'Élément supprimé avec succès' });
        this.loadData();
        this.closeDeleteModal();
        setTimeout(() => this.status.set(null), 3000);
      },
      error: () => {
        this.status.set({ type: 'error', message: 'Erreur lors de la suppression' });
        this.closeDeleteModal();
        setTimeout(() => this.status.set(null), 3000);
      }
    });
  }
}
