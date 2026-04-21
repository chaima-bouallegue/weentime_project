package com.weentime.gateway;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = {
		"spring.cloud.config.enabled=false",
		"eureka.client.enabled=false",
		"eureka.client.register-with-eureka=false",
		"eureka.client.fetch-registry=false",
		"spring.cloud.service-registry.auto-registration.enabled=false",
		"jwt.secret=404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970"
})
class GatewayApplicationTests {

	@Test
	void contextLoads() {
	}

}
