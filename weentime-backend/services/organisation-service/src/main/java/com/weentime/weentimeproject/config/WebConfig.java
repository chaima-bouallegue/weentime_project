package com.weentime.weentimeproject.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@RequiredArgsConstructor
public class WebConfig implements WebMvcConfigurer {

    private final ModuleAccessInterceptor moduleAccessInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(moduleAccessInterceptor)
                .addPathPatterns(
                        "/api/v1/presences/**",
                        "/api/v1/conges/**",
                        "/api/v1/paie/**",
                        "/api/v1/recrutement/**",
                        "/api/v1/formation/**")
                .excludePathPatterns(
                        "/api/v1/entreprises/**",
                        "/api/v1/organisations/entreprises/**",
                        "/api/v1/organisations/users/auth/**",
                        "/api/v1/organisations/internal/**",
                        "/v3/api-docs/**",
                        "/swagger-ui/**");
    }
}