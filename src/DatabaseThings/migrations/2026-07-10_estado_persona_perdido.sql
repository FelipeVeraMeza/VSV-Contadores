-- =====================================================================
-- Migración: nuevo estado 'perdido' para prospectos.
-- Fecha: 2026-07-10
-- Debe ir SOLA (ALTER TYPE ... ADD VALUE no puede compartir transacción).
-- Idempotente con IF NOT EXISTS (PostgreSQL 12+).
-- =====================================================================

ALTER TYPE estado_persona ADD VALUE IF NOT EXISTS 'perdido';
