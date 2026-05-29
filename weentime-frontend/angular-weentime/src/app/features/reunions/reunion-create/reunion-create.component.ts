import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import {
  LucideAngularModule,
  Calendar, Clock, Users, MapPin, Video,
  ChevronLeft, ChevronRight, Check, X,
  Search, Info, TriangleAlert, FileText, Sparkles
} from 'lucide-angular';
import { ReunionService } from '../../../core/services/reunion.service';
import { ReunionStore } from '../../../core/services/reunion.store';
import { OrganisationService } from '../../../core/services/organisation.service';
import { StructureService } from '../../rh/structure/structure.service';
import { ReunionType, ReunionRecurrence, ConflictDetail } from '../../../core/models/reunion.model';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { AIService } from '../../../core/services/ai.service';
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
  private aiService = inject(AIService);

  readonly route = inject(ActivatedRoute);
  readonly router = inject(Router);

  // ── Icons ──────────────────────────────────────────
  readonly iconCalendar = Calendar;
  readonly iconClock = Clock;
  readonly iconUsers = Users;
  readonly iconMapPin = MapPin;
  readonly iconVideo = Video;
  readonly iconLeft = ChevronLeft;
  readonly iconRight = ChevronRight;
  readonly iconCheck = Check;
  readonly iconX = X;
  readonly iconSearch = Search;
  readonly iconInfo = Info;
  readonly iconAlert = TriangleAlert;
  readonly iconAgenda = FileText;
  readonly iconSparkles = Sparkles;

  // ── Modèles de Réunions (Templates) ────────────────
  readonly templates = [
    {
      type: 'Daily Scrum',
      titre: 'Daily Scrum',
      description: 'Synchroniser l\'équipe sur l\'avancement, les blocages et les priorités.',
      duree: '15 min',
      heureFinOffset: 15,
      agenda: '1. Tour de table : Avancement (10 min)\n2. Points bloquants & alertes (3 min)\n3. Objectifs et focus du jour (2 min)'
    },
    {
      type: 'Weekly Sync',
      titre: 'Weekly Sync - Performance',
      description: 'Passer en revue les KPIs, aligner les priorités hebdomadaires et résoudre les points chauds.',
      duree: '30 min',
      heureFinOffset: 30,
      agenda: '1. Tour de table météo (5 min)\n2. Revue des indicateurs clés (10 min)\n3. Priorités et blocages de la semaine (10 min)\n4. Questions diverses (5 min)'
    },
    {
      type: 'Sprint Review',
      titre: 'Sprint Review & Demo',
      description: 'Présenter le travail accompli durant le sprint et recueillir les retours de l\'équipe.',
      duree: '60 min',
      heureFinOffset: 60,
      agenda: '1. Démonstration des fonctionnalités développées (30 min)\n2. Revue des objectifs de sprint (15 min)\n3. Retours et discussions (10 min)\n4. Prochaines étapes (5 min)'
    },
    {
      type: '1-on-1 Point',
      titre: 'Point Individuel / 1-on-1',
      description: 'Point d\'échange régulier, d\'écoute, de feedback mutuel et de suivi de carrière.',
      duree: '30 min',
      heureFinOffset: 30,
      agenda: '1. Météo personnelle et professionnelle (10 min)\n2. Suivi des objectifs & projets en cours (10 min)\n3. Points d\'attention et plans d\'action (10 min)'
    }
  ];

  // ── State ──────────────────────────────────────────
  readonly currentStep = signal(1);
  readonly isLoading = signal(false);
  readonly allUsers = signal<any[]>([]);
  readonly selectedUsers = signal<any[]>([]);
  readonly conflicts = signal<ConflictDetail[]>([]);
  readonly isCheckingConflicts = signal(false);
  readonly participantSearch = signal('');
  readonly isGeneratingAI = signal(false);

  // ── Getters & Methods ──────────────────────────────
  get suggestedUsers(): any[] {
    const selected = this.selectedUsers();
    return this.allUsers()
      .filter(u => !selected.some(s => s.id === u.id))
      .slice(0, 3);
  }

  applyTemplate(tpl: any) {
    this.basicForm.patchValue({
      titre: tpl.titre,
      description: tpl.description,
      agenda: tpl.agenda
    });
    
    // Auto-calculate Heure Fin based on Heure Debut and template offset
    const debut = this.basicForm.get('heureDebut')?.value || '09:00';
    const [h, m] = debut.split(':').map(Number);
    const totalMinutes = h * 60 + m + tpl.heureFinOffset;
    const fh = Math.floor(totalMinutes / 60) % 24;
    const fm = totalMinutes % 60;
    const finString = `${String(fh).padStart(2, '0')}:${String(fm).padStart(2, '0')}`;
    this.basicForm.patchValue({ heureFin: finString });
    
    this.toast.success(`Modèle "${tpl.type}" appliqué ! ✨`);
  }

  abandonner() {
    this.router.navigate(['/app/reunions']);
  }

  generateAI(event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const titre = this.basicForm.get('titre')?.value;
    const desc = this.basicForm.get('description')?.value;
    if (!titre) {
      this.toast.warning('Veuillez saisir au moins un titre pour générer un ordre du jour.');
      return;
    }
    this.isGeneratingAI.set(true);
    this.toast.info('Génération de l\'ordre du jour par Gemini AI...');
    this.aiService.generateAgenda(titre, desc || '').subscribe({
      next: (agenda) => {
        this.basicForm.patchValue({ agenda });
        this.isGeneratingAI.set(false);
        this.toast.success('Ordre du jour généré par Gemini ✨');
      },
      error: (err) => {
        this.isGeneratingAI.set(false);
        console.error(err);
        this.toast.error('Erreur lors de la génération IA. Le service AI est-il démarré ?');
      }
    });
  }

  // ── Forms ──────────────────────────────────────────
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

  // ── Computed helpers ───────────────────────────────
  getDuration(): string {
    const debut = this.basicForm.get('heureDebut')?.value;
    const fin = this.basicForm.get('heureFin')?.value;
    if (!debut || !fin) return '';
    const [dh, dm] = debut.split(':').map(Number);
    const [fh, fm] = fin.split(':').map(Number);
    const total = (fh * 60 + fm) - (dh * 60 + dm);
    if (total <= 0) return '';
    const h = Math.floor(total / 60);
    const m = total % 60;
    return h > 0 ? `${h}h${m > 0 ? m + 'min' : ''}` : `${m} min`;
  }

  isDurationInvalid(): boolean {
    const debut = this.basicForm.get('heureDebut')?.value;
    const fin = this.basicForm.get('heureFin')?.value;
    if (!debut || !fin) return false;
    const [dh, dm] = debut.split(':').map(Number);
    const [fh, fm] = fin.split(':').map(Number);
    return (fh * 60 + fm) <= (dh * 60 + dm);
  }

  get filteredUsers(): any[] {
    const q = this.participantSearch().toLowerCase();
    if (!q) return this.allUsers();
    return this.allUsers().filter(u =>
      (u.nom + ' ' + u.prenom + ' ' + (u.poste || '')).toLowerCase().includes(q)
    );
  }

  isSelected(user: any): boolean {
    return this.selectedUsers().some(u => u.id === user.id);
  }

  // ── Data loading ───────────────────────────────────
  loadUsers() {
    const user = this.authService.currentUser();
    if (!user) return;

    if (this.authService.hasRole('RH')) {
      this.structureService.getEmployes().subscribe(users => {
        this.allUsers.set(users.filter(u => u.id !== user.id));
      });
    } else {
      this.organisationService.getEquipesByResponsable(user.id).pipe(
        switchMap(equipes => {
          if (!equipes?.length) return of([]);
          return forkJoin(equipes.map(eq => this.organisationService.getUtilisateursByEquipe(eq.id)));
        }),
        map(results => {
          const all = results.flat();
          return Array.from(new Map(all.map(i => [i.id, i])).values())
            .filter(u => u.id !== user.id);
        })
      ).subscribe(users => this.allUsers.set(users));
    }
  }

  // ── Navigation ─────────────────────────────────────
  nextStep() {
    if (this.currentStep() === 1) {
      this.basicForm.markAllAsTouched();
      if (this.basicForm.invalid || this.isDurationInvalid()) return;
    }
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

  // ── Submit ─────────────────────────────────────────
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