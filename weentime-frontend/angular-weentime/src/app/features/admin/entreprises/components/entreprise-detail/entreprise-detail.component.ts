import {
  ChangeDetectionStrategy, Component, EventEmitter,
  Input, Output, inject, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  LucideAngularModule,
  ArrowLeft, Edit3, Trash2, X,
  Copy, ExternalLink, Mail, Phone,
  MapPin, Briefcase, ShieldCheck,
} from 'lucide-angular';
import { Entreprise } from '../../entreprise.service';
import { ToastService } from '../../../../../core/services/toast.service';

// ── Vue enrichie exposée au template ──────────────────────
export interface EntrepriseView extends Entreprise {
  statusLabel: string;
}

function toView(e: Entreprise): EntrepriseView {
  const labels: Record<string, string> = {
    ACTIVE: 'Active',
    SUSPENDED: 'Suspendue',
    CLOSED: 'Fermée',
  };
  return { ...e, statusLabel: labels[e.status] ?? e.status };
}

@Component({
  selector: 'app-entreprise-detail',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './entreprise-detail.component.html',
  styleUrls: ['./entreprise-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntrepriseDetailComponent {

  private readonly _raw = signal<Entreprise | null>(null);
  private readonly toast = inject(ToastService);

  // ── Input → stocké dans signal interne ───────────────────
  @Input() set entreprise(val: Entreprise | null) {
    this._raw.set(val);
  }

  // ── Getter lu par le template via entreprise.statusLabel ─
  // Le template fait @if (entreprise) { ... entreprise.statusLabel }
  // On retourne le view-model enrichi
  get entreprise(): EntrepriseView | null {
    const raw = this._raw();
    return raw ? toView(raw) : null;
  }

  @Output() close = new EventEmitter<void>();
  @Output() edit = new EventEmitter<Entreprise>();
  @Output() delete = new EventEmitter<Entreprise>();
  @Output() controlAccess = new EventEmitter<Entreprise>();

  readonly iconArrowLeft = ArrowLeft;
  readonly iconEdit = Edit3;
  readonly iconTrash = Trash2;
  readonly iconX = X;
  readonly iconCopy = Copy;
  readonly iconExternal = ExternalLink;
  readonly iconMail = Mail;
  readonly iconPhone = Phone;
  readonly iconMap = MapPin;
  readonly iconBriefcase = Briefcase;
  readonly iconAccess = ShieldCheck;

  copyCode(code: string): void {
    if (!code) return;
    navigator.clipboard
      .writeText(code)
      .then(() => this.toast.success("Code d'invitation copié !"))
      .catch(() => this.toast.error('Erreur lors de la copie'));
  }
}