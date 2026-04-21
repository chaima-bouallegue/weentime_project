package com.weentime.weentimeapp.security.services;

import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.dto.UtilisateurAuthDTO;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class UserDetailsServiceImpl implements UserDetailsService {

    private static final Logger LOGGER = LoggerFactory.getLogger(UserDetailsServiceImpl.class);

    private final OrganisationServiceClient organisationServiceClient;

    @Override
    public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
        try {
            ResponseEntity<UtilisateurAuthDTO> response = organisationServiceClient.getUserByEmail(email);

            LOGGER.debug("Organisation lookup completed with status={}",
                    response != null ? response.getStatusCode() : null);

            if (response == null || !response.getStatusCode().is2xxSuccessful() || response.getBody() == null) {
                LOGGER.warn("Organisation lookup failed during authentication");
                throw new UsernameNotFoundException("Utilisateur non trouve");
            }

            UtilisateurAuthDTO dto = response.getBody();
            if (!"ACTIF".equals(dto.getStatut())) {
                LOGGER.warn("Organisation lookup returned inactive account with status={}", dto.getStatut());
                throw new UsernameNotFoundException("Compte inactif");
            }

            return UserDetailsImpl.build(dto);
        } catch (UsernameNotFoundException exception) {
            throw exception;
        } catch (Exception exception) {
            LOGGER.error("Authentication lookup failed: {}", exception.getClass().getSimpleName());
            throw new UsernameNotFoundException("Erreur d'authentification", exception);
        }
    }
}
