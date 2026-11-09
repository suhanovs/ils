// Illustrative weights only, not OIR company data or actual insurance coverage.
export const insurers = [{name:'Harbor Mutual (fictional)',weight:0.5},{name:'Cypress Insurance (fictional)',weight:0.3},{name:'Gulf Example (fictional)',weight:0.2}];
export function allocate(units) {
 if (!Number.isSafeInteger(units) || units < 0) throw new RangeError('Expected nonnegative integer units');
 const rows=insurers.map((insurer,index)=>{const exact=units*insurer.weight;return {...insurer,index,units:Math.floor(exact),remainder:exact-Math.floor(exact)}});
 let remaining=units-rows.reduce((sum,row)=>sum+row.units,0);
 for(const row of [...rows].sort((a,b)=>b.remainder-a.remainder||a.index-b.index)) {if(remaining--<=0) break; row.units++;}
 return rows;
}
