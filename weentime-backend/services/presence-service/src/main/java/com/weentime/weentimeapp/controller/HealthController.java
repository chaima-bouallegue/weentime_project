package com.weentime.weentimeapp.controller;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/health")
@RequiredArgsConstructor
@Slf4j
public class HealthController {

    private final JdbcTemplate jdbcTemplate;

    @GetMapping("/db")
    public ResponseEntity<Map<String, Object>> checkDbConnection() {
        Map<String, Object> response = new HashMap<>();
        try {
            jdbcTemplate.execute("SELECT 1");
            response.put("status", "UP");
            response.put("database", "PostgreSQL");
            response.put("message", "Connected successfully to presence_db");
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Database connection failure: {}", e.getMessage());
            response.put("status", "DOWN");
            response.put("error", e.getMessage());
            response.put("message", "Could not connect to presence_db");
            return ResponseEntity.status(503).body(response);
        }
    }
}
