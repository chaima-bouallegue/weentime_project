package com.weentime.weentimeapp.dto;

import lombok.Data;
import java.time.LocalDateTime;
import java.util.Set;
@Data
public class UtilisateurAuthDTO {
    private Long id;
    private String email;
    private String motDePasse;
    private String telephone;
    private String statut;
    private Long entrepriseId;
    private Set<RoleDTO> roles;
    private boolean twoFactorEnabled;
    private String twoFactorType;
    private String twoFactorSecret;
    private int failed2faAttempts;
    private LocalDateTime lockoutEnd;
    private Set<String> backupCodes;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getMotDePasse() { return motDePasse; }
    public void setMotDePasse(String motDePasse) { this.motDePasse = motDePasse; }

    public String getTelephone() { return telephone; }
    public void setTelephone(String telephone) { this.telephone = telephone; }

    public String getStatut() { return statut; }
    public void setStatut(String statut) { this.statut = statut; }

    public Long getEntrepriseId() { return entrepriseId; }
    public void setEntrepriseId(Long entrepriseId) { this.entrepriseId = entrepriseId; }

    public Set<RoleDTO> getRoles() { return roles; }
    public void setRoles(Set<RoleDTO> roles) { this.roles = roles; }

    @Data
    public static class RoleDTO {
        private String nom;
        public String getNom() { return nom; }
        public void setNom(String nom) { this.nom = nom; }
    }
}
