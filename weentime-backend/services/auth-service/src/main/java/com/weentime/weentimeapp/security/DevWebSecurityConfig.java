package com.weentime.weentimeapp.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableWebSecurity
@Profile("dev")
public class DevWebSecurityConfig {

    // TEMPORARY: Disable security for development testing
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        String appEnv = System.getenv("APP_ENV");
        if ("production".equalsIgnoreCase(appEnv)) {
            throw new IllegalStateException("SÉCURITÉ : profil 'dev' activé en production. Arrêt immédiat du service.");
        }
        http
                .csrf(csrf -> csrf.disable())
                // TEMPORARY: Disable security for development testing
                .anonymous(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll());

        return http.build();
    }
}
