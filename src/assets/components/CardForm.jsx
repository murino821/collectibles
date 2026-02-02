import { useEffect, useRef, useState } from "react";
import { useToast } from "./Toast";

export default function CardForm({ initial, onSubmit, onCancel }) {
  const toast = useToast();
  const [form, setForm] = useState({
    item: "", status: "zbierka", buy: "", current: "", note: ""
  });
  const [preview, setPreview] = useState(null); // dataURL
  const fileRef = useRef(null);

  useEffect(() => {
    if (initial) {
      setForm({
        item: initial.item || "",
        status: initial.status || "zbierka",
        buy: numOrEmpty(initial.buy),
        current: numOrEmpty(initial.current),
        note: initial.note || ""
      });
      setPreview(initial.photoUrl || null);
    } else {
      setForm({ item:"", status:"zbierka", buy:"", current:"", note:"" });
      setPreview(null);
    }
  }, [initial]);

  function numOrEmpty(v) { return v == null ? "" : String(v); }
  function handleChange(e) {
    const { name, value } = e.target; setForm(f => ({...f, [name]: value}));
  }
  function clearPhoto() { setPreview(null); if (fileRef.current) fileRef.current.value = ""; }

  async function handleFile(e) {
    const file = e.target.files?.[0]; if (!file) return;
    const dataUrl = await fileToDataURL(file);
    setPreview(dataUrl);
  }
  function submit(e) {
    e.preventDefault();
    if (!form.item.trim()) { toast.warning('Vyplň aspoň pole "Položka"'); return; }
    const payload = {
      item: form.item.trim(),
      status: form.status,
      buy: form.buy ? Number(form.buy) : null,
      current: form.current ? Number(form.current) : null,
      note: form.note.trim()
    };
    const file = fileRef.current?.files?.[0] || (preview?.startsWith("data:") ? preview : null);
    onSubmit(payload, file);
  }

  return (
    <form onSubmit={submit} style={{display:"grid",gap:12, marginBottom:16}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr", gap:12}}>
        <Input label="Položka"  name="item" value={form.item} onChange={handleChange}/>
        <Select label="Stav" name="status" value={form.status} onChange={handleChange}
          options={[["zbierka","zbierka"],["predaná","predaná"]]} />
        <Input label="Nákupná cena (€)" name="buy" value={form.buy} onChange={handleChange} type="number" step="0.01"/>
        <Input label="Aktuálna cena (€) - automaticky z eBay" name="current" value={form.current} disabled readOnly type="number" step="0.01" style={{backgroundColor: "#f1f5f9", color: "#64748b", cursor: "not-allowed", opacity: 0.7}}/>
        <Input label="Poznámka" name="note" value={form.note} onChange={handleChange}/>
      </div>

      <div>
        <label style={{fontSize:12,color:"#475569"}}>Fotografia (JPG/PNG)</label><br/>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile}/>
        {preview && (
          <div style={{marginTop:8,display:"flex",alignItems:"center",gap:8}}>
            <img src={preview} alt="preview" style={{width:90,height:90,objectFit:"cover",borderRadius:8,border:"1px solid #e5e7eb"}}/>
            <button type="button" onClick={clearPhoto}>Vyčistiť fotku</button>
          </div>
        )}
      </div>

      <div style={{display:"flex",gap:8}}>
        <button type="submit">{initial ? "Uložiť zmeny" : "Pridať položku"}</button>
        {initial && <button type="button" onClick={onCancel}>Zrušiť úpravu</button>}
      </div>
    </form>
  );
}

function Input(props){
  const { style, ...rest } = props;
  return (
    <label style={{display:"grid",gap:6,fontSize:12,color:"#475569"}}>
      {props.label}
      <input {...rest} style={{padding:"10px 12px",border:"1px solid #cbd5e1",borderRadius:12, ...style}}/>
    </label>
  );
}
function Select({label,options,...rest}){ return (
  <label style={{display:"grid",gap:6,fontSize:12,color:"#475569"}}>
    {label}
    <select {...rest} style={{padding:"10px 12px",border:"1px solid #cbd5e1",borderRadius:12}}>
      {options.map(([v,t]) => <option key={v} value={v}>{t}</option>)}
    </select>
  </label>
);}

function fileToDataURL(file){
  return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); });
}
