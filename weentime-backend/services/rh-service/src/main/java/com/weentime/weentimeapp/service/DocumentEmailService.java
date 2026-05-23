package com.weentime.weentimeapp.service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class DocumentEmailService {

    private final JavaMailSender mailSender;

    @Value("${weentime.mail.from:rh@weentime.com}")
    private String fromAddress;

    public void sendDocumentAvailable(String to, String prenom, String typeDocumentLibelle) {
        String subject = String.format("Votre %s est disponible", typeDocumentLibelle);
        String body = buildAvailableEmail(prenom, typeDocumentLibelle);
        send(to, subject, body);
    }

    private String buildAvailableEmail(String prenom, String typeDocumentLibelle) {
        String greetingName = prenom != null && !prenom.isBlank() ? prenom : "collaborateur";
        return String.format("""
            <div style="font-family: Arial, sans-serif; max-width: 600px; color: #1e293b;">
              <p>Bonjour <strong>%s</strong>,</p>
              <p>Votre <strong>%s</strong> a été traité et est maintenant disponible.
                 Vous pouvez le consulter dans votre espace documents sur WeenTime.</p>
              <p>Cordialement,<br>
                 <strong>Le Service des Ressources Humaines</strong></p>
            </div>
            """, greetingName, typeDocumentLibelle);
    }

    private void send(String to, String subject, String htmlBody) {
        try {
            MimeMessage msg = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(msg, true, "UTF-8");
            helper.setFrom(fromAddress);
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(htmlBody, true);
            mailSender.send(msg);
            log.info("Email document envoye a {} — Sujet: {}", to, subject);
        } catch (MessagingException e) {
            log.error("Erreur envoi email document a {}: {}", to, e.getMessage());
            throw new RuntimeException("Echec envoi email", e);
        }
    }
}
