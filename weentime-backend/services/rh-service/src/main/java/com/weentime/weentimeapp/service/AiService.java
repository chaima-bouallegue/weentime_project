package com.weentime.weentimeapp.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
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
     * Génère du contenu documentaire via Gemini Flash API.
     * C'est la méthode principale, remplaçant l'ancien appel Anthropic Claude.
     */
    public AiResponse generateDocument(String prompt) {
        // Priorité 1 : Gemini Flash (gratuit, rapide)
        if (geminiApiKey != null && !geminiApiKey.isBlank()) {
            try {
                return generateWithGemini(DEFAULT_SYSTEM_PROMPT, prompt, 0.2f);
            } catch (Exception e) {
                log.warn("Gemini Flash failed, trying ai-service fallback: {}", e.getMessage());
            }
        }

        // Priorité 2 : ai-service FastAPI (Ollama/autre)
        try {
            return generateWithAiService(prompt);
        } catch (Exception e) {
            log.error("All AI providers failed: {}", e.getMessage());
            throw new RuntimeException("Aucun service IA disponible. Veuillez réessayer.", e);
        }
    }

    /**
     * Génère du contenu via Gemini Flash avec contrôle total des paramètres.
     */
    public AiResponse generateWithGemini(String systemPrompt, String userPrompt, float temperature) {
        Map<String, Object> body = new HashMap<>();

        // System instruction
        body.put("system_instruction", Map.of(
            "parts", List.of(Map.of("text", systemPrompt))
        ));

        // User content
        body.put("contents", List.of(Map.of(
            "role", "user",
            "parts", List.of(Map.of("text", userPrompt))
        )));

        // Generation config
        body.put("generationConfig", Map.of(
            "temperature", temperature,
            "maxOutputTokens", 2000
        ));

        String url = GEMINI_URL + "?key=" + geminiApiKey;

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);

        try {
            Map<String, Object> response = restTemplate.postForObject(url, entity, Map.class);

            if (response == null || !response.containsKey("candidates")) {
                throw new RuntimeException("Réponse Gemini invalide : pas de candidates");
            }

            List<Map<String, Object>> candidates = (List<Map<String, Object>>) response.get("candidates");
            if (candidates.isEmpty()) {
                throw new RuntimeException("Réponse Gemini vide");
            }

            Map<String, Object> content = (Map<String, Object>) candidates.get(0).get("content");
            List<Map<String, Object>> parts = (List<Map<String, Object>>) content.get("parts");
            String text = (String) parts.get(0).get("text");

            int tokens = 0;
            Map<String, Object> usage = (Map<String, Object>) response.get("usageMetadata");
            if (usage != null && usage.get("totalTokenCount") != null) {
                tokens = ((Number) usage.get("totalTokenCount")).intValue();
                log.info("Gemini usage: totalTokens={}", tokens);
            }

            return new AiResponse(text, tokens, "gemini-2.0-flash");
        } catch (Exception e) {
            log.error("Gemini Flash API error: {}", e.getMessage());
            throw new RuntimeException("Erreur Gemini Flash: " + e.getMessage(), e);
        }
    }

    /**
     * Génère du contenu via le ai-service FastAPI (Ollama local / autre provider).
     */
    private AiResponse generateWithAiService(String prompt) {
        Map<String, Object> request = Map.of(
            "system_prompt", DEFAULT_SYSTEM_PROMPT,
            "user_prompt", prompt,
            "temperature", 0.2,
            "max_tokens", 2000,
            "provider", "ollama"
        );

        try {
            Map<String, Object> response = restTemplate.postForObject(
                aiServiceUrl + "/v1/ai/generate-document",
                request, Map.class
            );

            if (response != null && response.containsKey("content")) {
                String text = (String) response.get("content");
                int tokens = response.containsKey("tokens_used") ? ((Number) response.get("tokens_used")).intValue() : 0;
                String model = response.containsKey("model_used") ? (String) response.get("model_used") : "ai-service";
                return new AiResponse(text, tokens, model);
            }
            throw new RuntimeException("Réponse ai-service invalide");
        } catch (Exception e) {
            throw new RuntimeException("Erreur ai-service: " + e.getMessage(), e);
        }
    }
}
