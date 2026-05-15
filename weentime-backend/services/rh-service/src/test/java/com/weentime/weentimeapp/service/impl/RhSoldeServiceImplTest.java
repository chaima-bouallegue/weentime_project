package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.dto.EmployeeSoldeResponse;
import com.weentime.weentimeapp.dto.PageResponse;
import com.weentime.weentimeapp.repository.SoldeAuditLogRepository;
import com.weentime.weentimeapp.repository.SoldeCongeRepository;
import com.weentime.weentimeapp.repository.TypeCongeRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RhSoldeServiceImplTest {

    @Mock
    private SoldeCongeRepository soldeCongeRepository;

    @Mock
    private TypeCongeRepository typeCongeRepository;

    @Mock
    private SoldeAuditLogRepository auditLogRepository;

    @Mock
    private OrganisationServiceClient organisationServiceClient;

    @InjectMocks
    private RhSoldeServiceImpl rhSoldeService;

    @BeforeEach
    void setUpSecurityContext() {
        UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                "rh@weentime.com",
                "n/a",
                List.of()
        );
        authentication.setDetails(Map.of(
                "userId", 2L,
                "entrepriseId", 2L
        ));
        SecurityContextHolder.getContext().setAuthentication(authentication);
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void getGlobalSoldesReturnsEmptyPageWhenOrganisationServiceFails() {
        when(organisationServiceClient.findUsersByEntreprise(2L))
                .thenThrow(new RuntimeException("organisation-service unavailable"));

        PageResponse<EmployeeSoldeResponse> response = rhSoldeService.getGlobalSoldes(2026, null, PageRequest.of(0, 10));

        assertNotNull(response);
        assertNotNull(response.getContent());
        assertEquals(0, response.getContent().size());
        assertEquals(0, response.getTotalElements());
        assertEquals(0, response.getNumber());
        assertEquals(10, response.getSize());
    }
}
