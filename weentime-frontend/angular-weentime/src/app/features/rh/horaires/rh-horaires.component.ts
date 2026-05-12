import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule, SlicePipe } from '@angular/common';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { HoraireService } from '@app/core/services/horaire.service';
import { RhHorairesStore } from '@app/core/services/rh-horaires.store';
import { Horaire, AffectationHoraire } from '@app/core/models/horaire.model';
import { ToastService } from '@app/core/services/toast.service';

@Component({
  selector: 'app-rh-horaires',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, SlicePipe],
  templateUrl: './rh-horaires.component.html',
  styleUrls: ['./rh-horaires.component.scss']
})
export class RhHorairesComponent implements OnInit {
  private horaireService = inject(HoraireService);
  private router = inject(Router);
  private toastService = inject(ToastService);
  private store = inject(RhHorairesStore);

  horaires = this.store.horaires;
  affectations = this.store.affectations;
  activeTab = signal<'MODELS' | 'ASSIGNMENTS'>('MODELS');
  
  isLoading = this.store.isLoading;
  error = this.store.error;
  
  showDeleteConfirm = signal<Horaire | null>(null);
  showCancelAffectationConfirm = signal<AffectationHoraire | null>(null);
  isDeleting = signal(false);

  ngOnInit(): void {
    // Data is pre-fetched by resolver, but we can refresh if needed
    // this.store.refresh();
  }

  setTab(tab: 'MODELS' | 'ASSIGNMENTS'): void {
    this.activeTab.set(tab);
  }

  refreshData(): void {
    this.store.refresh();
  }

  promptDelete(horaire: Horaire): void {
    this.showDeleteConfirm.set(horaire);
  }

  cancelDelete(): void {
    this.showDeleteConfirm.set(null);
  }

  confirmDelete(): void {
    const horaire = this.showDeleteConfirm();
    if (!horaire) return;

    this.isDeleting.set(true);
    this.horaireService.deleteHoraire(horaire.id).subscribe({
      next: () => {
        this.toastService.success('Modèle d\'horaire supprimé avec succès');
        this.isDeleting.set(false);
        this.showDeleteConfirm.set(null);
        this.refreshData();
      },
      error: (err) => {
        this.toastService.error('Erreur lors de la suppression de l\'horaire');
        this.isDeleting.set(false);
      }
    });
  }

  promptCancelAffectation(ah: AffectationHoraire): void {
    this.showCancelAffectationConfirm.set(ah);
  }

  cancelCancelAffectation(): void {
    this.showCancelAffectationConfirm.set(null);
  }

  confirmCancelAffectation(): void {
    const ah = this.showCancelAffectationConfirm();
    if (!ah || !ah.id) return;

    this.isDeleting.set(true);
    this.horaireService.deleteAffectation(ah.id).subscribe({
      next: () => {
        this.toastService.success('Affectation annulée avec succès');
        this.isDeleting.set(false);
        this.showCancelAffectationConfirm.set(null);
        this.refreshData();
      },
      error: (err) => {
        this.toastService.error('Erreur lors de l\'annulation de l\'affectation');
        this.isDeleting.set(false);
      }
    });
  }

  editHoraire(id: number): void {
    this.router.navigate(['/app/rh/horaires', id, 'modifier']);
  }

  assignHoraire(): void {
    this.router.navigate(['/app/rh/horaires', 'affecter']);
  }

  createNewHoraire(): void {
    this.router.navigate(['/app/rh/horaires/nouveau']);
  }
}

