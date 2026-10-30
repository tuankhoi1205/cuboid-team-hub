type Form={projectId?:string;id?:string;code?:string;jobId?:string};
export const datumaroTaskScope=(form:Form)=>JSON.stringify([form.projectId||"",form.id||""]);
export const datumaroTaskIdentity=(form:Form)=>JSON.stringify([String(form.code||"").trim(),String(form.jobId||"").trim()]);
export type PreviewContext={projectId?:string|null;taskCode?:string;jobId?:string;editTaskId?:string};
export function previewMatchesTask(context:PreviewContext,form:Form){
 return form.projectId===context.projectId&&(form.id||"")===(context.editTaskId||"")&&(!context.taskCode||String(form.code||"").trim()===context.taskCode)&&(!context.jobId||String(form.jobId||"").trim()===context.jobId);
}
