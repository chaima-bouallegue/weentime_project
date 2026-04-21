import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { RHValidationService, RHValidationDemande } from '../validations/rh-validation.service';
import { LoaderComponent } from '@app/shared/components/loader/loader.component';
import { LucideAngularModule } from 'lucide-angular';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ToastService } from '@app/core/services/toast.service';

@Component({
  selector: 'app-rh-absence-validation',
  standalone: true,
  imports: [CommonModule, RouterModule, LoaderComponent, LucideAngularModule, FormsModule, DatePipe],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="bg-white rounded-lg shadow-sm p-6 border-l-4 border-purple-500">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-2xl font-bold text-gray-900">Validation des Absences</h2>
            <p class="text-gray-600 mt-2">Approbation finale des demandes d'absence en attente</p>
          </div>
          <div class="text-right">
            <div class="text-4xl font-bold text-purple-600">{{ rhValidationService.pendingByType().absences }}</div>
            <div class="text-gray-600 text-sm">en attente de validation</div>
          </div>
        </div>
      </div>

      <!-- Loading State -->
      @if (rhValidationService.loadingSignal()) {
        <div class="bg-white rounded-lg shadow-sm p-8 text-center">
          <app-loader></app-loader>
          <p class="text-gray-600 mt-4">Chargement des demandes...</p>
        </div>
      }

      <!-- Empty State -->
      @if (!rhValidationService.loadingSignal() && (rhValidationService.filteredPendingSignal() | slice:0:1).length === 0) {
        <div class="bg-white rounded-lg shadow-sm p-12 text-center border-2 border-dashed border-gray-300">
          <i-lucide name="check-circle" class="w-16 h-16 text-green-400 mx-auto mb-6"></i-lucide>
          <h3 class="text-2xl font-bold text-gray-900 mb-2">Aucune demande en attente</h3>
          <p class="text-gray-600">Toutes les demandes d'absence ont été validées!</p>
        </div>
      }

      <!-- Filter Info -->
      @if (!rhValidationService.loadingSignal()) {
        <div class="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <p class="text-purple-900 text-sm">
            <i-lucide name="info" class="w-4 h-4 inline mr-2"></i-lucide>
            Affichage des demandes d'<strong>Absence</strong> en attente d'approbation RH (statut: EN_ATTENTE_RH)
          </p>
        </div>
      }

      <!-- Demandes List -->
      @if (!rhValidationService.loadingSignal()) {
        <div class="space-y-4">
          @for (demande of rhValidationService.filteredPendingSignal(); track demande.id) {
            @if (demande.type === 'ABSENCE') {
              <div class="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow border-l-4 border-purple-500">
                <div class="p-6">
                  <div class="flex items-start justify-between gap-4">
                    <!-- Left: Demande Info -->
                    <div class="flex-1">
                      <div class="flex items-center gap-3 mb-2">
                        <span class="px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
                          Absence
                        </span>
                        <span class="text-gray-600 text-sm font-medium">
                          {{ demande.dateCreation | date:'dd/MM/yyyy à HH:mm' }}
                        </span>
                        @if (demande.statut) {
                          <span class="text-gray-500 text-xs">Statut: <strong>{{ demande.statut }}</strong></span>
                        }
                      </div>

                      <!-- Employee Card -->
                      <div class="bg-gray-50 rounded-lg p-3 mb-4">
                        <div class="font-semibold text-gray-900">
                          {{ demande.utilisateur?.prenom }} {{ demande.utilisateur?.nom }}
                        </div>
                        <div class="text-sm text-gray-600">{{ demande.utilisateur?.email }}</div>
                        @if (demande.manager) {
                          <div class="text-xs text-gray-500 mt-1">
                            Manager: <strong>{{ demande.manager.prenom }} {{ demande.manager.nom }}</strong>
                          </div>
                        }
                      </div>

                      <!-- Demande Details -->
                      <div class="grid md:grid-cols-2 gap-4 text-sm mb-4">
                        <div>
                          <span class="text-gray-600 font-medium">Période:</span>
                          <div class="text-gray-900 font-semibold">
                            {{ demande.dateDebut | date:'dd MMM yyyy' }} → {{ demande.dateFin | date:'dd MMM yyyy' }}
                          </div>
                        </div>
                        <div>
                          <span class="text-gray-600 font-medium">Durée:</span>
                          <div class="text-gray-900 font-semibold">{{ demande.nombreJours }} jour(s)</div>
                        </div>
                        @if (demande.description) {
                          <div class="md:col-span-2">
                            <span class="text-gray-600 font-medium">Type d'absence:</span>
                            <p class="text-gray-900 mt-1">{{ demande.description }}</p>
                          </div>
                        }
                        @if (demande.raison) {
                          <div class="md:col-span-2">
                            <span class="text-gray-600 font-medium">Raison:</span>
                            <p class="text-gray-900 mt-1">{{ demande.raison }}</p>
                          </div>
                        }
                        @if (demande.commentaireManager) {
                          <div class="md:col-span-2 bg-blue-50 p-3 rounded border-l-2 border-blue-500">
                            <span class="text-gray-600 font-medium text-xs">Commentaire du Manager:</span>
                            <p class="text-gray-900 text-sm mt-1">{{ demande.commentaireManager }}</p>
                          </div>
                        }
                      </div>
                    </div>

                    <!-- Right: Actions -->
                    <div class="flex flex-col gap-3 min-w-max">
                      <button
                        (click)="onValidateDemande(demande)"
                        class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
                      >
                        <i-lucide name="check" class="w-4 h-4"></i-lucide>
                        Approuver
                      </button>
                      <button
                        (click)="onRejectDemande(demande)"
                        class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
                      >
                        <i-lucide name="x" class="w-4 h-4"></i-lucide>
                        Refuser
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            }
          }
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
  `]
})
export class RhAbsenceValidationComponent implements OnInit {
  readonly rhValidationService = inject(RHValidationService);
  private readonly toastService = inject(ToastService);

  ngOnInit(): void {
    this.loadPendingValidations();
  }

  loadPendingValidations(): void {
    this.rhValidationService.loadPendingValidations('ABSENCE', 0, 50);
  }

  onValidateDemande(demande: RHValidationDemande): void {
    const commentaire = prompt(`Ajouter un commentaire pour approuver l'absence de ${demande.utilisateur?.prenom}:`, '');
    
    if (commentaire !== null) {
      this.rhValidationService.validateDemande('ABSENCE', demande.id, commentaire).subscribe({
        next: () => {
          this.loadPendingValidations();
        },
        error: () => this.toastService.error("La validation de l'absence a echoue.")
      });
    }
  }

  onRejectDemande(demande: RHValidationDemande): void {
    const commentaire = prompt(`Motif du refus pour ${demande.utilisateur?.prenom}:`, '');
    
    if (commentaire !== null && commentaire.trim() !== '') {
      this.rhValidationService.rejectDemande('ABSENCE', demande.id, commentaire).subscribe({
        next: () => {
          this.loadPendingValidations();
        },
        error: () => this.toastService.error("Le refus de l'absence a echoue.")
      });
    } else if (commentaire !== null) {
      alert('Veuillez entrer un motif de refus');
    }
  }
}
