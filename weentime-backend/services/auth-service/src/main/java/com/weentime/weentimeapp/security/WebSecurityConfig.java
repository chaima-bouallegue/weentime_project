package com.weentime.weentimeapp.security;

import com.weentime.weentimeapp.security.services.UserDetailsServiceImpl;
import com.weentime.weentimeapp.service.TokenBlacklistService;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;



@Configuration
@EnableMethodSecurity
@RequiredArgsConstructor
@Profile("!dev")
public class WebSecurityConfig {

    private final UserDetailsServiceImpl userDetailsService;
    private final JwtUtils jwtUtils;
    private final PasswordEncoder passwordEncoder;
    private final TokenBlacklistService tokenBlacklistService;

    @Bean
    public AuthTokenFilter authenticationJwtTokenFilter() {
        return new AuthTokenFilter(jwtUtils, tokenBlacklistService);
    }

    @Bean
    public DaoAuthenticationProvider authenticationProvider() {
        DaoAuthenticationProvider authProvider = new DaoAuthenticationProvider();
        authProvider.setUserDetailsService(userDetailsService);
        authProvider.setPasswordEncoder(passwordEncoder);
        return authProvider;
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) {
        try {
            http
                    .cors(Customizer.withDefaults())
                    .csrf(AbstractHttpConfigurer::disable)
                    .sessionManagement(session ->
                            session.sessionCreationPolicy(SessionCreationPolicy.STATELESS)
                    )
                    .authorizeHttpRequests(auth ->
                            auth.requestMatchers(
                                            "/api/v1/auth/login",
                                             "/api/v1/auth/logout",
                                             "/api/v1/auth/register",
                                            "/api/v1/auth/mfa/verify",
                                            "/api/v1/auth/verify-2fa",
                                            "/api/v1/auth/2fa/verify",
                                            "/api/v1/auth/2fa/send",
                                            "/api/v1/auth/validate",
                                            "/api/v1/auth/refresh",
                                            "/health"
                                    ).permitAll()
                                    .requestMatchers(
                                            "/api/v1/auth/mfa/setup",
                                            "/api/v1/auth/mfa/enable",
                                            "/api/v1/auth/mfa/disable",
                                            "/api/v1/auth/2fa/setup",
                                            "/api/v1/auth/2fa/setup/**",
                                            "/api/v1/auth/2fa/confirm",
                                            "/api/v1/auth/2fa/confirm/**",
                                            "/api/v1/auth/2fa/disable",
                                            "/api/v1/auth/admin/**"
                                    ).authenticated()
                                    .requestMatchers("/api/v1/organisations/users/auth/**").permitAll()
                                    .requestMatchers("/api/v1/organisations/roles/**").permitAll()
                                    .requestMatchers("/api/v1/organisations/users/register").permitAll()
                                    .requestMatchers("/api/v1/organisations/entreprises/validate-code/**").permitAll()
                                    .requestMatchers("/api/v1/organisations/by-code/**").permitAll()
                                    .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                                    .anyRequest().authenticated()
                    );


            http.authenticationProvider(authenticationProvider());
            http.addFilterBefore(authenticationJwtTokenFilter(), UsernamePasswordAuthenticationFilter.class);

            return http.build();

        } catch (Exception e) {
            throw new IllegalStateException("Erreur configuration SecurityFilterChain", e);
        }
    }
}
