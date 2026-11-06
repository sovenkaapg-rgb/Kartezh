import { API_URL, DOM, tg, playerProfile, isDrawing, setPlayerProfile, setUser, setAuthToken, apiFetch } from './config.js';
import { checkCooldownStatus } from './cards.js';
import { renderDeckGrid } from './deck.js';

function say(text) {
    if (DOM.speechBubbleEl) DOM.speechBubbleEl.textContent = text;
}

async function startApp() {
    if (tg) { tg.ready(); tg.expand(); }

    // Внутри Telegram: входим по подписанным данным
    if (tg?.initData) {
        await loginWithTelegram();
        return;
    }

    // Вне Telegram: только отладочный вход по нику (сервер пустит его лишь при DEBUG=1)
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
// Динамическое обновление UI элементов HUD-панели
function updateUI() {
    if (!playerProfile) return;
    
    // 1. Обновляем монеты
    if (DOM.coinBalanceEl) DOM.coinBalanceEl.textContent = playerProfile.points;
    
    // 2. Обновление шкалы лояльности и текста статуса
    if (DOM.affinityLabelEl) {
        const aff = playerProfile.affinity;
        let l = aff >= 70 ? "почти терплю" : aff >= 31 ? "ну... ладно" : "едва замечаю";
        DOM.affinityLabelEl.innerHTML = `${l} (${aff}) <div class="affinity-bar-bg"><div class="affinity-bar-fill" style="width: ${aff}%;"></div></div>`;
        DOM.affinityFillEl = document.querySelector('.affinity-bar-fill');
    }
    
    // 3. Записываем никнейм игрока
    const nameEl = document.querySelector('.fixed-player-username');
    if (nameEl) nameEl.textContent = `@${playerProfile.username}`;
}
// Ежесекундный таймер кулдауна пака
let timerState = null; // 'ready' | 'waiting'
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

let refreshing = false;


let timeSkew = 0; // Смещение времени клиента относительно сервера

async function finishLogin(data) {
    setAuthToken(data.token);
    setPlayerProfile(data.player);
    setUser({ id: data.player.user_id, username: data.player.username });

    // Расчет смещения времени
    if (data.server_time) {
        timeSkew = data.server_time - Date.now();
    }

    updateUI();
    startCooldownTimer();
    setupEventListeners();
    initParallax();

    // Проверка зависшего дропа при входе
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
        
        // Корректируем время при каждом обновлении профиля
        if (data.server_time) timeSkew = data.server_time - Date.now();
        
        setPlayerProfile(data.player);
        updateUI();

        if (data.pending_card) {
            handlePendingCard(data.pending_card);
            return;
        }

        const last = data.player.last_pack_opened;
        // Используем скорректированное время вместо Date.now()
        if (last && new Date(last).getTime() + 4 * 3600000 > (Date.now() + timeSkew)) {
            DOM.cardsDropZone.innerHTML = '';
        }
    } catch (e) {
        // Ошибка сети — аккуратно повторяем попытку через 3 секунды, не ломая UI
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

// Функция подхвата зависшей карты (если игра закрылась до свайпа)
function handlePendingCard(pendingCard) {
    isDrawing.value = true;
    DOM.cardsDropZone.innerHTML = '';
    
    // Создаем контейнер карты сразу по центру и в перевернутом состоянии
    const cardContainer = document.createElement('div');
    cardContainer.className = 'card-container settled flipped'; // Добавлен класс flipped
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
    
    // Импортируем экспортную функцию и сразу вешаем интерфейс кнопок под карту
    import('./swipe.js').then(m => {
        m.renderInPlaceActionButtons(pendingCard, cardContainer);
    });
}

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshProfile();
});
// Настройка слушателей событий кликов
function setupEventListeners() {
    // Открытие колоды
    // Открытие колоды с защитой от двойного клика анимации
    const deckBtn = document.querySelector('.deck-button');
    if (deckBtn) {
        deckBtn.onclick = async () => {
            // Если экран уже открывается или открыт, ничего не делаем
            if (DOM.deckScreen.style.display === 'flex') return;
            await refreshProfile();
            await renderDeckGrid();
            DOM.deckScreen.style.display = 'flex';
            setTimeout(() => DOM.deckScreen.style.opacity = '1', 10);
        };
    }

    
    // Закрытие колоды
    document.querySelector('.btn-close-deck').onclick = () => {
        DOM.deckScreen.style.opacity = '0';
        setTimeout(() => { DOM.deckScreen.style.display = 'none'; }, 300);
    };

    // Обработчик клика кнопки "КУПИТЬ -1 ЧАС"
    if (DOM.buyHourBtn) {
        DOM.buyHourBtn.onclick = async () => {
            if (!playerProfile || playerProfile.points < 20) {
                if (DOM.speechBubbleEl) {
                    import('./config.js').then(m => m.haptic('notificationOccurred', 'error')); 
                    DOM.speechBubbleEl.textContent = "Или  твое время или деньги. Нет монет? Отдавай время";
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
                    // Запуск эффектного быстрого переворота песочных часов на HUD
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
                // Сервер ответил (успешно или с ошибкой) — выключаем блокировку экрана
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
            // Добавляем проверку, что событие вообще содержит данные
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


// Привязка ручного ввода никнейма в форме
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
