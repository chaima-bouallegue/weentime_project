// [WEENTIME-VOCAL] Vocal Dashboard Component (Page)
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VocalOrbComponent } from '../../components/vocal-orb/vocal-orb.component';
import { VocalLanguageSelectorComponent } from '../../components/vocal-language-selector/vocal-language-selector.component';
import { VocalTranscriptComponent } from '../../components/vocal-transcript/vocal-transcript.component';
import { VocalResponseComponent } from '../../components/vocal-response/vocal-response.component';
import { VocalQuickActionsComponent } from '../../components/vocal-quick-actions/vocal-quick-actions.component';
import { VocalStateService } from '../../services/vocal-state.service';
import { SupportedLanguage } from '../../models/vocal-intent.model';
import { 
  LUCIDE_ICONS, LucideIconProvider, 
  ArrowRightCircle, Volume2, Mic, Bot, XCircle, Loader2, 
  Square, Play, Calendar, Users, Laptop, CalendarClock, 
  Activity, Zap, Clock, CalendarHeart, MessageSquare
} from 'lucide-angular';

@Component({
  selector: 'app-vocal-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    VocalOrbComponent,
    VocalLanguageSelectorComponent,
    VocalTranscriptComponent,
    VocalResponseComponent,
    VocalQuickActionsComponent
  ],
  providers: [
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({
        ArrowRightCircle, Volume2, Mic, Bot, XCircle, Loader2, 
        Square, Play, Calendar, Users, Laptop, CalendarClock, 
        Activity, Zap, Clock, CalendarHeart, MessageSquare
      })
    }
  ],
  template: `
    <div class="vocal-zen-page">
      
      <!-- Top header: Language Selector -->
      <div class="zen-header">
        <app-vocal-language-selector 
          [activeLang]="state.currentLang()"
          (langSelect)="onLangChange($event)">
        </app-vocal-language-selector>
      </div>

      <!-- Immersive Core -->
      <div class="zen-core">
        <div class="orb-layer">
          <app-vocal-orb 
            [state]="state.orbState()" 
            (orbClick)="onOrbClick()">
          </app-vocal-orb>
        </div>

        <div class="text-layer">
          <app-vocal-transcript [text]="state.transcript()"></app-vocal-transcript>
          
          <!-- Optional minimal intent pill badge -->
          @if(state.lastIntent() && state.orbState() === 'responding') {
            <div class="intent-pill fade-in">
              <span>Intention : {{ formatIntentType(state.lastIntent()!.type) }}</span>
            </div>
          }

          <div class="response-container">
            <app-vocal-response [response]="state.lastResponse()"></app-vocal-response>
          </div>
        </div>
      </div>

      <!-- Quick Actions pinned to the bottom -->
      <div class="zen-footer">
        <app-vocal-quick-actions (actionTriggered)="onQuickAction($event)"></app-vocal-quick-actions>
      </div>

    </div>
  `,
  styles: [`
    .vocal-zen-page {
      display: flex;
      flex-direction: column;
      height: 100vh; /* Takes full overlay height */
      box-sizing: border-box;
      padding: 0;
      position: relative;
    }
    
    .zen-header {
      padding: 24px;
      display: flex;
      justify-content: flex-end; /* Pin top right */
      z-index: 10;
    }

    .zen-core {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 40px;
      padding: 0 32px 100px 32px;
      max-width: 900px;
      margin: 0 auto;
      width: 100%;
    }

    .orb-layer {
      transform: scale(1.3);
      margin-bottom: 20px;
    }

    .text-layer {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;
      width: 100%;
    }

    .intent-pill {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: rgba(255, 255, 255, 0.8);
      font-size: 12px;
      font-weight: 600;
      padding: 4px 12px;
      border-radius: 100px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      backdrop-filter: blur(8px);
    }

    .response-container {
      width: 100%;
      margin-top: 16px;
    }

    .zen-footer {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 32px;
      display: flex;
      justify-content: center;
      background: linear-gradient(to top, rgba(15, 23, 42, 0.8) 0%, rgba(15, 23, 42, 0) 100%);
    }

    :host-context(.dark) .zen-footer {
      background: linear-gradient(to top, rgba(4, 9, 20, 0.8) 0%, rgba(4, 9, 20, 0) 100%);
    }

    .fade-in {
      animation: fade-in 0.4s ease-out forwards;
    }
    @keyframes fade-in {
      from { opacity: 0; transform: translateY(5px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    @media (max-width: 768px) {
      .orb-layer { transform: scale(1); }
      .zen-core { padding: 0 16px 80px 16px; }
      .zen-footer { padding: 16px; justify-content: flex-start; overflow-x: auto; }
    }
  `]
})
export class VocalDashboardComponent {
  state = inject(VocalStateService);

  onOrbClick(): void {
    if (this.state.canListen()) {
      this.state.startSession();
    }
  }

  onQuickAction(phrase: string): void {
    if (this.state.canListen()) {
      this.state.startSession(phrase);
    }
  }

  onLangChange(lang: SupportedLanguage): void {
    this.state.setLanguage(lang);
  }

  formatIntentType(type: string): string {
    return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }
}
