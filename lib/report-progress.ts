export function reportEndId(line:Record<string,any>):string {
 if(line.endId!=null&&/^\d{1,30}$/.test(String(line.endId)))return String(line.endId);
 if(!line.sourceRange||!Number.isSafeInteger(line.sourceIds)||line.sourceIds<0)return "";
 // The two zero-production import rows explicitly record progress in their notes.
 const noted=line.sourceIds===0?String(line.issue||"").match(/^\s*làm tới ID\s+(\d{1,30})\b/i):null;
 return noted?noted[1]:String(line.sourceIds);
}
