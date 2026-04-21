import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, ArrowLeft, Edit3, Trash2, X, Copy, ExternalLink, Mail, Phone, MapPin, Briefcase } from 'lucide-angular';
import { Entreprise } from '../../entreprise.service';
import { ToastService } from '../../../../../core/services/toast.service';

@Component({
  selector: 'app-entreprise-detail',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './entreprise-detail.component.html',
  styleUrls: ['./entreprise-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EntrepriseDetailComponent {
  @Input() set entreprise(val: Entreprise | null) {
    this._entreprise.set(val);
  }
  get entreprise() { return this._entreprise(); }

  @Output() close = new EventEmitter<void>();
  @Output() edit = new EventEmitter<Entreprise>();
  @Output() delete = new EventEmitter<Entreprise>();

  private _entreprise = signal<Entreprise | null>(null);
  private toastService = inject(ToastService);

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

  constructor() {}

  copyCode(code: string): void {
    if (!code) return;
    navigator.clipboard.writeText(code);
    this.toastService.success(`Code d'invitation copié !`);
  }
}
