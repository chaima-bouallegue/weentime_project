import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, Subject, firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService, User } from '../../core/services/auth.service';
import { ChatApiResponse } from './chat.service';

export type VoiceAssistantState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'responding'
  | 'error';

export interface AudioStreamResponse extends ChatApiResponse {
  session_id?: string;
  final?: boolean;
  partial?: string;
  text?: string;
  status?: string;
  audio_duration?: number;
  detected_volume?: number;
  total_bytes?: number;
}

export type VoiceAssistantEvent =
  | { type: 'state'; state: VoiceAssistantState }
  | { type: 'partial'; text: string }
  | { type: 'final'; response: AudioStreamResponse }
  | { type: 'error'; message: string };

@Injectable({ providedIn: 'root' })
export class VoiceAssistantService {
  private static readonly SOFT_NO_INPUT_MESSAGE = "Je n'ai rien entendu.";
  private static readonly SOFT_RETRY_MESSAGE = "Je n'ai pas bien compris. Pouvez-vous repeter plus clairement ?";
  private static readonly INVALID_AUDIO_MESSAGE = 'Audio invalide. Reessayez avec un nouvel enregistrement.';
  private static readonly MICROPHONE_BLOCKED_MESSAGE = 'Microphone indisponible ou bloque.';
  private static readonly AUDIO_ERROR_MESSAGE = 'Erreur audio, veuillez reessayer.';
  private static readonly SERVER_ERROR_MESSAGE = 'Erreur serveur temporaire.';
  private static readonly ASSISTANT_UNAVAILABLE_MESSAGE = 'Assistant temporairement indisponible';
  private static readonly SOFT_UNCLEAR_MESSAGE =
    "Je n'ai pas bien compris. Pouvez-vous repeter plus clairement ?";
  private static readonly INITIAL_SILENCE_MS = 1500;
  private static readonly SILENCE_TIMEOUT_MS = 2000;
  private static readonly RECORDER_TIMESLICE_MS = 500;

  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly endpoint = environment.aiServiceUrl;
  private readonly eventsSubject = new Subject<VoiceAssistantEvent>();

  readonly events$: Observable<VoiceAssistantEvent> = this.eventsSubject.asObservable();

  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private recorderMimeType = 'audio/webm';
  private finalized = false;
  private lastPartial = '';
  private context: { user: User; token: string | null } | null = null;
  private silenceTimer: number | null = null;
  private hasHeardVoice = false;
  private recordingStartedAt = 0;
  private lastVoiceAt = 0;
  private currentVolume = 0;
  private maxDetectedVolume = 0;
  private recordedChunks: Blob[] = [];
  private recordingSessionId: string | null = null;
  private finalUploadSent = false;
  private finalizationPromise: Promise<void> | null = null;

  async start(): Promise<void> {
    if (this.recorder?.state === 'recording') {
      return;
    }

    const context = this.getUserContext();
    if (!context) {
      this.emitError('Utilisateur non authentifie.');
      return;
    }

    this.context = context;
    this.resetCaptureState();

    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('media_recorder_unavailable');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!this.isStreamActive(stream)) {
        throw new Error('stream_inactive');
      }

      this.stream = stream;
      this.bindStreamLifecycle(stream);

      const mimeType = this.resolveMimeType();
      if (!mimeType) {
        throw new Error('unsupported_mime_type');
      }
      this.recorderMimeType = mimeType;
      this.recorder = new MediaRecorder(stream, { mimeType });
      console.info('voice_recorder_started', { mimeType: this.recorderMimeType });

      this.recorder.ondataavailable = event => {
        if (!event.data || event.data.size <= 0 || this.finalized) {
          return;
        }

        this.pushChunk(event.data);
      };

      this.recorder.onerror = () => {
        this.emitError(VoiceAssistantService.MICROPHONE_BLOCKED_MESSAGE);
        void this.stop();
      };

      this.recorder.onstop = () => {
        const finalizePromise = this.finalizeStream();
        this.cleanupMedia();
        void finalizePromise;
      };

