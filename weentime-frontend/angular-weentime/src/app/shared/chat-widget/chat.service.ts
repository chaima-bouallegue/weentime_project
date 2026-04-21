import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, map, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService, User } from '../../core/services/auth.service';
import {
  AssistantActionResult,
  AssistantFormFill,
  AssistantIntent,
  AssistantResponseMeta,
  AssistantToolCall,
  AssistantWorkflowState,
  AssistantWorkflowStep,
} from '../../core/models/assistant.model';

export interface ChatHistoryMessage {
  user_id: number;
  sender: string;
  message: string;
  timestamp: string;
}

export interface ChatHistoryResponse {
  success: boolean;
  items: ChatHistoryMessage[];
}

export interface ChatApiResponse extends AssistantResponseMeta {
  success?: boolean;
  status?: 'success' | 'error' | 'ask' | 'confirm' | 'failed' | string;
  text?: string;
  message?: string;
  type?: string;
  action?: string | null;
  response?: string;
  transcription?: string;
  intent?: AssistantIntent | string;
  requires_confirmation?: boolean;
  pending_action?: string | null;
  data?: unknown;
  audio_url?: string | null;
  error?: string;
  stream_state?: string | null;
  entities?: Record<string, unknown>;
  missing_fields?: string[];
  tool_call?: AssistantToolCall | null;
  action_result?: AssistantActionResult | null;
  form_fill?: AssistantFormFill | null;
  workflow?: AssistantWorkflowState | null;
  steps?: AssistantWorkflowStep[];
}

export interface TtsResponse {
  success: boolean;
  audio_url: string;
  filename: string;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private static readonly NO_SPEECH_MESSAGE = "Je n'ai pas bien entendu, reessayez";
  private static readonly NO_INPUT_MESSAGE = "Je n'ai rien entendu. Pouvez-vous reessayer ?";
  private static readonly RETRY_MESSAGE = "Je n'ai pas bien compris. Pouvez-vous repeter ?";

  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly endpoint = environment.aiServiceUrl;

  sendMessage(message: string): Observable<ChatApiResponse> {
    const context = this.getUserContext();
    if (!context) {
      return throwError(() => new Error('Utilisateur non authentifie.'));
    }

    return this.http
      .post<ChatApiResponse>(`${this.endpoint}/chat`, {
        user_id: context.user.id,
        role: this.resolveRole(context.user),
        message,
        access_token: context.token,
        metadata: {
          channel: 'chat',
          preferences: {
            locale: navigator.language || 'fr-FR',
            role: this.resolveRole(context.user),
          },
        },
      })
      .pipe(catchError(error => this.rethrowApiError(error, "La demande RH n'a pas pu etre envoyee.")));
  }

  sendVoice(audio: Blob, generateTts: boolean = true): Observable<ChatApiResponse> {
    const context = this.getUserContext();
    if (!context) {
      return throwError(() => new Error('Utilisateur non authentifie.'));
    }

    const formData = new FormData();
    formData.append('audio_file', audio, 'voice.webm');
    formData.append('user_id', String(context.user.id));
    const role = this.resolveRole(context.user);
    if (role) {
      formData.append('role', role);
    }
    if (context.token) {
      formData.append('access_token', context.token);
    }
    formData.append('generate_tts', String(generateTts));

    return this.http
      .post<ChatApiResponse>(`${this.endpoint}/voice`, formData)
      .pipe(map(response => this.normalizeNoSpeechResponse(response)))
      .pipe(catchError(error => this.rethrowApiError(error, "Le message vocal n'a pas pu etre traite.")));
  }

  getHistory(): Observable<ChatHistoryResponse> {
    const context = this.getUserContext();
    if (!context) {
      return throwError(() => new Error('Utilisateur non authentifie.'));
    }

    return this.http
      .get<ChatHistoryResponse>(`${this.endpoint}/chat/history/${context.user.id}`)
      .pipe(catchError(error => this.rethrowApiError(error, "L'historique AI n'a pas pu etre charge.")));
  }

  textToSpeech(text: string): Observable<TtsResponse> {
    return this.http
      .post<TtsResponse>(`${this.endpoint}/tts`, { text })
      .pipe(catchError(error => this.rethrowApiError(error, "La lecture audio n'a pas pu etre generee.")));
  }

  extractAssistantMeta(response: ChatApiResponse | null | undefined): AssistantResponseMeta {
    if (!response) {
      return {};
    }

    const embedded = response.data && typeof response.data === 'object'
      ? response.data as Record<string, unknown>
      : {};

    return {
      intent: response.intent ?? this.readString(embedded['intent']),
      entities: response.entities ?? this.readObject(embedded['entities']) ?? undefined,
      missing_fields: response.missing_fields ?? this.readStringArray(embedded['missing_fields']),
      tool_call: response.tool_call ?? this.readObject(embedded['tool_call']) as AssistantToolCall | null,
      action_result: response.action_result ?? this.readObject(embedded['action_result']) as AssistantActionResult | null,
      form_fill: response.form_fill ?? this.readObject(embedded['form_fill']) as AssistantFormFill | null,
      workflow: response.workflow
        ?? (this.readObject(embedded['workflow']) as AssistantWorkflowState | null)
        ?? this.coerceWorkflowFromResponse(response),
    };
  }

