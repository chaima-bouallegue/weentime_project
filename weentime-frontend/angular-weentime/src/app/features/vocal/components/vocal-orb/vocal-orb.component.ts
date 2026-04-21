// [WEENTIME-VOCAL] Vocal Orb Component
import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OrbState } from '../../models/vocal-session.model';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-vocal-orb',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="orb-container" [ngClass]="state">
      <!-- Rings -->
      <div class="orb-ring ring-1"></div>
      <div class="orb-ring ring-2"></div>
      <div class="orb-ring ring-3"></div>

      <!-- Core -->
      <div 
        class="orb-core" 
        (click)="orbClick.emit()"
        (keydown.enter)="orbClick.emit()"
        tabindex="0"
        role="button"
        [attr.aria-label]="'Orb state: ' + state"
      >
        @if(state === 'idle') {
          <lucide-icon name="mic" size="32" color="white"></lucide-icon>
        } @else if(state === 'listening') {
          <div class="equalizer">
            <span class="bar"></span><span class="bar"></span><span class="bar"></span><span class="bar"></span>
          </div>
        } @else if(state === 'processing') {
          <lucide-icon name="loader-2" size="32" color="white" class="animate-spin"></lucide-icon>
        } @else if(state === 'responding') {
          <lucide-icon name="volume-2" size="32" color="white"></lucide-icon>
        } @else if(state === 'error') {
          <lucide-icon name="x-circle" size="32" color="white"></lucide-icon>
        }
      </div>
    </div>
  `,
  styles: [`
    .orb-container {
      position: relative;
      width: 200px;
      height: 200px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto;
    }

    .orb-ring {
      position: absolute;
      border-radius: 50%;
      border: 1.5px solid rgba(99, 102, 241, 0.3);
      pointer-events: none;
    }

    .ring-1 { width: 120px; height: 120px; }
    .ring-2 { width: 160px; height: 160px; animation-delay: 0.3s; }
    .ring-3 { width: 200px; height: 200px; animation-delay: 0.6s; }

    .orb-core {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: linear-gradient(135deg, #6366f1, #4f46e5);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: transform 0.2s, background 0.4s;
      z-index: 10;
      box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);
      
      &:hover { transform: scale(1.05); }
      &:active { transform: scale(0.97); }
      &:focus-visible { outline: 3px solid #f59e0b; outline-offset: 4px; }
    }

    /* Idle - Gentle Pulse */
    .orb-container.idle .orb-core {
      animation: pulse-idle 3s ease-in-out infinite alternate;
    }

    /* Listening - Expand rings */
    .orb-container.listening .orb-ring {
      animation: expand 1.5s ease-out infinite;
      border-color: rgba(99, 102, 241, 0.6);
    }
    .orb-container.listening .orb-core {
      background: linear-gradient(135deg, #4f46e5, #4338ca);
    }

    /* Processing - Spin outer shadow */
    .orb-container.processing .orb-core {
      animation: orbit-spin 1.2s linear infinite;
    }

    /* Responding - Green Pulse */
    .orb-container.responding .orb-core {
      background: linear-gradient(135deg, #22c55e, #16a34a);
      animation: pulse-green 1s ease-in-out infinite alternate;
    }

    /* Error - Shake */
    .orb-container.error .orb-core {
      background: linear-gradient(135deg, #ef4444, #dc2626);
      animation: shake 0.4s ease-in-out;
    }

    /* Fake CSS Equalizer inside orb */
    .equalizer {
      display: flex; gap: 4px; align-items: center; justify-content: center; height: 24px;
    }
    .equalizer .bar {
      width: 4px; background: white; border-radius: 2px;
      animation: eq 0.6s ease-in-out infinite alternate;
    }
    .equalizer .bar:nth-child(1) { height: 60%; animation-delay: 0.1s; }
    .equalizer .bar:nth-child(2) { height: 100%; animation-delay: 0.2s; }
    .equalizer .bar:nth-child(3) { height: 80%; animation-delay: 0.3s; }
    .equalizer .bar:nth-child(4) { height: 50%; animation-delay: 0.4s; }

    /* Keyframes */
    @keyframes pulse-idle {
      from { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4); }
      to   { box-shadow: 0 0 0 10px rgba(99, 102, 241, 0); }
    }
    @keyframes expand {
      0%   { transform: scale(1); opacity: 0.6; }
      100% { transform: scale(1.15); opacity: 0; }
    }
    @keyframes orbit-spin {
      from { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4); transform: rotate(0deg); }
      to   { box-shadow: 0 0 0 20px rgba(99, 102, 241, 0); transform: rotate(360deg); }
    }
    @keyframes pulse-green {
      from { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.5); }
      to   { box-shadow: 0 0 0 16px rgba(34, 197, 94, 0); }
    }
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25%       { transform: translateX(-6px); }
      75%       { transform: translateX(6px); }
    }
    @keyframes eq {
      from { transform: scaleY(0.4); }
      to   { transform: scaleY(1); }
    }
  `]
})
export class VocalOrbComponent {
  @Input({required: true}) state!: OrbState;
  @Output() orbClick = new EventEmitter<void>();
}
