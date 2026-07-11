package com.weentime.weentimeapp;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@SpringBootTest
class AuthServiceApplicationTests {

    @MockitoBean
    private JavaMailSender mailSender;

    @Test
    void contextLoads() {
        // This method is intentionally empty to verify that the Spring context loads successfully.
    }
}
