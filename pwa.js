(()=>{
  let deferredPrompt=null;
  const isStandalone=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
  const isiOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent);
  const isSafari=()=>/^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(navigator.userAgent);
  const $=id=>document.getElementById(id);
  function setInstallState(){
    const installed=isStandalone();
    ['installBtn','installBtnLogin'].forEach(id=>{const b=$(id);if(b){b.classList.toggle('hidden',installed);b.textContent=installed?'✓ Installed':'⬇ Install App'}});
    document.documentElement.classList.toggle('pwa-standalone',installed);
  }
  function showHelp(message){
    const modal=$('installHelp'); if(!modal)return;
    const text=$('installHelpText'); if(text)text.innerHTML=message;
    modal.classList.remove('hidden');
  }
  async function install(){
    if(isStandalone()){showHelp('<b>FZ Traffic is already installed.</b><br>Open it from your Home Screen or app list.');return}
    if(deferredPrompt){
      deferredPrompt.prompt();
      const choice=await deferredPrompt.userChoice.catch(()=>null);
      deferredPrompt=null; setInstallState();
      if(choice?.outcome!=='accepted') showHelp('<b>Install was not completed.</b><br>You can use Install App again whenever you are ready.');
      return;
    }
    if(isiOS()){
      showHelp('<b>Install on iPhone / iPad</b><br>Open this site in <b>Safari</b> → tap <b>Share</b> → <b>Add to Home Screen</b> → <b>Add</b>.<br><br>After that, FZ Traffic opens as a standalone app.');
      return;
    }
    showHelp('<b>Install FZ Traffic</b><br>Use your browser menu and choose <b>Install app</b> or <b>Add to Home screen</b>.<br><br>On Chrome/Edge, the install icon may also appear in the address bar.');
  }
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;setInstallState()});
  window.addEventListener('appinstalled',()=>{deferredPrompt=null;setInstallState();localStorage.setItem('fztraffic_installed','1')});
  window.addEventListener('DOMContentLoaded',()=>{
    setInstallState();
    $('installBtn')?.addEventListener('click',install);
    $('installBtnLogin')?.addEventListener('click',install);
    $('installHelpClose')?.addEventListener('click',()=>$('installHelp')?.classList.add('hidden'));
    $('installHelp')?.addEventListener('click',e=>{if(e.target.id==='installHelp')e.currentTarget.classList.add('hidden')});
    if('serviceWorker' in navigator){
      navigator.serviceWorker.register('/sw.js',{scope:'/'}).then(reg=>{
        reg.update().catch(()=>{});
        if(reg.waiting)reg.waiting.postMessage({type:'SKIP_WAITING'});
      }).catch(err=>console.warn('PWA service worker registration failed',err));
    }
  });
})();
