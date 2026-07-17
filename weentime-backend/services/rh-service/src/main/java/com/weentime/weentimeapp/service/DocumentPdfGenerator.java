package com.weentime.weentimeapp.service;

import com.itextpdf.io.font.constants.StandardFonts;
import com.itextpdf.io.image.ImageData;
import com.itextpdf.io.image.ImageDataFactory;
import com.itextpdf.kernel.colors.DeviceRgb;
import com.itextpdf.kernel.events.Event;
import com.itextpdf.kernel.events.IEventHandler;
import com.itextpdf.kernel.events.PdfDocumentEvent;
import com.itextpdf.kernel.font.PdfFont;
import com.itextpdf.kernel.font.PdfFontFactory;
import com.itextpdf.kernel.geom.PageSize;
import com.itextpdf.kernel.geom.Rectangle;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfPage;
import com.itextpdf.kernel.pdf.PdfWriter;
import com.itextpdf.kernel.pdf.canvas.PdfCanvas;
import com.itextpdf.layout.Canvas;
import com.itextpdf.layout.Document;
import com.itextpdf.layout.borders.Border;
import com.itextpdf.layout.borders.SolidBorder;
import com.itextpdf.layout.element.Cell;
import com.itextpdf.layout.element.Paragraph;
import com.itextpdf.layout.element.Table;
import com.itextpdf.layout.properties.TextAlignment;
import com.itextpdf.layout.properties.UnitValue;
import com.weentime.weentimeapp.dto.EntrepriseResponse;
import com.weentime.weentimeapp.dto.UserResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.text.Normalizer;
import java.util.Base64;
import java.util.Locale;

@Slf4j
@Service
@RequiredArgsConstructor
public class DocumentPdfGenerator {

    private final EntrepriseCacheService entrepriseCache;

    private static final DeviceRgb TEXT_PRIMARY   = new DeviceRgb(26, 26, 46);
    private static final DeviceRgb TEXT_SECONDARY = new DeviceRgb(71, 85, 105);
    private static final DeviceRgb TEXT_MUTED     = new DeviceRgb(148, 163, 184);
    private static final DeviceRgb BG_CARD        = new DeviceRgb(248, 250, 252);
    private static final DeviceRgb BORDER         = new DeviceRgb(226, 232, 240);
    private static final DeviceRgb WHITE          = new DeviceRgb(255, 255, 255);
    private static final DeviceRgb DEFAULT_PRIMARY   = new DeviceRgb(26, 115, 232);
    private static final DeviceRgb DEFAULT_SECONDARY = new DeviceRgb(52, 168, 83);

    // ═══════════════════════════════════════════════════════════════
    //  PUBLIC METHODS (signatures unchanged)
    // ═══════════════════════════════════════════════════════════════

    public String generatePdf(com.weentime.weentimeapp.entity.Document entity, UserResponse user) {
        String fullPath = buildPath(entity, user.getId(), null);
        try (PdfWriter writer = new PdfWriter(fullPath);
             PdfDocument pdf = new PdfDocument(writer);
             Document doc = new Document(pdf, PageSize.A4)) {
            EntrepriseResponse entreprise = loadEntreprise(entity);
            buildLayout(doc, pdf, entity, user, null, entreprise);
        } catch (IOException e) {
            throw new RuntimeException("Erreur lors de la generation du PDF : " + e.getMessage());
        }
        return fullPath;
    }

    public String generatePdfFromContent(com.weentime.weentimeapp.entity.Document entity, UserResponse user, String content) {
        String fullPath = buildPath(entity, user.getId(), "generated");
        try (PdfWriter writer = new PdfWriter(fullPath);
             PdfDocument pdf = new PdfDocument(writer);
             Document doc = new Document(pdf, PageSize.A4)) {
            EntrepriseResponse entreprise = loadEntreprise(entity);
            buildLayout(doc, pdf, entity, user, content, entreprise);
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
             Document doc = new Document(pdf, PageSize.A4)) {
            EntrepriseResponse entreprise = loadEntreprise(entity);
            buildLayout(doc, pdf, entity, user, plainText, entreprise);
        } catch (IOException e) {
            throw new RuntimeException("Erreur lors de la generation de l'apercu PDF : " + e.getMessage());
        }
        return output.toByteArray();
    }

