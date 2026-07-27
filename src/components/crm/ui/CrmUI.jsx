// src/components/crm/ui/CrmUI.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Copy } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

export const StatCard = ({ icon: Icon, label, value, color, onClick, active }) => (
  <motion.div whileHover={{ scale: 1.02 }} onClick={onClick} className={`p-4 md:p-5 rounded-[2rem] border transition-all cursor-pointer group relative overflow-hidden ${active ? 'bg-emerald-50 border-[#199b4d]/40 shadow-md' : 'bg-white border-[#efe8dd] shadow-sm hover:shadow-md'}`}>
    <div className={`absolute top-0 right-0 p-4 opacity-15 ${color}`}><Icon size={40} /></div>
    <div className="flex flex-col relative z-10">
      <div className={`p-2 rounded-xl w-fit mb-2 md:mb-3 bg-slate-50 ${color}`}><Icon size={20} /></div>
      <p className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-xl md:text-2xl font-black text-[#1a1c1e] tracking-tight">{value}</p>
    </div>
  </motion.div>
);

export const FilterChip = ({ icon: Icon, label, value, color, onClick, active }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
      active
        ? 'bg-emerald-50 border-[#199b4d]/40 text-[#199b4d] shadow-sm'
        : 'bg-white border-[#efe8dd] text-slate-500 hover:text-slate-900 hover:bg-slate-50'
    }`}
  >
    <Icon size={14} className={color} />
    <span>{label}</span>
    <span className={`px-1.5 py-0.5 rounded-md text-[10px] leading-none ${active ? 'bg-[#199b4d]/15 text-[#199b4d]' : 'bg-slate-100 text-slate-600'}`}>
      {value}
    </span>
  </button>
);

export const EditableField = ({ label, name, value, isEditing, onChange, isMono = false }) => (
  <div className="flex flex-col gap-1.5 w-full">
    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{label}</span>
    {isEditing ? (
      <input type="text" name={name} value={value || ''} onChange={onChange} className="bg-white border border-[#e5ddd0] rounded-lg p-2 text-xs text-slate-900 outline-none focus:border-[#199b4d] transition-colors w-full" />
    ) : (
      <div className={`text-xs font-bold text-slate-700 truncate ${isMono ? 'font-mono tracking-wider' : ''}`}>{value || <span className="text-slate-400 italic text-[10px]">Vacío</span>}</div>
    )}
  </div>
);

export const SelectField = ({ label, name, value, isEditing, onChange, options = [], badgeClass = '' }) => (
  <div className="flex flex-col gap-1.5 w-full">
    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{label}</span>
    {isEditing ? (
      <select name={name} value={value || ''} onChange={onChange} className="bg-white border border-[#e5ddd0] rounded-lg p-2 text-xs text-slate-900 outline-none focus:border-[#199b4d] transition-colors w-full cursor-pointer">
        {options.map(opt => {
          const val = typeof opt === 'string' ? opt : opt.value;
          const lbl = typeof opt === 'string' ? opt : opt.label;
          return <option key={val} value={val}>{lbl}</option>;
        })}
      </select>
    ) : (
      <div className={`text-xs font-bold w-fit ${badgeClass || 'text-slate-700'}`}>
        {value || <span className="text-slate-400 italic text-[10px]">Vacío</span>}
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
        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{label}</span>
        {isEditing ? (
          <input type={show ? "text" : "password"} name={name} value={value || ''} onChange={onChange} className="bg-white border border-[#e5ddd0] rounded-lg p-2 pr-8 text-xs text-slate-900 outline-none focus:border-[#199b4d] transition-colors w-full font-mono" />
        ) : (
          <div className="flex items-center justify-between bg-slate-50 border border-[#efe8dd] rounded-lg p-2">
            <span className="text-xs font-bold text-slate-700 font-mono tracking-widest select-none">
                {show ? value : '••••••••'}
            </span>
            <div className="flex gap-1">
                <button type="button" onClick={() => setShow(!show)} className="p-1 text-slate-400 hover:text-slate-700 transition-colors">
                    {show ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button type="button" onClick={handleCopy} className="p-1 text-[#199b4d] hover:text-[#147a3d] transition-colors">
                    <Copy size={14} />
                </button>
            </div>
          </div>
        )}
      </div>
    );
};
