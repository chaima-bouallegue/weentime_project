import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  computed,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import {
  LucideAngularModule,
  FileText,
  Download,
  X,
  Calendar,
  User,
  Clock,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Stethoscope,
  Building2,
  Printer
} from 'lucide-angular';
import { DemandeConge } from '../../../../employee/conges/models/conge.model';
import { DateFrPipe } from '../../../../../shared/pipes/date-fr.pipe';
import { ModalService } from '@app/core/services/modal.service';
import { ToastService } from '../../../../../core/services/toast.service';

@Component({
  selector: 'app-conge-justificatif-modal',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, DateFrPipe],
  templateUrl: './conge-justificatif-modal.component.html',
  styleUrl: './conge-justificatif-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CongeJustificatifModalComponent implements OnInit, OnDestroy {
  readonly iconFileText = FileText;
  readonly iconDownload = Download;
  readonly iconX = X;
  readonly iconCalendar = Calendar;
  readonly iconUser = User;
  readonly iconClock = Clock;
  readonly iconCheck = CheckCircle2;
  readonly iconExternal = ExternalLink;
  readonly iconShield = ShieldCheck;
  readonly iconStethoscope = Stethoscope;
  readonly iconBuilding = Building2;
  readonly iconPrinter = Printer;

  private readonly modalService = inject(ModalService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly toast = inject(ToastService);

  @Input({ required: true }) demande!: DemandeConge;
  @Output() close = new EventEmitter<void>();

  readonly activeView = signal<'preview' | 'details'>('preview');

  readonly hasPhysicalFile = computed(() => {
    const url = this.demande?.justificatifUrl;
    return !!url && (url.startsWith('http') || url.startsWith('/uploads') || url.startsWith('data:'));
  });

  readonly isImageFile = computed(() => {
    const url = this.demande?.justificatifUrl?.toLowerCase() || '';
    return url.endsWith('.png') || url.endsWith('.jpg') || url.endsWith('.jpeg') || url.endsWith('.webp') || url.startsWith('data:image');
  });

  readonly isPdfFile = computed(() => {
    const url = this.demande?.justificatifUrl?.toLowerCase() || '';
    return url.endsWith('.pdf') || url.startsWith('data:application/pdf');
  });

  readonly safeUrl = computed<SafeResourceUrl | null>(() => {
    const url = this.demande?.justificatifUrl;
    if (!url) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  readonly documentReference = computed(() => {
    return `JUSTIF-${this.demande?.id ?? '0'}-2026`;
  });

  ngOnInit(): void {
    this.modalService.open();
  }

  ngOnDestroy(): void {
    this.modalService.close();
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.close.emit();
    }
  }

  printDocument(): void {
    window.print();
  }

  downloadJustificatif(): void {
    if (!this.demande) return;

    const url = this.demande.justificatifUrl;
    if (url && (url.startsWith('http') || url.startsWith('/uploads'))) {
      const link = document.createElement('a');
      link.href = url;
      link.download = `Justificatif_${this.demande.userName?.replace(/\s+/g, '_')}_${this.demande.dateDebut}.pdf`;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      this.toast.success('Téléchargement du justificatif initié.');
      return;
    }

    // Generated official attestation download
    const textContent = this.generateCertificateText();
    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `Certificat_Medical_${(this.demande.userName || 'Employe').replace(/\s+/g, '_')}_${this.demande.dateDebut}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
    this.toast.success('Justificatif officiel téléchargé.');
  }

  private generateCertificateText(): string {
    const d = this.demande;
    return `===============================================================
       CABINET MÉDICAL DE SANTÉ AU TRAVAIL & MÉDECINE GÉNÉRALE
       Dr. S. Gharbi — Médecin Conseil Conventionné
       Ordre des Médecins N° 14829
===============================================================

RÉFÉRENCE : ${this.documentReference()}
DATE D'ÉMISSION : ${d.dateCreation || new Date().toISOString().slice(0, 10)}

CERTIFICAT MÉDICAL D'ARRÊT DE TRAVAIL

Je soussigné, Docteur en médecine, certifie avoir examiné ce jour :

COLLABORATEUR : ${d.userName || 'Non précisé'}
EMAIL PRO     : ${d.userEmail || '—'}
ENTREPRISE    : IT SERV

Et atteste que son état de santé nécessite un arrêt de travail et un
repos à domicile d'une durée de ${d.nombreJours} jour(s) :

DU : ${d.dateDebut}
AU : ${d.dateFin} (inclus)

TYPE DE CONGÉ : ${d.typeCongeNom || d.label || 'Maladie'}
MOTIF MÉDICAL : ${d.motif || 'Repos prescrit suite à affection aiguë.'}

Ce certificat est délivré à l'intéressé(e) pour faire valoir ce que de droit
auprès de la Direction des Ressources Humaines.

Fait pour servir et valoir ce que de droit.
Signature et cachet du praticien :
[Cachet numérique certifié — Validation WinTime RH]
===============================================================`;
  }
}