    // ═══════════════════════════════════════════════════════════════
    //  MAIN LAYOUT
    // ═══════════════════════════════════════════════════════════════

    private void buildLayout(Document doc, PdfDocument pdf,
                              com.weentime.weentimeapp.entity.Document entity,
                              UserResponse user, String content,
                              EntrepriseResponse entreprise) {
        DeviceRgb primary = entreprise != null && entreprise.getPrimaryColor() != null
                ? hexToRgb(entreprise.getPrimaryColor()) : DEFAULT_PRIMARY;

        float marginTop = 48, marginBottom = 56, marginLeft = 48, marginRight = 48;
        doc.setMargins(marginTop, marginRight, marginBottom, marginLeft);

        try {
            PdfFont font = PdfFontFactory.createFont(StandardFonts.HELVETICA);
            pdf.addEventHandler(PdfDocumentEvent.END_PAGE,
                    new FooterHandler(pdf, entreprise, font, marginLeft, marginRight, marginBottom));
        } catch (IOException e) {
            log.warn("Impossible de creer la police Helvetica", e);
        }

        addAccentBar(doc, primary);
        addHeader(doc, entreprise, entity, primary);
        addSeparator(doc);
        addMetaPills(doc, entity);
        addEmployeeCard(doc, user, entity, primary);
        addContent(doc, content, primary);
        addSignatureBlock(doc, entity);
    }

    // ═══════════════════════════════════════════════════════════════
    //  COLOR HELPER
    // ═══════════════════════════════════════════════════════════════

