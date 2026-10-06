import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AIGenerationRequest {
  system_prompt: string;
  user_prompt: string;
  temperature?: number;
  max_tokens?: number;
  language?: string;
  provider?: string;
  output_format?: 'html' | 'text';
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
  private aiBaseUrl = `${environment.aiServiceUrl || environment.aiUrl || 'http://localhost:8000'}/v1/ai`;

  generateDocument(request: AIGenerationRequest): Observable<AIGenerationResponse> {
    return this.http.post<AIGenerationResponse>(`${this.aiBaseUrl}/generate-document`, {
      system_prompt: request.system_prompt,
      user_prompt: request.user_prompt,
      temperature: request.temperature ?? 0.3,
      max_tokens: request.max_tokens ?? 2000,
      language: request.language ?? 'fr',
      provider: request.provider ?? 'gemini',
      output_format: request.output_format ?? 'text',
    });
  }

  /**
   * Helper to clean up any HTML tags, entities, and markdown fences into clean plain text.
   */
  private formatAsPlainText(content: string): string {
    if (!content) return '';
    let text = content.trim();

    // Remove markdown code fences if any
    text = text.replace(/^```[a-z]*\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

    // If it contains HTML tags, convert and strip them
    if (/<[a-z][\s\S]*>/i.test(text)) {
      text = text.replace(/<br\s*[\/]?>/gi, '\n');
      text = text.replace(/<\/(p|div|h[1-6]|tr)>/gi, '\n\n');
      text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_match, p1) => {
        const inner = p1.replace(/<[^>]+>/g, '').trim();
        return /^\d+[\.\)]/.test(inner) ? `${inner}\n` : `• ${inner}\n`;
      });
      text = text.replace(/<[^>]+>/g, '');

      if (typeof DOMParser !== 'undefined') {
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(text, 'text/html');
          text = doc.body.textContent || text;
        } catch {
          // Fallback manual entity decoding
          text = this.decodeHtmlEntities(text);
        }
      } else {
        text = this.decodeHtmlEntities(text);
      }
    }

    // Strip bold/italic markdown symbols
    text = text.replace(/\*\*(.*?)\*\*/g, '$1');
    text = text.replace(/\*(.*?)\*/g, '$1');

    // Normalize spacing and newlines
    const lines = text.split('\n').map(line => line.trim());
    return lines
      .filter((line, idx) => line.length > 0 || (idx > 0 && lines[idx - 1].length > 0))
      .join('\n')
      .trim();
  }

  private decodeHtmlEntities(str: string): string {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');
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
Tu dois retourner EXACTEMENT ce format JSON (sans markdown, sans backticks, sans balises HTML) :
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
      output_format: 'text',
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
          // Fallback: format content into sections
          return {
            points: this.formatAsPlainText(response.content),
            decisions: '',
            actions: ''
          };
        }
      })
    );
  }

  /**
   * Generate a structured meeting agenda from title and optional description.
   */
  generateAgenda(titre: string, description?: string): Observable<string> {
    const systemPrompt = `Tu es un assistant d'organisation RH et de productivité.
Tu rédiges des ordres du jour de réunion clairs, structurés et professionnels sous forme de liste numérotée en texte brut en français.
Chaque point de l'ordre du jour doit être concis et inclure une durée suggérée (ex : "1. Tour de table - Avancement (10 min)").
Retourne UNIQUEMENT la liste numérotée en texte brut, sans introduction, sans conclusion, sans balises HTML (pas de <h1>, <p>, <ul>, <li>) et sans markdown superflu.`;

    const userPrompt = `Génère un ordre du jour en texte brut pour la réunion suivante :
Titre : ${titre}
${description ? `Description / Objectif : ${description}` : ''}
Propose entre 3 et 5 points pertinents adaptés à ce sujet.`;

    return this.generateDocument({
      system_prompt: systemPrompt,
      user_prompt: userPrompt,
      temperature: 0.5,
      max_tokens: 800,
      output_format: 'text',
    }).pipe(
      map(response => this.formatAsPlainText(response.content))
    );
  }
}

