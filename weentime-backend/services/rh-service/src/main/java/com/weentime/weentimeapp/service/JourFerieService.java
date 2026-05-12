package com.weentime.weentimeapp.service;

import com.weentime.weentimeapp.entity.JourFerie;

import java.time.LocalDate;
import java.util.List;

public interface JourFerieService {
    List<JourFerie> getAllForCurrentEntreprise();
    List<JourFerie> getForRange(LocalDate start, LocalDate end);
    JourFerie getById(Long id);
    JourFerie create(JourFerie jourFerie);
    JourFerie update(Long id, JourFerie jourFerie);
    void delete(Long id);
    boolean isJourFerie(LocalDate date);
}
