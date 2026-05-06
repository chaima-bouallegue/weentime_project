import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { AbstractControl, FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, debounceTime, distinctUntilChanged, finalize, forkJoin, map, Observable, of, switchMap, take } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';
import {
  AdminApiService,
  AdminDepartement,
  AdminEntreprise,
  AdminEquipe,
  AdminPage,
  AdminRole,
  AdminUser
} from '../admin-api.service';
import { UserListItem, UserOption, UserRole, UserService, UserUpsertPayload } from './user.service';
import { ToastService } from '../../../core/services/toast.service';
import { AdminEmptyStateComponent } from '../../../shared/components/admin-empty-state/admin-empty-state.component';
import { AdminSkeletonComponent } from '../../../shared/components/admin-skeleton/admin-skeleton.component';
import { ADMIN_ROLE_BADGES, ADMIN_ROLE_OPTIONS, formatRoleLabel } from '../admin-ui';

interface ReferenceResult<T> {
  key: string;
  data: T;
  failed: boolean;
}

const CREATE_ROLE_OPTIONS: UserRole[] = ['ADMIN', 'RH', 'MANAGER', 'EMPLOYEE'];

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, ReactiveFormsModule, LucideAngularModule, AdminEmptyStateComponent, AdminSkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pg">
      <div class="pg-head">
        <div>
          <nav class="bc">
            <span class="bc-s">Admin</span>
            <lucide-icon name="chevron-right" size="12" class="bc-arr"></lucide-icon>
            <span class="bc-s bc-cur">Utilisateurs</span>
          </nav>
          <h1 class="pg-title">Gestion des utilisateurs</h1>
          <p class="pg-sub">Pilotage des comptes, rÃ´les et rattachements manager.</p>
        </div>
        <button class="btn-ind" (click)="openCreate()" [disabled]="isSaving() || isActionSaving()">
          <lucide-icon name="user-plus" size="15"></lucide-icon>
          CrÃ©er un utilisateur
        </button>
      </div>

      @if (referenceWarning()) {
        <div class="warn-inline">
          <lucide-icon name="alert-triangle" size="14"></lucide-icon>
          <span>{{ referenceWarning() }}</span>
        </div>
      }

      <div class="frow">
        <div class="sbox">
          <lucide-icon name="search" size="14" class="sico"></lucide-icon>
          <input
            class="sinp"
            [value]="searchDraft()"
            (input)="onSearchInput(($any($event.target).value||'').trimStart())"
            placeholder="Rechercher par nom ou email..." />
        </div>

        <select class="fsel" [value]="roleFilter()" (change)="onRoleFilterChange($any($event.target).value)">
          <option value="">Tous les rÃ´les</option>
          @for (role of createRoleOptions; track role) {
            <option [value]="role">{{ formatRole(role) }}</option>
          }
        </select>

        <select class="fsel" [value]="statusFilter()" (change)="onStatusFilterChange($any($event.target).value)">
          <option value="">Tous les statuts</option>
          @for (status of statusOptions(); track status) {
            <option [value]="status">{{ status }}</option>
          }
        </select>

        <select class="fsel" [value]="entrepriseFilter()" (change)="onEntrepriseFilterChange($any($event.target).value)">
          <option value="">Toutes les entreprises</option>
          @for (entreprise of entreprises(); track entreprise.id) {
            <option [value]="entreprise.id">{{ entreprise.nom }}</option>
          }
        </select>

        <select class="fsel" [value]="sortBy()" (change)="onSortChange($any($event.target).value)">
          <option value="name-asc">Nom (A-Z)</option>
          <option value="name-desc">Nom (Z-A)</option>
          <option value="role-asc">RÃ´le (A-Z)</option>
          <option value="role-desc">RÃ´le (Z-A)</option>
          <option value="status-asc">Statut (A-Z)</option>
          <option value="status-desc">Statut (Z-A)</option>
        </select>
      </div>

      @if (isLoading()) {
        <app-admin-skeleton [count]="6" [columns]="4"></app-admin-skeleton>
      } @else if (listError()) {
        <app-admin-empty-state title="Chargement impossible" [description]="listError()" icon="alert-triangle"></app-admin-empty-state>
      } @else if (filteredUsers().length === 0) {
        <app-admin-empty-state title="Aucun utilisateur trouve" description="Aucun resultat avec les filtres actuels." icon="users"></app-admin-empty-state>
      } @else {
        <div class="tcard">
          <div class="tbar">
            <div class="tbar-l">
              <span class="tcnt">{{ filteredUsers().length }}</span>
              <span class="tlbl">utilisateur(s)</span>
              <span class="ttot">- {{ totalElements() }} au total</span>
            </div>

            <div class="tbar-r">
              <button class="btn-gh" (click)="onRefresh()" [disabled]="isBusy()">
                <lucide-icon name="refresh-cw" size="13"></lucide-icon>
                Actualiser
              </button>

              <div class="pgr">
                <button class="pgr-btn" (click)="changePage(-1)" [disabled]="page() === 0 || isBusy()">
                  <lucide-icon name="chevron-left" size="14"></lucide-icon>
                </button>
                <span class="pgr-txt">{{ page() + 1 }} / {{ totalPages() }}</span>
                <button class="pgr-btn" (click)="changePage(1)" [disabled]="page() + 1 >= totalPages() || isBusy()">
                  <lucide-icon name="chevron-right" size="14"></lucide-icon>
                </button>
              </div>
            </div>
          </div>

          <div class="tscr">
            <table class="dt">
              <thead>
              <tr>
                <th>Utilisateur</th>
                <th>RÃ´le</th>
                <th>Organisation</th>
                <th>Statut</th>
                <th>Manager</th>
                <th class="ac-h"></th>
              </tr>
              </thead>
              <tbody>
                @for (user of filteredUsers(); track user.id) {
                  <tr class="dr">
                    <td>
                      <div class="uc">
                        <div class="uav" [style.background]="avatarColor(user)">{{ initials(user) }}</div>
                        <div class="ui">
                          <span class="un">{{ user.prenom }} {{ user.nom }}</span>
                          <span class="ue">{{ user.email }}</span>
                          <span class="up">{{ user.poste || '-' }}</span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <div class="br">
                        <span class="rb" [class]="'tone-' + roleMeta(primaryRole(user)).tone">{{ roleMeta(primaryRole(user)).label }}</span>
                      </div>
                      <span class="sm">{{ user.permissions?.length || 0 }} permission(s)</span>
                    </td>

                    <td>
                      <span class="on">{{ user.entrepriseNom || 'Non assignÃ©e' }}</span>
                      <span class="sm">{{ user.departementNom || 'Aucun dÃ©partement' }}</span>
                      <span class="sm">{{ user.equipeNom || 'Aucune Ã©quipe' }}</span>
                    </td>

                    <td>
                      <button class="sp" [class.off]="user.statut === 'INACTIF'" (click)="toggleStatus(user)" [disabled]="isActionSaving()">
                        <span class="sd"></span>{{ user.statut === 'ACTIF' ? 'Actif' : 'Inactif' }}
                      </button>
                    </td>

                    <td>
                      <span class="mg">{{ managerName(user) }}</span>
                    </td>

                    <td class="ac">
                      <button class="mb" (click)="toggleMenu(user.id, $event)">
                        <lucide-icon name="more-vertical" size="14"></lucide-icon>
                      </button>
                      @if (menuOpenId() === user.id) {
                        <div class="dd" (click)="$event.stopPropagation()">
                          <button class="ddi" (click)="openDetails(user); $event.stopPropagation()">
                            <lucide-icon name="eye" size="13"></lucide-icon>
                            Voir dÃ©tails
                          </button>
                          <button class="ddi" (click)="openEdit(user); $event.stopPropagation()">
                            <lucide-icon name="pencil" size="13"></lucide-icon>
                            Modifier
                          </button>
                          <button class="ddi" (click)="openAssignManager(user); $event.stopPropagation()">
                            <lucide-icon name="user-cog" size="13"></lucide-icon>
                            Assigner manager
                          </button>
                          <button class="ddi" (click)="openRoleChange(user); $event.stopPropagation()">
                            <lucide-icon name="shield-check" size="13"></lucide-icon>
                            Changer rÃ´le
                          </button>
                          <button class="ddi" (click)="toggleStatus(user); $event.stopPropagation()">
                            <lucide-icon name="power" size="13"></lucide-icon>
                            {{ user.statut === 'ACTIF' ? 'DÃ©sactiver' : 'Activer' }}
                          </button>
                          <button class="ddi dng" (click)="remove(user); $event.stopPropagation()">
                            <lucide-icon name="trash-2" size="13"></lucide-icon>
                            Supprimer
                          </button>
                        </div>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      @if (showForm()) {
        <div class="bkd" (click)="closeForm()"></div>
        <div class="drw">
          <div class="drw-h">
            <div>
              <span class="drw-ey">{{ editingUser() ? 'Modifier' : 'CrÃ©er' }}</span>
              <h2 class="drw-ti">{{ editingUser() ? 'Modifier le compte' : 'Nouvel utilisateur' }}</h2>
            </div>
            <button class="btn-gh ico" (click)="closeForm()">
              <lucide-icon name="x" size="18"></lucide-icon>
            </button>
          </div>

          <div class="drw-b">
            <form [formGroup]="form" (ngSubmit)="save()">
              <p class="sec-t">Informations personnelles</p>
              <div class="fg">
                <div class="ff">
                  <label>PrÃ©nom <span class="rq">*</span></label>
                  <input class="fi" formControlName="firstName" placeholder="Jean" />
                  @if (isFieldInvalid('firstName')) {
                    <span class="ferr-sm">Champ requis.</span>
                  }
                </div>
                <div class="ff">
                  <label>Nom <span class="rq">*</span></label>
                  <input class="fi" formControlName="lastName" placeholder="Dupont" />
                  @if (isFieldInvalid('lastName')) {
                    <span class="ferr-sm">Champ requis.</span>
                  }
                </div>
                <div class="ff">
                  <label>Email <span class="rq">*</span></label>
                  <input class="fi" formControlName="email" type="email" />
                  @if (isFieldInvalid('email')) {
                    <span class="ferr-sm">{{ form.controls.email.hasError('email') ? 'Email invalide.' : 'Champ requis.' }}</span>
                  }
                </div>
                <div class="ff">
                  <label>Mot de passe {{ editingUser() ? '(optionnel)' : '*' }}</label>
                  <input class="fi" formControlName="password" type="password" [placeholder]="editingUser() ? 'Laisser vide = inchange' : 'Mot de passe'" />
                  @if (isFieldInvalid('password')) {
                    <span class="ferr-sm">Champ requis.</span>
                  }
                </div>
                <div class="ff">
                  <label>TÃ©lÃ©phone</label>
                  <input class="fi" formControlName="phone" />
                </div>
                <div class="ff">
                  <label>Poste</label>
                  <input class="fi" formControlName="position" />
                </div>
                <div class="ff">
                  <label>Statut <span class="rq">*</span></label>
                  <select class="fs" formControlName="status">
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                    <option value="SUSPENDED">SUSPENDED</option>
                  </select>
                </div>
              </div>

              <div class="fdv"></div>
              <p class="sec-t">Organisation</p>
              <div class="fg">
                <div class="ff">
                  <label>Entreprise <span class="rq">*</span></label>
                  <select class="fs" formControlName="companyId">
                    <option [ngValue]="null">Choisir</option>
                    @if (isCompaniesLoading()) {
                      <option [ngValue]="null" disabled>Chargement...</option>
                    } @else if (companyOptions().length === 0) {
                      <option [ngValue]="null" disabled>Aucune entreprise</option>
                    } @else {
                      @for (company of companyOptions(); track company.id) {
                        <option [ngValue]="company.id">{{ company.name }}</option>
                      }
                    }
                  </select>
                  @if (isFieldInvalid('companyId')) {
                    <span class="ferr-sm">Champ requis.</span>
                  }
                </div>
                <div class="ff">
                  <label>DÃ©partement</label>
                  <select class="fs" formControlName="departmentId">
                    <option [ngValue]="null">Aucun</option>
                    @if (isDepartmentsLoading()) {
                      <option [ngValue]="null" disabled>Chargement...</option>
                    } @else if (form.controls.companyId.value && departmentOptions().length === 0) {
                      <option [ngValue]="null" disabled>Aucun dÃ©partement</option>
                    } @else {
                      @for (department of departmentOptions(); track department.id) {
                        <option [ngValue]="department.id">{{ department.name }}</option>
                      }
                    }
                  </select>
                </div>
                <div class="ff">
                  <label>Ã‰quipe</label>
                  <select class="fs" formControlName="teamId">
                    <option [ngValue]="null">Aucune</option>
                    @if (isTeamsLoading()) {
                      <option [ngValue]="null" disabled>Chargement...</option>
                    } @else if (form.controls.departmentId.value && teamOptions().length === 0) {
                      <option [ngValue]="null" disabled>Aucune Ã©quipe</option>
                    } @else {
                      @for (team of teamOptions(); track team.id) {
                        <option [ngValue]="team.id">{{ team.name }}</option>
                      }
                    }
                  </select>
                </div>
                <div class="ff">
                  <label>Manager</label>
                  <select class="fs" formControlName="managerId">
                    <option [ngValue]="null">Non assignÃ©</option>
                    @if (isManagersLoading()) {
                      <option [ngValue]="null" disabled>Chargement...</option>
                    } @else if (managerLookupOptions().length === 0) {
                      <option [ngValue]="null" disabled>Aucun manager</option>
                    } @else {
                      @for (manager of managerLookupOptions(); track manager.id) {
                        <option [ngValue]="manager.id">{{ manager.name }}</option>
                      }
                    }
                  </select>
                </div>
              </div>

              <div class="fdv"></div>
              <p class="sec-t">RÃ´le <span class="sec-h">SÃ©lectionnez un rÃ´le</span></p>
              <div class="rg">
                @for (role of createRoleOptions; track role) {
                  <label class="rc" [class.sel]="form.controls.role.value === role">
                    <input
                      type="radio"
                      name="user-role"
                      [value]="role"
                      [checked]="form.controls.role.value === role"
                      (change)="form.controls.role.setValue(role)" />
                    <div>
                      <span class="rcn">{{ role }}</span>
                      <span class="rcd">RÃ´le {{ role }}</span>
                    </div>
                  </label>
                }
              </div>

              <div class="drw-f">
                <button type="button" class="btn-gh" (click)="closeForm()" [disabled]="isSaving()">Annuler</button>
                <button type="submit" class="btn-ind" [disabled]="isSaving()">
                  @if (isSaving()) {
                    <lucide-icon name="loader" size="14" class="spin"></lucide-icon>
                    Enregistrement...
                  } @else {
                    <lucide-icon name="check" size="14"></lucide-icon>
                    Enregistrer
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      @if (viewUser(); as details) {
        <div class="bkd" (click)="closeDetails()"></div>
        <div class="dlg">
          <div class="dlg-h">
            <h3>DÃ©tails utilisateur</h3>
            <button class="btn-gh ico" (click)="closeDetails()"><lucide-icon name="x" size="16"></lucide-icon></button>
          </div>
          <div class="dlg-b">
            <div class="kv"><span>Nom</span><strong>{{ details.prenom }} {{ details.nom }}</strong></div>
            <div class="kv"><span>Email</span><strong>{{ details.email }}</strong></div>
            <div class="kv"><span>Poste</span><strong>{{ details.poste || '-' }}</strong></div>
            <div class="kv"><span>Entreprise</span><strong>{{ details.entrepriseNom || 'Non assignÃ©e' }}</strong></div>
            <div class="kv"><span>DÃ©partement</span><strong>{{ details.departementNom || 'Aucun' }}</strong></div>
            <div class="kv"><span>Ã‰quipe</span><strong>{{ details.equipeNom || 'Aucune' }}</strong></div>
            <div class="kv"><span>Manager</span><strong>{{ managerName(details) }}</strong></div>
            <div class="kv"><span>Statut</span><strong>{{ details.statut }}</strong></div>
          </div>
          <div class="dlg-f">
            <button class="btn-gh" (click)="closeDetails()">Fermer</button>
          </div>
        </div>
      }

      @if (managerTargetUser(); as target) {
        <div class="bkd" (click)="closeAssignManager()"></div>
        <div class="dlg">
          <div class="dlg-h">
            <h3>Assigner manager</h3>
            <button class="btn-gh ico" (click)="closeAssignManager()"><lucide-icon name="x" size="16"></lucide-icon></button>
          </div>
          <div class="dlg-b">
            <p class="dlg-sub">{{ target.prenom }} {{ target.nom }}</p>
            <div class="ff">
              <label>Manager</label>
              <select class="fs" [ngModel]="selectedManagerId()" (ngModelChange)="selectedManagerId.set($event)" [ngModelOptions]="{standalone:true}">
                <option [ngValue]="null">Non assignÃ©</option>
                @for (manager of managerLookupOptionsFor(target.id); track manager.id) {
                  <option [ngValue]="manager.id">{{ manager.name }}</option>
                }
              </select>
            </div>
          </div>
          <div class="dlg-f">
            <button class="btn-gh" (click)="closeAssignManager()" [disabled]="isActionSaving()">Annuler</button>
            <button class="btn-ind" (click)="saveManagerAssignment()" [disabled]="isActionSaving()">
              @if (isActionSaving()) {
                <lucide-icon name="loader" size="14" class="spin"></lucide-icon>
                Enregistrement...
              } @else {
                <lucide-icon name="check" size="14"></lucide-icon>
                Confirmer
              }
            </button>
          </div>
        </div>
      }

      @if (roleTargetUser(); as roleTarget) {
        <div class="bkd" (click)="closeRoleChange()"></div>
        <div class="dlg dlg-lg">
          <div class="dlg-h">
            <h3>Changer rÃ´le</h3>
            <button class="btn-gh ico" (click)="closeRoleChange()"><lucide-icon name="x" size="16"></lucide-icon></button>
          </div>
          <div class="dlg-b">
            <p class="dlg-sub">{{ roleTarget.prenom }} {{ roleTarget.nom }}</p>
            <div class="rg">
              @for (role of createRoleOptions; track role) {
                <label class="rc" [class.sel]="roleDraft() === role">
                  <input type="radio" name="role-draft" [checked]="roleDraft() === role" (change)="selectRoleDraft(role)" />
                  <div>
                    <span class="rcn">{{ formatRole(role) }}</span>
                    <span class="rcd">RÃ´le {{ role }}</span>
                  </div>
                </label>
              }
            </div>
            @if (!roleDraft()) {
              <div class="ferr">
                <lucide-icon name="alert-circle" size="13"></lucide-icon>
                SÃ©lectionnez un rÃ´le.
              </div>
            }
          </div>
          <div class="dlg-f">
            <button class="btn-gh" (click)="closeRoleChange()" [disabled]="isActionSaving()">Annuler</button>
            <button class="btn-ind" (click)="saveRoleChange()" [disabled]="isActionSaving() || !roleDraft()">
              @if (isActionSaving()) {
                <lucide-icon name="loader" size="14" class="spin"></lucide-icon>
                Enregistrement...
              } @else {
                <lucide-icon name="check" size="14"></lucide-icon>
                Appliquer
              }
            </button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    /* â”€â”€ Layout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    .pg { display:flex; flex-direction:column; gap:16px; }

    /* â”€â”€ Page header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    .pg-head {
      display:flex; align-items:flex-start; justify-content:space-between;
      gap:16px; flex-wrap:wrap;
      padding:20px 24px;
      background:#fff;
      border:0.5px solid #e8edf5;
      border-radius:14px;
      box-shadow:0 1px 4px rgba(0,0,0,.04);
    }
    :host-context(.dark) .pg-head { background:#0f172a; border-color:#1e293b; }

    .bc { display:flex; align-items:center; gap:5px; margin-bottom:6px; }
    .bc-s { font-size:11px; font-weight:500; color:#94a3b8; }
    .bc-cur { color:#6366f1; }
    .bc-arr { color:#cbd5e1; }
    .pg-title { font-size:20px; font-weight:500; color:#0f172a; margin:0 0 3px; }
    .pg-sub   { font-size:13px; color:#64748b; margin:0; }
    :host-context(.dark) .pg-title { color:#f1f5f9; }
    :host-context(.dark) .pg-sub   { color:#94a3b8; }

    /* â”€â”€ Buttons â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    .btn-ind {
      display:inline-flex; align-items:center; gap:7px;
      padding:8px 16px; border-radius:9px; border:none;
      background:#6366f1; color:#fff;
      font-size:13px; font-weight:500;
      cursor:pointer; font-family:inherit;
      transition:background .15s, opacity .15s;
      white-space:nowrap;
    }
    .btn-ind:hover:not(:disabled) { background:#4f46e5; }
    .btn-ind:disabled { opacity:.5; cursor:not-allowed; }

    .btn-gh {
      display:inline-flex; align-items:center; gap:6px;
      padding:7px 12px; border-radius:8px;
      border:0.5px solid #e2e8f0; background:transparent;
      color:#475569; font-size:12px; font-weight:500;
      cursor:pointer; font-family:inherit;
      transition:background .12s, color .12s;
    }
    .btn-gh:hover:not(:disabled) { background:#f1f5f9; color:#0f172a; }
    .btn-gh:disabled { opacity:.5; cursor:not-allowed; }
    .btn-gh.ico { padding:7px; }
    :host-context(.dark) .btn-gh { border-color:#334155; color:#94a3b8; }
    :host-context(.dark) .btn-gh:hover:not(:disabled) { background:#1e293b; color:#f1f5f9; }

    /* â”€â”€ Warning banner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    .warn-inline {
      display:flex; align-items:center; gap:8px;
      padding:10px 14px; border-radius:10px;
      border:0.5px solid #fde68a; background:#fffbeb;
      color:#92400e; font-size:12px; font-weight:500;
    }

    /* â”€â”€ Filter row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    .frow {
      display:grid;
      grid-template-columns:1fr repeat(4, minmax(140px, 180px));
      gap:8px; padding:12px 16px;
      background:#fff; border:0.5px solid #e8edf5;
      border-radius:12px; box-shadow:0 1px 3px rgba(0,0,0,.03);
    }
    :host-context(.dark) .frow { background:#0f172a; border-color:#1e293b; }

    .sbox { position:relative; display:flex; align-items:center; }
    .sico { position:absolute; left:10px; color:#94a3b8; pointer-events:none; }
    .sinp {
      width:100%; height:36px; padding:0 12px 0 32px;
      border-radius:8px; border:0.5px solid #e2e8f0;
      background:#f8fafc; font-size:13px; color:#0f172a;
      outline:none; font-family:inherit;
      transition:border-color .14s, box-shadow .14s;
    }
    .sinp:focus { border-color:#6366f1; background:#fff; box-shadow:0 0 0 3px rgba(99,102,241,.1); }
    .fsel {
      height:36px; padding:0 10px;
      border-radius:8px; border:0.5px solid #e2e8f0;
      background:#f8fafc; font-size:13px; font-weight:500;
      color:#475569; outline:none; cursor:pointer; font-family:inherit;
      transition:border-color .14s;
    }
    .fsel:focus { border-color:#6366f1; }
    :host-context(.dark) .sinp,
    :host-context(.dark) .fsel { background:#1e293b; border-color:#334155; color:#e2e8f0; }

    /* â”€â”€ Table card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    .tcard {
      background:#fff; border:0.5px solid #e8edf5;
      border-radius:14px; overflow:visible;
      box-shadow:0 1px 4px rgba(0,0,0,.04);
    }
    :host-context(.dark) .tcard { background:#0f172a; border-color:#1e293b; }

    .tbar {
      display:flex; align-items:center; justify-content:space-between;
      gap:12px; padding:12px 18px;
      border-bottom:0.5px solid #f1f5f9; flex-wrap:wrap;
    }
    :host-context(.dark) .tbar { border-color:#1e293b; }
    .tbar-l { display:flex; align-items:baseline; gap:5px; }
    .tcnt  { font-size:14px; font-weight:500; color:#0f172a; }
    .tlbl  { font-size:12px; color:#64748b; }
    .ttot  { font-size:11px; color:#94a3b8; }
    :host-context(.dark) .tcnt { color:#f1f5f9; }
    .tbar-r { display:flex; align-items:center; gap:8px; }

    .pgr { display:flex; align-items:center; gap:4px; }
    .pgr-btn {
      width:28px; height:28px; border-radius:7px;
      border:0.5px solid #e2e8f0; background:transparent;
      color:#64748b; display:grid; place-items:center;
      cursor:pointer; transition:background .12s;
    }
    .pgr-btn:hover:not(:disabled) { background:#f8fafc; color:#0f172a; }
    .pgr-btn:disabled { opacity:.35; cursor:not-allowed; }
    .pgr-txt { font-size:12px; font-weight:500; color:#64748b; white-space:nowrap; padding:0 4px; }

    /* â”€â”€ Data table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    .tscr { overflow-x:auto; }
    .dt { width:100%; border-collapse:collapse; }
    .dt thead tr { border-bottom:0.5px solid #f1f5f9; }
    :host-context(.dark) .dt thead tr { border-color:#1e293b; }
    .dt th {
      padding:10px 16px; text-align:left;
      font-size:10.5px; font-weight:600;
      text-transform:uppercase; letter-spacing:.07em;
      color:#94a3b8; white-space:nowrap;
      background:#fafbfc;
    }
    :host-context(.dark) .dt th { background:#080d18; color:#475569; }

    .dr { border-bottom:0.5px solid #f8fafc; transition:background .1s; }
    .dr:last-child { border-bottom:none; }
    .dr:hover { background:#fafbff; }
    :host-context(.dark) .dr { border-color:#141c2d; }
    :host-context(.dark) .dr:hover { background:rgba(99,102,241,.04); }
    .dt td { padding:12px 16px; vertical-align:middle; }

    .ac-h, .ac { position:sticky; right:0; background:inherit; }
    .ac-h { z-index:2; }
    .ac { z-index:3; width:52px; text-align:right; }

    /* â”€â”€ User cell â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    .uc { display:flex; align-items:center; gap:10px; }
    .uav {
      width:36px; height:36px; border-radius:10px; flex-shrink:0;
      display:grid; place-items:center;
      color:#fff; font-size:11px; font-weight:500; letter-spacing:.02em;
    }
    .ui { display:flex; flex-direction:column; gap:1px; min-width:0; }
    .un { font-size:13px; font-weight:500; color:#0f172a; white-space:nowrap; }
    .ue { font-size:11px; color:#64748b; }
    .up, .sm { font-size:11px; color:#94a3b8; display:block; margin-top:1px; }
    .on { display:block; font-size:13px; color:#334155; margin-bottom:1px; }
    :host-context(.dark) .un { color:#f1f5f9; }
    :host-context(.dark) .on { color:#cbd5e1; }

    /* â”€â”€ Role badge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    .br { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:3px; }
    .rb {
      display:inline-flex; align-items:center;
      padding:3px 8px; border-radius:6px;
      font-size:11px; font-weight:500;
    }
    .tone-admin,   .tone-danger  { background:#ede9fe; color:#5b21b6; }
    .tone-manager, .tone-success { background:#dcfce7; color:#15803d; }
    .tone-rh,      .tone-info   { background:#fff7ed; color:#c2410c; }
    .tone-employee,.tone-neutral { background:#f1f5f9; color:#475569; }
    :host-context(.dark) .tone-admin,    :host-context(.dark) .tone-danger  { background:rgba(91,33,182,.18);  color:#c4b5fd; }
    :host-context(.dark) .tone-manager,  :host-context(.dark) .tone-success { background:rgba(21,128,61,.16);  color:#86efac; }
    :host-context(.dark) .tone-rh,       :host-context(.dark) .tone-info   { background:rgba(194,65,12,.16); color:#fdba74; }
    :host-context(.dark) .tone-employee, :host-context(.dark) .tone-neutral { background:rgba(71,85,105,.18);  color:#94a3b8; }

    /* â”€â”€ Status toggle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    .sp {
      display:inline-flex; align-items:center; gap:6px;
      padding:4px 10px; border-radius:6px; border:none;
      background:#f0fdf4; color:#15803d;
      font-size:12px; font-weight:500;
      cursor:pointer; transition:opacity .14s; font-family:inherit;
    }
    .sp:hover:not(:disabled) { opacity:.8; }
    .sp:disabled { opacity:.5; cursor:not-allowed; }
    .sp.off { background:#fff1f2; color:#dc2626; }
    .sd { width:6px; height:6px; border-radius:50%; background:currentColor; flex-shrink:0; }
    :host-context(.dark) .sp     { background:rgba(21,128,61,.14);  color:#4ade80; }
    :host-context(.dark) .sp.off { background:rgba(220,38,38,.12);  color:#fb7185; }

    .mg { font-size:12px; color:#64748b; }

    /* â”€â”€ Row action menu â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    .mb {
      width:28px; height:28px; border-radius:7px;
      border:0.5px solid #e2e8f0; background:transparent;
      color:#94a3b8; display:grid; place-items:center;
      cursor:pointer; margin-left:auto;
      transition:background .12s, color .12s;
    }
    .mb:hover { background:#f8fafc; color:#475569; }
    :host-context(.dark) .mb { border-color:#334155; }
    :host-context(.dark) .mb:hover { background:#1e293b; color:#e2e8f0; }

    .dd {
      position:absolute; top:calc(100% + 4px); right:0;
      min-width:170px; background:#fff;
      border:0.5px solid #e2e8f0; border-radius:10px;
      box-shadow:0 8px 24px -4px rgba(0,0,0,.1);
      z-index:40; overflow:hidden;
      animation:mIn .12s ease;
    }
    @keyframes mIn { from { opacity:0; transform:translateY(-4px) scale(.98); } to { opacity:1; transform:none; } }
    :host-context(.dark) .dd { background:#1e293b; border-color:#334155; }

    .ddi {
      display:flex; align-items:center; gap:8px;
      width:100%; padding:9px 13px;
      border:none; background:transparent;
      color:#334155; font-size:12.5px; font-weight:500;
      text-align:left; cursor:pointer;
      transition:background .1s; font-family:inherit;
    }
    .ddi:hover { background:#f8fafc; }
    .dng { color:#dc2626; }
    .dng:hover { background:#fff1f2; }
    :host-context(.dark) .ddi { color:#e2e8f0; }
    :host-context(.dark) .ddi:hover { background:#334155; }
    :host-context(.dark) .dng { color:#fb7185; }
    :host-context(.dark) .dng:hover { background:rgba(220,38,38,.1); }

    /* â”€â”€ Backdrop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    .bkd {
      position:fixed; inset:0;
      background:rgba(15,23,42,.4);
      backdrop-filter:blur(4px);
      z-index:50; animation:fadeIn .2s ease;
    }
    @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }

    /* â”€â”€ Drawer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    .drw {
      position:fixed; top:0; right:0;
      width:min(100%, 540px); height:100vh;
      background:#fff; border-left:0.5px solid #e2e8f0;
      box-shadow:-12px 0 40px -8px rgba(0,0,0,.1);
      z-index:51; display:flex; flex-direction:column;
      animation:drIn .22s cubic-bezier(.16,1,.3,1);
    }
    @keyframes drIn { from { transform:translateX(100%); } to { transform:none; } }
    :host-context(.dark) .drw { background:#0f172a; border-color:#1e293b; }

    .drw-h {
      display:flex; align-items:flex-start; justify-content:space-between;
      padding:20px 24px 16px; border-bottom:0.5px solid #f1f5f9; flex-shrink:0;
    }
    :host-context(.dark) .drw-h { border-color:#1e293b; }
    .drw-ey { font-size:11px; font-weight:500; text-transform:uppercase; letter-spacing:.1em; color:#6366f1; }
    .drw-ti { font-size:18px; font-weight:500; color:#0f172a; margin:4px 0 0; }
    :host-context(.dark) .drw-ti { color:#f1f5f9; }
    .drw-b { flex:1; overflow-y:auto; padding:20px 24px; }
    .drw-f { display:flex; gap:8px; justify-content:flex-end; padding:14px 0 0; border-top:0.5px solid #f1f5f9; margin-top:8px; }
    :host-context(.dark) .drw-f { border-color:#1e293b; }

    /* â”€â”€ Form sections â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    .sec-t { font-size:12px; font-weight:600; color:#0f172a; margin:0 0 12px; text-transform:uppercase; letter-spacing:.07em; }
    :host-context(.dark) .sec-t { color:#94a3b8; }
    .sec-h { font-size:11px; font-weight:400; color:#94a3b8; margin-left:8px; text-transform:none; letter-spacing:0; }
    .fdv { height:0.5px; background:#f1f5f9; margin:18px 0; }
    :host-context(.dark) .fdv { background:#1e293b; }

    .fg { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:4px; }
    .ff { display:flex; flex-direction:column; gap:5px; }
    .ff label { font-size:11.5px; font-weight:500; color:#475569; }
    :host-context(.dark) .ff label { color:#94a3b8; }
    .ferr-sm { font-size:11px; color:#dc2626; }
    .rq { color:#dc2626; }

    .fi, .fs {
      height:36px; padding:0 11px;
      border-radius:8px; border:0.5px solid #e2e8f0;
      background:#f8fafc; font-size:13px; color:#0f172a;
      outline:none; width:100%; font-family:inherit;
      transition:border-color .14s, box-shadow .14s;
    }
    .fi:focus, .fs:focus { border-color:#6366f1; background:#fff; box-shadow:0 0 0 3px rgba(99,102,241,.1); }
    .fi:disabled, .fs:disabled { cursor:not-allowed; opacity:.62; background:#eef2f7; }
    :host-context(.dark) .fi, :host-context(.dark) .fs { background:#1e293b; border-color:#334155; color:#e2e8f0; }
    :host-context(.dark) .fi:focus, :host-context(.dark) .fs:focus { background:#0f172a; }

    /* â”€â”€ Role radio cards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    .rg { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:8px; margin-bottom:16px; }
    .rc {
      display:flex; align-items:flex-start; gap:10px;
      padding:11px 12px; border-radius:10px;
      border:0.5px solid #e2e8f0; background:#f8fafc;
      cursor:pointer; transition:border-color .14s, background .14s;
    }
    .rc input[type=radio] { margin-top:2px; flex-shrink:0; accent-color:#6366f1; }
    .rc:hover { border-color:#c7d2fe; background:#fff; }
    .rc.sel  { border-color:#6366f1; background:#eef2ff; }
    :host-context(.dark) .rc { background:#1e293b; border-color:#334155; }
    :host-context(.dark) .rc.sel { border-color:#6366f1; background:rgba(99,102,241,.1); }
    .rc > div { display:flex; flex-direction:column; gap:2px; }
    .rcn { font-size:12.5px; font-weight:500; color:#0f172a; }
    :host-context(.dark) .rcn { color:#f1f5f9; }
    .rcd { font-size:11px; color:#94a3b8; line-height:1.4; }

    .ferr {
      display:flex; align-items:center; gap:7px;
      padding:10px 12px; background:#fff1f2;
      border:0.5px solid #fecdd3; border-radius:8px;
      font-size:12.5px; color:#dc2626; margin-bottom:12px;
    }

    /* â”€â”€ Dialog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    .dlg {
      position:fixed; top:50%; left:50%;
      transform:translate(-50%, -50%);
      width:min(calc(100% - 24px), 460px);
      background:#fff; border:0.5px solid #e2e8f0;
      border-radius:14px; z-index:52;
      box-shadow:0 20px 40px rgba(15,23,42,.14);
      display:grid;
    }
    .dlg-lg { width:min(calc(100% - 24px), 660px); }
    :host-context(.dark) .dlg { background:#0f172a; border-color:#1e293b; }

    .dlg-h {
      display:flex; align-items:center; justify-content:space-between;
      padding:14px 16px; border-bottom:0.5px solid #f1f5f9;
    }
    .dlg-h h3 { margin:0; font-size:15px; font-weight:500; color:#0f172a; }
    :host-context(.dark) .dlg-h { border-color:#1e293b; }
    :host-context(.dark) .dlg-h h3 { color:#f1f5f9; }

    .dlg-b { padding:14px 16px; display:grid; gap:8px; max-height:min(60vh, 520px); overflow:auto; }
    .dlg-f { padding:12px 16px; border-top:0.5px solid #f1f5f9; display:flex; justify-content:flex-end; gap:8px; }
    :host-context(.dark) .dlg-f { border-color:#1e293b; }
    .dlg-sub { margin:0; color:#64748b; font-size:12px; }

    .kv {
      display:flex; align-items:center; justify-content:space-between;
      gap:10px; border:0.5px solid #e2e8f0;
      border-radius:9px; background:#f8fafc; padding:9px 12px;
    }
    .kv span   { color:#64748b; font-size:12px; }
    .kv strong { color:#0f172a; font-size:12px; font-weight:500; text-align:right; }
    :host-context(.dark) .kv { background:#1e293b; border-color:#334155; }
    :host-context(.dark) .kv strong { color:#f1f5f9; }

    /* â”€â”€ Spinner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    .spin { animation:spinA .8s linear infinite; }
    @keyframes spinA { from { transform:rotate(0); } to { transform:rotate(360deg); } }

    /* â”€â”€ Responsive â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    @media (max-width:1240px) { .frow { grid-template-columns:1fr repeat(2, minmax(140px,1fr)); } }
    @media (max-width:1100px) { .frow { grid-template-columns:1fr 1fr; } }
    @media (max-width:760px)  { .frow { grid-template-columns:1fr; } .fg { grid-template-columns:1fr; } .drw { width:100%; } }
  `]
})
export class AdminUsersComponent {
  private readonly api = inject(AdminApiService);
  private readonly userApi = inject(UserService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);

  readonly page = signal(0);
  readonly size = signal(12);
  readonly totalElements = signal(0);
  readonly totalPages = signal(1);
  readonly isLoading = signal(true);
  readonly isReferenceLoading = signal(false);
  readonly isSaving = signal(false);
  readonly isActionSaving = signal(false);
  readonly listError = signal('');
  readonly referenceWarning = signal('');
  readonly menuOpenId = signal<number | null>(null);

  readonly users = signal<AdminUser[]>([]);
  readonly allUsers = signal<AdminUser[]>([]);
  readonly roles = signal<AdminRole[]>([]);
  readonly entreprises = signal<AdminEntreprise[]>([]);
  readonly departements = signal<AdminDepartement[]>([]);
  readonly equipes = signal<AdminEquipe[]>([]);

  readonly search = signal('');
  readonly searchDraft = signal('');
  readonly roleFilter = signal('');
  readonly statusFilter = signal('');
  readonly entrepriseFilter = signal('');
  readonly sortBy = signal<'name-asc' | 'name-desc' | 'role-asc' | 'role-desc' | 'status-asc' | 'status-desc'>('name-asc');

  readonly showForm = signal(false);
  readonly editingUser = signal<AdminUser | null>(null);

  readonly viewUser = signal<AdminUser | null>(null);
  readonly managerTargetUser = signal<AdminUser | null>(null);
  readonly selectedManagerId = signal<number | null>(null);
  readonly roleTargetUser = signal<AdminUser | null>(null);
  readonly roleDraft = signal<UserRole | null>(null);
  readonly createRoleOptions = CREATE_ROLE_OPTIONS;

  readonly companyOptions = signal<UserOption[]>([]);
  readonly departmentOptions = signal<UserOption[]>([]);
  readonly teamOptions = signal<UserOption[]>([]);
  readonly managerLookupOptions = signal<UserOption[]>([]);
  readonly isCompaniesLoading = signal(false);
  readonly isDepartmentsLoading = signal(false);
  readonly isTeamsLoading = signal(false);
  readonly isManagersLoading = signal(false);

  readonly form = this.fb.group({
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
    phone: [''],
    position: [''],
    status: ['ACTIVE', Validators.required],
    role: ['EMPLOYEE' as UserRole, Validators.required],
    companyId: [null as number | null, Validators.required],
    departmentId: [{ value: null as number | null, disabled: true }],
    teamId: [{ value: null as number | null, disabled: true }],
    managerId: [null as number | null]
  });

  private readonly searchInput$ = new Subject<string>();

  readonly statusOptions = computed(() => {
    const source = [...this.allUsers(), ...this.users()];
    const statuses = Array.from(new Set(source.map(user => String(user.statut ?? '')).filter(Boolean)));
    return statuses.length > 0 ? statuses : ['ACTIF', 'INACTIF'];
  });

  readonly filteredUsers = computed(() => {
    const searchTerm = this.search().toLowerCase();
    const role = this.roleFilter();
    const status = this.statusFilter();
    const entreprise = this.entrepriseFilter();

    const filtered = this.users().filter(user => {
      const matchesSearch = !searchTerm
        || `${user.prenom} ${user.nom}`.toLowerCase().includes(searchTerm)
        || user.email.toLowerCase().includes(searchTerm);
      const matchesRole = !role || this.toExternalRole(this.primaryRole(user)) === role;
      const matchesStatus = !status || user.statut === status;
      const matchesEntreprise = !entreprise || String(user.entrepriseId ?? '') === entreprise;
      return matchesSearch && matchesRole && matchesStatus && matchesEntreprise;
    });

    const sorted = [...filtered];
    const direction = this.sortBy().endsWith('desc') ? -1 : 1;
    const compareText = (left: string, right: string) => left.localeCompare(right, 'fr', { sensitivity: 'base' }) * direction;

    switch (this.sortBy()) {
      case 'name-asc':
      case 'name-desc':
        sorted.sort((left, right) => compareText(`${left.prenom} ${left.nom}`.trim(), `${right.prenom} ${right.nom}`.trim()));
        break;
      case 'role-asc':
      case 'role-desc':
        sorted.sort((left, right) => compareText(this.roleMeta(this.primaryRole(left)).label, this.roleMeta(this.primaryRole(right)).label));
        break;
      case 'status-asc':
      case 'status-desc':
        sorted.sort((left, right) => compareText(left.statut, right.statut));
        break;
    }

    return sorted;
  });

  readonly isBusy = computed(() => this.isLoading() || this.isReferenceLoading() || this.isSaving() || this.isActionSaving());

  constructor() {
    this.loadReferenceData();
    this.loadUsers();
    this.loadCompanies();
    this.loadManagers();

    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const value = params.get('search');
        if (value) {
          this.search.set(value.trim());
          this.searchDraft.set(value.trim());
        }
      });

    this.searchInput$
      .pipe(
        debounceTime(250),
        map(value => value.trim()),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(value => this.applyFilterChange(() => this.search.set(value)));

    this.form.controls.companyId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(value => {
        const companyId = value ?? null;
        this.form.controls.departmentId.setValue(null, { emitEvent: false });
        this.form.controls.teamId.setValue(null, { emitEvent: false });
        this.form.controls.managerId.setValue(null, { emitEvent: false });
        this.departmentOptions.set([]);
        this.teamOptions.set([]);
        this.syncDepartmentControlState();
        this.syncTeamControlState();

        if (companyId == null) {
          this.loadManagers();
          return;
        }

        this.loadDepartments(companyId);
        this.loadManagers(companyId);
      });

    this.form.controls.departmentId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(value => {
        const departmentId = value ?? null;
        this.form.controls.teamId.setValue(null, { emitEvent: false });
        this.teamOptions.set([]);
        this.syncTeamControlState();

        if (departmentId == null) {
          return;
        }

        this.loadTeams(departmentId);
      });

    this.syncDepartmentControlState();
    this.syncTeamControlState();
  }

  private loadCompanies(): void {
    this.isCompaniesLoading.set(true);
    this.userApi.getCompanies()
      .pipe(
        finalize(() => this.isCompaniesLoading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: companies => this.companyOptions.set(companies),
        error: () => this.companyOptions.set([])
      });
  }

  private loadDepartments(companyId: number): void {
    this.isDepartmentsLoading.set(true);
    this.syncDepartmentControlState();
    this.userApi.getDepartments(companyId)
      .pipe(
        finalize(() => {
          this.isDepartmentsLoading.set(false);
          this.syncDepartmentControlState();
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: departments => this.departmentOptions.set(departments),
        error: () => this.departmentOptions.set([])
      });
  }

  private loadTeams(departmentId: number): void {
    this.isTeamsLoading.set(true);
    this.syncTeamControlState();
    this.userApi.getTeams(departmentId)
      .pipe(
        finalize(() => {
          this.isTeamsLoading.set(false);
          this.syncTeamControlState();
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: teams => this.teamOptions.set(teams),
        error: () => this.teamOptions.set([])
      });
  }

  private loadManagers(companyId?: number | null): void {
    this.isManagersLoading.set(true);
    this.userApi.getManagers(companyId ?? null)
      .pipe(
        finalize(() => this.isManagersLoading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: managers => this.managerLookupOptions.set(managers),
        error: () => this.managerLookupOptions.set([])
      });
  }

  private syncDepartmentControlState(): void {
    this.setControlDisabled(
      this.form.controls.departmentId,
      !this.form.controls.companyId.value || this.isDepartmentsLoading()
    );
  }

  private syncTeamControlState(): void {
    this.setControlDisabled(
      this.form.controls.teamId,
      !this.form.controls.departmentId.value || this.isTeamsLoading()
    );
  }

  private setControlDisabled(control: AbstractControl, shouldDisable: boolean): void {
    if (shouldDisable && control.enabled) {
      control.disable({ emitEvent: false });
      return;
    }
    if (!shouldDisable && control.disabled) {
      control.enable({ emitEvent: false });
    }
  }

  isFieldInvalid(controlName: 'firstName' | 'lastName' | 'email' | 'password' | 'companyId'): boolean {
    const control = this.form.controls[controlName];
    return control.touched && control.invalid;
  }

  private setPasswordRequired(required: boolean): void {
    if (required) {
      this.form.controls.password.setValidators([Validators.required]);
    } else {
      this.form.controls.password.clearValidators();
    }
    this.form.controls.password.updateValueAndValidity({ emitEvent: false });
  }

  formatRole(role: string): string {
    return formatRoleLabel(this.toInternalRoleName(this.toExternalRole(role)));
  }

  roleMeta(role: string): { label: string; tone: string } {
    return ADMIN_ROLE_BADGES[role] ?? { label: role, tone: 'neutral' };
  }

  initials(user: AdminUser): string {
    return `${user.prenom[0] ?? ''}${user.nom[0] ?? ''}`.toUpperCase();
  }

  avatarColor(user: AdminUser): string {
    const colors = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#3b82f6'];
    const value = `${user.prenom}${user.nom}`;
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = value.charCodeAt(index) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  managerName(user: AdminUser): string {
    const managerId = user.managerId ?? null;
    if (managerId == null) {
      return 'Non assignÃ©';
    }
    const manager = this.allUsers().find(candidate => candidate.id === managerId);
    if (manager) {
      return `${manager.prenom} ${manager.nom}`;
    }

    const managerLabel = (user as AdminUser & { managerNom?: string }).managerNom;
    return managerLabel?.trim() || 'Non assignÃ©';
  }

  managerLookupOptionsFor(excludedUserId: number | null): UserOption[] {
    return this.managerLookupOptions().filter(manager => manager.id !== excludedUserId);
  }

  onSearchInput(value: string): void {
    this.searchDraft.set(value);
    this.searchInput$.next(value);
  }

  onRoleFilterChange(value: string): void {
    this.applyFilterChange(() => this.roleFilter.set(value));
  }

  onStatusFilterChange(value: string): void {
    this.applyFilterChange(() => this.statusFilter.set(value));
  }

  onEntrepriseFilterChange(value: string): void {
    this.applyFilterChange(() => this.entrepriseFilter.set(value));
  }

  onSortChange(value: 'name-asc' | 'name-desc' | 'role-asc' | 'role-desc' | 'status-asc' | 'status-desc'): void {
    this.sortBy.set(value);
  }

  private applyFilterChange(update: () => void): void {
    update();
    if (this.page() !== 0) {
      this.page.set(0);
      this.loadUsers();
    }
  }

  loadReferenceData(): void {
    this.isReferenceLoading.set(true);
    this.referenceWarning.set('');

    const roles$ = this.optionalReference(
      this.api.getRoles({ silent: true }),
      [] as AdminRole[],
      'roles'
    );
    const entreprises$ = this.optionalReference(
      this.fetchAllPages<AdminEntreprise>((page, size) => this.api.getEntreprises(page, size, { silent: true })),
      [] as AdminEntreprise[],
      'entreprises'
    );
    const departements$ = this.optionalReference(
      this.fetchAllPages<AdminDepartement>((page, size) => this.api.getDepartements(page, size, { silent: true })),
      [] as AdminDepartement[],
      'departements'
    );
    const equipes$ = this.optionalReference(
      this.fetchAllPages<AdminEquipe>((page, size) => this.api.getEquipes(page, size, { silent: true })),
      [] as AdminEquipe[],
      'equipes'
    );
    const usersPool$ = this.optionalReference(
      this.fetchAllPages<AdminUser>((page, size) => this.api.getUsers(page, size, { silent: true })),
      [] as AdminUser[],
      'users'
    );

    forkJoin({
      roles: roles$,
      entreprises: entreprises$,
      departements: departements$,
      equipes: equipes$,
      users: usersPool$
    })
      .pipe(
        finalize(() => this.isReferenceLoading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(reference => {
        this.roles.set(reference.roles.data.length > 0 ? reference.roles.data : this.fallbackRoles());
        this.entreprises.set(reference.entreprises.data);
        this.departements.set(reference.departements.data);
        this.equipes.set(reference.equipes.data);
        this.allUsers.set(reference.users.data);

        const failedLabels = [
          reference.roles.failed ? 'roles' : '',
          reference.entreprises.failed ? 'entreprises' : '',
          reference.departements.failed ? 'departements' : '',
          reference.equipes.failed ? 'equipes' : '',
          reference.users.failed ? 'utilisateurs' : ''
        ].filter(Boolean);

        this.referenceWarning.set(
          failedLabels.length > 0
            ? `Donnees partielles: ${failedLabels.join(', ')} indisponibles.`
            : ''
        );
      });
  }

  private optionalReference<T>(source$: Observable<T>, fallback: T, key: string): Observable<ReferenceResult<T>> {
    return source$.pipe(
      map(data => ({ key, data, failed: false })),
      catchError(() => of({ key, data: fallback, failed: true }))
    );
  }

  private fetchAllPages<T>(
    fetchPage: (page: number, size: number) => Observable<AdminPage<T>>,
    pageSize = 100,
    maxPages = 50
  ): Observable<T[]> {
    return fetchPage(0, pageSize).pipe(
      switchMap(firstPage => {
        const firstContent = Array.isArray(firstPage.content) ? firstPage.content : [];
        const resolvedSize = Math.max(Number(firstPage.size || pageSize), 1);
        const computedPages = firstPage.totalPages && firstPage.totalPages > 0
          ? firstPage.totalPages
          : Math.ceil((firstPage.totalElements || firstContent.length) / resolvedSize);
        const totalPages = Math.max(1, Math.min(computedPages, maxPages));

        if (totalPages <= 1) {
          return of(firstContent);
        }

        const remainingRequests = Array.from({ length: totalPages - 1 }, (_, index) =>
          fetchPage(index + 1, pageSize)
        );

        return forkJoin(remainingRequests).pipe(
          map(remainingPages => [firstPage, ...remainingPages]
            .flatMap(page => Array.isArray(page.content) ? page.content : []))
        );
      })
    );
  }

  loadUsers(): void {
    this.isLoading.set(true);
    this.listError.set('');
    this.menuOpenId.set(null);

    this.api.getUsers(this.page(), this.size(), { silent: true })
      .pipe(
        finalize(() => this.isLoading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: page => {
          this.users.set(page.content ?? []);
          this.totalElements.set(Number(page.totalElements ?? (page.content ?? []).length));
          const resolvedTotalPages = Number(page.totalPages ?? 0);
          this.totalPages.set(Math.max(1, resolvedTotalPages > 0 ? resolvedTotalPages : Math.ceil(this.totalElements() / Math.max(this.size(), 1))));
        },
        error: error => {
          this.users.set([]);
          this.totalElements.set(0);
          this.totalPages.set(1);
          this.listError.set(this.extractErrorMessage(error, 'Impossible de charger les utilisateurs.'));
        }
      });
  }

  onRefresh(): void {
    this.loadReferenceData();
    this.loadUsers();
    this.loadCompanies();
    this.loadManagers();
  }

  changePage(offset: number): void {
    if (offset === 0 || this.isBusy()) {
      return;
    }
    const next = Math.max(0, this.page() + offset);
    if (next === this.page()) {
      return;
    }
    this.page.set(next);
    this.loadUsers();
  }

  toggleMenu(id: number, event: Event): void {
    event.stopPropagation();
    this.menuOpenId.update(current => current === id ? null : id);
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.menuOpenId.set(null);
  }

  openCreate(): void {
    this.menuOpenId.set(null);
    this.editingUser.set(null);
    this.setPasswordRequired(true);
    if (this.companyOptions().length === 0) {
      this.loadCompanies();
    }
    this.form.reset({
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      phone: '',
      position: '',
      status: 'ACTIVE',
      role: 'EMPLOYEE',
      companyId: null,
      departmentId: null,
      teamId: null,
      managerId: null
    }, { emitEvent: false });
    this.departmentOptions.set([]);
    this.teamOptions.set([]);
    this.syncDepartmentControlState();
    this.syncTeamControlState();
    this.loadManagers();
    this.showForm.set(true);
  }

  openEdit(user: AdminUser): void {
    this.menuOpenId.set(null);
    this.editingUser.set(user);
    this.setPasswordRequired(false);
    if (this.companyOptions().length === 0) {
      this.loadCompanies();
    }
    const companyId = user.entrepriseId ?? null;
    const departmentId = user.departementId ?? null;
    this.form.reset({
      firstName: user.prenom,
      lastName: user.nom,
      email: user.email,
      password: '',
      phone: user.telephone ?? '',
      position: user.poste ?? '',
      status: this.toExternalStatus(user.statut),
      role: this.toExternalRole(this.primaryRole(user)),
      companyId,
      departmentId,
      teamId: user.equipeId ?? null,
      managerId: user.managerId ?? null
    }, { emitEvent: false });
    if (companyId != null) {
      this.loadDepartments(companyId);
      this.loadManagers(companyId);
    } else {
      this.departmentOptions.set([]);
      this.teamOptions.set([]);
      this.loadManagers();
    }
    if (departmentId != null) {
      this.loadTeams(departmentId);
    } else {
      this.teamOptions.set([]);
    }
    this.syncDepartmentControlState();
    this.syncTeamControlState();
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
    this.editingUser.set(null);
  }

  openDetails(user: AdminUser): void {
    this.menuOpenId.set(null);
    this.viewUser.set(user);
  }

  closeDetails(): void {
    this.viewUser.set(null);
  }

  openAssignManager(user: AdminUser): void {
    this.menuOpenId.set(null);
    this.managerTargetUser.set(user);
    this.selectedManagerId.set(user.managerId ?? null);
    this.loadManagers(user.entrepriseId ?? null);
  }

  closeAssignManager(): void {
    this.managerTargetUser.set(null);
    this.selectedManagerId.set(null);
  }

  saveManagerAssignment(): void {
    const target = this.managerTargetUser();
    if (!target || this.isActionSaving()) {
      return;
    }

    const payload = this.buildUserPayloadFromAdminUser(target, { managerId: this.selectedManagerId() });
    if (!payload) {
      this.toast.error('Impossible de mettre a jour le manager: entreprise manquante.');
      return;
    }

    this.isActionSaving.set(true);
    this.userApi.updateUser(target.id, payload)
      .pipe(
        finalize(() => this.isActionSaving.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: updated => {
          this.updateLocalUser(this.toAdminUser(updated, target));
          this.toast.success('Manager mis Ã  jour.');
          this.closeAssignManager();
          this.reloadUsersPool();
        },
        error: error => this.toast.error(this.extractErrorMessage(error, 'Impossible de mettre a jour le manager.'))
      });
  }

  openRoleChange(user: AdminUser): void {
    this.menuOpenId.set(null);
    this.roleTargetUser.set(user);
    this.roleDraft.set(this.toExternalRole(this.primaryRole(user)));
  }

  closeRoleChange(): void {
    this.roleTargetUser.set(null);
    this.roleDraft.set(null);
  }

  selectRoleDraft(role: UserRole): void {
    this.roleDraft.set(role);
  }

  saveRoleChange(): void {
    const target = this.roleTargetUser();
    const role = this.roleDraft();
    if (!target || !role || this.isActionSaving()) {
      return;
    }

    const payload = this.buildUserPayloadFromAdminUser(target, { role });
    if (!payload) {
      this.toast.error('Impossible de modifier le rÃ´le: entreprise manquante.');
      return;
    }

    this.isActionSaving.set(true);
    this.userApi.updateUser(target.id, payload)
      .pipe(
        finalize(() => this.isActionSaving.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: updated => {
          this.updateLocalUser(this.toAdminUser(updated, target));
          this.toast.success('RÃ´le mis Ã  jour.');
          this.closeRoleChange();
          this.reloadUsersPool();
        },
        error: error => this.toast.error(this.extractErrorMessage(error, 'Impossible de modifier le rÃ´le.'))
      });
  }

  toggleStatus(user: AdminUser): void {
    if (this.isActionSaving()) {
      return;
    }

    this.menuOpenId.set(null);
    const status = this.toExternalStatus(user.statut) === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const payload = this.buildUserPayloadFromAdminUser(user, { status });
    if (!payload) {
      this.toast.error('Impossible de changer le statut: entreprise manquante.');
      return;
    }

    this.isActionSaving.set(true);
    this.userApi.updateUser(user.id, payload)
      .pipe(
        finalize(() => this.isActionSaving.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: updated => {
          this.updateLocalUser(this.toAdminUser(updated, user));
          this.toast.success('Statut mis Ã  jour.');
        },
        error: error => this.toast.error(this.extractErrorMessage(error, 'Impossible de changer le statut.'))
      });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const payload: UserUpsertPayload = {
      firstName: value.firstName ?? '',
      lastName: value.lastName ?? '',
      email: value.email ?? '',
      password: value.password ? value.password : undefined,
      phone: value.phone || undefined,
      position: value.position || undefined,
      status: value.status ?? 'ACTIVE',
      role: value.role ?? 'EMPLOYEE',
      companyId: Number(value.companyId),
      departmentId: value.departmentId ?? null,
      teamId: value.teamId ?? null,
      managerId: value.managerId ?? null
    };

    this.isSaving.set(true);
    const request$ = this.editingUser()
      ? this.userApi.updateUser(this.editingUser()!.id, payload)
      : this.userApi.createUser(payload);

    request$
      .pipe(
        finalize(() => this.isSaving.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: updated => {
          const edited = this.editingUser();
          if (edited) {
            this.updateLocalUser(this.toAdminUser(updated, edited));
          }
          this.toast.success(edited ? 'Utilisateur mis Ã  jour.' : 'Utilisateur crÃ©Ã©.');
          this.setPasswordRequired(true);
          this.form.reset({
            firstName: '',
            lastName: '',
            email: '',
            password: '',
            phone: '',
            position: '',
            status: 'ACTIVE',
            role: 'EMPLOYEE',
            companyId: null,
            departmentId: null,
            teamId: null,
            managerId: null
          }, { emitEvent: false });
          this.departmentOptions.set([]);
          this.teamOptions.set([]);
          this.syncDepartmentControlState();
          this.syncTeamControlState();
          this.loadManagers();
          this.closeForm();
          this.reloadUsersPool();
          this.loadUsers();
        },
        error: error => this.toast.error(this.extractErrorMessage(error, 'Impossible d enregistrer cet utilisateur.'))
      });
  }

  remove(user: AdminUser): void {
    this.menuOpenId.set(null);
    if (!confirm(`Supprimer ${user.prenom} ${user.nom} ?`)) {
      return;
    }

    this.isActionSaving.set(true);
    this.userApi.deleteUser(user.id)
      .pipe(
        finalize(() => this.isActionSaving.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          this.toast.success('Utilisateur supprimÃ©.');
          this.loadUsers();
          this.reloadUsersPool();
        },
        error: error => this.toast.error(this.extractErrorMessage(error, 'Impossible de supprimer cet utilisateur.'))
      });
  }

  private reloadUsersPool(): void {
    this.fetchAllPages<AdminUser>((page, size) => this.api.getUsers(page, size, { silent: true }))
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: users => this.allUsers.set(users),
        error: () => {
          // keep current cache silently
        }
      });
  }

  private updateLocalUser(updated: AdminUser): void {
    this.users.update(users => users.map(user => user.id === updated.id ? updated : user));
    this.allUsers.update(users => {
      const index = users.findIndex(user => user.id === updated.id);
      if (index === -1) {
        return [updated, ...users];
      }
      const copy = [...users];
      copy[index] = updated;
      return copy;
    });
  }

  private buildUserPayloadFromAdminUser(
    user: AdminUser,
    overrides: Partial<Pick<UserUpsertPayload, 'role' | 'status' | 'managerId'>> = {}
  ): UserUpsertPayload | null {
    const companyId = Number(user.entrepriseId ?? 0);
    if (!Number.isFinite(companyId) || companyId <= 0) {
      return null;
    }

    return {
      firstName: user.prenom ?? '',
      lastName: user.nom ?? '',
      email: user.email,
      password: undefined,
      phone: user.telephone || undefined,
      position: user.poste || undefined,
      status: overrides.status ?? this.toExternalStatus(user.statut),
      role: overrides.role ?? this.toExternalRole(this.primaryRole(user)),
      companyId,
      departmentId: user.departementId ?? null,
      teamId: user.equipeId ?? null,
      managerId: Object.prototype.hasOwnProperty.call(overrides, 'managerId')
        ? overrides.managerId ?? null
        : user.managerId ?? null
    };
  }

  private toAdminUser(source: UserListItem, fallback?: AdminUser): AdminUser {
    const names = this.splitDisplayName(source.name, fallback);
    const fallbackRole = fallback ? this.primaryRole(fallback) : 'EMPLOYEE';
    const role = this.toExternalRole(source.role ?? fallback?.role ?? fallbackRole);
    const managerId = source.manager?.id ?? fallback?.managerId;
    const managerNom = source.manager?.name ?? fallback?.managerNom;
    const entrepriseId = source.company?.id ?? fallback?.entrepriseId;
    const entrepriseNom = source.company?.name ?? fallback?.entrepriseNom;

    return {
      ...(fallback ?? {}),
      id: Number(source.id ?? fallback?.id ?? 0),
      nom: names.lastName,
      prenom: names.firstName,
      email: source.email ?? fallback?.email ?? '',
      statut: this.toInternalStatus(source.status ?? fallback?.statut),
      managerId,
      managerNom,
      entrepriseId,
      entrepriseNom,
      role,
      roles: [this.roleToAdminRole(role)]
    } as AdminUser;
  }

  primaryRole(user: AdminUser): string {
    return this.resolvePrimaryRoleEntity(user)?.nom ?? 'ROLE_EMPLOYEE';
  }

  toExternalRole(role: string): UserRole {
    const normalized = String(role ?? '').trim().toUpperCase();
    switch (normalized) {
      case 'ROLE_ADMIN':
      case 'ADMIN':
        return 'ADMIN';
      case 'ROLE_RH':
      case 'RH':
        return 'RH';
      case 'ROLE_MANAGER':
      case 'MANAGER':
        return 'MANAGER';
      default:
        return 'EMPLOYEE';
    }
  }

  private toExternalStatus(status: string): 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' {
    const normalized = String(status ?? '').trim().toUpperCase();
    switch (normalized) {
      case 'ACTIF':
      case 'ACTIVE':
        return 'ACTIVE';
      case 'SUSPENDU':
      case 'SUSPENDED':
        return 'SUSPENDED';
      default:
        return 'INACTIVE';
    }
  }

  private toInternalStatus(status: string | undefined): 'ACTIF' | 'INACTIF' {
    const normalized = String(status ?? '').trim().toUpperCase();
    return normalized === 'ACTIVE' || normalized === 'ACTIF' ? 'ACTIF' : 'INACTIF';
  }

  private roleToAdminRole(role: string): AdminRole {
    const canonical = this.toExternalRole(role);
    return this.roles().find(candidate => this.toExternalRole(candidate.nom) === canonical)
      ?? { id: 0, nom: this.toInternalRoleName(canonical) };
  }

  private fallbackRoles(): AdminRole[] {
    return CREATE_ROLE_OPTIONS.map((role, index) => ({
      id: -(index + 1),
      nom: this.toInternalRoleName(role)
    }));
  }

  private toInternalRoleName(role: string): string {
    return `ROLE_${this.toExternalRole(role)}`;
  }

  private splitDisplayName(name: string | undefined, fallback?: AdminUser): { firstName: string; lastName: string } {
    const normalized = String(name ?? '').trim();
    if (!normalized) {
      return {
        firstName: fallback?.prenom ?? '',
        lastName: fallback?.nom ?? ''
      };
    }

    const parts = normalized.split(/\s+/);
    if (parts.length === 1) {
      return {
        firstName: fallback?.prenom ?? parts[0],
        lastName: fallback?.nom ?? ''
      };
    }

    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(' ')
    };
  }

  private resolvePrimaryRoleEntity(user: AdminUser): AdminRole | null {
    const explicitRole = (user as AdminUser & { role?: string }).role;
    if (explicitRole) {
      const canonical = this.toExternalRole(explicitRole);
      const fromReference = this.roles().find(role => this.toExternalRole(role.nom) === canonical);
      if (fromReference) {
        return fromReference;
      }
      return { id: 0, nom: this.toInternalRoleName(canonical) };
    }

    const roles = Array.isArray(user.roles) ? user.roles : [];
    if (roles.length === 0) {
      return null;
    }

    const findBy = (name: string) => roles.find(role => role.nom === name) ?? null;
    return findBy('ROLE_ADMIN')
      ?? findBy('ROLE_RH')
      ?? findBy('ROLE_MANAGER')
      ?? findBy('ROLE_EMPLOYEE')
      ?? roles[0];
  }

  private extractErrorMessage(error: unknown, fallback: string): string {
    const payload = error as { error?: { details?: string; message?: string; error?: string }; message?: string } | null;
    const message = payload?.error?.details
      ?? payload?.error?.message
      ?? payload?.error?.error
      ?? payload?.message;

    const normalized = String(message ?? '').trim();
    return normalized.length > 0 ? normalized : fallback;
  }

  protected readonly adminRoleOptions = ADMIN_ROLE_OPTIONS;
}
