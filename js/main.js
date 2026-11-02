import { API_URL, DOM, tg, user, playerProfile, setPlayerProfile, setUser } from './config.js';
import { checkCooldownStatus } from './cards.js';
import { renderDeckGrid } from './deck.js';

async function startApp() {
    if (tg?.initDataUnsafe?.user) {
        tg.ready(); tg.expand();
        setUser({ id: tg.initDataUnsafe.user.id, username: tg.initDataUnsafe.user.username || tg.initDataUnsafe.user.first_name });
        await loginAndInitGame();
    } else {
        if (DOM.authOverlay) DOM.authOverlay.style.display = 'flex';
    }
}

export async function loginAndInitGame() {
    if (!user.username) return;
    try {
        if (DOM.authOverlay) DOM.authOverlay.style.display = 'none';
        const response = await fetch(`${API_URL}/profile/${user.username}`);
        const data = await response.json();
        setPlayerProfile(Array.isArray(data) ? data : data);
        
        updateUI();
        startCooldownTimer();
        setupEventListeners();
    } catch (e) { console.error(e); }
}

function updateUI() {
    if (!playerProfile) return;
    if (DOM.coinBalanceEl) DOM.coinBalanceEl.innerHTML = `${playerProfile.points} 🪙`;
    if (DOM.affinityFillEl) DOM.affinityFillEl.style.width = `${playerProfile.affinity}%`;
    if (DOM.affinityLabelEl) {
        const aff = playerProfile.affinity;
        let l = aff >= 70 ? "почти терплю" : aff >= 31 ? "ну... ладно" : "едва замечаю";
        DOM.affinityLabelEl.textContent = `${l} (${aff})`;
    }
    const nameEl = document.querySelector('.fixed-player-username');

    if (nameEl) nameEl.textContent = `@${playerProfile.username}`;
}

let timerInterval = null;
function startCooldownTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (!playerProfile || !playerProfile.last_pack_opened) {
            DOM.timeLeftEl.textContent = "Готово!";
            checkCooldownStatus(); return;
        }
        const diff = (new Date(playerProfile.last_pack_opened).getTime() + 4*60*60*1000) - new Date().getTime();
        if (diff <= 0) { DOM.timeLeftEl.textContent = "Готово!"; checkCooldownStatus(); return; }
        
        const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
        const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
        const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
        DOM.timeLeftEl.textContent = `${h}ч ${m}м ${s}с`;
        checkCooldownStatus();
    }, 1000);
}

function setupEventListeners() {
    document.querySelector('.deck-button').onclick = async () => {
        await renderDeckGrid();
        DOM.deckScreen.style.display = 'flex';
        setTimeout(() => DOM.deckScreen.style.opacity = '1', 10);
    };
    document.querySelector('.btn-close-deck').onclick = () => {
        DOM.deckScreen.style.opacity = '0';
        setTimeout(() => DOM.deckScreen.style.display = 'none', 300);
    };

    if (DOM.buyHourBtn) {
        DOM.buyHourBtn.onclick = async () => {
            if (!playerProfile || playerProfile.points < 20) {
                alert("Недостаточно монет!"); return;
            }
            DOM.hourglassIcon.classList.add('flip-hourglass');
            DOM.hourglassIcon.addEventListener('animationend', () => DOM.hourglassIcon.classList.remove('flip-hourglass'), { once: true });

            try {
                const response = await fetch(`${API_URL}/buy-hour/${playerProfile.username}`, { method: 'POST' });
                if (response.ok) {
                    await loginAndInitGame();
                } else { 
                    const res = await response.json();
                    alert(res.detail); 
                }
            } catch (e) { alert("Сервер упал!"); }
        };
    }
}

if (DOM.manualLoginBtn) {
    DOM.manualLoginBtn.addEventListener('click', () => {
        let name = DOM.manualInput.value.trim().replace('@', '');
        if (name) { setUser({ id: null, username: name }); loginAndInitGame(); }
    });
}

window.addEventListener('DOMContentLoaded', () => setTimeout(startApp, 100));
