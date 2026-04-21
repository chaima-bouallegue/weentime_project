// [WEENTIME-VOCAL] Mock Service for TTS
import { Injectable } from '@angular/core';
import { VocalIntentType, SupportedLanguage } from '../models/vocal-intent.model';
import { VocalResponse } from '../models/vocal-response.model';
import { Observable } from 'rxjs';

const MOCK_RESPONSES: Record<VocalIntentType, Record<SupportedLanguage, string>> = {
  DEMANDE_CONGE: {
    fr: "J'ai bien reçu votre demande de congé. Vous disposez de 14 jours restants. Souhaitez-vous soumettre une demande pour une période spécifique ?",
    en: "I've received your leave request. You have 14 days remaining. Would you like to submit a request for a specific period?",
    ar: "لقد استلمت طلب إجازتك. لديك 14 يوماً متبقياً. هل تريد تقديم طلب لفترة محددة؟",
    tn: "Barcha, reçevt demande congé mte3ek. 3andek 14 jour. Tebda nkamlu ?"
  },
  SOLDE_CONGE: {
    fr: "Votre solde de congés actuel est de 14 jours. Vous avez utilisé 6 jours cette année sur un total de 20 jours.",
    en: "Your current leave balance is 14 days. You've used 6 days this year out of 20 total.",
    ar: "رصيد إجازاتك الحالي هو 14 يوماً. استخدمت 6 أيام هذا العام من أصل 20 يوماً.",
    tn: "3andek 14 jour congé. Ista3malt 6 men 20 jour elli 3andek."
  },
  POINTAGE_ENTREE: {
    fr: "Pointage d'entrée enregistré à 08h42. Bonne journée !",
    en: "Clock-in recorded at 8:42 AM. Have a great day!",
    ar: "تم تسجيل حضورك في 08:42. يوماً موفقاً!",
    tn: "Pointage mte3ek masjel 8h42. Yom mabrouk !"
  },
  POINTAGE_SORTIE: {
    fr: "Pointage de sortie enregistré. Vous avez effectué 8h15 aujourd'hui. À demain !",
    en: "Clock-out recorded. You worked 8h15 today. See you tomorrow!",
    ar: "تم تسجيل مغادرتك. عملت 8 ساعات و15 دقيقة اليوم. إلى اللقاء!",
    tn: "Sortie masjla. 3melti 8h15 lyoum. Bislema !"
  },
  DEMANDE_TELETRAVAIL: {
    fr: "Demande de télétravail notée. Votre manager sera notifié pour validation. Statut : en attente.",
    en: "Remote work request noted. Your manager will be notified for approval. Status: pending.",
    ar: "تم تسجيل طلب العمل عن بُعد. سيتم إخطار مديرك للموافقة.",
    tn: "Demande télétravail mte3ek masjla. Manager mte3ek yji y9arr."
  },
  VALIDATION_CONGE: {
    fr: "Il y a 3 demandes de congés en attente de validation. Voulez-vous les examiner maintenant ?",
    en: "There are 3 leave requests pending validation. Would you like to review them now?",
    ar: "هناك 3 طلبات إجازة في انتظار الموافقة. هل تريد مراجعتها الآن؟",
    tn: "3andek 3 demandes congé yestannew. Tebda tshufhom ?"
  },
  ABSENCES_EQUIPE: {
    fr: "Aujourd'hui, 2 membres de votre équipe sont absents : Sarah (congé annuel) et Mohamed (maladie).",
    en: "Today, 2 team members are absent: Sarah (annual leave) and Mohamed (sick leave).",
    ar: "اليوم، غاب عضوان من فريقك: سارة (إجازة سنوية) ومحمد (مرضية).",
    tn: "Lyoum, 2 men l-équipe mte3ek ghaybin: Sarah congé w Mohamed mridha."
  },
  PLANNING_SEMAINE: {
    fr: "Cette semaine : lundi à vendredi 08h00-17h00, avec pause déjeuner 12h00-13h30. Mercredi : réunion équipe à 10h00.",
    en: "This week: Monday to Friday 8AM-5PM, lunch break 12PM-1:30PM. Wednesday: team meeting at 10AM.",
    ar: "هذا الأسبوع: من الاثنين إلى الجمعة 08:00-17:00، استراحة غداء 12:00-13:30.",
    tn: "El-jem3a hedhi: men ithnin l-jom3a 8h-17h. El-arb3a: réunion 10h."
  },
  STATUT_DEMANDE: {
    fr: "Votre dernière demande de congé (15-20 juillet) est en cours de traitement. Réponse attendue sous 48h.",
    en: "Your latest leave request (July 15-20) is being processed. Response expected within 48 hours.",
    ar: "طلب إجازتك الأخير (15-20 يوليو) قيد المعالجة. الرد متوقع خلال 48 ساعة.",
    tn: "Demande mte3ek (15-20 juillet) fi l-attente. Réponse fi 48h."
  },
  AIDE_GENERALE: {
    fr: "Je peux vous aider avec : vos congés, le pointage, le télétravail, les validations et le planning. Que souhaitez-vous faire ?",
    en: "I can help you with: leave requests, time tracking, remote work, approvals, and scheduling. What would you like to do?",
    ar: "يمكنني مساعدتك في: الإجازات، تسجيل الحضور، العمل عن بُعد، والموافقات. ماذا تريد أن تفعل؟",
    tn: "Najjem n3awnek fi: congés, pointage, télétravail, validation w planning. Chnouwa tebda ta3mel ?"
  }
};

@Injectable({ providedIn: 'root' })
export class TtsMockService {

  generateResponse(intentType: VocalIntentType, lang: SupportedLanguage): Observable<VocalResponse> {
    return new Observable(observer => {
      setTimeout(() => {
        const text = MOCK_RESPONSES[intentType][lang] || MOCK_RESPONSES['AIDE_GENERALE'][lang];
        
        const response: VocalResponse = {
          text,
          langue: lang,
          timestamp: new Date()
        };
        
        observer.next(response);
        observer.complete();
      }, 500);
    });
  }
}
