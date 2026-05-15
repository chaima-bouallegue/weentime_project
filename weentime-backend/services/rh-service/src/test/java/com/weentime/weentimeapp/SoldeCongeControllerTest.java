package com.weentime.weentimeapp;

import com.weentime.weentimeapp.controller.SoldeCongeController;
import com.weentime.weentimeapp.exception.GlobalExceptionHandler;
import com.weentime.weentimeapp.service.SoldeCongeService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(SoldeCongeController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class SoldeCongeControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private SoldeCongeService soldeCongeService;

    @BeforeEach
    void setUpSecurityContext() {
        SecurityContextHolder.getContext().setAuthentication(employeeAuthentication());
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void testSoldeCongeEmpty() throws Exception {
        when(soldeCongeService.getByUtilisateur(7L, 2026)).thenReturn(List.of());

        mockMvc.perform(get("/api/v1/rh/solde-conges/me/all")
                        .param("annee", "2026"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(0));
    }

    private UsernamePasswordAuthenticationToken employeeAuthentication() {
        UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                "employee1@weentime.com",
                "n/a",
                List.of(new SimpleGrantedAuthority("ROLE_EMPLOYEE"))
        );
        authentication.setDetails(Map.of(
                "userId", 7L,
                "entrepriseId", 2L
        ));
        return authentication;
    }
}
