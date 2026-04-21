import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule, SlicePipe } from '@angular/common';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { HoraireService } from '../../../core/services/horaire.service';
import { Horaire, AffectationHoraire } from '../../../core/models/horaire.model';
import { ToastService } from '../../../core/services/toast.service';

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

  horaires = signal<Horaire[]>([]);
  affectations = signal<AffectationHoraire[]>([]);
  activeTab = signal<'MODELS' | 'ASSIGNMENTS'>('MODELS');
  
  isLoading = signal(true);
  error = signal<string | null>(null);
  
  showDeleteConfirm = signal<Horaire | null>(null);
  showCancelAffectationConfirm = signal<AffectationHoraire | null>(null);
  isDeleting = signal(false);

  ngOnInit(): void {
    this.refreshData();
  }

  setTab(tab: 'MODELS' | 'ASSIGNMENTS'): void {
    this.activeTab.set(tab);
    this.refreshData();
  }

  refreshData(): void {
    if (this.activeTab() === 'MODELS') {
      this.loadHoraires();
    } else {
      this.loadAffectations();
    }
  }

  loadHoraires(): void {
    this.isLoading.set(true);
    this.horaireService.getHoraires(0, 100).subscribe({
      next: (response) => {
        this.horaires.set(response.content);
        this.isLoading.set(false);
      },
      error: () => {
        this.error.set('Impossible de charger les horaires');
        this.isLoading.set(false);
      }
    });
  }

  loadAffectations(): void {
    this.isLoading.set(true);
    this.horaireService.getAffectations(0, 100).subscribe({
      next: (response) => {
        this.affectations.set(response.content);
        this.isLoading.set(false);
      },
      error: () => {
        this.error.set('Impossible de charger les affectations');
        this.isLoading.set(false);
      }
    });
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
        this.loadHoraires();
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
        this.loadAffectations();
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

