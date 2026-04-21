// [WEENTIME-VOCAL] Vocal State Service (Signals orchestration)
import { Injectable, signal, computed, inject } from '@angular/core';
import { SupportedLanguage, VocalIntent } from '../models/vocal-intent.model';
import { VocalResponse } from '../models/vocal-response.model';
import { OrbState, VocalSession } from '../models/vocal-session.model';
import { SpeechRecognitionMockService } from './speech-recognition.mock';
import { NluEngineMockService } from './nlu-engine.mock';
import { TtsMockService } from './tts.mock';
import { finalize } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class VocalStateService {

  private sttService = inject(SpeechRecognitionMockService);
  private nluService = inject(NluEngineMockService);
  private ttsService = inject(TtsMockService);

  // Primary Signals
  orbState = signal<OrbState>('idle');
  currentLang = signal<SupportedLanguage>('fr');
  
  // Connect to STT transcript signal
  transcript = this.sttService.transcriptSignal;
  
  lastIntent = signal<VocalIntent | null>(null);
  lastResponse = signal<VocalResponse | null>(null);
  isProcessing = signal<boolean>(false);
  history = signal<VocalSession[]>([]);

  // Computed Properties
  canListen = computed(() => this.orbState() === 'idle' || this.orbState() === 'error');
  hasResult = computed(() => this.lastIntent() !== null);
  historyCount = computed(() => this.history().length);

  // Business Logic
  
  /**
   * Starts a complete vocal session (Mock).
   * @param manualPhrase If provided, skips to NLU with this text immediately. Else runs the STT mock.
   */
  startSession(manualPhrase?: string): void {
    if (!this.canListen()) return;

    this.orbState.set('listening');
    this.lastIntent.set(null);
    this.lastResponse.set(null);
    
    const startTime = Date.now();

    this.sttService.startListening(this.currentLang(), manualPhrase).subscribe({
      next: (fullText) => {
        // Transition to Processing state
        this.setProcessing();
        
        // Feed into NLU Engine
        this.nluService.analyzeIntent(fullText, this.currentLang()).subscribe({
          next: (intent) => {
            this.lastIntent.set(intent);
            
            // Feed to TTS Engine
            this.ttsService.generateResponse(intent.type, this.currentLang()).subscribe({
              next: (response) => {
                this.lastResponse.set(response);
                this.setResponding();
                
                // End cycle, push to history and reset to idle after 2.5s (simulate speaking)
                setTimeout(() => {
                  this.addToHistory({
                    id: Math.random().toString(36).substring(2, 9),
                    timestamp: new Date(),
                    langue: this.currentLang(),
                    intent: intent,
                    response: response,
                    durationMs: Date.now() - startTime
                  });
                  this.reset();
                }, 2500);
              },
              error: () => this.setError()
            });
          },
          error: () => this.setError()
        });
      },
      error: () => this.setError()
    });
  }

  setProcessing(): void { 
    this.orbState.set('processing'); 
  }
  
  setResponding(): void { 
    this.orbState.set('responding'); 
  }
  
  setError(): void {
    this.orbState.set('error');
    setTimeout(() => this.reset(), 3000); // 3 seconds before fallback to idle
  }

  reset(): void {
    this.orbState.set('idle');
  }

  addToHistory(session: VocalSession): void {
    this.history.update(h => [session, ...h].slice(0, 20));
  }

  setLanguage(lang: SupportedLanguage): void {
    this.currentLang.set(lang);
  }
}
