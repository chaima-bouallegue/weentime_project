package com.weentime.weentimeproject.config;

import com.weentime.weentimeproject.security.AuthTokenFilter;
import com.weentime.weentimeproject.security.JwtUtils;
import com.weentime.weentimeproject.security.services.UserDetailsServiceImpl;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
@Profile("!dev")
public class SecurityConfig {

    private final JwtUtils jwtUtils;

    @Bean
    public AuthTokenFilter authenticationJwtTokenFilter() {
        return new AuthTokenFilter(jwtUtils);
    }

    @Bean
    public DaoAuthenticationProvider authenticationProvider(
            UserDetailsServiceImpl userDetailsService,
            PasswordEncoder passwordEncoder) {
        DaoAuthenticationProvider authProvider = new DaoAuthenticationProvider();
        authProvider.setUserDetailsService(userDetailsService);
        authProvider.setPasswordEncoder(passwordEncoder);
        return authProvider;
    }

    @Bean
    public AuthenticationManager authenticationManager(
            HttpSecurity http,
            DaoAuthenticationProvider authenticationProvider) throws Exception {
        return http.getSharedObject(
                org.springframework.security.config.annotation.authentication.builders.AuthenticationManagerBuilder.class)
                .authenticationProvider(authenticationProvider)
                .build();
    }

    @Bean
    public SecurityFilterChain filterChain(
            HttpSecurity http,
            DaoAuthenticationProvider authenticationProvider) throws Exception {

        http.cors(Customizer.withDefaults())
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers("/ws/**").permitAll()
                        // Avatars publics
                        .requestMatchers(HttpMethod.GET, "/api/v1/users/avatar/**").permitAll()
                        // Enregistrement & Auth
                        .requestMatchers(HttpMethod.POST,
                                "/api/v1/organisations/users/register")
                        .permitAll()
                        .requestMatchers("/api/v1/organisations/users/auth/**").permitAll()
                        .requestMatchers("/api/v1/organisations/users/register").permitAll()
                        // Endpoints internes inter-services
                        .requestMatchers("/api/v1/organisations/internal/**").permitAll()
                        .requestMatchers("/api/v1/notifications/internal/**").permitAll()
                        // RH & Rôles
                        .requestMatchers("/api/v1/organisations/rh/**").permitAll()
                        .requestMatchers("/api/v1/organisations/roles/**").permitAll()
                        // Code invitation public
                        .requestMatchers(
                                "/api/v1/organisations/entreprises/validate-code/**",
                                "/api/v1/entreprises/validate-code/**",
                                "/api/v1/organisations/by-code/**",
                                "/api/v1/organisations/entreprises/by-code/**",
                                "/api/v1/entreprises/by-code/**")
                        .permitAll()
                        // Entreprises — ADMIN uniquement (double route)
                        .requestMatchers(
                                "/api/v1/organisations/entreprises/**",
                                "/api/v1/entreprises/**")
                        .authenticated()
                        // Users
                        .requestMatchers("/api/v1/users/**").authenticated()
                        // Swagger
                        .requestMatchers(
                                "/v3/api-docs/**",
                                "/swagger-ui/**",
                                "/swagger-ui.html")
                        .permitAll()
                        .anyRequest().authenticated());

        http.authenticationProvider(authenticationProvider);
        http.addFilterBefore(
                authenticationJwtTokenFilter(),
                UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}