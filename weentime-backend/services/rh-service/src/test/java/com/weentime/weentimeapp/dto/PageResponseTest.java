package com.weentime.weentimeapp.dto;

import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class PageResponseTest {

    @Test
    void fromPageMapsContentAndPreservesMetadata() {
        var items = List.of("apple", "banana", "cherry");
        var page = new PageImpl<>(items, PageRequest.of(1, 3), 10);

        PageResponse<String> response = PageResponse.fromPage(page, String::toUpperCase);

        assertThat(response.getContent()).containsExactly("APPLE", "BANANA", "CHERRY");
        assertThat(response.getNumber()).isEqualTo(1);
        assertThat(response.getSize()).isEqualTo(3);
        assertThat(response.getTotalElements()).isEqualTo(10);
    }
}
