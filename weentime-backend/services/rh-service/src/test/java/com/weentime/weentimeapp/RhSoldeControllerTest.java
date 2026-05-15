package com.weentime.weentimeapp;

import com.weentime.weentimeapp.controller.RhSoldeController;
import com.weentime.weentimeapp.dto.EmployeeSoldeResponse;
import com.weentime.weentimeapp.dto.PageResponse;
import com.weentime.weentimeapp.exception.GlobalExceptionHandler;
import com.weentime.weentimeapp.service.RhSoldeService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(RhSoldeController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class RhSoldeControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private RhSoldeService rhSoldeService;

    @Test
    @WithMockUser(roles = "RH")
    void getGlobalSoldesReturnsEmptyPage() throws Exception {
        when(rhSoldeService.getGlobalSoldes(eq(2026), eq(null), any()))
                .thenReturn(PageResponse.<EmployeeSoldeResponse>builder()
                        .content(List.of())
                        .totalElements(0)
                        .totalPages(0)
                        .number(0)
                        .size(10)
                        .build());

        mockMvc.perform(get("/api/v1/rh/soldes")
                        .param("page", "0")
                        .param("size", "10")
                        .param("annee", "2026"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray())
                .andExpect(jsonPath("$.totalElements").value(0))
                .andExpect(jsonPath("$.size").value(10));
    }
}
