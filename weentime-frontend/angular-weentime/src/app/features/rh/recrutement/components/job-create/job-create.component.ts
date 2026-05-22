import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { RecrutementService, JobPosting } from '../../services/recrutement.service';
import {
  LucideAngularModule, ChevronLeft, Briefcase, MapPin, Clock, Users,
  DollarSign, FileText, Star, Zap, Save, Send, Loader2, Plus, X, Building2
} from 'lucide-angular';
import { ToastService } from '../../../../../core/services/toast.service';

@Component({
  selector: 'app-job-create',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LucideAngularModule],
  templateUrl: './job-create.component.html',
  styleUrls: ['./job-create.component.scss']
})
export class JobCreateComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly recruitmentService = inject(RecrutementService);
  private readonly toast = inject(ToastService);

  jobId = signal<number | null>(null);

  ngOnInit() {
    const id = this.route.snapshot.params['id'];
    if (id) {
      this.jobId.set(+id);
      this.loadJob(+id);
    }
  }

  private loadJob(id: number) {
    this.recruitmentService.getJob(id).subscribe({
      next: (job) => {
        this.form = { ...job };
        if (job.requiredSkills) {
          this.skillTags.set(job.requiredSkills.split(',').map(s => s.trim()).filter(s => !!s));
        }
        if (job.soft_skills) {
          this.softSkillTags.set(job.soft_skills.split(',').map(s => s.trim()).filter(s => !!s));
        }
      },
      error: () => this.toast.error('Erreur lors du chargement de l\'offre.')
    });
  }

  // Icons
  protected readonly ChevronLeft = ChevronLeft;
  protected readonly Briefcase = Briefcase;
  protected readonly MapPin = MapPin;
  protected readonly Clock = Clock;
  protected readonly Users = Users;
  protected readonly DollarSign = DollarSign;
  protected readonly FileText = FileText;
  protected readonly Star = Star;
  protected readonly Zap = Zap;
  protected readonly Save = Save;
  protected readonly Send = Send;
  protected readonly Loader2 = Loader2;
  protected readonly Plus = Plus;
  protected readonly X = X;
  protected readonly Building2 = Building2;

  // State
  saving = signal(false);
  activeSection = signal(0);

  // Form Model
  form: Partial<JobPosting> = {
    title: '',
    department: '',
    employmentType: 'CDI',
    experienceLevel: 'INTERMEDIATE',
    minExperienceYears: 0,
    requiredSkills: '',
    soft_skills: '',
    description: '',
    responsibilities: '',
    salaryMin: undefined,
    salaryMax: undefined,
    salaryCurrency: 'EUR',
    workMode: 'ON_SITE',
    location: '',
    deadline: '',
    openingsCount: 1
  };

  // Skill tags
  skillTags = signal<string[]>([]);
  softSkillTags = signal<string[]>([]);
  newSkill = '';
  newSoftSkill = '';

  readonly sections = [
    { label: 'Informations', icon: 'briefcase' },
    { label: 'Description', icon: 'file-text' },
    { label: 'Compétences', icon: 'star' },
    { label: 'Rémunération', icon: 'dollar-sign' }
  ];

  readonly employmentTypes = [
    { value: 'CDI', label: 'CDI' },
    { value: 'CDD', label: 'CDD' },
    { value: 'INTERNSHIP', label: 'Stage' },
    { value: 'FREELANCE', label: 'Freelance' },
    { value: 'APPRENTICESHIP', label: 'Alternance' }
  ];

  readonly experienceLevels = [
    { value: 'JUNIOR', label: 'Junior (0-2 ans)' },
    { value: 'INTERMEDIATE', label: 'Intermédiaire (2-5 ans)' },
    { value: 'SENIOR', label: 'Senior (5-10 ans)' },
    { value: 'LEAD', label: 'Lead / Expert (10+ ans)' }
  ];

  readonly workModes = [
    { value: 'ON_SITE', label: 'Présentiel' },
    { value: 'REMOTE', label: 'Télétravail' },
    { value: 'HYBRID', label: 'Hybride' }
  ];

  addSkill() {
    const skill = this.newSkill.trim();
    if (skill && !this.skillTags().includes(skill)) {
      this.skillTags.update(tags => [...tags, skill]);
    }
    this.newSkill = '';
  }

  removeSkill(skill: string) {
    this.skillTags.update(tags => tags.filter(t => t !== skill));
  }

  addSoftSkill() {
    const skill = this.newSoftSkill.trim();
    if (skill && !this.softSkillTags().includes(skill)) {
      this.softSkillTags.update(tags => [...tags, skill]);
    }
    this.newSoftSkill = '';
  }

  removeSoftSkill(skill: string) {
    this.softSkillTags.update(tags => tags.filter(t => t !== skill));
  }

  onSkillKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.addSkill();
    }
  }

  onSoftSkillKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.addSoftSkill();
    }
  }

  get isValid(): boolean {
    return !!(this.form.title && this.form.department && this.form.location && this.form.description);
  }

  saveDraft() {
    this.submit('DRAFT');
  }

  publish() {
    this.submit('PUBLISHED');
  }

  private submit(status: string) {
    if (!this.isValid) {
      this.toast.error('Veuillez remplir tous les champs obligatoires.');
      return;
    }

    this.saving.set(true);

    const payload: Partial<JobPosting> = {
      ...this.form,
      requiredSkills: this.skillTags().join(', '),
      soft_skills: this.softSkillTags().join(', ')
    };

    const saveObs = this.jobId()
      ? this.recruitmentService.updateJob(this.jobId()!, payload)
      : this.recruitmentService.createJob(payload);

    saveObs.subscribe({
      next: (job) => {
        this.saving.set(false);
        if (status === 'PUBLISHED' && job.id) {
          this.recruitmentService.publishJob(job.id).subscribe({
            next: () => {
              this.toast.success(this.jobId() ? 'Offre mise à jour et publiée !' : 'Offre publiée avec succès !');
              this.router.navigate(['/app/rh/recrutement']);
            },
            error: () => {
              this.toast.success(this.jobId() ? 'Offre mise à jour.' : 'Offre créée.');
              this.router.navigate(['/app/rh/recrutement']);
            }
          });
        } else {
          this.toast.success(this.jobId() ? 'Modifications enregistrées.' : 'Brouillon enregistré avec succès.');
          this.router.navigate(['/app/rh/recrutement']);
        }
      },
      error: () => {
        this.saving.set(false);
        this.toast.error(this.jobId() ? 'Erreur lors de la modification.' : 'Erreur lors de la création de l\'offre.');
      }
    });
  }

  goBack() {
    this.router.navigate(['/app/rh/recrutement']);
  }
}
