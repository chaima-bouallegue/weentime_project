// [WEENTIME-VOCAL] Mock Service for Speech Recognition (STT)
import { Injectable, signal } from '@angular/core';
import { SupportedLanguage } from '../models/vocal-intent.model';
import { Observable } from 'rxjs';

const MOCK_PHRASES: Record<SupportedLanguage, string[]> = {
  fr: [
    "Je voudrais prendre un congé du 15 au 20 juillet",
    "Quel est mon solde de congés restant ?",
    "Je pointe mon entrée",
    "Demande de télétravail pour demain",
    "Combien de personnes sont absentes aujourd'hui ?",
  ],
  en: [
    "I want to request leave from July 15th to 20th",
    "What's my remaining leave balance?",
    "Clock me in please",
    "I'd like to work from home tomorrow",
  ],
  ar: [
    "أريد أخذ إجازة من 15 إلى 20 يوليو",
    "ما هو رصيد إجازاتي المتبقي؟",
    "سجل حضوري",
  ],
  tn: [
    "Nbghi n5ou congé men 15 l 20 juillet",
    "Qaddeh bqayli min ayem congé ?",
    "Sajjel jiiti",
    "Nbghi na3mel télétravail ghédwa",
  ]
};

@Injectable({ providedIn: 'root' })
export class SpeechRecognitionMockService {

  private transcript = signal('');
  private isListening = signal(false);

  // Expose readonly signals
  public transcriptSignal = this.transcript.asReadonly();
  public isListeningSignal = this.isListening.asReadonly();

  // Simule une écoute progressive puis retourne un texte mock
  startListening(lang: SupportedLanguage, manualPhrase?: string): Observable<string> {
    this.isListening.set(true);
    this.transcript.set('');

    return new Observable(observer => {
      let phrase = manualPhrase;
      if (!phrase) {
        const phrases = MOCK_PHRASES[lang];
        phrase = phrases[Math.floor(Math.random() * phrases.length)];
      }

      // Simulation de frappe progressive (effet typewriter)
      let i = 0;
      const interval = setInterval(() => {
        i++;
        this.transcript.set(phrase!.slice(0, i));

        if (i >= phrase!.length) {
          clearInterval(interval);
          this.isListening.set(false);
          observer.next(phrase!);
          observer.complete();
        }
      }, 40); // 40ms par caractère

      return () => {
        clearInterval(interval);
        this.isListening.set(false);
      };
    });
  }

  stopListening(): void {
    // Dans un vrai usecase, on arrêterait le flux d'enregistrement audio.
    // Le cleanup de l'observable clear le setInterval.
    this.isListening.set(false);
  }
}
