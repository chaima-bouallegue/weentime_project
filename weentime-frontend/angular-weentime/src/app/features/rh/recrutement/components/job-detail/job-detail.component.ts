import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { RecrutementService, JobPosting, Application } from '../../services/recrutement.service';
import { LucideAngularModule } from 'lucide-angular';
import {
  ChevronLeft, Calendar, MapPin, Users, Brain, CheckCircle, XCircle,
  Briefcase, Clock, ExternalLink, Download, Mail, Phone, Linkedin,
  Eye, EyeOff, Send, MoreVertical, Loader2, Star, FileText, Edit, Trash2,
  AlertTriangle
} from 'lucide-angular';
import { ToastService } from '../../../../../core/services/toast.service';
import { WebSocketService } from '../../../../../core/services/websocket.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-job-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, LucideAngularModule],
  templateUrl: './job-detail.component.html',
  styleUrls: ['./job-detail.component.scss']
})
export class JobDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly recruitmentService = inject(RecrutementService);
  private readonly toast = inject(ToastService);
  private readonly wsService = inject(WebSocketService);

  job = signal<JobPosting | null>(null);
  applications = signal<Application[]>([]);
  isLoading = signal(true);
  showDeleteModal = signal(false);

  private wsSub?: Subscription;

  // Icons
  protected readonly AlertTriangle = AlertTriangle;
  protected readonly ChevronLeft = ChevronLeft;
  protected readonly Users = Users;
  protected readonly Brain = Brain;
  protected readonly MapPin = MapPin;
  protected readonly Calendar = Calendar;
  protected readonly CheckCircle = CheckCircle;
  protected readonly XCircle = XCircle;
  protected readonly Briefcase = Briefcase;
  protected readonly Clock = Clock;
  protected readonly ExternalLink = ExternalLink;
  protected readonly Download = Download;
  protected readonly Mail = Mail;
  protected readonly Phone = Phone;
  protected readonly Linkedin = Linkedin;
  protected readonly Eye = Eye;
  protected readonly EyeOff = EyeOff;
  protected readonly Send = Send;
  protected readonly MoreVertical = MoreVertical;
  protected readonly Loader2 = Loader2;
  protected readonly Star = Star;
  protected readonly FileText = FileText;
  protected readonly Edit = Edit;
  protected readonly Trash2 = Trash2;

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (id) {
      this.recruitmentService.getJob(id).subscribe({
        next: j => {
          this.job.set(j);
          this.isLoading.set(false);
        },
        error: () => this.isLoading.set(false)
      });
      this.recruitmentService.getApplications(id).subscribe({
        next: apps => this.applications.set(Array.isArray(apps) ? apps : []),
        error: () => this.applications.set([])
      });
    }

    // WebSocket : écouter les résultats IA en temps réel
    this.wsSub = this.wsService.watch<any>('/topic/role/rh').subscribe(payload => {
      if (payload?.type === 'RECRUITMENT_AI_RESULT' && payload?.data) {
        const appId = payload.data.applicationId;
        const currentApps = this.applications();
        const idx = currentApps.findIndex(a => a.id === appId);
        if (idx !== -1) {
          // Recharger les candidatures pour avoir les données complètes
          this.refreshApplications();
          this.toast.success(`Analyse IA terminée pour ${currentApps[idx].firstName} ${currentApps[idx].lastName}`);
        }
      }
    });
  }

  ngOnDestroy() {
    this.wsSub?.unsubscribe();
  }

  // ── Status Labels ──

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      'PUBLISHED': 'Publiée', 'DRAFT': 'Brouillon', 'CLOSED': 'Clôturée', 'ARCHIVED': 'Archivée'
    };
    return labels[status] || status;
  }

  getAppStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      'APPLIED': 'Postulé', 'AI_ANALYZING': 'Analyse IA...', 'AI_ANALYZED': 'Analysé',
      'UNDER_REVIEW': 'En revue', 'SHORTLISTED': 'Présélectionné',
      'INTERVIEW_SCHEDULED': 'Entretien planifié', 'INTERVIEWED': 'Entretien passé',
      'OFFER_SENT': 'Offre envoyée', 'HIRED': 'Recruté', 'REJECTED': 'Refusé', 'WITHDRAWN': 'Retiré'
    };
    return labels[status] || status;
  }

  getWorkModeLabel(mode: string): string {
    switch (mode) {
      case 'ON_SITE': return 'Présentiel';
      case 'REMOTE': return 'Télétravail';
      case 'HYBRID': return 'Hybride';
      default: return mode || '';
    }
  }

  // ── AI Score Helpers ──

  getScoreColor(score: number | undefined): string {
    if (!score && score !== 0) return '#94a3b8';
    if (score > 80) return '#059669';   // Vert
    if (score >= 60) return '#d97706';  // Orange
    return '#dc2626';                    // Rouge
  }

  getScoreGradient(score: number | undefined): string {
    if (!score && score !== 0) return 'conic-gradient(#e2e8f0 0deg, #e2e8f0 360deg)';
    const deg = (score / 100) * 360;
    const color = this.getScoreColor(score);
    return `conic-gradient(${color} 0deg, ${color} ${deg}deg, #e2e8f0 ${deg}deg, #e2e8f0 360deg)`;
  }

  getRecommandationLabel(rec: string | undefined): string {
    const labels: Record<string, string> = {
      'FORTEMENT_RECOMMANDE': 'Fortement recommandé',
      'RECOMMANDE': 'Recommandé',
      'A_EVALUER': 'À évaluer',
      'REJETE': 'Non recommandé',
      // Legacy values
      'highly_recommended': 'Fortement recommandé',
      'recommended': 'Recommandé',
      'needs_review': 'À évaluer',
      'not_recommended': 'Non recommandé'
    };
    return labels[rec || ''] || rec || '';
  }

  getRecommandationClass(rec: string | undefined): string {
    const classes: Record<string, string> = {
      'FORTEMENT_RECOMMANDE': 'rec-strong',
      'RECOMMANDE': 'rec-good',
      'A_EVALUER': 'rec-review',
      'REJETE': 'rec-reject',
      'highly_recommended': 'rec-strong',
      'recommended': 'rec-good',
      'needs_review': 'rec-review',
      'not_recommended': 'rec-reject'
    };
    return classes[rec || ''] || 'rec-review';
  }

  // ── JSON Array Parsing ──

  parseJsonArray(jsonStr: string | undefined): string[] {
    if (!jsonStr) return [];
    try {
      const parsed = JSON.parse(jsonStr);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  isAiAnalyzing(app: Application): boolean {
    return app.status === 'AI_ANALYZING' || app.aiStatus === 'ANALYZING';
  }

  isAiFailed(app: Application): boolean {
    return app.aiStatus === 'FAILED';
  }

  hasAiResult(app: Application): boolean {
    return app.aiStatus === 'COMPLETED' && app.aiOverallScore != null;
  }

  // ── Formatting ──

  formatDate(date: string | undefined): string {
    if (!date) return 'Non défini';
    return new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  getInitials(firstName: string, lastName: string): string {
    return (firstName?.[0] || '').toUpperCase() + (lastName?.[0] || '').toUpperCase();
  }

  // ── Job Actions ──

  publishJob() {
    const j = this.job();
    if (!j) return;
    this.recruitmentService.publishJob(j.id).subscribe({
      next: updated => {
        this.job.set(updated);
        this.toast.success('Offre publiée !');
      },
      error: () => this.toast.error('Erreur lors de la publication.')
    });
  }

  closeJob() {
    const j = this.job();
    if (!j) return;
    this.recruitmentService.closeJob(j.id).subscribe({
      next: updated => {
        this.job.set(updated);
        this.toast.success('Offre clôturée.');
      },
      error: () => this.toast.error('Erreur lors de la clôture.')
    });
  }

  deleteJob() {
    this.showDeleteModal.set(true);
  }

  closeDeleteModal() {
    this.showDeleteModal.set(false);
  }

  confirmDelete() {
    const j = this.job();
    if (!j) return;
    
    this.recruitmentService.deleteJob(j.id).subscribe({
      next: () => {
        this.toast.success('Offre supprimée.');
        this.showDeleteModal.set(false);
        this.goBack();
      },
      error: () => {
        this.toast.error('Erreur lors de la suppression.');
        this.showDeleteModal.set(false);
      }
    });
  }

  // ── Candidate Actions ──

  shortlistCandidate(appId: number) {
    this.recruitmentService.updateApplicationStatus(appId, 'SHORTLISTED').subscribe({
      next: () => {
        this.toast.success('Candidat présélectionné.');
        this.refreshApplications();
      }
    });
  }

  rejectCandidate(appId: number) {
    this.recruitmentService.updateApplicationStatus(appId, 'REJECTED', 'Ne correspond pas au profil').subscribe({
      next: () => {
        this.toast.success('Candidature refusée.');
        this.refreshApplications();
      }
    });
  }

  openCv(app: Application) {
    if (!app || !app.id) return;
    this.toast.info('Chargement du CV...');
    this.recruitmentService.getApplicationCv(app.id).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => window.URL.revokeObjectURL(url), 60000);
      },
      error: (err) => {
        console.error('Erreur de chargement du CV :', err);
        this.toast.error('Impossible de charger le fichier du CV.');
      }
    });
  }

  private refreshApplications() {
    const j = this.job();
    if (j) {
      this.recruitmentService.getApplications(j.id).subscribe(apps =>
        this.applications.set(Array.isArray(apps) ? apps : [])
      );
    }
  }

  goBack() {
    this.router.navigate(['/app/rh/recrutement']);
  }
}
