import { ChangeDetectionStrategy, Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { LucideAngularModule, Calendar, Clock, Users, MapPin, Video, ChevronLeft, ChevronRight, Check, X, Search, Info, TriangleAlert } from 'lucide-angular';
import { ReunionService } from '../../../core/services/reunion.service';
import { ReunionStore } from '../../../core/services/reunion.store';
import { OrganisationService } from '../../../core/services/organisation.service';
import { StructureService } from '../../rh/structure/structure.service';
import { ReunionType, ReunionRecurrence, ConflictDetail } from '../../../core/models/reunion.model';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { forkJoin, map, of, switchMap } from 'rxjs';

@Component({
  selector: 'app-reunion-create',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, LucideAngularModule, RouterModule],
  templateUrl: './reunion-create.component.html',
  styleUrls: ['./reunion-create.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReunionCreateComponent {
  private fb = inject(FormBuilder);
  private reunionService = inject(ReunionService);
  private store = inject(ReunionStore);
  private organisationService = inject(OrganisationService);
  private structureService = inject(StructureService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private router = inject(Router);

  // Icons
  readonly iconCalendar = Calendar; readonly iconClock = Clock; readonly iconUsers = Users;
  readonly iconMapPin = MapPin; readonly iconVideo = Video; readonly iconLeft = ChevronLeft;
  readonly iconRight = ChevronRight; readonly iconCheck = Check; readonly iconX = X;
  readonly iconSearch = Search; readonly iconInfo = Info; readonly iconAlert = TriangleAlert;

  readonly currentStep = signal(1);
  readonly isLoading = signal(false);
  readonly allUsers = signal<any[]>([]);
  readonly selectedUsers = signal<any[]>([]);
  readonly conflicts = signal<ConflictDetail[]>([]);
  readonly isCheckingConflicts = signal(false);

  readonly basicForm = this.fb.group({
    titre: ['', Validators.required],
    description: [''],
    dateReunion: [new Date().toISOString().split('T')[0], Validators.required],
    heureDebut: ['09:00', Validators.required],
    heureFin: ['10:00', Validators.required],
    recurrence: [ReunionRecurrence.AUCUNE, Validators.required],
    agenda: ['']
  });

  readonly typeForm = this.fb.group({
    type: [ReunionType.PRESENTIEL, Validators.required],
    lieu: [''],
    lienVisio: ['']
  });

  constructor() {
    this.loadUsers();
  }

  loadUsers() {
    const user = this.authService.currentUser();
    if (!user) return;

    if (this.authService.hasRole('RH')) {
      this.structureService.getEmployes().subscribe(users => {
        const filtered = users.filter(u => u.id !== user.id);
        this.allUsers.set(filtered);
      });
    } else {
      // Si manager, on récupère ses équipes puis les membres de ces équipes
      this.organisationService.getEquipesByResponsable(user.id).pipe(
        switchMap(equipes => {
          if (!equipes || equipes.length === 0) return of([]);
          const requests = equipes.map(eq => this.organisationService.getUtilisateursByEquipe(eq.id));
          return forkJoin(requests);
        }),
        map(results => {
          const allMembers = results.flat();
          // Dédoublonner et enlever le manager lui-même
          const uniqueMembers = Array.from(new Map(allMembers.map(item => [item.id, item])).values());
          return uniqueMembers.filter(u => u.id !== user.id);
        })
      ).subscribe(users => {
        this.allUsers.set(users);
      });
    }
  }

  nextStep() {
    if (this.currentStep() === 1 && this.basicForm.invalid) return;
    if (this.currentStep() === 2 && this.selectedUsers().length === 0) {
      this.toast.warning('Veuillez sélectionner au moins un participant');
      return;
    }
    
    if (this.currentStep() === 2) {
      const uids = this.selectedUsers().map(u => u.id);
      const vals = this.basicForm.value;
      this.isCheckingConflicts.set(true);
      this.reunionService.checkConflicts(vals.dateReunion!, vals.heureDebut!, vals.heureFin!, uids)
        .subscribe({
          next: (res) => {
            this.conflicts.set(res.conflicts);
            this.isCheckingConflicts.set(false);
            this.currentStep.set(3);
          },
          error: () => this.isCheckingConflicts.set(false)
        });
    } else {
      this.currentStep.set(this.currentStep() + 1);
    }
  }

  prevStep() {
    this.currentStep.set(this.currentStep() - 1);
  }

  toggleUser(user: any) {
    const idx = this.selectedUsers().findIndex(u => u.id === user.id);
    if (idx >= 0) {
      this.selectedUsers.update(list => list.filter(u => u.id !== user.id));
    } else {
      this.selectedUsers.update(list => [...list, user]);
    }
  }

  onSubmit() {
    if (this.typeForm.invalid) return;

    this.isLoading.set(true);
    const request = {
      ...this.basicForm.value,
      ...this.typeForm.value,
      participantIds: this.selectedUsers().map(u => u.id)
    } as any;

    this.reunionService.create(request).subscribe({
      next: (res) => {
        this.store.invalidateCache();
        this.toast.success('Réunion créée avec succès');
        this.router.navigate(['/app/reunions', res.uuid]);
      },
      error: () => {
        this.isLoading.set(false);
        this.toast.error('Erreur lors de la création de la réunion');
      }
    });
  }
}
