from __future__ import annotations

from typing import Final


PHRASES: Final[dict[str, dict[str, str]]] = {
    "ask.date.leave": {
        "fr": "Pour quelle date souhaitez-vous demander ce conge ?",
        "en": "For which date would you like to request leave?",
        "ar": "لاي تاريخ تريد تقديم طلب العطلة؟",
        "tn": "L nhar chnowa t7eb taamel demande conge?",
    },
    "ask.reason.leave": {
        "fr": "Quel motif souhaitez-vous indiquer pour cette demande de conge ?",
        "en": "What reason should I add to this leave request?",
        "ar": "ما هو سبب طلب العطلة؟",
        "tn": "Chnowa el motif mtaa demande conge?",
    },
    "ask.date.authorization": {
        "fr": "Pour quelle date souhaitez-vous demander cette autorisation ?",
        "en": "For which date would you like to request this authorization?",
        "ar": "لاي تاريخ تريد تقديم طلب الاذن؟",
        "tn": "L nhar chnowa t7eb taamel autorisation?",
    },
    "ask.attendance.choice": {
        "fr": "Je peux vous aider sur le pointage. Voulez-vous connaitre votre statut, pointer l'entree ou pointer la sortie ?",
        "en": "I can help with attendance. Do you want your status, check-in, or check-out?",
        "ar": "يمكنني مساعدتك في الحضور. هل تريد معرفة الحالة، تسجيل الدخول، او تسجيل الخروج؟",
        "tn": "Najjem n3awnek fel pointage. T7eb status, entree, walla sortie?",
    },
    "unavailable.backend": {
        "fr": "Cette action n'est pas encore disponible dans le backend.",
        "en": "This action is not available in the backend yet.",
        "ar": "هذه العملية غير متاحة حاليا في النظام الخلفي.",
        "tn": "El action hedhi mazelt moch mawjooda fel backend.",
    },
}
