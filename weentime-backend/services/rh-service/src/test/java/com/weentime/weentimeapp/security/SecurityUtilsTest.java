package com.weentime.weentimeapp.security;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SecurityUtilsTest {

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void getCurrentUserIdReturnsValueWhenPresent() {
        var auth = new UsernamePasswordAuthenticationToken("user@test.com", "N/A");
        auth.setDetails(Map.of("userId", 42L));
        SecurityContextHolder.getContext().setAuthentication(auth);

        assertThat(SecurityUtils.getCurrentUserId()).isEqualTo(42L);
    }

    @Test
    void getCurrentUserIdThrowsWhenAuthIsNull() {
        SecurityContextHolder.clearContext();

        assertThatThrownBy(SecurityUtils::getCurrentUserId)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Authentication context not found");
    }

    @Test
    void getCurrentUserIdThrowsWhenUserIdMissingInDetails() {
        var auth = new UsernamePasswordAuthenticationToken("user@test.com", "N/A");
        auth.setDetails(Map.of());
        SecurityContextHolder.getContext().setAuthentication(auth);

        assertThatThrownBy(SecurityUtils::getCurrentUserId)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("User ID not found in security context");
    }

    @Test
    void getCurrentUserIdThrowsWhenDetailsNotMap() {
        var auth = new UsernamePasswordAuthenticationToken("user@test.com", "N/A");
        auth.setDetails("not-a-map");
        SecurityContextHolder.getContext().setAuthentication(auth);

        assertThatThrownBy(SecurityUtils::getCurrentUserId)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("User ID not found in security context");
    }

    @Test
    void getCurrentEntrepriseIdReturnsValueWhenPresent() {
        var auth = new UsernamePasswordAuthenticationToken("user@test.com", "N/A");
        auth.setDetails(Map.of("entrepriseId", 99L));
        SecurityContextHolder.getContext().setAuthentication(auth);

        assertThat(SecurityUtils.getCurrentEntrepriseId()).isEqualTo(99L);
    }

    @Test
    void getCurrentEntrepriseIdReturnsNullWhenAuthNull() {
        SecurityContextHolder.clearContext();

        assertThat(SecurityUtils.getCurrentEntrepriseId()).isNull();
    }

    @Test
    void getCurrentEntrepriseIdReturnsNullWhenDetailsNotMap() {
        var auth = new UsernamePasswordAuthenticationToken("user@test.com", "N/A");
        auth.setDetails("string-details");
        SecurityContextHolder.getContext().setAuthentication(auth);

        assertThat(SecurityUtils.getCurrentEntrepriseId()).isNull();
    }

    @Test
    void getCurrentEntrepriseIdReturnsNullWhenEntrepriseIdNotNumber() {
        var auth = new UsernamePasswordAuthenticationToken("user@test.com", "N/A");
        auth.setDetails(Map.of("entrepriseId", "not-a-number"));
        SecurityContextHolder.getContext().setAuthentication(auth);

        assertThat(SecurityUtils.getCurrentEntrepriseId()).isNull();
    }
}
