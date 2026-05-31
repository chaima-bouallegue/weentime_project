import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

import {
  EntrepriseService,
  Entreprise,
  EnterpriseAccessControl,
  EnterpriseAccessUserResponse,
} from '../../entreprise.service';
import { ToastService } from '../../../../../core/services/toast.service';

type AccessSection = 'rh' | 'manager';

@Component({
  selector: 'app-enterprise-access-control-modal',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './enterprise-access-control-modal.component.html',
  styleUrl: './enterprise-access-control-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnterpriseAccessControlModalComponent implements OnChanges {

  @Input() entreprise: Entreprise | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  private readonly svc = inject(EntrepriseService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly accessControl = signal<EnterpriseAccessControl | null>(null);
  readonly selectedRhIds = signal<Set<number>>(new Set());
  readonly selectedManagerIds = signal<Set<number>>(new Set());

  // ── Lifecycle ────────────────────────────────────────────

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['entreprise'] && this.entreprise) {
      this.loadAccessControl();
    }
  }

  // ── Load ─────────────────────────────────────────────────

  loadAccessControl(): void {
    if (!this.entreprise) return;

    this.loading.set(true);
    this.error.set(null);

    this.svc.getEnterpriseAccessControl(this.entreprise.id).subscribe({
      next: (data: EnterpriseAccessControl) => {
        this.accessControl.set(data);
        this.selectedRhIds.set(
          new Set(
            (data.rhUsers ?? [])
              .filter((u: EnterpriseAccessUserResponse) => u.allowed)
              .map((u: EnterpriseAccessUserResponse) => u.id)
          )
        );
        this.selectedManagerIds.set(
          new Set(
            (data.managerUsers ?? [])
              .filter((u: EnterpriseAccessUserResponse) => u.allowed)
              .map((u: EnterpriseAccessUserResponse) => u.id)
          )
        );
        this.loading.set(false);
      },
      error: (err: { message: string }) => {
        this.error.set(this.extractMessage(err));
        this.loading.set(false);
      },
    });
  }

  // ── Selection helpers ─────────────────────────────────────

  isSelected(section: AccessSection, userId: number): boolean {
    return section === 'rh'
      ? this.selectedRhIds().has(userId)
      : this.selectedManagerIds().has(userId);
  }

  toggleUser(section: AccessSection, userId: number, checked: boolean): void {
    const current = new Set(
      section === 'rh' ? this.selectedRhIds() : this.selectedManagerIds()
    );
    checked ? current.add(userId) : current.delete(userId);
    section === 'rh'
      ? this.selectedRhIds.set(current)
      : this.selectedManagerIds.set(current);
  }

  // ── Save ─────────────────────────────────────────────────

  save(): void {
    if (!this.entreprise || this.saving()) return;

    this.saving.set(true);
    this.error.set(null);

    this.svc.updateEnterpriseAccessControl(this.entreprise.id, {
      rhUserIds: Array.from(this.selectedRhIds()),
      managerUserIds: Array.from(this.selectedManagerIds()),
    }).subscribe({
      next: (data: EnterpriseAccessControl) => {
        this.accessControl.set(data);
        this.saving.set(false);
        this.toast.success('Accès mis à jour.');
        this.saved.emit();
      },
      error: (err: { message: string }) => {
        const msg = this.extractMessage(err);
        this.error.set(msg);
        this.toast.error(msg);
        this.saving.set(false);
      },
    });
  }

  // ── Private ───────────────────────────────────────────────

  private extractMessage(err: any): string {
    return (
      err?.error?.details ||
      err?.error?.message ||
      err?.message ||
         `Impossible de charger le contrôle des accès.`
  );
}
}