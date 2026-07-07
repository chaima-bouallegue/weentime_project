import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, catchError, map, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { withAiChatWidgetContext } from '../../core/http/request-context.tokens';
import { AuthService, User } from '../../core/services/auth.service';
import { AiCopilotEnvelope, AiCopilotService, detectAiMessageLanguage, resolveAiServiceEndpoint } from '../../core/services/ai-copilot.service';
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
  transcript?: string;
  transcription?: string;
  intent?: AssistantIntent | string;
  requires_confirmation?: boolean;
  pending_action?: string | null;
  data?: unknown;
  audioUrl?: string | null;
  audio_url?: string | null;
  error?: string;
  stream_state?: string | null;
  entities?: Record<string, unknown>;
  missing_fields?: string[];
  tool_call?: AssistantToolCall | null;
  action_result?: AssistantActionResult | null;
  actionResult?: AssistantActionResult | null;
  form_fill?: AssistantFormFill | null;
  workflow?: AssistantWorkflowState | null;
  steps?: AssistantWorkflowStep[];
  requiresConfirmation?: boolean;
  confirmationId?: string | null;
  toolCalls?: AssistantToolCall[];
  warnings?: string[];
  fallback?: Record<string, unknown> | null;
  detectedLanguage?: string | null;
  audioStatus?: string | null;
  confidence?: number;
}

export interface TtsResponse {
  success: boolean;
  audio_url: string;
  filename: string;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private static readonly NO_INPUT_MESSAGE = "Je n'ai rien entendu. Pouvez-vous reessayer ?";
  private static readonly RETRY_MESSAGE = "Je n'ai pas bien compris. Pouvez-vous repeter ?";

  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly aiCopilot = inject(AiCopilotService);
  private readonly endpoint = environment.gatewayUrl + '/api/v1/ai';

  sendMessage(message: string): Observable<ChatApiResponse> {
    return this.aiCopilot.sendChatV2(message).pipe(
      map(response => this.fromV2Envelope(response)),
      catchError(error => {
        if (error instanceof HttpErrorResponse && error.status === 404) {
          return this.sendLegacyMessage(message);
        }
        return this.rethrowApiError(error, "La demande RH n'a pas pu etre envoyee.");
      }),
    );
  }

  confirmAction(confirmationId: string, approved: boolean, extraMetadata?: Record<string, unknown>): Observable<ChatApiResponse> {
    return this.aiCopilot.confirmAction(confirmationId, approved, extraMetadata).pipe(
      map(response => this.fromV2Envelope(response)),
      catchError(error => this.handleConfirmationError(error)),
    );
  }

  resetSession(sessionId?: string): Observable<unknown> {
    return this.aiCopilot.resetSession(sessionId);
  }

  private sendLegacyMessage(message: string): Observable<ChatApiResponse> {
    const context = this.getUserContext();
    if (!context) {
      return throwError(() => new Error('Utilisateur non authentifie.'));
    }
    const language = detectAiMessageLanguage(message, navigator.language || 'fr-FR');
    const requestId = this.createRequestId('legacy-chat');
    const role = this.resolveRole(context.user);

    return this.http
      .post<ChatApiResponse>(`${this.endpoint}/chat`, {
        user_id: context.user.id,
        role,
        message,
        metadata: {
          channel: 'chat',
          language,
          detectedLanguage: language,
          requested_language: language,
          response_language: language,
          preferences: {
            locale: navigator.language || 'fr-FR',
            language,
            role,
          },
        },
      }, {
        headers: this.aiHeaders(requestId, context.user),
        withCredentials: true,
        context: withAiChatWidgetContext(),
      })
      .pipe(catchError(error => this.rethrowApiError(error, "La demande RH n'a pas pu etre envoyee.")));
  }

  getHistory(): Observable<ChatHistoryResponse> {
    const context = this.getUserContext();
    if (!context) {
      return throwError(() => new Error('Utilisateur non authentifie.'));
    }
    const requestId = this.createRequestId('chat-history');

    return this.http
      .get<ChatHistoryResponse>(`${this.endpoint}/chat/history/${context.user.id}`, {
        headers: this.aiHeaders(requestId, context.user),
        withCredentials: true,
        context: withAiChatWidgetContext(),
      })
      .pipe(catchError(error => this.rethrowApiError(error, "L'historique AI n'a pas pu etre charge.")));
  }

