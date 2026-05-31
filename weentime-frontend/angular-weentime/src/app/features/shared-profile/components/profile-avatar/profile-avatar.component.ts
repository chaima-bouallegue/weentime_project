import { Component, inject, input, output, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { ProfileService, UserProfile } from '../../profile.service';
import { ToastService } from '../../../../core/services/toast.service';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-profile-avatar',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="avatar-wrapper">
      <div class="avatar-circle" (click)="fileInput.click()">
        @if (previewUrl() || profile()?.photo) {
          <img [src]="previewUrl() || profile()?.photo" alt="Avatar" class="avatar-img" />
        } @else {
          <span class="avatar-initials" [style.background]="avatarColor()">{{ initials() }}</span>
        }
        <div class="avatar-overlay">
          <lucide-icon name="camera" size="20"></lucide-icon>
          <span>Changer</span>
        </div>
      </div>
      <input
        #fileInput
        type="file"
        accept="image/jpeg,image/png,image/webp"
        class="hidden"
        (change)="onFileSelected($event)" />
      @if (uploading()) {
        <div class="upload-indicator">
          <lucide-icon name="loader-2" size="14" class="animate-spin"></lucide-icon>
          Upload…
        </div>
      }
    </div>
  `,
  styles: [`
    .avatar-wrapper { display: flex; flex-direction: column; align-items: center; gap: 8px; }

    .avatar-circle {
      width: 96px; height: 96px; border-radius: 50%;
      position: relative; cursor: pointer; overflow: hidden;
      border: 3px solid var(--border); transition: border-color 0.2s;
    }
    .avatar-circle:hover { border-color: #6366f1; }
    :host-context(.dark) .avatar-circle { border-color: #334155; }
    :host-context(.dark) .avatar-circle:hover { border-color: #818cf8; }

    .avatar-img { width: 100%; height: 100%; object-fit: cover; }

    .avatar-initials {
      display: flex; align-items: center; justify-content: center;
      width: 100%; height: 100%; color: white;
      font-size: 28px; font-weight: 800;
    }

    .avatar-overlay {
      position: absolute; inset: 0;
      background: rgba(0,0,0,0.5);
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 2px; color: white; font-size: 11px; font-weight: 700;
      opacity: 0; transition: opacity 0.2s;
    }
    .avatar-circle:hover .avatar-overlay { opacity: 1; }

    .hidden { display: none; }

    .upload-indicator {
      display: flex; align-items: center; gap: 6px;
      font-size: 12px; font-weight: 600; color: #6366f1;
    }

    .animate-spin { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `]
})
export class ProfileAvatarComponent {
  profile = input.required<UserProfile | null>();
  avatarChanged = output<string>();

  private profileService = inject(ProfileService);
  private toastService = inject(ToastService);
  private authService = inject(AuthService);

  uploading = signal(false);
  previewUrl = signal<string | null>(null);

  initials = computed(() => {
    const p = this.profile();
    if (!p) return '?';
    return ((p.prenom?.[0] ?? '') + (p.nom?.[0] ?? '')).toUpperCase() || '?';
  });

  avatarColor = computed(() => {
    const colors = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6'];
    const p = this.profile();
    const name = p ? `${p.prenom}${p.nom}` : '';
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  });

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // 1. Validation de la taille (5MB)
    if (file.size > 5 * 1024 * 1024) {
      this.toastService.error('La photo ne doit pas dépasser 5 Mo.');
      input.value = '';
      return;
    }

    // 2. Validation du format
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      this.toastService.error('Formats acceptés : JPG, PNG, WebP uniquement.');
      input.value = '';
      return;
    }

    this.uploading.set(true);

    // 3. Compression via Canvas
    this.compressImage(file).then(base64 => {
      this.previewUrl.set(base64);
      
      this.profileService.updateProfilePhoto(base64).subscribe({
        next: () => {
          this.uploading.set(false);
          this.avatarChanged.emit(base64);
          
          // Mise à jour temps réel du header via AuthService
          const currentUser = this.authService.currentUser();
          if (currentUser) {
            const updatedUser = { ...currentUser, photo: base64 };
            this.authService.currentUser.set(updatedUser);
            localStorage.setItem('user', JSON.stringify(updatedUser));
          }
          
          this.toastService.success('Photo de profil mise à jour.');
        },
        error: () => {
          this.uploading.set(false);
          this.previewUrl.set(null);
          this.toastService.error('Erreur lors de la mise à jour de la photo.');
        }
      });
    }).catch(() => {
      this.uploading.set(false);
      this.toastService.error('Erreur lors du traitement de l\'image.');
    });

    input.value = '';
  }

  private compressImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (e: any) => {
        const img = new Image();
        img.src = e.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Redimensionnement max 800x800
          const MAX_SIZE = 800;
          if (width > height) {
            if (width > MAX_SIZE) {
              height *= MAX_SIZE / width;
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width *= MAX_SIZE / height;
              height = MAX_SIZE;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          // Qualité JPEG 80%
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
          resolve(compressedBase64);
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  }
}
