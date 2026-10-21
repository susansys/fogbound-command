import {GameError} from '../contracts';
export function portable_energy(wh:number,available_percent:number):{nominal_j:number;available_j:number}{
  const nominal_uJ=Math.round(wh*3600*1000000);
  if(!Number.isFinite(wh)||wh<=0||!Number.isSafeInteger(nominal_uJ)||!Number.isInteger(available_percent)||available_percent<0||available_percent>100)throw new GameError('INVALID_DEFINITION');
  const available_uJ=nominal_uJ*available_percent/100;
  if(!Number.isSafeInteger(available_uJ))throw new GameError('INVALID_DEFINITION');
  return {nominal_j:nominal_uJ/1000000,available_j:available_uJ/1000000};
}
export function load_kg(items:readonly {mass_kg:number}[]):number{
  const grams=items.map(item=>item.mass_kg*1000);
  if(grams.some(value=>!Number.isSafeInteger(value)||value<0))throw new GameError('INVALID_DEFINITION');
  const total=grams.reduce((sum,value)=>sum+value,0)/1000;
  if(total<0||total>8)throw new GameError('INVALID_DEFINITION');
  return total;
}
