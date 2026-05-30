package com.weentime.weentimeapp.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import com.weentime.weentimeapp.config.PresenceProperties;
import com.weentime.weentimeapp.repository.AttendanceSessionRepository;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.io.IOException;
import java.lang.reflect.Method;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LocationResolverServiceTest {

    @Test
    void reverseGeocoderJsonIsMappedToReadableLocation() throws Exception {
        LocationResolverService service = createService(null);
        Method mapper = LocationResolverService.class.getDeclaredMethod(
                "toResolvedLocation",
                com.fasterxml.jackson.databind.JsonNode.class,
                Double.class,
                Double.class,
                String.class
        );
        mapper.setAccessible(true);

        com.fasterxml.jackson.databind.JsonNode payload = new ObjectMapper().readTree("""
                {
                  "display_name": "Ariana, Gouvernorat de l'Ariana, Tunisie",
                  "address": {
                    "city": "Ariana",
                    "state": "Gouvernorat de l'Ariana",
                    "country": "Tunisie"
                  }
                }
                """);

        LocationResolverService.ResolvedLocation location = (LocationResolverService.ResolvedLocation) mapper.invoke(
                service,
                payload,
                36.8933,
                10.1813,
                "36.8933, 10.1813"
        );

        assertEquals("Ariana, Gouvernorat de l'Ariana, Tunisie", location.address());
        assertEquals("Ariana", location.city());
        assertEquals("Gouvernorat de l'Ariana", location.region());
        assertEquals("Tunisie", location.country());
    }

    @Test
    void reverseGeocoderFallsBackToCoordinatesWhenNominatimFails() throws Exception {
        HttpServer server = startServer(503, "{}", new AtomicReference<>(), new AtomicReference<>());

        try {
            LocationResolverService service = createService(server);

            LocationResolverService.ResolvedLocation location = service.resolveLocationForStorage(
                    36.8933,
                    10.1813,
                    null,
                    null
            );

            assertEquals("36.8933, 10.1813", location.address());
            assertNull(location.city());
            assertNull(location.country());
        } finally {
            server.stop(0);
        }
    }

    private LocationResolverService createService(HttpServer server) {
        PresenceProperties properties = new PresenceProperties();
        if (server != null) {
            properties.getLocation().setNominatimUrl("http://127.0.0.1:" + server.getAddress().getPort() + "/reverse");
        }
        properties.getLocation().setTimeoutMillis(1000);
        properties.getLocation().setAcceptLanguage("fr");
        properties.getLocation().setUserAgent("WeenTime/1.0");

        return new LocationResolverService(
                properties,
                new ObjectMapper(),
                Mockito.mock(AttendanceSessionRepository.class)
        );
    }

    private HttpServer startServer(
            int status,
            String body,
            AtomicReference<String> userAgent,
            AtomicReference<String> query
    ) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/reverse", exchange -> {
            userAgent.set(exchange.getRequestHeaders().getFirst("User-Agent"));
            query.set(exchange.getRequestURI().getRawQuery());
            byte[] payload = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, payload.length);
            exchange.getResponseBody().write(payload);
            exchange.close();
        });
        server.start();
        return server;
    }
}
