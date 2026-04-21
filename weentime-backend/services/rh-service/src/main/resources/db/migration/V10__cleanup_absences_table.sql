-- V10__cleanup_absences_table.sql
-- Suppression des colonnes redondantes pour la stratégie d'héritage JOINED
-- Ces colonnes sont déjà présentes et gérées dans la table mère 'demandes'
ALTER TABLE public.absences 
  DROP COLUMN IF EXISTS statut,
  DROP COLUMN IF EXISTS motif;
