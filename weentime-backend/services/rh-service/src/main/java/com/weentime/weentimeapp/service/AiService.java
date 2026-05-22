package com.weentime.weentimeapp.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Service de génération IA multi-provider.
 * Priorité : Gemini Flash (gratuit) → FastAPI ai-service (fallback)
 */
@Service
@Slf4j
@SuppressWarnings({"null", "unchecked"})
public class AiService {

    public record AiResponse(String text, int tokens, String model) {}

    public record CvAnalysisResult(
        double overallScore,
        double technicalScore,
        double experienceScore,
        double competenceScore,
        String recommendation,
        String summary,
        List<String> strengths,
        List<String> weaknesses,
        List<String> competencesTrouvees,
        List<String> competencesManquantes,
        Integer experienceDetectee,
        int niveauConfiance,
        String rawJson
    ) {}

    private final RestTemplate restTemplate;

    public AiService() {
        org.springframework.http.client.SimpleClientHttpRequestFactory factory = 
            new org.springframework.http.client.SimpleClientHttpRequestFactory();
        factory.setBufferRequestBody(true); // Évite l'erreur "Error writing request body to server" sur certains environnements
        this.restTemplate = new RestTemplate(factory);
    }

    @Value("${gemini.api.key:}")
    private String geminiApiKey;

    @Value("${ai.service.url:http://localhost:8000}")
    private String aiServiceUrl;

    private static final String GEMINI_URL =
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

    private static final String DEFAULT_SYSTEM_PROMPT = """
        Tu es le rédacteur documentaire officiel de l'entreprise.
        RÈGLES CRITIQUES :
        1. N'invente JAMAIS de données factuelles (nom, prénom, salaire, dates, poste).
        2. Utilise UNIQUEMENT les données fournies.
        3. Si une donnée manque, écris [DONNÉE MANQUANTE].
        4. Ton : Professionnel, Formel, Neutre.
        5. Retourne uniquement le contenu du document, sans balises markdown.
        """;

    /**
     * Génère du contenu documentaire. 
     * Désormais, on délègue tout au ai-service Python (port 8000) 
     * pour centraliser la gestion des clés et des modèles.
     */
    public AiResponse generateDocument(String prompt) {
        log.info("Génération de document via la passerelle IA Python...");
        try {
            return generateWithAiService(DEFAULT_SYSTEM_PROMPT, prompt, 0.2f);
        } catch (Exception e) {
            log.error("Échec de la génération via la passerelle IA : {}", e.getMessage());
            throw new RuntimeException("Le service IA est momentanément indisponible. Veuillez réessayer.", e);
        }
    }

    /**
     * Méthode pour la génération avancée.
     */
    public AiResponse generateWithGemini(String systemPrompt, String userPrompt, float temperature) {
        return generateWithAiService(systemPrompt, userPrompt, temperature);
    }

    /**
     * Appelle le service FastAPI Python (port 8000).
     */
    private AiResponse generateWithAiService(String systemPrompt, String userPrompt, float temperature) {
        Map<String, Object> request = new HashMap<>();
        request.put("system_prompt", systemPrompt);
        request.put("user_prompt", userPrompt);
        request.put("temperature", temperature);
        request.put("max_tokens", 2000);
        request.put("provider", "gemini"); // On demande explicitement Gemini (que nous avons stabilisé)

        try {
            Map<String, Object> response = restTemplate.postForObject(
                aiServiceUrl + "/v1/ai/generate-document",
                request, Map.class
            );

            if (response != null && response.containsKey("content")) {
                String text = (String) response.get("content");
                int tokens = response.containsKey("tokens_used") ? ((Number) response.get("tokens_used")).intValue() : 0;
                String model = response.containsKey("model_used") ? (String) response.get("model_used") : "ai-gateway";
                return new AiResponse(text, tokens, model);
            }
            throw new RuntimeException("Réponse de la passerelle IA invalide");
        } catch (Exception e) {
            log.error("Erreur de communication avec la passerelle IA : {}", e.getMessage());
            throw new RuntimeException("Erreur de connexion au service IA : " + e.getMessage(), e);
        }
    }

