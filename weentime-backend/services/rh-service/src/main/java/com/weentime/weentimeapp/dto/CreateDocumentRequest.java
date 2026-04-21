package com.weentime.weentimeapp.dto;

import lombok.Data;

@Data
public class CreateDocumentRequest {
    private Long typeDocumentId;
    private String type;
    private String moisConcerne;
    private String motif;
}
