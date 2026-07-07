package com.weentime.weentimeapp.config;

import com.weentime.weentimeapp.security.SecurityUtils;
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
    private final SecurityUtils securityUtils;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Long entrepriseId = securityUtils.getCurrentEntrepriseId();
        if (entrepriseId != null) {
            Session session = entityManager.unwrap(Session.class);
            session.enableFilter("entrepriseFilter")
                   .setParameter("entrepriseId", entrepriseId);
        }
        chain.doFilter(request, response);
    }
}
