package com.weentime.weentimeapp;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cloud.openfeign.EnableFeignClients;

import org.springframework.scheduling.annotation.EnableAsync;

// Test commit: validating Docker Hub credentials fix in pipeline
@SpringBootApplication
@EnableCaching
@EnableFeignClients
@EnableAsync
public class RhServiceApplication {

	public static void main(String[] args) {
		SpringApplication.run(RhServiceApplication.class, args);
	}

}
