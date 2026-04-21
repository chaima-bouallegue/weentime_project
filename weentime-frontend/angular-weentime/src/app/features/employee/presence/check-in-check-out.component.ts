import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PresenceService } from './presence.service';
import { LoaderComponent } from '@app/shared/components/loader/loader.component';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-check-in-check-out',
  standalone: true,
  imports: [CommonModule, LoaderComponent, LucideAngularModule],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="bg-white rounded-lg shadow-sm p-6">
        <h2 class="text-2xl font-bold text-gray-900">Pointage</h2>
        <p class="text-gray-600 mt-2">Enregistrez votre heure d'arrivée et de départ</p>
      </div>

      <!-- Main Card -->
      <div class="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg shadow-sm p-8 border border-blue-100">
        <div class="flex flex-col items-center gap-6">

          <!-- Status -->
          <div>
            <span *ngIf="presenceService.isCheckedInSignal(); else notChecked"
              class="bg-green-100 text-green-800 px-4 py-2 rounded-full text-sm font-medium">
              ✅ En cours
            </span>

            <ng-template #notChecked>
              <span class="bg-gray-100 text-gray-800 px-4 py-2 rounded-full text-sm font-medium">
                ⏸️ Non pointé
              </span>
            </ng-template>
          </div>

          <!-- Time -->
          <div class="text-center">
            <div class="text-5xl font-bold">{{ getCurrentTime() }}</div>
            <div class="text-gray-500">{{ getCurrentDate() }}</div>
          </div>

          <!-- Times -->
          <div class="grid grid-cols-2 gap-6 w-full max-w-md text-center">
            <div>
              <div class="text-gray-500">Arrivée</div>
              <div class="text-xl font-bold">
                {{ presenceService.formattedTime().arrival }}
              </div>
            </div>
            <div>
              <div class="text-gray-500">Départ</div>
              <div class="text-xl font-bold">
                {{ presenceService.formattedTime().departure }}
              </div>
            </div>
          </div>

          <!-- Total -->
          <div class="text-center bg-white p-4 rounded-lg w-full max-w-md">
            <div class="text-gray-500">Temps total</div>
            <div class="text-2xl font-bold text-indigo-600">
              {{ presenceService.totalPresenceToday() }}
            </div>
          </div>

          <!-- Buttons -->
          <div class="w-full max-w-md">

            <!-- Check-in -->
            <button
              *ngIf="!presenceService.isCheckedInSignal() && !presenceService.loadingSignal()"
              (click)="onCheckIn()"
              [disabled]="isProcessing"
              class="w-full bg-green-600 text-white py-3 rounded-lg">
              Pointer l'arrivée
            </button>

            <!-- Check-out -->
            <button
              *ngIf="presenceService.isCheckedInSignal() && !presenceService.loadingSignal()"
              (click)="onCheckOut()"
              [disabled]="isProcessing"
              class="w-full bg-red-600 text-white py-3 rounded-lg">
              Pointer le départ
            </button>

            <!-- Loading -->
            <div *ngIf="presenceService.loadingSignal() || isProcessing"
              class="w-full bg-gray-300 py-3 rounded-lg text-center">
              <app-loader></app-loader>
              Chargement...
            </div>

          </div>

          <!-- Error -->
          <div *ngIf="apiOffline"
            class="bg-red-100 text-red-700 p-3 rounded">
            ❌ Backend indisponible
          </div>

        </div>
      </div>
    </div>
  `
})
export class CheckInCheckOutComponent implements OnInit {

  readonly presenceService = inject(PresenceService);

  isProcessing = false;
  apiOffline = false;

  ngOnInit(): void {
    this.presenceService.loadTodayPresence();
  }

  onCheckIn(): void {
    if (this.isProcessing) return;

    this.isProcessing = true;
    this.apiOffline = false;

    this.presenceService.checkIn().subscribe({
      next: () => {
        this.isProcessing = false;
        this.presenceService.loadTodayPresence();
      },
      error: (err) => {
        this.isProcessing = false;

        if (err.status === 0) {
          this.apiOffline = true;
        }
      }
    });
  }

  onCheckOut(): void {
    if (this.isProcessing) return;

    this.isProcessing = true;
    this.apiOffline = false;

    this.presenceService.checkOut().subscribe({
      next: () => {
        this.isProcessing = false;
        this.presenceService.loadTodayPresence();
      },
      error: (err) => {
        this.isProcessing = false;

        if (err.status === 0) {
          this.apiOffline = true;
        }
      }
    });
  }

  getCurrentTime(): string {
    return new Date().toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getCurrentDate(): string {
    return new Date().toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
}
