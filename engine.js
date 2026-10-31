// НАЧАЛО ФАЙЛА: Адрес вашего FastAPI сервера (Термукса)
// Когда запустите LocalTunnel/ngrok, просто вставите сюда ссылку вида https://...
const BACKEND_URL = "RetroGule.pythonanywhere.com "; 

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
async function sendCooldownUpdateToServer(newPoints) {
    const initData = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp.initData : "";
    try {
        const response = await fetch(`${BACKEND_URL}/api/update-cooldown?points=${newPoints}`, {
            method: "POST",
            headers: { "X-Telegram-Init-Data": initData }
        });
        if (response.ok) {
            const data = await response.json();
            // Сбрасываем КД на клиенте на 4 часа на основе ответа сервера
            cooldownSeconds = 4 * 3600; 
            startTimer();
        }
    } catch (e) {
        console.error("Не удалось обновить кулдаун на сервере:", e);
    }
}

async function buyCooldownReduction() {
    const REDUCTION_COST = 20;
    if (cooldownSeconds <= 0) return;
    
    if (playerCoins < REDUCTION_COST) {
        alert(`Тебе не хватает монет.`);
        return;
    }
    
    const hourglassImg = document.querySelector('.icon-hourglass');
    if (hourglassImg) hourglassImg.classList.toggle('flip-hourglass');
    
    playerCoins -= REDUCTION_COST;
    coinCountElement.innerText = playerCoins;

    // Синхронизируем покупку времени с сервером
    await sendCooldownUpdateToServer(playerCoins);

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

// Переопределяем закрытие модального окна для интеграции с БД
function closeModal() {
    if (lastAwardedCard) {
        const id = lastAwardedCard.id;
        userInventory[id] = (userInventory[id] || 0) + 1;
        playerAffinity = Math.min(100, playerAffinity + 2);
        
        // Отправляем карту на сервер
        sendNewCardToServer(id, lastAwardedCard.title, lastAwardedCard.rarity);
        
        if (typeof updateAffinityUI === 'function') updateAffinityUI();
        if (typeof saveResourcesToServer === 'function') saveResourcesToServer();
    }
    cardModal.style.opacity = '0';
    setTimeout(() => {
        cardModal.style.display = 'none';
        // При получении бесплатной карты запускаем серверный кулдаун на 4 часа
        sendCooldownUpdateToServer(playerCoins);
    }, 400);
}

// Функция для загрузки данных с вашего Python-сервера в Термуксе
async function loadGameDataFromServer() {
    const initData = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp.initData : "";

    try {
        // 1. Запрашиваем из FastAPI базу карт из таблицы Supabase
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
                // Преобразуем last_pack_opened, добавляем 4 часа КД и вычисляем разницу
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
        console.log("Бэкенд Термукса спит. Включен демо-режим.");
        startTimer(); 
    }
}

// Функция для сохранения изменений монет и лояльности на сервер
async function saveResourcesToServer() {
    const initData = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp.initData : "";
    try {
        await fetch(`${BACKEND_URL}/api/sync-resources?coins=${playerCoins}&affinity=${playerAffinity}`, {
            method: "POST",
            headers: { "X-Telegram-Init-Data": initData }
        });
    } catch (e) {
        console.error("Не удалось сохранить ресурсы на сервере:", e);
    }
}

// Динамические опросы из базы данных loyalty_questions
async function triggerRandomQuiz() {
    const optionsZone = document.getElementById('quiz-options-zone');
    if (!optionsZone) return;

    try {
        const response = await fetch(`${BACKEND_URL}/api/bot-quiz`);
        if (!response.ok) return;
        
        const randomQuiz = await response.json();
        if (randomQuiz.error) return;

        changeBotSpeech(randomQuiz.question);
        
        optionsZone.innerHTML = ''; 
        optionsZone.style.display = 'flex'; 

        randomQuiz.options.forEach(option => {
            const btn = document.createElement('button');
            btn.className = 'btn-quiz-inline';
            btn.innerText = option.text;
            
            btn.onclick = function() {
                playerAffinity = Math.max(0, Math.min(100, playerAffinity + option.affinityChange));
                if (typeof updateAffinityUI === 'function') updateAffinityUI();
                
                changeBotSpeech(option.reply);
                optionsZone.style.display = 'none'; 
                
                saveResourcesToServer();
            };
            optionsZone.appendChild(btn);
        });

        const skipBtn = document.createElement('button');
        skipBtn.className = 'btn-quiz-inline btn-quiz-skip';
        skipBtn.innerText = "✕";
        skipBtn.onclick = function() {
            changeBotSpeech("Игнорируешь меня? Что ж... как угодно.");
            optionsZone.style.display = 'none'; 
        };
        optionsZone.appendChild(skipBtn);

    } catch (e) {
        console.error("Ошибка при получении квиза с сервера:", e);
    }
}

// ЕДИНЫЙ блок инициализации при загрузке страницы
window.addEventListener('DOMContentLoaded', () => {
    if (buyHourBtn) buyHourBtn.addEventListener('click', buyCooldownReduction);
    
    // Запускаем подгрузку данных из базы
    loadGameDataFromServer();

    // --- АВТОНОМНОЕ РАСПИСАНИЕ БОТА ---
    function setupBotNextQuestion() {
        const minTime = 30000; 
        const maxTime = 120000;
        const randomDelay = Math.floor(Math.random() * (maxTime - minTime + 1)) + minTime;

        setTimeout(() => {
            const isModalOpen = cardModal && cardModal.style.display === 'flex';
            const isDeckOpen = deckScreen && deckScreen.style.display === 'flex';

            if (!isModalOpen && !isDeckOpen) {
                if (typeof triggerRandomQuiz === 'function') {
                    triggerRandomQuiz();
                }
            }
            setupBotNextQuestion();
        }, randomDelay);
    }

    setTimeout(setupBotNextQuestion, 20000);
});
