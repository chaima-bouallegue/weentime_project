import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { ToastService } from './toast.service';
import { fromEvent, merge, firstValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';
import { logWarn } from '../utils/logger';

interface SyncDB extends DBSchema {
  'offline-queue': {
    key: number;
    value: {
      id?: number;
      url: string;
      method: 'POST' | 'PUT' | 'DELETE' | 'PATCH';
      body: any;
      timestamp: number;
    };
  };
}

@Injectable({ providedIn: 'root' })
export class OfflineSyncService {
  private dbPromise: Promise<IDBPDatabase<SyncDB>>;
  private http = inject(HttpClient);
  // Using any to avoid strict typing errors if method exists but not in ToastService model
  private toastService = inject(ToastService) as any;

  public isOnline = navigator.onLine;

  constructor() {
    this.dbPromise = openDB<SyncDB>('weentime-sync-db', 1, {
      upgrade(db) {
        db.createObjectStore('offline-queue', { keyPath: 'id', autoIncrement: true });
      },
    });

    this.listenToNetworkStatus();
  }

  private listenToNetworkStatus() {
    merge(
      fromEvent(window, 'online').pipe(map(() => true)),
      fromEvent(window, 'offline').pipe(map(() => false))
    ).subscribe((online) => {
      this.isOnline = online;
      if (online) {
        if (this.toastService.showSuccess) this.toastService.showSuccess('Connexion rétablie. Synchronisation en cours...');
        this.syncQueue();
      } else {
        if (this.toastService.showError) this.toastService.showError('Connexion perdue. Mode hors ligne activé.');
      }
    });
  }

  /**
   * Queue a request to be executed when online.
   * If online, returns false (meaning it should be executed immediately).
   */
  public async queueRequest(method: 'POST'|'PUT'|'DELETE'|'PATCH', url: string, body: any): Promise<boolean> {
    if (this.isOnline) return false;

    if (this.toastService.showInfo) this.toastService.showInfo('Action sauvegardée. Sera synchronisée au retour du réseau.');
    const db = await this.dbPromise;
    await db.add('offline-queue', {
      url,
      method,
      body,
      timestamp: Date.now()
    });
    return true;
  }

  private async syncQueue(): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction('offline-queue', 'readwrite');
    const store = tx.objectStore('offline-queue');
    const allReqs = await store.getAll();

    for (const req of allReqs) {
      if (!this.isOnline) break;

      try {
        switch (req.method) {
          case 'POST': await firstValueFrom(this.http.post(req.url, req.body)); break;
          case 'PUT': await firstValueFrom(this.http.put(req.url, req.body)); break;
          case 'DELETE': await firstValueFrom(this.http.delete(req.url, { body: req.body })); break;
          case 'PATCH': await firstValueFrom(this.http.patch(req.url, req.body)); break;
        }
        await store.delete(req.id!);
      } catch (err) {
        void err;
        logWarn('Failed to sync queued request', {
          url: req.url,
          method: req.method,
          timestamp: req.timestamp
        });
      }
    }
  }
}
