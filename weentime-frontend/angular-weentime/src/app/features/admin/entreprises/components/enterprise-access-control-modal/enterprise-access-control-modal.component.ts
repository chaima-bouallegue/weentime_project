import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import {
  EnterpriseAccessControl,
  Entreprise,
  EntrepriseService
} from '../../entreprise.service';
import { ToastService } from '../../../../../core/services/toast.service';

type AccessSection = 'rh' | 'manager';

@Component({
  selector: 'app-enterprise-access-control-modal',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './enterprise-access-control-modal.component.html',
  styleUrl: './enterprise-access-control-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EnterpriseAccessControlModalComponent implements OnChanges {
  @Input() entreprise: Entreprise | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  private entrepriseService = inject(EntrepriseService);
  private toastService = inject(ToastService);

  loading = signal(false);
  saving = signal(false);
  error = signal<string | null>(null);
  accessControl = signal<EnterpriseAccessControl | null>(null);
  selectedRhIds = signal<Set<number>>(new Set());
  selectedManagerIds = signal<Set<number>>(new Set());

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['entreprise'] && this.entreprise) {
      this.loadAccessControl();
    }
  }

  loadAccessControl(): void {
    if (!this.entreprise) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.entrepriseService.getEnterpriseAccessControl(this.entreprise.id).subscribe({
      next: (data) => {
        this.accessControl.set(data);
        this.selectedRhIds.set(new Set(data.rhUsers.filter(user => user.allowed).map(user => user.id)));
        this.selectedManagerIds.set(new Set(data.managerUsers.filter(user => user.allowed).map(user => user.id)));
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(this.extractErrorMessage(err));
        this.loading.set(false);
      }
    });
  }

  isSelected(section: AccessSection, userId: number): boolean {
    return section === 'rh'
      ? this.selectedRhIds().has(userId)
      : this.selectedManagerIds().has(userId);
  }

  toggleUser(section: AccessSection, userId: number, checked: boolean): void {
    const current = new Set(section === 'rh' ? this.selectedRhIds() : this.selectedManagerIds());

    if (checked) {
      current.add(userId);
    } else {
      current.delete(userId);
    }

    if (section === 'rh') {
      this.selectedRhIds.set(current);
    } else {
      this.selectedManagerIds.set(current);
    }
  }

  save(): void {
    if (!this.entreprise || this.saving()) {
      return;
    }

    this.saving.set(true);
    this.error.set(null);

    this.entrepriseService.updateEnterpriseAccessControl(this.entreprise.id, {
      rhUserIds: Array.from(this.selectedRhIds()),
      managerUserIds: Array.from(this.selectedManagerIds())
    }).subscribe({
      next: (data) => {
        this.accessControl.set(data);
        this.saving.set(false);
        this.toastService.success('Acces mis a jour.');
        this.saved.emit();
      },
      error: (err) => {
        const message = this.extractErrorMessage(err);
        this.error.set(message);
        this.toastService.error(message);
        this.saving.set(false);
      }
    });
  }

  private extractErrorMessage(err: any): string {
    return err?.error?.details
      || err?.error?.message
      || err?.message
      || 'Impossible de charger le controle des acces.';
  }
}
