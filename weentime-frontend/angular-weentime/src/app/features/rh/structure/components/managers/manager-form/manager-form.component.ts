import { Component, Input, Output, EventEmitter, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { StructureService } from '../../../structure.service';
import { EmployeRH, Equipe } from '../../../models/structure.model';

@Component({
  selector: 'app-manager-form',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './manager-form.component.html',
  styleUrl: './manager-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ManagerFormComponent {
  @Input() manager!: EmployeRH;
  @Input() equipesSansManager: Equipe[] = [];
  @Output() close = new EventEmitter<void>();
  @Output() assigned = new EventEmitter<void>();

  private structureService = inject(StructureService);

  selectedEquipeId = signal<number | null>(null);
  isSubmitting = signal(false);

  onAssign(): void {
    const equipeId = this.selectedEquipeId();
    if (!equipeId) return;
    this.isSubmitting.set(true);
    this.structureService.assignManagerToEquipe(this.manager.id, equipeId).subscribe({
      next: () => { this.isSubmitting.set(false); this.assigned.emit(); },
      error: () => this.isSubmitting.set(false)
    });
  }
}
