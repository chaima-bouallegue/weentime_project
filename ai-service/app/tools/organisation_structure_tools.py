from __future__ import annotations

from functools import partial
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.context.current_user import CurrentUserContext
from app.models.tool_models import ToolDefinition

from .backend_client import BackendClient
from .registry import ToolRegistry
from .result import ToolResult, build_read_result, build_write_result

ADMIN_RH_ROLES = {"ADMIN", "RH"}
READ_ROLES = {"ADMIN", "RH", "MANAGER"}


class PageInput(BaseModel):
    page: int = Field(default=0, ge=0)
    size: int = Field(default=50, ge=1, le=200)


class ListTeamsInput(PageInput):
    pass


class ListDepartmentsInput(PageInput):
    pass


class TeamMembersInput(PageInput):
    team_id: int = Field(gt=0)


class SearchEmployeeInput(PageInput):
    query: str = Field(min_length=1, max_length=160)
    managers_only: bool = False


class ListEmployeesInput(PageInput):
    managers_only: bool = False


class CreateTeamInput(BaseModel):
    nom: str = Field(min_length=1, max_length=120)
    departement_id: int = Field(gt=0)
    description: str | None = Field(default=None, max_length=255)
    responsable_id: int | None = Field(default=None, gt=0)
    effectif_maximum: int | None = Field(default=None, ge=1, le=10_000)
    est_active: bool = True


class UpdateTeamInput(BaseModel):
    team_id: int = Field(gt=0)
    nom: str | None = Field(default=None, min_length=1, max_length=120)
    departement_id: int | None = Field(default=None, gt=0)
    description: str | None = Field(default=None, max_length=255)
    responsable_id: int | None = Field(default=None, gt=0)
    effectif_maximum: int | None = Field(default=None, ge=1, le=10_000)
    est_active: bool | None = None


class DeleteTeamInput(BaseModel):
    team_id: int = Field(gt=0)


class CreateDepartmentInput(BaseModel):
    nom: str = Field(min_length=2, max_length=100)
    code_interne: str = Field(min_length=1, max_length=32)
    description: str | None = Field(default=None, max_length=255)
    entreprise_id: int | None = Field(default=None, gt=0)

    @field_validator("code_interne")
    @classmethod
    def _validate_code_interne(cls, value: str) -> str:
        text = (value or "").strip().upper()
        if not text:
            raise ValueError("code_interne required")
        for char in text:
            if not (char.isalnum() or char == "-"):
                raise ValueError("code_interne accepte uniquement lettres majuscules, chiffres et tirets")
        return text


class UpdateDepartmentInput(BaseModel):
    department_id: int = Field(gt=0)
    nom: str | None = Field(default=None, min_length=2, max_length=100)
    code_interne: str | None = Field(default=None, min_length=1, max_length=32)
    description: str | None = Field(default=None, max_length=255)
    entreprise_id: int | None = Field(default=None, gt=0)

    @field_validator("code_interne")
    @classmethod
    def _validate_optional_code_interne(cls, value: str | None) -> str | None:
        if value is None:
            return None
        text = (value or "").strip().upper()
        if not text:
            raise ValueError("code_interne required")
        for char in text:
            if not (char.isalnum() or char == "-"):
                raise ValueError("code_interne accepte uniquement lettres majuscules, chiffres et tirets")
        return text


class DeleteDepartmentInput(BaseModel):
    department_id: int = Field(gt=0)


class AssignEmployeeTeamInput(BaseModel):
    user_id: int = Field(gt=0)
    team_id: int = Field(gt=0)
    department_id: int | None = Field(default=None, gt=0)


class AssignManagerTeamInput(BaseModel):
    manager_id: int = Field(gt=0)
    team_id: int = Field(gt=0)


class CreateUserInput(BaseModel):
    nom: str = Field(min_length=1, max_length=120)
    prenom: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=5, max_length=255)
    mot_de_passe: str | None = Field(default=None, max_length=255)
    telephone: str | None = Field(default=None, max_length=60)
    poste: str | None = Field(default=None, max_length=120)
    statut: str = Field(default="ACTIF", min_length=1, max_length=40)
    entreprise_id: int | None = Field(default=None, gt=0)
    department_id: int | None = Field(default=None, gt=0)
    team_id: int | None = Field(default=None, gt=0)
    role: str | None = Field(default=None, max_length=40)
    role_ids: list[int] | None = None

    @field_validator("statut", "role")
    @classmethod
    def _uppercase_strings(cls, value: str | None) -> str | None:
        if value is None:
            return None
        text = (value or "").strip().upper()
        return text or None