    private DeviceRgb hexToRgb(String hex) {
        if (hex == null || !hex.startsWith("#") || hex.length() < 7)
            return DEFAULT_PRIMARY;
        try {
            int r = Integer.parseInt(hex.substring(1, 3), 16);
            int g = Integer.parseInt(hex.substring(3, 5), 16);
            int b = Integer.parseInt(hex.substring(5, 7), 16);
            return new DeviceRgb(r, g, b);
        } catch (Exception e) {
            return DEFAULT_PRIMARY;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  FORMAT HELPERS
    // ═══════════════════════════════════════════════════════════════

    private String formatDate(LocalDateTime dt) {
        if (dt == null) return "";
        return dt.format(DateTimeFormatter.ofPattern("dd MMMM yyyy", Locale.FRENCH));
    }

    private String trimS(String s) {
        return s != null ? s.trim() : "";
    }

    // ═══════════════════════════════════════════════════════════════
    //  LAYOUT ELEMENTS
    // ═══════════════════════════════════════════════════════════════

    private void addAccentBar(Document doc, DeviceRgb primary) {
        Table bar = new Table(UnitValue.createPercentArray(new float[]{100}));
        bar.setWidth(UnitValue.createPercentValue(100));
        bar.setMarginBottom(8);
        Cell cell = new Cell()
                .setBorder(Border.NO_BORDER)
                .setBorderTop(new SolidBorder(primary, 3f))
                .setHeight(3f);
        bar.addCell(cell);
        doc.add(bar);
    }

    private void addSeparator(Document doc) {
        Table sep = new Table(UnitValue.createPercentArray(new float[]{100}));
        sep.setWidth(UnitValue.createPercentValue(100));
        sep.setMarginTop(4).setMarginBottom(16);
        Cell cell = new Cell()
                .setBorderTop(new SolidBorder(BORDER, 0.5f))
                .setBorder(Border.NO_BORDER)
                .setHeight(0.5f);
        sep.addCell(cell);
        doc.add(sep);
    }

    private void addSectionTitle(Document doc, String title, float marginTop) {
        doc.add(new Paragraph(title)
                .setFontSize(7).setBold().setFontColor(TEXT_MUTED)
                .setCharacterSpacing(1.5f)
                .setMarginTop(marginTop).setMarginBottom(6));
    }

    private void addHeader(Document doc, EntrepriseResponse e,
                           com.weentime.weentimeapp.entity.Document entity,
                           DeviceRgb primary) {
        Table header = new Table(UnitValue.createPercentArray(new float[]{30, 70}));
        header.setWidth(UnitValue.createPercentValue(100));
        header.setMarginBottom(4);

        Cell left = new Cell().setBorder(Border.NO_BORDER).setPadding(0);
        if (e != null && e.getLogo() != null && !e.getLogo().isBlank()) {
            try {
                String b64 = e.getLogo().contains(",")
                        ? e.getLogo().split(",")[1] : e.getLogo();
                byte[] imgBytes = Base64.getDecoder().decode(b64);
                ImageData imgData = ImageDataFactory.create(imgBytes);
                com.itextpdf.layout.element.Image img =
                        new com.itextpdf.layout.element.Image(imgData);
                img.setMaxWidth(65).setMaxHeight(45).setAutoScale(true);
                left.add(img);
            } catch (Exception ex) {
                log.debug("Impossible de decoder le logo", ex);
            }
        }
        String companyName = (e != null && e.getNom() != null) ? e.getNom() : "WeenTime";
        left.add(new Paragraph(companyName)
                .setFontSize(11).setBold().setFontColor(TEXT_PRIMARY)
                .setMarginTop(4));
        left.add(new Paragraph("Entreprise")
                .setFontSize(7).setFontColor(TEXT_MUTED)
                .setMarginTop(-1));
        header.addCell(left);

        Cell right = new Cell().setBorder(Border.NO_BORDER).setPadding(0)
                .setTextAlignment(TextAlignment.RIGHT);
        String libelle = entity.getTypeDocument() != null
                && entity.getTypeDocument().getLibelle() != null
                ? entity.getTypeDocument().getLibelle() : "Document RH";
        right.add(new Paragraph(libelle)
                .setFontSize(20).setBold().setFontColor(TEXT_PRIMARY)
                .setMarginBottom(2));

        StringBuilder meta = new StringBuilder();
        meta.append("Réf. #").append(entity.getId());
        if (entity.getDateCreation() != null)
            meta.append("  ·  ").append(formatDate(entity.getDateCreation()));
        right.add(new Paragraph(meta.toString())
                .setFontSize(7.5f).setFontColor(TEXT_MUTED));

        header.addCell(right);
        doc.add(header);
    }

    private void addMetaPills(Document doc,
                              com.weentime.weentimeapp.entity.Document entity) {
        java.util.List<String> items = new java.util.ArrayList<>();
        items.add("R\u00E9f. #" + entity.getId());
        if (entity.getDateCreation() != null)
            items.add(formatDate(entity.getDateCreation()));
        if (entity.getMoisConcerne() != null && !entity.getMoisConcerne().isBlank())
            items.add(entity.getMoisConcerne());
        if (entity.getMotif() != null && !entity.getMotif().isBlank()) {
            String motif = entity.getMotif().length() > 40
                    ? entity.getMotif().substring(0, 40) + "\u2026"
                    : entity.getMotif();
            items.add(motif);
        }
        if (items.isEmpty()) return;

        Table pillsRow = new Table(UnitValue.createPercentArray(new float[items.size()]));
        pillsRow.setWidth(UnitValue.createPercentValue(100));
        pillsRow.setMarginBottom(20);

        for (String item : items) {
            Cell pill = new Cell()
                    .setBackgroundColor(BG_CARD)
                    .setBorder(Border.NO_BORDER)
                    .setPadding(5).setPaddingLeft(12).setPaddingRight(12);
            pill.add(new Paragraph(item)
                    .setFontSize(7.5f).setFontColor(TEXT_SECONDARY)
                    .setMargin(0));
            pillsRow.addCell(pill);
        }
        doc.add(pillsRow);
    }

    private void addEmployeeCard(Document doc, UserResponse user,
                                  com.weentime.weentimeapp.entity.Document entity,
                                  DeviceRgb primary) {
        addSectionTitle(doc, "COLLABORATEUR", 0);

        Table wrapper = new Table(UnitValue.createPercentArray(new float[]{2, 98}));
        wrapper.setWidth(UnitValue.createPercentValue(100));
        wrapper.setMarginBottom(20);

        Cell accent = new Cell().setBackgroundColor(primary)
                .setBorder(Border.NO_BORDER).setPadding(0);
        wrapper.addCell(accent);

        Cell content = new Cell().setBackgroundColor(BG_CARD)
                .setBorder(new SolidBorder(BORDER, 0.5f)).setPadding(14);

        Table grid = new Table(UnitValue.createPercentArray(new float[]{50, 50}));
        grid.setWidth(UnitValue.createPercentValue(100));

        Cell leftCol = new Cell().setBorder(Border.NO_BORDER);
        String fullName = trimS(user.getPrenom()) + " " + trimS(user.getNom());
        leftCol.add(new Paragraph(fullName.trim())
                .setFontSize(11).setFontColor(TEXT_PRIMARY).setBold()
                .setMarginBottom(2));
        if (user.getPoste() != null && !user.getPoste().isBlank())
            leftCol.add(new Paragraph(user.getPoste())
                    .setFontSize(9).setFontColor(TEXT_SECONDARY));
        grid.addCell(leftCol);

        Cell rightCol = new Cell().setBorder(Border.NO_BORDER);
        if (user.getDepartementNom() != null && !user.getDepartementNom().isBlank()) {
            rightCol.add(new Paragraph("D\u00E9partement")
                    .setFontSize(7.5f).setFontColor(TEXT_MUTED));
            rightCol.add(new Paragraph(user.getDepartementNom())
                    .setFontSize(9.5f).setFontColor(TEXT_PRIMARY).setBold());
        }
        grid.addCell(rightCol);
        content.add(grid);

        if (entity.getMotif() != null && !entity.getMotif().isBlank())
            content.add(new Paragraph(entity.getMotif())
                    .setFontSize(9).setFontColor(TEXT_SECONDARY)
                    .setMarginTop(10).setMarginBottom(0));

        wrapper.addCell(content);
        doc.add(wrapper);
    }

    private void addContent(Document doc, String content, DeviceRgb primary) {
        addSectionTitle(doc, "CONTENU DU DOCUMENT", 20);

        Table rule = new Table(UnitValue.createPercentArray(new float[]{100}));
        rule.setWidth(UnitValue.createPercentValue(100));
        rule.setMarginBottom(8);
        Cell ruleCell = new Cell()
                .setBorderTop(new SolidBorder(primary, 0.5f))
                .setBorder(Border.NO_BORDER).setHeight(0.5f);
        rule.addCell(ruleCell);
        doc.add(rule);

        if (content == null || content.isBlank()) {
            doc.add(new Paragraph("Document g\u00E9n\u00E9r\u00E9 le "
                    + LocalDate.now()
                    .format(DateTimeFormatter.ofPattern("dd MMMM yyyy", Locale.FRENCH)))
                    .setFontSize(9).setItalic().setFontColor(TEXT_MUTED));
            return;
        }

        String[] paragraphs = content.split("\\R\\R+");
        for (String para : paragraphs) {
            para = para.trim();
            if (para.isEmpty()) continue;

            String[] lines = para.split("\\R");
            boolean isList = false;
            for (String line : lines) {
                if (line.matches("^\\s*[-*\u2022]\\s.*") || line.matches("^\\s*\\d+[.)]\\s.*")) {
                    isList = true;
                    break;
                }
            }

            if (isList) {
                for (String line : lines) {
                    if (line.isBlank()) continue;
                    doc.add(new Paragraph(line.trim())
                            .setFontSize(9.5f)
                            .setFontColor(TEXT_PRIMARY)
                            .setMultipliedLeading(1.5f)
                            .setMarginBottom(2)
                            .setMarginLeft(12));
                }
            } else {
                doc.add(new Paragraph(para)
                        .setFontSize(9.5f)
                        .setFontColor(TEXT_PRIMARY)
                        .setMultipliedLeading(1.5f)
                        .setMarginBottom(6));
            }
        }
    }

    private void addSignatureBlock(Document doc,
                                   com.weentime.weentimeapp.entity.Document entity) {
        if (entity.getSignedBy() == null || entity.getSignedBy().isBlank()) return;

        Table sigWrapper = new Table(UnitValue.createPercentArray(new float[]{60, 40}));
        sigWrapper.setWidth(UnitValue.createPercentValue(100));
        sigWrapper.setMarginTop(24);

        sigWrapper.addCell(new Cell().setBorder(Border.NO_BORDER));

        Cell sigCell = new Cell()
                .setBorderTop(new SolidBorder(BORDER, 0.5f))
                .setBorder(Border.NO_BORDER).setPaddingTop(8);

        Table badgeTable = new Table(new float[]{1});
        badgeTable.setAutoLayout();
        Cell badge = new Cell()
                .setBackgroundColor(DEFAULT_SECONDARY)
                .setBorder(Border.NO_BORDER)
                .setPadding(4).setPaddingLeft(10).setPaddingRight(10);
        badge.add(new Paragraph("\u2713 Sign\u00E9 \u00E9lectroniquement")
                .setFontSize(7).setBold().setFontColor(WHITE)
                .setMargin(0));
        badgeTable.addCell(badge);
        sigCell.add(badgeTable);

        sigCell.add(new Paragraph(entity.getSignedBy())
                .setFontSize(9).setFontColor(TEXT_PRIMARY).setBold()
                .setMarginTop(8));
        if (entity.getSignedAt() != null)
            sigCell.add(new Paragraph(formatDate(entity.getSignedAt()))
                    .setFontSize(7.5f).setFontColor(TEXT_MUTED).setItalic());

        sigWrapper.addCell(sigCell);
        doc.add(sigWrapper);
    }

    // ═══════════════════════════════════════════════════════════════
    //  FOOTER EVENT HANDLER
    // ═══════════════════════════════════════════════════════════════

    private class FooterHandler implements IEventHandler {
        private final PdfDocument pdfDoc;
        private final EntrepriseResponse entreprise;
        private final PdfFont font;
        private final float marginLeft;
        private final float marginRight;
        private final float marginBottom;

        FooterHandler(PdfDocument pdfDoc, EntrepriseResponse e, PdfFont font,
                      float ml, float mr, float mb) {
            this.pdfDoc = pdfDoc;
            this.entreprise = e;
            this.font = font;
            this.marginLeft = ml;
            this.marginRight = mr;
            this.marginBottom = mb;
        }

        @Override
        public void handleEvent(Event event) {
            PdfDocumentEvent docEvent = (PdfDocumentEvent) event;
            PdfPage page = docEvent.getPage();
            PdfCanvas pCanvas = new PdfCanvas(page);
            Rectangle pageSize = page.getPageSize();
            float footerY = marginBottom - 4;
            float width = pageSize.getWidth() - marginLeft - marginRight;

            pCanvas.setStrokeColor(BORDER).setLineWidth(0.5f)
                    .moveTo(marginLeft, footerY + 12)
                    .lineTo(marginLeft + width, footerY + 12)
                    .stroke();

            Canvas c = new Canvas(pCanvas, pageSize);

            Table footer = new Table(
                    UnitValue.createPercentArray(new float[]{33, 34, 33}));
            footer.setWidth(width)
                    .setFixedPosition(marginLeft, marginBottom - 32, width);

            Cell left = new Cell().setBorder(Border.NO_BORDER);
            String name = entreprise != null && entreprise.getNom() != null
                    ? entreprise.getNom() : "WeenTime";
            left.add(new Paragraph(name)
                    .setFont(font).setFontSize(7).setFontColor(TEXT_MUTED));
            if (entreprise != null && entreprise.getAdresse() != null)
                left.add(new Paragraph(entreprise.getAdresse())
                        .setFont(font).setFontSize(7).setFontColor(TEXT_MUTED));

            Cell center = new Cell().setBorder(Border.NO_BORDER)
                    .setTextAlignment(TextAlignment.CENTER);
            center.add(new Paragraph("G\u00E9n\u00E9r\u00E9 via WeenTime HR Platform")
                    .setFont(font).setFontSize(7).setFontColor(TEXT_MUTED));

            int pageNum = pdfDoc.getPageNumber(page);
            int totalPages = pdfDoc.getNumberOfPages();
            Cell right = new Cell().setBorder(Border.NO_BORDER)
                    .setTextAlignment(TextAlignment.RIGHT);
            right.add(new Paragraph(pageNum + " / " + totalPages)
                    .setFont(font).setFontSize(7).setFontColor(TEXT_MUTED));

            footer.addCell(left);
            footer.addCell(center);
            footer.addCell(right);
            c.add(footer);

            c.add(new Paragraph("Conformément à la législation en vigueur")
                    .setFont(font).setFontSize(6.5f).setItalic().setFontColor(TEXT_MUTED)
                    .setTextAlignment(TextAlignment.CENTER)
                    .setFixedPosition(marginLeft, marginBottom - 44, width));
            c.close();
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  UTILITIES
    // ═══════════════════════════════════════════════════════════════

    public String buildDisplayFilename(com.weentime.weentimeapp.entity.Document entity) {
        EntrepriseResponse entreprise = loadEntreprise(entity);
        String entrepriseName = (entreprise != null && entreprise.getNom() != null)
                ? entreprise.getNom() : "Entreprise";
        String typeLibelle = entity.getTypeDocument() != null
                && entity.getTypeDocument().getLibelle() != null
                ? entity.getTypeDocument().getLibelle() : "Document";
        String mois = entity.getMoisConcerne() != null
                && !entity.getMoisConcerne().isBlank()
                ? "_" + entity.getMoisConcerne().replace("/", "-") : "";
        String base = entrepriseName + "_" + typeLibelle + "_" + entity.getId() + mois;
        String sanitized = Normalizer.normalize(base, Normalizer.Form.NFD)
                .replaceAll("\\p{InCombiningDiacriticalMarks}", "")
                .replaceAll("[^a-zA-Z0-9_]", "_")
                .replaceAll("_+", "_")
                .replaceAll("^_|_$", "");
        if (sanitized.length() > 120) sanitized = sanitized.substring(0, 120);
        return sanitized + ".pdf";
    }

    private EntrepriseResponse loadEntreprise(com.weentime.weentimeapp.entity.Document entity) {
        if (entity.getEntrepriseId() == null) return null;
        try {
            return entrepriseCache.getEntrepriseById(entity.getEntrepriseId());
        } catch (Exception e) {
            log.warn("Impossible de charger les infos entreprise {}", entity.getEntrepriseId(), e);
            return null;
        }
    }

    private static String stripHtml(String html) {
        if (html == null || html.isBlank()) return "";
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

    private static String buildPath(com.weentime.weentimeapp.entity.Document entity, Long userId, String suffix) {
        String rootPath = "uploads/documents/" + userId;
        File dir = new File(rootPath);
        if (!dir.exists()) dir.mkdirs();
        String suffixPart = suffix == null ? "" : "_" + suffix;
        String fileName = entity.getTypeDocument().getCode().toLowerCase()
                + "_" + entity.getId() + suffixPart + ".pdf";
        return rootPath + "/" + fileName;
    }
}
