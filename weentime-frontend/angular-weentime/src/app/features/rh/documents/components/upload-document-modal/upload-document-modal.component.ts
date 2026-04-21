import { Component, Input, Output, EventEmitter, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { DemandeDocumentRH } from '../../models/rh-document.model';

@Component({
  selector: 'app-upload-document-modal',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './upload-document-modal.component.html',
  styleUrl: './upload-document-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UploadDocumentModalComponent {
  @Input({ required: true }) demande: DemandeDocumentRH | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<{ id: number, file: File }>();

  selectedFile = signal<File | null>(null);
  isDragging = signal<boolean>(false);

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file && file.type === 'application/pdf') {
      this.selectedFile.set(file);
    }
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragging.set(false);
    const file = event.dataTransfer?.files[0];
    if (file && file.type === 'application/pdf') {
      this.selectedFile.set(file);
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragging.set(true);
  }

  onDragLeave() {
    this.isDragging.set(false);
  }

  onConfirm() {
    if (this.demande && this.selectedFile()) {
      this.confirm.emit({ id: this.demande.id, file: this.selectedFile()! });
    }
  }
}
