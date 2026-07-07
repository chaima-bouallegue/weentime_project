package com.weentime.communication.config;

import com.weentime.communication.security.SecurityUtils;
import jakarta.persistence.EntityManager;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.hibernate.Session;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
@RequiredArgsConstructor
public class HibernateFilterConfig extends OncePerRequestFilter {

    private final EntityManager entityManager;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        try {
            Long entrepriseId = SecurityUtils.currentUser().entrepriseId();
            if (entrepriseId != null) {
                Session session = entityManager.unwrap(Session.class);
                session.enableFilter("entrepriseFilter")
                       .setParameter("entrepriseId", entrepriseId);
            }
        } catch (Exception ignored) {
        }
        chain.doFilter(request, response);
    }
}
