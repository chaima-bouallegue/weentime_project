package com.weentime.weentimeapp.enums;

/**
 * Statut de géolocalisation d'un pointage par rapport au lieu de travail.
 *
 * <ul>
 *   <li>{@code IN_ZONE} – L'employé est dans le rayon autorisé du lieu de travail.</li>
 *   <li>{@code OUT_OF_ZONE} – L'employé est en dehors du rayon, mais le pointage est quand même accepté.</li>
 *   <li>{@code NO_GPS} – Aucune coordonnée GPS n'a été fournie (ne devrait plus arriver si gps-required = true).</li>
 *   <li>{@code LOW_ACCURACY} – Coordonnées GPS fournies mais précision trop faible pour un calcul fiable.</li>
 * </ul>
 */
public enum LocationStatus {
    IN_ZONE,
    OUT_OF_ZONE,
    NO_GPS,
    LOW_ACCURACY
}
