import { ChangeDetectionStrategy, Component, inject, signal, computed, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { LucideAngularModule, Calendar, Clock, MapPin, Video, Check, X, Info, Users, History, ChevronRight, FileText, Bell, Trash2, Edit2, Play, Sparkles, Download, Target, Repeat, ArrowLeft, AlertTriangle, Save } from 'lucide-angular';
import { ReunionService } from '../../../core/services/reunion.service';
import { ReunionStore } from '../../../core/services/reunion.store';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { AIService } from '../../../core/services/ai.service';
import { Reunion, RSVPResponse, ReunionStatut } from '../../../core/models/reunion.model';

@Component({
  selector: 'app-reunion-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, RouterModule],
  templateUrl: './reunion-detail.component.html',
  styleUrls: ['./reunion-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReunionDetailComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private reunionService = inject(ReunionService);
  private store = inject(ReunionStore);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private aiService = inject(AIService);

  @ViewChild('compteRenduSection') compteRenduSection!: ElementRef;

  // Icons
  readonly iconCalendar = Calendar; readonly iconClock = Clock;
  readonly iconMapPin = MapPin; readonly iconVideo = Video;
  readonly iconCheck = Check; readonly iconX = X;
  readonly iconInfo = Info; readonly iconUsers = Users;
  readonly iconHistory = History; readonly iconChevronRight = ChevronRight;
  readonly iconCloturer = FileText; readonly iconBell = Bell;
  readonly iconTrash = Trash2; readonly iconEdit = Edit2;
  readonly iconPlay = Play; readonly iconSparkles = Sparkles;
  readonly iconDownload = Download; readonly iconTarget = Target;
  readonly iconRepeat = Repeat; readonly iconBack = ArrowLeft;
  readonly iconAlert = AlertTriangle; readonly iconSave = Save;

  readonly RSVP = RSVPResponse;
  readonly Statut = ReunionStatut;

  readonly reunion = signal<Reunion | null>(null);
  readonly isLoading = signal(false);
  readonly showCloturerForm = signal(false);
  readonly isFinalized = signal(false);

  // Modal states
  readonly showAnnulerModal = signal(false);
  readonly showCloturerConfirm = signal(false);

  // Inline editing states
  readonly editingDescription = signal(false);
  readonly editingAgenda = signal(false);
  readonly editDescriptionValue = signal('');
  readonly editAgendaValue = signal('');
  readonly isSaving = signal(false);
  readonly isGeneratingAI = signal(false);

  // Cloturer Form (Structured)
  readonly selectedPresents = signal<number[]>([]);
  reportPoints = signal('');
  reportDecisions = signal('');
  reportActions = signal('');
  lastSaved = signal<string | null>('2s');

  readonly rsvpStats = computed(() => {
    const r = this.reunion();
    if (!r) return { confirmed: 0, declined: 0, pending: 0 };
    return {
      confirmed: r.participants.filter(p => p.reponse === RSVPResponse.CONFIRME).length,
      declined: r.participants.filter(p => p.reponse === RSVPResponse.DECLINE).length,
      pending: r.participants.filter(p => p.reponse === RSVPResponse.EN_ATTENTE).length,
    };
  });

  readonly checkedCount = computed(() => this.selectedPresents().length);

  readonly myRsvp = computed(() => {
    const user = this.authService.currentUser();
    const r = this.reunion();
    if (!user || !r) return null;
    return r.participants.find(p => p.utilisateurId === user.id)?.reponse || null;
  });

  constructor() {
    this.route.data.subscribe(data => {
      if (data['reunion']) {
        this.reunion.set(data['reunion']);
        this.isFinalized.set(data['reunion'].statut === ReunionStatut.CLOTUREE);
        this.parseReport(data['reunion'].compteRendu);

        this.selectedPresents.set(
          data['reunion'].participants
            .filter((p: any) => p.reponse === RSVPResponse.CONFIRME)
            .map((p: any) => p.utilisateurId)
        );
      }
    });
  }

  private parseReport(raw: string) {
    if (!raw) return;
    const parts = raw.split(/###\s+/);
    parts.forEach(p => {
      if (p.startsWith('Points')) this.reportPoints.set(p.replace('Points discutés\n', '').trim());
      if (p.startsWith('Décisions')) this.reportDecisions.set(p.replace('Décisions prises\n', '').trim());
      if (p.startsWith('Actions')) this.reportActions.set(p.replace('Actions à suivre\n', '').trim());
    });
  }

  // --- Navigation ---
  goBack() {
    this.router.navigate(['/app/reunions']);
  }

  isOrganisateur(): boolean {
    const user = this.authService.currentUser();
    const r = this.reunion();
    return user?.id === r?.organisateurId;
  }

  getStatusLabel(statut: ReunionStatut): string {
    const labels: Record<ReunionStatut, string> = {
      [ReunionStatut.PLANIFIEE]: 'Planifiée',
      [ReunionStatut.EN_COURS]: 'En cours',
      [ReunionStatut.CLOTUREE]: 'Clôturée',
      [ReunionStatut.ANNULEE]: 'Annulée'
    };
    return labels[statut] || statut;
  }

  getRsvpLabel(reponse: RSVPResponse): string {
    const labels: Record<RSVPResponse, string> = {
      [RSVPResponse.CONFIRME]: 'Confirmé',
      [RSVPResponse.DECLINE]: 'Refusé',
      [RSVPResponse.EN_ATTENTE]: 'En attente'
    };
    return labels[reponse] || reponse;
  }

  formatTime(time: string): string {
    if (!time) return '';
    const parts = time.split(':');
    if (parts.length >= 2) return `${parts[0]}:${parts[1]}`;
    return time;
  }

  getInitials(p: any): string {
    const first = p.prenom?.[0] || '';
    const last = p.nom?.[0] || '';
    return (first + last).toUpperCase();
  }

  formatName(name: string): string {
    if (!name) return '';
    return name.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  respond(reponse: RSVPResponse) {
    const r = this.reunion();
    if (!r) return;
    this.reunionService.repondre(r.uuid, reponse).subscribe({
      next: () => { this.toast.success('Réponse enregistrée'); this.refresh(); }
    });
  }

  togglePresence(uid: number) {
    if (this.isFinalized()) return;
    const idx = this.selectedPresents().indexOf(uid);
    if (idx >= 0) {
      this.selectedPresents.update(list => list.filter(id => id !== uid));
    } else {
      this.selectedPresents.update(list => [...list, uid]);
    }
  }

  // --- Inline Editing: Description ---
  startEditDescription() {
    const r = this.reunion();
    this.editDescriptionValue.set(r?.description || '');
    this.editingDescription.set(true);
  }

  cancelEditDescription() {
    this.editingDescription.set(false);
  }

  saveDescription() {
    const r = this.reunion();
    if (!r) return;
    this.isSaving.set(true);
    this.reunionService.update(r.uuid, { description: this.editDescriptionValue() }).subscribe({
      next: (updated) => {
        this.reunion.update(prev => prev ? { ...prev, description: this.editDescriptionValue() } : prev);
        this.editingDescription.set(false);
        this.isSaving.set(false);
        this.toast.success('Description mise à jour');
      },
      error: () => {
        this.isSaving.set(false);
        this.toast.error('Erreur lors de la sauvegarde');
      }
    });
  }

  // --- Inline Editing: Agenda ---
  startEditAgenda() {
    const r = this.reunion();
    this.editAgendaValue.set(r?.agenda || '');
    this.editingAgenda.set(true);
  }

  cancelEditAgenda() {
    this.editingAgenda.set(false);
  }

  saveAgenda() {
    const r = this.reunion();
    if (!r) return;
    this.isSaving.set(true);
    this.reunionService.update(r.uuid, { agenda: this.editAgendaValue() }).subscribe({
      next: (updated) => {
        this.reunion.update(prev => prev ? { ...prev, agenda: this.editAgendaValue() } : prev);
        this.editingAgenda.set(false);
        this.isSaving.set(false);
        this.toast.success('Ordre du jour mis à jour');
      },
      error: () => {
        this.isSaving.set(false);
        this.toast.error('Erreur lors de la sauvegarde');
      }
    });
  }

  // --- Clôturer flow ---
  openCloturerForm() {
    this.showCloturerForm.set(true);
    setTimeout(() => this.scrollToCompteRendu(), 200);
  }

  private scrollToCompteRendu() {
    this.compteRenduSection?.nativeElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  finaliser() {
    this.showCloturerConfirm.set(true);
  }

  confirmCloturer() {
    const r = this.reunion();
    if (!r) return;

    const finalReport = `### Points discutés\n${this.reportPoints()}\n\n### Décisions prises\n${this.reportDecisions()}\n\n### Actions à suivre\n${this.reportActions()}`;

    this.reunionService.cloturer(r.uuid, this.selectedPresents(), finalReport).subscribe({
      next: () => {
        this.toast.success('Réunion clôturée avec succès');
        this.showCloturerForm.set(false);
        this.showCloturerConfirm.set(false);
        this.isFinalized.set(true);
        this.refresh();
      }
    });
  }

  // --- Annuler flow ---
  openAnnulerModal() {
    this.showAnnulerModal.set(true);
  }

  confirmAnnuler() {
    const r = this.reunion();
    if (!r) return;
    this.reunionService.annuler(r.uuid).subscribe({
      next: () => {
        this.toast.success('Réunion annulée');
        this.showAnnulerModal.set(false);
        this.goBack();
      }
    });
  }

  // --- PDF Export ---
  exportPDF() {
    const r = this.reunion();
    if (!r) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) { this.toast.error('Veuillez autoriser les popups'); return; }

    const content = `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <title>Compte-rendu — ${r.titre}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', system-ui, sans-serif; color: #1e293b; padding: 3rem; line-height: 1.6; }
          .header { border-bottom: 3px solid #6366f1; padding-bottom: 1.5rem; margin-bottom: 2rem; }
          .header h1 { font-size: 1.75rem; font-weight: 800; color: #1e1b4b; margin-bottom: 0.5rem; }
          .header .meta { font-size: 0.875rem; color: #64748b; }
          .header .meta span { margin-right: 1.5rem; }
          .badge { display: inline-block; padding: 3px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; background: #f0fdf4; color: #166534; margin-left: 0.5rem; }
          .section { margin-bottom: 2rem; }
          .section h2 { font-size: 1rem; font-weight: 700; color: #6366f1; margin-bottom: 0.75rem; padding-bottom: 0.5rem; border-bottom: 1px solid #e2e8f0; }
          .section p, .section pre { font-size: 0.9rem; color: #334155; white-space: pre-wrap; }
          .participants { margin-top: 2rem; }
          .participants h2 { font-size: 1rem; font-weight: 700; color: #6366f1; margin-bottom: 0.75rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.5rem; }
          .participants ul { list-style: none; columns: 2; }
          .participants li { font-size: 0.875rem; padding: 0.25rem 0; }
          .participants li::before { content: '✓ '; color: #10b981; font-weight: 700; }
          .footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; font-size: 0.75rem; color: #94a3b8; text-align: center; }
          @media print { body { padding: 1.5rem; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${r.titre} <span class="badge">${this.getStatusLabel(r.statut)}</span></h1>
          <div class="meta">
            <span>📅 ${r.dateReunion}</span>
            <span>🕐 ${this.formatTime(r.heureDebut)} — ${this.formatTime(r.heureFin)}</span>
            <span>📍 ${r.type === 'EN_LIGNE' ? 'Visioconférence' : (r.lieu || 'Sur site')}</span>
          </div>
        </div>

        ${r.description ? `<div class="section"><h2>Description</h2><p>${r.description}</p></div>` : ''}
        ${r.agenda ? `<div class="section"><h2>Ordre du jour</h2><pre>${r.agenda}</pre></div>` : ''}

        <div class="section"><h2>Points discutés</h2><pre>${this.reportPoints() || '—'}</pre></div>
        <div class="section"><h2>Décisions prises</h2><pre>${this.reportDecisions() || '—'}</pre></div>
        <div class="section"><h2>Actions à suivre</h2><pre>${this.reportActions() || '—'}</pre></div>

        <div class="participants">
          <h2>Participants présents (${this.checkedCount()} / ${r.participants.length})</h2>
          <ul>
            ${r.participants
              .filter(p => this.selectedPresents().includes(p.utilisateurId))
              .map(p => `<li>${this.formatName((p.prenom || '') + ' ' + (p.nom || ''))}</li>`)
              .join('')}
          </ul>
        </div>

        <div class="footer">
          Compte-rendu généré par WeenTime — ${new Date().toLocaleDateString('fr-FR', { dateStyle: 'full' })}
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
      printWindow.onafterprint = () => printWindow.close();
    };
  }

  generateAIReport() {
    const r = this.reunion();
    if (!r) return;

    this.isGeneratingAI.set(true);
    this.toast.info('Génération du compte-rendu par Gemini AI...');

    const participantNames = r.participants.map(p => this.formatName((p.prenom || '') + ' ' + (p.nom || '')));

    this.aiService.generateMeetingReport({
      titre: r.titre,
      description: r.description,
      agenda: r.agenda,
      participants: participantNames,
      date: r.dateReunion,
      heure: `${this.formatTime(r.heureDebut)} — ${this.formatTime(r.heureFin)}`
    }).subscribe({
      next: (result) => {
        this.reportPoints.set(result.points || '');
        this.reportDecisions.set(result.decisions || '');
        this.reportActions.set(result.actions || '');
        this.isGeneratingAI.set(false);
        this.toast.success('Compte-rendu généré par Gemini ✨');
      },
      error: (err) => {
        this.isGeneratingAI.set(false);
        console.error('AI generation error:', err);
        this.toast.error('Erreur lors de la génération IA. Vérifiez que le service AI est démarré.');
      }
    });
  }

  editMeeting() {
    this.toast.info('Utilisez les icônes ✏ pour modifier la description ou l\'ordre du jour');
  }

  sendReminder(participant: any) {
    this.toast.info(`Rappel envoyé à ${participant.prenom}`);
  }

  removeParticipant(participant: any) {
    this.toast.info(`Retrait de ${participant.prenom} (action non implémentée)`);
  }

  private refresh() {
    const r = this.reunion();
    if (!r) return;
    this.store.invalidateDetail(r.uuid);
    this.reunionService.getDetail(r.uuid).subscribe(data => this.reunion.set(data));
  }
}
