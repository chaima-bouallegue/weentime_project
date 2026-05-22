import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { RecrutementService, JobPosting } from '../../services/recrutement.service';
import { LucideAngularModule } from 'lucide-angular';
import {
  Briefcase, Plus, Search, Filter, MoreVertical, ExternalLink,
  MapPin, Calendar, Users, Clock, TrendingUp, Eye, Loader2, FileText, Archive, CheckCircle
} from 'lucide-angular';

@Component({
  selector: 'app-job-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LucideAngularModule],
  templateUrl: './job-list.component.html',
  styleUrls: ['./job-list.component.scss']
})
export class JobListComponent implements OnInit {
  private readonly recruitmentService = inject(RecrutementService);

  jobs = signal<JobPosting[]>([]);
  isLoading = signal(true);
  hasError = signal(false);
  searchQuery = signal('');
  statusFilter = signal<string>('ALL');

  // Icons
  protected readonly Plus = Plus;
  protected readonly Filter = Filter;
  protected readonly Briefcase = Briefcase;
  protected readonly Search = Search;
  protected readonly MoreVertical = MoreVertical;
  protected readonly ExternalLink = ExternalLink;
  protected readonly MapPin = MapPin;
  protected readonly Calendar = Calendar;
  protected readonly Users = Users;
  protected readonly Clock = Clock;
  protected readonly TrendingUp = TrendingUp;
  protected readonly Eye = Eye;
  protected readonly Loader2 = Loader2;
  protected readonly FileText = FileText;
  protected readonly Archive = Archive;
  protected readonly CheckCircle = CheckCircle;

  // Stats
  readonly stats = computed(() => {
    const allJobs = this.jobs();
    return {
      total: allJobs.length,
      published: allJobs.filter(j => j.status === 'PUBLISHED').length,
      draft: allJobs.filter(j => j.status === 'DRAFT').length,
      closed: allJobs.filter(j => j.status === 'CLOSED').length
    };
  });

  // Filtered jobs
  readonly filteredJobs = computed(() => {
    let result = this.jobs();
    const q = this.searchQuery().toLowerCase();
    const status = this.statusFilter();

    if (q) {
      result = result.filter(j =>
        j.title.toLowerCase().includes(q) ||
        j.department?.toLowerCase().includes(q) ||
        j.location?.toLowerCase().includes(q)
      );
    }

    if (status !== 'ALL') {
      result = result.filter(j => j.status === status);
    }

    return result;
  });

  ngOnInit() {
    this.loadJobs();
  }

  loadJobs() {
    this.isLoading.set(true);
    this.hasError.set(false);

    this.recruitmentService.getJobs().subscribe({
      next: jobs => {
        this.jobs.set(Array.isArray(jobs) ? jobs : []);
        this.isLoading.set(false);
      },
      error: () => {
        this.jobs.set([]);
        this.isLoading.set(false);
        this.hasError.set(true);
      }
    });
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'PUBLISHED': return 'Publiée';
      case 'DRAFT': return 'Brouillon';
      case 'CLOSED': return 'Clôturée';
      case 'ARCHIVED': return 'Archivée';
      default: return status;
    }
  }

  getWorkModeLabel(mode: string): string {
    switch (mode) {
      case 'ON_SITE': return 'Présentiel';
      case 'REMOTE': return 'Télétravail';
      case 'HYBRID': return 'Hybride';
      default: return mode || '';
    }
  }

  getContractLabel(type: string): string {
    switch (type) {
      case 'CDI': return 'CDI';
      case 'CDD': return 'CDD';
      case 'INTERNSHIP': return 'Stage';
      case 'FREELANCE': return 'Freelance';
      case 'APPRENTICESHIP': return 'Alternance';
      default: return type || '';
    }
  }

  formatDate(date: string): string {
    if (!date) return '';
    return new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
