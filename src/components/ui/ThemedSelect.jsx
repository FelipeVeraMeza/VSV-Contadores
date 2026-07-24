import React from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

// Dropdown con el tema oscuro-glass del sistema (Radix), reemplazo del <select> nativo.
//   value:       valor actual (string). '' o null → muestra el placeholder.
//   onChange:    (value) => void  — recibe el valor seleccionado.
//   options:     [{ value, label }]  — los value deben ser NO vacíos y únicos.
//   placeholder: texto cuando no hay selección.
export function ThemedSelect({ value, onChange, options = [], placeholder = 'Seleccionar…', className, disabled }) {
    return (
        <Select value={value ? String(value) : undefined} onValueChange={onChange} disabled={disabled}>
            <SelectTrigger className={className}>
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent className="max-h-72">
                {options.map((o) => (
                    <SelectItem key={String(o.value)} value={String(o.value)}>{o.label}</SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

export default ThemedSelect;
