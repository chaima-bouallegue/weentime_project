package com.weentime.weentimeapp.config;

import feign.RequestInterceptor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OrganisationFeignConfig {

    @Bean
    public RequestInterceptor internalServiceKeyInterceptor(
            @Value("${integration.internal-api-key:communication-service-local}") String internalApiKey) {
        return template -> {
            if (internalApiKey != null && !internalApiKey.isBlank()) {
                template.header("X-Internal-Service-Key", internalApiKey);
            }
        };
    }
}
