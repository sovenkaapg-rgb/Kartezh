// Инициализация Telegram WebApp
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand(); // Расширяем на весь экран
}

// Получаем user_id из Telegram для передачи в запросах к вашему API
const userId = tg?.initDataUnsafe?.user?.id || 123456789; // 123456789 - фолбек для тестов в браузере
const username = tg?.initDataUnsafe?.user?.username || "Путник";

// Конфигурация вашего API (куда бот принимает веб-хуки или запросы от Mini App)
const API_BASE_URL = "https://retrogule.pythonanywhere.com"; 

// Состояние приложения
let isCooldownActive = false;

document.addEventListener("DOMContentLoaded", () => {
    initApp();
    setupEventListeners();
});

function initApp() {
    // Устанавливаем юзернейм в нижнюю панель (из вашей верстки .player-username)
    const usernameEl = document.querySelector('.player-username');
    if (usernameEl) usernameEl.textContent = `@${username}`;
    
    // Загружаем начальные данные профиля (монеты, кулдаун, лояльность)
    updateProfileData();
}

function setupEventListeners() {
    // Клик по магическому кругу для призыва карт
    const magicCircle = document.querySelector('.magic-ring-bg');
    if (magicCircle) {
        magicCircle.addEventListener('click', handleCardSummon);
    }

    // Открытие колоды (кнопка внизу .deck-button)
    const deckBtn = document.querySelector('.deck-button');
    if (deckBtn) {
        deckBtn.addEventListener('click', openDeckScreen);
    }

    // Закрытие колоды (.btn-close-deck)
    const closeDeckBtn = document.querySelector('.btn-close-deck');
    if (closeDeckBtn) {
        closeDeckBtn.addEventListener('click', closeDeckScreen);
    }

    // Купить час (-20 монет)
    const buyHourBtn = document.querySelector('.btn-buy-hour');
    if (buyHourBtn) {
        buyHourBtn.addEventListener('click', buyHourCooldown);
    }
}

// --- МЕХАНИКА ВЫБОРA ИЗ 3-Х КАРТ ---
async function handleCardSummon() {
    if (isCooldownActive) {
        tg?.showPopup({ message: "Э неее. Жди ещё ...ну или когда звезды сойдутся" });
        return;
    }

    const dropZone = document.querySelector('.cards-drop-zone');
    dropZone.innerHTML = '<div class="zone-placeholder">Призыв карт...</div>';

    try {
        // Запрос к бэкенду на генерацию 3-х вариантов (списывает баланс/кд на сервере)
        const response = await fetch(`${API_BASE_URL}/generate-draft`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId })
        });
        const data = await response.json(); // Ожидаем массив из 3-х карт: [{id, title, rarity, image_url}, ...]

        if (!response.ok) throw new Error(data.message || "Ошибка генерации");

        renderThreeOptions(data.cards);
    } catch (error) {
        console.error(error);
        dropZone.innerHTML = '<div class="zone-placeholder">Не удалось призвать карты т_т</div>';
    }
}

function renderThreeOptions(cards) {
    const dropZone = document.querySelector('.cards-drop-zone');
    dropZone.innerHTML = ''; // Очищаем зону от плейсхолдеров
    dropZone.classList.remove('chosen'); // Сбрасываем флаг выбора

    cards.forEach((card, index) => {
        // Создаем контейнер карты (из вашего CSS .card-container)
        const cardContainer = document.createElement('div');
        cardContainer.className = 'card-container';
        // Небольшая задержка анимации появления для каждой карты
        cardContainer.style.animationDelay = `${index * 0.15}s`;

        cardContainer.innerHTML = `
            <div class="card-inner">
                <div class="card-front"></div>
                <div class="card-back">
                    <img src="${card.image_url}" class="card-image-bg">
                    <div class="card-content">
                        <div class="card-title">${card.title}</div>
                        <div class="card-rarity ${card.rarity}">${card.rarity.toUpperCase()}</div>
                    </div>
                </div>
            </div>
        `;

        // Клик по карте для совершения выбора
        cardContainer.addEventListener('click', () => selectThisCard(card.id, cardContainer, cards));

        dropZone.appendChild(cardContainer);
    });
}

