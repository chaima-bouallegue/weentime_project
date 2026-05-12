package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.entity.JourFerie;
import com.weentime.weentimeapp.repository.JourFerieRepository;
import com.weentime.weentimeapp.security.SecurityUtils;
import com.weentime.weentimeapp.service.JourFerieService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional
public class JourFerieServiceImpl implements JourFerieService {

    private final JourFerieRepository repository;

    @Override
    @Transactional(readOnly = true)
    public List<JourFerie> getAllForCurrentEntreprise() {
        return repository.findAllByEntrepriseId(SecurityUtils.getCurrentEntrepriseId());
    }

    @Override
    @Transactional(readOnly = true)
    public List<JourFerie> getForRange(LocalDate start, LocalDate end) {
        return repository.findByEntrepriseIdAndDateBetween(
                SecurityUtils.getCurrentEntrepriseId(), start, end);
    }

    @Override
    @Transactional(readOnly = true)
    public JourFerie getById(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Jour férié introuvable"));
    }

    @Override
    public JourFerie create(JourFerie jourFerie) {
        if (jourFerie.getEntrepriseId() == null) {
            jourFerie.setEntrepriseId(SecurityUtils.getCurrentEntrepriseId());
        }
        return repository.save(jourFerie);
    }

    @Override
    public JourFerie update(Long id, JourFerie jourFerie) {
        JourFerie existing = getById(id);
        existing.setDate(jourFerie.getDate());
        existing.setNom(jourFerie.getNom());
        return repository.save(existing);
    }

    @Override
    public void delete(Long id) {
        repository.deleteById(id);
    }

    @Override
    @Transactional(readOnly = true)
    public boolean isJourFerie(LocalDate date) {
        return !repository.findByDateAndEntrepriseId(date, SecurityUtils.getCurrentEntrepriseId()).isEmpty();
    }
}
