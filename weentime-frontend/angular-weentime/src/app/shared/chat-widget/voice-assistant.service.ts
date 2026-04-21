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
  private static readonly SOFT_NO_INPUT_MESSAGE = "Je n'ai rien entendu. Pouvez-vous reessayer ?";
  private static readonly SOFT_RETRY_MESSAGE = "Je n'ai pas bien compris. Pouvez-vous repeter ?";
  private static readonly MICROPHONE_BLOCKED_MESSAGE = 'Microphone indisponible ou bloque.';
  private static readonly AUDIO_ERROR_MESSAGE = 'Erreur audio, veuillez reessayer.';
  private static readonly ASSISTANT_UNAVAILABLE_MESSAGE = 'Assistant temporairement indisponible';
  private static readonly MIN_CHUNK_BYTES = 500;
  private static readonly MIN_VOLUME_THRESHOLD = 8;
  private static readonly INITIAL_SILENCE_MS = 1500;
  private static readonly RECORDER_TIMESLICE_MS = 500;
  private static readonly SILENCE_TIMEOUT_MS = 2000;
  private static readonly MAX_CHUNKS = 100;

  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly endpoint = environment.aiServiceUrl;
  private readonly eventsSubject = new Subject<VoiceAssistantEvent>();

  readonly events$: Observable<VoiceAssistantEvent> = this.eventsSubject.asObservable();

  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private audioSource: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private frequencyData: Uint8Array<ArrayBuffer> | null = null;
  private levelFrame: number | null = null;
  private sessionId: string | null = null;
  private recorderMimeType = 'audio/webm';
  private pendingUploads = Promise.resolve();
  private pendingChunk: Blob | null = null;
  private finalized = false;
  private lastPartial = '';
  private context: { user: User; token: string | null } | null = null;
  private hasHeardVoice = false;
  private recordingStartedAt = 0;
  private lastVoiceAt = 0;
  private currentVolume = 0;
  private maxDetectedVolume = 0;
  private chunkIndex = 0;
  private silenceTimer: number | null = null;

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
      await this.setupAudioMonitoring(stream);

      const mimeType = this.resolveMimeType();
      this.recorderMimeType = mimeType || 'audio/webm';
      this.recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      this.recorder.ondataavailable = event => {
        if (!event.data || event.data.size <= 0 || this.finalized) {
          return;
        }

        this.pendingUploads = this.pendingUploads
          .then(() => this.queueChunk(event.data))
          .catch(error => {
            this.emitError(this.resolveErrorMessage(error, VoiceAssistantService.AUDIO_ERROR_MESSAGE));
          });
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
    this.sessionId = null;
    this.finalized = false;
    this.lastPartial = '';
    this.pendingUploads = Promise.resolve();
    this.pendingChunk = null;
    this.hasHeardVoice = false;
    this.recordingStartedAt = Date.now();
    this.lastVoiceAt = this.recordingStartedAt;
    this.currentVolume = 0;
    this.maxDetectedVolume = 0;
    this.chunkIndex = 0;
    this.clearSilenceTimer();
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

  private async setupAudioMonitoring(stream: MediaStream): Promise<void> {
    const AudioContextCtor = this.getAudioContextConstructor();
    if (!AudioContextCtor) {
      return;
    }

    this.audioContext = new AudioContextCtor();
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.audioSource = this.audioContext.createMediaStreamSource(stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.85;
    this.audioSource.connect(this.analyser);
    this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
    this.monitorAudioLevel();
  }

  private monitorAudioLevel(): void {
    const tick = () => {
      if (!this.analyser || !this.frequencyData || !this.isRecording()) {
        return;
      }
      if (!this.isStreamActive(this.stream)) {
        this.emitError(VoiceAssistantService.MICROPHONE_BLOCKED_MESSAGE);
        void this.stop();
        return;
      }

      const volume = this.detectAudioLevel();
      const now = Date.now();
      this.currentVolume = volume;
      this.maxDetectedVolume = Math.max(this.maxDetectedVolume, volume);

      if (volume >= VoiceAssistantService.MIN_VOLUME_THRESHOLD) {
        this.hasHeardVoice = true;
        this.lastVoiceAt = now;
        this.resetSilenceTimer();
      }

      if (!this.hasHeardVoice && now - this.recordingStartedAt >= VoiceAssistantService.INITIAL_SILENCE_MS) {
        void this.stop();
        return;
      }

      this.levelFrame = window.requestAnimationFrame(tick);
    };

    this.levelFrame = window.requestAnimationFrame(tick);
  }

  private detectAudioLevel(): number {
    if (!this.analyser || !this.frequencyData) {
      return 0;
    }

    this.analyser.getByteFrequencyData(this.frequencyData);
    
    // FIX: Better audio level detection using weighted frequency bins
    // Speech is primarily in 300Hz-3kHz range, so weight those frequencies more heavily
    let weightedTotal = 0;
    let count = 0;
    
    // Weight mid-frequency bins more (where speech energy is concentrated)
    for (let i = 2; i < this.frequencyData.length * 0.7; i += 1) {
      const weight = i < this.frequencyData.length * 0.3 ? 0.5 : 1.0;
      weightedTotal += this.frequencyData[i] * weight;
      count += weight;
    }
    
    return count > 0 ? weightedTotal / count : 0;
  }

  private async queueChunk(blob: Blob): Promise<void> {
    if (!this.context || this.finalized) {
      return;
    }

    const combinedChunk = this.pendingChunk
      ? new Blob([this.pendingChunk, blob], { type: this.recorderMimeType })
      : blob;

    if (combinedChunk.size < VoiceAssistantService.MIN_CHUNK_BYTES) {
      this.pendingChunk = combinedChunk;
      return;
    }

    this.pendingChunk = null;
    await this.onAudioData(combinedChunk);
  }

  private async flushPendingChunk(forceSend: boolean): Promise<void> {
    if (!this.pendingChunk) {
      return;
    }

    const pendingChunk = this.pendingChunk;
    if (pendingChunk.size < VoiceAssistantService.MIN_CHUNK_BYTES) {
      this.pendingChunk = null;
      return;
    }

    if (!forceSend) {
      return;
    }

    this.pendingChunk = null;
    await this.onAudioData(pendingChunk);
  }

  private async onAudioData(chunk: Blob): Promise<void> {
    if (this.finalized || chunk.size < VoiceAssistantService.MIN_CHUNK_BYTES) {
      return;
    }
    await this.sendChunk(chunk, false);
    if (this.finalized) {
      return;
    }

    if (this.chunkIndex > VoiceAssistantService.MAX_CHUNKS) {
      this.clearSilenceTimer();
      await this.stop();
    }
  }

  private async sendChunk(chunk: Blob | null, isFinal: boolean): Promise<AudioStreamResponse | null> {
    if (!this.context || this.finalized) {
      return null;
    }

    const formData = new FormData();
    formData.append('is_final', String(isFinal));

    const role = this.resolveRole(this.context.user);
    if (!isFinal) {
      formData.append('user_id', String(this.context.user.id));
    }
    if (!isFinal && role) {
      formData.append('role', role);
    }
    if (this.sessionId) {
      formData.append('session_id', this.sessionId);
    }
    if (!isFinal && this.context.token) {
      formData.append('access_token', this.context.token);
    }
    if (!isFinal && chunk) {
      const nextChunkIndex = this.chunkIndex + 1;
      formData.append('file', chunk, `chunk.${this.resolveFileExtension()}`);
      formData.append('chunk_index', String(nextChunkIndex));
      this.chunkIndex = nextChunkIndex;
      this.maxDetectedVolume = Math.max(this.maxDetectedVolume, this.currentVolume);
    }

    const response = await firstValueFrom(
      this.http.post<AudioStreamResponse>(`${this.endpoint}/audio-stream`, formData)
    );
    this.ingestStreamResponse(response);
    return response;
  }

  private async finalizeStream(): Promise<void> {
    if (!this.context || this.finalized) {
      return;
    }

    await this.pendingUploads;
    await this.flushPendingChunk(this.hasHeardVoice);
    if (this.finalized) {
      return;
    }
    this.clearSilenceTimer();

    if (!this.sessionId) {
      this.emitNoSpeech();
      return;
    }

    this.emitState('processing');

    try {
      const response = await this.sendChunk(null, true);
      if (this.finalized) {
        return;
      }
      if (!response) {
        this.emitError(VoiceAssistantService.AUDIO_ERROR_MESSAGE);
        return;
      }
      if (response.final) {
        this.finish(response);
        return;
      }
      await this.pollForFinalResult(this.sessionId);
    } catch (error) {
      this.emitError(this.resolveErrorMessage(error, VoiceAssistantService.AUDIO_ERROR_MESSAGE));
    }
  }

  private async pollForFinalResult(sessionId: string): Promise<void> {
    for (let attempt = 0; attempt < 240 && !this.finalized; attempt += 1) {
      await this.sleep(250);

      const response = await firstValueFrom(
        this.http.get<AudioStreamResponse>(`${this.endpoint}/audio-stream/result/${sessionId}`)
      );
      if (response.final) {
        this.finish(response);
        return;
      }

      const partial = this.readPartial(response);
      if (partial && partial !== this.lastPartial) {
        this.lastPartial = partial;
        this.eventsSubject.next({ type: 'partial', text: partial });
      }

      this.emitState(this.normalizeStreamState(response.stream_state));
    }

    if (!this.finalized) {
      this.emitError('Le traitement vocal a expire.');
    }
  }

  private ingestStreamResponse(response: AudioStreamResponse): void {
    if (response.session_id) {
      this.sessionId = response.session_id;
    }

    if (response.final) {
      this.finish(response);
      return;
    }

    const partial = this.readPartial(response);
    if (partial && partial !== this.lastPartial) {
      this.lastPartial = partial;
      this.eventsSubject.next({ type: 'partial', text: partial });
    }

    this.emitState(this.normalizeStreamState(response.stream_state));
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
    this.clearSilenceTimer();
    this.emitState('idle');
    this.sessionId = null;
    this.lastPartial = '';
    this.pendingChunk = null;
  }

  private emitNoSpeech(): void {
    this.finalized = true;
    this.eventsSubject.next({
      type: 'final',
      response: {
        success: true,
        final: true,
        status: 'no_input',
        text: '',
        message: VoiceAssistantService.SOFT_NO_INPUT_MESSAGE,
        response: VoiceAssistantService.SOFT_NO_INPUT_MESSAGE,
        stream_state: 'done',
      },
    });
    this.completeSession();
  }

  private cleanupMedia(): void {
    this.clearSilenceTimer();
    if (this.levelFrame !== null) {
      window.cancelAnimationFrame(this.levelFrame);
      this.levelFrame = null;
    }

    if (this.audioSource) {
      this.audioSource.disconnect();
      this.audioSource = null;
    }

    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.recorder = null;
    this.analyser = null;
    this.frequencyData = null;

    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
    }
  }

  private resolveMimeType(): string {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      return 'audio/webm;codecs=opus';
    }
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm')) {
      return 'audio/webm';
    }
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
      return 'audio/ogg;codecs=opus';
    }
    return '';
  }

  private resolveFileExtension(): string {
    if (this.recorderMimeType.includes('wav')) {
      return 'wav';
    }
    if (this.recorderMimeType.includes('ogg')) {
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

  private readPartial(response: AudioStreamResponse): string {
    if (typeof response.partial === 'string' && response.partial.trim().length > 0) {
      return response.partial.trim();
    }
    return typeof response.text === 'string' ? response.text.trim() : '';
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
        if (status.toLowerCase() === 'retry') {
          return VoiceAssistantService.SOFT_RETRY_MESSAGE;
        }
        if (status.toLowerCase() === 'no_speech' || status.toLowerCase() === 'no_input') {
          return VoiceAssistantService.SOFT_NO_INPUT_MESSAGE;
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
      || lowered.includes("je n'ai rien entendu")
      || lowered.includes("je n'ai pas entendu")
      || lowered.includes('aucun son')
    ) {
      return VoiceAssistantService.SOFT_NO_INPUT_MESSAGE;
    }
    if (
      lowered === 'retry'
      || lowered.includes("je n'ai pas bien compris")
    ) {
      return VoiceAssistantService.SOFT_RETRY_MESSAGE;
    }
    if (
      lowered === 'audio_transcription_failed'
      || lowered === 'audio_processing_failed'
      || lowered === 'conversion_failed'
      || lowered === 'whisper_failed'
    ) {
      return VoiceAssistantService.AUDIO_ERROR_MESSAGE;
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
      || status === 'retry'
      || error === 'no_speech_detected'
      || error === 'no_input'
      || error === 'empty_audio'
      || error === 'retry'
      || message.includes("je n'ai rien entendu")
      || message.includes("je n'ai pas bien compris")
      || message.includes("je n'ai pas entendu");
  }

  private normalizeSoftVoiceStatus(response: AudioStreamResponse | null | undefined): string {
    const status = String(response?.status ?? '').trim().toLowerCase();
    if (status === 'retry') {
      return 'retry';
    }
    return status === 'no_speech' ? 'no_input' : (status || 'no_input');
  }

  private resolveSoftVoiceMessage(response: AudioStreamResponse | null | undefined): string {
    return this.normalizeSoftVoiceStatus(response) === 'retry'
      ? VoiceAssistantService.SOFT_RETRY_MESSAGE
      : VoiceAssistantService.SOFT_NO_INPUT_MESSAGE;
  }

  private isAudioFailure(value: string | null | undefined): boolean {
    if (!value?.trim()) {
      return false;
    }
    const lowered = value.trim().toLowerCase();
    return (
      lowered === 'audio_transcription_failed'
      || lowered === 'audio_processing_failed'
      || lowered === 'conversion_failed'
      || lowered === 'whisper_failed'
    );
  }

  private normalizeStreamState(value: string | null | undefined): VoiceAssistantState {
    switch ((value || '').toLowerCase()) {
      case 'listening':
        return 'listening';
      case 'processing':
      case 'transcribing':
        return 'processing';
      case 'responding':
      case 'thinking':
        return 'responding';
      case 'error':
        return 'error';
      default:
        return 'listening';
    }
  }

  private emitState(state: VoiceAssistantState): void {
    this.eventsSubject.next({ type: 'state', state });
  }

  private emitError(message: string): void {
    this.finalized = true;
    this.clearSilenceTimer();
    this.eventsSubject.next({ type: 'error', message });
    this.emitState('error');
    this.sessionId = null;
    this.lastPartial = '';
    this.pendingChunk = null;
  }

  private resetSilenceTimer(): void {
    this.clearSilenceTimer();
    this.silenceTimer = window.setTimeout(() => {
      if (this.finalized) {
        return;
      }
      void this.stop();
    }, VoiceAssistantService.SILENCE_TIMEOUT_MS);
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer !== null) {
      window.clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
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

  private getAudioContextConstructor(): typeof AudioContext | null {
    const browserWindow = window as Window & typeof globalThis & {
      webkitAudioContext?: typeof AudioContext;
    };
    return browserWindow.AudioContext ?? browserWindow.webkitAudioContext ?? null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => window.setTimeout(resolve, ms));
  }
}