    /**
     * Analyse un CV par rapport à une offre (appel synchrone simple).
     */
    public CvAnalysisResult analyzeCv(String cvPath, String jobTitle, String jobDescription) {
        Map<String, Object> request = new HashMap<>();
        request.put("cv_path", cvPath);
        request.put("job_title", jobTitle);
        request.put("job_description", jobDescription);

        try {
            Map<String, Object> response = restTemplate.postForObject(
                aiServiceUrl + "/v1/recrutement/analyze-cv",
                request, Map.class
            );

            if (response != null && response.containsKey("overall_score")) {
                return new CvAnalysisResult(
                    ((Number) response.get("overall_score")).doubleValue(),
                    ((Number) response.get("technical_score")).doubleValue(),
                    0, 0,
                    (String) response.get("recommendation"),
                    (String) response.get("summary"),
                    (java.util.List<String>) response.get("strengths"),
                    (java.util.List<String>) response.get("weaknesses"),
                    List.of(), List.of(), null, 0,
                    (String) response.get("raw_json")
                );
            }
            return null;
        } catch (Exception e) {
            log.error("Erreur lors de l'analyse CV par l'IA : {}", e.getMessage());
            return null;
        }
    }

    /**
     * Lance l'évaluation IA enrichie de manière asynchrone (fire-and-forget).
     * Appelle le nouvel endpoint /recruitment/evaluate-cv du ai-service Python.
     * Le ai-service fait le callback vers InternalRecruitmentController une fois terminé.
     */
    @Async
    public void evaluateCvAsync(Long applicationId, Long entrepriseId, String cvFilePath,
                                 String jobTitle, String jobDescription,
                                 List<String> competencesRequises,
                                 Integer experienceMinAnnees, String niveauExperience) {
        try {
            java.io.File file = new java.io.File(cvFilePath);
            if (!file.exists()) {
                log.error("❌ Fichier CV introuvable sur le disque Java: {}", cvFilePath);
                return;
            }

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.MULTIPART_FORM_DATA);

            org.springframework.util.MultiValueMap<String, Object> body = new org.springframework.util.LinkedMultiValueMap<>();
            body.add("application_id", applicationId.toString());
            body.add("entreprise_id", entrepriseId.toString());
            body.add("job_title", jobTitle);
            body.add("job_description", jobDescription != null ? jobDescription : "");
            
            // Sérialisation des compétences requises en chaîne JSON
            String competencesJson = "[]";
            if (competencesRequises != null && !competencesRequises.isEmpty()) {
                com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
                competencesJson = mapper.writeValueAsString(competencesRequises);
            }
            body.add("competences_requises", competencesJson);
            body.add("experience_min_annees", experienceMinAnnees != null ? experienceMinAnnees.toString() : "0");
            body.add("niveau_experience", niveauExperience != null ? niveauExperience : "NON_SPECIFIE");
            
            // Fichier CV binaire
            body.add("file", new org.springframework.core.io.FileSystemResource(file));

            HttpEntity<org.springframework.util.MultiValueMap<String, Object>> requestEntity = new HttpEntity<>(body, headers);

            log.info("🔍 Lancement évaluation IA enrichie via multipart pour candidature #{}", applicationId);
            restTemplate.postForObject(
                aiServiceUrl + "/recruitment/evaluate-cv",
                requestEntity,
                Map.class
            );
            log.info("✅ Évaluation IA lancée avec succès (multipart) pour candidature #{}", applicationId);
        } catch (Exception e) {
            log.error("❌ Erreur lors du lancement de l'évaluation IA (multipart) pour candidature #{}: {}",
                       applicationId, e.getMessage());
        }
    }
}