class ToggleEmployeeInput(BaseModel):
    user_id: int = Field(gt=0)


class OrganisationStructureTools:
    def __init__(self, backend_client: BackendClient) -> None:
        self.backend_client = backend_client

    def register(self, registry: ToolRegistry) -> None:
        self._register_read(
            registry,
            "organisation.list_departments",
            "Liste les departements visibles dans la structure d'entreprise.",
            ListDepartmentsInput,
            self.list_departments,
        )
        self._register_read(
            registry,
            "organisation.list_teams",
            "Liste les equipes visibles dans la structure d'entreprise.",
            ListTeamsInput,
            self.list_teams,
        )
        self._register_read(
            registry,
            "organisation.team_members",
            "Liste les membres d'une equipe verifiee.",
            TeamMembersInput,
            self.team_members,
        )
        self._register_read(
            registry,
            "rh.structure.team.members",
            "Liste les membres d'une equipe verifiee pour le flux RH.",
            TeamMembersInput,
            self.team_members,
        )
        self._register_read(
            registry,
            "organisation.list_employees",
            "Liste les employes visibles pour l'entreprise connectee.",
            ListEmployeesInput,
            self.list_employees,
        )
        self._register_read(
            registry,
            "organisation.search_employee",
            "Recherche un employe ou un manager par nom, email, poste ou equipe.",
            SearchEmployeeInput,
            self.search_employee,
        )

        self._register_write(
            registry,
            "organisation.create_department",
            "Cree un nouveau departement dans l'entreprise du caller.",
            CreateDepartmentInput,
            partial(self._create_department, tool_name="organisation.create_department"),
        )
        self._register_write(
            registry,
            "rh.structure.department.create",
            "Cree un nouveau departement RH dans l'entreprise du caller.",
            CreateDepartmentInput,
            partial(self._create_department, tool_name="rh.structure.department.create"),
        )
        self._register_write(
            registry,
            "organisation.update_department",
            "Met a jour un departement existant apres confirmation.",
            UpdateDepartmentInput,
            partial(self._update_department, tool_name="organisation.update_department"),
        )
        self._register_write(
            registry,
            "rh.structure.department.update",
            "Met a jour un departement RH existant apres confirmation.",
            UpdateDepartmentInput,
            partial(self._update_department, tool_name="rh.structure.department.update"),
        )
        self._register_write(
            registry,
            "organisation.delete_department",
            "Supprime un departement existant apres confirmation.",
            DeleteDepartmentInput,
            partial(self._delete_department, tool_name="organisation.delete_department"),
        )
        self._register_write(
            registry,
            "rh.structure.department.delete",
            "Supprime un departement RH existant apres confirmation.",
            DeleteDepartmentInput,
            partial(self._delete_department, tool_name="rh.structure.department.delete"),
        )

        self._register_write(
            registry,
            "organisation.create_team",
            "Cree une nouvelle equipe rattachee a un departement existant.",
            CreateTeamInput,
            partial(self._create_team, tool_name="organisation.create_team"),
        )
        self._register_write(
            registry,
            "rh.structure.team.create",
            "Cree une nouvelle equipe RH rattachee a un departement existant.",
            CreateTeamInput,
            partial(self._create_team, tool_name="rh.structure.team.create"),
        )
        self._register_write(
            registry,
            "organisation.update_team",
            "Met a jour une equipe existante apres confirmation.",
            UpdateTeamInput,
            partial(self._update_team, tool_name="organisation.update_team"),
        )
        self._register_write(
            registry,
            "rh.structure.team.update",
            "Met a jour une equipe RH existante apres confirmation.",
            UpdateTeamInput,
            partial(self._update_team, tool_name="rh.structure.team.update"),
        )
        self._register_write(
            registry,
            "organisation.delete_team",
            "Supprime une equipe existante apres confirmation.",
            DeleteTeamInput,
            partial(self._delete_team, tool_name="organisation.delete_team"),
        )
        self._register_write(
            registry,
            "rh.structure.team.delete",
            "Supprime une equipe RH existante apres confirmation.",
            DeleteTeamInput,
            partial(self._delete_team, tool_name="rh.structure.team.delete"),
        )

        self._register_write(
            registry,
            "organisation.assign_employee_team",
            "Affecte un employe existant a une equipe verifiee.",
            AssignEmployeeTeamInput,
            partial(self._assign_employee_team, tool_name="organisation.assign_employee_team"),
        )
        self._register_write(
            registry,
            "rh.structure.employee.assign_team",
            "Affecte un employe existant a une equipe verifiee.",
            AssignEmployeeTeamInput,
            partial(self._assign_employee_team, tool_name="rh.structure.employee.assign_team"),
        )
        self._register_write(
            registry,
            "organisation.assign_manager_team",
            "Affecte un manager existant comme responsable d'une equipe.",
            AssignManagerTeamInput,
            partial(self._assign_manager_team, tool_name="organisation.assign_manager_team"),
        )
        self._register_write(
            registry,
            "rh.structure.manager.assign_team",
            "Affecte un manager existant comme responsable d'une equipe.",
            AssignManagerTeamInput,
            partial(self._assign_manager_team, tool_name="rh.structure.manager.assign_team"),
        )

        self._register_write(
            registry,
            "organisation.create_employee",
            "Cree un employe dans l'entreprise connectee.",
            CreateUserInput,
            partial(self._create_user, tool_name="organisation.create_employee", role_override="EMPLOYEE"),
        )
        self._register_write(
            registry,
            "rh.structure.employee.create",
            "Cree un employe dans l'entreprise connectee.",
            CreateUserInput,
            partial(self._create_user, tool_name="rh.structure.employee.create", role_override="EMPLOYEE"),
        )
        self._register_write(
            registry,
            "organisation.create_manager",
            "Cree un manager dans l'entreprise connectee.",
            CreateUserInput,
            partial(self._create_user, tool_name="organisation.create_manager", role_override="MANAGER"),
        )
        self._register_write(
            registry,
            "rh.structure.manager.create",
            "Cree un manager dans l'entreprise connectee.",
            CreateUserInput,
            partial(self._create_user, tool_name="rh.structure.manager.create", role_override="MANAGER"),
        )
        self._register_write(
            registry,
            "organisation.activate_employee",
            "Active un employe existant.",
            ToggleEmployeeInput,
            partial(self._set_employee_active, tool_name="organisation.activate_employee", desired_active=True),
        )
        self._register_write(
            registry,
            "rh.structure.employee.activate",
            "Active un employe existant.",
            ToggleEmployeeInput,
            partial(self._set_employee_active, tool_name="rh.structure.employee.activate", desired_active=True),
        )
        self._register_write(
            registry,
            "organisation.deactivate_employee",
            "Desactive un employe existant.",
            ToggleEmployeeInput,
            partial(self._set_employee_active, tool_name="organisation.deactivate_employee", desired_active=False),
        )
        self._register_write(
            registry,
            "rh.structure.employee.deactivate",
            "Desactive un employe existant.",
            ToggleEmployeeInput,
            partial(self._set_employee_active, tool_name="rh.structure.employee.deactivate", desired_active=False),
        )

    def _register_read(
        self,
        registry: ToolRegistry,
        name: str,
        description: str,
        input_model: type[BaseModel],
        handler: Any,
    ) -> None:
        registry.register(
            ToolDefinition(
                name=name,
                description=description,
                input_model=input_model,
                output_model=None,
                type="read",
                allowed_roles=READ_ROLES,
            ),
            handler,
        )

    def _register_write(
        self,
        registry: ToolRegistry,
        name: str,
        description: str,
        input_model: type[BaseModel],
        handler: Any,
    ) -> None:
        registry.register(
            ToolDefinition(
                name=name,
                description=description,
                input_model=input_model,
                output_model=None,
                type="write",
                allowed_roles=ADMIN_RH_ROLES,
                requires_confirmation=True,
                idempotency_required=True,
            ),
            handler,
        )

    async def list_departments(self, payload: ListDepartmentsInput, context: CurrentUserContext) -> ToolResult:
        result = await self.backend_client.get("/structure/departments", context=context)
        if not result.success:
            fallback = await self.backend_client.get(
                "/organisations/departements",
                context=context,
                params={"page": payload.page, "size": payload.size},
            )
            if not fallback.success:
                return _read_failure("organisation.list_departments", fallback, "Impossible de charger les departements.")
            result = fallback
        items = _slice_items(_extract_items(result.data), payload.page, payload.size)
        count = _extract_count(result.data, items)
        summary = "Aucun departement trouve." if count == 0 else f"{count} departement(s) trouve(s)."
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="organisation.list_departments",
                    summary=summary,
                    items=items,
                    count=count,
                    data=result.data,
                    backend_status=result.status_code,
                    empty=count == 0,
                )
            },
            warnings=result.warnings,
            status_code=result.status_code,
        )

    async def list_teams(self, payload: ListTeamsInput, context: CurrentUserContext) -> ToolResult:
        result = await self.backend_client.get("/structure/teams", context=context)
        if not result.success:
            fallback = await self.backend_client.get(
                "/organisations/equipes",
                context=context,
                params={"page": payload.page, "size": payload.size},
            )
            if not fallback.success:
                return _read_failure("organisation.list_teams", fallback, "Impossible de charger les equipes.")
            result = fallback
        items = _slice_items(_extract_items(result.data), payload.page, payload.size)
        count = _extract_count(result.data, items)
        summary = "Aucune equipe trouvee." if count == 0 else f"{count} equipe(s) trouvee(s)."
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="organisation.list_teams",
                    summary=summary,
                    items=items,
                    count=count,
                    data=result.data,
                    backend_status=result.status_code,
                    empty=count == 0,
                )
            },
            warnings=result.warnings,
            status_code=result.status_code,
        )

    async def team_members(self, payload: TeamMembersInput, context: CurrentUserContext) -> ToolResult:
        result = await self.backend_client.get(
            f"/organisations/equipes/{payload.team_id}/members",
            context=context,
            params={"page": payload.page, "size": payload.size},
        )
        if not result.success:
            return _read_failure("organisation.team_members", result, "Impossible de charger les membres de l'equipe.")
        items = _extract_items(result.data)
        count = _extract_count(result.data, items)
        summary = "Aucun membre trouve pour cette equipe." if count == 0 else f"{count} membre(s) trouve(s) pour cette equipe."
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="organisation.team_members",
                    summary=summary,
                    items=items,
                    count=count,
                    data=result.data,
                    backend_status=result.status_code,
                    empty=count == 0,
                )
            },
            warnings=result.warnings,
            status_code=result.status_code,
        )

    async def list_employees(self, payload: ListEmployeesInput, context: CurrentUserContext) -> ToolResult:
        return await self._list_people(
            tool_name="organisation.list_employees",
            payload=payload,
            context=context,
            managers_only=payload.managers_only,
        )

    async def search_employee(self, payload: SearchEmployeeInput, context: CurrentUserContext) -> ToolResult:
        base = await self._fetch_people(context=context, managers_only=payload.managers_only)
        if not base.success:
            return _read_failure("organisation.search_employee", base, "Impossible de rechercher les employes.")
        items = _filter_people(_extract_items(base.data), payload.query)
        items = _slice_items(items, payload.page, payload.size)
        count = len(items)
        summary = "Aucun employe correspondant." if count == 0 else f"{count} employe(s) correspondant(s)."
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="organisation.search_employee",
                    summary=summary,
                    items=items,
                    count=count,
                    data={"query": payload.query, "items": items},
                    backend_status=base.status_code,
                    empty=count == 0,
                )
            },
            warnings=base.warnings,
            status_code=base.status_code,
        )

    async def _list_people(
        self,
        *,
        tool_name: str,
        payload: ListEmployeesInput,
        context: CurrentUserContext,
        managers_only: bool,
    ) -> ToolResult:
        result = await self._fetch_people(context=context, managers_only=managers_only)
        if not result.success:
            return _read_failure(tool_name, result, "Impossible de charger les employes.")
        items = _slice_items(_extract_items(result.data), payload.page, payload.size)
        count = _extract_count(result.data, items)
        subject = "manager(s)" if managers_only else "employe(s)"
        summary = f"Aucun {subject[:-3]} trouve." if count == 0 else f"{count} {subject} trouve(s)."
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name=tool_name,
                    summary=summary,
                    items=items,
                    count=count,
                    data=result.data,
                    backend_status=result.status_code,
                    empty=count == 0,
                )
            },
            warnings=result.warnings,
            status_code=result.status_code,
        )

    async def _fetch_people(self, *, context: CurrentUserContext, managers_only: bool) -> ToolResult:
        if managers_only:
            return await self.backend_client.get("/structure/managers", context=context)
        result = await self.backend_client.get("/structure/employees", context=context)
        if result.success:
            return result
        params = {"page": 0, "size": 200}
        if context.tenant_id:
            params["entrepriseId"] = context.tenant_id
        return await self.backend_client.get("/organisations/users", context=context, params=params)

    async def _create_team(self, payload: CreateTeamInput, context: CurrentUserContext, *, tool_name: str) -> ToolResult:
        body = _drop_none(
            {
                "nom": payload.nom.strip(),
                "departementId": payload.departement_id,
                "description": payload.description.strip() if payload.description else None,
                "responsableId": payload.responsable_id,
                "effectifMaximum": payload.effectif_maximum,
                "estActive": payload.est_active,
            }
        )
        result = await self.backend_client.post("/organisations/equipes", context=context, json=body)
        return _write_response(tool_name, result, f"L'equipe {payload.nom.strip()} a ete creee.")

    async def _update_team(self, payload: UpdateTeamInput, context: CurrentUserContext, *, tool_name: str) -> ToolResult:
        current = await self.backend_client.get(f"/organisations/equipes/{payload.team_id}", context=context)
        if not current.success:
            return _write_response(tool_name, current, "L'equipe a ete mise a jour.")
        data = current.data if isinstance(current.data, dict) else {}
        body = _drop_none(
            {
                "nom": (payload.nom or data.get("nom") or "").strip(),
                "description": payload.description if payload.description is not None else data.get("description"),
                "responsableId": payload.responsable_id if payload.responsable_id is not None else _as_positive_int(data.get("responsableId")),
                "effectifMaximum": payload.effectif_maximum if payload.effectif_maximum is not None else data.get("effectifMaximum"),
                "estActive": payload.est_active if payload.est_active is not None else data.get("estActive", True),
                "departementId": payload.departement_id if payload.departement_id is not None else _as_positive_int(data.get("departementId")),
            }
        )
        missing = [key for key in ("nom", "departementId", "estActive") if body.get(key) in (None, "")]
        if missing:
            return ToolResult.fail(
                "team_update_payload_incomplete",
                f"Impossible de preparer la mise a jour de l'equipe ({', '.join(missing)} manquant).",
                status_code=400,
            )
        result = await self.backend_client.request(
            "PATCH",
            f"/organisations/equipes/{payload.team_id}",
            context=context,
            json=body,
        )
        return _write_response(tool_name, result, f"L'equipe {payload.team_id} a ete mise a jour.")

    async def _delete_team(self, payload: DeleteTeamInput, context: CurrentUserContext, *, tool_name: str) -> ToolResult:
        result = await self.backend_client.request("DELETE", f"/organisations/equipes/{payload.team_id}", context=context)
        return _write_response(tool_name, result, f"L'equipe {payload.team_id} a ete supprimee.")

    async def _create_department(
        self,
        payload: CreateDepartmentInput,
        context: CurrentUserContext,
        *,
        tool_name: str,
    ) -> ToolResult:
        entreprise_id = payload.entreprise_id or context.tenant_id
        if not entreprise_id or int(entreprise_id) <= 0:
            return ToolResult.fail(
                "missing_entreprise",
                "Identifiant d'entreprise manquant pour creer un departement.",
                status_code=400,
            )
        body = _drop_none(
            {
                "nom": payload.nom.strip(),
                "description": payload.description.strip() if payload.description else None,
                "codeInterne": payload.code_interne.strip().upper(),
                "entrepriseId": int(entreprise_id),
            }
        )
        result = await self.backend_client.post("/organisations/departements", context=context, json=body)
        return _write_response(tool_name, result, f"Le departement {payload.nom.strip()} a ete cree.")

    async def _update_department(
        self,
        payload: UpdateDepartmentInput,
        context: CurrentUserContext,
        *,
        tool_name: str,
    ) -> ToolResult:
        current = await self.backend_client.get(f"/organisations/departements/{payload.department_id}", context=context)
        if not current.success:
            return _write_response(tool_name, current, "Le departement a ete mis a jour.")
        current_data = current.data if isinstance(current.data, dict) else {}
        entreprise_id = payload.entreprise_id or _as_positive_int(current_data.get("entrepriseId")) or context.tenant_id
        body = _drop_none(
            {
                "nom": (payload.nom or current_data.get("nom") or "").strip(),
                "description": payload.description if payload.description is not None else current_data.get("description"),
                "codeInterne": (payload.code_interne or current_data.get("codeInterne") or "").strip().upper(),
                "entrepriseId": int(entreprise_id) if entreprise_id else None,
            }
        )
        missing = [key for key in ("nom", "codeInterne", "entrepriseId") if body.get(key) in (None, "")]
        if missing:
            return ToolResult.fail(
                "department_update_payload_incomplete",
                f"Impossible de preparer la mise a jour ({', '.join(missing)} manquant).",
                status_code=400,
            )
        result = await self.backend_client.request(
            "PATCH",
            f"/organisations/departements/{payload.department_id}",
            context=context,
            json=body,
        )
        return _write_response(tool_name, result, f"Le departement {payload.department_id} a ete mis a jour.")

    async def _delete_department(
        self,
        payload: DeleteDepartmentInput,
        context: CurrentUserContext,
        *,
        tool_name: str,
    ) -> ToolResult:
        result = await self.backend_client.request(
            "DELETE",
            f"/organisations/departements/{payload.department_id}",
            context=context,
        )
        return _write_response(tool_name, result, f"Le departement {payload.department_id} a ete supprime.")

    async def _assign_employee_team(
        self,
        payload: AssignEmployeeTeamInput,
        context: CurrentUserContext,
        *,
        tool_name: str,
    ) -> ToolResult:
        current = await self.backend_client.get(f"/organisations/users/{payload.user_id}", context=context)
        if not current.success:
            return _write_response(tool_name, current, "L'employe a ete affecte a l'equipe.")

        team = await self.backend_client.get(f"/organisations/equipes/{payload.team_id}", context=context)
        if not team.success:
            return _write_response(tool_name, team, "L'employe a ete affecte a l'equipe.")

        user_data = current.data if isinstance(current.data, dict) else {}
        team_data = team.data if isinstance(team.data, dict) else {}
        body = _user_update_body(user_data)
        body["equipeId"] = payload.team_id
        body["departementId"] = payload.department_id or _as_positive_int(team_data.get("departementId")) or body.get("departementId")
        missing = [key for key in ("nom", "prenom", "email", "statut") if not body.get(key)]
        if missing:
            return ToolResult.fail(
                "user_update_payload_incomplete",
                f"Impossible de preparer l'affectation ({', '.join(missing)} manquant).",
                status_code=400,
            )
        result = await self.backend_client.request(
            "PATCH",
            f"/organisations/users/{payload.user_id}",
            context=context,
            json=_drop_none(body),
        )
        employee_name = _user_display_name(user_data) or str(payload.user_id)
        team_name = str(team_data.get("nom") or payload.team_id)
        return _write_response(tool_name, result, f"{employee_name} a ete affecte a l'equipe {team_name}.")

    async def _assign_manager_team(
        self,
        payload: AssignManagerTeamInput,
        context: CurrentUserContext,
        *,
        tool_name: str,
    ) -> ToolResult:
        current = await self.backend_client.get(f"/organisations/equipes/{payload.team_id}", context=context)
        if not current.success:
            return _write_response(tool_name, current, "Le manager a ete affecte a l'equipe.")
        manager = await self.backend_client.get(f"/organisations/users/{payload.manager_id}", context=context)
        if not manager.success:
            return _write_response(tool_name, manager, "Le manager a ete affecte a l'equipe.")
        team_data = current.data if isinstance(current.data, dict) else {}
        manager_data = manager.data if isinstance(manager.data, dict) else {}
        body = _drop_none(
            {
                "nom": team_data.get("nom"),
                "description": team_data.get("description"),
                "responsableId": payload.manager_id,
                "effectifMaximum": team_data.get("effectifMaximum"),
                "estActive": team_data.get("estActive", True),
                "departementId": _as_positive_int(team_data.get("departementId")),
            }
        )
        missing = [key for key in ("nom", "estActive", "departementId") if body.get(key) in (None, "")]
        if missing:
            return ToolResult.fail(
                "team_update_payload_incomplete",
                f"Impossible de preparer l'affectation manager ({', '.join(missing)} manquant).",
                status_code=400,
            )
        result = await self.backend_client.request(
            "PATCH",
            f"/organisations/equipes/{payload.team_id}",
            context=context,
            json=body,
        )
        manager_name = _user_display_name(manager_data) or str(payload.manager_id)
        team_name = str(team_data.get("nom") or payload.team_id)
        return _write_response(tool_name, result, f"{manager_name} a ete affecte comme responsable de l'equipe {team_name}.")

    async def _create_user(
        self,
        payload: CreateUserInput,
        context: CurrentUserContext,
        *,
        tool_name: str,
        role_override: str,
    ) -> ToolResult:
        entreprise_id = payload.entreprise_id or context.tenant_id
        if not entreprise_id:
            return ToolResult.fail(
                "missing_entreprise",
                "Identifiant d'entreprise manquant pour creer cet utilisateur.",
                status_code=400,
            )
        role_value = role_override or payload.role or "EMPLOYEE"
        body = _drop_none(
            {
                "nom": payload.nom.strip(),
                "prenom": payload.prenom.strip(),
                "email": payload.email.strip(),
                "motDePasse": payload.mot_de_passe,
                "telephone": payload.telephone,
                "poste": payload.poste,
                "statut": payload.statut,
                "entrepriseId": int(entreprise_id),
                "departementId": payload.department_id,
                "equipeId": payload.team_id,
                "role": role_value,
                "roleIds": payload.role_ids,
            }
        )
        result = await self.backend_client.post("/organisations/users", context=context, json=body)
        subject = "manager" if role_value == "MANAGER" else "employe"
        return _write_response(tool_name, result, f"Le {subject} {payload.prenom.strip()} {payload.nom.strip()} a ete cree.")

    async def _set_employee_active(
        self,
        payload: ToggleEmployeeInput,
        context: CurrentUserContext,
        *,
        tool_name: str,
        desired_active: bool,
    ) -> ToolResult:
        current = await self.backend_client.get(f"/organisations/users/{payload.user_id}", context=context)
        if not current.success:
            return _write_response(tool_name, current, "Le statut de l'employe a ete mis a jour.")
        current_data = current.data if isinstance(current.data, dict) else {}
        current_status = str(current_data.get("statut") or current_data.get("status") or "").upper()
        is_active = current_status in {"ACTIF", "ACTIVE", "VALIDE", "APPROVED"}
        display_name = _user_display_name(current_data) or str(payload.user_id)
        if is_active == desired_active:
            summary = f"Aucune modification: {display_name} est deja {'actif' if desired_active else 'inactif'}."
            return ToolResult.ok(
                {
                    "write_result": build_write_result(
                        tool_name=tool_name,
                        summary=summary,
                        data=current_data,
                        backend_status=current.status_code,
                    )
                },
                warnings=current.warnings,
                status_code=current.status_code,
            )
        result = await self.backend_client.request(
            "PUT",
            f"/organisations/users/{payload.user_id}/toggle-status",
            context=context,
        )
        summary = f"{display_name} a ete {'active' if desired_active else 'desactive'}."
        return _write_response(tool_name, result, summary)


