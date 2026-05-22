package com.weentime.weentimeapp.service;

import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfWriter;
import com.itextpdf.layout.Document;
import com.itextpdf.layout.element.Paragraph;
import com.itextpdf.layout.properties.TextAlignment;
import com.weentime.weentimeapp.dto.UserResponse;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.time.format.DateTimeFormatter;

@Service
public class DocumentPdfGenerator {

    public String generatePdf(com.weentime.weentimeapp.entity.Document entity, UserResponse user) {
        String fullPath = buildPath(entity, user.getId(), null);

        try (PdfWriter writer = new PdfWriter(fullPath);
             PdfDocument pdf = new PdfDocument(writer);
             Document doc = new Document(pdf)) {

            doc.add(new Paragraph("WEEN TIME HR SOLUTIONS")
                    .setBold()
                    .setFontSize(20)
                    .setTextAlignment(TextAlignment.CENTER));
            doc.add(new Paragraph("\n"));

            doc.add(new Paragraph(entity.getTypeDocument().getLibelle())
                    .setBold()
                    .setFontSize(16)
                    .setUnderline()
                    .setTextAlignment(TextAlignment.CENTER));
            doc.add(new Paragraph("\n"));

            doc.add(new Paragraph("Informations de l'employe :").setBold());
            doc.add(new Paragraph("Nom : " + user.getNom()));
            doc.add(new Paragraph("Prenom : " + user.getPrenom()));
            doc.add(new Paragraph("Poste : " + user.getPoste()));
            doc.add(new Paragraph("Departement : " + user.getDepartementNom()));
            doc.add(new Paragraph("\n"));

            doc.add(new Paragraph("Details de la demande :").setBold());
            doc.add(new Paragraph("Date de creation : " + entity.getDateCreation().format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"))));
            if (entity.getMoisConcerne() != null) {
                doc.add(new Paragraph("Mois concerne : " + entity.getMoisConcerne()));
            }
            if (entity.getMotif() != null) {
                doc.add(new Paragraph("Motif : " + entity.getMotif()));
            }
            doc.add(new Paragraph("\n"));

            doc.add(new Paragraph("Ce document est certifie par le service RH de WeenTime."));
            doc.add(new Paragraph("\n\n"));

            doc.add(new Paragraph("Fait a Casablanca, le " + java.time.LocalDate.now().format(DateTimeFormatter.ofPattern("dd/MM/yyyy")))
                    .setTextAlignment(TextAlignment.RIGHT));
            doc.add(new Paragraph("Signature RH (Electronique)")
                    .setItalic()
                    .setTextAlignment(TextAlignment.RIGHT));

        } catch (IOException e) {
            throw new RuntimeException("Erreur lors de la generation du PDF : " + e.getMessage());
        }

        return fullPath;
    }

    public String generatePdfFromContent(com.weentime.weentimeapp.entity.Document entity, UserResponse user, String content) {
        String fullPath = buildPath(entity, user.getId(), "generated");

        try (PdfWriter writer = new PdfWriter(fullPath);
             PdfDocument pdf = new PdfDocument(writer);
             Document doc = new Document(pdf)) {

            doc.add(new Paragraph("WEEN TIME HR SOLUTIONS")
                    .setBold()
                    .setFontSize(20)
                    .setTextAlignment(TextAlignment.CENTER));
            doc.add(new Paragraph("\n"));

            doc.add(new Paragraph(entity.getTypeDocument().getLibelle())
                    .setBold()
                    .setFontSize(16)
                    .setTextAlignment(TextAlignment.CENTER));
            doc.add(new Paragraph("\n"));

            for (String line : content.split("\\R")) {
                doc.add(new Paragraph(line));
            }

            if (entity.getSignedBy() != null && !entity.getSignedBy().isEmpty()) {
                doc.add(new Paragraph("\n\n"));
                String dateStr = entity.getSignedAt() != null 
                    ? entity.getSignedAt().format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"))
                    : java.time.LocalDateTime.now().format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"));
                doc.add(new Paragraph("Signé par : " + entity.getSignedBy() + " — " + dateStr)
                        .setItalic()
                        .setTextAlignment(TextAlignment.RIGHT));
            }
        } catch (IOException e) {
            throw new RuntimeException("Erreur lors de la generation du PDF IA : " + e.getMessage());
        }

        return fullPath;
    }

    public byte[] generatePdfPreviewBytes(com.weentime.weentimeapp.entity.Document entity, UserResponse user, String content) {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        String plainText = stripHtml(content);

        try (PdfWriter writer = new PdfWriter(output);
             PdfDocument pdf = new PdfDocument(writer);
             Document doc = new Document(pdf)) {

            doc.add(new Paragraph("WEEN TIME HR SOLUTIONS")
                    .setBold()
                    .setFontSize(20)
                    .setTextAlignment(TextAlignment.CENTER));
            doc.add(new Paragraph("\n"));

            String typeLibelle = entity.getTypeDocument() != null && entity.getTypeDocument().getLibelle() != null
                    ? entity.getTypeDocument().getLibelle()
                    : "Document RH";
            doc.add(new Paragraph(typeLibelle)
                    .setBold()
                    .setFontSize(16)
                    .setTextAlignment(TextAlignment.CENTER));
            doc.add(new Paragraph("\n"));

            if (plainText.isBlank()) {
                doc.add(new Paragraph("Apercu du document — contenu en cours de redaction...")
                        .setItalic());
            } else {
                for (String line : plainText.split("\\R")) {
                    doc.add(new Paragraph(line.isBlank() ? " " : line));
                }
            }

            if (entity.getSignedBy() != null && !entity.getSignedBy().isEmpty()) {
                doc.add(new Paragraph("\n\n"));
                String dateStr = entity.getSignedAt() != null
                        ? entity.getSignedAt().format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"))
                        : java.time.LocalDateTime.now().format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"));
                doc.add(new Paragraph("Signe par : " + entity.getSignedBy() + " — " + dateStr)
                        .setItalic()
                        .setTextAlignment(TextAlignment.RIGHT));
            }
        } catch (IOException e) {
            throw new RuntimeException("Erreur lors de la generation de l'apercu PDF : " + e.getMessage());
        }

        return output.toByteArray();
    }

    private String stripHtml(String html) {
        if (html == null || html.isBlank()) {
            return "";
        }
        return html
                .replaceAll("(?i)<br\\s*/?>", "\n")
                .replaceAll("(?i)</p>", "\n")
                .replaceAll("(?i)</div>", "\n")
                .replaceAll("(?i)</li>", "\n")
                .replaceAll("<[^>]+>", "")
                .replace("&nbsp;", " ")
                .replace("&amp;", "&")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .trim();
    }

    private String buildPath(com.weentime.weentimeapp.entity.Document entity, Long userId, String suffix) {
        String rootPath = "uploads/documents/" + userId;
        File dir = new File(rootPath);
        if (!dir.exists()) {
            dir.mkdirs();
        }

        String suffixPart = suffix == null ? "" : "_" + suffix;
        String fileName = entity.getTypeDocument().getCode().toLowerCase() + "_" + entity.getId() + suffixPart + ".pdf";
        return rootPath + "/" + fileName;
    }
}
