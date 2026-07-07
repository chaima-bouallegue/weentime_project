import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnInit,
  Output,
  computed,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LucideAngularModule } from 'lucide-angular';
import { LeaveTypeUI, TypeConge } from '../../models/leave-type.model';
import { LeaveTypeService } from '../../services/leave-type.service';

@Component({
  selector: 'app-leave-type-selection',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './leave-type-selection.component.html',
  styleUrl: './leave-type-selection.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LeaveTypeSelectionComponent implements OnInit {
  @Input() selectedType!: TypeConge | null;
  @Output() selectionChange = new EventEmitter<TypeConge>();
  @Output() errorOccurred = new EventEmitter<string>();

  private leaveTypeService = inject(LeaveTypeService);
  private destroyRef = inject(DestroyRef);

  leaveTypes = signal<LeaveTypeUI[]>([]);
  isLoading = signal(true);
  error = signal<string | null>(null);
  hasError = computed(() => this.error() !== null);

  ngOnInit() {
    this.loadLeaveTypes();
  }

  private loadLeaveTypes(): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.leaveTypeService
      .getLeaveTypes()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (types) => {
          this.leaveTypes.set(types);
          this.isLoading.set(false);
        },
        error: (err) => {
          this.error.set(err?.message || 'Impossible de charger les types de conges');
          this.errorOccurred.emit('API Error');
          this.isLoading.set(false);
        }
      });
  }

  selectLeaveType(type: LeaveTypeUI): void {
    if (!type.isAvailable) {
      return;
    }

    this.selectedType = type.type;
    this.selectionChange.emit(type.type);
  }

  isSelected(type: TypeConge): boolean {
    return this.selectedType === type;
  }

  getCardClasses(type: LeaveTypeUI): { [key: string]: boolean } {
    return {
      'type-card': true,
      'available': type.isAvailable,
      'unavailable': !type.isAvailable,
      'unpaid': type.isUnpaid,
      'selected': this.isSelected(type.type),
      'disabled': !type.isAvailable
    };
  }

  getCardStyle(type: LeaveTypeUI): { [key: string]: string } {
    return {
      '--card-color': type.colorHex
    } as any;
  }

  getIconName(type: LeaveTypeUI): string {
    const iconMap: { [key: string]: string } = {
      Umbrella: 'Umbrella',
      Heart: 'Heart',
      Clock: 'Clock',
      Baby: 'Baby',
      Star: 'Star',
      MinusCircle: 'MinusCircle'
    };
    return iconMap[type.icon] || 'CalendarDays';
  }

  retry(): void {
    this.loadLeaveTypes();
  }
}
