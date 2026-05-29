// [WEENTIME-VOCAL] Vocal Status Bar Component
import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VocalStateService } from '../../services/vocal-state.service';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-vocal-status-bar',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="status-container">
      <h3 class="title">Statut Serveurs</h3>
      
      <div class="module-list">
        <!-- STT Module -->
        <div class="module-item">
          <div class="module-info">
            <span class="module-name">Speech to Text</span>
            <span class="module-status" [class.active]="orbState() === 'listening'">
              {{ orbState() === 'listening' ? 'Écoute...' : 'Prêt' }}
            </span>
          </div>
          <div class="led" [class.on]="orbState() === 'listening'"></div>
        </div>

        <!-- NLU Module -->
        <div class="module-item">
          <div class="module-info">
            <span class="module-name">NLU Engine</span>
            <span class="module-status" [class.active]="orbState() === 'processing'">
              {{ orbState() === 'processing' ? 'Analyse...' : 'Prêt' }}
            </span>
          </div>
          <div class="led" [class.on]="orbState() === 'processing'"></div>
        </div>

        <!-- TTS Module -->
        <div class="module-item">
          <div class="module-info">
            <span class="module-name">Text to Speech</span>
            <span class="module-status" [class.active]="orbState() === 'responding'">
              {{ orbState() === 'responding' ? 'Synthèse...' : 'Prêt' }}
            </span>
          </div>
          <div class="led" [class.on]="orbState() === 'responding'"></div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .status-container {
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    .title {
      font-size: 11px;
      font-weight: 800;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin: 0 0 16px 0;
    }
    .module-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
      flex: 1;
      justify-content: center;
    }
    .module-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      background: #FFFFFF;
      border-radius: 12px;
      border: 1px solid #f1f5f9;
    }
    .module-info { display: flex; flex-direction: column; gap: 2px; }
    .module-name { font-size: 13px; font-weight: 700; color: #1e293b; }
    .module-status { font-size: 11px; color: #94a3b8; font-weight: 600; }
    .module-status.active { color: #4f46e5; }
    
    .led {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #cbd5e1;
      transition: all 0.3s;
    }
    .led.on {
      background: #22c55e;
      box-shadow: 0 0 8px #22c55e;
    }
  `]
})
export class VocalStatusBarComponent {
  private vocalState = inject(VocalStateService);
  orbState = this.vocalState.orbState;
}
