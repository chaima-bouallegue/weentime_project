package com.weentime.weentimeapp.service;

import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.dto.UserResponse;
import com.weentime.weentimeapp.entity.Document;
import com.weentime.weentimeapp.entity.TypeDocument;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * Orchestrateur de génération documentaire.
 * Décide de la stratégie (template, hybride, IA complète) et produit le PDF final.
 *
 * Architecture Cost-Optimized :
 * - TEMPLATE_ONLY : 0€ (variables DB uniquement)
 * - AI_HYBRID     : ~0.001€ (template + corps IA)
 * - AI_FULL       : ~0.002€ (génération libre)
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class DocumentGeneratorService {

    private final TemplateResolver templateResolver;
    private final OrganisationServiceClient organisationClient;
    private final DocumentPdfGenerator pdfGenerator;
    private final AiService aiService;

    /**
     * Résultat de la génération documentaire.
     */
    public record GeneratedDocument(
        String content,
        String pdfPath,
        String modelUsed,
        int tokensUsed,
        boolean generatedByAI
    ) {}

    /**
     * Génère un document selon le mode configuré dans TypeDocument.
     */
    public GeneratedDocument generate(Document document, TypeDocument typeDoc) {
        UserResponse user = organisationClient.getUtilisateurById(document.getUtilisateurId());
        Map<String, String> variables = templateResolver.buildVariables(user, document);

        String mode = typeDoc.getModeGeneration() != null ? typeDoc.getModeGeneration() : "TEMPLATE_ONLY";

        log.info("Generating document: type={}, mode={}, user={}",
            typeDoc.getCode(), mode, document.getUtilisateurId());

        return switch (mode) {
            case "TEMPLATE_ONLY" -> generateFromTemplate(typeDoc, variables, document, user);
            case "AI_HYBRID"     -> generateHybrid(typeDoc, variables, document, user);
            case "AI_FULL"       -> generateFullAI(typeDoc, variables, document, user);
            default              -> generateFromTemplate(typeDoc, variables, document, user);
        };
    }

    /**
     * Génère uniquement le contenu (HTML) sans PDF.
     * Utilisé par l'éditeur RH pour l'aperçu et la régénération.
     */
    public GeneratedDocument generateContentOnly(Document document, TypeDocument typeDoc) {
        UserResponse user = organisationClient.getUtilisateurById(document.getUtilisateurId());
        Map<String, String> variables = templateResolver.buildVariables(user, document);

        String mode = typeDoc.getModeGeneration() != null ? typeDoc.getModeGeneration() : "TEMPLATE_ONLY";

        log.info("Generating content (no PDF): type={}, mode={}, user={}",
            typeDoc.getCode(), mode, document.getUtilisateurId());

        return switch (mode) {
            case "TEMPLATE_ONLY" -> generateContentFromTemplate(typeDoc, variables);
            case "AI_HYBRID"     -> generateHybridContent(typeDoc, variables);
            case "AI_FULL"       -> generateFullAIContent(typeDoc, variables);
            default              -> generateContentFromTemplate(typeDoc, variables);
        };
    }

    /**
     * TEMPLATE_ONLY — Coût = 0€
     * Remplace les variables {{...}} dans le template et génère le PDF.
     */
    private GeneratedDocument generateFromTemplate(
            TypeDocument typeDoc, Map<String, String> vars,
            Document doc, UserResponse user) {

        String template = typeDoc.getContentTemplate();
        if (template == null || template.isBlank()) {
            // Fallback : template générique par défaut
            template = buildDefaultTemplate(typeDoc, vars);
        }

        String content = templateResolver.resolve(template, vars);
        String pdfPath = pdfGenerator.generatePdfFromContent(doc, user, content);

        log.info("Template-only generation complete: type={}, cost=0€", typeDoc.getCode());
        return new GeneratedDocument(content, pdfPath, "none", 0, false);
    }

    /**
     * AI_HYBRID — Coût ≈ 0.001€
     * Le header/footer vient du template, le corps est généré par IA.
     */
    private GeneratedDocument generateHybrid(
            TypeDocument typeDoc, Map<String, String> vars,
            Document doc, UserResponse user) {

        // Résoudre la partie template (structure fixe)
        String template = typeDoc.getContentTemplate();
        String partialContent = template != null
            ? templateResolver.resolve(template, vars)
            : "";

        // Générer la partie IA (corps du document)
        String aiPrompt = typeDoc.getAiPromptTemplate();
        if (aiPrompt == null || aiPrompt.isBlank()) {
            aiPrompt = "Génère le corps principal du document de type '"
                + typeDoc.getLibelle() + "' pour l'employé "
                + vars.getOrDefault("employee.nomComplet", "") + ".";
        }
        String resolvedPrompt = templateResolver.resolve(aiPrompt, vars);

        String systemPrompt = buildSystemPrompt(typeDoc);
        float temperature = typeDoc.getAiTemperature() != null ? typeDoc.getAiTemperature() : 0.2f;

        AiService.AiResponse aiRes = aiService.generateWithGemini(systemPrompt, resolvedPrompt, temperature);
        String aiContent = aiRes.text();

        // Merger : remplacer {{AI_CONTENT}} dans le template
        String finalContent;
        if (partialContent.contains("{{AI_CONTENT}}")) {
            finalContent = partialContent.replace("{{AI_CONTENT}}", aiContent);
        } else {
            finalContent = partialContent + "\n\n" + aiContent;
        }

        String pdfPath = pdfGenerator.generatePdfFromContent(doc, user, finalContent);

        log.info("Hybrid generation complete: type={}", typeDoc.getCode());
        return new GeneratedDocument(finalContent, pdfPath, aiRes.model(), aiRes.tokens(), true);
    }

    /**
     * AI_FULL — Coût ≈ 0.002€
     * L'intégralité du document est générée par l'IA.
     */
    private GeneratedDocument generateFullAI(
            TypeDocument typeDoc, Map<String, String> vars,
            Document doc, UserResponse user) {

        String aiPrompt = typeDoc.getAiPromptTemplate();
        if (aiPrompt == null || aiPrompt.isBlank()) {
            aiPrompt = buildDefaultAIPrompt(typeDoc, vars);
        }
        String resolvedPrompt = templateResolver.resolve(aiPrompt, vars);

        String systemPrompt = buildSystemPrompt(typeDoc);
        float temperature = typeDoc.getAiTemperature() != null ? typeDoc.getAiTemperature() : 0.3f;

        AiService.AiResponse aiRes = aiService.generateWithGemini(systemPrompt, resolvedPrompt, temperature);
        String content = aiRes.text();
        String pdfPath = pdfGenerator.generatePdfFromContent(doc, user, content);

        log.info("Full AI generation complete: type={}", typeDoc.getCode());
        return new GeneratedDocument(content, pdfPath, aiRes.model(), aiRes.tokens(), true);
    }

    // ── Content-only generation methods (no PDF) ────────────────────────────

    private GeneratedDocument generateContentFromTemplate(TypeDocument typeDoc, Map<String, String> vars) {
        String template = typeDoc.getContentTemplate();
        if (template == null || template.isBlank()) {
            template = buildDefaultTemplate(typeDoc, vars);
        }
        String content = templateResolver.resolve(template, vars);
        log.info("Template-only content generated (no PDF): type={}", typeDoc.getCode());
        return new GeneratedDocument(content, null, "none", 0, false);
    }

    private GeneratedDocument generateHybridContent(TypeDocument typeDoc, Map<String, String> vars) {
        String template = typeDoc.getContentTemplate();
        String partialContent = template != null ? templateResolver.resolve(template, vars) : "";

        String aiPrompt = typeDoc.getAiPromptTemplate();
        if (aiPrompt == null || aiPrompt.isBlank()) {
            aiPrompt = "Génère le corps principal du document de type '"
                + typeDoc.getLibelle() + "' pour l'employé "
                + vars.getOrDefault("employee.nomComplet", "") + ".";
        }
        String resolvedPrompt = templateResolver.resolve(aiPrompt, vars);
        String systemPrompt = buildSystemPrompt(typeDoc);
        float temperature = typeDoc.getAiTemperature() != null ? typeDoc.getAiTemperature() : 0.2f;

        AiService.AiResponse aiRes = aiService.generateWithGemini(systemPrompt, resolvedPrompt, temperature);
        String finalContent = partialContent.contains("{{AI_CONTENT}}")
            ? partialContent.replace("{{AI_CONTENT}}", aiRes.text())
            : partialContent + "\n\n" + aiRes.text();

        log.info("Hybrid content generated (no PDF): type={}", typeDoc.getCode());
        return new GeneratedDocument(finalContent, null, aiRes.model(), aiRes.tokens(), true);
    }

    private GeneratedDocument generateFullAIContent(TypeDocument typeDoc, Map<String, String> vars) {
        String aiPrompt = typeDoc.getAiPromptTemplate();
        if (aiPrompt == null || aiPrompt.isBlank()) {
            aiPrompt = buildDefaultAIPrompt(typeDoc, vars);
        }
        String resolvedPrompt = templateResolver.resolve(aiPrompt, vars);
        String systemPrompt = buildSystemPrompt(typeDoc);
        float temperature = typeDoc.getAiTemperature() != null ? typeDoc.getAiTemperature() : 0.3f;

        AiService.AiResponse aiRes = aiService.generateWithGemini(systemPrompt, resolvedPrompt, temperature);
        log.info("Full AI content generated (no PDF): type={}", typeDoc.getCode());
        return new GeneratedDocument(aiRes.text(), null, aiRes.model(), aiRes.tokens(), true);
    }

    /**
     * Construit le system prompt avec les règles de sécurité anti-hallucination.
     */
    private String buildSystemPrompt(TypeDocument typeDoc) {
        String lang = typeDoc.getLanguesDisponibles() != null
            ? typeDoc.getLanguesDisponibles().split(",")[0].trim()
            : "fr";

        String langInstruction = switch (lang) {
            case "ar" -> "Rédige en arabe standard (فصحى).";
            case "en" -> "Write in formal English.";
            default   -> "Rédige en français formel.";
        };

        return """
            Tu es le rédacteur documentaire officiel de l'entreprise.
            
            RÈGLES CRITIQUES (VIOLATION = DOCUMENT INVALIDE) :
            1. N'invente JAMAIS de données factuelles (nom, prénom, salaire, dates, poste, département).
            2. Utilise UNIQUEMENT les données fournies dans le prompt.
            3. Si une donnée manque, écris [DONNÉE MANQUANTE] à la place.
            4. Ton : Professionnel, Formel, Neutre, Respectueux.
            5. """ + langInstruction + """
            
            6. Ne génère AUCUN commentaire, explication ou note — uniquement le contenu du document.
            7. N'utilise pas de balises markdown, HTML ou autre formatage.
            8. Inclus les formules légales appropriées (ex: "Pour faire valoir ce que de droit").
            """;
    }

    /**
     * Template par défaut si aucun template n'est configuré.
     */
    private String buildDefaultTemplate(TypeDocument typeDoc, Map<String, String> vars) {
        return """
            Le soussigné, {{company.name}}, certifie par la présente que
            {{employee.prenom}} {{employee.nom}}, occupe le poste de
            {{employee.poste}} au sein du département {{employee.departement}}
            depuis le {{employee.dateEntree}}.
            
            Cette attestation est délivrée à l'intéressé(e) pour servir
            et valoir ce que de droit.
            
            Fait à {{company.city}}, le {{document.date}}
            
            Direction des Ressources Humaines
            """;
    }

    /**
     * Prompt IA par défaut si aucun prompt n'est configuré.
     */
    private String buildDefaultAIPrompt(TypeDocument typeDoc, Map<String, String> vars) {
        return """
            Génère un document officiel de type "%s" pour l'employé suivant :
            - Nom complet : %s
            - Poste : %s
            - Département : %s
            - Date d'entrée : %s
            - Ancienneté : %s
            
            Le document doit être formel, professionnel, avec la date du jour (%s),
            les formules légales appropriées et la mention "Pour faire valoir ce que de droit".
            """.formatted(
                typeDoc.getLibelle(),
                vars.getOrDefault("employee.nomComplet", "[NON RENSEIGNÉ]"),
                vars.getOrDefault("employee.poste", "[NON RENSEIGNÉ]"),
                vars.getOrDefault("employee.departement", "[NON RENSEIGNÉ]"),
                vars.getOrDefault("employee.dateEntree", "[NON RENSEIGNÉ]"),
                vars.getOrDefault("employee.anciennete", "[NON RENSEIGNÉ]"),
                vars.getOrDefault("document.date", "")
            );
    }
}
