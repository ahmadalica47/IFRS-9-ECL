import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../src/App';
import './web.css';

const SINGLE = import.meta.env.MODE === 'single';

// Offline: the service worker keeps a copy of the app after the first visit (not used in the single-file version).
function registerSW() {
    if (SINGLE || import.meta.env.DEV || !('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => { /* offline mode unavailable, app still works */ }); });
}

function WebFooter() {
    const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
    const [install, setInstall] = useState<any>(null);
    const [ready, setReady] = useState(false);
    useEffect(() => {
        const on = () => setOnline(true), off = () => setOnline(false);
        const bip = (e: Event) => { e.preventDefault(); setInstall(e); };
        window.addEventListener('online', on); window.addEventListener('offline', off); window.addEventListener('beforeinstallprompt', bip);
        if (!SINGLE && 'serviceWorker' in navigator) navigator.serviceWorker.ready.then(() => setReady(true)).catch(() => { });
        return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); window.removeEventListener('beforeinstallprompt', bip); };
    }, []);
    return <footer className="web-foot">
        <span className={'web-dot ' + (online ? 'on' : 'off')} />
        <span>{online ? 'Online' : 'Offline: everything works except loading new World Bank data'}</span>
        {SINGLE ? <span>Offline edition: this single file runs with no internet.</span> : <>
            {ready && <span>Ready to use offline on this device.</span>}
            <a href="./offline/index.html" download="ifrs9-ecl-calculator.html">Download the offline file</a>
            {install && <button type="button" className="btn btn-ghost btn-s" onClick={() => { install.prompt(); setInstall(null); }}>Install as an app</button>}
        </>}
        <span className="web-priv">Your data is processed only in this browser. Nothing is uploaded.</span>
    </footer>;
}

createRoot(document.getElementById('root')!).render(<><App /><WebFooter /></>);
registerSW();
