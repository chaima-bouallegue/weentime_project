package com.weentime.weentimeapp.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.weentime.weentimeapp.config.PresenceProperties;
import com.weentime.weentimeapp.entity.AttendanceSession;
import com.weentime.weentimeapp.repository.AttendanceSessionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.util.UriComponentsBuilder;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicLong;

@Service
@RequiredArgsConstructor
@Slf4j
public class LocationResolverService {

    private static final int MAX_ADDRESS_LENGTH = 255;
    private static final int MAX_LOCATION_PART_LENGTH = 128;

    private final PresenceProperties presenceProperties;
    private final ObjectMapper objectMapper;
    private final AttendanceSessionRepository attendanceSessionRepository;
    private final ConcurrentMap<String, ResolvedLocation> cache = new ConcurrentHashMap<>();
    private final AtomicLong lastExternalRequestMillis = new AtomicLong(0);

    public String resolve(Double latitude, Double longitude, String providedAddress) {
        return resolveLocationForStorage(latitude, longitude, null, providedAddress).address();
    }

    public ResolvedLocation resolveLocationForStorage(
            Double latitude,
            Double longitude,
            Double accuracy,
            String providedAddress
    ) {
        String sanitizedAddress = sanitizeAddress(providedAddress);
        if (sanitizedAddress != null) {
            return new ResolvedLocation(latitude, longitude, accuracy, sanitizedAddress, null, null, null);
        }

        if (!hasCoordinates(latitude, longitude)) {
            return new ResolvedLocation(latitude, longitude, accuracy, null, null, null, null);
        }

        String fallbackAddress = formatCoordinates(latitude, longitude);
        PresenceProperties.LocationResolverProperties properties = presenceProperties.getLocation();
        if (properties == null || !properties.isResolverEnabled()) {
            return fallback(latitude, longitude, accuracy, fallbackAddress);
        }

        ResolvedLocation resolved = resolveExternalCached(latitude, longitude, fallbackAddress, properties);
        return resolved.withAccuracy(accuracy);
    }

    public void resolveCheckInAddressAsync(Long sessionId, Double latitude, Double longitude, String providedAddress) {
        resolveAddressAsync(sessionId, latitude, longitude, providedAddress, true);
    }

    public void resolveCheckOutAddressAsync(Long sessionId, Double latitude, Double longitude, String providedAddress) {
        resolveAddressAsync(sessionId, latitude, longitude, providedAddress, false);
    }

    private void resolveAddressAsync(
            Long sessionId,
            Double latitude,
            Double longitude,
            String providedAddress,
            boolean checkIn
    ) {
        if (sessionId == null || sanitizeAddress(providedAddress) != null || !hasCoordinates(latitude, longitude)) {
            return;
        }

        PresenceProperties.LocationResolverProperties properties = presenceProperties.getLocation();
        if (properties == null || !properties.isResolverEnabled()) {
            return;
        }

        CompletableFuture.runAsync(() -> {
            String fallbackAddress = formatCoordinates(latitude, longitude);
            ResolvedLocation resolved = resolveExternalCached(latitude, longitude, fallbackAddress, properties);
            if (!resolved.hasReadableDetails()) {
                return;
            }

            attendanceSessionRepository.findById(sessionId)
                    .ifPresent(session -> updateLocation(session, resolved, fallbackAddress, checkIn));
        }).exceptionally(exception -> {
            log.debug("Async reverse geocoding failed: {}", exception.getMessage());
            return null;
        });
    }

    public String displayLocation(String address, Double latitude, Double longitude) {
        return displayLocation(address, null, null, null, latitude, longitude);
    }

