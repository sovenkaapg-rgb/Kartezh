// Адрес вашего Flask-бэкенда (Для локального теста - localhost, для продакшена - pythonanywhere)
const BACKEND_URL = "https://retrogule.pythonanywhere.com"; 

// Переменная объявляется ОДИН раз для всего проекта здесь
const playerUserElement = document.getElementById('player-user');
let tgUserId = null;
let tgUsername = "Путник";

// Глобальные переменные экономики, синхронизированные со структурами бота
let playerCoins = 0; 
let playerAffinity = 0; 
let cooldownSeconds = 0; 
let timerInterval = null;

const coinCountElement = document.getElementById('coin-count');
const timeLeftElement = document.getElementById('time-left');
const buyHourBtn = document.querySelector('.btn-buy-hour');

// --- ФУНКЦИЯ ИНИЦИАЛИЗАЦИИ TELEGRAM ---
function initializeTelegramApp() {
    if (window.Telegram && window.Telegram.WebApp) {
        try {
            window.Telegram.WebApp.ready();
            window.Telegram.WebApp.expand();

            // Проверяем наличие данных пользователя внутри ТГ
            if (window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user) {
                const tgUser = window.Telegram.WebApp.initDataUnsafe.user;
                tgUserId = tgUser.id;
                tgUsername = tgUser.username ? `@${tgUser.username}` : tgUser.first_name;
                
                if (playerUserElement) playerUserElement.innerText = tgUsername;
                console.log("Успешная авторизация ТГ:", tgUsername, tgUserId);
            } else {
                setDemoMode("Пустой initData");
            }
        } catch (err) {
            console.error("Ошибка при чтении данных WebApp:", err);
            setDemoMode("Ошибка инициализации");
        }
    } else {
        setDemoMode("Обычный браузер");
    }

    // После того как определились с ID, строго ЗАПУСКАЕМ загрузку данных с сервера
    loadGameDataFromServer();
}

function setDemoMode(reason) {
    console.log(`Включен демо-режим. Причина: ${reason}`);
    tgUserId = 123456789;
    tgUsername = "@demo_user";
    if (playerUserElement) playerUserElement.innerText = "@demo_user";
}

