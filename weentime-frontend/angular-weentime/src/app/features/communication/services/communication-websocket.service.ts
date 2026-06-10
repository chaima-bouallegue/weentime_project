import { Injectable, inject, signal } from '@angular/core';
import { Observable, Subject, Subscription } from 'rxjs';
import type { IMessage, RxStomp } from '@stomp/rx-stomp';
import { ApiConfigService } from '@app/core/services/api-config.service';
import { AuthService } from '@app/core/services/auth.service';
import { CommunicationSocketEvent } from '../models/websocket-events.models';

export type CommunicationConnectionState = 'connecting' | 'connected' | 'disconnected';

@Injectable({
  providedIn: 'root'
})
export class CommunicationWebSocketService {
  private readonly apiConfig = inject(ApiConfigService);
  private readonly authService = inject(AuthService);
  private readonly socketUrl = this.apiConfig.buildWebSocketUrl('/ws-communication');
  private readonly eventsSubject = new Subject<CommunicationSocketEvent>();
  private readonly desiredChannelIds = new Set<string>();
  private readonly channelSubscriptions = new Map<string, Subscription>();
  private userQueueSubscription: Subscription | null = null;
  private clientPromise: Promise<RxStomp | null> | null = null;
  private client: RxStomp | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private readonly maxReconnectAttempts = 5;
  private manualDisconnect = false;
  private hadOpenConnection = false;

  readonly connectionState = signal<CommunicationConnectionState>('disconnected');
  readonly connectionError = signal<string | null>(null);
  readonly events$: Observable<CommunicationSocketEvent> = this.eventsSubject.asObservable();

  connect(): void {
    if (!this.authService.getToken()) {
      console.debug('[communication-ws] CONNECT skipped: no JWT is available');
      this.connectionError.set(null);
      this.disconnect();
      return;
    }
    if (!this.hasTenantContext()) {
      console.debug('[communication-ws] CONNECT skipped: no valid entreprise context');
      this.connectionError.set(null);
      this.disconnect();
      return;
    }

    if (this.clientPromise || this.connectionState() === 'connected' || this.connectionState() === 'connecting') {
      return;
    }

    this.manualDisconnect = false;
    this.connectionState.set('connecting');
    console.debug('[communication-ws] CONNECT', { url: this.socketUrl });
    this.clientPromise = Promise.all([
      import('@stomp/rx-stomp'),
      import('sockjs-client')
    ]).then(([rxStompModule, sockJsModule]) => {
      const client = new rxStompModule.RxStomp();
      const SockJS = sockJsModule.default;

      client.connectionState$.subscribe((state: number) => {
        if (state === rxStompModule.RxStompState.OPEN) {
          console.debug('[communication-ws] CONNECTED', { url: this.socketUrl });
          this.connectionState.set('connected');
          this.connectionError.set(null);
          this.hadOpenConnection = true;
          this.reconnectAttempt = 0;
          this.clearReconnectTimer();
          this.ensureUserQueue(client);
          this.resubscribeChannels(client);
          return;
        }

        if (state === rxStompModule.RxStompState.CLOSED) {
          console.debug('[communication-ws] DISCONNECTED', {
            manual: this.manualDisconnect,
            hadOpenConnection: this.hadOpenConnection
          });
          this.connectionState.set('disconnected');
          this.teardownLiveSubscriptions();
          this.client = null;
          this.clientPromise = null;
          if (!this.manualDisconnect) {
            this.scheduleReconnect();
          }
          return;
        }

        this.connectionState.set('connecting');
      });

      client.configure({
        webSocketFactory: () => new SockJS(this.socketUrl),
        connectHeaders: this.buildConnectHeaders(),
        heartbeatIncoming: 20000,
        heartbeatOutgoing: 20000,
        reconnectDelay: 0,
        debug: (message: string) => console.debug('[communication-ws]', message)
      });

      client.stompErrors$.subscribe(frame => {
        const brokerMessage = frame.headers?.['message'] ?? frame.body ?? 'STOMP connection rejected';
        console.error('[communication-ws] AUTH/STOMP FAILURE', {
          message: brokerMessage,
          command: frame.command
        });
        this.connectionError.set('Authentification temps reel refusee');
      });
      client.webSocketErrors$.subscribe(error => {
        console.error('[communication-ws] TRANSPORT FAILURE', error);
        this.connectionError.set('Connexion temps reel indisponible');
      });

      client.activate();
      this.client = client;
      return client;
    }).catch(error => {
      console.error('[communication-ws] CONNECT FAILURE', error);
      this.clientPromise = null;
      this.client = null;
      this.connectionState.set('disconnected');
      this.connectionError.set('Connexion temps réel indisponible');
      this.scheduleReconnect();
      return null;
    });
  }

