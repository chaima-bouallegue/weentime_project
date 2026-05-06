import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { CommunicationStoreService } from '../services/communication-store.service';

@Component({
  selector: 'app-direct-message-page',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="comm-direct-state">
      <div *ngIf="error(); else loadingState" class="comm-direct-card error">
        <h2>Impossible d'ouvrir la conversation</h2>
        <p>{{ error() }}</p>
        <button type="button" (click)="openDirect()">Reessayer</button>
      </div>

      <ng-template #loadingState>
        <div class="comm-direct-card">
          <h2>Ouverture de la conversation...</h2>
          <p>Nous cherchons ou creons le message direct demandé.</p>
        </div>
      </ng-template>
    </section>
  `,
  styles: [`
    .comm-direct-state {
      min-height: calc(100vh - 220px);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .comm-direct-card {
      max-width: 420px;
      text-align: center;
      padding: 32px;
      border-radius: 28px;
      background: rgba(255, 255, 255, 0.96);
      box-shadow: 0 24px 60px rgba(15, 23, 42, 0.08);
    }

    .comm-direct-card.error {
      border: 1px solid rgba(248, 113, 113, 0.25);
    }

    button {
      margin-top: 16px;
      border: none;
      border-radius: 999px;
      background: #0f766e;
      color: white;
      padding: 12px 18px;
      cursor: pointer;
    }
  `]
})
export class DirectMessagePage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly store = inject(CommunicationStoreService);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.openDirect();
  }

  openDirect(): void {
    const userId = Number(this.route.snapshot.paramMap.get('userId'));
    if (!Number.isFinite(userId)) {
      this.error.set('Identifiant utilisateur invalide.');
      return;
    }

    this.error.set(null);
    this.store.openDirect(userId).subscribe({
      next: channel => {
        void this.router.navigate(['/app/messages/channel', channel.id], { replaceUrl: true });
      },
      error: error => {
        this.error.set(error instanceof Error ? error.message : 'Conversation indisponible.');
      }
    });
  }
}
