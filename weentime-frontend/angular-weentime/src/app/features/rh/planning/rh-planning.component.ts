import { Component, ChangeDetectionStrategy, inject, signal, effect, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { RhPlanningService, PlanningResponseDTO, EmployeeStatusDTO } from './rh-planning.service';
import { PlanningStore } from '../../../core/services/planning.store';
import { OrganisationService, SimpleTeam } from '../../../core/services/organisation.service';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/services/auth.service';
import { forkJoin, finalize } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-rh-planning',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="planning-page fade-in">
      <!-- Premium Header Section -->
      <header class="planning-header">
        <div class="header-main">
          <div class="brand-context">
            <span class="context-tag">WeenTime Ecosystem</span>
            <div class="live-pulse">
              <div class="pulse-ring"></div>
              <span class="pulse-text">Live Operations</span>
            </div>
          </div>
          <h1 class="premium-title">Calendrier Global RH</h1>
          <p class="premium-subtitle">Gestion prédictive des effectifs et pilotage de la présence opérationnelle.</p>
        </div>

        <div class="header-actions">
          <div class="action-pill-group">
            <div class="pill-item filter">
              <lucide-icon name="filter" size="16"></lucide-icon>
              <select [(ngModel)]="selectedTeam" (change)="loadPlanning()" class="pill-select">
                <option [ngValue]="null">Toutes les équipes</option>
                @for (team of teams(); track team.id) {
                  <option [value]="team.id">{{ team.nom }}</option>
                }
              </select>
            </div>
            <div class="pill-divider"></div>
            <button (click)="exportCsv()" class="pill-btn export">
              <lucide-icon name="download" size="16"></lucide-icon>
              <span>Exporter</span>
            </button>
          </div>

          <div class="view-switcher">
            <button class="switch-btn" [class.active]="viewMode() === 'calendar'" (click)="viewMode.set('calendar')">
              <lucide-icon name="layout-grid" size="18"></lucide-icon>
            </button>
            <button class="switch-btn" [class.active]="viewMode() === 'heatmap'" (click)="viewMode.set('heatmap')">
              <lucide-icon name="flame" size="18"></lucide-icon>
            </button>
          </div>
        </div>
      </header>

      <!-- Dashboard Statistics -->
      @if (monthlyStats(); as stats) {
        <section class="stats-dashboard">
          <div class="stat-card">
            <div class="stat-icon-box emerald">
              <lucide-icon name="activity" size="20"></lucide-icon>
            </div>
            <div class="stat-info">
              <span class="stat-label">Présence Moyenne</span>
              <div class="stat-value-group">
                <span class="stat-value">{{ stats.avgPresence }}%</span>
                <span class="stat-trend positive">+2.4%</span>
              </div>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon-box rose">
              <lucide-icon name="user-x" size="20"></lucide-icon>
            </div>
            <div class="stat-info">
              <span class="stat-label">Absences Cumulées</span>
              <div class="stat-value-group">
                <span class="stat-value">{{ stats.totalAbsences }} <small>jours</small></span>
              </div>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon-box amber">
              <lucide-icon name="home" size="20"></lucide-icon>
            </div>
            <div class="stat-info">
              <span class="stat-label">Télétravail Actif</span>
              <div class="stat-value-group">
                <span class="stat-value">{{ stats.totalRemote }}</span>
                <span class="stat-sub">collaborateurs</span>
              </div>
            </div>
          </div>

          <div class="stat-card" [class.critical]="stats.criticalDays > 0">
            <div class="stat-icon-box slate">
              <lucide-icon name="shield-alert" size="20"></lucide-icon>
            </div>
            <div class="stat-info">
              <span class="stat-label">Alerte Disponibilité</span>
              <div class="stat-value-group">
                <span class="stat-value">{{ stats.criticalDays }}</span>
                <span class="stat-sub">points critiques</span>
              </div>
            </div>
          </div>
        </section>
      }

      <!-- Interactive Calendar Controls -->
      <div class="calendar-toolbar">
        <div class="search-premium">
          <lucide-icon name="search" size="18" class="search-icon"></lucide-icon>
          <input type="text" placeholder="Rechercher un collaborateur..." 
                 [value]="searchTerm()" (input)="onSearch($event)" class="search-input">
        </div>

        <div class="calendar-navigation">
          <button (click)="previousMonth()" class="nav-arrow"><lucide-icon name="chevron-left" size="20"></lucide-icon></button>
          <div class="month-display">
            <span class="month-name">{{ currentMonthName() }}</span>
            <span class="year-name">{{ currentYear() }}</span>
          </div>
          <button (click)="nextMonth()" class="nav-arrow"><lucide-icon name="chevron-right" size="20"></lucide-icon></button>
        </div>

        <button (click)="goToToday()" class="btn-today">Aujourd'hui</button>
      </div>

      <!-- Calendar Main Engine -->
      <main class="calendar-engine" [class.loading]="isLoading()">
        @if (isLoading()) {
          <div class="loader-overlay">
            <div class="premium-spinner"></div>
            <span>Synchronisation du planning...</span>
          </div>
        }

        <div class="calendar-grid-header">
          @for (day of ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']; track day) {
            <div class="weekday-label">{{ day }}</div>
          }
        </div>

        <div class="calendar-grid">
          @for (p of paddingDays(); track $index) {
            <div class="day-cell-padding"></div>
          }

          @for (day of processedDays(); track day.date) {
            <div class="day-cell-premium"
                 [class.is-today]="isToday(day.date)"
                 [class.is-holiday]="day.isHoliday"
                 [class.is-rest]="day.isRestDay"
                 (click)="openDayEmployees(day)">
              
              <div class="cell-header">
                <span class="day-number">{{ getDateNum(day.date) }}</span>
                @if (day.isHoliday) {
                  <div class="holiday-tag" [title]="day.holidayName">
                    <lucide-icon name="award" size="10"></lucide-icon>
                    <span>Férié</span>
                  </div>
                }
              </div>

              <div class="cell-body">
                @if (viewMode() === 'calendar') {
                  <div class="avatar-constellation">
                    @for (emp of day.employees | slice:0:5; track emp.id) {
                      <div class="avatar-orbit" 
                           [class.dimmed]="searchTerm() && !emp.isMatch"
                           [title]="emp.prenom + ' ' + emp.name"
                           (click)="$event.stopPropagation(); openDrawer(emp, day.date)">
                        @if (emp.photoUrl) {
                          <img [src]="emp.photoUrl" class="avatar-img" />
                        } @else {
                          <div class="avatar-placeholder">{{ getInitials(emp.prenom, emp.name) }}</div>
                        }
                        <span class="status-pip" [style.background]="getStatusColor(emp.status)"></span>
                      </div>
                    }
                    @if (day.employees.length > 5) {
                      <div class="avatar-more">+{{ day.employees.length - 5 }}</div>
                    }
                  </div>
                } @else {
                  <div class="heatmap-visual" [style.background]="getHeatmapColor(day.presenceRate)">
                    <span class="heat-percent">{{ (day.presenceRate * 100).toFixed(0) }}%</span>
                  </div>
                }
              </div>

              <div class="cell-footer">
                <div class="capacity-track">
                  <div class="capacity-fill" 
                       [style.width]="(day.presenceRate * 100) + '%'"
                       [style.background]="getHeatmapColorSolid(day.presenceRate)"></div>
                </div>
                <span class="capacity-text">{{ day.presenceText }}</span>
              </div>
            </div>
          }
        </div>
      </main>

      <!-- Floating Legend -->
      <footer class="planning-legend">
        <div class="legend-group">
          <div class="legend-item" (click)="toggleFilter('PRESENT')" [class.active]="filterStatus() === 'PRESENT'">
            <span class="dot emerald"></span> Présent
          </div>
          <div class="legend-item" (click)="toggleFilter('REMOTE')" [class.active]="filterStatus() === 'REMOTE'">
            <span class="dot amber"></span> Télétravail
          </div>
          <div class="legend-item" (click)="toggleFilter('LEAVE')" [class.active]="filterStatus() === 'LEAVE'">
            <span class="dot blue"></span> Congé
          </div>
          <div class="legend-item" (click)="toggleFilter('ABSENCE')" [class.active]="filterStatus() === 'ABSENCE'">
            <span class="dot rose"></span> Absence
          </div>
        </div>
      </footer>

      <!-- Side Drawer -->
      @if (drawerOpen()) {
        <div class="drawer-backdrop" (click)="closeDrawer()"></div>
        <aside class="premium-drawer slide-in">
          <div class="drawer-header">
            <div class="header-info">
              <h2>{{ selectedEmployee() ? 'Détails Collaborateur' : 'Récapitulatif du Jour' }}</h2>
              <p>{{ formatDate(selectedDate()) }}</p>
            </div>
            <button (click)="closeDrawer()" class="btn-close"><lucide-icon name="x" size="20"></lucide-icon></button>
          </div>

          <div class="drawer-content custom-scrollbar">
            @if (selectedEmployee(); as emp) {
              <div class="employee-profile-box">
                <div class="profile-avatar-large">
                  <img *ngIf="emp.photoUrl" [src]="emp.photoUrl" />
                  <div *ngIf="!emp.photoUrl" class="initials">{{ getInitials(emp.prenom, emp.name) }}</div>
                  <div class="status-badge" [style.background]="getStatusColor(emp.status)">
                    <lucide-icon [name]="getStatusIcon(emp.status)" size="14"></lucide-icon>
                  </div>
                </div>
                <h3>{{ emp.prenom }} {{ emp.name }}</h3>
                <p class="role">{{ emp.poste }}</p>
                <div class="team-tag">{{ emp.teamName }}</div>
              </div>

              <div class="details-grid">
                <div class="detail-tile">
                  <span class="tile-label">Statut</span>
                  <span class="tile-value">{{ getStatusLabel(emp.status) }}</span>
                </div>
                <div class="detail-tile">
                  <span class="tile-label">Type d'activité</span>
                  <span class="tile-value">{{ emp.detail || 'Standard' }}</span>
                </div>
              </div>
            } @else if (selectedDay(); as day) {
              <div class="day-list-view">
                <div class="list-actions">
                  <h3>{{ day.employees.length }} Collaborateurs</h3>
                  <button (click)="toggleSelectAll()" class="btn-text-action">Tout sélectionner</button>
                </div>
                <div class="employee-list-premium">
                  @for (emp of day.employees; track emp.id) {
                    <div class="emp-row-premium" [class.selected]="selectedMemberIds().has(emp.id)" (click)="toggleMemberSelection(emp.id)">
                      <div class="emp-row-main">
                        <div class="row-avatar">
                          <img *ngIf="emp.photoUrl" [src]="emp.photoUrl" />
                          <div *ngIf="!emp.photoUrl" class="row-initials">{{ getInitials(emp.prenom, emp.name) }}</div>
                        </div>
                        <div class="row-info">
                          <span class="row-name">{{ emp.prenom }} {{ emp.name }}</span>
                          <span class="row-sub">{{ emp.poste }}</span>
                        </div>
                      </div>
                      <div class="row-status-pill" [style.background]="getHeatmapColorBg(0.9)">
                        {{ getStatusLabel(emp.status) }}
                      </div>
                    </div>
                  }
                </div>
              </div>
            }
          </div>

          @if (selectedMemberIds().size > 0) {
            <div class="drawer-footer">
              <button (click)="sendBulkNotification()" class="btn-bulk-send">
                <lucide-icon name="send" size="18"></lucide-icon>
                <span>Envoyer Notification ({{ selectedMemberIds().size }})</span>
              </button>
            </div>
          }
        </aside>
      }
    </div>
  `,
  styles: [`
    :host { --primary: #5B67F1; --primary-light: rgba(91, 103, 241, 0.1); --glass-bg: rgba(255, 255, 255, 0.8); --glass-border: rgba(229, 231, 235, 0.5); --card-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); }
    :host-context(.dark) { --glass-bg: rgba(15, 23, 42, 0.8); --glass-border: rgba(30, 41, 59, 0.5); --card-shadow: 0 10px 25px -5px rgba(0,0,0,0.3); }

    .planning-page { padding: 32px; display: flex; flex-direction: column; gap: 24px; min-height: 100vh; background: #F9FAFB; font-family: 'Inter', system-ui, sans-serif; }
    :host-context(.dark) .planning-page { background: #0B0E14; }

    /* --- Header & Navigation --- */
    .planning-header { 
      display: flex; 
      justify-content: space-between; 
      align-items: flex-start; 
      padding-bottom: 32px;
      border-bottom: 1px solid var(--glass-border);
      margin-bottom: 8px;
    }

    .header-main {
      flex: 1;
      .brand-context { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
      .context-tag { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; color: #94A3B8; }
      .live-pulse { display: flex; align-items: center; gap: 6px; background: #ECFDF5; padding: 4px 12px; border-radius: 99px; border: 1px solid #D1FAE5; }
      .pulse-ring { width: 8px; height: 8px; background: #10B981; border-radius: 50%; box-shadow: 0 0 0 rgba(16, 185, 129, 0.4); animation: pulse 2s infinite; }
      .pulse-text { font-size: 10px; font-weight: 800; color: #059669; text-transform: uppercase; }
    }
    .premium-title { font-size: 40px; font-weight: 900; letter-spacing: -0.04em; color: #0F172A; margin: 0; line-height: 1; }
    .premium-subtitle { font-size: 16px; color: #64748B; margin-top: 12px; max-width: 600px; line-height: 1.5; }

    .header-actions { display: flex; align-items: center; gap: 16px; }
    .action-pill-group { display: flex; align-items: center; background: white; border: 1px solid #E2E8F0; padding: 6px; border-radius: 16px; box-shadow: var(--card-shadow); }
    .pill-item { display: flex; align-items: center; gap: 10px; padding: 0 16px; border-right: 1px solid #F1F5F9; &:last-child { border-right: none; } }
    .pill-select { background: transparent; border: none; font-size: 14px; font-weight: 700; color: #1E293B; outline: none; cursor: pointer; }
    .pill-btn { display: flex; align-items: center; gap: 8px; background: transparent; border: none; padding: 10px 20px; font-size: 14px; font-weight: 700; color: var(--primary); cursor: pointer; border-radius: 12px; transition: 0.2s; &:hover { background: var(--primary-light); } }

    .view-switcher { display: flex; background: #F1F5F9; padding: 4px; border-radius: 12px; border: 1px solid #E2E8F0; }
    .switch-btn { padding: 8px; border: none; background: transparent; border-radius: 8px; color: #94A3B8; cursor: pointer; transition: 0.2s; &.active { background: white; color: var(--primary); box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #E2E8F0; } }

    /* --- Stats Section --- */
    .stats-dashboard { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-top: 8px; }
    .stat-card { display: flex; align-items: flex-start; gap: 20px; padding: 24px; background: white; border: 1px solid #E2E8F0; border-radius: 24px; transition: 0.3s; box-shadow: var(--card-shadow); &:hover { border-color: var(--primary); transform: translateY(-4px); box-shadow: 0 20px 40px -10px rgba(0,0,0,0.05); } }
    .stat-icon-box { width: 52px; height: 52px; border-radius: 16px; display: flex; align-items: center; justify-content: center; &.emerald { background: #ECFDF5; color: #10B981; } &.rose { background: #FFF1F2; color: #F43F5E; } &.amber { background: #FFFBEB; color: #F59E0B; } &.slate { background: #F8FAFC; color: #64748B; } lucide-icon { width: 24px; height: 24px; } }
    .stat-info { display: flex; flex-direction: column; gap: 4px; }
    .stat-label { font-size: 12px; font-weight: 700; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.05em; }
    .stat-value-group { display: flex; align-items: baseline; gap: 8px; }
    .stat-value { font-size: 28px; font-weight: 900; color: #0F172A; line-height: 1; }
    .stat-trend { font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 6px; &.positive { background: #ECFDF5; color: #10B981; } }

    /* --- Toolbar --- */
    .calendar-toolbar { display: flex; align-items: center; justify-content: space-between; background: white; padding: 16px 28px; border-radius: 24px; border: 1px solid #E2E8F0; box-shadow: var(--card-shadow); margin-top: 8px; }
    .search-premium { display: flex; align-items: center; gap: 10px; background: #F8FAFC; padding: 8px 16px; border-radius: 12px; width: 280px; transition: 0.3s; border: 1px solid transparent; &:focus-within { border-color: var(--primary); background: white; box-shadow: 0 0 0 3px var(--primary-light); } }
    .search-input { background: transparent; border: none; font-size: 13px; font-weight: 600; outline: none; width: 100%; }
    .calendar-navigation { display: flex; align-items: center; gap: 16px; }
    .month-display { text-align: center; min-width: 140px; .month-name { font-size: 18px; font-weight: 900; color: #0F172A; text-transform: capitalize; } .year-name { font-size: 12px; font-weight: 700; color: #94A3B8; margin-left: 4px; } }
    .nav-arrow { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; color: #64748B; cursor: pointer; transition: 0.2s; &:hover { background: white; color: var(--primary); border-color: var(--primary); } }
    .btn-today { background: #F1F5F9; color: #475569; border: 1px solid #E2E8F0; padding: 8px 18px; border-radius: 10px; font-size: 13px; font-weight: 700; cursor: pointer; transition: 0.2s; &:hover { background: white; border-color: var(--primary); color: var(--primary); } }

    /* --- Grid --- */
    .calendar-grid-header { display: grid; grid-template-columns: repeat(7, 1fr); gap: 12px; margin: 8px 0; }
    .weekday-label { text-align: center; font-size: 11px; font-weight: 900; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.1em; }
    .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 12px; }
    .day-cell-padding { height: 160px; background: rgba(0,0,0,0.02); border-radius: 16px; }
    .day-cell-premium { position: relative; height: 160px; background: white; border-radius: 20px; border: 1px solid #E2E8F0; padding: 16px; display: flex; flex-direction: column; transition: 0.3s; cursor: pointer; &:hover { transform: translateY(-4px); box-shadow: 0 15px 30px -10px rgba(0,0,0,0.08); border-color: var(--primary); z-index: 10; } }
    .day-cell-premium.is-today { border: 2px solid var(--primary); box-shadow: 0 0 0 4px var(--primary-light); .day-number { color: var(--primary); } }
    .day-cell-premium.is-holiday { background: #FFF1F2; border-color: #FECDD3; .day-number { color: #F43F5E; } }

    .cell-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
    .day-number { font-size: 18px; font-weight: 900; color: #334155; }

    .avatar-constellation { display: grid; grid-template-columns: repeat(auto-fill, minmax(28px, 1fr)); gap: 6px; overflow: hidden; max-height: 70px; }
    .avatar-orbit { width: 28px; height: 28px; border-radius: 8px; border: 1.5px solid white; position: relative; overflow: hidden; background: #F1F5F9; }
    .avatar-placeholder { font-size: 9px; font-weight: 800; display: flex; align-items: center; justify-content: center; height: 100%; color: #64748B; }
    .avatar-img { width: 100%; height: 100%; object-fit: cover; }
    .status-pip { position: absolute; bottom: 0; right: 0; width: 7px; height: 7px; border: 1px solid white; border-radius: 50%; }
    .avatar-more { width: 28px; height: 28px; border-radius: 8px; background: #F8FAFC; border: 1px dashed #E2E8F0; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 800; color: #94A3B8; }

    .heatmap-visual { flex: 1; border-radius: 12px; display: flex; align-items: center; justify-content: center; .heat-percent { font-size: 14px; font-weight: 900; color: #1E293B; } }

    .cell-footer { margin-top: auto; padding-top: 8px; border-top: 1px solid #F1F5F9; display: flex; align-items: center; gap: 8px; }
    .capacity-track { flex: 1; height: 3px; background: #F1F5F9; border-radius: 2px; overflow: hidden; }
    .capacity-fill { height: 100%; transition: 1s ease-out; }
    .capacity-text { font-size: 9px; font-weight: 800; color: #94A3B8; white-space: nowrap; }

    .planning-legend { display: flex; justify-content: center; margin-top: 24px; }
    .legend-group { display: flex; gap: 24px; padding: 12px 32px; background: white; border-radius: 16px; border: 1px solid #E2E8F0; box-shadow: var(--card-shadow); }
    .legend-item { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: #64748B; cursor: pointer; transition: 0.2s; &.active { color: var(--primary); } &:hover { color: var(--primary); } }
    .dot { width: 10px; height: 10px; border-radius: 50%; }
    .dot.emerald { background: #10B981; }
    .dot.amber { background: #F59E0B; }
    .dot.blue { background: #3B82F6; }
    .dot.rose { background: #F43F5E; }

    :host-context(.dark) {
      .action-pill-group, .stat-card, .calendar-toolbar, .day-cell-premium, .planning-legend, .legend-group { background: #1E293B; border-color: #334155; }
      .premium-title { color: white; }
      .stat-value, .month-display .month-name, .day-number { color: #F1F5F9; }
      .pill-select, .search-input { color: #F1F5F9; }
      .search-premium, .nav-arrow, .btn-today { background: #334155; border-color: #475569; color: #94A3B8; }
      .day-cell-padding { background: rgba(255,255,255,0.03); }
      .cell-footer { border-color: #334155; }
      .capacity-track { background: #334155; }
      .avatar-orbit { border-color: #1E293B; background: #334155; }
    }

    /* --- Animations --- */
    @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); } 70% { box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); } 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); } }
    .fade-in { animation: fadeIn 0.6s ease-out forwards; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

    .loader-overlay { position: absolute; inset: 0; background: rgba(255, 255, 255, 0.6); backdrop-filter: blur(8px); z-index: 50; border-radius: 40px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; span { font-weight: 800; color: #475569; } }
    .premium-spinner { width: 40px; height: 40px; border: 4px solid var(--primary-light); border-top-color: var(--primary); border-radius: 50%; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* --- Modal System --- */
    .drawer-backdrop { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(8px); z-index: 100; animation: fadeIn 0.3s ease; }
    .premium-drawer { 
      position: fixed; 
      top: 50%; 
      left: 50%; 
      transform: translate(-50%, -50%); 
      width: 440px; 
      max-height: 85vh; 
      background: white; 
      z-index: 101; 
      border-radius: 32px; 
      box-shadow: 0 30px 60px -12px rgba(0,0,0,0.25); 
      display: flex; 
      flex-direction: column; 
      animation: modalPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); 
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.1);
    }

    @keyframes modalPop { 
      from { transform: translate(-50%, -45%) scale(0.95); opacity: 0; } 
      to { transform: translate(-50%, -50%) scale(1); opacity: 1; } 
    }

    .drawer-header { padding: 24px 32px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #F3F4F6; background: #F8FAFC; h2 { font-size: 20px; font-weight: 900; margin: 0; color: #0F172A; } p { font-size: 13px; color: #64748B; margin: 2px 0 0; } }
    .btn-close { background: #F8FAFC; border: 1px solid #E2E8F0; padding: 8px; border-radius: 10px; cursor: pointer; color: #64748B; &:hover { background: white; color: #F43F5E; border-color: #FECDD3; } }
    .drawer-content { flex: 1; overflow-y: auto; padding: 24px; }

    .employee-profile-box { text-align: center; margin-bottom: 24px; }
    .profile-avatar-large { position: relative; width: 90px; height: 90px; margin: 0 auto 12px; border-radius: 32px; overflow: hidden; border: 3px solid white; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); .initials { width: 100%; height: 100%; background: #F1F5F9; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 900; } img { width: 100%; height: 100%; object-fit: cover; } }
    .status-badge { position: absolute; bottom: 6px; right: 6px; width: 24px; height: 24px; border-radius: 8px; border: 2.5px solid white; display: flex; align-items: center; justify-content: center; color: white; }
    .employee-profile-box h3 { font-size: 18px; font-weight: 900; margin: 0; color: #0F172A; }
    .employee-profile-box .role { font-size: 14px; color: #64748B; font-weight: 600; margin: 2px 0 0; }
    .team-tag { display: inline-block; margin-top: 10px; padding: 3px 12px; background: #F1F5F9; border-radius: 99px; font-size: 10px; font-weight: 800; text-transform: uppercase; color: #475569; }

    .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .detail-tile { padding: 16px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 16px; .tile-label { display: block; font-size: 9px; font-weight: 800; text-transform: uppercase; color: #94A3B8; margin-bottom: 2px; } .tile-value { font-size: 14px; font-weight: 800; color: #1E293B; } }

    .day-list-view { .list-actions { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; h3 { font-size: 16px; font-weight: 900; margin: 0; } } }
    .btn-text-action { background: transparent; border: none; color: var(--primary); font-size: 11px; font-weight: 800; cursor: pointer; text-transform: uppercase; &:hover { text-decoration: underline; } }
    .emp-row-premium { display: flex; align-items: center; gap: 12px; padding: 10px; border-radius: 12px; transition: 0.2s; cursor: pointer; border: 1px solid transparent; &:hover { background: #F8FAFC; } &.selected { background: var(--primary-light); border-color: var(--primary); } }
    .row-avatar { width: 36px; height: 36px; border-radius: 10px; overflow: hidden; .row-initials { width: 100%; height: 100%; background: #F1F5F9; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 900; } img { width: 100%; height: 100%; object-fit: cover; } }
    .row-info { flex: 1; .row-name { display: block; font-size: 13px; font-weight: 800; color: #1E293B; } .row-sub { font-size: 10px; color: #64748B; font-weight: 600; } }
    .row-status-pill { padding: 3px 10px; border-radius: 99px; font-size: 9px; font-weight: 800; color: #1E293B; }

    .drawer-footer { padding: 20px 24px; border-top: 1px solid #F3F4F6; }
    .btn-bulk-send { width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; background: var(--primary); color: white; border: none; padding: 12px; border-radius: 12px; font-size: 14px; font-weight: 800; cursor: pointer; transition: 0.2s; &:hover { transform: translateY(-2px); box-shadow: 0 8px 20px -5px rgba(91, 103, 241, 0.4); } }

    .custom-scrollbar::-webkit-scrollbar { width: 6px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 10px; }

    :host-context(.dark) {
      .planning-header .premium-title { color: white; }
      .planning-header .premium-subtitle { color: #94A3B8; }
      .action-pill-group .pill-select { color: #E2E8F0; }
      .pill-item { color: #94A3B8; }
      .stat-card .stat-value { color: white; }
      .search-input { color: white; }
      .month-display .month-name { color: white; }
      .day-cell-premium { border-color: rgba(30, 41, 59, 0.5); }
      .day-number { color: white; }
      .avatar-orbit { border-color: #1E293B; }
      .avatar-orbit .status-pip { border-color: #1E293B; }
      .avatar-orbit .avatar-placeholder { background: #1E293B; }
      .avatar-more { background: #1E293B; color: #94A3B8; }
      .stat-icon-box.slate { background: rgba(148, 163, 184, 0.1); color: #94A3B8; }
      .premium-drawer { background: #0F172A; border-color: #1E293B; h2 { color: white; } }
      .drawer-header { border-color: #1E293B; }
      .btn-close { background: #1E293B; color: #94A3B8; &:hover { background: #334155; } }
      .detail-tile { background: #1E293B; .tile-value { color: white; } }
      .row-avatar .row-initials { background: #1E293B; }
      .row-info .row-name { color: white; }
      .emp-row-premium:hover { background: rgba(255,255,255,0.02); }
    }
  `]
})
export class RhPlanningComponent implements OnInit {
  private planningStore = inject(PlanningStore);
  private planningService = inject(RhPlanningService);
  private organisationService = inject(OrganisationService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private http = inject(HttpClient);

  viewMode = signal<'calendar' | 'list' | 'heatmap'>('calendar');
  isLoading = this.planningStore.isLoading;
  currentDate = signal(new Date());
  teams = this.planningStore.teams;
  selectedTeam = signal<number | null>(null);
  
  calendarDays = computed(() => {
    const date = this.currentDate();
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return this.planningStore.getPlanning(monthKey, this.selectedTeam() || undefined);
  });

  paddingDays = computed(() => {
    const start = new Date(this.currentDate().getFullYear(), this.currentDate().getMonth(), 1);
    let firstDayIdx = start.getDay();
    firstDayIdx = (firstDayIdx === 0) ? 6 : firstDayIdx - 1;
    return Array(firstDayIdx).fill(0);
  });
  
  drawerOpen = signal(false);
  selectedEmployee = signal<EmployeeStatusDTO | null>(null);
  selectedDay = signal<PlanningResponseDTO | null>(null);
  selectedDate = signal<string | null>(null);
  detailLoading = signal(false);
  detailedStatus = signal<any>(null);

  searchTerm = signal('');
  filterStatus = signal<string | null>(null);
  selectedMemberIds = signal<Set<number>>(new Set());
  bulkMessage = signal('');

  holidays = signal<Record<string, string>>({
    '2026-05-01': 'Fête du Travail',
    '2026-05-08': 'Victoire 1945',
    '2026-05-14': 'Ascension',
    '2026-07-14': 'Fête Nationale',
    '2026-08-15': 'Assomption',
    '2026-11-01': 'Toussaint',
    '2026-11-11': 'Armistice',
    '2026-12-25': 'Noël'
  });

  monthlyStats = computed(() => {
    const days = this.calendarDays();
    if (days.length === 0) return null;
    const workingDays = days.filter(d => !d.isRestDay);
    if (workingDays.length === 0) return null;

    const avgPresence = workingDays.reduce((acc, d) => acc + d.presenceRate, 0) / workingDays.length;
    let totalAbsences = 0;
    let totalRemote = 0;
    let criticalDays = 0;

    workingDays.forEach(d => {
      d.employees.forEach(e => {
        if (e.status === 'ABSENCE' || e.status === 'LEAVE') totalAbsences++;
        if (e.status === 'REMOTE') totalRemote++;
      });
      if (d.presenceRate < 0.5) criticalDays++;
    });

    return {
      avgPresence: Math.round(avgPresence * 100),
      totalAbsences,
      totalRemote,
      criticalDays
    };
  });

  processedDays = computed(() => {
    const days = this.calendarDays();
    const search = this.searchTerm().toLowerCase();
    const filter = this.filterStatus();

    return days.map(day => {
      const annotatedEmployees = day.employees.map(e => ({
        ...e,
        isMatch: search ? (e.prenom + ' ' + e.name).toLowerCase().includes(search) : true,
        isVisible: filter ? e.status === filter : true
      }));

      return {
        ...day,
        employees: annotatedEmployees,
        isHoliday: !!this.holidays()[day.date],
        holidayName: this.holidays()[day.date]
      };
    });
  });

  constructor() {}

  ngOnInit() {
    this.loadPlanning();
  }

  loadPlanning() {
    const date = this.currentDate();
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    
    const start = this.formatToLocalISO(firstDay);
    const end = this.formatToLocalISO(lastDay);

    this.planningStore.loadPlanning(start, end, this.selectedTeam() || undefined)
      .subscribe();
  }

  private formatToLocalISO(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  previousMonth() {
    const d = new Date(this.currentDate());
    d.setMonth(d.getMonth() - 1);
    this.currentDate.set(d);
    this.loadPlanning();
  }

  nextMonth() {
    const d = new Date(this.currentDate());
    d.setMonth(d.getMonth() + 1);
    this.currentDate.set(d);
    this.loadPlanning();
  }

  goToToday() {
    this.currentDate.set(new Date());
    this.loadPlanning();
  }

  currentMonthName() {
    return new Intl.DateTimeFormat('fr-FR', { month: 'long' }).format(this.currentDate());
  }
  
  currentYear() { return this.currentDate().getFullYear(); }
  getDateNum(dateStr: string) { return new Date(dateStr).getDate(); }
  isToday(dateStr: string) { return dateStr === new Date().toISOString().split('T')[0]; }

  formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  getInitials(prenom?: string, nom?: string) {
    return ((prenom?.charAt(0) || '') + (nom?.charAt(0) || '')).toUpperCase() || '?';
  }

  openDrawer(emp: EmployeeStatusDTO, date: string) {
    this.selectedEmployee.set(emp);
    this.selectedDate.set(date);
    this.selectedDay.set(null);
    this.drawerOpen.set(true);
    this.fetchDetails(emp.id, date);
  }

  openDayEmployees(day: PlanningResponseDTO) {
    this.selectedDay.set(day);
    this.selectedEmployee.set(null);
    this.selectedDate.set(day.date);
    this.drawerOpen.set(true);
  }

  fetchDetails(userId: number, date: string) {
    this.detailLoading.set(true);
    this.detailedStatus.set(null);
    // On peut réutiliser un endpoint de présence ou le service planning
    this.planningService.isExcused(userId, date).pipe(
      finalize(() => this.detailLoading.set(false))
    ).subscribe({
      next: (res: string) => {
        this.detailedStatus.set({
          arrivalTime: '08:45',
          departureTime: '17:30',
          totalMinutes: 480,
          overtimeMinutes: 15,
          lastActivity: 'Pointage via Mobile'
        });
      }
    });
  }

  exportCsv() {
    const start = new Date(this.currentDate().getFullYear(), this.currentDate().getMonth(), 1).toISOString().split('T')[0];
    const end = new Date(this.currentDate().getFullYear(), this.currentDate().getMonth() + 1, 0).toISOString().split('T')[0];
    const url = `${environment.apiUrl}/presences/pointages/export?start=${start}&end=${end}`;
    window.open(url, '_blank');
    this.toast.info('Export démarré');
  }

  onSearch(event: Event) {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  toggleFilter(status: string) {
    this.filterStatus.set(this.filterStatus() === status ? null : status);
  }

  toggleMemberSelection(id: number) {
    const current = new Set(this.selectedMemberIds());
    current.has(id) ? current.delete(id) : current.add(id);
    this.selectedMemberIds.set(current);
  }

  toggleSelectAll() {
    const day = this.selectedDay();
    if (!day) return;
    this.selectedMemberIds.set(this.selectedMemberIds().size === day.employees.length ? new Set() : new Set(day.employees.map(e => e.id)));
  }

  sendBulkNotification() {
    const userIds = Array.from(this.selectedMemberIds());
    this.planningService.sendBulkNotification(userIds, 'Alerte RH', 'Merci de vérifier votre planning').subscribe({
      next: () => {
        this.toast.success('Notifications envoyées');
        this.selectedMemberIds.set(new Set());
      }
    });
  }

  getStatusIcon(status: string | undefined): any {
    switch (status) {
      case 'PRESENT': return 'check-circle';
      case 'REMOTE': return 'home';
      case 'ABSENCE': return 'alert-circle';
      case 'LEAVE': return 'calendar';
      default: return 'help-circle';
    }
  }

  getStatusLabel(status: string | undefined): string {
    switch (status) {
      case 'PRESENT': return 'Présent';
      case 'REMOTE': return 'Télétravail';
      case 'ABSENCE': return 'Absence';
      case 'LEAVE': return 'Congé';
      default: return 'Statut';
    }
  }

  formatMinutes(mins: number): string {
    return `${Math.floor(mins / 60)}h${(mins % 60).toString().padStart(2, '0')}`;
  }

  getHeatmapColor(rate: number): string {
    return `rgba(${Math.floor((1 - rate) * 255)}, ${Math.floor(rate * 255)}, 100, 0.1)`;
  }

  getHeatmapColorSolid(rate: number): string {
    if (rate < 0.4) return '#ef4444';
    if (rate < 0.8) return '#eab308';
    return '#10b981';
  }
  
  getHeatmapColorBg(rate: number): string {
    return rate < 0.4 ? 'rgba(239, 68, 68, 0.1)' : rate < 0.8 ? 'rgba(234, 179, 8, 0.1)' : 'rgba(16, 185, 129, 0.1)';
  }

  getStatusColor(status: string | undefined): string {
    switch (status) {
      case 'PRESENT': return '#10b981';
      case 'REMOTE': return '#f59e0b';
      case 'ABSENCE': return '#f43f5e';
      case 'LEAVE': return '#3b82f6';
      default: return '#94a3b8';
    }
  }

  closeDrawer() {
    this.drawerOpen.set(false);
  }
}
