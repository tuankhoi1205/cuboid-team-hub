import type {Row} from "./domain.ts";

export function taskFrameCount(task:Pick<Row,"data">|undefined):number|null {
 if(!task)return null;
 const value=Object.hasOwn(task.data,"frameCount")?task.data.frameCount:task.data.sourceFrames;
 return Number.isSafeInteger(value)&&value>0&&value<=100000000?value:null;
}
