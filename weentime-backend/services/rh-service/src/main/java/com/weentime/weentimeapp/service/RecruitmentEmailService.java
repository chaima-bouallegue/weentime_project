package com.weentime.weentimeapp.service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

/**
 * Service d'envoi d'emails pour le module recrutement.
 * 
 * RÈGLES ABSOLUES :
 * - Aucune mention de l'IA, du score, de l'algorithme dans les emails
 * - Les décisions sont présentées comme humaines
 * - Ton professionnel, sobre et bienveillant
 * 
 * Dev : MailDev (SMTP 1025, interface web 1027)
 * Prod : Resend SMTP (gratuit jusqu'à 3000 emails/mois)
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class RecruitmentEmailService {

    private final JavaMailSender mailSender;

    @Value("${weentime.mail.from:recrutement@weentime.com}")
    private String fromAddress;

    @Value("${weentime.mail.company-name:WeenTime}")
    private String companyName;

    /**
     * Email de confirmation de réception de candidature.
     * Sobre, rassurant, avec numéro de référence.
     */
    @Async
    public void sendApplicationConfirmation(String to, String candidateFirstName, 
                                             String jobTitle, Long applicationId) {
        String subject = String.format("Candidature reçue — %s", jobTitle);
        String body = buildConfirmationEmail(candidateFirstName, jobTitle, applicationId);
        send(to, subject, body);
    }

    /**
     * Email de présélection (shortlist).
     * Message positif, aucun score mentionné.
     */
    @Async
    public void sendShortlistedNotification(String to, String candidateFirstName, 
                                             String jobTitle, String entrepriseName) {
        String subject = String.format("Bonne nouvelle concernant votre candidature — %s", jobTitle);
        String body = buildShortlistedEmail(candidateFirstName, jobTitle, entrepriseName);
        send(to, subject, body);
    }

    /**
     * Email de rejet.
     * Poli, encourageant, aucun score IA, aucune mention d'algorithme.
     * La décision est présentée comme humaine.
     */
    @Async
    public void sendRejectionNotification(String to, String candidateFirstName, 
                                           String jobTitle, String entrepriseName) {
        String subject = String.format("Suite donnée à votre candidature — %s", jobTitle);
        String body = buildRejectionEmail(candidateFirstName, jobTitle, entrepriseName);
        send(to, subject, body);
    }

    // ══════════════════════════════════════════════
    // Templates
    // ══════════════════════════════════════════════

    private String buildConfirmationEmail(String firstName, String jobTitle, Long applicationId) {
        return String.format("""
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
              <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 32px; border-radius: 16px 16px 0 0;">
                <h1 style="color: #fff; font-size: 22px; margin: 0;">%s</h1>
              </div>
              <div style="background: #fff; padding: 32px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 16px 16px;">
                <p>Bonjour <strong>%s</strong>,</p>
                <p>Nous avons bien reçu votre candidature pour le poste de <strong>%s</strong>. 
                   Votre dossier est en cours d'examen par notre équipe.</p>
                
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin: 20px 0;">
                  <p style="margin: 0; font-size: 13px; color: #64748b;">Référence de votre candidature</p>
                  <p style="margin: 4px 0 0; font-size: 18px; font-weight: 700; color: #6366f1;">WE-%06d</p>
                </div>
                
                <p>Nous reviendrons vers vous dans les meilleurs délais. 
                   En attendant, n'hésitez pas à consulter nos autres offres.</p>
                
                <p style="color: #64748b; font-size: 13px; margin-top: 32px;">
                  Cordialement,<br>
                  <strong>L'équipe Recrutement %s</strong>
                </p>
              </div>
            </div>
            """, companyName, firstName, jobTitle, applicationId, companyName);
    }

    private String buildShortlistedEmail(String firstName, String jobTitle, String entrepriseName) {
        String company = entrepriseName != null ? entrepriseName : companyName;
        return String.format("""
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
              <div style="background: linear-gradient(135deg, #059669, #10b981); padding: 32px; border-radius: 16px 16px 0 0;">
                <h1 style="color: #fff; font-size: 22px; margin: 0;">Bonne nouvelle !</h1>
              </div>
              <div style="background: #fff; padding: 32px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 16px 16px;">
                <p>Bonjour <strong>%s</strong>,</p>
                <p>Nous avons le plaisir de vous informer que votre candidature pour le poste de 
                   <strong>%s</strong> chez <strong>%s</strong> a retenu toute notre attention.</p>
                
                <p>Votre profil correspond aux critères que nous recherchons et nous souhaitons 
                   poursuivre le processus avec vous.</p>
                
                <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 16px; margin: 20px 0;">
                  <p style="margin: 0; font-weight: 600; color: #047857;">
                    Notre équipe vous contactera prochainement pour convenir des prochaines étapes.
                  </p>
                </div>
                
                <p style="color: #64748b; font-size: 13px; margin-top: 32px;">
                  Cordialement,<br>
                  <strong>L'équipe Recrutement %s</strong>
                </p>
              </div>
            </div>
            """, firstName, jobTitle, company, company);
    }

    private String buildRejectionEmail(String firstName, String jobTitle, String entrepriseName) {
        String company = entrepriseName != null ? entrepriseName : companyName;
        return String.format("""
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
              <div style="background: linear-gradient(135deg, #475569, #64748b); padding: 32px; border-radius: 16px 16px 0 0;">
                <h1 style="color: #fff; font-size: 22px; margin: 0;">%s — Recrutement</h1>
              </div>
              <div style="background: #fff; padding: 32px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 16px 16px;">
                <p>Bonjour <strong>%s</strong>,</p>
                <p>Nous vous remercions sincèrement pour l'intérêt que vous avez porté au poste de 
                   <strong>%s</strong> chez <strong>%s</strong>, ainsi que pour le temps 
                   consacré à votre candidature.</p>
                
                <p>Après un examen attentif de votre dossier par notre équipe, nous avons le regret 
                   de vous informer que nous ne sommes pas en mesure de donner une suite favorable 
                   à votre candidature pour ce poste.</p>
                
                <p>Cette décision ne remet en aucun cas en cause vos compétences. Le nombre élevé 
                   de candidatures reçues nous a conduits à faire des choix difficiles.</p>
                
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin: 20px 0;">
                  <p style="margin: 0; color: #475569;">
                    Nous vous encourageons à rester attentif à nos futures opportunités. 
                    Votre profil pourrait correspondre à d'autres postes.
                  </p>
                </div>
                
                <p>Nous vous souhaitons une pleine réussite dans la suite de vos recherches.</p>
                
                <p style="color: #64748b; font-size: 13px; margin-top: 32px;">
                  Cordialement,<br>
                  <strong>L'équipe Recrutement %s</strong>
                </p>
              </div>
            </div>
            """, company, firstName, jobTitle, company, company);
    }

    // ══════════════════════════════════════════════
    // Send helper
    // ══════════════════════════════════════════════

    private void send(String to, String subject, String htmlBody) {
        try {
            MimeMessage msg = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(msg, true, "UTF-8");
            helper.setFrom(fromAddress);
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(htmlBody, true);
            mailSender.send(msg);
            log.info("📧 Email envoyé à {} — Sujet: {}", to, subject);
        } catch (MessagingException e) {
            log.error("❌ Erreur envoi email à {}: {}", to, e.getMessage());
            // Non bloquant — l'email peut être retenté manuellement
        }
    }
}
