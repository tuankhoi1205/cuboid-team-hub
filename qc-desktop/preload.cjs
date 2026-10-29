const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('qcDesktop',Object.freeze({
 load:()=>ipcRenderer.invoke('qc:load'),
 save:state=>ipcRenderer.invoke('qc:save',state),
 history:()=>ipcRenderer.invoke('qc:history'),
 historyOpen:key=>ipcRenderer.invoke('qc:history-open',key),
 datumaro:offset=>ipcRenderer.invoke('qc:datumaro',offset),
 exportResult:result=>ipcRenderer.invoke('qc:export',result),
 exportDraft:state=>ipcRenderer.invoke('qc:export-draft',state),
 importDraft:()=>ipcRenderer.invoke('qc:import-draft'),
 exportTool:(hash,offset)=>ipcRenderer.invoke('qc:export-tool',hash,offset),
 menu:options=>ipcRenderer.invoke('qc:menu',options),
 window:options=>ipcRenderer.invoke('qc:window',options),
 close:()=>ipcRenderer.invoke('qc:close')
}));
