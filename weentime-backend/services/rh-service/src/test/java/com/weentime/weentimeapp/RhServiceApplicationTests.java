package com.weentime.weentimeapp;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.javamail.JavaMailSender;

import java.util.Locale;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
		"spring.cloud.config.enabled=false",
		"spring.config.import=",
		"spring.datasource.url=jdbc:h2:mem:rh-service-test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
		"spring.datasource.driver-class-name=org.h2.Driver",
		"spring.datasource.username=sa",
		"spring.datasource.password=",
		"spring.jpa.hibernate.ddl-auto=create-drop",
		"spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
		"spring.flyway.enabled=false",
		"eureka.client.enabled=false",
		"spring.cloud.discovery.enabled=false"
})
class RhServiceApplicationTests {

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@MockBean
	private JavaMailSender javaMailSender;

	@Test
	void contextLoads() {
	}

	@Test
	void contextLoadsWithTenantScopedRhReferenceTables() {
		assertThat(hasColumn("type_conges", "entreprise_id")).isTrue();
		assertThat(hasColumn("type_documents", "entreprise_id")).isTrue();
		assertThat(hasColumn("type_autorisations", "entreprise_id")).isTrue();
		assertThat(hasColumn("solde_conges", "entreprise_id")).isTrue();

		assertThat(hasColumn("demandes", "entreprise_id")).isTrue();
	}

	private boolean hasColumn(String tableName, String columnName) {
		Integer count = jdbcTemplate.queryForObject(
				"select count(*) from information_schema.columns where lower(table_name) = ? and lower(column_name) = ?",
				Integer.class,
				tableName.toLowerCase(Locale.ROOT),
				columnName.toLowerCase(Locale.ROOT)
		);
		return count != null && count > 0;
	}

}
