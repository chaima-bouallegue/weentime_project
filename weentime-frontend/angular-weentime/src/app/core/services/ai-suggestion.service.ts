import { Injectable } from '@angular/core';
import { Observable, of, delay } from 'rxjs';
import { DemandeTeletravailWorkflow } from '../../features/shared/models/workflow-teletravail.model';

export interface AiSuggestion {
  confidenceScore: number; // 0 to 100
  recommendation: 'APPROVE' | 'REJECT' | 'MANUAL_REVIEW';
  reasoning: string;
}

@Injectable({ providedIn: 'root' })
export class AiSuggestionService {
  /**
   * Mocks an AI service analyzing the request to provide a decision support.
   */
  public analyzeRequest(demande: DemandeTeletravailWorkflow): Observable<AiSuggestion> {
    const isPlausible = demande.nombreJours <= 3;
    // Simple heuristic for mock purposes
    const isFridayOrMonday = new Date(demande.dateDebut).getDay() === 1 || new Date(demande.dateDebut).getDay() === 5;
    
    let recommendation: 'APPROVE' | 'REJECT' | 'MANUAL_REVIEW' = 'MANUAL_REVIEW';
    let score = Math.floor(Math.random() * 30) + 50; // Random base 50-80
    let reasoning = 'Nécessite une analyse humaine contextuelle.';
    
    if (isPlausible && !isFridayOrMonday) {
      recommendation = 'APPROVE';
      score = Math.floor(Math.random() * 15) + 85; // 85-100
      reasoning = 'Dans les limites de la politique et impact minimal sur la présence.';
    } else if (!isPlausible) {
      recommendation = 'REJECT';
      score = Math.floor(Math.random() * 20) + 70; // 70-90
      reasoning = 'Dépasse la limite autorisée de jours consécutifs.';
    }
    
    return of({ confidenceScore: score, recommendation, reasoning }).pipe(delay(1200)); // Simulated network latency
  }
}
