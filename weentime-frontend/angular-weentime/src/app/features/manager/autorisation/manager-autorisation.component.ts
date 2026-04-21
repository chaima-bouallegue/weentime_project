import { Component, OnInit, signal, inject, DestroyRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AutorisationService } from '../../../core/services/autorisation.service';
import { Autorisation, StatutAutorisation, TypeAutorisation } from '../../../core/models/autorisation.model';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-manager-autorisation',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, FormsModule],
  template: `
    <div class="min-h-screen bg-gray-50/50 dark:bg-gray-950 p-4 md:p-8 transition-colors duration-300">
      <header class="max-w-7xl mx-auto mb-8">
        <h1 class="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">Approbations d'Équipe</h1>
        <p class="text-gray-500 dark:text-gray-400 mt-1">Gérez les demandes d'absence de courte durée de vos collaborateurs.</p>
      </header>

      <main class="max-w-7xl mx-auto">
        @if (isLoading()) {
          <div class="flex items-center justify-center p-12">
            <lucide-icon name="loader-2" class="animate-spin text-indigo-600 dark:text-indigo-400" size="40"></lucide-icon>
          </div>
        } @else {
          <div class="grid grid-cols-1 gap-6">
            @for (demande of demandes(); track demande.id) {
              <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden transition-all hover:shadow-md">
                <div class="p-6 flex flex-col md:flex-row md:items-center gap-6">
                  <!-- Col 1: Employee & Type -->
                  <div class="flex-1 min-w-[200px]">
                    <div class="flex items-center gap-3 mb-3">
                      <div class="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold">
                        {{ getInitials(displayName(demande)) }}
                      </div>
                      <div>
                        <h3 class="font-bold text-gray-900 dark:text-white">{{ displayName(demande) }}</h3>
                        <p class="text-xs text-gray-500 dark:text-gray-400">Déposé le {{ demande.dateCreation | date:'dd/MM/yyyy' }}</p>
                      </div>
                    </div>
                    <div class="inline-flex items-center gap-2 px-3 py-1 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium">
                      <lucide-icon [name]="getTypeIcon(demande.typeAutorisation)" size="16" class="text-indigo-500 dark:text-indigo-400"></lucide-icon>
                      {{ demande.typeAutorisationLabel || formatType(demande.typeAutorisation) }}
                    </div>
                  </div>

                  <!-- Col 2: Date & Details -->
                  <div class="flex-1">
                    <div class="grid grid-cols-2 gap-4">
                      <div>
                        <span class="text-[10px] uppercase font-bold text-gray-400 dark:text-gray-500 block tracking-wider">Date</span>
                        <span class="font-bold text-gray-900 dark:text-white">{{ demande.dateAutorisation | date:'dd MMM yyyy' }}</span>
                      </div>
                      <div>
                        <span class="text-[10px] uppercase font-bold text-gray-400 dark:text-gray-500 block tracking-wider">Durée</span>
                        <span class="font-bold text-indigo-600 dark:text-indigo-400">{{ formatDuree(demande.duree) }}</span>
                      </div>
                      <div class="col-span-2">
                        <span class="text-[10px] uppercase font-bold text-gray-400 dark:text-gray-500 block tracking-wider">Motif</span>
                        <p class="text-sm text-gray-600 dark:text-gray-400 line-clamp-1 italic">"{{ demande.motif }}"</p>
                      </div>
                    </div>
                  </div>

                  <!-- Col 3: Status & RH Info -->
                  <div class="flex-1 flex flex-col items-start md:items-center gap-2">
                    @if (demande.duree > 120) {
                      <div class="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 rounded-xl text-[10px] font-black border border-indigo-100 dark:border-indigo-500/20 tracking-tighter shadow-sm whitespace-nowrap">
                        <lucide-icon name="shield-check" size="14"></lucide-icon>
                        RH REQUISE (SEUIL DÉPASSÉ)
                      </div>
                    } @else {
                      <div class="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 rounded-xl text-[10px] font-black border border-emerald-100 dark:border-emerald-500/20 tracking-tighter">
                        <lucide-icon name="check-check" size="14"></lucide-icon>
                        MANAGER DÉCISIONNAIRE UNIQUE
                      </div>
                    }
                  </div>

                  <!-- Actions -->
                  <div class="flex flex-row md:flex-col gap-2">
                    <button 
                      (click)="toggleComment(demande.id)"
                      class="p-3 bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 rounded-xl transition-all"
                      title="Ajouter un commentaire"
                    >
                      <lucide-icon name="message-square" size="20"></lucide-icon>
                    </button>
                    <button 
                      (click)="onDecision(demande.id, false)"
                      class="flex-1 md:flex-none p-3 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 rounded-xl transition-all"
                      title="Refuser"
                    >
                      <lucide-icon name="x" size="20"></lucide-icon>
                    </button>
                    <button 
                      (click)="onDecision(demande.id, true)"
                      class="flex-1 md:flex-none p-3 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl transition-all shadow-lg shadow-indigo-100 dark:shadow-none"
                      title="Approuver"
                    >
                      <lucide-icon name="check" size="20"></lucide-icon>
                    </button>
                  </div>
                </div>

                <!-- Comment Section (Hidden by default) -->
                @if (expandedId() === demande.id) {
                  <div class="p-6 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 animate-in slide-in-from-top-4 duration-300">
                    <label class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 block tracking-widest">Commentaire de décision</label>
                    <textarea 
                      [(ngModel)]="currentComment"
                      placeholder="Expliquez la raison de votre choix (facultatif)..."
                      class="w-full p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-sm mb-3"
                      rows="2"
                    ></textarea>
                    <div class="flex justify-end gap-2">
                      <button (click)="expandedId.set(null)" class="px-4 py-2 text-xs font-bold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">Annuler</button>
                    </div>
                  </div>
                }
              </div>
            } @empty {
              <div class="bg-white dark:bg-gray-900 rounded-3xl p-16 text-center border-2 border-dashed border-gray-100 dark:border-gray-800 transition-all">
                <lucide-icon name="coffee" class="mx-auto text-gray-200 dark:text-gray-800 mb-4" size="64"></lucide-icon>
                <h3 class="text-xl font-bold text-gray-900 dark:text-white">Tout est à jour !</h3>
                <p class="text-gray-500 dark:text-gray-400 max-w-sm mx-auto mt-2">Aucune demande d'autorisation n'est en attente de votre validation pour le moment.</p>
              </div>
            }
          </div>
        }
      </main>

      <!-- Confirmation Modal -->
      @if (pendingDecision()) {
        <div class="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div class="absolute inset-0 bg-gray-900/60 dark:bg-black/80 backdrop-blur-sm" (click)="cancelDecision()"></div>
          <div class="relative bg-white dark:bg-gray-900 rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200 border dark:border-gray-800">
            <div 
              class="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
              [class]="pendingDecision()?.approved ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400' : 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400'"
            >
              <lucide-icon [name]="pendingDecision()?.approved ? 'check-circle' : 'alert-triangle'" size="32"></lucide-icon>
            </div>
            
            <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">
              Confirmer le {{ pendingDecision()?.approved ? 'choix' : 'refus' }} ?
            </h3>
            <p class="text-sm text-gray-500 dark:text-gray-400 mb-8">
              Êtes-vous sûr de vouloir {{ pendingDecision()?.approved ? 'approuver' : 'refuser' }} cette demande d'autorisation ? Cette action est irréversible.
            </p>

            <div class="flex gap-3">
              <button (click)="cancelDecision()" class="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                Annuler
              </button>
              <button 
                (click)="confirmDecision()" 
                class="flex-1 py-3 rounded-xl font-bold text-white shadow-lg transition-all active:scale-95"
                [class]="pendingDecision()?.approved ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100 dark:shadow-none' : 'bg-rose-600 hover:bg-rose-700 shadow-rose-100 dark:shadow-none'"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ManagerAutorisationComponent implements OnInit {
  private service = inject(AutorisationService);
  private toastService = inject(ToastService);
  private destroyRef = inject(DestroyRef);

  demandes = signal<Autorisation[]>([]);
  isLoading = signal(true);
  expandedId = signal<number | null>(null);
  currentComment = '';
  pendingDecision = signal<{ id: number, approved: boolean } | null>(null);

  ngOnInit(): void {
    this.loadData();
  }

  loadData() {
    this.isLoading.set(true);
    this.service.getDemandesEquipe()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.demandes.set(res.content);
          this.isLoading.set(false);
        },
        error: () => this.isLoading.set(false)
      });
  }

  getInitials(name?: string): string {
    if (!name) return '??';
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  }

  displayName(demande: Autorisation): string {
    return demande.nomComplet || demande.utilisateur?.fullName || 'Employe';
  }

  formatType(type: TypeAutorisation): string {
    const types: Record<string, string> = {
      'SORTIE_ANTICIPEE': 'Sortie anticipée',
      'ARRIVEE_TARDIVE': 'Arrivée tardive',
      'RDV_MEDICAL': 'RDV Médical',
      'PAUSE_LONGUE': 'Pause longue',
      'TELETRAVAIL_EXCEPTIONNEL': 'Télétravail exp.',
      'MI_TEMPS_EXCEPTIONNEL': 'Mi-temps exp.',
      'AUTRE': 'Autre'
    };
    return types[type] || type;
  }

  getTypeIcon(type: TypeAutorisation): string {
    switch (type) {
      case 'RDV_MEDICAL': return 'stethoscope';
      case 'SORTIE_ANTICIPEE': return 'log-out';
      case 'ARRIVEE_TARDIVE': return 'alarm-clock';
      case 'PAUSE_LONGUE': return 'coffee';
      case 'TELETRAVAIL_EXCEPTIONNEL': return 'laptop';
      case 'MI_TEMPS_EXCEPTIONNEL': return 'hourglass';
      default: return 'help-circle';
    }
  }

  formatDuree(minutes: number): string {
    if (!minutes) return '0min';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m.toString().padStart(2, '0')}min` : `${m}min`;
  }

  toggleComment(id: number) {
    if (this.expandedId() === id) {
      this.expandedId.set(null);
    } else {
      this.expandedId.set(id);
      this.currentComment = '';
    }
  }

  onDecision(id: number, approved: boolean) {
    this.pendingDecision.set({ id, approved });
  }

  confirmDecision() {
    const decision = this.pendingDecision();
    if (!decision) return;

    this.service.deciderManager(decision.id, decision.approved, this.currentComment).subscribe({
      next: () => {
        this.toastService.success(decision.approved ? 'Demande approuvée' : 'Demande refusée');
        this.expandedId.set(null);
        this.pendingDecision.set(null);
        this.currentComment = '';
        this.loadData();
      },
      error: () => {
        this.toastService.error('Une erreur est survenue lors de la validation.');
      }
    });
  }

  cancelDecision() {
    this.pendingDecision.set(null);
  }
}
