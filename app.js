// Инициализация Telegram Web App с проверкой на запуск в обычном браузере
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : {
    ready: () => console.log("TG Mini App: Ready (Браузерная заглушка)"),
    expand: () => console.log("TG Mini App: Expanded"),
    showProgress: () => console.log("Лоадер запущен..."),
    hideProgress: () => console.log("Лоадер скрыт"),
    showAlert: (msg) => alert(msg),
    initDataUnsafe: {
        user: { id: 12345678, username: "Локальный_Тестер", first_name: "Путник" }
    },
    HapticFeedback: {
        impactOccurred: (style) => console.log(`Вибрация: ${style}`),
        notificationOccurred: (type) => console.log(`Уведомление-вибрация: ${type}`)
    }
};

// Вызываем методы (теперь они не вызовут ошибку ни в браузере, ни в ТГ)
tg.ready();
tg.expand();

// Настройки подключения к вашему бэкенду

// Текущее состояние игрока
let playerState = {
    userId: tg.initDataUnsafe?.user?.id,
    username: tg.initDataUnsafe?.user?.username || tg.initDataUnsafe?.user?.first_name || "Путник",
    points: 0,
    affinity: 0,
    cooldownSeconds: 0,
    cards: []
};
 // Разворачиваем окно на весь экран смартфона

// Настройки подключения к вашему бэкенду
const CONFIG = {
    // ЗАМЕНИ НА URL СВОЕГО РАЗВЕРНУТОГО БЭКЕНДА (например, на Railway, Render или VPS)
    API_URL: "https://retrogule.pythonanywhere.com", 
    REDUCTION_COST: 20
};

// Текущее состояние игрока (клиентский стейт)

// DOM Элементы страницы
const nodes = {
    username: document.getElementById('username'),
    coinCount: document.getElementById('coin-count'),
    affinityPct: document.getElementById('affinity-pct'),
    affinityFill: document.getElementById('affinity-fill'),
    timeLeft: document.getElementById('time-left'),
    btnReduceCd: document.getElementById('btn-reduce-cd'),
    botBubble: document.getElementById('bot-bubble'),
    dropZone: document.getElementById('drop-zone'),
    openDeckBtn: document.getElementById('open-deck-btn'),
    deckScreen: document.getElementById('deck-screen'),
    deckGrid: document.getElementById('deck-grid'),
    deckCount: document.getElementById('deck-count'),
    closeDeckBtn: document.getElementById('close-deck-btn'),
    cardModal: document.getElementById('card-modal'),
    modalCardZone: document.getElementById('modal-card-zone'),
    modalClose: document.getElementById('modal-close'),
    modalBurn: document.getElementById('modal-burn')
};

