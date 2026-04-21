import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { HoraireService } from '../../../../core/services/horaire.service';
import { OrganisationService, SimpleTeam, SimpleUser } from '../../../../core/services/organisation.service';
import { Horaire } from '../../../../core/models/horaire.model';

@Component({
  selector: 'app-rh-horaire-assign',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LucideAngularModule],
  templateUrl: './rh-horaire-assign.component.html',
  styleUrls: ['./rh-horaire-assign.component.scss']
})
export class RhHoraireAssignComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly horaireService = inject(HoraireService);
  private readonly organisationService = inject(OrganisationService);
  private readonly router = inject(Router);

  assignForm!: FormGroup;
  horaires = signal<Horaire[]>([]);
  teams = signal<SimpleTeam[]>([]);
  users = signal<SimpleUser[]>([]);
  selectedIds = signal<number[]>([]);
  searchTerm = signal('');

  isSubmitting = false;
  errorMessage = '';
  chevauchementDetecte = signal(false);
  confirmationEnAttente = signal(false);

  readonly cibleTypes = [
    { value: 'ENTREPRISE', label: "Toute l'entreprise", icon: 'building-2' },
    { value: 'EQUIPE', label: 'Une equipe specifique', icon: 'users' },
    { value: 'UTILISATEUR', label: 'Un collaborateur', icon: 'user' }
  ];

  ngOnInit(): void {
    this.initForm();
    this.loadData();
  }

  initForm(): void {
    this.assignForm = this.fb.group({
      horaireId: [null, Validators.required],
      cibleType: ['ENTREPRISE', Validators.required],
      cibleId: [null],
      dateDebut: [''],
      dateFin: [''],
      motif: ['']
    });

    this.assignForm.get('cibleType')?.valueChanges.subscribe(() => {
      this.selectedIds.set([]);
      this.searchTerm.set('');
      this.errorMessage = '';
      this.chevauchementDetecte.set(false);
      this.confirmationEnAttente.set(false);
    });
  }

  loadData(): void {
    this.horaireService.getHoraires(0, 100).subscribe({
      next: res => this.horaires.set(res.content ?? []),
      error: () => {
        this.errorMessage = "Impossible de charger les modeles d'horaires.";
      }
    });

    this.organisationService.getTeams(0, 100).subscribe({
      next: res => this.teams.set(res.content ?? []),
      error: () => {}
    });

    this.organisationService.getUsers(0, 500).subscribe({
      next: res => this.users.set(res.content ?? []),
      error: () => {}
    });
  }

  toggleSelection(id: number): void {
    const current = this.selectedIds();
    if (current.includes(id)) {
      this.selectedIds.set(current.filter(item => item !== id));
      return;
    }
    this.selectedIds.set([...current, id]);
  }

  selectAllFiltered(): void {
    const filteredIds = this.getFilteredItems().map(item => item.id);
    const current = new Set(this.selectedIds());
    filteredIds.forEach(id => current.add(id));
    this.selectedIds.set(Array.from(current));
  }

  deselectAllFiltered(): void {
    const filteredIds = this.getFilteredItems().map(item => item.id);
    this.selectedIds.set(this.selectedIds().filter(id => !filteredIds.includes(id)));
  }

  getFilteredItems(): Array<SimpleTeam | SimpleUser> {
    const type = this.assignForm.get('cibleType')?.value;
    const term = this.searchTerm().trim().toLowerCase();

    if (type === 'EQUIPE') {
      return this.teams().filter(team => team.nom.toLowerCase().includes(term));
    }

    if (type === 'UTILISATEUR') {
      return this.users().filter(user =>
        user.nom.toLowerCase().includes(term) ||
        user.prenom.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term)
      );
    }

    return [];
  }

  getItemLabel(item: SimpleTeam | SimpleUser): string {
    if ('prenom' in item) {
      return `${item.prenom} ${item.nom}`;
    }
    return item.nom;
  }

  getItemMeta(item: SimpleTeam | SimpleUser): string | null {
    return 'email' in item ? item.email : null;
  }

  getItemMemberCount(item: SimpleTeam | SimpleUser): number | null {
    return 'nombreMembres' in item ? item.nombreMembres ?? null : null;
  }

  goBack(): void {
    this.router.navigate(['/app/rh/horaires']);
  }

  get selectedPriority(): string {
    const type = this.assignForm.get('cibleType')?.value;
    if (type === 'UTILISATEUR') {
      return "Priorite haute (niveau 3) - remplace les regles Equipe et Entreprise.";
    }
    if (type === 'EQUIPE') {
      return "Priorite moyenne (niveau 2) - remplace la regle Entreprise.";
    }
    return "Priorite basse (niveau 1) - modele par defaut de l'organisation.";
  }

  private get currentPriorite(): number {
    const type = this.assignForm.get('cibleType')?.value;
    if (type === 'UTILISATEUR') {
      return 3;
    }
    if (type === 'EQUIPE') {
      return 2;
    }
    return 1;
  }

  verifierAvantSoumission(): void {
    this.errorMessage = '';

    if (this.isSubmitting) {
      return;
    }

    if (this.assignForm.invalid) {
      this.assignForm.markAllAsTouched();
      this.errorMessage = "Veuillez selectionner un modele d'horaire.";
      return;
    }

    const type = this.assignForm.get('cibleType')?.value;
    const ids = this.selectedIds();
    const formValue = this.assignForm.getRawValue();

    if (type !== 'ENTREPRISE' && ids.length === 0) {
      this.errorMessage = 'Veuillez selectionner au moins une cible.';
      return;
    }

    if (formValue.dateDebut && formValue.dateFin && formValue.dateFin < formValue.dateDebut) {
      this.errorMessage = 'La date de fin doit etre posterieure ou egale a la date de debut.';
      return;
    }

    if (!formValue.dateDebut) {
      this.soumettre();
      return;
    }

    const checkCibleId = type === 'ENTREPRISE' ? 0 : ids[0];
    this.horaireService.checkChevauchement({
      cibleType: type,
      cibleId: checkCibleId,
      priorite: this.currentPriorite,
      dateDebut: formValue.dateDebut,
      dateFin: formValue.dateFin || undefined
    }).subscribe({
      next: ({ chevauchementDetecte }) => {
        if (chevauchementDetecte) {
          this.chevauchementDetecte.set(true);
          this.confirmationEnAttente.set(true);
          return;
        }
        this.soumettre();
      },
      error: () => {
        // Submission remains available even if the pre-check endpoint fails.
        this.soumettre();
      }
    });
  }

  confirmerEtSoumettre(): void {
    this.confirmationEnAttente.set(false);
    this.chevauchementDetecte.set(false);
    this.soumettre();
  }

  annulerSoumission(): void {
    this.chevauchementDetecte.set(false);
    this.confirmationEnAttente.set(false);
  }

  private soumettre(): void {
    const type = this.assignForm.get('cibleType')?.value;
    const ids = this.selectedIds();
    const formValue = this.assignForm.getRawValue();

    this.isSubmitting = true;
    this.errorMessage = '';

    if (type === 'ENTREPRISE') {
      this.horaireService.assignHoraire({
        horaireId: formValue.horaireId,
        cibleType: type,
        cibleId: 0,
        dateDebut: formValue.dateDebut || undefined,
        dateFin: formValue.dateFin || undefined,
        motif: formValue.motif || undefined
      }).subscribe(this.handleResponse());
      return;
    }

    this.horaireService.assignHoraireBatch({
      horaireId: formValue.horaireId,
      cibleType: type,
      cibleIds: ids,
      dateDebut: formValue.dateDebut || undefined,
      dateFin: formValue.dateFin || undefined,
      motif: formValue.motif || undefined
    }).subscribe(this.handleResponse());
  }

  private handleResponse() {
    return {
      next: () => {
        this.isSubmitting = false;
        this.router.navigate(['/app/rh/horaires']);
      },
      error: (err: { status?: number }) => {
        this.isSubmitting = false;

        if (err.status === 409) {
          this.errorMessage = 'Chevauchement detecte : une affectation existe deja sur cette periode.';
        } else if (err.status === 403) {
          this.errorMessage = "Acces refuse : la cible selectionnee n'appartient pas a votre entreprise.";
        } else {
          this.errorMessage = "Une erreur serveur est survenue lors de l'enregistrement.";
        }

      }
    };
  }
}
