package com.weentime.weentimeapp.config;

import feign.RequestInterceptor;
import feign.RequestTemplate;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Interceptor Feign qui propage le token JWT de la requête entrante
 * ainsi que la clé de service interne pour les appels inter-services.
 */
@Component
public class FeignClientInterceptor implements RequestInterceptor {

    @Value("${integration.internal-api-key:communication-service-local}")
    private String internalApiKey;

    @Override
    public void apply(RequestTemplate template) {
        if (internalApiKey != null && !internalApiKey.isBlank()) {
            template.header("X-Internal-Service-Key", internalApiKey);
        }

        ServletRequestAttributes attributes =
                (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();

        if (attributes != null) {
            HttpServletRequest request = attributes.getRequest();
            String authorization = request.getHeader("Authorization");
            if (authorization != null) {
                template.header("Authorization", authorization);
            }
        }
    }
}
