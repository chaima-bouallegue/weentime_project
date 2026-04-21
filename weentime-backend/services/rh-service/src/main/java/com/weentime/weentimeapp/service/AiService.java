package com.weentime.weentimeapp.service;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@SuppressWarnings({"null", "unchecked"})
public class AiService {

    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${anthropic.api.key:}")
    private String apiKey;

    public String generateDocument(String prompt) {
        if (apiKey == null || apiKey.isEmpty()) {
            throw new RuntimeException("Anthropic API key is not configured in the backend.");
        }

        String url = "https://api.anthropic.com/v1/messages";

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("x-api-key", apiKey);
        headers.set("anthropic-version", "2023-06-01");

        Map<String, Object> body = new HashMap<>();
        body.put("model", "claude-3-5-sonnet-20240620");
        body.put("max_tokens", 1000);
        body.put("messages", List.of(Map.of("role", "user", "content", prompt)));

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);

        try {
            Map<String, Object> response = restTemplate.postForObject(url, entity, Map.class);
            if (response != null && response.containsKey("content")) {
                List<Map<String, Object>> contentList = (List<Map<String, Object>>) response.get("content");
                if (!contentList.isEmpty()) {
                    return (String) contentList.get(0).get("text");
                }
            }
            throw new RuntimeException("Invalid response from Anthropic API");
        } catch (Exception e) {
            throw new RuntimeException("Error calling Anthropic API: " + e.getMessage(), e);
        }
    }
}