  disconnect(): void {
    this.manualDisconnect = true;
    this.clearReconnectTimer();
    this.teardownLiveSubscriptions();
    this.desiredChannelIds.clear();
    this.reconnectAttempt = 0;
    this.hadOpenConnection = false;
    this.connectionError.set(null);
    const currentClient = this.client;
    this.client = null;
    this.clientPromise = null;
    this.connectionState.set('disconnected');
    console.debug('[communication-ws] DISCONNECT requested');
    void currentClient?.deactivate();
  }

  subscribeToChannel(channelId: string): void {
    this.desiredChannelIds.add(channelId);
    this.connect();
    void this.clientPromise?.then(client => {
      if (client && this.connectionState() === 'connected' && this.desiredChannelIds.has(channelId)) {
        this.subscribeActualChannel(client, channelId);
      }
    });
  }

  unsubscribeFromChannel(channelId: string): void {
    this.desiredChannelIds.delete(channelId);
    this.channelSubscriptions.get(channelId)?.unsubscribe();
    this.channelSubscriptions.delete(channelId);
  }

  publishTyping(channelId: string, typing: boolean): void {
    this.connect();
    void this.clientPromise?.then(client => {
      if (!client || this.connectionState() !== 'connected' || !this.desiredChannelIds.has(channelId)) {
        return;
      }
      console.debug('[communication-ws] typing', { channelId, typing });
      client.publish({
        destination: `/app/communication/channels/${channelId}/typing`,
        body: JSON.stringify({ typing })
      });
    });
  }

  private ensureUserQueue(client: RxStomp): void {
    if (this.userQueueSubscription) {
      return;
    }

    this.userQueueSubscription = client.watch('/user/queue/communication').subscribe({
      next: (message: IMessage) => this.handleMessage(message),
      error: error => {
        console.error('[communication-ws] user queue subscription failed', error);
        this.connectionState.set('disconnected');
        this.connectionError.set('Connexion temps réel indisponible');
        this.scheduleReconnect();
      }
    });
  }

  private subscribeActualChannel(client: RxStomp, channelId: string): void {
    if (this.channelSubscriptions.has(channelId)) {
      return;
    }

    const subscription = client.watch(`/topic/communication/channel/${channelId}`).subscribe({
      next: (message: IMessage) => this.handleMessage(message),
      error: error => {
        console.error('[communication-ws] channel subscription failed', { channelId, error });
        this.connectionState.set('disconnected');
        this.connectionError.set('Connexion temps réel indisponible');
        this.scheduleReconnect();
      }
    });
    this.channelSubscriptions.set(channelId, subscription);
  }

  private resubscribeChannels(client: RxStomp): void {
    for (const channelId of this.desiredChannelIds) {
      this.subscribeActualChannel(client, channelId);
    }
  }

  private handleMessage(message: IMessage): void {
    try {
      this.eventsSubject.next(JSON.parse(message.body) as CommunicationSocketEvent);
    } catch {
      // Ignore malformed websocket payloads and wait for the next valid event.
    }
  }

  private scheduleReconnect(): void {
    if (this.manualDisconnect || this.reconnectTimer || !this.authService.getToken() || !this.hasTenantContext()) {
      return;
    }
    if (this.reconnectAttempt >= this.maxReconnectAttempts) {
      console.warn('[communication-ws] RETRY stopped: maximum attempts reached', { attempts: this.reconnectAttempt });
      this.connectionState.set('disconnected');
      this.connectionError.set('Connexion temps réel indisponible');
      return;
    }

    const delay = Math.min(30000, 1000 * (2 ** this.reconnectAttempt)) + Math.round(Math.random() * 250);
    this.reconnectAttempt += 1;
    console.debug('[communication-ws] RETRY scheduled', { delay, attempt: this.reconnectAttempt });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) {
      return;
    }
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private teardownLiveSubscriptions(): void {
    this.userQueueSubscription?.unsubscribe();
    this.userQueueSubscription = null;
    this.channelSubscriptions.forEach(subscription => subscription.unsubscribe());
    this.channelSubscriptions.clear();
  }

  private buildConnectHeaders(): Record<string, string> {
    const token = this.authService.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private hasTenantContext(): boolean {
    const user = this.authService.currentUser();
    return Number.isFinite(user?.entrepriseId) && (user?.entrepriseId ?? 0) > 0;
  }
}