def register_organisation_structure_tools(
    registry: ToolRegistry,
    backend_client: BackendClient,
) -> OrganisationStructureTools:
    tools = OrganisationStructureTools(backend_client)
    tools.register(registry)
    return tools


def _extract_items(data: Any) -> list[Any]:
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("content", "items", "data", "teams", "equipes", "departements", "departments", "employees", "users"):
            value = data.get(key)
            if isinstance(value, list):
                return value
    return []


def _slice_items(items: list[Any], page: int, size: int) -> list[Any]:
    if not items:
        return []
    if page <= 0:
        return items[:size]
    start = page * size
    return items[start:start + size]


def _extract_count(data: Any, items: list[Any]) -> int:
    if isinstance(data, dict):
        for key in ("totalElements", "total", "totalCount", "count"):
            value = data.get(key)
            if isinstance(value, int):
                return value
            if isinstance(value, float) and value.is_integer():
                return int(value)
    return len(items)


def _read_failure(tool_name: str, result: ToolResult, fallback: str) -> ToolResult:
    message = _clean_error(result, fallback)
    return ToolResult.fail(
        result.error_code or "backend_error",
        message,
        status_code=result.status_code,
        data={
            "read_result": build_read_result(
                tool_name=tool_name,
                summary=message,
                items=[],
                count=0,
                data=result.data,
                error={"code": result.error_code, "message": message},
                backend_status=result.status_code,
                empty=True,
            )
        },
        warnings=result.warnings,
    )


