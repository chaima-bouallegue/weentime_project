package com.weentime.weentimeapp.pagination;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.Data;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

@Data
public class PageParams {

    @Min(value = 0, message = "La page doit être >= 0")
    private int page = 0;

    @Min(value = 1, message = "La taille doit être >= 1")
    @Max(value = 100, message = "La taille doit être <= 100")
    private int size = 10;

    private String sortBy = "id";
    private String sortOrder = "ASC";

    public Pageable toPageable() {
        Sort sort = sortOrder.equalsIgnoreCase("DESC")
                ? Sort.by(sortBy).descending()
                : Sort.by(sortBy).ascending();
        return PageRequest.of(page, size, sort);
    }
}