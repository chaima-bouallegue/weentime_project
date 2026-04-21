package com.weentime.weentimeapp.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.domain.Page;

import java.util.List;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * DTO générique pour la pagination, évitant la sérialisation directe de PageImpl.
 * Aligné sur l'interface frontend 'AbsencePage'.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PageResponse<T> {

    private List<T> content;
    private long totalElements;
    private int totalPages;
    private int number;   // page courante (0-indexed)
    private int size;

    /**
     * Convertit une Page Spring Data en PageResponse DTO.
     */
    public static <T> PageResponse<T> fromPage(Page<T> page) {
        return PageResponse.<T>builder()
                .content(page.getContent())
                .totalElements(page.getTotalElements())
                .totalPages(page.getTotalPages())
                .number(page.getNumber())
                .size(page.getSize())
                .build();
    }

    /**
     * Convertit une Page Spring Data (entités) en PageResponse DTO (autre type, ex: DTO de sortie).
     */
    public static <S, T> PageResponse<T> fromPage(Page<S> page, Function<S, T> mapper) {
        List<T> mappedContent = page.getContent().stream()
                .map(mapper)
                .collect(Collectors.toList());

        return PageResponse.<T>builder()
                .content(mappedContent)
                .totalElements(page.getTotalElements())
                .totalPages(page.getTotalPages())
                .number(page.getNumber())
                .size(page.getSize())
                .build();
    }
}