def _write_response(tool_name: str, result: ToolResult, success_summary: str) -> ToolResult:
    if not result.success:
        message = _clean_error(result, "Action refusee par le backend.")
        return ToolResult.fail(
            result.error_code or "backend_error",
            message,
            status_code=result.status_code,
            data={
                "write_result": build_write_result(
                    tool_name=tool_name,
                    summary=message,
                    data=result.data,
                    error={"code": result.error_code, "message": message},
                    backend_status=result.status_code,
                )
            },
            warnings=result.warnings,
        )
    return ToolResult.ok(
        {
            "write_result": build_write_result(
                tool_name=tool_name,
                summary=success_summary,
                data=result.data,
                backend_status=result.status_code,
            )
        },
        warnings=result.warnings,
        status_code=result.status_code,
    )


def _clean_error(result: ToolResult, fallback: str) -> str:
    if result.status_code in (401, 403):
        return "Votre role ne permet pas cette action sur la structure d'organisation."
    if result.status_code == 404:
        return "La ressource demandee est introuvable."
    if result.status_code == 409:
        return result.error_message or "Conflit detecte par le backend."
    if result.status_code == 400:
        return result.error_message or "Donnees invalides pour cette action."
    if result.status_code is None or result.status_code >= 500:
        return "Le service d'organisation est momentanement indisponible."
    return result.error_message or fallback