    public String displayLocation(
            String address,
            String city,
            String region,
            String country,
            Double latitude,
            Double longitude
    ) {
        String cityCountry = compactCityCountry(city, country);
        if (cityCountry != null) {
            return cityCountry;
        }

        String sanitizedRegion = sanitizePart(region);
        String sanitizedCountry = sanitizePart(country);
        if (sanitizedRegion != null && sanitizedCountry != null) {
            return sanitizedRegion + ", " + sanitizedCountry;
        }

        String sanitizedAddress = sanitizeAddress(address);
        if (sanitizedAddress != null) {
            return sanitizedAddress;
        }
        return hasCoordinates(latitude, longitude) ? formatCoordinates(latitude, longitude) : null;
    }

    public String formatCoordinates(Double latitude, Double longitude) {
        if (!hasCoordinates(latitude, longitude)) {
            return null;
        }
        return formatCoordinate(latitude) + ", " + formatCoordinate(longitude);
    }

    private ResolvedLocation resolveExternalCached(
            Double latitude,
            Double longitude,
            String fallbackAddress,
            PresenceProperties.LocationResolverProperties properties
    ) {
        String key = cacheKey(latitude, longitude, properties.getCacheCoordinateScale());
        ResolvedLocation cached = cache.get(key);
        if (cached != null) {
            return cached;
        }

        ResolvedLocation resolved = resolveExternal(latitude, longitude, fallbackAddress, properties);
        if (resolved.hasReadableDetails()) {
            cache.putIfAbsent(key, resolved);
        }
        return resolved;
    }

    private void updateLocation(AttendanceSession session, ResolvedLocation resolved, String fallbackAddress, boolean checkIn) {
        if (checkIn) {
            String current = sanitizeAddress(session.getCheckInAddress());
            if (current == null || Objects.equals(current, fallbackAddress)) {
                session.setCheckInAddress(resolved.address());
                session.setCheckInCity(resolved.city());
                session.setCheckInRegion(resolved.region());
                session.setCheckInCountry(resolved.country());
                attendanceSessionRepository.save(session);
            }
            return;
        }

        String current = sanitizeAddress(session.getCheckOutAddress());
        if (current == null || Objects.equals(current, fallbackAddress)) {
            session.setCheckOutAddress(resolved.address());
            session.setCheckOutCity(resolved.city());
            session.setCheckOutRegion(resolved.region());
            session.setCheckOutCountry(resolved.country());
            attendanceSessionRepository.save(session);
        }
    }

