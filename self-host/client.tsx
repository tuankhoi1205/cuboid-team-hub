import React, { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { Box, ShieldCheck, Database, Layers3, ArrowRight, KeyRound, LockKeyhole } from "lucide-react";
import HubApp, { CubeArt } from "../app/hub-app";
import "../app/styles.css";
import "./styles.css";

function LocalApp() {
  const [info,setInfo]=useState<any>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[tokenInfo,setTokenInfo]=useState<any>(null);
  const [username,setUsername]=useState(""),[password,setPassword]=useState(""),[confirm,setConfirm]=useState(""),[currentPassword,setCurrentPassword]=useState("");
  const path=window.location.pathname;
  const mode=path==="/auth/setup"?"setup":path==="/auth/activate"?"activate":path==="/auth/password"?"password":path==="/auth/forgot"?"forgot":"login";
  const token=new URLSearchParams(window.location.search).get("token")||"";
  useEffect(()=>{void fetch("/api/auth/me"+(mode==="login"?"?bootstrap=1":""),{cache:"no-store"}).then(r=>r.json()).then(setInfo).catch(()=>setError("Không kết nối được máy chủ. Kiểm tra máy host đã bật chưa."));
    if(mode==="activate")void fetch("/api/auth/token?token="+encodeURIComponent(token),{cache:"no-store"}).then(async r=>{const d:any=await r.json();if(!r.ok)throw new Error(d.error);setTokenInfo(d);}).catch(e=>setError(e.message));
  },[]);
  const ready=info&&(!info.authenticated||mode==="password"||mode==="activate"||mode==="forgot"||mode==="setup");
  async function submit(e:FormEvent) {
    e.preventDefault();setError("");
    if(mode!=="login"&&password!==confirm){setError("Hai lần nhập mật khẩu chưa khớp.");return;}
    setBusy(true);
    try{const endpoint=mode==="password"?"change-password":mode;const r=await fetch("/api/auth/"+endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(mode==="login"?{username,password,bootstrap:true}:mode==="password"?{currentPassword,password}:mode==="activate"?{token,password}:{password})});const d:any=await r.json();if(!r.ok)throw new Error(d.error);if(mode==="login"&&d.hubState){window.history.replaceState(null,"","/");setPassword("");setInfo(d);}else window.location.replace("/");}catch(e:any){setError(e.message||"Chưa lưu được. Vui lòng thử lại.");}finally{setBusy(false);}
  }
  if(info?.authenticated&&mode==="login")return <HubApp signedIn signInPath="/auth/login" authProvider="local" initialState={info.hubState}/>;
  if(mode==="password"&&info&&!info.authenticated){window.location.replace("/auth/login");return null;}
  return <div className="welcome-shell"><div className="welcome-brand"><div className="brand light"><span className="brand-mark"><Box size={26}/></span><span>Cuboid<span className="brand-sub">TEAM HUB</span></span></div><div className="welcome-copy"><span className="eyebrow">MÁY CHỦ RIÊNG CỦA TEAM</span><h1>Cùng một team.<br/>Cùng một nhịp làm việc.</h1><p>Không gian annotation và QA/QC của team. Dữ liệu và tệp được lưu trên máy chủ của bạn.</p><CubeArt/><div className="welcome-features"><span><ShieldCheck size={18}/>Tài khoản riêng</span><span><Database size={18}/>SQLite trên máy host</span><span><Layers3 size={18}/>Annotation & QA/QC</span></div></div><span className="welcome-footer">CUBOID TEAM HUB <i/> ASIA/HO_CHI_MINH</span></div>
    <div className="welcome-form"><div className="welcome-card"><span className="welcome-icon">{mode==="login"?<LockKeyhole size={29}/>:<KeyRound size={29}/>}</span><h2>{!info?"Đang kết nối máy chủ…":mode==="setup"?"Thiết lập tài khoản Lead":mode==="activate"?tokenInfo?.purpose==="reset"?"Khôi phục mật khẩu":"Kích hoạt tài khoản":mode==="password"?"Đổi mật khẩu":mode==="forgot"?"Quên mật khẩu?":"Chào mừng trở lại"}</h2>
      <p>{mode==="setup"?"Anh Khôi đặt mật khẩu riêng cho tài khoản 26ai.khoint2. Tài khoản Lead dùng để quản lý công việc và nhân sự của team.":mode==="activate"?`${tokenInfo?.name||"Thành viên"} · ${tokenInfo?.username||"Đang kiểm tra liên kết…"}`:mode==="password"?"Sau khi đổi mật khẩu, các phiên đăng nhập khác sẽ bị đăng xuất.":mode==="forgot"?"Liên hệ Lead để nhận liên kết khôi phục riêng, có thời hạn và chỉ dùng một lần.":"Đăng nhập bằng tên được cấp, ví dụ 26ai.khoint2. Không cần tài khoản của nền tảng khác."}</p>
      {mode==="forgot"?<><div className="auth-note"><ShieldCheck size={19}/><span>Lead mở Nhân sự → Khôi phục mật khẩu. Nếu chính Lead quên mật khẩu, chạy ResetLead.cmd trực tiếp trên máy host.</span></div><a className="btn primary wide" href="/auth/login">Quay lại đăng nhập<ArrowRight size={16}/></a></>:ready&&<form className="local-auth-form" onSubmit={e=>void submit(e)}>
        {mode==="login"?<label className="field"><span>Tên đăng nhập</span><input name="username" autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} placeholder="26ai.khoint2" required autoFocus/></label>:<div className="account-chip"><ShieldCheck size={17}/>{mode==="setup"?"26ai.khoint2 · Nguyễn Tuấn Khôi":mode==="password"?info?.member?.username:tokenInfo?.username||"Đang kiểm tra lời mời"}</div>}
        {mode==="password"&&<label className="field"><span>Mật khẩu hiện tại</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} required/></label>}
        <label className="field"><span>{mode==="login"?"Mật khẩu":"Mật khẩu mới"}</span><input name="password" type="password" autoComplete={mode==="login"?"current-password":"new-password"} minLength={mode==="login"?undefined:3} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} required/></label>
        {mode!=="login"&&<><label className="field"><span>Nhập lại mật khẩu mới</span><input type="password" autoComplete="new-password" minLength={3} maxLength={128} value={confirm} onChange={e=>setConfirm(e.target.value)} required/></label><p className="password-hint">Từ 3 đến 128 ký tự. Bạn có thể đổi mật khẩu sau khi đăng nhập.</p></>}
        <button type="submit" className="btn primary wide" disabled={busy||mode==="activate"&&!tokenInfo||mode==="setup"&&!info.localSetupAllowed}>{busy?"Đang xử lý…":mode==="login"?"Đăng nhập":mode==="password"?"Lưu mật khẩu mới":"Đặt mật khẩu và tiếp tục"}<ArrowRight size={17}/></button>
        {mode==="login"&&<><a className="text-link" href="/auth/forgot">Quên mật khẩu?</a>{info.setupRequired&&<p className="auth-note">Lead cần thiết lập mật khẩu trực tiếp trên máy host tại http://127.0.0.1:3210/auth/setup trước khi team bắt đầu.</p>}</>}{mode==="password"&&<a className="text-link" href="/">Quay lại workspace</a>}
      </form>}{error&&<div className="error-box" role="alert">{error}</div>}<div className="welcome-meta"><span>Tiếng Việt</span><span>UTC+07:00</span><span>SELF HOSTED</span></div></div></div></div>;
}
createRoot(document.getElementById("root")!).render(<LocalApp/>);
