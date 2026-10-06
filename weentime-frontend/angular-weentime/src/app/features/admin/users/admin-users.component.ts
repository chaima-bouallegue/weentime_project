import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { AbstractControl, FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { Subject, debounceTime, distinctUntilChanged, finalize, take } from 'rxjs';
import {
  LucideAngularModule,
  Search,
  Plus,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Briefcase,
  Edit3,
  Trash2,
  Eye,
  UserCog,
  ShieldCheck,
  Power,
  MoreVertical,
  X,
  Loader,
  Check,
  AlertCircle
} from 'lucide-angular';
import {
  AdminApiService,
  AdminDepartement,
  AdminEntreprise,
  AdminEquipe,
  AdminPage,
  AdminUser,
  AdminUserPayload
} from '../admin-api.service';
import { UserListItem, UserRole, UserService } from './user.service';
import { ToastService } from '../../../core/services/toast.service';
import { AssistantSyncService } from '../../../core/services/assistant-sync.service';
import { AdminEmptyStateComponent } from '../../../shared/components/admin-empty-state/admin-empty-state.component';
import { AdminSkeletonComponent } from '../../../shared/components/admin-skeleton/admin-skeleton.component';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    LucideAngularModule,
    AdminEmptyStateComponent,
    AdminSkeletonComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex-1 flex flex-col min-w-0 p-3 sm:p-6 gap-4 sm:gap-6 overflow-auto bg-slate-50/50 dark:bg-slate-950/20">

      <header class="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xs select-none shrink-0 flex flex-col gap-4">
        <div class="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 sm:gap-6">
          <div class="space-y-1">
            <div class="flex items-center gap-2.5 flex-wrap">
              <h1 class="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Gestion des utilisateurs</h1>
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/30">
                {{ totalElements() }} utilisateurs
              </span>
            </div>
            <p class="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 max-w-xl">
              Pilotage des comptes, rôles et rattachés managers de votre organisation.
            </p>
          </div>

          <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto justify-end flex-1 max-w-2xl">
            <div class="relative w-full sm:max-w-xs flex-1">
              <span class="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
                <lucide-angular [img]="iconSearch" size="15"></lucide-angular>
              </span>
              <input type="text"
                [value]="searchDraft()"
                (input)="onSearchInput(($any($event.target).value || '').trimStart())"
                class="w-full pl-10 pr-4 h-10 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all shadow-xs"
                placeholder="Rechercher par nom ou email...">
            </div>

            <div class="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0">
              <button type="button" (click)="onRefresh()" [disabled]="isBusy()"
                class="inline-flex items-center justify-center gap-2 h-10 px-4 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm font-semibold shadow-xs disabled:opacity-50 select-none cursor-pointer">
                <lucide-angular [img]="iconRefresh" size="15" [class.animate-spin]="isLoading()"></lucide-angular>
                <span>Actualiser</span>
              </button>

              <button type="button" (click)="openCreate()" [disabled]="isSaving() || isActionSaving()"
                class="inline-flex items-center justify-center gap-2 h-10 px-4 bg-[#4F46E5] hover:bg-[#4338CA] active:bg-[#3730A3] text-white rounded-xl transition-colors text-sm font-semibold shadow-xs select-none cursor-pointer">
                <lucide-angular [img]="iconPlus" size="15"></lucide-angular>
                <span>Créer</span>
              </button>
            </div>
          </div>
        </div>

        <hr class="border-slate-100 dark:border-slate-800 my-0.5">

        <div class="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-between gap-3 sm:gap-4">
          <div class="flex bg-slate-100/80 dark:bg-slate-800/60 p-1 rounded-xl border border-slate-200/40 justify-between sm:justify-start">
            <button (click)="onStatusFilterChange('')"
              class="flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-center"
              [class]="statusFilter() === '' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-3xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'">
              Toutes
            </button>
            <button (click)="onStatusFilterChange('ACTIVE')"
              class="flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all text-center"
              [class]="statusFilter() === 'ACTIVE' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-3xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Actifs
            </button>
            <button (click)="onStatusFilterChange('INACTIVE')"
              class="flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all text-center"
              [class]="statusFilter() === 'INACTIVE' ? 'bg-white dark:bg-slate-700 text-rose-600 dark:text-rose-400 shadow-3xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'">
              <span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
              Inactifs
            </button>
          </div>

          <div class="flex items-center gap-2 flex-wrap">
            <select [value]="roleFilter()" (change)="onRoleFilterChange($any($event.target).value)"
              class="flex-1 sm:flex-initial bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 rounded-xl px-2.5 sm:px-3 py-2 focus:outline-hidden focus:border-indigo-500 transition-colors shadow-3xs">
              <option value="">Tous les rôles</option>
              @for (role of createRoleOptions; track role) {
                <option [value]="role">{{ formatRole(role) }}</option>
              }
            </select>

            <select [value]="entrepriseFilter()" (change)="onEntrepriseFilterChange($any($event.target).value)"
              class="flex-1 sm:flex-initial bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 rounded-xl px-2.5 sm:px-3 py-2 focus:outline-hidden focus:border-indigo-500 transition-colors shadow-3xs">
              <option value="">Toutes les entreprises</option>
              @for (entreprise of entreprises(); track entreprise.id) {
                <option [value]="entreprise.id">{{ entreprise.nom }}</option>
              }
            </select>

            <select [value]="sortBy()" (change)="onSortChange($any($event.target).value)"
              class="flex-1 sm:flex-initial bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 rounded-xl px-2.5 sm:px-3 py-2 focus:outline-hidden focus:border-indigo-500 transition-colors shadow-3xs">
              <option value="name-asc">Nom (A-Z)</option>
              <option value="name-desc">Nom (Z-A)</option>
              <option value="role-asc">Rôle (A-Z)</option>
              <option value="role-desc">Rôle (Z-A)</option>
            </select>
          </div>
        </div>
      </header>

      @if (referenceWarning()) {
        <div class="flex items-center gap-2.5 p-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-sm font-medium shadow-2xs">
          <lucide-angular [img]="iconWarning" size="16" class="shrink-0"></lucide-angular>
          <span>{{ referenceWarning() }}</span>
        </div>
      }

      @if (isLoading() && users().length === 0) {
        <app-admin-skeleton [count]="6" [columns]="5"></app-admin-skeleton>
      } @else if (listError() && users().length === 0) {
        <app-admin-empty-state title="Chargement impossible" [description]="listError() || ''" icon="alert-triangle"></app-admin-empty-state>
      } @else if (filteredUsers().length === 0 && !isLoading()) {
        <app-admin-empty-state title="Aucun utilisateur trouvé" description="Aucun résultat avec les filtres actuels." icon="users"></app-admin-empty-state>
      } @else {
        <main class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs flex flex-col flex-1 overflow-hidden relative">
          @if (isLoading()) {
            <div class="absolute inset-x-0 top-0 h-0.5 bg-indigo-100 dark:bg-indigo-950 overflow-hidden z-20">
              <div class="h-full bg-indigo-600 animate-pulse w-full"></div>
            </div>
          }
          <div class="overflow-x-auto w-full flex-1">
            <table class="w-full min-w-[640px] text-left border-collapse select-none">
              <thead>
                <tr class="border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  <th class="py-3 px-3 sm:px-5">Utilisateur</th>
                  <th class="py-3 px-3 sm:px-5">Rôle</th>
                  <th class="py-3 px-3 sm:px-5">Organisation</th>
                  <th class="py-3 px-3 sm:px-5">Statut</th>
                  <th class="py-3 px-3 sm:px-5 hidden md:table-cell">Manager</th>
                  <th class="py-3 px-3 sm:px-5 text-right w-12"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 text-sm font-medium text-slate-700 dark:text-slate-300">
                @for (user of filteredUsers(); track user.id) {
                  <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors group relative">
                    <td class="py-3.5 px-3 sm:px-5">
                      <div class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-full text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-3xs"
                          [style.background]="avatarColor(user)">
                          {{ initials(user) }}
                        </div>
                        <div class="flex flex-col min-w-0">
                          <span class="font-semibold text-slate-900 dark:text-white truncate">{{ user.prenom }} {{ user.nom }}</span>
                          <span class="text-xs font-medium text-slate-400 truncate">{{ user.email }}</span>
                          @if (user.poste) {
                            <span class="text-[11px] text-slate-400 font-medium mt-0.5 truncate">{{ user.poste }}</span>
                          }
                        </div>
                      </div>
                    </td>

                    <td class="py-3.5 px-3 sm:px-5 vertical-middle">
                      <span class="inline-flex items-center px-2.5 py-0.5 rounded-md text-[10px] font-bold border tracking-wide"
                        [ngClass]="getRoleBadgeClass(primaryRole(user))">
                        {{ formatRole(primaryRole(user)) }}
                      </span>
                      <div class="text-[10px] text-slate-400 mt-0.5 font-medium">{{ user.permissions?.length || 0 }} permission(s)</div>
                    </td>

                   <td class="py-3.5 px-3 sm:px-5">
                      <div class="flex flex-col min-w-0">
                        <span class="font-semibold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1.5 truncate">
                          <lucide-angular [img]="iconBriefcase" size="11" class="text-slate-400 shrink-0"></lucide-angular>
                          {{ user.entrepriseNom || 'Non assignée' }}
                        </span>
                        <span class="text-[11px] text-slate-400 font-medium truncate mt-0.5">
                          {{ user.departementNom || 'Aucun département' }} • {{ user.equipeNom || 'Aucune équipe' }}
                        </span>
                      </div>
                    </td>

                    <td class="py-3.5 px-3 sm:px-5">
                      <button (click)="toggleStatus(user)" [disabled]="isActionSaving()"
                        class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border transition-colors cursor-pointer disabled:opacity-50"
                        [ngClass]="user.statut === 'ACTIF'
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-100/60 dark:border-emerald-900/20'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200'">
                        <span class="w-1.5 h-1.5 rounded-full" [ngClass]="user.statut === 'ACTIF' ? 'bg-emerald-500' : 'bg-slate-400'"></span>
                        {{ user.statut === 'ACTIF' ? 'Actif' : 'Inactif' }}
                      </button>
                    </td>

                    <td class="py-3.5 px-3 sm:px-5 text-xs font-semibold hidden md:table-cell">
                      @if (user.managerNom) {
                        <span class="text-slate-700 dark:text-slate-300">{{ managerName(user) }}</span>
                      } @else {
                        <span class="text-slate-400/70 font-normal italic">Aucun</span>
                      }
                    </td>

                    <td class="py-3.5 px-3 sm:px-5 text-right relative overflow-visible w-12">
                      <button class="w-8 h-8 inline-flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                        (click)="toggleMenu(user.id, $event)">
                        <lucide-angular [img]="iconMore" size="14"></lucide-angular>
                      </button>

                      @if (menuOpenId() === user.id) {
                        <div class="absolute right-5 top-11 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg py-1.5 z-50 text-left origin-top-right"
                          (click)="$event.stopPropagation()">
                          <button (click)="openDetails(user); $event.stopPropagation()" class="w-full px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2">
                            <lucide-angular [img]="iconEye" size="13"></lucide-angular> Voir détails
                          </button>
                          <button (click)="openEdit(user); $event.stopPropagation()" class="w-full px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2">
                            <lucide-angular [img]="iconEdit" size="13"></lucide-angular> Modifier
                          </button>
                          <button (click)="openAssignManager(user); $event.stopPropagation()" class="w-full px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2">
                            <lucide-angular [img]="iconUserCog" size="13"></lucide-angular> Assigner manager
                          </button>
                          <button (click)="openRoleChange(user); $event.stopPropagation()" class="w-full px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2">
                            <lucide-angular [img]="iconShieldCheck" size="13"></lucide-angular> Changer rôle
                          </button>
                          <hr class="border-slate-100 dark:border-slate-800 my-1">
                          <button (click)="remove(user); $event.stopPropagation()" class="w-full px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-2">
                            <lucide-angular [img]="iconDelete" size="13"></lucide-angular> Supprimer
                          </button>
                        </div>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <footer class="p-3 sm:p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/20 flex flex-col sm:flex-row items-center justify-between gap-3 select-none">
            <div class="flex items-center gap-3 text-xs font-medium text-slate-500 dark:text-slate-400 flex-wrap justify-center sm:justify-start">
              <span>
                Affichage de <span class="font-bold text-slate-700 dark:text-slate-300">{{ users().length }}</span> sur {{ totalElements() }} utilisateur(s)
              </span>
              <span class="hidden sm:inline text-slate-300 dark:text-slate-700">•</span>
              <div class="flex items-center gap-1.5">
                <span>Par page:</span>
                <select [value]="size()" (change)="onPageSizeChange(+$any($event.target).value)"
                  class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 rounded-lg px-2 py-0.5 focus:outline-hidden">
                  <option [value]="10">10</option>
                  <option [value]="25">25</option>
                  <option [value]="50">50</option>
                  <option [value]="100">100</option>
                </select>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <button (click)="changePage(-1)" [disabled]="page() === 0 || isBusy()"
                class="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer">
                <lucide-angular [img]="iconChevronLeft" size="14"></lucide-angular>
                <span>Précédent</span>
              </button>
              <span class="text-xs font-bold text-slate-700 dark:text-slate-300 px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                {{ page() + 1 }} / {{ totalPages() || 1 }}
              </span>
              <button (click)="changePage(1)" [disabled]="(page() + 1 >= totalPages() && totalElements() > 0) || isBusy()"
                class="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer">
                <span>Suivant</span>
                <lucide-angular [img]="iconChevronRight" size="14"></lucide-angular>
              </button>
            </div>
          </footer>
        </main>
      }

      @if (showForm()) {
        <div class="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-[2000] flex justify-end" (click)="closeForm()">
          <div class="w-full max-w-md bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col p-6 animate-slide-in" (click)="$event.stopPropagation()">
            <div class="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <span class="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">{{ editingUser() ? 'Modifier' : 'Créer' }}</span>
                <h2 class="text-lg font-bold text-slate-900 dark:text-white">{{ editingUser() ? 'Modifier le compte' : 'Nouvel utilisateur' }}</h2>
              </div>
              <button class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-400" (click)="closeForm()">
                <lucide-angular [img]="iconX" size="18"></lucide-angular>
              </button>
            </div>

            <div class="flex-1 overflow-y-auto py-4">
              <form [formGroup]="form" (ngSubmit)="save()" class="space-y-4">
                <div>
                  <label class="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Prénom <span class="text-rose-500">*</span></label>
                  <input class="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl text-sm text-slate-900 dark:text-white" formControlName="firstName" placeholder="Jean" />
                  @if (isFieldInvalid('firstName')) { <span class="text-xs text-rose-500 mt-1 block">Champ requis.</span> }
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Nom <span class="text-rose-500">*</span></label>
                  <input class="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl text-sm text-slate-900 dark:text-white" formControlName="lastName" placeholder="Dupont" />
                  @if (isFieldInvalid('lastName')) { <span class="text-xs text-rose-500 mt-1 block">Champ requis.</span> }
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Email <span class="text-rose-500">*</span></label>
                  <input class="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl text-sm text-slate-900 dark:text-white" formControlName="email" type="email" />
                  @if (isFieldInvalid('email')) { <span class="text-xs text-rose-500 mt-1 block">Requis / Format valide.</span> }
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Mot de passe {{ editingUser() ? '(optionnel)' : '*' }}</label>
                  <input class="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl text-sm text-slate-900 dark:text-white" formControlName="password" type="password" [placeholder]="editingUser() ? 'Laisser vide pour ne pas changer' : 'Mot de passe'" />
                </div>

                <hr class="border-slate-100 dark:border-slate-800">

                <div>
                  <label class="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Entreprise <span class="text-rose-500">*</span></label>
                  <select class="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white" formControlName="companyId">
                    <option [ngValue]="null">Choisir</option>
                    @for (company of companyOptions(); track company.id) {
                      <option [ngValue]="company.id">{{ company.name }}</option>
                    }
                  </select>
                </div>

                <div class="pt-4 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                  <button type="button" class="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800" (click)="closeForm()">Annuler</button>
                  <button type="submit" class="px-4 py-2 bg-[#4F46E5] hover:bg-[#4338CA] text-white rounded-xl text-sm font-semibold flex items-center gap-2" [disabled]="form.invalid || isSaving()">
                    @if (isSaving()) { <lucide-angular [img]="iconLoader" size="14" class="animate-spin"></lucide-angular> }
                    Enregistrer
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class AdminUsersComponent {
  private api = inject(AdminApiService);
  private fb = inject(FormBuilder);
  private destroyRef = inject(DestroyRef);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);

  // Mappage des icônes Lucide obligatoires pour le template
  readonly iconSearch = Search;
  readonly iconPlus = Plus;
  readonly iconRefresh = RefreshCw;
  readonly iconChevronLeft = ChevronLeft;
  readonly iconChevronRight = ChevronRight;
  readonly iconBriefcase = Briefcase;
  readonly iconEdit = Edit3;
  readonly iconDelete = Trash2;
  readonly iconEye = Eye;
  readonly iconUserCog = UserCog;
  readonly iconShieldCheck = ShieldCheck;
  readonly iconPower = Power;
  readonly iconMore = MoreVertical;
  readonly iconX = X;
  readonly iconLoader = Loader;
  readonly iconCheck = Check;
  readonly iconWarning = AlertCircle;

  readonly createRoleOptions: string[] = ['ADMIN', 'RH', 'MANAGER', 'EMPLOYEE'];

  // Configuration Signals initialisés via cache SWR
  users = signal<AdminUser[]>(this.api.getCachedUsers()?.content ?? []);
  entreprises = signal<AdminEntreprise[]>(this.api.getCachedEntreprises()?.content ?? []);
  departements = signal<AdminDepartement[]>(this.api.getCachedDepartements()?.content ?? []);
  equipes = signal<AdminEquipe[]>(this.api.getCachedEquipes()?.content ?? []);

  isLoading = signal<boolean>(false);
  listError = signal<string | null>(null);

  page = signal<number>(0);
  size = signal<number>(10);
  totalElements = signal<number>(this.api.getCachedUsers()?.totalElements ?? 0);
  totalPages = signal<number>(this.api.getCachedUsers()?.totalPages || 0);

  searchDraft = signal<string>('');
  roleFilter = signal<string>('');
  statusFilter = signal<string>('');
  entrepriseFilter = signal<string>('');
  sortBy = signal<string>('name-asc');

  // Actions de modification / modals
  showForm = signal<boolean>(false);
  editingUser = signal<AdminUser | null>(null);
  isSaving = signal<boolean>(false);
  isActionSaving = signal<boolean>(false);
  menuOpenId = signal<number | null>(null);
  viewUser = signal<AdminUser | null>(null);
  managerTargetUser = signal<AdminUser | null>(null);
  selectedManagerId = signal<number | null>(null);
  roleTargetUser = signal<AdminUser | null>(null);
  roleDraft = signal<UserRole | null>(null);

  // Formulaire réactif strict
  form = this.fb.group({
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: [''],
    phone: [''],
    position: [''],
    status: ['ACTIVE', Validators.required],
    companyId: [null as number | null, Validators.required],
    departmentId: [null as number | null],
    teamId: [null as number | null],
    managerId: [null as number | null],
    role: ['EMPLOYEE' as UserRole, Validators.required]
  });

  // Chargements secondaires calculés
  isCompaniesLoading = signal<boolean>(false);
  isDepartmentsLoading = signal<boolean>(false);
  isTeamsLoading = signal<boolean>(false);
  isManagersLoading = signal<boolean>(false);

  companyOptions = signal<{ id: number, name: string }[]>(
    this.api.getCachedEntreprises()?.content.map(e => ({ id: e.id, name: e.nom })) ?? []
  );
  departmentOptions = signal<{ id: number, name: string }[]>(
    this.api.getCachedDepartements()?.content.map(d => ({ id: d.id, name: d.nom })) ?? []
  );
  teamOptions = signal<{ id: number, name: string }[]>(
    this.api.getCachedEquipes()?.content.map(eq => ({ id: eq.id, name: eq.nom })) ?? []
  );
  managerLookupOptions = signal<{ id: number, name: string }[]>([]);

  referenceWarning = signal<string | null>(null);
  private searchSubject = new Subject<string>();

  filteredUsers = computed(() => this.users());

  constructor() {
    this.route.queryParams.pipe(takeUntilDestroyed()).subscribe(params => {
      if (params['entrepriseId']) {
        this.entrepriseFilter.set(params['entrepriseId']);
      }
    });

    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntilDestroyed()
    ).subscribe(val => {
      this.searchDraft.set(val);
      this.page.set(0);
      this.loadUsers();
    });
  }

  private readonly assistantSync = inject(AssistantSyncService);

  /** Tool names that indicate a user was created or modified via the copilot. */
  private static readonly USER_MUTATION_TOOLS = new Set([
    'admin.create_user',
    'admin.users.create',
    'admin.update_user_role',
    'admin.update_role',
    'admin.assign_manager',
    'organisation.create_employee',
    'organisation.create_manager',
    'rh.structure.employee.create',
    'rh.structure.manager.create',
  ]);

  ngOnInit(): void {
    this.loadReferences();
    this.loadUsers();

    // Auto-refresh table when the copilot creates or modifies a user
    this.assistantSync.events$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(event => {
        const isExecuted = event.actionResult?.executed || event.actionResult?.status === 'success';
        const tool = (event.actionResult?.tool || event.actionResult?.action || event.intent || '').toLowerCase();
        const isUserAction = AdminUsersComponent.USER_MUTATION_TOOLS.has(tool) ||
          tool === 'admin.create_user' ||
          tool === 'admin.users.create' ||
          tool.includes('create_user') ||
          tool.includes('create_employee');

        if (isExecuted && isUserAction) {
          this.loadUsers();
          this.loadReferences();
          this.toast.success('Données utilisateurs actualisées suite à l\'action du copilote.');
        }
      });
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.menuOpenId.set(null);
  }

  toggleMenu(id: number, event: Event): void {
    event.stopPropagation();
    this.menuOpenId.set(this.menuOpenId() === id ? null : id);
  }

  onSearchInput(value: string): void {
    this.searchSubject.next(value);
  }

  // --- Gestionnaires de filtres unifiés ---
  onRoleFilterChange(v: string): void { this.roleFilter.set(v); this.page.set(0); this.loadUsers(); }
  onStatusFilterChange(v: string): void { this.statusFilter.set(v); this.page.set(0); this.loadUsers(); }
  onEntrepriseFilterChange(v: string): void { this.entrepriseFilter.set(v); this.page.set(0); this.loadUsers(); }
  onSortChange(v: string): void { this.sortBy.set(v); this.loadUsers(); }

  onPageSizeChange(newSize: number): void {
    this.size.set(newSize);
    this.page.set(0);
    this.loadUsers();
  }

  changePage(delta: number): void {
    const next = this.page() + delta;
    if (next < 0) return;
    if (this.totalPages() > 0 && next >= this.totalPages()) return;
    this.page.set(next);
    this.loadUsers();
  }

  onRefresh(): void {
    this.loadReferences();
    this.loadUsers();
  }

  isBusy = computed(() => this.isLoading() || this.isActionSaving());

  formatRole(role: string): string {
    if (!role) return '';
    return role.replace('ROLE_', '').replace('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }

  getRoleBadgeClass(role: string): string {
    switch (role) {
      case 'ADMIN': return 'bg-rose-50 text-rose-700 border-rose-200/60 dark:bg-rose-950/40 dark:text-rose-400';
      case 'RH': return 'bg-indigo-50 text-indigo-700 border-indigo-200/60 dark:bg-indigo-950/40 dark:text-indigo-400';
      case 'MANAGER': return 'bg-amber-50 text-amber-700 border-amber-200/60 dark:bg-amber-950/40 dark:text-amber-400';
      default: return 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-400';
    }
  }

  primaryRole(user: AdminUser): string {
    if (user.roles && user.roles.length > 0) return user.roles[0].nom?.replace('ROLE_', '') || 'EMPLOYEE';
    return 'EMPLOYEE';
  }

  managerName(user: AdminUser): string {
    // Si la propriété est absente, la gestion se fait désormais proprement côté template
    return user.managerNom ? user.managerNom : '';
  }

  initials(user: AdminUser): string {
    return `${(user.prenom || '').charAt(0)}${(user.nom || '').charAt(0)}`.toUpperCase() || '?';
  }

  avatarColor(user: AdminUser): string {
    const colors = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
    const index = (user.id || 0) % colors.length;
    return colors[index];
  }

  isFieldInvalid(name: string): boolean {
    const c = this.form.get(name);
    return !!(c && c.invalid && (c.dirty || c.touched));
  }

  // --- Actions Logique Métier ---
  openCreate(): void { this.editingUser.set(null); this.form.reset({ status: 'ACTIVE', role: 'EMPLOYEE' }); this.showForm.set(true); }
  openEdit(u: AdminUser): void {
    this.editingUser.set(u);
    this.form.patchValue({
      firstName: u.prenom || '',
      lastName: u.nom || '',
      email: u.email || '',
      password: '',
      phone: u.telephone || '',
      position: u.poste || '',
      status: u.statut === 'ACTIF' ? 'ACTIVE' : 'INACTIVE',
      companyId: u.entrepriseId ?? null,
      departmentId: u.departementId ?? null,
      teamId: u.equipeId ?? null,
      managerId: u.managerId ?? null,
      role: (this.primaryRole(u) as UserRole) || 'EMPLOYEE'
    });
    this.showForm.set(true);
  }
  closeForm(): void { this.showForm.set(false); }
  openDetails(u: AdminUser): void { this.viewUser.set(u); }
  closeDetails(): void { this.viewUser.set(null); }
  openAssignManager(u: AdminUser): void { this.managerTargetUser.set(u); this.selectedManagerId.set(u.managerId || null); }
  closeAssignManager(): void { this.managerTargetUser.set(null); }
  openRoleChange(u: AdminUser): void { this.roleTargetUser.set(u); this.roleDraft.set(this.primaryRole(u) as UserRole); }
  closeRoleChange(): void { this.roleTargetUser.set(null); }
  selectRoleDraft(r: string): void { this.roleDraft.set(r as UserRole); }

  // --- Appels API ---
  private loadUsers(): void {
    this.isLoading.set(true);
    this.listError.set(null);

    const search = this.searchDraft();
    const role = this.roleFilter();
    const status = this.statusFilter();
    const entrepriseId = this.entrepriseFilter();
    const sort = this.sortBy();

    this.api.getUsers(this.page(), this.size(), search, role, status, entrepriseId, sort).pipe(
      take(1),
      finalize(() => this.isLoading.set(false))
    ).subscribe({
      next: (p: AdminPage<AdminUser>) => {
        const content = p.content || [];
        this.users.set(content);
        const total = Number(p.totalElements ?? content.length);
        this.totalElements.set(total);
        const resolvedPages = Number(p.totalPages ?? 0);
        const computedPages = resolvedPages > 0
          ? resolvedPages
          : (total > 0 ? Math.ceil(total / Math.max(this.size(), 1)) : 1);
        this.totalPages.set(Math.max(1, computedPages));
      },
      error: (err) => {
        console.error('Error loading users:', err);
        this.listError.set('Impossible de charger les utilisateurs.');
      }
    });
  }

  private loadReferences(): void {
    this.isCompaniesLoading.set(true);
    this.api.getEntreprises(0, 200).pipe(
      finalize(() => this.isCompaniesLoading.set(false)),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (res) => {
        const entList = res.content || [];
        this.entreprises.set(entList);
        this.companyOptions.set(entList.map(e => ({ id: e.id, name: e.nom })));
      },
      error: (err) => {
        console.error('Erreur chargement entreprises:', err);
      }
    });

    this.isDepartmentsLoading.set(true);
    this.api.getDepartements(0, 200).pipe(
      finalize(() => this.isDepartmentsLoading.set(false)),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (res) => {
        const depList = res.content || [];
        this.departements.set(depList);
        this.departmentOptions.set(depList.map(d => ({ id: d.id, name: d.nom })));
      },
      error: () => {}
    });

    this.isTeamsLoading.set(true);
    this.api.getEquipes(0, 200).pipe(
      finalize(() => this.isTeamsLoading.set(false)),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (res) => {
        const eqList = res.content || [];
        this.equipes.set(eqList);
        this.teamOptions.set(eqList.map(eq => ({ id: eq.id, name: eq.nom })));
      },
      error: () => {}
    });
  }

  toggleStatus(u: AdminUser): void {
    this.isActionSaving.set(true);
    this.api.toggleUserStatus(u.id).pipe(
      finalize(() => this.isActionSaving.set(false)),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (updated) => {
        this.users.update(users => users.map(user => user.id === updated.id ? updated : user));
        this.toast.success(`Statut mis à jour pour ${u.prenom} ${u.nom}`);
      },
      error: () => this.toast.error('Erreur lors du changement de statut')
    });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const companyId = Number(value.companyId);
    if (!companyId) {
      this.toast.error('Veuillez sélectionner une entreprise valide.');
      return;
    }

    const payload: AdminUserPayload = {
      nom: value.lastName ?? '',
      prenom: value.firstName ?? '',
      email: value.email ?? '',
      motDePasse: value.password || undefined,
      telephone: value.phone || undefined,
      poste: value.position || undefined,
      statut: value.status === 'INACTIVE' ? 'INACTIF' : 'ACTIF',
      entrepriseId: companyId,
      departementId: value.departmentId ?? null,
      equipeId: value.teamId ?? null,
      managerId: value.managerId ?? null,
      roleIds: []
    };

    this.isSaving.set(true);
    const request$ = this.editingUser()
      ? this.api.updateUser(this.editingUser()!.id, payload)
      : this.api.createUser(payload);

    request$.pipe(
      finalize(() => this.isSaving.set(false)),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: () => {
        this.toast.success(this.editingUser() ? 'Utilisateur modifié avec succès' : 'Utilisateur créé avec succès');
        this.closeForm();
        this.loadUsers();
      },
      error: (err) => {
        console.error('Erreur enregistrement utilisateur:', err);
        this.toast.error("Erreur lors de l'enregistrement de l'utilisateur");
      }
    });
  }

  saveManagerAssignment(): void { }
  saveRoleChange(): void { }

  remove(u: AdminUser): void {
    if (!confirm(`Supprimer l'utilisateur ${u.prenom} ${u.nom} ?`)) return;
    this.isActionSaving.set(true);
    this.api.deleteUser(u.id).pipe(
      finalize(() => this.isActionSaving.set(false)),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: () => {
        this.users.update(users => users.filter(user => user.id !== u.id));
        this.totalElements.update(tot => Math.max(0, tot - 1));
        this.toast.success(`Utilisateur ${u.prenom} ${u.nom} supprimé`);
      },
      error: () => this.toast.error("Erreur lors de la suppression de l'utilisateur")
    });
  }

  managerLookupOptionsFor(id: number) { return []; }
}