async function selectThisCard(cardId, selectedCardEl, allCards) {
    const dropZone = document.querySelector('.cards-drop-zone');
    
    // Защита: если одна карта уже выбирается, игнорируем другие клики
    if (dropZone.classList.contains('chosen')) return;
    dropZone.classList.add('chosen');

    try {
        // Фиксируем выбор на сервере (запись в базу user_cards)
        const response = await fetch(`${API_BASE_URL}/select-card`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, card_id: cardId })
        });
        
        if (!response.ok) throw new Error("Сервер не принял выбор");

        // 1. Анимация переворота выбранной карты (ваш класс .flipped)
        selectedCardEl.classList.add('flipped');

        // Изменяем реплику бота сверху под ваш стиль
        document.querySelector('.bot-speech-bubble').textContent = "Ладно, забирай. Но это чисто случайность...";

        // 2. Анимация исчезновения/сгорания для остальных двух карт
        const allCardElements = dropZone.querySelectorAll('.card-container');
        allCardElements.forEach(el => {
            if (el !== selectedCardEl) {
                // Случайно чередуем ваши заготовленные анимации улета (.card-leave-right) или сгорания (.card-burn-animation)
                el.classList.add(Math.random() > 0.5 ? 'card-leave-right' : 'card-burn-animation');
            }
        });

        // Обновляем монеты и включаем кулдаун таймера
        updateProfileData();

    } catch (error) {
        console.error(error);
        dropZone.classList.remove('chosen');
        tg?.showPopup({ message: "Не удалось сохранить карту. Попробуй еще раз." });
    }
}

// --- МЕХАНИКА ОТОБРАЖЕНИЯ ВСЕХ КАРТ В КОЛОДЕ ---
async function openDeckScreen() {
    const deckScreen = document.querySelector('.deck-screen');
    const deckGrid = document.querySelector('.deck-grid');
    
    deckScreen.style.display = 'flex';
    setTimeout(() => deckScreen.style.opacity = '1', 10);
    deckGrid.innerHTML = '<div style="color: white; grid-column: span 3; text-align:center;">Загрузка коллекции...</div>';

    try {
        // Параллельно запрашиваем ВСЕ существующие карты игры и карты текущего ЮЗЕРА
        const [allCardsRes, userCardsRes] = await Promise.all([
            fetch(`${API_BASE_URL}/all-cards`),
            fetch(`${API_BASE_URL}/user-collection?user_id=${userId}`)
        ]);

        const allCards = await allCardsRes.json();     // Массив всех карт в бд
        const userInventory = await userCardsRes.json(); // Массив карт юзера [{card_id, quantity}]

        // Превращаем инвентарь юзера в удобную карту { card_id: quantity }
        const inventoryMap = {};
        userInventory.forEach(item => {
            inventoryMap[item.card_id] = item.quantity;
        });

        deckGrid.innerHTML = ''; // Очищаем загрузку

        allCards.forEach(card => {
            const count = inventoryMap[card.id] || 0;
            const isLocked = count === 0;

            const cardContainer = document.createElement('div');
            // Если карт 0 — добавляем ваш CSS-класс .card-locked (он вешает замок и делает карту серой)
            cardContainer.className = `card-container ${isLocked ? 'card-locked' : ''}`;

            cardContainer.innerHTML = `
                <div class="card-inner">
                    <div class="card-front"></div>
                    <div class="card-back">
                        <img src="${card.image_url}" class="card-image-bg">
                        <div class="card-content">
                            <div class="card-title">${card.title}</div>
                            <div class="card-rarity ${card.rarity}">${card.rarity.toUpperCase()}</div>
                        </div>
                        ${count > 1 ? `<div class="card-badge">x${count}</div>` : ''}
                    </div>
                </div>
            `;
            
            deckGrid.appendChild(cardContainer);
        });

    } catch (error) {
        console.error(error);
        deckGrid.innerHTML = '<div style="color: #e74c3c; grid-column: span 3; text-align:center;">Ошибка загрузки карт</div>';
    }
}

