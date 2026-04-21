// [WEENTIME-VOCAL] Transcript Component
import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-vocal-transcript',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="zen-transcript" role="status" aria-live="polite">
      @if(text) {
        <span class="text-content" [class.ar-text]="isArabic()">{{ text }}</span>
      } @else {
        <span class="placeholder">Je vous écoute...</span>
      }
      <span class="cursor"></span>
    </div>
  `,
  styles: [`
    .zen-transcript {
      width: 100%;
      text-align: center;
      min-height: 80px;
      line-height: 1.4;
      font-family: 'Inter', -apple-system, sans-serif;
      font-weight: 500;
      word-break: break-word;
      transition: all 0.3s ease;
      white-space: pre-wrap;
    }
    .text-content {
      font-size: 32px;
      color: rgba(255, 255, 255, 0.95);
      letter-spacing: -0.02em;
      text-shadow: 0 4px 32px rgba(255, 255, 255, 0.25);
    }
    .text-content.ar-text {
      font-family: 'Tajawal', 'Cairo', sans-serif;
      font-size: 38px;
      direction: rtl;
    }
    .placeholder { 
      font-size: 28px;
      color: rgba(255, 255, 255, 0.3); 
      font-weight: 300;
    }
    .cursor {
      display: inline-block;
      width: 4px;
      height: 36px;
      background: #818cf8;
      box-shadow: 0 0 12px rgba(129, 140, 248, 0.8);
      margin-left: 6px;
      vertical-align: middle;
      border-radius: 2px;
      animation: blink 1s step-end infinite;
    }
    @keyframes blink {
      0%, 100% { opacity: 1; box-shadow: 0 0 16px rgba(129, 140, 248, 0.8); }
      50% { opacity: 0; box-shadow: none; }
    }
    @media (max-width: 768px) {
      .text-content { font-size: 24px; }
      .placeholder { font-size: 22px; }
      .cursor { height: 26px; }
    }
  `]
})
export class VocalTranscriptComponent {
  @Input() text: string = '';

  isArabic(): boolean {
    if (!this.text) return false;
    // Simple heuristic for demo: if it contains arabic characters
    return /[\u0600-\u06FF]/.test(this.text);
  }
}
