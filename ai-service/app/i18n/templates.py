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
    "ask.time.authorization": {
        "fr": "Merci de preciser les heures de debut et de fin de l'autorisation.",
        "en": "Please give the start and end time of the authorization.",
        "ar": "ما هي ساعة البداية والنهاية لهذا الإذن؟",
        "tn": "Chnowa l 7eures mtaa el bidaya w el nihaya mtaa el autorisation?",
    },
    "ask.type.authorization": {
        "fr": "Quel type d'autorisation souhaitez-vous demander ? Par exemple: sortie anticipee, arrivee tardive ou absence temporaire.",
        "en": "Which authorization type? For example: early leave, late arrival, or temporary absence.",
        "ar": "ما نوع الإذن المطلوب؟ مثلا: خروج مبكر، تأخر، أو غياب مؤقت.",
        "tn": "Chnowa l type mtaa l autorisation? Mathalan: sortie anticipee, retard, walla absence temporaire.",
    },
    "ask.reason.authorization": {
        "fr": "Quel motif souhaitez-vous indiquer pour cette autorisation ?",
        "en": "What reason should I add to this authorization?",
        "ar": "ما هو سبب هذا الإذن؟",
        "tn": "Chnowa l motif mtaa l autorisation?",
    },
    "ask.type.leave": {
        "fr": "Quel type de conge souhaitez-vous demander ? Par exemple: conge annuel, maladie, RTT.",
        "en": "Which leave type? For example: annual leave, sick leave, RTT.",
        "ar": "ما نوع العطلة المطلوبة؟ مثلا: عطلة سنوية، عطلة مرضية، عطلة استثنائية.",
        "tn": "Chnowa l type de conge? Mathalan: conge annuel, maladie, walla RTT.",
    },
    "unavailable.planning": {
        "fr": "Le module planning / horaires n'est pas encore connecte a l'agent IA. Consultez votre planning depuis l'onglet 'Planning' de l'application; je peux toujours vous aider sur le pointage, les conges, le teletravail ou les autorisations.",
        "en": "The planning / schedule module is not connected to the AI agent yet. Check your planning from the 'Planning' tab; I can still help with attendance, leave, telework, or authorizations.",
        "ar": "وحدة الجدول / الأوقات غير مربوطة بعد بمساعد الذكاء الاصطناعي. يمكنك مراجعة جدولك من تبويب 'Planning'؛ يمكنني مساعدتك في الحضور، العطل، العمل عن بعد أو الأذونات.",
        "tn": "El module planning / horaires mazel moch marbout bel agent IA. Echouf el planning mteek mel onglet 'Planning'; najjem n3awnek fel pointage, conges, teletravail walla autorisations.",
    },
    "unavailable.meeting": {
        "fr": "La gestion des reunions n'est pas encore disponible dans ce contexte. Vous pouvez consulter vos demandes RH, votre pointage, vos conges, votre teletravail ou vos autorisations.",
        "en": "Meeting management is not available in this context yet. You can check your HR requests, attendance, leave, telework, or authorizations.",
        "ar": "إدارة الاجتماعات غير متاحة حاليا في هذا السياق. يمكنك مراجعة طلباتك من الموارد البشرية، الحضور، العطل، العمل عن بعد أو الأذونات.",
        "tn": "Gestion el reunions mazel moch disponible fel contexte hedha. Najem techouf el demandes RH mteek, el pointage, conges, teletravail walla autorisations.",
    },
    "unavailable.team_schedule": {
        "fr": "Les horaires de l'equipe ne sont pas encore connectes a l'agent IA. Consultez les depuis l'onglet 'Planning equipe' de l'application; je peux toujours vous aider sur les validations en attente, le pointage personnel, vos conges ou vos autorisations.",
        "en": "Team schedules are not connected to the AI agent yet. Check them from the 'Team planning' tab; I can still help with pending approvals, your personal attendance, leave, or authorizations.",
        "ar": "جدول الفريق غير مربوط بعد بمساعد الذكاء الاصطناعي. يمكنك مراجعته من تبويب 'Team planning'؛ يمكنني مساعدتك في التحققات قيد الانتظار، حضورك الشخصي، العطل أو الأذونات.",
        "tn": "Horaires el equipe mazel moch marbouta bel agent IA. Echoufhom mel onglet 'Team planning'; najjem n3awnek fel validations en attente, el pointage mteek, conges walla autorisations.",
    },
}