  private getUserContext(): { user: User; token: string | null } | null {
    const user = this.authService.currentUser() ?? this.readStoredUser();
    if (!user?.id) {
      return null;
    }
    return {
      user,
      token: this.authService.getToken(),
    };
  }

  private resolveRole(user: User | null | undefined): string | null {
    if (!user) {
      return null;
    }

    const primaryRole = typeof user.role === 'string' && user.role.trim().length > 0
      ? user.role.trim()
      : Array.isArray(user.roles) && user.roles.length > 0
        ? String(user.roles[0]).trim()
        : '';

    return primaryRole.length > 0 ? primaryRole.replace(/^ROLE_/i, '') : null;
  }

  private readStoredUser(): User | null {
    const raw = localStorage.getItem('user') ?? sessionStorage.getItem('user');
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  }

  private rethrowApiError(error: unknown, fallbackMessage: string): Observable<never> {
    return throwError(() => this.toError(error, fallbackMessage));
  }

  private toError(error: unknown, fallbackMessage: string): Error {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 400) {
        return new Error('Donnees invalides');
      }
      if (error.status === 409) {
        return new Error('Action deja faite');
      }
      if (error.status >= 500) {
        return new Error('Erreur serveur');
      }

      const apiMessage = this.extractApiErrorMessage(error.error);
      if (apiMessage) {
        return new Error(apiMessage);
      }

      if (error.message?.trim()) {
        return new Error(error.message.trim());
      }
    }

    if (error instanceof Error && error.message.trim()) {
      return error;
    }

    return new Error(fallbackMessage);
  }

  private extractApiErrorMessage(payload: unknown): string | null {
    if (typeof payload === 'string' && payload.trim()) {
      return this.normalizeBusinessError(payload.trim());
    }

    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const body = payload as Record<string, unknown>;
    const statusText = typeof body['status'] === 'string' ? body['status'].trim().toLowerCase() : '';
    if (statusText === 'retry') {
      return ChatService.RETRY_MESSAGE;
    }
    if (statusText === 'no_speech' || statusText === 'no_input') {
      return ChatService.NO_INPUT_MESSAGE;
    }

    const messageText = typeof body['message'] === 'string' ? body['message'].trim() : '';
    if (messageText) {
      return this.normalizeBusinessError(messageText);
    }

    const responseText = typeof body['response'] === 'string' ? body['response'].trim() : '';
    if (responseText) {
      return this.normalizeBusinessError(responseText);
    }

    const errorText = typeof body['error'] === 'string' ? body['error'].trim() : '';
    if (errorText) {
      return this.normalizeAudioError(errorText) ?? this.normalizeBusinessError(errorText);
    }

    const details = body['details'];
    if (details && typeof details === 'object') {
      const detailMessage = typeof (details as Record<string, unknown>)['message'] === 'string'
        ? String((details as Record<string, unknown>)['message']).trim()
        : '';
      if (detailMessage) {
        return this.normalizeBusinessError(detailMessage);
      }
    }

    return null;
  }

  private normalizeNoSpeechResponse(response: ChatApiResponse): ChatApiResponse {
    const status = (response.status || '').toLowerCase();
    if (status !== 'no_speech' && status !== 'no_input' && status !== 'retry') {
      return response;
    }

    const message = status === 'retry'
      ? ChatService.RETRY_MESSAGE
      : status === 'no_input'
        ? ChatService.NO_INPUT_MESSAGE
        : ChatService.NO_SPEECH_MESSAGE;

    return {
      ...response,
      text: message,
      message,
      response: message,
      error: undefined,
    };
  }

  private normalizeAudioError(value: string): string | null {
    const lowered = value.trim().toLowerCase();
    if (
      lowered === 'empty_audio'
      || lowered === 'no_speech_detected'
      || lowered === 'no_input'
      || lowered.includes("je n'ai rien entendu")
      || lowered.includes("je n'ai pas entendu")
    ) {
      return ChatService.NO_INPUT_MESSAGE;
    }

    if (
      lowered === 'retry'
      || lowered.includes("je n'ai pas bien compris")
    ) {
      return ChatService.RETRY_MESSAGE;
    }

    return null;
  }

  private normalizeBusinessError(value: string): string {
    const lowered = value.trim().toLowerCase();
    if (lowered.includes('action deja traitee') || lowered.includes('action déjà traitée')) {
      return 'Cette demande a deja ete traitee.';
    }
    if (lowered.includes('deja en cours')) {
      return 'Une action identique est deja en cours.';
    }
    return value;
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  }

  private readObject(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? value as Record<string, unknown> : null;
  }

  private readStringArray(value: unknown): string[] | undefined {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : undefined;
  }

  private coerceWorkflowFromResponse(response: ChatApiResponse): AssistantWorkflowState | null {
    const rawSteps = Array.isArray(response.steps) ? response.steps : [];
    if (response.type !== 'workflow' && rawSteps.length === 0) {
      return null;
    }

    return {
      workflow_id: undefined,
      name: this.readString((response as Record<string, unknown>)['workflow_name']) ?? response.action ?? null,
      status: response.status ?? null,
      pending_step: undefined,
      completed_steps: rawSteps
        .filter(step => step && typeof step === 'object' && (step as AssistantWorkflowStep).status === 'success')
        .map(step => String((step as AssistantWorkflowStep).key)),
      can_retry: response.status === 'failed',
      steps: rawSteps,
    };
  }
}
