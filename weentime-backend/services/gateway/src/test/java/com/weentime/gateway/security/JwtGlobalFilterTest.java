package com.weentime.gateway.security;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class JwtGlobalFilterTest {

    private final JwtGlobalFilter filter = new JwtGlobalFilter(mock(JwtUtils.class));

    @Test
    void forecastHealthIsPublic() {
        var exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/ml/forecast/health").build()
        );
        var chainCalled = new AtomicBoolean(false);

        filter.filter(exchange, current -> {
            chainCalled.set(true);
            return Mono.empty();
        }).block();

        assertThat(chainCalled).isTrue();
        assertThat(exchange.getResponse().getStatusCode()).isNull();
    }

    @Test
    void forecastDashboardStillRequiresBearerToken() {
        var exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/ml/forecast/dashboard").build()
        );
        var chainCalled = new AtomicBoolean(false);

        filter.filter(exchange, current -> {
            chainCalled.set(true);
            return Mono.empty();
        }).block();

        assertThat(chainCalled).isFalse();
        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void internalRecruitmentCallbackDoesNotRequireUserJwt() {
        var exchange = MockServerWebExchange.from(
                MockServerHttpRequest.post(
                        "/api/v1/internal/recruitment/applications/3/ai-result"
                ).build()
        );
        var chainCalled = new AtomicBoolean(false);

        filter.filter(exchange, current -> {
            chainCalled.set(true);
            return Mono.empty();
        }).block();

        assertThat(chainCalled).isTrue();
        assertThat(exchange.getResponse().getStatusCode()).isNull();
    }

    @Test
    void otherInternalRecruitmentPathsStillRequireBearerToken() {
        var exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/v1/internal/recruitment/applications/3").build()
        );
        var chainCalled = new AtomicBoolean(false);

        filter.filter(exchange, current -> {
            chainCalled.set(true);
            return Mono.empty();
        }).block();

        assertThat(chainCalled).isFalse();
        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }
}
