// [WEENTIME-VOCAL] Mock Service for NLU Engine
import { Injectable } from '@angular/core';
import { VocalIntent, SupportedLanguage, VocalEntity, VocalIntentType } from '../models/vocal-intent.model';
import { Observable } from 'rxjs';

interface IntentPattern {
  pattern: RegExp;
  intent: VocalIntentType;
  confidence: () => number;
}

const INTENT_PATTERNS: Record<SupportedLanguage, IntentPattern[]> = {
  fr: [
    { pattern: /congé|vacances|absence/i,          intent: 'DEMANDE_CONGE',      confidence: () => 0.85 + Math.random() * 0.12 },
    { pattern: /solde|combien.*jours|reste/i,       intent: 'SOLDE_CONGE',        confidence: () => 0.90 + Math.random() * 0.08 },
    { pattern: /pointer|arrivée|entrée/i,           intent: 'POINTAGE_ENTREE',    confidence: () => 0.92 + Math.random() * 0.07 },
    { pattern: /partir|sortie|fin.*journée/i,       intent: 'POINTAGE_SORTIE',    confidence: () => 0.91 + Math.random() * 0.08 },
    { pattern: /télétravail|remote|maison/i,        intent: 'DEMANDE_TELETRAVAIL',confidence: () => 0.88 + Math.random() * 0.10 },
    { pattern: /valider|approuver|accepter/i,       intent: 'VALIDATION_CONGE',   confidence: () => 0.87 + Math.random() * 0.11 },
    { pattern: /absent.*équipe|qui.*absent/i,       intent: 'ABSENCES_EQUIPE',    confidence: () => 0.83 + Math.random() * 0.14 },
    { pattern: /planning|semaine|agenda/i,          intent: 'PLANNING_SEMAINE',   confidence: () => 0.86 + Math.random() * 0.12 },
  ],
  en: [
    { pattern: /leave|vacation|time off|holiday/i, intent: 'DEMANDE_CONGE',      confidence: () => 0.88 + Math.random() * 0.10 },
    { pattern: /balance|how many days|remaining/i, intent: 'SOLDE_CONGE',        confidence: () => 0.91 + Math.random() * 0.08 },
    { pattern: /clock in|check in|arrival/i,       intent: 'POINTAGE_ENTREE',    confidence: () => 0.93 + Math.random() * 0.06 },
    { pattern: /clock out|check out|leaving/i,     intent: 'POINTAGE_SORTIE',    confidence: () => 0.92 + Math.random() * 0.07 },
    { pattern: /remote|work from home|wfh/i,       intent: 'DEMANDE_TELETRAVAIL',confidence: () => 0.89 + Math.random() * 0.09 },
  ],
  ar: [
    { pattern: /إجازة|عطلة|غياب/,                  intent: 'DEMANDE_CONGE',      confidence: () => 0.84 + Math.random() * 0.13 },
    { pattern: /رصيد|كم يوم|متبقي/,                intent: 'SOLDE_CONGE',        confidence: () => 0.88 + Math.random() * 0.10 },
  ],
  tn: [
    { pattern: /congé|congi|vacances|bech nemchi/i, intent: 'DEMANDE_CONGE',     confidence: () => 0.82 + Math.random() * 0.15 },
    { pattern: /pointage|jayi|wselت/i,              intent: 'POINTAGE_ENTREE',   confidence: () => 0.80 + Math.random() * 0.16 },
    { pattern: /bech nemchi|mchiت|mshi/i,           intent: 'POINTAGE_SORTIE',   confidence: () => 0.79 + Math.random() * 0.17 },
  ]
};

@Injectable({ providedIn: 'root' })
export class NluEngineMockService {

  // Analyse le texte et retourne l'intention après 800ms (simulation latence)
  analyzeIntent(text: string, lang: SupportedLanguage): Observable<VocalIntent> {
    return new Observable(observer => {
      setTimeout(() => {
        const patterns = INTENT_PATTERNS[lang] ?? INTENT_PATTERNS['fr'];
        const matched = patterns.find(p => p.pattern.test(text));

        const intent: VocalIntent = matched
          ? {
              type: matched.intent,
              confidence: matched.confidence(),
              entities: this.extractEntities(text),
              langue: lang,
              rawText: text,
              timestamp: new Date()
            }
          : {
              type: 'AIDE_GENERALE',
              confidence: 0.60,
              entities: [],
              langue: lang,
              rawText: text,
              timestamp: new Date()
            };

        observer.next(intent);
        observer.complete();
      }, 800);
    });
  }

  private extractEntities(text: string): VocalEntity[] {
    const entities: VocalEntity[] = [];

    // Détection de dates simples
    const dateMatch = text.match(/(\d{1,2})\s*(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|january|february|march|april|may|june|july|august)/i);
    if (dateMatch) {
      entities.push({ type: 'DATE', value: dateMatch[0], normalized: dateMatch[0] });
    }

    // Détection de durée
    const dureeMatch = text.match(/(\d+)\s*(jour|jours|day|days|semaine|week)/i);
    if (dureeMatch) {
      entities.push({ type: 'DUREE', value: dureeMatch[0], normalized: `${dureeMatch[1]} ${dureeMatch[2]}` });
    }

    return entities;
  }
}