function closeDeckScreen() {
    const deckScreen = document.querySelector('.deck-screen');
    deckScreen.style.opacity = '0';
    setTimeout(() => deckScreen.style.display = 'none', 300);
}

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (ДАННЫЕ ПРОФИЛЯ И КУЛДАУН) ---
async function updateProfileData() {
    try {
        const response = await fetch(`${API_BASE_URL}/profile?user_id=${userId}`);
        const profile = await response.json();

        // 1. Обновляем баланс монет (.coin-balance)
        const balanceText = document.querySelector('.coin-balance');
        if (balanceText) {
            balanceText.innerHTML = `<img src="assets/coins_pile.png" class="icon-coins"> ${profile.points} 🪙`;
        }

        // 2. Обновляем шкалу лояльности/отношения (.affinity-bar-fill)
        const barFill = document.querySelector('.affinity-bar-fill');
        if (barFill) {
            barFill.style.width = `${profile.affinity}%`;
        }

        // 3. Обрабатываем таймер кулдауна
        const timeLeftEl = document.getElementById('time-left');
        if (profile.seconds_left > 0) {
            isCooldownActive = true;
            startUIDownTimer(profile.seconds_left, timeLeftEl);
        } else {
            isCooldownActive = false;
            if (timeLeftEl) timeLeftEl.textContent = "00ч 00м 00с";
        }

    } catch (error) {
        console.error("Ошибка обновления данных профиля:", error);
    }
}
// --- БЛОК УПРАВЛЕНИЯ ТАЙМЕРОМ КУЛДАУНА ---
let timerInterval = null;

function startUIDownTimer(durationSeconds, displayElement) {
    // Если счетчик уже был запущен — сбрасываем старый интервал
    if (timerInterval) clearInterval(timerInterval);
    
    let timer = durationSeconds;
    
    function updateTimerString() {
        let hours = Math.floor(timer / 3600);
        let minutes = Math.floor((timer % 3600) / 60);
        let seconds = Math.floor(timer % 60);

        // Форматирование нулей: 09 вместо 9
        hours = hours < 10 ? "0" + hours : hours;
        minutes = minutes < 10 ? "0" + minutes : minutes;
        seconds = seconds < 10 ? "0" + seconds : seconds;

        if (displayElement) {
            displayElement.textContent = `${hours}ч ${minutes}м ${seconds}с`;
        }

        // Если время вышло, останавливаем таймер
        if (--timer < 0) {
            clearInterval(timerInterval);
            isCooldownActive = false;
            if (displayElement) displayElement.textContent = "00ч 00м 00с";
        }
    }
    
    // Запускаем первый раз сразу и вешаем на интервал
    updateTimerString();
    timerInterval = setInterval(updateTimerString, 1000);
}
// --- БЛОК ПОКУПКИ СНИЖЕНИЯ КУЛДАУНА ---
async function buyHourCooldown() {
    // Активируем анимацию поворота песочных часов при клике
    const hourglass = document.querySelector('.icon-hourglass');
    if (hourglass) {
        hourglass.classList.add('flip-hourglass');
        // Удаляем класс через 1 сек (длина анимации), чтобы можно было запустить снова
        setTimeout(() => hourglass.classList.remove('flip-hourglass'), 1000);
    }

    try {
        const response = await fetch(`${API_BASE_URL}/buy-hour`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId })
        });

        if (response.ok) {
            // Если баланс успешно списан и час куплен — обновляем интерфейс
            updateProfileData();
        } else {
            const data = await response.json();
            // Показываем стандартное всплывающее окно Telegram с ошибкой сервера
            tg?.showPopup({ message: data.message || "Недостаточно монет!" });
        }
    } catch (e) {
        console.error("Ошибка при покупке времени:", e);
    }
}