let timerInterval = null;
// Универсальная функция для отправки POST-запросов на бэкенд
// Универсальная функция для отправки POST-запросов (с оффлайн-деморежимом)
async function requestAPI(endpoint, data = {}) {
    // Если адрес бэкенда не изменен, включаем ДЕМО-РЕЖИМ для тестирования анимаций на ПК
    if (CONFIG.API_URL.includes("your-backend-api.com") || CONFIG.API_URL === "") {
        console.log(`[DEMO MODE] Перехвачен запрос к ${endpoint}`);
        
        // Имитируем моментальный ответ сервера в зависимости от эндпоинта
        if (endpoint === '/get_profile') {
            return { points: 150, affinity: 45, cooldown_seconds: 5 }; // Кулдаун всего 5 секунд для теста!
        }
        if (endpoint === '/buy_cooldown_reduction') {
            return { success: true, points: playerState.points - CONFIG.REDUCTION_COST, cooldown_seconds: 0 };
        }
        if (endpoint === '/open_free_pack') {
            const rarities = ['обыч', 'редкая', 'лега'];
            const randomRarity = rarities[Math.floor(Math.random() * rarities.length)];
            return {
                id: Math.floor(Math.random() * 1000),
                title: "Тестовый Артефакт",
                rarity: randomRarity,
                image_url: "assets/deck_texture.png", // Используем локальную текстуру рубашки как арт
                cooldown_seconds: 10 // После дропа ставим КД 10 секунд
            };
        }
        if (endpoint === '/scrap_card') {
            return { success: true, points: playerState.points + 15 };
        }
        if (endpoint === '/get_my_collection') {
            return { cards: playerState.cards };
        }
    }

    // --- Оригинальная сетевая логика (сработает, когда вставите реальный URL бэкенда) ---
    try {
        const payload = { user_id: playerState.userId, username: playerState.username, ...data };
        const response = await fetch(`${CONFIG.API_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.detail || 'Ошибка сервера');
        }
        return await response.json();
    } catch (error) {
        console.error(`API Error (${endpoint}):`, error);
        tg.showAlert(`Ошибка сети: ${error.message}. Переключаюсь на локальные данные.`);
        return null;
    }
}

// Запуск игры — запрашиваем реальный профиль с сервера
async function initGame() {
    nodes.username.textContent = `@${playerState.username}`;
    
    tg.showProgress(); // Показываем лоадер Telegram
    const data = await requestAPI('/get_profile');
    tg.hideProgress();
    
    if (data) {
        playerState.points = data.points;
        playerState.affinity = data.affinity;
        playerState.cooldownSeconds = data.cooldown_seconds;
        
        updateUI();
        startCooldownTimer();
    }
}

function updateUI() {
    nodes.coinCount.textContent = playerState.points;
    nodes.affinityPct.textContent = `${playerState.affinity}%`;
    nodes.affinityFill.style.width = `${playerState.affinity}%`;
    
    if (playerState.affinity >= 70) nodes.botBubble.textContent = "Почти терплю тебя... Ладно, тяни.";
    else if (playerState.affinity >= 31) nodes.botBubble.textContent = "Ну... ладно. Что тебе нужно?";
    else nodes.botBubble.textContent = "Едва замечаю твое присутствие. Зачем пришел?";
}

// Логика работы таймера кулдауна
function startCooldownTimer() {
    if (timerInterval) clearInterval(timerInterval);
    
    if (playerState.cooldownSeconds <= 0) {
        renderActiveDropZone();
        return;
    }
    
    renderLockedDropZone();

    timerInterval = setInterval(() => {
        playerState.cooldownSeconds--;
        
        if (playerState.cooldownSeconds <= 0) {
            clearInterval(timerInterval);
            renderActiveDropZone();
        } else {
            const h = String(Math.floor(playerState.cooldownSeconds / 3600)).padStart(2, '0');
            const m = String(Math.floor((playerState.cooldownSeconds % 3600) / 60)).padStart(2, '0');
            const s = String(playerState.cooldownSeconds % 60).padStart(2, '0');
            nodes.timeLeft.textContent = `${h}ч ${m}м ${s}с`;
        }
    }, 1000);
}

function renderLockedDropZone() {
    nodes.dropZone.innerHTML = `<span class="zone-placeholder">Время еще не пришло...</span>`;
    nodes.btnReduceCd.style.display = "inline-block";
}

function renderActiveDropZone() {
    nodes.timeLeft.textContent = "00ч 00м 00с";
    nodes.btnReduceCd.style.display = "none";
    
    nodes.dropZone.innerHTML = `
        <div class="card-container" id="free-pack-trigger">
            <div class="card-inner">
                <div class="card-front"></div>
            </div>
        </div>
    `;
    
    document.getElementById('free-pack-trigger').addEventListener('click', handleDrawCard);
}

// Обработка покупки минус 1 часа
nodes.btnReduceCd.addEventListener('click', async () => {
    if (playerState.points < CONFIG.REDUCTION_COST) {
        tg.showAlert("Нищеброд! Тебе не хватает монет.");
        return;
    }
    
    // Анимация вращения песочных часов (классы из твоего CSS)
    const hourglass = document.getElementById('hourglass');
    hourglass.classList.add('flip-hourglass');
    hourglass.addEventListener('animationend', () => hourglass.classList.remove('flip-hourglass'), {once: true});

    // Делаем реальный запрос на сдвиг времени
    const res = await requestAPI('/buy_cooldown_reduction');
    if (res && res.success) {
        playerState.points = res.points;
        playerState.cooldownSeconds = res.cooldown_seconds;
        
        updateUI();
        startCooldownTimer();
        tg.HapticFeedback.notificationOccurred("success"); // Вибрация на смартфоне
    }
});
// ==========================================
// 3. ВЗАИМОДЕЙСТВИЕ С КАРТАМИ И БАЗОЙ ДАННЫХ
// ==========================================

async function handleDrawCard() {
    tg.showProgress();
    // Запрашиваем дроп карты у бэкенда (там проверяется кулдаун и обновляется Supabase)
    const cardData = await requestAPI('/open_free_pack');
    tg.hideProgress();
    
    if (!cardData) return; // Если произошла ошибка, прерываемся

    nodes.dropZone.innerHTML = "";

    const cardEl = document.createElement('div');
    cardEl.className = 'card-container';
    
    let rarityColor = "#fff";
    if (cardData.rarity === "редкая") rarityColor = "#3498db";
    if (cardData.rarity === "лега") rarityColor = "#e74c3c";

    cardEl.innerHTML = `
        <div class="card-inner">
            <div class="card-front"></div>
            <div class="card-back">
                <img src="${cardData.image_url}" class="card-image-bg">
                <div class="card-content">
                    <div class="card-title">${cardData.title}</div>
                    <div class="card-rarity" style="color: ${rarityColor}">${cardData.rarity.toUpperCase()}</div>
                </div>
            </div>
        </div>
    `;

    nodes.dropZone.appendChild(cardEl);

    // Устанавливаем кулдаун, присланный сервером, и запускаем таймер ожидания
    playerState.cooldownSeconds = cardData.cooldown_seconds;
    startCooldownTimer();

    // Запускаем красивый CSS-переворот
    setTimeout(() => {
        cardEl.classList.add('flipped');
        tg.HapticFeedback.impactOccurred("medium");
        
        setTimeout(() => {
            openCardModal(cardData);
        }, 1500);
    }, 300);
}

let activeModalCard = null;

function openCardModal(card) {
    activeModalCard = card;
    
    let rarityColor = "#fff";
    if (card.rarity === "редкая") rarityColor = "#3498db";
    if (card.rarity === "лега") rarityColor = "#e74c3c";

    nodes.modalCardZone.innerHTML = `
        <div class="card-container modal-view">
            <div class="card-inner">
                <div class="card-front"></div>
                <div class="card-back">
                    <img src="${card.image_url}" class="card-image-bg">
                    <div class="card-content">
                        <div class="card-title" style="font-size:1.1rem;">${card.title}</div>
                        <div class="card-rarity" style="font-size:0.8rem; color: ${rarityColor}">${card.rarity.toUpperCase()}</div>
                    </div>
                </div>
            </div>
        </div>
    `;

    nodes.cardModal.style.display = "flex";
    setTimeout(() => nodes.cardModal.style.opacity = "1", 10);
}

// Нажатие на "В колоду" — закрываем окно
nodes.modalClose.addEventListener('click', () => {
    // ДОБАВЬТЕ ЭТУ СТРОКУ, ЧТОБЫ КАРТА СОХРАНЯЛАСЬ В ДЕМО-РЕЖИМЕ:
    if (CONFIG.API_URL.includes("your-backend-api.com")) {
        playerState.cards.push(activeModalCard);
    }

    nodes.cardModal.style.opacity = "0";
    setTimeout(() => {
        nodes.cardModal.style.display = "none";
    }, 400);
});


// Нажатие на "Сжечь карту"
nodes.modalBurn.addEventListener('click', async () => {
    if (!activeModalCard) return;

    tg.showProgress();
    const res = await requestAPI('/scrap_card', { card_id: activeModalCard.id });
    tg.hideProgress();

    if (res && res.success) {
        const cardContainer = nodes.modalCardZone.querySelector('.card-container');
        
        cardContainer.classList.add('card-burn-animation');
        tg.HapticFeedback.notificationOccurred("warning");

        cardContainer.addEventListener('animationend', () => {
            playerState.points = res.points;
            updateUI();
            
            // ЕСЛИ ЭТО ДЕМО-РЕЖИМ: Очищаем активную карту, чтобы она не попала в колоду при закрытии
            activeModalCard = null; 

            nodes.cardModal.style.opacity = "0";
            setTimeout(() => {
                nodes.cardModal.style.display = "none";
            }, 400);
        }, {once: true});
    }
});


// Открытие экрана "Колода"
nodes.openDeckBtn.addEventListener('click', async () => {
    nodes.deckGrid.innerHTML = "";
    tg.showProgress();
    
    // Подгружаем актуальный список карт из Supabase через API
    const data = await requestAPI('/get_my_collection');
    tg.hideProgress();

    if (data && data.cards) {
        playerState.cards = data.cards;
        nodes.deckCount.textContent = `Твоя Колода (${playerState.cards.length})`;

        if (playerState.cards.length === 0) {
            nodes.deckGrid.innerHTML = `
                <span style="color: rgba(255,255,255,0.3); grid-column: 1/-1; text-align:center; font-style:italic; margin-top:20px;">
                    Колода пуста...
                </span>`;
        } else {
            playerState.cards.forEach(card => {
                const gridItem = document.createElement('div');
                gridItem.className = 'card-container';
                gridItem.innerHTML = `
                    <div class="card-inner">
                        <div class="card-back">
                            <img src="${card.image_url}" class="card-image-bg">
                            <div class="card-content">
                                <div class="card-title">${card.title}</div>
                            </div>
                        </div>
                    </div>
                `;
                nodes.deckGrid.appendChild(gridItem);
            });
        }
    }

    nodes.deckScreen.style.display = "flex";
    setTimeout(() => nodes.deckScreen.style.opacity = "1", 10);
});

nodes.closeDeckBtn.addEventListener('click', () => {
    nodes.deckScreen.style.opacity = "0";
    setTimeout(() => {
        nodes.deckScreen.style.display = "none";
    }, 300);
});

// Точка входа: запускаем синхронизацию при загрузке страницы
initGame();