function formatTime(totalSeconds) {
    if (totalSeconds <= 0) return "Можно тянуть!";
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours < 10 ? '0' + hours : hours}ч ${minutes < 10 ? '0' + minutes : minutes}м ${seconds < 10 ? '0' + seconds : seconds}с`;
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timeLeftElement.innerText = formatTime(cooldownSeconds);
    
    if (typeof updateCardsAvailability === 'function') updateCardsAvailability();
    const hourglassImg = document.querySelector('.icon-hourglass');

    timerInterval = setInterval(() => {
        if (cooldownSeconds > 0) {
            cooldownSeconds--;
            timeLeftElement.innerText = formatTime(cooldownSeconds);
            
            // ПОВОРОТ КАЖДУЮ МИНУТУ
            if (cooldownSeconds % 60 === 0 && hourglassImg) {
                hourglassImg.classList.add('flip-hourglass');
                setTimeout(() => {
                    hourglassImg.classList.remove('flip-hourglass');
                }, 1000);
            }
        } else {
            clearInterval(timerInterval);
            timeLeftElement.innerText = "Можно тянуть!";
            if (typeof updateCardsAvailability === 'function') updateCardsAvailability();
        }
    }, 1000);
}

// Запрос на уменьшение кулдауна (-1 час за 20 монет)
async function buyCooldownReduction() {
    const REDUCTION_COST = 20;
    
    if (cooldownSeconds <= 0) {
        if (typeof changeBotSpeech === 'function') {
            changeBotSpeech("Таймер уже истек, беги за бесплатной картой! Зачем ты жмешь кнопку?..");
        }
        return;
    }
    
    if (playerCoins < REDUCTION_COST) {
        if (typeof changeBotSpeech === 'function') {
            changeBotSpeech(`Нищеброд! Тебе не хватает монет. Нужно ровно ${REDUCTION_COST} 🪙.`);
        }
        return;
    }
    
    playerCoins -= REDUCTION_COST;
    if (coinCountElement) coinCountElement.innerText = playerCoins;
    
    const hourglassImg = document.querySelector('.icon-hourglass');
    if (hourglassImg) {
        hourglassImg.classList.add('flip-hourglass');
        setTimeout(() => {
            hourglassImg.classList.remove('flip-hourglass');
        }, 1000);
    }
    
    cooldownSeconds = Math.max(0, cooldownSeconds - 3600);
    startTimer();

    const initData = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp.initData : "";
    try {
        await fetch(`${BACKEND_URL}/api/update-cooldown?points=${playerCoins}`, {
            method: "POST",
            headers: { "X-Telegram-Init-Data": initData }
        });
    } catch (e) {
        console.error("Не удалось сохранить кулдаун на сервере:", e);
    }

    if (typeof changeBotSpeech === 'function' && typeof BOT_PHRASES !== 'undefined') {
        changeBotSpeech(BOT_PHRASES.buy_hour);
    }
}

function updateAffinityUI() {
    const affPercent = document.getElementById('affinity-percent');
    const affFill = document.getElementById('affinity-fill');
    if (affPercent) affPercent.innerText = `${playerAffinity}%`;
    if (affFill) affFill.style.width = `${playerAffinity}%`;
}

// Отправка полученной карты на Flask сервер
async function sendNewCardToServer(cardId, cardTitle, rarity) {
    const initData = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp.initData : "";
    try {
        await fetch(`${BACKEND_URL}/api/add-card`, {
            method: "POST",
            headers: { 
                "X-Telegram-Init-Data": initData,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ card_id: parseInt(cardId), card_title: cardTitle, rarity: rarity })
        });
    } catch (e) {
        console.error("Не удалось сохранить карту в БД через Flask:", e);
    }
}

// Загрузка профиля игрока и карт из Flask
async function loadGameDataFromServer() {
    const initData = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp.initData : "";

    try {
        const cardsResponse = await fetch(`${BACKEND_URL}/api/cards-database`, {
            headers: { "X-Telegram-Init-Data": initData }
        });
        if (cardsResponse.ok) ALL_GAME_CARDS = await cardsResponse.json();

        const profileResponse = await fetch(`${BACKEND_URL}/api/profile`, {
            headers: { "X-Telegram-Init-Data": initData }
        });
        
        if (profileResponse.ok) {
            const profile = await profileResponse.json();
            playerCoins = profile.coins;
            playerAffinity = profile.affinity;
            userInventory = profile.inventory;
            
            // Если мы получили реальный username от ТГ, выводим его
            if (playerUserElement) {
                playerUserElement.innerText = tgUserId !== 123456789 ? tgUsername : "@demo_user";
            }

            if (profile.cooldown) {
                const parsedDate = Date.parse(profile.cooldown);
                if (!isNaN(parsedDate)) {
                    const now = Math.floor(Date.now() / 1000);
                    const cooldownStart = Math.floor(parsedDate / 1000);
                    const cooldownEnd = cooldownStart + (4 * 3600); 
                    cooldownSeconds = Math.max(0, cooldownEnd - now);
                } else {
                    cooldownSeconds = 0;
                }
            } else {
                cooldownSeconds = 0;
            }

            if (coinCountElement) coinCountElement.innerText = playerCoins;
            updateAffinityUI();
            startTimer();
        } else {
            startTimer();
        }
    } catch (error) {
        console.log("Бэкенд Flask отдыхает. Включен автономный демо-режим.");
        ALL_GAME_CARDS = [
            { id: 1, title: "Стул", rarity: "обыч", image_url: "assets/deck_texture.png", point_value: 10 },
            { id: 2, title: "Самовар", rarity: "редкая", image_url: "assets/deck_texture.png", point_value: 25 },
            { id: 3, title: "Декса", rarity: "лега", image_url: "assets/deck_texture.png", point_value: 100 }
        ];
        if (typeof initCards === 'function' && cooldownSeconds <= 0) initCards();
        startTimer(); 
    }
}

// Синхронизация монет и лояльности
async function saveResourcesToServer() {
    const initData = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp.initData : "";
    try {
        await fetch(`${BACKEND_URL}/api/sync-resources?coins=${playerCoins}&affinity=${playerAffinity}`, {
            method: "POST",
            headers: { "X-Telegram-Init-Data": initData }
        });
    } catch (e) {
        console.error("Не удалось синхронизировать ресурсы:", e);
    }
}

// Запуск инициализации при загрузке страницы
window.addEventListener('DOMContentLoaded', () => {
    if (buyHourBtn) buyHourBtn.addEventListener('click', buyCooldownReduction);
    
    // Небольшая задержка, чтобы Telegram WebApp точно успел подгрузить свойства инвентаря
    setTimeout(() => {
        initializeTelegramApp();
    }, 150);
});
