// src/components/crm/ui/CrmUI.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Copy } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

export const StatCard = ({ icon: Icon, label, value, color, onClick, active }) => (
  <motion.div whileHover={{ scale: 1.02 }} onClick={onClick} className={`p-4 md:p-5 rounded-[2rem] border backdrop-blur-xl transition-all cursor-pointer group relative overflow-hidden ${active ? 'bg-white/10 border-blue-500/50 shadow-lg' : 'bg-white/[0.03] border-white/5'}`}>
    <div className={`absolute top-0 right-0 p-4 opacity-20 ${color}`}><Icon size={40} /></div>
    <div className="flex flex-col relative z-10">
      <div className={`p-2 rounded-xl w-fit mb-2 md:mb-3 bg-white/5 ${color}`}><Icon size={20} /></div>
      <p className="text-[9px] md:text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-xl md:text-2xl font-black text-white tracking-tight">{value}</p>
    </div>
  </motion.div>
);

export const FilterChip = ({ icon: Icon, label, value, color, onClick, active }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
      active
        ? 'bg-white/10 border-blue-500/50 text-white shadow-lg shadow-blue-500/10'
        : 'bg-white/[0.03] border-white/5 text-gray-400 hover:text-white hover:bg-white/5'
    }`}
  >
    <Icon size={14} className={color} />
    <span>{label}</span>
    <span className={`px-1.5 py-0.5 rounded-md text-[10px] leading-none ${active ? 'bg-blue-500/30 text-white' : 'bg-black/30 text-gray-300'}`}>
      {value}
    </span>
  </button>
);

export const EditableField = ({ label, name, value, isEditing, onChange, isMono = false }) => (
  <div className="flex flex-col gap-1.5 w-full">
    <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">{label}</span>
    {isEditing ? (
      <input type="text" name={name} value={value || ''} onChange={onChange} className="bg-black/40 border border-white/10 rounded-lg p-2 text-xs text-white outline-none focus:border-blue-500 transition-colors w-full" />
    ) : (
      <div className={`text-xs font-bold text-gray-200 truncate ${isMono ? 'font-mono tracking-wider' : ''}`}>{value || <span className="text-gray-600 italic text-[10px]">Vacío</span>}</div>
    )}
  </div>
);

export const SelectField = ({ label, name, value, isEditing, onChange, options = [], badgeClass = '' }) => (
  <div className="flex flex-col gap-1.5 w-full">
    <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">{label}</span>
    {isEditing ? (
      <select name={name} value={value || ''} onChange={onChange} className="bg-black/40 border border-white/10 rounded-lg p-2 text-xs text-white outline-none focus:border-blue-500 transition-colors w-full cursor-pointer">
        {options.map(opt => {
          const val = typeof opt === 'string' ? opt : opt.value;
          const lbl = typeof opt === 'string' ? opt : opt.label;
          return <option key={val} value={val}>{lbl}</option>;
        })}
      </select>
    ) : (
      <div className={`text-xs font-bold w-fit ${badgeClass || 'text-gray-200'}`}>
        {value || <span className="text-gray-600 italic text-[10px]">Vacío</span>}
      </div>
    )}
  </div>
);

export const SecureField = ({ label, name, value, isEditing, onChange }) => {
    const [show, setShow] = useState(false);
    
    const handleCopy = (e) => {
        e.preventDefault();
        navigator.clipboard.writeText(value);
        toast({ title: "Copiado", description: "Clave copiada al portapapeles", duration: 1500 });
    };

    return (
      <div className="flex flex-col gap-2 w-full relative">
        <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">{label}</span>
        {isEditing ? (
          <input type={show ? "text" : "password"} name={name} value={value || ''} onChange={onChange} className="bg-black/40 border border-white/10 rounded-lg p-2 pr-8 text-xs text-white outline-none focus:border-blue-500 transition-colors w-full font-mono" />
        ) : (
          <div className="flex items-center justify-between bg-black/20 border border-white/5 rounded-lg p-2">
            <span className="text-xs font-bold text-gray-200 font-mono tracking-widest select-none">
                {show ? value : '••••••••'}
            </span>
            <div className="flex gap-1">
                <button type="button" onClick={() => setShow(!show)} className="p-1 text-gray-500 hover:text-white transition-colors">
                    {show ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button type="button" onClick={handleCopy} className="p-1 text-blue-500 hover:text-blue-400 transition-colors">
                    <Copy size={14} />
                </button>
            </div>
          </div>
        )}
      </div>
    );
};
