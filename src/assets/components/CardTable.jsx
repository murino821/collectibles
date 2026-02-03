import { useCurrency } from '../../CurrencyContext';
import { useLanguage } from '../../LanguageContext';

export default function CardsTable({ items, onEdit, onDelete }) {
  const { currency, formatCurrency } = useCurrency();
  const { language } = useLanguage();
  return (
    <div style={{overflow:"auto", maxHeight:"62vh", border:"1px solid #e2e8f0", borderRadius:12, background:"#fff"}}>
      <table style={{width:"100%", borderCollapse:"collapse", fontSize:14}}>
        <thead>
          <tr style={{position:"sticky", top:0, background:"#f8fafc", fontWeight:600, fontSize:12, color:"#334155"}}>
            <th style={th}>#</th>
            <th style={th}>Foto</th>
            <th style={th}>Položka</th>
            <th style={{...th,textAlign:"right"}}>Nákupná ({currency})</th>
            <th style={{...th,textAlign:"right"}}>Aktuálna ({currency})</th>
            <th style={{...th,textAlign:"right"}}>Predaná ({currency})</th>
            <th style={th}>Stav</th>
            <th style={th}>Akcie</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => (
            <tr key={it.id} style={{borderBottom:"1px solid #f1f5f9"}}>
              <td style={td}>{idx+1}</td>
              <td style={td}>
                {it.photoUrl ? <img src={it.photoUrl} alt="" style={thumb}/> : <span style={{color:"#94a3b8"}}>—</span>}
              </td>
              <td style={td}>{it.item}</td>
              <td style={{...td,textAlign:"right"}}>{it.buy != null ? formatCurrency(it.buy, language) : ''}</td>
              <td style={{...td,textAlign:"right"}}>{it.current != null ? formatCurrency(it.current, language) : ''}</td>
              <td style={{...td,textAlign:"right"}}>{it.status === 'predaná' && it.soldPrice != null ? formatCurrency(it.soldPrice, language) : ''}</td>
              <td style={td}>{it.status}</td>
              <td style={{...td,whiteSpace:"nowrap"}}>
                <button onClick={()=>onEdit(it)} style={btnGhost}>Upraviť</button>{" "}
                <button onClick={()=>onDelete(it)} style={btnDanger}>Zmazať</button>
              </td>
            </tr>
          ))}
          {!items.length && (
            <tr><td colSpan={8} style={{padding:20,color:"#94a3b8"}}>Zatiaľ žiadne karty.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const th = { padding:"10px 12px", borderBottom:"1px solid #e2e8f0", textAlign:"left" };
const td = { padding:"10px 12px" };
const thumb = { width:56, height:56, objectFit:"cover", borderRadius:10, border:"1px solid #e5e7eb", background:"#fff" };
const btnDanger = { padding:"6px 10px", borderRadius:10, border:"1px solid #fecaca", background:"#fee2e2", color:"#991b1b", cursor:"pointer" };
const btnGhost = { padding:"6px 10px", borderRadius:10, border:"1px solid #c7d2fe", background:"#eef2ff", color:"#1e3a8a", cursor:"pointer" };
