package com.weentime.weentimeapp.service;

import com.weentime.weentimeapp.config.PresenceProperties;
import com.weentime.weentimeapp.enums.LocationStatus;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Service de géofencing : calcule la distance entre la position de l'employé
 * et le lieu de travail, détermine le statut {@link LocationStatus}, et détecte
 * d'éventuels signaux de GPS spoofing.
 * <p>
 * <strong>Règle métier fondamentale :</strong> ce service ne bloque JAMAIS le pointage.
 * Il produit un {@link GeofenceResult} informatif qui est enregistré dans la session.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class GeofenceService {

    private final PresenceProperties presenceProperties;

    // ──────────────────────────── Haversine ────────────────────────────

    /**
     * Calcul de distance Haversine entre deux points GPS.
     *
     * @return distance en mètres
     */
    public double haversineDistance(double lat1, double lon1, double lat2, double lon2) {
        final double R = 6_371_000.0; // rayon moyen de la Terre en mètres
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    // ──────────────────────────── Évaluation ────────────────────────────

    /**
     * Évalue la position de l'employé par rapport au lieu de travail configuré.
     * <p>
     * <strong>Ne bloque jamais le pointage.</strong>
     *
     * @param userLat   latitude de l'employé (peut être null)
     * @param userLon   longitude de l'employé (peut être null)
     * @param accuracy  précision GPS en mètres (peut être null)
     * @param action    "check-in" ou "check-out" (pour les logs)
     * @return un {@link GeofenceResult} décrivant le statut, la distance et les alertes
     */
    public GeofenceResult evaluate(Double userLat, Double userLon, Double accuracy, String action) {
        PresenceProperties.GeofenceProperties geofence = presenceProperties.getGeofence();
        if (geofence == null || !geofence.isEnabled()) {
            return GeofenceResult.disabled();
        }

        // Pas de coordonnées GPS fournies
        if (userLat == null || userLon == null) {
            log.info("Geofence {} : aucune coordonnée GPS fournie", action);
            return GeofenceResult.noGps();
        }

        double workplaceLat = geofence.getWorkplaceLatitude();
        double workplaceLon = geofence.getWorkplaceLongitude();
        double radiusMeters = geofence.getDefaultRadiusMeters();
        double maxAccuracy = geofence.getMaxAccuracyMeters();

        // Calcul de la distance
        double distance = haversineDistance(userLat, userLon, workplaceLat, workplaceLon);
        long distanceRounded = Math.round(distance);

        // Déterminer le statut de zone
        boolean withinRadius = distance <= radiusMeters;
        LocationStatus status;

        // Vérification de la précision GPS :
        // Si l'employé est loin (distance > radius + accuracy), il est formellement HORS ZONE.
        // La précision faible n'est ambiguë que si l'incertitude chevauche le périmètre de travail.
        boolean lowAccuracy = accuracy != null && accuracy > maxAccuracy;
        if (lowAccuracy && distance <= (radiusMeters + accuracy)) {
            status = LocationStatus.LOW_ACCURACY;
            log.warn("Geofence {} : précision GPS faible ({}m > seuil {}m), distance={}m",
                    action, Math.round(accuracy), Math.round(maxAccuracy), distanceRounded);
        } else {
            status = withinRadius ? LocationStatus.IN_ZONE : LocationStatus.OUT_OF_ZONE;
        }

        // Détection de signaux suspects (anti-spoofing léger)
        List<String> spoofingReasons = detectSpoofingSignals(userLat, userLon, accuracy, workplaceLat, workplaceLon);
        boolean spoofingSuspected = !spoofingReasons.isEmpty();

        if (spoofingSuspected) {
            log.warn("Geofence {} : GPS spoofing suspecté, raisons={}, distance={}m, accuracy={}",
                    action, spoofingReasons, distanceRounded, accuracy);
        }

        log.info("Geofence {} : status={}, distance={}m, accuracy={}m, rayon={}m, spoofing={}",
                action, status, distanceRounded, accuracy != null ? Math.round(accuracy) : "N/A",
                Math.round(radiusMeters), spoofingSuspected);

        return new GeofenceResult(status, distanceRounded, spoofingSuspected, spoofingReasons);
    }

    // ──────────────────────────── Anti-Spoofing ────────────────────────────

    /**
     * Détecte des signaux heuristiques de localisation GPS potentiellement falsifiée.
     * <p>
     * Ces vérifications ne sont pas infaillibles mais signalent des cas suspects :
     * <ul>
     *   <li>Précision GPS exactement 0.0 (valeur par défaut de nombreux spoofers)</li>
     *   <li>Précision anormalement parfaite (&lt; 1m), inhabituel pour un vrai GPS</li>
     *   <li>Coordonnées trop parfaitement rondes (ex: 36.800000, 10.180000)</li>
     *   <li>Coordonnées identiques à celles du lieu de travail à 6+ décimales (copier-coller)</li>
     * </ul>
     *
     * @return liste des raisons de suspicion (vide = aucune anomalie)
     */
    private List<String> detectSpoofingSignals(
            Double userLat, Double userLon, Double accuracy,
            double workplaceLat, double workplaceLon
    ) {
        List<String> reasons = new ArrayList<>();

        // 1. Accuracy exactement 0.0 — valeur par défaut de beaucoup de spoofers
        if (accuracy != null && accuracy == 0.0) {
            reasons.add("ACCURACY_ZERO");
        }

        // 2. Accuracy anormalement parfaite (< 1m), très rare pour un GPS réel
        if (accuracy != null && accuracy > 0 && accuracy < 1.0) {
            reasons.add("ACCURACY_TOO_PERFECT");
        }

        // 3. Coordonnées trop parfaitement rondes (3 décimales ou moins → ~110m de résolution)
        if (isSuspiciouslyRound(userLat) && isSuspiciouslyRound(userLon)) {
            reasons.add("COORDINATES_TOO_ROUND");
        }

        // 4. Coordonnées identiques au lieu de travail (copier-coller probable)
        if (isExactMatch(userLat, workplaceLat) && isExactMatch(userLon, workplaceLon)) {
            reasons.add("EXACT_WORKPLACE_MATCH");
        }

        return Collections.unmodifiableList(reasons);
    }

    /**
     * Vérifie si une coordonnée a moins de 4 décimales significatives,
     * ce qui est suspect pour un GPS réel (résolution ≈ 11m à 4 décimales).
     */
    private boolean isSuspiciouslyRound(double coord) {
        double scaled = coord * 10_000; // 4 décimales
        return Math.abs(scaled - Math.round(scaled)) < 0.001;
    }

    /**
     * Vérifie si deux coordonnées sont identiques à 6 décimales (≈ 0.11m).
     */
    private boolean isExactMatch(double coord1, double coord2) {
        return Math.abs(coord1 - coord2) < 0.000001;
    }

    // ──────────────────────────── Result Record ────────────────────────────

    /**
     * Résultat d'une évaluation de géofencing.
     *
     * @param status               statut de localisation
     * @param distanceToWorkplace  distance au lieu de travail en mètres (arrondie)
     * @param gpsSpoofingSuspected si des signaux de falsification ont été détectés
     * @param spoofingReasons      détail des raisons de suspicion
     */
    public record GeofenceResult(
            LocationStatus status,
            long distanceToWorkplace,
            boolean gpsSpoofingSuspected,
            List<String> spoofingReasons
    ) {
        static GeofenceResult disabled() {
            return new GeofenceResult(null, 0, false, List.of());
        }

        static GeofenceResult noGps() {
            return new GeofenceResult(LocationStatus.NO_GPS, 0, false, List.of());
        }

        public boolean isEnabled() {
            return status != null;
        }
    }
}
