package com.weentime.communication.security;

import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;

import java.util.Collection;

public class CommunicationAuthenticationToken extends AbstractAuthenticationToken {

    private final CommunicationUserPrincipal principal;
    private final String credentials;

    public CommunicationAuthenticationToken(
            CommunicationUserPrincipal principal,
            String credentials,
            Collection<? extends GrantedAuthority> authorities
    ) {
        super(authorities);
        this.principal = principal;
        this.credentials = credentials;
        setAuthenticated(true);
    }

    @Override
    public Object getCredentials() {
        return credentials;
    }

    @Override
    public CommunicationUserPrincipal getPrincipal() {
        return principal;
    }
}
