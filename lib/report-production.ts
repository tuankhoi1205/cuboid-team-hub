export const PRODUCTION_FACTOR=0.85;
export function cuboidsFromIds(ids:number,frames:number|null):number|null {
 if(!Number.isSafeInteger(ids)||ids<0||ids>100000000||frames==null||!Number.isSafeInteger(frames)||frames<=0||frames>100000000)return null;
 const hundredths=BigInt(ids)*BigInt(frames)*BigInt(85);
 return hundredths<=BigInt(10000000000)?Number(hundredths)/100:null;
}
