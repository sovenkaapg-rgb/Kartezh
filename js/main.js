import { API_URL, DOM, tg, user, playerProfile, setPlayerProfile, setUser } from './config.js';
import { checkCooldownStatus } from './cards.js';
import { renderDeckGrid } from './deck.js';

// Замените старый startApp на этот:
async function startApp() {
    // Пробуем взять никнейм из памяти устройства
    const savedUsername = localStorage.getItem("saved_game_username");

    if (savedUsername) {
        console.log("Найден сохраненный аккаунт:", savedUsername);
        await loginWithNickname(savedUsername);
    } else {
        // Если аккаунта нет в памяти, открываем форму ввода
        if (DOM.authOverlay) DOM.authOverlay.style.display = 'flex';
    }
}

// Замените старый loginWithTelegram на эту новую функцию:
async function loginWithNickname(usernameStr) {
    try {
        console.log("Отправляем запрос авторизации для:", usernameStr);
        
        const response = await fetch(`${API_URL}/api/auth/simple`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: usernameStr })
        });

        if (!response.ok) {
            const errorData = await response.json();
            alert("Ошибка входа: " + (errorData.detail || "Неизвестная ошибка"));
            localStorage.removeItem("saved_game_username");
            if (DOM.authOverlay) DOM.authOverlay.style.display = 'flex';
            return;
        }

        let playerData = await response.json();
        
        // ВАЖНО: Flask возвращает res.data (который в Python является списком/массивом)
        // Если прилетел массив, берем его первый элемент
        if (Array.isArray(playerData)) {
            playerData = playerData[0];
        }

        console.log("Успешный вход! Данные игрока:", playerData);
        
        // Записываем профиль во все глобальные переменные, чтобы deck.js их видел
        setPlayerProfile(playerData);
        setUser({ id: playerData.user_id, username: playerData.username });

        // Сохраняем ник в память телефона
        localStorage.setItem("saved_game_username", playerData.username);
        
        updateUI();
        startCooldownTimer();
        initParallax(); 

        if (DOM.authOverlay) DOM.authOverlay.style.display = 'none';

    } catch (error) {
        console.error("Критическая ошибка сети при авторизации:", error);
        alert("Не удалось связаться с игровым сервером.");
    }
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
                const response = await fetch(`${API_URL}/buy-hour/${playerProfile.user_id}`, { method: 'POST' });
                if (response.ok) {
                    const data = await response.json();
                    playerProfile.points = data.points;
                    playerProfile.last_pack_opened = data.last_pack_opened;
                    updateUI();
                } else { 
                    const res = await response.json();
                    alert(res.detail); 
                }
            } catch (e) { alert("Сервер упал!"); }
        };
    }
}

// Эффект параллакса при наклоне
function initParallax() {
    const bgLayer = document.querySelector('.parallax-bg-layer');
    const botContainer = document.querySelector('.bot-character-container');
    if (!bgLayer || !botContainer) return;

    window.addEventListener('deviceorientation', (event) => {
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
}

// Замените блок обработки клика по кнопке внизу файла (initParallax и DOM.manualLoginBtn):
if (DOM.manualLoginBtn) {
    DOM.manualLoginBtn.addEventListener('click', async () => {
        let name = DOM.manualInput.value.trim().replace('@', '');
        if (!name) {
            alert("Пожалуйста, введите никнейм!");
            return;
        }
        await loginWithNickname(name);
    });
}

window.addEventListener('DOMContentLoaded', () => setTimeout(startApp, 100));
