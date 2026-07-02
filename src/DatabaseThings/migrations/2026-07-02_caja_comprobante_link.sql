-- Vincula cada movimiento de caja (pago/recaudación) con su asiento contable
-- generado automáticamente (centralización de cobranzas y pagos).
-- Al borrar el comprobante, se desvincula el movimiento (SET NULL).

ALTER TABLE movimientos_caja
  ADD COLUMN IF NOT EXISTS comprobante_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'movimientos_caja_comprobante_fk'
  ) THEN
    ALTER TABLE movimientos_caja
      ADD CONSTRAINT movimientos_caja_comprobante_fk
      FOREIGN KEY (comprobante_id) REFERENCES comprobantes(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_movimientos_caja_comprobante
  ON movimientos_caja(comprobante_id);
