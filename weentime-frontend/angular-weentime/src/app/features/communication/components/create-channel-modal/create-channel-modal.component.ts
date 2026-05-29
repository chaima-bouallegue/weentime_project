import { Component, EventEmitter, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-create-channel-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-backdrop" (click)="close.emit()">
      <div class="modal-content" (click)="$event.stopPropagation()">
        <header class="modal-header">
          <h2>Créer un nouveau canal</h2>
          <button class="close-btn" (click)="close.emit()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>

        <form (ngSubmit)="onSubmit()" class="modal-body">
          <div class="form-group">
            <label for="name">Nom du canal</label>
            <input type="text" id="name" name="name" [(ngModel)]="name" 
                   placeholder="ex: projet-x-discussions" required autofocus>
            <span class="help-text">Les noms de canaux doivent être courts et descriptifs.</span>
          </div>

          <div class="form-group">
            <label for="description">Description (facultatif)</label>
            <textarea id="description" name="description" [(ngModel)]="description" 
                      placeholder="De quoi parle ce canal ?"></textarea>
          </div>

          <div class="form-group toggle">
            <div class="toggle-info">
              <label>Canal privé</label>
              <span>Seules les personnes invitées peuvent voir ce canal.</span>
            </div>
            <label class="switch">
              <input type="checkbox" name="isPrivate" [(ngModel)]="isPrivate">
              <span class="slider"></span>
            </label>
          </div>

          <footer class="modal-footer">
            <button type="button" class="btn-secondary" (click)="close.emit()">Annuler</button>
            <button type="submit" class="btn-primary" [disabled]="!name.trim() || loading()">
              {{ loading() ? 'Création...' : 'Créer le canal' }}
            </button>
          </footer>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
      animation: fadeIn 0.2s ease;
    }

    .modal-content {
      background: white;
      width: 100%;
      max-width: 500px;
      border-radius: 24px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      overflow: hidden;
      animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideUp { from { opacity: 0; transform: translateY(20px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }

    .modal-header {
      padding: 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #f1f5f9;
    }

    .modal-header h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 800;
      color: #1e1b4b;
    }

    .close-btn {
      background: none;
      border: none;
      color: #64748b;
      cursor: pointer;
      padding: 4px;
      border-radius: 8px;
      transition: all 0.2s;
    }

    .close-btn:hover { background: #FFFFFF; color: #1e1b4b; }
    .close-btn svg { width: 20px; height: 20px; }

    .modal-body { padding: 24px; display: flex; flex-direction: column; gap: 20px; }

    .form-group { display: flex; flex-direction: column; gap: 8px; }
    .form-group label { font-size: 14px; font-weight: 700; color: #1e1b4b; }
    
    input[type="text"], textarea {
      padding: 12px 16px;
      border-radius: 12px;
      border: 1.5px solid var(--border);
      font-size: 15px;
      font-family: inherit;
      transition: all 0.2s;
    }

    input[type="text"]:focus, textarea:focus {
      outline: none;
      border-color: #534AB7;
      box-shadow: 0 0 0 4px rgba(83, 74, 183, 0.1);
    }

    textarea { min-height: 100px; resize: vertical; }

    .help-text { font-size: 12px; color: #64748b; }

    .form-group.toggle {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      padding: 16px;
      background: #FFFFFF;
      border-radius: 16px;
    }

    .toggle-info { display: flex; flex-direction: column; gap: 2px; }
    .toggle-info span { font-size: 12px; color: #64748b; }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 12px;
    }

    .btn-primary, .btn-secondary {
      padding: 12px 24px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-primary {
      background: #534AB7;
      color: white;
      border: none;
      box-shadow: 0 4px 12px rgba(83, 74, 183, 0.2);
    }

    .btn-primary:hover:not(:disabled) { background: #4338ca; transform: translateY(-1px); }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

    .btn-secondary {
      background: white;
      color: #64748b;
      border: 1px solid var(--border);
    }

    .btn-secondary:hover { background: #FFFFFF; color: #1e1b4b; }

    /* Switch styling */
    .switch {
      position: relative;
      display: inline-block;
      width: 44px;
      height: 24px;
    }

    .switch input { opacity: 0; width: 0; height: 0; }

    .slider {
      position: absolute;
      cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background-color: #cbd5e1;
      transition: .4s;
      border-radius: 24px;
    }

    .slider:before {
      position: absolute;
      content: "";
      height: 18px;
      width: 18px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: .4s;
      border-radius: 50%;
    }

    input:checked + .slider { background-color: #534AB7; }
    input:checked + .slider:before { transform: translateX(20px); }
  `]
})
export class CreateChannelModalComponent {
  @Output() close = new EventEmitter<void>();
  @Output() create = new EventEmitter<{ name: string; description: string; isPrivate: boolean }>();

  name = '';
  description = '';
  isPrivate = false;
  loading = signal(false);

  onSubmit(): void {
    if (!this.name.trim()) return;
    this.loading.set(true);
    this.create.emit({
      name: this.name.trim(),
      description: this.description.trim(),
      isPrivate: this.isPrivate
    });
  }
}
