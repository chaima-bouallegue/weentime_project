package com.weentime.weentimeproject.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

@ResponseStatus(HttpStatus.NOT_FOUND)
public class EntrepriseNotFoundException extends RuntimeException {

    public EntrepriseNotFoundException(Long id) {
        super("Entreprise non trouvée avec l'id : " + id);
    }

    public EntrepriseNotFoundException(String message) {
        super(message);
    }
}
