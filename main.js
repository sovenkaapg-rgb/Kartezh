import { API_URL, DOM, tg, user, playerProfile, setPlayerProfile, setUser } from './config.js';
import { checkCooldownStatus } from './cards.js';
import { renderDeckGrid } from './deck.js';

// Инициализация старта приложения
async function startApp() {
    const savedUsername = localStorage.getItem("saved_game_username");

    if (savedUsername) {
        console.log("Найден сохраненный аккаунт:", savedUsername);
        await loginWithNickname(savedUsername);
    } else {
        console.log("Аккаунт не найден, принудительно открываем окно ввода");
        // Берем элемент напрямую на случай, если кэш DOM еще не обновился
        const overlay = document.getElementById('auth-overlay');
        if (overlay) {
            overlay.style.setProperty('display', 'flex', 'important');
        }
    }
}


// Авторизация по никнейму
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
            // ВМЕСТО ALERT: Пишем в бабл бота, что никнейм не подошел
            if (DOM.speechBubbleEl) {
                DOM.speechBubbleEl.textContent = `Ты вообще кто? ${errorData.detail || "Попробуй ввести другой никнейм."}`;
            }
            localStorage.removeItem("saved_game_username");
            if (DOM.authOverlay) DOM.authOverlay.style.display = 'flex';
            return;
        }

        let playerData = await response.json();
        
        // Корректный разбор ответа, если Flask возвращает массив
        if (Array.isArray(playerData)) {
            playerData = playerData[0];
        }

        console.log("Успешный вход! Данные игрока:", playerData);
        
        // Записываем профиль в глобальный стейт конфигурации
        setPlayerProfile(playerData);
        setUser({ id: playerData.user_id, username: playerData.username });

        // Сохраняем ник в память браузера
        localStorage.setItem("saved_game_username", playerData.username);
        
        updateUI();
        startCooldownTimer();
        setupEventListeners();
        initParallax(); 

        if (DOM.authOverlay) DOM.authOverlay.style.display = 'none';

    } catch (error) {
        // ВМЕСТО ALERT: Бот сообщает о проблемах при запуске
        if (DOM.speechBubbleEl) {
            DOM.speechBubbleEl.textContent = "Сервер отключился)";
        }
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
let timerInterval = null;
function startCooldownTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (!playerProfile || !playerProfile.last_pack_opened) {
            DOM.timeLeftEl.textContent = "Готово!";
            
            // Фикс: кладем часы на бок и меняем реплику бота
            if (DOM.hourglassIcon) DOM.hourglassIcon.classList.add('timer-ended');
            if (DOM.speechBubbleEl) DOM.speechBubbleEl.textContent = "Хм-м... Время пришло! Давай посмотрим, что тебе уготовила судьба!";
            
            checkCooldownStatus(); 
            return;
        }
        
        const diff = (new Date(playerProfile.last_pack_opened).getTime() + 4*60*60*1000) - new Date().getTime();
        
        if (diff <= 0) { 
            DOM.timeLeftEl.textContent = "Готово!"; 
            
            // Время вышло: кладем часы на бок и зовем играть
            if (DOM.hourglassIcon) DOM.hourglassIcon.classList.add('timer-ended');
            if (DOM.speechBubbleEl) DOM.speechBubbleEl.textContent = "Хм-м... Время пришло! Давай посмотрим, что тебе уготовила судьба!";
            
            checkCooldownStatus(); 
            return; 
        }
        
        // Время еще идет: убираем класс падения часов на бок
        if (DOM.hourglassIcon) DOM.hourglassIcon.classList.remove('timer-ended');
        
        // Бот вежливо просит подождать прямо в бабле
        if (DOM.speechBubbleEl) DOM.speechBubbleEl.textContent = "Тут будут карты, когда придет время. Придется немного подождать...";
        
        const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
        const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
        const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
        DOM.timeLeftEl.textContent = `${h}ч ${m}м ${s}с`;
        
        checkCooldownStatus();
    }, 1000);
}


// Настройка слушателей событий кликов
function setupEventListeners() {
    // Открытие колоды
    document.querySelector('.deck-button').onclick = async () => {
        await renderDeckGrid();
        DOM.deckScreen.style.display = 'flex';
        setTimeout(() => DOM.deckScreen.style.opacity = '1', 10);
    };
    
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
                    DOM.speechBubbleEl.textContent = "Или  твое время или деньги. Нет монет? Отдавай время";
                }
                return;
            }

            try {
                const response = await fetch(`${API_URL}/api/buy-hour/${playerProfile.user_id}`, { method: 'POST' });
                
                if (response.ok) {
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
                    const res = await response.json();
                     if (DOM.speechBubbleEl) {
                    DOM.speechBubbleEl.textContent = "Сервер времени заклинило, не могу отнять час!";
                }
                }
            } catch (e) { 
                alert("Игровой сервер не отвечает!"); 
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
            alert("Пожалуйста, введите никнейм!");
            return;
        }
        await loginWithNickname(name);
    });
}

window.addEventListener('DOMContentLoaded', () => setTimeout(startApp, 100));
