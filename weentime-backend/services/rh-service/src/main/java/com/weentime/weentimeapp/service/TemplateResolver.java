package com.weentime.weentimeapp.service;

import com.weentime.weentimeapp.dto.UserResponse;
import com.weentime.weentimeapp.entity.Document;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Moteur de résolution de variables dynamiques pour les templates documentaires.
 * Remplace les placeholders {{variable}} par les valeurs réelles de la DB.
 *
 * Exemple : "M. {{employee.prenom}} {{employee.nom}}" → "M. Jean Dupont"
 */
@Service
@Slf4j
public class TemplateResolver {

    private static final Pattern VARIABLE_PATTERN = Pattern.compile("\\{\\{([^}]+)\\}\\}");
    private static final DateTimeFormatter DATE_FORMAT_FR = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    /**
     * Résout toutes les variables {{...}} dans un template.
     */
    public String resolve(String template, Map<String, String> variables) {
        if (template == null || template.isBlank()) {
            return "";
        }

        String result = template;
        for (Map.Entry<String, String> entry : variables.entrySet()) {
            String placeholder = "{{" + entry.getKey() + "}}";
            String value = entry.getValue() != null ? entry.getValue() : "[NON RENSEIGNÉ]";
            result = result.replace(placeholder, value);
        }

        // Détecter les variables non résolues
        Matcher matcher = VARIABLE_PATTERN.matcher(result);
        List<String> unresolved = new ArrayList<>();
        while (matcher.find()) {
            unresolved.add(matcher.group(1));
        }
        if (!unresolved.isEmpty()) {
            log.warn("Variables non résolues dans le template: {}", unresolved);
        }

        return result;
    }

    /**
     * Construit le dictionnaire complet de variables à partir des données DB.
     */
    public Map<String, String> buildVariables(UserResponse user, Document document) {
        Map<String, String> vars = new LinkedHashMap<>();

        // ── Variables Employé ──
        vars.put("employee.nom", safe(user.getNom()));
        vars.put("employee.prenom", safe(user.getPrenom()));
        vars.put("employee.nomComplet", safe(user.getPrenom()) + " " + safe(user.getNom()));
        vars.put("employee.poste", safe(user.getPoste()));
        vars.put("employee.departement", safe(user.getDepartementNom()));
        vars.put("employee.email", safe(user.getEmail()));

        // Date d'entrée et ancienneté (champ non disponible dans UserResponse actuel)
        // TODO: ajouter dateEntree dans UserResponse quand le champ sera exposé par organisation-service
        vars.put("employee.dateEntree", "[NON RENSEIGNÉ]");
        vars.put("employee.anciennete", "[NON RENSEIGNÉ]");

        // ── Variables Entreprise ──
        vars.put("company.name", "WeenTime");
        vars.put("company.city", "Casablanca");

        // ── Variables Document ──
        vars.put("document.date", LocalDate.now().format(DATE_FORMAT_FR));
        vars.put("document.annee", String.valueOf(LocalDate.now().getYear()));

        if (document.getMoisConcerne() != null) {
            vars.put("document.moisConcerne", document.getMoisConcerne());
        }
        if (document.getMotif() != null) {
            vars.put("document.motif", document.getMotif());
        }
        if (document.getDateCreation() != null) {
            vars.put("document.dateCreation", document.getDateCreation().format(DATE_FORMAT_FR));
        }
        if (document.getTypeDocument() != null) {
            vars.put("document.type", document.getTypeDocument().getLibelle());
            vars.put("document.typeCode", document.getTypeDocument().getCode());
        }

        return vars;
    }

    /**
     * Retourne la liste des variables disponibles (pour l'UI drag & drop).
     */
    public List<Map<String, String>> getAvailableVariables() {
        return List.of(
            Map.of("key", "employee.nom", "label", "Nom de l'employé", "group", "Employé"),
            Map.of("key", "employee.prenom", "label", "Prénom de l'employé", "group", "Employé"),
            Map.of("key", "employee.nomComplet", "label", "Nom complet", "group", "Employé"),
            Map.of("key", "employee.poste", "label", "Poste occupé", "group", "Employé"),
            Map.of("key", "employee.departement", "label", "Département", "group", "Employé"),
            Map.of("key", "employee.email", "label", "Email", "group", "Employé"),
            Map.of("key", "employee.dateEntree", "label", "Date d'entrée", "group", "Employé"),
            Map.of("key", "employee.anciennete", "label", "Ancienneté", "group", "Employé"),
            Map.of("key", "company.name", "label", "Nom de l'entreprise", "group", "Entreprise"),
            Map.of("key", "company.city", "label", "Ville", "group", "Entreprise"),
            Map.of("key", "document.date", "label", "Date du jour", "group", "Document"),
            Map.of("key", "document.moisConcerne", "label", "Mois concerné", "group", "Document"),
            Map.of("key", "document.motif", "label", "Motif de la demande", "group", "Document"),
            Map.of("key", "document.type", "label", "Type de document", "group", "Document")
        );
    }

    private String safe(String value) {
        return value != null ? value : "[NON RENSEIGNÉ]";
    }

    private String calculateAnciennete(LocalDate dateEntree) {
        LocalDate now = LocalDate.now();
        long years = ChronoUnit.YEARS.between(dateEntree, now);
        long months = ChronoUnit.MONTHS.between(dateEntree, now) % 12;

        if (years > 0 && months > 0) {
            return years + " an" + (years > 1 ? "s" : "") + " et " + months + " mois";
        } else if (years > 0) {
            return years + " an" + (years > 1 ? "s" : "");
        } else {
            return months + " mois";
        }
    }
}
