package com.weentime.weentimeproject.security.services;

import com.weentime.weentimeproject.dto.response.UtilisateurAuthResponse;
import com.weentime.weentimeproject.service.UtilisateurService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class UserDetailsServiceImpl implements UserDetailsService {

    private final UtilisateurService utilisateurService;

    @Override
    public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
        try {
            UtilisateurAuthResponse response = utilisateurService.getUtilisateurForAuth(email);

            if (response == null) {
                throw new UsernameNotFoundException("Utilisateur non trouvé : " + email);
            }

            if (!"ACTIF".equals(response.getStatut())) {
                throw new UsernameNotFoundException("Compte inactif : " + email);
            }

            return UserDetailsImpl.build(response);

        } catch (UsernameNotFoundException e) {
            throw e;
        } catch (Exception e) {
            throw new UsernameNotFoundException(
                    "Erreur lors de la récupération de l'utilisateur " + email + " : " + e.getMessage()
            );
        }
    }
}
