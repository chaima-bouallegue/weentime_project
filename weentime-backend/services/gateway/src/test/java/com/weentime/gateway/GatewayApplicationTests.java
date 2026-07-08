package com.weentime.gateway;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.cloud.gateway.route.RouteLocator;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Mono;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
		"spring.cloud.config.enabled=false",
		"eureka.client.enabled=false",
		"eureka.client.register-with-eureka=false",
		"eureka.client.fetch-registry=false",
		"spring.cloud.service-registry.auto-registration.enabled=false",
		"jwt.secret=404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970"
})
class GatewayApplicationTests {

	@Autowired
	private WebTestClient webTestClient;

	@Autowired
	private RouteLocator routeLocator;

	@Test
	void contextLoads() {
	}

	@Test
	void forecastPreflightAcceptsCustomIdentityHeaders() {
		webTestClient.options()
				.uri("/api/ml/forecast/dashboard?period=next_30_days")
				.header(HttpHeaders.ORIGIN, "http://localhost:4200")
				.header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, HttpMethod.GET.name())
				.header(
						HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS,
						"authorization,x-user-id,x-user-role,x-tenant-id,x-entreprise-id,x-role,x-dashboard-scope"
				)
				.exchange()
				.expectStatus().isOk()
				.expectHeader().valueEquals(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:4200")
				.expectHeader().value(
						HttpHeaders.ACCESS_CONTROL_ALLOW_HEADERS,
						value -> assertThat(value.toLowerCase()).contains("x-user-id", "x-dashboard-scope")
				);
	}

	@Test
	void forecastRouteTargetsMlServiceWithoutRewritingPath() {
		var forecastRoute = routeLocator.getRoutes()
				.filter(route -> "ml-service".equals(route.getId()))
				.blockFirst();

		assertThat(forecastRoute).isNotNull();
		assertThat(forecastRoute.getUri().toString()).isEqualTo("http://localhost:8001");
	}

	@Test
	void internalRecruitmentCallbackRouteTargetsRhService() {
		var rhRoute = routeLocator.getRoutes()
				.filter(route -> "rh-service".equals(route.getId()))
				.blockFirst();
		var exchange = MockServerWebExchange.from(
				MockServerHttpRequest.post(
						"/api/v1/internal/recruitment/applications/3/ai-result"
				).build()
		);

		assertThat(rhRoute).isNotNull();
		assertThat(rhRoute.getUri().toString()).isEqualTo("http://localhost:8192");
		assertThat(Mono.from(rhRoute.getPredicate().apply(exchange)).block()).isTrue();
	}

	@Test
	void protectedForecastEndpointReturnsCleanUnauthorizedResponseWithoutToken() {
		webTestClient.get()
				.uri("/api/ml/forecast/dashboard")
				.exchange()
				.expectStatus().isUnauthorized()
				.expectBody()
				.jsonPath("$.error").isEqualTo("UNAUTHORIZED")
				.jsonPath("$.details").isEqualTo("Missing Authorization header or cookie");
	}
}
