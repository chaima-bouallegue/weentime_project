import { Component, inject, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { RhStructureStore } from '../../../../../core/services/rh-structure.store';
import { EmployeRH } from '../../models/structure.model';

@Component({
  selector: 'app-pending-requests-overlay',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    <div class="drawer-overlay" [class.embedded]="true" (click)="close.emit()">
      <div class="drawer-content" (click)="$event.stopPropagation()">
        <div class="drawer-header" style="padding: 24px 32px;">
          <h3 class="drawer-title" style="font-size: 16px;">
            <span>Demandes d'inscription</span>
            @if (pendingEmployes().length > 0) {
              <span style="margin-left: 8px; padding: 2px 8px; background: #f59e0b20; color: #f59e0b; font-size: 11px; border-radius: 999px;">
                {{ pendingEmployes().length }}
              </span>
            }
          </h3>
          <button class="close-btn" (click)="close.emit()">
            <lucide-icon name="x" size="20"></lucide-icon>
          </button>
        </div>

        <div class="form-scroll">
          @if (pendingEmployes().length === 0) {
            <div style="padding: 48px 0; text-align: center; color: #94a3b8;">
              <lucide-icon name="user-check" size="32" style="margin: 0 auto 12px; opacity: 0.4;"></lucide-icon>
              <div style="font-size: 12px; font-weight: 700;">Aucune demande d'inscription</div>
            </div>
          } @else {
            <div style="display: flex; flex-direction: column; gap: 16px;">
              @for (emp of pendingEmployes(); track emp.id) {
                <div style="padding: 16px; border: 1px solid #f1f5f9; border-radius: 12px; background: white;">
                  <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                    <div style="width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: 900; flex-shrink: 0;"
                      [style.background-color]="getAvatarColor(emp.prenom + emp.nom)">
                      {{ getInitials(emp.prenom, emp.nom) }}
                    </div>
                    <div style="min-width: 0;">
                      <div style="font-size: 13px; font-weight: 800; color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        {{ emp.prenom }} {{ emp.nom }}
                      </div>
                      <div style="font-size: 11px; color: #64748b; font-weight: 600;">{{ emp.email }}</div>
                      <div style="font-size: 11px; color: #6366f1; font-weight: 700;">{{ emp.poste || 'Collaborateur' }}</div>
                    </div>
                  </div>
                  <div style="font-size: 11px; color: #94a3b8; font-weight: 700; padding: 8px 12px; background: #f8fafc; border-radius: 8px; margin-bottom: 12px;">
                    Demandé le {{ formatDate(emp.dateCreation) }}
                  </div>
                  <div style="display: flex; gap: 8px;">
                    <button (click)="onAccept(emp)"
                      style="flex: 1; padding: 8px 12px; background: #ecfdf5; color: #059669; border: none; border-radius: 8px; font-size: 11px; font-weight: 800; text-transform: uppercase; display: flex; align-items: center; justify-content: center; gap: 4px; cursor: pointer;">
                      <lucide-icon name="check" size="12"></lucide-icon>
                      Accepter
                    </button>
                    <button (click)="onReject(emp)"
                      style="flex: 1; padding: 8px 12px; background: #fff1f2; color: #e11d48; border: none; border-radius: 8px; font-size: 11px; font-weight: 800; text-transform: uppercase; display: flex; align-items: center; justify-content: center; gap: 4px; cursor: pointer;">
                      <lucide-icon name="x" size="12"></lucide-icon>
                      Refuser
                    </button>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class PendingRequestsOverlayComponent {
  private store = inject(RhStructureStore);
  protected pendingEmployes = this.store.pendingEmployes;

  close = output<void>();
  validateUser = output<EmployeRH>();
  rejectUser = output<EmployeRH>();

  protected onAccept(user: EmployeRH): void {
    this.validateUser.emit(user);
  }

  protected onReject(user: EmployeRH): void {
    this.rejectUser.emit(user);
  }

  protected getInitials(prenom: string, nom: string): string {
    return ((prenom?.[0] ?? '') + (nom?.[0] ?? '')).toUpperCase() || '??';
  }

  protected getAvatarColor(name: string): string {
    const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  protected formatDate(dateStr: string): string {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