def _drop_none(data: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in data.items() if value is not None}


def _as_positive_int(value: Any) -> int | None:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def _user_update_body(data: dict[str, Any]) -> dict[str, Any]:
    role_value = data.get("role")
    if not role_value and isinstance(data.get("roles"), list) and data["roles"]:
        first_role = data["roles"][0]
        if isinstance(first_role, dict):
            role_value = first_role.get("nom") or first_role.get("name")
        else:
            role_value = str(first_role)
    if isinstance(role_value, str) and role_value.startswith("ROLE_"):
        role_value = role_value.removeprefix("ROLE_")
    return {
        "nom": data.get("nom") or data.get("lastName"),
        "prenom": data.get("prenom") or data.get("firstName"),
        "email": data.get("email"),
        "motDePasse": data.get("motDePasse"),
        "telephone": data.get("telephone") or data.get("phone"),
        "poste": data.get("poste") or data.get("position"),
        "statut": data.get("statut") or data.get("status") or "ACTIF",
        "entrepriseId": data.get("entrepriseId"),
        "departementId": data.get("departementId"),
        "equipeId": data.get("equipeId"),
        "role": role_value,
        "roleIds": data.get("roleIds"),
    }


def _filter_people(items: list[Any], query: str) -> list[Any]:
    needle = _normalize_lookup(query)
    if not needle:
        return items
    matches: list[Any] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        haystack = " ".join(
            str(item.get(key) or "")
            for key in ("fullName", "prenom", "nom", "email", "poste", "departement", "equipe", "managerNom")
        )
        if needle in _normalize_lookup(haystack):
            matches.append(item)
    matches.sort(key=lambda item: _match_rank(item, needle))
    return matches


def _match_rank(item: dict[str, Any], needle: str) -> tuple[int, str]:
    full_name = _normalize_lookup(_user_display_name(item) or "")
    if full_name == needle:
        return (0, full_name)
    if full_name.startswith(needle):
        return (1, full_name)
    email = _normalize_lookup(item.get("email") or "")
    if email == needle:
        return (2, email)
    if email.startswith(needle):
        return (3, email)
    return (4, full_name or email)


def _user_display_name(data: dict[str, Any]) -> str:
    full_name = str(data.get("fullName") or "").strip()
    if full_name:
        return full_name
    prenom = str(data.get("prenom") or data.get("firstName") or "").strip()
    nom = str(data.get("nom") or data.get("lastName") or "").strip()
    return " ".join(part for part in (prenom, nom) if part).strip()


def _normalize_lookup(value: Any) -> str:
    text = str(value or "").strip().lower()
    return " ".join(text.replace("-", " ").replace("_", " ").split())
