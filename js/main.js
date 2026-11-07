import { API_URL, DOM, tg, playerProfile, isDrawing, setPlayerProfile, setUser, setAuthToken, apiFetch } from './config.js';
import { checkCooldownStatus } from './cards.js';
import { renderDeckGrid } from './deck.js';
import { initPackSystem } from './packs.js';
import { initMinigame } from './minigame.js';

function say(text) {
    if (DOM.speechBubbleEl) DOM.speechBubbleEl.textContent = text;
}

async function startApp() {
    if (tg) { tg.ready(); tg.expand(); }

    if (tg?.initData) {
        await loginWithTelegram();
        return;
    }

    const saved = localStorage.getItem("saved_game_username");
    if (saved) {
        await loginWithNickname(saved);
    } else {
        document.getElementById('auth-overlay')?.style.setProperty('display', 'flex', 'important');
    }
}

async function loginWithTelegram() {
    try {
        const response = await fetch(`${API_URL}/api/auth/telegram`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ init_data: tg.initData })
        });
        if (!response.ok) {
            say("Не узнаю тебя... Открой игру через бота в Telegram.");
            return;
        }
        await finishLogin(await response.json());
    } catch (e) {
        say("Сервер отключился)");
    }
}

async function loginWithNickname(usernameStr) {
    try {
        const response = await fetch(`${API_URL}/api/auth/simple`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: usernameStr })
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            say(`Ты вообще кто? ${err.detail || "Попробуй другой никнейм."}`);
            localStorage.removeItem("saved_game_username");
            if (DOM.authOverlay) DOM.authOverlay.style.display = 'flex';
            return;
        }
        const data = await response.json();
        localStorage.setItem("saved_game_username", data.player.username);
        await finishLogin(data);
    } catch (e) {
        say("Назови хотя бы имя...");
    }
}

function updateUI() {
    if (!playerProfile) return;
    if (DOM.coinBalanceEl) DOM.coinBalanceEl.textContent = playerProfile.points;
    
    if (DOM.affinityLabelEl) {
        const aff = playerProfile.affinity;
        let l = aff >= 70 ? "почти терплю" : aff >= 31 ? "ну... ладно" : "едва замечаю";
        DOM.affinityLabelEl.innerHTML = `${l} (${aff}) <div class="affinity-bar-bg"><div class="affinity-bar-fill" style="width: ${aff}%;"></div></div>`;
        DOM.affinityFillEl = document.querySelector('.affinity-bar-fill');
    }
    
    const nameEl = document.querySelector('.fixed-player-username');
    if (nameEl) nameEl.textContent = `@${playerProfile.username}`;
}

let timerState = null; 
function setTimerState(state) {
    if (timerState === state) return;
    timerState = state;
    if (state === 'ready') {
        DOM.hourglassIcon?.classList.add('timer-ended');
        say("Хм-м... Время пришло! Давай посмотрим, что тебе уготовила судьба!");
    } else {
        DOM.hourglassIcon?.classList.remove('timer-ended');
        say("Тут будут карты, когда придет время. Придется немного подождать...");
    }
}

let timerInterval = null;
let timeSkew = 0; 

async function finishLogin(data) {
    setAuthToken(data.token);
    setPlayerProfile(data.player);
    setUser({ id: data.player.user_id, username: data.player.username });

    if (data.server_time) timeSkew = data.server_time - Date.now();

    updateUI();
    startCooldownTimer();
    
    try {
        const res = await apiFetch('/api/minigame/status');
        if (res.ok) {
            const data = await res.json();
            const badge = document.getElementById('mg-attempts-badge');
            if (badge) badge.textContent = `${data.plays_left}/${data.max_plays}`;
        }
    } catch(e) {}
    
    
    setupEventListeners();
    initParallax();
    initPackSystem();
    initMinigame();
    if (data.pending_card) {
        handlePendingCard(data.pending_card);
    }

    if (DOM.authOverlay) DOM.authOverlay.style.display = 'none';
}

async function refreshProfile() {
    if (isDrawing.value || !playerProfile) return;
    try {
        const r = await apiFetch('/api/me');
        if (!r.ok) return;
        const data = await r.json();
        
        if (data.server_time) timeSkew = data.server_time - Date.now();
        
        setPlayerProfile(data.player);
        updateUI();

        if (data.pending_card) {
            handlePendingCard(data.pending_card);
            return;
        }

        const last = data.player.last_pack_opened;
        if (last && new Date(last).getTime() + 4 * 3600000 > (Date.now() + timeSkew)) {
            DOM.cardsDropZone.innerHTML = '';
        }
    } catch (e) {
        setTimeout(refreshProfile, 3000);
    }
}

