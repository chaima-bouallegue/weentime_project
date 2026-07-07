package com.weentime.weentimeapp.config;

import feign.RequestInterceptor;
import feign.RequestTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class InternalAuthFeignInterceptor implements RequestInterceptor {

    @Value("${weentime.internal.secret:WeenTimeInternalSecretKey2026}")
    private String internalSecret;

    @Value("${integration.internal-api-key:communication-service-local}")
    private String internalApiKey;

    @Override
    public void apply(RequestTemplate template) {
        if (internalApiKey != null && !internalApiKey.isBlank()) {
            template.header("X-Internal-Service-Key", internalApiKey);
        }
        if (internalSecret != null && !internalSecret.isBlank()) {
            template.header("X-Internal-Secret", internalSecret);
        }
    }
}
