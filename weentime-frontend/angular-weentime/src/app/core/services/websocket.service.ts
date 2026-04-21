import { Injectable, inject } from '@angular/core';
import { from, Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import type { IMessage, RxStomp } from '@stomp/rx-stomp';
import { ApiConfigService } from './api-config.service';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class WebSocketService {
  private readonly apiConfig = inject(ApiConfigService);
  private readonly authService = inject(AuthService);
  private readonly clients = new Map<string, Promise<RxStomp>>();

  private getClient(endpoint: string): Promise<RxStomp> {
    if (!this.authService.getToken()) {
      return Promise.reject(new Error('Missing authentication token for websocket connection.'));
    }

    const clientKey = `${endpoint}::${this.authService.getToken() ?? 'anonymous'}`;
    const existing = this.clients.get(clientKey);
    if (existing) {
      return existing;
    }

    const clientPromise = Promise.all([
      import('@stomp/rx-stomp'),
      import('sockjs-client')
    ]).then(([rxStompModule, sockJsModule]) => {
      const client = new rxStompModule.RxStomp();
      const SockJS = sockJsModule.default;

      client.configure({
        webSocketFactory: () => new SockJS(endpoint),
        connectHeaders: this.buildConnectHeaders(),
        heartbeatIncoming: 0,
        heartbeatOutgoing: 20000,
        reconnectDelay: 0,
        debug: (message: string): void => {
          void message;
        }
      });

      client.activate();
      return client;
    });

    this.clients.set(clientKey, clientPromise);
    return clientPromise;
  }

  public watch<T>(topic: string, endpoint: string = this.apiConfig.WEBSOCKET.RH_SERVICE): Observable<T> {
    return from(this.getClient(endpoint)).pipe(
      switchMap(client => client.watch(topic)),
      map((message: IMessage) => this.parseBody<T>(message.body))
    );
  }

  public watchRaw(topic: string, endpoint: string = this.apiConfig.WEBSOCKET.RH_SERVICE): Observable<string> {
    return from(this.getClient(endpoint)).pipe(
      switchMap(client => client.watch(topic)),
      map((message: IMessage) => message.body)
    );
  }

  public publish(topic: string, body: unknown, endpoint: string = this.apiConfig.WEBSOCKET.RH_SERVICE): void {
    void this.getClient(endpoint).then(client => {
      client.publish({ destination: topic, body: JSON.stringify(body) });
    });
  }

  private parseBody<T>(body: string): T {
    try {
      return JSON.parse(body) as T;
    } catch {
      return body as T;
    }
  }

  private buildConnectHeaders(): Record<string, string> {
    const token = this.authService.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}
