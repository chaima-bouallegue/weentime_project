package com.weentime.weentimeproject.security.services;

import com.weentime.weentimeproject.dto.response.UtilisateurAuthResponse;
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
    private final String statut;
    private final Long entrepriseId;
    private final Collection<? extends GrantedAuthority> authorities;

    public UserDetailsImpl(Long id, String email, String password, String statut, Long entrepriseId,
                           Collection<? extends GrantedAuthority> authorities) {
        this.id = id;
        this.email = email;
        this.password = password;
        this.statut = statut;
        this.entrepriseId = entrepriseId;
        this.authorities = authorities;
    }

    public static UserDetailsImpl build(UtilisateurAuthResponse dto) {
        List<GrantedAuthority> authorities = dto.getRoles() == null
                ? List.of()
                : dto.getRoles().stream()
                .map(role -> new SimpleGrantedAuthority(normalizeRoleName(role.getNom())))
                .collect(Collectors.toList());

        return new UserDetailsImpl(
                dto.getId(),
                dto.getEmail(),
                dto.getMotDePasse(),
                dto.getStatut(),
                dto.getEntrepriseId(),
                authorities
        );
    }

    private static String normalizeRoleName(Object roleName) {
        return String.valueOf(roleName);
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
        return true;
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