  textToSpeech(text: string): Observable<TtsResponse> {
    const context = this.getUserContext();
    const requestId = this.createRequestId('chat-tts');
    const options = context?.user
      ? {
          headers: this.aiHeaders(requestId, context.user),
          withCredentials: true,
          context: withAiChatWidgetContext(),
        }
      : { context: withAiChatWidgetContext() };
    return this.http
      .post<TtsResponse>(`${this.endpoint}/tts`, { text }, options)
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
      action_result: response.action_result
        ?? response.actionResult
        ?? this.readObject(embedded['action_result']) as AssistantActionResult | null,
      form_fill: response.form_fill ?? this.readObject(embedded['form_fill']) as AssistantFormFill | null,
      workflow: response.workflow
        ?? (this.readObject(embedded['workflow']) as AssistantWorkflowState | null)
        ?? this.coerceWorkflowFromResponse(response),
    };
  }

  private fromV2Envelope(envelope: AiCopilotEnvelope): ChatApiResponse {
    if (!envelope.success || !envelope.data) {
      const data = envelope.data && typeof envelope.data === 'object'
        ? envelope.data as unknown as Record<string, unknown>
        : {};
      const message = this.readString(data['text'])
        ?? this.readString(data['response'])
        ?? this.readString(data['message'])
        ?? envelope.error?.message
        ?? 'Le copilote AI est temporairement indisponible.';
      return {
        success: false,
        status: 'error',
        type: this.readString(data['type']) ?? 'error',
        text: message,
        message,
        response: message,
        intent: this.readString(data['intent']),
        data: envelope.data,
        warnings: envelope.warnings ?? [],
        fallback: this.readObject(data['fallback']),
        detectedLanguage: this.readString(data['detectedLanguage']) ?? this.readString(data['detected_language']),
        audioStatus: this.readString(data['audioStatus']) ?? this.readString(data['audio_status']),
        confidence: typeof data['confidence'] === 'number' ? data['confidence'] : undefined,
        actionResult: this.readObject(data['actionResult']) as AssistantActionResult | null,
        action_result: this.readObject(data['actionResult']) as AssistantActionResult | null,
        error: message,
      };
    }

    const data = envelope.data;
    const text = data.text || '';
    const status = data.type === 'confirm_action'
      ? 'confirm'
      : data.type === 'error'
        ? 'error'
        : 'success';
    const toolCall = Array.isArray(data.toolCalls) && data.toolCalls.length > 0
      ? data.toolCalls[0] as AssistantToolCall
      : null;

    return {
      success: data.type !== 'error',
      status,
      type: data.type,
      text,
      message: text,
      response: text,
      intent: data.intent,
      data,
      warnings: envelope.warnings ?? [],
      fallback: this.readObject(data.fallback) as Record<string, unknown> | null,
      detectedLanguage: this.readString(data.detectedLanguage),
      audioStatus: this.readString(data.audioStatus),
      confidence: typeof data.confidence === 'number' ? data.confidence : undefined,
      requiresConfirmation: data.requiresConfirmation,
      requires_confirmation: data.requiresConfirmation,
      confirmationId: data.confirmationId,
      toolCalls: data.toolCalls as AssistantToolCall[] | undefined,
      tool_call: toolCall,
      actionResult: data.actionResult as AssistantActionResult | null | undefined,
      action_result: data.actionResult as AssistantActionResult | null | undefined,
      audioUrl: typeof data.audioUrl === 'string' ? data.audioUrl : undefined,
      error: data.type === 'error' ? text : undefined,
    };
  }

  private getUserContext(): { user: User } | null {
    const user = this.authService.currentUser() ?? this.readStoredUser();
    if (!user?.id) {
      return null;
    }
    return { user };
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

  private handleConfirmationError(error: unknown): Observable<ChatApiResponse> {
    if (error instanceof HttpErrorResponse && error.status === 409) {
      const payload = error.error as Record<string, unknown> | null;
      const code = payload && typeof payload === 'object' && payload['error'] && typeof payload['error'] === 'object'
        ? String((payload['error'] as Record<string, unknown>)['code'] || '')
        : '';
      if (code === 'confirmation_already_used') {
        const message = 'Cette action a deja ete traitee.';
        return of({
          success: true,
          status: 'success',
          type: 'answer',
          text: message,
          message,
          response: message,
          intent: 'confirmation.already_used',
        });
      }
    }
    if (error instanceof HttpErrorResponse && error.status === 404) {
      const message = this.extractApiErrorMessage(error.error) ?? "Cette confirmation est introuvable ou expiree.";
      return of({
        success: false,
        status: 'error',
        type: 'error',
        text: message,
        message,
        response: message,
        intent: 'confirmation.not_found',
        error: message,
      });
    }
    return this.rethrowApiError(error, "La confirmation n'a pas pu etre traitee.");
  }

  private toError(error: unknown, fallbackMessage: string): Error {
    if (error instanceof HttpErrorResponse) {
      const apiMessage = this.extractApiErrorMessage(error.error);

      if (error.status === 0) {
        return new Error('Service IA indisponible.');
      }
      if (error.status === 401) {
        return new Error('Session expirée, reconnectez-vous.');
      }
      if (error.status === 403) {
        return new Error("Vous n'avez pas la permission d'utiliser cette action AI.");
      }
      if (error.status === 400) {
        return new Error(apiMessage ?? 'Donnees invalides');
      }
      if (error.status === 409) {
        return new Error(apiMessage ?? 'Action deja faite');
      }
      if (error.status === 429) {
        return new Error('Trop de requetes AI en cours. Reessayez dans quelques instants.');
      }
      if (error.status === 404) {
        return new Error("La route IA est introuvable sur le service AI.");
      }
      if (error.status >= 500) {
        return new Error(apiMessage ?? 'Service IA indisponible.');
      }

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
    const data = this.readObject(body['data']);
    const statusText = typeof body['status'] === 'string' ? body['status'].trim().toLowerCase() : '';
    const bodyError = this.readObject(body['error']);
    const dataError = this.readObject(data?.['error']);
    const codeMessage = this.apiErrorCodeMessage(
      body['code'],
      body['error_code'],
      body['kind'],
      data?.['code'],
      data?.['error_code'],
      data?.['kind'],
      bodyError?.['code'],
      bodyError?.['error_code'],
      dataError?.['code'],
      dataError?.['error_code'],
    );
    if (codeMessage) {
      return codeMessage;
    }
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

    const dataMessageText = typeof data?.['text'] === 'string' ? data['text'].trim() : '';
    if (dataMessageText) {
      return this.normalizeBusinessError(dataMessageText);
    }

    const responseText = typeof body['response'] === 'string' ? body['response'].trim() : '';
    if (responseText) {
      return this.normalizeBusinessError(responseText);
    }

    const dataResponseText = typeof data?.['message'] === 'string' ? data['message'].trim() : '';
    if (dataResponseText) {
      return this.normalizeBusinessError(dataResponseText);
    }

    const errorText = typeof body['error'] === 'string' ? body['error'].trim() : '';
    if (errorText) {
      return this.normalizeAudioError(errorText) ?? this.normalizeBusinessError(errorText);
    }

    const nestedError = body['error'];
    if (nestedError && typeof nestedError === 'object') {
      const nestedMessage = typeof (nestedError as Record<string, unknown>)['message'] === 'string'
        ? String((nestedError as Record<string, unknown>)['message']).trim()
        : '';
      if (nestedMessage) {
        return this.normalizeBusinessError(nestedMessage);
      }

      const nestedCode = typeof (nestedError as Record<string, unknown>)['code'] === 'string'
        ? String((nestedError as Record<string, unknown>)['code']).trim().toLowerCase()
        : '';
      const nestedCodeMessage = this.apiErrorCodeMessage(nestedCode);
      if (nestedCodeMessage) {
        return nestedCodeMessage;
      }
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

  private apiErrorCodeMessage(...values: unknown[]): string | null {
    for (const value of values) {
      const code = typeof value === 'string' ? value.trim().toLowerCase() : '';
      if (!code) {
        continue;
      }
      if (code === 'auth_required' || code === 'missing_jwt' || code === 'invalid_jwt' || code === 'expired_jwt') {
        return 'Session expirée, reconnectez-vous.';
      }
      if (code === 'access_denied' || code === 'permission_denied' || code === 'forbidden') {
        return "Vous n'avez pas la permission d'utiliser cette action AI.";
      }
      if (code === 'backend_unavailable' || code === 'gateway_unavailable') {
        return 'Backend métier indisponible.';
      }
      if (code === 'provider_unavailable' || code === 'ollama_unavailable') {
        return 'Le provider AI est temporairement indisponible.';
      }
    }
    return null;
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
    if (lowered.includes('action deja traitee') || lowered.includes('action dÃ©jÃ  traitÃ©e')) {
      return 'Cette demande a deja ete traitee.';
    }
    if (lowered.includes('deja en cours')) {
      return 'Une action identique est deja en cours.';
    }
    return value;
  }

  private aiHeaders(requestId: string, user: User): HttpHeaders {
    const headers: Record<string, string> = {
      'X-Request-ID': requestId,
    };
    const role = this.resolveRole(user);
    if (role) {
      headers['X-User-Role'] = role.toUpperCase();
    }
    const entrepriseId = user.entrepriseId ?? user.entreprise?.id;
    if (typeof entrepriseId === 'number' && entrepriseId > 0) {
      const value = String(entrepriseId);
      headers['X-Entreprise-Id'] = value;
      headers['X-Company-Id'] = value;
      headers['X-Tenant-Id'] = value;
    }
    return new HttpHeaders(headers);
  }

  private createRequestId(prefix: string): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