function startCooldownTimer() {
    if (window.timerInterval) clearInterval(window.timerInterval);
    window.timerInterval = setInterval(() => {
        if (isDrawing.value) return; 
        const last = playerProfile?.last_pack_opened;
        const diff = last ? new Date(last).getTime() + 4 * 3600000 - (Date.now() + timeSkew) : 0;
        if (diff <= 0) {
            DOM.timeLeftEl.textContent = "Готово!";
            setTimerState('ready');
            checkCooldownStatus();
            return;
        }
        setTimerState('waiting');
        const h = String(Math.floor(diff / 3600000)).padStart(2, '0');
        const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
        const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
        DOM.timeLeftEl.textContent = `${h}ч ${m}м ${s}с`;
    }, 1000);
}

function handlePendingCard(pendingCard) {
    isDrawing.value = true;
    DOM.cardsDropZone.innerHTML = '';
    
    const cardContainer = document.createElement('div');
    cardContainer.className = 'card-container settled flipped'; 
    cardContainer.style.filter = 'drop-shadow(0 25px 50px rgba(0,0,0,0.9))';
    cardContainer.innerHTML = `<div class="card-inner" style="transform: rotateY(180deg);"><div class="card-front"></div></div>`;
    DOM.cardsDropZone.appendChild(cardContainer);
    
    document.querySelector('.scene-dark-overlay')?.classList.add('active');
    
    let rarityClass = 'common';
    const r = (pendingCard.rarity || '').toLowerCase();
    if (r === 'редкая' || r === 'редк') rarityClass = 'rare';
    if (r === 'лега' || r === 'легендарная') rarityClass = 'legendary';
    
    const innerEl = cardContainer.querySelector('.card-inner');
    if (innerEl) {
        innerEl.innerHTML += `
            <div class="card-back rarity-${rarityClass}">
                <img class="card-image-bg" src="${pendingCard.image_url}">
                <div class="card-frame-border"></div>
                <div class="card-id-badge">${pendingCard.id || '?'}</div>
                <div class="card-text-plate">
                    <div class="card-title-text">${pendingCard.title}</div>
                    <div class="card-rarity-text">${pendingCard.rarity ? pendingCard.rarity.toUpperCase() : 'ОБЫЧНАЯ'}</div>
                </div>
                ${rarityClass === 'legendary' ? '<div class="legendary-glare"></div>' : ''}
            </div>`;
    }
    
    import('./swipe.js').then(m => {
        m.renderInPlaceActionButtons(pendingCard, cardContainer);
    });
}

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshProfile();
});

