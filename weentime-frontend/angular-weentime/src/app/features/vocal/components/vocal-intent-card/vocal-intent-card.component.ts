// [WEENTIME-VOCAL] Intent Card Component
import { Component, Input, ChangeDetectionStrategy, computed, signal, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VocalIntent } from '../../models/vocal-intent.model';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-vocal-intent-card',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="intent-wrapper">
      <div class="intent-header">
        <h3 class="title">Intention Détectée (NLU)</h3>
        @if(intent) {
          <div class="confidence-badge" [class]="getConfidenceClass()">
            <lucide-icon name="activity" size="14"></lucide-icon>
            {{ (intent.confidence * 100) | number:'1.0-0' }}%
          </div>
        }
      </div>

      <div class="intent-content">
        @if(intent) {
          <div class="intent-main">
            <div class="intent-icon">
              <lucide-icon [name]="getIntentIcon(intent.type)" size="28" color="#4f46e5"></lucide-icon>
            </div>
            <div class="intent-label">
              <span class="type-name">{{ formatIntentType(intent.type) }}</span>
            </div>
          </div>
          
          @if(intent.entities && intent.entities.length > 0) {
            <div class="entities-list">
              <span class="entities-title">Entités :</span>
              @for(ent of intent.entities; track ent.value) {
                <span class="entity-chip">
                  <strong>{{ ent.type }}</strong> : {{ ent.normalized }}
                </span>
              }
            </div>
          }
        } @else {
          <div class="empty-state">
            <lucide-icon name="cpu" size="32" color="#cbd5e1"></lucide-icon>
            <p>En attente d'analyse structurée</p>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .intent-wrapper {
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    .intent-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .title {
      font-size: 11px;
      font-weight: 800;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin: 0;
    }
    .confidence-badge {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 700;
    }
    .conf-high { background: #ecfdf5; color: #10b981; }
    .conf-mid { background: #fffbeb; color: #f59e0b; }
    .conf-low { background: #fef2f2; color: #ef4444; }

    .intent-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 16px;
    }

    .intent-main {
      display: flex;
      align-items: center;
      gap: 16px;
      background: #FFFFFF;
      padding: 16px;
      border-radius: 16px;
    }

    .intent-icon {
      width: 56px;
      height: 56px;
      background: white;
      border-radius: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .intent-label .type-name {
      font-size: 18px;
      font-weight: 700;
      color: #1e293b;
    }

    .entities-list {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }
    .entities-title { font-size: 12px; color: #64748b; font-weight: 600; margin-right: 4px; }
    .entity-chip {
      background: #EEEDFE;
      color: #4f46e5;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 12px;
      strong { font-weight: 800; margin-right: 2px; }
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #94a3b8;
      p { margin-top: 8px; font-size: 13px; font-weight: 600; }
    }
  `]
})
export class VocalIntentCardComponent {
  @Input() intent: VocalIntent | null = null;

  getConfidenceClass(): string {
    if (!this.intent) return '';
    if (this.intent.confidence >= 0.85) return 'conf-high';
    if (this.intent.confidence >= 0.65) return 'conf-mid';
    return 'conf-low';
  }

  formatIntentType(type: string): string {
    return type.replace(/_/g, ' ').toLowerCase()
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  getIntentIcon(type: string): string {
    if (type.includes('CONGE')) return 'calendar-heart';
    if (type.includes('POINTAGE')) return 'clock';
    if (type.includes('TELETRAVAIL')) return 'laptop';
    if (type.includes('PLANNING') || type.includes('ABSENCE')) return 'users';
    return 'zap';
  }
}
