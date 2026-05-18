from __future__ import annotations

import pytest

from app.agents.hybrid_intent_router import classify_rh_intent
from chatbot_test_helpers import make_context_with_metadata


DATASET = [
    ("/app/rh/structure/departments", "rh.structure.department.create", ["aamel departement engineering", "Cree un departement Engineering", "\u0623\u0646\u0634\u0626 \u0642\u0633\u0645 Engineering", "Create Engineering department"]),
    ("/app/rh/structure/departments", "rh.structure.department.create", ["zid departement IT", "Ajoute departement IT", "\u0623\u0636\u0641 \u0642\u0633\u0645 IT", "Add IT department"]),
    ("/app/rh/structure/departments", "rh.structure.department.list", ["warini les departements", "Affiche les departements", "\u0627\u0639\u0631\u0636 \u0627\u0644\u0623\u0642\u0633\u0627\u0645", "Show departments"]),
    ("/app/rh/structure/departments", "rh.structure.department.delete", ["fasakh departement IT", "Supprime departement IT", "\u0627\u062d\u0630\u0641 \u0642\u0633\u0645 IT", "Delete IT department"]),
    ("/app/rh/structure/departments", "rh.structure.department.update", ["baddel esm Front l Frontend", "Renomme Front en Frontend", "\u063a\u064a\u0651\u0631 \u0627\u0633\u0645 Front \u0625\u0644\u0649 Frontend", "Rename Front to Frontend"]),
    ("/app/rh/structure/equipes", "rh.structure.team.create", ["aamel equipe frontend", "Cree equipe frontend", "\u0623\u0646\u0634\u0626 \u0641\u0631\u064a\u0642 frontend", "Create frontend team"]),
    ("/app/rh/structure/equipes", "rh.structure.team.list", ["warini les equipes", "Affiche les equipes", "\u0627\u0639\u0631\u0636 \u0627\u0644\u0641\u0631\u0642", "Show teams"]),
    ("/app/rh/structure/equipes", "rh.structure.employee.assign_team", ["affecti Amin lel frontend", "Affecte Amin a frontend", "\u0639\u064a\u0651\u0646 Amin \u0625\u0644\u0649 \u0641\u0631\u064a\u0642 frontend", "Assign Amin to frontend"]),
    ("/app/rh/structure/equipes", "rh.structure.employee.assign_team", ["hot Essia fi Engineering", "Mets Essia dans Engineering", "\u0623\u0636\u0641 Essia \u0625\u0644\u0649 Engineering", "Put Essia in Engineering"]),
    ("/app/rh/structure/equipes", "rh.structure.employee.assign_team", ["na9el Ahmed lel backend", "Deplace Ahmed vers backend", "\u0627\u0646\u0642\u0644 Ahmed \u0625\u0644\u0649 backend", "Move Ahmed to backend"]),
    ("/app/rh/structure/equipes", "rh.structure.team.members", ["chkoun fil frontend", "Qui est dans frontend ?", "\u0645\u0646 \u0641\u064a \u0641\u0631\u064a\u0642 frontend\u061f", "Who is in frontend team?"]),
    ("/app/rh/structure/employes", "rh.structure.employee.create", ["zid employe jdid", "Ajoute nouvel employe", "\u0623\u0636\u0641 \u0645\u0648\u0638\u0641 \u062c\u062f\u064a\u062f", "Add new employee"]),
    ("/app/rh/structure/managers", "rh.structure.manager.create", ["aamel manager jdid", "Cree nouveau manager", "\u0623\u0646\u0634\u0626 \u0645\u062f\u064a\u0631 \u062c\u062f\u064a\u062f", "Create new manager"]),
    ("/app/rh/structure/managers", "rh.structure.manager.assign_team", ["affecti Jean Dupont frontend", "Assigne Jean Dupont a frontend", "\u0639\u064a\u0651\u0646 Jean Dupont \u0644\u0641\u0631\u064a\u0642 frontend", "Assign Jean Dupont to frontend"]),
    ("/app/rh/structure/managers", "rh.structure.manager.show", ["chkoun manager frontend", "Qui gere frontend ?", "\u0645\u0646 \u0645\u062f\u064a\u0631 frontend\u061f", "Who manages frontend?"]),
    ("/app/rh/conges", "rh.leave.list", ["warini les conges", "Affiche les conges", "\u0627\u0639\u0631\u0636 \u0627\u0644\u0625\u062c\u0627\u0632\u0627\u062a", "Show leave requests"]),
    ("/app/rh/conges", "rh.leave.pending", ["chkoun yestannew validation", "Qui attend validation ?", "\u0645\u0646 \u064a\u0646\u062a\u0638\u0631 \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629\u061f", "Who is waiting for approval?"]),
    ("/app/rh/conges", "rh.leave.approve", ["9bel conge Amin", "Approuve conge Amin", "\u0648\u0627\u0641\u0642 \u0639\u0644\u0649 \u0625\u062c\u0627\u0632\u0629 Amin", "Approve Amin leave"]),
    ("/app/rh/conges", "rh.leave.reject", ["orfodh conge Awa", "Refuse conge Awa", "\u0627\u0631\u0641\u0636 \u0625\u062c\u0627\u0632\u0629 Awa", "Reject Awa leave"]),
    ("/app/rh/teletravail", "rh.telework.approve", ["9bel teletravail Amin", "Approuve teletravail Amin", "\u0648\u0627\u0641\u0642 \u0639\u0644\u0649 \u0637\u0644\u0628 \u0627\u0644\u0639\u0645\u0644 \u0639\u0646 \u0628\u0639\u062f \u0644\u0640 Amin", "Approve Amin telework"]),
    ("/app/rh/teletravail", "rh.telework.list", ["chkoun talab teletravail", "Qui a demande teletravail ?", "\u0645\u0646 \u0637\u0644\u0628 \u0627\u0644\u0639\u0645\u0644 \u0639\u0646 \u0628\u0639\u062f\u061f", "Who requested telework?"]),
    ("/app/rh/autorisations", "rh.authorization.list", ["warini autorisations", "Affiche autorisations", "\u0627\u0639\u0631\u0636 \u0627\u0644\u062a\u0635\u0627\u0631\u064a\u062d", "Show authorizations"]),
    ("/app/rh/autorisations", "rh.authorization.approve", ["9bel sortie anticipee Amin", "Approuve sortie anticipee Amin", "\u0648\u0627\u0641\u0642 \u0639\u0644\u0649 \u062e\u0631\u0648\u062c \u0645\u0628\u0643\u0631 \u0644\u0640 Amin", "Approve early leave Amin"]),
    ("/app/rh/pointage", "rh.attendance.missing", ["chkoun ma pointach", "Qui n a pas pointe ?", "\u0645\u0646 \u0644\u0645 \u064a\u0633\u062c\u0644 \u062d\u0636\u0648\u0631\u0647\u061f", "Who didn't check in?"]),
    ("/app/rh/pointage", "rh.attendance.today", ["warini presence lyoum", "Presence aujourd hui", "\u062d\u0636\u0648\u0631 \u0627\u0644\u064a\u0648\u0645", "Today's attendance"]),
    ("/app/rh/pointage", "rh.attendance.sync", ["synchronisi pointage", "Synchronise pointage", "\u0642\u0645 \u0628\u0645\u0632\u0627\u0645\u0646\u0629 \u0627\u0644\u062d\u0636\u0648\u0631", "Sync attendance"]),
    ("/app/rh/pointage", "rh.attendance.manual_fix", ["sa7a7 pointage Amin 09h", "Corrige pointage Amin 09h", "\u0635\u062d\u0651\u062d \u062d\u0636\u0648\u0631 Amin 09:00", "Correct Amin attendance 09:00"]),
    ("/app/rh/horaires", "rh.schedule.list", ["warini horaires", "Affiche horaires", "\u0627\u0639\u0631\u0636 \u0627\u0644\u062c\u062f\u0627\u0648\u0644", "Show schedules"]),
    ("/app/rh/horaires", "rh.schedule.create", ["aamel horaire 35h", "Cree horaire 35h", "\u0623\u0646\u0634\u0626 \u062c\u062f\u0648\u0644 35 \u0633\u0627\u0639\u0629", "Create 35h schedule"]),
    ("/app/rh/horaires", "rh.schedule.assign", ["affecti horaire l Ahmed", "Affecte horaire Ahmed", "\u0639\u064a\u0651\u0646 \u062c\u062f\u0648\u0644 Ahmed", "Assign schedule to Ahmed"]),
    ("/app/rh/documents", "rh.document.generate", ["genere attestation Amin", "Genere attestation Amin", "\u0623\u0646\u0634\u0626 \u0634\u0647\u0627\u062f\u0629 \u0639\u0645\u0644 \u0644\u0640 Amin", "Generate Amin certificate"]),
    ("/app/rh/documents", "rh.document.urgent", ["warini documents urgence", "Affiche documents urgents", "\u0627\u0639\u0631\u0636 \u0627\u0644\u0648\u062b\u0627\u0626\u0642 \u0627\u0644\u0639\u0627\u062c\u0644\u0629", "Show urgent documents"]),
    ("/app/rh/analytics", "rh.analytics.summary", ["RH stats", "Resume RH", "\u0625\u062d\u0635\u0627\u0626\u064a\u0627\u062a \u0627\u0644\u0645\u0648\u0627\u0631\u062f \u0627\u0644\u0628\u0634\u0631\u064a\u0629", "HR statistics"]),
    ("/app/rh/pointage", "rh.attendance.absent", ["chkoun ghib lyoum", "Qui est absent aujourd hui", "\u0645\u0646 \u063a\u0627\u0626\u0628 \u0627\u0644\u064a\u0648\u0645\u061f", "Who is absent today?"]),
    ("/app/rh/dashboard", "rh.dashboard.backlog", ["warini backlog RH", "Affiche backlog RH", "\u0627\u0639\u0631\u0636 \u0642\u0627\u0626\u0645\u0629 \u0645\u0647\u0627\u0645 \u0627\u0644\u0645\u0648\u0627\u0631\u062f \u0627\u0644\u0628\u0634\u0631\u064a\u0629", "Show RH backlog"]),
]


@pytest.mark.parametrize("page,expected,messages", DATASET)
def test_rh_multilingual_dataset_routes_to_expected_intent(page: str, expected: str, messages: list[str]) -> None:
    for message in messages:
        context = make_context_with_metadata("RH", current_page=page)
        result = classify_rh_intent(message, context=context, current_page=page)
        assert result.intent == expected, message
        assert result.confidence >= 0.85, message


@pytest.mark.parametrize(
    "message,expected_missing",
    [
        ("affecti employe", ("employee", "team")),
        ("valide Amin", ("request_type",)),
        ("zid Ahmed", ("target_type",)),
        ("orfodh demande", ("request",)),
        ("pointe", ("attendance_action",)),
    ],
)
def test_rh_ambiguous_prompts_ask_for_clarification(message: str, expected_missing: tuple[str, ...]) -> None:
    result = classify_rh_intent(message, context=make_context_with_metadata("RH"))

    assert result.confidence < 0.85
    assert result.confidence >= 0.5
    assert result.missing == expected_missing