    private ResolvedLocation resolveExternal(
            Double latitude,
            Double longitude,
            String fallbackAddress,
            PresenceProperties.LocationResolverProperties properties
    ) {
        if (!reserveNominatimRequestSlot()) {
            return fallback(latitude, longitude, null, fallbackAddress);
        }

        try {
            Duration timeout = Duration.ofMillis(Math.min(Math.max(properties.getTimeoutMillis(), 250), 3000));
            URI uri = UriComponentsBuilder.fromUriString(properties.getNominatimUrl())
                    .queryParam("format", "jsonv2")
                    .queryParam("lat", latitude)
                    .queryParam("lon", longitude)
                    .queryParam("addressdetails", "1")
                    .queryParam("accept-language", properties.getAcceptLanguage())
                    .build(true)
                    .toUri();

            HttpClient client = HttpClient.newBuilder()
                    .connectTimeout(timeout)
                    .build();
            HttpRequest request = HttpRequest.newBuilder(uri)
                    .timeout(timeout)
                    .header("Accept", "application/json")
                    .header("User-Agent", properties.getUserAgent())
                    .GET()
                    .build();

            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                log.debug("Nominatim reverse geocoding returned HTTP {}", response.statusCode());
                return fallback(latitude, longitude, null, fallbackAddress);
            }

            JsonNode root = objectMapper.readTree(response.body());
            return toResolvedLocation(root, latitude, longitude, fallbackAddress);
        } catch (Exception exception) {
            log.debug("Reverse geocoding failed for rounded point {}: {}", cacheKey(latitude, longitude, 4), exception.getMessage());
            return fallback(latitude, longitude, null, fallbackAddress);
        }
    }

    private boolean reserveNominatimRequestSlot() {
        long now = System.currentTimeMillis();
        long previous = lastExternalRequestMillis.get();
        if (now - previous < 1000L) {
            return false;
        }
        return lastExternalRequestMillis.compareAndSet(previous, now);
    }

    private ResolvedLocation toResolvedLocation(JsonNode root, Double latitude, Double longitude, String fallbackAddress) {
        if (root == null || root.isMissingNode() || root.isNull()) {
            return fallback(latitude, longitude, null, fallbackAddress);
        }

        JsonNode address = root.path("address");
        String city = firstAddressValue(address, "city", "town", "village", "municipality", "suburb", "county");
        String region = firstAddressValue(address, "state", "region", "state_district", "county", "governorate");
        String country = firstAddressValue(address, "country");
        String displayName = sanitizeAddress(root.path("display_name").asText(null));

        String resolvedAddress = Optional.ofNullable(displayName)
                .orElseGet(() -> compactAddress(city, region, country, fallbackAddress));

        return new ResolvedLocation(latitude, longitude, null, resolvedAddress, city, region, country);
    }

    private String compactAddress(String city, String region, String country, String fallbackAddress) {
        String cityCountry = compactCityCountry(city, country);
        if (cityCountry != null) {
            return cityCountry;
        }
        String sanitizedRegion = sanitizePart(region);
        String sanitizedCountry = sanitizePart(country);
        if (sanitizedRegion != null && sanitizedCountry != null) {
            return sanitizedRegion + ", " + sanitizedCountry;
        }
        return fallbackAddress;
    }

    private String compactCityCountry(String city, String country) {
        String sanitizedCity = sanitizePart(city);
        String sanitizedCountry = sanitizePart(country);
        if (sanitizedCity != null && sanitizedCountry != null) {
            return sanitizedCity.equalsIgnoreCase(sanitizedCountry) ? sanitizedCity : sanitizedCity + ", " + sanitizedCountry;
        }
        return sanitizedCity != null ? sanitizedCity : sanitizedCountry;
    }

    private String firstAddressValue(JsonNode address, String... keys) {
        if (address == null || address.isMissingNode() || address.isNull()) {
            return null;
        }
        for (String key : keys) {
            String value = sanitizePart(address.path(key).asText(null));
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private String sanitizeAddress(String value) {
        return trim(value, MAX_ADDRESS_LENGTH);
    }

    private String sanitizePart(String value) {
        return trim(value, MAX_LOCATION_PART_LENGTH);
    }

    private String trim(String value, int maxLength) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        return trimmed.length() <= maxLength ? trimmed : trimmed.substring(0, maxLength);
    }

    private boolean hasCoordinates(Double latitude, Double longitude) {
        return latitude != null
                && longitude != null
                && (latitude != 0.0 || longitude != 0.0)
                && latitude >= -90d
                && latitude <= 90d
                && longitude >= -180d
                && longitude <= 180d;
    }

    private String cacheKey(Double latitude, Double longitude, int scale) {
        int safeScale = Math.min(Math.max(scale, 3), 6);
        return rounded(latitude, safeScale).toPlainString() + "," + rounded(longitude, safeScale).toPlainString();
    }

    private String formatCoordinate(Double value) {
        return rounded(value, 4).stripTrailingZeros().toPlainString();
    }

    private BigDecimal rounded(Double value, int scale) {
        return BigDecimal.valueOf(value).setScale(scale, RoundingMode.HALF_UP);
    }

    private ResolvedLocation fallback(Double latitude, Double longitude, Double accuracy, String fallbackAddress) {
        return new ResolvedLocation(latitude, longitude, accuracy, fallbackAddress, null, null, null);
    }

    public record ResolvedLocation(
            Double latitude,
            Double longitude,
            Double accuracy,
            String address,
            String city,
            String region,
            String country
    ) {
        ResolvedLocation withAccuracy(Double newAccuracy) {
            return new ResolvedLocation(latitude, longitude, newAccuracy, address, city, region, country);
        }

        boolean hasReadableDetails() {
            return city != null || region != null || country != null;
        }
    }
}
