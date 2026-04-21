// [WEENTIME-VOCAL] Vocal Response Component
import { Component, Input, ChangeDetectionStrategy, OnChanges, SimpleChanges, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VocalResponse } from '../../models/vocal-response.model';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-vocal-response',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="zen-response">
      @if(response) {
        <div class="content-wrapper">
          <div class="bot-text" [class.ar-text]="response.langue === 'ar'">
             {{ displayedText() }}
          </div>
          <button class="voice-btn" [class.playing]="playing()" (click)="togglePlay()" title="Rejouer">
            <lucide-icon [name]="playing() ? 'square' : 'play'" size="16"></lucide-icon>
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .zen-response {
      width: 100%;
      display: flex;
      justify-content: center;
      min-height: 48px;
    }
    .content-wrapper {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      max-width: 800px;
      animation: slide-up 0.4s ease-out forwards;
    }
    .bot-text {
      font-size: 22px;
      color: rgba(255, 255, 255, 0.65);
      line-height: 1.6;
      text-align: center;
      font-weight: 400;
      text-shadow: 0 2px 12px rgba(255, 255, 255, 0.1);
    }
    .bot-text.ar-text {
      font-family: 'Tajawal', 'Cairo', sans-serif;
      font-size: 28px;
      direction: rtl;
    }
    .voice-btn {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: transparent;
      border: 1.5px solid rgba(255, 255, 255, 0.15);
      color: rgba(255, 255, 255, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .voice-btn:hover { 
      background: rgba(255, 255, 255, 0.1); 
      color: white;
      border-color: rgba(255, 255, 255, 0.4);
      transform: scale(1.1);
    }
    .voice-btn.playing {
      background: rgba(99, 102, 241, 0.8);
      color: white;
      border-color: transparent;
      animation: pulse-ring 1.5s infinite alternate;
    }

    @keyframes slide-up {
      from { opacity: 0; transform: translateY(10px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes pulse-ring {
      from { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0.3); }
      to   { box-shadow: 0 0 0 6px rgba(79, 70, 229, 0); }
    }
    @media (max-width: 768px) {
      .bot-text { font-size: 18px; }
    }
  `]
})
export class VocalResponseComponent implements OnChanges {
  @Input() response: VocalResponse | null = null;
  
  displayedText = signal('');
  playing = signal(false);
  private intervalId: any;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['response'] && this.response) {
      this.animateText(this.response.text);
      this.playing.set(true);
      setTimeout(() => this.playing.set(false), 2500); // Simulate audio ending
    } else if (changes['response'] && !this.response) {
      this.displayedText.set('');
      this.playing.set(false);
      clearInterval(this.intervalId);
    }
  }

  togglePlay(): void {
    if (!this.response) return;
    this.playing.update(v => !v);
  }

  private animateText(fullText: string): void {
    this.displayedText.set('');
    clearInterval(this.intervalId);
    
    const words = fullText.split(' ');
    let currentIdx = 0;
    
    this.intervalId = setInterval(() => {
      if (currentIdx < words.length) {
        this.displayedText.update(t => t + (currentIdx === 0 ? '' : ' ') + words[currentIdx]);
        currentIdx++;
      } else {
        clearInterval(this.intervalId);
      }
    }, 100); // 100ms per word (simulate speaking rate)
  }
}
