package com.weentime.weentimeapp.config;

import com.weentime.weentimeapp.security.InternalFilterBypass;
import com.weentime.weentimeapp.security.SecurityUtils;
import jakarta.persistence.EntityManager;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.hibernate.Filter;
import org.hibernate.Session;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.io.IOException;
import java.util.Map;

import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class HibernateFilterConfigTest {

    @Mock
    private ObjectProvider<EntityManager> entityManagerProvider;

    @Mock
    private ObjectProvider<SecurityUtils> securityUtilsProvider;

    @Mock
    private EntityManager entityManager;

    @Mock
    private Session session;

    @Mock
    private Filter filter;

    @Mock
    private SecurityUtils securityUtils;

    @Mock
    private HttpServletRequest request;

    @Mock
    private HttpServletResponse response;

    @Mock
    private FilterChain chain;

    private HibernateFilterConfig filterConfig;

    @BeforeEach
    void setUp() {
        filterConfig = new HibernateFilterConfig(entityManagerProvider, securityUtilsProvider);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void enablesFilterWhenEntrepriseIdPresentAndNotBypassed() throws ServletException, IOException {
        when(entityManagerProvider.getIfAvailable()).thenReturn(entityManager);
        when(securityUtilsProvider.getIfAvailable()).thenReturn(securityUtils);
        when(entityManager.unwrap(Session.class)).thenReturn(session);
        when(session.enableFilter("entrepriseFilter")).thenReturn(filter);
        when(filter.setParameter("entrepriseId", 88L)).thenReturn(filter);

        var auth = new UsernamePasswordAuthenticationToken("user@test.com", "pass");
        auth.setDetails(Map.of("entrepriseId", 88L));
        SecurityContextHolder.getContext().setAuthentication(auth);

        filterConfig.doFilterInternal(request, response, chain);

        verify(session).enableFilter("entrepriseFilter");
        verify(filter).setParameter("entrepriseId", 88L);
        verify(chain).doFilter(request, response);
    }

    @Test
    void skipsFilterWhenEntrepriseIdIsNull() throws ServletException, IOException {
        when(entityManagerProvider.getIfAvailable()).thenReturn(entityManager);
        when(securityUtilsProvider.getIfAvailable()).thenReturn(securityUtils);

        SecurityContextHolder.clearContext();

        filterConfig.doFilterInternal(request, response, chain);

        verify(entityManager, never()).unwrap(Session.class);
        verify(chain).doFilter(request, response);
    }

    @Test
    void skipsFilterWhenBypassActive() throws ServletException, IOException {
        when(entityManagerProvider.getIfAvailable()).thenReturn(entityManager);
        when(securityUtilsProvider.getIfAvailable()).thenReturn(securityUtils);

        var auth = new UsernamePasswordAuthenticationToken("user@test.com", "pass");
        auth.setDetails(Map.of("entrepriseId", 88L));
        SecurityContextHolder.getContext().setAuthentication(auth);

        InternalFilterBypass.enable();
        try {
            filterConfig.doFilterInternal(request, response, chain);
        } finally {
            InternalFilterBypass.disable();
        }

        verify(entityManager, never()).unwrap(Session.class);
        verify(chain).doFilter(request, response);
    }

    @Test
    void skipsFilterWhenProvidersReturnNull() throws ServletException, IOException {
        when(entityManagerProvider.getIfAvailable()).thenReturn(null);
        when(securityUtilsProvider.getIfAvailable()).thenReturn(null);

        filterConfig.doFilterInternal(request, response, chain);

        verify(chain).doFilter(request, response);
    }
}
