import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

export interface AIGenerationRequest {
  system_prompt: string;
  user_prompt: string;
  temperature?: number;
  max_tokens?: number;
  language?: string;
  provider?: string;
}

export interface AIGenerationResponse {
  content: string;
  model_used: string;
  tokens_used: number;
  provider: string;
}

@Injectable({
  providedIn: 'root'
})
export class AIService {
  private http = inject(HttpClient);
  private aiBaseUrl = 'http://localhost:8000/v1/ai';

  generateDocument(request: AIGenerationRequest): Observable<AIGenerationResponse> {
    return this.http.post<AIGenerationResponse>(`${this.aiBaseUrl}/generate-document`, {
      system_prompt: request.system_prompt,
      user_prompt: request.user_prompt,
      temperature: request.temperature ?? 0.3,
      max_tokens: request.max_tokens ?? 2000,
      language: request.language ?? 'fr',
      provider: request.provider ?? 'gemini',
    });
  }

  /**
   * Generate a structured meeting report from meeting context.
   */
  generateMeetingReport(meeting: {
    titre: string;
    description?: string;
    agenda?: string;
    participants: string[];
    date: string;
    heure: string;
  }): Observable<{ points: string; decisions: string; actions: string }> {
    const systemPrompt = `Tu es un assistant RH professionnel spécialisé dans la rédaction de comptes-rendus de réunion.
Tu rédiges en français dans un style professionnel, clair et concis.
Tu dois retourner EXACTEMENT ce format JSON (sans markdown, sans backticks) :
{
  "points": "Les points discutés, un par ligne",
  "decisions": "Les décisions prises, une par ligne",
  "actions": "Les actions à suivre avec responsable, une par ligne"
}`;

    const userPrompt = `Génère un compte-rendu structuré pour cette réunion :

Titre : ${meeting.titre}
Date : ${meeting.date} à ${meeting.heure}
${meeting.description ? `Description : ${meeting.description}` : ''}
${meeting.agenda ? `Ordre du jour :\n${meeting.agenda}` : ''}
Participants : ${meeting.participants.join(', ')}

Génère un compte-rendu réaliste et professionnel basé sur le contexte de la réunion. Retourne uniquement le JSON.`;

    return this.generateDocument({
      system_prompt: systemPrompt,
      user_prompt: userPrompt,
      temperature: 0.4,
      max_tokens: 1500,
    }).pipe(
      map(response => {
        try {
          // Try to parse JSON from the response
          const cleaned = response.content
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();
          return JSON.parse(cleaned);
        } catch {
          // Fallback: split content into sections
          return {
            points: response.content,
            decisions: '',
            actions: ''
          };
        }
      })
    );
  }
}
