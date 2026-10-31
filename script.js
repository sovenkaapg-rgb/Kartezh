// Адрес вашего бэкенда
const BACKEND_URL = "https://pythonanywhere.com"; 

// Инициализация Telegram WebApp и получение никнейма игрока
const playerUserElement = document.getElementById('player-user');
if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe?.user) {
    window.Telegram.WebApp.ready();
    window.Telegram.WebApp.expand();
    const tgUser = window.Telegram.WebApp.initDataUnsafe.user;
    if (playerUserElement) playerUserElement.innerText = tgUser.username ? `@${tgUser.username}` : tgUser.first_name;
}

// Глобальные переменные экономики, лояльности и времени
let playerCoins = 120; 
let playerAffinity = 45; // Лояльность в %
let cooldownSeconds = 0; 
let timerInterval = null;

const coinCountElement = document.getElementById('coin-count');
const timeLeftElement = document.getElementById('time-left');
const buyHourBtn = document.querySelector('.btn-buy-hour');

function formatTime(totalSeconds) {
    if (totalSeconds <= 0) return "Можно тянуть!";
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const hStr = hours < 10 ? '0' + hours : hours;
    const mStr = minutes < 10 ? '0' + minutes : minutes;
    const sStr = seconds < 10 ? '0' + seconds : seconds;
    return `${hStr}ч ${mStr}м ${sStr}с`;
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
            if (cooldownSeconds % 60 === 0 && hourglassImg) {
                hourglassImg.classList.toggle('flip-hourglass');
            }
        } else {
            clearInterval(timerInterval);
            timeLeftElement.innerText = "Можно тянуть!";
            if (typeof updateCardsAvailability === 'function') updateCardsAvailability();
        }
    }, 1000);
}

// Функция синхронизации таймера с бэкендом (при покупке часа или получении карты)
async function sendCooldownUpdateToServer(newTimeISO) {
    const initData = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp.initData : "";
    try {
        await fetch(`${BACKEND_URL}/api/update-cooldown?points=${playerCoins}`, {
            method: "POST",
            headers: { "X-Telegram-Init-Data": initData }
        });
    } catch (e) {
        console.error("Не удалось обновить кулдаун на сервере:", e);
    }
}

// ПРАВИЛЬНАЯ ПОКУПКА ЧАСА (Синхронизировано с логикой бота — вычитает 1 час)
async function buyCooldownReduction() {
    const REDUCTION_COST = 20;
    if (cooldownSeconds <= 0) {
        alert("Таймер уже истек, беги за бесплатной картой!");
        return;
    }
    
    if (playerCoins < REDUCTION_COST) {
        alert(`Нищеброд! Тебе не хватает монет. Нужно ровно ${REDUCTION_COST} 🪙.`);
        return;
    }
    
    const hourglassImg = document.querySelector('.icon-hourglass');
    if (hourglassImg) hourglassImg.classList.toggle('flip-hourglass');
    
    playerCoins -= REDUCTION_COST;
    if (coinCountElement) coinCountElement.innerText = playerCoins;

    // Уменьшаем кулдаун на 1 час (3600 секунд) локально
    cooldownSeconds = Math.max(0, cooldownSeconds - 3600);
    startTimer();

    // Отправляем изменения на сервер монет и обновленного кулдауна
    await saveResourcesToServer();

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

// Функция отправки новой карты в user_cards и card_logs на бэкенд
async function sendNewCardToServer(cardId, cardTitle, rarity) {
    const initData = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp.initData : "";
    try {
        await fetch(`${BACKEND_URL}/api/add-card`, {
            method: "POST",
            headers: { 
                "X-Telegram-Init-Data": initData,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                card_id: parseInt(cardId),
                card_title: cardTitle,
                rarity: rarity
            })
        });
    } catch (e) {
        console.error("Не удалось сохранить карту в БД:", e);
    }
}

// Функция для загрузки данных с вашего Python-сервера
async function loadGameDataFromServer() {
    const initData = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp.initData : "";

    try {
        // 1. Запрашиваем из базы полную базу карт
        const cardsResponse = await fetch(`${BACKEND_URL}/api/cards-database`, {
            headers: { "X-Telegram-Init-Data": initData }
        });
        if (cardsResponse.ok) {
            ALL_GAME_CARDS = await cardsResponse.json();
        }

        // 2. Запрашиваем профиль игрока (монеты, лояльность, кулдаун)
        const profileResponse = await fetch(`${BACKEND_URL}/api/profile`, {
            headers: { "X-Telegram-Init-Data": initData }
        });
        
        if (profileResponse.ok) {
            const profile = await profileResponse.json();
            playerCoins = profile.coins;
            playerAffinity = profile.affinity;
            userInventory = profile.inventory;

            if (profile.cooldown) {
                const now = Math.floor(Date.now() / 1000);
                const cooldownStart = Math.floor(new Date(profile.cooldown).getTime() / 1000);
                const cooldownEnd = cooldownStart + (4 * 3600); 
                cooldownSeconds = Math.max(0, cooldownEnd - now);
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
        console.log("Бэкенд спит. Включен демо-режим.");
        startTimer(); 
    }
}

// Функция для сохранения изменений монет и лояльности на сервер
async function saveResourcesToServer() {
    const initData = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp.initData : "";
    try {
        // Дополнительно передаем текущее расчетное смещение времени, чтобы бэкенд обновил last_pack_opened
        const mockLastPackTime = new Date(Date.now() - ((4 * 3600 - cooldownSeconds) * 1000)).toISOString();
        await fetch(`${BACKEND_URL}/api/sync-resources?coins=${playerCoins}&affinity=${playerAffinity}`, {
            method: "POST",
            headers: { "X-Telegram-Init-Data": initData }
        });
    } catch (e) {
        console.error("Не удалось сохранить ресурсы на сервере:", e);
    }
}

// Инициализация событий
window.addEventListener('DOMContentLoaded', () => {
    if (buyHourBtn) buyHourBtn.addEventListener('click', buyCooldownReduction);
    loadGameDataFromServer();
});
