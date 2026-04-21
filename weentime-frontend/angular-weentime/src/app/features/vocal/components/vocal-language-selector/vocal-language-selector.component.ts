// [WEENTIME-VOCAL] Language Selector Component
import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupportedLanguage } from '../../models/vocal-intent.model';

@Component({
  selector: 'app-vocal-language-selector',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="lang-selector">
      @for(lang of languages; track lang.code) {
        <button 
          class="lang-btn" 
          [class.active]="activeLang === lang.code"
          (click)="langSelect.emit(lang.code)"
          [title]="lang.name">
          {{ lang.flag }} {{ lang.code | uppercase }}
        </button>
      }
    </div>
  `,
  styles: [`
    .lang-selector {
      display: flex;
      gap: 8px;
      justify-content: center;
      margin-top: 16px;
    }
    .lang-btn {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 6px 12px;
      font-size: 13px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.6);
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      display: flex;
      align-items: center;
      gap: 6px;
      backdrop-filter: blur(4px);
    }
    .lang-btn:hover { 
      background: rgba(255, 255, 255, 0.15); 
      color: white; 
      border-color: rgba(255, 255, 255, 0.3);
    }
    .lang-btn.active {
      background: rgba(99, 102, 241, 0.9);
      border-color: rgba(99, 102, 241, 1);
      color: white;
      box-shadow: 0 4px 16px rgba(79, 70, 229, 0.4);
    }
  `]
})
export class VocalLanguageSelectorComponent {
  @Input({required: true}) activeLang!: SupportedLanguage;
  @Output() langSelect = new EventEmitter<SupportedLanguage>();

  languages: { code: SupportedLanguage, name: string, flag: string }[] = [
    { code: 'fr', name: 'Français', flag: '🇫🇷' },
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'ar', name: 'العربية', flag: '🇸🇦' },
    { code: 'tn', name: 'DARIJA', flag: '🇹🇳' } // Tunisian flag emoji/Tunisian arabic indicator
  ];
}
