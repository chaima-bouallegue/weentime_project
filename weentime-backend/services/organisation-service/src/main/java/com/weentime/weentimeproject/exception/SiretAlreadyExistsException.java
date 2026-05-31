package com.weentime.weentimeproject.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

@ResponseStatus(HttpStatus.CONFLICT)
public class SiretAlreadyExistsException extends RuntimeException {

    public SiretAlreadyExistsException(String siret) {
        super("Le SIRET " + siret + " est déjà utilisé par une autre entreprise.");
    }
}