      this.emitState('listening');
      this.recorder.start(VoiceAssistantService.RECORDER_TIMESLICE_MS);
    } catch (error) {
      this.cleanupMedia();
      this.emitError(this.resolveMicrophoneError(error));
    }
  }

  async stop(): Promise<void> {
    if (!this.recorder || this.recorder.state === 'inactive') {
      if (!this.finalized) {
        await this.finalizeStream();
      }
      return;
    }
    this.recorder.stop();
  }

  isRecording(): boolean {
    return this.recorder?.state === 'recording';
  }

  private resetCaptureState(): void {
    this.finalized = false;
    this.lastPartial = '';
    this.recordedChunks = [];
    this.recordingSessionId = this.generateSessionId();
    this.finalUploadSent = false;
    this.finalizationPromise = null;
    this.hasHeardVoice = false;
    this.recordingStartedAt = Date.now();
    this.lastVoiceAt = this.recordingStartedAt;
    this.currentVolume = 0;
    this.maxDetectedVolume = 0;
    this.clearSilenceTimer();
  }

  private pushChunk(blob: Blob): void {
    if (blob.size <= 0) {
      return;
    }
    this.recordedChunks.push(blob);
    this.hasHeardVoice = true;
    this.lastVoiceAt = Date.now();
    this.currentVolume = Math.min(100, blob.size / 100);
    this.maxDetectedVolume = Math.max(this.maxDetectedVolume, this.currentVolume);
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer !== null) {
      window.clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  private bindStreamLifecycle(stream: MediaStream): void {
    stream.getAudioTracks().forEach(track => {
      track.onended = () => {
        if (this.finalized) {
          return;
        }
        this.emitError(VoiceAssistantService.MICROPHONE_BLOCKED_MESSAGE);
        void this.stop();
      };
    });
  }

  private async finalizeStream(): Promise<void> {
    if (!this.context || this.finalized || this.finalUploadSent) {
      return;
    }
    if (this.finalizationPromise) {
      await this.finalizationPromise;
      return;
    }
    this.finalizationPromise = this.doFinalizeStream();
    try {
      await this.finalizationPromise;
    } finally {
      this.finalizationPromise = null;
    }
  }

  private async doFinalizeStream(): Promise<void> {
    this.clearSilenceTimer();

    if (!this.hasHeardVoice || this.recordedChunks.length === 0) {
      this.emitNoSpeech();
      return;
    }

    this.emitState('processing');
    this.finalUploadSent = true;

    try {
      const response = await this.uploadAssembled(
        this.recordedChunks,
        this.recorderMimeType
      );

      if (!response) {
        this.emitError(VoiceAssistantService.AUDIO_ERROR_MESSAGE);
        return;
      }

      this.finish(response);
    } catch (error) {
      this.emitError(
        this.resolveErrorMessage(
          error,
          VoiceAssistantService.AUDIO_ERROR_MESSAGE
        )
      );
    }
  }

  private async uploadAssembled(
    chunks: Blob[],
    mimeType: string
  ): Promise<AudioStreamResponse | null> {
    const context = this.context ?? this.getUserContext();
    if (!context || chunks.length === 0) {
      return null;
    }
    this.context = context;

    const blob = new Blob(chunks, {
      type: mimeType
    });

    const formData = new FormData();
    const sessionId = this.recordingSessionId ?? this.generateSessionId();
    this.recordingSessionId = sessionId;
    const extension = this.resolveFileExtension(mimeType);

    formData.append(
      'is_final',
      'true'
    );
    formData.append('session_id', sessionId);
    formData.append('chunk_index', '1');

    formData.append(
      'user_id',
      String(context.user.id)
    );

    const role = this.resolveRole(context.user);

    if (role) {
      formData.append(
        'role',
        role
      );
    }

    if (context.token) {
      formData.append(
        'access_token',
        context.token
      );
    }

    formData.append(
      'file',
      blob,
      `audio.${extension}`
    );

    console.info('voice_upload_finalize', {
      mimeType,
      chunksCount: chunks.length,
      finalBlobSize: blob.size,
      isFinal: true,
      sessionId,
    });

    return firstValueFrom(
      this.http.post<AudioStreamResponse>(
        `${this.endpoint}/audio-stream`,
        formData
      )
    );
  }

  private finish(response: AudioStreamResponse): void {
    if (this.isSoftVoiceResponse(response)) {
      const message = this.resolveSoftVoiceMessage(response);
      this.finalized = true;
      this.eventsSubject.next({
        type: 'final',
        response: {
          ...response,
          success: true,
          status: this.normalizeSoftVoiceStatus(response),
          message,
          response: message,
          text: '',
        },
      });
      this.completeSession();
      return;
    }

    this.finalized = true;
    const assistantMessage = this.extractAssistantText(response);
    if (this.isAudioFailure(response.error) || !assistantMessage) {
      this.emitError(assistantMessage ?? VoiceAssistantService.AUDIO_ERROR_MESSAGE);
      return;
    }

    this.eventsSubject.next({
      type: 'final',
      response: {
        ...response,
        message: assistantMessage,
        response: assistantMessage,
      },
    });
    this.completeSession();
  }

  private completeSession(): void {
    this.emitState('idle');
    this.lastPartial = '';
    this.recordedChunks = [];
    this.recordingSessionId = null;
    this.finalUploadSent = false;
    this.finalizationPromise = null;
  }

  private emitNoSpeech(): void {
    this.finalized = true;
    this.eventsSubject.next({
      type: 'final',
      response: {
        success: true,
        final: true,
        status: 'no_speech',
        text: '',
        message: VoiceAssistantService.SOFT_NO_INPUT_MESSAGE,
        response: VoiceAssistantService.SOFT_NO_INPUT_MESSAGE,
        stream_state: 'done',
      },
    });
    this.completeSession();
  }

  private cleanupMedia(): void {
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.recorder = null;
  }

  private resolveMimeType(): string {
    if (typeof MediaRecorder === 'undefined') {
      return '';
    }

    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
    ];

    for (const candidate of candidates) {
      if (MediaRecorder.isTypeSupported(candidate)) {
        return candidate;
      }
    }

    return '';
  }

  private resolveFileExtension(mimeType: string = this.recorderMimeType): string {
    if (mimeType.includes('ogg')) {
      return 'ogg';
    }
    return 'webm';
  }

  private getUserContext(): { user: User; token: string | null } | null {
    const user = this.authService.currentUser() ?? this.readStoredUser();
    if (!user?.id) {
      return null;
    }
    return { user, token: this.authService.getToken() };
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

  private extractAssistantText(response: AudioStreamResponse | null | undefined): string | null {
    if (!response) {
      return null;
    }
    return response.message?.trim()
      || response.response?.trim()
      || this.normalizeAudioErrorMessage(response.error)
      || response.error?.trim()
      || null;
  }

  private resolveErrorMessage(error: unknown, fallbackMessage: string): string {
    if (error instanceof HttpErrorResponse) {
      const body = error.error as Record<string, unknown> | string | null | undefined;
      if (typeof body === 'string' && body.trim()) {
        return this.normalizeAudioErrorMessage(body.trim()) ?? body.trim();
      }
      if (body && typeof body === 'object') {
        const status = typeof body['status'] === 'string' ? body['status'].trim() : '';
        const loweredStatus = status.toLowerCase();
        if (loweredStatus === 'unclear_audio' || loweredStatus === 'retry') {
          return VoiceAssistantService.SOFT_RETRY_MESSAGE;
        }
        if (loweredStatus === 'no_speech' || loweredStatus === 'no_input') {
          return VoiceAssistantService.SOFT_NO_INPUT_MESSAGE;
        }
        if (loweredStatus === 'invalid_audio') {
          return VoiceAssistantService.INVALID_AUDIO_MESSAGE;
        }
        if (loweredStatus === 'server_error' || loweredStatus === 'error') {
          return VoiceAssistantService.SERVER_ERROR_MESSAGE;
        }

        const message = typeof body['message'] === 'string' ? body['message'].trim() : '';
        const response = typeof body['response'] === 'string' ? body['response'].trim() : '';
        const audioError = typeof body['error'] === 'string'
          ? this.normalizeAudioErrorMessage(body['error'])
          : null;
        return message || response || audioError || fallbackMessage;
      }
    }
    if (error instanceof Error && error.message.trim()) {
      return error.message.trim();
    }
    return fallbackMessage;
  }

  private normalizeAudioErrorMessage(value: string | null | undefined): string | null {
    if (!value?.trim()) {
      return null;
    }

    const lowered = value.trim().toLowerCase();
    if (
      lowered === 'empty_audio'
      || lowered === 'no_speech_detected'
      || lowered === 'no_input'
      || lowered === 'no_speech'
      || lowered.includes("je n'ai rien entendu")
      || lowered.includes("je n'ai pas entendu")
      || lowered.includes('aucun son')
    ) {
      return VoiceAssistantService.SOFT_NO_INPUT_MESSAGE;
    }
    if (
      lowered === 'retry'
      || lowered === 'unclear_audio'
      || lowered === 'unclean_transcription'
      || lowered.includes("je n'ai pas bien compris")
    ) {
      return VoiceAssistantService.SOFT_UNCLEAR_MESSAGE;
    }
    if (lowered === 'invalid_audio') {
      return VoiceAssistantService.INVALID_AUDIO_MESSAGE;
    }
    if (
      lowered === 'audio_transcription_failed'
      || lowered === 'audio_processing_failed'
      || lowered === 'conversion_failed'
      || lowered === 'whisper_failed'
      || lowered === 'server_error'
    ) {
      return VoiceAssistantService.SERVER_ERROR_MESSAGE;
    }
    if (
      lowered.includes('assistant temporairement indisponible')
      || lowered.includes('ollama')
      || lowered.includes('connection refused')
    ) {
      return VoiceAssistantService.ASSISTANT_UNAVAILABLE_MESSAGE;
    }
    return value.trim();
  }

  private isSoftVoiceResponse(response: AudioStreamResponse | null | undefined): boolean {
    const status = String(response?.status ?? '').trim().toLowerCase();
    const error = String(response?.error ?? '').trim().toLowerCase();
    const message = `${response?.message ?? ''} ${response?.response ?? ''}`.trim().toLowerCase();

    return status === 'no_speech'
      || status === 'no_input'
      || status === 'unclear_audio'
      || status === 'invalid_audio'
      || status === 'retry'
      || error === 'no_speech_detected'
      || error === 'no_input'
      || error === 'empty_audio'
      || error === 'retry'
      || error === 'unclear_audio'
      || error === 'invalid_audio'
      || message.includes("je n'ai rien entendu")
      || message.includes("je n'ai pas bien compris")
      || message.includes("je n'ai pas entendu")
      || message.includes('phrase repetee');
  }

  private normalizeSoftVoiceStatus(response: AudioStreamResponse | null | undefined): string {
    const status = String(response?.status ?? '').trim().toLowerCase();
    if (status === 'invalid_audio') {
      return 'invalid_audio';
    }
    if (status === 'retry' || status === 'unclear_audio') {
      return 'unclear_audio';
    }
    return status === 'no_input' ? 'no_speech' : (status || 'no_speech');
  }

  private resolveSoftVoiceMessage(response: AudioStreamResponse | null | undefined): string {
    const status = this.normalizeSoftVoiceStatus(response);
    if (status === 'invalid_audio') {
      return String(response?.message || response?.response || VoiceAssistantService.INVALID_AUDIO_MESSAGE).trim();
    }
    if (status === 'unclear_audio') {
      return String(response?.message || response?.response || VoiceAssistantService.SOFT_UNCLEAR_MESSAGE).trim();
    }
    return String(response?.message || response?.response || VoiceAssistantService.SOFT_NO_INPUT_MESSAGE).trim();
  }

  private isAudioFailure(value: string | null | undefined): boolean {
    if (!value?.trim()) {
      return false;
    }
    const lowered = value.trim().toLowerCase();
    return (
      lowered === 'audio_transcription_failed'
      || lowered === 'audio_processing_failed'
      || lowered === 'whisper_failed'
      || lowered === 'server_error'
    );
  }

  private emitState(state: VoiceAssistantState): void {
    this.eventsSubject.next({ type: 'state', state });
  }

  private emitError(message: string): void {
    this.finalized = true;
    this.eventsSubject.next({ type: 'error', message });
    this.emitState('error');
    this.lastPartial = '';
    this.recordedChunks = [];
  }

  private resolveMicrophoneError(error: unknown): string {
    if (error instanceof DOMException) {
      if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
        return VoiceAssistantService.MICROPHONE_BLOCKED_MESSAGE;
      }
      if (error.name === 'NotFoundError' || error.name === 'NotReadableError') {
        return 'Aucun microphone actif detecte.';
      }
    }

    if (error instanceof Error) {
      if (error.message === 'stream_inactive') {
        return VoiceAssistantService.MICROPHONE_BLOCKED_MESSAGE;
      }
      if (error.message === 'media_recorder_unavailable') {
        return 'Capture audio indisponible sur ce navigateur.';
      }
      if (error.message === 'unsupported_mime_type') {
        return 'Format audio non supporte par ce navigateur.';
      }
    }

    return VoiceAssistantService.MICROPHONE_BLOCKED_MESSAGE;
  }

  private isStreamActive(stream: MediaStream | null): boolean {
    if (!stream) {
      return false;
    }
    const tracks = stream.getAudioTracks();
    return tracks.length > 0 && tracks.some(track => track.readyState === 'live' && track.enabled);
  }

  private generateSessionId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `voice-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
