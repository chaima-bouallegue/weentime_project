import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';
import { PresenceService } from '../../services/presence.service';

@Component({
  selector: 'app-presence-widget',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="widget" [class.compact]="compact()">
      <div class="widget-header">
        <div>
          <span class="widget-kicker">{{ kicker() }}</span>
          <h2>{{ title() }}</h2>
          <p>{{ subtitle() }}</p>
        </div>
        <div class="widget-clock">
          <span class="status-dot" [class.working]="presenceService.isWorking()"></span>
          <strong>{{ currentTime() }}</strong>
        </div>
      </div>

      <div class="widget-body">
        <div class="timer-panel">
          <span class="label">Timer live</span>
          <div class="timer">{{ presenceService.formattedTimer() }}</div>
          <div class="meta-row">
            <div>
              <span class="label">Arrivee</span>
              <strong>{{ presenceService.formattedTime().arrival }}</strong>
            </div>
            <div>
              <span class="label">Sortie</span>
              <strong>{{ presenceService.formattedTime().departure }}</strong>
            </div>
          </div>
        </div>

        <div class="action-panel">
          <div class="status-chip" [class.active]="presenceService.isWorking()">
            <i-lucide [name]="presenceService.isWorking() ? 'badge-check' : 'clock-3'" class="icon"></i-lucide>
            <span>{{ statusLabel() }}</span>
          </div>

          <div class="button-row">
            <button
              type="button"
              class="cta"
              [class.stop]="presenceService.isWorking()"
              [disabled]="presenceService.isSubmitting()"
              (click)="onPrimaryAction()"
            >
              @if (presenceService.isSubmitting()) {
                <span class="spinner"></span>
                <span>Traitement...</span>
              } @else {
                <i-lucide [name]="presenceService.isWorking() ? 'square' : 'play'" class="icon"></i-lucide>
                <span>{{ presenceService.isWorking() ? 'Arreter' : 'Pointer' }}</span>
              }
            </button>

            <button type="button" class="ghost" [disabled]="presenceService.isLoading()" (click)="onRefresh()">
              <i-lucide name="refresh-cw" class="icon"></i-lucide>
              <span>Rafraichir</span>
            </button>
          </div>

          @if (presenceService.error()) {
            <div class="alert error">
              <i-lucide name="triangle-alert" class="icon"></i-lucide>
              <span>{{ presenceService.error() }}</span>
            </div>
          } @else {
            <div class="alert success">
              <i-lucide name="activity" class="icon"></i-lucide>
              <span>{{ helperText() }}</span>
            </div>
          }
        </div>
      </div>
    </section>
  `,
  styles: [`
    .widget {
      display: grid;
      gap: 1rem;
      padding: 1.4rem;
      border-radius: 1.6rem;
      background:
        radial-gradient(circle at top left, rgba(191, 219, 254, 0.34), transparent 34%),
        linear-gradient(135deg, #0f62fe 0%, #4f46e5 42%, #7c3aed 100%);
      color: #fff;
      box-shadow: 0 24px 60px rgba(49, 46, 129, 0.2);
    }
    .widget.compact { padding: 1.2rem; }
    .widget-header, .widget-body, .meta-row, .button-row { display: grid; gap: 1rem; }
    .widget-header { grid-template-columns: minmax(0, 1fr) auto; align-items: start; }
    .widget-kicker, .label {
      font-size: 0.74rem;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      font-weight: 700;
      color: rgba(255,255,255,0.72);
    }
    h2 { margin: 0.35rem 0 0.25rem; font-size: 1.65rem; line-height: 1; }
    p { margin: 0; color: rgba(255,255,255,0.84); }
    .widget-clock { display: inline-flex; align-items: center; gap: 0.6rem; padding: 0.65rem 0.9rem; border-radius: 999px; background: rgba(15, 23, 42, 0.18); font-variant-numeric: tabular-nums; }
    .status-dot { width: 0.7rem; height: 0.7rem; border-radius: 999px; background: #cbd5e1; }
    .status-dot.working { background: #86efac; box-shadow: 0 0 0 0 rgba(134, 239, 172, 0.6); animation: pulse 1.6s infinite; }
    .widget-body { grid-template-columns: minmax(0, 1fr) minmax(15rem, 0.95fr); align-items: stretch; }
    .timer-panel, .action-panel {
      padding: 1rem;
      border-radius: 1.2rem;
      background: rgba(15, 23, 42, 0.16);
      display: grid;
      gap: 0.9rem;
    }
    .timer { font-size: clamp(1.8rem, 3vw, 2.8rem); line-height: 1; font-weight: 800; letter-spacing: -0.04em; font-variant-numeric: tabular-nums; }
    .meta-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .meta-row strong { font-size: 1.1rem; font-variant-numeric: tabular-nums; }
    .status-chip, .alert, .cta, .ghost { display: inline-flex; align-items: center; justify-content: center; gap: 0.6rem; border-radius: 1rem; font-weight: 700; }
    .status-chip { width: fit-content; padding: 0.7rem 0.9rem; background: rgba(255,255,255,0.16); }
    .status-chip.active { background: rgba(134, 239, 172, 0.15); }
    .button-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .cta, .ghost { border: none; cursor: pointer; transition: transform 160ms ease, box-shadow 180ms ease; }
    .cta { padding: 0.95rem 1rem; background: linear-gradient(135deg, #ffffff 0%, #e0f2fe 100%); color: #0f172a; }
    .cta.stop { background: linear-gradient(135deg, #fee2e2 0%, #fecdd3 100%); color: #7f1d1d; }
    .ghost { padding: 0.95rem 1rem; background: rgba(15, 23, 42, 0.18); color: #fff; border: 1px solid rgba(255,255,255,0.18); }
    .cta:hover:not(:disabled), .ghost:hover:not(:disabled) { transform: translateY(-2px); }
    .cta:disabled, .ghost:disabled { opacity: 0.7; cursor: not-allowed; }
    .alert { justify-content: flex-start; padding: 0.85rem 0.95rem; }
    .alert.success { background: rgba(191, 219, 254, 0.16); }
    .alert.error { background: rgba(254, 202, 202, 0.18); }
    .spinner {
      width: 1rem; height: 1rem; border-radius: 999px;
      border: 2px solid rgba(15,23,42,0.15); border-top-color: currentColor;
      animation: spin 0.8s linear infinite;
    }
    @keyframes pulse { 70% { box-shadow: 0 0 0 12px rgba(134, 239, 172, 0); } }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (max-width: 860px) {
      .widget-body, .button-row, .meta-row { grid-template-columns: 1fr; }
      .widget-header { grid-template-columns: 1fr; }
    }
  `],
})
export class PresenceWidgetComponent {
  protected readonly presenceService = inject(PresenceService);
  private readonly destroyRef = inject(DestroyRef);

  readonly title = input('Pointage');
  readonly subtitle = input('Check-in/check-out instantane avec minuterie en direct.');
  readonly kicker = input('Presence');
  readonly compact = input(false);

  protected readonly currentTime = signal(this.formatCurrentTime(new Date()));

  constructor() {
    interval(1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.currentTime.set(this.formatCurrentTime(new Date())));

    if (!this.presenceService.today()) {
      void this.presenceService.getToday();
    }
  }

  protected statusLabel(): string {
    switch (this.presenceService.uiState()) {
      case 'WORKING':
        return 'Session ouverte';
      case 'FINISHED':
        return 'Journee cloturee';
      default:
        return 'Pret a pointer';
    }
  }

  protected helperText(): string {
    switch (this.presenceService.uiState()) {
      case 'WORKING':
        return 'Le timer est actif et la session est visible pour les roles de supervision.';
      case 'FINISHED':
        return 'La derniere session est enregistree et synchronisee.';
      default:
        return 'Tous les roles authentifies peuvent lancer leur pointage depuis ce widget.';
    }
  }

  protected async onPrimaryAction(): Promise<void> {
    if (this.presenceService.isWorking()) {
      await this.presenceService.checkOut();
      return;
    }
    await this.presenceService.checkIn();
  }

  protected async onRefresh(): Promise<void> {
    await this.presenceService.refresh();
  }

  private formatCurrentTime(date: Date): string {
    return date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
}
