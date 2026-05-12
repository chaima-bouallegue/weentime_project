import { ChangeDetectionStrategy, Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { LucideAngularModule, Calendar, Clock, MapPin, Video, Check, X, Info, Users, History, ChevronRight, FileText } from 'lucide-angular';
import { ReunionService } from '../../../core/services/reunion.service';
import { ReunionStore } from '../../../core/services/reunion.store';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { Reunion, RSVPResponse, ReunionStatut } from '../../../core/models/reunion.model';

@Component({
  selector: 'app-reunion-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, RouterModule],
  templateUrl: './reunion-detail.component.html',
  styleUrls: ['./reunion-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReunionDetailComponent {
  private route = inject(ActivatedRoute);
  private reunionService = inject(ReunionService);
  private store = inject(ReunionStore);
  private authService = inject(AuthService);
  private toast = inject(ToastService);

  // Icons
  readonly iconCalendar = Calendar; readonly iconClock = Clock;
  readonly iconMapPin = MapPin; readonly iconVideo = Video;
  readonly iconCheck = Check; readonly iconX = X;
  readonly iconInfo = Info; readonly iconUsers = Users;
  readonly iconHistory = History; readonly iconChevronRight = ChevronRight;
  readonly iconCloturer = FileText;
  readonly RSVP = RSVPResponse;

  readonly reunion = signal<Reunion | null>(null);
  readonly isLoading = signal(false);
  readonly showCloturerForm = signal(false);
  
  // Cloturer Form
  readonly selectedPresents = signal<number[]>([]);
  compteRendu = '';

  readonly rsvpStats = computed(() => {
    const r = this.reunion();
    if (!r) return { confirmed: 0, declined: 0, pending: 0 };
    return {
      confirmed: r.participants.filter(p => p.reponse === RSVPResponse.CONFIRME).length,
      declined: r.participants.filter(p => p.reponse === RSVPResponse.DECLINE).length,
      pending: r.participants.filter(p => p.reponse === RSVPResponse.EN_ATTENTE).length,
    };
  });

  readonly myRsvp = computed(() => {
    const user = this.authService.currentUser();
    const r = this.reunion();
    if (!user || !r) return null;
    return r.participants.find(p => p.utilisateurId === user.id)?.reponse || null;
  });

  constructor() {
    this.route.data.subscribe(data => {
      if (data['reunion']) {
        this.reunion.set(data['reunion']);
        // Init presents with confirmed ones as suggestion
        this.selectedPresents.set(
          data['reunion'].participants
            .filter((p: any) => p.reponse === RSVPResponse.CONFIRME)
            .map((p: any) => p.utilisateurId)
        );
      }
    });
  }

  isOrganisateur(): boolean {
    const user = this.authService.currentUser();
    const r = this.reunion();
    return user?.id === r?.organisateurId;
  }

  respond(reponse: RSVPResponse) {
    const r = this.reunion();
    if (!r) return;
    this.reunionService.repondre(r.uuid, reponse).subscribe({
      next: () => {
        this.toast.success('Réponse enregistrée');
        this.refresh();
      }
    });
  }

  togglePresence(uid: number) {
    const idx = this.selectedPresents().indexOf(uid);
    if (idx >= 0) {
      this.selectedPresents.update(list => list.filter(id => id !== uid));
    } else {
      this.selectedPresents.update(list => [...list, uid]);
    }
  }

  cloturer() {
    const r = this.reunion();
    if (!r) return;
    this.reunionService.cloturer(r.uuid, this.selectedPresents(), this.compteRendu).subscribe({
      next: () => {
        this.toast.success('Réunion clôturée');
        this.showCloturerForm.set(false);
        this.refresh();
      }
    });
  }

  annuler() {
    const r = this.reunion();
    if (!r) return;
    if (confirm('Êtes-vous sûr de vouloir annuler cette réunion ?')) {
      this.reunionService.annuler(r.uuid).subscribe({
        next: () => {
          this.toast.success('Réunion annulée');
          this.refresh();
        }
      });
    }
  }

  private refresh() {
    const r = this.reunion();
    if (!r) return;
    this.store.invalidateDetail(r.uuid);
    this.reunionService.getDetail(r.uuid).subscribe(data => this.reunion.set(data));
  }
}
