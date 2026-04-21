import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { PresenceRecord } from '../../presence.service';

export interface FormattedTime {
  arrival: string;
  departure: string;
}

@Component({
  selector: 'app-check-in-card',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './check-in-card.component.html',
  styleUrl: './check-in-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CheckInCardComponent implements OnChanges {

  private cdr = inject(ChangeDetectorRef);

  @Input() todayPresence: PresenceRecord | null = null;
  @Input() isCheckedIn = false;
  @Input() isLoading = false;
  @Input() isCheckingIn = false;
  @Input() isCheckingOut = false;
  @Input() formattedTime: FormattedTime = { arrival: '--:--', departure: '--:--' };
  @Input() totalTime = '0h 00m';
  @Input() currentTime = '--:--';

  @Output() checkIn = new EventEmitter<void>();
  @Output() checkOut = new EventEmitter<void>();

  ngOnChanges(): void {
    this.cdr.markForCheck();
  }

  getStatusLabel(): string {
    if (this.isLoading) return 'Chargement...';

    if (this.todayPresence?.status === 'LATE') return '⏰ En retard';
    if (this.isCheckedIn) return '✓ En cours';

    return 'Non pointé';
  }

  getStatusIcon(): string {
    if (this.isLoading) return 'loader-2';
    if (this.isCheckedIn) return 'check-circle';
    return 'circle';
  }
}