function setupEventListeners() {
    const deckBtn = document.querySelector('.deck-button');
    if (deckBtn) {
        deckBtn.onclick = async () => {
            if (DOM.deckScreen.style.display === 'flex') return;
            await refreshProfile();
            await renderDeckGrid();
            DOM.deckScreen.style.display = 'flex';
            setTimeout(() => DOM.deckScreen.style.opacity = '1', 10);
        };
    }
    
    document.querySelector('.btn-close-deck').onclick = () => {
        DOM.deckScreen.style.opacity = '0';
        setTimeout(() => { DOM.deckScreen.style.display = 'none'; }, 300);
    };
    
    const dailyBtn = document.getElementById('hourglass-daily-btn');
    const badge = document.getElementById('daily-badge');
    const floatingCoins = document.getElementById('floating-coins');

    function updateDailyBadge() {
        const last = playerProfile?.last_daily_claim;
        const diff = last ? new Date(last).getTime() + 24 * 3600000 - Date.now() : 0;

        if (diff <= 0) {
            dailyBtn.classList.add('daily-ready');
            badge.style.display = 'flex';
        } else {
            dailyBtn.classList.remove('daily-ready');
            badge.style.display = 'none';
        }
    }
    
    const magicRing = document.querySelector('.magic-ring-container');
    if (magicRing) {
        magicRing.onclick = () => {
            if (isDrawing.value || document.querySelector('.card-zoom-and-fly')) return;
            
            if (DOM.cardsDropZone.querySelector('.card-container')) {
                if (DOM.speechBubbleEl) DOM.speechBubbleEl.textContent = "Сначала выбери карту!";
                return;
            }

            const badge = document.getElementById('mg-attempts-badge');
            if (badge && badge.textContent.startsWith('0/')) {
                if (DOM.speechBubbleEl) DOM.speechBubbleEl.textContent = "Твои силы на сегодня иссякли. Приходи завтра.";
                return;
            }

            if (window.startMinigame) window.startMinigame();
        };
    }

    updateDailyBadge();

    if (dailyBtn) {
        dailyBtn.onclick = async () => {
            const last = playerProfile?.last_daily_claim;
            const diff = last ? new Date(last).getTime() + 24 * 3600000 - Date.now() : 0;
            if (diff > 0) {
                if (DOM.speechBubbleEl) DOM.speechBubbleEl.textContent = "Эй, не так быстро! Приходи завтра.";
                return;
            }

            const res = await apiFetch('/api/daily-reward', { method: 'POST' });
            const data = await res.json().catch(()=>({}));
            
            if (res.ok) {
                playerProfile.points = data.new_points;
                playerProfile.last_daily_claim = new Date().toISOString();
                
                if (DOM.coinBalanceEl) DOM.coinBalanceEl.textContent = data.new_points;
                
                floatingCoins.textContent = `+${data.reward} 🪙`;
                floatingCoins.classList.remove('show');
                void floatingCoins.offsetWidth;
                floatingCoins.classList.add('show');

                updateDailyBadge();
                
                import('./config.js').then(m => m.haptic('notificationOccurred', 'success'));
                
                if (DOM.speechBubbleEl) DOM.speechBubbleEl.textContent = "Держи свои монеты. Не трать всё сразу!";
            } else {
                if (DOM.speechBubbleEl) DOM.speechBubbleEl.textContent = data.detail || "Приходи завтра!";
            }
        };
    }

    if (DOM.buyHourBtn) {
        DOM.buyHourBtn.onclick = async () => {
            if (!playerProfile || playerProfile.points < 20) {
                if (DOM.speechBubbleEl) {
                    import('./config.js').then(m => m.haptic('notificationOccurred', 'error')); 
                    DOM.speechBubbleEl.textContent = "Или твое время или деньги. Нет монет? Отдавай время";
                }
                return;
            }
            
            const configModule = await import('./config.js');
            configModule.showLoader();
            try {
                const response = await apiFetch('/api/buy-hour', { method: 'POST' });        
                if (response.ok) {
                    import('./config.js').then(m => m.haptic('notificationOccurred', 'success'));
                    configModule.haptic('notificationOccurred', 'success');
                    const data = await response.json();                   
                    if (DOM.hourglassIcon) {
                        DOM.hourglassIcon.classList.remove('hourglass-fast-spin');
                        void DOM.hourglassIcon.offsetWidth; 
                        DOM.hourglassIcon.classList.add('hourglass-fast-spin');
                    }
                    playerProfile.points = data.points;
                    playerProfile.last_pack_opened = data.last_pack_opened;
                    updateUI();
                    } else {
                        const res = await response.json().catch(() => ({}));
                        if (DOM.speechBubbleEl) {
                            DOM.speechBubbleEl.textContent = res.detail || "Сервер времени заклинило, не могу отнять час!";
                        }
                    }
            } catch (e) { 
                if (DOM.speechBubbleEl) DOM.speechBubbleEl.textContent = "Сервер молчит... Попробуй позже.";
            }finally {
                configModule.hideLoader();
            }
        };
    }
}

function initParallax() {
    const bgLayer = document.querySelector('.parallax-bg-layer');
    const botContainer = document.querySelector('.bot-character-container');
    if (!bgLayer || !botContainer) return;

    try {
        window.addEventListener('deviceorientation', (event) => {
            if (!event) return; 
            let x = event.gamma || 0; 
            let y = event.beta || 0;  

            if (x > 30) x = 30; if (x < -30) x = -30;
            if (y > 60) y = 60; if (y < 20) y = 20;

            const bgX = (x / 30) * -15;
            const bgY = ((y - 40) / 20) * -15;
            const botX = (x / 30) * 8;

            bgLayer.style.transform = `scale(1.1) translate(${bgX}px, ${bgY}px)`;
            botContainer.style.transform = `translateX(${botX}px)`;
        });
    } catch (e) {
        console.warn("Параллакс не поддерживается на этом устройстве:", e);
    }
}

if (DOM.manualLoginBtn) {
    DOM.manualLoginBtn.addEventListener('click', async () => {
        let name = DOM.manualInput.value.trim().replace('@', '');
        if (!name) {
            if (DOM.speechBubbleEl) DOM.speechBubbleEl.textContent = "Сервер молчит... Попробуй позже.";
            return;
        }
        await loginWithNickname(name);
    });
}
window.addEventListener('DOMContentLoaded', () => setTimeout(startApp, 100));