package com.weentime.weentimeapp.security.services;

import com.weentime.weentimeapp.dto.UtilisateurAuthDTO;
import lombok.Getter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.List;
import java.util.stream.Collectors;

@Getter
public class UserDetailsImpl implements UserDetails {

    private final Long id;
    private final String email;
    private final String password;
    private final String telephone;
    private final String statut;
    private final Long entrepriseId;
    private final Collection<? extends GrantedAuthority> authorities;
    private final boolean twoFactorEnabled;
    private final String twoFactorType;
    private final String twoFactorSecret;

    @SuppressWarnings("java:S107")
    public UserDetailsImpl(Long id, String email, String password, String statut,
                           Long entrepriseId,
                           Collection<? extends GrantedAuthority> authorities,
                           boolean twoFactorEnabled, String twoFactorType, String twoFactorSecret) {
        this(id, email, password, null, statut, entrepriseId, authorities, twoFactorEnabled, twoFactorType, twoFactorSecret);
    }

    @SuppressWarnings("java:S107")
    public UserDetailsImpl(Long id, String email, String password, String telephone, String statut,
                           Long entrepriseId,
                           Collection<? extends GrantedAuthority> authorities,
                           boolean twoFactorEnabled, String twoFactorType, String twoFactorSecret) {
        this.id = id;
        this.email = email;
        this.password = password;
        this.telephone = telephone;
        this.statut = statut;
        this.entrepriseId = entrepriseId;
        this.authorities = authorities;
        this.twoFactorEnabled = twoFactorEnabled;
        this.twoFactorType = twoFactorType;
        this.twoFactorSecret = twoFactorSecret;
    }

    public static UserDetailsImpl build(UtilisateurAuthDTO dto) {
        List<GrantedAuthority> authorities = dto.getRoles() == null
                ? List.of()
                : dto.getRoles().stream()
                .map(role -> {
                    String normalizedRole = normalizeRoleName(role.getNom());
                    return new SimpleGrantedAuthority(normalizedRole);
                })
                .collect(Collectors.toList());

        return new UserDetailsImpl(
                dto.getId(),
                dto.getEmail(),
                dto.getMotDePasse(),
                dto.getTelephone(),
                dto.getStatut(),
                dto.getEntrepriseId(),
                authorities,
                dto.isTwoFactorEnabled(),
                dto.getTwoFactorType(),
                dto.getTwoFactorSecret()
        );
    }

    /**
     * Normalizes role names to ensure ROLE_ prefix is present.
     * Handles enum values and string values, with fallback to add prefix if missing.
     */
    private static String normalizeRoleName(Object roleName) {
        // Convert to string first
        String roleStr = roleName instanceof Enum<?> 
                ? ((Enum<?>) roleName).name() 
                : String.valueOf(roleName);
        
        // Ensure ROLE_ prefix exists
        if (!roleStr.startsWith("ROLE_")) {
            roleStr = "ROLE_" + roleStr;
        }
        
        return roleStr;
    }

    @Override
    public String getUsername() {
        return email;
    }

    @Override
    public String getPassword() {
        return password;
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return authorities;
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return !"SUSPENDU".equals(statut);
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return "ACTIF".equals(statut);
    }
}
